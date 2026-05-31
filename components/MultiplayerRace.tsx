"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PlayerStat {
  name: string;
  totalTokens: number;
  updatedAt: number;
}

interface MultiplayerRaceProps {
  serverUrl: string;
  playerName: string;
  /** JWT token — kept for future use, not used for canvas polling. */
  playerToken?: string;
  /** Current player's totalTokens — caller keeps fetching and passes it in. */
  myTokens: number;
  onExit?: () => void;
  /**
   * Spectator (projector) mode: the machine is only displaying the race, not
   * competing. There is no "me", so the bottom self badge is hidden and no
   * player is highlighted. The caller also skips /api/sync entirely in this
   * mode, so this machine never reports a total of its own.
   */
  spectator?: boolean;
}

// ── Shared math / color helpers (duplicated from ModelRace to keep files independent) ─
const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const rndi = (a: number, b: number) => Math.floor(rnd(a, b + 1));

// Assign each player a stable vivid color based on their name hash
function nameColor(name: string): string {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return hslToHex(hue, 72, 58);
}

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

function fmt(v: number): string {
  return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M`
    : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K`
    : `${Math.round(v)}`;
}

// ── Galaxy background (condensed — same logic as ModelRace) ──────────────────
function createGalaxy() {
  let W = 0, H = 0;
  let starsFar: any[] = [], starsMid: any[] = [], starsNear: any[] = [];
  let nebulae: any[] = [], galaxies: any[] = [], meteors: any[] = [];
  let staticCanvas: HTMLCanvasElement | null = null;
  let staticCtx: CanvasRenderingContext2D | null = null;
  let needsStatic = true;

  const STAR_TINTS = [[201,216,255],[180,200,255],[255,255,255],[255,250,240],[255,244,214],[255,224,180],[255,210,161],[202,226,255]];
  function makeStar(depth: number) {
    const tint = STAR_TINTS[rndi(0, STAR_TINTS.length - 1)];
    return { x: rnd(0, W), y: rnd(0, H), r: rnd(0.3, depth === 0 ? 1.0 : depth === 1 ? 1.7 : 2.6),
      tint, tw: rnd(0, TAU), twSpeed: rnd(0.008, 0.05), twAmt: rnd(0.25, 0.7) };
  }
  const NEB_PALETTES = [["#ff2d5e","#7a1840","#ff7aa8"],["#2d6cff","#16306e","#7aa8ff"],["#9b3dff","#3a1670","#c98aff"],["#13b3a0","#0a4a44","#5fe6d4"],["#ffae3d","#7a4a10","#ffd58a"]];
  function makeNebula() {
    const pal = NEB_PALETTES[rndi(0, NEB_PALETTES.length - 1)];
    const cx = rnd(0, W), cy = rnd(0, H); const blobs: any[] = [];
    const count = rndi(6, 10); const spread = rnd(W * 0.1, W * 0.24);
    for (let i = 0; i < count; i++) {
      blobs.push({ dx: rnd(-spread, spread), dy: rnd(-spread * 0.7, spread * 0.7),
        r: rnd(spread * 0.4, spread * 1.0), c: pal[rndi(0, pal.length - 1)], a: rnd(0.04, 0.14) });
    }
    return { cx, cy, blobs };
  }
  function makeGalaxy2() {
    return { x: rnd(0, W), y: rnd(0, H), r: rnd(24, 60), rot: rnd(0, TAU),
      tilt: rnd(0.28, 0.6), hue: rndi(195, 320), a: rnd(0.09, 0.20) };
  }
  function spawnMeteor() {
    const ang = rnd(Math.PI * 0.72, Math.PI * 0.92); const speed = rnd(11, 20);
    return { x: rnd(W * 0.2, W), y: rnd(-40, H * 0.4),
      vx: -Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      len: rnd(120, 300), life: 1, decay: rnd(0.006, 0.012), w: rnd(1.2, 2.4),
      tint: Math.random() > 0.7 ? [180, 220, 255] : [255, 240, 214] };
  }

  function rebuild() {
    starsFar  = Array.from({ length: 380 }, () => makeStar(0));
    starsMid  = Array.from({ length: 160 }, () => makeStar(1));
    starsNear = Array.from({ length: 55  }, () => makeStar(2));
    nebulae   = Array.from({ length: 4   }, makeNebula);
    galaxies  = Array.from({ length: 5   }, makeGalaxy2);
    needsStatic = true;
  }

  function buildStatic() {
    if (!staticCanvas) {
      staticCanvas = document.createElement("canvas");
      staticCtx = staticCanvas.getContext("2d");
    }
    staticCanvas.width = W; staticCanvas.height = H;
    const ctx = staticCtx!;
    ctx.fillStyle = "#03040a"; ctx.fillRect(0, 0, W, H);
    // Milky Way diffuse band
    const mw = ctx.createLinearGradient(0, H * 0.2, 0, H * 0.85);
    mw.addColorStop(0, "transparent"); mw.addColorStop(0.35, "rgba(120,140,200,0.06)");
    mw.addColorStop(0.65, "rgba(100,120,190,0.09)"); mw.addColorStop(1, "transparent");
    ctx.fillStyle = mw; ctx.fillRect(0, 0, W, H);
    // Nebulae
    nebulae.forEach((n) => {
      n.blobs.forEach((b: any) => {
        const g = ctx.createRadialGradient(n.cx + b.dx, n.cy + b.dy, 0, n.cx + b.dx, n.cy + b.dy, b.r);
        g.addColorStop(0, b.c + Math.round(b.a * 255).toString(16).padStart(2, "0"));
        g.addColorStop(1, "transparent");
        ctx.save(); ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.cx + b.dx, n.cy + b.dy, b.r, 0, TAU); ctx.fill();
        ctx.restore();
      });
    });
    // Far stars
    starsFar.forEach((s) => {
      const [r, g, b] = s.tint;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    });
    ctx.globalAlpha = 1;
    needsStatic = false;
  }

  function drawStarLayer(ctx: CanvasRenderingContext2D, stars: any[], drift: number, brightness: number) {
    stars.forEach((s) => {
      s.tw += s.twSpeed; s.x -= drift;
      if (s.x < -4) s.x = W + 4;
      const [r, g, b] = s.tint;
      const tw = brightness * (1 - s.twAmt * Math.abs(Math.sin(s.tw)));
      ctx.globalAlpha = tw;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawGalaxies(ctx: CanvasRenderingContext2D) {
    galaxies.forEach((g) => {
      g.x -= 0.06; g.rot += 0.0004;
      if (g.x + g.r < -20) { g.x = W + g.r + rnd(0, W * 0.5); g.y = rnd(0, H); }
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.rot); ctx.scale(1, g.tilt);
      ctx.globalCompositeOperation = "screen";
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, g.r);
      core.addColorStop(0, `hsla(${g.hue},70%,85%,${g.a})`); core.addColorStop(0.25, `hsla(${g.hue},65%,70%,${g.a * 0.5})`); core.addColorStop(1, "transparent");
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, g.r, 0, TAU); ctx.fill();
      ctx.restore();
    });
    ctx.globalCompositeOperation = "source-over";
  }

  return {
    resize(w: number, h: number) { W = w; H = h; rebuild(); },
    draw(ctx: CanvasRenderingContext2D) {
      if (needsStatic) buildStatic();
      ctx.drawImage(staticCanvas!, 0, 0, W, H);
      drawGalaxies(ctx);
      drawStarLayer(ctx, starsMid, 0.18, 0.7);
      drawStarLayer(ctx, starsNear, 0.5, 0.95);
      // Meteors
      if (Math.random() < 0.010 && meteors.length < 3) meteors.push(spawnMeteor());
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
      }
      // Vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, "transparent"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    },
  };
}

