import { readdir, readFile, stat, copyFile, unlink } from "fs/promises";
import { join } from "path";
import { homedir, tmpdir } from "os";
import { prisma } from "@/lib/db";
import Database from "better-sqlite3";

/* ─── Pricing helpers ────────────────────────────────── */

async function getPriceConfigs() {
  const configs = await prisma.priceConfig.findMany({ where: { isCurrent: true } });
  return configs;
}

function findPrice(configs: any[], source: string, model: string) {
  const modelLower = model.toLowerCase();
  
  // Try specific match first
  let match = configs.find(c => c.source === source && modelLower.includes(c.modelPattern.toLowerCase()) && c.modelPattern !== "*");
  
  // Try wildcard match for source
  if (!match) {
    match = configs.find(c => c.source === source && c.modelPattern === "*");
  }
  
  // Fallback
  return match || { unitPriceInput: 0, unitPriceOutput: 0, unitPriceCache: 0, version: "unknown" };
}

async function backfillMissingCosts() {
  try {
    const missing = await prisma.call.findMany({
      where: { unitPriceInput: 0 },
      take: 500 // Process in chunks to avoid timeouts
    });

    if (missing.length === 0) return 0;

    const configs = await getPriceConfigs();
    let updated = 0;

    for (const call of missing) {
      const price = findPrice(configs, call.source, call.model);
      const cost = (call.inputTokens / 1_000_000) * price.unitPriceInput + 
                   (call.outputTokens / 1_000_000) * price.unitPriceOutput + 
                   (call.cacheTokens / 1_000_000) * price.unitPriceCache;

      await prisma.call.update({
        where: { id: call.id },
        data: {
          cost,
          unitPriceInput: price.unitPriceInput,
          unitPriceOutput: price.unitPriceOutput,
          priceMetadata: price.version
        }
      });
      updated++;
    }
    return updated;
  } catch (err) {
    console.error("Backfill failed:", err);
    return 0;
  }
}

/* ─── Claude Code JSONL format ────────────────────────── */

interface JournalEntry {
  type: string;
  message?: {
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
  requestId?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
}

async function syncClaudeFile(filePath: string, projectName: string, priceConfigs: any[]) {
  const fileStat = await stat(filePath);
  const currentSize = BigInt(fileStat.size);

  const state = await prisma.syncState.findUnique({ where: { filePath } });
  let lastSize = state?.lastSize ?? BigInt(0);

  if (currentSize < lastSize) lastSize = BigInt(0);
  if (currentSize === lastSize) return 0;

  const fh = await (await import("fs/promises")).open(filePath, "r");
  const newBytes = Number(currentSize - lastSize);
  const buf = Buffer.alloc(newBytes);
  await fh.read(buf, 0, newBytes, Number(lastSize));
  await fh.close();

  const lines = buf.toString("utf-8").split("\n");
  const toUpsert: Parameters<typeof prisma.call.upsert>[0][] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry: JournalEntry;
    try { entry = JSON.parse(line); } catch { continue; }

    if (entry.type !== "assistant") continue;
    if (!entry.requestId || !entry.timestamp) continue;
    if (!entry.message?.usage) continue;
    if (seen.has(entry.requestId)) continue;
    seen.add(entry.requestId);

    const u = entry.message.usage;
    const model = entry.message.model ?? "unknown";
    const cacheRead  = u.cache_read_input_tokens ?? 0;
    const cacheWrite = u.cache_creation_input_tokens ?? 0;
    const input      = (u.input_tokens ?? 0) + cacheRead + cacheWrite;
    const output     = u.output_tokens ?? 0;

    // Use DB pricing
    const price = findPrice(priceConfigs, "claude_code", model);
    const cost = ((u.input_tokens ?? 0) + cacheWrite) / 1_000_000 * price.unitPriceInput + 
                 (output / 1_000_000) * price.unitPriceOutput + 
                 (cacheRead / 1_000_000) * price.unitPriceCache;

    toUpsert.push({
      where:  { id: entry.requestId },
      update: {},
      create: {
        id:           entry.requestId,
        model,
        inputTokens:  input,
        outputTokens: output,
        cacheTokens:  cacheRead,
        cost:         cost,
        unitPriceInput:  price.unitPriceInput,
        unitPriceOutput: price.unitPriceOutput,
        priceMetadata:   price.version,
        timestamp:    new Date(entry.timestamp),
        sessionId:    entry.sessionId ?? null,
        project:      projectName,
        source:       "claude_code",
      },
    });
  }

