require("dotenv").config();
const { createServer } = require("http");
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
const RACE_TZ_OFFSET_MIN = parseInt(process.env.RACE_TZ_OFFSET_MIN || "420", 10);
function startOfLocalDay() {
  const offsetMs = RACE_TZ_OFFSET_MIN * 60_000;
  const localMidnight = Math.floor((Date.now() + offsetMs) / 86_400_000) * 86_400_000;
  return new Date(localMidnight - offsetMs);
}

// ── Shop catalog ────────────────────────────────────────────────────────────
// Server-authoritative skin prices (USD). The buy endpoint NEVER trusts the
// price sent by the client — it looks the skin up here. Keep this in sync with
// the SKINS list in components/SkinShopModal.tsx.
const SKIN_PRICES = {
  default: 0,
  dart: 8,
  ufo: 12,
  delta: 18,
  drone: 25,
  plane: 35,
  shuttle: 45,
  speeder: 60,
  fighter: 75,
  stealth: 95,
  interceptor: 120,
  raptor: 145,
  manta: 175,
  needle: 210,
  tie: 250,
  viper: 300,
  trident: 360,
  crystal: 430,
  phoenix: 520,
  wasp: 620,
  falcon: 750,
  orbiter: 900,
  mothership: 1100,
  comet: 1350,
  ring: 1700,
  dreadnought: 2200,
  dragon: 2600,
  falcon9: 3000,
  apollo: 3600,
  soyuz: 4200,
  starship: 5000,
  lunar: 6000,
  saturnv: 7200,
  voyager: 8800,
  iss: 11000,
  enterprise: 15000,
};
const DEFAULT_UNLOCKED = ["default"];

