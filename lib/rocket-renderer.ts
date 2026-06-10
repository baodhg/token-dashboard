export const TAU = Math.PI * 2;

export function hexA(hex: string, a: number): string {
  if (!hex || hex[0] !== "#") return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

export function shade(hex: string, amt: number): string {
  if (!hex || hex[0] !== "#") return hex || "#888";
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

export function plumeCone(ctx: CanvasRenderingContext2D, length: number, halfW: number, sway: number, t: number, seed: number, freq: number) {
  const THROAT = 0.18;
  const widthAt = (u: number) => {
    const open = THROAT + (1 - THROAT) * Math.sin(Math.min(u / 0.3, 1) * (Math.PI / 2));
    const tail = 1 - Math.pow(u, 1.4);
    return halfW * open * tail;
  };
  const seg = 12; ctx.beginPath();
  ctx.moveTo(0, -widthAt(0));
  for (let i = 0; i <= seg; i++) {
    const u = i / seg; const x = -u * length; const w = widthAt(u);
    const wob = Math.sin(t * 1.6 + u * 6 * freq + seed) * halfW * 0.18 * u;
    ctx.lineTo(x, -w + wob + sway * u);
  }
  ctx.lineTo(-length, sway);
  for (let i = seg; i >= 0; i--) {
    const u = i / seg; const x = -u * length; const w = widthAt(u);
    const wob = Math.sin(t * 1.6 + u * 6 * freq + seed + 2) * halfW * 0.18 * u;
    ctx.lineTo(x, w + wob + sway * u);
  }
  ctx.closePath(); ctx.fill();
}

export function drawFlame(ctx: CanvasRenderingContext2D, thrust: number, color: string, flameColor: string | null, t: number, seed: number, boost: number) {
  const fl = 0.78 + Math.sin(t * 0.6 + seed) * 0.14 + Math.sin(t * 1.7 + seed * 2) * 0.08;
  const len = (54 + thrust * 150) * fl * (1 + boost * 1.5);
  const wid = (7 + thrust * 7) * (1 + boost * 0.6);
  const sway = Math.sin(t * 0.9 + seed) * 2.2 * thrust;
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5;
  
  const f1 = flameColor ? hexA(flameColor, 0.55) : "rgba(255,120,30,0.55)";
  const f2 = flameColor ? hexA(shade(flameColor, -40), 0.28) : "rgba(190,60,12,0.28)";
  const f3 = flameColor ? hexA(shade(flameColor, -80), 0) : "rgba(60,20,6,0)";

  const haze = ctx.createLinearGradient(0, 0, -len * 1.15, 0);
  haze.addColorStop(0, f1); haze.addColorStop(0.4, f2); haze.addColorStop(1, f3);
  ctx.fillStyle = haze; plumeCone(ctx, len * 1.15, wid * 2.3, sway, t, seed, 0.5);
  
  ctx.globalAlpha = 0.85;
  const o1 = flameColor ? hexA(shade(flameColor, 30), 0.95) : "rgba(255,180,60,0.95)";
  const o2 = flameColor ? hexA(flameColor, 0.8) : "rgba(255,110,20,0.8)";
  const o3 = flameColor ? hexA(shade(flameColor, -50), 0) : "rgba(150,40,10,0)";
  const orange = ctx.createLinearGradient(0, 0, -len, 0);
  orange.addColorStop(0, o1); orange.addColorStop(0.35, o2); orange.addColorStop(1, o3);
  ctx.fillStyle = orange; plumeCone(ctx, len, wid * 1.55, sway, t, seed, 1);
  
  ctx.globalAlpha = 0.95;
  const y1 = flameColor ? hexA(shade(flameColor, 100), 1) : "rgba(255,244,200,1)";
  const y2 = flameColor ? hexA(shade(flameColor, 50), 0.9) : "rgba(255,210,90,0.9)";
  const y3 = flameColor ? hexA(flameColor, 0) : "rgba(255,140,30,0)";
  const yellow = ctx.createLinearGradient(0, 0, -len * 0.7, 0);
  yellow.addColorStop(0, y1); yellow.addColorStop(0.45, y2); yellow.addColorStop(1, y3);
  ctx.fillStyle = yellow; plumeCone(ctx, len * 0.7, wid * 1.0, sway, t, seed, 1.4);
  
  const core = ctx.createLinearGradient(0, 0, -len * 0.42, 0);
  core.addColorStop(0, "rgba(255,255,255,1)"); 
  core.addColorStop(0.5, flameColor ? hexA(shade(flameColor, 120), 0.85) : "rgba(220,240,255,0.85)"); 
  core.addColorStop(1, flameColor ? hexA(shade(flameColor, 80), 0) : "rgba(180,210,255,0)");
  ctx.fillStyle = core; plumeCone(ctx, len * 0.42, wid * 0.5, sway * 0.5, t, seed, 2);
  
  ctx.globalAlpha = 0.6;
  const tint = ctx.createRadialGradient(-2, 0, 0, -2, 0, wid * 1.6);
  tint.addColorStop(0, color); tint.addColorStop(1, "transparent");
  ctx.fillStyle = tint; ctx.beginPath(); ctx.arc(-2, 0, wid * 1.6, 0, TAU); ctx.fill();
  
  ctx.globalAlpha = 0.9;
  const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, wid * 2.2);
  bloom.addColorStop(0, "rgba(255,255,255,0.95)"); 
  bloom.addColorStop(0.4, flameColor ? hexA(shade(flameColor, 40), 0.6) : "rgba(255,200,90,0.6)"); 
  bloom.addColorStop(1, "transparent");
  ctx.fillStyle = bloom; ctx.beginPath(); ctx.arc(0, 0, wid * 2.2, 0, TAU); ctx.fill();
  
  ctx.restore();
}

export function drawCyberCruiser(ctx: CanvasRenderingContext2D, color: string, isMe: boolean, tilt: number = 0) {
  const R = isMe ? 30 : 24;
  ctx.save();
  ctx.scale(R / 22, R / 22);
  ctx.rotate(tilt);
  ctx.lineJoin = "miter";
  ctx.miterLimit = 8;

  const neon = shade(color, 95);
  const dark = shade(color, -58);
  const NOZZLE_H = 11;

  const hull = (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.moveTo(50, 0);
    c.lineTo(30, -6);
    c.lineTo(24, -11);
    c.lineTo(13, -13);
    c.lineTo(4, -NOZZLE_H);
    c.lineTo(0, -NOZZLE_H);
    c.lineTo(0, NOZZLE_H);
    c.lineTo(4, NOZZLE_H);
    c.lineTo(13, 13);
    c.lineTo(24, 11);
    c.lineTo(30, 6);
    c.closePath();
  };

  ctx.fillStyle = dark;
  ctx.strokeStyle = neon; ctx.lineWidth = 1.2;
  ctx.shadowColor = color; ctx.shadowBlur = isMe ? 6 : 4;
  ctx.beginPath();
  ctx.moveTo(20, -9); ctx.lineTo(10, -28); ctx.lineTo(0, -26); ctx.lineTo(2, -11); ctx.lineTo(8, -10);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(20, 9); ctx.lineTo(10, 28); ctx.lineTo(0, 26); ctx.lineTo(2, 11); ctx.lineTo(8, 10);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;

  const body = ctx.createLinearGradient(0, 0, 50, 0);
  body.addColorStop(0, shade(color, -60));
  body.addColorStop(0.45, shade(color, -25));
  body.addColorStop(0.8, color);
  body.addColorStop(1, neon);
  ctx.fillStyle = body;
  hull(ctx); ctx.fill();

  const canopy = ctx.createLinearGradient(14, -4, 28, 6);
  canopy.addColorStop(0, "#0a1a2a");
  canopy.addColorStop(0.5, "#4affe0");
  canopy.addColorStop(1, "#ffffff");
  ctx.fillStyle = canopy;
  ctx.beginPath();
  ctx.moveTo(18, -4); ctx.lineTo(28, -2); ctx.lineTo(26, 2); ctx.lineTo(14, 4);
  ctx.closePath(); ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(13, -13); ctx.lineTo(13, 13);
  ctx.moveTo(4, -NOZZLE_H); ctx.lineTo(24, 0);
  ctx.stroke();

  ctx.globalAlpha = 0.4; ctx.fillStyle = shade(color, -70);
  ctx.beginPath();
  ctx.moveTo(0, NOZZLE_H); ctx.lineTo(13, 13); ctx.lineTo(24, 11); ctx.lineTo(30, 6);
  ctx.lineTo(30, 2); ctx.lineTo(6, 3); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = neon; ctx.lineWidth = 1.4;
  ctx.shadowColor = color; ctx.shadowBlur = 5;
  ctx.beginPath(); ctx.moveTo(7, -5); ctx.lineTo(30, -3.5); ctx.lineTo(44, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(7, 5); ctx.lineTo(30, 3.5); ctx.lineTo(44, 0); ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "#ffffff"; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.6;
  ctx.shadowColor = color; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.moveTo(1, -NOZZLE_H + 2); ctx.lineTo(1, NOZZLE_H - 2); ctx.stroke();
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;

  ctx.shadowColor = color;
  ctx.shadowBlur = isMe ? 12 : 8;
  ctx.strokeStyle = isMe ? "#ffffff" : neon;
  ctx.lineWidth = isMe ? 2.2 : 1.6;
  hull(ctx); ctx.stroke();
  ctx.shadowBlur = 0;

  const core = ctx.createRadialGradient(28, 0, 0, 28, 0, 7);
  core.addColorStop(0, "#ffffff");
  core.addColorStop(0.4, neon);
  core.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(28, 0, 6, 0, TAU); ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(28, 0, 1.8, 0, TAU); ctx.fill();

  ctx.restore();
}

export function drawCyberUFO(ctx: CanvasRenderingContext2D, color: string, thrust: number, t: number, roll: number, SHIP_SIZE: number = 64) {
  const r = SHIP_SIZE * 0.45;
  const neon = shade(color, 95);
  const dark = shade(color, -60);
  ctx.save();
  ctx.scale(1, Math.cos(roll));
  
  if (thrust > 0.1) {
     ctx.save();
     ctx.globalCompositeOperation = "lighter";
     const pulse = 0.8 + Math.sin(t * 10) * 0.2;
     const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.5 * (0.5 + thrust));
     glow.addColorStop(0, hexA(color, 0.8 * pulse)); 
     glow.addColorStop(1, "transparent");
     ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.5, r * 0.8, 0, 0, TAU); ctx.fill();
     ctx.restore();
  }

  ctx.rotate(t * 3);
  
  ctx.fillStyle = dark;
  ctx.strokeStyle = neon;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.9, 0, 0, TAU); ctx.fill(); ctx.stroke();
  
  const dome = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.5);
  dome.addColorStop(0, "#ffffff");
  dome.addColorStop(0.4, neon);
  dome.addColorStop(1, dark);
  ctx.fillStyle = dome;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;

  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * TAU;
    const px = Math.cos(angle) * r * 0.75;
    const py = Math.sin(angle) * r * 0.75;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(px, py, 2.5, 0, TAU); ctx.fill();
  }
  
  ctx.restore();
}

