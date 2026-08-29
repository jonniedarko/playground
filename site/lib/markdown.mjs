/**
 * A small, dependency-free Markdown renderer.
 *
 * It covers the subset the docs actually use: headings, paragraphs, lists,
 * tables, fenced code, blockquotes/callouts, rules, images and the usual
 * inline spans. It is deliberately not a full CommonMark implementation - if a
 * page needs something exotic, a raw HTML block passes through untouched.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Placeholder marker for protected inline code. Uses a private-use codepoint so it cannot collide with page text. */
const CODE_MARK = '\ue000'

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ESCAPES[c])
}

export function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

/** Split `---` front matter off the top of a file. Values are plain strings, numbers or booleans. */
export function parseFrontMatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source)
  if (!match) return { data: {}, body: source }

  const data = {}
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim())
    if (!pair) continue
    let value = pair[2].trim().replace(/^["'](.*)["']$/, '$1')
    if (value === 'true') value = true
    else if (value === 'false') value = false
    else if (value !== '' && !Number.isNaN(Number(value))) value = Number(value)
    data[pair[1]] = value
  }
  return { data, body: source.slice(match[0].length) }
}

const CALLOUTS = {
  NOTE: { label: 'Note', kind: 'note' },
  TIP: { label: 'Tip', kind: 'tip' },
  WARNING: { label: 'Warning', kind: 'warning' },
  SPEC: { label: 'Specification', kind: 'spec' },
}

/**
 * Render markdown to HTML.
 * Returns the HTML plus the h2/h3 headings found, so pages can build a table of contents.
 */
export function renderMarkdown(source, options = {}) {
  const resolve = options.resolveLink || ((href) => href)
  const lines = source.replace(/\r\n/g, '\n').replace(/\t/g, '    ').split('\n')
  const out = []
  const headings = options.headings || []
  const usedSlugs = options.usedSlugs || new Map()
  const nested = Object.assign({}, options, { headings, usedSlugs })

  const uniqueSlug = (text) => {
    const base = slugify(text) || 'section'
    const seen = usedSlugs.get(base) || 0
    usedSlugs.set(base, seen + 1)
    return seen === 0 ? base : base + '-' + (seen + 1)
  }

  const inline = (text) => renderInline(text, resolve)

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i += 1
      continue
    }

    // Fenced code block
    const fence = /^\s*(`{3,}|~{3,})\s*([\w-]*)\s*$/.exec(line)
    if (fence) {
      const closer = fence[1][0] === '`' ? /^\s*`{3,}\s*$/ : /^\s*~{3,}\s*$/
      const lang = fence[2]
      const buf = []
      i += 1
      while (i < lines.length && !closer.test(lines[i])) {
        buf.push(lines[i])
        i += 1
      }
      i += 1
      const cls = lang ? ' class="language-' + escapeHtml(lang) + '"' : ''
      out.push(
        '<div class="code-block" data-lang="' +
          escapeHtml(lang || 'text') +
          '"><button class="copy-btn" type="button" data-copy>Copy</button><pre><code' +
          cls +
          '>' +
          escapeHtml(buf.join('\n')) +
          '</code></pre></div>'
      )
      continue
    }

    // ATX heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const text = heading[2].replace(/\s+#+\s*$/, '')
      const id = uniqueSlug(text)
      if (level >= 2 && level <= 3) headings.push({ level, text: stripInline(text), id })
      out.push(
        '<h' +
          level +
          ' id="' +
          id +
          '">' +
          inline(text) +
          '<a class="anchor" href="#' +
          id +
          '" aria-label="Link to this section">#</a></h' +
          level +
          '>'
      )
      i += 1
      continue
    }

    // Thematic break
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr />')
      i += 1
      continue
    }

    // Table: a header row followed by a delimiter row
    if (isTableStart(lines, i)) {
      const header = splitRow(line)
      const aligns = splitRow(lines[i + 1]).map((cell) => {
        const left = cell.startsWith(':')
        const right = cell.endsWith(':')
        if (left && right) return 'center'
        if (right) return 'right'
        return ''
      })
      i += 2
      const rows = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]))
        i += 1
      }
      const align = (n) => (aligns[n] ? ' style="text-align:' + aligns[n] + '"' : '')
      const head = header.map((cell, n) => '<th' + align(n) + '>' + inline(cell) + '</th>').join('')
      const body = rows
        .map((row) => '<tr>' + row.map((cell, n) => '<td' + align(n) + '>' + inline(cell) + '</td>').join('') + '</tr>')
        .join('')
      out.push('<div class="table-wrap"><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>')
      continue
    }

    // Blockquote / callout
    if (/^\s*>/.test(line)) {
      const buf = []
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      let kind = 'quote'
      let label = ''
      const tag = /^\[!([A-Z]+)\]\s*(.*)$/.exec(buf[0] || '')
      if (tag && CALLOUTS[tag[1]]) {
        kind = CALLOUTS[tag[1]].kind
        label = tag[2].trim() || CALLOUTS[tag[1]].label
        buf[0] = ''
      }
      const inner = renderMarkdown(buf.join('\n'), nested).html
      const title = label ? '<p class="callout-title">' + inline(label) + '</p>' : ''
      out.push('<blockquote class="callout callout-' + kind + '">' + title + inner + '</blockquote>')
      continue
    }

    // Lists
    if (isListItem(line)) {
      const built = renderList(lines, i, inline, nested)
      out.push(built.html)
      i = built.next
      continue
    }

    // Raw HTML block
    if (/^\s*<[A-Za-z/]/.test(line)) {
      const buf = []
      while (i < lines.length && lines[i].trim()) {
        buf.push(lines[i])
        i += 1
      }
      out.push(buf.join('\n'))
      continue
    }

    // Paragraph
    const para = []
    while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines, i))) {
      para.push(lines[i].trim())
      i += 1
    }
    out.push('<p>' + inline(para.join(' ')) + '</p>')
  }

  return { html: out.join('\n'), headings }
}

