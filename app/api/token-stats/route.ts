import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import type { DataPoint, Period } from "@/lib/mock-data";

const PERIOD_MS: Record<Exclude<Period, "custom">, number> = {
  "1d": 86_400_000,
  "3d": 259_200_000,
  "1w": 604_800_000,
  "1m": 2_592_000_000,
  "all": 315_360_000_000, // 10 years approx
};

const MODEL_LABEL: Record<string, string> = {
  "claude-opus-4-7":           "Opus 4.7",
  "claude-opus-4-6":           "Opus 4.6",
  "claude-opus-4-5":           "Opus 4.5",
  "claude-sonnet-4-6":         "Sonnet 4.6",
  "claude-sonnet-4-5":         "Sonnet 4.5",
  "claude-haiku-4-5":          "Haiku 4.5",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "gemini-3-flash-preview":    "Flash 3 Preview",
  "gemini-3.1-pro-preview":    "Pro 3.1 Preview",
  "gemini-2.5-pro":            "Pro 2.5",
  "openai/codex":              "OpenAI Codex",
  "cx/gpt-5.3-codex-xhigh":    "GPT-5.3 Codex",
  "codex":                     "Codex",
};

function modelLabel(model: string) {
  return MODEL_LABEL[model] ?? model;
}

function buildChartData(
  calls: { inputTokens: number; outputTokens: number; cacheTokens: number; timestamp: Date }[],
  period: Period,
  now: number,
  customSince?: number,
  customTo?: number
): DataPoint[] {
  const DAYS_VI   = ["CN","T2","T3","T4","T5","T6","T7"];
  const MONTHS_VI = ["Th1","Th2","Th3","Th4","Th5","Th6","Th7","Th8","Th9","Th10","Th11","Th12"];
  const todayMidnight = new Date(new Date(now).setHours(0, 0, 0, 0)).getTime();

  type Cfg = { count: number; labelFn: (i: number) => string; bucketFn: (ts: Date) => number };

  let config: Cfg;

  if (period === "custom" && customSince && customTo) {
    const startMidnight = new Date(new Date(customSince).setHours(0, 0, 0, 0)).getTime();
    const endMidnight = new Date(new Date(customTo).setHours(0, 0, 0, 0)).getTime();
    const diffDays = Math.max(1, Math.round((endMidnight - startMidnight) / 86_400_000) + 1);
    
    if (diffDays <= 1) {
       config = {
         count: 24,
         labelFn: (i) => `${String(i).padStart(2, "0")}:00`,
         bucketFn: (ts) => ts.getHours(),
       };
    } else if (diffDays <= 31) {
       config = {
         count: diffDays,
         labelFn: (i) => { const d = new Date(startMidnight + i * 86_400_000); return `${d.getDate()}/${d.getMonth() + 1}`; },
         bucketFn: (ts) => Math.floor((ts.getTime() - startMidnight) / 86_400_000),
       };
    } else {
       const diffMonths = (new Date(customTo).getFullYear() - new Date(customSince).getFullYear()) * 12 + new Date(customTo).getMonth() - new Date(customSince).getMonth() + 1;
       config = {
         count: diffMonths,
         labelFn: (i) => {
            const d = new Date(customSince);
            d.setMonth(d.getMonth() + i);
            return `${MONTHS_VI[d.getMonth()]} ${d.getFullYear()}`;
         },
         bucketFn: (ts) => (ts.getFullYear() - new Date(customSince).getFullYear()) * 12 + ts.getMonth() - new Date(customSince).getMonth(),
       };
    }
  } else {
    const configs: Record<Exclude<Period, "custom">, Cfg> = {
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
      "all": {
        count: 24, // Last 24 months
        labelFn: (i) => {
          const d = new Date(now);
          d.setMonth(d.getMonth() - (23 - i));
          return `${MONTHS_VI[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
        },
        bucketFn: (ts) => {
          const start = new Date(now);
          start.setMonth(start.getMonth() - 23);
          start.setDate(1);
          start.setHours(0, 0, 0, 0);
          const diff = (ts.getFullYear() - start.getFullYear()) * 12 + ts.getMonth() - start.getMonth();
          return diff;
        },
      },
    };
    config = configs[period as Exclude<Period, "custom">];
  }

  const { count, labelFn, bucketFn } = config;
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

interface ProjectStat {
  project: string;
  sources: string[];
  startTime: string;
  endTime: string;
  callCount: number;
  totalInput: number;
  totalOutput: number;
  totalCache: number;
  totalCost: number;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") ?? "1d") as Period;
  const sourceFilter = searchParams.get("source") ?? "all";
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const now = Date.now();
  let since = new Date(now - (PERIOD_MS[period as Exclude<Period, "custom">] ?? PERIOD_MS["1d"]));
  let toDate = new Date(now);

  if (period === "1d") {
    since = new Date(now);
    since.setHours(0, 0, 0, 0);
  } else if (period === "all") {
    since = new Date(0); // Earliest possible date
  } else if (period === "custom" && fromParam && toParam) {
    since = new Date(fromParam);
    since.setHours(0, 0, 0, 0);
    toDate = new Date(toParam);
    toDate.setHours(23, 59, 59, 999);
  }

  const where = {
    timestamp: { gte: since, lte: toDate },
    ...(sourceFilter !== "all" ? { source: sourceFilter } : {}),
  };

  const [rows, agg, rawSessions, rawProjects, rawModels, rawPlatforms] = await Promise.all([
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
      by: ["project", "source"],
      where,
      _sum: { inputTokens: true, outputTokens: true, cacheTokens: true, cost: true },
      _min: { timestamp: true },
      _max: { timestamp: true },
      _count: { id: true },
    }),

    prisma.call.groupBy({
      by: ["model", "source"],
      where,
      _sum: { inputTokens: true, outputTokens: true, cacheTokens: true, cost: true },
      _count: { id: true },
      orderBy: [{ _sum: { inputTokens: "desc" } }],
    }),

    prisma.call.groupBy({
      by: ["source"],
      where: { timestamp: { gte: since, lte: toDate } }, // always all sources for platform overview
      _sum: { inputTokens: true, outputTokens: true, cacheTokens: true, cost: true },
      _count: { id: true },
    }),
  ]);

  const chartData = buildChartData(rows, period, now, since.getTime(), toDate.getTime());

  const summary = {
    totalInput:  agg._sum.inputTokens  ?? 0,
    totalOutput: agg._sum.outputTokens ?? 0,
    totalCache:  agg._sum.cacheTokens  ?? 0,
    total: (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0),
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

  const projectMap = new Map<string, ProjectStat>();
  rawProjects.forEach(p => {
    const name = cleanProject(p.project, p.source);
    const existing = projectMap.get(name);
    if (existing) {
      if (!existing.sources.includes(p.source)) existing.sources.push(p.source);
      existing.callCount += p._count.id;
      existing.totalInput += p._sum.inputTokens ?? 0;
      existing.totalOutput += p._sum.outputTokens ?? 0;
      existing.totalCache += p._sum.cacheTokens ?? 0;
      existing.totalCost += p._sum.cost ?? 0;
      if (p._min.timestamp && new Date(p._min.timestamp) < new Date(existing.startTime)) {
        existing.startTime = p._min.timestamp.toISOString();
      }
      if (p._max.timestamp && new Date(p._max.timestamp) > new Date(existing.endTime)) {
        existing.endTime = p._max.timestamp.toISOString();
      }
    } else {
      projectMap.set(name, {
        project: name,
        sources: [p.source],
        startTime: p._min.timestamp?.toISOString() ?? "",
        endTime: p._max.timestamp?.toISOString() ?? "",
        callCount: p._count.id,
        totalInput: p._sum.inputTokens ?? 0,
        totalOutput: p._sum.outputTokens ?? 0,
        totalCache: p._sum.cacheTokens ?? 0,
        totalCost: p._sum.cost ?? 0,
      });
    }
  });

  const projectStats = Array.from(projectMap.values()).sort((a, b) => b.totalCost - a.totalCost);

  const modelStats = rawModels.map(m => ({
    model:       m.model,
    source:      m.source,
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
    label:       p.source === "claude_code" ? "Claude Code" : 
                 p.source === "cline" ? "Cline" : 
                 p.source === "gemini" ? "Gemini CLI" :
                 p.source === "codex" ? "Codex" :
                 p.source === "github_copilot" ? "GitHub Copilot" : 
                 p.source === "cursor" ? "Cursor" : p.source,
    callCount:   p._count.id,
    totalInput:  p._sum.inputTokens  ?? 0,
    totalOutput: p._sum.outputTokens ?? 0,
    totalCache:  p._sum.cacheTokens  ?? 0,
    totalCost:   p._sum.cost         ?? 0,
    totalTokens: (p._sum.inputTokens ?? 0) + (p._sum.outputTokens ?? 0),
  }));

  return Response.json({ chartData, summary, sessionStats, projectStats, modelStats, platformStats });
}
