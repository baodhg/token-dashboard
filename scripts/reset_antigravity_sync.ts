import "dotenv/config";
import { prisma } from "@/lib/db";

// Forces a full re-read of every Antigravity transcript on the next sync by clearing
// their incremental cursors. Safe: call IDs are deterministic (antigravity_{conv}_step_{n}),
// so the re-read upserts corrected models in place — no duplicates, no data loss.
(async () => {
  const states = await prisma.syncState.findMany({
    where: { filePath: { startsWith: "antigravity:" } },
    select: { filePath: true },
  });
  const res = await prisma.syncState.deleteMany({
    where: { filePath: { startsWith: "antigravity:" } },
  });
  console.log(`Deleted ${res.count} antigravity syncState cursors (of ${states.length} found).`);
  console.log("Next /api/sync will re-read all Antigravity transcripts in full and correct model attribution.");
  await prisma.$disconnect();
})();
