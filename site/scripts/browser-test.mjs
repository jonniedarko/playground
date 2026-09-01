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

import { buildSite, BASE } from '../build.mjs'
import { loadPlaywright, startServer, launchBrowser, routes } from './lib/preview.mjs'
import { CIRCUITS } from '../assets/shenzhen/circuits.js'

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

  const browser = await launchBrowser(pw)

  const failures = []
  let figuresChecked = 0
  let circuitsChecked = 0
  let runnableChecked = 0
  let routingChecked = 0
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

      // No wire may be drawn through a component, and no two may share a
      // horizontal run. Sample each path rather than trusting the router.
      const routing = await page.evaluate(() => {
        const problems = []
        for (const fig of document.querySelectorAll('.circuit-figure')) {
          const board = fig.querySelector('circuit-board')
          if (!board) continue
          const origin = board.getBoundingClientRect()
          const local = (r) => ({
            x0: r.left - origin.left, y0: r.top - origin.top,
            x1: r.right - origin.left, y1: r.bottom - origin.top,
          })
          const parts = [...board.children].filter((e) => e.shadowRoot).map((e) => local(e.getBoundingClientRect()))
          // A part laid out past the board's own box is cut off. The board
          // sizes itself from the part list, so this catches a circuit whose
          // parts outgrew it.
          for (const r of parts) {
            if (r.x1 > origin.width + 1 || r.y1 > origin.height + 1) {
              problems.push(`${fig.dataset.circuit}: a part is outside the board at ${Math.round(r.x1)},${Math.round(r.y1)}`)
            }
          }
          // The visible body is inset a few px from the host box; allow for it
          // so a wire hugging a chip edge is not reported.
          const inset = 6
          const runs = []
          for (const path of board.querySelectorAll('g.wire .w-body')) {
            const len = path.getTotalLength()
            if (!len) continue
            let prev = null
            let escaped = false
            for (let d = 0; d <= len; d += 3) {
              const pt = path.getPointAtLength(d)
              for (const r of parts) {
                if (pt.x > r.x0 + inset && pt.x < r.x1 - inset && pt.y > r.y0 + inset && pt.y < r.y1 - inset) {
                  problems.push(`${fig.dataset.circuit}: wire crosses a part at ${Math.round(pt.x)},${Math.round(pt.y)}`)
                  d = len
                  break
                }
              }
              // A wire drawn outside the board reads as a rendering bug even
              // though it clears every part. Parts are checked below.
              if (!escaped && (pt.x < -1 || pt.y < -1 || pt.x > origin.width + 1 || pt.y > origin.height + 1)) {
                escaped = true
                problems.push(`${fig.dataset.circuit}: wire leaves the board at ${Math.round(pt.x)},${Math.round(pt.y)}`)
              }
              // Collect horizontal runs so overlapping ones can be spotted.
              if (prev && Math.abs(pt.y - prev.y) < 0.5 && Math.abs(pt.x - prev.x) > 0.5) {
                const last = runs[runs.length - 1]
                if (last && Math.abs(last.y - pt.y) < 0.5 && Math.abs(last.x1 - prev.x) < 4) last.x1 = pt.x
                else runs.push({ y: pt.y, x0: prev.x, x1: pt.x, fig: fig.dataset.circuit })
              }
              prev = { x: pt.x, y: pt.y }
            }
          }
          for (let i = 0; i < runs.length; i += 1) {
            for (let j = i + 1; j < runs.length; j += 1) {
              const a = runs[i], b = runs[j]
              if (Math.abs(a.y - b.y) > 3) continue
              const lo = Math.max(Math.min(a.x0, a.x1), Math.min(b.x0, b.x1))
              const hi = Math.min(Math.max(a.x0, a.x1), Math.max(b.x0, b.x1))
              if (hi - lo > 12) problems.push(`${a.fig}: two wires share a run at y=${Math.round(a.y)}`)
            }
          }
        }
        return [...new Set(problems)]
      })
      for (const r of routing) failures.push(`${width}px ${route} ${r}`)
      routingChecked += circuits.length

      // preserveAspectRatio="none" stretches an SVG's contents by different
      // factors on each axis. That is fine for a waveform and wrong for
      // lettering: the scope trace shipped with its row labels 3x too wide.
      // Any such SVG that holds text must scale equally on both axes.
      const stretched = await page.evaluate(() => {
        const svgs = []
        const collect = (root) => {
          for (const svg of root.querySelectorAll('svg')) svgs.push(svg)
          for (const el of root.querySelectorAll('*')) if (el.shadowRoot) collect(el.shadowRoot)
        }
        collect(document)
        const bad = []
        for (const svg of svgs) {
          if (svg.getAttribute('preserveAspectRatio') !== 'none') continue
          if (!svg.querySelector('text')) continue
          const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number)
          const r = svg.getBoundingClientRect()
          if (vb.length !== 4 || !vb[2] || !vb[3] || !r.width || !r.height) continue
          const sx = r.width / vb[2]
          const sy = r.height / vb[3]
          if (Math.abs(sx - sy) / Math.max(sx, sy) > 0.02) {
            bad.push(`text in a non-uniformly scaled svg (x${sx.toFixed(2)} vs y${sy.toFixed(2)})`)
          }
        }
        return [...new Set(bad)]
      })
      for (const b of stretched) failures.push(`${width}px ${route} ${b}`)

      // The stamp is meant to be reachable on a phone, in some form. It was
      // hidden outright below 27rem once; this is the guard against that, and
      // against the site name losing characters to make room for it.
      const bar = await page.evaluate(() => {
        const stamp = document.querySelector('.topbar-actions .build-stamp')
        if (!stamp) return { missing: true }
        const r = stamp.getBoundingClientRect()
        const shown = [...stamp.children]
          .filter((e) => getComputedStyle(e).display !== 'none')
          .map((e) => e.textContent.trim())
          .filter(Boolean)
        const text = document.querySelector('.brand-text')
        return {
          width: Math.round(r.width),
          height: Math.round(r.height),
          shown,
          brandClipped: text && getComputedStyle(text).display !== 'none' &&
            text.scrollWidth > text.clientWidth + 1,
        }
      })
      if (bar.missing) failures.push(`${width}px ${route}: no build stamp in the top bar`)
      else {
        if (!bar.width || !bar.shown.length) {
          failures.push(`${width}px ${route}: build stamp is in the bar but paints nothing`)
        }
        if (bar.height && bar.height < 44) {
          failures.push(`${width}px ${route}: build stamp only ${bar.height}px tall`)
        }
        if (bar.brandClipped) {
          failures.push(`${width}px ${route}: the site name is clipped`)
        }
      }

      // Runnable figures: controls present, and stepping actually moves the clock.
      for (const el of await page.$$('.circuit-figure[data-run]')) {
        const name = await el.evaluate((n) => n.dataset.circuit)
        const at = `${width}px ${route} runnable ${name}`
        const buttons = await el.$$('.sim-btn')
        if (buttons.length < 3) {
          failures.push(`${at}: only ${buttons.length} controls`)
          continue
        }
        const before = await el.evaluate((n) => n.dataset.time)
        const step = await el.$('.sim-btn:nth-of-type(2)')
        await step.click()
        await page.waitForTimeout(60)
        const after = await el.evaluate((n) => ({ t: n.dataset.time, state: n.dataset.simState }))
        if (after.t === before) failures.push(`${at}: step did not advance the clock`)
        if (after.state === 'error') {
          const why = await el.$eval('.sim-readout', (n) => n.textContent)
          failures.push(`${at}: simulator error - ${why}`)
        }
        // Every control has to clear a usable tap target.
        for (const b of buttons) {
          const box = await b.boundingBox()
          if (box && box.height < 44) {
            failures.push(`${at}: control only ${Math.round(box.height)}px tall`)
            break
          }
        }
        runnableChecked += 1
      }
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

  // The build stamp reads as "2 hours ago" for a recent build and falls back to
  // the date after a week. That switch happens in the browser, so it is tested
  // by moving the page's clock rather than by waiting a week.
  let stampChecked = 0
  {
    const cases = [
      ['2 hours', 2 * 3600e3, true],
      ['6 days', 6 * 24 * 3600e3, true],
      ['8 days', 8 * 24 * 3600e3, false],
      ['clock skew', -3600e3, true],
    ]
    for (const [label, ageMs, wantRelative] of cases) {
      const context = await browser.newContext({ viewport: { width: 900, height: 400 } })
      const page = await context.newPage()
      // addInitScript runs before any page script, so app.js sees this clock.
      await page.addInitScript((ms) => {
        const real = Date.now
        Date.now = () => real() + ms
      }, ageMs)
      const at = `build stamp (${label})`
      try {
        await page.goto(`http://localhost:${port}${BASE}/`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(200)
        const seen = await page.evaluate(() => {
          const top = document.querySelector('.topbar-actions .build-stamp')
          const foot = document.querySelector('.build-stamp-footer')
          if (!top || !foot) return null
          const clock = top.querySelector('.stamp-time')
          return {
            text: top.querySelector('time').textContent.trim(),
            foot: foot.textContent.trim(),
            clockShown: clock ? getComputedStyle(clock).display !== 'none' : false,
            aria: top.getAttribute('aria-label') || '',
            href: top.getAttribute('href') || '',
          }
        })
        if (!seen) {
          failures.push(`${at}: no build stamp on the page`)
        } else {
          const isRelative = /ago|just now|yesterday/.test(seen.text)
          if (isRelative !== wantRelative) {
            failures.push(`${at}: read "${seen.text}", expected ${wantRelative ? 'a relative phrase' : 'an absolute date'}`)
          }
          if (!/ago|just now|yesterday/.test(seen.foot) === wantRelative) {
            failures.push(`${at}: footer read "${seen.foot}"`)
          }
          // The clock is redundant beside a relative phrase and wanted beside a date.
          if (seen.clockShown === wantRelative) {
            failures.push(`${at}: clock ${seen.clockShown ? 'shown' : 'hidden'} alongside "${seen.text}"`)
          }
          // Whatever is displayed, the exact time stays in the accessible name.
          if (!/\d{4}-\d{2}-\d{2}/.test(seen.aria)) {
            failures.push(`${at}: accessible name lost the date - "${seen.aria}"`)
          }
          if (!/\/commit\/[0-9a-f]{7,}/.test(seen.href)) {
            failures.push(`${at}: does not link to a commit - "${seen.href}"`)
          }
        }
        stampChecked += 1
      } catch (err) {
        failures.push(`${at}: ${err.message.split('\n')[0]}`)
      }
      await context.close()
    }
  }

  // Colour schemes. The components draw from --sz-* tokens that the site
  // redefines per theme, so a token added on one side and forgotten on the
  // other leaves text sitting on its own colour. Check what is painted.
  let themesChecked = 0
  const THEME_ROUTES = ['/shenzhen-io/quick-start/', '/shenzhen-io/ide/', '/shenzhen-io/parts/mc6000/']
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, colorScheme: scheme })
    const page = await context.newPage()
    for (const route of THEME_ROUTES) {
      // Both routes to a theme: the OS preference above, and the explicit
      // toggle, which is a different selector and has been forgotten before.
      for (const explicit of [false, true]) {
        const at = `${scheme}${explicit ? ' (toggled)' : ''} ${route}`
        try {
          await page.goto(`http://localhost:${port}${BASE}${route}`, { waitUntil: 'networkidle' })
          if (explicit) await page.evaluate((t) => { document.documentElement.dataset.theme = t }, scheme)
          await page.waitForTimeout(400)
          const bad = await page.evaluate(() => {
            const lum = (c) => {
              const [r, g, b] = c.map((v) => {
                const x = v / 255
                return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
              })
              return 0.2126 * r + 0.7152 * g + 0.0722 * b
            }
            const parse = (s) => {
              const m = (s || '').match(/[\d.]+/g)
              return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null
            }
            const opaque = (s) => {
              const m = (s || '').match(/[\d.]+/g)
              return m && (m.length < 4 || Number(m[3]) > 0.9)
            }
            // Every colour the text could be sitting on, walking up until
            // something paints. A gradient has no backgroundColor, so its
            // stops are read out of backgroundImage and all of them are
            // checked - skipping gradients instead would silently disable the
            // check on chip code, whose nearest painted ancestor is the chip
            // body's gradient.
            const bgsOf = (el) => {
              for (let n = el; n; n = n.parentElement || n.getRootNode().host) {
                const style = getComputedStyle(n)
                const img = style.backgroundImage
                if (img && img !== 'none') {
                  const stops = [...img.matchAll(/rgba?\([^)]*\)/g)]
                    .map((m) => m[0]).filter(opaque).map(parse).filter(Boolean)
                  if (stops.length) return stops
                }
                const c = style.backgroundColor
                if (parse(c) && opaque(c)) return [parse(c)]
              }
              return [[255, 255, 255]]
            }
            const ratio = (fg, bg) => {
              const a = lum(fg), b = lum(bg)
              return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
            }
            const out = []
            const check = (el, label, min) => {
              if (!el) return
              const fg = parse(getComputedStyle(el).color)
              if (!fg) return
              // Worst stop wins: text has to be readable across the whole
              // gradient, not just where it happens to be lightest.
              const worst = Math.min(...bgsOf(el).map((bg) => ratio(fg, bg)))
              if (worst < min) out.push(`${label} contrast ${worst.toFixed(2)} (needs ${min})`)
            }
            const chip = document.querySelector('mc-4000, mc-6000')
            if (chip) {
              check(chip.shadowRoot.querySelector('.hl'), 'chip code', 4)
              check(chip.shadowRoot.querySelector('.reg span'), 'chip register', 4)
            }
            for (const sel of ['.sim-readout', '.sim-btn', '.ide-chip', '.build-stamp']) {
              check(document.querySelector(sel), sel, 3)
            }
            return out
          })
          for (const b of bad) failures.push(`${at} ${b}`)
          themesChecked += 1
        } catch (err) {
          failures.push(`${at}: ${err.message.split('\n')[0]}`)
        }
      }
    }
    await context.close()
  }

  // The workbench: a touch-only interaction pass, because every affordance it
  // adds (place, drag, wire, delete, edit) is one a phone has to reach without
  // a keyboard or a hover.
  let ideChecked = 0
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e.message)))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    const at = `${width}px ide`
    try {
      await page.goto(`http://localhost:${port}${BASE}/shenzhen-io/ide/`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.ide[data-ready]', { timeout: 8000 })
      await page.waitForTimeout(400)
      ideChecked += 1

      const ide = await page.$('.ide')
      const count = () => page.evaluate(() => document.querySelector('.ide-board').parts.length)

      // The editor must not be showing before anything asked for it. Test what
      // is painted, not the `hidden` attribute: a class-level `display` beats
      // the UA rule for [hidden], which is exactly how this broke once.
      const editorShown = () => page.evaluate(() => {
        const m = document.querySelector('.ide-modal')
        return Boolean(m && getComputedStyle(m).display !== 'none')
      })
      if (await editorShown()) failures.push(`${at}: the code editor is open on load`)

      // Place from the palette.
      const start = await count()
      await page.getByRole('button', { name: 'MC6000', exact: true }).click()
      await page.waitForTimeout(200)
      if ((await count()) !== start + 1) failures.push(`${at}: palette did not place a part`)

      // Remove it with the on-screen control - there is no Delete key here.
      const del = await page.$('.ide-danger')
      if (await del.evaluate((n) => n.disabled)) {
        failures.push(`${at}: delete stayed disabled with a part selected`)
      } else {
        await del.click()
        await page.waitForTimeout(200)
        if ((await count()) !== start) failures.push(`${at}: on-screen delete did not remove the part`)
      }

      // Pointer coordinates are viewport-relative, so the panel has to be on
      // screen before anything is measured or dragged.
      await page.locator('.ide-stage').scrollIntoViewIfNeeded()
      await page.waitForTimeout(200)

      // Drag a part, then wire two pins, both with a touch pointer.
      const term = await page.evaluate(() => {
        const p = document.querySelector('.ide-board io-terminal')
        const r = p.getBoundingClientRect()
        return { pos: `${p.getAttribute('x')},${p.getAttribute('y')}`, x: r.x + r.width / 2, y: r.y + r.height / 2 }
      })
      if (term.y < 0 || term.y > 844 || term.x < 0 || term.x > width) {
        failures.push(`${at}: part is off screen at ${Math.round(term.x)},${Math.round(term.y)} - cannot test the drag`)
      }
      await page.mouse.move(term.x, term.y)
      await page.mouse.down()
      await page.mouse.move(term.x + 60, term.y + 50, { steps: 10 })
      await page.mouse.up()
      await page.waitForTimeout(200)
      const moved = await page.evaluate(() => {
        const p = document.querySelector('.ide-board io-terminal')
        return `${p.getAttribute('x')},${p.getAttribute('y')}`
      })
      if (moved === term.pos) failures.push(`${at}: dragging a part did nothing`)

      // A mismatched pin pair must be refused through the drag path.
      const wiresBefore = await page.evaluate(() => document.querySelector('.ide-board').wires.length)
      const bad = await page.evaluate(() => {
        const board = document.querySelector('.ide-board')
        const mc = board.querySelector('mc-4000')
        const t = [...board.querySelectorAll('io-terminal')].find((e) => e.getAttribute('type') !== 'xbus')
        if (!mc || !t) return null
        const c = (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }
        return { from: c(mc.pinElement('x0')), to: c(t.pinElement(t.getAttribute('label'))) }
      })
      if (bad) {
        await page.mouse.move(bad.from.x, bad.from.y)
        await page.mouse.down()
        await page.mouse.move(bad.to.x, bad.to.y, { steps: 12 })
        await page.mouse.up()
        await page.waitForTimeout(200)
        const after = await page.evaluate(() => document.querySelector('.ide-board').wires.length)
        if (after !== wiresBefore) failures.push(`${at}: XBus was allowed to wire to a simple pin`)
      }

      // The larger editor has to be reachable without a hover, and writing back.
      const opened = await page.evaluate(() => {
        const chip = document.querySelector('.ide-board mc-4000')
        const btn = chip && chip.shadowRoot.querySelector('.expand')
        if (!btn) return 'no expand button'
        if (getComputedStyle(btn).opacity === '0') return 'expand button is invisible without hover'
        btn.click()
        return null
      })
      if (opened) failures.push(`${at}: ${opened}`)
      await page.waitForTimeout(200)
      if (!(await editorShown())) {
        failures.push(`${at}: the larger editor did not open`)
      } else {
        await page.fill('.ide-modal-area', '  mov 7 acc\n  slp 1')
        await page.click('.ide-primary')
        await page.waitForTimeout(200)
        const code = await page.evaluate(() => document.querySelector('.ide-board mc-4000').code)
        if (!code.includes('mov 7 acc')) failures.push(`${at}: the editor did not write back to the chip`)
        if (await editorShown()) failures.push(`${at}: the editor stayed open after Done`)
      }

      // Running has to move the clock.
      const readout = () => page.$eval('.ide .sim-readout', (n) => n.textContent)
      const beforeRun = await readout()
      await page.click('.ide .sim-btn:nth-of-type(2)')
      await page.waitForTimeout(200)
      if ((await readout()) === beforeRun) failures.push(`${at}: step did not advance the clock`)

      // Verify: reload the AN650 preset first - earlier steps in this same
      // test overwrote a chip's program via the editor, and that has nothing
      // to do with what this checks. AN650 has a shipped spec (specs.js)
      // that its own reference circuit passes (verify.test.mjs), so a clean
      // load of it must read PASS here too.
      await page.selectOption('.ide-select:not(.ide-saved)', 'an650')
      await page.waitForTimeout(300)
      const verifyBtn = page.getByRole('button', { name: 'Verify', exact: true })
      const vBox = await verifyBtn.boundingBox()
      if (!vBox || vBox.height < 44 || vBox.width < 44) {
        failures.push(`${at}: Verify control is ${vBox ? `${Math.round(vBox.width)}x${Math.round(vBox.height)}` : 'not visible'}`)
      } else {
        await verifyBtn.click()
        await page.waitForTimeout(200)
        const verifyText = await readout()
        if (!verifyText.startsWith('Verify:')) {
          failures.push(`${at}: Verify produced no result line - "${verifyText}"`)
        } else if (!verifyText.includes('PASS')) {
          failures.push(`${at}: AN650 preset failed its own spec - "${verifyText}"`)
        }
        // Test what is painted, not the `hidden` attribute - see the editor
        // check above for why: a class-level `display` can outrank it.
        const scopeShown = await page.evaluate(() => {
          const w = document.querySelector('.sim-scope-wrap')
          return Boolean(w && getComputedStyle(w).display !== 'none')
        })
        if (!scopeShown) failures.push(`${at}: scope trace did not appear after Verify`)

        // And the failure path, which is the entire point of the feature: a
        // PASS line proves the button runs, not that it diagnoses anything.
        // Break AN650's edge detection into a level follower - the lamp then
        // runs away past 50 while the switch is held - and check the readout
        // names the unit and the values, and that the mark lands on that
        // unit's column rather than anywhere at all.
        await page.evaluate(() => {
          const chip = document.querySelector('.ide-board mc-4000')
          chip.shadowRoot.querySelector('.expand').click()
        })
        await page.waitForTimeout(200)
        await page.fill('.ide-modal-area', '  teq p0 100\n+ mov 1 x1\n- mov 0 x1\n  slp 1')
        await page.click('.ide-primary')
        await page.waitForTimeout(300)
        await verifyBtn.click()
        await page.waitForTimeout(300)

        const failText = await readout()
        const m = /^Verify: FAIL at t=(\d+) - lamp expected \d+ got \d+/.exec(failText)
        if (!m) {
          failures.push(`${at}: a broken AN650 did not produce a diagnostic - "${failText}"`)
        } else {
          const mark = await page.evaluate(() => {
            const el = document.querySelector('.sim-scope-mark')
            if (!el || getComputedStyle(el).display === 'none') return null
            return parseFloat(el.style.left)
          })
          if (mark === null) {
            failures.push(`${at}: no mark on the trace for the failing unit`)
          } else {
            // The trace holds SAMPLES columns across its full width, so the
            // failing unit's column starts at t/SAMPLES of the way along.
            // Past SAMPLES units the trace has scrolled and the failing unit
            // is simply the last column, which is the most it can show.
            const samples = await page.evaluate(() => customElements.get('scope-trace').SAMPLES)
            const want = (Math.min(Number(m[1]), samples - 1) / samples) * 100
            if (Math.abs(mark - want) > 0.5) {
              failures.push(`${at}: mark is at ${mark.toFixed(2)}%, but t=${m[1]} is column ${want.toFixed(2)}%`)
            }
          }
        }
      }

      // A breakpoint must actually stop a run, not merely be settable. The
      // feature shipped once with no way to arm it at all, so this checks
      // the whole path: cycle the control onto a signal, start the clock,
      // and confirm the run paused itself.
      await page.selectOption('.ide-select:not(.ide-saved)', 'an650')
      await page.waitForTimeout(300)
      const tapNamed = async (name) => {
        await page.evaluate((n) => {
          const b = [...document.querySelectorAll('.ide button')].find((e) => e.textContent.trim() === n)
          if (b) { b.scrollIntoView({ block: 'center' }); b.click() }
        }, name)
        await page.waitForTimeout(150)
      }
      const breakLabel = () => page.evaluate(() => {
        const b = [...document.querySelectorAll('.ide button')].find((e) => e.textContent.trim().startsWith('Break:'))
        return b ? b.textContent.trim() : null
      })
      if ((await breakLabel()) !== 'Break: off') {
        failures.push(`${at}: no Break control, or it does not start off`)
      } else {
        await tapNamed('Break: off')
        const armed = await breakLabel()
        if (armed !== 'Break: lamp') {
          failures.push(`${at}: cycling the Break control gave "${armed}", not the lamp output`)
        } else {
          await tapNamed('switch')
          await tapNamed('Run')
          await page.waitForTimeout(1200)
          const stillRunning = await page.evaluate(() =>
            document.querySelector('.ide button.sim-play').textContent.trim() !== 'Run')
          if (stillRunning) failures.push(`${at}: the run did not stop when the watched signal changed`)
        }
        await tapNamed(await breakLabel()) // cycle back off, so later checks start clean
      }

      // Every control the page offers has to be a real tap target.
      const small = await ide.evaluate((root) =>
        [...root.querySelectorAll('button, select')]
          .filter((e) => {
            const r = e.getBoundingClientRect()
            return r.height > 0 && (r.height < 44 || r.width < 44)
          })
          .map((e) => `${(e.textContent || '').trim() || e.className}`)
          .slice(0, 4))
      for (const name of small) failures.push(`${at}: control "${name}" is under 44px`)

      // The board survives a reload, terminals and all.
      const saved = await page.evaluate(() => document.querySelector('.ide-board').parts.length)
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForSelector('.ide[data-ready]', { timeout: 8000 })
      await page.waitForTimeout(600)
      if ((await count()) !== saved) failures.push(`${at}: the board did not survive a reload`)
      if (!(await page.evaluate(() => document.querySelector('.ide-board').wires.length))) {
        failures.push(`${at}: wires were lost on reload`)
      }

      // Puzzle mode (Task 13.2): a workbench link carrying ?puzzle=<key>
      // opens an EMPTY board bound to that puzzle's spec, and a Reveal
      // control loads the manual's reference solution. The board reloaded
      // above (an650 preset, sabotaged code, a moved terminal) stands in for
      // "a board someone was already working on" - opening a puzzle, and
      // merely looking at it, must not touch that save. Clicking Reveal is a
      // different matter, checked further down: it is exactly loadPreset()
      // under a different button, which already, deliberately, overwrites
      // the one autosave slot - the same as picking any circuit from the
      // Load dropdown always has.
      const savedBefore = await page.evaluate(() => localStorage.getItem('sz-ide-board'))
      if (!savedBefore) failures.push(`${at}: expected a saved board ahead of the puzzle-mode check`)

      await page.goto(`http://localhost:${port}${BASE}/shenzhen-io/ide/?puzzle=an650`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.ide[data-ready]', { timeout: 8000 })
      await page.waitForTimeout(400)

      if ((await count()) !== 0) failures.push(`${at}: puzzle mode did not open an empty board`)
      const untouchedOnOpen = await page.evaluate(() => localStorage.getItem('sz-ide-board'))
      if (untouchedOnOpen !== savedBefore) {
        failures.push(`${at}: opening a puzzle touched the saved board before any edit`)
      }

      // Verify must survive being pressed against a genuinely empty,
      // spec-bound board (spec.inputs names a terminal - "switch" - that
      // does not exist yet) without throwing - see the try/catch around
      // runVerify in ide.js. A crash here would show up as a console error
      // below and as a readout that silently never changed.
      const beforeEmptyVerify = await readout()
      await verifyBtn.click()
      await page.waitForTimeout(200)
      const emptyVerifyText = await readout()
      if (emptyVerifyText === beforeEmptyVerify || !emptyVerifyText.startsWith('Verify:')) {
        failures.push(`${at}: Verify on an empty puzzle board produced no readout - "${emptyVerifyText}"`)
      }

      // Leave puzzle mode without ever touching Reveal or the board - a
      // plain visit, no query string - and the autosave from before the
      // puzzle was ever opened must be exactly as it was. This is the actual
      // "do not silently destroy" proof: everything above (opening the
      // puzzle, pressing Verify on the empty board) has to leave zero mark
      // on the previous save.
      await page.goto(`http://localhost:${port}${BASE}/shenzhen-io/ide/`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.ide[data-ready]', { timeout: 8000 })
      await page.waitForTimeout(400)
      const afterLookingOnly = await page.evaluate(() => localStorage.getItem('sz-ide-board'))
      if (afterLookingOnly !== savedBefore) {
        failures.push(`${at}: the pre-puzzle saved board was not intact after visiting puzzle mode`)
      }

      // Now re-enter the puzzle and actually use Reveal - a real button, not
      // a hover affordance: measured and clicked without ever simulating
      // :hover, so a zero-size or invisible result here is proof by itself
      // that it would fail on touch.
      await page.goto(`http://localhost:${port}${BASE}/shenzhen-io/ide/?puzzle=an650`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.ide[data-ready]', { timeout: 8000 })
      await page.waitForTimeout(400)
      const revealBtn = page.getByRole('button', { name: 'Reveal', exact: false })
      const rBox = await revealBtn.boundingBox()
      if (!rBox || rBox.height < 44 || rBox.width < 44) {
        failures.push(`${at}: Reveal control is ${rBox ? `${Math.round(rBox.width)}x${Math.round(rBox.height)}` : 'not visible'}`)
      } else {
        await revealBtn.click()
        await page.waitForTimeout(300)
        const revealedParts = await count()
        if (revealedParts !== CIRCUITS.an650.parts.length) {
          failures.push(`${at}: Reveal loaded ${revealedParts} parts, AN650's reference circuit has ${CIRCUITS.an650.parts.length}`)
        }
        await verifyBtn.click()
        await page.waitForTimeout(200)
        const revealedVerify = await readout()
        if (!revealedVerify.includes('PASS')) {
          failures.push(`${at}: the revealed AN650 solution failed Verify - "${revealedVerify}"`)
        }
      }

      // packet-reverser has no PRESETS dropdown entry (see the PUZZLES
      // comment in ide.js) - Reveal has to reach it some other way, which
      // means through loadPreset() directly rather than the dropdown's own
      // list. Proves that path independently of AN650 above.
      await page.goto(`http://localhost:${port}${BASE}/shenzhen-io/ide/?puzzle=packet-reverser`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.ide[data-ready]', { timeout: 8000 })
      await page.waitForTimeout(400)
      if ((await count()) !== 0) failures.push(`${at}: the packet-reverser puzzle did not open an empty board`)
      await page.getByRole('button', { name: 'Reveal', exact: false }).click()
      await page.waitForTimeout(300)
      const prParts = await count()
      const prWant = CIRCUITS['packet-reverser'].parts.length
      if (prParts !== prWant) {
        failures.push(`${at}: Reveal loaded ${prParts} parts, packet-reverser's reference circuit has ${prWant}`)
      }

      // R14.1: Share round-trips a real board through a real URL, via the
      // actual button - not just the codec directly (share.test.mjs already
      // covers that headlessly). AN650 has known parts/wires/labels/code to
      // check against on the other side.
      await page.goto(`http://localhost:${port}${BASE}/shenzhen-io/ide/`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.ide[data-ready]', { timeout: 8000 })
      await page.selectOption('.ide-select:not(.ide-saved)', 'an650')
      await page.waitForTimeout(300)
      const shareBtn = page.getByRole('button', { name: 'Share', exact: true })
      const sBox = await shareBtn.boundingBox()
      if (!sBox || sBox.height < 44 || sBox.width < 44) {
        failures.push(`${at}: Share control is ${sBox ? `${Math.round(sBox.width)}x${Math.round(sBox.height)}` : 'not visible'}`)
      } else {
        await shareBtn.click()
        await page.waitForTimeout(200)
        const shareText = await page.$eval('.ide-note', (n) => n.textContent)
        const m = /https?:\/\/\S+/.exec(shareText)
        if (!shareText.startsWith('Share link') || !m) {
          failures.push(`${at}: Share did not produce a link - "${shareText}"`)
        } else {
          await page.goto(m[0], { waitUntil: 'networkidle' })
          await page.waitForSelector('.ide[data-ready]', { timeout: 8000 })
          await page.waitForTimeout(400)
          const shared = await page.evaluate(() => {
            const board = document.querySelector('.ide-board')
            const terms = [...board.querySelectorAll('io-terminal')]
            return {
              parts: board.parts.length,
              wires: board.wires.length,
              switchSide: terms.find((t) => t.getAttribute('label') === 'switch')?.getAttribute('side'),
              lampSide: terms.find((t) => t.getAttribute('label') === 'lamp')?.getAttribute('side'),
              code: [...board.querySelectorAll('mc-4000')].map((c) => c.code).join('|'),
            }
          })
          if (shared.parts !== CIRCUITS.an650.parts.length) {
            failures.push(`${at}: shared link loaded ${shared.parts} parts, AN650 has ${CIRCUITS.an650.parts.length}`)
          }
          if (shared.wires !== CIRCUITS.an650.wires.length) {
            failures.push(`${at}: shared link loaded ${shared.wires} wires, AN650 has ${CIRCUITS.an650.wires.length}`)
          }
          // The R14.1 trap by name: a dropped `side` resolves the wrong pin
          // and silently drops the terminal's wire - so check it explicitly,
          // for both terminals, not just that a "switch" and "lamp" exist.
          if (shared.switchSide !== 'right') failures.push(`${at}: shared "switch" terminal came back side="${shared.switchSide}", want right`)
          if (shared.lampSide !== 'left') failures.push(`${at}: shared "lamp" terminal came back side="${shared.lampSide}", want left`)
          if (!shared.code.includes('rising edge')) {
            failures.push(`${at}: shared link lost a chip's program text`)
          }
        }
      }

      // And the budget path: a board large enough to cross SHARE_BUDGET must
      // say so plainly, in the UI itself, and never hand back a link.
      await page.evaluate(() => {
        const board = document.querySelector('.ide-board')
        board.clearWires()
        board.parts.forEach((p) => p.remove())
        const bigProgram = Array.from({ length: 14 }, (_, i) =>
          `# line ${i} of a long, deliberately verbose filler comment to blow the budget`).join('\n')
        for (let i = 0; i < 10; i += 1) board.addPart('mc-6000', i, 0).setCode(bigProgram)
      })
      await page.waitForTimeout(200)
      await shareBtn.click()
      await page.waitForTimeout(200)
      const overBudgetText = await page.$eval('.ide-note', (n) => n.textContent)
      if (!/too big/i.test(overBudgetText) || /https?:\/\//.test(overBudgetText)) {
        failures.push(`${at}: an over-budget board did not get a plain refusal - "${overBudgetText}"`)
      }

      // R14.2: a named save must bring BACK the board it saved, which means
      // the board has to be something else in between. Saving AN650 and then
      // loading it over an AN650 that is already there proves nothing: a load
      // that does nothing at all passes that.
      await page.goto(`http://localhost:${port}${BASE}/shenzhen-io/ide/`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.ide[data-ready]', { timeout: 8000 })

      const boardShape = () => page.evaluate(() => {
        const b = document.querySelector('.ide-board')
        return {
          parts: b.parts.length,
          wires: b.wires.length,
          tags: b.parts.map((p) => p.tagName.toLowerCase()).sort().join(','),
        }
      })

      await page.selectOption('.ide-select:not(.ide-saved)', 'an650')
      await page.waitForTimeout(350)
      const savedShape = await boardShape()

      const nameField = await page.$('.ide-save-input')
      if (!nameField) {
        failures.push(`${at}: no save-name field`)
      } else {
        await nameField.fill('sweep-save')
        await page.evaluate(() => {
          const b = [...document.querySelectorAll('.ide-bar-file button')]
            .find((x) => x.textContent.includes('Save as'))
          b.scrollIntoView({ block: 'center' }); b.click()
        })
        await page.waitForTimeout(350)

        await page.reload({ waitUntil: 'networkidle' })
        await page.waitForSelector('.ide[data-ready]', { timeout: 8000 })
        await page.waitForTimeout(350)

        // Make the board genuinely different before loading the save back.
        await page.selectOption('.ide-select:not(.ide-saved)', 'dx300-stepper')
        await page.waitForTimeout(350)
        const other = await boardShape()
        if (other.tags === savedShape.tags) {
          failures.push(`${at}: the two presets are indistinguishable, so this check cannot fail`)
        }

        const picker = await page.$('select.ide-saved')
        if (!picker) {
          failures.push(`${at}: no named-save picker`)
        } else {
          const names = await picker.evaluate((el) => [...el.options].map((o) => o.textContent))
          if (!names.includes('sweep-save')) {
            failures.push(`${at}: the named save did not survive a reload (${names.join(', ')})`)
          } else {
            await picker.selectOption('sweep-save')
            await page.waitForTimeout(500)
            const back = await boardShape()
            if (back.tags !== savedShape.tags) {
              failures.push(`${at}: loading the save gave "${back.tags}", expected "${savedShape.tags}"`)
            }
            if (back.parts !== savedShape.parts || back.wires !== savedShape.wires) {
              failures.push(`${at}: loaded save has ${back.parts}/${back.wires} parts/wires, saved ${savedShape.parts}/${savedShape.wires}`)
            }
          }
        }
      }

    } catch (err) {
      failures.push(`${at}: ${err.message.split('\n')[0]}`)
    }
    for (const e of errors) failures.push(`${at} console: ${e}`)
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
    `browser-test: ${all.length} routes x ${widths.join('/')}px, ${figuresChecked} chip figures, ${circuitsChecked} circuits, ${runnableChecked} runnable, ${routingChecked} routed, ${ideChecked} ide, ${themesChecked} theme, ${stampChecked} stamp` +
    ' - no overflow, no console errors\n'
  )
}

await main()
