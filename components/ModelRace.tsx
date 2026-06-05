"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getRocketConfig, RocketConfig } from "@/lib/rocket-config";
import { drawFlame, drawUFO, drawHighQualityRocket, hexA, shade, TAU } from "@/lib/rocket-renderer";

export interface RaceModelStat {
  model: string;
  totalTokens: number;
  source?: string;
}

interface ModelRaceProps {
  data: RaceModelStat[];
  /** Called when the user exits race mode (Esc or the Exit button). */
  onExit?: () => void;
}

// Fallback neon palette
const COLORS = ["#10b981", "#a855f7", "#f97316", "#06b6d4", "#f43f5e", "#3b82f6", "#eab308"];

const PLATFORM_HUE: Record<string, { h: number; s: number; l: number }> = {
  claude_code:     { h: 18,  s: 78, l: 58 },
  cline:           { h: 158, s: 64, l: 45 },
  codex:           { h: 255, s: 70, l: 65 },
  gemini:          { h: 231, s: 70, l: 62 },
  antigravity_cli: { h: 217, s: 82, l: 60 },
  github_copilot:  { h: 190, s: 72, l: 55 },
  cursor:          { h: 240, s: 6,  l: 60 },
};

function platformKey(source: string | undefined, model: string): string {
  if (source && PLATFORM_HUE[source]) return source;
  const m = (model || "").toLowerCase();
  if (m.startsWith("claude")) return "claude_code";
  if (m.startsWith("gpt") || m.startsWith("codex") || /^o[134]/.test(m)) return "codex";
  if (m.startsWith("gemini") || m.startsWith("gemma")) return "gemini";
  if (m.includes("copilot")) return "github_copilot";
  if (m.includes("cursor")) return "cursor";
  if (m.includes("cline")) return "cline";
  if (m.includes("antigravity")) return "antigravity_cli";
  return "";
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function platformColor(key: string, variant: number, variantCount: number, intensity: number): string {
  const base = PLATFORM_HUE[key]; if (!base) return COLORS[variant % COLORS.length];
  const span = Math.min(Math.max(variantCount, 1), 20), frac = span > 1 ? variant / (span - 1) : 0;
  const hue = base.h + (frac - 0.5) * 52, sat = Math.min(95, base.s * (0.55 + intensity * 0.45));
  const light = Math.min(72, Math.max(34, base.l * (0.82 + intensity * 0.30) - frac * 6));
  return hslToHex(hue, sat, light);
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const rndi = (a: number, b: number) => Math.floor(rnd(a, b + 1));

function logoSrcFor(model: string): string | null {
  const m = (model || "").toLowerCase();
  if (m.startsWith("claude")) return "/claude.png";
  if (m.startsWith("gpt") || m.startsWith("codex") || m.startsWith("o1")) return "/codex.png";
  if (m.startsWith("gemini") || m.startsWith("gemma")) return "/geminicli.png";
  if (m.includes("copilot")) return "/github.png";
  if (m.includes("cursor")) return "/cursor.png";
  if (m.includes("cline")) return "/cline.png";
  if (m.includes("antigravity")) return "/antigravity.png";
  return null;
}

type LogoEntry = { img: HTMLImageElement; loaded: boolean; bx: number; by: number; bw: number; bh: number; };
const _logoCache = new Map<string, LogoEntry>();

function measureLogo(entry: LogoEntry) {
  const { img } = entry; const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) { entry.bx = 0; entry.by = 0; entry.bw = 1; entry.bh = 1; return; }
  try {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const cx = cv.getContext("2d", { willReadFrequently: true })!; cx.drawImage(img, 0, 0);
    const data = cx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = 0, maxY = 0, found = false;
    for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) { if (data[(y * w + x) * 4 + 3] > 24) {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; found = true;
    } } }
    if (found) { entry.bx = minX; entry.by = minY; entry.bw = maxX - minX + 1; entry.bh = maxY - minY + 1; }
    else { entry.bx = 0; entry.by = 0; entry.bw = w; entry.bh = h; }
  } catch { entry.bx = 0; entry.by = 0; entry.bw = w; entry.bh = h; }
}

function getLogo(model: string): LogoEntry | null {
  const src = logoSrcFor(model); if (!src) return null;
  let entry = _logoCache.get(src);
  if (!entry) {
    const img = new Image(); entry = { img, loaded: false, bx: 0, by: 0, bw: 1, bh: 1 };
    const e = entry; img.onload = () => { measureLogo(e); e.loaded = true; };
    img.src = src; _logoCache.set(src, entry);
  }
  return entry;
}