  for (const op of toUpsert) await prisma.call.upsert(op);

  await prisma.syncState.upsert({
    where:  { filePath },
    update: { lastSize: currentSize },
    create: { filePath, lastSize: currentSize },
  });

  return toUpsert.length;
}

/* ─── Cline format ────────────────────────────────────── */

interface ClineUiMessage {
  ts: number;
  type: string;
  say?: string;
  text?: string;
}

interface ClineTaskText {
  tokensIn?: number;
  tokensOut?: number;
  cacheWrites?: number;
  cacheReads?: number;
  cost?: number;
}

interface ClineModelUsage {
  ts: number;
  model_id: string;
  model_provider_id: string;
}

interface ClineMeta {
  model_usage?: ClineModelUsage[];
}

function resolveModelAtTs(usage: ClineModelUsage[], ts: number): string {
  // find the last model entry with ts <= request ts
  const sorted = [...usage].sort((a, b) => a.ts - b.ts);
  let model = sorted[0]?.model_id ?? "unknown";
  for (const u of sorted) {
    if (u.ts <= ts) model = u.model_id;
  }
  return model;
}

async function syncClineTasks(): Promise<number> {
  const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
  const tasksDir = join(appData, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "tasks");

  let taskDirs: string[];
  try {
    taskDirs = await readdir(tasksDir);
  } catch {
    return 0;
  }

  let totalNew = 0;

  for (const taskId of taskDirs) {
    const taskPath = join(tasksDir, taskId);
    let s: Awaited<ReturnType<typeof stat>>;
    try { s = await stat(taskPath); } catch { continue; }
    if (!s.isDirectory()) continue;

    const uiFile = join(taskPath, "ui_messages.json");
    const metaFile = join(taskPath, "task_metadata.json");

    // use ui_messages.json file path as sync key (same pattern as Claude JSONL)
    let fileStat: Awaited<ReturnType<typeof stat>>;
    try { fileStat = await stat(uiFile); } catch { continue; }
    const currentSize = BigInt(fileStat.size);

    const syncKey = `cline:${taskId}`;
    const state = await prisma.syncState.findUnique({ where: { filePath: syncKey } });
    if (state && state.lastSize === currentSize) continue;

    // read model info from metadata
    let modelUsage: ClineModelUsage[] = [];
    try {
      const raw = await readFile(metaFile, "utf-8");
      const meta: ClineMeta = JSON.parse(raw);
      modelUsage = meta.model_usage ?? [];
    } catch { /* metadata optional */ }

    // read ui_messages
    let messages: ClineUiMessage[];
    try {
      const raw = await readFile(uiFile, "utf-8");
      messages = JSON.parse(raw);
    } catch { continue; }

    const toUpsert: Parameters<typeof prisma.call.upsert>[0][] = [];

    for (const msg of messages) {
      if (msg.type !== "say" || msg.say !== "api_req_started") continue;
      if (!msg.text) continue;

      let parsed: ClineTaskText;
      try { parsed = JSON.parse(msg.text); } catch { continue; }
      if (parsed.cost === undefined) continue;

      const id = `cline_${taskId}_${msg.ts}`;
      const model = resolveModelAtTs(modelUsage, msg.ts);
      const cache  = parsed.cacheReads  ?? 0;
      const input  = (parsed.tokensIn   ?? 0) + cache; // Normalize to total input
      const output = parsed.tokensOut   ?? 0;

      toUpsert.push({
        where:  { id },
        update: {},
        create: {
          id,
          model,
          inputTokens:  input,
          outputTokens: output,
          cacheTokens:  cache,
          cost:         parsed.cost,
          timestamp:    new Date(msg.ts),
          sessionId:    `cline_${taskId}`,
          project:      null,
          source:       "cline",
        },
      });
    }

    for (const op of toUpsert) await prisma.call.upsert(op);

    await prisma.syncState.upsert({
      where:  { filePath: syncKey },
      update: { lastSize: currentSize },
      create: { filePath: syncKey, lastSize: currentSize },
    });

    totalNew += toUpsert.length;
  }

  return totalNew;
}