export function drawCyberJet(ctx: CanvasRenderingContext2D, color: string, thrust: number) {
  const neon = shade(color, 95);
  const dark = shade(color, -60);
  
  ctx.save();
  ctx.scale(1.2, 1.2);
  ctx.lineJoin = "round";
  
  ctx.fillStyle = dark;
  ctx.strokeStyle = neon;
  ctx.lineWidth = 1.8;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  
  ctx.beginPath();
  ctx.moveTo(10, 0); 
  ctx.lineTo(-10, -25); 
  ctx.lineTo(-15, -25); 
  ctx.lineTo(0, 0);
  ctx.lineTo(-15, 25);
  ctx.lineTo(-10, 25);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-15, 0); 
  ctx.lineTo(-25, -12); 
  ctx.lineTo(-30, -12); 
  ctx.lineTo(-20, 0);
  ctx.lineTo(-30, 12);
  ctx.lineTo(-25, 12);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  const body = ctx.createLinearGradient(-30, 0, 30, 0);
  body.addColorStop(0, shade(color, -50));
  body.addColorStop(0.8, color);
  body.addColorStop(1, neon);
  ctx.fillStyle = body;
  
  ctx.beginPath();
  ctx.moveTo(35, 0);
  ctx.lineTo(-20, -5); 
  ctx.lineTo(-30, 0);
  ctx.lineTo(-20, 5);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(-25, 0); ctx.lineTo(30, 0); ctx.stroke();

  ctx.restore();
}


export function drawCyberInterceptor(ctx: CanvasRenderingContext2D, color: string, isMe: boolean, tilt: number = 0) {
  const R = isMe ? 28 : 22;
  ctx.save();
  ctx.scale(R / 22, R / 22);
  ctx.rotate(tilt);
  ctx.lineJoin = "miter";
  ctx.miterLimit = 8;

  const neon = shade(color, 95);
  const dark = shade(color, -58);
  const NOZZLE_H = 8;

  const hull = (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.moveTo(40, 0); // Nose
    c.lineTo(15, -6);
    c.lineTo(-5, -NOZZLE_H);
    c.lineTo(-5, NOZZLE_H);
    c.lineTo(15, 6);
    c.closePath();
  };

  // Wings (X-wing style folded flat or V shape)
  ctx.fillStyle = dark;
  ctx.strokeStyle = neon; ctx.lineWidth = 1.2;
  ctx.shadowColor = color; ctx.shadowBlur = isMe ? 6 : 4;
  
  // Top/Back wings
  ctx.beginPath();
  ctx.moveTo(15, -6); ctx.lineTo(-10, -32); ctx.lineTo(-20, -32); ctx.lineTo(-5, -NOZZLE_H);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  
  // Bottom wings
  ctx.beginPath();
  ctx.moveTo(15, 6); ctx.lineTo(-10, 32); ctx.lineTo(-20, 32); ctx.lineTo(-5, NOZZLE_H);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;

  const body = ctx.createLinearGradient(0, 0, 40, 0);
  body.addColorStop(0, shade(color, -60));
  body.addColorStop(0.5, color);
  body.addColorStop(1, neon);
  ctx.fillStyle = body;
  hull(ctx); ctx.fill();

  ctx.strokeStyle = neon; ctx.lineWidth = 1.4;
  ctx.shadowColor = color; ctx.shadowBlur = 5;
  // Cannons
  ctx.beginPath(); ctx.moveTo(-15, -32); ctx.lineTo(10, -32); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-15, 32); ctx.lineTo(10, 32); ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.shadowColor = color;
  ctx.shadowBlur = isMe ? 12 : 8;
  ctx.strokeStyle = isMe ? "#ffffff" : neon;
  ctx.lineWidth = isMe ? 2.2 : 1.6;
  hull(ctx); ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.restore();
}

export function drawNeonSpeeder(ctx: CanvasRenderingContext2D, color: string, thrust: number) {
  const neon = shade(color, 95);
  const dark = shade(color, -60);
  
  ctx.save();
  ctx.scale(1.1, 1.1);
  ctx.lineJoin = "round";
  
  // Engines (Pod racers)
  ctx.fillStyle = dark;
  ctx.strokeStyle = neon;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  
  // Top engine
  ctx.beginPath();
  ctx.ellipse(5, -18, 18, 5, 0, 0, TAU);
  ctx.fill(); ctx.stroke();
  
  // Bottom engine
  ctx.beginPath();
  ctx.ellipse(5, 18, 18, 5, 0, 0, TAU);
  ctx.fill(); ctx.stroke();

  // Connecting struts
  ctx.beginPath();
  ctx.moveTo(0, -13); ctx.lineTo(-10, 0); ctx.lineTo(0, 13);
  ctx.stroke();

  // Main cockpit
  const body = ctx.createLinearGradient(-15, 0, 30, 0);
  body.addColorStop(0, shade(color, -50));
  body.addColorStop(1, neon);
  ctx.fillStyle = body;
  
  ctx.beginPath();
  ctx.moveTo(30, 0);
  ctx.lineTo(-5, -6);
  ctx.lineTo(-15, 0);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  
  ctx.restore();
}

