# playground

Two unrelated things in one repo:

- `site/` — **Field Notes**, zero-dep static docs generator. Active work.
- everything else — untouched Next.js/Supabase starter. Ignore unless asked.

Site excluded from starter tooling via `.eslintignore`, `.prettierignore`.

## Commands — run in `site/`

| cmd | does |
| --- | --- |
| `npm run build` | markdown → `dist/` |
| `npm run serve` | build + serve on :4321 |
| `npm run check` | **hard gate.** unrendered md, unbalanced tags, dead links/anchors, img alt |
| `npm test` | `node:test` units. no deps |
| `npm run test:browser` | Playwright sweep 320/390px. skips clean if absent |
| `npm run ship` | build + replace `pages` branch + push |

Gate before any commit: `npm run check && npm test`.

## Layout

```
site/
  build.mjs           generator + dev server. exports buildSite, OUT_DIR, BASE
  lib/markdown.mjs    renderer. no deps
  assets/             copied verbatim to dist/assets
  content/            markdown source
  scripts/            check, browser-test, deploy, extract-manual-images
  test/               node:test
  dist/               output. gitignored
```

## Content rules

Folder = section (needs `index.md`). File = page. Nests any depth.

Front matter — **flat scalars only**, no arrays:

| key | use |
| --- | --- |
| `title` | falls back to title-cased filename |
| `description` | lede + meta + search snippet |
| `order` | sidebar position. unset sorts last |
| `icon` | emoji, sidebar + cards |
| `board` | `true` loads the shenzhen component module on that page |
| `wide` | `true` drops the measure + TOC gutter. workspace pages only |

Internal links root-relative (`/shenzhen-io/…`) so `BASE_PATH` applies.
Nav, breadcrumbs, prev/next, search index all derive from folder tree.
No registration step.

## Components

`site/assets/shenzhen/` — ES modules, no deps.

| file | is |
| --- | --- |
| `components.js` | parts + board. defines custom elements on import |
| `embed.js` | only entry point a page loads. upgrades both figure kinds |
| `circuits.js` | named reference circuits as data: parts, code, wires |
| `parts.js` | pin/meta data, no DOM. components.js **and** sim.js read it |
| `sim.js` | MCxxxx interpreter. no DOM, tested under plain node |
| `ide.js` | the workbench. lazy-imported by embed.js only where `.ide` exists |

Figure markup in content — **must be contiguous**, blank line ends a raw HTML
block. Static `.pinout` inside is the no-JS fallback, replaced on boot:

```html
<div class="chip-figure" data-part="mc-4000" aria-label="...">
...static pinout markup...
</div>
```

`data-cell` overrides grid px. `data-code` overrides sample program; empty
string = bare chip. Page needs `board: true`.

Whole circuit — definition lives in `circuits.js`, content stays a one-liner:

```html
<div class="circuit-figure" data-circuit="an650">
<p>prose fallback</p>
</div>
```

Wire endpoint = `"<part index>:<pin name>"`. Wiring runs on the next frame
(pins must be laid out first) and publishes `data-wires` when done.

Routing (`routeAvoiding`) treats every part as an obstacle and picks the
nearest free horizontal lane, recording it so the next wire picks another.
`redrawWires` routes the whole set in one pass — that shared lane list is the
only thing stopping two wires landing on the same run, so never route one wire
alone. `embed.js` offsets parts one cell in from every edge; the top and bottom
margins are the lanes. Traces are green (`RIBBON`), not grey.
Browser test asserts: no wire through a part, no two sharing a horizontal run,
none outside the board. **Verticals can still cross another wire's lane** —
avoiding a component is guaranteed, a fully planar layout is not.

Add `data-run` to give a circuit figure Run/Step/Reset, live registers, the
executing line and a toggle per input terminal. Add `data-scope` for a rolling
`<scope-trace>` of its outputs. Without `data-run` a figure stays a still
illustration — that is the default.

**Every part in the manual now has a component.** 22 tags.

Behaviour — a class each: `mc-4000` `mc-4000x` `mc-6000` (SzMcu) `dx-300`
`io-terminal` `p-100p14` `p-200p14` (SzMemory) `lc-70g04/08/32/86` (SzGate).

