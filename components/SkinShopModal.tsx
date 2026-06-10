"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, ShoppingBag, Check, Lock, Zap } from "lucide-react";
import { getRocketConfig, saveRocketConfig, RocketConfig } from "@/lib/rocket-config";
import { drawFlame, drawCyberUFO, drawCyberCruiser, drawCyberJet, drawCyberInterceptor, drawNeonSpeeder, drawCyberDrone } from "@/lib/rocket-renderer";

interface Skin {
  id: string;
  name: string;
  price: number;
  icon: string;
  description: string;
}

const SKINS: Skin[] = [
  { id: "default", name: "Cyber Cruiser", price: 0, icon: "🚀", description: "Standard high-velocity interceptor." },
  { id: "ufo", name: "Neon Saucer", price: 5, icon: "🛸", description: "Extraterrestrial tech with tractor beam." },
  { id: "plane", name: "Paper Dart", price: 15, icon: "✈️", description: "Lightweight, agile, surprisingly fast." },
  { id: "interceptor", name: "Star Interceptor", price: 30, icon: "⚔️", description: "X-wing styled high-combat speeder." },
  { id: "speeder", name: "Neon Speeder", price: 20, icon: "🏎️", description: "Pod-racer inspired with dual engines." },
  { id: "drone", name: "Cyber Drone", price: 10, icon: "🛰️", description: "Surveillance core with glowing orbital rings." },
];

const COLORS = [
  { name: "Auto", hex: null },
  { name: "Gold", hex: "#ffd700" },
  { name: "Neon Pink", hex: "#ff007f" },
  { name: "Matrix", hex: "#00ff41" },
  { name: "Cyan", hex: "#00ffff" },
  { name: "Blood Red", hex: "#ff0000" },
];

const FLAME_COLORS = [
  { name: "Default (Orange)", hex: null },
  { name: "Toxic Green", hex: "#00ff00" },
  { name: "Plasma Blue", hex: "#00bfff" },
  { name: "Void Purple", hex: "#a855f7" },
  { name: "Pink", hex: "#ff1493" },
];

function Scanlines() {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "repeating-linear-gradient(0deg, rgba(0,255,200,0.025) 0px, rgba(0,255,200,0.025) 1px, transparent 2px, transparent 4px)",
      pointerEvents: "none",
    }} />
  );
}

