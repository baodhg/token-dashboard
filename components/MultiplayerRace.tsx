"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { getRocketConfig } from "@/lib/rocket-config";
import { drawFlame, drawCyberCruiser, drawCyberUFO, drawCyberJet, drawCyberInterceptor, drawNeonSpeeder, drawCyberDrone, shade, hexA } from "@/lib/rocket-renderer";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PlayerStat {
  name: string;
  totalTokens: number;
  /** USD spent in the race window. null when the server/reporter didn't send it. */
  totalCost?: number | null;
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

// ── Procedural Web Audio Engine ───────────────────────────────────────────────
class AudioEngine {
  ctx: AudioContext | null = null;
  muted = true;
  bgmNodes: any[] = [];

  init() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) this.ctx = new AudioContextClass();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    this.muted = false;
  }

  toggle() {
    if (this.muted) {
      this.init();
      this.playBgm();
    } else {
      this.muted = true;
      this.stopBgm();
    }
    return !this.muted;
  }

  playBgm() {
    if (this.muted || !this.ctx || this.bgmNodes.length) return;
    const t = this.ctx.currentTime;
    
    // Deep drone / engine hum
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 65.41; // C2
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    
    const lfo = this.ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.2; // Slow sweep
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 200;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    
    const gain = this.ctx.createGain();
    gain.gain.value = 0.05; // Quiet background drone
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(t);
    lfo.start(t);
    
    this.bgmNodes = [osc, lfo, gain, filter];
  }
  
  stopBgm() {
    this.bgmNodes.forEach(n => {
      try { if (n.stop) n.stop(); } catch {}
      try { n.disconnect(); } catch {}
    });
    this.bgmNodes = [];
  }

  playCoin() {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.setValueAtTime(1600, t + 0.05);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.15, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    osc.start(t); osc.stop(t + 0.35);
  }

  playOvertake() {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(3000, t + 0.3);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.8);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
    noise.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
    noise.start(t); noise.stop(t + 0.8);
  }

  playSurge() {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 0.65);
  }
}
export const sfx = new AudioEngine();

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


function fmt(v: number): string {
  return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M`
    : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K`
    : `${Math.round(v)}`;
}

