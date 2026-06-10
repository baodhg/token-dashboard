const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../lib/rocket-renderer.ts');
let content = fs.readFileSync(file, 'utf8');

const drawFlameRegex = /export function drawFlame\([\s\S]*?ctx\.restore\(\);\n}/;

const newDrawFlame = `export function drawFlame(ctx: CanvasRenderingContext2D, thrust: number, color: string, flameColor: string | null, t: number, seed: number, boost: number) {
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
}`;

content = content.replace(drawFlameRegex, newDrawFlame);

const newSkins = `

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
`;

if (!content.includes('drawCyberInterceptor')) {
  content += newSkins;
}

fs.writeFileSync(file, content);
console.log('Updated rocket-renderer.ts');
