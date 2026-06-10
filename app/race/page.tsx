"use client";

import { useState, useEffect, useCallback, Suspense, CSSProperties, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { LeaderboardPanel, HistoryPanel } from "@/components/RaceStatsPanels";
import SkinShopModal from "@/components/SkinShopModal";

const MultiplayerRace = dynamic(
  () => import("@/components/MultiplayerRace"),
  { ssr: false }
);

const RACE_SERVER_URL = process.env.NEXT_PUBLIC_RACE_SERVER_URL || "";
const POLL_MS = 10_000;
const INTRO_MS = 3_000;
const FALLBACK_MIN_MS = 1_000;
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

// ── Auth Gate: VIEW gate, locked to this machine's .env racer ─────────────────
function AuthGate({ serverUrl, machineName, onAuth }: {
  serverUrl: string; machineName: string; onAuth: (s: Session) => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const tryLogin = async (name: string, p: string) => {
    const res = await fetch(`${serverUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password: p }),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = machineName.trim();
    const p = password;
    if (!name || !p) return;
    setLoading(true); setError("");
    try {
      let { res, data } = await tryLogin(name, p);
      if (res.status === 404) {
        await new Promise((r) => setTimeout(r, 1500));
        ({ res, data } = await tryLogin(name, p));
      }
      if (!res.ok) {
        if (res.status === 404) setError(`Account "${name}" isn't ready yet — wait for a sync, then try again.`);
        else if (res.status === 401) setError("Incorrect password.");
        else setError(data.error || "Login failed");
        return;
      }
      if (data.mustChangePassword) {
        sessionStorage.setItem(SESSION_KEY + "_pending", JSON.stringify({ displayName: data.displayName, token: data.token, name }));
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

  return (
    <div style={{
      position: "fixed", inset: 0, background: "radial-gradient(ellipse at center, #0a0d1c 0%, #03040a 70%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.4rem", zIndex: 100,
    }}>
      <Scanlines />
      <h1 className="glitch-title" data-text="TOKEN RACE" style={{ marginBottom: "0.2rem" }}>TOKEN RACE</h1>
      <div className="race-splash-sub" style={{ marginBottom: "0.4rem" }}>Multiplayer · Token Velocity · Global</div>

      <div style={{ width: 280, zIndex: 1 }}>
        {machineName ? (
          <>
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              <input
                value={machineName}
                readOnly
                aria-label="Racer name (locked to this machine)"
                style={{
                  ...INPUT_STYLE, width: "100%", boxSizing: "border-box",
                  opacity: 0.55, cursor: "not-allowed",
                }}
              />
              <input
                autoFocus
                type="password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                style={{ ...INPUT_STYLE, width: "100%", boxSizing: "border-box" }}
              />
              {error && <div style={{ ...ERR_STYLE, width: "100%", boxSizing: "border-box" }}>{error}</div>}
              <CyberBtn type="submit" disabled={!password || loading}>
                {loading ? "…" : "Enter Race →"}
              </CyberBtn>
            </form>
            <p style={{
              fontFamily: "ui-monospace, monospace", fontSize: "0.6rem",
              color: "rgba(190,255,245,0.25)", textAlign: "center",
              marginTop: "1rem", lineHeight: 1.6,
            }}>
              This machine races as <strong style={{ color: "rgba(0,240,200,0.55)" }}>{machineName}</strong>.
              Enter its password to view the live race.
            </p>
          </>
        ) : (
          <p style={{
            fontFamily: "ui-monospace, monospace", fontSize: "0.7rem",
            color: "rgba(255,255,255,0.4)", textAlign: "center", lineHeight: 1.7,
          }}>
            This machine has no <code style={{ color: "#4affe0" }}>RACE_PLAYER_NAME</code> configured.<br />
            Set it in <code style={{ color: "#4affe0" }}>.env</code> to join the race.
          </p>
        )}
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

  const initialSource = searchParams.get("source") || "all";
  const spectator = searchParams.get("spectator") === "1";

  const [source] = useState(initialSource);
  const [myTokens, setMyTokens] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [machineName, setMachineName] = useState("");

  const [session, setSession] = useState<Session | null>(null);
  const [pendingChangePw, setPendingChangePw] = useState<{ name: string } | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [introReady, setIntroReady] = useState(false);
  const [introFading, setIntroFading] = useState(false);
  useEffect(() => {
    const fadeAt = setTimeout(() => setIntroFading(true), INTRO_MS - 500);
    const doneAt = setTimeout(() => setIntroReady(true), INTRO_MS);
    return () => { clearTimeout(fadeAt); clearTimeout(doneAt); };
  }, []);

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

  useEffect(() => {
    if (spectator) return;
    let alive = true;
    const pollDb = () => {
      fetch("/api/sync", { method: "POST" })
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          if (typeof d?.totalTokens === "number") {
            setMyTokens(d.totalTokens);
            setLastRefresh(Date.now());
          }
          if (typeof d?.playerName === "string") setMachineName(d.playerName);
        })
        .catch(() => {});
    };
    pollDb();
    const id = setInterval(pollDb, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [spectator]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (source !== "all") params.set("source", source);
    const qs = params.toString();
    router.replace(qs ? `/race?${qs}` : "/race", { scroll: false });
  }, [source, router]);

  const handleExit = useCallback(() => {
    const params = new URLSearchParams();
    if (source !== "all") params.set("source", source);
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  }, [source, router]);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  if (!RACE_SERVER_URL) return <NotConfigured onExit={handleExit} />;

  if (!introReady) {
    return (
      <div className="fixed inset-0 bg-[#03040a]">
        <RaceSplash fading={introFading} />
      </div>
    );
  }

  if (!authReady) return <div className="fixed inset-0 bg-[#03040a]" />;

  if (spectator) {
    return (
      <RaceShell
        session={{ displayName: "", token: "" }}
        serverUrl={RACE_SERVER_URL}
        myTokens={0}
        lastRefresh={lastRefresh}
        handleExit={handleExit}
        handleLogout={handleLogout}
        spectator
      />
    );
  }

  if (pendingChangePw) {
    return (
      <ChangePasswordGate
        serverUrl={RACE_SERVER_URL}
        pendingName={pendingChangePw.name}
        onDone={(s) => { setSession(s); setPendingChangePw(null); }}
      />
    );
  }

  if (!session) {
    return (
      <AuthGate
        serverUrl={RACE_SERVER_URL}
        machineName={machineName}
        onAuth={(s) => {
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
      machineName={machineName}
      myTokens={myTokens}
      lastRefresh={lastRefresh}
      handleExit={handleExit}
      handleLogout={handleLogout}
    />
  );
}


function ExitBtn({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "absolute", top: 14, left: 14, zIndex: 80,
        display: "inline-flex", alignItems: "center", gap: 6,
        fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700,
        letterSpacing: "0.08em",
        background: hover ? "rgba(0,255,200,0.1)" : "rgba(0,0,0,0.5)",
        border: `1px solid ${hover ? "rgba(0,255,200,0.4)" : "rgba(255,255,255,0.12)"}`,
        color: hover ? "#4affe0" : "rgba(255,255,255,0.4)",
        borderRadius: 20, padding: "5px 14px", cursor: "pointer",
        backdropFilter: "blur(6px)",
        boxShadow: hover ? "0 0 12px rgba(0,240,200,0.25)" : "none",
        transition: "all 0.2s",
      }}
    >
      <span style={{ display: "inline-block", transform: hover ? "translateX(-2px)" : "none", transition: "transform 0.2s" }}>←</span>
      Exit
    </button>
  );
}

function TabBtn({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const on = active || hover;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
        background: active ? "rgba(0,255,200,0.14)" : hover ? "rgba(0,255,200,0.06)" : "transparent",
        border: `1px solid ${active ? "rgba(0,255,200,0.45)" : hover ? "rgba(0,255,200,0.25)" : "rgba(255,255,255,0.08)"}`,
        color: on ? "#4affe0" : "rgba(255,255,255,0.3)",
        borderRadius: 14, padding: "4px 14px", cursor: "pointer", transition: "all 0.2s",
        boxShadow: active ? "0 0 12px rgba(0,240,200,0.28)" : "none",
      }}
    >{label}</button>
  );
}

function LogoutBtn({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arm = () => {
    setConfirming(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setConfirming(false), 3500);
  };
  const cancel = () => {
    setConfirming(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  };
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const mono: CSSProperties = {
    fontFamily: "ui-monospace, monospace", fontSize: 10, fontWeight: 700,
    letterSpacing: "0.12em", textTransform: "uppercase",
  };

  if (confirming) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span style={{ ...mono, fontSize: 9, color: "rgba(255,123,149,0.85)", paddingLeft: 2 }}>Sure?</span>
        <button
          onClick={onClick}
          title="Confirm logout"
          style={{
            ...mono, color: "#ff7b95",
            background: "rgba(255,60,90,0.18)", border: "1px solid rgba(255,80,110,0.6)",
            borderRadius: 12, padding: "4px 10px", cursor: "pointer",
            boxShadow: "0 0 12px rgba(255,60,90,0.35)", transition: "all 0.2s",
          }}
        >Yes</button>
        <button
          onClick={cancel}
          title="Cancel"
          style={{
            ...mono, color: "rgba(255,255,255,0.45)",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12, padding: "4px 10px", cursor: "pointer", transition: "all 0.2s",
          }}
        >No</button>
      </span>
    );
  }

  return (
    <button
      onClick={arm}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Log out"
      style={{
        ...mono,
        display: "inline-flex", alignItems: "center", gap: 5,
        background: hover ? "rgba(255,60,90,0.14)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${hover ? "rgba(255,80,110,0.55)" : "rgba(255,255,255,0.08)"}`,
        color: hover ? "#ff7b95" : "rgba(255,255,255,0.32)",
        borderRadius: 14, padding: "4px 12px", cursor: "pointer",
        boxShadow: hover ? "0 0 12px rgba(255,60,90,0.3)" : "none",
        transition: "all 0.2s",
      }}
    >
      <span style={{ fontSize: 11, lineHeight: 1 }}>⏻</span>
      logout
    </button>
  );
}

type Tab = "live" | "leaderboard" | "history";

function RaceShell({ session, serverUrl, machineName = "", myTokens, lastRefresh, handleExit, handleLogout, spectator = false }: {
  session: Session;
  serverUrl: string;
  machineName?: string;
  myTokens: number;
  lastRefresh: number | null;
  handleExit: () => void;
  handleLogout: () => void;
  spectator?: boolean;
}) {
  const meName = machineName || session.displayName;
  const [tab, setTab] = useState<Tab>("live");
  const [shopOpen, setShopOpen] = useState(false);
  const mono: CSSProperties = { fontFamily: "ui-monospace, monospace" };


  return (
    <div className="fixed inset-0 bg-[#03040a]" style={{ display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{
        position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
        zIndex: 80, display: "flex", alignItems: "center", gap: 6,
        background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 24, padding: "4px 8px", backdropFilter: "blur(10px)",
      }}>
        <TabBtn active={tab === "live"}        label="🚀 Live"     onClick={() => setTab("live")} />
        <TabBtn active={tab === "leaderboard"} label="🏆 All-Time" onClick={() => setTab("leaderboard")} />
        <TabBtn active={tab === "history"}     label="📈 History"  onClick={() => setTab("history")} />
        <span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.1)" }} />
        <button
          onClick={() => setShopOpen(true)}
          style={{
            fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 900,
            background: "linear-gradient(45deg, #ffd700, #ff8c00)",
            border: "none", color: "#000", borderRadius: 12, padding: "4px 12px",
            cursor: "pointer", boxShadow: "0 0 10px rgba(255,215,0,0.3)",
            display: "flex", alignItems: "center", gap: 4
          }}
        >
          <span style={{ fontSize: 13 }}>🛒</span> SHOP
        </button>
        {lastRefresh && tab === "live" && (
          <span style={{ ...mono, fontSize: 9, color: "rgba(255,255,255,0.18)", paddingLeft: 4 }}>
            {new Date(lastRefresh).toLocaleTimeString()}
          </span>
        )}
        {!spectator && (
          <>
            <span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.1)" }} />
            <LogoutBtn onClick={handleLogout} />
          </>
        )}
      </div>

      <SkinShopModal
        isOpen={shopOpen}
        onClose={() => setShopOpen(false)}
        playerName={meName}
        serverUrl={serverUrl}
        token={session.token}
      />

      <ExitBtn onClick={handleExit} />

      {tab === "live" && (
        <MultiplayerRace
          serverUrl={serverUrl}
          playerName={meName}
          myTokens={myTokens}
          onExit={handleExit}
          spectator={spectator}
        />
      )}

      {tab !== "live" && (
        <div style={{
          flex: 1, overflowY: "auto", paddingTop: "4.5rem",
          scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent",
        }}>
          {tab === "leaderboard" && <LeaderboardPanel serverUrl={serverUrl} />}
          {tab === "history" && <HistoryPanel serverUrl={serverUrl} myName={meName} />}
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
