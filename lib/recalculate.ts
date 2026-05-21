import { prisma } from "@/lib/db";
import { calcCost, type ModelPrice } from "./sync/types";

// ── Pricing tables per source ($ per 1M tokens) ──────────────────────────────

// Source: anthropic.com/pricing (verified 2026-05-22)
// cacheWrite uses 1h price — Claude Code uses ephemeral_1h by default
const CLAUDE_PRICES: Record<string, ModelPrice> = {
  // Opus 4.x new generation — $5 input
  "claude-opus-4-7":           { input: 5,     output: 25,    cacheRead: 0.5,    cacheWrite: 10    },
  "claude-opus-4-6":           { input: 5,     output: 25,    cacheRead: 0.5,    cacheWrite: 10    },
  "claude-opus-4-5":           { input: 5,     output: 25,    cacheRead: 0.5,    cacheWrite: 10    },
  // Opus 4.1 and earlier — $15 input (legacy)
  "claude-opus-4-1":           { input: 15,    output: 75,    cacheRead: 1.5,    cacheWrite: 30    },
  "claude-opus-4":             { input: 15,    output: 75,    cacheRead: 1.5,    cacheWrite: 30    },
  // Sonnet
  "claude-sonnet-4-6":         { input: 3,     output: 15,    cacheRead: 0.3,    cacheWrite: 6     },
  "claude-sonnet-4-5":         { input: 3,     output: 15,    cacheRead: 0.3,    cacheWrite: 6     },
  "claude-sonnet-4":           { input: 3,     output: 15,    cacheRead: 0.3,    cacheWrite: 6     },
  // Haiku
  "claude-haiku-4-5":          { input: 1,     output: 5,     cacheRead: 0.1,    cacheWrite: 2     },
  "claude-haiku-4-5-20251001": { input: 1,     output: 5,     cacheRead: 0.1,    cacheWrite: 2     },
  "claude-haiku-3-5":          { input: 0.8,   output: 4,     cacheRead: 0.08,   cacheWrite: 1.6   },
};

const CODEX_PRICES: Record<string, ModelPrice> = {
  "codex":                   { input: 1.25, output: 10.0, cacheRead: 0.125, cacheWrite: 0 },
  "openai/codex":            { input: 1.25, output: 10.0, cacheRead: 0.125, cacheWrite: 0 },
  "gpt-5.3-codex":           { input: 1.25, output: 10.0, cacheRead: 0.125, cacheWrite: 0 },
  "cx/gpt-5.3-codex-xhigh":  { input: 1.25, output: 10.0, cacheRead: 0.125, cacheWrite: 0 },
  "gpt-5.4":                 { input: 2.50, output: 15.0, cacheRead: 0.25,  cacheWrite: 0 },
  "gpt-5.4-mini":            { input: 0.75, output:  4.5, cacheRead: 0.075, cacheWrite: 0 },
  "gpt-5.5":                 { input: 5.00, output: 30.0, cacheRead: 0.50,  cacheWrite: 0 },
  "gpt-5.5-pro":             { input: 30.0, output: 180.0, cacheRead: 0,   cacheWrite: 0 },
};

// Source: Google AI Studio pay-as-you-go + OpenRouter for Gemma (verified 2026-05-22)
const GEMINI_PRICES: Record<string, ModelPrice> = {
  // Gemini 3.x
  "gemini-3.1-pro-preview":            { input: 2.00,   output: 12.0,   cacheRead: 0.50,    cacheWrite: 0 },
  "gemini-3-flash-preview":            { input: 0.50,   output: 3.00,   cacheRead: 0.125,   cacheWrite: 0 },
  "gemini-3.1-flash-lite-preview":     { input: 0.25,   output: 1.50,   cacheRead: 0.0625,  cacheWrite: 0 },
  // Gemini 2.5
  "gemini-2.5-pro":                    { input: 1.25,   output: 10.0,   cacheRead: 0.3125,  cacheWrite: 0 },
  "gemini-2.5-flash":                  { input: 0.30,   output: 2.50,   cacheRead: 0.075,   cacheWrite: 0 },
  "gemini-2.5-flash-lite":             { input: 0.10,   output: 0.40,   cacheRead: 0.025,   cacheWrite: 0 },
  // Gemma 4 (avg commercial API hosts)
  "gemma-4-31b-it":                    { input: 0.13,   output: 0.38,   cacheRead: 0,       cacheWrite: 0 },
  "gemma-4-26b-a4b-it":                { input: 0.07,   output: 0.34,   cacheRead: 0,       cacheWrite: 0 },
};

const ANTIGRAVITY_PRICES: Record<string, ModelPrice> = {
  "Gemini 3.5 Flash (High)":      { input: 0.15,  output: 0.60,  cacheRead: 0.0375,  cacheWrite: 0    },
  "Gemini 3.5 Flash (Medium)":    { input: 0.15,  output: 0.60,  cacheRead: 0.0375,  cacheWrite: 0    },
  "Gemini 3.1 Pro (High)":        { input: 1.25,  output: 10.0,  cacheRead: 0.3125,  cacheWrite: 0    },
  "Gemini 3.1 Pro (Low)":         { input: 1.25,  output: 10.0,  cacheRead: 0.3125,  cacheWrite: 0    },
  "Claude Sonnet 4.6 (Thinking)": { input: 3.0,   output: 15.0,  cacheRead: 0.3,  cacheWrite: 6  },
  "Claude Opus 4.6 (Thinking)":   { input: 5.0,   output: 25.0,  cacheRead: 0.5,  cacheWrite: 10 },
  "GPT-OSS 120B (Medium)":        { input: 1.0,   output: 4.0,   cacheRead: 0,       cacheWrite: 0    },
};

