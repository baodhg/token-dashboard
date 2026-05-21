// Cursor sync service
// Status: DISABLED - see AGENTS.md for details
// Cost = 0 (subscription model)

import type { SyncResult } from "./types";

// ── Public entry point ────────────────────────────────────────────────────────
export async function syncCursor(): Promise<SyncResult> {
  // DISABLED: Cursor changed its storage format (antigravity migration)
  // - SQLite keys like 'bubbleId:*', 'composer.composerData*', 'aichat.chatdata*' no longer exist
  // - Agent transcripts (JSONL) contain conversation history but no token/usage data
  // - No reliable way to extract token counts from current Cursor storage
  // - Awaiting Cursor to expose token usage API or change storage format
  //
  // See AGENTS.md "Known Constraints": Cursor subscription model = cost 0
  // But we still can't track usage without access to token data.

  return { synced: 0 };
}