/* ─── Codex format ────────────────────────────────────── */

interface CodexTokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cached_input_tokens?: number;
  reasoning_output_tokens?: number;
}

interface CodexTokenCount {
  total_token_usage?: CodexTokenUsage;
  last_token_usage?: CodexTokenUsage;
}

interface CodexSessionMeta {
  model?: string;
  model_provider?: string;
  cwd?: string;
}

function extractProject(cwd: string | undefined): string | null {
  if (!cwd) return null;
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

async function syncCodexSessions(priceConfigs: any[]): Promise<number> {
  const sessionsDir = join(homedir(), ".codex", "sessions");

  let years: string[];
  try {
    years = await readdir(sessionsDir);
  } catch {
    return 0;
  }

  let totalNew = 0;

  for (const year of years) {
    const yearPath = join(sessionsDir, year);
    let s: Awaited<ReturnType<typeof stat>>;
    try { s = await stat(yearPath); } catch { continue; }
    if (!s.isDirectory()) continue;

    let months: string[];
    try { months = await readdir(yearPath); } catch { continue; }

    for (const month of months) {
      const monthPath = join(yearPath, month);
      let ms: Awaited<ReturnType<typeof stat>>;
      try { ms = await stat(monthPath); } catch { continue; }
      if (!ms.isDirectory()) continue;

      let days: string[];
      try { days = await readdir(monthPath); } catch { continue; }

      for (const day of days) {
        const dayPath = join(monthPath, day);
        let ds: Awaited<ReturnType<typeof stat>>;
        try { ds = await stat(dayPath); } catch { continue; }
        if (!ds.isDirectory()) continue;

        let files: string[];
        try { files = (await readdir(dayPath)).filter(f => f.endsWith(".jsonl")); } catch { continue; }

        for (const file of files) {
          const filePath = join(dayPath, file);
          try { totalNew += await syncCodexFile(filePath, file, priceConfigs); } catch { /* skip */ }
        }
      }
    }
  }

  return totalNew;
}

async function syncCodexFile(filePath: string, fileName: string, priceConfigs: any[]): Promise<number> {
  const fileStat = await stat(filePath);
  const currentSize = BigInt(fileStat.size);

  const syncKey = `codex:${filePath}`;
  const state = await prisma.syncState.findUnique({ where: { filePath: syncKey } });
  const lastSize = state?.lastSize ?? BigInt(0);

  if (currentSize <= lastSize) return 0;

  // read only new bytes
  const fh = await (await import("fs/promises")).open(filePath, "r");
  const newBytes = Number(currentSize - lastSize);
  const buf = Buffer.alloc(newBytes);
  await fh.read(buf, 0, newBytes, Number(lastSize));
  await fh.close();

  // extract session UUID from filename: rollout-DATE-{uuid}.jsonl
  const uuidMatch = fileName.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i);
  const sessionId = uuidMatch ? uuidMatch[1] : fileName.replace(".jsonl", "");

  // if first read, also parse session_meta from start of file for project/model
  let project: string | null = null;
  let model = "codex";
  if (lastSize === BigInt(0)) {
    try {
      const head = await readFile(filePath, "utf-8");
      const metaLine = head.split("\n").find(l => l.includes('"session_meta"'));
      if (metaLine) {
        const m: { payload: CodexSessionMeta } = JSON.parse(metaLine);
        project = extractProject(m.payload.cwd);
        if (m.payload.model) model = m.payload.model;
        else if (m.payload.model_provider) model = `${m.payload.model_provider}/codex`;
      }
    } catch { /* metadata optional */ }
  }

  const lines = buf.toString("utf-8").split("\n");
  const toCreate: { 
    id: string; model: string; inputTokens: number; outputTokens: number; cacheTokens: number; 
    cost: number; unitPriceInput: number; unitPriceOutput: number; priceMetadata: string;
    timestamp: Date; sessionId: string; project: string | null; source: string 
  }[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry: { type: string; timestamp?: string; payload?: { type: string; info?: CodexTokenCount | null } };
    try { entry = JSON.parse(line); } catch { continue; }

    if (entry.type !== "event_msg") continue;
    if (entry.payload?.type !== "token_count") continue;
    if (!entry.payload.info?.last_token_usage) continue;
    if (!entry.timestamp) continue;

    const u = entry.payload.info.last_token_usage;
    const input  = u.input_tokens ?? 0;
    const output = (u.output_tokens ?? 0) + (u.reasoning_output_tokens ?? 0);
    const cache  = u.cached_input_tokens ?? 0;
    if (input === 0 && output === 0) continue;

    const id = `codex_${sessionId}_${entry.timestamp}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const price = findPrice(priceConfigs, "codex", model);
    const cost = (input / 1_000_000) * price.unitPriceInput + (output / 1_000_000) * price.unitPriceOutput;

    toCreate.push({
      id,
      model,
      inputTokens:  input,
      outputTokens: output,
      cacheTokens:  cache,
      cost:         cost,
      unitPriceInput:  price.unitPriceInput,
      unitPriceOutput: price.unitPriceOutput,
      priceMetadata:   price.version,
      timestamp:    new Date(entry.timestamp),
      sessionId:    `codex_${sessionId}`,
      project,
      source:       "codex",
    });
  }

  if (toCreate.length > 0) {
    await prisma.call.createMany({ data: toCreate, skipDuplicates: true });
  }

  await prisma.syncState.upsert({
    where:  { filePath: syncKey },
    update: { lastSize: currentSize },
    create: { filePath: syncKey, lastSize: currentSize },
  });

  return toCreate.length;
}

/* ─── Gemini format ───────────────────────────────────── */

interface GeminiTokens {
  input?: number;
  output?: number;
  cached?: number;
  thoughts?: number;
  total?: number;
}

interface GeminiEntry {
  id?: string;
  timestamp?: string;
  type?: string;
  tokens?: GeminiTokens;
  model?: string;
}

async function syncGeminiSessions(priceConfigs: any[]): Promise<number> {
  const geminiDir = join(homedir(), ".gemini", "tmp");

  let projects: string[];
  try {
    projects = await readdir(geminiDir);
  } catch {
    return 0;
  }

  let totalNew = 0;

  for (const proj of projects) {
    const chatsDir = join(geminiDir, proj, "chats");
    let s: Awaited<ReturnType<typeof stat>>;
    try { s = await stat(chatsDir); } catch { continue; }
    if (!s.isDirectory()) continue;

    let files: string[];
    try {
      files = (await readdir(chatsDir)).filter(f => f.endsWith(".jsonl"));
    } catch { continue; }

    for (const file of files) {
      const filePath = join(chatsDir, file);
      try {
        totalNew += await syncGeminiFile(filePath, proj, priceConfigs);
      } catch { /* skip unreadable */ }
    }
  }

  return totalNew;
}

async function syncGeminiFile(filePath: string, projectName: string, priceConfigs: any[]): Promise<number> {
  const fileStat = await stat(filePath);
  const currentSize = BigInt(fileStat.size);

  const syncKey = `gemini:${filePath}`;
  const state = await prisma.syncState.findUnique({ where: { filePath: syncKey } });
  const lastSize = state?.lastSize ?? BigInt(0);

  if (currentSize <= lastSize) return 0;

  const fh = await (await import("fs/promises")).open(filePath, "r");
  const newBytes = Number(currentSize - lastSize);
  const buf = Buffer.alloc(newBytes);
  await fh.read(buf, 0, newBytes, Number(lastSize));
  await fh.close();

  const lines = buf.toString("utf-8").split("\n");
  const toCreate: { 
    id: string; model: string; inputTokens: number; outputTokens: number; cacheTokens: number; 
    cost: number; unitPriceInput: number; unitPriceOutput: number; priceMetadata: string;
    timestamp: Date; sessionId: string; project: string | null; source: string 
  }[] = [];
  const seen = new Set<string>();

  // For sessionId, we can try to extract it from the first line or filename
  let sessionId = "unknown";

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry: GeminiEntry & { sessionId?: string };
    try { entry = JSON.parse(line); } catch { continue; }

    if (entry.sessionId) {
      sessionId = entry.sessionId;
      continue;
    }

    if (entry.type !== "gemini") continue;
    if (!entry.tokens || !entry.timestamp || !entry.id) continue;

    const u = entry.tokens;
    const model = entry.model ?? "gemini";
    const input  = u.input  ?? 0;
    const output = (u.output ?? 0) + (u.thoughts ?? 0);
    const cache  = u.cached  ?? 0;

    const id = `gemini_${entry.id}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const price = findPrice(priceConfigs, "gemini", model);
    const cost = (input / 1_000_000) * price.unitPriceInput + 
                 (output / 1_000_000) * price.unitPriceOutput + 
                 (cache / 1_000_000) * price.unitPriceCache;

    toCreate.push({
      id,
      model,
      inputTokens:  input,
      outputTokens: output,
      cacheTokens:  cache,
      cost:         cost,
      unitPriceInput:  price.unitPriceInput,
      unitPriceOutput: price.unitPriceOutput,
      priceMetadata:   price.version,
      timestamp:    new Date(entry.timestamp),
      sessionId:    `gemini_${sessionId}`,
      project:      projectName,
      source:       "gemini",
    });
  }

  if (toCreate.length > 0) {
    await prisma.call.createMany({ data: toCreate, skipDuplicates: true });
  }

  await prisma.syncState.upsert({
    where:  { filePath: syncKey },
    update: { lastSize: currentSize },
    create: { filePath: syncKey, lastSize: currentSize },
  });

  return toCreate.length;
}

