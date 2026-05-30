# Handoff: Race Mode — Galaxy (ModelRace)

## Overview
Race Mode is a full-screen, hyper-real "rocket race" visualization for the token dashboard.
Each tracked model is a rocket burning fuel across a deep-space scene; the further a rocket
has flown toward the destination star on the right, the more total tokens that model has used.
It replaces the previous, less impressive `ModelRace.tsx`.

The look-and-feel goal stated by the product owner (verbatim intent):
- **Full screen** when Race Mode is on.
- **Everything animated, smooth, and surreal.**
- **Rockets shoot real fire** — like a spaceship burning fuel to launch.
- **Background = a real galaxy**: Milky Way band, constellations, meteors/shooting stars,
  distant galaxies, and planets ranging from a few light-years to millions of light-years away.

## About the Design Files
Unlike a typical design handoff, **the main file in this bundle is production-ready code**, not
just a visual reference. `ModelRace.tsx` is written in the dashboard's own stack
(**React + TypeScript + Tailwind, Next.js client component**) and is intended to be **dropped
straight in** to replace the existing `components/ModelRace.tsx`.

The `prototype/` folder (plain HTML + two vanilla JS engines) is the **reference prototype** used
to design and verify the visuals. It is NOT meant to ship — it exists so you can open
`prototype/race-mode.html` in a browser and see exactly how the final animation should look and
move. The logic in those JS files was ported 1:1 into the TSX component.

## Fidelity
**High-fidelity (hifi).** Final colors, motion, and composition. The canvas rendering is
identical between the prototype and the TSX component (same engine code, same constants). Recreate
nothing — integrate the provided component.

## Tech / Rendering approach
- Single full-viewport `<canvas>` renders the entire scene (background + rockets + flames) so the
  flame and rocket body stay perfectly fused and composited with `globalCompositeOperation`.
- Static, expensive layers (Milky Way band, nebulae, far stars) are **pre-rendered once** to an
  offscreen canvas (`buildStatic()`), then blitted each frame — cheap. Dynamic layers
  (parallax stars, constellations, galaxies, planets, destination star, rockets, flames, sparks,
  meteors, vignette) are drawn live.
- Model **labels are HTML/JSX** (not canvas) positioned over the canvas via `transform:
  translate3d(...)` updated each frame from the rocket positions — keeps text crisp and themeable.
- Animation runs on a single `requestAnimationFrame` loop with a fixed `t += 1/60` time step.
- DPR-aware: canvas backing store scaled by `min(devicePixelRatio, 2)`.

## The Scene (top → bottom of z-order)
1. **Deep-space gradient** background (`#03040a → #06081a → #02030b`).
2. **Milky Way band** — a diagonal luminous river (angle ≈ −0.30…−0.42 rad) with a warm galactic-
   core bloom, ~240 dense star clusters concentrated toward the centerline, and 9 dark dust lanes.
3. **Nebulae** — 3–4 multi-blob soft clouds, `screen`-blended. Palettes: emission red/pink,
   reflection blue, violet, teal, gold.
4. **Far stars** — ~260 (scaled by area) baked into the static layer.
5. **Distant galaxies** — 4–6 spiral galaxies (core radial gradient + two spiral-arm sweeps),
   slowly rotating and drifting left.
6. **Constellations** — 3–5 clusters of 4–7 bright nodes with faint connecting lines, twinkling,
   drifting very slowly.
7. **Parallax star layers** — mid (~150, speed 0.18) and near (~70, speed 0.5) twinkling stars;
   bright ones get diffraction spikes.
8. **Destination star** — large pulsing sun on the right (`x = 93% W`, `r = 6% of max(W,H)`) with a
   vast outer bloom and a long flare cross. This is the finish line the rockets race toward.
9. **Planets** — 5 at a time, sorted far→near, each parallax-scrolling left and recycling off-screen.
   Six archetypes: ice, gas giant, ocean, violet, rust, dead/moon. Features: atmosphere halo,
   lit sphere with terminator shadow, rotating surface bands, polar ice caps, craters, optional
   rings (front+back halves), specular highlight, atmospheric rim. Planets with `r > 30` show a
   **distance label**: `"<n> ly"` (near), `"<n> kly"` (mid), `"<n> Mly"` (far).
10. **Rockets + flames + sparks** (see below).
11. **Meteors / shooting stars** — up to 4 at once, streak down-left with a bright head + tapering
    tail, spawned probabilistically.
12. **Vignette** — radial darkening to focus the center.

## Rockets
- One rocket per model, top 7 by `totalTokens`, laid out in evenly spaced horizontal lanes
  (`topPad = 84`, `botPad = 54` keep lanes clear of the HUD and the bottom edge).
- Horizontal position eases toward a target: `target = startX + (tokens/maxTokens) * (finishX - startX)`,
  with `startX = 90` and `finishX = min(destX - 110, W - 380)` (keeps the leader's label on-screen,
  clear of the exit button / destination star).
- Each rocket gently bobs vertically (`sin(bob)`).
- **Body**: metallic fuselage gradient, colored nosecone cap + accent stripe in the model's color,
  cockpit window, running lights, panel seams, two fins, a nozzle bell.
