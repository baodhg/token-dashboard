"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
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
  const { t } = useI18n();
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/95 backdrop-blur-sm rounded-xl shadow-xl border border-border px-4 py-3 text-sm min-w-35">
      <p className="font-semibold text-foreground mb-1 font-numeric">{label}</p>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="w-2 h-2 rounded-full shrink-0 bg-cyan-500" />
          <span className="text-[11px]">{t("common.cache_read")}</span>
        </div>
        <span className="font-numeric text-[12px] font-bold text-foreground">
          {formatK(payload[0].value)}
        </span>
      </div>
    </div>
  );
}

const X_INTERVAL: Record<Exclude<Period, "custom">, number> = {
  "1d": 239,
  "3d": 2,
  "1w": 0,
  "1m": 4,
  "all": 3,
};

function getInterval(p: Period, len: number) {
  if (p === "custom") return Math.max(0, Math.floor(len / 8));
  if (p === "1d") {
    return len > 1000 ? 239 : 3;
  }
  return X_INTERVAL[p] ?? 0;
}

export default function CacheChart({ data, period }: Props) {
  const { t } = useI18n();
  const needsAngle = period === "1m" || (period === "1d" && data.length < 1000) || period === "all" || (period === "custom" && data.length > 7);

  return (
    <ResponsiveContainer width="100%" height={256}>
      <AreaChart
        data={data}
        margin={{ top: 20, right: 8, left: 4, bottom: needsAngle ? 16 : 0 }}
      >
        <defs>
          <linearGradient id="colorCache" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
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
          tickFormatter={formatK}
          domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]}
          tick={{ fontSize: 10, fill: "var(--chart-tick)", fontFamily: "inherit" }}
          axisLine={false}
          tickLine={false}
          width={45}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="cache"
          name={t("common.cache_read")}
          stroke="#06b6d4"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorCache)"
          dot={false}
          activeDot={{ r: 5, strokeWidth: 0, fill: "#06b6d4" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