/* ─── GitHub Copilot format ───────────────────────────── */

interface CopilotUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

interface CopilotEntry {
  type?: string;
  timestamp?: string;
  model?: string;
  usage?: CopilotUsage;
  requestId?: string;
}

async function syncCopilotSessions(): Promise<number> {
  const roam = join(homedir(), "AppData", "Roaming");
  const paths = [
    join(roam, "Code", "User", "workspaceStorage"),
    join(roam, "Antigravity", "User", "workspaceStorage"),
    join(roam, "Cursor", "User", "workspaceStorage"),
  ];

  let totalNew = 0;

  for (const wsRoot of paths) {
    let wsDirs: string[] = [];
    try {
      wsDirs = await readdir(wsRoot);
    } catch { continue; }

    for (const ws of wsDirs) {
      const chatDir = join(wsRoot, ws, "chatSessions");
      let s: Awaited<ReturnType<typeof stat>>;
      try { s = await stat(chatDir); } catch { continue; }
      if (!s.isDirectory()) continue;

      let files: string[];
      try {
        files = (await readdir(chatDir)).filter(f => f.endsWith(".jsonl"));
      } catch { continue; }

      for (const file of files) {
        try {
          totalNew += await syncCopilotChatFile(join(chatDir, file), ws);
        } catch { /* skip */ }
      }
    }
  }

  return totalNew;
}

