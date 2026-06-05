/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared high-quality rendering functions for rockets and space crafts.
 * Extracted from ModelRace.tsx to ensure consistency across the app (Race & Shop).
 */

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

/**
 * Detailed 4-layer fuel-burning flame with Mach diamonds.
 */
export function drawFlame(ctx: CanvasRenderingContext2D, thrust: number, color: string, t: number, seed: number, boost: number) {
  const fl = 0.78 + Math.sin(t * 0.6 + seed) * 0.14 + Math.sin(t * 1.7 + seed * 2) * 0.08;
  const len = (54 + thrust * 150) * fl * (1 + boost * 1.5);
  const wid = (7 + thrust * 7) * (1 + boost * 0.6);
  const sway = Math.sin(t * 0.9 + seed) * 2.2 * thrust;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  
  // 1. Haze
  ctx.globalAlpha = 0.5;
  const haze = ctx.createLinearGradient(0, 0, -len * 1.15, 0);
  haze.addColorStop(0, "rgba(255,120,30,0.55)"); haze.addColorStop(0.4, "rgba(190,60,12,0.28)"); haze.addColorStop(1, "rgba(60,20,6,0)");
  ctx.fillStyle = haze; plumeCone(ctx, len * 1.15, wid * 2.3, sway, t, seed, 0.5);
  
  // 2. Orange
  ctx.globalAlpha = 0.85;
  const orange = ctx.createLinearGradient(0, 0, -len, 0);
  orange.addColorStop(0, "rgba(255,180,60,0.95)"); orange.addColorStop(0.35, "rgba(255,110,20,0.8)"); orange.addColorStop(1, "rgba(150,40,10,0)");
  ctx.fillStyle = orange; plumeCone(ctx, len, wid * 1.55, sway, t, seed, 1);
  
  // 3. Yellow
  ctx.globalAlpha = 0.95;
  const yellow = ctx.createLinearGradient(0, 0, -len * 0.7, 0);
  yellow.addColorStop(0, "rgba(255,244,200,1)"); yellow.addColorStop(0.45, "rgba(255,210,90,0.9)"); yellow.addColorStop(1, "rgba(255,140,30,0)");
  ctx.fillStyle = yellow; plumeCone(ctx, len * 0.7, wid * 1.0, sway, t, seed, 1.4);
  
  // 4. Core
  const core = ctx.createLinearGradient(0, 0, -len * 0.42, 0);
  core.addColorStop(0, "rgba(255,255,255,1)"); core.addColorStop(0.5, "rgba(220,240,255,0.85)"); core.addColorStop(1, "rgba(180,210,255,0)");
  ctx.fillStyle = core; plumeCone(ctx, len * 0.42, wid * 0.5, sway * 0.5, t, seed, 2);
  
  // Tint glow
  ctx.globalAlpha = 0.6;
  const tint = ctx.createRadialGradient(-2, 0, 0, -2, 0, wid * 1.6);
  tint.addColorStop(0, color); tint.addColorStop(1, "transparent");
  ctx.fillStyle = tint; ctx.beginPath(); ctx.arc(-2, 0, wid * 1.6, 0, TAU); ctx.fill();
  
  // Mach Diamonds
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
  
  // Bloom at nozzle
  const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, wid * 2.2);
  bloom.addColorStop(0, "rgba(255,255,255,0.95)"); bloom.addColorStop(0.4, "rgba(255,200,90,0.6)"); bloom.addColorStop(1, "transparent");
  ctx.fillStyle = bloom; ctx.beginPath(); ctx.arc(0, 0, wid * 2.2, 0, TAU); ctx.fill();
  ctx.restore();
}

/**
 * Alien Saucer skin with rotating lights and tractor beam area.
 */