function isTableStart(lines, i) {
  return (
    lines[i].includes('|') &&
    i + 1 < lines.length &&
    /\|/.test(lines[i + 1]) &&
    /^[\s:|-]+$/.test(lines[i + 1]) &&
    /-/.test(lines[i + 1])
  )
}

function isBlockStart(lines, i) {
  const line = lines[i]
  if (/^\s*(`{3,}|~{3,})/.test(line)) return true
  if (/^#{1,6}\s/.test(line)) return true
  if (/^\s*>/.test(line)) return true
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return true
  if (isListItem(line)) return true
  if (isTableStart(lines, i)) return true
  return false
}

function isListItem(line) {
  return /^\s*([-*+]|\d+[.)])\s+/.test(line)
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

/** Build one (possibly nested) list starting at `start`. Nesting is driven by indentation. */
function renderList(lines, start, inline, options) {
  const first = /^(\s*)([-*+]|\d+[.)])\s+/.exec(lines[start])
  const baseIndent = first[1].length
  const ordered = /\d/.test(first[2])
  const items = []
  let i = start

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      const next = lines[i + 1]
      if (next && (isListItem(next) || /^\s{2,}\S/.test(next))) {
        i += 1
        continue
      }
      break
    }
    const match = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (match && match[1].length <= baseIndent + 1) {
      items.push({ content: [match[3]] })
      i += 1
      continue
    }
    if (!items.length) break
    const indent = /^(\s*)/.exec(line)[1].length
    if (indent > baseIndent) {
      items[items.length - 1].content.push(line.slice(Math.min(indent, baseIndent + 2)))
      i += 1
      continue
    }
    break
  }

  const body = items
    .map((item) => {
      const text = item.content.join('\n')
      const hasBlock = item.content.slice(1).some((l) => isListItem(l) || /^\s*(`{3,}|>)/.test(l) || l.includes('|'))
      if (hasBlock) return '<li>' + renderMarkdown(text, options).html + '</li>'
      return '<li>' + inline(text.replace(/\n\s*/g, ' ').trim()) + '</li>'
    })
    .join('')

  const tag = ordered ? 'ol' : 'ul'
  return { html: '<' + tag + '>' + body + '</' + tag + '>', next: i }
}

function stripInline(text) {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
}

function renderInline(text, resolve) {
  // Protect code spans first so their contents are never treated as markup.
  const codes = []
  let work = String(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code)
    return CODE_MARK + (codes.length - 1) + CODE_MARK
  })

  work = escapeHtml(work)

  work = work
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => '<img src="' + resolve(src) + '" alt="' + alt + '" loading="lazy" />')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      const url = resolve(href)
      const attrs = /^https?:\/\//.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''
      return '<a href="' + url + '"' + attrs + '>' + label + '</a>'
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')

  const marker = new RegExp(CODE_MARK + '(\\d+)' + CODE_MARK, 'g')
  return work.replace(marker, (_, n) => '<code>' + escapeHtml(codes[Number(n)]) + '</code>')
}