Face plus pins, no code — built from `PART_META` by `definePart`, listed in
`FIXED_PARTS`: `mc-4010` `dt-2415` `c2s-rf901` `fm-blaster` `n4pb-8000`
`lx-700` `lx-910c` `d80c010-f` `kuji-ek1` `pga-33x6` `nlp-2`. Adding one is a
`PART_META` entry plus its tag in `FIXED_PARTS` — no class.
**These draw and wire but do not run.** The sim treats them as inert.

Pin types: `xbus` `simple` `nc`. An `nc` pin is drawn (the manual draws them)
but is inert: no tap target, and `tryConnect` refuses it.

`io-terminal` takes `label` / `type` / `side` and resolves its pin per
instance, so one part covers button, lamp, motor-N, trigger, output.

New part = add to `PART_META` in `parts.js`. If it has no behaviour, add the
tag to `FIXED_PARTS` and stop. If it does, write a class with `bodyHTML` —
copy `DX300`. Never redeclare pins in `components.js` — one source or they
drift. **A custom element name must contain a hyphen** (`lx-700`, not
`lx700`): the registry throws mid-module and every part on the page silently
stays a fallback. `definePart` checks this now.

## Workbench

`/shenzhen-io/ide/`. Page is `board: true` + `wide: true`, body holds one
`<div class="ide">` whose contents are the no-JS fallback.

`ide.js` assembles what already exists — `circuit-board` places/drags/wires,
`Machine` runs — and adds the touch affordances neither has:

- **on-screen Delete.** the board's own delete is the Delete key. no keyboard on a phone.
- **zoom −/+** instead of a range input. sliders are the one control worse with a thumb.
- **panel capped to `100dvh`**, palette top / board middle / bars bottom. that cap
  is what keeps controls in thumb reach — a sticky bar instead floats over the
  palette while the panel is half on screen. `dvh` so the keyboard shrinks it.
- **modal editor in `dvh`**, reached by `⤢`, which is `opacity:0` until hover on
  a pointer device and forced visible under `@media (hover:none)`.

`specFromBoard()` converts live board state to the circuits.js shape `Machine`
takes. `board.toJSON()` carries `label`/`type`/`side` — drop them and a saved
`io-terminal` comes back with the wrong pin and loses its wires.
Board is saved to `localStorage` on every edit; `addPart(tag,x,y,attrs)` sets
shaping attributes *before* connect, because `io-terminal` reads them on render.

`tryConnect` holds the pin-type check; `connect` is the trusted path used by
circuits.js and `load`. Wire user gestures to `tryConnect`.

Wiring is a board-level drag that reports nothing back, so the machine is
rebuilt whenever `signature()` (tags + labels + code + wire pairs, **not**
positions) changes. Don't try to catch each edit with a listener. Changing the
circuit therefore restarts the run — moving a part does not.

`freeSpot` leaves a cell between parts. Flush parts overlap each other's 44px
pin hit areas and a wire drag then starts and ends on the same pin.

`circuit-board` has **no intrinsic size** — parts are absolutely positioned — so
a board outside `upgradeCircuit` needs an explicit canvas. `.ide-board` sets one
in `--cell` units.

## Simulator

`new Machine(spec)` where spec is a `circuits.js` entry. `setInput(label, v)`,
`advance()` one time unit, `run(n)`, `output(label)`, `snapshot()`.

- Conditional flag is **tri-state** (`none`/`true`/`false`). `tcp` on equality
  disables both `+` and `-`; that is what makes it three-way.
- `@` runs only on the first pass.
- Program wraps last line → first.
- XBus is a rendezvous. Both sides blocked = `deadlock`. Blocked while others
  sleep = `stalled` (not provably fatal, but the symptom players hit).
- A chip that never sleeps trips an instruction budget and sets `error`.
- Reading a simple I/O pin drops whatever it was driving.

**Prefer a live component over an image. Always.**

## Build stamp

`gitStamp()` in `build.mjs` exports `STAMP` — sha, short, iso, subject, dirty,
GitHub commit url. Date is `git log -1` over `site/`, not the clock, so editing
the unrelated starter does not move it. No git → no stamp, no crash.

Rendered by `renderStamp(where)` into the top bar and the footer. The bar shows
the shortest form that fits and grows: `.stamp-brief` (`3h`, `2d`, `08-31`)
below 27rem, the full date from 27rem, the clock from 34rem, the sha from
46rem. Footer always spells it out.