export function drawCyberDrone(ctx: CanvasRenderingContext2D, color: string, t: number) {
  const neon = shade(color, 95);
  const dark = shade(color, -60);
  
  ctx.save();
  ctx.scale(1.2, 1.2);
  
  // Rotating outer ring
  ctx.save();
  ctx.rotate(t * 5);
  ctx.strokeStyle = neon;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, TAU);
  // Cut holes in ring
  ctx.setLineDash([15, 10]);
  ctx.stroke();
  ctx.restore();

  // Inner core
  ctx.fillStyle = dark;
  ctx.strokeStyle = neon;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, TAU);
  ctx.fill(); ctx.stroke();

  // Glowing eye
  const pulse = 0.5 + Math.sin(t * 8) * 0.5;
  const eye = ctx.createRadialGradient(2, 0, 0, 2, 0, 6);
  eye.addColorStop(0, "#ffffff");
  eye.addColorStop(0.5, hexA(neon, pulse));
  eye.addColorStop(1, "transparent");
  ctx.fillStyle = eye;
  ctx.beginPath();
  ctx.arc(2, 0, 8, 0, TAU);
  ctx.fill();

  ctx.restore();
}

// ── Unified skin registry ──────────────────────────────────────────────────
// Every ship faces +x (nose right); drawFlame() draws the plume toward −x. New
// skins use the unified (ctx, color, opts) signature below; the 6 originals are
// adapted in SKIN_RENDERERS. drawSkin() is the single entry point both the race
// canvas and the shop preview call. Adding a skin = a renderer here + a SKINS
// entry in components/SkinShopModal.tsx + a price in race-server SKIN_PRICES.

export interface SkinOpts {
  thrust: number;  // 0..1 engine intensity
  t: number;       // time, seconds
  roll: number;    // spin phase (≈ t * 2.5)
  tilt: number;    // banking angle
  isMe: boolean;   // bigger + brighter for the local player
  size: number;    // nominal ship size (race ≈ 64)
}
export type SkinFn = (ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) => void;

// shared drawing helpers ------------------------------------------------------
function tracePoly(ctx: CanvasRenderingContext2D, pts: number[][]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
function bodyGrad(ctx: CanvasRenderingContext2D, color: string, x0: number, x1: number) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, shade(color, -62));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, 95));
  return g;
}
function beginShip(ctx: CanvasRenderingContext2D, o: SkinOpts, base = 22) {
  const R = o.isMe ? base * 1.3 : base;
  ctx.save();
  ctx.scale(R / 22, R / 22);
  ctx.rotate(o.tilt);
  ctx.lineJoin = "round";
}
function neonOutline(ctx: CanvasRenderingContext2D, color: string, isMe: boolean, w = 1.5) {
  ctx.strokeStyle = isMe ? "#ffffff" : shade(color, 95);
  ctx.lineWidth = isMe ? w + 0.6 : w;
  ctx.shadowColor = color;
  ctx.shadowBlur = isMe ? 11 : 6;
}
// Fill a polygon with the body gradient, then trace it again with the neon edge.
function paintHull(ctx: CanvasRenderingContext2D, color: string, isMe: boolean, pts: number[][], x0 = -20, x1 = 40, w = 1.6) {
  ctx.fillStyle = bodyGrad(ctx, color, x0, x1);
  tracePoly(ctx, pts); ctx.fill();
  neonOutline(ctx, color, isMe, w);
  tracePoly(ctx, pts); ctx.stroke();
  ctx.shadowBlur = 0;
}
// A dark sub-panel (wing/fin/pod) with a neon edge.
function paintPanel(ctx: CanvasRenderingContext2D, color: string, isMe: boolean, pts: number[][], w = 1.2) {
  ctx.fillStyle = shade(color, -60);
  neonOutline(ctx, color, isMe, w);
  tracePoly(ctx, pts); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
}
function coreDot(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, r = 5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.4, shade(color, 95));
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(x, y, Math.max(1, r * 0.3), 0, TAU); ctx.fill();
}

// 1. Dart Arrow — slim arrowhead with swept tail fins ------------------------
function drawDart(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 22);
  paintPanel(ctx, color, o.isMe, [[2, -4], [-14, -16], [-19, -15], [-6, -3]]);
  paintPanel(ctx, color, o.isMe, [[2, 4], [-14, 16], [-19, 15], [-6, 3]]);
  paintHull(ctx, color, o.isMe, [[42, 0], [-6, -7], [-17, 0], [-6, 7]]);
  coreDot(ctx, color, 10, 0, 4);
  ctx.restore();
}

// 2. Delta Wing — broad triangular flying wing with a center ridge -----------
function drawDelta(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 23);
  paintHull(ctx, color, o.isMe, [[38, 0], [-18, -26], [-12, 0], [-18, 26]], -18, 38, 1.6);
  ctx.strokeStyle = shade(color, 95); ctx.globalAlpha = 0.7; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(-16, -22); ctx.moveTo(34, 0); ctx.lineTo(-16, 22); ctx.stroke();
  ctx.globalAlpha = 1;
  coreDot(ctx, color, 6, 0, 5);
  ctx.restore();
}

// 3. Orbital Shuttle — rounded body, big swept wings, dorsal fin -------------
function drawShuttle(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 23);
  paintPanel(ctx, color, o.isMe, [[10, -5], [-16, -24], [-22, -22], [-6, -6]]);
  paintPanel(ctx, color, o.isMe, [[10, 5], [-16, 24], [-22, 22], [-6, 6]]);
  // dorsal fin (drawn "up")
  paintPanel(ctx, color, o.isMe, [[-8, 0], [-20, -12], [-24, -1]]);
  ctx.fillStyle = bodyGrad(ctx, color, -22, 36);
  ctx.beginPath();
  ctx.moveTo(36, 0); ctx.quadraticCurveTo(20, -9, -8, -8);
  ctx.lineTo(-22, -4); ctx.lineTo(-22, 4); ctx.lineTo(-8, 8);
  ctx.quadraticCurveTo(20, 9, 36, 0); ctx.closePath(); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.6);
  ctx.beginPath();
  ctx.moveTo(36, 0); ctx.quadraticCurveTo(20, -9, -8, -8);
  ctx.lineTo(-22, -4); ctx.lineTo(-22, 4); ctx.lineTo(-8, 8);
  ctx.quadraticCurveTo(20, 9, 36, 0); ctx.closePath(); ctx.stroke();
  ctx.shadowBlur = 0;
  coreDot(ctx, color, 18, 0, 4);
  ctx.restore();
}

// 4. Delta Fighter — jet with cockpit + twin tail fins -----------------------
function drawFighter(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 22);
  paintPanel(ctx, color, o.isMe, [[0, -4], [-22, -20], [-26, -19], [-10, -3]]);
  paintPanel(ctx, color, o.isMe, [[0, 4], [-22, 20], [-26, 19], [-10, 3]]);
  paintPanel(ctx, color, o.isMe, [[-12, -3], [-24, -12], [-26, -2]]);
  paintPanel(ctx, color, o.isMe, [[-12, 3], [-24, 12], [-26, 2]]);
  paintHull(ctx, color, o.isMe, [[40, 0], [-2, -6], [-24, -3], [-24, 3], [-2, 6]], -24, 40);
  ctx.fillStyle = "#bdf6ff"; ctx.globalAlpha = 0.85;
  tracePoly(ctx, [[20, -2], [30, -1], [28, 1], [16, 2]]); ctx.fill(); ctx.globalAlpha = 1;
  coreDot(ctx, color, 4, 0, 4);
  ctx.restore();
}

