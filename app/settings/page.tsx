"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, Check, ChevronRight } from "lucide-react";
import { getRocketConfig, saveRocketConfig, RocketConfig } from "@/lib/rocket-config";

type Theme = "light" | "dark" | "system";
type Lang = "vi" | "en" | "ja" | "ko";

const THEMES: { key: Theme; label: string }[] = [
  { key: "light",  label: "Light" },
  { key: "dark",   label: "Dark" },
  { key: "system", label: "System" },
];

const LANGUAGES: { key: Lang; label: string; native: string }[] = [
  { key: "vi", label: "Tiếng Việt", native: "Tiếng Việt" },
  { key: "en", label: "English",    native: "English" },
  { key: "ja", label: "Japanese",   native: "日本語" },
  { key: "ko", label: "Korean",     native: "한국어" },
];

const CUSTOM_COLORS = [
  { name: "Default", hex: null },
  { name: "Gold", hex: "#ffd700" },
  { name: "Cyber Pink", hex: "#ff007f" },
  { name: "Matrix Green", hex: "#00ff41" },
  { name: "Electric Blue", hex: "#00ffff" },
  { name: "Blood Red", hex: "#ff0000" },
];

const SKINS = [
  { id: "default", name: "Classic Rocket", icon: "🚀" },
  { id: "ufo", name: "Alien UFO", icon: "🛸" },
  { id: "plane", name: "Paper Plane", icon: "✈️" },
];

