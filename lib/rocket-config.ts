
export interface RocketConfig {
  selectedColor: string | null;
  selectedSkin: string;
  unlockedSkins: string[]; // List of skin IDs user owns
  virtualCoins: number;   // Coins earned from tokens
  lastTotalTokens: number; // Last recorded total tokens to track delta
}

const STORAGE_KEY = 'rocket_dashboard_config';

const DEFAULT_CONFIG: RocketConfig = {
  selectedColor: null,
  selectedSkin: 'default',
  unlockedSkins: ['default'],
  virtualCoins: 0,
  lastTotalTokens: 0,
};

export const getRocketConfig = (): RocketConfig => {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(stored);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (e) {
    return DEFAULT_CONFIG;
  }
};

export const saveRocketConfig = (config: RocketConfig) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new Event('rocket-config-updated'));
};

/**
 * Updates virtual coins based on current total tokens.
 * 1M tokens = 1 Coin.
 */
export const updateCoinsFromTokens = (currentTotal: number) => {
  const config = getRocketConfig();
  if (currentTotal > config.lastTotalTokens) {
    const delta = currentTotal - config.lastTotalTokens;
    // We add fractional coins to keep it precise, or just use Math.floor
    const earned = delta / 1_000_000;
    config.virtualCoins += earned;
    config.lastTotalTokens = currentTotal;
    saveRocketConfig(config);
  }
};
