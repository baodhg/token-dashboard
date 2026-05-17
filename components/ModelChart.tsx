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
  { id: "gemini",      label: "Gemini CLI",  icon: "/geminicli.png", color: "66, 133, 244" }, // Blue
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
    <div className="bg-card rounded-xl shadow-lg border border-border px-4 py-3 text-[12px] min-w-40">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      <div className="space-y-1 text-[#3c3c43] dark:text-[#c7c7cc]">
        <div className="flex justify-between gap-6">
          <span>{t("common.input")}</span>
          <span className="font-numeric font-semibold">{formatK(d.totalInput)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span>{t("common.output")}</span>
          <span className="font-numeric font-semibold">{formatK(d.totalOutput)}</span>
        </div>
        <div className="flex justify-between gap-6 pt-1 border-t border-border text-foreground">
          <span>{t("common.calls")}</span>
          <span className="font-numeric font-semibold">{d.callCount.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

export default function ModelChart({ data }: Props) {
  const { t } = useI18n();
  if (!data.length) {
    return (
      <div className="h-full flex items-center justify-center text-[#aeaeb2] dark:text-[#6e6e72] text-sm">
        {t("common.no_data")}
      </div>
    );
  }

  const overallTotal = data.reduce((s, d) => s + d.totalTokens, 0);
  
  // Group data by source
  const groups = PLATFORMS.map(p => {
    const models = data.filter(d => d.source === p.id)
      .sort((a, b) => b.totalTokens - a.totalTokens);
    
    const platformTotal = models.reduce((s, m) => s + m.totalTokens, 0);
    const maxInGroup = models.length > 0 ? models[0].totalTokens : 0;

    return {
      ...p,
      models: models.map(m => ({
        ...m,
        groupMax: maxInGroup,
        fillColor: calculateBarColor(p.color, (m.totalTokens / (maxInGroup || 1)) * 100, m.totalTokens === maxInGroup)
      })),
      platformTotal
    };
  }).filter(g => g.models.length > 0);

  return (
    <div className="space-y-8">
      {groups.map(group => (
        <div key={group.id} className="space-y-3">
          {/* Platform Header with Total */}
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                <Image src={group.icon} alt={group.label} width={16} height={16} style={{ width: 16, height: 16, objectFit: "contain", transform: (group.id === "codex" || group.id === "github_copilot") ? "scale(1.35)" : undefined }} />
              </div>
              <span className="text-[13px] font-bold text-foreground">{group.label}</span>
            </div>
            <div className="flex items-center gap-2 text-[12px]">
              <span className="text-[#8e8e93] font-medium">{t("common.total")}:</span>
              <span className="font-numeric font-bold text-foreground">{formatK(group.platformTotal)}</span>
              <span className="text-[#aeaeb2] dark:text-[#6e6e72] text-[10px]">({Math.round((group.platformTotal / overallTotal) * 100)}%)</span>
            </div>
          </div>

          {/* Recharts Horizontal Bar Chart for this group */}
          <div style={{ height: group.models.length * 32 + 20 }}>
            <ResponsiveContainer width="100%" height={group.models.length * 32 + 20}>
              <BarChart
                data={group.models}
                layout="vertical"
                margin={{ top: 0, right: 40, left: 4, bottom: 0 }}
                barSize={16}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                <XAxis
                  type="number"
                  hide
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--chart-tick-strong)", fontFamily: "inherit" }}
                  axisLine={false}
                  tickLine={false}
                  width={100}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--chart-grid)" }} />
                <Bar dataKey="totalTokens" radius={[0, 4, 4, 0]}>
                  {group.models.map((entry) => (
                    <Cell key={entry.model} fill={entry.fillColor} />
                  ))}
                  <LabelList
                    dataKey="totalTokens"
                    position="right"
                    style={{ fontSize: 10, fill: "var(--chart-tick)", fontFamily: "inherit", fontWeight: 600 }}
                    formatter={(v) => {
                      const n = Number(v) || 0;
                      const pct = Math.round((n / group.platformTotal) * 100);
                      return `${formatK(n)} (${pct}%)`;
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
