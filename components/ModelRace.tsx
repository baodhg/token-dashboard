"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useRef } from "react";

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

// Fallback neon palette (used only when a model has no recognizable platform)
const COLORS = [
  "#10b981", // emerald
  "#a855f7", // purple
  "#f97316", // orange
  "#06b6d4", // cyan
  "#f43f5e", // rose
  "#3b82f6", // blue
  "#eab308", // amber
];

// ── Platform brand colors (sampled from each tool's logo) ──
// Keyed by source value AND by model-id prefix so it works whether or not the
// row carries a `source` field.
const PLATFORM_HUE: Record<string, { h: number; s: number; l: number }> = {
  claude_code:     { h: 18,  s: 78, l: 58 },  // claude orange
  cline:           { h: 158, s: 64, l: 45 },  // emerald
  codex:           { h: 255, s: 70, l: 65 },  // codex violet
  gemini:          { h: 231, s: 70, l: 62 },  // gemini indigo/blue
  antigravity_cli: { h: 217, s: 82, l: 60 },  // google blue
  github_copilot:  { h: 190, s: 72, l: 55 },  // copilot cyan
  cursor:          { h: 240, s: 6,  l: 60 },  // zinc
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
// HSL → #rrggbb so the rest of the engine (hexA / shade) keeps working on hex.
function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
// Build a platform-family color variant, returned as hex.
//  variant 0..N-1  → hue/lightness fan-out within the brand family (max ~20)
//  intensity 0..1  → token weight: higher = more saturated & vivid
function platformColor(key: string, variant: number, variantCount: number, intensity: number): string {
  const base = PLATFORM_HUE[key];
  if (!base) return COLORS[variant % COLORS.length];
  const span = Math.min(Math.max(variantCount, 1), 20);
  // Fan hue ±26° and lightness across the family, ordered by variant
  const frac = span > 1 ? variant / (span - 1) : 0;     // 0 = top token model
  const hue = base.h + (frac - 0.5) * 52;
  // Token intensity drives saturation & vividness: leader = punchy, tail = muted
  const sat = Math.min(95, base.s * (0.55 + intensity * 0.45));
  const light = Math.min(72, Math.max(34, base.l * (0.82 + intensity * 0.30) - frac * 6));
  return hslToHex(hue, sat, light);
}

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const rndi = (a: number, b: number) => Math.floor(rnd(a, b + 1));

// ── Model → platform logo (prefix match on the model ID) ──
function logoSrcFor(model: string): string | null {
  const m = (model || "").toLowerCase();
  if (m.startsWith("claude")) return "/claude.png";
  if (m.startsWith("gpt") || m.startsWith("codex") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) return "/codex.png";
  if (m.startsWith("gemini") || m.startsWith("gemma")) return "/geminicli.png";
  if (m.includes("copilot")) return "/github.png";
  if (m.includes("cursor")) return "/cursor.png";
  if (m.includes("cline")) return "/cline.png";
  if (m.includes("antigravity")) return "/antigravity.png";
  return null;
}

// Image cache shared across the component lifetime. Each entry tracks load
// state plus the opaque-pixel bounding box, so every logo can be normalized to
// the same visual size regardless of its own internal transparent padding.
type LogoEntry = {
  img: HTMLImageElement;
  loaded: boolean;
  // tight bbox of non-transparent pixels, in source-image pixels
  bx: number; by: number; bw: number; bh: number;
};
const _logoCache = new Map<string, LogoEntry>();

// Scan the image's alpha channel to find the tight bounding box of its content.
function measureLogo(entry: LogoEntry) {
  const { img } = entry;
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) { entry.bx = 0; entry.by = 0; entry.bw = 1; entry.bh = 1; return; }
  try {
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    if (!cx) throw new Error("no ctx");
    cx.drawImage(img, 0, 0);
    const data = cx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = 0, maxY = 0, found = false;
    const ALPHA = 24; // ignore near-transparent edges
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > ALPHA) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          found = true;
        }
      }
    }
    if (found) {
      entry.bx = minX; entry.by = minY;
      entry.bw = maxX - minX + 1; entry.bh = maxY - minY + 1;
    } else {
      entry.bx = 0; entry.by = 0; entry.bw = w; entry.bh = h;
    }
  } catch {
    // CORS-tainted or unsupported — fall back to full image
    entry.bx = 0; entry.by = 0; entry.bw = w; entry.bh = h;
  }
}

function getLogo(model: string): LogoEntry | null {
  const src = logoSrcFor(model);
  if (!src) return null;
  let entry = _logoCache.get(src);
  if (!entry) {
    const img = new Image();
    entry = { img, loaded: false, bx: 0, by: 0, bw: 1, bh: 1 };
    const e = entry;
    img.onload = () => { measureLogo(e); e.loaded = true; };
    img.src = src;
    _logoCache.set(src, entry);
  }
  return entry;
}