// 5. Stealth Wing — flat dark angular chevron (low glow) ---------------------
function drawStealth(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 24);
  const dark = shade(color, -68);
  ctx.fillStyle = dark;
  tracePoly(ctx, [[36, 0], [4, -10], [-20, -22], [-10, -6], [-22, 0], [-10, 6], [-20, 22], [4, 10]]);
  ctx.fill();
  ctx.strokeStyle = shade(color, 70); ctx.lineWidth = o.isMe ? 1.6 : 1.1;
  ctx.shadowColor = color; ctx.shadowBlur = o.isMe ? 7 : 3;
  tracePoly(ctx, [[36, 0], [4, -10], [-20, -22], [-10, -6], [-22, 0], [-10, 6], [-20, 22], [4, 10]]);
  ctx.stroke(); ctx.shadowBlur = 0;
  ctx.strokeStyle = shade(color, 95); ctx.globalAlpha = 0.5; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(-20, 0); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.restore();
}

// 6. Raptor — aggressive forward-swept wings ---------------------------------
function drawRaptor(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 23);
  paintPanel(ctx, color, o.isMe, [[-14, -4], [8, -24], [14, -22], [-2, -4]]);
  paintPanel(ctx, color, o.isMe, [[-14, 4], [8, 24], [14, 22], [-2, 4]]);
  paintHull(ctx, color, o.isMe, [[40, 0], [0, -6], [-18, -8], [-18, 8], [0, 6]], -18, 40);
  ctx.strokeStyle = shade(color, 95); ctx.lineWidth = 1.3; ctx.shadowColor = color; ctx.shadowBlur = 5;
  ctx.beginPath(); ctx.moveTo(10, -22); ctx.lineTo(16, -22); ctx.moveTo(10, 22); ctx.lineTo(16, 22); ctx.stroke();
  ctx.shadowBlur = 0;
  coreDot(ctx, color, 6, 0, 4.5);
  ctx.restore();
}

// 7. Manta Ray — wide organic curved wings -----------------------------------
function drawManta(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 23);
  ctx.fillStyle = bodyGrad(ctx, color, -22, 36);
  ctx.beginPath();
  ctx.moveTo(36, 0);
  ctx.quadraticCurveTo(2, -10, -22, -26);
  ctx.quadraticCurveTo(-6, -8, -16, 0);
  ctx.quadraticCurveTo(-6, 8, -22, 26);
  ctx.quadraticCurveTo(2, 10, 36, 0);
  ctx.closePath(); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.5);
  ctx.beginPath();
  ctx.moveTo(36, 0);
  ctx.quadraticCurveTo(2, -10, -22, -26);
  ctx.quadraticCurveTo(-6, -8, -16, 0);
  ctx.quadraticCurveTo(-6, 8, -22, 26);
  ctx.quadraticCurveTo(2, 10, 36, 0);
  ctx.closePath(); ctx.stroke(); ctx.shadowBlur = 0;
  // tail
  ctx.strokeStyle = shade(color, 95); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-30, 0); ctx.stroke();
  coreDot(ctx, color, 14, 0, 4.5);
  ctx.restore();
}

// 8. Void Needle — ultra-thin long spike -------------------------------------
function drawNeedle(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 22);
  paintPanel(ctx, color, o.isMe, [[-10, -2], [-20, -12], [-24, -11], [-16, -2]]);
  paintPanel(ctx, color, o.isMe, [[-10, 2], [-20, 12], [-24, 11], [-16, 2]]);
  paintHull(ctx, color, o.isMe, [[48, 0], [-12, -3.2], [-22, 0], [-12, 3.2]], -22, 48, 1.4);
  ctx.strokeStyle = "#ffffff"; ctx.globalAlpha = 0.8; ctx.lineWidth = 1; ctx.shadowColor = color; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.moveTo(40, 0); ctx.lineTo(-14, 0); ctx.stroke(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  coreDot(ctx, color, -6, 0, 4);
  ctx.restore();
}

// 9. Hex Fighter — central pod between two hexagonal panels (TIE-style) ------
function drawTie(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 22);
  const hexPanel = (sign: number) => {
    const y = sign * 22;
    paintPanel(ctx, color, o.isMe, [
      [-2, y - 12], [8, y - 7], [8, y + 7], [-2, y + 12], [-12, y + 7], [-12, y - 7],
    ]);
  };
  // struts
  ctx.strokeStyle = shade(color, 95); ctx.lineWidth = 2.2; ctx.shadowColor = color; ctx.shadowBlur = 5;
  ctx.beginPath(); ctx.moveTo(-2, -14); ctx.lineTo(-2, 14); ctx.stroke(); ctx.shadowBlur = 0;
  hexPanel(-1); hexPanel(1);
  // central pod
  ctx.fillStyle = bodyGrad(ctx, color, -10, 14);
  ctx.beginPath(); ctx.ellipse(2, 0, 13, 9, 0, 0, TAU); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.6);
  ctx.beginPath(); ctx.ellipse(2, 0, 13, 9, 0, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
  coreDot(ctx, color, 8, 0, 5);
  ctx.restore();
}

// 10. Viper — cylindrical fuselage with three rear thrusters -----------------
function drawViper(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 22);
  paintPanel(ctx, color, o.isMe, [[-4, -5], [-16, -18], [-22, -16], [-12, -4]]);
  paintPanel(ctx, color, o.isMe, [[-4, 5], [-16, 18], [-22, 16], [-12, 4]]);
  ctx.fillStyle = bodyGrad(ctx, color, -20, 40);
  ctx.beginPath();
  ctx.moveTo(40, 0); ctx.quadraticCurveTo(20, -7, -10, -7);
  ctx.lineTo(-20, -6); ctx.lineTo(-20, 6); ctx.lineTo(-10, 7);
  ctx.quadraticCurveTo(20, 7, 40, 0); ctx.closePath(); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.6);
  ctx.beginPath();
  ctx.moveTo(40, 0); ctx.quadraticCurveTo(20, -7, -10, -7);
  ctx.lineTo(-20, -6); ctx.lineTo(-20, 6); ctx.lineTo(-10, 7);
  ctx.quadraticCurveTo(20, 7, 40, 0); ctx.closePath(); ctx.stroke(); ctx.shadowBlur = 0;
  for (const y of [-6, 0, 6]) coreDot(ctx, color, -18, y, 3);
  coreDot(ctx, color, 16, 0, 4);
  ctx.restore();
}

// 11. Trident — three-prong fork nose ----------------------------------------
function drawTrident(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 22);
  const prong = (y: number) => paintHull(ctx, color, o.isMe, [[40, y], [16, y - 3], [-6, y], [16, y + 3]], -6, 40, 1.3);
  paintHull(ctx, color, o.isMe, [[6, 0], [-22, -9], [-22, 9]], -22, 6, 1.6);
  ctx.fillStyle = shade(color, -55);
  tracePoly(ctx, [[18, -11], [22, -11], [22, 11], [18, 11]]); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.2);
  tracePoly(ctx, [[18, -11], [22, -11], [22, 11], [18, 11]]); ctx.stroke(); ctx.shadowBlur = 0;
  prong(-11); prong(0); prong(11);
  coreDot(ctx, color, -8, 0, 4.5);
  ctx.restore();
}

// 12. Crystal Shard — faceted gem --------------------------------------------
function drawCrystal(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 22);
  const pts = [[40, 0], [6, -14], [-22, -7], [-22, 7], [6, 14]];
  ctx.fillStyle = bodyGrad(ctx, color, -22, 40);
  tracePoly(ctx, pts); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.6);
  tracePoly(ctx, pts); ctx.stroke(); ctx.shadowBlur = 0;
  // facet lines
  ctx.strokeStyle = "#ffffff"; ctx.globalAlpha = 0.55; ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(40, 0); ctx.lineTo(6, -14); ctx.moveTo(40, 0); ctx.lineTo(6, 14);
  ctx.moveTo(40, 0); ctx.lineTo(-10, 0); ctx.lineTo(6, -14); ctx.moveTo(-10, 0); ctx.lineTo(6, 14);
  ctx.stroke(); ctx.globalAlpha = 1;
  coreDot(ctx, color, -4, 0, 5);
  ctx.restore();
}