function createGalaxy() {
  let W = 0, H = 0; let starsFar: any[] = [], starsMid: any[] = [], starsNear: any[] = [];
  let constellations: any[] = [], nebulae: any[] = [], galaxies: any[] = [], planets: any[] = [], meteors: any[] = [], asteroids: any[] = [];
  let milkyway: any = null, destStar: any = null, staticCanvas: HTMLCanvasElement | null = null, staticCtx: CanvasRenderingContext2D | null = null, needsStatic = true;
  const STAR_TINTS = [[201, 216, 255], [180, 200, 255], [255, 255, 255], [255, 250, 240], [255, 244, 214], [255, 224, 180], [255, 210, 161], [202, 226, 255]];
  function makeStar(depth: number) { const tint = STAR_TINTS[rndi(0, STAR_TINTS.length - 1)]; return { x: rnd(0, W), y: rnd(0, H), r: rnd(0.3, depth === 0 ? 1.0 : depth === 1 ? 1.7 : 2.6), tint, tw: rnd(0, TAU), twSpeed: rnd(0.008, 0.05), twAmt: rnd(0.25, 0.7) }; }
  function makeConstellation() { const cx = rnd(W * 0.05, W * 0.95), cy = rnd(H * 0.05, H * 0.6); const n = rndi(4, 7); const nodes: any[] = []; let px = cx, py = cy; for (let i = 0; i < n; i++) { px += rnd(-90, 90); py += rnd(-70, 70); nodes.push({ x: px, y: py, r: rnd(1.1, 2.4), tw: rnd(0, TAU) }); } const edges: number[][] = []; for (let i = 0; i < n - 1; i++) edges.push([i, i + 1]); if (n > 4) edges.push([0, rndi(2, n - 1)]); return { nodes, edges, vx: rnd(-0.05, 0.05), vy: rnd(-0.02, 0.02), hue: `hsl(${rndi(190, 220)}, 80%, 80%)`, alpha: rnd(0.5, 0.9) }; }
  function makeNebula() { const pal = [["#ff2d5e", "#7a1840", "#ff7aa8"], ["#2d6cff", "#16306e", "#7aa8ff"]][rndi(0, 1)]; const cx = rnd(0, W), cy = rnd(0, H); const blobs: any[] = []; const count = rndi(7, 12); const spread = rnd(W * 0.12, W * 0.28); for (let i = 0; i < count; i++) { blobs.push({ dx: rnd(-spread, spread), dy: rnd(-spread * 0.7, spread * 0.7), r: rnd(spread * 0.4, spread * 1.1), c: pal[rndi(0, pal.length - 1)], a: rnd(0.05, 0.16) }); } return { cx, cy, blobs }; }
  function makeGalaxy() { return { x: rnd(0, W), y: rnd(0, H), r: rnd(26, 70), rot: rnd(0, TAU), tilt: rnd(0.28, 0.6), hue: rndi(195, 320), a: rnd(0.1, 0.22) }; }
  function spawnMeteor() { const fromTop = Math.random() > 0.4; const x = rnd(W * 0.2, W), y = fromTop ? rnd(-40, H * 0.1) : rnd(0, H * 0.5); const ang = rnd(Math.PI * 0.72, Math.PI * 0.92), speed = rnd(11, 20); return { x, y, vx: -Math.cos(ang) * speed, vy: Math.sin(ang) * speed, len: rnd(120, 320), life: 1, decay: rnd(0.006, 0.012), w: rnd(1.2, 2.6), tint: [255, 255, 255] }; }
  function rebuild() { const area = (W * H) / (1920 * 1080); starsFar = Array.from({ length: Math.round(260 * area) }, () => makeStar(0)); starsMid = Array.from({ length: Math.round(150 * area) }, () => makeStar(1)); starsNear = Array.from({ length: Math.round(70 * area) }, () => makeStar(2)); constellations = Array.from({ length: 3 }, makeConstellation); nebulae = Array.from({ length: 3 }, makeNebula); galaxies = Array.from({ length: 4 }, makeGalaxy); planets = []; meteors = []; asteroids = []; destStar = { x: W * 0.93, y: H * 0.5, r: Math.max(W, H) * 0.06, pulse: 0 }; needsStatic = true; }
  function buildStatic() { if (!staticCanvas) { staticCanvas = document.createElement("canvas"); staticCtx = staticCanvas.getContext("2d"); } staticCanvas.width = W; staticCanvas.height = H; const c = staticCtx!; c.fillStyle = "#03040a"; c.fillRect(0, 0, W, H); needsStatic = false; }
  return {
    resize(w: number, h: number) { W = w; H = h; rebuild(); }, get destX() { return destStar ? destStar.x : W; },
    drawDeep(ctx: CanvasRenderingContext2D, t: number) { if (needsStatic) buildStatic(); ctx.drawImage(staticCanvas!, 0, 0, W, H); },
    drawFront(ctx: CanvasRenderingContext2D) {}
  };
}

