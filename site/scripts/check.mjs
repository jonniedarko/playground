#!/usr/bin/env node
/**
 * Static validation of the built site.
 *
 * Builds into dist/, then walks the output asserting the things that have
 * actually broken here before: markdown that failed to render, unbalanced
 * markup, links pointing at routes that were never built, anchors that do not
 * exist on the page they point at, and images without alt text.
 *
 * Exits non-zero on the first failing category so it can gate a release.
 *
 *   node scripts/check.mjs
 *   BASE_PATH=/playground node scripts/check.mjs
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSite, OUT_DIR, BASE } from '../build.mjs'
import { PART_META } from '../assets/shenzhen/parts.js'
import CIRCUITS from '../assets/shenzhen/circuits.js'
import {
  registeredTags, auditParts, auditCircuits, auditFigures,
} from './lib/parts-audit.mjs'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/** Everything markdown should have consumed. If it survives to the output, the renderer missed it. */
const UNRENDERED = [
  [/```/g, 'code fence'],
  [/\|\s*-{3,}/g, 'table delimiter row'],
  [/\[!(NOTE|TIP|WARNING|SPEC)\]/g, 'callout tag'],
  [/(?<!\w)\*\*[^*\n]+\*\*/g, 'bold marker'],
  [/^\s*#{1,6}\s/gm, 'heading marker'],
  [/\[[^\]\n]{1,60}\]\([^)\s]+\)/g, 'link syntax'],
  [/\ue000/g, 'inline-code placeholder'],
]

const BALANCED = [
  ['<table', '</table>', 'table'],
  ['<thead>', '</thead>', 'thead'],
  ['<tbody>', '</tbody>', 'tbody'],
]

async function walk(dir) {
  const out = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(abs)))
    else out.push(abs)
  }
  return out
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

async function main() {
  await buildSite({ quiet: true })

  const files = (await walk(OUT_DIR)).filter((f) => f.endsWith('.html'))
  const rel = (f) => path.relative(OUT_DIR, f)

  // Routes and assets that actually exist in the output.
  const routes = new Set()
  const assets = new Set()
  for (const f of await walk(OUT_DIR)) {
    const r = path.relative(OUT_DIR, f).split(path.sep).join('/')
    if (r.endsWith('index.html')) {
      const dir = r.slice(0, -'index.html'.length)
      routes.add(BASE + '/' + dir)
    }
    assets.add(BASE + '/' + r)
  }

  // Anchor ids per route, for cross-page fragment links.
  const idsByRoute = new Map()
  for (const f of files) {
    const r = path.relative(OUT_DIR, f).split(path.sep).join('/')
    if (!r.endsWith('index.html')) continue
    const route = BASE + '/' + r.slice(0, -'index.html'.length)
    const html = await fs.readFile(f, 'utf8')
    idsByRoute.set(route, new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1])))
  }

  const problems = []
  const add = (file, kind, detail) => problems.push({ file: rel(file), kind, detail })

  for (const file of files) {
    const html = await fs.readFile(file, 'utf8')
    // A wide page carries `doc doc-wide`, so match the class list, not a string.
    const article = /<article class="doc(?: [^"]*)?">([\s\S]*?)<\/article>/.exec(html)
    if (!article) {
      add(file, 'structure', 'no <article class="doc"> in page')
      continue
    }
    const body = article[1]
    const text = stripTags(body)

    for (const [re, label] of UNRENDERED) {
      const hit = text.match(re)
      if (hit) add(file, 'unrendered markdown', `${label}: ${JSON.stringify(hit[0].slice(0, 50))}`)
    }

    for (const [open, close, label] of BALANCED) {
      const a = body.split(open).length - 1
      const b = body.split(close).length - 1
      if (a !== b) add(file, 'unbalanced markup', `${label}: ${a} open, ${b} close`)
    }
    const lists = (body.split('<ul>').length - 1) + (body.split('<ol>').length - 1)
    const listEnds = (body.split('</ul>').length - 1) + (body.split('</ol>').length - 1)
    if (lists !== listEnds) add(file, 'unbalanced markup', `list: ${lists} open, ${listEnds} close`)

    // Images must resolve and carry alt text.
    for (const m of body.matchAll(/<img\s[^>]*>/g)) {
      const tag = m[0]
      const src = /src="([^"]*)"/.exec(tag)?.[1]
      const alt = /alt="([^"]*)"/.exec(tag)?.[1]
      if (!src) add(file, 'image', 'img with no src')
      else if (!/^(https?:)?\/\//.test(src) && !assets.has(src.split('#')[0])) {
        add(file, 'image', `src does not resolve: ${src}`)
      }
      if (alt === undefined || alt.trim() === '') add(file, 'image', `missing alt text: ${src || tag}`)
    }

    // Internal links: route or asset must exist, and any fragment must exist on it.
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const href = m[1]
      if (href.startsWith('#') || /^(https?:)?\/\//.test(href) || href.startsWith('mailto:')) continue
      const [withFrag, frag] = href.split('#')
      // A query string (the puzzle pages' own `?puzzle=<key>` workbench
      // links, Task 13.2) selects behaviour on an already-built page - it is
      // never itself a route or asset, so it plays no part in whether the
      // link resolves. Stripped here the same way the fragment already is.
      const base = withFrag.split('?')[0]
      if (!routes.has(base) && !assets.has(base)) {
        add(file, 'broken link', href)
        continue
      }
      if (frag && idsByRoute.has(base) && !idsByRoute.get(base).has(frag)) {
        add(file, 'broken anchor', href)
      }
    }
  }

  // ---- the component catalogue, the circuits, and the figures ----
  // These need no browser, and until now none of them was caught without one.
  const componentsSource = await fs.readFile(
    path.join(ROOT, 'assets/shenzhen/components.js'), 'utf8')
  const tags = registeredTags(componentsSource)

  // Not every custom element is a part: the board and the scope are chrome.
  const NOT_PARTS = ['circuit-board', 'scope-trace']

  const contentFiles = (await walk(path.join(ROOT, 'content'))).filter((f) => f.endsWith('.md'))
  const sources = await Promise.all(contentFiles.map(async (f) => ({
    file: path.relative(ROOT, f),
    text: await fs.readFile(f, 'utf8'),
  })))

  for (const detail of auditParts({ meta: PART_META, tags, ignore: NOT_PARTS })) {
    problems.push({ file: 'assets/shenzhen/parts.js', kind: 'part catalogue', detail })
  }
  for (const detail of auditCircuits({ circuits: CIRCUITS, meta: PART_META })) {
    problems.push({ file: 'assets/shenzhen/circuits.js', kind: 'circuit wiring', detail })
  }
  for (const detail of auditFigures({ sources, tags, circuits: CIRCUITS })) {
    problems.push({ file: detail.split(':')[0], kind: 'figure', detail })
  }

  const pages = files.length
  if (!problems.length) {
    process.stdout.write(
      `check: ${pages} pages, ${routes.size} routes, ` +
      `${Object.keys(PART_META).length} parts, ${Object.keys(CIRCUITS).length} circuits - clean\n`)
    return
  }

  const byKind = new Map()
  for (const p of problems) byKind.set(p.kind, (byKind.get(p.kind) || 0) + 1)
  process.stderr.write(`check: ${problems.length} problem(s) across ${pages} pages\n\n`)
  for (const p of problems.slice(0, 40)) {
    process.stderr.write(`  ${p.file}\n    ${p.kind}: ${p.detail}\n`)
  }
  if (problems.length > 40) process.stderr.write(`  ... and ${problems.length - 40} more\n`)
  process.stderr.write('\n' + [...byKind].map(([k, n]) => `${k}: ${n}`).join(', ') + '\n')
  process.exitCode = 1
}

await main()