function ThemeCard({ theme, selected, onSelect }: { theme: Theme; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="flex flex-col items-center gap-2 cursor-pointer group"
    >
      <div
        className={`relative w-full aspect-4/3 rounded-2xl overflow-hidden border-2 transition-all ${
          selected
            ? "border-[#1c1c1e] shadow-[0_0_0_4px_rgba(28,28,30,0.08)]"
            : "border-black/8 hover:border-black/18"
        }`}
      >
        {theme === "light" && (
          <div className="w-full h-full bg-[#f2f2f7] flex items-center justify-center">
            <div className="bg-white rounded-xl px-4 py-2.5 shadow-sm border border-black/6">
              <span className="text-[22px] font-semibold text-[#1c1c1e]">Aa</span>
            </div>
          </div>
        )}
        {theme === "dark" && (
          <div className="w-full h-full bg-[#1c1c1e] flex items-center justify-center">
            <div className="bg-[#2c2c2e] rounded-xl px-4 py-2.5 border border-white/8">
              <span className="text-[22px] font-semibold text-white">Aa</span>
            </div>
          </div>
        )}
        {theme === "system" && (
          <div className="w-full h-full flex overflow-hidden">
            <div className="w-1/2 h-full bg-[#f2f2f7] flex items-center justify-end pr-1">
              <div className="bg-white rounded-l-xl pl-3 pr-1 py-2.5 shadow-sm border-l border-y border-black/6">
                <span className="text-[20px] font-semibold text-[#1c1c1e]">Aa</span>
              </div>
            </div>
            <div className="w-1/2 h-full bg-[#1c1c1e] flex items-center justify-start pl-1">
              <div className="bg-[#2c2c2e] rounded-r-xl pr-3 pl-1 py-2.5 border-r border-y border-white/8">
                <span className="text-[20px] font-semibold text-white">Aa</span>
              </div>
            </div>
          </div>
        )}
        {selected && (
          <div className="absolute bottom-2 right-2 w-6 h-6 bg-[#1c1c1e] rounded-full flex items-center justify-center shadow-sm">
            <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
          </div>
        )}
      </div>
      <span className={`text-[14px] font-medium ${selected ? "text-[#1c1c1e]" : "text-[#3c3c43]"}`}>
        {theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System"}
      </span>
    </button>
  );
}

export default function SettingsPage() {
  const [theme, setTheme] = useState<Theme>("system");
  const [lang, setLang]   = useState<Lang>("vi");
  const [rocketConfig, setRocketConfig] = useState<RocketConfig>({
    selectedColor: null,
    flameColor: null,
    selectedSkin: "default",
    unlockedSkins: ["default"],
    spentCoins: 0,
  });

  useEffect(() => {
    setRocketConfig(getRocketConfig());
  }, []);

  const handleColorChange = (hex: string | null) => {
    const newConfig = { ...rocketConfig, selectedColor: hex };
    setRocketConfig(newConfig);
    saveRocketConfig(newConfig);
  };

  const handleSkinChange = (skinId: string) => {
    const newConfig = { ...rocketConfig, selectedSkin: skinId };
    setRocketConfig(newConfig);
    saveRocketConfig(newConfig);
  };

  return (
    <div className="min-h-screen bg-[#f2f2f7] flex items-start justify-center py-8 px-4">
      <div className="w-full max-w-sm bg-white rounded-[28px] overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.10)]">

        {/* Header */}
        <div className="relative flex items-center justify-center h-14 px-4 border-b border-black/6">
          <Link
            href="/"
            className="absolute left-4 w-8 h-8 rounded-full bg-[#f2f2f7] hover:bg-[#e5e5ea] flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-[#3c3c43]" />
          </Link>
          <h1 className="text-[17px] font-semibold text-[#1c1c1e]">App settings</h1>
        </div>

        <div className="px-5 py-6 space-y-7">
          {/* ROCKET CUSTOMIZATION */}
          <section>
            <p className="text-[11px] font-semibold text-[#aeaeb2] tracking-widest uppercase mb-4">
              Rocket Customization
            </p>
            
            {/* Color Selection */}
            <div className="space-y-3 mb-6">
              <p className="text-[13px] font-medium text-[#3c3c43]">Accent Color</p>
              <div className="flex flex-wrap gap-2.5">
                {CUSTOM_COLORS.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => handleColorChange(c.hex)}
                    title={c.name}
                    className={`w-9 h-9 rounded-full border-2 transition-all flex items-center justify-center ${
                      rocketConfig.selectedColor === c.hex
                        ? "border-[#1c1c1e] scale-110 shadow-sm"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: c.hex || "#f2f2f7" }}
                  >
                    {!c.hex && <span className="text-[10px] text-[#8e8e93]">Auto</span>}
                    {rocketConfig.selectedColor === c.hex && (
                      <Check className={`w-4 h-4 ${!c.hex || c.name === 'Gold' || c.name === 'Matrix Green' || c.name === 'Electric Blue' ? 'text-[#1c1c1e]' : 'text-white'}`} />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Skin Selection */}
            <div className="space-y-3">
              <p className="text-[13px] font-medium text-[#3c3c43]">Rocket Skin</p>
              <div className="space-y-2">
                {SKINS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSkinChange(s.id)}
                    disabled={s.id === 'plane'}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all ${
                      rocketConfig.selectedSkin === s.id
                        ? "bg-[#f2f2f7] ring-1 ring-black/5"
                        : "hover:bg-[#f2f2f7]/50"
                    } ${s.id === 'plane' ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{s.icon}</span>
                      <div className="text-left">
                        <p className="text-[14px] font-medium text-[#1c1c1e]">{s.name}</p>
                        {s.id === 'plane' && <p className="text-[10px] text-orange-500 font-bold uppercase">Coming Soon</p>}
                      </div>
                    </div>
                    {rocketConfig.selectedSkin === s.id && (
                      <Check className="w-4 h-4 text-[#1c1c1e]" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Divider */}
          <div className="h-px bg-black/6" />

          {/* APPEARANCE */}
          <section>
            <p className="text-[11px] font-semibold text-[#aeaeb2] tracking-widest uppercase mb-4">
              Appearance
            </p>
            <div className="grid grid-cols-3 gap-3">
              {THEMES.map((t) => (
                <ThemeCard
                  key={t.key}
                  theme={t.key}
                  selected={theme === t.key}
                  onSelect={() => setTheme(t.key)}
                />
              ))}
            </div>
          </section>

          {/* Divider */}
          <div className="h-px bg-black/6" />

          {/* LANGUAGE */}
          <section>
            <p className="text-[11px] font-semibold text-[#aeaeb2] tracking-widest uppercase mb-3">
              Language
            </p>
            <div className="space-y-1">
              {LANGUAGES.map((l) => (
                <button
                  key={l.key}
                  onClick={() => setLang(l.key)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-colors cursor-pointer hover:bg-[#f2f2f7]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        lang === l.key
                          ? "border-[#1c1c1e] bg-[#1c1c1e]"
                          : "border-[#c7c7cc]"
                      }`}
                    >
                      {lang === l.key && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                    <span className="text-[15px] font-medium text-[#1c1c1e]">{l.native}</span>
                  </div>
                  {lang === l.key && (
                    <Check className="w-4 h-4 text-[#1c1c1e]" strokeWidth={2.5} />
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Divider */}
          <div className="h-px bg-black/6" />

          {/* MORE OPTIONS */}
          <section>
            <p className="text-[11px] font-semibold text-[#aeaeb2] tracking-widest uppercase mb-3">
              Thêm tuỳ chọn
            </p>
            <div className="space-y-1">
              {[
                { label: "API Keys",        sub: "Quản lý khóa truy cập" },
                { label: "Thông báo",        sub: "Email & push notifications" },
                { label: "Giới hạn token",   sub: "Cảnh báo khi vượt ngưỡng" },
              ].map((item) => (
                <button
                  key={item.label}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl hover:bg-[#f2f2f7] transition-colors cursor-pointer group"
                >
                  <div className="text-left">
                    <p className="text-[15px] font-medium text-[#1c1c1e]">{item.label}</p>
                    <p className="text-[12px] text-[#aeaeb2] mt-0.5">{item.sub}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#c7c7cc] group-hover:text-[#8e8e93] transition-colors" />
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
