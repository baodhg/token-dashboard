"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
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
    <div className="bg-card rounded-xl shadow-lg border border-border px-4 py-3 text-sm min-w-35">
      <p className="font-semibold text-foreground mb-1 font-numeric">{label}</p>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 text-[#3c3c43] dark:text-[#c7c7cc]">
          <span className="w-2 h-2 rounded-full shrink-0 bg-cyan-500" />
          <span className="text-[11px]">{t("common.cache_read")}</span>
        </div>
        <span className="font-numeric text-[12px] font-semibold text-foreground">
          {formatK(payload[0].value)}
        </span>
      </div>
    </div>
  );
}

const X_INTERVAL: Record<Exclude<Period, "custom">, number> = {
  "1d": 3,
  "3d": 2,
  "5d": 0,
  "1w": 0,
  "1m": 4,
  "1y": 0,
};

function getInterval(p: Period, len: number) {
  if (p === "custom") return Math.max(0, Math.floor(len / 8));
  return X_INTERVAL[p] ?? 0;
}

export default function CacheChart({ data, period }: Props) {
  const { t } = useI18n();
  const needsAngle = period === "1m" || period === "1d" || (period === "custom" && data.length > 7);

  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 8, left: 4, bottom: needsAngle ? 16 : 0 }}
        barSize={period === "1d" ? 16 : period === "1m" ? 12 : 28}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
        <XAxis
          dataKey="label"
          interval={getInterval(period, data.length)}
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
          tickFormatter={formatK}
          tick={{ fontSize: 11, fill: "var(--chart-tick)", fontFamily: "inherit" }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(6,182,212,0.06)" }} />
        <Bar dataKey="cache" name={t("common.cache_read")} fill="#06b6d4" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
