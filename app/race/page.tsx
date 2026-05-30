"use client";

import { useState, useEffect, useCallback, Suspense, CSSProperties } from "react";
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
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim().slice(0, 32);
    const p = password;
    if (!n || !p) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${serverUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, password: p }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Login failed"); return; }
      if (data.mustChangePassword) {
        // Redirect to change-password flow via a temporary session marker
        sessionStorage.setItem(SESSION_KEY + "_pending", JSON.stringify({ displayName: data.displayName, token: data.token, name: n }));
        window.location.hash = "#change-password";
        // Force re-render by setting a state — parent will pick it up
        setError("__must_change__");
        return;
      }
      const session: Session = { displayName: data.displayName, token: data.token };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      onAuth(session);
    } catch { setError("Cannot reach race server"); }
    finally { setLoading(false); }
  };

  if (error === "__must_change__") return null; // parent re-renders with ChangePasswordGate

  return (
    <div style={{
      position: "fixed", inset: 0, background: "radial-gradient(ellipse at center, #0a0d1c 0%, #03040a 70%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.6rem", zIndex: 100,
    }}>
      <Scanlines />
      <h1 className="glitch-title" data-text="TOKEN RACE" style={{ marginBottom: "0.4rem" }}>TOKEN RACE</h1>
      <div className="race-splash-sub">Enter your racer identity</div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", zIndex: 1 }}>
        <input
          autoFocus
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Racer name" maxLength={32}
          style={{ ...INPUT_STYLE }}
        />
        <input
          type="password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          style={{ ...INPUT_STYLE }}
        />
        {error && <div style={ERR_STYLE}>{error}</div>}
        <CyberBtn type="submit" disabled={!name.trim() || !password || loading}>
          {loading ? "…" : "Join Race →"}
        </CyberBtn>
      </form>
      <div className="race-splash-sub" style={{ opacity: 0.35, fontSize: "0.55rem" }}>
        New racer? Enter any name + password to register automatically.
      </div>
    </div>
  );
}

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
      .then((d) => { setMyTokens(d?.summary?.totalTokens ?? 0); setLastRefresh(Date.now()); })
      .catch(() => {});
  }, [buildQs]);

  const pollTick = useCallback((p: Period) => {
    fetch("/api/sync", { method: "POST" })
      .then((r) => r.json())
      .then((res) => { if (res?.synced > 0) fetchMyTokens(p); })
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

  // Race canvas
  return (
    <div className="fixed inset-0 bg-[#03040a]">
      {/* Period filter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-80 flex items-center gap-1 px-2 py-1 rounded-full bg-black/40 border border-white/10 backdrop-blur-md">
        {PERIODS.filter((p) => p.key !== "custom").map(({ key }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] transition-all cursor-pointer ${
              period === key ? "bg-white/15 text-white shadow-sm" : "text-white/35 hover:text-white/65 hover:bg-white/8"
            }`}
          >{key}</button>
        ))}
        {lastRefresh && (
          <span className="ml-1 pl-2 border-l border-white/10 text-[9px] text-white/20 font-mono uppercase tracking-widest">
            {new Date(lastRefresh).toLocaleTimeString()}
          </span>
        )}
        {/* Logout */}
        <button
          onClick={handleLogout}
          className="ml-1 pl-2 border-l border-white/10 text-[9px] text-white/20 hover:text-white/50 font-mono uppercase tracking-widest cursor-pointer transition-colors"
        >logout</button>
      </div>

      <MultiplayerRace
        serverUrl={RACE_SERVER_URL}
        playerName={session.displayName}
        playerToken={session.token}
        myTokens={myTokens}
        onExit={handleExit}
      />
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
