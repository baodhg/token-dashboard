import { prisma } from "@/lib/db";

// Snapshots today's (and yesterday's) per-model totals from the calls table.
// Called fire-and-forget after each sync cycle.
export async function snapshotDailyBalances(): Promise<number> {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const datesToSnapshot = [todayStr, yesterdayStr];
  let totalUpserted = 0;

  for (const dateStr of datesToSnapshot) {
    const startOfDay = new Date(dateStr + "T00:00:00.000Z");
    const endOfDay   = new Date(dateStr + "T23:59:59.999Z");

    const groups = await prisma.call.groupBy({
      by: ["model", "source"],
      _sum: {
        cost: true,
        inputTokens: true,
        outputTokens: true,
        cacheTokens: true,
        cacheCreationTokens: true,
      },
      where: { timestamp: { gte: startOfDay, lte: endOfDay } },
    });

    for (const g of groups) {
      const dailyCost   = g._sum.cost ?? 0;
      const dailyTokens =
        (g._sum.inputTokens ?? 0) +
        (g._sum.outputTokens ?? 0) +
        (g._sum.cacheTokens ?? 0) +
        (g._sum.cacheCreationTokens ?? 0);

      if (dailyCost === 0 && dailyTokens === 0) continue;

      await prisma.dailyBalance.upsert({
        where: { date_model_source: { date: dateStr, model: g.model, source: g.source } },
        create: { date: dateStr, model: g.model, source: g.source, dailyCost, dailyTokens },
        update: { dailyCost, dailyTokens },
      });
      totalUpserted++;
    }
  }

  return totalUpserted;
}