export function drawUFO(ctx: CanvasRenderingContext2D, color: string, thrust: number, t: number, roll: number, SHIP_SIZE: number) {
  const r = SHIP_SIZE * 0.5;
  ctx.save();
  ctx.scale(1, Math.cos(roll));
  ctx.rotate(t * 3);
  const pulse = 0.8 + Math.sin(t * 10) * 0.2;
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  glow.addColorStop(0, hexA(color, 0.8 * pulse)); glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.4, 0, 0, TAU); ctx.fill();
  const saucer = ctx.createRadialGradient(0, -2, 0, 0, 0, r);
  saucer.addColorStop(0, "#cbd5e1"); saucer.addColorStop(0.5, "#94a3b8"); saucer.addColorStop(1, "#475569");
  ctx.fillStyle = saucer; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.1, r * 0.35, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

/**
 * The high-quality metallic rocket body with fins, nozzle, and panel seams.
 */
export function drawHighQualityRocket(ctx: CanvasRenderingContext2D, color: string, thrust: number) {
  // Fins
  ctx.fillStyle = shade(color, -40); ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(4, -10); ctx.lineTo(16, -19); ctx.lineTo(24, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, 10); ctx.lineTo(16, 19); ctx.lineTo(24, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
  
  // Nozzle
  const bell = ctx.createLinearGradient(-7, 0, 6, 0);
  bell.addColorStop(0, "#2a2a30"); bell.addColorStop(1, "#6a6a74");
  ctx.fillStyle = bell;
  ctx.beginPath(); ctx.moveTo(6, -7); ctx.lineTo(-6, -10); ctx.lineTo(-6, 10); ctx.lineTo(6, 7); ctx.closePath(); ctx.fill();
  
  // Body
  const body = ctx.createLinearGradient(0, -11, 0, 11);
  body.addColorStop(0, "#e8edf5"); body.addColorStop(0.3, "#c2cad6"); body.addColorStop(0.5, "#f4f7fb");
  body.addColorStop(0.7, "#aab2c0"); body.addColorStop(1, "#767d8c");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(4, -11); ctx.lineTo(54, -11);
  ctx.quadraticCurveTo(78, -10, 84, 0);
  ctx.quadraticCurveTo(78, 10, 54, 11); ctx.lineTo(4, 11);
  ctx.quadraticCurveTo(0, 0, 4, -11); ctx.closePath(); ctx.fill();
  
  // Nosecone Cap
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(60, -10.2); ctx.quadraticCurveTo(78, -9.4, 84, 0);
  ctx.quadraticCurveTo(78, 9.4, 60, 10.2); ctx.quadraticCurveTo(64, 0, 60, -10.2); ctx.closePath(); ctx.fill();
  
  // Stripe
  ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(54, 0); ctx.stroke(); ctx.globalAlpha = 1;
  
  // Window
  const win = ctx.createRadialGradient(46, -2, 0, 46, 0, 7);
  win.addColorStop(0, "#bdf0ff"); win.addColorStop(0.6, "#3aa6e0"); win.addColorStop(1, "#0a4a78");
  ctx.fillStyle = win; ctx.beginPath(); ctx.ellipse(46, 0, 6.5, 5, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1; ctx.stroke();
  
  // Lights
  ctx.fillStyle = color; ctx.shadowBlur = 6; ctx.shadowColor = color;
  ctx.beginPath(); ctx.arc(24, -10, 1.6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(24, 10, 1.6, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;
  
  // Panels
  ctx.strokeStyle = "rgba(60,70,90,0.35)"; ctx.lineWidth = 0.6;
  [20, 34, 48].forEach((px) => { ctx.beginPath(); ctx.moveTo(px, -10.5); ctx.lineTo(px, 10.5); ctx.stroke(); });

  // 🚀 Nosecone Glow
  if (thrust > 0.6) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const gSize = 20 * (thrust - 0.5);
    const nglow = ctx.createRadialGradient(84, 0, 0, 84, 0, gSize);
    nglow.addColorStop(0, hexA(color, 0.8));
    nglow.addColorStop(1, "transparent");
    ctx.fillStyle = nglow;
    ctx.beginPath(); ctx.arc(84, 0, gSize, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

export function drawCapsule(ctx: CanvasRenderingContext2D, color: string, R: number) {
  ctx.save();
  ctx.scale(R / 22, R / 22);
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
