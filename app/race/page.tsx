"use client";

import { useState, useEffect, useCallback, Suspense, CSSProperties, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { PERIODS, type Period } from "@/lib/mock-data";

const MultiplayerRace = dynamic(
  () => import("@/components/MultiplayerRace"),
  { ssr: false }
);

const RACE_SERVER_URL = process.env.NEXT_PUBLIC_RACE_SERVER_URL || "";
const POLL_MS = 10_000;
const INTRO_MS = 3_000;
const FALLBACK_MIN_MS = 1_000;
const RELOAD_MIN_MS = 500;
const SESSION_KEY = "race_session"; // sessionStorage key

interface Session {
  displayName: string;
  token: string;
}

// ── Shared UI primitives ──────────────────────────────────────────────────────
const INPUT_STYLE: CSSProperties = {
  background: "rgba(0,255,200,0.06)", border: "1px solid rgba(0,255,200,0.3)",
  borderRadius: 8, padding: "10px 18px",
  fontFamily: "ui-monospace, monospace", fontSize: 14, fontWeight: 700,
  color: "#eafffb", outline: "none", textAlign: "center",
  width: 260, boxShadow: "0 0 12px rgba(0,240,200,0.15)",
};
const ERR_STYLE: CSSProperties = {
  fontFamily: "ui-monospace, monospace", fontSize: 11,
  color: "#ff6b8a", background: "rgba(255,50,80,0.1)",
  border: "1px solid rgba(255,50,80,0.2)", borderRadius: 6,
  padding: "6px 14px", maxWidth: 280, textAlign: "center",
};

function CyberBtn({ children, onClick, disabled, type = "button" }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit";
}) {
  const active = !disabled;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: active ? "rgba(0,255,200,0.12)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${active ? "rgba(0,255,200,0.5)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 24, padding: "8px 32px",
        fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 900,
        letterSpacing: "0.14em", textTransform: "uppercase",
        color: active ? "#4affe0" : "rgba(255,255,255,0.2)",
        cursor: active ? "pointer" : "not-allowed",
        transition: "all 0.2s",
      }}
    >{children}</button>
  );
}

function CyberGhostBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none", border: "none",
        fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700,
        color: "rgba(0,240,200,0.45)", cursor: "pointer",
        textDecoration: "underline", textUnderlineOffset: 3,
        letterSpacing: "0.08em", padding: 0,
        transition: "color 0.2s",
      }}
    >{children}</button>
  );
}

// ── Cyberpunk splash ──────────────────────────────────────────────────────────
function RaceSplash({ fading }: { fading: boolean }) {
  return (
    <div className={`race-splash${fading ? " race-splash-fade" : ""}`}>
      <h1 className="glitch-title" data-text="TOKEN RACE">TOKEN RACE</h1>
      <div className="race-splash-sub">Multiplayer · Token Velocity · Global</div>
      <div className="race-splash-bar"><span /></div>
      <div className="race-splash-sub" style={{ opacity: 0.6 }}>Connecting to race server…</div>
    </div>
  );
}

// ── Scanline overlay (shared) ─────────────────────────────────────────────────
function Scanlines() {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "repeating-linear-gradient(0deg, rgba(0,255,200,0.025) 0px, rgba(0,255,200,0.025) 1px, transparent 2px, transparent 4px)",
      pointerEvents: "none",
    }} />
  );
}

