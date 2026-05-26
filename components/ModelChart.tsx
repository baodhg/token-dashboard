"use client";

import React from "react";
import Image from "next/image";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Cell, LabelList 
} from "recharts";
import { useI18n } from "@/lib/i18n-context";

export interface ModelStat {
  model: string;
  source: string;
  label: string;
  totalInput: number;
  totalOutput: number;
  totalTokens: number;
  callCount: number;
}

interface Props {
  data: ModelStat[];
  animationKey?: number;
}

function formatK(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const PLATFORMS = [
  { id: "claude_code", label: "Claude Code", icon: "/claude.png", color: "212, 132, 90", from: "#ff8c42", to: "#fca5a5" },
  { id: "cline",       label: "Cline",       icon: "/cline.png",  color: "90, 99, 112", from: "#10b981", to: "#6ee7b7" },
  { id: "codex",       label: "Codex",       icon: "/codex.png",  color: "123, 108, 246", from: "#8b5cf6", to: "#c4b5fd" },
  { id: "gemini",      label: "Gemini CLI",  icon: "/geminicli.png", color: "99, 102, 241", from: "#6366f1", to: "#a5b4fc" },
  { id: "antigravity_cli", label: "Antigravity CLI", icon: "/antigravity.png", color: "66, 133, 244", from: "#4285f4", to: "#93c5fd" },
  { id: "github_copilot", label: "GitHub Copilot", icon: "/github.png", color: "36, 41, 46", from: "#06b6d4", to: "#67e8f9" },
  { id: "cursor",         label: "Cursor",         icon: "/cursor.png",         color: "95, 201, 248", from: "#71717a", to: "#d4d4d8" },
];

function calculateBarColor(platformId: string, pct: number, isMax: boolean) {
  return `url(#gradient-${platformId})`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  const { t } = useI18n();
  if (!active || !payload?.length) return null;
  const d: ModelStat = payload[0]?.payload;
  return (
    <div className="bg-card/95 backdrop-blur-sm rounded-xl shadow-xl border border-border px-4 py-3 text-[12px] min-w-44">
      <p className="font-semibold text-foreground mb-2">{d.label}</p>
      <div className="space-y-1.5 text-muted-foreground">
        <div className="flex justify-between gap-6">
          <span>{t("common.input")}</span>
          <span className="font-numeric font-bold text-foreground">{formatK(d.totalInput)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span>{t("common.output")}</span>
          <span className="font-numeric font-bold text-foreground">{formatK(d.totalOutput)}</span>
        </div>
        <div className="flex justify-between gap-6 pt-1.5 border-t border-border/50 text-foreground/80">
          <span>{t("common.calls")}</span>
          <span className="font-numeric font-bold">{d.callCount.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// Keep track of values across renders and remounts
const prevValuesMap = new Map<string, number>();

// Custom animated label for the "race" effect
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnimatedLabel = (props: any) => {
  const { x, y, width, height, value, overallTotal, entryKey, isIncreased } = props;

  // Persist last known non-zero width so label stays at correct x position
  // even if Recharts ever passes width=0 during a re-render cycle.
  const stableWidth = React.useRef<number>(width || 0);
  if (width > 0) stableWidth.current = width;

  const [displayValue, setDisplayValue] = React.useState(() => prevValuesMap.get(entryKey) || 0);
  const currentDisplayRef = React.useRef(displayValue);

  React.useEffect(() => {
    const startValue = currentDisplayRef.current;
    const endValue = value;
    if (startValue === endValue) {
      setDisplayValue(endValue);
      return;
    }

    let startTimestamp: number | null = null;
    const duration = 900;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(easedProgress * (endValue - startValue) + startValue);

      setDisplayValue(current);
      currentDisplayRef.current = current;
      prevValuesMap.set(entryKey, current);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setDisplayValue(endValue);
        currentDisplayRef.current = endValue;
        prevValuesMap.set(entryKey, endValue);
      }
    };

    const req = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(req);
  }, [value, entryKey]);

  const pct = overallTotal > 0 ? Math.round((displayValue / overallTotal) * 100) : 0;

  return (
    <text
      x={x + stableWidth.current + 10}
      y={y + height / 2}
      fill="var(--chart-tick-strong)"
      fontSize={10}
      fontFamily="inherit"
      fontWeight={700}
      textAnchor="start"
      dominantBaseline="central"
      className="font-numeric"
    >
      <tspan>{formatK(displayValue)} ({pct}%)</tspan>
      {isIncreased && (
        <tspan fill="#4ade80" dx={5} fontSize={9} fontWeight={900}>▲</tspan>
      )}
    </text>
  );
};

export default function ModelChart({ data, animationKey = 0 }: Props) {
  const { t } = useI18n();
  const [shouldAnimate, setShouldAnimate]     = React.useState(true);
  const [justIncreased, setJustIncreased]     = React.useState<Set<string>>(new Set());
  const prevValuesRef   = React.useRef<Map<string, number>>(new Map());
  const increaseTimer   = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter change: reset everything, re-enable bar animation for initial draw
  React.useEffect(() => {
    prevValuesMap.clear();
    prevValuesRef.current.clear();
    setJustIncreased(new Set());
    setShouldAnimate(true);
    const t = setTimeout(() => setShouldAnimate(false), 1500);
    return () => clearTimeout(t);
  }, [animationKey]);

  // Data change (poll): detect which models grew and highlight them
  React.useEffect(() => {
    if (!data.length) return;
    const grew = new Set<string>();
    data.forEach(d => {
      const prev = prevValuesRef.current.get(d.model);
      if (prev !== undefined && d.totalTokens > prev) grew.add(d.model);
      prevValuesRef.current.set(d.model, d.totalTokens);
    });
    if (grew.size > 0) {
      setJustIncreased(grew);
      if (increaseTimer.current) clearTimeout(increaseTimer.current);
      increaseTimer.current = setTimeout(() => setJustIncreased(new Set()), 1400);
    }
  }, [data]);

  if (!data.length) {
    return (
      <div className="h-full flex items-center justify-center text-[#aeaeb2] dark:text-[#6e6e72] text-sm animate-pulse">
        {t("common.no_data")}
      </div>
    );
  }

  const overallTotal = data.reduce((s, d) => s + d.totalTokens, 0);
  const overallMaxTokens = Math.max(...data.map(d => d.totalTokens), 1);
  
  // Sort all models globally by totalTokens descending
  const sortedData = [...data]
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .map(d => ({
      ...d,
      chartKey: `${d.source}_${d.model}`
    }));

  const chartHeight = sortedData.length * 36 + 20;

  const CustomYAxisTick = (props: any) => {
    const { x, y, payload } = props;
    const item = sortedData.find(d => d.chartKey === payload.value);
    if (!item) return null;

    const platform = PLATFORMS.find(p => p.id === item.source);
    const iconSrc = platform?.icon ?? "/default-icon.png";

    return (
      <g transform={`translate(${x}, ${y})`}>
        {/* Platform Icon */}
        <image
          href={iconSrc}
          x={-145}
          y={-9}
          width={18}
          height={18}
        />
        {/* Model Label */}
        <text
          x={-120}
          y={0}
          dy="0.32em"
          fill="var(--chart-tick-strong)"
          fontSize={11}
          fontWeight={500}
          fontFamily="inherit"
          textAnchor="start"
        >
          {item.label}
        </text>
      </g>
    );
  };

  return (
    <div key={animationKey} className="animate-in fade-in slide-in-from-bottom-2 duration-700">
      <div style={{ height: chartHeight, width: "100%" }}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={sortedData}
            layout="vertical"
            margin={{ top: 10, right: 90, left: 4, bottom: 10 }}
            barSize={16}
          >
            <defs>
              {PLATFORMS.map(p => (
                <linearGradient key={p.id} id={`gradient-${p.id}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={p.from} />
                  <stop offset="100%" stopColor={p.to} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, overallMaxTokens]}
              hide
            />
            <YAxis
              type="category"
              dataKey="chartKey"
              tick={<CustomYAxisTick />}
              axisLine={false}
              tickLine={false}
              width={150}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }} />
            <Bar
              dataKey="totalTokens"
              radius={[0, 4, 4, 0]}
              isAnimationActive={shouldAnimate}
              animationDuration={1000}
              animationEasing="ease-out"
              shape={(sp: any) => {
                const entry = sortedData[sp.index];
                if (!entry) return <g />;
                
                const platform = PLATFORMS.find(p => p.id === entry.source);
                const isUp = justIncreased.has(entry.model);
                const w = Math.max(sp.width || 0, 0);
                if (w === 0) return <g />;
                
                const pct = overallMaxTokens > 0 ? (entry.totalTokens / overallMaxTokens) : 0;
                const opacity = isUp ? 1 : 0.5 + (pct * 0.5);

                return (
                  <g>
                    <rect
                      x={sp.x} y={sp.y} width={w} height={sp.height}
                      fill={`url(#gradient-${entry.source})`}
                      fillOpacity={opacity}
                      stroke={isUp ? `rgba(${platform?.color || "255,255,255"}, 0.7)` : "none"}
                      strokeWidth={isUp ? 1.5 : 0}
                      rx={4} ry={4}
                    />
                    {isUp && (
                      <rect
                        x={sp.x} y={sp.y} width={w} height={sp.height}
                        rx={4} ry={4}
                        fill="rgba(255,255,255,0.45)"
                        style={{ animation: "bar-energy-rise 0.85s cubic-bezier(0.4, 0, 0.2, 1) forwards" }}
                      />
                    )}
                  </g>
                );
              }}
            >
              {sortedData.map((entry) => {
                const isUp = justIncreased.has(entry.model);
                const platform = PLATFORMS.find(p => p.id === entry.source);
                return (
                  <Cell
                    key={entry.chartKey}
                    fill={isUp ? `rgba(${platform?.color || "255,255,255"}, 1)` : `url(#gradient-${entry.source})`}
                  />
                );
              })}
              <LabelList
                dataKey="totalTokens"
                content={(props: any) => {
                  const entry = sortedData[props.index];
                  if (!entry) return null;

                  return (
                    <AnimatedLabel
                      key={`label-${entry.chartKey}`}
                      {...props}
                      overallTotal={overallTotal}
                      entryKey={entry.chartKey}
                      isIncreased={justIncreased.has(entry.model)}
                    />
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