// 13. Phoenix — bird with spread wings (slow flap) ---------------------------
function drawPhoenix(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 23);
  const flap = Math.sin(o.t * 4) * 6;
  const wing = (sign: number) => {
    ctx.fillStyle = bodyGrad(ctx, color, -20, 20);
    ctx.beginPath();
    ctx.moveTo(2, sign * 3);
    ctx.quadraticCurveTo(-10, sign * (16 + flap), -26, sign * (24 + flap));
    ctx.quadraticCurveTo(-8, sign * 6, -14, sign * 2);
    ctx.closePath(); ctx.fill();
    neonOutline(ctx, color, o.isMe, 1.3);
    ctx.beginPath();
    ctx.moveTo(2, sign * 3);
    ctx.quadraticCurveTo(-10, sign * (16 + flap), -26, sign * (24 + flap));
    ctx.quadraticCurveTo(-8, sign * 6, -14, sign * 2);
    ctx.closePath(); ctx.stroke(); ctx.shadowBlur = 0;
  };
  wing(-1); wing(1);
  paintHull(ctx, color, o.isMe, [[38, 0], [-2, -5], [-22, 0], [-2, 5]], -22, 38, 1.5);
  coreDot(ctx, color, 10, 0, 4.5);
  ctx.restore();
}

// 14. Wasp Striker — segmented body with stinger nose ------------------------
function drawWasp(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 22);
  paintPanel(ctx, color, o.isMe, [[-2, -3], [-12, -20], [-16, -19], [-8, -2]]);
  paintPanel(ctx, color, o.isMe, [[-2, 3], [-12, 20], [-16, 19], [-8, 2]]);
  // stinger
  paintHull(ctx, color, o.isMe, [[44, 0], [24, -3], [24, 3]], 24, 44, 1.2);
  // segments
  const seg = (x: number, rx: number) => {
    ctx.fillStyle = bodyGrad(ctx, color, x - rx, x + rx);
    ctx.beginPath(); ctx.ellipse(x, 0, rx, rx * 0.72, 0, 0, TAU); ctx.fill();
    neonOutline(ctx, color, o.isMe, 1.3);
    ctx.beginPath(); ctx.ellipse(x, 0, rx, rx * 0.72, 0, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
  };
  seg(16, 8); seg(2, 10); seg(-14, 8);
  // stripes
  ctx.strokeStyle = shade(color, -70); ctx.globalAlpha = 0.6; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(2, -7); ctx.lineTo(2, 7); ctx.moveTo(-14, -5); ctx.lineTo(-14, 5); ctx.stroke();
  ctx.globalAlpha = 1;
  coreDot(ctx, color, 16, 0, 3.5);
  ctx.restore();
}

// 15. Falcon — disc body with two forward mandibles --------------------------
function drawFalcon(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 23);
  paintPanel(ctx, color, o.isMe, [[34, -3], [16, -10], [8, -8], [20, -2]]);
  paintPanel(ctx, color, o.isMe, [[34, 3], [16, 10], [8, 8], [20, 2]]);
  ctx.fillStyle = bodyGrad(ctx, color, -22, 22);
  ctx.beginPath(); ctx.ellipse(-2, 0, 22, 17, 0, 0, TAU); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.6);
  ctx.beginPath(); ctx.ellipse(-2, 0, 22, 17, 0, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
  // off-center cockpit dome
  const dome = ctx.createRadialGradient(8, -8, 0, 8, -8, 7);
  dome.addColorStop(0, "#ffffff"); dome.addColorStop(0.5, shade(color, 95)); dome.addColorStop(1, "transparent");
  ctx.fillStyle = dome; ctx.beginPath(); ctx.arc(8, -8, 6, 0, TAU); ctx.fill();
  // hub ring
  ctx.strokeStyle = shade(color, 95); ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(-2, 0, 9, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.restore();
}

// 16. Satellite Orbiter — core box with solar panels -------------------------
function drawOrbiter(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 22);
  const panel = (y: number) => {
    ctx.fillStyle = shade(color, -50);
    tracePoly(ctx, [[6, y], [6, y + (y < 0 ? -16 : 16)], [-14, y + (y < 0 ? -16 : 16)], [-14, y]]); ctx.fill();
    neonOutline(ctx, color, o.isMe, 1);
    tracePoly(ctx, [[6, y], [6, y + (y < 0 ? -16 : 16)], [-14, y + (y < 0 ? -16 : 16)], [-14, y]]); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = shade(color, 95); ctx.globalAlpha = 0.4; ctx.lineWidth = 0.6;
    const dir = y < 0 ? -1 : 1;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(6, y + dir * i * 4); ctx.lineTo(-14, y + dir * i * 4); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-4, y); ctx.lineTo(-4, y + dir * 16); ctx.stroke();
    ctx.globalAlpha = 1;
  };
  panel(-6); panel(6);
  // antenna dish
  paintHull(ctx, color, o.isMe, [[34, 0], [18, -4], [18, 4]], 18, 34, 1.2);
  ctx.fillStyle = bodyGrad(ctx, color, -10, 20);
  tracePoly(ctx, [[20, -8], [20, 8], [-10, 7], [-10, -7]]); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.6);
  tracePoly(ctx, [[20, -8], [20, 8], [-10, 7], [-10, -7]]); ctx.stroke(); ctx.shadowBlur = 0;
  coreDot(ctx, color, 4, 0, 4);
  ctx.restore();
}

// 17. Mothership — large elongated hex carrier with running lights -----------
function drawMothership(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 25);
  const pts = [[34, 0], [18, -12], [-18, -14], [-28, 0], [-18, 14], [18, 12]];
  ctx.fillStyle = bodyGrad(ctx, color, -28, 34);
  tracePoly(ctx, pts); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.8);
  tracePoly(ctx, pts); ctx.stroke(); ctx.shadowBlur = 0;
  // deck plates
  ctx.strokeStyle = shade(color, -75); ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(18, -12); ctx.lineTo(18, 12); ctx.moveTo(-18, -14); ctx.lineTo(-18, 14);
  ctx.moveTo(0, -13); ctx.lineTo(0, 13); ctx.stroke(); ctx.globalAlpha = 1;
  // running lights
  const blink = 0.5 + Math.sin(o.t * 6) * 0.5;
  ctx.fillStyle = hexA(shade(color, 95), 0.6 + blink * 0.4);
  for (const x of [22, 8, -6, -20]) { ctx.beginPath(); ctx.arc(x, -13, 1.4, 0, TAU); ctx.arc(x, 13, 1.4, 0, TAU); ctx.fill(); }
  coreDot(ctx, color, 6, 0, 6);
  ctx.restore();
}

// 18. Comet — glowing icy head with a frozen tail ----------------------------
function drawComet(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 22);
  // icy tail streaks
  ctx.strokeStyle = hexA(shade(color, 95), 0.5); ctx.lineWidth = 1.2; ctx.lineCap = "round";
  for (let i = -2; i <= 2; i++) {
    ctx.globalAlpha = 0.5 - Math.abs(i) * 0.12;
    ctx.beginPath(); ctx.moveTo(-6, i * 4); ctx.lineTo(-30 - Math.abs(i) * 4, i * 7); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // glowing head
  const head = ctx.createRadialGradient(8, 0, 0, 8, 0, 18);
  head.addColorStop(0, "#ffffff");
  head.addColorStop(0.4, shade(color, 95));
  head.addColorStop(0.8, color);
  head.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = head; ctx.beginPath(); ctx.arc(8, 0, 16, 0, TAU); ctx.fill();
  ctx.fillStyle = bodyGrad(ctx, color, -4, 20);
  ctx.beginPath(); ctx.arc(8, 0, 10, 0, TAU); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.6);
  ctx.beginPath(); ctx.arc(8, 0, 10, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
  coreDot(ctx, color, 10, 0, 4);
  ctx.restore();
}

