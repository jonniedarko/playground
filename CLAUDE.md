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

Add `data-run` to give a circuit figure Run/Step/Reset, live registers, the
executing line and a toggle per input terminal. Add `data-scope` for a rolling
`<scope-trace>` of its outputs. Without `data-run` a figure stays a still
illustration — that is the default.

Parts: `mc-4000` `mc-4000x` `mc-6000` `dx-300` `io-terminal` `p-100p14`
`p-200p14` `lc-70g04` `lc-70g08` `lc-70g32` `lc-70g86`.
**No component yet** — these keep their CSS `.pinout` markup until built:
MC4010, DT2415, C2S-RF901, FM Blaster, N4PB-8000, LX700, LX910C, D80C010-F,
KUJI-EK1, PGA33X6, NLP2. All are the same shape (a face plus pins, no code),
so a declarative factory beats a class each. Two need work first: a `nc` pin
type for N/C pins, and per-instance pin overrides like `io-terminal` has.
When one lands, swap its `.pinout` for a `.chip-figure` and add it to the
`catalogue` circuit.
`io-terminal` takes `label` / `type` / `side` and resolves its pin per
instance, so one part covers button, lamp, motor-N, trigger, output.

New part = add to `PART_META` in `parts.js`, then `bodyHTML` in
`components.js`. Copy `DX300`. Never redeclare pins in `components.js` —
one source or they drift.

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

## Gotchas — all cost real time already

- Raw HTML block in markdown **ends at a blank line**. Keep figures contiguous.
- Headerless table `| | |` emits no `<thead>` (empty one drew a grey strip).
- `inset` shorthand *after* `top` clobbers it. Killed the sticky sidebar.
- Inline `<code>` in tables gets `white-space: nowrap` so tokens don't split.
- A wrapped prose line starting `- ` becomes a list. Reword.
- Network is locked down: no npm, no PyPI. Stdlib only, both languages.
- Playwright is a system install at `/opt/node22/lib/node_modules`, not a dep.

## Manual images

`node scripts/extract-manual-images.mjs --pdf FILE` → `assets/img/shenzhen/`.
Pure-stdlib PDF parse + PNG encode in `scripts/lib/pdf_images.py`.

Scans are last resort — only artwork no component can draw. Some manual figures
are vector-only with no image to extract (iNK colour space, sector map,
neural lattice).
