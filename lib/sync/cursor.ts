// Cursor sync service
// Reads Antigravity/Cursor User/globalStorage/state.vscdb + workspaceStorage/*/state.vscdb
// Cost = 0 (subscription model)

import { copyFile, readdir, stat, unlink } from "fs/promises";
import { join } from "path";
import { homedir, tmpdir } from "os";
import Database from "better-sqlite3";
import { prisma } from "@/lib/db";
import type { SyncResult } from "./types";

// ── SQLite sync ───────────────────────────────────────────────────────────────
async function syncDb(dbPath: string, wsId: string): Promise<number> {
  let s: Awaited<ReturnType<typeof stat>>;
  try { s = await stat(dbPath); } catch { return 0; }

  const syncKey = `cursor:${dbPath}`;
  const state   = await prisma.syncState.findUnique({ where: { filePath: syncKey } });
  const lastSyncedAt = state?.lastSyncedAt ?? new Date(0);
  if (s.mtime <= lastSyncedAt) return 0;

  // Copy to temp to avoid SQLite lock
  const tmpDb = join(tmpdir(), `cursor_sync_${Math.random().toString(36).slice(2)}.db`);
  await copyFile(dbPath, tmpDb);

  const toCreate: {
    id: string; model: string; inputTokens: number; outputTokens: number;
    cacheCreationTokens: number; cacheTokens: number; cost: number;
    timestamp: Date; sessionId: string; project: null; source: string;
  }[] = [];

  try {
    const db = new Database(tmpDb, { readonly: true });

    // Support both older ItemTable and newer cursorDiskKV
    let table = "ItemTable";
    try {
      if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cursorDiskKV'").get()) {
        table = "cursorDiskKV";
      }
    } catch { /* use ItemTable */ }

    const rows = db.prepare(
      `SELECT key, value FROM ${table}
       WHERE key LIKE 'bubbleId:%'
          OR key LIKE 'composer.composerData%'
          OR key LIKE '%aichat.chatdata%'
          OR key LIKE '%composerData%'`
    ).all() as { key: string; value: string }[];

    for (const row of rows) {
      let data: Record<string, unknown>;
      try { data = JSON.parse(row.value); } catch { continue; }

      if (row.key.startsWith("bubbleId:") || row.key.startsWith("composer.composerData")) {
        const usage  = (data.usage || data.modelMetrics || {}) as Record<string, number>;
        const input  = usage.input_tokens  || usage.promptTokens     || 0;
        const output = usage.output_tokens || usage.completionTokens || 0;
        if (input === 0 && output === 0) continue;

        const ts = data.timestamp ? new Date(data.timestamp as string) : s.mtime;
        toCreate.push({
          id:                  `cursor_${wsId}_${row.key}_${ts.getTime()}`,
          model:               (data.model as string) ?? "cursor",
          inputTokens:         input,
          cacheCreationTokens: 0,
          cacheTokens:         0,
          outputTokens:        output,
          cost:                0,
          timestamp:           ts,
          sessionId:           `cursor_${wsId}`,
          project:             null,
          source:              "cursor",
        });
      } else if (row.key.includes("aichat.chatdata")) {
        for (const tab of ((data.tabs ?? []) as Record<string, unknown>[])) {
          for (const bubble of ((tab.bubbles ?? []) as Record<string, unknown>[])) {
            const usage  = (bubble.modelUsage || {}) as Record<string, number>;
            const input  = usage.input_tokens  || 0;
            const output = usage.output_tokens || 0;
            if (input === 0 && output === 0) continue;

            const ts = bubble.timestamp ? new Date(bubble.timestamp as string) : s.mtime;
            toCreate.push({
              id:                  `cursor_${wsId}_chat_${bubble.id ?? Math.random()}`,
              model:               (bubble.model as string) ?? "cursor",
              inputTokens:         input,
              cacheCreationTokens: 0,
              cacheTokens:         0,
              outputTokens:        output,
              cost:                0,
              timestamp:           ts,
              sessionId:           `cursor_${wsId}`,
              project:             null,
              source:              "cursor",
            });
          }
        }
      }
    }

    db.close();
  } catch {
    // ignore SQLite read errors
  } finally {
    try { await unlink(tmpDb); } catch { /* ok */ }
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

// ── Public entry point ────────────────────────────────────────────────────────
export async function syncCursor(): Promise<SyncResult> {
  const roam = join(homedir(), "AppData", "Roaming");
  const userPaths = [
    join(roam, "Antigravity", "User"),
    join(roam, "Cursor",      "User"),
  ];

  let total = 0;

  for (const userPath of userPaths) {
    // Global storage DB
    try { total += await syncDb(join(userPath, "globalStorage", "state.vscdb"), "global"); } catch { /* skip */ }

    // Workspace storage DBs
    let wsDirs: string[];
    try { wsDirs = await readdir(join(userPath, "workspaceStorage")); } catch { continue; }

    for (const ws of wsDirs) {
      try { total += await syncDb(join(userPath, "workspaceStorage", ws, "state.vscdb"), ws); } catch { /* skip */ }
    }
  }

  return { synced: total };
}
