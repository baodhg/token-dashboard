// Sync orchestrator — calls each platform service in parallel
import { syncClaudeCode  } from "@/lib/sync/claude";
import { syncCline       } from "@/lib/sync/cline";
import { syncCodex       } from "@/lib/sync/codex";
import { syncGemini      } from "@/lib/sync/gemini";
import { syncCopilot     } from "@/lib/sync/copilot";
import { syncCursor      } from "@/lib/sync/cursor";
import { syncAntigravity } from "@/lib/sync/antigravity";
import { prisma          } from "@/lib/db";

const RACE_SERVER_URL  = process.env.NEXT_PUBLIC_RACE_SERVER_URL || "";
const RACE_PLAYER_TOKEN = process.env.RACE_PLAYER_TOKEN || "";

export async function POST() {
  const [claude, cline, codex, gemini, copilot, cursor, antigravity] = await Promise.allSettled([
    syncClaudeCode(),
    syncCline(),
    syncCodex(),
    syncGemini(),
    syncCopilot(),
    syncCursor(),
    syncAntigravity(),
  ]);

  const get = (r: PromiseSettledResult<{ synced: number }>) =>
    r.status === "fulfilled" ? r.value.synced : 0;

  // Query all-time total directly from calls table — single source of truth.
  const agg = await prisma.call.aggregate({
    _sum: { inputTokens: true, cacheCreationTokens: true, outputTokens: true },
  });
  const totalTokens =
    (agg._sum.inputTokens ?? 0) +
    (agg._sum.cacheCreationTokens ?? 0) +
    (agg._sum.outputTokens ?? 0);

  // Push to race server immediately after every sync — no WebSocket polling needed.
  // Fire-and-forget: never block the sync response waiting for the race server.
  if (RACE_SERVER_URL && RACE_PLAYER_TOKEN) {
    fetch(`${RACE_SERVER_URL}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: RACE_PLAYER_TOKEN, totalTokens }),
    }).catch(() => {}); // silently ignore if race server is down
  }

  return Response.json({
    synced:     get(claude) + get(cline) + get(codex) + get(gemini) + get(copilot) + get(cursor) + get(antigravity),
    claude:     get(claude),
    cline:      get(cline),
    codex:      get(codex),
    gemini:     get(gemini),
    copilot:    get(copilot),
    cursor:     get(cursor),
    antigravity: get(antigravity),
    totalTokens,
  });
}

