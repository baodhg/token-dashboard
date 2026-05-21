// Shared types for all sync services

export interface ModelPrice {
  input:      number;  // $ per 1M tokens — fresh input (not cached)
  output:     number;  // $ per 1M tokens — generated output
  cacheRead:  number;  // $ per 1M tokens — served from cache (0.1× input typically)
  cacheWrite: number;  // $ per 1M tokens — written to cache (1.25× input for Claude)
}

export interface SyncResult {
  synced: number;
}

// Full token breakdown stored per API call
export interface CallTokens {
  inputTokens:         number;  // fresh tokens not from cache
  cacheCreationTokens: number;  // tokens written to cache this turn
  cacheTokens:         number;  // tokens read from cache this turn
  outputTokens:        number;
}

export function calcCost(price: ModelPrice, tokens: CallTokens): number {
  return (tokens.inputTokens         / 1_000_000) * price.input
       + (tokens.cacheCreationTokens / 1_000_000) * price.cacheWrite
       + (tokens.cacheTokens         / 1_000_000) * price.cacheRead
       + (tokens.outputTokens        / 1_000_000) * price.output;
}
