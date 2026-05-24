import { prisma } from "../lib/db";

// Helper to calculate cost for synthetic data seeding
interface Price {
  input: number;
  output: number;
  cacheRead: number;
}

const MODEL_PRICES: Record<string, Price> = {
  // Claude Code
  "claude-sonnet-4-6":         { input: 3.0,   output: 15.0,  cacheRead: 0.3    },
  "claude-opus-4-6":           { input: 5.0,   output: 25.0,  cacheRead: 0.5    },
  "claude-haiku-3-5":          { input: 0.8,   output: 4.0,   cacheRead: 0.08   },
  // Cline
  "gemini-2.5-pro":            { input: 1.25,  output: 10.0,  cacheRead: 0.3125 },
  "gemini-2.5-flash":          { input: 0.30,  output: 2.50,  cacheRead: 0.075  },
  // Codex
  "gpt-5.3-codex":           { input: 1.25,  output: 10.0,  cacheRead: 0.125  },
  "gpt-5.4":                 { input: 2.50,  output: 15.0,  cacheRead: 0.25   },
  "gpt-5.4-mini":            { input: 0.75,  output: 4.5,   cacheRead: 0.075  },
  // Gemini CLI & Antigravity
  "Gemini 3.5 Flash (Medium)": { input: 0.15,  output: 0.60,  cacheRead: 0.0375 },
  "Gemini 3.1 Pro (High)":     { input: 1.25,  output: 10.0,  cacheRead: 0.3125 },
  "gemini-3.1-pro-preview":    { input: 2.00,  output: 12.0,  cacheRead: 0.50   },
  "gemini-3-flash-preview":    { input: 0.50,  output: 3.00,  cacheRead: 0.125  },
  // Subscriptions
  "github-copilot":            { input: 0,     output: 0,     cacheRead: 0      },
  "cursor-default":            { input: 0,     output: 0,     cacheRead: 0      },
};

function getPrice(model: string): Price {
  return MODEL_PRICES[model] ?? { input: 0.15, output: 0.60, cacheRead: 0.0375 };
}

function calculateCost(model: string, input: number, cache: number, output: number): number {
  const p = getPrice(model);
  return (input * p.input + cache * p.cacheRead + output * p.output) / 1_000_000;
}

async function main() {
  console.log("🌱 Cleaning up existing database calls and seeding dynamic configurations...");
  
  // Wipe existing database calls first to prevent duplicated mock counts
  await prisma.call.deleteMany({});
  await prisma.syncState.deleteMany({});

  const configs = [
    { source: "gemini", modelPattern: "pro", unitPriceInput: 1.25, unitPriceOutput: 10.0, unitPriceCache: 0.3125, version: "gemini-2.5-pro-v1" },
    { source: "gemini", modelPattern: "flash", unitPriceInput: 0.30, unitPriceOutput: 2.50, unitPriceCache: 0.075, version: "gemini-2.5-flash-v1" },
    { source: "codex", modelPattern: "*", unitPriceInput: 1.25, unitPriceOutput: 10.0, unitPriceCache: 0.125, version: "openai-codex-v1" },
    { source: "claude_code", modelPattern: "sonnet", unitPriceInput: 3.0, unitPriceOutput: 15.0, unitPriceCache: 0.3, version: "anthropic-sonnet-v1" },
    { source: "claude_code", modelPattern: "opus", unitPriceInput: 5.0, unitPriceOutput: 25.0, unitPriceCache: 0.5, version: "anthropic-opus-v1" },
  ];

  for (const config of configs) {
    await prisma.priceConfig.upsert({
      where: { id: config.version },
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

  console.log("📈 Seeding 150+ realistic token usage records...");

  const platforms = [
    {
      source: "claude_code",
      project: "token-dashboard",
      models: ["claude-sonnet-4-6", "claude-opus-4-6"],
      sessions: ["claude_session_main", "claude_session_sub"],
    },
    {
      source: "cline",
      project: "EV Charging",
      models: ["gemini-2.5-pro", "claude-sonnet-4-6"],
      sessions: ["cline_session_ev_charging"],
    },
    {
      source: "codex",
      project: "BenhVien",
      models: ["gpt-5.3-codex", "gpt-5.4"],
      sessions: ["codex_session_hospital_sys"],
    },
    {
      source: "gemini",
      project: "TIXIMAX-NET",
      models: ["gemini-3.1-pro-preview", "gemini-3-flash-preview"],
      sessions: ["gemini_session_tiximax"],
    },
    {
      source: "antigravity_cli",
      project: "token-dashboard",
      models: ["Gemini 3.5 Flash (Medium)", "Gemini 3.1 Pro (High)"],
      sessions: ["antigravity_694cd493-794e-496b-b9f1-059f97d7b014"],
    },
    {
      source: "github_copilot",
      project: "TIXIMAX-BE-2",
      models: ["github-copilot"],
      sessions: ["copilot_session_1"],
    },
  ];

  const now = Date.now();
  const dayMs = 86_400_000;
  let callIndex = 1;

  // Generate calls spread across the last 7 days
  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const dayTimestamp = now - dayOffset * dayMs;
    
    // Each day has around 20-25 calls
    const callsCountThisDay = 20 + Math.floor(Math.random() * 10);
    
    for (let c = 0; c < callsCountThisDay; c++) {
      // Pick a random platform
      const p = platforms[Math.floor(Math.random() * platforms.length)];
      const model = p.models[Math.floor(Math.random() * p.models.length)];
      const session = p.sessions[Math.floor(Math.random() * p.sessions.length)];
      
      // Calculate random timestamps distributed within the day
      const timestamp = new Date(dayTimestamp + Math.floor(Math.random() * dayMs));
      
      // Seed random but realistic token sizes
      const input = 500 + Math.floor(Math.random() * 1500);
      const cache = Math.random() > 0.4 ? (20000 + Math.floor(Math.random() * 80000)) : 0;
      const output = 200 + Math.floor(Math.random() * 1000);
      
      const cost = calculateCost(model, input, cache, output);
      const price = getPrice(model);

      const id = `seed_call_${callIndex++}`;
      
      await prisma.call.create({
        data: {
          id,
          source: p.source,
          model,
          inputTokens: input,
          cacheTokens: cache,
          cacheCreationTokens: 0,
          outputTokens: output,
          cost,
          unitPriceInput: price.input,
          unitPriceOutput: price.output,
          priceMetadata: `seed-metadata-${model}-v1`,
          timestamp,
          sessionId: session,
          project: p.project,
        }
      });
    }
  }

  console.log(`✅ Seeding complete. Successfully seeded ${callIndex - 1} token calls.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
