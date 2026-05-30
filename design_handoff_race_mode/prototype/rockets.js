/* ============================================================================
   ROCKETS  —  canvas rockets with multi-layer fuel-burning flame plumes
   ----------------------------------------------------------------------------
   Each rocket: metallic body + nozzle bell + fins, and a layered exhaust:
     heat-haze smoke · turbulent orange cone · yellow cone · white-hot core ·
     Mach (shock) diamonds · ejected sparks · nozzle bloom.
   Thrust scales the plume length/brightness. Drawn entirely on canvas so the
   flame and body stay perfectly fused.
   Exposes window.Rockets:
     setModels(models)            models = [{model,totalTokens,color}]
     layout(w,h,destX)
     frame(ctx,t)                 update + draw, returns [{model,x,y,color,...}]
   ========================================================================== */
(function () {
  "use strict";
  const rnd = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  let W = 0, H = 0, destX = 0;
  let models = [];
  let rockets = [];
  let sparks = [];
  let maxTokens = 1;

  function setModels(list) {
    models = list;
    maxTokens = Math.max(1, ...list.map((m) => m.totalTokens));
    const prev = new Map(rockets.map((r) => [r.model, r]));
    rockets = list.map((m, i) => {
      const old = prev.get(m.model);
      return {
        model: m.model,
        totalTokens: m.totalTokens,
        color: m.color,
        i,
        x: old ? old.x : 70,
        y: 0,
        seed: old ? old.seed : rnd(0, 1000),
        thrust: old ? old.thrust : 0,
        bob: old ? old.bob : rnd(0, TAU),
      };
    });
  }

  function layout(w, h, dx) {
    W = w; H = h; destX = dx;
  }

  // ── ejected spark particles ────────────────────────────────────────────────
  function emitSparks(x, y, color, thrust) {
    const n = Math.floor(1 + thrust * 4);
    for (let k = 0; k < n; k++) {
      sparks.push({
        x: x + rnd(-3, 3),
        y: y + rnd(-4, 4),
        vx: -rnd(3, 8 + thrust * 8),
        vy: rnd(-1.6, 1.6),
        life: rnd(10, 26),
        max: 26,
        size: rnd(1, 2.6),
        color: Math.random() > 0.55 ? "#ffffff" : color,
        kind: Math.random() > 0.7 ? "ember" : "spark",
      });
    }
    // occasional smoke puff
    if (Math.random() > 0.6) {
      sparks.push({
        x: x - rnd(6, 18), y: y + rnd(-4, 4),
        vx: -rnd(0.6, 2.2), vy: rnd(-0.6, 0.6),
        life: rnd(26, 54), max: 54,
        size: rnd(7, 16),
        color: "#1c1410", kind: "smoke",
      });
    }
  }

  function drawSparks(ctx) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.life--;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      const r = p.life / p.max;
      if (p.kind === "smoke") {
        ctx.globalAlpha = r * 0.22;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - r * 0.6), 0, TAU);
        ctx.fill();
      } else if (p.kind === "ember") {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = r;
        ctx.shadowBlur = 8; ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, p.size * r), 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = r * 0.95;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.4, p.size * r);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── THE FLAME PLUME ─────────────────────────────────────────────────────────
  // Drawn in local coords: nozzle exit at (0,0), plume extends toward -x.
  function drawFlame(ctx, thrust, color, t, seed) {
    const fl = 0.78 + Math.sin(t * 0.6 + seed) * 0.14 + Math.sin(t * 1.7 + seed * 2) * 0.08;
    const len = (54 + thrust * 150) * fl;          // plume length
    const wid = 7 + thrust * 7;                      // plume half-width at nozzle

    // wavy centerline offset for organic motion
    const sway = Math.sin(t * 0.9 + seed) * 2.2 * thrust;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // 1 ── heat-haze / outer billowing smoke-fire (dark orange, wide)
    ctx.globalAlpha = 0.5;
    const haze = ctx.createLinearGradient(0, 0, -len * 1.15, 0);
    haze.addColorStop(0, "rgba(255,120,30,0.55)");
    haze.addColorStop(0.4, "rgba(190,60,12,0.28)");
    haze.addColorStop(1, "rgba(60,20,6,0)");
    ctx.fillStyle = haze;
    plumeCone(ctx, len * 1.15, wid * 2.3, sway, t, seed, 0.5);

    // 2 ── main orange cone
    ctx.globalAlpha = 0.85;
    const orange = ctx.createLinearGradient(0, 0, -len, 0);
    orange.addColorStop(0, "rgba(255,180,60,0.95)");
    orange.addColorStop(0.35, "rgba(255,110,20,0.8)");
    orange.addColorStop(1, "rgba(150,40,10,0)");
    ctx.fillStyle = orange;
    plumeCone(ctx, len, wid * 1.55, sway, t, seed, 1);

    // 3 ── yellow inner cone
    ctx.globalAlpha = 0.95;
    const yellow = ctx.createLinearGradient(0, 0, -len * 0.7, 0);
    yellow.addColorStop(0, "rgba(255,244,200,1)");
    yellow.addColorStop(0.45, "rgba(255,210,90,0.9)");
    yellow.addColorStop(1, "rgba(255,140,30,0)");
    ctx.fillStyle = yellow;
    plumeCone(ctx, len * 0.7, wid * 1.0, sway, t, seed, 1.4);

    // 4 ── white-hot core streak (and a touch of the model color)
    const core = ctx.createLinearGradient(0, 0, -len * 0.42, 0);
    core.addColorStop(0, "rgba(255,255,255,1)");
    core.addColorStop(0.5, "rgba(220,240,255,0.85)");
    core.addColorStop(1, "rgba(180,210,255,0)");
    ctx.fillStyle = core;
    plumeCone(ctx, len * 0.42, wid * 0.5, sway * 0.5, t, seed, 2);

    // colored tint near the bell (model identity)
    ctx.globalAlpha = 0.6;
    const tint = ctx.createRadialGradient(-2, 0, 0, -2, 0, wid * 1.6);
    tint.addColorStop(0, color);
    tint.addColorStop(1, "transparent");
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.arc(-2, 0, wid * 1.6, 0, TAU);
    ctx.fill();

    // 5 ── Mach (shock) diamonds along the core axis
    ctx.globalAlpha = 0.9;
    const dCount = Math.floor(2 + thrust * 3);
    for (let d = 0; d < dCount; d++) {
      const dx = -(8 + d * (len * 0.12));
      if (-dx > len * 0.55) break;
      const ds = (wid * 0.42) * (1 - d * 0.13) * (0.8 + Math.sin(t * 2 + d + seed) * 0.2);
      const dg = ctx.createRadialGradient(dx, 0, 0, dx, 0, ds * 2);
      dg.addColorStop(0, "rgba(255,255,255,0.95)");
      dg.addColorStop(0.5, "rgba(180,220,255,0.5)");
      dg.addColorStop(1, "transparent");
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.ellipse(dx, 0, ds * 1.4, ds, 0, 0, TAU);
      ctx.fill();
    }

    // 6 ── nozzle exit bloom
    ctx.globalAlpha = 0.9;
    const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, wid * 2.2);
    bloom.addColorStop(0, "rgba(255,255,255,0.95)");
    bloom.addColorStop(0.4, "rgba(255,200,90,0.6)");
    bloom.addColorStop(1, "transparent");
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(0, 0, wid * 2.2, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  // wavy-edged cone from nozzle (0,0) extending to -length on x
  function plumeCone(ctx, length, halfW, sway, t, seed, freq) {
    const seg = 10;
    ctx.beginPath();
    ctx.moveTo(0, -halfW);
    // top edge
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const x = -u * length;
      const taper = (1 - u);
      const wob = Math.sin(t * 1.6 + u * 6 * freq + seed) * halfW * 0.22 * u;
      ctx.lineTo(x, -halfW * taper + wob + sway * u);
    }
    // tip
    ctx.lineTo(-length, sway);
    // bottom edge back
    for (let i = seg; i >= 0; i--) {
      const u = i / seg;
      const x = -u * length;
      const taper = (1 - u);
      const wob = Math.sin(t * 1.6 + u * 6 * freq + seed + 2) * halfW * 0.22 * u;
      ctx.lineTo(x, halfW * taper + wob + sway * u);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ── ROCKET BODY ─────────────────────────────────────────────────────────────
  // local coords: nozzle exit at (0,0); rocket points +x (right).
  function drawBody(ctx, color, t, seed) {
    // fins (drawn first, behind body)
    ctx.fillStyle = shade(color, -40);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    // top fin
    ctx.beginPath();
    ctx.moveTo(4, -10); ctx.lineTo(16, -19); ctx.lineTo(24, -10); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // bottom fin
    ctx.beginPath();
    ctx.moveTo(4, 10); ctx.lineTo(16, 19); ctx.lineTo(24, 10); ctx.closePath();
    ctx.fill(); ctx.stroke();

    // nozzle bell
    const bell = ctx.createLinearGradient(-7, 0, 6, 0);
    bell.addColorStop(0, "#2a2a30");
    bell.addColorStop(1, "#6a6a74");
    ctx.fillStyle = bell;
    ctx.beginPath();
    ctx.moveTo(6, -7); ctx.lineTo(-6, -10); ctx.lineTo(-6, 10); ctx.lineTo(6, 7); ctx.closePath();
    ctx.fill();

    // main fuselage (metallic cylinder)
    const body = ctx.createLinearGradient(0, -11, 0, 11);
    body.addColorStop(0, "#e8edf5");
    body.addColorStop(0.3, "#c2cad6");
    body.addColorStop(0.5, "#f4f7fb");
    body.addColorStop(0.7, "#aab2c0");
    body.addColorStop(1, "#767d8c");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(4, -11);
    ctx.lineTo(54, -11);
    ctx.quadraticCurveTo(78, -10, 84, 0);    // nosecone tip
    ctx.quadraticCurveTo(78, 10, 54, 11);
    ctx.lineTo(4, 11);
    ctx.quadraticCurveTo(0, 0, 4, -11);
    ctx.closePath();
    ctx.fill();

    // nosecone color cap
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(60, -10.2);
    ctx.quadraticCurveTo(78, -9.4, 84, 0);
    ctx.quadraticCurveTo(78, 9.4, 60, 10.2);
    ctx.quadraticCurveTo(64, 0, 60, -10.2);
    ctx.closePath();
    ctx.fill();

    // colored accent stripe
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(54, 0);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // cockpit window
    const win = ctx.createRadialGradient(46, -2, 0, 46, 0, 7);
    win.addColorStop(0, "#bdf0ff");
    win.addColorStop(0.6, "#3aa6e0");
    win.addColorStop(1, "#0a4a78");
    ctx.fillStyle = win;
    ctx.beginPath();
    ctx.ellipse(46, 0, 6.5, 5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // body running lights
    ctx.fillStyle = color;
    ctx.shadowBlur = 6; ctx.shadowColor = color;
    ctx.beginPath(); ctx.arc(24, -10, 1.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(24, 10, 1.6, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;

    // panel seams
    ctx.strokeStyle = "rgba(60,70,90,0.35)";
    ctx.lineWidth = 0.6;
    [20, 34, 48].forEach((px) => {
      ctx.beginPath(); ctx.moveTo(px, -10.5); ctx.lineTo(px, 10.5); ctx.stroke();
    });
  }

  function shade(hex, amt) {
    if (!hex || hex[0] !== "#") return hex || "#888";
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    const b = Math.max(0, Math.min(255, (n & 255) + amt));
    return `rgb(${r},${g},${b})`;
  }

  // ── FRAME ────────────────────────────────────────────────────────────────────
  function frame(ctx, t) {
    const n = rockets.length;
    if (!n) return [];
    // lanes padded so the top lane clears the HUD/exit and the bottom clears the edge
    const topPad = 84, botPad = 54;
    const usable = H - topPad - botPad;
    const laneAt = (i) => topPad + usable * ((i + 0.5) / n);
    const startX = 90;
    // keep the leader (and its ~150px label) clear of the right HUD / star
    const finishX = Math.min(destX - 110, W - 380);
    const out = [];

    // lane glow tracks
    rockets.forEach((r, i) => {
      const y = laneAt(i);
      ctx.globalAlpha = 0.05;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 34;
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(W, y);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    drawSparks(ctx);

    rockets.forEach((r, i) => {
      const target = startX + (r.totalTokens / maxTokens) * (finishX - startX);
      const prev = r.x;
      r.x += (target - r.x) * 0.045;
      const speed = Math.min(1, Math.abs(r.x - prev) / 2.2);
      // thrust eases toward speed, with idle minimum so flame always burns
      r.thrust += ((0.35 + speed * 0.65) - r.thrust) * 0.08;
      r.bob += 0.05;
      const baseY = laneAt(i);
      const y = baseY + Math.sin(r.bob) * 2.4;
      r.y = y;

      // emit sparks from nozzle
      if (Math.random() > 0.15) emitSparks(r.x - 6, y, r.color, r.thrust);

      ctx.save();
      ctx.translate(r.x, y);
      drawFlame(ctx, r.thrust, r.color, t, r.seed);
      drawBody(ctx, r.color, t, r.seed);
      ctx.restore();

      out.push({ model: r.model, x: r.x, y, color: r.color, totalTokens: r.totalTokens });
    });

    // cap sparks
    if (sparks.length > 1400) sparks = sparks.slice(-1400);
    return out;
  }

  window.Rockets = { setModels, layout, frame };
})();
