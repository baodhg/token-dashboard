export type Period = "1d" | "3d" | "5d" | "1w" | "1m" | "1y";

export interface DataPoint {
  label: string;
  input: number;
  output: number;
  cache: number;
}

export interface RecentCall {
  id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_tokens: number;
  cost: number;
  timestamp: string;
}

export const PERIODS: { key: Period; label: string }[] = [
  { key: "1d", label: "Hôm nay" },
  { key: "3d", label: "3 ngày" },
  { key: "5d", label: "5 ngày" },
  { key: "1w", label: "Tuần" },
  { key: "1m", label: "Tháng" },
  { key: "1y", label: "Năm" },
];

export function calcSummary(data: DataPoint[]) {
  const totalInput  = data.reduce((s, d) => s + d.input,  0);
  const totalOutput = data.reduce((s, d) => s + d.output, 0);
  const totalCache  = data.reduce((s, d) => s + d.cache,  0);
  const total = totalInput + totalOutput + totalCache;
  const cost  = (totalInput / 1_000_000) * 3 + (totalOutput / 1_000_000) * 15;
  return { total, totalInput, totalOutput, totalCache, cost };
}