// 19. Halo Ring — large torus with a glowing core ----------------------------
function drawRing(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 23);
  ctx.save();
  ctx.rotate(o.t * 1.4);
  ctx.strokeStyle = shade(color, 95); ctx.lineWidth = 4; ctx.shadowColor = color; ctx.shadowBlur = o.isMe ? 12 : 7;
  ctx.beginPath(); ctx.ellipse(0, 0, 24, 18, 0, 0, TAU); ctx.stroke();
  ctx.strokeStyle = shade(color, -50); ctx.lineWidth = 1.5; ctx.shadowBlur = 0; ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.ellipse(0, 0, 24, 18, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  // inner core
  ctx.fillStyle = bodyGrad(ctx, color, -8, 8);
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.6);
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
  coreDot(ctx, color, 0, 0, 5);
  ctx.restore();
}

// 20. Dreadnought — bulky layered battleship with turrets --------------------
function drawDreadnought(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 25);
  // lower hull
  paintHull(ctx, color, o.isMe, [[30, 0], [10, -12], [-26, -13], [-30, 0], [-26, 13], [10, 12]], -30, 30, 1.8);
  // raised superstructure
  ctx.fillStyle = bodyGrad(ctx, color, -20, 24);
  tracePoly(ctx, [[24, 0], [8, -7], [-20, -7], [-20, 7], [8, 7]]); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.4);
  tracePoly(ctx, [[24, 0], [8, -7], [-20, -7], [-20, 7], [8, 7]]); ctx.stroke(); ctx.shadowBlur = 0;
  // turrets
  const turret = (x: number, y: number) => {
    ctx.fillStyle = shade(color, -45);
    ctx.beginPath(); ctx.arc(x, y, 3.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = shade(color, 95); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8, y); ctx.stroke();
  };
  turret(2, -9); turret(2, 9); turret(-14, -9); turret(-14, 9);
  // hull plate lines
  ctx.strokeStyle = shade(color, -78); ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(10, -12); ctx.lineTo(10, 12); ctx.moveTo(-10, -13); ctx.lineTo(-10, 13); ctx.stroke();
  ctx.globalAlpha = 1;
  coreDot(ctx, color, 16, 0, 5);
  ctx.restore();
}

// Additive radial glow — the workhorse for the premium ships' light effects.
function addGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexA(color, a));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.restore();
}

// ── Premium spacecraft-inspired skins (each with a signature effect) ─────────

// 27. Crew Dragon — gumdrop capsule + trunk; FX: twinkling Draco RCS + reheat glow
function drawDragon(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 23);
  paintPanel(ctx, color, o.isMe, [[-6, -11], [-26, -11], [-26, 11], [-6, 11]]); // trunk
  ctx.strokeStyle = hexA("#1b6fff", 0.85); ctx.lineWidth = 3; // solar arc on trunk
  ctx.beginPath(); ctx.arc(-16, 0, 11, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
  const caps = [[26, 0], [18, -9], [-6, -12], [-6, 12], [18, 9]];
  ctx.fillStyle = bodyGrad(ctx, color, -6, 26);
  tracePoly(ctx, caps); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.6); tracePoly(ctx, caps); ctx.stroke(); ctx.shadowBlur = 0;
  addGlow(ctx, -6, 0, 14, "#ff5a2a", 0.3 + 0.35 * o.thrust * (0.6 + Math.sin(o.t * 5) * 0.4));
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 4; i++) {
    const yy = i < 2 ? -10 : 10, xx = i % 2 ? 22 : 8;
    ctx.fillStyle = hexA("#bdf0ff", 0.4 + Math.abs(Math.sin(o.t * 7 + i)) * 0.6);
    ctx.beginPath(); ctx.arc(xx, yy, 1.7, 0, TAU); ctx.fill();
  }
  ctx.restore();
  coreDot(ctx, color, 14, 0, 4);
  ctx.restore();
}

// 28. Falcon Booster — slender stage, grid fins, landing legs; FX: fin twitch + landing burn
function drawFalcon9(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 22);
  ctx.strokeStyle = shade(color, -25); ctx.lineWidth = 2; // legs
  ctx.beginPath(); ctx.moveTo(-22, -6); ctx.lineTo(-30, -17); ctx.moveTo(-22, 6); ctx.lineTo(-30, 17); ctx.stroke();
  const body = [[26, -6], [34, 0], [26, 6], [-28, 6], [-28, -6]];
  ctx.fillStyle = bodyGrad(ctx, color, -28, 34);
  tracePoly(ctx, body); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.6); tracePoly(ctx, body); ctx.stroke(); ctx.shadowBlur = 0;
  const tw = Math.sin(o.t * 3) * 0.28; // grid fins twitch
  for (const sgn of [-1, 1]) {
    ctx.save(); ctx.translate(20, sgn * 6); ctx.rotate(tw * sgn);
    ctx.fillStyle = shade(color, -55); ctx.fillRect(-3, sgn < 0 ? -7 : 0, 6, 7);
    ctx.strokeStyle = shade(color, 95); ctx.lineWidth = 0.6;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 2, sgn < 0 ? -7 : 0); ctx.lineTo(i * 2, sgn < 0 ? 0 : 7); ctx.stroke(); }
    ctx.restore();
  }
  ctx.strokeStyle = "#ffffff"; ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-26, 0); ctx.stroke(); ctx.globalAlpha = 1;
  if (o.thrust > 0.35) addGlow(ctx, -28, 0, 15, "#9fd8ff", 0.5 * (0.5 + Math.sin(o.t * 13) * 0.5));
  coreDot(ctx, color, 28, 0, 4);
  ctx.restore();
}

// 29. Apollo CSM — command cone + service module + bell + dish; FX: rotating HGA dish + RCS puffs
function drawApollo(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 23);
  ctx.fillStyle = shade(color, -55); // engine bell
  tracePoly(ctx, [[-18, -7], [-30, -11], [-30, 11], [-18, 7]]); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.3); tracePoly(ctx, [[-18, -7], [-30, -11], [-30, 11], [-18, 7]]); ctx.stroke(); ctx.shadowBlur = 0;
  const sm = [[6, -9], [-18, -9], [-18, 9], [6, 9]]; // service module
  ctx.fillStyle = bodyGrad(ctx, color, -18, 6); tracePoly(ctx, sm); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.4); tracePoly(ctx, sm); ctx.stroke(); ctx.shadowBlur = 0;
  const cm = [[30, 0], [8, -10], [6, -9], [6, 9], [8, 10]]; // command cone
  ctx.fillStyle = bodyGrad(ctx, color, 6, 30); tracePoly(ctx, cm); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.6); tracePoly(ctx, cm); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.save(); ctx.translate(-10, -9); ctx.rotate(o.t * 1.6); // rotating high-gain dish
  ctx.strokeStyle = shade(color, 95); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(0, -5, 6, 2.4, 0, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -5); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = "lighter"; // RCS quad puffs
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = hexA("#dff4ff", 0.3 + Math.abs(Math.sin(o.t * 6 + i * 1.7)) * 0.5);
    ctx.beginPath(); ctx.arc(20, i < 2 ? -8 : 8, 1.4, 0, TAU); ctx.fill();
  }
  ctx.restore();
  coreDot(ctx, color, 16, 0, 4);
  ctx.restore();
}

