"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Zap, ArrowDownLeft, ArrowUpRight, DollarSign,
  RefreshCw, Database, Clock, FolderOpen, Sun, Moon,
} from "lucide-react";
import { PERIODS, type Period, type DataPoint } from "@/lib/mock-data";
import type { ModelStat } from "@/components/ModelChart";

const TokenChart = dynamic<{ data: DataPoint[]; period: Period }>(
  () => import("@/components/TokenChart"), { ssr: false }
);
const CacheChart = dynamic<{ data: DataPoint[]; period: Period }>(
  () => import("@/components/CacheChart"), { ssr: false }
);
const ModelChart = dynamic<{ data: ModelStat[] }>(
  () => import("@/components/ModelChart"), { ssr: false }
);

/* ─── helpers ─────────────────────────────────────────── */

function formatK(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

/* ─── types ────────────────────────────────────────────── */

type Source = "all" | "claude_code" | "cline" | "codex" | "gemini";

interface Summary {
  total: number; totalInput: number; totalOutput: number;
  totalCache: number; totalCost: number; callCount: number;
}
interface SessionStat {
  sessionId: string | null; project: string; source: string; startTime: string;
  callCount: number; totalInput: number; totalOutput: number;
  totalCache: number; totalCost: number;
}
interface PlatformStat {
  source: string; label: string;
  callCount: number; totalInput: number; totalOutput: number;
  totalCache: number; totalCost: number; totalTokens: number;
}
interface ApiData {
  chartData:     DataPoint[];
  summary:       Summary;
  sessionStats:  SessionStat[];
  modelStats:    ModelStat[];
  platformStats: PlatformStat[];
}

const EMPTY_SUMMARY: Summary = {
  total: 0, totalInput: 0, totalOutput: 0,
  totalCache: 0, totalCost: 0, callCount: 0,
};

const SOURCE_LABELS: Record<Source, string> = {
  all:          "Tất cả",
  claude_code:  "Claude Code",
  cline:        "Cline",
  codex:        "Codex",
  gemini:       "Gemini CLI",
};

const SOURCE_COLORS: Record<string, string> = {
  claude_code: "#6366f1",
  cline:       "#06b6d4",
  codex:       "#f59e0b",
  gemini:      "#22d3ee",
};

/* ─── stat card ────────────────────────────────────────── */

function StatCard({
  label, value, sub, icon: Icon, iconBg, iconColor, loading,
}: {
  label: string; value: string; sub: string;
  icon: React.ElementType; iconBg: string; iconColor: string; loading: boolean;
}) {
  return (
    <div className="bg-card rounded-2xl p-5 border border-border shadow-sm flex flex-col gap-3">
      <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <div>
        <p className="text-[10px] font-semibold text-[#8e8e93] dark:text-[#98989d] uppercase tracking-widest mb-1">{label}</p>
        <p className={`font-numeric text-[26px] font-bold text-foreground leading-none tracking-tight ${loading ? "opacity-30" : ""}`}>
          {loading ? "···" : value}
        </p>
        <p className="text-[11px] text-[#aeaeb2] dark:text-[#6e6e72] mt-1.5">{sub}</p>
      </div>
    </div>
  );
}

/* ─── section header ───────────────────────────────────── */

function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="font-semibold text-[14px] text-foreground tracking-tight">{title}</h2>
      {right}
    </div>
  );
}

/* ─── platform badge ───────────────────────────────────── */