async function syncCopilotChatFile(filePath: string, wsId: string): Promise<number> {
  const fileStat = await stat(filePath);
  const currentSize = BigInt(fileStat.size);

  const syncKey = `copilot_chat:${filePath}`;
  const state = await prisma.syncState.findUnique({ where: { filePath: syncKey } });
  const lastSize = state?.lastSize ?? BigInt(0);

  if (currentSize <= lastSize) return 0;

  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");
  
  const toCreate: { id: string; model: string; inputTokens: number; outputTokens: number; cacheTokens: number; cost: number; timestamp: Date; sessionId: string; project: string | null; source: string }[] = [];
  
  // Track requests both by ID and by index (for patches)
  const requestsById = new Map<string, { modelId?: string; timestamp?: Date; promptTokens?: number; completionTokens?: number }>();
  const requestsByIndex: (string | null)[] = [];
  let fileSessionId = wsId;

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }

    // kind 0: Session Start
    if (entry.kind === 0 && entry.v && entry.v.sessionId) {
      fileSessionId = entry.v.sessionId;
    }

    // kind 2: Request Start/Meta (adds to index)
    if (entry.kind === 2 && entry.v && Array.isArray(entry.v)) {
      for (const req of entry.v) {
        if (!req.requestId) {
          requestsByIndex.push(null);
          continue;
        }
        const existing = requestsById.get(req.requestId) || {};
        requestsById.set(req.requestId, {
          ...existing,
          modelId: req.modelId || existing.modelId,
          timestamp: req.timestamp ? new Date(req.timestamp) : existing.timestamp,
          promptTokens: req.promptTokens || existing.promptTokens,
          completionTokens: req.completionTokens || existing.completionTokens,
        });
        requestsByIndex.push(req.requestId);
      }
    }

    // kind 1: Patch/Update by index
    // Example: {"kind":1,"k":["requests",1,"completionTokens"],"v":177}
    if (entry.kind === 1 && Array.isArray(entry.k) && entry.k[0] === "requests") {
      const idx = entry.k[1];
      const field = entry.k[2];
      const reqId = requestsByIndex[idx];
      
      if (reqId) {
        const existing = requestsById.get(reqId) || {};
        if (field === "promptTokens") {
          requestsById.set(reqId, { ...existing, promptTokens: entry.v });
        } else if (field === "completionTokens") {
          requestsById.set(reqId, { ...existing, completionTokens: entry.v });
        }
      }
    }
  }

  // Final pass: convert collected requests to DB records
  for (const [reqId, data] of requestsById.entries()) {
    const input = data.promptTokens || 0;
    const output = data.completionTokens || 0;
    if (input === 0 && output === 0) continue;

    toCreate.push({
      id:           `copilot_${reqId}`,
      model:        data.modelId || "copilot",
      inputTokens:  input,
      outputTokens: output,
      cacheTokens:  0,
      cost:         0,
      timestamp:    data.timestamp || fileStat.mtime,
      sessionId:    `copilot_${fileSessionId}`,
      project:      null,
      source:       "github_copilot",
    });
  }

  if (toCreate.length > 0) {
    await prisma.call.createMany({ data: toCreate, skipDuplicates: true });
  }

  await prisma.syncState.upsert({
    where: { filePath: syncKey },
    update: { lastSize: currentSize },
    create: { filePath: syncKey, lastSize: currentSize },
  });

  return toCreate.length;
}

