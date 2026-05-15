import { NextRequest } from 'next/server';
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { DataPoint, RecentCall, Period } from '@/lib/mock-data';

const MODEL_COST: Record<string, { input: number; output: number }> = {
  'claude-opus-4-7':              { input: 15,   output: 75   },
  'claude-opus-4-5':              { input: 15,   output: 75   },
  'claude-sonnet-4-6':            { input: 3,    output: 15   },
  'claude-sonnet-4-5':            { input: 3,    output: 15   },
  'claude-haiku-4-5':             { input: 0.25, output: 1.25 },
  'claude-haiku-4-5-20251001':    { input: 0.25, output: 1.25 },
};

const PERIOD_MS: Record<Period, number> = {
  '1d': 86_400_000,
  '3d': 259_200_000,
  '5d': 432_000_000,
  '1w': 604_800_000,
  '1m': 2_592_000_000,
  '1y': 31_536_000_000,
};

interface JournalUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface JournalEntry {
  type: string;
  message?: { model?: string; usage?: JournalUsage };
  requestId?: string;
  timestamp?: string;
  sessionId?: string;
}

interface RawCall {
  requestId: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_tokens: number;
  cost: number;
  timestamp: string;
}

function calcCost(model: string, input: number, output: number): number {
  const rates = MODEL_COST[model] ?? { input: 3, output: 15 };
  return (input / 1_000_000) * rates.input + (output / 1_000_000) * rates.output;
}

async function readAllCalls(): Promise<RawCall[]> {
  const projectsDir = join(homedir(), '.claude', 'projects');
  const seen = new Set<string>();
  const calls: RawCall[] = [];

  let projectDirs: string[];
  try {
    projectDirs = await readdir(projectsDir);
  } catch {
    return [];
  }

  for (const proj of projectDirs) {
    const projPath = join(projectsDir, proj);

    // skip non-directories (e.g. stray files)
    try {
      const s = await stat(projPath);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }

    let files: string[];
    try {
      files = (await readdir(projPath)).filter(f => f.endsWith('.jsonl'));
    } catch {
      continue;
    }

    for (const file of files) {
      let content: string;
      try {
        content = await readFile(join(projPath, file), 'utf-8');
      } catch {
        continue;
      }

      for (const line of content.split('\n')) {
        if (!line.trim()) continue;

        let entry: JournalEntry;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }

        if (entry.type !== 'assistant') continue;
        if (!entry.requestId || !entry.timestamp) continue;
        if (seen.has(entry.requestId)) continue;
        if (!entry.message?.usage) continue;

        seen.add(entry.requestId);

        const u = entry.message.usage;
        const model = entry.message.model ?? 'unknown';
        const input  = u.input_tokens ?? 0;
        const output = u.output_tokens ?? 0;
        const cache  = (u.cache_read_input_tokens ?? 0);

        calls.push({
          requestId:    entry.requestId,
          model,
          input_tokens:  input,
          output_tokens: output,
          cache_tokens:  cache,
          cost:          calcCost(model, input, output),
          timestamp:     entry.timestamp,
        });
      }
    }
  }

  return calls;
}

function buildChartData(calls: RawCall[], period: Period, now: number): DataPoint[] {
  const cutoff = now - PERIOD_MS[period];
  const filtered = calls.filter(c => new Date(c.timestamp).getTime() >= cutoff);

  type BucketConfig = {
    count: number;
    labelFn: (i: number) => string;
    bucketFn: (ts: Date) => number;
  };

  const DAYS_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const MONTHS_VI = ['Th1','Th2','Th3','Th4','Th5','Th6','Th7','Th8','Th9','Th10','Th11','Th12'];

  const nowDate = new Date(now);
  const todayMidnight = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();

  const configs: Record<Period, BucketConfig> = {
    '1d': {
      count: 24,
      labelFn: (i) => `${String(i).padStart(2, '0')}:00`,
      bucketFn: (ts) => ts.getHours(),
    },
    '3d': {
      count: 12,
      labelFn: (i) => {
        const d = Math.floor(i / 4);
        const h = (i % 4) * 6;
        return `N${d + 1} ${String(h).padStart(2, '0')}h`;
      },
      bucketFn: (ts) => {
        const hoursAgo = Math.floor((now - ts.getTime()) / 3_600_000);
        return Math.max(0, 11 - Math.floor(hoursAgo / 6));
      },
    },
    '5d': {
      count: 5,
      labelFn: (i) => {
        const d = new Date(todayMidnight - (4 - i) * 86_400_000);
        return `${d.getDate()}/${d.getMonth() + 1}`;
      },
      bucketFn: (ts) => {
        const daysAgo = Math.floor((todayMidnight - ts.setHours(0,0,0,0)) / 86_400_000);
        return Math.max(0, 4 - daysAgo);
      },
    },
    '1w': {
      count: 7,
      labelFn: (i) => {
        const d = new Date(todayMidnight - (6 - i) * 86_400_000);
        return DAYS_VI[d.getDay()];
      },
      bucketFn: (ts) => {
        const daysAgo = Math.floor((todayMidnight - new Date(ts.getFullYear(), ts.getMonth(), ts.getDate()).getTime()) / 86_400_000);
        return Math.max(0, 6 - daysAgo);
      },
    },
    '1m': {
      count: 30,
      labelFn: (i) => {
        const d = new Date(todayMidnight - (29 - i) * 86_400_000);
        return `${d.getDate()}/${d.getMonth() + 1}`;
      },
      bucketFn: (ts) => {
        const daysAgo = Math.floor((todayMidnight - new Date(ts.getFullYear(), ts.getMonth(), ts.getDate()).getTime()) / 86_400_000);
        return Math.max(0, 29 - daysAgo);
      },
    },
    '1y': {
      count: 12,
      labelFn: (i) => MONTHS_VI[i],
      bucketFn: (ts) => ts.getMonth(),
    },
  };

  const { count, labelFn, bucketFn } = configs[period];
  const buckets: DataPoint[] = Array.from({ length: count }, (_, i) => ({
    label: labelFn(i),
    input: 0,
    output: 0,
    cache: 0,
  }));

  for (const c of filtered) {
    const ts = new Date(c.timestamp);
    const idx = bucketFn(ts);
    if (idx >= 0 && idx < count) {
      buckets[idx].input  += c.input_tokens;
      buckets[idx].output += c.output_tokens;
      buckets[idx].cache  += c.cache_tokens;
    }
  }

  return buckets;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get('period') ?? '1w') as Period;

  const allCalls = await readAllCalls();
  const now = Date.now();
  const cutoff = now - PERIOD_MS[period];

  const filteredCalls = allCalls
    .filter(c => new Date(c.timestamp).getTime() >= cutoff)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const chartData = buildChartData(allCalls, period, now);

  const calls: RecentCall[] = filteredCalls.map(c => ({
    id:            c.requestId,
    model:         c.model,
    input_tokens:  c.input_tokens,
    output_tokens: c.output_tokens,
    cache_tokens:  c.cache_tokens,
    cost:          c.cost,
    timestamp:     new Date(c.timestamp).toLocaleString('vi-VN'),
  }));

  return Response.json({ chartData, calls });
}
