const { createServer } = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : "*";
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production-" + Math.random();
const ADMIN_KEY = process.env.ADMIN_KEY || "admin123";
const DATA_DIR = process.env.DATA_DIR || __dirname;
const USERS_FILE = path.join(DATA_DIR, "users.json");
const DEFAULT_PASSWORD = "123456";
const SALT_ROUNDS = 10;
// How often to snapshot active players into the DB (ms)
const SNAPSHOT_INTERVAL_MS = 60_000;

// ── PostgreSQL ────────────────────────────────────────────────────────────────
const db = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false })
  : null;

async function initDb() {
  if (!db) { console.warn("[db] DATABASE_URL not set — history/leaderboard disabled"); return; }
  await db.query(`
    CREATE TABLE IF NOT EXISTS race_snapshots (
      id          BIGSERIAL PRIMARY KEY,
      player_name TEXT      NOT NULL,
      total_tokens BIGINT   NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS race_snapshots_player_time
      ON race_snapshots (player_name, recorded_at DESC);
  `);
  console.log("[db] race_snapshots table ready");
}

// Insert one row per active player — called on a fixed interval
async function snapshotPlayers() {
  if (!db || players.size === 0) return;
  const now = Date.now();
  const active = [...players.values()].filter((p) => now - p.updatedAt <= TIMEOUT_MS);
  if (!active.length) return;
  // Batch insert
  const values = active.flatMap((p) => [p.name, p.totalTokens]);
  const placeholders = active.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ");
  try {
    await db.query(
      `INSERT INTO race_snapshots (player_name, total_tokens) VALUES ${placeholders}`,
      values
    );
  } catch (e) { console.error("[db] snapshot error", e.message); }
}

// ── User store (persisted to users.json) ─────────────────────────────────────
function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); } catch { return {}; }
}
function saveUsers(users) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
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

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
    req.on("error", reject);
  });
}

function cors(res) {
  const origin = Array.isArray(ALLOWED_ORIGINS) ? ALLOWED_ORIGINS.join(",") : "*";
  res.setHeader("Access-Control-Allow-Origin", Array.isArray(ALLOWED_ORIGINS) ? ALLOWED_ORIGINS[0] || "*" : "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Admin-Key");
}

