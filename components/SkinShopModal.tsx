"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, ShoppingBag, Check, Lock, Zap } from "lucide-react";
import { getRocketConfig, saveRocketConfig, RocketConfig } from "@/lib/rocket-config";
import { drawFlame, drawUFO, drawHighQualityRocket } from "@/lib/rocket-renderer";

interface Skin {
  id: string;
  name: string;
  price: number;
  icon: string;
  description: string;
}

const SKINS: Skin[] = [
  { id: "default", name: "Classic Rocket", price: 0, icon: "🚀", description: "Standard high-velocity interceptor." },
  { id: "ufo", name: "Alien Saucer", price: 5, icon: "🛸", description: "Extraterrestrial tech with tractor beam." },
  { id: "plane", name: "Paper Wing", price: 15, icon: "✈️", description: "Lightweight, agile, surprisingly fast." },
];

const COLORS = [
  { name: "Auto", hex: null },
  { name: "Gold", hex: "#ffd700" },
  { name: "Neon Pink", hex: "#ff007f" },
  { name: "Matrix", hex: "#00ff41" },
  { name: "Cyan", hex: "#00ffff" },
];

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
      const cx = canvas.width / 2 - 20; 
      const cy = canvas.height / 2;
      const color = config.selectedColor || "#3b82f6";
      const thrust = previewBoost ? 0.9 : 0.45;
      const boost = previewBoost ? 1.0 : 0;
      const roll = t * 2.5;

      ctx.save();
      ctx.translate(cx, cy);
      
      drawFlame(ctx, thrust, color, t, 123, boost);

      if (previewSkinId === 'ufo') {
        drawUFO(ctx, color, thrust, t, roll, SHIP_SIZE);
      } else {
        ctx.save();
        ctx.scale(1.2, 1.2);
        ctx.translate(-42, 0);
        ctx.scale(1, Math.cos(roll));
        drawHighQualityRocket(ctx, color, thrust);
        ctx.restore();
      }
      
      ctx.restore();
      raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [isOpen, config, previewBoost, previewSkinId]);

  if (!isOpen || !config) return null;

  const handleBuy = (skin: Skin) => {
    if (config.virtualCoins >= skin.price) {
      const newConfig = {
        ...config,
        virtualCoins: config.virtualCoins - skin.price,
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-4xl bg-[#0a0b14] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl flex flex-col md:flex-row h-[80vh]">
        
        {/* Left: Preview Area */}
        <div className="w-full md:w-1/2 bg-gradient-to-br from-[#121421] to-[#0a0b14] relative flex flex-col items-center justify-center p-8 border-r border-white/5">
          <div className="absolute top-6 left-8">
             <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                <ShoppingBag className="w-4 h-4 text-emerald-400" />
                <span className="text-[13px] font-bold text-white/90 tabular-nums">
                  {config.virtualCoins.toFixed(2)} COINS
                </span>
             </div>
          </div>

          <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter italic">Hangar Preview</h2>
          <p className="text-white/40 text-sm mb-8">Test your craft in high-velocity simulation</p>
          
          <div className="relative w-64 h-64 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center overflow-hidden">
             <canvas ref={canvasRef} width={256} height={256} className="w-full h-full" />
             <div className="absolute inset-0 bg-radial-gradient from-transparent to-[#0a0b14]/50 pointer-events-none" />
          </div>

          <button 
            onMouseDown={() => setPreviewBoost(true)}
            onMouseUp={() => setPreviewBoost(false)}
            onMouseLeave={() => setPreviewBoost(false)}
            className={`mt-10 flex items-center gap-3 px-8 py-3 rounded-2xl font-black uppercase tracking-widest transition-all ${
              previewBoost 
                ? "bg-orange-500 text-white scale-95 shadow-[0_0_30px_rgba(249,115,22,0.5)]" 
                : "bg-white/10 text-white/60 hover:bg-white/15"
            }`}
          >
            <Zap className={`w-5 h-5 ${previewBoost ? "animate-pulse" : ""}`} />
            {previewBoost ? "Full Afterburner" : "Hold to Boost"}
          </button>
        </div>

        {/* Right: Shop Items */}
        <div className="w-full md:w-1/2 flex flex-col p-8 overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-sm font-bold text-white/30 uppercase tracking-[0.3em]">Available Skins</h3>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X className="w-6 h-6 text-white/50" />
            </button>
          </div>

          <div className="space-y-4 mb-10">
            {SKINS.map((skin) => {
              const isUnlocked = config.unlockedSkins.includes(skin.id);
              const isSelected = config.selectedSkin === skin.id;
              const canAfford = config.virtualCoins >= skin.price;

              return (
                <div 
                  key={skin.id}
                  onClick={() => isUnlocked ? handleSelect(skin.id) : (setPreviewSkinId(skin.id))}
                  className={`group relative flex items-center gap-5 p-4 rounded-2xl border transition-all cursor-pointer ${
                    (isSelected || previewSkinId === skin.id)
                      ? "bg-white/10 border-white/20 shadow-xl" 
                      : "bg-white/[0.02] border-white/5 hover:border-white/10"
                  }`}
                >
                  <div className="w-14 h-14 bg-white/5 rounded-xl flex items-center justify-center text-3xl">
                    {skin.icon}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white font-bold">{skin.name}</h4>
                    <p className="text-white/40 text-xs mt-0.5">{skin.description}</p>
                  </div>
                  
                  {isUnlocked ? (
                    isSelected ? (
                      <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                        <Check className="w-4 h-4" /> ACTIVE
                      </div>
                    ) : (
                      <span className="text-white/20 font-bold text-xs group-hover:text-white/60">EQUIP</span>
                    )
                  ) : (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleBuy(skin); }}
                      disabled={!canAfford}
                      className={`px-4 py-2 rounded-xl font-black text-xs transition-all ${
                        canAfford 
                          ? "bg-emerald-500 text-white hover:scale-105 shadow-[0_0_15px_rgba(16,185,129,0.3)]" 
                          : "bg-white/5 text-white/20 cursor-not-allowed"
                      }`}
                    >
                      {skin.price} COINS
                    </button>
                  )}

                  {!isUnlocked && !canAfford && (
                    <div className="absolute top-2 right-2">
                       <Lock className="w-3 h-3 text-white/10" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <h3 className="text-sm font-bold text-white/30 uppercase tracking-[0.3em] mb-4">Core Colors</h3>
          <div className="flex flex-wrap gap-3">
            {COLORS.map((c) => (
              <button
                key={c.name}
                onClick={() => {
                  const newCfg = { ...config, selectedColor: c.hex };
                  setConfig(newCfg);
                  saveRocketConfig(newCfg);
                }}
                className={`w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center ${
                  config.selectedColor === c.hex
                    ? "border-white scale-110 shadow-lg"
                    : "border-transparent hover:border-white/20"
                }`}
                style={{ backgroundColor: c.hex || "#3b82f6", backgroundImage: !c.hex ? "linear-gradient(45deg, #3b82f6, #10b981)" : "" }}
              >
                {config.selectedColor === c.hex && <Check className="w-4 h-4 text-white" />}
                {!c.hex && <span className="text-[8px] font-bold text-white uppercase">Auto</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