// ── Auth Gate: login / register ───────────────────────────────────────────────
function AuthGate({ serverUrl, onAuth }: { serverUrl: string; onAuth: (s: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const switchMode = (m: "login" | "register") => {
    setMode(m); setError(""); setPassword(""); setConfirm("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim().slice(0, 32);
    const p = password;
    if (!n || !p) return;
    if (mode === "register") {
      if (p.length < 4) { setError("Password must be at least 4 characters"); return; }
      if (p !== confirm) { setError("Passwords do not match"); return; }
      if (p === DEFAULT_PW) { setError(`Password cannot be "${DEFAULT_PW}"`); return; }
    }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${serverUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, password: p }),
      });
      const data = await res.json();
      if (!res.ok) {
        // If registering and name already taken, surface a clearer message
        if (mode === "register" && res.status === 401) {
          setError("Name already taken — please log in or choose another name");
        } else {
          setError(data.error || "Failed");
        }
        return;
      }
      if (data.mustChangePassword) {
        sessionStorage.setItem(SESSION_KEY + "_pending", JSON.stringify({ displayName: data.displayName, token: data.token, name: n }));
        setError("__must_change__");
        return;
      }
      const session: Session = { displayName: data.displayName, token: data.token };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      onAuth(session);
    } catch { setError("Cannot reach race server"); }
    finally { setLoading(false); }
  };

  if (error === "__must_change__") return null;

  const isLogin = mode === "login";
  const TAB_S = (active: boolean): CSSProperties => ({
    flex: 1, padding: "8px 0", fontFamily: "ui-monospace, monospace",
    fontSize: 11, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase",
    background: active ? "rgba(0,255,200,0.12)" : "transparent",
    border: "none", borderBottom: `2px solid ${active ? "rgba(0,255,200,0.6)" : "rgba(255,255,255,0.08)"}`,
    color: active ? "#4affe0" : "rgba(255,255,255,0.25)",
    cursor: "pointer", transition: "all 0.2s",
  });

  return (
    <div style={{
      position: "fixed", inset: 0, background: "radial-gradient(ellipse at center, #0a0d1c 0%, #03040a 70%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.4rem", zIndex: 100,
    }}>
      <Scanlines />
      <h1 className="glitch-title" data-text="TOKEN RACE" style={{ marginBottom: "0.2rem" }}>TOKEN RACE</h1>
      <div className="race-splash-sub" style={{ marginBottom: "0.4rem" }}>Multiplayer · Token Velocity · Global</div>

      <div style={{ width: 280, zIndex: 1 }}>
        {/* Login / Register tabs */}
        <div style={{ display: "flex", marginBottom: "1.2rem" }}>
          <button style={TAB_S(isLogin)} onClick={() => switchMode("login")}>Login</button>
          <button style={TAB_S(!isLogin)} onClick={() => switchMode("register")}>Register</button>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          <input
            autoFocus
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Racer name" maxLength={32}
            style={{ ...INPUT_STYLE, width: "100%", boxSizing: "border-box" }}
          />
          <input
            type="password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            style={{ ...INPUT_STYLE, width: "100%", boxSizing: "border-box" }}
          />
          {!isLogin && (
            <input
              type="password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password"
              style={{ ...INPUT_STYLE, width: "100%", boxSizing: "border-box" }}
            />
          )}
          {error && <div style={{ ...ERR_STYLE, width: "100%", boxSizing: "border-box" }}>{error}</div>}
          <CyberBtn
            type="submit"
            disabled={!name.trim() || !password || (!isLogin && !confirm) || loading}
          >
            {loading ? "…" : isLogin ? "Login →" : "Create Account →"}
          </CyberBtn>
        </form>

        <p style={{
          fontFamily: "ui-monospace, monospace", fontSize: "0.6rem",
          color: "rgba(190,255,245,0.25)", textAlign: "center",
          marginTop: "1rem", lineHeight: 1.6,
        }}>
          {isLogin
            ? "No account? Switch to Register above."
            : "Your token count is read from your local dashboard and reported to the race server."}
        </p>
      </div>
    </div>
  );
}

const DEFAULT_PW = "123456";

