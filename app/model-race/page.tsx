"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { PERIODS, type Period } from "@/lib/mock-data";

const ModelRace = dynamic<{ data: { model: string; totalTokens: number; source?: string }[]; onExit?: () => void }>(
  () => import("@/components/ModelRace"),
  { ssr: false }
);

interface ModelStat {
  model: string;
  totalTokens: number;
  source?: string;
}

const POLL_MS = 10_000;
const INTRO_MS = 3_000;
const FALLBACK_MIN_MS = 1_000;
const RELOAD_MIN_MS = 500;

/** Cyberpunk glitch intro splash — always shown for at least INTRO_MS. */
function RaceSplash({ fading }: { fading: boolean }) {
  return (
    <div className={`race-splash${fading ? " race-splash-fade" : ""}`}>
      <h1 className="glitch-title" data-text="TOKEN DASHBOARD">
        TOKEN DASHBOARD
      </h1>
      <div className="race-splash-sub">Initializing Model Race · Token Velocity</div>
      <div className="race-splash-bar">
        <span />
      </div>
      <div className="race-splash-sub" style={{ opacity: 0.6 }}>
        Preparing launch sequence…
      </div>
    </div>
  );
}

function RaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialPeriod = (searchParams.get("period") as Period) || "1d";
  const initialSource = searchParams.get("source") || "all";

  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [source] = useState(initialSource);
  const [models, setModels] = useState<ModelStat[] | null>(null);
  const [error, setError] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);

  // Intro splash: always visible for at least INTRO_MS on first entry, then a
  // short fade. Runs once on mount regardless of how fast the data loads.
  const [introReady, setIntroReady] = useState(false);
  const [introFading, setIntroFading] = useState(false);
  useEffect(() => {
    const fadeAt = setTimeout(() => setIntroFading(true), INTRO_MS - 500);
    const doneAt = setTimeout(() => setIntroReady(true), INTRO_MS);
    return () => { clearTimeout(fadeAt); clearTimeout(doneAt); };
  }, []);

  // Reload gate: on every period change, keep the splash up for at least
  // RELOAD_MIN_MS so quick filter switches don't just flash.
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

  // Initial / period-change fetch: pulls fresh stats (does NOT sync).
  const fetchModels = useCallback((p: Period) => {
    fetch(`/api/token-stats?${buildQs(p)}`)
      .then((r) => r.json())
      .then((d) => {
        setModels(d?.modelStats ?? []);
        setLastRefresh(Date.now());
        setError(false);
      })
      .catch(() => setError(true));
  }, [buildQs]);

  // Live race tick: sync first (writes new tokens into the DB), and only when
  // something actually changed re-fetch + push the new totals into the engine.
  // Crucially this NEVER sets models to null, so the cars push up smoothly
  // instead of the whole scene reloading / flashing the splash.
  const pollTick = useCallback((p: Period) => {
    fetch("/api/sync", { method: "POST" })
      .then((r) => r.json())
      .then((res) => {
        if (res?.synced > 0) {
          fetch(`/api/token-stats?${buildQs(p)}`)
            .then((r) => r.json())
            .then((d) => {
              setModels(d?.modelStats ?? []);
              setLastRefresh(Date.now());
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [buildQs]);

  // Fetch on period change, sync URL
  useEffect(() => {
    setModels(null);
    fetchModels(period);
    const params = new URLSearchParams({ period });
    if (source !== "all") params.set("source", source);
    router.replace(`/model-race?${params.toString()}`, { scroll: false });
  }, [period, source, fetchModels, router]);

  // Live polling — sync + conditional refetch, no reload/flash
  useEffect(() => {
    const id = setInterval(() => pollTick(period), POLL_MS);
    return () => clearInterval(id);
  }, [period, pollTick]);

  // Return to dashboard preserving period + source filters
  const handleExit = useCallback(() => {
    const params = new URLSearchParams({ period });
    if (source !== "all") params.set("source", source);
    router.push(`/?${params.toString()}`);
  }, [period, source, router]);

  if (error) {
    return (
      <div className="fixed inset-0 bg-[#03040a] flex flex-col items-center justify-center gap-4">
        <p className="text-white/50 text-sm font-mono">Failed to load stats</p>
        <button
          onClick={handleExit}
          className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 text-xs font-bold border border-white/15 transition-all cursor-pointer"
        >
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  // Show the glitch splash until: the 3s first-entry intro has elapsed, the
  // per-filter 0.5s reload gate has elapsed, AND data is ready.
  if (!introReady || !reloadReady || models === null) {
    return (
      <div className="fixed inset-0 bg-[#03040a]">
        <RaceSplash fading={introFading && models !== null} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#03040a]">
      {/* Period filter — floats top-center */}
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
        {source !== "all" && (
          <span className="ml-1 pl-2 border-l border-white/10 text-[9px] text-white/30 font-mono uppercase tracking-widest">
            {source.replace("_", " ")}
          </span>
        )}
        {lastRefresh && (
          <span className="ml-1 pl-2 border-l border-white/10 text-[9px] text-white/20 font-mono uppercase tracking-widest">
            {new Date(lastRefresh).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Race canvas */}
      <ModelRace
        key={period}
        data={models}
        onExit={handleExit}
      />
    </div>
  );
}

/**
 * Guarantees the splash is shown for at least FALLBACK_MIN_MS even if Suspense
 * resolves instantly — avoids a jarring sub-second flash before RaceContent
 * (which then runs its own longer intro) takes over.
 */
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

export default function RacePage() {
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
