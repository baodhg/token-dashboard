"use client";

import React from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import type { DataPoint, Period } from "@/lib/mock-data";
import { useI18n } from "@/lib/i18n-context";

interface Props {
  data: DataPoint[];
  period: Period;
  animationKey?: number;
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
  if (p === "1d") return 17; // Every 18th point (3 hours) for 10-minute data (Cache Chart is narrow)
  return X_INTERVAL[p] ?? 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PeakPulseDot(props: any) {
  const { cx, cy, index, peakIndex, totalPoints, label } = props;
  if (index !== peakIndex || cx == null || cy == null) return null;

  const boxW = Math.max(label.length * 7 + 14, 42);
  const boxH = 20;

  // Flip callout to left if peak is in the right 30% of chart
  const flipLeft = peakIndex > totalPoints * 0.7;
  const offsetX = flipLeft ? -(boxW + 22) : 22;
  const bx = cx + offsetX;
  const by = cy - 34;
  const lineEndX = flipLeft ? bx + boxW : bx;

  return (
    <g key={`peak-${index}`}>
      {/* Pulse rings */}
      <circle cx={cx} cy={cy} r={6} fill="none" stroke="#06b6d4" strokeWidth={1.5}>
        <animate attributeName="r" values="6;20" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={6} fill="none" stroke="#06b6d4" strokeWidth={1}>
        <animate attributeName="r" values="6;20" dur="1.6s" begin="0.55s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0" dur="1.6s" begin="0.55s" repeatCount="indefinite" />
      </circle>
      {/* Center dot */}
      <circle cx={cx} cy={cy} r={4} fill="#06b6d4" stroke="white" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={2} fill="white">
        <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
      </circle>
      {/* Callout line */}
      <line
        x1={cx} y1={cy - 5}
        x2={lineEndX} y2={by + boxH / 2}
        stroke="#06b6d4" strokeWidth={1} strokeDasharray="3 2" opacity={0.7}
      />
      {/* Callout box */}
      <rect
        x={bx} y={by}
        width={boxW} height={boxH}
        rx={4} ry={4}
        fill="#0e7490" stroke="#06b6d4" strokeWidth={1} opacity={0.92}
      />
      <text
        x={bx + boxW / 2} y={by + boxH / 2 + 1}
        textAnchor="middle" dominantBaseline="middle"
        fill="white" fontSize={11} fontWeight={700} fontFamily="inherit"
      >
        {label}
      </text>
    </g>
  );
}

export default function CacheChart({ data, period, animationKey = 0 }: Props) {
  const { t } = useI18n();
  const needsAngle = period === "1m" || period === "1d" || period === "all" || (period === "custom" && data.length > 7);

  const peakIndex = data.reduce(
    (maxIdx, point, idx) => (point.cache ?? 0) > (data[maxIdx]?.cache ?? 0) ? idx : maxIdx,
    0
  );

  const shouldAnimate = data.length <= 300;

  return (
    <ResponsiveContainer width="100%" height={256}>
      <AreaChart
        key={animationKey}
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
          dot={<PeakPulseDot peakIndex={peakIndex} label={formatK(data[peakIndex]?.cache ?? 0)} totalPoints={data.length} />}
          activeDot={{ r: 5, strokeWidth: 0, fill: "#06b6d4" }}
          isAnimationActive={shouldAnimate}
          animationDuration={700}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