export default function SkinShopModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [config, setConfig] = useState<RocketConfig | null>(null);
  const [previewBoost, setPreviewBoost] = useState(false);
  const [previewSkinId, setPreviewSkinId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (isOpen) {
      const cfg = getRocketConfig();
      setConfig(cfg);
      setPreviewSkinId(cfg.selectedSkin);
    }
  }, [isOpen]);

  // Preview Animation Logic
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !config || !previewSkinId) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let t = 0;
    const SHIP_SIZE = 64;
    
    const render = () => {
      t += 0.016;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2 + 10; 
      const cy = canvas.height / 2;
      const color = config.selectedColor || "#3b82f6";
      const flameColor = config.flameColor || null;
      const thrust = previewBoost ? 0.9 : 0.45;
      const boost = previewBoost ? 1.0 : 0;
      const roll = t * 2.5;

      ctx.save();
      ctx.translate(cx, cy);
      
      drawFlame(ctx, thrust, color, flameColor, t, 123, boost);

      if (previewSkinId === 'ufo') {
        drawCyberUFO(ctx, color, thrust, t, roll, SHIP_SIZE);
      } else if (previewSkinId === 'plane') {
        drawCyberJet(ctx, color, thrust);
      } else if (previewSkinId === 'interceptor') {
        drawCyberInterceptor(ctx, color, true, Math.sin(roll)*0.05);
      } else if (previewSkinId === 'speeder') {
        drawNeonSpeeder(ctx, color, thrust);
      } else if (previewSkinId === 'drone') {
        drawCyberDrone(ctx, color, t);
      } else {
        ctx.save();
        ctx.scale(1.2, 1.2);
        drawCyberCruiser(ctx, color, true, Math.sin(roll)*0.05); 
        ctx.restore();
      }
      
      ctx.restore();
      raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [isOpen, config, previewBoost, previewSkinId]);

  if (!isOpen || !config) return null;

  const availableCoins = config.virtualCoins - (config.spentCoins || 0);

  const handleBuy = (skin: Skin) => {
    if (availableCoins >= skin.price) {
      const newConfig = {
        ...config,
        spentCoins: (config.spentCoins || 0) + skin.price,
        unlockedSkins: [...config.unlockedSkins, skin.id],
        selectedSkin: skin.id
      };
      setConfig(newConfig);
      setPreviewSkinId(skin.id);
      saveRocketConfig(newConfig);
    }
  };

  const handleSelect = (skinId: string) => {
    if (config.unlockedSkins.includes(skinId)) {
      const newConfig = { ...config, selectedSkin: skinId };
      setConfig(newConfig);
      setPreviewSkinId(skinId);
      saveRocketConfig(newConfig);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
      <div 
        className="relative w-full max-w-5xl border border-[#00ffc8]/30 overflow-hidden shadow-[0_0_50px_rgba(0,255,200,0.15)] flex flex-col md:flex-row h-[85vh]"
        style={{
          background: "radial-gradient(ellipse at center, #0a0d1c 0%, #03040a 70%)",
          borderRadius: 16
        }}
      >
        <Scanlines />
        
        {/* Left: Preview Area */}
        <div className="w-full md:w-[45%] relative flex flex-col items-center justify-center p-8 border-r border-[#00ffc8]/20 z-10">
          <div className="absolute top-6 left-8">
             <div className="flex items-center gap-2 px-4 py-1.5 bg-[#00ffc8]/10 rounded-full border border-[#00ffc8]/30 shadow-[0_0_15px_rgba(0,255,200,0.2)]">
                <ShoppingBag className="w-4 h-4 text-[#00ffc8]" />
                <span className="text-[13px] font-black text-[#00ffc8] tabular-nums tracking-widest font-mono">
                  {availableCoins.toFixed(2)} COINS
                </span>
             </div>
          </div>

          <h1 className="glitch-title text-3xl mb-1" data-text="HANGAR">HANGAR</h1>
          <p className="text-[#00ffc8]/50 text-xs mb-8 tracking-[0.2em] font-mono uppercase">Craft Configuration</p>
          
          <div className="relative w-72 h-72 rounded-full bg-[#00ffc8]/[0.03] border border-[#00ffc8]/20 flex items-center justify-center overflow-hidden shadow-[inset_0_0_30px_rgba(0,255,200,0.05)]">
             <canvas ref={canvasRef} width={288} height={288} className="w-full h-full drop-shadow-[0_0_15px_rgba(0,255,200,0.5)]" />
             <div className="absolute inset-0 bg-radial-gradient from-transparent to-[#0a0b14]/50 pointer-events-none" />
          </div>

          <button 
            onMouseDown={() => setPreviewBoost(true)}
            onMouseUp={() => setPreviewBoost(false)}
            onMouseLeave={() => setPreviewBoost(false)}
            className={`mt-10 flex items-center gap-3 px-8 py-3 font-black uppercase tracking-[0.2em] transition-all border font-mono text-sm ${
              previewBoost 
                ? "bg-[#ff9f59]/20 border-[#ff9f59] text-[#ff9f59] scale-95 shadow-[0_0_30px_rgba(255,159,89,0.4)] rounded-xl" 
                : "bg-[#00ffc8]/10 border-[#00ffc8]/50 text-[#00ffc8] hover:bg-[#00ffc8]/20 rounded-xl"
            }`}
          >
            <Zap className={`w-4 h-4 ${previewBoost ? "animate-pulse" : ""}`} />
            {previewBoost ? "AFTERBURNER" : "HOLD TO BOOST"}
          </button>
        </div>

        {/* Right: Shop Items */}
        <div className="w-full md:w-[55%] flex flex-col p-8 overflow-y-auto custom-scrollbar z-10 bg-[#000000]/40">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xs font-black text-[#00ffc8]/60 uppercase tracking-[0.3em] font-mono">Available Models</h3>
            <button onClick={onClose} className="p-2 hover:bg-[#ff6b8a]/20 border border-transparent hover:border-[#ff6b8a]/50 rounded-lg transition-all">
              <X className="w-5 h-5 text-[#ff6b8a]" />
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-8">
            {SKINS.map((skin) => {
              const isUnlocked = config.unlockedSkins.includes(skin.id);
              const isSelected = config.selectedSkin === skin.id;
              const canAfford = availableCoins >= skin.price;

              return (
                <div 
                  key={skin.id}
                  onClick={() => isUnlocked ? handleSelect(skin.id) : (setPreviewSkinId(skin.id))}
                  className={`group relative flex flex-col p-4 rounded-xl border transition-all cursor-pointer backdrop-blur-md ${
                    (isSelected || previewSkinId === skin.id)
                      ? "bg-[#00ffc8]/10 border-[#00ffc8] shadow-[0_0_20px_rgba(0,255,200,0.15)]" 
                      : "bg-[#ffffff]/[0.02] border-white/10 hover:border-[#00ffc8]/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-black/50 rounded-lg border border-white/10 flex items-center justify-center text-xl shadow-inner">
                      {skin.icon}
                    </div>
                    <div className="flex-1">
                      <h4 className="text-white font-black font-mono tracking-wider text-sm">{skin.name}</h4>
                      <div className="flex items-center justify-between mt-1">
                        {isUnlocked ? (
                          isSelected ? (
                            <div className="flex items-center gap-1 text-[#00ffc8] font-black text-[10px] font-mono bg-[#00ffc8]/10 px-2 py-0.5 rounded">
                              <Check className="w-3 h-3" /> ACTIVE
                            </div>
                          ) : (
                            <span className="text-white/30 font-black text-[10px] font-mono group-hover:text-[#00ffc8] transition-colors">EQUIP</span>
                          )
                        ) : (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleBuy(skin); }}
                            disabled={!canAfford}
                            className={`px-2 py-1 rounded font-black text-[10px] font-mono tracking-widest transition-all border ${
                              canAfford 
                                ? "bg-[#00ffc8]/20 border-[#00ffc8] text-[#00ffc8] hover:bg-[#00ffc8]/40 shadow-[0_0_15px_rgba(0,255,200,0.3)]" 
                                : "bg-black/50 border-white/10 text-white/20 cursor-not-allowed"
                            }`}
                          >
                            {skin.price} COINS
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-[#00ffc8]/40 text-[10px] uppercase tracking-widest mt-3 font-mono leading-relaxed line-clamp-2 min-h-[30px]">{skin.description}</p>
                  
                  {!isUnlocked && !canAfford && (
                    <div className="absolute top-2 right-2">
                       <Lock className="w-3 h-3 text-white/10" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col xl:flex-row gap-8">
            <div className="flex-1">
              <h3 className="text-xs font-black text-[#00ffc8]/60 uppercase tracking-[0.3em] font-mono mb-4">Hull Color</h3>
              <div className="flex flex-wrap gap-3">
                {COLORS.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => {
                      const newCfg = { ...config, selectedColor: c.hex };
                      setConfig(newCfg);
                      saveRocketConfig(newCfg);
                    }}
                    className={`relative w-8 h-8 rounded border transition-all flex items-center justify-center overflow-hidden ${
                      config.selectedColor === c.hex
                        ? "border-white scale-110 shadow-[0_0_15px_currentColor]"
                        : "border-white/20 hover:border-[#00ffc8]"
                    }`}
                    style={{ 
                      backgroundColor: c.hex || "#3b82f6", 
                      backgroundImage: !c.hex ? "linear-gradient(45deg, #3b82f6, #00ffc8)" : "",
                      color: c.hex || "#00ffc8"
                    }}
                  >
                    <div className="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPjwvc3ZnPg==')]" />
                    {config.selectedColor === c.hex && <Check className="w-4 h-4 text-white drop-shadow-md z-10" />}
                    {!c.hex && <span className="text-[8px] font-black text-white uppercase z-10 drop-shadow-md">Auto</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1">
              <h3 className="text-xs font-black text-[#ff9f59]/60 uppercase tracking-[0.3em] font-mono mb-4">Plasma Exhaust</h3>
              <div className="flex flex-wrap gap-3">
                {FLAME_COLORS.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => {
                      const newCfg = { ...config, flameColor: c.hex };
                      setConfig(newCfg);
                      saveRocketConfig(newCfg);
                    }}
                    className={`relative w-8 h-8 rounded border transition-all flex items-center justify-center overflow-hidden ${
                      config.flameColor === c.hex
                        ? "border-white scale-110 shadow-[0_0_15px_currentColor]"
                        : "border-white/20 hover:border-[#ff9f59]"
                    }`}
                    style={{ 
                      backgroundColor: c.hex || "#ff6e14", 
                      backgroundImage: !c.hex ? "linear-gradient(45deg, #ff6e14, #ffd25a)" : "",
                      color: c.hex || "#ff9f59"
                    }}
                  >
                    {config.flameColor === c.hex && <Check className="w-4 h-4 text-white drop-shadow-md z-10" />}
                    {!c.hex && <span className="text-[8px] font-black text-white uppercase z-10 drop-shadow-md">Auto</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