function shade(hex: string, amt: number): string {
  if (!hex || hex[0] !== "#") return hex || "#888";
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}
function hexA(hex: string, a: number): string {
  if (!hex || hex[0] !== "#") return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

// ════════════════════════════════════════════════════════════════════════════
//  GALAXY BACKGROUND ENGINE
// ════════════════════════════════════════════════════════════════════════════
function createGalaxy() {
  let W = 0, H = 0;
  let starsFar: any[] = [], starsMid: any[] = [], starsNear: any[] = [];
  let constellations: any[] = [], nebulae: any[] = [], galaxies: any[] = [];
  let planets: any[] = [], meteors: any[] = [], asteroids: any[] = [];
  let milkyway: any = null, destStar: any = null;
  let staticCanvas: HTMLCanvasElement | null = null;
  let staticCtx: CanvasRenderingContext2D | null = null;
  let needsStatic = true;

  const STAR_TINTS = [
    [201, 216, 255], [180, 200, 255], [255, 255, 255], [255, 250, 240],
    [255, 244, 214], [255, 224, 180], [255, 210, 161], [202, 226, 255],
  ];
  function makeStar(depth: number) {
    const tint = STAR_TINTS[rndi(0, STAR_TINTS.length - 1)];
    return {
      x: rnd(0, W), y: rnd(0, H),
      r: rnd(0.3, depth === 0 ? 1.0 : depth === 1 ? 1.7 : 2.6),
      tint, tw: rnd(0, TAU), twSpeed: rnd(0.008, 0.05), twAmt: rnd(0.25, 0.7),
    };
  }
  function makeConstellation() {
    const cx = rnd(W * 0.05, W * 0.95), cy = rnd(H * 0.05, H * 0.6);
    const n = rndi(4, 7); const nodes: any[] = []; let px = cx, py = cy;
    for (let i = 0; i < n; i++) {
      px += rnd(-90, 90); py += rnd(-70, 70);
      nodes.push({ x: px, y: py, r: rnd(1.1, 2.4), tw: rnd(0, TAU) });
    }
    const edges: number[][] = [];
    for (let i = 0; i < n - 1; i++) edges.push([i, i + 1]);
    if (n > 4) edges.push([0, rndi(2, n - 1)]);
    return { nodes, edges, vx: rnd(-0.05, 0.05), vy: rnd(-0.02, 0.02),
      hue: `hsl(${rndi(190, 220)}, 80%, 80%)`, alpha: rnd(0.5, 0.9) };
  }
  const NEB_PALETTES = [
    ["#ff2d5e", "#7a1840", "#ff7aa8"], ["#2d6cff", "#16306e", "#7aa8ff"],
    ["#9b3dff", "#3a1670", "#c98aff"], ["#13b3a0", "#0a4a44", "#5fe6d4"],
    ["#ffae3d", "#7a4a10", "#ffd58a"],
  ];
  function makeNebula() {
    const pal = NEB_PALETTES[rndi(0, NEB_PALETTES.length - 1)];
    const cx = rnd(0, W), cy = rnd(0, H); const blobs: any[] = [];
    const count = rndi(7, 12); const spread = rnd(W * 0.12, W * 0.28);
    for (let i = 0; i < count; i++) {
      blobs.push({ dx: rnd(-spread, spread), dy: rnd(-spread * 0.7, spread * 0.7),
        r: rnd(spread * 0.4, spread * 1.1), c: pal[rndi(0, pal.length - 1)], a: rnd(0.05, 0.16) });
    }
    return { cx, cy, blobs };
  }
  function makeGalaxy() {
    return { x: rnd(0, W), y: rnd(0, H), r: rnd(26, 70), rot: rnd(0, TAU),
      tilt: rnd(0.28, 0.6), hue: rndi(195, 320), a: rnd(0.1, 0.22) };
  }
  function spawnMeteor() {
    const fromTop = Math.random() > 0.4;
    const x = rnd(W * 0.2, W);
    const y = fromTop ? rnd(-40, H * 0.1) : rnd(0, H * 0.5);
    const ang = rnd(Math.PI * 0.72, Math.PI * 0.92);
    const speed = rnd(11, 20);
    return { x, y, vx: -Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      len: rnd(120, 320), life: 1, decay: rnd(0.006, 0.012), w: rnd(1.2, 2.6),
      tint: Math.random() > 0.7 ? [180, 220, 255] : [255, 240, 214] };
  }

  function spawnAsteroid() {
    // Entry from upper-right quadrant, steep reentry angle like capsule aerobraking
    const ang = rnd(Math.PI * 0.58, Math.PI * 0.76); // ~105–137° — steep downward-left
    const speed = rnd(2.2, 4.5);
    const radius = rnd(4, 11);
    const x = rnd(W * 0.4, W + 80);
    const y = rnd(-60, H * 0.25);
    return {
      x, y,
      vx: -Math.cos(ang) * speed,
      vy:  Math.sin(ang) * speed,
      radius,
      rot: rnd(0, TAU),
      rotSpeed: rnd(0.04, 0.14) * (Math.random() > 0.5 ? 1 : -1),
      life: 1,
      // ablation fragments shed off the surface
      frags: [] as any[],
      // how much the rock has ablated (grows from 0)
      ablation: 0,
      // spawn shock flash on first few frames
      shockAge: 0,
    };
  }

  function updateAsteroid(a: any) {
    a.x += a.vx; a.y += a.vy;
    a.rot += a.rotSpeed;
    a.ablation = Math.min(1, a.ablation + 0.018);
    a.shockAge++;

    // Shed ablation fragments (molten ejecta flying back)
    const numFrag = Math.floor(a.ablation * 5 + 1);
    for (let k = 0; k < numFrag; k++) {
      const spread = rnd(-0.55, 0.55);
      const backAng = Math.atan2(-a.vy, -a.vx) + spread;
      const fragSpeed = rnd(0.8, 3.5);
      // color shifts white-yellow-orange-red as it cools
      const tempRoll = Math.random();
      const col = tempRoll > 0.6 ? "#ffffff" : tempRoll > 0.35 ? "#ffe680" : tempRoll > 0.15 ? "#ff8c20" : "#ff3800";
      a.frags.push({
        x: a.x + rnd(-a.radius * 0.4, a.radius * 0.4),
        y: a.y + rnd(-a.radius * 0.4, a.radius * 0.4),
        vx: Math.cos(backAng) * fragSpeed + a.vx * 0.12,
        vy: Math.sin(backAng) * fragSpeed + a.vy * 0.12,
        life: rnd(0.6, 1.0),
        decay: rnd(0.018, 0.038),
        r: rnd(0.8, 2.2) * (a.radius / 8),
        col,
        smoke: Math.random() > 0.55,
      });
    }

    // Age fragments
    for (let i = a.frags.length - 1; i >= 0; i--) {
      const f = a.frags[i];
      f.x += f.vx; f.y += f.vy;
      f.vy += 0.04; // slight gravity pull
      f.life -= f.decay;
      if (f.life <= 0) a.frags.splice(i, 1);
    }
  }

  function drawAsteroid(ctx: CanvasRenderingContext2D, a: any) {
    const speed = Math.hypot(a.vx, a.vy);
    const dirAng = Math.atan2(a.vy, a.vx);
    const r = a.radius;
    const alpha = Math.min(1, a.life);

    // ── Plasma bow shock (ahead of rock, compressed shock cone) ──
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const bx = a.x + Math.cos(dirAng) * r * 1.6;
    const by = a.y + Math.sin(dirAng) * r * 1.6;
    const bowR = r * (2.8 + a.ablation * 1.4);
    const bow = ctx.createRadialGradient(bx, by, 0, bx, by, bowR);
    bow.addColorStop(0,   `rgba(255,255,220,${0.72 * alpha})`);
    bow.addColorStop(0.2, `rgba(255,180,40,${0.55 * alpha})`);
    bow.addColorStop(0.5, `rgba(255,60,0,${0.28 * alpha})`);
    bow.addColorStop(1,   "transparent");
    ctx.fillStyle = bow;
    ctx.beginPath(); ctx.arc(bx, by, bowR, 0, TAU); ctx.fill();
    ctx.restore();

    // ── Ablation plasma trail (long fiery wake) ──
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const trailLen = speed * 14 + r * 8;
    const tx = a.x - Math.cos(dirAng) * trailLen;
    const ty = a.y - Math.sin(dirAng) * trailLen;
    const tg = ctx.createLinearGradient(a.x, a.y, tx, ty);
    tg.addColorStop(0,   `rgba(255,255,180,${0.90 * alpha})`);
    tg.addColorStop(0.08,`rgba(255,160,20,${0.80 * alpha})`);
    tg.addColorStop(0.22,`rgba(255,60,0,${0.55 * alpha})`);
    tg.addColorStop(0.5, `rgba(180,20,0,${0.28 * alpha})`);
    tg.addColorStop(1,   "transparent");
    // wide core plasma channel
    ctx.strokeStyle = tg; ctx.lineWidth = r * 2.2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(tx, ty); ctx.stroke();
    // narrower super-hot inner filament
    const tg2 = ctx.createLinearGradient(a.x, a.y, tx, ty);
    tg2.addColorStop(0,   `rgba(255,255,255,${0.95 * alpha})`);
    tg2.addColorStop(0.12,`rgba(255,220,100,${0.70 * alpha})`);
    tg2.addColorStop(0.4, `rgba(255,80,0,${0.30 * alpha})`);
    tg2.addColorStop(1,   "transparent");
    ctx.strokeStyle = tg2; ctx.lineWidth = r * 0.55;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.restore();

    // ── Ablation fragments ──
    for (const f of a.frags) {
      const fa = f.life;
      if (f.smoke) {
        // dark smoke puff
        ctx.save();
        ctx.globalAlpha = fa * 0.22;
        const sg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 3.5);
        sg.addColorStop(0, `rgba(60,30,10,0.8)`); sg.addColorStop(1, "transparent");
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 3.5, 0, TAU); ctx.fill();
        ctx.restore();
      } else {
        // glowing ember
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        const eg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 2.4);
        eg.addColorStop(0, f.col.replace(")", `,${fa})`).replace("rgb(", "rgba(").replace("#ffffff", `rgba(255,255,255,${fa})`).replace("#ffe680", `rgba(255,230,128,${fa})`).replace("#ff8c20", `rgba(255,140,32,${fa})`).replace("#ff3800", `rgba(255,56,0,${fa})`));
        eg.addColorStop(1, "transparent");
        ctx.fillStyle = eg;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 2.4, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }

    // ── Rock body (irregular polygon, glowing hot face) ──
    ctx.save();
    ctx.translate(a.x, a.y); ctx.rotate(a.rot);
    // irregular rock shape
    const pts = 7;
    ctx.beginPath();
    for (let i = 0; i < pts; i++) {
      const ang2 = (i / pts) * TAU;
      const wobble = rnd(0.72, 1.0);
      const px2 = Math.cos(ang2) * r * wobble;
      const py2 = Math.sin(ang2) * r * wobble;
      i === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
    }
    ctx.closePath();
    // dark rock base
    ctx.fillStyle = `rgba(28,20,12,${alpha})`;
    ctx.fill();
    // hot glowing leading face — highlight toward velocity direction
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const hotAng = dirAng; // leading face is toward velocity
    const hx = Math.cos(hotAng) * r * 0.4;
    const hy = Math.sin(hotAng) * r * 0.4;
    const hg2 = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 1.5);
    hg2.addColorStop(0,   `rgba(255,240,140,${0.85 * alpha * a.ablation})`);
    hg2.addColorStop(0.35,`rgba(255,100,10,${0.55 * alpha * a.ablation})`);
    hg2.addColorStop(1,   "transparent");
    ctx.fillStyle = hg2; ctx.fill();
    ctx.restore();
    ctx.restore();

    // ── Shock ring flash (first 12 frames) ──
    if (a.shockAge < 12) {
      const progress = a.shockAge / 12;
      const sR = r * (1.5 + progress * 4);
      const sA = (1 - progress) * 0.45 * alpha;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = `rgba(255,200,80,${sA})`;
      ctx.lineWidth = r * 0.5 * (1 - progress);
      ctx.beginPath(); ctx.arc(a.x, a.y, sR, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  const PLANET_ARCH = [
    { t: "ice", base: "#bfe3ff", mid: "#7fb2e0", dark: "#274e86", atmo: "#dff0ff", glow: "#aaddff", ring: "#bcdcff", hasRing: true, ice: true, crater: false, bands: ["#eaf6ff", "#a9cdef", "#d6eeff"] },
    { t: "gas", base: "#c98a36", mid: "#e6ad52", dark: "#5e370a", atmo: "#ffd98a", glow: "#ffcc44", ring: "#d8ab44", hasRing: true, ice: false, crater: false, bands: ["#d68a2c", "#f0b455", "#a06018", "#eaa838", "#f8cf72"] },
    { t: "ocean", base: "#0a3a6e", mid: "#1466b8", dark: "#04162e", atmo: "#4aacff", glow: "#0088ff", ring: "", hasRing: false, ice: true, crater: false, bands: ["#0a52a4", "#0c6ac4", "#073a82"] },
    { t: "violet", base: "#5a3aa8", mid: "#8a64d8", dark: "#241048", atmo: "#c99aff", glow: "#aa88ff", ring: "#9c6cf0", hasRing: true, ice: false, crater: false, bands: ["#5040a8", "#7a64cc", "#3c2c80"] },
    { t: "rust", base: "#9c4a18", mid: "#d07a30", dark: "#3c1c06", atmo: "#ffae66", glow: "#ff8833", ring: "", hasRing: false, ice: false, crater: true, bands: ["#a85222", "#d07a34", "#7a3a10"] },
    { t: "dead", base: "#3a3a40", mid: "#5a5a64", dark: "#121214", atmo: "#8a8a96", glow: "#666666", ring: "", hasRing: false, ice: false, crater: true, bands: ["#34343a", "#48484f", "#222226"] },
  ];
  function makePlanet(seedX?: number) {
    const arch = PLANET_ARCH[rndi(0, PLANET_ARCH.length - 1)];
    const depth = Math.random();
    const radius = 14 + depth * 64;
    const craters = arch.crater
      ? Array.from({ length: rndi(4, 9) }, () => {
          const a = rnd(0, TAU), d = rnd(0, 0.74);
          return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: rnd(0.05, 0.17) };
        })
      : [];
    const ly = depth > 0.5 ? `${rnd(4, 90).toFixed(1)} ly`
      : depth > 0.2 ? `${rnd(0.4, 9).toFixed(1)} kly`
      : `${rnd(1.2, 40).toFixed(1)} Mly`;
    return {
      x: seedX != null ? seedX : rnd(W * 0.2, W * 2.2),
      y: rnd(radius + 30, H - radius - 30),
      r: radius, depth, arch, craters,
      speed: 0.04 + (1 - depth) * 0.1 + depth * 0.16,
      rot: rnd(0, TAU), rotSpeed: rnd(0.0004, 0.0018) * (Math.random() > 0.5 ? 1 : -1),
      ringTilt: rnd(-0.5, 0.5), bandPhase: arch.bands.map(() => rnd(0, TAU)), label: ly,
    };
  }

  function rebuild() {
    const area = (W * H) / (1920 * 1080);
    starsFar = Array.from({ length: Math.round(260 * area) }, () => makeStar(0));
    starsMid = Array.from({ length: Math.round(150 * area) }, () => makeStar(1));
    starsNear = Array.from({ length: Math.round(70 * area) }, () => makeStar(2));
    constellations = Array.from({ length: rndi(3, 5) }, makeConstellation);
    nebulae = Array.from({ length: rndi(3, 4) }, makeNebula);
    galaxies = Array.from({ length: rndi(4, 6) }, makeGalaxy);
    planets = Array.from({ length: 5 }, (_, i) => makePlanet(rnd(-W * 0.2, W * 1.8) - i * W * 0.34));
    planets.sort((a, b) => a.depth - b.depth);
    meteors = [];
    asteroids = [];
    milkyway = {
      angle: rnd(-0.42, -0.3), cx: W * 0.55, cy: H * 0.42, width: H * rnd(0.5, 0.7),
      clusters: Array.from({ length: 240 }, () => ({
        u: rnd(-1.4, 1.4), v: rnd(-1, 1), r: rnd(0.4, 1.7), a: rnd(0.2, 0.9),
        tint: STAR_TINTS[rndi(0, STAR_TINTS.length - 1)],
      })),
      dust: Array.from({ length: 9 }, () => ({
        u: rnd(-1.2, 1.2), v: rnd(-0.5, 0.5),
        rx: rnd(W * 0.1, W * 0.3), ry: rnd(H * 0.02, H * 0.06), a: rnd(0.12, 0.3),
      })),
    };
    destStar = { x: W * 0.93, y: H * 0.5, r: Math.max(W, H) * 0.06, pulse: 0 };
    needsStatic = true;
  }

  function drawMilkyWay(c: CanvasRenderingContext2D) {
    const m = milkyway;
    c.save();
    c.translate(m.cx, m.cy);
    c.rotate(m.angle);
    const half = m.width / 2;
    const band = c.createLinearGradient(0, -half, 0, half);
    band.addColorStop(0, "rgba(40,40,80,0)");
    band.addColorStop(0.38, "rgba(70,80,140,0.10)");
    band.addColorStop(0.5, "rgba(150,160,210,0.18)");
    band.addColorStop(0.62, "rgba(70,80,140,0.10)");
    band.addColorStop(1, "rgba(40,40,80,0)");
    c.fillStyle = band;
    c.fillRect(-W * 1.4, -half, W * 2.8, m.width);
    const bloom = c.createRadialGradient(0, 0, 0, 0, 0, W * 0.5);
    bloom.addColorStop(0, "rgba(255,228,170,0.10)");
    bloom.addColorStop(0.4, "rgba(180,150,110,0.05)");
    bloom.addColorStop(1, "transparent");
    c.globalCompositeOperation = "screen";
    c.fillStyle = bloom;
    c.fillRect(-W, -half, W * 2, m.width);
    m.clusters.forEach((cl: any) => {
      const x = cl.u * W * 0.7;
      const y = Math.pow(cl.v, 3) * half;
      c.globalAlpha = cl.a * 0.85;
      c.fillStyle = `rgb(${cl.tint[0]},${cl.tint[1]},${cl.tint[2]})`;
      c.beginPath(); c.arc(x, y, cl.r, 0, TAU); c.fill();
    });
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    m.dust.forEach((d: any) => {
      const x = d.u * W * 0.7, y = d.v * half;
      const g = c.createRadialGradient(x, y, 0, x, y, d.rx);
      g.addColorStop(0, `rgba(3,4,12,${d.a})`);
      g.addColorStop(1, "rgba(3,4,12,0)");
      c.save();
      c.translate(x, y); c.scale(1, d.ry / d.rx); c.translate(-x, -y);
      c.fillStyle = g; c.beginPath(); c.arc(x, y, d.rx, 0, TAU); c.fill();
      c.restore();
    });
    c.restore();
  }

  function buildStatic() {
    if (!staticCanvas) {
      staticCanvas = document.createElement("canvas");
      staticCtx = staticCanvas.getContext("2d");
    }
    staticCanvas.width = W; staticCanvas.height = H;
    const c = staticCtx!;
    c.clearRect(0, 0, W, H);
    const bg = c.createLinearGradient(0, 0, W * 0.4, H);
    bg.addColorStop(0, "#03040a"); bg.addColorStop(0.5, "#06081a"); bg.addColorStop(1, "#02030b");
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    drawMilkyWay(c);
    c.globalCompositeOperation = "screen";
    nebulae.forEach((n) => {
      n.blobs.forEach((b: any) => {
        const g = c.createRadialGradient(n.cx + b.dx, n.cy + b.dy, 0, n.cx + b.dx, n.cy + b.dy, b.r);
        g.addColorStop(0, hexA(b.c, b.a)); g.addColorStop(0.5, hexA(b.c, b.a * 0.4)); g.addColorStop(1, hexA(b.c, 0));
        c.fillStyle = g; c.beginPath(); c.arc(n.cx + b.dx, n.cy + b.dy, b.r, 0, TAU); c.fill();
      });
    });
    c.globalCompositeOperation = "source-over";
    starsFar.forEach((s) => {
      c.globalAlpha = 0.5;
      c.fillStyle = `rgb(${s.tint[0]},${s.tint[1]},${s.tint[2]})`;
      c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill();
    });
    c.globalAlpha = 1;
    needsStatic = false;
  }

  function drawStarLayer(ctx: CanvasRenderingContext2D, stars: any[], speed: number, baseAlpha: number) {
    stars.forEach((s) => {
      s.x -= speed;
      if (s.x < -3) { s.x = W + 3; s.y = rnd(0, H); }
      s.tw += s.twSpeed;
      const tw = 1 - s.twAmt + Math.sin(s.tw) * s.twAmt;
      ctx.globalAlpha = baseAlpha * tw;
      ctx.fillStyle = `rgb(${s.tint[0]},${s.tint[1]},${s.tint[2]})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      if (s.r > 1.5) {
        ctx.globalAlpha = baseAlpha * tw * 0.5;
        ctx.strokeStyle = `rgb(${s.tint[0]},${s.tint[1]},${s.tint[2]})`;
        ctx.lineWidth = 0.6;
        const sp = s.r * 4.5;
        ctx.beginPath();
        ctx.moveTo(s.x - sp, s.y); ctx.lineTo(s.x + sp, s.y);
        ctx.moveTo(s.x, s.y - sp); ctx.lineTo(s.x, s.y + sp);
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
  }

  function drawConstellations(ctx: CanvasRenderingContext2D) {
    constellations.forEach((co) => {
      co.nodes.forEach((nd: any) => {
        nd.x += co.vx; nd.y += co.vy;
        if (nd.x < -50) nd.x += W + 100;
        if (nd.x > W + 50) nd.x -= W + 100;
      });
      ctx.strokeStyle = co.hue; ctx.lineWidth = 0.7; ctx.globalAlpha = co.alpha * 0.22;
      ctx.beginPath();
      co.edges.forEach(([a, b]: number[]) => {
        ctx.moveTo(co.nodes[a].x, co.nodes[a].y);
        ctx.lineTo(co.nodes[b].x, co.nodes[b].y);
      });
      ctx.stroke();
      co.nodes.forEach((nd: any) => {
        nd.tw += 0.03;
        const tw = 0.7 + Math.sin(nd.tw) * 0.3;
        ctx.globalAlpha = co.alpha * tw;
        ctx.fillStyle = co.hue;
        ctx.shadowBlur = 8; ctx.shadowColor = co.hue;
        ctx.beginPath(); ctx.arc(nd.x, nd.y, nd.r, 0, TAU); ctx.fill();
      });
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;
  }

  function drawGalaxies(ctx: CanvasRenderingContext2D) {
    galaxies.forEach((g) => {
      g.x -= 0.06; g.rot += 0.0004;
      if (g.x + g.r < -20) { g.x = W + g.r + rnd(0, W * 0.5); g.y = rnd(0, H); }
      ctx.save();
      ctx.translate(g.x, g.y); ctx.rotate(g.rot); ctx.scale(1, g.tilt);
      ctx.globalCompositeOperation = "screen";
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, g.r);
      core.addColorStop(0, `hsla(${g.hue},70%,85%,${g.a})`);
      core.addColorStop(0.25, `hsla(${g.hue},65%,70%,${g.a * 0.5})`);
      core.addColorStop(1, "transparent");
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, g.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = `hsla(${g.hue},70%,82%,${g.a * 0.7})`;
      ctx.lineWidth = g.r * 0.1;
      for (let arm = 0; arm < 2; arm++) {
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 1.8; a += 0.2) {
          const rr = (a / (Math.PI * 1.8)) * g.r;
          const xx = Math.cos(a + arm * Math.PI) * rr;
          const yy = Math.sin(a + arm * Math.PI) * rr;
          a === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
    });
    ctx.globalCompositeOperation = "source-over";
  }

  function drawDestStar(ctx: CanvasRenderingContext2D) {
    const d = destStar;
    d.pulse += 0.02;
    const breathe = 1 + Math.sin(d.pulse) * 0.05;
    const R = d.r * breathe;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const outer = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, R * 6);
    outer.addColorStop(0, "rgba(255,210,130,0.30)");
    outer.addColorStop(0.18, "rgba(255,150,60,0.14)");
    outer.addColorStop(0.5, "rgba(200,90,30,0.05)");
    outer.addColorStop(1, "transparent");
    ctx.fillStyle = outer; ctx.beginPath(); ctx.arc(d.x, d.y, R * 6, 0, TAU); ctx.fill();
    const core = ctx.createRadialGradient(d.x - R * 0.15, d.y - R * 0.15, 0, d.x, d.y, R);
    core.addColorStop(0, "#fff6e6"); core.addColorStop(0.4, "#ffd27a");
    core.addColorStop(0.75, "#ff9a3c"); core.addColorStop(1, "#d4641a");
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(d.x, d.y, R, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = "screen";
    const flare = ctx.createLinearGradient(d.x - R * 9, d.y, d.x + R * 9, d.y);
    flare.addColorStop(0, "transparent"); flare.addColorStop(0.5, "rgba(255,220,150,0.5)"); flare.addColorStop(1, "transparent");
    ctx.fillStyle = flare;
    ctx.fillRect(d.x - R * 9, d.y - 1.2, R * 18, 2.4);
    ctx.fillRect(d.x - 1.2, d.y - R * 5, 2.4, R * 10);
    ctx.restore();
  }

  function drawRing(ctx: CanvasRenderingContext2D, p: any, r: number, front: boolean) {
    const a = p.arch;
    ctx.save();
    ctx.rotate(p.ringTilt);
    const g = ctx.createLinearGradient(-r * 2.2, 0, r * 2.2, 0);
    g.addColorStop(0, "transparent");
    g.addColorStop(0.2, hexA(a.ring, front ? 0.25 : 0.3));
    g.addColorStop(0.5, hexA(a.ring, front ? 0.92 : 0.78));
    g.addColorStop(0.8, hexA(a.ring, front ? 0.25 : 0.3));
    g.addColorStop(1, "transparent");
    ctx.strokeStyle = g; ctx.lineWidth = r * 0.26;
    ctx.beginPath();
    if (front) ctx.ellipse(0, 0, r * 2.05, r * 0.42, 0, Math.PI * 1.04, Math.PI * 1.96);
    else ctx.ellipse(0, 0, r * 2.05, r * 0.42, 0, Math.PI * 0.04, Math.PI * 0.96);
    ctx.stroke();
    ctx.lineWidth = r * 0.1; ctx.strokeStyle = hexA(a.ring, 0.4);
    ctx.beginPath();
    if (front) ctx.ellipse(0, 0, r * 2.5, r * 0.5, 0, Math.PI * 1.04, Math.PI * 1.96);
    else ctx.ellipse(0, 0, r * 2.5, r * 0.5, 0, Math.PI * 0.04, Math.PI * 0.96);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlanet(ctx: CanvasRenderingContext2D, p: any, t: number) {
    const a = p.arch, r = p.r;
    ctx.save();
    ctx.translate(p.x, p.y);
    const halo = ctx.createRadialGradient(0, 0, r * 0.85, 0, 0, r * 2.1);
    halo.addColorStop(0, hexA(a.atmo, 0.32));
    halo.addColorStop(0.45, hexA(a.glow || a.atmo, 0.12));
    halo.addColorStop(1, "transparent");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, r * 2.1, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    if (a.hasRing) drawRing(ctx, p, r, false);
    const lx = -r * 0.4, ly = -r * 0.4;
    const sph = ctx.createRadialGradient(lx, ly, r * 0.05, 0, 0, r * 1.1);
    sph.addColorStop(0, shade(a.mid, 60)); sph.addColorStop(0.28, a.mid);
    sph.addColorStop(0.62, a.base); sph.addColorStop(0.9, a.dark); sph.addColorStop(1, "#000");
    ctx.fillStyle = sph; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
    const rot = p.rot + t * p.rotSpeed;
    a.bands.forEach((bc: string, bi: number) => {
      const by = -r + (bi / a.bands.length) * r * 2;
      const wob = Math.sin(rot * 0.7 + bi * 1.3) * r * 0.07;
      ctx.globalAlpha = 0.4; ctx.fillStyle = bc;
      ctx.beginPath(); ctx.ellipse(wob, by, r * 1.1, r * 0.26, 0.04 * bi, 0, TAU); ctx.fill();
    });
    if (p.craters.length) {
      ctx.globalAlpha = 1;
      p.craters.forEach((c: any) => {
        ctx.beginPath(); ctx.arc(c.x * r, c.y * r, c.r * r, 0, TAU);
        ctx.fillStyle = shade(a.base, -28); ctx.fill();
        ctx.beginPath(); ctx.arc(c.x * r - c.r * r * 0.2, c.y * r - c.r * r * 0.2, c.r * r * 0.5, 0, TAU);
        ctx.fillStyle = shade(a.mid, 18); ctx.globalAlpha = 0.5; ctx.fill();
        ctx.globalAlpha = 1;
      });
    }
    if (a.ice) {
      ctx.globalAlpha = 0.6; ctx.fillStyle = "#eef8ff";
      ctx.beginPath(); ctx.ellipse(0, -r * 0.74, r * 0.5, r * 0.22, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, r * 0.8, r * 0.38, r * 0.16, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    const sh = ctx.createRadialGradient(r * 0.4, r * 0.25, 0, r * 0.3, r * 0.2, r * 1.3);
    sh.addColorStop(0, "transparent"); sh.addColorStop(0.5, "transparent");
    sh.addColorStop(0.78, "rgba(0,0,0,0.5)"); sh.addColorStop(1, "rgba(0,0,0,0.88)");
    ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    const rim = ctx.createRadialGradient(0, 0, r * 0.82, 0, 0, r * 1.06);
    rim.addColorStop(0, "transparent"); rim.addColorStop(0.62, hexA(a.atmo, 0.2)); rim.addColorStop(1, hexA(a.atmo, 0.6));
    ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(0, 0, r * 1.06, 0, TAU); ctx.fill();
    const sp = ctx.createRadialGradient(lx * 0.7, ly * 0.7, 0, lx * 0.7, ly * 0.7, r * 0.5);
    sp.addColorStop(0, "rgba(255,255,255,0.28)"); sp.addColorStop(0.5, "rgba(255,255,255,0.05)"); sp.addColorStop(1, "transparent");
    ctx.fillStyle = sp; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    if (a.hasRing) drawRing(ctx, p, r, true);
    if (r > 30) {
      ctx.globalAlpha = 0.5; ctx.fillStyle = "rgba(220,235,255,0.9)";
      ctx.font = "600 11px ui-monospace, monospace"; ctx.textAlign = "center";
      ctx.fillText(p.label, 0, r + 18); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  return {
    resize(w: number, h: number) { W = w; H = h; rebuild(); },
    get destX() { return destStar ? destStar.x : W; },
    drawDeep(ctx: CanvasRenderingContext2D, t: number) {
      if (needsStatic) buildStatic();
      ctx.drawImage(staticCanvas!, 0, 0, W, H);
      drawGalaxies(ctx);
      drawConstellations(ctx);
      drawStarLayer(ctx, starsMid, 0.18, 0.7);
      drawStarLayer(ctx, starsNear, 0.5, 0.95);
      drawDestStar(ctx);
      planets.forEach((p) => {
        p.x -= p.speed; p.rot += p.rotSpeed;
        if (p.x + p.r * 2.6 < 0) Object.assign(p, makePlanet(W + p.r * 2.6 + rnd(0, W)));
        drawPlanet(ctx, p, t);
      });
    },
    drawFront(ctx: CanvasRenderingContext2D) {
      if (Math.random() < 0.012 && meteors.length < 4) meteors.push(spawnMeteor());
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += m.vx; m.y += m.vy; m.life -= m.decay;
        if (m.life <= 0 || m.x < -m.len || m.y > H + m.len) { meteors.splice(i, 1); continue; }
        const hyp = Math.hypot(m.vx, m.vy);
        const tx = m.x - (m.vx / hyp) * m.len, ty = m.y - (m.vy / hyp) * m.len;
        const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
        const [r, gg, b] = m.tint;
        g.addColorStop(0, `rgba(${r},${gg},${b},${m.life})`);
        g.addColorStop(0.3, `rgba(${r},${gg},${b},${m.life * 0.4})`);
        g.addColorStop(1, "transparent");
        ctx.strokeStyle = g; ctx.lineWidth = m.w; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.globalCompositeOperation = "screen";
        const hg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.w * 4);
        hg.addColorStop(0, `rgba(255,255,255,${m.life})`); hg.addColorStop(1, "transparent");
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(m.x, m.y, m.w * 4, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }

      // ── Asteroids / bolides ──
      // Spawn: rare, max 2 at once (large spectacle events)
      if (Math.random() < 0.0018 && asteroids.length < 2) asteroids.push(spawnAsteroid());
      for (let i = asteroids.length - 1; i >= 0; i--) {
        const a = asteroids[i];
        updateAsteroid(a);
        drawAsteroid(ctx, a);
        // Remove when fully off screen or life expired
        if (a.x < -a.radius * 20 || a.y > H + a.radius * 20 || a.life <= 0) {
          asteroids.splice(i, 1);
        }
      }

      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, "transparent"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  ROCKETS ENGINE
// ════════════════════════════════════════════════════════════════════════════
// Burst sustains ~11s @60fps — slightly longer than the 10s poll, so back-to-back
// token gains chain seamlessly with no plasma gap. Gain pulse (green flash + ↑)
// runs ~1.8s.
const BURST_FRAMES = 660;

function createRockets() {
  let W = 0, H = 0, destX = 0;
  let rockets: any[] = [];
  let sparks: any[] = [];
  let maxTokens = 1;

  function emitSparks(x: number, y: number, color: string, thrust: number) {
    const n = Math.floor(1 + thrust * 4);
    for (let k = 0; k < n; k++) {
      sparks.push({
        x: x + rnd(-3, 3), y: y + rnd(-4, 4),
        vx: -rnd(3, 8 + thrust * 8), vy: rnd(-1.6, 1.6),
        life: rnd(10, 26), max: 26, size: rnd(1, 2.6),
        color: Math.random() > 0.55 ? "#ffffff" : color,
        kind: Math.random() > 0.7 ? "ember" : "spark",
      });
    }
    if (Math.random() > 0.6) {
      sparks.push({
        x: x - rnd(6, 18), y: y + rnd(-4, 4),
        vx: -rnd(0.6, 2.2), vy: rnd(-0.6, 0.6),
        life: rnd(26, 54), max: 54, size: rnd(7, 16), color: "#1c1410", kind: "smoke",
      });
    }
  }
  function drawSparks(ctx: CanvasRenderingContext2D) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      if (p.kind === "shock") {
        // Stationary ring — vx encodes radius scale, don't translate it
        p.life--;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
      } else {
        p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.life--;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
      }
      const r = p.life / p.max;
      if (p.kind === "shock") {
        // Sonic-boom ring: expands and fades
        const prog = 1 - r;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = r * 0.8;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.5, p.size * r);
        ctx.shadowBlur = 12; ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * 2 + prog * p.vx, p.size + prog * p.vx * 0.55, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === "warp") {
        // Hyperdrive streak: long thin light trail
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = r * 0.95;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.4, p.size * r);
        ctx.shadowBlur = 6; ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * (4 + (1 - r) * 10), p.y - p.vy * 4);
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === "smoke") {
        ctx.globalAlpha = r * 0.22; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - r * 0.6), 0, TAU); ctx.fill();
      } else if (p.kind === "ember") {
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = r;
        ctx.shadowBlur = 8; ctx.shadowColor = p.color; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.4, p.size * r), 0, TAU); ctx.fill();
        ctx.shadowBlur = 0; ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = r * 0.95;
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(0.4, p.size * r);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2); ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.globalAlpha = 1;
  }

  function plumeCone(ctx: CanvasRenderingContext2D, length: number, halfW: number, sway: number, t: number, seed: number, freq: number) {
    const seg = 10;
    ctx.beginPath();
    ctx.moveTo(0, -halfW);
    for (let i = 0; i <= seg; i++) {
      const u = i / seg; const x = -u * length; const taper = 1 - u;
      const wob = Math.sin(t * 1.6 + u * 6 * freq + seed) * halfW * 0.22 * u;
      ctx.lineTo(x, -halfW * taper + wob + sway * u);
    }
    ctx.lineTo(-length, sway);
    for (let i = seg; i >= 0; i--) {
      const u = i / seg; const x = -u * length; const taper = 1 - u;
      const wob = Math.sin(t * 1.6 + u * 6 * freq + seed + 2) * halfW * 0.22 * u;
      ctx.lineTo(x, halfW * taper + wob + sway * u);
    }
    ctx.closePath(); ctx.fill();
  }

  function drawFlame(ctx: CanvasRenderingContext2D, thrust: number, color: string, t: number, seed: number, boost: number) {
    const fl = 0.78 + Math.sin(t * 0.6 + seed) * 0.14 + Math.sin(t * 1.7 + seed * 2) * 0.08;
    // boost (0..1) = afterburner/surge — stretches & fattens the plasma trail
    const len = (54 + thrust * 150) * fl * (1 + boost * 1.5);
    const wid = (7 + thrust * 7) * (1 + boost * 0.6);
    const sway = Math.sin(t * 0.9 + seed) * 2.2 * thrust;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5;
    const haze = ctx.createLinearGradient(0, 0, -len * 1.15, 0);
    haze.addColorStop(0, "rgba(255,120,30,0.55)"); haze.addColorStop(0.4, "rgba(190,60,12,0.28)"); haze.addColorStop(1, "rgba(60,20,6,0)");
    ctx.fillStyle = haze; plumeCone(ctx, len * 1.15, wid * 2.3, sway, t, seed, 0.5);
    ctx.globalAlpha = 0.85;
    const orange = ctx.createLinearGradient(0, 0, -len, 0);
    orange.addColorStop(0, "rgba(255,180,60,0.95)"); orange.addColorStop(0.35, "rgba(255,110,20,0.8)"); orange.addColorStop(1, "rgba(150,40,10,0)");
    ctx.fillStyle = orange; plumeCone(ctx, len, wid * 1.55, sway, t, seed, 1);
    ctx.globalAlpha = 0.95;
    const yellow = ctx.createLinearGradient(0, 0, -len * 0.7, 0);
    yellow.addColorStop(0, "rgba(255,244,200,1)"); yellow.addColorStop(0.45, "rgba(255,210,90,0.9)"); yellow.addColorStop(1, "rgba(255,140,30,0)");
    ctx.fillStyle = yellow; plumeCone(ctx, len * 0.7, wid * 1.0, sway, t, seed, 1.4);
    const core = ctx.createLinearGradient(0, 0, -len * 0.42, 0);
    core.addColorStop(0, "rgba(255,255,255,1)"); core.addColorStop(0.5, "rgba(220,240,255,0.85)"); core.addColorStop(1, "rgba(180,210,255,0)");
    ctx.fillStyle = core; plumeCone(ctx, len * 0.42, wid * 0.5, sway * 0.5, t, seed, 2);
    ctx.globalAlpha = 0.6;
    const tint = ctx.createRadialGradient(-2, 0, 0, -2, 0, wid * 1.6);
    tint.addColorStop(0, color); tint.addColorStop(1, "transparent");
    ctx.fillStyle = tint; ctx.beginPath(); ctx.arc(-2, 0, wid * 1.6, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.9;
    const dCount = Math.floor(2 + thrust * 3);
    for (let d = 0; d < dCount; d++) {
      const dx = -(8 + d * (len * 0.12));
      if (-dx > len * 0.55) break;
      const ds = wid * 0.42 * (1 - d * 0.13) * (0.8 + Math.sin(t * 2 + d + seed) * 0.2);
      const dg = ctx.createRadialGradient(dx, 0, 0, dx, 0, ds * 2);
      dg.addColorStop(0, "rgba(255,255,255,0.95)"); dg.addColorStop(0.5, "rgba(180,220,255,0.5)"); dg.addColorStop(1, "transparent");
      ctx.fillStyle = dg; ctx.beginPath(); ctx.ellipse(dx, 0, ds * 1.4, ds, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 0.9;
    const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, wid * 2.2);
    bloom.addColorStop(0, "rgba(255,255,255,0.95)"); bloom.addColorStop(0.4, "rgba(255,200,90,0.6)"); bloom.addColorStop(1, "transparent");
    ctx.fillStyle = bloom; ctx.beginPath(); ctx.arc(0, 0, wid * 2.2, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // Fallback metallic capsule when a logo image hasn't loaded yet (or no logo maps).
  function drawCapsule(ctx: CanvasRenderingContext2D, color: string, R: number) {
    ctx.save();
    ctx.scale(R / 22, R / 22); // capsule was authored around a ~22px radius
    const body = ctx.createLinearGradient(0, -11, 0, 11);
    body.addColorStop(0, "#e8edf5"); body.addColorStop(0.3, "#c2cad6"); body.addColorStop(0.5, "#f4f7fb");
    body.addColorStop(0.7, "#aab2c0"); body.addColorStop(1, "#767d8c");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-18, -11); ctx.lineTo(14, -11);
    ctx.quadraticCurveTo(20, 0, 14, 11); ctx.lineTo(-18, 11);
    ctx.quadraticCurveTo(-22, 0, -18, -11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(2, 0, 5, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // Every logo renders at the SAME on-screen footprint, regardless of how much
  // transparent padding its source file carries. SHIP_SIZE = the target length
  // (px) of the logo's longest content edge.
  const SHIP_SIZE = 46;

  // The logo IS the spaceship. No frame/disc/rim — just the normalized .png,
  // a soft color aura, and a gentle glow so it pops against the galaxy.
  function drawShip(
    ctx: CanvasRenderingContext2D,
    color: string,
    model: string,
    rank: number,
    thrust: number,
    t: number,
    seed: number,
  ) {
    const rankGlow = 1 - rank / 8;           // glow only varies by rank, not size
    const pulse = 0.5 + Math.sin(t * 2.2 + seed) * 0.5;
    const auraR = SHIP_SIZE * (0.85 + thrust * 0.28 + pulse * 0.1);

    // ── Soft energy aura behind the logo (subtle, additive, no hard edges) ──
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const aura = ctx.createRadialGradient(0, 0, SHIP_SIZE * 0.2, 0, 0, auraR);
    aura.addColorStop(0, hexA(color, (0.22 + pulse * 0.12) * (0.5 + rankGlow * 0.5)));
    aura.addColorStop(0.5, hexA(color, 0.08 * rankGlow));
    aura.addColorStop(1, "transparent");
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0, 0, auraR, 0, TAU); ctx.fill();
    ctx.restore();

    const logo = getLogo(model);
    if (logo && logo.loaded) {
      // Normalize: scale so the logo's content bbox longest edge == SHIP_SIZE,
      // then draw the whole image offset so the bbox center sits at (0,0).
      const scale = SHIP_SIZE / Math.max(logo.bw, logo.bh);
      const drawW = logo.img.naturalWidth * scale;
      const drawH = logo.img.naturalHeight * scale;
      const cx = (logo.bx + logo.bw / 2) * scale; // bbox center in scaled space
      const cy = (logo.by + logo.bh / 2) * scale;
      ctx.save();
      ctx.shadowBlur = 14 + pulse * 6;
      ctx.shadowColor = hexA(color, 0.6 * rankGlow);
      ctx.drawImage(logo.img, -cx, -cy, drawW, drawH);
      ctx.restore();
    } else {
      drawCapsule(ctx, color, SHIP_SIZE * 0.5);
    }
  }

  return {
    setModels(list: any[]) {
      const newMax = Math.max(1, ...list.map((m) => m.totalTokens));
      const prev = new Map(rockets.map((r) => [r.model, r]));

      rockets = list.map((m, i) => {
        const old = prev.get(m.model);
        // Detect token surge → trigger / refill the afterburner burst.
        const prevTokens = old ? old.totalTokens : m.totalTokens;
        const gained = m.totalTokens - prevTokens;
        // Real growth (not rounding noise). Refill the burst to full so it
        // sustains all the way to (and across) the next sync — keeps the plasma
        // continuous if tokens keep arriving every poll.
        const grew = old && gained > Math.max(1, newMax * 0.0005);
        const burstTimer = grew
          ? BURST_FRAMES
          : old ? Math.max(0, old.burstTimer || 0) : 0;
        // Rank trend (0 = leader). Smaller rank = better. Compare to last layout.
        // Persisted on the rocket so the label arrow reflects current standing.
        const oldRank = old ? old.rank : i;
        let trend: "up" | "down" | "same" = old ? (old.trend || "same") : "same";
        if (old) {
          if (i < oldRank) trend = "up";        // moved toward the front → overtook
          else if (i > oldRank) trend = "down"; // fell back → got overtaken
          // equal rank: keep the previous trend so a one-off equal poll doesn't
          // flip a freshly-earned arrow back to neutral
        }
        return {
          model: m.model, totalTokens: m.totalTokens, color: m.color, i,
          x: old ? old.x : 70, y: old ? old.y : 0,
          seed: old ? old.seed : rnd(0, 1000),
          thrust: old ? old.thrust : 0,
          bob: old ? old.bob : rnd(0, TAU),
          burstTimer,
          burstStart: grew,                     // fired a fresh shockwave this update
          rank: i,                              // current grid position (0 = leader)
          prevRank: old ? old.rank : i,         // for sonic-boom overtake detection
          trend,                                // up | down | same — drives label arrow
          boomTimer: old ? (old.boomTimer || 0) : 0,
        };
      });
      maxTokens = newMax;
    },
    layout(w: number, h: number, dx: number) { W = w; H = h; destX = dx; },
    frame(ctx: CanvasRenderingContext2D, t: number) {
      const n = rockets.length;
      if (!n) return [];
      const topPad = 84, botPad = 54;
      const usable = H - topPad - botPad;
      const laneAt = (i: number) => topPad + usable * ((i + 0.5) / n);
      const startX = 90;
      const finishX = Math.min(destX - 110, W - 380);
      const out: any[] = [];
      rockets.forEach((r, i) => {
        const y = laneAt(i);
        ctx.globalAlpha = 0.05; ctx.strokeStyle = r.color; ctx.lineWidth = 34;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      });
      ctx.globalAlpha = 1;
      drawSparks(ctx);
      rockets.forEach((r, i) => {
        const target = startX + (r.totalTokens / maxTokens) * (finishX - startX);
        const prevX = r.x;
        // Afterburner: ease faster during burst
        const lerpRate = r.burstTimer > 0 ? 0.065 : 0.045;
        r.x += (target - r.x) * lerpRate;
        const pixelSpeed = Math.min(1, Math.abs(r.x - prevX) / 2.2);

        // Burst countdown — decay toward 0
        if (r.burstTimer > 0) r.burstTimer--;

        // Continuous burst intensity (1 during the body, easing to 0 across the
        // taper) — used to fade ALL burst-driven emitters smoothly. Computed
        // before the thrust profile so spark/warp density tracks the wind-down
        // instead of cutting out the instant burstTimer hits 0.
        const TAPER_F = 150;
        const burstIntensity = r.burstTimer <= 0
          ? 0
          : r.burstTimer >= TAPER_F
            ? 1
            : (() => { const tap = r.burstTimer / TAPER_F; return tap * tap * (3 - 2 * tap); })();

        // Burst thrust profile, three phases for an organic afterburner feel:
        //  1) KICK   — first ~40 frames ramp 0.85 → 1.0 (hard shove forward)
        //  2) CRUISE — sustained HIGH plasma (~0.85) for the body of the burst
        //  3) TAPER  — last ~150 frames ease 0.85 → idle so it doesn't cut out
        //              abruptly; like throttling down instead of killing the engine.
        const cruise = 0.35 + pixelSpeed * 0.65;   // post-burst idle/cruise level
        let thrustTarget;
        if (r.burstTimer > 0) {
          const kickRamp = (BURST_FRAMES - r.burstTimer) / 40; // 0→1 first 40f
          if (kickRamp < 1) {
            thrustTarget = 0.85 + kickRamp * 0.15;                  // 0.85 → 1.0
          } else {
            // body holds 0.85; taper eases 0.85 → cruise via burstIntensity
            thrustTarget = cruise + (0.85 - cruise) * burstIntensity;
          }
        } else {
          thrustTarget = cruise;
        }
        // Slower follow during taper so the wind-down reads as gradual.
        const follow = (r.burstTimer > 0 && r.burstTimer < TAPER_F) ? 0.05 : 0.1;
        r.thrust += (thrustTarget - r.thrust) * follow;

        r.bob += 0.05;
        const y = laneAt(i) + Math.sin(r.bob) * 2.4;
        r.y = y;

        // More sparks during burst — density eases down with burstIntensity
        // (0.03 at full burst → 0.15 idle) instead of snapping when burst ends.
        const sparkThreshold = 0.15 - burstIntensity * 0.12;
        if (Math.random() > sparkThreshold) emitSparks(r.x - 6, y, r.color, r.thrust);

        // Big shockwave + ember blast at the moment a fresh gain lands
        if (r.burstStart) {
          r.burstStart = false;
          sparks.push({ x: r.x, y, vx: 30, vy: 0, life: 34, max: 34, size: 12, color: "#ffffff", kind: "shock" });
          sparks.push({ x: r.x, y, vx: 44, vy: 0, life: 40, max: 40, size: 16, color: r.color, kind: "shock" });
          for (let k = 0; k < 22; k++) {
            sparks.push({
              x: r.x - 6, y: y + rnd(-10, 10),
              vx: -rnd(8, 26), vy: rnd(-6, 6),
              life: rnd(20, 44), max: 44, size: rnd(2.4, 5),
              color: Math.random() > 0.45 ? r.color : "#ffffff", kind: "ember",
            });
          }
        }

        // ── Sonic boom on rank overtake (moved up the grid) ──
        if (r.prevRank > r.rank) {
          r.boomTimer = 22;
          r.prevRank = r.rank;        // consume — fire once per overtake
          // emit a couple of expanding shock rings + a flash burst of warp embers
          for (let k = 0; k < 2; k++) {
            sparks.push({
              x: r.x, y, vx: 18 + k * 14, vy: 0,
              life: 26, max: 26, size: 6 + k * 3,
              color: "#ffffff", kind: "shock",
            });
          }
          sparks.push({ x: r.x, y, vx: 26, vy: 0, life: 30, max: 30, size: 10, color: r.color, kind: "shock" });
          for (let k = 0; k < 16; k++) {
            sparks.push({
              x: r.x, y: y + rnd(-6, 6),
              vx: rnd(-20, 24), vy: rnd(-8, 8),
              life: rnd(14, 30), max: 30, size: rnd(2, 4.5),
              color: Math.random() > 0.5 ? "#ffffff" : r.color, kind: "ember",
            });
          }
        }
        if (r.boomTimer > 0) r.boomTimer--;

        // ── Hyperdrive warp streaks while surging (burst) ──
        // Spawn chance scales with burstIntensity so the streaks thin out
        // gradually through the taper rather than vanishing the instant burst ends.
        if (Math.random() < burstIntensity * 0.65) {
          const streaks = 1 + Math.floor(Math.random() * 2);
          for (let k = 0; k < streaks; k++) {
            const ringR = (16 - r.rank) + rnd(2, 10);
            const ang = rnd(0, TAU);
            sparks.push({
              x: r.x + Math.cos(ang) * ringR,
              y: y + Math.sin(ang) * ringR * 0.7,
              vx: rnd(8, 22), vy: rnd(-1.5, 1.5),
              life: rnd(12, 22), max: 22, size: rnd(1.2, 2.6),
              color: Math.random() > 0.4 ? r.color : "#bfe9ff", kind: "warp",
            });
          }
        }

        ctx.save();
        ctx.translate(r.x, y);
        // boost drives plasma trail size. Derive it from the (already taper-eased)
        // thrust so the trail fattens with the kick and shrinks gradually during
        // the wind-down — no hard cut. Map thrust 0.5→1.0 onto boost 0→1, plus a
        // little kick spike at burst start and any sonic-boom contribution.
        const kickSpike = Math.max(0, 1 - (BURST_FRAMES - r.burstTimer) / 40) * 0.35;
        const fromThrust = Math.max(0, (r.thrust - 0.5) / 0.5);
        const boost = Math.min(1, Math.max(fromThrust + kickSpike, r.boomTimer / 22));
        drawFlame(ctx, r.thrust, r.color, t, r.seed, boost);
        drawShip(ctx, r.color, r.model, i, r.thrust, t, r.seed);
        ctx.restore();
        out.push({
          model: r.model, x: r.x, y, color: r.color, totalTokens: r.totalTokens,
          bursting: r.burstTimer > 0 || r.boomTimer > 0,
          trend: r.trend || "same",
        });
      });
      if (sparks.length > 1400) sparks = sparks.slice(-1400);
      return out;
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  COMPONENT
// ════════════════════════════════════════════════════════════════════════════
function fmt(v: number): string {
  return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M`
    : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K`
    : `${Math.round(v)}`;
}

// Smoothly counts the displayed token value up (or down) toward `value`,
// easing over ~900ms — mirrors the dashboard StatCard count-up so a token
// gain on a poll reads as the car "earning" tokens rather than snapping.
function CountUp({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const [display, setDisplay] = React.useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    let start: number | null = null;
    const dur = 900;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (to - from) * eased;
      fromRef.current = v;
      setDisplay(v);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else { fromRef.current = to; setDisplay(to); }
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);
  return <span className={className} style={style}>{fmt(display)}</span>;
}

export default function ModelRace({ data, onExit }: ModelRaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const burstRefs = useRef<(HTMLDivElement | null)[]>([]);
  const gainRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Engine refs — created once on mount, never recreated
  const galaxyRef = useRef<ReturnType<typeof createGalaxy> | null>(null);
  const engineRef = useRef<ReturnType<typeof createRockets> | null>(null);

  // Stable slot list for labels: computed from data, color fixed by model name hash
  // so colour never changes across data updates
  const topModels = useMemo(() => {
    const ranked = [...data]
      .filter((m) => m.totalTokens > 0)
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, 7);
    const maxTok = Math.max(1, ...ranked.map((m) => m.totalTokens));

    // Group by platform so each model gets a variant within its brand family.
    const groups = new Map<string, RaceModelStat[]>();
    for (const m of ranked) {
      const key = platformKey(m.source, m.model);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    // Within a platform, the higher-token model takes the most vivid variant.
    const variantOf = new Map<string, { variant: number; count: number }>();
    for (const [key, list] of groups) {
      list.sort((a, b) => b.totalTokens - a.totalTokens);
      list.forEach((m, vi) => variantOf.set(`${key}::${m.model}`, { variant: vi, count: list.length }));
    }

    return ranked.map((m) => {
      const key = platformKey(m.source, m.model);
      const v = variantOf.get(`${key}::${m.model}`) ?? { variant: 0, count: 1 };
      // intensity: token weight relative to the table leader (0..1)
      const intensity = m.totalTokens / maxTok;
      const color = platformColor(key, v.variant, v.count, intensity);
      return { ...m, color, intensity, platform: key };
    });
  }, [data]);

  // Keep a ref of latest topModels so the render loop can read without
  // being a dep — this is the key fix for "reset on poll"
  const topModelsRef = useRef(topModels);
  useEffect(() => {
    topModelsRef.current = topModels;
    // Feed updated token counts into the running engine — no remount
    if (engineRef.current) {
      engineRef.current.setModels(topModels);
    }
  }, [topModels]);

  // Esc + scroll lock — stable, never re-runs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onExit?.(); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onExit]);

  // Canvas + engine — runs ONCE on mount, never re-runs
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const galaxy = createGalaxy();
    const engine = createRockets();
    galaxyRef.current = galaxy;
    engineRef.current = engine;

    let W = 0, H = 0, dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      galaxy.resize(W, H);
      engine.setModels(topModelsRef.current);
      engine.layout(W, H, galaxy.destX);
    };
    window.addEventListener("resize", resize);
    resize();

    let t = 0;
    let raf = 0;
    const render = () => {
      t += 1 / 60;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      galaxy.drawDeep(ctx, t);
      const ships = engine.frame(ctx, t);
      galaxy.drawFront(ctx);
      ships.forEach((s: any, i: number) => {
        const tx = `translate3d(${s.x + 52}px, ${s.y}px, 0) translateY(-50%)`;
        const el = labelRefs.current[i];
        if (el) el.style.transform = tx;
        const bl = burstRefs.current[i];
        if (bl) {
          bl.style.transform = tx;
          bl.style.opacity = s.bursting ? "1" : "0";
        }
        // Rank-trend indicator: ▲ green = overtook, ▼ red = overtaken, ▬ = steady
        const gn = gainRefs.current[i];
        if (gn && gn.dataset.trend !== s.trend) {
          gn.dataset.trend = s.trend;
          if (s.trend === "up") {
            gn.textContent = "▲";
            gn.style.color = "#34ff8a";
            gn.style.textShadow = "0 0 10px #34ff8a";
            gn.style.animationPlayState = "running";
          } else if (s.trend === "down") {
            gn.textContent = "▼";
            gn.style.color = "#ff4d6d";
            gn.style.textShadow = "0 0 10px #ff4d6d";
            gn.style.animationPlayState = "running";
          } else {
            gn.textContent = "▬";
            gn.style.color = "rgba(255,255,255,0.35)";
            gn.style.textShadow = "none";
            gn.style.animationPlayState = "paused";
          }
        }
      });
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      galaxyRef.current = null;
      engineRef.current = null;
    };
  }, []); // ← empty deps: runs once, engine lives for component lifetime

  return (
    <div className="fixed inset-0 z-70 overflow-hidden bg-[#03040a]">
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

      {/* Ship labels + burst glow */}
      <div className="absolute inset-0 pointer-events-none">
        {topModels.map((m, i) => (
          <div key={m.model} className="contents">
            {/* Burst afterburner glow — flashes behind label on surge */}
            <div
              ref={(el) => { burstRefs.current[i] = el; }}
              className="absolute top-0 left-0 rounded-full pointer-events-none will-change-transform transition-opacity duration-150"
              style={{
                width: 220, height: 48,
                background: `radial-gradient(ellipse at 20% 50%, ${m.color}55 0%, transparent 70%)`,
                opacity: 0,
                transform: "translate3d(-400px,-400px,0) translateY(-50%)",
              }}
            />
            {/* Label card — cyber glassmorphism HUD */}
            <div
              ref={(el) => { labelRefs.current[i] = el; }}
              className="absolute top-0 left-0 flex items-stretch whitespace-nowrap will-change-transform overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${m.color}2e, rgba(8,10,20,0.55) 60%)`,
                border: `1px solid ${m.color}55`,
                boxShadow: `0 0 22px ${m.color}40, inset 0 1px 0 rgba(255,255,255,0.10)`,
                backdropFilter: "blur(10px)",
                clipPath: "polygon(0 0, 100% 0, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
                transform: "translate3d(-400px,-400px,0) translateY(-50%)",
              }}
            >
              {/* Rank badge — angular cyber chip */}
              <div
                className="relative flex items-center justify-center px-2.5 font-black tabular-nums"
                style={{
                  background: `linear-gradient(160deg, ${m.color}, ${m.color}99)`,
                  clipPath: "polygon(0 0, 100% 0, calc(100% - 7px) 100%, 0 100%)",
                  color: "#05060c",
                  textShadow: "0 0 6px rgba(255,255,255,0.5)",
                }}
              >
                <span className="text-[9px] opacity-70 mr-px">#</span>
                <span className="text-[15px] leading-none">{i + 1}</span>
              </div>

              {/* Model name + tokens */}
              <div className="flex flex-col justify-center leading-none pl-2.5 pr-3.5 py-1.5">
                <span
                  className="race-glitch text-[8.5px] font-bold uppercase tracking-[0.2em] text-white/70"
                  style={{ animationDelay: `${i * 0.7}s` }}
                >
                  {m.model}
                </span>
                <div className="flex items-center gap-1.5">
                  <CountUp
                    value={m.totalTokens}
                    className="text-[18px] font-black tabular-nums"
                    style={{ color: m.color, textShadow: `0 0 14px ${m.color}cc` }}
                  />
                  {/* Rank-trend arrow: ▲ green overtook · ▼ red overtaken · ▬ steady */}
                  <span
                    ref={(el) => { gainRefs.current[i] = el; }}
                    data-trend="same"
                    className="race-gain text-[11px] font-black leading-none"
                    style={{ color: "rgba(255,255,255,0.35)", animationPlayState: "paused" }}
                  >
                    ▬
                  </span>
                </div>
              </div>

              {/* Right accent bar */}
              <span
                className="absolute right-0 top-0 h-full w-0.5"
                style={{ background: m.color, boxShadow: `0 0 8px ${m.color}` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* HUD title */}
      <div className="absolute top-5 left-7 flex items-center gap-3 pointer-events-none">
        <span className="w-1.75 h-1.75 rounded-full bg-emerald-500 shadow-[0_0_12px_#10b981] animate-pulse" />
        <span className="text-[12px] font-black uppercase tracking-[0.34em] text-white/30">
          Model Race · Token Velocity
        </span>
      </div>

      {/* Exit */}
      <button
        onClick={() => onExit?.()}
        className="absolute top-4 right-6 z-10 flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.07] hover:bg-white/15 border border-white/15 text-white/85 text-[12px] font-bold tracking-wide backdrop-blur-md transition-all hover:-translate-y-0.5 cursor-pointer"
      >
        ✕ Exit Race
      </button>
    </div>
  );
}
