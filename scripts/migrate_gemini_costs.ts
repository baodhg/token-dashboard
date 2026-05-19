import { prisma } from "../lib/db";

/**
 * OFFICIAL & ESTIMATED PRICING (Per 1M tokens)
 */
const PRICING_CONFIG = {
  gemini_pro: {
    input: 1.25,
    output: 10.0,
    cache: 0.125,
    metadata: "gemini-1.5-pro-v1"
  },
  gemini_flash: {
    input: 0.075,
    output: 0.30,
    cache: 0.01875,
    metadata: "gemini-1.5-flash-v1"
  },
  codex: {
    input: 1.50, // Estimated market value for Codex API
    output: 6.00,
    cache: 0,
    metadata: "openai-codex-api-estimation-v1"
  }
};

async function migrate() {
  console.log("🚀 Starting migration of historical costs (Gemini & Codex)...");

  const calls = await prisma.call.findMany({
    where: {
      OR: [
        { model: { contains: "gemini", mode: "insensitive" } },
        { model: { contains: "codex", mode: "insensitive" } },
        { source: "gemini" },
        { source: "codex" }
      ]
    }
  });

  console.log(`Found ${calls.length} relevant calls.`);

  let updatedCount = 0;

  for (const call of calls) {
    let config;
    const modelLower = call.model.toLowerCase();
    const sourceLower = call.source.toLowerCase();

    if (modelLower.includes("gemini") || sourceLower === "gemini") {
      config = modelLower.includes("pro") ? PRICING_CONFIG.gemini_pro : PRICING_CONFIG.gemini_flash;
    } else if (modelLower.includes("codex") || sourceLower === "codex") {
      config = PRICING_CONFIG.codex;
    }

    if (!config) continue;

    // Calculate cost based on selected rates
    const inputCost = (call.inputTokens / 1_000_000) * config.input;
    const outputCost = (call.outputTokens / 1_000_000) * config.output;
    const cacheCost = (call.cacheTokens / 1_000_000) * (config.cache || 0);
    const totalCost = inputCost + outputCost + cacheCost;

    await prisma.call.update({
      where: { id: call.id },
      data: {
        cost: totalCost,
        unitPriceInput: config.input,
        unitPriceOutput: config.output,
        priceMetadata: config.metadata
      }
    });

    updatedCount++;
    if (updatedCount % 100 === 0) {
      console.log(`Updated ${updatedCount}/${calls.length} calls...`);
    }
  }

  console.log(`✅ Successfully updated ${updatedCount} calls with precise pricing.`);
}

migrate()
  .catch(e => {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