// 30. Soyuz — orbital sphere + descent bell + service module + green panels; FX: panel glint sweep
function drawSoyuz(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 22);
  for (const sgn of [-1, 1]) { // solar panels
    const y0 = sgn * 9, y1 = sgn * 24;
    ctx.fillStyle = "#0b5d3a";
    tracePoly(ctx, [[2, y0], [-14, y0], [-14, y1], [2, y1]]); ctx.fill();
    neonOutline(ctx, color, o.isMe, 1); tracePoly(ctx, [[2, y0], [-14, y0], [-14, y1], [2, y1]]); ctx.stroke(); ctx.shadowBlur = 0;
    const gx = 2 - ((o.t * 18) % 16); // glint sweeping across the panel
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = hexA("#9effd0", 0.5);
    ctx.fillRect(gx, Math.min(y0, y1), 2, Math.abs(y1 - y0)); ctx.restore();
  }
  ctx.fillStyle = bodyGrad(ctx, color, -22, 8); // service module
  tracePoly(ctx, [[4, -8], [-16, -8], [-22, 0], [-16, 8], [4, 8]]); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.4); tracePoly(ctx, [[4, -8], [-16, -8], [-22, 0], [-16, 8], [4, 8]]); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = bodyGrad(ctx, color, 4, 18); // descent bell
  tracePoly(ctx, [[18, -7], [4, -8], [4, 8], [18, 7]]); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.4); tracePoly(ctx, [[18, -7], [4, -8], [4, 8], [18, 7]]); ctx.stroke(); ctx.shadowBlur = 0;
  const sph = ctx.createRadialGradient(26, -1, 0, 26, 0, 9); // orbital sphere
  sph.addColorStop(0, "#ffffff"); sph.addColorStop(0.5, shade(color, 95)); sph.addColorStop(1, shade(color, -50));
  ctx.fillStyle = sph; ctx.beginPath(); ctx.arc(25, 0, 8, 0, TAU); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.5); ctx.beginPath(); ctx.arc(25, 0, 8, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.restore();
}

// 31. Starship — stainless cylinder + nose cone + 4 flaps; FX: reflective sheen sweep + Raptor glow
function drawStarship(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 23);
  paintPanel(ctx, color, o.isMe, [[18, -7], [6, -16], [0, -15], [4, -7]]); // fwd flaps
  paintPanel(ctx, color, o.isMe, [[18, 7], [6, 16], [0, 15], [4, 7]]);
  paintPanel(ctx, color, o.isMe, [[-18, -7], [-30, -17], [-24, -7]]);       // aft flaps
  paintPanel(ctx, color, o.isMe, [[-18, 7], [-30, 17], [-24, 7]]);
  const body = [[24, -7], [38, 0], [24, 7], [-28, 7], [-28, -7]];
  ctx.fillStyle = bodyGrad(ctx, color, -28, 38);
  tracePoly(ctx, body); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.7); tracePoly(ctx, body); ctx.stroke(); ctx.shadowBlur = 0;
  // heat-tile belly + stainless sheen sweep
  ctx.strokeStyle = shade(color, -78); ctx.globalAlpha = 0.4; ctx.lineWidth = 0.7;
  for (let x = -24; x < 24; x += 6) { ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x + 3, 7); ctx.stroke(); }
  ctx.globalAlpha = 1;
  const sx = -28 + ((o.t * 34) % 66); // bright vertical reflection sweeping along hull
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  const sheen = ctx.createLinearGradient(sx - 4, 0, sx + 4, 0);
  sheen.addColorStop(0, "rgba(255,255,255,0)"); sheen.addColorStop(0.5, "rgba(255,255,255,0.6)"); sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen; ctx.fillRect(sx - 4, -7, 8, 14); ctx.restore();
  for (const yy of [-4, 0, 4]) addGlow(ctx, -28, yy, 7, "#3aa0ff", 0.5 + o.thrust * 0.4); // Raptors
  coreDot(ctx, color, 22, 0, 4);
  ctx.restore();
}

// 32. Lunar Module — angular descent stage + ascent + legs; FX: gold-foil shimmer + descent glow
function drawLunar(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 23);
  ctx.strokeStyle = shade(color, -20); ctx.lineWidth = 1.6; // splayed legs
  for (const s of [[-18, -10, -30, -20], [-18, 10, -30, 20], [-6, -10, -2, -22], [-6, 10, -2, 22]]) {
    ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke();
  }
  const desc = [[2, -12], [-20, -12], [-20, 12], [2, 12]]; // octagonal-ish descent stage
  ctx.fillStyle = bodyGrad(ctx, color, -20, 2); tracePoly(ctx, desc); ctx.fill();
  // gold-foil shimmer: flickering metallic patches
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const fx = -18 + i * 4.5, fl = 0.3 + Math.abs(Math.sin(o.t * 3 + i * 1.3)) * 0.5;
    ctx.fillStyle = hexA("#ffcf57", fl); ctx.fillRect(fx, -11, 3.5, 22);
  }
  ctx.restore();
  neonOutline(ctx, color, o.isMe, 1.5); tracePoly(ctx, desc); ctx.stroke(); ctx.shadowBlur = 0;
  const asc = [[18, 0], [4, -8], [-6, -8], [-6, 8], [4, 8]]; // ascent stage with nose
  ctx.fillStyle = bodyGrad(ctx, color, -6, 18); tracePoly(ctx, asc); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.5); tracePoly(ctx, asc); ctx.stroke(); ctx.shadowBlur = 0;
  addGlow(ctx, -20, 0, 12, "#ffb347", 0.3 + o.thrust * 0.4 * (0.6 + Math.sin(o.t * 6) * 0.4));
  coreDot(ctx, color, 8, -2, 3); // round window
  ctx.restore();
}

// 33. Saturn V — stacked multi-stage stack + escape tower; FX: vernier flicker + scan highlight
function drawSaturnV(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 23);
  const stage = (x0: number, x1: number, h: number) => {
    const pts = [[x1, -h], [x0, -h], [x0, h], [x1, h]];
    ctx.fillStyle = bodyGrad(ctx, color, x0, x1); tracePoly(ctx, pts); ctx.fill();
    neonOutline(ctx, color, o.isMe, 1.4); tracePoly(ctx, pts); ctx.stroke(); ctx.shadowBlur = 0;
  };
  stage(-30, -10, 11);  // S-IC first stage
  stage(-10, 8, 8);     // S-II
  stage(8, 22, 5.5);    // S-IVB
  ctx.fillStyle = bodyGrad(ctx, color, 22, 34); // CSM cone
  tracePoly(ctx, [[34, 0], [22, -5], [22, 5]]); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.4); tracePoly(ctx, [[34, 0], [22, -5], [22, 5]]); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.strokeStyle = shade(color, 95); ctx.lineWidth = 1.4; // escape tower spike
  ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(44, 0); ctx.stroke();
  // black roll-pattern bands
  ctx.fillStyle = "rgba(15,15,20,0.7)";
  ctx.fillRect(-28, -11, 4, 22); ctx.fillRect(-2, -8, 3, 16);
  // descending scan highlight along the stack
  const hx = 34 - ((o.t * 26) % 64);
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(hx, -11, 2, 22); ctx.restore();
  // vernier flicker at the stage joints
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (const jx of [-10, 8]) { ctx.fillStyle = hexA("#ffd6a0", 0.3 + Math.abs(Math.sin(o.t * 9 + jx)) * 0.5); ctx.beginPath(); ctx.arc(jx, 0, 2, 0, TAU); ctx.fill(); }
  ctx.restore();
  ctx.restore();
}

