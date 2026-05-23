"use client";

import React from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { DataPoint, Period } from "@/lib/mock-data";
import { useI18n } from "@/lib/i18n-context";

interface Props {
  data: DataPoint[];
  period: Period;
  animationKey?: number;
}

const INPUT_COLOR  = "#3b82f6"; // blue-500
const OUTPUT_COLOR = "#10b981"; // emerald-500

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
  "1d": 239,
  "3d": 2,
  "1w": 0,
  "1m": 4,
  "all": 3,
};

function getInterval(p: Period, len: number) {
  if (p === "custom") return Math.max(0, Math.floor(len / 8));
  if (p === "1d") return 5; // Every 6th point (1 hour) for 10-minute data
  return X_INTERVAL[p] ?? 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PeakDot(props: any) {
  const { cx, cy, index, peakIndex, totalPoints, color, boxColor, yShift = 0, label } = props;
  if (index !== peakIndex || cx == null || cy == null) return null;

  const boxW  = Math.max(label.length * 7 + 14, 42);
  const boxH  = 20;

  const flipLeft = peakIndex > totalPoints * 0.7;
  const offsetX  = flipLeft ? -(boxW + 22) : 22;
  const bx       = cx + offsetX;
  const by       = cy - 34 + yShift;
  const lineEndX = flipLeft ? bx + boxW : bx;

  return (
    <g key={`peak-${index}-${color}`}>
      {/* Pulse rings */}
      <circle cx={cx} cy={cy} r={6} fill="none" stroke={color} strokeWidth={1.5}>
        <animate attributeName="r"       values="6;20"    dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0"   dur="1.6s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={6} fill="none" stroke={color} strokeWidth={1}>
        <animate attributeName="r"       values="6;20"    dur="1.6s" begin="0.55s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0"   dur="1.6s" begin="0.55s" repeatCount="indefinite" />
      </circle>
      {/* Center dot */}
      <circle cx={cx} cy={cy} r={4} fill={color} stroke="white" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={2} fill="white">
        <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
      </circle>
      {/* Callout line */}
      <line
        x1={cx} y1={cy - 5}
        x2={lineEndX} y2={by + boxH / 2}
        stroke={color} strokeWidth={1} strokeDasharray="3 2" opacity={0.7}
      />
      {/* Callout box */}
      <rect x={bx} y={by} width={boxW} height={boxH} rx={4} ry={4}
        fill={boxColor} stroke={color} strokeWidth={1} opacity={0.92}
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

export default function TokenChart({ data, period, animationKey = 0 }: Props) {
  const { t } = useI18n();
  const maxVal = Math.max(...data.map(d => d.input + d.output), 1);
  const ticks  = Array.from({ length: 5 }, (_, i) => Math.round((maxVal / 4) * i));
  const needsAngle = period === "1m" || period === "1d" || period === "all" || (period === "custom" && data.length > 7);

  const inputPeakIdx  = data.reduce((mi, p, i) => (p.input  ?? 0) > (data[mi]?.input  ?? 0) ? i : mi, 0);
  const outputPeakIdx = data.reduce((mi, p, i) => (p.output ?? 0) > (data[mi]?.output ?? 0) ? i : mi, 0);

  // Shift output callout up a bit when both peaks land on the same x to avoid overlap
  const outputShift = outputPeakIdx === inputPeakIdx ? -28 : 0;
  
  const shouldAnimate = data.length <= 300;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart key={animationKey} data={data} margin={{ top: 20, right: 8, left: 4, bottom: needsAngle ? 16 : 0 }}>
        <defs>
          <linearGradient id="colorInput" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={INPUT_COLOR}  stopOpacity={0.3}/>
            <stop offset="95%" stopColor={INPUT_COLOR}  stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorOutput" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={OUTPUT_COLOR} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={OUTPUT_COLOR} stopOpacity={0}/>
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
          stroke={INPUT_COLOR}
          strokeWidth={2.5}
          fillOpacity={1}
          fill="url(#colorInput)"
          dot={<PeakDot peakIndex={inputPeakIdx} label={formatK(data[inputPeakIdx]?.input ?? 0)} totalPoints={data.length} color={INPUT_COLOR} boxColor="#1e40af" />}
          activeDot={{ r: 5, strokeWidth: 0, fill: INPUT_COLOR }}
          isAnimationActive={shouldAnimate}
          animationDuration={700}
          animationEasing="ease-out"
        />
        <Area
          type="monotone"
          dataKey="output"
          name={t("common.output")}
          stroke={OUTPUT_COLOR}
          strokeWidth={2.5}
          fillOpacity={1}
          fill="url(#colorOutput)"
          dot={<PeakDot peakIndex={outputPeakIdx} label={formatK(data[outputPeakIdx]?.output ?? 0)} totalPoints={data.length} color={OUTPUT_COLOR} boxColor="#065f46" yShift={outputShift} />}
          activeDot={{ r: 5, strokeWidth: 0, fill: OUTPUT_COLOR }}
          isAnimationActive={shouldAnimate}
          animationDuration={900}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