// ── Change Password Gate ──────────────────────────────────────────────────────
function ChangePasswordGate({ serverUrl, pendingName, onDone }: {
  serverUrl: string; pendingName: string; onDone: (s: Session) => void;
}) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirm) { setError("Passwords do not match"); return; }
    if (newPw === "123456") { setError('New password cannot be "123456"'); return; }
    if (newPw.length < 4) { setError("At least 4 characters required"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${serverUrl}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pendingName, oldPassword: oldPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed"); return; }
      const session: Session = { displayName: data.displayName, token: data.token };
      sessionStorage.removeItem(SESSION_KEY + "_pending");
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      onDone(session);
    } catch { setError("Cannot reach race server"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "radial-gradient(ellipse at center, #0a0d1c 0%, #03040a 70%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.6rem", zIndex: 100,
    }}>
      <Scanlines />
      <h1 className="glitch-title" data-text="CHANGE PASSWORD" style={{ fontSize: "clamp(1.2rem,4vw,2.8rem)", marginBottom: "0.4rem" }}>
        CHANGE PASSWORD
      </h1>
      <div className="race-splash-sub" style={{ color: "#ff9f59" }}>
        Your password was reset — choose a new one to continue
      </div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", zIndex: 1 }}>
        <input
          autoFocus type="password"
          value={oldPw} onChange={(e) => setOldPw(e.target.value)}
          placeholder="Current password (123456)"
          style={{ ...INPUT_STYLE }}
        />
        <input
          type="password"
          value={newPw} onChange={(e) => setNewPw(e.target.value)}
          placeholder="New password"
          style={{ ...INPUT_STYLE }}
        />
        <input
          type="password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm new password"
          style={{ ...INPUT_STYLE }}
        />
        {error && <div style={ERR_STYLE}>{error}</div>}
        <CyberBtn type="submit" disabled={!oldPw || !newPw || !confirm || loading}>
          {loading ? "…" : "Set Password →"}
        </CyberBtn>
      </form>
    </div>
  );
}

// ── Server not configured ─────────────────────────────────────────────────────
function NotConfigured({ onExit }: { onExit: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#03040a",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.2rem",
    }}>
      <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center", maxWidth: 400, lineHeight: 1.6 }}>
        Multiplayer race server not configured.<br />
        Set <code style={{ color: "#4affe0" }}>NEXT_PUBLIC_RACE_SERVER_URL</code> in your <code style={{ color: "#4affe0" }}>.env</code> file.
      </p>
      <button onClick={onExit} style={{
        background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 20, padding: "6px 18px",
        fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 700,
        color: "rgba(255,255,255,0.55)", cursor: "pointer",
      }}>← Back</button>
    </div>
  );
}

