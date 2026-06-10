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
import { snapshotDailyBalances } from "@/lib/daily-snapshot";

// Period window boundaries — mirrors the logic in token-stats/route.ts
function periodWindow(period: string): { since: Date; to: Date } {
  const now = Date.now();
  const to = new Date(now);

  if (period === "all") return { since: new Date(0), to };

  // 1d = today from midnight, others = rolling window
  const MS: Record<string, number> = {
    "1d":  86_400_000,
    "3d":  3  * 86_400_000,
    "1w":  7  * 86_400_000,
    "1m":  30 * 86_400_000,
  };

  if (period === "1d") {
    const since = new Date(now);
    since.setHours(0, 0, 0, 0);
    return { since, to };
  }

  return { since: new Date(now - (MS[period] ?? MS["1d"])), to };
}

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

  // Race period from env (default 1d) — all players must use the same window
  const racePeriod = process.env.RACE_PERIOD || "1d";
  const { since, to } = periodWindow(racePeriod);

  const agg = await prisma.call.aggregate({
    _sum: { inputTokens: true, cacheCreationTokens: true, outputTokens: true, cost: true },
    where: { timestamp: { gte: since, lte: to } },
  });
  const totalTokens =
    (agg._sum.inputTokens ?? 0) +
    (agg._sum.cacheCreationTokens ?? 0) +
    (agg._sum.outputTokens ?? 0);
  // USD spent in the same window. copilot/cursor contribute 0 (subscription).
  const totalCost = agg._sum.cost ?? 0;

  // All-time USD spend across every call — the shared shop wallet's "earned"
  // balance. Reported alongside the windowed total so the wallet doesn't reset
  // with the race window.
  const lifeAgg = await prisma.call.aggregate({ _sum: { cost: true } });
  const lifetimeCost = lifeAgg._sum.cost ?? 0;

  // Fire-and-forget push to race server
  reportToRace(totalTokens, totalCost, racePeriod, lifetimeCost).catch(() => {});

  // Snapshot daily balances (fire-and-forget — non-critical)
  snapshotDailyBalances().catch(() => {});

  return Response.json({
    synced:      get(claude) + get(cline) + get(codex) + get(gemini) + get(copilot) + get(cursor) + get(antigravity),
    claude:      get(claude),
    cline:       get(cline),
    codex:       get(codex),
    gemini:      get(gemini),
    copilot:     get(copilot),
    cursor:      get(cursor),
    antigravity: get(antigravity),
    totalTokens,
    totalCost,
    racePeriod,
    // This machine's racer identity (server-side .env). The /race view gate
    // locks its login name to this, and the "me" badge displays it.
    playerName: process.env.RACE_PLAYER_NAME || "",
  });
}