function SourceBadge({ source }: { source: string }) {
  const color = SOURCE_COLORS[source] ?? "#8e8e93";
  const label = source === "claude_code" ? "Claude" : source === "cline" ? "Cline" : source === "codex" ? "Codex" : source === "gemini" ? "Gemini" : source;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: `${color}18`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/* ─── platform overview cards ──────────────────────────── */

function PlatformCards({ platforms, total, loading }: {
  platforms: PlatformStat[]; total: number; loading: boolean;
}) {
  if (loading) return null;
  if (platforms.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {platforms.map(p => {
        const color = SOURCE_COLORS[p.source] ?? "#8e8e93";
        const pct = total > 0 ? Math.round((p.totalTokens / total) * 100) : 0;
        const barWidth = total > 0 ? (p.totalTokens / total) * 100 : 0;
        return (
          <div key={p.source} className="bg-muted/50 rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-foreground">{p.label}</span>
              <span className="font-numeric text-[11px] text-[#8e8e93] dark:text-[#98989d]">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${barWidth}%`, background: color }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#8e8e93] dark:text-[#98989d]">
              <span className="font-numeric">{formatK(p.totalTokens)} tokens</span>
              <span className="font-numeric text-emerald-600 dark:text-emerald-400 font-semibold">${p.totalCost.toFixed(4)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── page ─────────────────────────────────────────────── */

export default function DashboardPage() {
  const [period, setPeriod]       = useState<Period>("1w");
  const [source, setSource]       = useState<Source>("all");
  const [data, setData]           = useState<ApiData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [syncing, setSyncing]     = useState(false);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [theme, setTheme]         = useState<"light" | "dark">("light");

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem("theme", next); } catch {}
  };

  const fetchStats = (p: Period, s: Source) => {
    setLoading(true);
    const qs = new URLSearchParams({ period: p, ...(s !== "all" ? { source: s } : {}) });
    fetch(`/api/token-stats?${qs}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  const handleSync = () => {
    setSyncing(true);
    fetch("/api/sync", { method: "POST" })
      .then(() => { setLastSynced(Date.now()); fetchStats(period, source); })
      .finally(() => setSyncing(false));
  };

  useEffect(() => { fetchStats(period, source); }, [period, source]);

  // Smart Polling
  useEffect(() => {
    const interval = setInterval(() => {
      fetch("/api/sync", { method: "POST" })
        .then(r => r.json())
        .then(res => {
          if (res.synced > 0) {
            setLastSynced(Date.now());
            // Fetch silently without setting global loading state
            const qs = new URLSearchParams({ period, ...(source !== "all" ? { source } : {}) });
            fetch(`/api/token-stats?${qs}`)
              .then(r => r.json())
              .then(setData)
              .catch(() => {});
          }
        })
        .catch(() => {});
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [period, source]);

  const summary      = data?.summary      ?? EMPTY_SUMMARY;
  const chartData    = data?.chartData    ?? [];
  const sessionStats = data?.sessionStats ?? [];
  const modelStats   = data?.modelStats   ?? [];
  const platformStats = data?.platformStats ?? [];

  const pct = (n: number) =>
    summary.total > 0 ? `${((n / summary.total) * 100).toFixed(0)}%` : "—";

  const statCards = [
    {
      label: "Tổng tokens",
      value: formatK(summary.total),
      sub:   `${summary.callCount.toLocaleString()} lượt gọi`,
      icon: Zap,
      iconBg: "bg-indigo-50 dark:bg-indigo-500/15",
      iconColor: "text-indigo-600 dark:text-indigo-400",
    },
    {
      label: "Input tokens",
      value: formatK(summary.totalInput),
      sub:   `${pct(summary.totalInput)} tổng`,
      icon: ArrowDownLeft,
      iconBg: "bg-purple-50 dark:bg-purple-500/15",
      iconColor: "text-purple-600 dark:text-purple-400",
    },
    {
      label: "Output tokens",
      value: formatK(summary.totalOutput),
      sub:   `${pct(summary.totalOutput)} tổng`,
      icon: ArrowUpRight,
      iconBg: "bg-violet-50 dark:bg-violet-500/15",
      iconColor: "text-violet-600 dark:text-violet-400",
    },
    {
      label: "Chi phí ước tính",
      value: `$${summary.totalCost.toFixed(4)}`,
      sub:   "Giá tham khảo",
      icon: DollarSign,
      iconBg: "bg-emerald-50 dark:bg-emerald-500/15",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
  ];

  const chartEmpty = chartData.every(d => d.input === 0 && d.output === 0);

  return (
    <div className="min-h-screen bg-background">

      {/* ── Header ── */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-4">

          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Database className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-[15px] text-foreground">Token Dashboard</span>
          </div>

          {/* Period pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all cursor-pointer ${
                  period === key
                    ? "bg-foreground text-background shadow-sm"
                    : "text-[#3c3c43] dark:text-[#c7c7cc] hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Right cluster: theme toggle + sync */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="w-8 h-8 rounded-full bg-muted hover:bg-muted/70 flex items-center justify-center text-[#3c3c43] dark:text-[#c7c7cc] transition-colors cursor-pointer"
            >
              {theme === "dark"
                ? <Sun className="w-3.5 h-3.5" />
                : <Moon className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 h-8 rounded-full bg-muted hover:bg-muted/70 text-[12px] font-medium text-[#3c3c43] dark:text-[#c7c7cc] transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing
                ? "Đang sync…"
                : lastSynced
                  ? new Date(lastSynced).toLocaleTimeString("vi-VN")
                  : "Sync"}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* Source filter */}
        <div className="flex items-center gap-2">
          {(["all", "claude_code", "cline", "codex", "gemini"] as Source[]).map(s => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all cursor-pointer border ${
                source === s
                  ? "bg-foreground text-background border-foreground shadow-sm"
                  : "border-border text-[#3c3c43] dark:text-[#c7c7cc] hover:bg-muted"
              }`}
            >
              {s !== "all" && (
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: source === s ? "currentColor" : SOURCE_COLORS[s] }}
                />
              )}
              {SOURCE_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Row 1: Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(s => (
            <StatCard key={s.label} {...s} loading={loading} />
          ))}
        </div>

        {/* Platform breakdown (only when "all" selected and has multi-source data) */}
        {source === "all" && platformStats.length > 1 && (
          <div className="bg-card rounded-2xl p-5 border border-border shadow-sm">
            <SectionHeader title="Platforms" />
            <PlatformCards
              platforms={platformStats}
              total={platformStats.reduce((s, p) => s + p.totalTokens, 0)}
              loading={loading}
            />
          </div>
        )}

        {/* Row 2: Input / Output line chart */}
        <div className="bg-card rounded-2xl p-5 border border-border shadow-sm">
          <SectionHeader title="Input / Output" />
          {loading ? (
            <div className="h-64 flex items-center justify-center text-[#aeaeb2] dark:text-[#6e6e72] text-sm">Đang tải…</div>
          ) : chartEmpty ? (
            <div className="h-64 flex items-center justify-center text-[#aeaeb2] dark:text-[#6e6e72] text-sm">Không có dữ liệu</div>
          ) : (
            <TokenChart data={chartData} period={period} />
          )}
        </div>

        {/* Row 3: Cache read bar chart + Tokens theo model */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 bg-card rounded-2xl p-5 border border-border shadow-sm">
            <SectionHeader title="Cache read" />
            <div className="h-52">
              {loading ? (
                <div className="h-full flex items-center justify-center text-[#aeaeb2] dark:text-[#6e6e72] text-sm">Đang tải…</div>
              ) : chartEmpty ? (
                <div className="h-full flex items-center justify-center text-[#aeaeb2] dark:text-[#6e6e72] text-sm">Không có dữ liệu</div>
              ) : (
                <CacheChart data={chartData} period={period} />
              )}
            </div>
          </div>

          <div className="lg:col-span-2 bg-card rounded-2xl p-5 border border-border shadow-sm">
            <SectionHeader title="Tokens theo model" />
            <div className="h-52">
              {loading ? (
                <div className="h-full flex items-center justify-center text-[#aeaeb2] dark:text-[#6e6e72] text-sm">Đang tải…</div>
              ) : (
                <ModelChart data={modelStats} />
              )}
            </div>
          </div>
        </div>

        {/* Row 4: Sessions table */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <SectionHeader
              title="Sessions gần nhất"
              right={<span className="text-[11px] text-[#aeaeb2] dark:text-[#6e6e72]">{sessionStats.length} sessions</span>}
            />
          </div>

          {sessionStats.length === 0 && !loading ? (
            <div className="py-12 text-center text-[13px] text-[#aeaeb2] dark:text-[#6e6e72]">Không có dữ liệu</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border">
                    {[
                      { label: "Platform", icon: null      },
                      { label: "Dự án",   icon: FolderOpen },
                      { label: "Bắt đầu", icon: Clock      },
                      { label: "Calls",   icon: null       },
                      { label: "Tokens",  icon: null       },
                      { label: "Chi phí", icon: null       },
                    ].map(({ label, icon: Icon }) => (
                      <th key={label} className="text-left px-4 py-2.5 text-[10px] font-semibold text-[#aeaeb2] dark:text-[#6e6e72] uppercase tracking-wide whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          {Icon && <Icon className="w-3 h-3" />}
                          {label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessionStats.map((s, i) => (
                    <tr
                      key={s.sessionId ?? i}
                      className={`hover:bg-muted/50 transition-colors ${
                        i < sessionStats.length - 1 ? "border-b border-border" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <SourceBadge source={s.source} />
                      </td>
                      <td className="px-4 py-2.5 max-w-35">
                        <span className="block truncate font-medium text-foreground" title={s.project}>
                          {s.project}
                        </span>
                      </td>
                      <td className="font-numeric px-4 py-2.5 text-[#8e8e93] dark:text-[#98989d] whitespace-nowrap">
                        {fmtTime(s.startTime)}
                      </td>
                      <td className="font-numeric px-4 py-2.5 text-[#3c3c43] dark:text-[#c7c7cc]">
                        {s.callCount.toLocaleString()}
                      </td>
                      <td className="font-numeric px-4 py-2.5 text-foreground font-medium">
                        {formatK(s.totalInput + s.totalOutput)}
                      </td>
                      <td className="font-numeric px-4 py-2.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                        ${s.totalCost.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