// ── Main race content ─────────────────────────────────────────────────────────
function RaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialPeriod = (searchParams.get("period") as Period) || "1d";
  const initialSource = searchParams.get("source") || "all";

  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [source] = useState(initialSource);
  const [myTokens, setMyTokens] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);

  // Auth state
  const [session, setSession] = useState<Session | null>(null);
  const [pendingChangePw, setPendingChangePw] = useState<{ name: string } | null>(null);
  const [authReady, setAuthReady] = useState(false); // checked sessionStorage

  // Splash gates
  const [introReady, setIntroReady] = useState(false);
  const [introFading, setIntroFading] = useState(false);
  useEffect(() => {
    const fadeAt = setTimeout(() => setIntroFading(true), INTRO_MS - 500);
    const doneAt = setTimeout(() => setIntroReady(true), INTRO_MS);
    return () => { clearTimeout(fadeAt); clearTimeout(doneAt); };
  }, []);

  const [reloadReady, setReloadReady] = useState(false);
  useEffect(() => {
    setReloadReady(false);
    const id = setTimeout(() => setReloadReady(true), RELOAD_MIN_MS);
    return () => clearTimeout(id);
  }, [period]);

  // Restore session from sessionStorage + check pending change-pw
  useEffect(() => {
    const pending = sessionStorage.getItem(SESSION_KEY + "_pending");
    if (pending) {
      try {
        const p = JSON.parse(pending);
        setPendingChangePw({ name: p.name });
        setAuthReady(true);
        return;
      } catch { sessionStorage.removeItem(SESSION_KEY + "_pending"); }
    }
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      try { setSession(JSON.parse(saved)); } catch { sessionStorage.removeItem(SESSION_KEY); }
    }
    setAuthReady(true);
  }, []);

  const buildQs = useCallback((p: Period) => {
    const qs = new URLSearchParams({ period: p });
    if (source !== "all") qs.set("source", source);
    return qs.toString();
  }, [source]);

  const fetchMyTokens = useCallback((p: Period) => {
    fetch(`/api/token-stats?${buildQs(p)}`)
      .then((r) => r.json())
      .then((d) => { setMyTokens(d?.summary?.total ?? 0); setLastRefresh(Date.now()); })
      .catch(() => {});
  }, [buildQs]);

  const pollTick = useCallback((p: Period) => {
    fetch("/api/sync", { method: "POST" })
      .then((r) => r.json())
      // Always refresh stats on every poll tick — don't wait for synced > 0.
      // This ensures myTokens stays current and gets reported to the race server.
      .then(() => fetchMyTokens(p))
      .catch(() => {});
  }, [fetchMyTokens]);

  useEffect(() => {
    fetchMyTokens(period);
    const params = new URLSearchParams({ period });
    if (source !== "all") params.set("source", source);
    router.replace(`/race?${params.toString()}`, { scroll: false });
  }, [period, source, fetchMyTokens, router]);

  useEffect(() => {
    const id = setInterval(() => pollTick(period), POLL_MS);
    return () => clearInterval(id);
  }, [period, pollTick]);

  const handleExit = useCallback(() => {
    const params = new URLSearchParams({ period });
    if (source !== "all") params.set("source", source);
    router.push(`/?${params.toString()}`);
  }, [period, source, router]);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  if (!RACE_SERVER_URL) return <NotConfigured onExit={handleExit} />;

  if (!introReady || !reloadReady) {
    return (
      <div className="fixed inset-0 bg-[#03040a]">
        <RaceSplash fading={introFading} />
      </div>
    );
  }

  if (!authReady) return <div className="fixed inset-0 bg-[#03040a]" />;

  // Must change password (after admin reset)
  if (pendingChangePw) {
    return (
      <ChangePasswordGate
        serverUrl={RACE_SERVER_URL}
        pendingName={pendingChangePw.name}
        onDone={(s) => { setSession(s); setPendingChangePw(null); }}
      />
    );
  }

  // Not logged in
  if (!session) {
    return (
      <AuthGate
        serverUrl={RACE_SERVER_URL}
        onAuth={(s) => {
          // Check if mustChangePassword triggered pending state
          const pending = sessionStorage.getItem(SESSION_KEY + "_pending");
          if (pending) {
            try { const p = JSON.parse(pending); setPendingChangePw({ name: p.name }); return; } catch { }
          }
          setSession(s);
        }}
      />
    );
  }

  return (
    <RaceShell
      session={session}
      serverUrl={RACE_SERVER_URL}
      period={period}
      setPeriod={setPeriod}
      myTokens={myTokens}
      lastRefresh={lastRefresh}
      handleExit={handleExit}
      handleLogout={handleLogout}
    />
  );
}

// ── Leaderboard panel ─────────────────────────────────────────────────────────
interface LeaderRow { player_name: string; max_tokens: number; last_seen: string; }

