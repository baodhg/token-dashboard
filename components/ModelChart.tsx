"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts";

export interface ModelStat {
  model: string;
  label: string;
  totalInput: number;
  totalOutput: number;
  totalTokens: number;
  callCount: number;
}

interface Props {
  data: ModelStat[];
}

function formatK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const PLATFORM_COLORS: Record<string, string> = {
  "claude": "124, 58, 237", // Purple for Claude
  "gemini": "34, 211, 238",  // Cyan for Gemini
  "codex":  "245, 158, 11",   // Amber for Codex
};

function getPlatform(label: string) {
  if (label.includes("Opus") || label.includes("Sonnet") || label.includes("Haiku")) return "claude";
  if (label.includes("Gemini") || label.includes("Preview") || label.includes("Pro")) return "gemini";
  if (label.includes("Codex")) return "codex";
  return "claude"; // Default
}

function calculateBarColor(platform: string, pct: number, isMax: boolean) {
  const rgb = PLATFORM_COLORS[platform] ?? "99, 102, 241"; // Default Indigo
  if (isMax) return `rgb(${rgb})`;
  
  // Scale opacity based on pct, min 0.3, max 0.85
  const opacity = 0.3 + (pct / 100) * 0.55;
  return `rgba(${rgb}, ${opacity.toFixed(2)})`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d: ModelStat = payload[0]?.payload;
  return (
    <div className="bg-card rounded-xl shadow-lg border border-border px-4 py-3 text-[12px] min-w-40">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      <div className="space-y-1 text-[#3c3c43] dark:text-[#c7c7cc]">
        <div className="flex justify-between gap-6">
          <span>Input</span>
          <span className="font-numeric font-semibold">{formatK(d.totalInput)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span>Output</span>
          <span className="font-numeric font-semibold">{formatK(d.totalOutput)}</span>
        </div>
        <div className="flex justify-between gap-6 pt-1 border-t border-border text-foreground">
          <span>Calls</span>
          <span className="font-numeric font-semibold">{d.callCount.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

export default function ModelChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="h-full flex items-center justify-center text-[#aeaeb2] dark:text-[#6e6e72] text-sm">
        Không có dữ liệu
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.totalTokens, 0);
  
  // Group by platform to find max per platform for color scaling
  const platformMaxes: Record<string, number> = {};
  const dataWithPctAndColor = data.map(d => {
    const pct = total > 0 ? Math.round((d.totalTokens / total) * 100) : 0;
    const platform = getPlatform(d.label);
    if (!platformMaxes[platform] || d.totalTokens > platformMaxes[platform]) {
      platformMaxes[platform] = d.totalTokens;
    }
    return { ...d, pct, platform };
  }).map(d => ({
    ...d,
    fillColor: calculateBarColor(d.platform, (d.totalTokens / platformMaxes[d.platform]) * 100, d.totalTokens === platformMaxes[d.platform])
  }));

  return (
    <ResponsiveContainer width="100%" height={208}>
      <BarChart
        data={dataWithPctAndColor}
        layout="vertical"
        margin={{ top: 0, right: 40, left: 4, bottom: 0 }}
        barSize={18}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={formatK}
          tick={{ fontSize: 10, fill: "var(--chart-tick)", fontFamily: "inherit" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--chart-tick-strong)", fontFamily: "inherit" }}
          axisLine={false}
          tickLine={false}
          width={110}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--chart-grid)" }} />
        <Bar dataKey="totalTokens" name="Tokens" radius={[0, 4, 4, 0]}>
          {dataWithPctAndColor.map((entry) => (
            <Cell key={entry.model} fill={entry.fillColor} />
          ))}
          <LabelList
            dataKey="pct"
            position="right"
            style={{ fontSize: 11, fill: "var(--chart-tick)", fontFamily: "inherit" }}
            formatter={(v: unknown) => `${v}%`}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
