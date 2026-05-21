// GitHub Copilot sync service
// Reads VSCode/Cursor/Antigravity workspaceStorage/*/chatSessions/*.jsonl
// Cost = 0 (subscription model — no per-token billing)

import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { prisma } from "@/lib/db";
import type { SyncResult } from "./types";

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
}

interface CopilotSession {
  sessionId?: string;
}

// ── Single-file sync ──────────────────────────────────────────────────────────
async function syncChatFile(filePath: string, wsId: string): Promise<number> {
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

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry: CopilotEntry;
    try { entry = JSON.parse(line); } catch { continue; }

    if (entry.kind === 0 && entry.v && typeof entry.v === "object") {
      const session = entry.v as CopilotSession;
      if (session.sessionId) fileSessionId = session.sessionId;
    }

    if (entry.kind === 2 && Array.isArray(entry.v)) {
      for (const req of (entry.v as CopilotReqMeta[])) {
        if (!req.requestId) { requestsByIndex.push(null); continue; }
        const existing = requestsById.get(req.requestId) ?? {};
        requestsById.set(req.requestId, {
          ...existing,
          modelId:          req.modelId          ?? existing.modelId,
          timestamp:        req.timestamp        ?? existing.timestamp,
          promptTokens:     req.promptTokens     ?? existing.promptTokens,
          completionTokens: req.completionTokens ?? existing.completionTokens,
        });
        requestsByIndex.push(req.requestId);
      }
    }

    // kind 1: patch by index — e.g. {"kind":1,"k":["requests",1,"completionTokens"],"v":177}
    if (entry.kind === 1 && Array.isArray(entry.k) && entry.k[0] === "requests") {
      const idx   = entry.k[1] as number;
      const field = entry.k[2] as string;
      const reqId = requestsByIndex[idx];
      if (reqId) {
        const existing = requestsById.get(reqId) ?? {};
        if (field === "promptTokens")     requestsById.set(reqId, { ...existing, promptTokens:     entry.v as number });
        if (field === "completionTokens") requestsById.set(reqId, { ...existing, completionTokens: entry.v as number });
      }
    }
  }

  let count = 0;
  for (const [reqId, data] of requestsById.entries()) {
    const input  = data.promptTokens     ?? 0;
    const output = data.completionTokens ?? 0;
    if (input === 0 && output === 0) continue;

    await prisma.call.upsert({
      where:  { id: `copilot_${reqId}` },
      update: {
        model:               data.modelId ?? "copilot",
        inputTokens:         input,
        cacheCreationTokens: 0,
        cacheTokens:         0,
        outputTokens:        output,
        cost:                0,
        sessionId:           `copilot_${fileSessionId}`,
      },
      create: {
        id:                  `copilot_${reqId}`,
        source:              "github_copilot",
        model:               data.modelId ?? "copilot",
        inputTokens:         input,
        cacheCreationTokens: 0,
        cacheTokens:         0,
        outputTokens:        output,
        cost:                0,
        unitPriceInput:      0,
        unitPriceOutput:     0,
        timestamp:           data.timestamp ? new Date(data.timestamp) : fileStat.mtime,
        sessionId:           `copilot_${fileSessionId}`,
        project:             null,
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
      const chatDir = join(wsRoot, ws, "chatSessions");
      try { if (!(await stat(chatDir)).isDirectory()) continue; } catch { continue; }

      const files = (await readdir(chatDir).catch(() => [])).filter(f => f.endsWith(".jsonl"));
      for (const file of files) {
        try { total += await syncChatFile(join(chatDir, file), ws); } catch { /* skip */ }
      }
    }
  }

  return { synced: total };
}
