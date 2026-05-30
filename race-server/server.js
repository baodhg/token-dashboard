const { createServer } = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : "*";
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production-" + Math.random();
const ADMIN_KEY = process.env.ADMIN_KEY || "admin123";
// Store users.json in /app/data when running in Docker (volume-mounted),
// fall back to __dirname for local dev
const DATA_DIR = process.env.DATA_DIR || __dirname;
const USERS_FILE = path.join(DATA_DIR, "users.json");
const DEFAULT_PASSWORD = "123456";
const SALT_ROUNDS = 10;

// ── User store (persisted to users.json) ─────────────────────────────────────
function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); } catch { return {}; }
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ── In-memory player state ────────────────────────────────────────────────────
const players = new Map(); // socketId → { name, totalTokens, updatedAt }
const TIMEOUT_MS = 45_000;

function broadcast() {
  const now = Date.now();
  for (const [id, p] of players) {
    if (now - p.updatedAt > TIMEOUT_MS) { players.delete(id); }
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
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

function cors(res) {
  const origin = typeof ALLOWED_ORIGINS === "string" ? ALLOWED_ORIGINS : "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
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

  const url = req.url.split("?")[0];

  // ── Health ────────────────────────────────────────────────────────────────
  if (url === "/health" && req.method === "GET") {
    return json(res, 200, { status: "ok", players: players.size });
  }

  // ── Register / Login ──────────────────────────────────────────────────────
  if (url === "/auth/login" && req.method === "POST") {
    const { name, password } = await readBody(req);
    if (!name || !password) return json(res, 400, { error: "name and password required" });

    const users = loadUsers();
    const user = users[name.trim().toLowerCase()];

    if (!user) {
      // New account — auto-register
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      users[name.trim().toLowerCase()] = {
        displayName: name.trim().slice(0, 32),
        passwordHash: hash,
        mustChangePassword: false,
      };
      saveUsers(users);
      const token = jwt.sign({ name: users[name.trim().toLowerCase()].displayName }, JWT_SECRET, { expiresIn: "7d" });
      return json(res, 200, { token, mustChangePassword: false, displayName: users[name.trim().toLowerCase()].displayName });
    }

    // Existing account
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return json(res, 401, { error: "Incorrect password" });

    const token = jwt.sign({ name: user.displayName }, JWT_SECRET, { expiresIn: "7d" });
    return json(res, 200, { token, mustChangePassword: user.mustChangePassword, displayName: user.displayName });
  }

  if (url === "/auth/change-password" && req.method === "POST") {
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

  // ── Admin: list users ─────────────────────────────────────────────────────
  if (url === "/admin/users" && req.method === "GET") {
    const key = (req.headers["x-admin-key"] || "");
    if (key !== ADMIN_KEY) return json(res, 403, { error: "Forbidden" });
    const users = loadUsers();
    const list = Object.entries(users).map(([, u]) => ({
      displayName: u.displayName,
      mustChangePassword: u.mustChangePassword,
    }));
    return json(res, 200, { users: list });
  }

  // ── Admin: reset password ─────────────────────────────────────────────────
  if (url === "/admin/reset-password" && req.method === "POST") {
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

setInterval(broadcast, 15_000);

httpServer.listen(PORT, () => {
  console.log(`Race server :${PORT} | Admin key: ${ADMIN_KEY}`);
  console.log(`CORS: ${JSON.stringify(ALLOWED_ORIGINS)}`);
  if (JWT_SECRET.startsWith("change-me-in-production-")) {
    console.warn("WARNING: JWT_SECRET not set — using random secret (tokens reset on restart)");
  }
});
