import { config } from "dotenv";
config();
import { prisma } from "../lib/db";

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(`Fixing Codex records since ${today.toISOString()}...`);

  // Find all Codex calls today that have cache tokens (the potential ones affected by the bug)
  const records = await prisma.call.findMany({
    where: {
      source: "codex",
      timestamp: { gte: today },
      cacheTokens: { gt: 0 }
    }
  });

  console.log(`Found ${records.length} records to verify.`);

  let fixCount = 0;
  for (const r of records) {
    // In the bug state, inputTokens = total_input, cacheTokens = cached_input.
    // Fresh input should be inputTokens - cacheTokens.
    // However, if we already fixed some or if some were correctly handled, we don't want to subtract twice.
    // But since this is a manual fix for the "buggy" state, we assume inputTokens > cacheTokens means it's likely total.
    // A safer check: total reported tokens in Dashboard is (input + cache + output).
    // If it matches what Codex says, we are good.
    
    const freshInput = r.inputTokens - r.cacheTokens;
    if (freshInput < 0) continue; // Should not happen if it's total

    // Re-calculate cost using the same logic as calcCost
    // New Cost = (freshInput * priceInput) + (cache * priceCacheRead) + (output * priceOutput)
    // We know old cost was: (totalInput * priceInput) + (cache * priceCacheRead) + (output * priceOutput)
    // So New Cost = Old Cost - (cacheTokens * priceInput)
    const priceInput = r.unitPriceInput;
    const costReduction = (r.cacheTokens / 1_000_000) * priceInput;
    const newCost = Math.max(0, r.cost - costReduction);

    await prisma.call.update({
      where: { id: r.id },
      data: {
        inputTokens: freshInput,
        cost: newCost
      }
    });
    fixCount++;
  }

  console.log(`Successfully fixed ${fixCount} records.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