// Read a player's shop profile (or a sane default), shaping it for the client.
// availableCoins is always derived here (total_earned - spent_coins, floored at
// 0) — the source of truth for what the player can spend.
async function getShopProfile(playerName) {
  const { rows } = await db.query(
    "SELECT * FROM race_shop_profiles WHERE player_name = $1",
    [playerName]
  );
  const p = rows[0];
  const totalEarned = p ? Number(p.total_earned) : 0;
  const spentCoins = p ? Number(p.spent_coins) : 0;
  return {
    playerName,
    selectedSkin: p ? p.selected_skin : "default",
    selectedColor: p ? p.selected_color : null,
    flameColor: p ? p.flame_color : null,
    unlockedSkins: p ? p.unlocked_skins : DEFAULT_UNLOCKED,
    spentCoins,
    totalEarned,
    availableCoins: Math.max(0, totalEarned - spentCoins),
  };
}

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

    -- Optional USD cost for the same window as total_tokens. Nullable: older
    -- rows and reporters that don't send it stay NULL, and the UI just omits the
    -- "$" when it's missing. Additive + idempotent, safe on the shared DB.
    ALTER TABLE race_snapshots ADD COLUMN IF NOT EXISTS total_cost DOUBLE PRECISION;

    CREATE INDEX IF NOT EXISTS race_snapshots_player_time
      ON race_snapshots (player_name, recorded_at DESC);

    -- ── Shop (shared) ─────────────────────────────────────────────────────────
    -- The single source of truth for every player's rocket cosmetics + wallet.
    -- Lives on the SHARED race DB so every dashboard/spectator sees the same
    -- ship, color and plasma per player. Keyed by player_name = the display_name
    -- written into race_snapshots, so /live can LEFT JOIN it directly.
    --   total_earned = lifetime USD spent on tokens, pushed by each player's own
    --   reporter (idempotent, set via GREATEST). availableCoins is always derived
    --   server-side as total_earned - spent_coins, never trusted from the client.
    CREATE TABLE IF NOT EXISTS race_shop_profiles (
      player_name    TEXT PRIMARY KEY,
      selected_skin  TEXT NOT NULL DEFAULT 'default',
      selected_color TEXT,                              -- hull color hex, NULL = auto
      flame_color    TEXT,                              -- plasma color hex, NULL = auto
      unlocked_skins TEXT[] NOT NULL DEFAULT ARRAY['default'],
      spent_coins    DOUBLE PRECISION NOT NULL DEFAULT 0,
      total_earned   DOUBLE PRECISION NOT NULL DEFAULT 0,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Append-only purchase log. One row per skin bought.
    CREATE TABLE IF NOT EXISTS race_purchases (
      id           BIGSERIAL PRIMARY KEY,
      player_name  TEXT NOT NULL,
      skin_id      TEXT NOT NULL,
      price        DOUBLE PRECISION NOT NULL,
      purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS race_purchases_player
      ON race_purchases (player_name, purchased_at DESC);
  `);
  console.log("[db] tables ready");
}

// ── State model ───────────────────────────────────────────────────────────────
// This server keeps NO authoritative in-memory player state. Every /report is
// written straight to race_snapshots, and every /report only ever touches the
// row of the player it authenticated via JWT. That makes the server stateless
// and safe to run as multiple instances against ONE shared DB: no instance can
// ever overwrite another player's value with a stale copy (the old split-brain
// bug, where each instance re-snapshotted its whole in-memory view every 60s).
// Live state is derived on read as the latest row per player (see GET /live).

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
    return json(res, 200, { status: "ok" });
  }

  // ── Live: latest value per player for canvas polling (no WebSocket needed) ──
  // Derived on read from the shared DB: DISTINCT ON picks each player's newest
  // row, whichever instance wrote it. Backed by the
  // race_snapshots_player_time (player_name, recorded_at DESC) index.
  // Scoped to TODAY (recorded_at >= start of the local day): a player only
  // races once they've reported today, and every ship resets at the day
  // boundary — players who don't report today drop off the board until they do.
  if (urlPath === "/live" && req.method === "GET") {
    try {
      // LEFT JOIN the shared shop profile so every spectator renders each
      // player's actual ship: skin, hull color and plasma color. Players with no
      // profile yet just come back with nulls → client falls back to defaults.
      const { rows } = await db.query(`
        SELECT DISTINCT ON (s.player_name)
          s.player_name AS name, s.total_tokens AS "totalTokens",
          s.total_cost AS "totalCost", s.recorded_at AS "updatedAt",
          p.selected_skin  AS "skin",
          p.selected_color AS "color",
          p.flame_color    AS "flameColor"
        FROM race_snapshots s
        LEFT JOIN race_shop_profiles p ON p.player_name = s.player_name
        WHERE s.recorded_at >= $1
        ORDER BY s.player_name, s.recorded_at DESC
      `, [startOfLocalDay()]);
      const list = rows.map((r) => ({
        name: r.name,
        totalTokens: Number(r.totalTokens),
        // null when this player's latest report carried no cost
        totalCost: r.totalCost == null ? null : Number(r.totalCost),
        updatedAt: new Date(r.updatedAt).getTime(),
        // Cosmetics from the shared shop (null when the player has no profile)
        skin: r.skin || "default",
        color: r.color || null,
        flameColor: r.flameColor || null,
      }));
      return json(res, 200, { players: list });
    } catch (e) {
      console.error("[db] live query error", e.message);
      return json(res, 500, { error: "DB read failed" });
    }
  }

  if (urlPath === "/report" && req.method === "POST") {
    const { token, totalTokens, totalCost, lifetimeCost } = await readBody(req);
    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); } catch {
      return json(res, 401, { error: "Invalid token" });
    }
    if (typeof totalTokens !== "number" || !isFinite(totalTokens) || totalTokens < 0) {
      return json(res, 400, { error: "Invalid totalTokens" });
    }
    const value = Math.floor(totalTokens);
    // totalCost is optional (USD). Accept a finite, non-negative number; anything
    // else (missing, null, garbage) is stored as NULL so the column degrades
    // gracefully rather than rejecting the whole report.
    const cost =
      typeof totalCost === "number" && isFinite(totalCost) && totalCost >= 0
        ? totalCost
        : null;
    // lifetimeCost = the player's all-time USD spend on tokens, the wallet's
    // "total_earned". Idempotent: each report SETs it via GREATEST so a partial
    // sync that momentarily sums smaller can never shrink the wallet. Optional —
    // a reporter that doesn't send it leaves the wallet untouched.
    const lifetime =
      typeof lifetimeCost === "number" && isFinite(lifetimeCost) && lifetimeCost >= 0
        ? lifetimeCost
        : null;
    // Write only the authenticated player's own row — never any other player's.
    // This is the whole anti-split-brain guarantee: stale values from other
    // instances can't exist because no instance writes data it doesn't own.
    try {
      await db.query(
        "INSERT INTO race_snapshots (player_name, total_tokens, total_cost) VALUES ($1, $2, $3)",
        [payload.name, value, cost]
      );
      if (lifetime !== null) {
        await db.query(
          `INSERT INTO race_shop_profiles (player_name, total_earned)
           VALUES ($1, $2)
           ON CONFLICT (player_name) DO UPDATE
             SET total_earned = GREATEST(race_shop_profiles.total_earned, EXCLUDED.total_earned),
                 updated_at = NOW()`,
          [payload.name, lifetime]
        );
      }
    } catch (e) {
      console.error("[db] report insert error", e.message);
      return json(res, 500, { error: "DB write failed" });
    }
    return json(res, 200, { ok: true, name: payload.name, totalTokens: value, totalCost: cost });
  }

  // ── Auth: login (existing accounts only) ──────────────────────────────────
  if (urlPath === "/auth/login" && req.method === "POST") {
    const { name, password } = await readBody(req);
    if (!name || !password) return json(res, 400, { error: "name and password required" });

    const nameKey = name.trim().toLowerCase();

    const { rows } = await db.query(
      "SELECT * FROM race_users WHERE name_key = $1", [nameKey]
    );

    // Login does NOT create accounts — unknown name is rejected.
    if (rows.length === 0) return json(res, 404, { error: "Account not found — register first" });

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

  // ── Auth: register (create a new account) ─────────────────────────────────
  if (urlPath === "/auth/register" && req.method === "POST") {
    const { name, password } = await readBody(req);
    if (!name || !password) return json(res, 400, { error: "name and password required" });
    if (password.length < 4) return json(res, 400, { error: "Password must be at least 4 characters" });

    const nameKey = name.trim().toLowerCase();
    const displayName = name.trim().slice(0, 32);

    const { rows } = await db.query(
      "SELECT 1 FROM race_users WHERE name_key = $1", [nameKey]
    );
    if (rows.length > 0) return json(res, 409, { error: "Name already taken" });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await db.query(
      "INSERT INTO race_users (name_key, display_name, password_hash) VALUES ($1, $2, $3)",
      [nameKey, displayName, hash]
    );
    const token = jwt.sign({ name: displayName }, JWT_SECRET, { expiresIn: "7d" });
    return json(res, 200, { token, mustChangePassword: false, displayName });
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

  // ── Shop: read a player's profile + wallet (public, for spectator render) ───
  if (urlPath === "/shop/profile" && req.method === "GET") {
    const name = qs.get("name");
    if (!name) return json(res, 400, { error: "name required" });
    try {
      return json(res, 200, await getShopProfile(name));
    } catch (e) {
      console.error("[db] shop profile error", e.message);
      return json(res, 500, { error: "DB read failed" });
    }
  }

  // ── Shop: purchase history for a player (public) ────────────────────────────
  if (urlPath === "/shop/purchases" && req.method === "GET") {
    const name = qs.get("name");
    if (!name) return json(res, 400, { error: "name required" });
    try {
      const { rows } = await db.query(
        `SELECT skin_id AS "skinId", price, purchased_at AS "purchasedAt"
         FROM race_purchases WHERE player_name = $1
         ORDER BY purchased_at DESC LIMIT 100`,
        [name]
      );
      return json(res, 200, { purchases: rows.map((r) => ({
        skinId: r.skinId,
        price: Number(r.price),
        purchasedAt: new Date(r.purchasedAt).getTime(),
      })) });
    } catch (e) {
      console.error("[db] shop purchases error", e.message);
      return json(res, 500, { error: "DB read failed" });
    }
  }

  // ── Shop: buy a skin (JWT) ──────────────────────────────────────────────────
  // Server-authoritative: the price comes from SKIN_PRICES (never the client),
  // and availableCoins is recomputed under a row lock so two concurrent buys
  // can't both spend the same coins. Only ever touches the authenticated
  // player's own row — same anti-split-brain rule as /report.
  if (urlPath === "/shop/buy" && req.method === "POST") {
    const { token, skinId } = await readBody(req);
    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); } catch {
      return json(res, 401, { error: "Invalid token" });
    }
    if (!skinId || !(skinId in SKIN_PRICES)) {
      return json(res, 400, { error: "Unknown skin" });
    }
    const name = payload.name;
    const price = SKIN_PRICES[skinId];

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO race_shop_profiles (player_name) VALUES ($1) ON CONFLICT DO NOTHING",
        [name]
      );
      const { rows } = await client.query(
        "SELECT * FROM race_shop_profiles WHERE player_name = $1 FOR UPDATE",
        [name]
      );
      const prof = rows[0];
      const unlocked = prof.unlocked_skins || DEFAULT_UNLOCKED;
      if (unlocked.includes(skinId)) {
        await client.query("ROLLBACK");
        return json(res, 409, { error: "Skin already owned" });
      }
      const available = Number(prof.total_earned) - Number(prof.spent_coins);
      if (available < price) {
        await client.query("ROLLBACK");
        return json(res, 402, { error: "Insufficient coins" });
      }
      const newUnlocked = [...unlocked, skinId];
      const newSpent = Number(prof.spent_coins) + price;
      await client.query(
        `UPDATE race_shop_profiles
           SET spent_coins = $2, unlocked_skins = $3, selected_skin = $4, updated_at = NOW()
         WHERE player_name = $1`,
        [name, newSpent, newUnlocked, skinId]
      );
      await client.query(
        "INSERT INTO race_purchases (player_name, skin_id, price) VALUES ($1, $2, $3)",
        [name, skinId, price]
      );
      await client.query("COMMIT");
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("[db] shop buy error", e.message);
      return json(res, 500, { error: "Purchase failed" });
    } finally {
      client.release();
    }
    return json(res, 200, await getShopProfile(name));
  }

  // ── Shop: equip cosmetics — no coin cost (JWT) ──────────────────────────────
  // Changes selected skin (must already be owned), hull color and plasma color.
  // Colors are either a #hex string or null (auto). Garbage is ignored field by
  // field rather than rejecting the whole request.
  if (urlPath === "/shop/equip" && req.method === "POST") {
    const { token, selectedSkin, selectedColor, flameColor } = await readBody(req);
    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); } catch {
      return json(res, 401, { error: "Invalid token" });
    }
    const name = payload.name;
    const validColor = (c) => c === null || (typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c));

    try {
      await db.query(
        "INSERT INTO race_shop_profiles (player_name) VALUES ($1) ON CONFLICT DO NOTHING",
        [name]
      );
      const cur = await getShopProfile(name);

      const sets = [];
      const vals = [name];
      let i = 2;
      if (selectedSkin !== undefined) {
        if (!cur.unlockedSkins.includes(selectedSkin)) {
          return json(res, 403, { error: "Skin not owned" });
        }
        sets.push(`selected_skin = $${i++}`); vals.push(selectedSkin);
      }
      if (selectedColor !== undefined && validColor(selectedColor)) {
        sets.push(`selected_color = $${i++}`); vals.push(selectedColor);
      }
      if (flameColor !== undefined && validColor(flameColor)) {
        sets.push(`flame_color = $${i++}`); vals.push(flameColor);
      }
      if (sets.length) {
        sets.push("updated_at = NOW()");
        await db.query(
          `UPDATE race_shop_profiles SET ${sets.join(", ")} WHERE player_name = $1`,
          vals
        );
      }
      return json(res, 200, await getShopProfile(name));
    } catch (e) {
      console.error("[db] shop equip error", e.message);
      return json(res, 500, { error: "Equip failed" });
    }
  }

  res.writeHead(404); res.end();
});

// ── Start ─────────────────────────────────────────────────────────────────────
initDb().then(async () => {
  httpServer.listen(PORT, () => {
    console.log(`Race server :${PORT} | Admin key: ${ADMIN_KEY}`);
    if (JWT_SECRET.startsWith("change-me-in-production-")) {
      console.warn("WARNING: JWT_SECRET not set — tokens will invalidate on restart");
    }
  });
}).catch((e) => { console.error("DB init failed:", e.message); process.exit(1); });
