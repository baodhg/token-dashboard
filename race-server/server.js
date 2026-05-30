const { createServer } = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : "*";
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production-" + Math.random();
const ADMIN_KEY = process.env.ADMIN_KEY || "admin123";
const DEFAULT_PASSWORD = "123456";
const SALT_ROUNDS = 10;
const SNAPSHOT_INTERVAL_MS = 60_000;

// ── PostgreSQL ────────────────────────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is required");
  process.exit(1);
}
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDb() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS race_users (
      id                 SERIAL PRIMARY KEY,
      name_key           TEXT UNIQUE NOT NULL,  -- lowercase, used for lookup
      display_name       TEXT NOT NULL,
      password_hash      TEXT NOT NULL,
      must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS race_snapshots (
      id           BIGSERIAL PRIMARY KEY,
      player_name  TEXT      NOT NULL,
      total_tokens BIGINT    NOT NULL,
      recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS race_snapshots_player_time
      ON race_snapshots (player_name, recorded_at DESC);
  `);
  console.log("[db] tables ready");
}

// ── In-memory player state ────────────────────────────────────────────────────
const players = new Map(); // socketId → { name, totalTokens, updatedAt }
const TIMEOUT_MS = 45_000;

function broadcast() {
  const now = Date.now();
  for (const [id, p] of players) {
    if (now - p.updatedAt > TIMEOUT_MS) players.delete(id);
  }
  const list = [...players.values()].map((p) => ({
    name: p.name, totalTokens: p.totalTokens, updatedAt: p.updatedAt,
  }));
  io.emit("players_update", list);
}

async function snapshotPlayers() {
  if (players.size === 0) return;
  const now = Date.now();
  const active = [...players.values()].filter((p) => now - p.updatedAt <= TIMEOUT_MS);
  if (!active.length) return;
  const values = active.flatMap((p) => [p.name, p.totalTokens]);
  const placeholders = active.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ");
  try {
    await db.query(`INSERT INTO race_snapshots (player_name, total_tokens) VALUES ${placeholders}`, values);
  } catch (e) { console.error("[db] snapshot error", e.message); }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
    req.on("error", reject);
  });
}

function setCors(res) {
  const origins = Array.isArray(ALLOWED_ORIGINS) ? ALLOWED_ORIGINS : [ALLOWED_ORIGINS];
  res.setHeader("Access-Control-Allow-Origin", origins[0] || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Admin-Key");
}

function json(res, status, body) {
  setCors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const httpServer = createServer(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const [urlPath, queryString] = req.url.split("?");
  const qs = new URLSearchParams(queryString || "");

  // ── Health ────────────────────────────────────────────────────────────────
  if (urlPath === "/health" && req.method === "GET") {
    return json(res, 200, { status: "ok", players: players.size });
  }

  // ── Auth: login / register ────────────────────────────────────────────────
  if (urlPath === "/auth/login" && req.method === "POST") {
    const { name, password } = await readBody(req);
    if (!name || !password) return json(res, 400, { error: "name and password required" });

    const nameKey = name.trim().toLowerCase();
    const displayName = name.trim().slice(0, 32);

    const { rows } = await db.query(
      "SELECT * FROM race_users WHERE name_key = $1", [nameKey]
    );

    if (rows.length === 0) {
      // New user — register
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      await db.query(
        "INSERT INTO race_users (name_key, display_name, password_hash) VALUES ($1, $2, $3)",
        [nameKey, displayName, hash]
      );
      const token = jwt.sign({ name: displayName }, JWT_SECRET, { expiresIn: "7d" });
      return json(res, 200, { token, mustChangePassword: false, displayName });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return json(res, 401, { error: "Incorrect password" });

    const token = jwt.sign({ name: user.display_name }, JWT_SECRET, { expiresIn: "7d" });
    return json(res, 200, {
      token,
      mustChangePassword: user.must_change_password,
      displayName: user.display_name,
    });
  }

  // ── Auth: change password ─────────────────────────────────────────────────
  if (urlPath === "/auth/change-password" && req.method === "POST") {
    const { name, oldPassword, newPassword } = await readBody(req);
    if (!name || !oldPassword || !newPassword) return json(res, 400, { error: "Missing fields" });
    if (newPassword === DEFAULT_PASSWORD) return json(res, 400, { error: `New password cannot be "${DEFAULT_PASSWORD}"` });
    if (newPassword.length < 4) return json(res, 400, { error: "Password must be at least 4 characters" });

    const { rows } = await db.query(
      "SELECT * FROM race_users WHERE name_key = $1", [name.trim().toLowerCase()]
    );
    if (!rows.length) return json(res, 404, { error: "User not found" });
    const user = rows[0];

    const match = await bcrypt.compare(oldPassword, user.password_hash);
    if (!match) return json(res, 401, { error: "Incorrect current password" });

    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db.query(
      "UPDATE race_users SET password_hash = $1, must_change_password = FALSE WHERE name_key = $2",
      [hash, user.name_key]
    );

    const token = jwt.sign({ name: user.display_name }, JWT_SECRET, { expiresIn: "7d" });
    return json(res, 200, { token, mustChangePassword: false, displayName: user.display_name });
  }

  // ── Leaderboard ───────────────────────────────────────────────────────────
  if (urlPath === "/leaderboard" && req.method === "GET") {
    const { rows } = await db.query(`
      SELECT player_name, MAX(total_tokens) AS max_tokens, MAX(recorded_at) AS last_seen
      FROM race_snapshots
      GROUP BY player_name
      ORDER BY max_tokens DESC
      LIMIT 50
    `);
    return json(res, 200, { leaderboard: rows });
  }

  // ── History: all players by day ───────────────────────────────────────────
  if (urlPath === "/history/all" && req.method === "GET") {
    const days = Math.min(90, Math.max(1, parseInt(qs.get("days") || "7", 10)));
    const { rows } = await db.query(`
      SELECT player_name, date_trunc('day', recorded_at) AS day, MAX(total_tokens) AS tokens
      FROM race_snapshots
      WHERE recorded_at >= NOW() - ($1 || ' days')::INTERVAL
      GROUP BY player_name, day
      ORDER BY day ASC, tokens DESC
    `, [days]);
    return json(res, 200, { days, history: rows });
  }

  // ── History: single player by hour ────────────────────────────────────────
  if (urlPath === "/history" && req.method === "GET") {
    const name = qs.get("name");
    const days = Math.min(90, Math.max(1, parseInt(qs.get("days") || "7", 10)));
    if (!name) return json(res, 400, { error: "name required" });
    const { rows } = await db.query(`
      SELECT date_trunc('hour', recorded_at) AS hour, MAX(total_tokens) AS tokens
      FROM race_snapshots
      WHERE player_name = $1 AND recorded_at >= NOW() - ($2 || ' days')::INTERVAL
      GROUP BY 1
      ORDER BY 1 ASC
    `, [name, days]);
    return json(res, 200, { name, days, history: rows });
  }

  // ── Admin: list users ─────────────────────────────────────────────────────
  if (urlPath === "/admin/users" && req.method === "GET") {
    if ((req.headers["x-admin-key"] || "") !== ADMIN_KEY) return json(res, 403, { error: "Forbidden" });
    const { rows } = await db.query(
      "SELECT display_name, must_change_password, created_at FROM race_users ORDER BY created_at DESC"
    );
    return json(res, 200, { users: rows.map((r) => ({
      displayName: r.display_name,
      mustChangePassword: r.must_change_password,
      createdAt: r.created_at,
    })) });
  }

  // ── Admin: reset password ─────────────────────────────────────────────────
  if (urlPath === "/admin/reset-password" && req.method === "POST") {
    const body = await readBody(req);
    const adminKey = body.adminKey || req.headers["x-admin-key"] || "";
    if (adminKey !== ADMIN_KEY) return json(res, 403, { error: "Forbidden" });

    const { name } = body;
    if (!name) return json(res, 400, { error: "name required" });

    const { rows } = await db.query(
      "SELECT * FROM race_users WHERE name_key = $1", [name.trim().toLowerCase()]
    );
    if (!rows.length) return json(res, 404, { error: "User not found" });
    const user = rows[0];

    const hash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
    await db.query(
      "UPDATE race_users SET password_hash = $1, must_change_password = TRUE WHERE name_key = $2",
      [hash, user.name_key]
    );
    console.log(`[admin] reset password for ${user.display_name}`);
    return json(res, 200, { ok: true, message: `Password reset to "${DEFAULT_PASSWORD}" for ${user.display_name}` });
  }

  res.writeHead(404); res.end();
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on("player_update", ({ token, totalTokens }) => {
    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); } catch { return; }
    if (typeof totalTokens !== "number" || !isFinite(totalTokens)) return;
    players.set(socket.id, {
      name: payload.name,
      totalTokens: Math.max(0, Math.floor(totalTokens)),
      updatedAt: Date.now(),
    });
    broadcast();
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    broadcast();
  });
});

setInterval(broadcast, 15_000);
setInterval(snapshotPlayers, SNAPSHOT_INTERVAL_MS);

// ── Start ─────────────────────────────────────────────────────────────────────
initDb().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Race server :${PORT} | Admin key: ${ADMIN_KEY}`);
    if (JWT_SECRET.startsWith("change-me-in-production-")) {
      console.warn("WARNING: JWT_SECRET not set — tokens will invalidate on restart");
    }
  });
}).catch((e) => { console.error("DB init failed:", e.message); process.exit(1); });