Below **22rem** the bar is 33px short — measured — so `.brand-text` drops to
the FN mark. The mark still links home and the `aria-label` still says the
name. **The stamp does not drop; the wordmark does.** An earlier version had
that backwards and the stamp vanished on a phone.

**"2 hours ago" is computed in `app.js`, not at build time** — the pages are
static, so a baked phrase would still say it a month later. Under a week it
swaps the date for a relative phrase and hides `.stamp-time`; a week or more
stays as the built date. The absolute time stays in the `aria-label` either
way. Clock skew is clamped, so a client running behind never reads a future
date. Browser test fakes `Date.now` to cover the switch in both directions.

## Deploy

`pages` branch = built output only, nothing else. `ship` replaces contents,
commits on top, fast-forward push. Never force.

Live at **jonnie.io/playground/** — custom domain sits on the *user* site
(`jonniedarko.github.io`), project pages inherit it as `jonnie.io/<repo>/`.
So `BASE_PATH` stays `/playground`; deploy derives it from the git remote.

No `CNAME` on this repo's `pages` branch, and there must not be one — that
would claim the domain root for this repo. `deploy.mjs` preserves `CNAME` if
one ever appears, since the deploy replaces branch contents wholesale.

CI: `.github/workflows/deploy-docs.yml`, fires on push to `main` touching
`site/`. Site source currently lives on a feature branch, so CI has not run yet.

## Mobile is a requirement

Base CSS = phone. Media queries add desktop. Not the reverse.

- Tap targets ≥ 44px.
- **No hover on touch.** Never hide an affordance behind `:hover` alone.
  Bit us twice: `.copy-btn`, and the POC's `.expand`.
- Verify at 320px, not just 390px.
- Components read `--sz-*` tokens from `style.css` (custom properties inherit
  into shadow DOM). Both schemes must define every token — a token added to
  one side only falls back to the dark literal and lands dark-on-light. The
  browser test measures contrast in both schemes, but it cannot read through a
  gradient, so it skips those rather than guessing.
- Pointer coords are viewport-relative and Playwright's `click` auto-scrolls.
  Re-scroll and re-measure immediately before a synthetic drag, or it silently
  lands off-screen and the assertion "passes".
- Browser test drives the workbench under touch at both widths: place, drag,
  wire, reject a mismatched pin, delete without a keyboard, open the larger
  editor without a hover, step the clock, survive a reload. Every control it
  finds must clear 44px in **both** axes.

## Gotchas — all cost real time already

- Raw HTML block in markdown **ends at a blank line**. Keep figures contiguous.
- Headerless table `| | |` emits no `<thead>` (empty one drew a grey strip).
- `inset` shorthand *after* `top` clobbers it. Killed the sticky sidebar.
- Inline `<code>` in tables gets `white-space: nowrap` so tokens don't split.
- A wrapped prose line starting `- ` becomes a list. Reword.
- A class-level `display` outranks the UA rule for `[hidden]`. Bit the modal:
  it rendered open on load while `.hidden` still read `true`, so assert
  computed `display`, never the attribute.
- Floating `.toc` needs `.content`'s 15rem gutter. `wide` removes it, so the
  TOC goes inline there or the page scrolls sideways.
- `preserveAspectRatio="none"` scales x and y by different factors. Fine for a
  waveform, wrong for lettering — it left `scope-trace`'s row labels 3x too
  wide. Draw text-bearing SVG at real pixel size (`scope-trace` tracks its own
  width with a ResizeObserver). DX300's face keeps `none` legitimately: its
  60x100 viewBox matches its 3x5 footprint, so both axes scale the same.
- SVG presentation attributes (`fill="..."`) do resolve `var()` in Chromium,
  but support is not universal. Colour SVG from CSS classes instead.
- Network is locked down: no npm, no PyPI. Stdlib only, both languages.
- Playwright is a system install at `/opt/node22/lib/node_modules`, not a dep.

## Manual images

`node scripts/extract-manual-images.mjs --pdf FILE` → `assets/img/shenzhen/`.
Pure-stdlib PDF parse + PNG encode in `scripts/lib/pdf_images.py`.

Scans are last resort — only artwork no component can draw. Some manual figures
are vector-only with no image to extract (iNK colour space, sector map,
neural lattice).
