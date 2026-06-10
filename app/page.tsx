"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Zap, ArrowDownLeft, ArrowUpRight, DollarSign,
  RefreshCw, Clock, FolderOpen, Sun, Moon, Laptop,
  ChevronUp, ChevronDown, Search, Languages, Calculator
} from "lucide-react";
import { PERIODS, type Period, type DataPoint } from "@/lib/mock-data";
import type { ModelStat } from "@/components/ModelChart";
import { useI18n } from "@/lib/i18n-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const TokenChart = dynamic<{ data: DataPoint[]; period: Period; animationKey?: number }>(
  () => import("@/components/TokenChart"), { ssr: false }
);
const CacheChart = dynamic<{ data: DataPoint[]; period: Period; animationKey?: number }>(
  () => import("@/components/CacheChart"), { ssr: false }
);
const ModelChart = dynamic<{ data: ModelStat[]; animationKey?: number }>(
  () => import("@/components/ModelChart"), { ssr: false }
);
/* ─── helpers ────────────────────────────────────────── */

function formatK(n: number) {
  const rounded = Math.round(n);
  if (rounded >= 1_000_000_000) return `${(rounded / 1_000_000_000).toFixed(2)}B`;
  if (rounded >= 1_000_000)     return `${(rounded / 1_000_000).toFixed(2)}M`;
  if (rounded >= 1_000)         return `${(rounded / 1_000).toFixed(1)}K`;
  return String(rounded);
}

