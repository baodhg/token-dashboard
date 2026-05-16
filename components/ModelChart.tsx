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

const MODEL_COLORS: Record<string, string> = {
  "Opus 4.7":        "#7c3aed",
  "Opus 4.6":        "#8b5cf6",
  "Opus 4.5":        "#6d28d9",
  "Sonnet 4.6":      "#4f46e5",
  "Sonnet 4.5":      "#4338ca",
  "Haiku 4.5":       "#0891b2",
  "Flash 3 Preview": "#22d3ee",
  "Pro 3.1 Preview": "#06b6d4",
  "Pro 2.5":         "#0891b2",
  "OpenAI Codex":    "#f59e0b",
  "GPT-5.3 Codex":   "#fbbf24",
  "Codex":           "#d97706",
};

function barColor(label: string) {
  return MODEL_COLORS[label] ?? "#6366f1";
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
  const dataWithPct = data.map(d => ({
    ...d,
    pct: total > 0 ? Math.round((d.totalTokens / total) * 100) : 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={208}>
      <BarChart
        data={dataWithPct}
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
          {data.map((entry) => (
            <Cell key={entry.model} fill={barColor(entry.label)} />
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
