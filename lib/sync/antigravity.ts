// Antigravity CLI & IDE sync service
// Reads unencrypted JSONL session transcripts from ~/.gemini/antigravity-*/brain/*/
// Estimates token counts from text length and applies current Antigravity pricing.

import { open, readdir, stat, readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { prisma } from "@/lib/db";
import { calcCost } from "./types";
import type { ModelPrice, SyncResult } from "./types";

// ── Antigravity model pricing ($ per 1M tokens) ──────────────────────────────
const ANTIGRAVITY_PRICES: Record<string, ModelPrice> = {
  "Gemini 3.5 Flash (High)":      { input: 0.15,  output: 0.60,  cacheRead: 0.0375,  cacheWrite: 0 },
  "Gemini 3.5 Flash (Medium)":    { input: 0.15,  output: 0.60,  cacheRead: 0.0375,  cacheWrite: 0 },
  "Gemini 3.1 Pro (High)":        { input: 1.25,  output: 10.0,  cacheRead: 0.3125,  cacheWrite: 0 },
  "Gemini 3.1 Pro (Low)":         { input: 1.25,  output: 10.0,  cacheRead: 0.3125,  cacheWrite: 0 },
  "Claude Sonnet 4.6 (Thinking)": { input: 3.0,   output: 15.0,  cacheRead: 0.3,     cacheWrite: 6 },
  "Claude Opus 4.6 (Thinking)":   { input: 5.0,   output: 25.0,  cacheRead: 0.5,     cacheWrite: 10 },
  "GPT-OSS 120B (Medium)":        { input: 1.0,   output: 4.0,   cacheRead: 0,       cacheWrite: 0 },
};

function getPrice(model: string): ModelPrice {
  if (ANTIGRAVITY_PRICES[model]) return ANTIGRAVITY_PRICES[model];
  const m = model.toLowerCase();
  for (const [key, price] of Object.entries(ANTIGRAVITY_PRICES)) {
    if (m.includes(key.toLowerCase()) || key.toLowerCase().includes(m)) return price;
  }
  return { input: 0.15, output: 0.60, cacheRead: 0.0375, cacheWrite: 0 }; // flash default
}

function getContextLimit(model: string): number {
  const m = model.toLowerCase();
  if (m.includes("pro")) return 2000000;
  if (m.includes("flash")) return 1000000;
  if (m.includes("claude") || m.includes("sonnet") || m.includes("opus")) return 200000;
  return 128000; // default cap
}


interface TranscriptLine {
  step_index: number;
  source: string;
  type: string;
  status: string;
  created_at: string;
  content?: string;
  thinking?: string;
}

// ── Single transcript file sync (incremental) ─────────────────────────────────
async function syncTranscriptFile(filePath: string, conversationId: string, historyMap: Map<string, string>): Promise<number> {
  const fileStat = await stat(filePath);
  const currentSize = BigInt(fileStat.size);

  const syncKey = `antigravity:${filePath}`;
  const state = await prisma.syncState.findUnique({ where: { filePath: syncKey } });
  let lastSize = state?.lastSize ?? BigInt(0);

  if (currentSize < lastSize) lastSize = BigInt(0); // file truncated -> full re-read
  if (currentSize === lastSize) return 0;

  const fh = await open(filePath, "r");

  // 1. Resolve project name: read first 20,000 bytes of the file where Step 0/1 paths reside
  let currentProject = historyMap.get(conversationId);
  if (!currentProject) {
    const headerLen = Math.min(20000, Number(currentSize));
    const headerBuf = Buffer.alloc(headerLen);
    await fh.read(headerBuf, 0, headerLen, 0);
    const headerText = headerBuf.toString("utf-8");

    const desktopMatch = headerText.match(/[dD]esktop(?:\\\\|\\|\/)+([a-zA-Z0-9_-]+)/);
    if (desktopMatch && desktopMatch[1]) {
      currentProject = desktopMatch[1];
    } else {
      const winPathMatch = headerText.match(/[a-zA-Z]:\\[^\\]+\\[^\\]+\\Desktop\\([a-zA-Z0-9_-]+)/i);
      if (winPathMatch && winPathMatch[1]) {
        currentProject = winPathMatch[1];
      } else {
        // Dynamic correlation fallback: check if we list any other known session UUIDs in the history section
        const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
        const uuids = headerText.match(uuidRegex) || [];
        for (const id of uuids) {
          if (id !== conversationId && historyMap.has(id.toLowerCase())) {
            currentProject = historyMap.get(id.toLowerCase());
            break;
          }
        }

        if (!currentProject) {
          currentProject = "Unknown"; // cleanly fallback to Unknown instead of confusing "antigravity"
        }
      }
    }
  }

  // 2. Read only the new appended bytes for parsing model calls (incremental read)
  const newBytes = Number(currentSize - lastSize);
  const buf = Buffer.alloc(newBytes);
  await fh.read(buf, 0, newBytes, Number(lastSize));
  await fh.close();

  const fullText = buf.toString("utf-8");
  const lines = fullText.split("\n");
  let count = 0;
  
  let currentModel = "Gemini 3.5 Flash (Medium)";

  let lastUserPromptLength = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry: TranscriptLine;
    try { entry = JSON.parse(line); } catch { continue; }

    // Parse model changes and track prompt length from USER_INPUT / USER_EXPLICIT content
    if ((entry.type === "USER_INPUT" || entry.source === "USER_EXPLICIT") && entry.content) {
      // Extract model selection change
      // Format: Model Selection from None to Gemini 3.5 Flash (Medium)
      const modelMatch = entry.content.match(/Model Selection` from \S+ to (.+?)\.\s+No need to/);
      if (modelMatch && modelMatch[1]) {
        currentModel = modelMatch[1].trim();
      }


      lastUserPromptLength = entry.content.length;
      continue;
    }


    // Process model response steps to register calls
    if (entry.source === "MODEL" && entry.type === "PLANNER_RESPONSE") {
      const responseLen = entry.content?.length ?? 0;
      const thinkingLen = entry.thinking?.length ?? 0;

      // Core heuristic: 1 token ≈ 3.5 characters (solid mixed text/code ratio)
      const output = Math.max(1, Math.round((responseLen + thinkingLen) / 3.5));
      
      // Separate fresh input prompt and cached context history (Gemini Context Caching)
      const freshInput = Math.max(1, Math.round(lastUserPromptLength / 3.5));
      const contextLimit = getContextLimit(currentModel);
      const cached = Math.min(contextLimit - freshInput, Math.max(0, entry.step_index * 1500));

      const id = `antigravity_${conversationId}_step_${entry.step_index}`;
      const price = getPrice(currentModel);
      const cost = calcCost(price, { inputTokens: freshInput, cacheCreationTokens: 0, cacheTokens: cached, outputTokens: output });

      await prisma.call.upsert({
        where: { id },
        update: {
          model: currentModel,
          inputTokens:         freshInput,
          cacheTokens:         cached,
          cacheCreationTokens: 0,
          outputTokens:        output,
          cost,
          unitPriceInput:  price.input,
          unitPriceOutput: price.output,
          priceMetadata:   `antigravity-${currentModel.replace(/\s+/g, '-').toLowerCase()}-v1`,
          timestamp:       new Date(entry.created_at),
          sessionId:       `antigravity_${conversationId}`,
          project:         currentProject,
        },
        create: {
          id,
          source:              "antigravity_cli",
          model:               currentModel,
          inputTokens:         freshInput,
          cacheTokens:         cached,
          cacheCreationTokens: 0,
          outputTokens:        output,
          cost,
          unitPriceInput:  price.input,
          unitPriceOutput: price.output,
          priceMetadata:   `antigravity-${currentModel.replace(/\s+/g, '-').toLowerCase()}-v1`,
          timestamp:       new Date(entry.created_at),
          sessionId:       `antigravity_${conversationId}`,
          project:         currentProject,
        },
      });
      count++;
    }
  }


  await prisma.syncState.upsert({
    where: { filePath: syncKey },
    update: { lastSize: currentSize },
    create: { filePath: syncKey, lastSize: currentSize },
  });

  // Save the resolved project back into historyMap so that other files processed in the same scan can borrow it!
  if (currentProject && currentProject !== "Unknown") {
    historyMap.set(conversationId.toLowerCase(), currentProject);
  }

  // Self-healing: if we resolved a correct project name (not "Unknown"),
  // update any old database records for this session still stuck under fallback names like "antigravity" or "Unknown".
  if (currentProject !== "Unknown") {
    await prisma.call.updateMany({
      where: {
        sessionId: `antigravity_${conversationId}`,
        project: { in: ["antigravity", "Unknown"] },
      },
      data: {
        project: currentProject,
      },
    });
  }

  return count;
}

// ── Scan brain directory for transcripts ─────────────────────────────────────
async function scanBrainDir(brainDir: string, historyMap: Map<string, string>): Promise<number> {
  let total = 0;
  let conversations: string[];

  try { conversations = await readdir(brainDir); } catch { return 0; }

  for (const convId of conversations) {
    const transcriptPath = join(brainDir, convId, ".system_generated", "logs", "transcript.jsonl");
    try {
      const fileStat = await stat(transcriptPath);
      if (fileStat.isFile()) {
        total += await syncTranscriptFile(transcriptPath, convId, historyMap);
      }
    } catch (e: any) {
      if (e.code !== "ENOENT") {
        console.error(`Error syncing transcript file ${transcriptPath}:`, e);
      }
    }
  }

  return total;
}

// ── Public entry point ────────────────────────────────────────────────────────
export async function syncAntigravity(): Promise<SyncResult> {
  const cliBrainDir  = join(homedir(), ".gemini", "antigravity-cli", "brain");
  const ideBrainDir  = join(homedir(), ".gemini", "antigravity-ide", "brain");
  const mainBrainDir = join(homedir(), ".gemini", "antigravity", "brain");

  // 1. Pre-load CLI history and existing database sessions to build mapping: conversationId -> project
  const historyMap = new Map<string, string>();

  // A. Quick concurrent first-pass pre-scan of all transcripts to populate historyMap with resolved projects
  const scanHistory = async (brainDir: string) => {
    let conversations: string[];
    try { conversations = await readdir(brainDir); } catch { return; }
    for (const convId of conversations) {
      const transcriptPath = join(brainDir, convId, ".system_generated", "logs", "transcript.jsonl");
      try {
        const fileStat = await stat(transcriptPath);
        if (fileStat.isFile()) {
          const headerLen = Math.min(20000, Number(fileStat.size));
          const fh = await open(transcriptPath, "r");
          const buf = Buffer.alloc(headerLen);
          await fh.read(buf, 0, headerLen, 0);
          await fh.close();
          const headerText = buf.toString("utf-8");
          
          const desktopMatch = headerText.match(/[dD]esktop(?:\\\\|\\|\/)+([a-zA-Z0-9_-]+)/);
          if (desktopMatch && desktopMatch[1]) {
            historyMap.set(convId.toLowerCase(), desktopMatch[1]);
          } else {
            const winPathMatch = headerText.match(/[a-zA-Z]:\\[^\\]+\\[^\\]+\\Desktop\\([a-zA-Z0-9_-]+)/i);
            if (winPathMatch && winPathMatch[1]) {
              historyMap.set(convId.toLowerCase(), winPathMatch[1]);
            }
          }
        }
      } catch {}
    }
  };

  await Promise.all([
    scanHistory(cliBrainDir),
    scanHistory(ideBrainDir),
    scanHistory(mainBrainDir),
  ]);

  try {
    // B. Pre-populate from existing DB records that have been resolved
    const existingCalls = await prisma.call.findMany({
      where: {
        source: "antigravity_cli",
        project: { notIn: ["antigravity", "Unknown"] },
      },
      select: { sessionId: true, project: true },
      distinct: ["sessionId"],
    });
    for (const c of existingCalls) {
      if (!c.sessionId) continue;
      const convId = c.sessionId.replace("antigravity_", "");
      if (c.project) {
        historyMap.set(convId.toLowerCase(), c.project);
      }
    }
  } catch (e) {
    console.error("Failed to preload history from database:", e);
  }

  try {
    // C. Pre-populate from CLI history
    const historyPath = join(homedir(), ".gemini", "antigravity-cli", "history.jsonl");
    const data = await readFile(historyPath, "utf-8");
    for (const line of data.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.conversationId && entry.workspace) {
          const parts = entry.workspace.split(/[\\/]/);
          const folder = parts[parts.length - 1];
          if (folder) historyMap.set(entry.conversationId.toLowerCase(), folder);
        }
      } catch {}
    }
  } catch {
    // history.jsonl not found or not readable, continue
  }

  // 2. Scan all brain folders using preloaded historyMap and regex parsing fallbacks
  const [cliSynced, ideSynced, mainSynced] = await Promise.all([
    scanBrainDir(cliBrainDir, historyMap).catch((e) => { console.error("CLI brain scan failed:", e); return 0; }),
    scanBrainDir(ideBrainDir, historyMap).catch((e) => { console.error("IDE brain scan failed:", e); return 0; }),
    scanBrainDir(mainBrainDir, historyMap).catch((e) => { console.error("Main brain scan failed:", e); return 0; }),
  ]);

  return { synced: cliSynced + ideSynced + mainSynced };
}