/* ─── Cursor format ───────────────────────────────────── */

async function syncCursorSessions(): Promise<number> {
  const roam = join(homedir(), "AppData", "Roaming");
  // Try both Antigravity (older/internal) and Cursor (standard)
  const paths = [
    join(roam, "Antigravity", "User"),
    join(roam, "Cursor", "User"),
  ];

  let totalNew = 0;

  for (const userPath of paths) {
    // 1. Global Storage
    const globalDb = join(userPath, "globalStorage", "state.vscdb");
    try {
      totalNew += await syncCursorDb(globalDb, "global");
    } catch { /* skip */ }

    // 2. Workspace Storage
    const wsRoot = join(userPath, "workspaceStorage");
    let wsDirs: string[] = [];
    try {
      wsDirs = await readdir(wsRoot);
    } catch { continue; }

    for (const ws of wsDirs) {
      const wsDb = join(wsRoot, ws, "state.vscdb");
      try {
        totalNew += await syncCursorDb(wsDb, ws);
      } catch { /* skip */ }
    }
  }

  return totalNew;
}

async function syncCursorDb(dbPath: string, wsId: string): Promise<number> {
  let s: Awaited<ReturnType<typeof stat>>;
  try { s = await stat(dbPath); } catch { return 0; }

  const syncKey = `cursor:${dbPath}`;
  const state = await prisma.syncState.findUnique({ where: { filePath: syncKey } });
  const lastSyncedAt = state?.lastSyncedAt ?? new Date(0);

  // If DB hasn't changed since last sync, skip
  if (s.mtime <= lastSyncedAt) return 0;

  // Copy to temp to avoid lock
  const tmpDb = join(tmpdir(), `cursor_sync_${Math.random().toString(36).slice(2)}.db`);
  await copyFile(dbPath, tmpDb);

  const toCreate: { id: string; model: string; inputTokens: number; outputTokens: number; cacheTokens: number; cost: number; timestamp: Date; sessionId: string; project: string | null; source: string }[] = [];

  try {
    const db = new Database(tmpDb, { readonly: true });
    
    // Cursor often uses 'cursorDiskKV' table in newer versions or 'ItemTable' in older ones
    let table = "ItemTable";
    try {
      const check = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cursorDiskKV'").get();
      if (check) table = "cursorDiskKV";
    } catch { /* ItemTable it is */ }

    // Look for bubble usage, composer data or chat data
    const rows = db.prepare(`SELECT key, value FROM ${table} WHERE key LIKE 'bubbleId:%' OR key LIKE 'composer.composerData%' OR key LIKE '%aichat.chatdata%' OR key LIKE '%composerData%'`).all() as { key: string; value: string }[];

    for (const row of rows) {
      let data: any;
      try { data = JSON.parse(row.value); } catch { continue; }

      // 1. Direct bubble/composer format
      if (row.key.startsWith('bubbleId:') || row.key.startsWith('composer.composerData')) {
        const usage = data.usage || data.modelMetrics || {};
        const input  = usage.input_tokens || usage.promptTokens || 0;
        const output = usage.output_tokens || usage.completionTokens || 0;

        if (input === 0 && output === 0) continue;

        const timestamp = data.timestamp ? new Date(data.timestamp) : s.mtime;
        toCreate.push({
          id: `cursor_${wsId}_${row.key}_${timestamp.getTime()}`,
          model: data.model || "cursor",
          inputTokens: input, outputTokens: output, cacheTokens: 0, cost: 0,
          timestamp, sessionId: `cursor_${wsId}`, project: null, source: "cursor",
        });
      }
      // 2. Legacy / Antigravity aichat.chatdata format (nested)
      else if (row.key.includes('aichat.chatdata')) {
        const tabs = data.tabs || [];
        for (const tab of tabs) {
          const bubbles = tab.bubbles || [];
          for (const bubble of bubbles) {
            const usage = bubble.modelUsage || {};
            const input = usage.input_tokens || 0;
            const output = usage.output_tokens || 0;
            if (input === 0 && output === 0) continue;

            const ts = bubble.timestamp ? new Date(bubble.timestamp) : s.mtime;
            toCreate.push({
              id: `cursor_${wsId}_chat_${bubble.id || Math.random()}`,
              model: bubble.model || "cursor",
              inputTokens: input, outputTokens: output, cacheTokens: 0, cost: 0,
              timestamp: ts, sessionId: `cursor_${wsId}`, project: null, source: "cursor",
            });
          }
        }
      }
    }

    db.close();
  } catch {
    // console.error("Cursor Sync Error:", e);
  } finally {
    try { await unlink(tmpDb); } catch {}
  }

  if (toCreate.length > 0) {
    await prisma.call.createMany({ data: toCreate, skipDuplicates: true });
  }

  await prisma.syncState.upsert({
    where:  { filePath: syncKey },
    update: { lastSyncedAt: s.mtime },
    create: { filePath: syncKey, lastSyncedAt: s.mtime, lastSize: BigInt(s.size) },
  });

  return toCreate.length;
}