// 34. Voyager Probe — big dish + bus + booms; FX: expanding signal rings from the dish
function drawVoyager(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 23);
  ctx.strokeStyle = shade(color, -10); ctx.lineWidth = 1.4; // booms
  ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-30, -16); ctx.moveTo(-6, 0); ctx.lineTo(-30, 14); ctx.stroke();
  ctx.fillStyle = shade(color, 95); ctx.beginPath(); ctx.arc(-30, -16, 2.4, 0, TAU); ctx.arc(-30, 14, 2.4, 0, TAU); ctx.fill();
  const bus = [[8, -8], [-8, -8], [-8, 8], [8, 8]]; // hex bus (boxy)
  ctx.fillStyle = bodyGrad(ctx, color, -8, 8); tracePoly(ctx, bus); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.4); tracePoly(ctx, bus); ctx.stroke(); ctx.shadowBlur = 0;
  // parabolic dish facing +x
  const dish = ctx.createRadialGradient(20, 0, 0, 20, 0, 16);
  dish.addColorStop(0, "#ffffff"); dish.addColorStop(0.5, shade(color, 60)); dish.addColorStop(1, shade(color, -40));
  ctx.fillStyle = dish; ctx.beginPath(); ctx.ellipse(18, 0, 8, 16, 0, 0, TAU); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.6); ctx.beginPath(); ctx.ellipse(18, 0, 8, 16, 0, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.strokeStyle = shade(color, 95); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(34, 0); ctx.stroke(); // feed
  ctx.save(); ctx.globalCompositeOperation = "lighter"; // expanding signal rings
  for (let k = 0; k < 3; k++) {
    const prog = ((o.t * 0.6 + k / 3) % 1);
    ctx.strokeStyle = hexA(shade(color, 95), (1 - prog) * 0.7); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(28, 0, 4 + prog * 22, -0.7, 0.7); ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

// 35. Orbital Station — truss + modules + 4 tracking solar wings; FX: wings track + beacon blink
function drawISS(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 24);
  ctx.strokeStyle = shade(color, 40); ctx.lineWidth = 3; // main truss
  ctx.beginPath(); ctx.moveTo(28, 0); ctx.lineTo(-28, 0); ctx.stroke();
  const sway = Math.sin(o.t * 0.8) * 0.18; // panels slowly tracking the sun
  for (const px of [-18, 14]) for (const sgn of [-1, 1]) {
    ctx.save(); ctx.translate(px, 0); ctx.rotate(sgn * sway);
    ctx.fillStyle = "#12305f";
    tracePoly(ctx, [[-7, sgn * 3], [7, sgn * 3], [7, sgn * 22], [-7, sgn * 22]]); ctx.fill();
    ctx.strokeStyle = "#5fd0ff"; ctx.globalAlpha = 0.5; ctx.lineWidth = 0.6;
    for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-7, sgn * (3 + i * 3.8)); ctx.lineTo(7, sgn * (3 + i * 3.8)); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.strokeStyle = shade(color, 95); ctx.lineWidth = 1;
    ctx.strokeRect(-7, sgn < 0 ? -22 : 3, 14, 19); ctx.restore();
  }
  for (const mx of [10, -6, -20]) { // pressurized modules
    ctx.fillStyle = bodyGrad(ctx, color, mx - 6, mx + 6);
    ctx.beginPath(); ctx.ellipse(mx, 0, 6, 4.5, 0, 0, TAU); ctx.fill();
    neonOutline(ctx, color, o.isMe, 1.2); ctx.beginPath(); ctx.ellipse(mx, 0, 6, 4.5, 0, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
  }
  const blink = Math.sin(o.t * 8) > 0.4 ? 1 : 0.15; // red nav beacon
  ctx.fillStyle = hexA("#ff3b3b", blink); ctx.beginPath(); ctx.arc(28, 0, 2.2, 0, TAU); ctx.fill();
  coreDot(ctx, color, 18, 0, 3);
  ctx.restore();
}

// 36. Warp Cruiser — saucer + nacelles (top-tier VIP); FX: pulsing warp nacelles + warp streaks
function drawEnterprise(ctx: CanvasRenderingContext2D, color: string, o: SkinOpts) {
  beginShip(ctx, o, 24);
  ctx.save(); ctx.globalCompositeOperation = "lighter"; // warp streaks trailing back
  for (let i = 0; i < 4; i++) {
    const sp = ((o.t * 1.2 + i * 0.25) % 1);
    ctx.strokeStyle = hexA("#7fd0ff", (1 - sp) * 0.5); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-18 - sp * 18, -14 + i * 9); ctx.lineTo(-30 - sp * 22, -14 + i * 9); ctx.stroke();
  }
  ctx.restore();
  for (const sgn of [-1, 1]) { // nacelle pylons + nacelles
    ctx.strokeStyle = shade(color, -20); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-8, sgn * 4); ctx.lineTo(-14, sgn * 15); ctx.stroke();
    const nac = [[2, sgn * 12], [-26, sgn * 12], [-26, sgn * 19], [2, sgn * 19]];
    ctx.fillStyle = bodyGrad(ctx, color, -26, 2); tracePoly(ctx, nac); ctx.fill();
    neonOutline(ctx, color, o.isMe, 1.4); tracePoly(ctx, nac); ctx.stroke(); ctx.shadowBlur = 0;
    addGlow(ctx, 1, sgn * 15.5, 6, "#4aa8ff", 0.5 + Math.sin(o.t * 5) * 0.35); // Bussard glow
  }
  const eng = [[6, -7], [-22, -7], [-22, 7], [6, 7]]; // engineering hull
  ctx.fillStyle = bodyGrad(ctx, color, -22, 6); tracePoly(ctx, eng); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.5); tracePoly(ctx, eng); ctx.stroke(); ctx.shadowBlur = 0;
  addGlow(ctx, 6, 0, 6, "#9fe8ff", 0.4 + Math.sin(o.t * 3) * 0.2); // deflector dish
  ctx.fillStyle = bodyGrad(ctx, color, 6, 36); // saucer
  ctx.beginPath(); ctx.ellipse(22, 0, 15, 11, 0, 0, TAU); ctx.fill();
  neonOutline(ctx, color, o.isMe, 1.7); ctx.beginPath(); ctx.ellipse(22, 0, 15, 11, 0, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.strokeStyle = shade(color, 95); ctx.globalAlpha = 0.5; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.ellipse(22, 0, 8, 5.5, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; // bridge ring
  coreDot(ctx, color, 22, 0, 3);
  ctx.restore();
}

// Registry: skin id → renderer. The 6 originals are adapted to SkinOpts here.
export const SKIN_RENDERERS: Record<string, SkinFn> = {
  default:     (c, col, o) => drawCyberCruiser(c, col, o.isMe, o.tilt),
  ufo:         (c, col, o) => drawCyberUFO(c, col, o.thrust, o.t, o.roll, o.size),
  drone:       (c, col, o) => drawCyberDrone(c, col, o.t),
  plane:       (c, col, o) => drawCyberJet(c, col, o.thrust),
  speeder:     (c, col, o) => drawNeonSpeeder(c, col, o.thrust),
  interceptor: (c, col, o) => drawCyberInterceptor(c, col, o.isMe, o.tilt),
  dart:        drawDart,
  delta:       drawDelta,
  shuttle:     drawShuttle,
  fighter:     drawFighter,
  stealth:     drawStealth,
  raptor:      drawRaptor,
  manta:       drawManta,
  needle:      drawNeedle,
  tie:         drawTie,
  viper:       drawViper,
  trident:     drawTrident,
  crystal:     drawCrystal,
  phoenix:     drawPhoenix,
  wasp:        drawWasp,
  falcon:      drawFalcon,
  orbiter:     drawOrbiter,
  mothership:  drawMothership,
  comet:       drawComet,
  ring:        drawRing,
  dreadnought: drawDreadnought,
  dragon:      drawDragon,
  falcon9:     drawFalcon9,
  apollo:      drawApollo,
  soyuz:       drawSoyuz,
  starship:    drawStarship,
  lunar:       drawLunar,
  saturnv:     drawSaturnV,
  voyager:     drawVoyager,
  iss:         drawISS,
  enterprise:  drawEnterprise,
};

// Single entry point used by both the race canvas and the shop preview.
export function drawSkin(ctx: CanvasRenderingContext2D, skinId: string, color: string, o: SkinOpts) {
  (SKIN_RENDERERS[skinId] || SKIN_RENDERERS.default)(ctx, color, o);
}
