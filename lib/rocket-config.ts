
export interface RocketConfig {
  selectedColor: string | null;
  flameColor: string | null;
  selectedSkin: string;
  unlockedSkins: string[];
  spentCoins: number;
}

const STORAGE_KEY = "rocket_dashboard_config";

const DEFAULT_CONFIG: RocketConfig = {
  selectedColor: null,
  flameColor: null,
  selectedSkin: "default",
  unlockedSkins: ["default"],
  spentCoins: 0,
};

export const getRocketConfig = (): RocketConfig => {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(stored);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
};

export const saveRocketConfig = (config: RocketConfig) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new Event("rocket-config-updated"));
};
