import { readdir, open, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { prisma } from "@/lib/db";

const MODEL_COST: Record<string, { input: number; output: number }> = {
  "claude-opus-4-7":           { input: 15,   output: 75   },
  "claude-opus-4-5":           { input: 15,   output: 75   },
  "claude-sonnet-4-6":         { input: 3,    output: 15   },
  "claude-sonnet-4-5":         { input: 3,    output: 15   },
  "claude-haiku-4-5":          { input: 0.25, output: 1.25 },
  "claude-haiku-4-5-20251001": { input: 0.25, output: 1.25 },
};

function calcCost(model: string, input: number, output: number) {
  const r = MODEL_COST[model] ?? { input: 3, output: 15 };
  return (input / 1_000_000) * r.input + (output / 1_000_000) * r.output;
}

interface JournalEntry {
  type: string;
  message?: {
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  requestId?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
}

async function syncFile(filePath: string, projectName: string) {
  const fileStat = await stat(filePath);
  const currentSize = BigInt(fileStat.size);

  const state = await prisma.syncState.findUnique({ where: { filePath } });
  const lastSize = state?.lastSize ?? BigInt(0);

  if (currentSize <= lastSize) return 0; // nothing new

  // read only the new bytes
  const fh = await open(filePath, "r");
  const newBytes = Number(currentSize - lastSize);
  const buf = Buffer.alloc(newBytes);
  await fh.read(buf, 0, newBytes, Number(lastSize));
  await fh.close();

  const newContent = buf.toString("utf-8");
  const lines = newContent.split("\n");

  const toUpsert: Parameters<typeof prisma.call.upsert>[0][] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (!line.trim()) continue;

    let entry: JournalEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.type !== "assistant") continue;
    if (!entry.requestId || !entry.timestamp) continue;
    if (!entry.message?.usage) continue;
    if (seen.has(entry.requestId)) continue;
    seen.add(entry.requestId);

    const u = entry.message.usage;
    const model = entry.message.model ?? "unknown";
    const input  = u.input_tokens ?? 0;
    const output = u.output_tokens ?? 0;
    const cache  = u.cache_read_input_tokens ?? 0;

    toUpsert.push({
      where:  { id: entry.requestId },
      update: {},
      create: {
        id:           entry.requestId,
        model,
        inputTokens:  input,
        outputTokens: output,
        cacheTokens:  cache,
        cost:         calcCost(model, input, output),
        timestamp:    new Date(entry.timestamp),
        sessionId:    entry.sessionId ?? null,
        project:      projectName,
      },
    });
  }

  // batch upsert
  for (const op of toUpsert) {
    await prisma.call.upsert(op);
  }

  // update sync state
  await prisma.syncState.upsert({
    where:  { filePath },
    update: { lastSize: currentSize },
    create: { filePath, lastSize: currentSize },
  });

  return toUpsert.length;
}

export async function POST() {
  const projectsDir = join(homedir(), ".claude", "projects");

  let projectDirs: string[];
  try {
    projectDirs = await readdir(projectsDir);
  } catch {
    return Response.json({ error: "Cannot read ~/.claude/projects" }, { status: 500 });
  }

  let totalNew = 0;

  for (const proj of projectDirs) {
    const projPath = join(projectsDir, proj);

    let s;
    try { s = await stat(projPath); } catch { continue; }
    if (!s.isDirectory()) continue;

    let files: string[];
    try {
      files = (await readdir(projPath)).filter(f => f.endsWith(".jsonl"));
    } catch { continue; }

    for (const file of files) {
      try {
        const count = await syncFile(join(projPath, file), proj);
        totalNew += count;
      } catch {
        // skip unreadable files
      }
    }
  }

  return Response.json({ synced: totalNew });
}
