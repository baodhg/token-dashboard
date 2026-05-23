// Gemini CLI sync service
// Reads ~/.gemini/tmp/{project}/chats/*.jsonl — these are exclusively Gemini CLI sessions.
//
// Storage layout (read before editing):
//   ~/.gemini/tmp/           → Gemini CLI JSONL sessions (this adapter)
//   ~/.gemini/antigravity-cli/conversations/*.pb  → Anti CLI  (protobuf, not readable)
//   ~/.gemini/antigravity-ide/conversations/*.pb  → Anti IDE  (protobuf, not readable)
//
// The .antigravitycli file marker in project directories only means Antigravity was
// initialized there — it does NOT indicate that tmp/ sessions came from Antigravity.
// Antigravity NEVER writes to ~/.gemini/tmp/. Do not re-add marker-based detection.

import { open, readdir, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { prisma } from "@/lib/db";
import { calcCost } from "./types";
import type { ModelPrice, SyncResult } from "./types";

// ── Gemini CLI model pricing ($ per 1M tokens) ───────────────────────────────
// Source: Google AI Studio / Vertex AI pay-as-you-go (verified 2026-05-22)
// gemini-2.5-pro >200K context: input $2.50, output $15.00 — using ≤200K as default
// cacheRead = 25% of input price
const GEMINI_PRICES: Record<string, ModelPrice> = {
  // Gemini 3.x (latest generation)
  "gemini-3.1-pro-preview":            { input: 2.00,   output: 12.0,   cacheRead: 0.50,    cacheWrite: 0 },
  "gemini-3-flash-preview":            { input: 0.50,   output: 3.00,   cacheRead: 0.125,   cacheWrite: 0 },
  "gemini-3.1-flash-lite-preview":     { input: 0.25,   output: 1.50,   cacheRead: 0.0625,  cacheWrite: 0 },
  // Gemini 2.5 (stable)
  "gemini-2.5-pro":                    { input: 1.25,   output: 10.0,   cacheRead: 0.3125,  cacheWrite: 0 },
  "gemini-2.5-flash":                  { input: 0.30,   output: 2.50,   cacheRead: 0.075,   cacheWrite: 0 },
  "gemini-2.5-flash-lite":             { input: 0.10,   output: 0.40,   cacheRead: 0.025,   cacheWrite: 0 },
  // Gemma 4 (open weights, avg commercial API hosts: DeepInfra/OpenRouter/Together AI)
  "gemma-4-31b-it":                    { input: 0.13,   output: 0.38,   cacheRead: 0,       cacheWrite: 0 },
  "gemma-4-26b-a4b-it":                { input: 0.07,   output: 0.34,   cacheRead: 0,       cacheWrite: 0 },
};

function getGeminiPrice(model: string): ModelPrice {
  if (GEMINI_PRICES[model]) return GEMINI_PRICES[model];
  const m = model.toLowerCase();
  // Prefix-match versioned IDs e.g. gemini-3.1-pro-preview-20260101
  for (const [key, price] of Object.entries(GEMINI_PRICES)) {
    if (m.startsWith(key)) return price;
  }
  if (m.includes("pro"))    return { input: 1.25,  output: 10.0, cacheRead: 0.3125,  cacheWrite: 0 };
  if (m.startsWith("gemma")) return { input: 0,    output: 0,    cacheRead: 0,       cacheWrite: 0 };
  return                           { input: 0.15,  output: 0.60, cacheRead: 0.0375,  cacheWrite: 0 }; // flash default
}

// ── JSONL shapes ──────────────────────────────────────────────────────────────
interface GeminiTokens {
  input?:    number;
  output?:   number;
  cached?:   number;
  thoughts?: number;
}

interface GeminiEntry {
  id?:        string;
  timestamp?: string;
  type?:      string;
  tokens?:    GeminiTokens;
  model?:     string;
  sessionId?: string;
}

// ── Single-file sync ──────────────────────────────────────────────────────────
async function syncFile(filePath: string, projectName: string): Promise<number> {
  const fileStat = await stat(filePath);
  const currentSize = BigInt(fileStat.size);

  const syncKey = `gemini:${filePath}`;
  const state   = await prisma.syncState.findUnique({ where: { filePath: syncKey } });
  const lastSize = state?.lastSize ?? BigInt(0);
  if (currentSize <= lastSize) return 0;

  const fh = await open(filePath, "r");
  const newBytes = Number(currentSize - lastSize);
  const buf = Buffer.alloc(newBytes);
  await fh.read(buf, 0, newBytes, Number(lastSize));
  await fh.close();

  const lines = buf.toString("utf-8").split("\n");
  const seen  = new Set<string>();
  let count   = 0;
  let sessionId = "unknown";

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry: GeminiEntry;
    try { entry = JSON.parse(line); } catch { continue; }

    if (entry.sessionId) { sessionId = entry.sessionId; continue; }
    if (entry.type !== "gemini") continue;
    if (!entry.tokens || !entry.timestamp || !entry.id) continue;

    const u      = entry.tokens;
    const model  = entry.model ?? "gemini";
    const cache  = u.cached ?? 0;
    // u.input includes cached tokens — subtract to get fresh-only input
    const input  = Math.max(0, (u.input ?? 0) - cache);
    const output = (u.output ?? 0) + (u.thoughts ?? 0);

    const id = `gemini_${entry.id}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const price = getGeminiPrice(model);
    const cost  = calcCost(price, { inputTokens: input, cacheCreationTokens: 0, cacheTokens: cache, outputTokens: output });

    await prisma.call.upsert({
      where:  { id },
      update: {
        model,
        source:              "gemini",
        inputTokens:         input,
        cacheCreationTokens: 0,
        cacheTokens:         cache,
        outputTokens:        output,
        cost,
        unitPriceInput:  price.input,
        unitPriceOutput: price.output,
        priceMetadata:   `gemini-${model}-v1`,
      },
      create: {
        id,
        source:              "gemini",
        model,
        inputTokens:         input,
        cacheCreationTokens: 0,
        cacheTokens:         cache,
        outputTokens:        output,
        cost,
        unitPriceInput:  price.input,
        unitPriceOutput: price.output,
        priceMetadata:   `gemini-${model}-v1`,
        timestamp:       new Date(entry.timestamp),
        sessionId:       `gemini_${sessionId}`,
        project:         projectName,
      },
    });
    count++;
  }

  await prisma.syncState.upsert({
    where:  { filePath: syncKey },
    update: { lastSize: currentSize },
    create: { filePath: syncKey, lastSize: currentSize },
  });

  return count;
}

// ── Public entry point ────────────────────────────────────────────────────────
export async function syncGemini(): Promise<SyncResult> {
  const geminiDir = join(homedir(), ".gemini", "tmp");

  // Fix 1: wrong source attribution from old marker-based detection
  await prisma.call.updateMany({
    where: {
      source: "antigravity_cli",
      OR: [
        { model: { startsWith: "gemini-" } },
        { model: { startsWith: "gemma-"  } },
      ],
    },
    data: { source: "gemini" },
  });

  // Fix 2: inputTokens was stored as full input (including cached) — subtract cacheTokens to get fresh-only
  // Safe condition: inputTokens > cacheTokens means the old format (fresh = input - cached > 0)
  await prisma.$executeRaw`
    UPDATE calls
    SET "inputTokens" = "inputTokens" - "cacheTokens"
    WHERE source = 'gemini'
      AND "cacheTokens" > 0
      AND "inputTokens" > "cacheTokens"
  `;

  let projects: string[];
  try { projects = await readdir(geminiDir); } catch { return { synced: 0 }; }

  let total = 0;

  for (const proj of projects) {
    const chatsDir = join(geminiDir, proj, "chats");
    try { if (!(await stat(chatsDir)).isDirectory()) continue; } catch { continue; }

    const files = (await readdir(chatsDir).catch(() => [])).filter(f => f.endsWith(".jsonl"));
    for (const file of files) {
      try { total += await syncFile(join(chatsDir, file), proj); } catch { /* skip unreadable */ }
    }
  }

  return { synced: total };
}
