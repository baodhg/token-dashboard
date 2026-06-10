// Codex sync service
//
// Two data sources:
//   1. state_5.sqlite → threads table  — canonical record of ALL sessions (historical + current)
//      • tokens_used = total tokens (no input/output split available for most old sessions)
//   2. JSONL rollout files (~/.codex/sessions/YYYY/MM/DD/*.jsonl)
//      • token_count events with full input/cache/output breakdown
//      • Only exist for recent sessions; old files have been deleted
//
// Strategy: read every thread from SQLite, then upgrade with JSONL data when the file exists.

import { open, readFile, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import Database from "better-sqlite3";
import { prisma } from "@/lib/db";
import { calcCost } from "./types";
import type { ModelPrice, SyncResult } from "./types";

// ── Model pricing ($ per 1M tokens, short-context tiers) ─────────────────────
// Source: platform.openai.com/docs/pricing (2026-05-22)
// Long-context (>128K tokens) pricing is 2× input/cache for gpt-5.4 and gpt-5.5.
const PRICES: Record<string, ModelPrice> = {
  // GPT-5-Codex / codex CLI generic
  "codex":                   { input: 1.25, output: 10.0, cacheRead: 0.125, cacheWrite: 0 },
  "openai/codex":            { input: 1.25, output: 10.0, cacheRead: 0.125, cacheWrite: 0 },
  // GPT-5.3-Codex tier
  "gpt-5.3-codex":           { input: 1.25, output: 10.0, cacheRead: 0.125, cacheWrite: 0 },
  "cx/gpt-5.3-codex-xhigh":  { input: 1.25, output: 10.0, cacheRead: 0.125, cacheWrite: 0 },
  // GPT-5.4
  "gpt-5.4":                 { input: 2.50, output: 15.0, cacheRead: 0.25,  cacheWrite: 0 },
  "gpt-5.4-mini":            { input: 0.75, output:  4.5, cacheRead: 0.075, cacheWrite: 0 },
  // GPT-5.5
  "gpt-5.5":                 { input: 5.00, output: 30.0, cacheRead: 0.50,  cacheWrite: 0 },
  "gpt-5.5-pro":             { input: 30.0, output: 180.0, cacheRead: 0,    cacheWrite: 0 },
};
const DEFAULT_PRICE: ModelPrice = { input: 1.25, output: 10.0, cacheRead: 0.125, cacheWrite: 0 };

function getPrice(model: string | null): ModelPrice {
  if (!model) return DEFAULT_PRICE;
  return PRICES[model] ?? DEFAULT_PRICE;
}

function extractProject(cwd: string): string | null {
  if (!cwd) return null;
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

// rollout_path in state_5.sqlite is an absolute path written by the Codex CLI on
// the HOST OS (e.g. C:\Users\Admin\.codex\...). When this app runs inside Docker
// (Linux, HOME=/host-home) that path never exists, which silently flipped every
// session to the aggregate fallback and deleted accurate per-request records.
// Remap the portion after ".codex" onto this process's homedir before testing.
function resolveRolloutPath(p: string | null): string | null {
  if (!p) return null;
  if (existsSync(p)) return p;
  const norm = p.replace(/\\/g, "/");
  const marker = "/.codex/";
  const idx = norm.toLowerCase().indexOf(marker);
  if (idx === -1) return null;
  const remapped = join(homedir(), ".codex", ...norm.slice(idx + marker.length).split("/"));
  return existsSync(remapped) ? remapped : null;
}

// ── JSONL rollout shape ───────────────────────────────────────────────────────
interface CodexTokenUsage {
  input_tokens?:            number;
  output_tokens?:           number;
  cached_input_tokens?:     number;
  reasoning_output_tokens?: number;
}

interface CodexTokenCount {
  total_token_usage?: CodexTokenUsage;
  last_token_usage?:  CodexTokenUsage;
}


// ── SQLite thread shape ───────────────────────────────────────────────────────
interface CodexThread {
  id:            string;
  cwd:           string;
  model:         string | null;
  tokens_used:   number;
  created_at_ms: number;
  updated_at_ms: number;
  rollout_path:  string | null;
}

// ── Sync from state_5.sqlite ──────────────────────────────────────────────────
async function syncFromSQLite(): Promise<number> {
  const dbPath = join(homedir(), ".codex", "state_5.sqlite");
  if (!existsSync(dbPath)) return 0;

  let threads: CodexThread[];
  try {
    const db = new Database(dbPath, { readonly: true });
    threads = db.prepare(
      "SELECT id, cwd, model, tokens_used, created_at_ms, updated_at_ms, rollout_path FROM threads WHERE tokens_used > 0"
    ).all() as CodexThread[];
    db.close();
  } catch { return 0; }

  let count = 0;

  for (const thread of threads) {
    const project  = extractProject(thread.cwd);
    const fallback = thread.model || "codex";
    const sessionId = `codex_${thread.id}`;

    const rolloutPath = resolveRolloutPath(thread.rollout_path);

    if (rolloutPath) {
      // ── Per-request mode: parse each token_count event as its own DB record ──
      // Matches Claude Code granularity. Track model switches via session_meta.
      const keptIds: string[] = [];
      let currentModel = fallback;
      let content = "";
      try { content = await readFile(rolloutPath, "utf-8"); } catch { /* fall through to aggregate */ }

      if (content) {
        for (const line of content.split("\n")) {
          if (!line.trim()) continue;

          // turn_context events carry the model for the current turn
          if (line.includes('"turn_context"')) {
            try {
              const e: { type?: string; payload?: { model?: string } } = JSON.parse(line);
              if (e.type === "turn_context" && e.payload?.model) currentModel = e.payload.model;
            } catch { /* skip */ }
            continue;
          }

          if (!line.includes('"token_count"')) continue;
          try {
            const e: { type?: string; timestamp?: string; payload?: { type?: string; info?: CodexTokenCount | null } } = JSON.parse(line);
            if (e.type !== "event_msg") continue;
            if (e.payload?.type !== "token_count") continue;
            if (!e.timestamp) continue;
            const u = e.payload.info?.last_token_usage;
            if (!u) continue;
            const cache = u.cached_input_tokens ?? 0;
            const inp   = Math.max(0, (u.input_tokens ?? 0) - cache);
            const out   = (u.output_tokens ?? 0) + (u.reasoning_output_tokens ?? 0);
            if (inp === 0 && out === 0 && cache === 0) continue;

            const model  = currentModel;
            const price  = getPrice(model);
            const cost   = calcCost(price, { inputTokens: inp, cacheCreationTokens: 0, cacheTokens: cache, outputTokens: out });
            const callId = `codex_${thread.id}_${e.timestamp}`;
            keptIds.push(callId);

            await prisma.call.upsert({
              where:  { id: callId },
              update: { model, inputTokens: inp, cacheCreationTokens: 0, cacheTokens: cache, outputTokens: out, cost, unitPriceInput: price.input, unitPriceOutput: price.output, priceMetadata: "codex-jsonl-v2", timestamp: new Date(e.timestamp), project },
              create: { id: callId, source: "codex", model, inputTokens: inp, cacheCreationTokens: 0, cacheTokens: cache, outputTokens: out, cost, unitPriceInput: price.input, unitPriceOutput: price.output, priceMetadata: "codex-jsonl-v2", timestamp: new Date(e.timestamp), sessionId, project },
            });
            count++;
          } catch { /* skip malformed */ }
        }

        // Mark JSONL as fully processed so syncJSONLFile skips it (avoids double-count)
        const syncKey  = `codex:${rolloutPath}`;
        const fileSize = BigInt((await stat(rolloutPath)).size);
        await prisma.syncState.upsert({
          where:  { filePath: syncKey },
          update: { lastSize: fileSize },
          create: { filePath: syncKey, lastSize: fileSize },
        });
      }

      // Clean up aggregate + stale per-request records for this session
      await prisma.call.deleteMany({
        where: { source: "codex", id: { contains: thread.id }, NOT: { id: { in: keptIds } } },
      });

    } else {
      // ── Aggregate fallback: no JSONL available, use SQLite total ──
      // Safety guard: if accurate per-request records already exist for this
      // session (synced earlier while the JSONL was still readable), keep them.
      // Replacing them with a single input-only total is strictly worse data —
      // this is what wiped out correct stats when rollout paths didn't resolve.
      const perRequestCount = await prisma.call.count({
        where: { source: "codex", id: { startsWith: `codex_${thread.id}_` } },
      });
      if (perRequestCount > 0) continue;

      const model  = fallback;
      const price  = getPrice(thread.model);
      const callId = `codex_thread_${thread.id}`;
      const cost   = (thread.tokens_used / 1_000_000) * price.input;
      const ts     = new Date(thread.created_at_ms);

      await prisma.call.upsert({
        where:  { id: callId },
        update: { model, inputTokens: thread.tokens_used, cacheCreationTokens: 0, cacheTokens: 0, outputTokens: 0, cost, unitPriceInput: price.input, unitPriceOutput: price.output, priceMetadata: "codex-sqlite-total-v1", timestamp: ts, project },
        create: { id: callId, source: "codex", model, inputTokens: thread.tokens_used, cacheCreationTokens: 0, cacheTokens: 0, outputTokens: 0, cost, unitPriceInput: price.input, unitPriceOutput: price.output, priceMetadata: "codex-sqlite-total-v1", timestamp: ts, sessionId, project },
      });

      // Remove any stale per-request records that may have been created before SQLite caught up
      await prisma.call.deleteMany({
        where: { source: "codex", id: { contains: thread.id }, NOT: { id: callId } },
      });
      count++;
    }
  }

  return count;
}

// ── Sync from JSONL session files (per-request breakdown for current sessions) ─
// Only processes sessions NOT already covered by state_5.sqlite (i.e. sessions
// whose JSONL exists but thread ID might not be indexed yet in SQLite).
async function syncFromJSONLFiles(): Promise<number> {
  const sessionsDir = join(homedir(), ".codex", "sessions");
  let total = 0;

  let years: string[];
  try { years = await readdir(sessionsDir); } catch { return 0; }

  for (const year of years) {
    const yearPath = join(sessionsDir, year);
    try { if (!(await stat(yearPath)).isDirectory()) continue; } catch { continue; }

    for (const month of (await readdir(yearPath).catch(() => []))) {
      const monthPath = join(yearPath, month);
      try { if (!(await stat(monthPath)).isDirectory()) continue; } catch { continue; }

      for (const day of (await readdir(monthPath).catch(() => []))) {
        const dayPath = join(monthPath, day);
        try { if (!(await stat(dayPath)).isDirectory()) continue; } catch { continue; }

        const files = (await readdir(dayPath).catch(() => [])).filter(f => f.endsWith(".jsonl"));
        for (const file of files) {
          try { total += await syncJSONLFile(join(dayPath, file), file); } catch { /* skip */ }
        }
      }
    }
  }

  return total;
}

async function syncJSONLFile(filePath: string, fileName: string): Promise<number> {
  const fileStat = await stat(filePath);
  const currentSize = BigInt(fileStat.size);

  const syncKey = `codex:${filePath}`;
  const state   = await prisma.syncState.findUnique({ where: { filePath: syncKey } });
  const lastSize = state?.lastSize ?? BigInt(0);
  if (currentSize <= lastSize) return 0;

  const fh = await open(filePath, "r");
  const newBytes = Number(currentSize - lastSize);
  const buf = Buffer.alloc(newBytes);
  await fh.read(buf, 0, newBytes, Number(lastSize));
  await fh.close();

  const uuidMatch = fileName.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i);
  const sessionUuid = uuidMatch ? uuidMatch[1] : fileName.replace(".jsonl", "");

  // If there's already a codex_thread_ record for this session, skip per-request records
  // to avoid double-counting with the SQLite aggregate record.
  const threadId = `codex_thread_${sessionUuid}`;
  const alreadyFromSQLite = await prisma.call.findUnique({ where: { id: threadId } });
  if (alreadyFromSQLite) {
    // Update sync state and skip — SQLite record is the canonical source
    await prisma.syncState.upsert({
      where:  { filePath: syncKey },
      update: { lastSize: currentSize },
      create: { filePath: syncKey, lastSize: currentSize },
    });
    return 0;
  }

  // Session not in SQLite yet — parse per-request token_count events
  let project: string | null = null;
  let model = "codex";

  // Recover project and the latest model from the already processed part of the file
  if (lastSize > BigInt(0)) {
    try {
      const fhHead = await open(filePath, "r");
      const headBuf = Buffer.alloc(Number(lastSize));
      await fhHead.read(headBuf, 0, Number(lastSize), 0);
      await fhHead.close();
      const headStr = headBuf.toString("utf-8");
      for (const l of headStr.split("\n")) {
        if (!project && l.includes('"session_meta"')) {
          try {
            const m: { type?: string; payload?: { cwd?: string } } = JSON.parse(l);
            if (m.payload?.cwd) project = extractProject(m.payload.cwd);
          } catch { /* skip */ }
        }
        if (l.includes('"turn_context"')) {
          try {
            const tc: { type?: string; payload?: { model?: string } } = JSON.parse(l);
            if (tc.type === "turn_context" && tc.payload?.model) { model = tc.payload.model; }
          } catch { /* skip */ }
        }
      }
    } catch { /* optional */ }
  }

  const seen  = new Set<string>();
  let count   = 0;
  const lines = buf.toString("utf-8").split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;

    if (!project && line.includes('"session_meta"')) {
      try {
        const m: { type?: string; payload?: { cwd?: string } } = JSON.parse(line);
        if (m.payload?.cwd) project = extractProject(m.payload.cwd);
      } catch { /* skip */ }
    }

    // Track model changes within new bytes via turn_context
    if (line.includes('"turn_context"')) {
      try {
        const tc: { type?: string; payload?: { model?: string } } = JSON.parse(line);
        if (tc.type === "turn_context" && tc.payload?.model) model = tc.payload.model;
      } catch { /* skip */ }
      continue;
    }

    if (!line.includes('"token_count"')) continue;
    let entry: { type: string; timestamp?: string; payload?: { type: string; info?: CodexTokenCount | null } };
    try { entry = JSON.parse(line); } catch { continue; }

    if (entry.type !== "event_msg") continue;
    if (entry.payload?.type !== "token_count") continue;
    if (!entry.payload.info?.last_token_usage) continue;
    if (!entry.timestamp) continue;

    const u      = entry.payload.info.last_token_usage;
    const cache  = u.cached_input_tokens ?? 0;
    const input  = Math.max(0, (u.input_tokens ?? 0) - cache);
    const output = (u.output_tokens ?? 0) + (u.reasoning_output_tokens ?? 0);
    if (input === 0 && cache === 0 && output === 0) continue;

    const id = `codex_${sessionUuid}_${entry.timestamp}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const price = getPrice(model);
    const cost  = calcCost(price, { inputTokens: input, cacheCreationTokens: 0, cacheTokens: cache, outputTokens: output });

    await prisma.call.upsert({
      where:  { id },
      update: { model, inputTokens: input, cacheCreationTokens: 0, cacheTokens: cache, outputTokens: output, cost, unitPriceInput: price.input, unitPriceOutput: price.output, priceMetadata: "codex-v1" },
      create: {
        id, source: "codex", model,
        inputTokens: input, cacheCreationTokens: 0, cacheTokens: cache, outputTokens: output,
        cost, unitPriceInput: price.input, unitPriceOutput: price.output, priceMetadata: "codex-v1",
        timestamp: new Date(entry.timestamp), sessionId: `codex_${sessionUuid}`, project,
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
export async function syncCodex(): Promise<SyncResult> {
  // SQLite first (covers all historical sessions)
  const fromSQLite = await syncFromSQLite();
  // JSONL second (per-request detail for sessions not yet in SQLite)
  const fromJSONL  = await syncFromJSONLFiles();

  return { synced: fromSQLite + fromJSONL };
}
