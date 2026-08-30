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

Internal links root-relative (`/shenzhen-io/…`) so `BASE_PATH` applies.
Nav, breadcrumbs, prev/next, search index all derive from folder tree.
No registration step.

## Deploy

`pages` branch = built output only, nothing else. `ship` replaces contents,
commits on top, fast-forward push. Never force.

**Still off:** Settings → Pages → Deploy from a branch → `pages` → `/ (root)`.
Nothing serves until set.

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

**Prefer a live component over an image. Always.** Scans are last resort — only
artwork no component can draw. Some manual figures are vector-only and have no
image to extract at all (iNK colour space, sector map, neural lattice).
