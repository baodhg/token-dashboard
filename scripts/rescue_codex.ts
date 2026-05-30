import { config } from "dotenv";
config();
import { prisma } from "../lib/db";
import { syncCodex } from "../lib/sync/codex";

async function main() {
  console.log("Deleting all codex calls...");
  const res1 = await prisma.call.deleteMany({ where: { source: "codex" } });
  console.log(`Deleted ${res1.count} call records.`);

  console.log("Deleting all codex sync states...");
  const res2 = await prisma.syncState.deleteMany({ where: { filePath: { startsWith: "codex:" } } });
  console.log(`Deleted ${res2.count} sync state records.`);

  console.log("Re-running codex sync from scratch...");
  const result = await syncCodex();
  console.log(`Sync complete. Restored ${result.synced} events.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
