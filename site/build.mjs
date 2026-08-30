#!/usr/bin/env node
/**
 * Static documentation site generator.
 *
 * Walks `content/`, turns every Markdown file into a standalone HTML page, and
 * writes the result to `dist/`. There are no runtime dependencies: the output
 * is plain HTML/CSS/JS that any static host - GitHub Pages included - can serve.
 *
 * Usage:
 *   node build.mjs                 build into ./dist
 *   node build.mjs --serve         build, then serve ./dist on :4321 with rebuild-on-request
 *   BASE_PATH=/repo node build.mjs build for a project page served from a subpath
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseFrontMatter, renderMarkdown, escapeHtml, slugify } from './lib/markdown.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const CONTENT_DIR = path.join(ROOT, 'content')
const ASSETS_DIR = path.join(ROOT, 'assets')
export const OUT_DIR = path.join(ROOT, 'dist')

const SITE = {
  title: 'Field Notes',
  tagline: 'A personal reference library',
  description: 'A static documentation site collecting notes and references across a range of topics.',
}

/** Normalised base path: '' for a root site, '/name' for a GitHub project page. */
export const BASE = (process.env.BASE_PATH || '').replace(/\/+$/, '')

const url = (p) => {
  if (!p) return BASE + '/'
  if (/^(https?:)?\/\//.test(p) || p.startsWith('#') || p.startsWith('mailto:')) return p
  return BASE + '/' + String(p).replace(/^\/+/, '')
}

// ---------------------------------------------------------------- content tree

/**
 * Read `content/` into a tree of nodes.
 * A directory becomes a section (its `index.md` supplies the title and intro);
 * every other `.md` file becomes a page.
 */
async function readTree(dir, urlPrefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const nodes = []

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'index.md') continue
    const abs = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      const slug = entry.name
      const indexPath = path.join(abs, 'index.md')
      const index = await readDoc(indexPath).catch(() => null)
      const children = await readTree(abs, urlPrefix + slug + '/')
      nodes.push({
        type: 'section',
        slug,
        route: urlPrefix + slug + '/',
        title: index?.data.title || titleFromSlug(slug),
        description: index?.data.description || '',
        order: index?.data.order ?? 999,
        icon: index?.data.icon || '',
        board: index?.data.board === true,
        doc: index,
        children,
      })
      continue
    }

    if (!entry.name.endsWith('.md')) continue
    const slug = entry.name.replace(/\.md$/, '')
    const doc = await readDoc(abs)
    nodes.push({
      type: 'page',
      slug,
      route: urlPrefix + slug + '/',
      title: doc.data.title || titleFromSlug(slug),
      description: doc.data.description || '',
      order: doc.data.order ?? 999,
      icon: doc.data.icon || '',
      board: doc.data.board === true,
      doc,
      children: [],
    })
  }

  nodes.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  return nodes
}

async function readDoc(file) {
  const source = await fs.readFile(file, 'utf8')
  const { data, body } = parseFrontMatter(source)
  return { file, data, body }
}

