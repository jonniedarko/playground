/* =========================================================================
   Serving the built site to a headless browser.

   Both the browser sweep and the screenshot script need the same three
   things: find Playwright, serve dist/, launch Chromium. They were a copy
   each, and every ad-hoc script written during a release was a third copy.

   Playwright is not a dependency of this project - it is whatever the machine
   happens to have - so loading it is allowed to fail and callers decide what
   that means. For the sweep it means skip and exit 0; for a screenshot run it
   means there is nothing to do.
   ========================================================================= */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { OUT_DIR, BASE } from '../../build.mjs'

/** Playwright lives outside the project here, so try the usual places. */
const CANDIDATES = [
  'playwright',
  '/opt/node22/lib/node_modules/playwright/index.mjs',
  '/usr/lib/node_modules/playwright/index.mjs',
  '/usr/local/lib/node_modules/playwright/index.mjs',
]

/** A browser binary that ships separately from the library, when there is one. */
const BROWSER_PATHS = ['/opt/pw-browsers/chromium']

export async function loadPlaywright() {
  for (const spec of CANDIDATES) {
    try {
      return await import(spec)
    } catch {
      /* try the next one */
    }
  }
  return null
}

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
}

/** Serve dist/ on `port`, honouring BASE_PATH so links resolve as deployed. */
export function startServer(port) {
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

/** Launch Chromium, pointing at a separately installed binary when present. */
export async function launchBrowser(pw, options = {}) {
  const launch = { ...options }
  for (const candidate of BROWSER_PATHS) {
    if (await fs.stat(candidate).then(() => true).catch(() => false)) {
      launch.executablePath = candidate
      break
    }
  }
  return pw.chromium.launch(launch)
}

/** Every built route, as served paths. */
export async function routes() {
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
