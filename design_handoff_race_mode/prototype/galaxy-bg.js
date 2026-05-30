/* ============================================================================
   GALAXY BACKGROUND ENGINE  —  hyperreal deep-space renderer
   Milky Way band · nebulae · parallax star fields · constellations ·
   shooting stars · distant galaxies · planets · destination star
   ----------------------------------------------------------------------------
   Pure-canvas. No deps. Exposes window.GalaxyBG with:
     init(canvas)               -> sets up offscreen static layers
     resize(w,h,dpr)            -> rebuild
     drawDeep(ctx,t)            -> everything BEHIND the rockets
     drawFront(ctx,t)          -> meteors / front haze ABOVE the rockets
   ========================================================================== */
(function () {
  "use strict";

  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndi = (a, b) => Math.floor(rnd(a, b + 1));
  const TAU = Math.PI * 2;

  // ── tiny hex helpers ──────────────────────────────────────────────────────
  function shade(hex, amt) {
    if (hex[0] !== "#") return hex;
    let n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    const b = Math.max(0, Math.min(255, (n & 255) + amt));
    return `rgb(${r},${g},${b})`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  STATE
  // ─────────────────────────────────────────────────────────────────────────
  let W = 0, H = 0;
  let starsFar = [], starsMid = [], starsNear = [];
  let constellations = [];
  let nebulae = [];
  let galaxies = [];
  let planets = [];
  let meteors = [];
  let milkyway = null;
  let destStar = null;
  let staticCanvas = null;     // pre-rendered deep static layer (mw + nebula + far stars)
  let staticCtx = null;
  let needsStatic = true;

  // ── STAR ──────────────────────────────────────────────────────────────────
  // Realistic stellar colors weighted toward white/blue with warm minority
  const STAR_TINTS = [
    [201, 216, 255], [180, 200, 255], [255, 255, 255], [255, 250, 240],
    [255, 244, 214], [255, 224, 180], [255, 210, 161], [202, 226, 255],
  ];
  function makeStar(depth) {
    const tint = STAR_TINTS[rndi(0, STAR_TINTS.length - 1)];
    return {
      x: rnd(0, W), y: rnd(0, H),
      r: rnd(0.3, depth === 0 ? 1.0 : depth === 1 ? 1.7 : 2.6),
      tint,
      tw: rnd(0, TAU),
      twSpeed: rnd(0.008, 0.05),
      twAmt: rnd(0.25, 0.7),
    };
  }

  // ── CONSTELLATION ───────────────────────────────────────────────────────
  // A cluster of bright stars + faint connecting lines, drifting very slowly.
  function makeConstellation() {
    const cx = rnd(W * 0.05, W * 0.95);
    const cy = rnd(H * 0.05, H * 0.6);
    const n = rndi(4, 7);
    const nodes = [];
    let px = cx, py = cy;
    for (let i = 0; i < n; i++) {
      px += rnd(-90, 90);
      py += rnd(-70, 70);
      nodes.push({ x: px, y: py, r: rnd(1.1, 2.4), tw: rnd(0, TAU) });
    }
    // chain edges + a couple of cross links
    const edges = [];
    for (let i = 0; i < n - 1; i++) edges.push([i, i + 1]);
    if (n > 4) edges.push([0, rndi(2, n - 1)]);
    return {
      nodes, edges,
      vx: rnd(-0.05, 0.05), vy: rnd(-0.02, 0.02),
      hue: `hsl(${rndi(190, 220)}, 80%, 80%)`,
      alpha: rnd(0.5, 0.9),
    };
  }

  // ── NEBULA ──────────────────────────────────────────────────────────────
  // Layered soft clouds (emission red/pink, reflection blue, gold).
  const NEB_PALETTES = [
    ["#ff2d5e", "#7a1840", "#ff7aa8"],   // emission red/pink
    ["#2d6cff", "#16306e", "#7aa8ff"],   // reflection blue
    ["#9b3dff", "#3a1670", "#c98aff"],   // violet
    ["#13b3a0", "#0a4a44", "#5fe6d4"],   // teal
    ["#ffae3d", "#7a4a10", "#ffd58a"],   // gold
  ];
  function makeNebula() {
    const pal = NEB_PALETTES[rndi(0, NEB_PALETTES.length - 1)];
    const cx = rnd(0, W), cy = rnd(0, H);
    const blobs = [];
    const count = rndi(7, 12);
    const spread = rnd(W * 0.12, W * 0.28);
    for (let i = 0; i < count; i++) {
      blobs.push({
        dx: rnd(-spread, spread),
        dy: rnd(-spread * 0.7, spread * 0.7),
        r: rnd(spread * 0.4, spread * 1.1),
        c: pal[rndi(0, pal.length - 1)],
        a: rnd(0.05, 0.16),
      });
    }
    return { cx, cy, blobs };
  }

  // ── DISTANT GALAXY ────────────────────────────────────────────────────────
  function makeGalaxy() {
    return {
      x: rnd(0, W), y: rnd(0, H),
      r: rnd(26, 70),
      rot: rnd(0, TAU),
      tilt: rnd(0.28, 0.6),
      hue: rndi(195, 320),
      a: rnd(0.1, 0.22),
    };
  }

  // ── METEOR / SHOOTING STAR ─────────────────────────────────────────────────
  function spawnMeteor() {
    const fromTop = Math.random() > 0.4;
    const x = rnd(W * 0.2, W);
    const y = fromTop ? rnd(-40, H * 0.1) : rnd(0, H * 0.5);
    const ang = rnd(Math.PI * 0.72, Math.PI * 0.92); // down-left
    const speed = rnd(11, 20);
    return {
      x, y,
      vx: -Math.cos(ang) * speed, // travels left+down
      vy: Math.sin(ang) * speed,
      len: rnd(120, 320),
      life: 1,
      decay: rnd(0.006, 0.012),
      w: rnd(1.2, 2.6),
      tint: Math.random() > 0.7 ? [180, 220, 255] : [255, 240, 214],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  PLANETS  (parallax depth + distance label)
  // ─────────────────────────────────────────────────────────────────────────
  const PLANET_ARCH = [
    { t: "ice",    base: "#bfe3ff", mid: "#7fb2e0", dark: "#274e86", atmo: "#dff0ff", ring: "#bcdcff", hasRing: true,  ice: true,  crater: false, bands: ["#eaf6ff", "#a9cdef", "#d6eeff"] },
    { t: "gas",    base: "#c98a36", mid: "#e6ad52", dark: "#5e370a", atmo: "#ffd98a", ring: "#d8ab44", hasRing: true,  ice: false, crater: false, bands: ["#d68a2c", "#f0b455", "#a06018", "#eaa838", "#f8cf72"] },
    { t: "ocean",  base: "#0a3a6e", mid: "#1466b8", dark: "#04162e", atmo: "#4aacff", ring: "",        hasRing: false, ice: true,  crater: false, bands: ["#0a52a4", "#0c6ac4", "#073a82"] },
    { t: "violet", base: "#5a3aa8", mid: "#8a64d8", dark: "#241048", atmo: "#c99aff", ring: "#9c6cf0", hasRing: true,  ice: false, crater: false, bands: ["#5040a8", "#7a64cc", "#3c2c80"] },
    { t: "rust",   base: "#9c4a18", mid: "#d07a30", dark: "#3c1c06", atmo: "#ffae66", ring: "",        hasRing: false, ice: false, crater: true,  bands: ["#a85222", "#d07a34", "#7a3a10"] },
    { t: "dead",   base: "#3a3a40", mid: "#5a5a64", dark: "#121214", atmo: "#8a8a96", ring: "",        hasRing: false, ice: false, crater: true,  bands: ["#34343a", "#48484f", "#222226"] },
  ];

  function makePlanet(seedX) {
    const arch = PLANET_ARCH[rndi(0, PLANET_ARCH.length - 1)];
    const depth = Math.random();                  // 0 far .. 1 near
    const radius = 14 + depth * 64;
    const craters = arch.crater
      ? Array.from({ length: rndi(4, 9) }, () => {
          const a = rnd(0, TAU), d = rnd(0, 0.74);
          return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: rnd(0.05, 0.17) };
        })
      : [];
    // distance label scaled by depth: near = few light-years, far = millions
    const ly = depth > 0.5
      ? `${rnd(4, 90).toFixed(1)} ly`
      : depth > 0.2
        ? `${rnd(0.4, 9).toFixed(1)} kly`
        : `${rnd(1.2, 40).toFixed(1)} Mly`;
    return {
      x: seedX != null ? seedX : rnd(W * 0.2, W * 2.2),
      y: rnd(radius + 30, H - radius - 30),
      r: radius, depth, arch, craters,
      speed: 0.04 + (1 - depth) * 0.10 + depth * 0.16,
      rot: rnd(0, TAU),
      rotSpeed: rnd(0.0004, 0.0018) * (Math.random() > 0.5 ? 1 : -1),
      ringTilt: rnd(-0.5, 0.5),
      bandPhase: arch.bands.map(() => rnd(0, TAU)),
      label: ly,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  BUILD / RESIZE
  // ─────────────────────────────────────────────────────────────────────────
  function rebuild() {
    const area = (W * H) / (1920 * 1080);
    starsFar  = Array.from({ length: Math.round(260 * area) }, () => makeStar(0));
    starsMid  = Array.from({ length: Math.round(150 * area) }, () => makeStar(1));
    starsNear = Array.from({ length: Math.round(70  * area) }, () => makeStar(2));
    constellations = Array.from({ length: rndi(3, 5) }, makeConstellation);
    nebulae   = Array.from({ length: rndi(3, 4) }, makeNebula);
    galaxies  = Array.from({ length: rndi(4, 6) }, makeGalaxy);
    planets   = Array.from({ length: 5 }, (_, i) => makePlanet(rnd(-W * 0.2, W * 1.8) - i * W * 0.34));
    planets.sort((a, b) => a.depth - b.depth); // far first
    meteors = [];

    // Milky Way band — diagonal luminous river with dust lanes
    milkyway = {
      angle: rnd(-0.42, -0.30),
      cx: W * 0.55, cy: H * 0.42,
      width: H * rnd(0.5, 0.7),
      clusters: Array.from({ length: 240 }, () => ({
        u: rnd(-1.4, 1.4),     // along band
        v: rnd(-1, 1),         // across band (gaussian-ish via v^3 done at draw)
        r: rnd(0.4, 1.7),
        a: rnd(0.2, 0.9),
        tint: STAR_TINTS[rndi(0, STAR_TINTS.length - 1)],
      })),
      dust: Array.from({ length: 9 }, () => ({
        u: rnd(-1.2, 1.2), v: rnd(-0.5, 0.5),
        rx: rnd(W * 0.1, W * 0.3), ry: rnd(H * 0.02, H * 0.06),
        a: rnd(0.12, 0.3),
      })),
    };

    // Destination star (the goal the rockets race toward) — bright, on the right
    destStar = { x: W * 0.93, y: H * 0.5, r: Math.max(W, H) * 0.06, pulse: 0 };

    needsStatic = true;
  }

  function buildStatic() {
    if (!staticCanvas) {
      staticCanvas = document.createElement("canvas");
      staticCtx = staticCanvas.getContext("2d");
    }
    staticCanvas.width = W;
    staticCanvas.height = H;
    const c = staticCtx;
    c.clearRect(0, 0, W, H);

    // base deep-space gradient
    const bg = c.createLinearGradient(0, 0, W * 0.4, H);
    bg.addColorStop(0, "#03040a");
    bg.addColorStop(0.5, "#06081a");
    bg.addColorStop(1, "#02030b");
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);

    // Milky Way band
    drawMilkyWay(c);

    // Nebulae (soft, blended)
    c.globalCompositeOperation = "screen";
    nebulae.forEach((n) => {
      n.blobs.forEach((b) => {
        const g = c.createRadialGradient(n.cx + b.dx, n.cy + b.dy, 0, n.cx + b.dx, n.cy + b.dy, b.r);
        g.addColorStop(0, hexA(b.c, b.a));
        g.addColorStop(0.5, hexA(b.c, b.a * 0.4));
        g.addColorStop(1, hexA(b.c, 0));
        c.fillStyle = g;
        c.beginPath();
        c.arc(n.cx + b.dx, n.cy + b.dy, b.r, 0, TAU);
        c.fill();
      });
    });
    c.globalCompositeOperation = "source-over";

    // Far static stars baked in
    starsFar.forEach((s) => {
      c.globalAlpha = 0.5;
      c.fillStyle = `rgb(${s.tint[0]},${s.tint[1]},${s.tint[2]})`;
      c.beginPath();
      c.arc(s.x, s.y, s.r, 0, TAU);
      c.fill();
    });
    c.globalAlpha = 1;
    needsStatic = false;
  }

  function hexA(hex, a) {
    if (hex[0] !== "#") return hex;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function drawMilkyWay(c) {
    const m = milkyway;
    c.save();
    c.translate(m.cx, m.cy);
    c.rotate(m.angle);
    // soft luminous core glow of the band
    const half = m.width / 2;
    const band = c.createLinearGradient(0, -half, 0, half);
    band.addColorStop(0, "rgba(40,40,80,0)");
    band.addColorStop(0.38, "rgba(70,80,140,0.10)");
    band.addColorStop(0.5, "rgba(150,160,210,0.18)");
    band.addColorStop(0.62, "rgba(70,80,140,0.10)");
    band.addColorStop(1, "rgba(40,40,80,0)");
    c.fillStyle = band;
    c.fillRect(-W * 1.4, -half, W * 2.8, m.width);

    // warm galactic-center bloom near middle
    const bloom = c.createRadialGradient(0, 0, 0, 0, 0, W * 0.5);
    bloom.addColorStop(0, "rgba(255,228,170,0.10)");
    bloom.addColorStop(0.4, "rgba(180,150,110,0.05)");
    bloom.addColorStop(1, "transparent");
    c.globalCompositeOperation = "screen";
    c.fillStyle = bloom;
    c.fillRect(-W, -half, W * 2, m.width);

    // dense star clusters along the band
    m.clusters.forEach((cl) => {
      const x = cl.u * W * 0.7;
      const y = Math.pow(cl.v, 3) * half; // concentrate toward center
      c.globalAlpha = cl.a * 0.85;
      c.fillStyle = `rgb(${cl.tint[0]},${cl.tint[1]},${cl.tint[2]})`;
      c.beginPath();
      c.arc(x, y, cl.r, 0, TAU);
      c.fill();
    });
    c.globalAlpha = 1;

    // dark dust lanes cutting through (multiply)
    c.globalCompositeOperation = "source-over";
    m.dust.forEach((d) => {
      const x = d.u * W * 0.7, y = d.v * half;
      const g = c.createRadialGradient(x, y, 0, x, y, d.rx);
      g.addColorStop(0, `rgba(3,4,12,${d.a})`);
      g.addColorStop(1, "rgba(3,4,12,0)");
      c.save();
      c.translate(x, y);
      c.scale(1, d.ry / d.rx);
      c.translate(-x, -y);
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, d.rx, 0, TAU);
      c.fill();
      c.restore();
    });

    c.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  DYNAMIC DRAW HELPERS
  // ─────────────────────────────────────────────────────────────────────────
  function drawStarLayer(ctx, stars, speed, t, baseAlpha) {
    stars.forEach((s) => {
      s.x -= speed;
      if (s.x < -3) { s.x = W + 3; s.y = rnd(0, H); }
      s.tw += s.twSpeed;
      const tw = 1 - s.twAmt + Math.sin(s.tw) * s.twAmt;
      ctx.globalAlpha = baseAlpha * tw;
      ctx.fillStyle = `rgb(${s.tint[0]},${s.tint[1]},${s.tint[2]})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
      if (s.r > 1.5) {
        // diffraction spikes on bright stars
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

  function drawConstellations(ctx, t) {
    constellations.forEach((co) => {
      co.nodes.forEach((nd) => {
        nd.x += co.vx; nd.y += co.vy;
        if (nd.x < -50) nd.x += W + 100;
        if (nd.x > W + 50) nd.x -= W + 100;
      });
      // lines
      ctx.strokeStyle = co.hue;
      ctx.lineWidth = 0.7;
      ctx.globalAlpha = co.alpha * 0.22;
      ctx.beginPath();
      co.edges.forEach(([a, b]) => {
        ctx.moveTo(co.nodes[a].x, co.nodes[a].y);
        ctx.lineTo(co.nodes[b].x, co.nodes[b].y);
      });
      ctx.stroke();
      // nodes
      co.nodes.forEach((nd) => {
        nd.tw += 0.03;
        const tw = 0.7 + Math.sin(nd.tw) * 0.3;
        ctx.globalAlpha = co.alpha * tw;
        ctx.fillStyle = co.hue;
        ctx.shadowBlur = 8;
        ctx.shadowColor = co.hue;
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, nd.r, 0, TAU);
        ctx.fill();
      });
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;
  }

  function drawGalaxies(ctx, t) {
    galaxies.forEach((g) => {
      g.x -= 0.06; g.rot += 0.0004;
      if (g.x + g.r < -20) { g.x = W + g.r + rnd(0, W * 0.5); g.y = rnd(0, H); }
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.rot);
      ctx.scale(1, g.tilt);
      ctx.globalCompositeOperation = "screen";
      // core
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, g.r);
      core.addColorStop(0, `hsla(${g.hue},70%,85%,${g.a})`);
      core.addColorStop(0.25, `hsla(${g.hue},65%,70%,${g.a * 0.5})`);
      core.addColorStop(1, "transparent");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, g.r, 0, TAU);
      ctx.fill();
      // spiral arms (two faint sweeps)
      ctx.strokeStyle = `hsla(${g.hue},70%,82%,${g.a * 0.7})`;
      ctx.lineWidth = g.r * 0.10;
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

  function drawDestStar(ctx, t) {
    const d = destStar;
    d.pulse += 0.02;
    const breathe = 1 + Math.sin(d.pulse) * 0.05;
    const R = d.r * breathe;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    // vast outer bloom
    const outer = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, R * 6);
    outer.addColorStop(0, "rgba(255,210,130,0.30)");
    outer.addColorStop(0.18, "rgba(255,150,60,0.14)");
    outer.addColorStop(0.5, "rgba(200,90,30,0.05)");
    outer.addColorStop(1, "transparent");
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.arc(d.x, d.y, R * 6, 0, TAU);
    ctx.fill();
    // core
    const core = ctx.createRadialGradient(d.x - R * 0.15, d.y - R * 0.15, 0, d.x, d.y, R);
    core.addColorStop(0, "#fff6e6");
    core.addColorStop(0.4, "#ffd27a");
    core.addColorStop(0.75, "#ff9a3c");
    core.addColorStop(1, "#d4641a");
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(d.x, d.y, R, 0, TAU);
    ctx.fill();
    // long flare cross
    ctx.globalCompositeOperation = "screen";
    const flare = ctx.createLinearGradient(d.x - R * 9, d.y, d.x + R * 9, d.y);
    flare.addColorStop(0, "transparent");
    flare.addColorStop(0.5, "rgba(255,220,150,0.5)");
    flare.addColorStop(1, "transparent");
    ctx.fillStyle = flare;
    ctx.fillRect(d.x - R * 9, d.y - 1.2, R * 18, 2.4);
    ctx.fillRect(d.x - 1.2, d.y - R * 5, 2.4, R * 10);
    ctx.restore();
  }

  // ── PLANET RENDER ───────────────────────────────────────────────────────
  function drawPlanet(ctx, p, t) {
    const a = p.arch, r = p.r;
    ctx.save();
    ctx.translate(p.x, p.y);

    // atmosphere bloom
    const halo = ctx.createRadialGradient(0, 0, r * 0.85, 0, 0, r * 2.1);
    halo.addColorStop(0, hexA(a.atmo, 0.32));
    halo.addColorStop(0.45, hexA(a.glow || a.atmo, 0.12));
    halo.addColorStop(1, "transparent");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.1, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // back ring
    if (a.hasRing) drawRing(ctx, p, r, false);

    // sphere
    const lx = -r * 0.4, ly = -r * 0.4;
    const sph = ctx.createRadialGradient(lx, ly, r * 0.05, 0, 0, r * 1.1);
    sph.addColorStop(0, shade(a.mid, 60));
    sph.addColorStop(0.28, a.mid);
    sph.addColorStop(0.62, a.base);
    sph.addColorStop(0.9, a.dark);
    sph.addColorStop(1, "#000");
    ctx.fillStyle = sph;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();

    // surface bands clipped
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
    const rot = p.rot + t * p.rotSpeed;
    a.bands.forEach((bc, bi) => {
      const by = -r + (bi / a.bands.length) * r * 2;
      const wob = Math.sin(rot * 0.7 + bi * 1.3) * r * 0.07;
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = bc;
      ctx.beginPath();
      ctx.ellipse(wob, by, r * 1.1, r * 0.26, 0.04 * bi, 0, TAU);
      ctx.fill();
    });
    if (p.craters.length) {
      ctx.globalAlpha = 1;
      p.craters.forEach((c) => {
        ctx.beginPath();
        ctx.arc(c.x * r, c.y * r, c.r * r, 0, TAU);
        ctx.fillStyle = shade(a.base, -28);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(c.x * r - c.r * r * 0.2, c.y * r - c.r * r * 0.2, c.r * r * 0.5, 0, TAU);
        ctx.fillStyle = shade(a.mid, 18);
        ctx.globalAlpha = 0.5;
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    }
    if (a.ice) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = "#eef8ff";
      ctx.beginPath(); ctx.ellipse(0, -r * 0.74, r * 0.5, r * 0.22, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, r * 0.8, r * 0.38, r * 0.16, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // terminator shadow
    const sh = ctx.createRadialGradient(r * 0.4, r * 0.25, 0, r * 0.3, r * 0.2, r * 1.3);
    sh.addColorStop(0, "transparent");
    sh.addColorStop(0.5, "transparent");
    sh.addColorStop(0.78, "rgba(0,0,0,0.5)");
    sh.addColorStop(1, "rgba(0,0,0,0.88)");
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();

    // atmosphere rim
    const rim = ctx.createRadialGradient(0, 0, r * 0.82, 0, 0, r * 1.06);
    rim.addColorStop(0, "transparent");
    rim.addColorStop(0.62, hexA(a.atmo, 0.2));
    rim.addColorStop(1, hexA(a.atmo, 0.6));
    ctx.fillStyle = rim;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.06, 0, TAU); ctx.fill();

    // specular
    const sp = ctx.createRadialGradient(lx * 0.7, ly * 0.7, 0, lx * 0.7, ly * 0.7, r * 0.5);
    sp.addColorStop(0, "rgba(255,255,255,0.28)");
    sp.addColorStop(0.5, "rgba(255,255,255,0.05)");
    sp.addColorStop(1, "transparent");
    ctx.fillStyle = sp;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();

    // front ring
    if (a.hasRing) drawRing(ctx, p, r, true);

    // distance label for big/near planets
    if (r > 30) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "rgba(220,235,255,0.9)";
      ctx.font = "600 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(p.label, 0, r + 18);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawRing(ctx, p, r, front) {
    const a = p.arch;
    ctx.save();
    ctx.rotate(p.ringTilt);
    const g = ctx.createLinearGradient(-r * 2.2, 0, r * 2.2, 0);
    g.addColorStop(0, "transparent");
    g.addColorStop(0.2, hexA(a.ring, front ? 0.25 : 0.3));
    g.addColorStop(0.5, hexA(a.ring, front ? 0.92 : 0.78));
    g.addColorStop(0.8, hexA(a.ring, front ? 0.25 : 0.3));
    g.addColorStop(1, "transparent");
    ctx.strokeStyle = g;
    ctx.lineWidth = r * 0.26;
    ctx.beginPath();
    if (front) ctx.ellipse(0, 0, r * 2.05, r * 0.42, 0, Math.PI * 1.04, Math.PI * 1.96);
    else ctx.ellipse(0, 0, r * 2.05, r * 0.42, 0, Math.PI * 0.04, Math.PI * 0.96);
    ctx.stroke();
    ctx.lineWidth = r * 0.1;
    ctx.strokeStyle = hexA(a.ring, 0.4);
    ctx.beginPath();
    if (front) ctx.ellipse(0, 0, r * 2.5, r * 0.5, 0, Math.PI * 1.04, Math.PI * 1.96);
    else ctx.ellipse(0, 0, r * 2.5, r * 0.5, 0, Math.PI * 0.04, Math.PI * 0.96);
    ctx.stroke();
    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  PUBLIC
  // ─────────────────────────────────────────────────────────────────────────
  function resize(w, h) {
    W = w; H = h;
    rebuild();
  }

  // everything BEHIND the rockets
  function drawDeep(ctx, t) {
    if (needsStatic) buildStatic();
    // baked static layer (mw, nebula, far stars)
    ctx.drawImage(staticCanvas, 0, 0, W, H);

    drawGalaxies(ctx, t);
    drawConstellations(ctx, t);

    drawStarLayer(ctx, starsMid, 0.18, t, 0.7);
    drawStarLayer(ctx, starsNear, 0.5, t, 0.95);

    drawDestStar(ctx, t);

    // planets sorted far->near; near ones move faster (parallax)
    planets.forEach((p) => {
      p.x -= p.speed;
      p.rot += p.rotSpeed;
      if (p.x + p.r * 2.6 < 0) {
        const np = makePlanet(W + p.r * 2.6 + rnd(0, W));
        Object.assign(p, np);
      }
      drawPlanet(ctx, p, t);
    });
  }

  // meteors / front haze ABOVE the rockets
  function drawFront(ctx, t) {
    // spawn meteors occasionally
    if (Math.random() < 0.012 && meteors.length < 4) meteors.push(spawnMeteor());
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.x += m.vx; m.y += m.vy; m.life -= m.decay;
      if (m.life <= 0 || m.x < -m.len || m.y > H + m.len) { meteors.splice(i, 1); continue; }
      const tx = m.x - (m.vx / Math.hypot(m.vx, m.vy)) * m.len;
      const ty = m.y - (m.vy / Math.hypot(m.vx, m.vy)) * m.len;
      const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      const [r, gg, b] = m.tint;
      g.addColorStop(0, `rgba(${r},${gg},${b},${m.life})`);
      g.addColorStop(0.3, `rgba(${r},${gg},${b},${m.life * 0.4})`);
      g.addColorStop(1, "transparent");
      ctx.strokeStyle = g;
      ctx.lineWidth = m.w;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty);
      ctx.stroke();
      // bright head
      ctx.globalCompositeOperation = "screen";
      const hg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.w * 4);
      hg.addColorStop(0, `rgba(255,255,255,${m.life})`);
      hg.addColorStop(1, "transparent");
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.w * 4, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }

    // subtle vignette to focus center
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "transparent");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  window.GalaxyBG = { resize, drawDeep, drawFront, get destX() { return destStar ? destStar.x : W; } };
})();
