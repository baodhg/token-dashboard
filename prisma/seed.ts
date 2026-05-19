import { prisma } from "../lib/db";

async function main() {
  console.log("🌱 Seeding price configurations...");

  const configs = [
    // Gemini 1.5 Pro
    {
      source: "gemini",
      modelPattern: "pro",
      unitPriceInput: 1.25,
      unitPriceOutput: 10.0,
      unitPriceCache: 0.125,
      version: "gemini-1.5-pro-v1",
    },
    // Gemini 1.5 Flash
    {
      source: "gemini",
      modelPattern: "flash",
      unitPriceInput: 0.075,
      unitPriceOutput: 0.30,
      unitPriceCache: 0.01875,
      version: "gemini-1.5-flash-v1",
    },
    // Codex (Estimated API value)
    {
      source: "codex",
      modelPattern: "*",
      unitPriceInput: 1.50,
      unitPriceOutput: 6.00,
      unitPriceCache: 0,
      version: "openai-codex-api-estimation-v1",
    },
    // Claude Sonnet (Standard value)
    {
      source: "claude_code",
      modelPattern: "sonnet",
      unitPriceInput: 3.0,
      unitPriceOutput: 15.0,
      unitPriceCache: 0.3,
      version: "anthropic-sonnet-v1",
    },
    // Claude Opus
    {
      source: "claude_code",
      modelPattern: "opus",
      unitPriceInput: 15.0,
      unitPriceOutput: 75.0,
      unitPriceCache: 1.5,
      version: "anthropic-opus-v1",
    },
    // Claude Haiku
    {
      source: "claude_code",
      modelPattern: "haiku",
      unitPriceInput: 0.25,
      unitPriceOutput: 1.25,
      unitPriceCache: 0.025,
      version: "anthropic-haiku-v1",
    }
  ];

  for (const config of configs) {
    await prisma.priceConfig.upsert({
      where: { id: config.version }, // Using version as stable ID for upsert during seeding
      update: {
        unitPriceInput: config.unitPriceInput,
        unitPriceOutput: config.unitPriceOutput,
        unitPriceCache: config.unitPriceCache,
        isCurrent: true,
      },
      create: {
        id: config.version,
        ...config
      }
    });
  }

  console.log("✅ Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
