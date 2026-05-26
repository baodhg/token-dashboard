import { prisma } from "../lib/db";

async function main() {
  console.log("🌱 Seeding GitHub Copilot usage-based prices (June 2026)...");

  const prices = [
    // OpenAI
    { pattern: "gpt-4.11",     input: 2.00, output: 8.00,  cache: 0.50,  write: 0 },
    { pattern: "gpt-5-mini",   input: 0.25, output: 2.00,  cache: 0.025, write: 0 },
    { pattern: "gpt-5.2",      input: 1.75, output: 14.00, cache: 0.175, write: 0 },
    { pattern: "gpt-5.2-codex",input: 1.75, output: 14.00, cache: 0.175, write: 0 },
    { pattern: "gpt-5.3-codex",input: 1.75, output: 14.00, cache: 0.175, write: 0 },
    { pattern: "gpt-5.4",      input: 2.50, output: 15.00, cache: 0.25,  write: 0 },
    { pattern: "gpt-5.4-mini", input: 0.75, output: 4.50,  cache: 0.075, write: 0 },
    { pattern: "gpt-5.4-nano", input: 0.20, output: 1.25,  cache: 0.02,  write: 0 },
    { pattern: "gpt-5.5",      input: 5.00, output: 30.00, cache: 0.50,  write: 0 },

    // Anthropic
    { pattern: "claude-haiku-4.5", input: 1.00, output: 5.00,  cache: 0.10, write: 1.25 },
    { pattern: "claude-sonnet-4",   input: 3.00, output: 15.00, cache: 0.30, write: 3.75 },
    { pattern: "claude-sonnet-4.5", input: 3.00, output: 15.00, cache: 0.30, write: 3.75 },
    { pattern: "claude-sonnet-4.6", input: 3.00, output: 15.00, cache: 0.30, write: 3.75 },
    { pattern: "claude-opus-4.5",   input: 5.00, output: 25.00, cache: 0.50, write: 6.25 },
    { pattern: "claude-opus-4.6",   input: 5.00, output: 25.00, cache: 0.50, write: 6.25 },
    { pattern: "claude-opus-4.7",   input: 5.00, output: 25.00, cache: 0.50, write: 6.25 },

    // Google
    { pattern: "gemini-2.5-pro",   input: 1.25, output: 10.00, cache: 0.125, write: 0 },
    { pattern: "gemini-3-flash",   input: 0.50, output: 3.00,  cache: 0.05,  write: 0 },
    { pattern: "gemini-3.1-pro",   input: 2.00, output: 12.00, cache: 0.20,  write: 0 },
    { pattern: "gemini-3.5-flash", input: 1.50, output: 9.00,  cache: 0.15,  write: 0 },

    // Fine-tuned (GitHub)
    { pattern: "raptor-mini", input: 0.25, output: 2.00, cache: 0.025, write: 0 },
    { pattern: "goldeneye",   input: 1.25, output: 10.00,cache: 0.125, write: 0 },
    { pattern: "grok-code",   input: 0.25, output: 2.00, cache: 0.025, write: 0 }, // fallback for grok-code-fast-1
  ];

  for (const p of prices) {
    const id = `github_copilot_${p.pattern.replace(/\./g, '_')}_2026-06`;
    await prisma.priceConfig.upsert({
      where: { id },
      update: {
        unitPriceInput:  p.input,
        unitPriceOutput: p.output,
        unitPriceCache:  p.cache,
        unitPriceCacheWrite: p.write,
        isCurrent: true,
      },
      create: {
        id,
        source: "github_copilot",
        modelPattern: p.pattern,
        unitPriceInput:  p.input,
        unitPriceOutput: p.output,
        unitPriceCache:  p.cache,
        unitPriceCacheWrite: p.write,
        version: "2026-06",
        isCurrent: true,
      }
    });
  }

  console.log("✅ Seeded GitHub Copilot prices.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
