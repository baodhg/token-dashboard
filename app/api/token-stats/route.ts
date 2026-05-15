import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import type { DataPoint, RecentCall, Period } from "@/lib/mock-data";

const PERIOD_MS: Record<Period, number> = {
  "1d": 86_400_000,
  "3d": 259_200_000,
  "5d": 432_000_000,
  "1w": 604_800_000,
  "1m": 2_592_000_000,
  "1y": 31_536_000_000,
};

function buildChartData(
  calls: { inputTokens: number; outputTokens: number; cacheTokens: number; timestamp: Date }[],
  period: Period,
  now: number
): DataPoint[] {
  const DAYS_VI   = ["CN","T2","T3","T4","T5","T6","T7"];
  const MONTHS_VI = ["Th1","Th2","Th3","Th4","Th5","Th6","Th7","Th8","Th9","Th10","Th11","Th12"];
  const todayMidnight = new Date(new Date(now).setHours(0, 0, 0, 0)).getTime();

  type Cfg = { count: number; labelFn: (i: number) => string; bucketFn: (ts: Date) => number };

  const configs: Record<Period, Cfg> = {
    "1d": {
      count: 24,
      labelFn: (i) => `${String(i).padStart(2, "0")}:00`,
      bucketFn: (ts) => ts.getHours(),
    },
    "3d": {
      count: 12,
      labelFn: (i) => `N${Math.floor(i / 4) + 1} ${String((i % 4) * 6).padStart(2, "0")}h`,
      bucketFn: (ts) => Math.max(0, 11 - Math.floor((now - ts.getTime()) / 3_600_000 / 6)),
    },
    "5d": {
      count: 5,
      labelFn: (i) => { const d = new Date(todayMidnight - (4 - i) * 86_400_000); return `${d.getDate()}/${d.getMonth() + 1}`; },
      bucketFn: (ts) => Math.max(0, 4 - Math.floor((todayMidnight - new Date(ts.getFullYear(), ts.getMonth(), ts.getDate()).getTime()) / 86_400_000)),
    },
    "1w": {
      count: 7,
      labelFn: (i) => { const d = new Date(todayMidnight - (6 - i) * 86_400_000); return DAYS_VI[d.getDay()]; },
      bucketFn: (ts) => Math.max(0, 6 - Math.floor((todayMidnight - new Date(ts.getFullYear(), ts.getMonth(), ts.getDate()).getTime()) / 86_400_000)),
    },
    "1m": {
      count: 30,
      labelFn: (i) => { const d = new Date(todayMidnight - (29 - i) * 86_400_000); return `${d.getDate()}/${d.getMonth() + 1}`; },
      bucketFn: (ts) => Math.max(0, 29 - Math.floor((todayMidnight - new Date(ts.getFullYear(), ts.getMonth(), ts.getDate()).getTime()) / 86_400_000)),
    },
    "1y": {
      count: 12,
      labelFn: (i) => MONTHS_VI[i],
      bucketFn: (ts) => ts.getMonth(),
    },
  };

  const { count, labelFn, bucketFn } = configs[period];
  const buckets: DataPoint[] = Array.from({ length: count }, (_, i) => ({
    label: labelFn(i), input: 0, output: 0, cache: 0,
  }));

  for (const c of calls) {
    const idx = bucketFn(c.timestamp);
    if (idx >= 0 && idx < count) {
      buckets[idx].input  += c.inputTokens;
      buckets[idx].output += c.outputTokens;
      buckets[idx].cache  += c.cacheTokens;
    }
  }

  return buckets;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") ?? "1w") as Period;
  const now = Date.now();
  const since = new Date(now - PERIOD_MS[period]);

  const rows = await prisma.call.findMany({
    where: { timestamp: { gte: since } },
    orderBy: { timestamp: "desc" },
    select: {
      id: true, model: true,
      inputTokens: true, outputTokens: true, cacheTokens: true,
      cost: true, timestamp: true,
    },
  });

  const chartData = buildChartData(rows, period, now);

  const calls: RecentCall[] = rows.map((r: typeof rows[number]) => ({
    id:            r.id,
    model:         r.model,
    input_tokens:  r.inputTokens,
    output_tokens: r.outputTokens,
    cache_tokens:  r.cacheTokens,
    cost:          r.cost,
    timestamp:     r.timestamp.toLocaleString("vi-VN"),
  }));

  return Response.json({ chartData, calls });
}
