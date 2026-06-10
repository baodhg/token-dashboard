"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, ShoppingBag, Check, Lock, Zap, RefreshCw, History } from "lucide-react";
import { getRocketConfig, saveRocketConfig, RocketConfig } from "@/lib/rocket-config";
import { drawFlame, drawSkin } from "@/lib/rocket-renderer";

interface Skin {
  id: string;
  name: string;
  price: number; // USD — must match SKIN_PRICES in race-server/server.js
  icon: string;
  description: string;
}

// Catalog — order = display order in the shop, prices ascending. Prices (USD)
// MUST match SKIN_PRICES in race-server/server.js (server-authoritative) and the
// skin ids MUST match the keys in SKIN_RENDERERS in lib/rocket-renderer.ts.
const SKINS: Skin[] = [
  { id: "default",     name: "Cyber Cruiser",    price: 0,    icon: "🚀", description: "Standard high-velocity interceptor." },
  { id: "dart",        name: "Dart Arrow",       price: 8,    icon: "🎯", description: "Slim arrowhead with swept tail fins." },
  { id: "ufo",         name: "Neon Saucer",      price: 12,   icon: "🛸", description: "Extraterrestrial tech with tractor beam." },
  { id: "delta",       name: "Delta Wing",       price: 18,   icon: "🔺", description: "Broad flying wing, pure forward thrust." },
  { id: "drone",       name: "Cyber Drone",      price: 25,   icon: "🛰️", description: "Surveillance core with orbital rings." },
  { id: "plane",       name: "Paper Dart",       price: 35,   icon: "✈️", description: "Lightweight, agile, surprisingly fast." },
  { id: "shuttle",     name: "Orbital Shuttle",  price: 45,   icon: "🛫", description: "Heavy-lift body with swept wings." },
  { id: "speeder",     name: "Neon Speeder",     price: 60,   icon: "🏎️", description: "Pod-racer with twin podded engines." },
  { id: "fighter",     name: "Delta Fighter",    price: 75,   icon: "🛩️", description: "Twin-tail dogfighter with a glass canopy." },
  { id: "stealth",     name: "Stealth Wing",     price: 95,   icon: "🦇", description: "Flat radar-dark chevron, low signature." },
  { id: "interceptor", name: "Star Interceptor", price: 120,  icon: "⚔️", description: "X-wing styled high-combat speeder." },
  { id: "raptor",      name: "Raptor",           price: 145,  icon: "🦅", description: "Forward-swept wings, built to strike." },
  { id: "manta",       name: "Manta Ray",        price: 175,  icon: "🐟", description: "Organic glider with wide curved wings." },
  { id: "needle",      name: "Void Needle",      price: 210,  icon: "📍", description: "Ultra-thin hypersonic spike." },
  { id: "tie",         name: "Hex Fighter",      price: 250,  icon: "🔷", description: "Twin hex panels around a central pod." },
  { id: "viper",       name: "Viper Mk II",      price: 300,  icon: "🐍", description: "Cylindrical hull, triple rear thrusters." },
  { id: "trident",     name: "Trident",          price: 360,  icon: "🔱", description: "Three-prong fork bristling with energy." },
  { id: "crystal",     name: "Crystal Shard",    price: 430,  icon: "💎", description: "Faceted gemstone hull, refracts light." },
  { id: "phoenix",     name: "Phoenix",          price: 520,  icon: "🔥", description: "Living wings that flare and flap." },
  { id: "wasp",        name: "Wasp Striker",     price: 620,  icon: "🐝", description: "Segmented body tipped with a stinger." },
  { id: "falcon",      name: "Star Falcon",      price: 750,  icon: "🦉", description: "Disc hull with forward mandibles." },
  { id: "orbiter",     name: "Satellite Orbiter",price: 900,  icon: "📡", description: "Core module flanked by solar arrays." },
  { id: "mothership",  name: "Mothership",       price: 1100, icon: "🌌", description: "Hex carrier dotted with running lights." },
  { id: "comet",       name: "Comet",            price: 1350, icon: "☄️", description: "Glowing icy head trailing frozen streaks." },
  { id: "ring",        name: "Halo Ring",        price: 1700, icon: "💍", description: "Spinning torus around a plasma core." },
  { id: "dreadnought", name: "Dreadnought",      price: 2200, icon: "🛡️", description: "Layered battleship bristling with turrets." },
  // ── Premium spacecraft tier — real-craft inspired, each with a signature FX ──
  { id: "dragon",      name: "Crew Dragon",      price: 2600,  icon: "🐉", description: "Gumdrop capsule + trunk · twinkling Draco RCS." },
  { id: "falcon9",     name: "Falcon Booster",   price: 3000,  icon: "🛬", description: "Grid-fin stage that twitches · landing burn pulse." },
  { id: "apollo",      name: "Apollo CSM",       price: 3600,  icon: "🌗", description: "Command cone + bell · spinning dish + RCS puffs." },
  { id: "soyuz",       name: "Soyuz",            price: 4200,  icon: "⚛️", description: "Orbital sphere + descent bell · solar glint sweep." },
  { id: "starship",    name: "Starship",         price: 5000,  icon: "🌠", description: "Stainless hull + flaps · reflective sheen + Raptors." },
  { id: "lunar",       name: "Lunar Module",     price: 6000,  icon: "🌙", description: "Angular lander on legs · gold-foil shimmer." },
  { id: "saturnv",     name: "Saturn V",         price: 7200,  icon: "🗼", description: "Three-stage stack + escape tower · vernier flicker." },
  { id: "voyager",     name: "Voyager Probe",    price: 8800,  icon: "🪐", description: "High-gain dish + booms · expanding signal rings." },
  { id: "iss",         name: "Orbital Station",  price: 11000, icon: "🏗️", description: "Truss + modules · sun-tracking arrays + beacon." },
  { id: "enterprise",  name: "Warp Cruiser",     price: 15000, icon: "🖖", description: "Saucer + warp nacelles · pulsing glow + warp streaks." },
];

