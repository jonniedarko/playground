#!/usr/bin/env node
/**
 * Screenshots of the built site, for looking at a change rather than asserting
 * about it.
 *
 * Every release so far has come with a throwaway Playwright script that boots a
 * server, opens a route, finds an element and saves a PNG - written again each
 * time, and wrong in the same two ways each time: coordinates measured before
 * scrolling, and a stale build serving under it. This is that script, kept.
 *
 *   node scripts/screenshot.mjs --route /shenzhen-io/quick-start/
 *   node scripts/screenshot.mjs --route /shenzhen-io/parts/ --select '[data-circuit="catalogue"]'
 *   node scripts/screenshot.mjs --route / --widths 320,390,900 --theme dark
 *   node scripts/screenshot.mjs --route /shenzhen-io/ide/ --wait '.ide[data-ready]' --full
 *
 * Options
 *   --route    <path>     route to open (default /)
 *   --select   <css>      screenshot just this element, not the viewport
 *   --wait     <css>      wait for this selector before shooting
 *   --widths   <list>     comma-separated viewport widths (default 390)
 *   --height   <px>       viewport height (default 900)
 *   --theme    light|dark|both   colour scheme (default both)
 *   --out      <dir>      where PNGs land (default shots/)
 *   --name     <stem>     filename stem (default derived from the route)
 *   --full                full-page rather than viewport
 *   --age      <seconds>  fake the page clock, for the relative build stamp
 *   --no-build            use dist/ as it stands
 *
 * Exits 0 with a message when Playwright is unavailable, like the sweep does.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSite, BASE } from '../build.mjs'
import { loadPlaywright, startServer, launchBrowser } from './lib/preview.mjs'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PORT = 4398

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback
}
const flag = (name) => process.argv.includes('--' + name)

/** A filename stem from the route, so shots are identifiable without --name. */
function stemFor(route) {
  const clean = route.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-')
  return clean || 'home'
}

async function main() {
  const pw = await loadPlaywright()
  if (!pw) {
    process.stdout.write('screenshot: Playwright not available - nothing to do.\n')
    return
  }

  const route = arg('route', '/')
  const select = arg('select')
  const waitFor = arg('wait')
  const widths = (arg('widths', '390')).split(',').map(Number).filter(Boolean)
  const height = Number(arg('height', '900'))
  const themeArg = arg('theme', 'both')
  const themes = themeArg === 'both' ? ['light', 'dark'] : [themeArg]
  const outDir = path.resolve(ROOT, arg('out', 'shots'))
  const stem = arg('name', stemFor(route))
  const ageSeconds = Number(arg('age', '0'))

  if (!flag('no-build')) await buildSite({ quiet: true })
  await fs.mkdir(outDir, { recursive: true })

  const server = await startServer(PORT)
  const browser = await launchBrowser(pw)
  const written = []
  const problems = []

  for (const width of widths) {
    for (const theme of themes) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2,
        colorScheme: theme,
        isMobile: width < 500,
        hasTouch: width < 500,
      })
      const page = await context.newPage()
      page.on('pageerror', (e) => problems.push(`${width}px ${theme}: ${e.message}`))
      page.on('console', (m) => { if (m.type() === 'error') problems.push(`${width}px ${theme}: ${m.text()}`) })

      // Moving the clock has to happen before any page script runs.
      if (ageSeconds) {
        await page.addInitScript((ms) => {
          const real = Date.now
          Date.now = () => real() + ms
        }, ageSeconds * 1000)
      }

      await page.goto(`http://localhost:${PORT}${BASE}${route}`, { waitUntil: 'networkidle' })
      if (waitFor) await page.waitForSelector(waitFor, { timeout: 10000 })
      await page.waitForTimeout(400)

      const suffix = `${stem}-${width}${themes.length > 1 ? '-' + theme : ''}.png`
      const file = path.join(outDir, suffix)

      if (select) {
        const target = page.locator(select).first()
        if (!(await target.count())) {
          problems.push(`${width}px ${theme}: nothing matches ${select}`)
          await context.close()
          continue
        }
        // Scroll first, then shoot: a screenshot of an element parked outside
        // the viewport is the classic way to photograph nothing.
        await target.scrollIntoViewIfNeeded()
        await page.waitForTimeout(200)
        await target.screenshot({ path: file })
      } else {
        await page.screenshot({ path: file, fullPage: flag('full') })
      }

      written.push(path.relative(ROOT, file))
      await context.close()
    }
  }

  await browser.close()
  server.close()

  for (const file of written) process.stdout.write(`  ${file}\n`)
  if (problems.length) {
    process.stderr.write(`\nscreenshot: ${problems.length} console/page error(s) while shooting\n`)
    for (const p of problems.slice(0, 10)) process.stderr.write(`  ${p}\n`)
  }
  process.stdout.write(`screenshot: ${written.length} image(s) in ${path.relative(ROOT, outDir)}/\n`)
}

await main()
