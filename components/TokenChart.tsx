"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { DataPoint, Period } from "@/lib/mock-data";

interface Props {
  data: DataPoint[];
  period: Period;
}

function formatK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card rounded-xl shadow-lg border border-border px-4 py-3 text-sm min-w-35">
      <p className="font-semibold text-foreground mb-2 font-numeric">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }) => (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-0.5">
          <div className="flex items-center gap-1.5 text-[#3c3c43] dark:text-[#c7c7cc]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-[11px]">{p.name}</span>
          </div>
          <span className="font-numeric text-[12px] font-semibold text-foreground">{formatK(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomLegend({ payload }: any) {
  return (
    <div className="flex items-center gap-5 justify-end mb-2">
      {payload?.map((p: { value: string; color: string }) => (
        <span key={p.value} className="flex items-center gap-1.5 text-[11px] text-[#8e8e93] dark:text-[#98989d]">
          <span className="w-8 h-0.5 inline-block rounded-full" style={{ background: p.color }} />
          {p.value}
        </span>
      ))}
    </div>
  );
}

const X_INTERVAL: Record<Period, number> = {
  "1d": 3,   // every 4 hours → 6 labels
  "3d": 2,   // every 3rd point → 4 labels
  "5d": 0,
  "1w": 0,
  "1m": 4,   // every 5 days → 6 labels
  "1y": 0,
};

export default function TokenChart({ data, period }: Props) {
  const maxVal = Math.max(...data.map(d => d.input + d.output), 1);
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((maxVal / 4) * i));

  const needsAngle = period === "1m" || period === "1d";

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 4, bottom: needsAngle ? 16 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
        <XAxis
          dataKey="label"
          interval={X_INTERVAL[period]}
          tick={{
            fontSize: 11,
            fill: "var(--chart-tick)",
            fontFamily: "inherit",
            ...(needsAngle ? { angle: -35, textAnchor: "end", dy: 4 } : {}),
          }}
          axisLine={false}
          tickLine={false}
          height={needsAngle ? 48 : 28}
        />
        <YAxis
          ticks={ticks}
          tickFormatter={formatK}
          tick={{ fontSize: 11, fill: "var(--chart-tick)", fontFamily: "inherit" }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend content={<CustomLegend />} verticalAlign="top" />
        <Line
          type="linear"
          dataKey="input"
          name="Input"
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0, fill: "#6366f1" }}
        />
        <Line
          type="linear"
          dataKey="output"
          name="Output"
          stroke="#a855f7"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0, fill: "#a855f7" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