const SKIN_NAME: Record<string, string> = Object.fromEntries(SKINS.map((s) => [s.id, s.name]));

const COLORS = [
  { name: "Auto",      hex: null },
  { name: "Gold",      hex: "#ffd700" },
  { name: "Neon Pink", hex: "#ff007f" },
  { name: "Matrix",    hex: "#00ff41" },
  { name: "Cyan",      hex: "#00ffff" },
  { name: "Blood Red", hex: "#ff0000" },
  { name: "Orange",    hex: "#ff7a00" },
  { name: "Violet",    hex: "#8b5cf6" },
  { name: "Sky",       hex: "#38bdf8" },
  { name: "Lime",      hex: "#a3e635" },
  { name: "Magenta",   hex: "#ff00ff" },
  { name: "Crimson",   hex: "#dc143c" },
  { name: "Emerald",   hex: "#10b981" },
  { name: "Amber",     hex: "#ffbf00" },
  { name: "Silver",    hex: "#c0c0c0" },
  { name: "White",     hex: "#ffffff" },
];

const FLAME_COLORS = [
  { name: "Default (Orange)", hex: null },
  { name: "Toxic Green",      hex: "#00ff00" },
  { name: "Plasma Blue",      hex: "#00bfff" },
  { name: "Void Purple",      hex: "#a855f7" },
  { name: "Pink",             hex: "#ff1493" },
  { name: "Crimson",          hex: "#ff2d2d" },
  { name: "White-Hot",        hex: "#e6f7ff" },
  { name: "Solar Gold",       hex: "#ffd24a" },
  { name: "Cyan",             hex: "#00ffff" },
  { name: "Lime",             hex: "#b6ff00" },
  { name: "Magenta",          hex: "#ff00ff" },
  { name: "Ice",              hex: "#9fe8ff" },
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

// Server shape returned by GET /shop/profile and POST /shop/buy|/shop/equip.
interface ShopProfile {
  playerName: string;
  selectedSkin: string;
  selectedColor: string | null;
  flameColor: string | null;
  unlockedSkins: string[];
  spentCoins: number;
  totalEarned: number;
  availableCoins: number;
}

interface Purchase {
  skinId: string;
  price: number;
  purchasedAt: number;
}

export default function SkinShopModal({
  isOpen,
  onClose,
  playerName,
  // The shared race server is the single source of truth for the wallet,
  // ownership and cosmetics — so every other player/spectator sees the same
  // ship. localStorage is only kept as an instant-preview cache for "me".
  serverUrl,
  // JWT from the race session. Required to buy/equip (write); reads are public.
  token,
}: {
  isOpen: boolean;
  onClose: () => void;
  playerName?: string;
  serverUrl?: string;
  token?: string;
}) {
  const [config, setConfig] = useState<RocketConfig | null>(null);
  const [profile, setProfile] = useState<ShopProfile | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewBoost, setPreviewBoost] = useState(false);
  const [previewSkinId, setPreviewSkinId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Push a server profile into all local state + the instant-preview cache.
  const applyProfile = useCallback((data: ShopProfile) => {
    setProfile(data);
    const merged: RocketConfig = {
      selectedColor: data.selectedColor,
      flameColor: data.flameColor,
      selectedSkin: data.selectedSkin,
      unlockedSkins: data.unlockedSkins,
      spentCoins: data.spentCoins,
    };
    setConfig(merged);
    setPreviewSkinId(data.selectedSkin);
    saveRocketConfig(merged);
  }, []);

  const refreshPurchases = useCallback(() => {
    if (!serverUrl || !playerName) return;
    fetch(`${serverUrl}/shop/purchases?name=${encodeURIComponent(playerName)}`)
      .then((r) => r.json())
      .then((d) => setPurchases(d.purchases ?? []))
      .catch(() => {});
  }, [serverUrl, playerName]);

  // Load profile + purchases from the shared shop on open
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    // Seed from the local cache for an instant first paint
    const local = getRocketConfig();
    setConfig(local);
    setPreviewSkinId(local.selectedSkin);

    if (!serverUrl || !playerName) return;
    setLoading(true);
    fetch(`${serverUrl}/shop/profile?name=${encodeURIComponent(playerName)}`)
      .then((r) => r.json())
      .then((data: ShopProfile) => applyProfile(data))
      .catch(() => setError("Cannot reach race server"))
      .finally(() => setLoading(false));
    refreshPurchases();
  }, [isOpen, playerName, serverUrl, applyProfile, refreshPurchases]);

  // Preview animation
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
      ctx.save();
      ctx.scale(1.15, 1.15);
      drawSkin(ctx, previewSkinId, color, { thrust, t, roll, tilt: Math.sin(roll) * 0.05, isMe: true, size: SHIP_SIZE });
      ctx.restore();
      ctx.restore();
      raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [isOpen, config, previewBoost, previewSkinId]);

  if (!isOpen || !config) return null;

  const availableCoins = profile?.availableCoins ?? 0;
  const totalEarned = profile?.totalEarned ?? 0;
  const canWrite = !!serverUrl && !!token;

  // Buy a skin — fully server-authoritative. The server validates ownership and
  // recomputes the wallet, then returns the updated profile we apply verbatim.
  const handleBuy = async (skin: Skin) => {
    if (!canWrite) { setError("Enter the race (log in) to buy ships."); return; }
    // Client-side pre-check for instant feedback — the server re-checks anyway.
    if (availableCoins < skin.price) {
      setError(`Not enough coins — "${skin.name}" costs $${skin.price.toFixed(2)}, you have $${availableCoins.toFixed(2)}. Burn more tokens to earn coins.`);
      return;
    }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${serverUrl}/shop/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, skinId: skin.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Map server status codes to clear, actionable messages.
        const msg =
          res.status === 402 ? `Not enough coins for "${skin.name}".`
          : res.status === 409 ? `You already own "${skin.name}".`
          : res.status === 401 ? "Session expired — re-enter the race."
          : res.status === 400 ? "That ship doesn't exist."
          : (data.error || "Purchase failed — try again.");
        setError(msg);
        // A 409 means our local view is stale; resync from the server.
        if (res.status === 409) {
          fetch(`${serverUrl}/shop/profile?name=${encodeURIComponent(playerName!)}`)
            .then((r) => r.json()).then(applyProfile).catch(() => {});
        }
        return;
      }
      applyProfile(data);
      refreshPurchases();
    } catch {
      setError("Cannot reach race server.");
    } finally {
      setBusy(false);
    }
  };

  // Cosmetic change (no coin cost). Updates the local preview immediately, then
  // persists to the shared shop and applies the authoritative response.
  const equip = async (patch: Partial<Pick<RocketConfig, "selectedSkin" | "selectedColor" | "flameColor">>) => {
    const optimistic = { ...config, ...patch };
    setConfig(optimistic);
    if (patch.selectedSkin) setPreviewSkinId(patch.selectedSkin);
    saveRocketConfig(optimistic);
    if (!canWrite) return;
    try {
      const res = await fetch(`${serverUrl}/shop/equip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...patch }),
      });
      const data = await res.json();
      if (res.ok) applyProfile(data);
      else setError(data.error || "Equip failed");
    } catch {
      setError("Cannot reach race server");
    }
  };

  const handleSelect = (skinId: string) => {
    if (!config.unlockedSkins.includes(skinId)) return;
    equip({ selectedSkin: skinId });
  };

  const handleColorChange = (hex: string | null) => equip({ selectedColor: hex });
  const handleFlameChange = (hex: string | null) => equip({ flameColor: hex });

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
      <div
        className="relative w-full max-w-5xl border border-[#00ffc8]/30 overflow-hidden shadow-[0_0_50px_rgba(0,255,200,0.15)] flex flex-col md:flex-row h-[85vh]"
        style={{
          background: "radial-gradient(ellipse at center, #0a0d1c 0%, #03040a 70%)",
          borderRadius: 16,
        }}
      >
        <Scanlines />

        {/* Left: Preview Area */}
        <div className="w-full md:w-[45%] relative flex flex-col items-center justify-center p-8 border-r border-[#00ffc8]/20 z-10">
          <div className="absolute top-6 left-8">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-[#00ffc8]/10 rounded-full border border-[#00ffc8]/30 shadow-[0_0_15px_rgba(0,255,200,0.2)]">
              <ShoppingBag className="w-4 h-4 text-[#00ffc8]" />
              <span className="text-[13px] font-black text-[#00ffc8] tabular-nums tracking-widest font-mono">
                ${availableCoins.toFixed(2)}
              </span>
              {(loading || busy) && <RefreshCw className="w-3 h-3 text-[#00ffc8]/50 animate-spin" />}
            </div>
          </div>

          {playerName && (
            <div className="absolute top-6 right-8 text-[10px] font-mono text-[#00ffc8]/30 tracking-widest uppercase">
              {playerName}
            </div>
          )}

          <h1 className="glitch-title text-3xl mb-1" data-text="HANGAR">HANGAR</h1>
          <p className="text-[#00ffc8]/50 text-xs mb-2 tracking-[0.2em] font-mono uppercase">Craft Configuration</p>
          {totalEarned > 0 && (
            <p className="text-[#00ffc8]/30 text-[10px] font-mono mb-5">
              Earned: ${totalEarned.toFixed(2)} · Spent: ${config.spentCoins.toFixed(2)}
            </p>
          )}

          <div className="relative w-72 h-72 rounded-full bg-[#00ffc8]/3 border border-[#00ffc8]/20 flex items-center justify-center overflow-hidden shadow-[inset_0_0_30px_rgba(0,255,200,0.05)]">
            <canvas ref={canvasRef} width={288} height={288} className="w-full h-full drop-shadow-[0_0_15px_rgba(0,255,200,0.5)]" />
            <div className="absolute inset-0 bg-radial-gradient from-transparent to-[#0a0b14]/50 pointer-events-none" />
          </div>

          {error && (
            <div className="mt-4 text-[10px] font-mono text-[#ff6b8a] bg-[#ff324f]/10 border border-[#ff324f]/30 rounded px-3 py-1.5 max-w-[18rem] text-center">
              {error}
            </div>
          )}

          <button
            onMouseDown={() => setPreviewBoost(true)}
            onMouseUp={() => setPreviewBoost(false)}
            onMouseLeave={() => setPreviewBoost(false)}
            className={`mt-8 flex items-center gap-3 px-8 py-3 font-black uppercase tracking-[0.2em] transition-all border font-mono text-sm ${
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
            <button
              onClick={onClose}
              className="p-2 hover:bg-[#ff6b8a]/20 border border-transparent hover:border-[#ff6b8a]/50 rounded-lg transition-all"
            >
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
                  onClick={() => isUnlocked ? handleSelect(skin.id) : setPreviewSkinId(skin.id)}
                  className={`group relative flex flex-col p-4 rounded-xl border transition-all cursor-pointer backdrop-blur-md ${
                    isSelected || previewSkinId === skin.id
                      ? "bg-[#00ffc8]/10 border-[#00ffc8] shadow-[0_0_20px_rgba(0,255,200,0.15)]"
                      : "bg-[#ffffff]/2 border-white/10 hover:border-[#00ffc8]/50"
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
                            disabled={!canAfford || busy}
                            className={`px-2 py-1 rounded font-black text-[10px] font-mono tracking-widest transition-all border ${
                              canAfford && !busy
                                ? "bg-[#00ffc8]/20 border-[#00ffc8] text-[#00ffc8] hover:bg-[#00ffc8]/40 shadow-[0_0_15px_rgba(0,255,200,0.3)]"
                                : "bg-black/50 border-white/10 text-white/20 cursor-not-allowed"
                            }`}
                          >
                            ${skin.price.toFixed(2)}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-[#00ffc8]/40 text-[10px] uppercase tracking-widest mt-3 font-mono leading-relaxed line-clamp-2 min-h-7.5">
                    {skin.description}
                  </p>
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
                    onClick={() => handleColorChange(c.hex)}
                    className={`relative w-8 h-8 rounded border transition-all flex items-center justify-center overflow-hidden ${
                      config.selectedColor === c.hex
                        ? "border-white scale-110 shadow-[0_0_15px_currentColor]"
                        : "border-white/20 hover:border-[#00ffc8]"
                    }`}
                    style={{
                      backgroundColor: c.hex || "#3b82f6",
                      backgroundImage: !c.hex ? "linear-gradient(45deg, #3b82f6, #00ffc8)" : "",
                      color: c.hex || "#00ffc8",
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
                    onClick={() => handleFlameChange(c.hex)}
                    className={`relative w-8 h-8 rounded border transition-all flex items-center justify-center overflow-hidden ${
                      config.flameColor === c.hex
                        ? "border-white scale-110 shadow-[0_0_15px_currentColor]"
                        : "border-white/20 hover:border-[#ff9f59]"
                    }`}
                    style={{
                      backgroundColor: c.hex || "#ff6e14",
                      backgroundImage: !c.hex ? "linear-gradient(45deg, #ff6e14, #ffd25a)" : "",
                      color: c.hex || "#ff9f59",
                    }}
                  >
                    {config.flameColor === c.hex && <Check className="w-4 h-4 text-white drop-shadow-md z-10" />}
                    {!c.hex && <span className="text-[8px] font-black text-white uppercase z-10 drop-shadow-md">Auto</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Purchase history — pulled from the shared shop */}
          {purchases.length > 0 && (
            <div className="mt-8">
              <h3 className="flex items-center gap-2 text-xs font-black text-[#00ffc8]/60 uppercase tracking-[0.3em] font-mono mb-3">
                <History className="w-3.5 h-3.5" /> Purchase History
              </h3>
              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                {purchases.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-[11px] font-mono px-3 py-1.5 rounded bg-white/2 border border-white/5"
                  >
                    <span className="text-white/70 tracking-wide">{SKIN_NAME[p.skinId] ?? p.skinId}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-[#00ffc8]/80 tabular-nums">${p.price.toFixed(2)}</span>
                      <span className="text-white/25">{new Date(p.purchasedAt).toLocaleDateString()}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
