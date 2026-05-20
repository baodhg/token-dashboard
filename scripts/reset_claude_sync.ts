import { prisma } from "../lib/db";

async function resetClaudeSyncState() {
  console.log("🔥 Resetting Claude sync state...");

  try {
    const result = await prisma.syncState.deleteMany({
      where: {
        // The sync job for claude logs stores the file path, which contains '.claude'
        filePath: {
          contains: ".claude",
        },
      },
    });

    if (result.count > 0) {
      console.log(`✅ Successfully deleted ${result.count} Claude sync state entries.`);
      console.log("👉 You can now run the sync process to re-calculate historical Claude data.");
    } else {
      console.log("✅ No Claude sync states found to reset.");
    }

  } catch (error) {
    console.error("❌ An error occurred while resetting Claude sync state:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetClaudeSyncState();