function getPrice(source: string, model: string | null): ModelPrice | null {
  const m = model ?? "";

  if (source === "claude_code") {
    if (CLAUDE_PRICES[m]) return CLAUDE_PRICES[m];
    const ml = m.toLowerCase();
    // Match versioned IDs e.g. claude-opus-4-7-20250219
    for (const [key, price] of Object.entries(CLAUDE_PRICES)) {
      if (ml.startsWith(key.toLowerCase())) return price;
    }
    if (ml.includes("opus"))   return { input: 5,   output: 25,  cacheRead: 0.5,  cacheWrite: 10  }; // Opus 4.5+ default
    if (ml.includes("haiku"))  return { input: 1,   output: 5,   cacheRead: 0.1,  cacheWrite: 2   };
    return                            { input: 3,   output: 15,  cacheRead: 0.3,  cacheWrite: 6   };
  }

  // Cline supports multiple providers — route by model prefix
  if (source === "cline") {
    const ml = m.toLowerCase();
    if (ml.startsWith("claude-")) {
      if (CLAUDE_PRICES[m]) return CLAUDE_PRICES[m];
      for (const [key, price] of Object.entries(CLAUDE_PRICES)) {
        if (ml.startsWith(key.toLowerCase())) return price;
      }
      if (ml.includes("opus"))  return { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 10 };
      if (ml.includes("haiku")) return { input: 1, output: 5,  cacheRead: 0.1, cacheWrite: 2  };
      return                           { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 6  };
    }
    if (ml.startsWith("gemini-") || ml.startsWith("gemma-")) {
      if (GEMINI_PRICES[m]) return GEMINI_PRICES[m];
      for (const [key, price] of Object.entries(GEMINI_PRICES)) {
        if (ml.startsWith(key)) return price;
      }
      if (ml.startsWith("gemma")) return { input: 0.10, output: 0.35, cacheRead: 0, cacheWrite: 0 };
      if (ml.includes("pro"))    return  { input: 1.25, output: 10.0, cacheRead: 0.3125, cacheWrite: 0 };
      return                             { input: 0.30, output: 2.50, cacheRead: 0.075, cacheWrite: 0 };
    }
    if (ml.startsWith("gpt-") || ml.startsWith("cx/") || ml.startsWith("codex")) {
      return CODEX_PRICES[m] ?? { input: 1.25, output: 10.0, cacheRead: 0.125, cacheWrite: 0 };
    }
    // Unknown provider — skip to preserve Cline-reported cost
    return null;
  }

  if (source === "codex") {
    return CODEX_PRICES[m] ?? { input: 1.25, output: 10.0, cacheRead: 0.125, cacheWrite: 0 };
  }

  if (source === "gemini") {
    if (GEMINI_PRICES[m]) return GEMINI_PRICES[m];
    const ml = m.toLowerCase();
    for (const [key, price] of Object.entries(GEMINI_PRICES)) {
      if (ml.startsWith(key)) return price;
    }
    if (ml.startsWith("gemma")) return { input: 0.10,  output: 0.35, cacheRead: 0,      cacheWrite: 0 }; // avg Gemma host
    if (ml.includes("pro"))    return  { input: 1.25,  output: 10.0, cacheRead: 0.3125, cacheWrite: 0 };
    return                             { input: 0.30,  output: 2.50, cacheRead: 0.075,  cacheWrite: 0 }; // flash default
  }

  if (source === "antigravity_cli") {
    return ANTIGRAVITY_PRICES[m] ?? { input: 0.15, output: 0.60, cacheRead: 0.0375, cacheWrite: 0 };
  }

  // copilot / cursor — subscription-based, keep cost=0
  return null;
}

// ── Recalculate ───────────────────────────────────────────────────────────────

export interface RecalcResult {
  updated: number;
  skipped: number;
}

export async function recalculateCosts(): Promise<RecalcResult> {
  const records = await prisma.call.findMany({
    select: {
      id: true,
      source: true,
      model: true,
      inputTokens: true,
      cacheCreationTokens: true,
      cacheTokens: true,
      outputTokens: true,
    },
  });

  let updated = 0;
  let skipped = 0;
  const BATCH = 50;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (r) => {
        const price = getPrice(r.source, r.model);
        if (!price) { skipped++; return; }

        const cost = calcCost(price, {
          inputTokens:         r.inputTokens,
          cacheCreationTokens: r.cacheCreationTokens,
          cacheTokens:         r.cacheTokens,
          outputTokens:        r.outputTokens,
        });

        await prisma.call.update({
          where: { id: r.id },
          data:  { cost, unitPriceInput: price.input, unitPriceOutput: price.output },
        });
        updated++;
      })
    );
  }

  return { updated, skipped };
}