/* ─── POST handler ────────────────────────────────────── */

export async function POST() {
  // Automate backfill and ensure price configs exist
  await backfillMissingCosts();
  const priceConfigs = await getPriceConfigs();

  const projectsDir = join(homedir(), ".claude", "projects");

  let claudeNew = 0;

  let projectDirs: string[];
  try {
    projectDirs = await readdir(projectsDir);
  } catch {
    projectDirs = [];
  }

  for (const proj of projectDirs) {
    const projPath = join(projectsDir, proj);
    let s: Awaited<ReturnType<typeof stat>>;
    try { s = await stat(projPath); } catch { continue; }
    if (!s.isDirectory()) continue;

    let files: string[];
    try {
      files = (await readdir(projPath)).filter(f => f.endsWith(".jsonl"));
    } catch { continue; }

    for (const file of files) {
      try {
        claudeNew += await syncClaudeFile(join(projPath, file), proj, priceConfigs);
      } catch { /* skip unreadable */ }
    }
  }

  const clineNew   = await syncClineTasks();
  const codexNew   = await syncCodexSessions(priceConfigs);
  const geminiNew  = await syncGeminiSessions(priceConfigs);
  const copilotNew = await syncCopilotSessions();
  const cursorNew  = await syncCursorSessions();

  return Response.json({
    synced: claudeNew + clineNew + codexNew + geminiNew + copilotNew + cursorNew,
    claude: claudeNew,
    cline:  clineNew,
    codex:  codexNew,
    gemini: geminiNew,
    copilot: copilotNew,
    cursor: cursorNew,
  });
}
