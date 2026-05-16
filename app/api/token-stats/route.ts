import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import type { DataPoint, Period } from "@/lib/mock-data";

const PERIOD_MS: Record<Period, number> = {
  "1d": 86_400_000,
  "3d": 259_200_000,
  "5d": 432_000_000,
  "1w": 604_800_000,
  "1m": 2_592_000_000,
  "1y": 31_536_000_000,
};

const MODEL_LABEL: Record<string, string> = {
  "claude-opus-4-7":           "Opus 4.7",
  "claude-opus-4-5":           "Opus 4.5",
  "claude-sonnet-4-6":         "Sonnet 4.6",
  "claude-sonnet-4-5":         "Sonnet 4.5",
  "claude-haiku-4-5":          "Haiku 4.5",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
};

function modelLabel(model: string) {
  return MODEL_LABEL[model] ?? model;
}

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

function cleanProject(project: string | null, source: string): string {
  if (!project) return source === "cline" ? "Cline" : "Unknown";
  const prefix = "c--users-admin-desktop-";
  if (project.toLowerCase().startsWith(prefix)) return project.slice(prefix.length);
  return project;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") ?? "1w") as Period;
  const sourceFilter = searchParams.get("source") ?? "all";
  const now = Date.now();
  const since = new Date(now - PERIOD_MS[period]);

  const where = {
    timestamp: { gte: since },
    ...(sourceFilter !== "all" ? { source: sourceFilter } : {}),
  };

  const [rows, agg, rawSessions, rawModels, rawPlatforms] = await Promise.all([
    prisma.call.findMany({
      where,
      select: { inputTokens: true, outputTokens: true, cacheTokens: true, timestamp: true },
    }),

    prisma.call.aggregate({
      where,
      _sum: { inputTokens: true, outputTokens: true, cacheTokens: true, cost: true },
      _count: { id: true },
    }),

    prisma.call.groupBy({
      by: ["sessionId", "project", "source"],
      where,
      _sum: { inputTokens: true, outputTokens: true, cacheTokens: true, cost: true },
      _min: { timestamp: true },
      _count: { id: true },
      orderBy: [{ _min: { timestamp: "desc" } }],
      take: 20,
    }),

    prisma.call.groupBy({
      by: ["model"],
      where,
      _sum: { inputTokens: true, outputTokens: true, cacheTokens: true, cost: true },
      _count: { id: true },
      orderBy: [{ _sum: { inputTokens: "desc" } }],
    }),

    prisma.call.groupBy({
      by: ["source"],
      where: { timestamp: { gte: since } }, // always all sources for platform overview
      _sum: { inputTokens: true, outputTokens: true, cacheTokens: true, cost: true },
      _count: { id: true },
    }),
  ]);

  const chartData = buildChartData(rows, period, now);

  const summary = {
    totalInput:  agg._sum.inputTokens  ?? 0,
    totalOutput: agg._sum.outputTokens ?? 0,
    totalCache:  agg._sum.cacheTokens  ?? 0,
    total: (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0) + (agg._sum.cacheTokens ?? 0),
    totalCost:   agg._sum.cost ?? 0,
    callCount:   agg._count.id,
  };

  const sessionStats = rawSessions.map(s => ({
    sessionId:   s.sessionId,
    project:     cleanProject(s.project, s.source),
    source:      s.source,
    startTime:   s._min.timestamp?.toISOString() ?? "",
    callCount:   s._count.id,
    totalInput:  s._sum.inputTokens  ?? 0,
    totalOutput: s._sum.outputTokens ?? 0,
    totalCache:  s._sum.cacheTokens  ?? 0,
    totalCost:   s._sum.cost         ?? 0,
  }));

  const modelStats = rawModels.map(m => ({
    model:       m.model,
    label:       modelLabel(m.model),
    callCount:   m._count.id,
    totalInput:  m._sum.inputTokens  ?? 0,
    totalOutput: m._sum.outputTokens ?? 0,
    totalCache:  m._sum.cacheTokens  ?? 0,
    totalCost:   m._sum.cost         ?? 0,
    totalTokens: (m._sum.inputTokens ?? 0) + (m._sum.outputTokens ?? 0),
  }));

  const platformStats = rawPlatforms.map(p => ({
    source:      p.source,
    label:       p.source === "claude_code" ? "Claude Code" : p.source === "cline" ? "Cline" : p.source,
    callCount:   p._count.id,
    totalInput:  p._sum.inputTokens  ?? 0,
    totalOutput: p._sum.outputTokens ?? 0,
    totalCache:  p._sum.cacheTokens  ?? 0,
    totalCost:   p._sum.cost         ?? 0,
    totalTokens: (p._sum.inputTokens ?? 0) + (p._sum.outputTokens ?? 0),
  }));

  return Response.json({ chartData, summary, sessionStats, modelStats, platformStats });
}
