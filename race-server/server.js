const { createServer } = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3001;
// Comma-separated list of allowed origins, e.g. "http://localhost:3000,https://your-domain.com"
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : "*";

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", players: players.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
  },
});

// In-memory state: socketId → { name, totalTokens, updatedAt }
const players = new Map();

// Drop players who haven't sent a heartbeat in this many ms
const TIMEOUT_MS = 45_000;

function broadcast() {
  const now = Date.now();
  // Evict stale players before broadcasting
  for (const [id, p] of players) {
    if (now - p.updatedAt > TIMEOUT_MS) {
      players.delete(id);
      console.log(`[evict] ${p.name} (${id}) — no heartbeat`);
    }
  }

  const list = [...players.values()].map((p) => ({
    name: p.name,
    totalTokens: p.totalTokens,
    updatedAt: p.updatedAt,
  }));

  io.emit("players_update", list);
}

io.on("connection", (socket) => {
  console.log(`[connect] ${socket.id}`);

  // Client sends { name, totalTokens } on join and on every token update
  socket.on("player_update", ({ name, totalTokens }) => {
    if (typeof name !== "string" || name.trim().length === 0) return;
    if (typeof totalTokens !== "number" || !isFinite(totalTokens)) return;

    players.set(socket.id, {
      name: name.trim().slice(0, 32),
      totalTokens: Math.max(0, Math.floor(totalTokens)),
      updatedAt: Date.now(),
    });

    broadcast();
  });

  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    if (p) console.log(`[disconnect] ${p.name} (${socket.id})`);
    players.delete(socket.id);
    broadcast();
  });
});

// Periodic stale-player sweep + broadcast even if no events come in
setInterval(broadcast, 15_000);

httpServer.listen(PORT, () => {
  console.log(`Race server listening on :${PORT}`);
  console.log(`CORS origins: ${JSON.stringify(ALLOWED_ORIGINS)}`);
});
