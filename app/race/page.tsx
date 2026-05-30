"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
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

// ── Cyberpunk splash (same as model-race) ────────────────────────────────────
function RaceSplash({ fading, subtitle }: { fading: boolean; subtitle?: string }) {
  return (
    <div className={`race-splash${fading ? " race-splash-fade" : ""}`}>
      <h1 className="glitch-title" data-text="TOKEN RACE">
        TOKEN RACE
      </h1>
      <div className="race-splash-sub">{subtitle ?? "Multiplayer · Token Velocity · Global"}</div>
      <div className="race-splash-bar"><span /></div>
      <div className="race-splash-sub" style={{ opacity: 0.6 }}>
        Connecting to race server…
      </div>
    </div>
  );
}

// ── Name input overlay ────────────────────────────────────────────────────────
function NameGate({ onJoin }: { onJoin: (name: string) => void }) {
  const [value, setValue] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim().slice(0, 32);
    if (!trimmed) return;
    onJoin(trimmed);
  };
  return (
    <div style={{
      position: "fixed", inset: 0, background: "radial-gradient(ellipse at center, #0a0d1c 0%, #03040a 70%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.8rem",
      zIndex: 100,
    }}>
      {/* Moving scanlines */}
      <div style={{
        position: "absolute", inset: 0,
        background: "repeating-linear-gradient(0deg, rgba(0,255,200,0.03) 0px, rgba(0,255,200,0.03) 1px, transparent 2px, transparent 4px)",
        pointerEvents: "none",
      }} />
      <h1 className="glitch-title" data-text="TOKEN RACE" style={{ marginBottom: "0.5rem" }}>
        TOKEN RACE
      </h1>
      <div className="race-splash-sub">Multiplayer · Token Velocity · Global</div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.9rem", zIndex: 1 }}>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter your racer name"
          maxLength={32}
          style={{
            background: "rgba(0,255,200,0.06)", border: "1px solid rgba(0,255,200,0.3)",
            borderRadius: 8, padding: "10px 18px",
            fontFamily: "ui-monospace, monospace", fontSize: 15, fontWeight: 700,
            color: "#eafffb", outline: "none", textAlign: "center",
            width: 260,
            boxShadow: "0 0 12px rgba(0,240,200,0.15)",
          }}
        />
        <button
          type="submit"
          disabled={!value.trim()}
          style={{
            background: value.trim() ? "rgba(0,255,200,0.12)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${value.trim() ? "rgba(0,255,200,0.5)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 24, padding: "8px 32px",
            fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 900,
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: value.trim() ? "#4affe0" : "rgba(255,255,255,0.2)",
            cursor: value.trim() ? "pointer" : "not-allowed",
            transition: "all 0.2s",
          }}
        >
          Join Race →
        </button>
      </form>
      <div className="race-splash-sub" style={{ opacity: 0.4, fontSize: "0.55rem" }}>
        Your total tokens from all AI tools will be your score
      </div>
    </div>
  );
}

// ── Server not configured notice ─────────────────────────────────────────────
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
      <button
        onClick={onExit}
        style={{
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 20, padding: "6px 18px",
          fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 700,
          color: "rgba(255,255,255,0.55)", cursor: "pointer",
        }}
      >
        ← Back
      </button>
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
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);

  // Intro splash gates (same as model-race)
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

  const buildQs = useCallback((p: Period) => {
    const qs = new URLSearchParams({ period: p });
    if (source !== "all") qs.set("source", source);
    return qs.toString();
  }, [source]);

  // Fetch MY total tokens from local DB
  const fetchMyTokens = useCallback((p: Period) => {
    fetch(`/api/token-stats?${buildQs(p)}`)
      .then((r) => r.json())
      .then((d) => {
        const total = d?.summary?.totalTokens ?? 0;
        setMyTokens(total);
        setLastRefresh(Date.now());
      })
      .catch(() => {});
  }, [buildQs]);

  // Polling: sync local data, then update my score
  const pollTick = useCallback((p: Period) => {
    fetch("/api/sync", { method: "POST" })
      .then((r) => r.json())
      .then((res) => {
        if (res?.synced > 0) fetchMyTokens(p);
      })
      .catch(() => {});
  }, [fetchMyTokens]);

  // Fetch on period change
  useEffect(() => {
    fetchMyTokens(period);
    const params = new URLSearchParams({ period });
    if (source !== "all") params.set("source", source);
    router.replace(`/race?${params.toString()}`, { scroll: false });
  }, [period, source, fetchMyTokens, router]);

  // Live polling
  useEffect(() => {
    const id = setInterval(() => pollTick(period), POLL_MS);
    return () => clearInterval(id);
  }, [period, pollTick]);

  const handleExit = useCallback(() => {
    const params = new URLSearchParams({ period });
    if (source !== "all") params.set("source", source);
    router.push(`/?${params.toString()}`);
  }, [period, source, router]);

  // Server not configured
  if (!RACE_SERVER_URL) return <NotConfigured onExit={handleExit} />;

  // Show splash until intro + reload gates pass
  if (!introReady || !reloadReady) {
    return (
      <div className="fixed inset-0 bg-[#03040a]">
        <RaceSplash fading={introFading} />
      </div>
    );
  }

  // Name gate — pick display name before joining
  if (!playerName) {
    return <NameGate onJoin={(name) => setPlayerName(name)} />;
  }

  return (
    <div className="fixed inset-0 bg-[#03040a]">
      {/* Period filter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-80 flex items-center gap-1 px-2 py-1 rounded-full bg-black/40 border border-white/10 backdrop-blur-md">
        {PERIODS.filter((p) => p.key !== "custom").map(({ key }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] transition-all cursor-pointer ${
              period === key
                ? "bg-white/15 text-white shadow-sm"
                : "text-white/35 hover:text-white/65 hover:bg-white/8"
            }`}
          >
            {key}
          </button>
        ))}
        {lastRefresh && (
          <span className="ml-1 pl-2 border-l border-white/10 text-[9px] text-white/20 font-mono uppercase tracking-widest">
            {new Date(lastRefresh).toLocaleTimeString()}
          </span>
        )}
      </div>

      <MultiplayerRace
        serverUrl={RACE_SERVER_URL}
        playerName={playerName}
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
  if (!ready) {
    return (
      <div className="fixed inset-0 bg-[#03040a]">
        <RaceSplash fading={false} />
      </div>
    );
  }
  return <RaceContent />;
}

export default function MultiplayerRacePage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 bg-[#03040a]">
          <RaceSplash fading={false} />
        </div>
      }
    >
      <MinSplashGate />
    </Suspense>
  );
}