const BURST_FRAMES = 150; const SURGE_MIN_TOKENS = 50;
function createRockets() {
  let W = 0, H = 0, destX = 0; let rockets: any[] = []; let sparks: any[] = []; let maxTokens = 1;
  function emitSparks(x: number, y: number, color: string, thrust: number) { for (let k = 0; k < 2; k++) { sparks.push({ x, y, vx: -rnd(3, 8 + thrust * 8), vy: rnd(-1, 1), life: rnd(10, 26), max: 26, size: rnd(1, 2), color }); } }
  function drawSparks(ctx: CanvasRenderingContext2D) { for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i]; p.x += p.vx; p.y += p.vy; p.life--; if (p.life <= 0) { sparks.splice(i, 1); continue; } ctx.globalAlpha = p.life / p.max; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; }
  
  function drawShip(ctx: CanvasRenderingContext2D, r: any, t: number, uCfg: RocketConfig | null, i: number) {
    const SHIP_SIZE = 46; const skinId = uCfg?.selectedSkin || 'default'; const rankGlow = 1 - i / 8;
    const pulse = 0.5 + Math.sin(t * 2.2 + r.seed) * 0.5; const auraR = SHIP_SIZE * (0.85 + r.thrust * 0.28 + pulse * 0.1);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; const aura = ctx.createRadialGradient(0, 0, SHIP_SIZE * 0.2, 0, 0, auraR);
    aura.addColorStop(0, hexA(r.color, (0.22 + pulse * 0.12) * (0.5 + rankGlow * 0.5))); aura.addColorStop(1, "transparent");
    ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(0, 0, auraR, 0, TAU); ctx.fill(); ctx.restore();
    if (skinId === 'ufo') { drawUFO(ctx, r.color, r.thrust, t, r.roll, SHIP_SIZE); } 
    else { ctx.save(); ctx.scale(0.55, 0.55); ctx.scale(1, Math.cos(r.roll)); drawHighQualityRocket(ctx, r.color, r.thrust); ctx.restore(); }
  }

  return {
    setModels(list: any[]) {
      const newMax = Math.max(1, ...list.map((m) => m.totalTokens)); const prev = new Map(rockets.map((r) => [r.model, r]));
      rockets = list.map((m, i) => {
        const old = prev.get(m.model); const gained = old ? m.totalTokens - old.totalTokens : 0; const grew = old && gained >= SURGE_MIN_TOKENS;
        return { ...m, rank: i, thrust: old ? old.thrust : 0, bob: old ? old.bob : rnd(0, TAU), roll: old ? old.roll : 0, isRolling: grew || (old ? old.isRolling : false), rollVelocity: 0.2, history: [], burstTimer: grew ? BURST_FRAMES : (old ? Math.max(0, old.burstTimer - 1) : 0), seed: old ? old.seed : rnd(0, 1000) };
      });
      maxTokens = newMax;
    },
    layout(w: number, h: number, dx: number) { W = w; H = h; destX = dx; },
    frame(ctx: CanvasRenderingContext2D, t: number, uCfg?: RocketConfig | null) {
      if (!rockets.length) return []; const topPad = 84, usable = H - topPad - 54; const laneAt = (i: number) => topPad + usable * ((i + 0.5) / rockets.length);
      const startX = 90, finishX = Math.min(destX - 110, W - 380); const out: any[] = [];
      rockets.forEach((r, i) => {
        const target = startX + (r.totalTokens / maxTokens) * (finishX - startX); r.thrust += (0.35 + (r.burstTimer > 0 ? 0.65 : 0) - r.thrust) * 0.08;
        r.x += (target - r.x) * 0.05; r.bob += 0.05; const y = laneAt(i) + Math.sin(r.bob) * 2.4;
        if (r.isRolling) { r.roll += r.rollVelocity; if (r.roll >= TAU) { r.roll = 0; r.isRolling = false; } }
        if (r.thrust > 0.7) { r.roll += 0.15; if (r.roll >= TAU) r.roll -= TAU; }
        ctx.save(); ctx.translate(r.x, y); drawFlame(ctx, r.thrust, r.color, t, r.seed, r.burstTimer / BURST_FRAMES); drawShip(ctx, r, t, uCfg || null, i); ctx.restore();
        out.push({ model: r.model, x: r.x, y, color: r.color, totalTokens: r.totalTokens, bursting: r.burstTimer > 0, trend: "same" });
      });
      drawSparks(ctx); return out;
    }
  };
}

