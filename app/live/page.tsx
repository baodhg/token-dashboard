"use client";

// ── /live — Spectator (projector) mode ────────────────────────────────────────
// A standalone, view-only big-screen for the room. Open this URL in a browser
// on the projector machine and it shows the live multiplayer race of everyone
// who has set up the race locally — with the full top-tier effects (galaxy,
// rockets, afterburner surges), identical to the competitive race screen.
//
// Crucially this machine is NOT a racer:
//   • no login / auth gate
//   • never calls /api/sync — it scans no local logs and reports no total
//   • no "me" highlight, no logout
// All player data is read client-side from the race server via GET /live.

import { useState, useEffect, useRef, CSSProperties } from "react";
import dynamic from "next/dynamic";
import { LeaderboardPanel, HistoryPanel } from "@/components/RaceStatsPanels";

const MultiplayerRace = dynamic(
  () => import("@/components/MultiplayerRace"),
  { ssr: false }
);

const RACE_SERVER_URL = process.env.NEXT_PUBLIC_RACE_SERVER_URL || "";
const INTRO_MS = 3_000;
const FALLBACK_MIN_MS = 1_000;

// ── Custom cursor ─────────────────────────────────────────────────────────────
// A glowing cyan dot + trailing ring that replaces the OS cursor while on the
// spectator screen. Position is pushed to CSS vars on the document root so the
// browser compositor moves it (cheap, no React re-render per mouse move). The
// ring grows when hovering buttons/links for affordance.
function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    const move = (e: MouseEvent) => {
      const x = `${e.clientX}px`;
      const y = `${e.clientY}px`;
      dot.style.setProperty("--cx", x);
      dot.style.setProperty("--cy", y);
      ring.style.setProperty("--cx", x);
      ring.style.setProperty("--cy", y);
      const interactive = !!(e.target as HTMLElement)?.closest("button, a, [role=button]");
      ring.classList.toggle("is-active", interactive);
    };
    const leave = () => {
      dot.style.setProperty("--cx", "-100px");
      ring.style.setProperty("--cx", "-100px");
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseout", leave);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseout", leave);
    };
  }, []);

  return (
    <>
      <div ref={ringRef} className="live-cursor-ring" />
      <div ref={dotRef} className="live-cursor-dot" />
    </>
  );
}

// ── Big projector title ───────────────────────────────────────────────────────
function LiveTitle() {
  return (
    <>
      <h1 className="glitch-title live-title" data-text="TIXIMAX TOKEN RACE">
        TIXIMAX TOKEN RACE
      </h1>
      <div className="live-title-sub">Live · Token Velocity · Spectator</div>
    </>
  );
}

// ── Cyberpunk splash ──────────────────────────────────────────────────────────
function RaceSplash({ fading }: { fading: boolean }) {
  return (
    <div className={`race-splash${fading ? " race-splash-fade" : ""}`}>
      <h1 className="glitch-title" data-text="TIXIMAX TOKEN RACE">TIXIMAX TOKEN RACE</h1>
      <div className="race-splash-sub">Spectator · Token Velocity · Live</div>
      <div className="race-splash-bar"><span /></div>
      <div className="race-splash-sub" style={{ opacity: 0.6 }}>Connecting to race server…</div>
    </div>
  );
}

function Scanlines() {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "repeating-linear-gradient(0deg, rgba(0,255,200,0.025) 0px, rgba(0,255,200,0.025) 1px, transparent 2px, transparent 4px)",
      pointerEvents: "none",
    }} />
  );
}

// ── Server not configured ─────────────────────────────────────────────────────
function NotConfigured() {
  const mono: CSSProperties = { fontFamily: "ui-monospace, monospace" };
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#03040a",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.2rem",
    }}>
      <p style={{ ...mono, fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center", maxWidth: 420, lineHeight: 1.6 }}>
        Race server not configured.<br />
        Set <code style={{ color: "#4affe0" }}>NEXT_PUBLIC_RACE_SERVER_URL</code> in your <code style={{ color: "#4affe0" }}>.env</code> file.
      </p>
    </div>
  );
}

// ── Tab pill (local copy — spectator screen is self-contained) ────────────────
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
        borderRadius: 14, padding: "4px 14px", transition: "all 0.2s",
        boxShadow: active ? "0 0 12px rgba(0,240,200,0.28)" : "none",
      }}
    >{label}</button>
  );
}

type Tab = "live" | "leaderboard" | "history";

// ── Main spectator content ────────────────────────────────────────────────────
function LiveContent() {
  const [tab, setTab] = useState<Tab>("live");

  // Intro splash — always visible for at least INTRO_MS, then a short fade.
  const [introReady, setIntroReady] = useState(false);
  const [introFading, setIntroFading] = useState(false);
  useEffect(() => {
    const fadeAt = setTimeout(() => setIntroFading(true), INTRO_MS - 500);
    const doneAt = setTimeout(() => setIntroReady(true), INTRO_MS);
    return () => { clearTimeout(fadeAt); clearTimeout(doneAt); };
  }, []);

  if (!RACE_SERVER_URL) return <NotConfigured />;

  if (!introReady) {
    return (
      <div className="fixed inset-0 bg-[#03040a]">
        <Scanlines />
        <RaceSplash fading={introFading} />
      </div>
    );
  }

  return (
    <div className="live-screen fixed inset-0 bg-[#03040a]" style={{ display: "flex", flexDirection: "column" }}>
      <CustomCursor />

      {/* Top stack: title + sub + tabs flow vertically so they never overlap. */}
      <div className="live-title-wrap">
        <LiveTitle />
        {/* Tab switcher — clickable (the wrap itself is pointer-events:none). */}
        <div style={{
          marginTop: "0.5rem", pointerEvents: "auto",
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 24, padding: "4px 8px", backdropFilter: "blur(10px)",
        }}>
          <TabBtn active={tab === "live"}        label="🚀 Live"     onClick={() => setTab("live")} />
          <TabBtn active={tab === "leaderboard"} label="🏆 All-Time" onClick={() => setTab("leaderboard")} />
          <TabBtn active={tab === "history"}     label="📈 History"  onClick={() => setTab("history")} />
        </div>
      </div>

      {/* Content */}
      {tab === "live" && (
        <MultiplayerRace
          serverUrl={RACE_SERVER_URL}
          playerName=""
          myTokens={0}
          spectator
          // No onExit: this is a standalone projector screen — Escape does nothing.
        />
      )}

      {tab !== "live" && (
        <div style={{
          flex: 1, overflowY: "auto", paddingTop: "clamp(7rem, 20vh, 9rem)",
          scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent",
        }}>
          {tab === "leaderboard" && <LeaderboardPanel serverUrl={RACE_SERVER_URL} />}
          {tab === "history" && <HistoryPanel serverUrl={RACE_SERVER_URL} myName="" />}
        </div>
      )}
    </div>
  );
}

// Guarantee at least FALLBACK_MIN_MS of splash so it never flashes sub-second.
export default function LivePage() {
  const [ready, setReady] = useState(false);
  const armed = useRef(false);
  useEffect(() => {
    if (armed.current) return;
    armed.current = true;
    const id = setTimeout(() => setReady(true), FALLBACK_MIN_MS);
    return () => clearTimeout(id);
  }, []);

  if (!ready) {
    return (
      <div className="fixed inset-0 bg-[#03040a]">
        <Scanlines />
        <RaceSplash fading={false} />
      </div>
    );
  }
  return <LiveContent />;
}
