import { prisma } from "../lib/db";

async function migrate() {
  console.log("🚀 Starting migration of Claude costs...");

  // 1. Get all current price configurations
  const priceConfigs = await prisma.priceConfig.findMany({
    where: { isCurrent: true, source: "claude_code" }
  });

  if (priceConfigs.length === 0) {
    console.error("❌ No Claude price configurations found! Please run 'npx prisma db seed' first.");
    return;
  }

  console.log(`Found ${priceConfigs.length} price configurations for Claude.`);

  // 2. Find all Claude calls that have 0 cost or 0 unit price
  const calls = await prisma.call.findMany({
    where: {
      source: "claude_code",
      OR: [
        { cost: 0 },
        { unitPriceInput: 0 }
      ]
    }
  });

  console.log(`Found ${calls.length} Claude calls needing update.`);

  if (calls.length === 0) {
    console.log("✅ All Claude calls already have costs.");
    return;
  }

  let updatedCount = 0;

  for (const call of calls) {
    const modelLower = call.model.toLowerCase();
    
    // Find matching price config
    let price = priceConfigs.find(c => 
      modelLower.includes(c.modelPattern.toLowerCase()) && c.modelPattern !== "*"
    );
    
    // Fallback to wildcard if no specific match
    if (!price) {
      price = priceConfigs.find(c => c.modelPattern === "*");
    }

    if (!price) {
      // Last resort fallback
      continue;
    }

    const inputCost = (call.inputTokens - call.cacheTokens) / 1_000_000 * price.unitPriceInput;
    const outputCost = (call.outputTokens / 1_000_000) * price.unitPriceOutput;
    const cacheCost = (call.cacheTokens / 1_000_000) * price.unitPriceCache;
    const totalCost = inputCost + outputCost + cacheCost;

    await prisma.call.update({
      where: { id: call.id },
      data: {
        cost: totalCost,
        unitPriceInput: price.unitPriceInput,
        unitPriceOutput: price.unitPriceOutput,
        priceMetadata: price.version
      }
    });

    updatedCount++;
    if (updatedCount % 100 === 0) {
      console.log(`Updated ${updatedCount}/${calls.length} calls...`);
    }
  }

  console.log(`✅ Successfully updated ${updatedCount} Claude calls.`);
}

migrate()
  .catch(e => {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
