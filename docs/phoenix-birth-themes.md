# Phoenix birth themes (5-theme randomized spawn)

Covers the CW Email Request tab's decorative background Phoenix — specifically the **birth/formation animation** that runs before each Phoenix hands off to its flight controller. For the flight controller itself (free-range post-hatch movement, lifespan, despawn, up-to-5-concurrent population), the underlying markup/CSS/JS location, and the full prior history of this feature, see the `phoenix-background-animation` memory and the inline comments in `public/index.html`'s phoenix IIFE (search `#era_phoenix_bg`) — this doc only covers the theme system layered on top of that on 2026-08-27.

All of it lives in `public/index.html` (this feature predates/lives outside the `npm run build`/`src/app.js` pipeline — see [pitfall #11](pitfalls.md)), inside the same IIFE as the flight controller, in the `#emailRequestAttachmentsEmbedView` tab's own `<style>`/markup/`<script>` blocks.

## What changed and why

Per Huy's spec: instead of always running the same lightning→ashes→egg→hatch sequence, every spawned Phoenix now randomly picks **one of 5 visually distinct birth themes**, each with its own formation shape, particles, and color, before handing off to the **unchanged** flight controller (side-confined birth spot via `pickSideSpawn`, free-range flight via `pickFreeTarget`, 20s spawn interval, 5-Phoenix max, independent lifespans/despawn — none of that changed).

## The 5 themes

| Theme | Key | Formation shape | Phoenix color |
|---|---|---|---|
| Magic Portal | `"portal"` | Ring (`.era-phoenix-portal`) that fades in, then "charges" (pulsing glow + 8 lightning strikes fired at random points around its rim + outward particle bursts), then dissolves | Random, from the original `ERA_PHOENIX_HATCH_COLORS` 8-color palette |
| Shadow / Dark | `"shadow"` | Dark orb (`.era-phoenix-shadow-orb`) that grows while dark smoke puffs swirl inward and converge, then pulses ("energy concentrates") | Fixed dark purple (`hue-rotate(255deg)` + `brightness(.6) saturate(1.4)`) |
| Rock / Stone | `"rock"` | Rock blob (`.era-phoenix-rock`) that trembles while a branching crack (`.era-phoenix-rock-crack`) spreads/deepens over 1.3s, then breaks apart into gray/brown debris | Fixed gold (`hue-rotate(46deg)` + `saturate(1.15)`) |
| Cloud Mist | `"cloud"` | White/blue blurred mist puffs converge, a soft cloud mass (`.era-phoenix-cloud-mass`) fades in and holds briefly, then dissipates as the Phoenix appears on top | Fixed baby blue (`hue-rotate(196deg)` + `saturate(.8) brightness(1.05)`) |
| Ice / Cryogenic | `"ice"` | Ice block (`.era-phoenix-ice-block`) forms with the Phoenix already faintly visible inside (dim, small, heavily icy-filtered) and holds ("frozen"), then a crack (`.era-phoenix-ice-crack`) spreads over 1.3s while vapor wisps rise, then the block breaks into icy-white debris | Fixed icy cyan (`hue-rotate(189deg)` + `saturate(.9) brightness(1.1)`) |

`pickTheme()` never repeats the immediately-preceding theme (loops until it draws a different one) — with 5 themes this is a cheap, always-terminating rejection sample, not a fixed rotation, so the *sequence* still looks random, just never back-to-back-identical.

## Architecture

- **Templates**: one hidden clone template per theme lives as a sibling inside the static `#era_phoenix_bg` markup (same pattern the pre-existing `.era-phoenix-ashes`/`.era-phoenix-egg` pair already used) — `.era-phoenix-portal`, `.era-phoenix-shadow-orb`, `.era-phoenix-rock` (with a nested `.era-phoenix-rock-crack`), `.era-phoenix-cloud-mass`, `.era-phoenix-ice-block` (with a nested `.era-phoenix-ice-crack`). All `display:none` until cloned.
- **`spawnPhoenix()`** picks a theme via `pickTheme()`, clones *only* that theme's template into `formEl`, positions it at the same `pickSideSpawn()` point the flight/img will use, and calls that theme's birth function: `birthPortal` / `birthShadow` / `birthRock` / `birthCloud` / `birthIce`.
- Each birth function is a self-contained `setTimeout`-driven stage timeline (same style as the original single-sequence code) that toggles CSS state classes (`era-phoenix-show` / `era-phoenix-charge` / `era-phoenix-shake` / `era-phoenix-thaw` / `era-phoenix-hide`) on its own `formEl`, spawns particles, and finishes by calling the shared `popInPhoenix(state, img, pos, durationMs, onDone)` helper — the same ease-out-back scale-up pop-in the original egg-hatch used, now factored out so every theme reuses one reveal motion instead of 5 near-duplicates.
- `onDone`/`onReveal` calls back into `spawnPhoenix()`'s own `beginFlight()`, which is unchanged: fades the img to its normal flight opacity, hides/removes `formEl`, measures the real rendered size, and calls `startFreeFlight(state)`.
- **Watchdog**: unchanged in spirit from the original single-sequence version, just keyed by theme now — `ERA_THEME_TOTAL_MS[theme]` gives each theme's own expected total duration (portal 4200ms, shadow 3300ms, rock 3000ms, cloud 2600ms, ice 3700ms), and the watchdog's rAF loop calls `beginFlight()` early if `Date.now() - birthStart` exceeds that plus a 3000ms margin — so a theme that gets stuck (backgrounded tab throttling a `setTimeout`, etc.) still recovers into flight instead of freezing forever.
- **Shared/generalized particle helpers** (all in the same IIFE, used across multiple themes instead of one-off per theme):
  - `spawnEmber`/`spawnEmberBurst` — now take an optional `colors` param (`{c1,c2,c3,glow}`) instead of always fire-orange; existing flight-trail embers don't pass it and keep the original look via CSS fallback values.
  - `spawnShellShards` — same optional-colors treatment, reused for Rock's rubble and Ice's shards, not just the original egg-hatch shell pieces.
  - `spawnParticlesOut(cx, cy, count, opts)` — **new**, generic radial outward burst (`.era-phoenix-particle-out`, reuses the thunderstorm sparks' rotate+translateX trick but as its own class/keyframe) for Portal's electrified-rim particles and Shadow's "energy concentrates" flash.
  - `spawnSwirlPuffs(cx, cy, count, totalMs, opts)` — **new**, generic inward-converging puff (`.era-phoenix-swirl-puff`, reuses the existing `era-sand-grain-swirl` keyframe/custom-properties the original sand-swirl grains already used) for Shadow's smoke and Cloud's mist.
  - `spawnVapor(cx, cy, count)` — **new**, rising/fading wisp (`.era-phoenix-vapor`) for Ice's thaw stage.

## If something looks off

- **A theme looks stuck/frozen**: check `ERA_THEME_TOTAL_MS` for that theme against its birth function's actual `setTimeout` offsets — if you lengthen/shorten a stage, update the matching total or the watchdog will fire either too early (visibly cutting the animation short) or too late (a genuinely stuck phoenix sits frozen longer than necessary before recovering).
- **A theme's Phoenix color looks wrong**: check `pickHatchColor()` — each non-portal theme returns a fixed `{hue, glow, extra}`; `extra` is appended filter functions (brightness/saturate) layered on top of the `hue-rotate()+drop-shadow()` the original single-color system used, needed because a plain hue-rotate alone reads as washed-out on `phoenix-fire-bg.png`'s baked-in orange for the darker/cooler themes.
- **New/off-looking particles**: `spawnParticlesOut`/`spawnSwirlPuffs` both reuse existing keyframes (`era-particle-out-fly`, `era-sand-grain-swirl`) purely via CSS custom properties set inline per spawned `<span>` — if a color/size looks wrong, check the `opts` object passed at each call site in `birthPortal`/`birthShadow`/`birthCloud`, not the keyframes themselves (those are shared and already used correctly by other callers).
- **Same theme running twice in a row**: `eraLastTheme` is a module-scoped `let` inside the phoenix IIFE — confirm nothing else in this IIFE reassigns it, and that `pickTheme()` is only ever called from `spawnPhoenix()`.

**Verified:** `node --check`-equivalent (extracted the real script block via a `vm.Script` parse, since this file has many prose mentions of literal `<script>`/`</script>` in comments that break a naive regex extraction — only the actual `#emailRequestAttachmentsEmbedView` IIFE block was checked, and it parsed clean) confirms no syntax errors. **Not yet visually confirmed in a real compositing browser** — per the `phoenix-background-animation` memory, this session's Browser pane has historically failed to composite frames for this tab's rAF-driven animations, so if a theme looks visually wrong (wrong colors, elements not appearing, stuck at one frame), get a real browser or the deployed site before assuming the code is broken.