// ── Player rocket engine ──────────────────────────────────────────────────────
const BURST_FRAMES = 150;

// Minimum real token gain (between two polls) that counts as a "surge" and fires
// the afterburner. Absolute, NOT relative to the leader's total — a relative
// threshold (newMax * 0.0005) scales with whoever is in the lead, so once one
// racer's cumulative total is large, smaller racers' normal gains never clear
// the bar and only the leader's rocket bursts. A flat floor keeps every racer's
// afterburner firing on real gains regardless of the leader's size.
const SURGE_MIN_TOKENS = 50;

// Seconds an up/down rank change keeps flashing before settling back to "same"
const TREND_HOLD_S = 2.5;

function createPlayerRockets() {
  let W = 0, H = 0;
  let rockets: any[] = [];
  let sparks: any[] = [];
  let maxTokens = 1;
  let clock = 0; // accumulated seconds, advanced each frame by the render loop

  function emitSparks(x: number, y: number, color: string, thrust: number) {
    const n = Math.floor(1 + thrust * 4);
    for (let k = 0; k < n; k++) {
      sparks.push({ x: x + rnd(-3, 3), y: y + rnd(-4, 4),
        vx: -rnd(3, 8 + thrust * 8), vy: rnd(-1.6, 1.6),
        life: rnd(10, 26), max: 26, size: rnd(1, 2.6),
        color: Math.random() > 0.55 ? "#ffffff" : color,
        kind: Math.random() > 0.7 ? "ember" : "spark" });
    }
    if (Math.random() > 0.6) {
      sparks.push({ x: x - rnd(6, 18), y: y + rnd(-4, 4),
        vx: -rnd(0.6, 2.2), vy: rnd(-0.6, 0.6),
        life: rnd(26, 54), max: 54, size: rnd(7, 16), color: "#1c1410", kind: "smoke" });
    }
  }

  function drawSparks(ctx: CanvasRenderingContext2D) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      if (p.kind === "shock") {
        p.life--;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        const prog = 1 - p.life / p.max;
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = p.life / p.max * 0.8;
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(0.5, p.size * (p.life / p.max));
        ctx.shadowBlur = 12; ctx.shadowColor = p.color;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * 2 + prog * p.vx, p.size + prog * p.vx * 0.55, 0, 0, TAU); ctx.stroke();
        ctx.restore();
        continue;
      }
      p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.life--;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      const r = p.life / p.max;
      if (p.kind === "warp") {
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = r * 0.9;
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(0.4, p.size * r);
        ctx.shadowBlur = 6; ctx.shadowColor = p.color;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * (4 + (1 - r) * 10), p.y - p.vy * 4); ctx.stroke();
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
    // Width profile: NARROW at the throat (x=0) so the plume erupts from a tight
    // engine mouth that the ship's nozzle covers — no flame spilling past the
    // hull sides — then bulges open and tapers to a point at the tail. This is
    // both more realistic and fixes the "gap" where a wide-at-origin cone poked
    // out beyond the nozzle face.
    // Throat must keep the WIDEST flame layer (haze, halfW = wid*2.3) within the
    // ship's nozzle half-height even at full burst, or the plume spills past the
    // hull. Worst case wid≈22 → 22*2.3*0.18 ≈ 9.3, under NOZZLE_H (11). At cruise
    // it reads as a tight high-pressure jet.
    const THROAT = 0.18; // width at x=0 as a fraction of halfW
    const widthAt = (u: number) => {
      // bulge: rises from THROAT to 1.0 around u≈0.3, then tapers toward 0.
      const open = THROAT + (1 - THROAT) * Math.sin(Math.min(u / 0.3, 1) * (Math.PI / 2));
      const tail = 1 - Math.pow(u, 1.4); // smooth taper to the tail tip
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

  function drawFlame(ctx: CanvasRenderingContext2D, thrust: number, color: string, t: number, seed: number, boost: number) {
    const fl = 0.78 + Math.sin(t * 0.6 + seed) * 0.14 + Math.sin(t * 1.7 + seed * 2) * 0.08;
    const len = (54 + thrust * 150) * fl * (1 + boost * 1.5);
    const wid = (7 + thrust * 7) * (1 + boost * 0.6);
    const sway = Math.sin(t * 0.9 + seed) * 2.2 * thrust;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5;
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
    const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, wid * 2.2);
    bloom.addColorStop(0, "rgba(255,255,255,0.95)"); bloom.addColorStop(0.4, "rgba(255,200,90,0.6)"); bloom.addColorStop(1, "transparent");
    ctx.fillStyle = bloom; ctx.beginPath(); ctx.arc(0, 0, wid * 2.2, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // Rocket: render player as an aggressive CYBER battlecruiser — a heavy,
  // hard-edged hull with armored plating, twin neon strakes, a flat engine
  // NOZZLE that meets the flame, big swept wings, and a hot energy core.
  // Faces +x. The exhaust nozzle is a flat face at x≈0 (the flame origin), so
  // the plume erupts straight out of the engine — no gap. The name lives in the
  // HUD label, so no letter is drawn.
  function drawRocketBody(ctx: CanvasRenderingContext2D, color: string, _name: string, isMe: boolean) {
    const R = isMe ? 30 : 24;
    ctx.save();
    ctx.scale(R / 22, R / 22);
    ctx.lineJoin = "miter";
    ctx.miterLimit = 8;

    const neon = shade(color, 95);
    const dark = shade(color, -58);
    const NOZZLE_H = 11; // half-height of the flat engine face at the tail (x=0); must cover the flame throat

    // Hull silhouette — heavy dart with a FLAT tail nozzle (x=0) meeting the
    // flame, stepped armor shoulders, and a long sharp nose (x=50).
    const hull = (c: CanvasRenderingContext2D) => {
      c.beginPath();
      c.moveTo(50, 0);              // nose tip
      c.lineTo(30, -6);             // nose shoulder (upper)
      c.lineTo(24, -11);            // armor step out (upper)
      c.lineTo(13, -13);            // wide mid hull (upper)
      c.lineTo(4, -NOZZLE_H);       // slight vault into the nozzle (upper)
      c.lineTo(0, -NOZZLE_H);       // FLAT nozzle top
      c.lineTo(0, NOZZLE_H);        // FLAT nozzle bottom
      c.lineTo(4, NOZZLE_H);        // slight vault into the nozzle (lower)
      c.lineTo(13, 13);             // wide mid hull (lower)
      c.lineTo(24, 11);             // armor step out (lower)
      c.lineTo(30, 6);              // nose shoulder (lower)
      c.closePath();
    };

    // ── Big swept wings (behind hull), aggressive rake ───────────────────────
    ctx.fillStyle = dark;
    ctx.strokeStyle = neon; ctx.lineWidth = 1.2;
    ctx.shadowColor = color; ctx.shadowBlur = isMe ? 6 : 4;
    // top wing
    ctx.beginPath();
    ctx.moveTo(20, -9); ctx.lineTo(10, -28); ctx.lineTo(0, -26); ctx.lineTo(2, -11); ctx.lineTo(8, -10);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // bottom wing
    ctx.beginPath();
    ctx.moveTo(20, 9); ctx.lineTo(10, 28); ctx.lineTo(0, 26); ctx.lineTo(2, 11); ctx.lineTo(8, 10);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    // ── Hull fill: dark armored metal, bright energized leading edge ─────────
    const body = ctx.createLinearGradient(0, 0, 50, 0);
    body.addColorStop(0, shade(color, -60));
    body.addColorStop(0.45, shade(color, -25));
    body.addColorStop(0.8, color);
    body.addColorStop(1, neon);
    ctx.fillStyle = body;
    hull(ctx); ctx.fill();

    // ── Armor plate shading — a darker belly wedge for volume ────────────────
    ctx.globalAlpha = 0.4; ctx.fillStyle = shade(color, -70);
    ctx.beginPath();
    ctx.moveTo(0, NOZZLE_H); ctx.lineTo(13, 13); ctx.lineTo(24, 11); ctx.lineTo(30, 6);
    ctx.lineTo(30, 2); ctx.lineTo(6, 3); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // ── Twin neon strakes running the length of the hull ─────────────────────
    ctx.strokeStyle = neon; ctx.lineWidth = 1.4;
    ctx.shadowColor = color; ctx.shadowBlur = 5;
    ctx.beginPath(); ctx.moveTo(7, -5); ctx.lineTo(30, -3.5); ctx.lineTo(44, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7, 5); ctx.lineTo(30, 3.5); ctx.lineTo(44, 0); ctx.stroke();
    ctx.shadowBlur = 0;

    // ── Engine vents — glowing slits on the nozzle face ──────────────────────
    ctx.strokeStyle = "#ffffff"; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.6;
    ctx.shadowColor = color; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.moveTo(1, -NOZZLE_H + 2); ctx.lineTo(1, NOZZLE_H - 2); ctx.stroke();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;

    // ── Heavy hull outline — white+glow for "me", neon for others ────────────
    ctx.shadowColor = color;
    ctx.shadowBlur = isMe ? 12 : 8;
    ctx.strokeStyle = isMe ? "#ffffff" : neon;
    ctx.lineWidth = isMe ? 2.2 : 1.6;
    hull(ctx); ctx.stroke();
    ctx.shadowBlur = 0;

    // ── Energy core — hot glowing reactor eye ────────────────────────────────
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

  return {
    setPlayers(list: Array<{ name: string; totalTokens: number; color: string; isMe: boolean }>) {
      const newMax = Math.max(1, ...list.map((p) => p.totalTokens));
      const prev = new Map(rockets.map((r: any) => [r.name, r]));
      rockets = list.map((p, i) => {
        const old = prev.get(p.name);
        const prevTokens = old ? old.totalTokens : p.totalTokens;
        const gained = p.totalTokens - prevTokens;
        const grew = !!old && gained >= SURGE_MIN_TOKENS;
        const burstTimer = grew ? BURST_FRAMES : old ? Math.max(0, old.burstTimer || 0) : 0;
        const oldRank = old ? old.rank : i;
        // Carry over the existing trend; only refresh it (and its expiry) on an
        // actual rank change this update. Expiry is checked per-frame in frame().
        let trend: "up" | "down" | "same" = old ? (old.trend || "same") : "same";
        let trendUntil = old ? (old.trendUntil || 0) : 0;
        if (old && i !== oldRank) {
          trend = i < oldRank ? "up" : "down";
          trendUntil = clock + TREND_HOLD_S;
        }
        return {
          name: p.name, totalTokens: p.totalTokens, color: p.color, isMe: p.isMe, i,
          x: old ? old.x : 70, y: old ? old.y : 0,
          seed: old ? old.seed : rnd(0, 1000),
          thrust: old ? old.thrust : 0,
          burn: old ? (old.burn || 0) : 0,
          bob: old ? old.bob : rnd(0, TAU),
          burstTimer, burstStart: grew, rank: i, prevRank: old ? old.rank : i,
          trend, trendUntil,
          boomTimer: old ? (old.boomTimer || 0) : 0,
        };
      });
      maxTokens = newMax;
    },
    layout(w: number, h: number) { W = w; H = h; },
    frame(ctx: CanvasRenderingContext2D, t: number) {
      clock = t;
      const n = rockets.length;
      if (!n) return [];
      // topPad clears the header stack (title + sub + tab switcher) so the top
      // lane never sits under it; botPad leaves room for the bottom badge. Lanes
      // are distributed evenly across the usable band, so any player count up to
      // the 10-slot cap auto-compresses to fit without overflowing.
      const topPad = 132, botPad = 56;
      const usable = H - topPad - botPad;
      const laneAt = (i: number) => topPad + usable * ((i + 0.5) / n);
      const startX = 90, finishX = W - 360;
      const out: any[] = [];

      // Lane tracks
      rockets.forEach((r: any, i: number) => {
        const y = laneAt(i);
        ctx.globalAlpha = 0.05; ctx.strokeStyle = r.color; ctx.lineWidth = 34;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      });
      ctx.globalAlpha = 1;
      drawSparks(ctx);

      rockets.forEach((r: any, i: number) => {
        const target = startX + (r.totalTokens / maxTokens) * (finishX - startX);
        const prevX = r.x;
        const lerpRate = r.burstTimer > 0 ? 0.065 : 0.045;
        r.x += (target - r.x) * lerpRate;
        const pixelSpeed = Math.min(1, Math.abs(r.x - prevX) / 2.2);
        if (r.burstTimer > 0) r.burstTimer--;
        if (r.burstTimer > 0) {
          r.burn = Math.min(1, r.burn + 0.06);
        } else {
          r.burn = Math.max(0, r.burn - 1 / 360);
        }
        const burstIntensity = r.burn;
        const cruise = 0.35 + pixelSpeed * 0.65;
        r.thrust = cruise + (1.0 - cruise) * burstIntensity;
        r.bob += 0.05;
        const y = laneAt(i) + Math.sin(r.bob) * 2.4;
        r.y = y;
        const sparkThreshold = 0.15 - burstIntensity * 0.12;
        if (Math.random() > sparkThreshold) emitSparks(r.x - 6, y, r.color, r.thrust);
        if (r.burstStart) {
          r.burstStart = false;
          sparks.push({ x: r.x, y, vx: 30, vy: 0, life: 34, max: 34, size: 12, color: "#ffffff", kind: "shock" });
          sparks.push({ x: r.x, y, vx: 44, vy: 0, life: 40, max: 40, size: 16, color: r.color, kind: "shock" });
          for (let k = 0; k < 22; k++) {
            sparks.push({ x: r.x - 6, y: y + rnd(-10, 10), vx: -rnd(8, 26), vy: rnd(-6, 6),
              life: rnd(20, 44), max: 44, size: rnd(2.4, 5),
              color: Math.random() > 0.45 ? r.color : "#ffffff", kind: "ember" });
          }
        }
        if (r.prevRank > r.rank) {
          r.boomTimer = 22; r.prevRank = r.rank;
          for (let k = 0; k < 2; k++) {
            sparks.push({ x: r.x, y, vx: 18 + k * 14, vy: 0, life: 26, max: 26, size: 6 + k * 3, color: "#ffffff", kind: "shock" });
          }
          for (let k = 0; k < 16; k++) {
            sparks.push({ x: r.x, y: y + rnd(-6, 6), vx: rnd(-20, 24), vy: rnd(-8, 8),
              life: rnd(14, 30), max: 30, size: rnd(2, 4.5),
              color: Math.random() > 0.5 ? "#ffffff" : r.color, kind: "ember" });
          }
        }
        if (r.boomTimer > 0) r.boomTimer--;
        if (Math.random() < burstIntensity * 0.65) {
          const streaks = 1 + Math.floor(Math.random() * 2);
          for (let k = 0; k < streaks; k++) {
            const ringR = (16 - r.rank) + rnd(2, 10);
            const ang = rnd(0, TAU);
            sparks.push({ x: r.x + Math.cos(ang) * ringR, y: y + Math.sin(ang) * ringR * 0.7,
              vx: rnd(8, 22), vy: rnd(-1.5, 1.5), life: rnd(12, 22), max: 22, size: rnd(1.2, 2.6),
              color: Math.random() > 0.4 ? r.color : "#bfe9ff", kind: "warp" });
          }
        }
        ctx.save();
        ctx.translate(r.x, y);
        const boost = Math.min(1, Math.max(burstIntensity, r.boomTimer / 22));
        drawFlame(ctx, r.thrust, r.color, t, r.seed, boost);
        drawRocketBody(ctx, r.color, r.name, r.isMe);
        ctx.restore();
        // Trend flashes only while inside its hold window, then settles to "same".
        const trendActive = r.trend !== "same" && clock < r.trendUntil;
        if (!trendActive && r.trend !== "same") r.trend = "same";
        out.push({ name: r.name, x: r.x, y, color: r.color, totalTokens: r.totalTokens,
          isMe: r.isMe, trend: r.trend, trendActive });
      });
      if (sparks.length > 1400) sparks = sparks.slice(-1400);
      return out;
    },
  };
}

// ── CountUp helper ────────────────────────────────────────────────────────────
function CountUp({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current; const to = value;
    if (from === to) return;
    let start: number | null = null; const dur = 900;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (to - from) * eased;
      fromRef.current = v; setDisplay(v);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else { fromRef.current = to; setDisplay(to); }
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);
  return <span className={className} style={style}>{fmt(display)}</span>;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function MultiplayerRace({ serverUrl, playerName, myTokens, onExit, spectator = false }: MultiplayerRaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const trendRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const galaxyRef = useRef<ReturnType<typeof createGalaxy> | null>(null);
  const engineRef = useRef<ReturnType<typeof createPlayerRockets> | null>(null);
  const animRef = useRef(0);

  const [connected, setConnected] = useState(false);
  const [players, setPlayers] = useState<PlayerStat[]>([]);

  // Stable color per player name
  const colorMap = useRef(new Map<string, string>());
  const getColor = useCallback((name: string) => {
    if (!colorMap.current.has(name)) colorMap.current.set(name, nameColor(name));
    return colorMap.current.get(name)!;
  }, []);

  // Memoize ranked player list with colors
  const rankedPlayers = useMemo(() => {
    return [...players]
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, 10)
      .map((p) => ({ ...p, color: getColor(p.name), isMe: p.name === playerName }));
  }, [players, playerName, getColor]);

  const rankedRef = useRef(rankedPlayers);
  useEffect(() => {
    rankedRef.current = rankedPlayers;
    engineRef.current?.setPlayers(rankedPlayers);
  }, [rankedPlayers]);

  // Poll GET /live every 5s — no WebSocket needed.
  // Reporting happens server-side via /api/sync → POST /report regardless of browser state.
  useEffect(() => {
    const poll = () => {
      fetch(`${serverUrl}/live`)
        .then((r) => r.json())
        .then((d) => {
          setPlayers(d.players ?? []);
          setConnected(true);
        })
        .catch(() => setConnected(false));
    };
    poll();
    const id = setInterval(poll, 5_000);
    return () => clearInterval(id);
  }, [serverUrl]);

  // Scroll lock + Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onExit?.(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onExit]);

  // Canvas render loop — created once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Non-null aliases for closure capture
    const cv: HTMLCanvasElement = canvas;
    const cx: CanvasRenderingContext2D = ctx;

    galaxyRef.current = createGalaxy();
    engineRef.current = createPlayerRockets();
    engineRef.current.setPlayers(rankedRef.current);

    let W = 0, H = 0;
    function resize() {
      W = cv.offsetWidth; H = cv.offsetHeight;
      cv.width = W * devicePixelRatio; cv.height = H * devicePixelRatio;
      cx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      galaxyRef.current!.resize(W, H);
      engineRef.current!.layout(W, H);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    let t = 0;
    function frame() {
      animRef.current = requestAnimationFrame(frame);
      cx.clearRect(0, 0, W, H);
      galaxyRef.current!.draw(cx);
      const positions = engineRef.current!.frame(cx, t);
      t += 0.016;

      // Update HUD labels + rank-change arrows
      positions.forEach((p: any, i: number) => {
        const el = labelRefs.current[i];
        if (el) {
          el.style.transform = `translate(${p.x + 76}px, ${p.y - 22}px)`;
          el.style.opacity = "1";
        }
        const arrow = trendRefs.current[i];
        if (arrow) {
          const glyph = p.trend === "up" ? "▲" : p.trend === "down" ? "▼" : "▬";
          if (arrow.textContent !== glyph) arrow.textContent = glyph;
          arrow.style.color =
            p.trend === "up" ? "#4ade80" : p.trend === "down" ? "#f87171" : "rgba(180,200,220,0.4)";
          arrow.classList.toggle("race-trend-active", !!p.trendActive);
        }
      });
      // Hide unused labels
      for (let i = positions.length; i < labelRefs.current.length; i++) {
        const el = labelRefs.current[i];
        if (el) el.style.opacity = "0";
      }
    }
    animRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const MAX_LABELS = 10;

  return (
    <div className="relative w-full h-full" style={{ background: "#03040a" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

      {/* HUD labels — one per player slot */}
      {Array.from({ length: MAX_LABELS }).map((_, i) => {
        const p = rankedPlayers[i];
        return (
          <div
            key={i}
            ref={(el) => { labelRefs.current[i] = el; }}
            style={{
              position: "absolute", top: 0, left: 0, opacity: 0,
              transition: "opacity 0.3s",
              pointerEvents: "none",
            }}
          >
            {p && (
              <div
                style={{
                  display: "flex", flexDirection: "column", gap: 1,
                  background: `linear-gradient(135deg, ${hexA(p.color, 0.22)}, ${hexA(p.color, 0.10)})`,
                  border: `1px solid ${hexA(p.color, p.isMe ? 0.9 : 0.4)}`,
                  borderRadius: 6, padding: "3px 8px",
                  backdropFilter: "blur(4px)",
                  boxShadow: p.isMe ? `0 0 12px ${hexA(p.color, 0.5)}` : "none",
                  minWidth: 120,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {/* rank badge */}
                  <span style={{
                    fontSize: 9, fontWeight: 900, fontFamily: "ui-monospace, monospace",
                    color: p.color, opacity: 0.8, lineHeight: 1,
                    background: hexA(p.color, 0.15), padding: "1px 4px", borderRadius: 3,
                  }}>#{i + 1}</span>
                  <span className="race-glitch" style={{
                    fontSize: 10, fontWeight: 700, fontFamily: "ui-monospace, monospace",
                    color: p.isMe ? "#ffffff" : "#e0e8ff", letterSpacing: "0.06em",
                    textShadow: p.isMe ? `0 0 8px ${p.color}` : "none",
                  }}>{p.name}{p.isMe ? " ★" : ""}</span>
                  {/* rank-change arrow — glyph/color/pulse driven by the frame loop */}
                  <span
                    ref={(el) => { trendRefs.current[i] = el; }}
                    style={{
                      fontSize: 10, marginLeft: 2, lineHeight: 1, display: "inline-block",
                      color: "rgba(180,200,220,0.4)",
                    }}
                  >▬</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                  <CountUp value={p.totalTokens} style={{
                    fontSize: 13, fontWeight: 800, fontFamily: "var(--font-space-grotesk), monospace",
                    color: p.isMe ? "#ffffff" : hexA(p.color, 0.95),
                    fontVariantNumeric: "tabular-nums",
                  }} />
                  <span style={{ fontSize: 8, color: "rgba(180,200,220,0.5)", fontFamily: "ui-monospace, monospace" }}>tokens</span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Connection status badge */}
      <div style={{
        position: "absolute", top: 16, right: 16,
        display: "flex", alignItems: "center", gap: 6,
        background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 20, padding: "4px 10px",
        fontFamily: "ui-monospace, monospace", fontSize: 10,
        color: connected ? "#4ade80" : "#f87171",
        backdropFilter: "blur(6px)",
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? "#4ade80" : "#f87171", display: "inline-block", boxShadow: connected ? "0 0 6px #4ade80" : "none" }} />
        {connected ? `${players.length} racer${players.length !== 1 ? "s" : ""}` : "connecting…"}
      </div>

      {/* Me badge — hidden in spectator (projector) mode: there is no "me". */}
      {!spectator && (
        <div style={{
          position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.55)", border: `1px solid ${hexA(getColor(playerName), 0.5)}`,
          borderRadius: 20, padding: "4px 14px",
          fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700,
          color: getColor(playerName),
          backdropFilter: "blur(8px)",
          boxShadow: `0 0 12px ${hexA(getColor(playerName), 0.25)}`,
        }}>
          ★ {playerName} — <CountUp value={myTokens} style={{ fontVariantNumeric: "tabular-nums" }} /> tokens
        </div>
      )}

      {/* Exit button — hidden on a standalone projector screen (no onExit). */}
      {onExit && (
        <button
          onClick={onExit}
          style={{
            position: "absolute", top: 16, left: 16,
            background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 20, padding: "5px 14px",
            fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700,
            color: "rgba(255,255,255,0.55)", cursor: "pointer",
            backdropFilter: "blur(6px)",
            transition: "color 0.2s, border-color 0.2s",
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#fff"; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "rgba(255,255,255,0.55)"; }}
        >
          ← Exit
        </button>
      )}
    </div>
  );
}
