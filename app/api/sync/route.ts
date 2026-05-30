// Sync orchestrator — calls each platform service in parallel
import { syncClaudeCode  } from "@/lib/sync/claude";
import { syncCline       } from "@/lib/sync/cline";
import { syncCodex       } from "@/lib/sync/codex";
import { syncGemini      } from "@/lib/sync/gemini";
import { syncCopilot     } from "@/lib/sync/copilot";
import { syncCursor      } from "@/lib/sync/cursor";
import { syncAntigravity } from "@/lib/sync/antigravity";
import { prisma          } from "@/lib/db";
import { reportToRace   } from "@/lib/race-reporter";

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

  // Fire-and-forget — auto-logins with RACE_PLAYER_NAME+PASSWORD from .env,
  // caches JWT, retries once on 401. Never blocks the sync response.
  reportToRace(totalTokens).catch(() => {});

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