- **Flame plume** (drawn in `lighter` blend, layered from outer to inner):
  1. heat-haze / billowing smoke-fire (wide, dark orange)
  2. main turbulent orange cone
  3. yellow inner cone
  4. white-hot core streak
  5. a radial tint of the **model's color** near the bell (identity)
  6. **Mach (shock) diamonds** along the core axis (2–5 depending on thrust)
  7. nozzle-exit bloom
  - Plume length/width scale with **thrust**, which eases toward `0.35 + speed*0.65` (so the flame
    always burns at idle, and roars when the rocket is moving fast). Organic motion via layered
    `sin()` flicker + a wavy centerline sway.
- **Sparks**: ejected each frame from the nozzle — fast streak sparks, glowing embers (`lighter` +
  shadow), and slow dark smoke puffs. Particle pool capped at 1400.

## Component API
```ts
interface RaceModelStat { model: string; totalTokens: number; }
interface ModelRaceProps {
  data: RaceModelStat[];
  onExit?: () => void;   // called on Esc key or the ✕ Exit Race button
}
export default function ModelRace(props: ModelRaceProps): JSX.Element
```
- The component renders a `fixed inset-0 z-[70]` full-screen overlay — it owns the whole viewport.
- It locks `document.body` scroll while mounted and restores it on unmount.
- **Esc** key and the **✕ Exit Race** button both call `onExit`.
- Top-left HUD: pulsing dot + "Model Race · Token Velocity".

## Integration — exact changes to `app/page.tsx`
The current code wraps `<ModelRace>` in a constrained `min-h-150` container and does NOT pass an
exit handler. Because the new component is full-screen and self-contained, simplify the call site:

**Current (around line 680):**
```tsx
{isRaceMode ? (
  <div className="flex-1 w-full flex flex-col min-h-150">
    <ErrorBoundary>
      <ModelRace data={modelStats.map(m => ({ model: m.model, totalTokens: m.totalTokens }))} />
    </ErrorBoundary>
  </div>
) : (
  <>
    {/* …dashboard… */}
  </>
)}
```

**Replace with:**
```tsx
{isRaceMode && (
  <ErrorBoundary>
    <ModelRace
      data={modelStats.map(m => ({ model: m.model, totalTokens: m.totalTokens }))}
      onExit={() => setIsRaceMode(false)}
    />
  </ErrorBoundary>
)}
{!isRaceMode && (
  <>
    {/* …dashboard (the existing else-branch content)… */}
  </>
)}
```
Notes:
- Keep the existing `dynamic(() => import("@/components/ModelRace"), { ssr: false })` import — the
  component is canvas/`window`-based and must stay client-only. The `dynamic` generic type already
  matches `{ model, totalTokens }[]`; you may extend it with the optional `onExit` prop.
- The Race Mode toggle button (line ~668, `setIsRaceMode(!isRaceMode)`) needs no change.
- No new dependencies. Tailwind classes used are already in the project's vocabulary.

## Design Tokens
- **Per-model rocket colors** (index order, top 7): `#10b981` emerald, `#a855f7` purple,
  `#f97316` orange, `#06b6d4` cyan, `#f43f5e` rose, `#3b82f6` blue, `#eab308` amber.
- **Space background**: `#03040a`, `#06081a`, `#02030b`.
- **Destination star**: core `#fff6e6 → #ffd27a → #ff9a3c → #d4641a`.
- **Flame**: white `#ffffff` core → yellow `rgba(255,244,200)` → orange `rgba(255,110,20)` →
  haze `rgba(190,60,12)`.
- **Label chip**: `linear-gradient(135deg, <color>26, <color>0d)`, border `rgba(255,255,255,0.1)`,
  `box-shadow: 0 0 18px <color>33, inset 0 1px 0 rgba(255,255,255,0.08)`, `backdrop-filter: blur(8px)`.
- **Typography**: monospace stack (`ui-monospace, "SF Mono", Menlo`). Label model name 9px / 700 /
  uppercase / `0.18em`; token value 17px / 900 / tabular-nums; HUD title 12px / 900 / `0.34em`.

## Assets
None required. The entire scene is procedurally rendered on canvas. No images, fonts, or icons are
imported. (If you later want each label to show the model's tool icon from `/public/*.png`, that's a
straightforward addition to the label JSX — not currently included.)

## Files in this bundle
- `ModelRace.tsx` — **the drop-in replacement** for `components/ModelRace.tsx`.
- `prototype/race-mode.html` — open in a browser to see the exact intended animation.
- `prototype/galaxy-bg.js` — reference background engine (ported into the TSX).
- `prototype/rockets.js` — reference rocket/flame engine (ported into the TSX).

## Acceptance check
Open `prototype/race-mode.html` in a browser; the integrated component must look and move identically:
full-screen galaxy, smooth multi-layer rocket flames with shock diamonds and sparks, drifting
planets with distance labels, twinkling parallax stars, occasional shooting stars, a pulsing
destination star, model labels tracking each rocket, and a working Esc / ✕ Exit.