function json(res, status, body) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const httpServer = createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const [urlPath, queryString] = req.url.split("?");
  const qs = new URLSearchParams(queryString || "");

  // ── Health ────────────────────────────────────────────────────────────────
  if (urlPath === "/health" && req.method === "GET") {
    return json(res, 200, { status: "ok", players: players.size, db: !!db });
  }

  // ── Auth: login / register ────────────────────────────────────────────────
  if (urlPath === "/auth/login" && req.method === "POST") {
    const { name, password } = await readBody(req);
    if (!name || !password) return json(res, 400, { error: "name and password required" });
    const users = loadUsers();
    const key = name.trim().toLowerCase();
    let user = users[key];
    if (!user) {
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      user = { displayName: name.trim().slice(0, 32), passwordHash: hash, mustChangePassword: false };
      users[key] = user;
      saveUsers(users);
    } else {
      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) return json(res, 401, { error: "Incorrect password" });
    }
    const token = jwt.sign({ name: user.displayName }, JWT_SECRET, { expiresIn: "7d" });
    return json(res, 200, { token, mustChangePassword: user.mustChangePassword, displayName: user.displayName });
  }

  if (urlPath === "/auth/change-password" && req.method === "POST") {
    const { name, oldPassword, newPassword } = await readBody(req);
    if (!name || !oldPassword || !newPassword) return json(res, 400, { error: "Missing fields" });
    if (newPassword === DEFAULT_PASSWORD) return json(res, 400, { error: `New password cannot be "${DEFAULT_PASSWORD}"` });
    if (newPassword.length < 4) return json(res, 400, { error: "Password must be at least 4 characters" });
    const users = loadUsers();
    const key = name.trim().toLowerCase();
    const user = users[key];
    if (!user) return json(res, 404, { error: "User not found" });
    const match = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!match) return json(res, 401, { error: "Incorrect current password" });
    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.mustChangePassword = false;
    saveUsers(users);
    const token = jwt.sign({ name: user.displayName }, JWT_SECRET, { expiresIn: "7d" });
    return json(res, 200, { token, mustChangePassword: false, displayName: user.displayName });
  }

  // ── Leaderboard: all-time best per player ─────────────────────────────────
  // GET /leaderboard  → [{ player_name, max_tokens, last_seen }]
  if (urlPath === "/leaderboard" && req.method === "GET") {
    if (!db) return json(res, 503, { error: "Database not configured" });
    try {
      const { rows } = await db.query(`
        SELECT
          player_name,
          MAX(total_tokens) AS max_tokens,
          MAX(recorded_at)  AS last_seen
        FROM race_snapshots
        GROUP BY player_name
        ORDER BY max_tokens DESC
        LIMIT 50
      `);
      return json(res, 200, { leaderboard: rows });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // ── History: token timeline for one player ────────────────────────────────
  // GET /history?name=Alice&days=7
  // Returns hourly max for the period → good for charts
  if (urlPath === "/history" && req.method === "GET") {
    if (!db) return json(res, 503, { error: "Database not configured" });
    const name = qs.get("name");
    const days = Math.min(90, Math.max(1, parseInt(qs.get("days") || "7", 10)));
    if (!name) return json(res, 400, { error: "name required" });
    try {
      const { rows } = await db.query(`
        SELECT
          date_trunc('hour', recorded_at) AS hour,
          MAX(total_tokens)               AS tokens
        FROM race_snapshots
        WHERE player_name = $1
          AND recorded_at >= NOW() - ($2 || ' days')::INTERVAL
        GROUP BY 1
        ORDER BY 1 ASC
      `, [name, days]);
      return json(res, 200, { name, days, history: rows });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // ── History: all players aggregated by day (for group chart) ─────────────
  // GET /history/all?days=7
  if (urlPath === "/history/all" && req.method === "GET") {
    if (!db) return json(res, 503, { error: "Database not configured" });
    const days = Math.min(90, Math.max(1, parseInt(qs.get("days") || "7", 10)));
    try {
      const { rows } = await db.query(`
        SELECT
          player_name,
          date_trunc('day', recorded_at) AS day,
          MAX(total_tokens)              AS tokens
        FROM race_snapshots
        WHERE recorded_at >= NOW() - ($1 || ' days')::INTERVAL
        GROUP BY player_name, day
        ORDER BY day ASC, tokens DESC
      `, [days]);
      return json(res, 200, { days, history: rows });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // ── Admin: list users ─────────────────────────────────────────────────────
  if (urlPath === "/admin/users" && req.method === "GET") {
    if ((req.headers["x-admin-key"] || "") !== ADMIN_KEY) return json(res, 403, { error: "Forbidden" });
    const users = loadUsers();
    const list = Object.values(users).map((u) => ({
      displayName: u.displayName, mustChangePassword: u.mustChangePassword,
    }));
    return json(res, 200, { users: list });
  }

  // ── Admin: reset password ─────────────────────────────────────────────────
  if (urlPath === "/admin/reset-password" && req.method === "POST") {
    const body = await readBody(req);
    const adminKey = body.adminKey || req.headers["x-admin-key"] || "";
    if (adminKey !== ADMIN_KEY) return json(res, 403, { error: "Forbidden" });
    const { name } = body;
    if (!name) return json(res, 400, { error: "name required" });
    const users = loadUsers();
    const key = name.trim().toLowerCase();
    const user = users[key];
    if (!user) return json(res, 404, { error: "User not found" });
    user.passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
    user.mustChangePassword = true;
    saveUsers(users);
    console.log(`[admin] reset password for ${user.displayName}`);
    return json(res, 200, { ok: true, message: `Password reset to "${DEFAULT_PASSWORD}" for ${user.displayName}` });
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

// Periodic broadcast + snapshot
setInterval(broadcast, 15_000);
setInterval(snapshotPlayers, SNAPSHOT_INTERVAL_MS);

// ── Start ─────────────────────────────────────────────────────────────────────
initDb().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Race server :${PORT} | Admin key: ${ADMIN_KEY}`);
    console.log(`CORS: ${JSON.stringify(ALLOWED_ORIGINS)}`);
    if (JWT_SECRET.startsWith("change-me-in-production-")) {
      console.warn("WARNING: JWT_SECRET not set — tokens will invalidate on restart");
    }
  });
});