function fmtTime(iso: string, locale: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(locale === "vi" ? "vi-VN" : "en-US", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

/* ─── types ──────────────────────────────────────────── */

type Source = "all" | "claude_code" | "cline" | "codex" | "gemini" | "antigravity_cli" | "github_copilot" | "cursor";

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
  recentCalls:   {
    id: string; model: string; source: string; project: string; 
    timestamp: string; input: number; output: number; cost: number;
  }[];
}

const EMPTY_SUMMARY: Summary = {
  total: 0, totalInput: 0, totalOutput: 0,
  totalCache: 0, totalCost: 0, callCount: 0,
};

const SOURCE_LABELS: Record<Source, string> = {
  all:           "Tất cả",
  claude_code:   "Claude Code",
  cline:         "Cline",
  codex:         "Codex",
  gemini:        "Gemini CLI",
  antigravity_cli: "Antigravity CLI",
  github_copilot: "GitHub Copilot",
  cursor:        "Cursor",
};

const SOURCE_COLORS: Record<string, string> = {
  claude_code:   "#ff8c42", // Vibrant Orange
  cline:         "#10b981", // Emerald Green
  codex:         "#8b5cf6", // Purple
  gemini:        "#6366f1", // Indigo (changed from Blue to distinguish)
  antigravity_cli: "#4285f4", // Google Blue
  github_copilot: "#06b6d4", // Brighter Cyan (Copilot Robot)
  cursor:        "#71717a", // Zinc (Cursor Cube)
};

const SOURCE_ICONS: Record<string, string> = {
  claude_code:   "/claude.png",
  cline:         "/cline.png",
  codex:         "/codex.png",
  gemini:        "/geminicli.png",
  antigravity_cli: "/antigravity.png",
  github_copilot: "/github.png",
  cursor:        "/cursor.png",
};

/* ─── stat card ────────────────────────────────────────── */

function StatCard({
  label, rawValue, formatter, sub, icon: Icon, iconBg, iconColor, loading, isPollGlow, filterKey,
}: {
  label: string; rawValue: number; formatter: (n: number) => string; sub: string;
  icon: React.ElementType; iconBg: string; iconColor: string;
  loading: boolean; isPollGlow: boolean; filterKey: number;
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const displayRef = useRef(0);
  const prevFilterKeyRef = useRef(filterKey);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    const filterKeyChanged = filterKey !== prevFilterKeyRef.current;
    prevFilterKeyRef.current = filterKey;
    const startValue = filterKeyChanged ? 0 : displayRef.current;
    const endValue = rawValue;
    if (startValue === endValue) {
      setDisplayValue(endValue);
      displayRef.current = endValue;
      return;
    }
    let startTime: number | null = null;
    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const p = Math.min((ts - startTime) / 800, 1);
      const v = startValue + (endValue - startValue) * (1 - Math.pow(1 - p, 3));
      displayRef.current = v;
      setDisplayValue(v);
      if (p < 1) { rafRef.current = requestAnimationFrame(step); }
      else { displayRef.current = endValue; setDisplayValue(endValue); }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [rawValue, filterKey]);

  return (
    <div className={`bg-card rounded-2xl p-5 border shadow-sm flex flex-col gap-3 transition-all duration-500 stat-card-premium group cursor-pointer ${isPollGlow ? "border-emerald-400/30 shadow-emerald-500/8 shadow-md" : "border-border"}`}>
      <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-6 ${isPollGlow ? "scale-110" : "scale-100"}`}>
        <Icon className={`w-4 h-4 ${iconColor} transition-transform duration-300 group-hover:scale-110`} />
      </div>
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 group-hover:text-foreground/80 transition-colors duration-300">{label}</p>
        <p className={`font-numeric text-[26px] font-bold text-foreground leading-none tracking-tight transition-all duration-300 group-hover:text-primary ${loading ? "opacity-30" : ""}`}>
          {loading ? "···" : formatter(displayValue)}
        </p>
        <p className="text-[11px] text-muted-foreground/60 mt-1.5 group-hover:text-muted-foreground/80 transition-colors duration-300">{sub}</p>
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

/* ─── platform badge ──────────────────────────────────── */

function SourceBadge({ source }: { source: string }) {
  const brandColor = SOURCE_COLORS[source] ?? "#8e8e93";
  const label = source === "claude_code" ? "Claude" : 
                source === "cline" ? "Cline" : 
                source === "codex" ? "Codex" : 
                source === "gemini" ? "Gemini" : 
                source === "antigravity_cli" ? "Antigravity" :
                source === "github_copilot" ? "Copilot" : 
                source === "cursor" ? "Cursor" : source;
  const iconSrc = SOURCE_ICONS[source];

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
      style={{ 
        background: `${brandColor}15`, 
        color: (source === "cursor") ? "var(--foreground)" : brandColor, 
        borderColor: `${brandColor}30`
      }}
    >
      {iconSrc ? (
        <Image 
          src={iconSrc} 
          alt={label} 
          width={13} 
          height={13} 
          className="opacity-100" 
          style={{ 
            width: 13, 
            height: 13, 
            objectFit: "contain", 
            transform: (source === "codex" || source === "github_copilot" || source === "cursor") ? "scale(1.3)" : undefined,
          }} 
        />
      ) : (
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: brandColor }} />
      )}
      {label}</span>
  );
}
/* ─── platform badge ──────────────────────────────────── */


function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <button
      onClick={() => setLocale(locale === "vi" ? "en" : "vi")}
      className="flex items-center gap-1.5 px-3 h-8 rounded-full bg-muted hover:bg-muted/70 text-[12px] font-medium text-[#3c3c43] dark:text-[#c7c7cc] transition-colors cursor-pointer"
    >
      <Languages className="w-3.5 h-3.5" />
      <span className="uppercase">{locale}</span>
    </button>
  );
}

function AgentLogo() {
  return (
    <div className="relative w-9 h-9 flex items-center justify-center shrink-0 group">
      {/* Background Glow - New Cyber Gradient */}
      <div className="absolute inset-0 bg-linear-to-br from-emerald-400 via-cyan-500 to-blue-600 rounded-xl shadow-lg shadow-cyan-500/20 group-hover:shadow-cyan-500/40 transition-all duration-500" />
      
      {/* Custom SVG Agent Icon */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-6 h-6 relative z-10 text-white"
      >
        {/* The Outer Frame (Terminal-like) */}
        <path
          d="M4 6C4 4.89543 4.89543 4 6 4H18C19.1046 4 20 4.89543 20 6V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V6Z"
          stroke="currentColor"
          strokeWidth="1.2"
          className="opacity-50"
        />
        {/* The Prompt Symbol */}
        <path
          d="M7.5 9L9.5 11L7.5 13"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* The Pulsing Core (The "Eye" of the Agent) */}
        <circle
          cx="14.5"
          cy="12"
          r="3.2"
          fill="white"
          className="animate-pulse shadow-sm"
        />
        {/* Connection paths to dots */}
        <path d="M14.5 8.8V7" stroke="white" strokeWidth="0.8" className="opacity-40" />
        <path d="M17.7 12H19" stroke="white" strokeWidth="0.8" className="opacity-40" />
        <path d="M14.5 15.2V17" stroke="white" strokeWidth="0.8" className="opacity-40" />

        {/* Orbital dots */}
        <circle cx="14.5" cy="7" r="1.1" fill="white" className="opacity-80" />
        <circle cx="19" cy="12" r="1.1" fill="white" className="opacity-80" />
        <circle cx="14.5" cy="17" r="1.1" fill="white" className="opacity-80" />
      </svg>
      
      {/* Inner reflection */}
      <div className="absolute inset-0 rounded-xl bg-linear-to-t from-black/10 to-transparent" />
      <div className="absolute top-0 left-0 right-0 h-px bg-white/30 rounded-t-xl" />
    </div>
  );
}

/* ─── page ─────────────────────────────────────────────── */

function DashboardContent() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Initial state from URL or defaults
  const initialPeriod = (searchParams.get("period") as Period) || "1d";
  const initialSource = (searchParams.get("source") as Source) || "all";

  const [period, setPeriod]       = useState<Period>(initialPeriod);
  const [source, setSource]       = useState<Source>(initialSource);
  const [data, setData]           = useState<ApiData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [syncing, setSyncing]         = useState(false);
  const [lastSynced, setLastSynced]   = useState<number | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcMsg, setRecalcMsg]     = useState<string | null>(null);
  const [theme, setTheme]         = useState<"light" | "dark" | "system">("system");
const [customRange, setCustomRange] = useState(() => ({
    from: searchParams.get("from") || new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
    to:   searchParams.get("to")   || new Date().toISOString().split('T')[0]
  }));
  const [filterKey, setFilterKey]     = useState(0);
  const [isPollGlow, setIsPollGlow]   = useState(false);
  const glowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync URL when filters change
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    if (source !== "all") params.set("source", source);
    else params.delete("source");

    if (period === "custom") {
      params.set("from", customRange.from);
      params.set("to", customRange.to);
    } else {
      params.delete("from");
      params.delete("to");
    }

    const qs = params.toString();
    const currentQs = searchParams.toString();
    if (qs !== currentQs) {
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    }
  }, [period, source, customRange, pathname, router, searchParams]);

  useEffect(() => {
    const t = localStorage.getItem("theme") as "light" | "dark" | "system" | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (t) setTheme(t);
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

  useEffect(() => {
    let active = true;
    const fetchStats = async () => {
      setLoading(true);
      const qs = new URLSearchParams({ period, ...(source !== "all" ? { source } : {}) });
      if (period === "custom") {
        qs.append("from", customRange.from);
        qs.append("to", customRange.to);
      }
      try {
        const r = await fetch(`/api/token-stats?${qs}`);
        const result = await r.json();
        if (active) { setData(result); setFilterKey(k => k + 1); }
      } catch {
        if (active) setData(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchStats();
    return () => { active = false; };
  }, [period, source, customRange.from, customRange.to]);

  const handleSync = () => {
    setSyncing(true);
    fetch("/api/sync", { method: "POST" })
      .then(() => {
        setLastSynced(Date.now());
      })
      .finally(() => setSyncing(false));
  };

  const filtersRef = useRef({ period, source, customRange });
  useEffect(() => {
    filtersRef.current = { period, source, customRange };
  }, [period, source, customRange]);

  const handleRecalculate = () => {
    setRecalculating(true);
    setRecalcMsg(null);
    fetch("/api/recalculate-prices", { method: "POST" })
      .then(r => r.json())
      .then((res: { updated?: number; skipped?: number; error?: string }) => {
        if (res.error) { setRecalcMsg(`Error: ${res.error}`); return; }
        setRecalcMsg(`Updated ${res.updated ?? 0} records`);
        // Refresh stats to show updated costs
        const curr = filtersRef.current;
        const qs = new URLSearchParams({ period: curr.period, ...(curr.source !== "all" ? { source: curr.source } : {}) });
        if (curr.period === "custom") { qs.append("from", curr.customRange.from); qs.append("to", curr.customRange.to); }
        fetch(`/api/token-stats?${qs}`).then(r => r.json()).then(result => {
          setData(result);
          if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
          setIsPollGlow(true);
          glowTimerRef.current = setTimeout(() => setIsPollGlow(false), 1200);
        }).catch(() => {});
        setTimeout(() => setRecalcMsg(null), 4000);
      })
      .catch(e => setRecalcMsg(`Error: ${e}`))
      .finally(() => setRecalculating(false));
  };

  // Smart Polling
  useEffect(() => {
    let active = true;
    const interval = setInterval(() => {
      fetch("/api/sync", { method: "POST" })
        .then(r => r.json())
        .then(res => {
          if (!active) return;
          if (res.synced > 0) {
            setLastSynced(Date.now());
            // Implicitly re-fetch data
            const qs = new URLSearchParams({ period, ...(source !== "all" ? { source } : {}) });
            if (period === "custom") {
              qs.append("from", customRange.from);
              qs.append("to", customRange.to);
            }
            fetch(`/api/token-stats?${qs}`)
              .then(r => r.json())
              .then(result => {
                if (!active) return;
                setData(result);
                if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
                setIsPollGlow(true);
                glowTimerRef.current = setTimeout(() => setIsPollGlow(false), 1200);
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    }, 5000); // Poll every 5 seconds

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [period, source, customRange.from, customRange.to]);

  const summary      = data?.summary      ?? EMPTY_SUMMARY;
  const chartData    = data?.chartData    ?? [];
  const sessionStats = data?.sessionStats ?? [];
  const projectStats = data?.projectStats ?? [];
  const modelStats   = data?.modelStats   ?? [];
  const recentCalls  = data?.recentCalls   ?? [];

  const [viewMode, setViewMode] = useState<"sessions" | "projects" | "calls">("sessions");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string>("totalCost");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const filteredProjects = projectStats
    .filter(p => p.project.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      let vA: string | number, vB: string | number;
      if (sortField === "project") { vA = a.project; vB = b.project; }
      else if (sortField === "startTime") { vA = new Date(a.startTime).getTime(); vB = new Date(b.startTime).getTime(); }
      else if (sortField === "callCount") { vA = a.callCount; vB = b.callCount; }
      else if (sortField === "tokens") { vA = a.totalInput + a.totalOutput; vB = b.totalInput + b.totalOutput; }
      else if (sortField === "totalCost") { vA = a.totalCost; vB = b.totalCost; }
      else if (sortField === "platforms") { vA = a.sources.join(","); vB = b.sources.join(","); }
      else { vA = 0; vB = 0; }
      
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
    summary.total > 0 ? `${((n / summary.total) * 100).toFixed(0)}%` : "0%";

  const statCards = [
    {
      label: t("common.total_tokens"),
      rawValue: summary.total,
      formatter: formatK,
      sub:   `${summary.callCount.toLocaleString()} ${t("common.calls")}`,
      icon: Zap,
      iconBg: "bg-indigo-50 dark:bg-indigo-500/15",
      iconColor: "text-indigo-600 dark:text-indigo-400",
    },
    {
      label: t("common.input_tokens"),
      rawValue: summary.totalInput,
      formatter: formatK,
      sub:   summary.totalCache > 0
        ? `${formatK(summary.totalCache)} ${t("common.cached")} (${((summary.totalCache / summary.totalInput) * 100).toFixed(0)}%)`
        : `${pct(summary.totalInput)} ${t("common.total")}`,
      icon: ArrowDownLeft,
      iconBg: "bg-purple-50 dark:bg-purple-500/15",
      iconColor: "text-purple-600 dark:text-purple-400",
    },
    {
      label: t("common.output_tokens"),
      rawValue: summary.totalOutput,
      formatter: formatK,
      sub:   `${pct(summary.totalOutput)} ${t("common.total")}`,
      icon: ArrowUpRight,
      iconBg: "bg-violet-50 dark:bg-violet-500/15",
      iconColor: "text-violet-600 dark:text-violet-400",
    },
    {
      label: t("common.estimated_cost"),
      rawValue: summary.totalCost || 0,
      formatter: (n: number) => `$${n.toFixed(4)}`,
      sub:   t("common.reference_price"),
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

          {/* Right cluster: theme toggle + sync */}
          <div className="flex items-center gap-2 shrink-0">
            <LanguageSwitcher />
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="w-8 h-8 rounded-full bg-muted hover:bg-muted/70 flex items-center justify-center text-[#3c3c43] dark:text-[#c7c7cc] transition-colors cursor-pointer"
            >
              {theme === "light" ? <Sun className="w-3.5 h-3.5" /> : theme === "dark" ? <Moon className="w-3.5 h-3.5" /> : <Laptop className="w-3.5 h-3.5" />}
            </button>

            {/* Live polling indicator */}
            <span className="relative flex h-2 w-2 shrink-0" title="Live polling active">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>

            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 h-8 rounded-full bg-muted hover:bg-muted/70 text-[12px] font-medium text-[#3c3c43] dark:text-[#c7c7cc] transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing
                ? t("common.syncing")
                : lastSynced
                  ? new Date(lastSynced).toLocaleTimeString(locale === "vi" ? "vi-VN" : "en-US")
                  : t("common.sync")}
            </button>

            <button
              onClick={handleRecalculate}
              disabled={recalculating}
              title="Recalculate costs from current pricing tables"
              className="flex items-center gap-1.5 px-3 h-8 rounded-full bg-muted hover:bg-muted/70 text-[12px] font-medium text-[#3c3c43] dark:text-[#c7c7cc] transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              <Calculator className={`w-3.5 h-3.5 ${recalculating ? "animate-pulse" : ""}`} />
              {recalcMsg ?? (recalculating ? "Recalculating…" : "Recalc $")}
            </button>
            <button
              onClick={() => router.push(`/model-race?period=${period}${source !== "all" ? `&source=${source}` : ""}`)}
              className="flex items-center gap-1.5 px-4 h-8 rounded-full text-[12px] font-bold transition-all cursor-pointer bg-muted hover:bg-muted/70 text-[#3c3c43] dark:text-[#c7c7cc]"
            >
              🚀 Model Race
            </button>
            <button
              onClick={() => router.push(`/race?period=${period}${source !== "all" ? `&source=${source}` : ""}`)}
              className="flex items-center gap-1.5 px-4 h-8 rounded-full text-[12px] font-bold transition-all cursor-pointer bg-muted hover:bg-muted/70 text-[#3c3c43] dark:text-[#c7c7cc]"
            >
              🌍 Global Race
            </button>
          </div>
        </div>
      </header>


      {/* ── Main ── */}
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* ── Dock Filters (Static) ── */}
        <div className="w-full flex flex-col lg:flex-row items-center justify-between gap-4 bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-2xl p-2.5">
          
          {/* Time Period Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full lg:w-auto" style={{ scrollbarWidth: "none" }}>
            {PERIODS.map(({ key }) => (
              <button
                key={key}
                onClick={() => {
                  setPeriod(key);
                  if (key !== "1d" && viewMode === "calls") setViewMode("sessions");
                }}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all cursor-pointer ${
                  period === key
                    ? "bg-foreground text-background shadow-sm"
                    : "text-[#3c3c43] dark:text-[#c7c7cc] hover:bg-muted"
                }`}
              >
                {t(`periods.${key}`)}
              </button>
            ))}
            {period === "custom" && (
              <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-border/50">
                <input
                  type="date"
                  value={customRange.from}
                  onChange={e => setCustomRange(p => ({ ...p, from: e.target.value }))}
                  className="bg-transparent text-[11px] text-foreground border border-border/50 rounded-md px-1.5 py-1 outline-none focus:border-foreground"
                />
                <span className="text-[#8e8e93] text-[11px]">-</span>
                <input
                  type="date"
                  value={customRange.to}
                  onChange={e => setCustomRange(p => ({ ...p, to: e.target.value }))}
                  className="bg-transparent text-[11px] text-foreground border border-border/50 rounded-md px-1.5 py-1 outline-none focus:border-foreground"
                />
              </div>
            )}
          </div>

          {/* Divider (visible on large screens) */}
          <div className="hidden lg:block w-px h-6 bg-border/50 shrink-0" />

          {/* Source (Platform) Filter */}
          <div className="flex items-center gap-1 overflow-x-auto w-full lg:w-auto" style={{ scrollbarWidth: "none" }}>
            {(["all", "claude_code", "cline", "codex", "gemini", "antigravity_cli", "github_copilot", "cursor"] as Source[]).map(s => {
              const label = s === "all" ? t("common.all") : SOURCE_LABELS[s];
              const isSelected = source === s;
              const brandColor = SOURCE_COLORS[s] ?? "#8e8e93";
              const iconSrc = s === "all" ? null : SOURCE_ICONS[s];

              return (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all cursor-pointer border whitespace-nowrap ${
                    isSelected
                      ? s === "all"
                        ? "bg-foreground text-background border-foreground shadow-sm"
                        : "shadow-sm"
                      : "border-transparent text-muted-foreground hover:bg-muted"
                  }`}
                  style={isSelected && s !== "all" ? {
                    backgroundColor: `${brandColor}15`,
                    color: (s === "cursor") ? "var(--foreground)" : brandColor,
                    borderColor: `${brandColor}30`
                  } : {}}
                >
                  {iconSrc ? (
                    <div className="w-3.5 h-3.5 flex items-center justify-center overflow-hidden">
                      <Image 
                        src={iconSrc} 
                        alt={label} 
                        width={14} 
                        height={14} 
                        style={{ 
                          width: 14, 
                          height: 14, 
                          objectFit: "contain", 
                          transform: (s === "codex" || s === "github_copilot" || s === "cursor") ? "scale(1.4)" : undefined,
                        }} 
                      />
                    </div>
                  ) : s !== "all" ? (
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: brandColor }}
                    />
                  ) : null}
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 1: Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(s => (
            <StatCard key={s.label} {...s} loading={loading} isPollGlow={isPollGlow} filterKey={filterKey} />
          ))}
        </div>

        {/* Row 2: Cache read bar chart + Tokens theo model */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className={`relative lg:col-span-1 bg-card rounded-2xl p-5 border shadow-sm overflow-hidden chart-container-premium ${isPollGlow ? "border-cyan-400/25 shadow-cyan-500/5 shadow-md" : "border-border"}`}>
            {isPollGlow && (
              <div className="absolute inset-0 pointer-events-none z-10" aria-hidden="true">
                <div className="absolute top-0 bottom-0 w-24 bg-linear-to-r from-transparent via-white/6 to-transparent dark:via-white/4 animate-sweep" />
              </div>
            )}
            <SectionHeader title={t("common.cache_read")} />
            <div className="h-64">
              {loading ? (
                <div className="h-full flex items-center justify-center text-[#aeaeb2] dark:text-[#6e6e72] text-sm">{t("common.loading")}</div>
              ) : chartEmpty ? (
                <div className="h-full flex items-center justify-center text-[#aeaeb2] dark:text-[#6e6e72] text-sm">{t("common.no_data")}</div>
              ) : (
                <CacheChart data={chartData} period={period} animationKey={filterKey} />
              )}
            </div>
          </div>

          <div className={`relative lg:col-span-2 bg-card rounded-2xl p-5 border shadow-sm overflow-hidden chart-container-premium ${isPollGlow ? "border-purple-400/25 shadow-purple-500/5 shadow-md" : "border-border"}`}>
            {isPollGlow && (
              <div className="absolute inset-0 pointer-events-none z-10" aria-hidden="true">
                <div className="absolute top-0 bottom-0 w-24 bg-linear-to-r from-transparent via-white/6 to-transparent dark:via-white/4 animate-sweep" />
              </div>
            )}
            <SectionHeader title={t("common.tokens_by_model")} />
            <div className="h-64 overflow-y-auto pr-2 custom-scrollbar">
              {loading ? (
                <div className="h-full flex items-center justify-center text-[#aeaeb2] dark:text-[#6e6e72] text-sm">{t("common.loading")}</div>
              ) : (
                <ModelChart data={modelStats} animationKey={filterKey} />
              )}
            </div>
          </div>
        </div>

        {/* Row 3: Input / Output line chart */}
        <div className={`relative bg-card rounded-2xl p-5 border shadow-sm overflow-hidden chart-container-premium ${isPollGlow ? "border-indigo-400/25 shadow-indigo-500/5 shadow-md" : "border-border"}`}>
          {isPollGlow && (
            <div className="absolute inset-0 pointer-events-none z-10" aria-hidden="true">
              <div className="absolute top-0 bottom-0 w-24 bg-linear-to-r from-transparent via-white/6 to-transparent dark:via-white/4 animate-sweep" />
            </div>
          )}
          <SectionHeader title={t("common.input_output")} />
          {loading ? (
            <div className="h-64 flex items-center justify-center text-[#aeaeb2] dark:text-[#6e6e72] text-sm">{t("common.loading")}</div>
          ) : chartEmpty ? (
            <div className="h-64 flex items-center justify-center text-[#aeaeb2] dark:text-[#6e6e72] text-sm">{t("common.no_data")}</div>
          ) : (
            <TokenChart data={chartData} period={period} animationKey={filterKey} />
          )}
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
                {t("common.recent_sessions")}
              </button>
              {period === "1d" && (
                <button
                  onClick={() => setViewMode("calls")}
                  className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all cursor-pointer ${
                    viewMode === "calls" 
                      ? "bg-card text-foreground shadow-xs" 
                      : "text-[#8e8e93] hover:text-foreground"
                  }`}
                >
                  Chi tiết lượt gọi
                </button>
              )}
              <button
                onClick={() => setViewMode("projects")}
                className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all cursor-pointer ${
                  viewMode === "projects" 
                    ? "bg-card text-foreground shadow-xs" 
                    : "text-[#8e8e93] hover:text-foreground"
                }`}
              >
                {t("common.project_stats")}
              </button>
            </div>

            <div className="flex items-center gap-3">
              {viewMode === "projects" && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#8e8e93]" />
                  <input
                    type="text"
                    placeholder={t("common.search_project")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-1.5 bg-muted/50 border border-transparent focus:border-border rounded-xl text-[12px] outline-none w-48 sm:w-64 transition-all"
                  />
                </div>
              )}
              <span className="text-[11px] text-[#aeaeb2] dark:text-[#6e6e72] whitespace-nowrap">
                {viewMode === "sessions" 
                  ? `${sessionStats.length} ${t("common.sessions")}` 
                  : viewMode === "calls"
                    ? `${recentCalls.length} lượt gọi`
                    : `${filteredProjects.length} ${t("common.projects")}`}
              </span>
            </div>
          </div>

          {viewMode === "sessions" ? (
            sessionStats.length === 0 && !loading ? (
              <div className="py-12 text-center text-[13px] text-[#aeaeb2] dark:text-[#6e6e72]">{t("common.no_data")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      {[
                        { label: t("common.platform"), icon: null,      key: "source" },
                        { label: t("common.project"),    icon: FolderOpen, key: "project" },
                        { label: t("common.start_time"),  icon: Clock,      key: "startTime" },
                        { label: t("common.calls"),    icon: null,       key: "callCount" },
                        { label: t("common.tokens"),   icon: null,       key: "tokens" },
                        { label: t("common.cost"),  icon: null,       key: "totalCost" },
                      ].map(({ label, icon: Icon }) => (
                        <th key={label} className="text-left px-4 py-3 text-[10px] font-bold text-[#aeaeb2] dark:text-[#6e6e72] uppercase tracking-wide whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            {Icon && <Icon className="w-3 h-3" />}
                            {label}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sessionStats.map((s, i) => (
                      <tr
                        key={`${s.source}_${s.sessionId ?? 'nosession'}_${s.project}_${i}`}
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
                          {fmtTime(s.startTime, locale)}
                        </td>
                        <td className="font-numeric px-4 py-2.5 text-[#3c3c43] dark:text-[#c7c7cc]">
                          {s.callCount.toLocaleString()}
                        </td>
                        <td className="font-numeric px-4 py-2.5 text-foreground font-medium">
                          {formatK(s.totalInput + s.totalOutput)}
                        </td>
                        <td className="font-numeric px-4 py-2.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                          ${(s.totalCost || 0).toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : viewMode === "calls" ? (
            recentCalls.length === 0 && !loading ? (
              <div className="py-12 text-center text-[13px] text-[#aeaeb2] dark:text-[#6e6e72]">{t("common.no_data")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      {[
                        { label: t("common.platform"), icon: null },
                        { label: "Model", icon: null },
                        { label: t("common.project"), icon: FolderOpen },
                        { label: "Thời gian", icon: Clock },
                        { label: "Input", icon: null },
                        { label: "Output", icon: null },
                        { label: t("common.cost"), icon: null },
                      ].map(({ label, icon: Icon }) => (
                        <th key={label} className="text-left px-4 py-3 text-[10px] font-bold text-[#aeaeb2] dark:text-[#6e6e72] uppercase tracking-wide whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            {Icon && <Icon className="w-3 h-3" />}
                            {label}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentCalls.map((c, i) => (
                      <tr
                        key={c.id}
                        className={`hover:bg-muted/50 transition-colors ${
                          i < recentCalls.length - 1 ? "border-b border-border" : ""
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <SourceBadge source={c.source} />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-foreground">{c.model}</span>
                        </td>
                        <td className="px-4 py-2.5 max-w-35">
                          <span className="block truncate text-[#3c3c43] dark:text-[#c7c7cc]" title={c.project}>
                            {c.project}
                          </span>
                        </td>
                        <td className="font-numeric px-4 py-2.5 text-[#8e8e93] dark:text-[#98989d] whitespace-nowrap">
                          {fmtTime(c.timestamp, locale)}
                        </td>
                        <td className="font-numeric px-4 py-2.5 text-foreground">
                          {formatK(c.input)}
                        </td>
                        <td className="font-numeric px-4 py-2.5 text-foreground">
                          {formatK(c.output)}
                        </td>
                        <td className="font-numeric px-4 py-2.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                          ${(c.cost || 0).toFixed(5)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            filteredProjects.length === 0 && !loading ? (
              <div className="py-12 text-center text-[13px] text-[#aeaeb2] dark:text-[#6e6e72]">{t("common.no_projects_found")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      {[
                        { label: t("common.project"),    key: "project",   icon: FolderOpen },
                        { label: t("common.platforms"), key: "platforms", icon: null },
                        { label: t("common.activity"), key: "startTime", icon: Clock },
                        { label: t("common.calls"),    key: "callCount", icon: null },
                        { label: t("common.tokens"),   key: "tokens",    icon: null },
                        { label: t("common.cost"),  key: "totalCost", icon: null },
                      ].map(({ label, key, icon: Icon }) => (
                        <th 
                          key={key} 
                          onClick={() => handleSort(key)}
                          className="text-left px-4 py-3 text-[10px] font-bold text-[#aeaeb2] dark:text-[#6e6e72] uppercase tracking-wide whitespace-nowrap cursor-pointer hover:bg-muted/30 transition-colors"
                        >
                          <span className="flex items-center gap-1">
                            {Icon && <Icon className="w-3 h-3" />}
                            {label} <SortIcon field={key} />
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
                          {fmtTime(p.startTime, locale)}
                        </td>
                        <td className="font-numeric px-4 py-2.5 text-[#3c3c43] dark:text-[#c7c7cc]">
                          {p.callCount.toLocaleString()}
                        </td>
                        <td className="font-numeric px-4 py-2.5 text-foreground font-medium">
                          {formatK(p.totalInput + p.totalOutput)}
                        </td>
                        <td className="font-numeric px-4 py-2.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                          ${(p.totalCost || 0).toFixed(4)}
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

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center animate-pulse text-muted-foreground font-medium">Loading Dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
