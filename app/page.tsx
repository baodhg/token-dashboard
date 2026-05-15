"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Settings, Zap, ArrowDownLeft, ArrowUpRight, Database, DollarSign } from "lucide-react";
import {
  PERIODS,
  calcSummary,
  type Period,
  type DataPoint,
  type RecentCall,
} from "@/lib/mock-data";

const TokenChart = dynamic(() => import("@/components/TokenChart"), { ssr: false });

function formatK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const MODEL_BADGE: Record<string, { label: string; color: string }> = {
  "claude-opus-4-7":   { label: "Opus",   color: "bg-violet-100 text-violet-700" },
  "claude-sonnet-4-6": { label: "Sonnet", color: "bg-indigo-100 text-indigo-700" },
  "claude-haiku-4-5":  { label: "Haiku",  color: "bg-cyan-100 text-cyan-700" },
  "claude-haiku-4-5-20251001": { label: "Haiku", color: "bg-cyan-100 text-cyan-700" },
};

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>("1w");
  const [chartData, setChartData] = useState<DataPoint[]>([]);
  const [calls, setCalls] = useState<RecentCall[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/token-stats?period=${period}`)
      .then(r => r.json())
      .then(data => {
        setChartData(data.chartData ?? []);
        setCalls(data.calls ?? []);
      })
      .catch(() => {
        setChartData([]);
        setCalls([]);
      })
      .finally(() => setLoading(false));
  }, [period]);

  const summary = useMemo(() => calcSummary(chartData), [chartData]);

  const stats = [
    {
      label: "Tổng tokens",
      value: formatK(summary.total),
      sub: `${calls.length} lượt gọi`,
      icon: Zap,
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-600",
    },
    {
      label: "Input tokens",
      value: formatK(summary.totalInput),
      sub: summary.total > 0 ? `${((summary.totalInput / summary.total) * 100).toFixed(0)}% tổng` : "—",
      icon: ArrowDownLeft,
      iconBg: "bg-purple-50",
      iconColor: "text-purple-600",
    },
    {
      label: "Output tokens",
      value: formatK(summary.totalOutput),
      sub: summary.total > 0 ? `${((summary.totalOutput / summary.total) * 100).toFixed(0)}% tổng` : "—",
      icon: ArrowUpRight,
      iconBg: "bg-violet-50",
      iconColor: "text-violet-600",
    },
    {
      label: "Chi phí ước tính",
      value: `$${summary.cost.toFixed(4)}`,
      sub: "Giá tham khảo",
      icon: DollarSign,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f2f2f7]">
      {/* Header */}
      <header className="bg-white border-b border-black/6 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Database className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-[15px] text-[#1c1c1e]">Token Dashboard</span>
          </div>
          <Link
            href="/settings"
            className="w-8 h-8 rounded-full bg-[#f2f2f7] hover:bg-[#e5e5ea] flex items-center justify-center transition-colors"
          >
            <Settings className="w-4 h-4 text-[#3c3c43]" />
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Period selector */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer ${
                period === key
                  ? "bg-[#1c1c1e] text-white shadow-sm"
                  : "bg-white text-[#3c3c43] border border-black/7 hover:border-black/15"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl p-4 border border-black/5 shadow-sm">
              <div className={`w-8 h-8 rounded-xl ${s.iconBg} flex items-center justify-center mb-3`}>
                <s.icon className={`w-4 h-4 ${s.iconColor}`} />
              </div>
              <p className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wide mb-1">{s.label}</p>
              <p className={`text-[22px] font-bold text-[#1c1c1e] leading-tight tracking-tight ${loading ? "opacity-40" : ""}`}>
                {loading ? "···" : s.value}
              </p>
              <p className="text-[11px] text-[#aeaeb2] mt-1">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="bg-white rounded-2xl p-5 border border-black/5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[15px] text-[#1c1c1e]">Biểu đồ sử dụng</h2>
            <div className="flex items-center gap-4">
              {[
                { color: "#6366f1", label: "Input" },
                { color: "#a855f7", label: "Output" },
                { color: "#06b6d4", label: "Cache read" },
              ].map((l) => (
                <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-[#8e8e93]">
                  <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="h-65 flex items-center justify-center text-[#aeaeb2] text-sm">
              Đang tải dữ liệu…
            </div>
          ) : chartData.every(d => d.input === 0 && d.output === 0) ? (
            <div className="h-65 flex items-center justify-center text-[#aeaeb2] text-sm">
              Không có dữ liệu trong khoảng thời gian này
            </div>
          ) : (
            <TokenChart data={chartData} />
          )}
        </div>

        {/* Recent calls */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
            <h2 className="font-semibold text-[15px] text-[#1c1c1e]">Lịch sử gọi API</h2>
            <span className="text-[12px] text-[#aeaeb2]">{calls.length} bản ghi</span>
          </div>

          {calls.length === 0 && !loading ? (
            <div className="px-5 py-10 text-center text-[13px] text-[#aeaeb2]">
              Không có lịch sử trong khoảng này
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-black/4">
                      {["Model", "Input", "Output", "Cache read", "Chi phí", "Thời gian"].map((h) => (
                        <th
                          key={h}
                          className="text-left px-5 py-2.5 text-[11px] font-semibold text-[#aeaeb2] uppercase tracking-wide"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {calls.slice(0, 15).map((c, i) => {
                      const badge = MODEL_BADGE[c.model] ?? { label: c.model, color: "bg-gray-100 text-gray-600" };
                      return (
                        <tr
                          key={c.id}
                          className={`hover:bg-[#f9f9fb] transition-colors ${
                            i < Math.min(calls.length, 15) - 1 ? "border-b border-black/3" : ""
                          }`}
                        >
                          <td className="px-5 py-3">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 font-medium text-[#1c1c1e]">{c.input_tokens.toLocaleString()}</td>
                          <td className="px-5 py-3 text-[#3c3c43]">{c.output_tokens.toLocaleString()}</td>
                          <td className="px-5 py-3 text-[#8e8e93]">{c.cache_tokens.toLocaleString()}</td>
                          <td className="px-5 py-3 text-emerald-600 font-semibold">${c.cost.toFixed(5)}</td>
                          <td className="px-5 py-3 text-[#aeaeb2]">{c.timestamp}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile list */}
              <div className="sm:hidden divide-y divide-black/4">
                {calls.slice(0, 12).map((c) => {
                  const badge = MODEL_BADGE[c.model] ?? { label: c.model, color: "bg-gray-100 text-gray-600" };
                  return (
                    <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>
                            {badge.label}
                          </span>
                          <span className="text-[11px] text-[#aeaeb2] truncate">{c.timestamp}</span>
                        </div>
                        <p className="text-[12px] text-[#3c3c43]">
                          ↓ {c.input_tokens.toLocaleString()} · ↑ {c.output_tokens.toLocaleString()}
                        </p>
                      </div>
                      <span className="text-[13px] font-semibold text-emerald-600 shrink-0">
                        ${c.cost.toFixed(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
