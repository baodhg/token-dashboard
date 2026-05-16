"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Zap, ArrowDownLeft, ArrowUpRight, DollarSign,
  RefreshCw, Database, Clock, FolderOpen, Sun, Moon, Laptop,
  ChevronUp, ChevronDown, Search
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
interface ProjectStat {
  project: string;
  sources: string[];
  startTime: string;
  endTime: string;
  callCount: number;
  totalInput: number;
  totalOutput: number;
  totalCache: number;
  totalCost: number;
}
interface ApiData {
  chartData:     DataPoint[];
  summary:       Summary;
  sessionStats:  SessionStat[];
  projectStats:  ProjectStat[];
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

import Image from "next/image";

/* ─── platform badge ───────────────────────────────────── */

function SourceBadge({ source }: { source: string }) {
  const color = SOURCE_COLORS[source] ?? "#8e8e93";
  const label = source === "claude_code" ? "Claude" : source === "cline" ? "Cline" : source === "codex" ? "Codex" : source === "gemini" ? "Gemini" : source;
  
  let iconSrc = null;
  if (source === "gemini") iconSrc = "/gemini.svg";
  else if (source === "claude_code") iconSrc = "/claude.svg";
  else if (source === "cline") iconSrc = "/cline.svg";
  else if (source === "codex") iconSrc = "/codex.svg";

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
      style={{ background: `${color}10`, color, borderColor: `${color}30` }}
    >
      {iconSrc ? (
        <Image src={iconSrc} alt={label} width={10} height={10} style={{ color }} className="opacity-90" />
      ) : (
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      )}
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

/* ─── agent logo ───────────────────────────────────────── */

function AgentLogo() {
  return (
    <div className="relative w-7 h-7 flex items-center justify-center shrink-0">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-linear-to-br from-indigo-500 to-purple-600 rounded-lg shadow-sm" />
      
      {/* Custom SVG Agent Icon */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-4 h-4 relative z-10 text-white"
      >
        {/* The Outer Frame (Terminal-like) */}
        <path
          d="M4 6C4 4.89543 4.89543 4 6 4H18C19.1046 4 20 4.89543 20 6V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V6Z"
          stroke="currentColor"
          strokeWidth="1.5"
          className="opacity-40"
        />
        {/* The Prompt Symbol */}
        <path
          d="M8 9L10 11L8 13"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* The Pulsing Core (The "Eye" of the Agent) */}
        <circle
          cx="15"
          cy="12"
          r="2.5"
          fill="currentColor"
          className="animate-pulse"
        />
        {/* Orbital dots */}
        <circle cx="15" cy="7" r="1" fill="currentColor" className="opacity-60" />
        <circle cx="19" cy="12" r="1" fill="currentColor" className="opacity-60" />
        <circle cx="15" cy="17" r="1" fill="currentColor" className="opacity-60" />
      </svg>
      
      {/* Extra light effect */}
      <div className="absolute inset-0 rounded-lg bg-white/10 group-hover:bg-white/20 transition-colors" />
    </div>
  );
}

/* ─── page ─────────────────────────────────────────────── */

export default function DashboardPage() {
  const [period, setPeriod]       = useState<Period>("1d");
  const [source, setSource]       = useState<Source>("all");
  const [data, setData]           = useState<ApiData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [syncing, setSyncing]     = useState(false);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [theme, setTheme]         = useState<"light" | "dark" | "system">("system");
  const [customRange, setCustomRange] = useState({
    from: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    const t = localStorage.getItem("theme") as "light" | "dark" | "system" | null;
    if (t) setTheme(t);
    else setTheme("system");
  }, []);

  useEffect(() => {
    const applyTheme = (t: "light" | "dark" | "system") => {
      const root = document.documentElement;
      if (t === "dark") {
        root.classList.add("dark");
      } else if (t === "light") {
        root.classList.remove("dark");
      } else {
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
          root.classList.add("dark");
        } else {
          root.classList.remove("dark");
        }
      }
    };

    applyTheme(theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent) => {
        const root = document.documentElement;
        if (e.matches) root.classList.add("dark");
        else root.classList.remove("dark");
      };
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
    try { 
      if (next === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {}
  };

  const fetchStats = (p: Period, s: Source, range = customRange) => {
    setLoading(true);
    const qs = new URLSearchParams({ period: p, ...(s !== "all" ? { source: s } : {}) });
    if (p === "custom") {
      qs.append("from", range.from);
      qs.append("to", range.to);
    }
    fetch(`/api/token-stats?${qs}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  const handleSync = () => {
    setSyncing(true);
    fetch("/api/sync", { method: "POST" })
      .then(() => { setLastSynced(Date.now()); fetchStats(period, source, customRange); })
      .finally(() => setSyncing(false));
  };

  useEffect(() => { fetchStats(period, source, customRange); }, [period, source, customRange.from, customRange.to]);

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
            if (period === "custom") {
              qs.append("from", customRange.from);
              qs.append("to", customRange.to);
            }
            fetch(`/api/token-stats?${qs}`)
              .then(r => r.json())
              .then(setData)
              .catch(() => {});
          }
        })
        .catch(() => {});
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [period, source, customRange.from, customRange.to]);

  const summary      = data?.summary      ?? EMPTY_SUMMARY;
  const chartData    = data?.chartData    ?? [];
  const sessionStats = data?.sessionStats ?? [];
  const projectStats = data?.projectStats ?? [];
  const modelStats   = data?.modelStats   ?? [];
  const platformStats = data?.platformStats ?? [];

  const [viewMode, setViewMode] = useState<"sessions" | "projects">("sessions");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string>("totalCost");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const filteredProjects = projectStats
    .filter(p => p.project.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      let vA: any, vB: any;
      if (sortField === "project") { vA = a.project; vB = b.project; }
      else if (sortField === "startTime") { vA = new Date(a.startTime).getTime(); vB = new Date(b.startTime).getTime(); }
      else if (sortField === "callCount") { vA = a.callCount; vB = b.callCount; }
      else if (sortField === "tokens") { vA = a.totalInput + a.totalOutput; vB = b.totalInput + b.totalOutput; }
      else if (sortField === "totalCost") { vA = a.totalCost; vB = b.totalCost; }
      else if (sortField === "platforms") { vA = a.sources.join(","); vB = b.sources.join(","); }
      
      if (vA < vB) return sortOrder === "asc" ? -1 : 1;
      if (vA > vB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 opacity-20" />;
    return sortOrder === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

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
          <div className="flex items-center gap-2 shrink-0 group">
            <AgentLogo />
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
            {period === "custom" && (
              <div className="flex items-center gap-1.5 ml-2 border-l border-border pl-3">
                <input
                  type="date"
                  value={customRange.from}
                  onChange={e => setCustomRange(p => ({ ...p, from: e.target.value }))}
                  className="bg-transparent text-[12px] text-foreground border border-border rounded-md px-2 py-1 outline-none focus:border-foreground"
                />
                <span className="text-[#8e8e93] dark:text-[#98989d] text-[12px]">-</span>
                <input
                  type="date"
                  value={customRange.to}
                  onChange={e => setCustomRange(p => ({ ...p, to: e.target.value }))}
                  className="bg-transparent text-[12px] text-foreground border border-border rounded-md px-2 py-1 outline-none focus:border-foreground"
                />
              </div>
            )}
          </div>

          {/* Right cluster: theme toggle + sync */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="w-8 h-8 rounded-full bg-muted hover:bg-muted/70 flex items-center justify-center text-[#3c3c43] dark:text-[#c7c7cc] transition-colors cursor-pointer"
            >
              {theme === "light" ? <Sun className="w-3.5 h-3.5" /> : theme === "dark" ? <Moon className="w-3.5 h-3.5" /> : <Laptop className="w-3.5 h-3.5" />}
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

        {/* Row 4: Sessions / Projects table */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center bg-muted/50 p-1 rounded-xl w-fit">
              <button
                onClick={() => setViewMode("sessions")}
                className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all cursor-pointer ${
                  viewMode === "sessions" 
                    ? "bg-card text-foreground shadow-xs" 
                    : "text-[#8e8e93] hover:text-foreground"
                }`}
              >
                Sessions gần nhất
              </button>
              <button
                onClick={() => setViewMode("projects")}
                className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all cursor-pointer ${
                  viewMode === "projects" 
                    ? "bg-card text-foreground shadow-xs" 
                    : "text-[#8e8e93] hover:text-foreground"
                }`}
              >
                Thống kê theo dự án
              </button>
            </div>

            <div className="flex items-center gap-3">
              {viewMode === "projects" && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#8e8e93]" />
                  <input
                    type="text"
                    placeholder="Tìm tên dự án..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-1.5 bg-muted/50 border border-transparent focus:border-border rounded-xl text-[12px] outline-none w-48 sm:w-64 transition-all"
                  />
                </div>
              )}
              <span className="text-[11px] text-[#aeaeb2] dark:text-[#6e6e72] whitespace-nowrap">
                {viewMode === "sessions" ? `${sessionStats.length} sessions` : `${filteredProjects.length} dự án`}
              </span>
            </div>
          </div>

          {viewMode === "sessions" ? (
            sessionStats.length === 0 && !loading ? (
              <div className="py-12 text-center text-[13px] text-[#aeaeb2] dark:text-[#6e6e72]">Không có dữ liệu</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      {[
                        { label: "Platform", icon: null,      key: "source" },
                        { label: "Dự án",    icon: FolderOpen, key: "project" },
                        { label: "Bắt đầu",  icon: Clock,      key: "startTime" },
                        { label: "Calls",    icon: null,       key: "callCount" },
                        { label: "Tokens",   icon: null,       key: "tokens" },
                        { label: "Chi phí",  icon: null,       key: "totalCost" },
                      ].map(({ label, icon: Icon }) => (
                        <th key={label} className="text-left px-4 py-3 text-[10px] font-bold text-[#aeaeb2] dark:text-[#6e6e72] uppercase tracking-wide whitespace-nowrap">
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
            )
          ) : (
            filteredProjects.length === 0 && !loading ? (
              <div className="py-12 text-center text-[13px] text-[#aeaeb2] dark:text-[#6e6e72]">Không tìm thấy dự án nào</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      {[
                        { label: "Dự án",    key: "project",   icon: FolderOpen },
                        { label: "Platforms", key: "platforms", icon: null },
                        { label: "Hoạt động", key: "startTime", icon: Clock },
                        { label: "Calls",    key: "callCount", icon: null },
                        { label: "Tokens",   key: "tokens",    icon: null },
                        { label: "Chi phí",  key: "totalCost", icon: null },
                      ].map(({ label, key, icon: Icon }) => (
                        <th 
                          key={key} 
                          onClick={() => handleSort(key)}
                          className="text-left px-4 py-3 text-[10px] font-bold text-[#aeaeb2] dark:text-[#6e6e72] uppercase tracking-wide whitespace-nowrap cursor-pointer hover:bg-muted/30 transition-colors"
                        >
                          <span className="flex items-center gap-1">
                            {Icon && <Icon className="w-3 h-3" />}
                            {label}
                            <SortIcon field={key} />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map((p, i) => (
                      <tr
                        key={p.project}
                        className={`hover:bg-muted/50 transition-colors ${
                          i < filteredProjects.length - 1 ? "border-b border-border" : ""
                        }`}
                      >
                        <td className="px-4 py-2.5 max-w-40">
                          <span className="block truncate font-medium text-foreground" title={p.project}>
                            {p.project}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            {p.sources.map(s => <SourceBadge key={s} source={s} />)}
                          </div>
                        </td>
                        <td className="font-numeric px-4 py-2.5 text-[#8e8e93] dark:text-[#98989d] whitespace-nowrap">
                          {fmtTime(p.startTime)}
                        </td>
                        <td className="font-numeric px-4 py-2.5 text-[#3c3c43] dark:text-[#c7c7cc]">
                          {p.callCount.toLocaleString()}
                        </td>
                        <td className="font-numeric px-4 py-2.5 text-foreground font-medium">
                          {formatK(p.totalInput + p.totalOutput)}
                        </td>
                        <td className="font-numeric px-4 py-2.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                          ${p.totalCost.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

      </main>
    </div>
  );
}
