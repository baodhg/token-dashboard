import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { prisma } from "@/lib/db";

/* ─── Claude Code cost table ──────────────────────────── */

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

/* ─── Claude Code JSONL format ────────────────────────── */

interface JournalEntry {
  type: string;
  message?: {
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  requestId?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
}

async function syncClaudeFile(filePath: string, projectName: string) {
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
      const input  = parsed.tokensIn    ?? 0;
      const output = parsed.tokensOut   ?? 0;
      const cache  = parsed.cacheReads  ?? 0;

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

async function syncCodexSessions(): Promise<number> {
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
          try { totalNew += await syncCodexFile(filePath, file); } catch { /* skip */ }
        }
      }
    }
  }

  return totalNew;
}

async function syncCodexFile(filePath: string, fileName: string): Promise<number> {
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
  const uuidMatch = fileName.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i);
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
  const toCreate: { id: string; model: string; inputTokens: number; outputTokens: number; cacheTokens: number; cost: number; timestamp: Date; sessionId: string; project: string | null; source: string }[] = [];
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

    toCreate.push({
      id,
      model,
      inputTokens:  input,
      outputTokens: output,
      cacheTokens:  cache,
      cost:         0, // subscription model — no per-token pricing
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

async function syncGeminiSessions(): Promise<number> {
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
        totalNew += await syncGeminiFile(filePath, proj);
      } catch { /* skip unreadable */ }
    }
  }

  return totalNew;
}

async function syncGeminiFile(filePath: string, projectName: string): Promise<number> {
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
  const toCreate: { id: string; model: string; inputTokens: number; outputTokens: number; cacheTokens: number; cost: number; timestamp: Date; sessionId: string; project: string | null; source: string }[] = [];
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

    toCreate.push({
      id,
      model,
      inputTokens:  input,
      outputTokens: output,
      cacheTokens:  cache,
      cost:         0, // Typically free or different pricing for Gemini CLI
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

/* ─── POST handler ────────────────────────────────────── */

export async function POST() {
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
        claudeNew += await syncClaudeFile(join(projPath, file), proj);
      } catch { /* skip unreadable */ }
    }
  }

  const clineNew  = await syncClineTasks();
  const codexNew  = await syncCodexSessions();
  const geminiNew = await syncGeminiSessions();

  return Response.json({
    synced: claudeNew + clineNew + codexNew + geminiNew,
    claude: claudeNew,
    cline:  clineNew,
    codex:  codexNew,
    gemini: geminiNew,
  });
}