function titleFromSlug(slug) {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Flatten the tree into the reading order used for prev/next links and search. */
function flatten(nodes, out = []) {
  for (const node of nodes) {
    out.push(node)
    if (node.children.length) flatten(node.children, out)
  }
  return out
}

// ---------------------------------------------------------------- page chrome

function renderNav(nodes, currentRoute, depth = 0) {
  if (!nodes.length) return ''
  const items = nodes
    .map((node) => {
      const isCurrent = node.route === currentRoute
      const hasCurrentChild = flatten(node.children).some((c) => c.route === currentRoute)
      const open = isCurrent || hasCurrentChild
      const link =
        '<a class="nav-link' +
        (isCurrent ? ' is-current' : '') +
        '" href="' +
        url(node.route) +
        '"' +
        (isCurrent ? ' aria-current="page"' : '') +
        '>' +
        (node.icon ? '<span class="nav-icon" aria-hidden="true">' + escapeHtml(node.icon) + '</span>' : '') +
        escapeHtml(node.title) +
        '</a>'

      if (!node.children.length) return '<li>' + link + '</li>'

      return (
        '<li class="nav-group' +
        (open ? ' is-open' : '') +
        '">' +
        '<div class="nav-group-head">' +
        link +
        '<button class="nav-toggle" type="button" aria-expanded="' +
        (open ? 'true' : 'false') +
        '" aria-label="Toggle ' +
        escapeHtml(node.title) +
        ' section"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '</div>' +
        renderNav(node.children, currentRoute, depth + 1) +
        '</li>'
      )
    })
    .join('')

  return '<ul class="nav-list nav-depth-' + depth + '">' + items + '</ul>'
}

function renderToc(headings) {
  if (headings.length < 2) return ''
  const items = headings
    .map(
      (h) =>
        '<li class="toc-h' +
        h.level +
        '"><a href="#' +
        h.id +
        '">' +
        escapeHtml(h.text) +
        '</a></li>'
    )
    .join('')
  return (
    '<nav class="toc" aria-label="On this page">' +
    '<details open><summary>On this page</summary><ul>' +
    items +
    '</ul></details></nav>'
  )
}

function renderBreadcrumbs(trail) {
  if (!trail.length) return ''
  const crumbs = [{ title: 'Home', route: '' }, ...trail]
  const items = crumbs
    .map((c, n) =>
      n === crumbs.length - 1
        ? '<li aria-current="page">' + escapeHtml(c.title) + '</li>'
        : '<li><a href="' + url(c.route) + '">' + escapeHtml(c.title) + '</a></li>'
    )
    .join('')
  return '<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>' + items + '</ol></nav>'
}

function renderChildCards(node) {
  if (!node.children.length) return ''
  const cards = node.children
    .map(
      (child) =>
        '<a class="card" href="' +
        url(child.route) +
        '">' +
        (child.icon ? '<span class="card-icon" aria-hidden="true">' + escapeHtml(child.icon) + '</span>' : '') +
        '<span class="card-title">' +
        escapeHtml(child.title) +
        '</span>' +
        (child.description ? '<span class="card-desc">' + escapeHtml(child.description) + '</span>' : '') +
        (child.children.length
          ? '<span class="card-meta">' + child.children.length + ' page' + (child.children.length === 1 ? '' : 's') + '</span>'
          : '') +
        '</a>'
    )
    .join('')
  return '<div class="card-grid">' + cards + '</div>'
}

function renderPager(prev, next) {
  if (!prev && !next) return ''
  const link = (node, rel, label) =>
    node
      ? '<a class="pager-link pager-' +
        rel +
        '" href="' +
        url(node.route) +
        '"><span class="pager-label">' +
        label +
        '</span><span class="pager-title">' +
        escapeHtml(node.title) +
        '</span></a>'
      : '<span class="pager-link is-empty"></span>'
  return '<nav class="pager" aria-label="Pagination">' + link(prev, 'prev', 'Previous') + link(next, 'next', 'Next') + '</nav>'
}

function layout({ title, description, content, nav, breadcrumbs, pager, isHome, board = false }) {
  const pageTitle = isHome ? SITE.title + ' - ' + SITE.tagline : title + ' - ' + SITE.title
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(description || SITE.description)}" />
<meta name="color-scheme" content="light dark" />
<meta name="theme-color" content="#f7f7f5" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#14161a" media="(prefers-color-scheme: dark)" />
<meta property="og:title" content="${escapeHtml(pageTitle)}" />
<meta property="og:description" content="${escapeHtml(description || SITE.description)}" />
<meta property="og:type" content="article" />
<link rel="icon" href="${url('assets/favicon.svg')}" type="image/svg+xml" />
<link rel="stylesheet" href="${url('assets/style.css')}" />
<script>
  // Apply the stored theme before first paint so the page never flashes the wrong one.
  try {
    var t = localStorage.getItem('theme')
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t
  } catch (e) {}
  window.__BASE__ = ${JSON.stringify(BASE + '/')}
</script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>

<header class="topbar">
  <button class="icon-btn menu-btn" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="sidebar">
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
  </button>
  <a class="brand" href="${url('')}">
    <span class="brand-mark" aria-hidden="true">FN</span>
    <span class="brand-text">${escapeHtml(SITE.title)}</span>
  </a>
  <div class="topbar-actions">
    <button class="icon-btn search-btn" type="button" aria-label="Search" data-open-search>
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13.5 13.5L17 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
    <button class="icon-btn theme-btn" type="button" aria-label="Toggle colour theme" data-toggle-theme>
      <svg class="icon-sun" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="4" fill="currentColor"/><path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.6 3.6l1.4 1.4M15 15l1.4 1.4M16.4 3.6L15 5M5 15l-1.4 1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      <svg class="icon-moon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M16 12.5A7 7 0 0 1 7.5 4a7 7 0 1 0 8.5 8.5z" fill="currentColor"/></svg>
    </button>
  </div>
</header>

<div class="shell">
  <div class="scrim" data-close-nav hidden></div>
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-inner">
      <button class="search-field" type="button" data-open-search>
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13.5 13.5L17 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <span>Search docs</span>
        <kbd>/</kbd>
      </button>
      <nav class="sidebar-nav" aria-label="Documentation">${nav}</nav>
    </div>
  </aside>

  <main class="content" id="main">
    <article class="doc">
      ${breadcrumbs}
      ${content}
      ${pager}
    </article>
    <footer class="site-footer">
      <p>${escapeHtml(SITE.title)} - built as a static site. Source notes are kept as Markdown.</p>
    </footer>
  </main>
</div>

<div class="search-overlay" hidden>
  <div class="search-panel" role="dialog" aria-modal="true" aria-label="Search documentation">
    <div class="search-head">
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13.5 13.5L17 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input type="search" class="search-input" placeholder="Search all notes" aria-label="Search query" autocomplete="off" />
      <button class="icon-btn" type="button" data-close-search aria-label="Close search">Esc</button>
    </div>
    <div class="search-results" role="listbox" aria-label="Search results"></div>
  </div>
</div>

<script src="${url('assets/app.js')}" defer></script>
${board ? `<script type="module" src="${url('assets/shenzhen/embed.js')}"></script>` : ''}
</body>
</html>
`
}

// ---------------------------------------------------------------- build

function plainText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\-*|]+/gm, ' ')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true })
  const entries = await fs.readdir(from, { withFileTypes: true })
  for (const entry of entries) {
    const src = path.join(from, entry.name)
    const dest = path.join(to, entry.name)
    if (entry.isDirectory()) await copyDir(src, dest)
    else await fs.copyFile(src, dest)
  }
}

export async function buildSite({ quiet = false } = {}) {
  const started = Date.now()
  await fs.rm(OUT_DIR, { recursive: true, force: true })
  await fs.mkdir(OUT_DIR, { recursive: true })

  const tree = await readTree(CONTENT_DIR)
  const home = await readDoc(path.join(CONTENT_DIR, 'index.md')).catch(() => null)
  const ordered = flatten(tree)
  const searchIndex = []

  const parentOf = new Map()
  const attachParents = (nodes, trail) => {
    for (const node of nodes) {
      parentOf.set(node.route, trail)
      attachParents(node.children, [...trail, node])
    }
  }
  attachParents(tree, [])

  const writePage = async (node, position) => {
    const doc = node.doc
    const body = doc ? doc.body : ''
    const { html, headings } = renderMarkdown(body, { resolveLink: (href) => resolveDocLink(href, node) })
    const trail = [...(parentOf.get(node.route) || []), node]

    const page = layout({
      title: node.title,
      description: node.description,
      content:
        '<header class="doc-head"><h1>' +
        escapeHtml(node.title) +
        '</h1>' +
        (node.description ? '<p class="lede">' + escapeHtml(node.description) + '</p>' : '') +
        '</header>' +
        renderToc(headings) +
        html +
        renderChildCards(node),
      nav: renderNav(tree, node.route),
      breadcrumbs: renderBreadcrumbs(trail),
      pager: renderPager(position.prev, position.next),
      isHome: false,
      board: node.board,
    })

    const dest = path.join(OUT_DIR, node.route, 'index.html')
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.writeFile(dest, page)

    searchIndex.push({
      t: node.title,
      d: node.description,
      u: node.route,
      s: trail.slice(0, -1).map((n) => n.title).join(' / '),
      b: plainText(body).slice(0, 1400),
      h: headings.map((x) => x.text),
    })
  }

  for (let n = 0; n < ordered.length; n += 1) {
    await writePage(ordered[n], { prev: ordered[n - 1] || null, next: ordered[n + 1] || null })
  }

  // Home page
  const homeBody = home ? home.body : ''
  const homeRendered = renderMarkdown(homeBody, { resolveLink: (href) => resolveDocLink(href, null) })
  const homeCards = renderChildCards({ children: tree })
  const homePage = layout({
    title: SITE.title,
    description: home?.data.description || SITE.description,
    content:
      '<header class="doc-head doc-head-home"><h1>' +
      escapeHtml(home?.data.title || SITE.title) +
      '</h1>' +
      (home?.data.description ? '<p class="lede">' + escapeHtml(home.data.description) + '</p>' : '') +
      '</header>' +
      homeRendered.html +
      homeCards,
    nav: renderNav(tree, ''),
    breadcrumbs: '',
    pager: renderPager(null, ordered[0] || null),
    isHome: true,
  })
  await fs.writeFile(path.join(OUT_DIR, 'index.html'), homePage)

  // 404 - GitHub Pages serves this for unknown paths.
  const notFound = layout({
    title: 'Page not found',
    description: 'That page does not exist.',
    content:
      '<header class="doc-head"><h1>Page not found</h1><p class="lede">That page has moved or never existed.</p></header>' +
      '<p><a href="' + url('') + '">Go back to the index</a>.</p>',
    nav: renderNav(tree, ''),
    breadcrumbs: '',
    pager: '',
    isHome: false,
  })
  await fs.writeFile(path.join(OUT_DIR, '404.html'), notFound)

  await fs.writeFile(path.join(OUT_DIR, 'search-index.json'), JSON.stringify(searchIndex))
  await copyDir(ASSETS_DIR, path.join(OUT_DIR, 'assets'))
  // Tell GitHub Pages to serve the files as-is rather than running Jekyll over them.
  await fs.writeFile(path.join(OUT_DIR, '.nojekyll'), '')

  const pages = ordered.length + 2
  if (!quiet) {
    process.stdout.write('Built ' + pages + ' pages in ' + (Date.now() - started) + 'ms -> ' + path.relative(process.cwd(), OUT_DIR) + '\n')
    if (BASE) process.stdout.write('Base path: ' + BASE + '\n')
  }
  return { pages, routes: ordered.length + 1 }
}

/** Resolve links written in Markdown. Root-relative links get the base path; relative ones stay relative. */
function resolveDocLink(href, node) {
  if (/^(https?:)?\/\//.test(href) || href.startsWith('#') || href.startsWith('mailto:')) return href
  if (href.startsWith('/')) return url(href)
  return href
}

// ---------------------------------------------------------------- dev server

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
}

async function serve(port = 4321) {
  const server = http.createServer(async (req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    if (BASE && pathname.startsWith(BASE)) pathname = pathname.slice(BASE.length) || '/'
    let file = path.join(OUT_DIR, pathname)
    try {
      const stat = await fs.stat(file).catch(() => null)
      if (!stat || stat.isDirectory()) file = path.join(file, 'index.html')
      const data = await fs.readFile(file)
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
      res.end(data)
    } catch {
      const data = await fs.readFile(path.join(OUT_DIR, '404.html')).catch(() => Buffer.from('Not found'))
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
      res.end(data)
    }
  })
  server.listen(port, () => process.stdout.write('Serving on http://localhost:' + port + (BASE || '') + '/\n'))
}

// Only build when run directly. Importing this module (scripts/, tests) must have
// no side effects.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await buildSite()
  if (process.argv.includes('--serve')) {
    const flagIndex = process.argv.indexOf('--port')
    await serve(flagIndex > -1 ? Number(process.argv[flagIndex + 1]) : 4321)
  }
}

export { serve }
