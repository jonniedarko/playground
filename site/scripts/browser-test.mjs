#!/usr/bin/env node
/**
 * Browser checks against a freshly built site.
 *
 * Playwright is not a dependency of this project - it is whatever the machine
 * happens to have. When it is missing this script says so and exits 0, so a
 * fresh clone and CI stay green; the static `check.mjs` is the hard gate.
 *
 *   node scripts/browser-test.mjs
 *   node scripts/browser-test.mjs --widths 320,390,1440
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { buildSite, OUT_DIR, BASE } from '../build.mjs'
import { CIRCUITS } from '../assets/shenzhen/circuits.js'

/** Playwright lives outside the project here, so try the usual places before giving up. */
const CANDIDATES = [
  'playwright',
  '/opt/node22/lib/node_modules/playwright/index.mjs',
  '/usr/lib/node_modules/playwright/index.mjs',
  '/usr/local/lib/node_modules/playwright/index.mjs',
]

async function loadPlaywright() {
  for (const spec of CANDIDATES) {
    try {
      return await import(spec)
    } catch {
      /* try the next one */
    }
  }
  return null
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
}

function startServer(port) {
  const server = http.createServer(async (req, res) => {
    // Parse the path by hand: `new URL()` rejects request targets like "//".
    let pathname = decodeURIComponent((req.url || '/').split(/[?#]/)[0]).replace(/\/{2,}/g, '/')
    if (BASE && pathname.startsWith(BASE)) pathname = pathname.slice(BASE.length) || '/'
    let file = path.join(OUT_DIR, pathname)
    try {
      const stat = await fs.stat(file).catch(() => null)
      if (!stat || stat.isDirectory()) file = path.join(file, 'index.html')
      const data = await fs.readFile(file)
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
      res.end(data)
    } catch {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
      res.end('not found')
    }
  })
  return new Promise((resolve) => server.listen(port, () => resolve(server)))
}

async function routes() {
  const found = []
  const walk = async (dir) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(abs)
      else if (entry.name === 'index.html') {
        const rel = path.relative(OUT_DIR, path.dirname(abs)).split(path.sep).join('/')
        found.push(BASE + '/' + (rel === '.' ? '' : rel + '/'))
      }
    }
  }
  await walk(OUT_DIR)
  return found.sort()
}

async function main() {
  const pw = await loadPlaywright()
  if (!pw) {
    process.stdout.write('browser-test: Playwright not available - skipped.\n')
    process.stdout.write('  Static validation still runs via `npm run check`.\n')
    return
  }

  const widthArg = process.argv.indexOf('--widths')
  const widths = widthArg > -1
    ? process.argv[widthArg + 1].split(',').map(Number)
    : [320, 390]

  await buildSite({ quiet: true })
  const port = 4399
  const server = await startServer(port)
  const all = await routes()

  const launch = { }
  if (await fs.stat('/opt/pw-browsers/chromium').then(() => true).catch(() => false)) {
    launch.executablePath = '/opt/pw-browsers/chromium'
  }
  const browser = await pw.chromium.launch(launch)

  const failures = []
  let figuresChecked = 0
  let circuitsChecked = 0
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile: width < 700,
      hasTouch: width < 700,
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e.message)))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

    for (const route of all) {
      errors.length = 0
      await page.goto(`http://localhost:${port}${route}`, { waitUntil: 'networkidle' })
      const box = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }))
      if (box.scroll > box.client) {
        failures.push(`${width}px ${route} overflows: ${box.scroll} > ${box.client}`)
      }
      for (const e of errors) failures.push(`${width}px ${route} console: ${e}`)

      // Chip figures must upgrade to real components, and the static markup
      // they replace must still be in the served HTML as the no-JS fallback.
      const figures = await page.evaluate(() =>
        [...document.querySelectorAll('.chip-figure')].map((fig) => {
          const part = fig.querySelector('circuit-board > *')
          return {
            part: fig.dataset.part,
            upgraded: fig.dataset.upgraded === 'true',
            tag: part && part.tagName.toLowerCase(),
            shadow: Boolean(part && part.shadowRoot),
            pins: part && part.shadowRoot
              ? part.shadowRoot.querySelectorAll('.pin').length
              : 0,
            labels: part && part.shadowRoot
              ? getComputedStyle(part.shadowRoot.querySelector('.trace i')).opacity
              : '0',
          }
        })
      )
      figuresChecked += figures.length
      for (const fig of figures) {
        const at = `${width}px ${route} figure ${fig.part}`
        if (!fig.upgraded) failures.push(`${at}: did not upgrade`)
        else if (fig.tag !== fig.part) failures.push(`${at}: rendered <${fig.tag}>`)
        else if (!fig.shadow) failures.push(`${at}: no shadow root`)
        else if (!fig.pins) failures.push(`${at}: no pins rendered`)
        // Pin names must be legible without hovering - there is no hover on touch.
        else if (fig.labels !== '1') failures.push(`${at}: pin labels hidden (opacity ${fig.labels})`)
      }
      if (figures.length) {
        const html = await (await fetch(`http://localhost:${port}${route}`)).text()
        if (!html.includes('class="pinout"')) {
          failures.push(`${width}px ${route}: no static pinout fallback in served HTML`)
        }
      }

      // Reference circuits: every part placed and every wire connected. Wiring
      // happens on the next frame, so wait for the count to be published.
      if (await page.$('.circuit-figure')) {
        await page
          .waitForFunction(
            () => [...document.querySelectorAll('.circuit-figure')].every((f) => f.dataset.wires !== undefined),
            { timeout: 4000 }
          )
          .catch(() => failures.push(`${width}px ${route}: circuit wiring never completed`))
      }
      const circuits = await page.evaluate(() =>
        [...document.querySelectorAll('.circuit-figure')].map((f) => ({
          name: f.dataset.circuit,
          upgraded: f.dataset.upgraded === 'true',
          wires: Number(f.dataset.wires),
          // Only real parts have a shadow root; the board also holds an <svg> and a toast.
          parts: [...f.querySelectorAll('circuit-board > *')].filter((e) => e.shadowRoot).length,
        }))
      )
      circuitsChecked += circuits.length
      for (const c of circuits) {
        const at = `${width}px ${route} circuit ${c.name}`
        const spec = CIRCUITS[c.name]
        if (!spec) failures.push(`${at}: no such circuit in circuits.js`)
        else if (!c.upgraded) failures.push(`${at}: did not upgrade`)
        else if (c.parts !== spec.parts.length) {
          failures.push(`${at}: placed ${c.parts} of ${spec.parts.length} parts`)
        } else if (c.wires !== spec.wires.length) {
          failures.push(`${at}: connected ${c.wires} of ${spec.wires.length} wires`)
        }
      }
    }
    await context.close()
  }

  await browser.close()
  server.close()

  if (failures.length) {
    process.stderr.write(`browser-test: ${failures.length} failure(s)\n`)
    for (const f of failures.slice(0, 30)) process.stderr.write(`  ${f}\n`)
    if (failures.length > 30) process.stderr.write(`  ... and ${failures.length - 30} more\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(
    `browser-test: ${all.length} routes x ${widths.join('/')}px, ${figuresChecked} chip figures, ${circuitsChecked} circuits` +
    ' - no overflow, no console errors\n'
  )
}

await main()
