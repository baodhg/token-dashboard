// Claude Code sync service
// Reads ~/.claude/projects/**/*.jsonl (assistant entries only)
// Tracks all 4 token types: freshInput, cacheCreation, cacheRead, output

import { open, readdir, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { prisma } from "@/lib/db";
import { calcCost } from "./types";
import type { ModelPrice, SyncResult } from "./types";

// ── Model pricing ($ per 1M tokens) ──────────────────────────────────────────
// Source: anthropic.com/pricing (verified 2026-05-22)
// cacheWrite uses 1h price — Claude Code uses ephemeral_1h by default
// cacheRead = 0.1× input  |  cacheWrite(1h) = 2× input  |  cacheWrite(5m) = 1.25× input
const PRICES: Record<string, ModelPrice> = {
  // Opus 4.x new generation — $5 input (NOT the old $15 Opus 4.1 price)
  "claude-opus-4-7":           { input: 5,     output: 25,    cacheRead: 0.5,    cacheWrite: 10    },
  "claude-opus-4-6":           { input: 5,     output: 25,    cacheRead: 0.5,    cacheWrite: 10    },
  "claude-opus-4-5":           { input: 5,     output: 25,    cacheRead: 0.5,    cacheWrite: 10    },
  // Opus 4.1 and earlier — $15 input (legacy pricing)
  "claude-opus-4-1":           { input: 15,    output: 75,    cacheRead: 1.5,    cacheWrite: 30    },
  "claude-opus-4":             { input: 15,    output: 75,    cacheRead: 1.5,    cacheWrite: 30    },
  // Sonnet
  "claude-sonnet-4-6":         { input: 3,     output: 15,    cacheRead: 0.3,    cacheWrite: 6     },
  "claude-sonnet-4-5":         { input: 3,     output: 15,    cacheRead: 0.3,    cacheWrite: 6     },
  "claude-sonnet-4":           { input: 3,     output: 15,    cacheRead: 0.3,    cacheWrite: 6     },
  // Haiku
  "claude-haiku-4-5":          { input: 1,     output: 5,     cacheRead: 0.1,    cacheWrite: 2     },
  "claude-haiku-4-5-20251001": { input: 1,     output: 5,     cacheRead: 0.1,    cacheWrite: 2     },
  "claude-haiku-3-5":          { input: 0.8,   output: 4,     cacheRead: 0.08,   cacheWrite: 1.6   },
};

function getPrice(model: string): ModelPrice {
  if (PRICES[model]) return PRICES[model];
  const m = model.toLowerCase();
  // Match versioned IDs e.g. claude-opus-4-7-20250219
  for (const [key, price] of Object.entries(PRICES)) {
    if (m.startsWith(key.toLowerCase())) return price;
  }
  if (m.includes("opus"))   return { input: 5,   output: 25,  cacheRead: 0.5,  cacheWrite: 10  }; // Opus 4.5+ default
  if (m.includes("haiku"))  return { input: 1,   output: 5,   cacheRead: 0.1,  cacheWrite: 2   };
  return                           { input: 3,   output: 15,  cacheRead: 0.3,  cacheWrite: 6   }; // sonnet default
}

// ── JSONL entry shape ─────────────────────────────────────────────────────────
interface JournalEntry {
  type: string;
  message?: {
    model?: string;
    usage?: {
      input_tokens?:                number;
      output_tokens?:               number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?:     number;
    };
  };
  requestId?: string;
  timestamp?: string;
  sessionId?: string;
}

// ── Single-file sync (incremental by byte offset) ─────────────────────────────
async function syncFile(filePath: string, project: string): Promise<number> {
  const fileStat = await stat(filePath);
  const currentSize = BigInt(fileStat.size);

  const state = await prisma.syncState.findUnique({ where: { filePath } });
  let lastSize = state?.lastSize ?? BigInt(0);
  if (currentSize < lastSize) lastSize = BigInt(0);  // file was truncated → full re-read
  if (currentSize === lastSize) return 0;

  const fh = await open(filePath, "r");
  const newBytes = Number(currentSize - lastSize);
  const buf = Buffer.alloc(newBytes);
  await fh.read(buf, 0, newBytes, Number(lastSize));
  await fh.close();

  const seen = new Set<string>();
  let count = 0;

  for (const line of buf.toString("utf-8").split("\n")) {
    if (!line.trim()) continue;
    let entry: JournalEntry;
    try { entry = JSON.parse(line); } catch { continue; }

    if (entry.type !== "assistant") continue;
    if (!entry.requestId || !entry.timestamp) continue;
    if (!entry.message?.usage) continue;
    if (seen.has(entry.requestId)) continue;
    seen.add(entry.requestId);

    const u = entry.message.usage;
    const model         = entry.message.model ?? "unknown";
    const freshInput    = u.input_tokens                  ?? 0;
    const cacheCreation = u.cache_creation_input_tokens   ?? 0;
    const cacheRead     = u.cache_read_input_tokens        ?? 0;
    const output        = u.output_tokens                  ?? 0;

    const price = getPrice(model);
    const cost  = calcCost(price, { inputTokens: freshInput, cacheCreationTokens: cacheCreation, cacheTokens: cacheRead, outputTokens: output });

    await prisma.call.upsert({
      where:  { id: entry.requestId },
      update: {
        model,
        inputTokens:         freshInput,
        cacheCreationTokens: cacheCreation,
        cacheTokens:         cacheRead,
        outputTokens:        output,
        cost,
        unitPriceInput:  price.input,
        unitPriceOutput: price.output,
        priceMetadata:   `claude-${model}-v1`,
        timestamp:       new Date(entry.timestamp),
        sessionId:       entry.sessionId ?? null,
        project,
      },
      create: {
        id:                  entry.requestId,
        source:              "claude_code",
        model,
        inputTokens:         freshInput,
        cacheCreationTokens: cacheCreation,
        cacheTokens:         cacheRead,
        outputTokens:        output,
        cost,
        unitPriceInput:  price.input,
        unitPriceOutput: price.output,
        priceMetadata:   `claude-${model}-v1`,
        timestamp:       new Date(entry.timestamp),
        sessionId:       entry.sessionId ?? null,
        project,
      },
    });
    count++;
  }

  await prisma.syncState.upsert({
    where:  { filePath },
    update: { lastSize: currentSize },
    create: { filePath, lastSize: currentSize },
  });

  return count;
}

// ── Public entry point ────────────────────────────────────────────────────────
export async function syncClaudeCode(): Promise<SyncResult> {
  const projectsDir = join(homedir(), ".claude", "projects");
  let total = 0;

  let projectDirs: string[];
  try { projectDirs = await readdir(projectsDir); } catch { return { synced: 0 }; }

  for (const proj of projectDirs) {
    const projPath = join(projectsDir, proj);
    try { if (!(await stat(projPath)).isDirectory()) continue; } catch { continue; }

    let files: string[];
    try { files = (await readdir(projPath)).filter(f => f.endsWith(".jsonl")); } catch { continue; }

    for (const file of files) {
      try { total += await syncFile(join(projPath, file), proj); } catch { /* skip unreadable */ }
    }
  }

  return { synced: total };
}
