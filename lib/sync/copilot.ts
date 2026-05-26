// GitHub Copilot sync service
// Reads VSCode/Cursor/Antigravity workspaceStorage/*/chatSessions/*.jsonl
// Cost = 0 (subscription model — no per-token billing)

import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { prisma } from "@/lib/db";
import { calcCost } from "./types";
import type { ModelPrice, SyncResult } from "./types";

// ── Model pricing ($ per 1M tokens) ──────────────────────────────────────────
// Source: GitHub Copilot Pricing (effective June 2026)
const PRICES: Record<string, ModelPrice> = {
  // OpenAI
  "gpt-4.11":      { input: 2.00, output: 8.00,  cacheRead: 0.50,  cacheWrite: 0 },
  "gpt-5-mini":    { input: 0.25, output: 2.00,  cacheRead: 0.025, cacheWrite: 0 },
  "gpt-5.2":       { input: 1.75, output: 14.00, cacheRead: 0.175, cacheWrite: 0 },
  "gpt-5.3-codex": { input: 1.75, output: 14.00, cacheRead: 0.175, cacheWrite: 0 },
  "gpt-5.4":       { input: 2.50, output: 15.00, cacheRead: 0.25,  cacheWrite: 0 },
  "gpt-5.4-mini":  { input: 0.75, output: 4.50,  cacheRead: 0.075, cacheWrite: 0 },
  "gpt-5.4-nano":  { input: 0.20, output: 1.25,  cacheRead: 0.02,  cacheWrite: 0 },
  "gpt-5.5":       { input: 5.00, output: 30.00, cacheRead: 0.50,  cacheWrite: 0 },
  // Anthropic
  "claude-haiku-4.5": { input: 1.00, output: 5.00,  cacheRead: 0.10, cacheWrite: 1.25 },
  "claude-sonnet-4":   { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "claude-sonnet-4.5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "claude-sonnet-4.6": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "claude-opus-4.5":   { input: 5.00, output: 25.00, cacheRead: 0.50, cacheWrite: 6.25 },
  "claude-opus-4.6":   { input: 5.00, output: 25.00, cacheRead: 0.50, cacheWrite: 6.25 },
  "claude-opus-4.7":   { input: 5.00, output: 25.00, cacheRead: 0.50, cacheWrite: 6.25 },
  // Google
  "gemini-2.5-pro":   { input: 1.25, output: 10.00, cacheRead: 0.125, cacheWrite: 0 },
  "gemini-3-flash":   { input: 0.50, output: 3.00,  cacheRead: 0.05,  cacheWrite: 0 },
  "gemini-3.1-pro":   { input: 2.00, output: 12.00, cacheRead: 0.20,  cacheWrite: 0 },
  "gemini-3.5-flash": { input: 1.50, output: 9.00,  cacheRead: 0.15,  cacheWrite: 0 },
  // GitHub Fine-tuned
  "raptor-mini": { input: 0.25, output: 2.00, cacheRead: 0.025, cacheWrite: 0 },
  "goldeneye":   { input: 1.25, output: 10.00, cacheRead: 0.125, cacheWrite: 0 },
};

function getPrice(model: string): ModelPrice {
  const m = model.toLowerCase();
  for (const [key, price] of Object.entries(PRICES)) {
    if (m.includes(key)) return price;
  }
  // oswe-vscode usually means raptor-mini or gpt-5-mini
  if (m.includes("oswe-vscode")) return PRICES["raptor-mini"];
  // grok-code usually means raptor-mini
  if (m.includes("grok-code")) return PRICES["raptor-mini"];
  
  // Default to raptor-mini if unknown
  return PRICES["raptor-mini"];
}

// ── JSONL shapes ──────────────────────────────────────────────────────────────
interface CopilotEntry {
  kind?:       number;
  v?:          unknown;
  k?:          unknown[];
}

interface CopilotReqMeta {
  requestId?:        string;
  modelId?:          string;
  timestamp?:        string;
  promptTokens?:     number;
  completionTokens?: number;
  cacheTokens?:      number;
  cacheCreationTokens?: number;
}

interface CopilotSession {
  sessionId?: string;
}

// ── Single-file sync ──────────────────────────────────────────────────────────
async function syncChatFile(filePath: string, wsId: string, projectName: string | null): Promise<number> {
  const fileStat = await stat(filePath);
  const currentSize = BigInt(fileStat.size);

  const syncKey = `copilot_chat:${filePath}`;
  const state   = await prisma.syncState.findUnique({ where: { filePath: syncKey } });
  const lastSize = state?.lastSize ?? BigInt(0);
  if (currentSize <= lastSize) return 0;

  const lines = (await readFile(filePath, "utf-8")).split("\n");

  // Two-pass: collect requests from kind-2 lines, patch from kind-1 lines
  const requestsById = new Map<string, CopilotReqMeta>();
  const requestsByIndex: (string | null)[] = [];
  let fileSessionId = wsId;

  const updateReq = (req: any) => {
    if (!req.requestId) return;
    const existing = requestsById.get(req.requestId) ?? {};
    
    // Extract versioned model ID from metadata or result
    const versionedModel = req.selectedModel?.metadata?.version ?? req.metadata?.version ?? req.result?.resolvedModel;
    
    // If we already have a specific model, don't let "copilot/auto" overwrite it
    let modelId = versionedModel ?? req.modelId ?? existing.modelId;
    if (existing.modelId && existing.modelId !== "copilot/auto" && modelId === "copilot/auto") {
      modelId = existing.modelId;
    }
    
    // Extract tokens from various possible locations
    const p = req.promptTokens ?? req.result?.promptTokens ?? req.result?.metadata?.promptTokens;
    const c = req.completionTokens ?? req.outputTokens ?? req.result?.completionTokens ?? req.result?.outputTokens ?? req.result?.metadata?.completionTokens ?? req.result?.metadata?.outputTokens;
    const cr = req.cacheTokens ?? req.result?.cacheTokens ?? req.result?.metadata?.cacheTokens;
    const cw = req.cacheCreationTokens ?? req.result?.cacheCreationTokens ?? req.result?.metadata?.cacheCreationTokens;
    
    requestsById.set(req.requestId, {
      ...existing,
      modelId,
      timestamp:        req.timestamp        ?? existing.timestamp,
      promptTokens:     p  ?? existing.promptTokens,
      completionTokens: c  ?? existing.completionTokens,
      cacheTokens:      cr ?? existing.cacheTokens,
      cacheCreationTokens: cw ?? existing.cacheCreationTokens,
    });
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry: CopilotEntry;
    try { entry = JSON.parse(line); } catch { continue; }

    // kind 0: initial state
    if (entry.kind === 0 && entry.v && typeof entry.v === "object") {
      const v = entry.v as any;
      if (v.sessionId) fileSessionId = v.sessionId;
      if (Array.isArray(v.requests)) {
        requestsByIndex.length = 0;
        for (const req of v.requests) {
          updateReq(req);
          requestsByIndex.push(req.requestId ?? null);
        }
      }
    }

    // kind 2: array update or object replacement
    if (entry.kind === 2 && Array.isArray(entry.v)) {
      if (Array.isArray(entry.k) && entry.k.length === 1 && entry.k[0] === "requests") {
        // Full array replacement
        requestsByIndex.length = 0;
        for (const req of (entry.v as any[])) {
          updateReq(req);
          requestsByIndex.push(req.requestId ?? null);
        }
      } else if (!entry.k) {
        // Fallback for current logic
        for (const req of (entry.v as any[])) {
          updateReq(req);
          requestsByIndex.push(req.requestId ?? null);
        }
      }
    }

    // kind 1: patch
    if (entry.kind === 1 && Array.isArray(entry.k) && entry.k[0] === "requests") {
      const idx   = entry.k[1] as number;
      const field = entry.k[2] as string;

      if (entry.k.length === 2 && entry.v && typeof entry.v === "object") {
        // Patching the whole request object at index
        updateReq(entry.v);
        requestsByIndex[idx] = (entry.v as any).requestId ?? null;
      } else {
        const reqId = requestsByIndex[idx];
        if (reqId) {
          const existing = requestsById.get(reqId) ?? {};
          if (field === "promptTokens")     requestsById.set(reqId, { ...existing, promptTokens: entry.v as number });
          if (field === "completionTokens" || field === "outputTokens") requestsById.set(reqId, { ...existing, completionTokens: entry.v as number });
          if (field === "cacheTokens")      requestsById.set(reqId, { ...existing, cacheTokens: entry.v as number });
          if (field === "cacheCreationTokens") requestsById.set(reqId, { ...existing, cacheCreationTokens: entry.v as number });
          if (field === "result" && entry.v && typeof entry.v === "object") {
            const res = entry.v as any;
            const p = res.promptTokens ?? res.metadata?.promptTokens;
            const c = res.completionTokens ?? res.outputTokens ?? res.metadata?.completionTokens ?? res.metadata?.outputTokens;
            const cr = res.cacheTokens ?? res.metadata?.cacheTokens;
            const cw = res.cacheCreationTokens ?? res.metadata?.cacheCreationTokens;
            
            const newModel = res.resolvedModel ?? res.metadata?.version;
            let modelId = newModel ?? existing.modelId;
            if (existing.modelId && existing.modelId !== "copilot/auto" && modelId === "copilot/auto") {
              modelId = existing.modelId;
            }

            requestsById.set(reqId, {
              ...existing,
              modelId,
              promptTokens: p ?? existing.promptTokens,
              completionTokens: c ?? existing.completionTokens,
              cacheTokens: cr ?? existing.cacheTokens,
              cacheCreationTokens: cw ?? existing.cacheCreationTokens,
            });
          }
        }
      }
    }
  }

  let count = 0;
  for (const [reqId, data] of requestsById.entries()) {
    const input  = data.promptTokens         ?? 0;
    const output = data.completionTokens     ?? 0;
    const cache  = data.cacheTokens           ?? 0;
    const cw     = data.cacheCreationTokens  ?? 0;
    if (input === 0 && output === 0) continue;

    const modelName = data.modelId ?? "copilot";
    const price = getPrice(modelName);
    const cost  = calcCost(price, { inputTokens: input, outputTokens: output, cacheTokens: cache, cacheCreationTokens: cw });

    await prisma.call.upsert({
      where:  { id: `copilot_${reqId}` },
      update: {
        model:               modelName,
        inputTokens:         input,
        cacheCreationTokens: cw,
        cacheTokens:         cache,
        outputTokens:        output,
        cost,
        unitPriceInput:      price.input,
        unitPriceOutput:     price.output,
        sessionId:           `copilot_${fileSessionId}`,
        project:             projectName,
      },
      create: {
        id:                  `copilot_${reqId}`,
        source:              "github_copilot",
        model:               modelName,
        inputTokens:         input,
        cacheCreationTokens: cw,
        cacheTokens:         cache,
        outputTokens:        output,
        cost,
        unitPriceInput:      price.input,
        unitPriceOutput:     price.output,
        timestamp:           data.timestamp ? new Date(data.timestamp) : fileStat.mtime,
        sessionId:           `copilot_${fileSessionId}`,
        project:             projectName,
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
export async function syncCopilot(): Promise<SyncResult> {
  const roam = join(homedir(), "AppData", "Roaming");
  const wsRoots = [
    join(roam, "Code",          "User", "workspaceStorage"),
    join(roam, "Antigravity",   "User", "workspaceStorage"),
    join(roam, "Cursor",        "User", "workspaceStorage"),
  ];

  let total = 0;

  for (const wsRoot of wsRoots) {
    let wsDirs: string[];
    try { wsDirs = await readdir(wsRoot); } catch { continue; }

    for (const ws of wsDirs) {
      const wsPath = join(wsRoot, ws);
      const chatDir = join(wsPath, "chatSessions");
      try { if (!(await stat(chatDir)).isDirectory()) continue; } catch { continue; }

      // Try to get project name from workspace.json
      let projectName: string | null = null;
      try {
        const wsJsonPath = join(wsPath, "workspace.json");
        const wsJson = JSON.parse(await readFile(wsJsonPath, "utf-8"));
        if (wsJson.folder) {
          const uri = decodeURIComponent(wsJson.folder);
          projectName = uri.split(/[\\/]/).pop() || null;
        }
      } catch { /* ignore */ }

      const files = (await readdir(chatDir).catch(() => [])).filter(f => f.endsWith(".jsonl"));
      for (const file of files) {
        try { total += await syncChatFile(join(chatDir, file), ws, projectName); } catch { /* skip */ }
      }
    }
  }

  return { synced: total };
}