function fmt(v: number): string { return v >= 1e6 ? `${(v/1e6).toFixed(2)}M` : v >= 1e3 ? `${(v/1e3).toFixed(1)}K` : `${Math.round(v)}`; }
function CountUp({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const [display, setDisplay] = useState(value); const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current, to = value, dur = 900; let start: number | null = null;
    const tick = (ts: number) => { if (!start) start = ts; const p = Math.min((ts - start) / dur, 1), v = from + (to - from) * (1 - Math.pow(1 - p, 3)); fromRef.current = v; setDisplay(v); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, [value]);
  return <span className={className} style={style}>{fmt(display)}</span>;
}

export default function ModelRace({ data, onExit }: ModelRaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null); const labelRefs = useRef<(HTMLDivElement|null)[]>([]); const burstRefs = useRef<(HTMLDivElement|null)[]>([]); const [uCfg, setUCfg] = useState<RocketConfig|null>(null);
  useEffect(() => { setUCfg(getRocketConfig()); const h = () => setUCfg(getRocketConfig()); window.addEventListener('rocket-config-updated', h); return () => window.removeEventListener('rocket-config-updated', h); }, []);
  const galaxyRef = useRef<any>(null); const engineRef = useRef<any>(null);
  const topModels = useMemo(() => {
    const ranked = [...data].filter(m => m.totalTokens > 0).sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 7);
    const maxTok = Math.max(1, ...ranked.map(m => m.totalTokens));
    return ranked.map((m, i) => {
      const key = platformKey(m.source, m.model); let color = platformColor(key, i, ranked.length, m.totalTokens / maxTok);
      if (uCfg?.selectedColor) color = uCfg.selectedColor; return { ...m, color };
    });
  }, [data, uCfg]);
  useEffect(() => { if (engineRef.current) engineRef.current.setModels(topModels); }, [topModels]);
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return; const ctx = cv.getContext("2d")!; const gal = galaxyRef.current = createGalaxy(), eng = engineRef.current = createRockets();
    let raf = 0; const resize = () => { const dpr = Math.min(window.devicePixelRatio||1, 2); cv.width = cv.clientWidth*dpr; cv.height = cv.clientHeight*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); gal.resize(cv.clientWidth, cv.clientHeight); eng.layout(cv.clientWidth, cv.clientHeight, gal.destX); };
    window.addEventListener("resize", resize); resize();
    const render = (t: number) => { ctx.clearRect(0,0,cv.width,cv.height); gal.drawDeep(ctx, t/1000); const ships = eng.frame(ctx, t/1000, getRocketConfig()); gal.drawFront(ctx);
      ships.forEach((s: any, i: number) => { const tx = `translate3d(${s.x+52}px, ${s.y}px, 0) translateY(-50%)`; if (labelRefs.current[i]) labelRefs.current[i]!.style.transform = tx; if (burstRefs.current[i]) { burstRefs.current[i]!.style.transform = tx; burstRefs.current[i]!.style.opacity = s.bursting ? "1" : "0"; } });
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render); return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return (
    <div className="fixed inset-0 z-70 overflow-hidden bg-[#03040a]">
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />
      <div className="absolute inset-0 pointer-events-none">
        {topModels.map((m, i) => (
          <div key={m.model} className="contents">
            <div ref={el => { burstRefs.current[i] = el; }} className="absolute top-0 left-0 rounded-full transition-opacity duration-150" style={{ width: 220, height: 48, background: `radial-gradient(ellipse at 20% 50%, ${m.color}55 0%, transparent 70%)`, opacity: 0 }} />
            <div ref={el => { labelRefs.current[i] = el; }} className="absolute top-0 left-0 flex items-stretch whitespace-nowrap overflow-hidden" style={{ background: `linear-gradient(135deg, ${m.color}2e, rgba(8,10,20,0.55) 60%)`, border: `1px solid ${m.color}55`, boxShadow: `0 0 22px ${m.color}40`, backdropFilter: "blur(10px)", clipPath: "polygon(0 0, 100% 0, 100% 100%, 8px 100%, 0 calc(100% - 8px))" }}>
              <div className="flex items-center justify-center px-2.5 font-black" style={{ background: m.color, color: "#000" }}>#{i+1}</div>
              <div className="flex flex-col justify-center pl-2.5 pr-3.5 py-1.5"><span className="text-[9px] font-bold uppercase text-white/70">{m.model}</span><CountUp value={m.totalTokens} className="text-[18px] font-black" style={{ color: m.color }} /></div>
              <span className="absolute right-0 top-0 h-full w-0.5" style={{ background: m.color, boxShadow: `0 0 8px ${m.color}` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="absolute top-5 left-7 flex items-center gap-3 pointer-events-none"><span className="w-1.75 h-1.75 rounded-full bg-emerald-500 shadow-[0_0_12px_#10b981] animate-pulse" /><span className="text-[12px] font-black uppercase tracking-[0.34em] text-white/30">Model Race · Token Velocity</span></div>
      <button onClick={() => onExit?.()} className="absolute top-4 right-6 z-10 px-4 py-2 rounded-full bg-white/[0.07] hover:bg-white/15 border border-white/15 text-white/85 text-[12px] font-bold tracking-wide backdrop-blur-md transition-all">✕ Exit Race</button>
    </div>
  );
}
