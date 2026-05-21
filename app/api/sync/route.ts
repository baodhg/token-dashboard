// Sync orchestrator — calls each platform service in parallel
import { syncClaudeCode } from "@/lib/sync/claude";
import { syncCline      } from "@/lib/sync/cline";
import { syncCodex      } from "@/lib/sync/codex";
import { syncGemini     } from "@/lib/sync/gemini";
import { syncCopilot    } from "@/lib/sync/copilot";
import { syncCursor     } from "@/lib/sync/cursor";

export async function POST() {
  const [claude, cline, codex, gemini, copilot, cursor] = await Promise.allSettled([
    syncClaudeCode(),
    syncCline(),
    syncCodex(),
    syncGemini(),
    syncCopilot(),
    syncCursor(),
  ]);

  const get = (r: PromiseSettledResult<{ synced: number }>) =>
    r.status === "fulfilled" ? r.value.synced : 0;

  return Response.json({
    synced:  get(claude) + get(cline) + get(codex) + get(gemini) + get(copilot) + get(cursor),
    claude:  get(claude),
    cline:   get(cline),
    codex:   get(codex),
    gemini:  get(gemini),
    copilot: get(copilot),
    cursor:  get(cursor),
  });
}