function LeaderboardPanel({ serverUrl }: { serverUrl: string }) {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`${serverUrl}/leaderboard`)
      .then((r) => r.json())
      .then((d) => { setRows(d.leaderboard || []); setLoading(false); })
      .catch(() => { setError("Failed to load"); setLoading(false); });
  }, [serverUrl]);

  const maxTok = Math.max(1, ...rows.map((r) => Number(r.max_tokens)));

  const mono: CSSProperties = { fontFamily: "ui-monospace, monospace" };
  return (
    <div style={{ padding: "1.5rem 1rem", maxWidth: 560, margin: "0 auto", width: "100%" }}>
      <h2 style={{ ...mono, fontSize: 13, fontWeight: 900, letterSpacing: "0.2em", color: "rgba(0,240,200,0.7)", marginBottom: "1.2rem", textTransform: "uppercase" }}>
        All-Time Leaderboard
      </h2>
      {loading && <p style={{ ...mono, fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Loading…</p>}
      {error && <p style={{ ...mono, fontSize: 11, color: "#ff6b8a" }}>{error}</p>}
      {!loading && rows.length === 0 && !error && (
        <p style={{ ...mono, fontSize: 11, color: "rgba(255,255,255,0.25)" }}>No data yet — snapshots are written every 60s.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {rows.map((r, i) => {
          const pct = (Number(r.max_tokens) / maxTok) * 100;
          const hue = i === 0 ? 45 : i === 1 ? 200 : i === 2 ? 280 : 160;
          const color = `hsl(${hue},80%,62%)`;
          return (
            <div key={r.player_name} style={{
              position: "relative", overflow: "hidden",
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 8, padding: "10px 14px",
            }}>
              {/* progress bar bg */}
              <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${color}18 0%, transparent ${pct}%)`, pointerEvents: "none" }} />
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ ...mono, fontSize: 11, fontWeight: 900, color, minWidth: 22, textAlign: "right" }}>#{i + 1}</span>
                <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: "#eafffb", flex: 1 }}>{r.player_name}</span>
                <span style={{ ...mono, fontSize: 13, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
                  {Number(r.max_tokens) >= 1_000_000 ? `${(Number(r.max_tokens) / 1_000_000).toFixed(2)}M`
                    : Number(r.max_tokens) >= 1_000 ? `${(Number(r.max_tokens) / 1_000).toFixed(1)}K`
                    : String(r.max_tokens)}
                </span>
                <span style={{ ...mono, fontSize: 9, color: "rgba(255,255,255,0.2)", minWidth: 60, textAlign: "right" }}>
                  {new Date(r.last_seen).toLocaleDateString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── History chart panel ───────────────────────────────────────────────────────
interface HistoryRow { day: string; player_name: string; tokens: number; }

function HistoryPanel({ serverUrl, myName }: { serverUrl: string; myName: string }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${serverUrl}/history/all?days=${days}`)
      .then((r) => r.json())
      .then((d) => { setData(d.history || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [serverUrl, days]);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const PAD = { top: 20, right: 20, bottom: 36, left: 58 };
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fillRect(0, 0, W, H);

    // Collect unique days + players
    const daySet = new Set<string>();
    const playerSet = new Set<string>();
    data.forEach((r) => { daySet.add(r.day.slice(0, 10)); playerSet.add(r.player_name); });
    const dayList = [...daySet].sort();
    const playerList = [...playerSet];
    if (!dayList.length) return;

    // Map: player → day → tokens
    const map = new Map<string, Map<string, number>>();
    data.forEach((r) => {
      if (!map.has(r.player_name)) map.set(r.player_name, new Map());
      map.get(r.player_name)!.set(r.day.slice(0, 10), Number(r.tokens));
    });

    const maxTok = Math.max(1, ...data.map((r) => Number(r.tokens)));
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top - PAD.bottom;
    const xAt = (i: number) => PAD.left + (i / Math.max(dayList.length - 1, 1)) * cW;
    const yAt = (v: number) => PAD.top + cH - (v / maxTok) * cH;

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1;
    for (let t = 0; t <= 4; t++) {
      const y = PAD.top + (t / 4) * cH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "9px ui-monospace, monospace"; ctx.textAlign = "right";
      const v = maxTok * (1 - t / 4);
      ctx.fillText(v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : `${Math.round(v)}`, PAD.left - 6, y + 3);
    }

    // Day labels
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "9px ui-monospace, monospace"; ctx.textAlign = "center";
    dayList.forEach((d, i) => {
      if (dayList.length > 10 && i % 2 !== 0) return;
      ctx.fillText(d.slice(5), xAt(i), H - PAD.bottom + 14);
    });

    // Lines per player
    const HUES = [160, 45, 280, 200, 20, 320, 90];
    playerList.forEach((name, pi) => {
      const hue = HUES[pi % HUES.length];
      const isMe = name === myName;
      const color = `hsl(${hue},${isMe ? 85 : 65}%,${isMe ? 62 : 52}%)`;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = isMe ? 2.5 : 1.5;
      ctx.globalAlpha = isMe ? 1 : 0.65;
      ctx.beginPath();
      let started = false;
      dayList.forEach((d, i) => {
        const v = map.get(name)?.get(d) ?? null;
        if (v === null) { started = false; return; }
        if (!started) { ctx.moveTo(xAt(i), yAt(v)); started = true; }
        else ctx.lineTo(xAt(i), yAt(v));
      });
      ctx.stroke();
      // Dot at last point
      const lastDay = [...(map.get(name)?.keys() || [])].sort().pop();
      if (lastDay) {
        const lv = map.get(name)!.get(lastDay)!;
        const li = dayList.indexOf(lastDay);
        if (li >= 0) {
          ctx.beginPath(); ctx.arc(xAt(li), yAt(lv), isMe ? 4 : 3, 0, Math.PI * 2);
          ctx.fillStyle = color; ctx.fill();
        }
      }
      ctx.restore();
    });

    // Legend
    ctx.globalAlpha = 1;
    let lx = PAD.left;
    playerList.forEach((name, pi) => {
      const hue = HUES[pi % HUES.length];
      const color = `hsl(${hue},75%,57%)`;
      ctx.fillStyle = color;
      ctx.fillRect(lx, H - 10, 16, 3);
      ctx.fillStyle = name === myName ? "#fff" : "rgba(255,255,255,0.55)";
      ctx.font = `${name === myName ? "bold " : ""}9px ui-monospace, monospace`;
      ctx.textAlign = "left";
      ctx.fillText(name + (name === myName ? " ★" : ""), lx + 20, H - 7);
      lx += ctx.measureText(name).width + 36;
    });
  }, [data, myName]);

  const mono: CSSProperties = { fontFamily: "ui-monospace, monospace" };
  return (
    <div style={{ padding: "1.5rem 1rem", maxWidth: 700, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h2 style={{ ...mono, fontSize: 13, fontWeight: 900, letterSpacing: "0.2em", color: "rgba(0,240,200,0.7)", textTransform: "uppercase" }}>
          Token History
        </h2>
        <div style={{ display: "flex", gap: 4 }}>
          {[7, 14, 30].map((d) => (
            <button key={d} onClick={() => setDays(d)} style={{
              ...mono, fontSize: 10, fontWeight: 700,
              background: days === d ? "rgba(0,255,200,0.15)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${days === d ? "rgba(0,255,200,0.4)" : "rgba(255,255,255,0.08)"}`,
              color: days === d ? "#4affe0" : "rgba(255,255,255,0.35)",
              borderRadius: 12, padding: "3px 10px", cursor: "pointer",
            }}>{d}d</button>
          ))}
        </div>
      </div>
      {loading && <p style={{ ...mono, fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Loading…</p>}
      {!loading && data.length === 0 && (
        <p style={{ ...mono, fontSize: 11, color: "rgba(255,255,255,0.25)" }}>No history yet — snapshots are written every 60s of active racing.</p>
      )}
      {!loading && data.length > 0 && (
        <canvas
          ref={canvasRef}
          width={660} height={280}
          style={{ width: "100%", height: "auto", borderRadius: 8, display: "block" }}
        />
      )}
    </div>
  );
}

// ── Race shell with tab switcher ──────────────────────────────────────────────
type Tab = "live" | "leaderboard" | "history";

function RaceShell({ session, serverUrl, period, setPeriod, myTokens, lastRefresh, handleExit, handleLogout }: {
  session: Session;
  serverUrl: string;
  period: Period;
  setPeriod: (p: Period) => void;
  myTokens: number;
  lastRefresh: number | null;
  handleExit: () => void;
  handleLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>("live");
  const mono: CSSProperties = { fontFamily: "ui-monospace, monospace" };

  const TAB_BTN = (t: Tab, label: string) => (
    <button
      key={t}
      onClick={() => setTab(t)}
      style={{
        ...mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
        background: tab === t ? "rgba(0,255,200,0.12)" : "transparent",
        border: `1px solid ${tab === t ? "rgba(0,255,200,0.35)" : "rgba(255,255,255,0.08)"}`,
        color: tab === t ? "#4affe0" : "rgba(255,255,255,0.3)",
        borderRadius: 14, padding: "4px 14px", cursor: "pointer", transition: "all 0.2s",
      }}
    >{label}</button>
  );

  return (
    <div className="fixed inset-0 bg-[#03040a]" style={{ display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{
        position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
        zIndex: 80, display: "flex", alignItems: "center", gap: 6,
        background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 24, padding: "4px 8px", backdropFilter: "blur(10px)",
      }}>
        {/* Period filters — only on live tab */}
        {tab === "live" && PERIODS.filter((p) => p.key !== "custom").map(({ key }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            style={{
              ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
              background: period === key ? "rgba(255,255,255,0.12)" : "transparent",
              border: "none", color: period === key ? "#fff" : "rgba(255,255,255,0.3)",
              borderRadius: 12, padding: "3px 9px", cursor: "pointer",
            }}
          >{key}</button>
        ))}
        {tab === "live" && <span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.1)" }} />}
        {TAB_BTN("live", "🚀 Live")}
        {TAB_BTN("leaderboard", "🏆 All-Time")}
        {TAB_BTN("history", "📈 History")}
        {lastRefresh && tab === "live" && (
          <span style={{ ...mono, fontSize: 9, color: "rgba(255,255,255,0.18)", paddingLeft: 4 }}>
            {new Date(lastRefresh).toLocaleTimeString()}
          </span>
        )}
        <span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.1)" }} />
        <button onClick={handleLogout} style={{ ...mono, fontSize: 9, color: "rgba(255,255,255,0.2)", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}>logout</button>
      </div>

      {/* Back button */}
      <button
        onClick={handleExit}
        style={{
          position: "absolute", top: 14, left: 14, zIndex: 80,
          background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 20, padding: "5px 14px",
          ...mono, fontSize: 11, fontWeight: 700,
          color: "rgba(255,255,255,0.4)", cursor: "pointer", backdropFilter: "blur(6px)",
        }}
      >← Exit</button>

      {/* Content */}
      {tab === "live" && (
        <MultiplayerRace
          serverUrl={serverUrl}
          playerName={session.displayName}
          playerToken={session.token}
          myTokens={myTokens}
          onExit={handleExit}
        />
      )}

      {tab !== "live" && (
        <div style={{
          flex: 1, overflowY: "auto", paddingTop: "4.5rem",
          scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent",
        }}>
          {tab === "leaderboard" && <LeaderboardPanel serverUrl={serverUrl} />}
          {tab === "history" && <HistoryPanel serverUrl={serverUrl} myName={session.displayName} />}
        </div>
      )}
    </div>
  );
}

function MinSplashGate() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setReady(true), FALLBACK_MIN_MS);
    return () => clearTimeout(id);
  }, []);
  if (!ready) return (
    <div className="fixed inset-0 bg-[#03040a]"><RaceSplash fading={false} /></div>
  );
  return <RaceContent />;
}

export default function MultiplayerRacePage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[#03040a]"><RaceSplash fading={false} /></div>}>
      <MinSplashGate />
    </Suspense>
  );
}
