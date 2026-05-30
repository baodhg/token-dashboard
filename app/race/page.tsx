"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { PERIODS, type Period } from "@/lib/mock-data";

const ModelRace = dynamic<{ data: { model: string; totalTokens: number }[]; onExit?: () => void }>(
  () => import("@/components/ModelRace"),
  { ssr: false }
);

interface ModelStat {
  model: string;
  totalTokens: number;
}

const POLL_MS = 30_000;

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

  const buildQs = useCallback((p: Period) => {
    const qs = new URLSearchParams({ period: p });
    if (source !== "all") qs.set("source", source);
    return qs.toString();
  }, [source]);

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

  // Fetch on period change, sync URL
  useEffect(() => {
    setModels(null);
    fetchModels(period);
    const params = new URLSearchParams({ period });
    if (source !== "all") params.set("source", source);
    router.replace(`/race?${params.toString()}`, { scroll: false });
  }, [period, source, fetchModels, router]);

  // Poll every 30s
  useEffect(() => {
    const id = setInterval(() => fetchModels(period), POLL_MS);
    return () => clearInterval(id);
  }, [period, fetchModels]);

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

  if (models === null) {
    return (
      <div className="fixed inset-0 bg-[#03040a] flex items-center justify-center">
        <span className="text-[11px] font-black uppercase tracking-[0.34em] text-white/25 animate-pulse">
          Preparing launch sequence…
        </span>
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

export default function RacePage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 bg-[#03040a] flex items-center justify-center">
          <span className="text-[11px] font-black uppercase tracking-[0.34em] text-white/25 animate-pulse">
            Preparing launch sequence…
          </span>
        </div>
      }
    >
      <RaceContent />
    </Suspense>
  );
}
