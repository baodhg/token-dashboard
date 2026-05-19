"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { DataPoint, Period } from "@/lib/mock-data";
import { useI18n } from "@/lib/i18n-context";

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
    <div className="bg-card/95 backdrop-blur-sm rounded-xl shadow-xl border border-border px-4 py-3 text-sm min-w-40">
      <p className="font-semibold text-foreground mb-2 font-numeric">{label}</p>
      {payload.map((p: { name: string; value: number; color: string; dataKey: string }) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-0.5">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-[11px]">{p.name}</span>
          </div>
          <span className="font-numeric text-[12px] font-bold text-foreground">{formatK(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomLegend({ payload }: any) {
  return (
    <div className="flex items-center gap-5 justify-end mb-4">
      {payload?.map((p: { value: string; color: string }) => (
        <span key={p.value} className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: p.color }} />
          {p.value}
        </span>
      ))}
    </div>
  );
}

const X_INTERVAL: Record<Exclude<Period, "custom">, number> = {
  "1d": 239, // Labels every 4 hours (240 mins) if data is per minute
  "3d": 2,   
  "1w": 0,
  "1m": 4,   
  "all": 3,  
};

function getInterval(p: Period, len: number) {
  if (p === "custom") return Math.max(0, Math.floor(len / 8));
  if (p === "1d") {
    // If it's 1d and data is per-minute (1440 points), show label every 4h (240 mins)
    return len > 1000 ? 239 : 3;
  }
  return X_INTERVAL[p] ?? 0;
}

export default function TokenChart({ data, period }: Props) {
  const { t } = useI18n();
  const maxVal = Math.max(...data.map(d => d.input + d.output), 1);
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((maxVal / 4) * i));

  const needsAngle = period === "1m" || (period === "1d" && data.length < 1000) || period === "all" || (period === "custom" && data.length > 7);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 20, right: 8, left: 4, bottom: needsAngle ? 16 : 0 }}>
        <defs>
          <linearGradient id="colorInput" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorOutput" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
        <XAxis
          dataKey="label"
          interval={getInterval(period, data.length)}
          tick={{
            fontSize: 10,
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
          domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.1)]}
          tick={{ fontSize: 10, fill: "var(--chart-tick)", fontFamily: "inherit" }}
          axisLine={false}
          tickLine={false}
          width={45}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend content={<CustomLegend />} verticalAlign="top" />
        <Area
          type="monotone"
          dataKey="input"
          name={t("common.input")}
          stroke="#6366f1"
          strokeWidth={2.5}
          fillOpacity={1}
          fill="url(#colorInput)"
          dot={false}
          activeDot={{ r: 5, strokeWidth: 0, fill: "#6366f1" }}
        />
        <Area
          type="monotone"
          dataKey="output"
          name={t("common.output")}
          stroke="#a855f7"
          strokeWidth={2.5}
          fillOpacity={1}
          fill="url(#colorOutput)"
          dot={false}
          activeDot={{ r: 5, strokeWidth: 0, fill: "#a855f7" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
