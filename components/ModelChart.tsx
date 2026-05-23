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
  { id: "claude_code", label: "Claude Code", icon: "/claude.png", color: "212, 132, 90" },  // Terracotta/coral
  { id: "cline",       label: "Cline",       icon: "/cline.png",  color: "90, 99, 112" },   // Dark slate
  { id: "codex",       label: "Codex",       icon: "/codex.png",  color: "123, 108, 246" },  // Purple-blue
  { id: "gemini",      label: "Gemini CLI",  icon: "/geminicli.png", color: "99, 102, 241" }, // Indigo
  { id: "antigravity_cli", label: "Antigravity CLI", icon: "/antigravity.png", color: "66, 133, 244" }, // Google Blue
  { id: "github_copilot", label: "GitHub Copilot", icon: "/github.png", color: "36, 41, 46" }, // Dark gray/black
  { id: "cursor",         label: "Cursor",         icon: "/cursor.png",         color: "95, 201, 248" }, // Light blue
];

function calculateBarColor(rgb: string, pct: number, isMax: boolean) {
  if (isMax) return `rgb(${rgb})`;
  // Scale opacity based on pct relative to max in its group, min 0.4
  const opacity = 0.4 + (pct / 100) * 0.5;
  return `rgba(${rgb}, ${opacity.toFixed(2)})`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  const { t } = useI18n();
  if (!active || !payload?.length) return null;
  const d: ModelStat = payload[0]?.payload;
  return (
    <div className="bg-card/95 backdrop-blur-sm rounded-xl shadow-xl border border-border px-4 py-3 text-[12px] min-w-44">
      <p className="font-semibold text-foreground mb-2">{label}</p>
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
  
  // Group data by source
  const groups = PLATFORMS.map(p => {
    const models = data.filter(d => d.source === p.id)
      .sort((a, b) => b.totalTokens - a.totalTokens);
    
    const platformTotal = models.reduce((s, m) => s + m.totalTokens, 0);

    return {
      ...p,
      models: models.map(m => ({
        ...m,
        fillColor: calculateBarColor(p.color, (m.totalTokens / overallMaxTokens) * 100, m.totalTokens === overallMaxTokens)
      })),
      platformTotal
    };
  })
    .filter(g => g.models.length > 0)
    .sort((a, b) => b.platformTotal - a.platformTotal);

  return (
    <div key={animationKey} className="space-y-8">
      {groups.map((group, index) => (
        <div key={group.id} className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-700" style={{ animationDelay: `${index * 70}ms` }}>
          {/* Platform Header with Total */}
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center overflow-hidden shadow-sm">
                <Image src={group.icon} alt={group.label} width={16} height={16} style={{ width: 16, height: 16, objectFit: "contain", transform: (group.id === "codex" || group.id === "github_copilot") ? "scale(1.35)" : undefined }} />
              </div>
              <span className="text-[13px] font-bold text-foreground">{group.label}</span>
            </div>
            <div className="flex items-center gap-2 text-[12px]">
              <span className="text-muted-foreground font-medium">{t("common.total")}:</span>
              <span className="font-numeric font-bold text-foreground">{formatK(group.platformTotal)}</span>
              <span className="text-muted-foreground/60 text-[10px]">({Math.round((group.platformTotal / overallTotal) * 100)}%)</span>
            </div>
          </div>

          {/* Recharts Horizontal Bar Chart for this group */}
          <div style={{ height: group.models.length * 32 + 20 }}>
            <ResponsiveContainer width="100%" height={group.models.length * 32 + 20}>
              <BarChart
                data={group.models}
                layout="vertical"
                margin={{ top: 0, right: 90, left: 4, bottom: 0 }}
                barSize={16}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, overallMaxTokens]}
                  hide
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--chart-tick-strong)", fontFamily: "inherit", fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                  width={120}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }} />
                <Bar
                  dataKey="totalTokens"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={shouldAnimate}
                  animationDuration={600}
                  animationEasing="ease-out"
                  animationBegin={index * 70}
                  shape={(sp: any) => {
                    const entry = group.models[sp.index];
                    const isUp = entry ? justIncreased.has(entry.model) : false;
                    const w = Math.max(sp.width || 0, 0);
                    if (w === 0) return <g />;
                    return (
                      <g>
                        <rect
                          x={sp.x} y={sp.y} width={w} height={sp.height}
                          fill={sp.fill}
                          stroke={isUp ? `rgba(${group.color}, 0.7)` : "none"}
                          strokeWidth={isUp ? 1.5 : 0}
                          rx={4} ry={4}
                        />
                        {isUp && (
                          <rect
                            x={sp.x} y={sp.y} width={w} height={sp.height}
                            rx={4} ry={4}
                            fill="rgba(255,255,255,0.28)"
                            style={{ animation: "bar-energy-rise 1s ease-out forwards" }}
                          />
                        )}
                      </g>
                    );
                  }}
                >
                  {group.models.map((entry) => {
                    const isUp = justIncreased.has(entry.model);
                    return (
                      <Cell
                        key={entry.model}
                        fill={isUp ? `rgba(${group.color}, 1)` : entry.fillColor}
                      />
                    );
                  })}
                  <LabelList
                    dataKey="totalTokens"
                    content={(props: any) => {
                      const entry = group.models[props.index];
                      return (
                        <AnimatedLabel
                          key={`label-${entry?.model || props.index}`}
                          {...props}
                          overallTotal={overallTotal}
                          entryKey={entry?.model || props.index}
                          isIncreased={justIncreased.has(entry?.model)}
                        />
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}