// USD: cents below $100, whole dollars above (keeps the small badge tidy).
function fmtCost(v: number): string {
  return v >= 100 ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`;
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
      s.tw += s.twSpeed; 
      s.x -= drift;
      if (s.x < -4) s.x = W + 4;
      const [r, g, b] = s.tint;
      const tw = brightness * (1 - s.twAmt * Math.abs(Math.sin(s.tw)));
      ctx.globalAlpha = tw;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath(); 
      ctx.arc(s.x, s.y, s.r, 0, TAU); 
      ctx.fill();
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
  let globalShake = 0;
  let globalWarp = 0;

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
      if (p.kind === "ring") { // Overtake Shockwave
        p.life--;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        const prog = 1 - p.life / p.max;
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = (1 - prog) * 0.9;
        ctx.strokeStyle = p.color; ctx.lineWidth = 2 + (1 - prog) * 5;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, prog * 180, prog * 60, 0, 0, TAU); ctx.stroke();
        ctx.restore();
        continue;
      }
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




  return {
    setPlayers(list: Array<{ name: string; totalTokens: number; color: string; isMe: boolean; totalCost?: number | null }>) {
      const newMax = Math.max(1, ...list.map((p) => p.totalTokens));
      const prev = new Map(rockets.map((r: any) => [r.name, r]));
      rockets = list.map((p, i) => {
        const old = prev.get(p.name);
        const prevTokens = old ? old.totalTokens : p.totalTokens;
        const gained = p.totalTokens - prevTokens;
        const grew = !!old && gained >= SURGE_MIN_TOKENS;
        // Cost delta for the same surge. null when either side has no cost (old
        // rows / reporters that don't send it) so no "+$" is shown.
        const curCost = typeof p.totalCost === "number" ? p.totalCost : null;
        const prevCost = old && typeof old.cost === "number" ? old.cost : null;
        const costGain = grew && curCost != null && prevCost != null ? Math.max(0, curCost - prevCost) : 0;
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
          x: old ? old.x : 70, y: old && old.y !== undefined ? old.y : null,
          tilt: old ? old.tilt || 0 : 0,
          seed: old ? old.seed : rnd(0, 1000),
          thrust: old ? old.thrust : 0,
          burn: old ? (old.burn || 0) : 0,
          bob: old ? old.bob : rnd(0, TAU),
          burstTimer, burstStart: grew, gain: grew ? gained : 0,
          cost: curCost, costGain,
          rank: i, prevRank: old ? old.rank : i,
          trend, trendUntil,
          boomTimer: old ? (old.boomTimer || 0) : 0,
        };
      });
      maxTokens = newMax;
    },
    getShake() { return globalShake; },
    getWarp()  { return globalWarp; },
    layout(w: number, h: number) { W = w; H = h; },
    frame(ctx: CanvasRenderingContext2D, t: number) {
      clock = t;
      if (globalShake > 0.1) globalShake *= 0.85; else globalShake = 0;
      if (globalWarp > 0.01) globalWarp *= 0.94; else globalWarp = 0;
      
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
        // Rising edge of a surge, captured before the one-shot block below
        // consumes r.burstStart. The HUD uses it to fire the badge pop/shine.
        const surgeStart = r.burstStart === true;
        const cruise = 0.35 + pixelSpeed * 0.65;
        r.thrust = cruise + (1.0 - cruise) * burstIntensity;
        r.bob += 0.05;
        
        const targetY = laneAt(i) + Math.sin(r.bob) * 2.4;
        if (r.y === null || r.y === undefined) r.y = targetY;
        const prevY = r.y;
        r.y += (targetY - r.y) * 0.12;
        const vy = r.y - prevY;
        const targetTilt = Math.max(-0.25, Math.min(0.25, vy * 0.05));
        r.tilt += (targetTilt - r.tilt) * 0.2;
        const y = r.y;

        const sparkThreshold = 0.15 - burstIntensity * 0.12;
        if (Math.random() > sparkThreshold) emitSparks(r.x - 6, y, r.color, r.thrust);
        if (r.burstStart) {
          r.burstStart = false;
          
          if (r.gain > 1000) {
            globalShake = Math.min(globalShake + 8, 20);
            globalWarp = Math.min(globalWarp + 0.6, 1);
            sfx.playSurge();
          } else if (r.gain > 100) {
            globalShake = Math.min(globalShake + 4, 12);
            globalWarp = Math.min(globalWarp + 0.3, 0.8);
            if (r.gain > 500) sfx.playSurge();
          }

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
          sfx.playOvertake();
          // Overtake Shockwave Ring
          sparks.push({ x: r.x, y, vx: 0, vy: 0, life: 35, max: 35, size: 0, color: r.color, kind: "ring" });
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
        
        // ── Wingtip Trails (High speed only) ──────────────────────────────────
        if (burstIntensity > 0.3 || globalWarp > 0.2) {
          ctx.save();
          const R = r.isMe ? 30 : 24;
          ctx.scale(R / 22, R / 22);
          ctx.rotate(r.tilt);
          const intensity = Math.max(burstIntensity, globalWarp);
          const trail = ctx.createLinearGradient(0, 0, -40 - intensity * 60, 0);
          trail.addColorStop(0, hexA(r.color, 0.8 * intensity));
          trail.addColorStop(1, "transparent");
          ctx.strokeStyle = trail; ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(8, -27); ctx.lineTo(-40 - intensity * 60, -27 + rnd(-1, 1));
          ctx.moveTo(8, 27); ctx.lineTo(-40 - intensity * 60, 27 + rnd(-1, 1));
          ctx.stroke();
          ctx.restore();
        }

        const cfg = typeof window !== "undefined" && r.isMe ? getRocketConfig() : null;
        const color = (cfg && cfg.selectedColor) ? cfg.selectedColor : r.color;
        const skin = (cfg && cfg.selectedSkin) ? cfg.selectedSkin : 'default';
        const flameColor = (cfg && cfg.flameColor) ? cfg.flameColor : null;

        drawFlame(ctx, r.thrust, color, flameColor, t, r.seed, boost);

        if (skin === 'ufo') {
           drawCyberUFO(ctx, color, r.thrust, t, t*2.5, 64);
        } else if (skin === 'plane') {
           drawCyberJet(ctx, color, r.thrust);
        } else if (skin === 'interceptor') {
           drawCyberInterceptor(ctx, color, r.isMe, r.tilt);
        } else if (skin === 'speeder') {
           drawNeonSpeeder(ctx, color, r.thrust);
        } else if (skin === 'drone') {
           drawCyberDrone(ctx, color, t);
        } else {
           drawCyberCruiser(ctx, color, r.isMe, r.tilt);
        }
        ctx.restore();
        // Trend flashes only while inside its hold window, then settles to "same".
        const trendActive = r.trend !== "same" && clock < r.trendUntil;
        if (!trendActive && r.trend !== "same") r.trend = "same";
        out.push({ name: r.name, x: r.x, y, color: r.color, totalTokens: r.totalTokens,
          isMe: r.isMe, trend: r.trend, trendActive, boost, surgeStart, gain: r.gain, costGain: r.costGain });
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

// Punch the badge the instant a player's number jumps: a quick scale +
// brightness pop on the whole card, plus a light sweep that streaks across it.
// Uses the Web Animations API so it composes with the per-frame transform on the
// outer label and self-cleans — no timers to track. The sustained green glow is
// handled separately by --surge (see frame loop / globals.css).
function fireSurge(card: HTMLDivElement | null) {
  if (!card) return;
  card.animate(
    [
      { transform: "scale(1)",    filter: "brightness(1)" },
      { transform: "scale(1.13)", filter: "brightness(1.7) saturate(1.3)" },
      { transform: "scale(1)",    filter: "brightness(1)" },
    ],
    { duration: 520, easing: "cubic-bezier(.2,.9,.25,1)" }
  );
  const shine = card.querySelector(".race-mp-shine") as HTMLElement | null;
  shine?.animate(
    [
      { transform: "translateX(-140%) skewX(-18deg)", opacity: 0 },
      { transform: "translateX(-30%) skewX(-18deg)",  opacity: 1, offset: 0.5 },
      { transform: "translateX(140%) skewX(-18deg)",  opacity: 0 },
    ],
    { duration: 640, easing: "ease-out" }
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function MultiplayerRace({ serverUrl, playerName, myTokens, onExit, spectator = false }: MultiplayerRaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const trendRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const galaxyRef = useRef<ReturnType<typeof createGalaxy> | null>(null);
  const engineRef = useRef<ReturnType<typeof createPlayerRockets> | null>(null);
  const animRef = useRef(0);

  const [connected, setConnected] = useState(false);
  const [players, setPlayers] = useState<PlayerStat[]>([]);
  // Floating "+N" gain popups — one spawned per number jump (surge), drifts up
  // and fades. Self-removed on animation end; capped to avoid runaway growth.
  const [floats, setFloats] = useState<Array<{ id: number; amount: number; cost: number | null; x: number; y: number }>>([]);
  const floatId = useRef(0);
  const [soundEnabled, setSoundEnabled] = useState(false);

  // Stable color per player name
  const colorMap = useRef(new Map<string, string>());
  const getColor = useCallback((name: string) => {
    if (!colorMap.current.has(name)) colorMap.current.set(name, nameColor(name));
    return colorMap.current.get(name)!;
  }, []);

  // Memoize ranked player list with colors. Match "me" case-insensitively:
  // the server stores display-cased names while playerName comes from .env.
  const rankedPlayers = useMemo(() => {
    const meKey = (playerName || "").trim().toLowerCase();
    return [...players]
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, 10)
      .map((p) => ({
        ...p,
        color: getColor(p.name),
        isMe: meKey !== "" && p.name.trim().toLowerCase() === meKey,
      }));
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
      
      // ── Apply Camera Shake ──────────────────────────────────────────────────
      const shake = engineRef.current?.getShake?.() || 0;
      const warp = engineRef.current?.getWarp?.() || 0;
      cx.save();
      if (shake > 0.5) cx.translate(rnd(-shake, shake), rnd(-shake, shake));
      
      galaxyRef.current!.draw(cx);
      const positions = engineRef.current!.frame(cx, t);
      cx.restore();
      
      t += 0.016;

      // Update HUD labels + rank-change arrows
      positions.forEach((p: any, i: number) => {
        const el = labelRefs.current[i];
        if (el) {
          el.style.transform = `translate(${p.x + 76}px, ${p.y - 22}px)`;
          el.style.opacity = "1";
          // Drive the badge's green afterburner aura: intensity tracks the
          // plasma boost, so the card glows and fades in exact lockstep with the
          // rocket's flame. Inherited by the card's overlays via this CSS var.
          el.style.setProperty("--surge", (p.boost ?? 0).toFixed(3));
        }
        // The instant a new number lands, punch the card (pop + light sweep)
        // and float a "+N" showing exactly how much it jumped.
        if (p.surgeStart) {
          fireSurge(cardRefs.current[i]);
          if (p.gain > 0) {
            const id = floatId.current++;
            const fx = p.x + 110, fy = p.y - 30;
            // Only attach a "+$" line once the delta rounds to at least a cent.
            const cost = p.costGain >= 0.01 ? p.costGain : null;
            if (cost !== null) sfx.playCoin();
            setFloats((fs) => [...fs.slice(-12), { id, amount: p.gain, cost, x: fx, y: fy }]);
          }
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
        if (el) { el.style.opacity = "0"; el.style.setProperty("--surge", "0"); }
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
                ref={(el) => { cardRefs.current[i] = el; }}
                className="race-mp-card"
                style={{
                  position: "relative", isolation: "isolate",
                  background: `linear-gradient(135deg, ${hexA(p.color, 0.22)}, ${hexA(p.color, 0.10)})`,
                  border: `1px solid ${hexA(p.color, p.isMe ? 0.9 : 0.4)}`,
                  borderRadius: 6, padding: "3px 8px",
                  backdropFilter: "blur(4px)",
                  boxShadow: p.isMe ? `0 0 12px ${hexA(p.color, 0.5)}` : "none",
                  minWidth: 120,
                }}
              >
                {/* Green afterburner aura — opacity = --surge (the plasma boost) */}
                <span className="race-mp-aura" aria-hidden={true} />
                {/* Clipped light sweep, fired by fireSurge() on a new number */}
                <span className="race-mp-shineclip" aria-hidden={true}>
                  <span className="race-mp-shine" />
                </span>

                {/* Content sits above the overlays */}
                <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", gap: 1 }}>
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
                    <CountUp value={p.totalTokens} className="race-mp-num" style={{
                      fontSize: 13, fontWeight: 800, fontFamily: "var(--font-space-grotesk), monospace",
                      color: p.isMe ? "#ffffff" : hexA(p.color, 0.95),
                      fontVariantNumeric: "tabular-nums",
                    }} />
                    <span style={{ fontSize: 8, color: "rgba(180,200,220,0.5)", fontFamily: "ui-monospace, monospace" }}>tokens</span>
                    {p.totalCost != null && (
                      <span className="race-mp-cost" style={{
                        marginLeft: 5, fontSize: 11, fontWeight: 800,
                        color: "rgba(74,222,128,0.95)",
                        fontFamily: "var(--font-space-grotesk), ui-monospace, monospace",
                        fontVariantNumeric: "tabular-nums",
                      }}>{fmtCost(p.totalCost)}</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Floating "+N" gain popups — how much each racer just jumped */}
      {floats.map((f) => (
        <div
          key={f.id}
          style={{
            position: "absolute", top: 0, left: 0,
            transform: `translate(${f.x}px, ${f.y}px)`,
            pointerEvents: "none", zIndex: 6,
          }}
        >
          <div
            className="race-mp-gain"
            onAnimationEnd={() => setFloats((fs) => fs.filter((x) => x.id !== f.id))}
          >
            <span className="race-mp-gain-tok">+{fmt(f.amount)}</span>
            {f.cost != null && <span className="race-mp-gain-cost">+{fmtCost(f.cost)}</span>}
          </div>
        </div>
      ))}

      {/* Top Right Controls: Sound Toggle & Connection Status */}
      <div style={{
        position: "absolute", top: 16, right: 16,
        display: "flex", alignItems: "center", gap: 8, zIndex: 80,
      }}>
        {/* Sound Toggle */}
        <button
          onClick={() => setSoundEnabled(sfx.toggle())}
          style={{
            background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 20, padding: "4px 10px",
            fontFamily: "ui-monospace, monospace", fontSize: 12,
            color: soundEnabled ? "#4ade80" : "rgba(255,255,255,0.4)",
            cursor: "pointer", backdropFilter: "blur(6px)",
            transition: "all 0.2s",
          }}
          title={soundEnabled ? "Mute Sounds" : "Enable Sounds (Requires Click)"}
        >
          {soundEnabled ? "🔊" : "🔇"}
        </button>

        {/* Connection status badge */}
        <div style={{
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
