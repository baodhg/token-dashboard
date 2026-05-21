// Cline sync service
// Reads VSCode globalStorage/saoudrizwan.claude-dev/tasks/*/ui_messages.json
// Cline reports cost directly — no need to recalculate

import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { prisma } from "@/lib/db";
import type { SyncResult } from "./types";

// ── Cline JSON shapes ─────────────────────────────────────────────────────────
interface ClineUiMessage {
  ts:   number;
  type: string;
  say?: string;
  text?: string;
}

interface ClineApiReqText {
  tokensIn?:    number;
  tokensOut?:   number;
  cacheWrites?: number;
  cacheReads?:  number;
  cost?:        number;
}

interface ClineModelUsage {
  ts:               number;
  model_id:         string;
  model_provider_id: string;
}

interface ClineTaskMeta {
  model_usage?: ClineModelUsage[];
}

// Resolve which model was active at a given timestamp
function resolveModel(usage: ClineModelUsage[], ts: number): string {
  const sorted = [...usage].sort((a, b) => a.ts - b.ts);
  let model = sorted[0]?.model_id ?? "unknown";
  for (const u of sorted) {
    if (u.ts <= ts) model = u.model_id;
  }
  return model;
}

// Extract workspace hint from <environment_details> block in the request text
// Cline embeds JSON like: "hint": "MyProject" in workspace config
function extractProject(request: string): string | null {
  const m = request.match(/"hint":\s*"([^"]+)"/);
  return m ? m[1] : null;
}

// ── Single-task sync ──────────────────────────────────────────────────────────
async function syncTask(taskId: string, tasksDir: string): Promise<number> {
  const taskPath = join(tasksDir, taskId);
  const uiFile   = join(taskPath, "ui_messages.json");
  const metaFile = join(taskPath, "task_metadata.json");

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try { fileStat = await stat(uiFile); } catch { return 0; }
  const currentSize = BigInt(fileStat.size);

  const syncKey = `cline:${taskId}`;
  const state = await prisma.syncState.findUnique({ where: { filePath: syncKey } });
  if (state && state.lastSize === currentSize) return 0;

  let modelUsage: ClineModelUsage[] = [];
  try {
    const raw  = await readFile(metaFile, "utf-8");
    const meta: ClineTaskMeta = JSON.parse(raw);
    modelUsage = meta.model_usage ?? [];
  } catch { /* metadata optional */ }

  let messages: ClineUiMessage[];
  try {
    messages = JSON.parse(await readFile(uiFile, "utf-8"));
  } catch { return 0; }

  // Extract project name from the first api_req_started request text
  let project: string | null = null;
  for (const msg of messages) {
    if (msg.type !== "say" || msg.say !== "api_req_started" || !msg.text) continue;
    try {
      const p = JSON.parse(msg.text);
      if (p.request) { project = extractProject(p.request); }
    } catch { /* ignore */ }
    break;
  }

  let count = 0;
  for (const msg of messages) {
    if (msg.type !== "say" || msg.say !== "api_req_started" || !msg.text) continue;

    let parsed: ClineApiReqText;
    try { parsed = JSON.parse(msg.text); } catch { continue; }
    if (parsed.cost === undefined) continue;

    const id            = `cline_${taskId}_${msg.ts}`;
    const model         = resolveModel(modelUsage, msg.ts);
    const freshInput    = parsed.tokensIn    ?? 0;
    const cacheCreation = parsed.cacheWrites ?? 0;
    const cacheRead     = parsed.cacheReads  ?? 0;
    const output        = parsed.tokensOut   ?? 0;

    await prisma.call.upsert({
      where:  { id },
      update: {
        model,
        inputTokens:         freshInput,
        cacheCreationTokens: cacheCreation,
        cacheTokens:         cacheRead,
        outputTokens:        output,
        cost:                parsed.cost,
        timestamp:           new Date(msg.ts),
        sessionId:           `cline_${taskId}`,
        project,
      },
      create: {
        id,
        source:              "cline",
        model,
        inputTokens:         freshInput,
        cacheCreationTokens: cacheCreation,
        cacheTokens:         cacheRead,
        outputTokens:        output,
        cost:                parsed.cost,
        unitPriceInput:      0,
        unitPriceOutput:     0,
        timestamp:           new Date(msg.ts),
        sessionId:           `cline_${taskId}`,
        project,
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
export async function syncCline(): Promise<SyncResult> {
  const appData   = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
  const tasksDir  = join(appData, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "tasks");

  let taskDirs: string[];
  try { taskDirs = await readdir(tasksDir); } catch { return { synced: 0 }; }

  let total = 0;
  for (const taskId of taskDirs) {
    try {
      const s = await stat(join(tasksDir, taskId));
      if (!s.isDirectory()) continue;
    } catch { continue; }

    try { total += await syncTask(taskId, tasksDir); } catch { /* skip */ }
  }

  return { synced: total };
}
