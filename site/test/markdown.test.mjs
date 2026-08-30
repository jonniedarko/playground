import test from 'node:test'
import assert from 'node:assert/strict'
import { parseFrontMatter, renderMarkdown, slugify, escapeHtml } from '../lib/markdown.mjs'

const html = (src, opts) => renderMarkdown(src, opts).html

test('front matter parses scalars, numbers and booleans', () => {
  const { data, body } = parseFrontMatter(
    ['---', 'title: Quick start', 'order: 3', 'board: true', 'icon: "🚀"', '---', '', 'Body text.'].join('\n')
  )
  assert.equal(data.title, 'Quick start')
  assert.equal(data.order, 3)
  assert.equal(data.board, true)
  assert.equal(data.icon, '🚀')
  assert.equal(body.trim(), 'Body text.')
})

test('front matter is optional', () => {
  const { data, body } = parseFrontMatter('# Just a heading\n')
  assert.deepEqual(data, {})
  assert.equal(body, '# Just a heading\n')
})

test('headerless table emits no thead', () => {
  // `| | |` is how the cheat sheet writes a lookup table. An empty <thead> drew
  // a grey strip above it, so the renderer now omits it.
  const out = html('| | |\n| --- | --- |\n| `mov` | copy |')
  assert.ok(out.includes('<table>'), 'renders a table')
  assert.ok(!out.includes('<thead>'), 'no thead for an all-empty header row')
  assert.ok(out.includes('<td><code>mov</code></td>'))
})

test('table with a real header keeps its thead', () => {
  const out = html('| A | B |\n| --- | --- |\n| 1 | 2 |')
  assert.ok(out.includes('<thead>'))
  assert.ok(out.includes('<th>A</th>'))
})

test('table alignment is honoured', () => {
  const out = html('| A | B | C |\n| :--- | ---: | :---: |\n| 1 | 2 | 3 |')
  assert.ok(out.includes('style="text-align:right"'))
  assert.ok(out.includes('style="text-align:center"'))
})

test('inline code is protected from markup and escaped', () => {
  const out = html('Use `a **b** <c>` here.')
  assert.ok(out.includes('<code>a **b** &lt;c&gt;</code>'), out)
  assert.ok(!out.includes('<strong>'), 'no bold inside a code span')
})

test('fenced code is not treated as markdown', () => {
  const out = html('```asm\n+ mov 100 p1\n# not a heading\n```')
  assert.ok(out.includes('<pre><code class="language-asm">'))
  assert.ok(out.includes('+ mov 100 p1'))
  assert.ok(!out.includes('<h1'), 'a # inside a fence is not a heading')
})

test('callouts render with a title and nested content', () => {
  const out = html('> [!WARNING]\n> Careful.\n>\n> - one\n> - two')
  assert.ok(out.includes('callout callout-warning'))
  assert.ok(out.includes('<p class="callout-title">Warning</p>'))
  assert.ok(out.includes('<li>one</li>'))
})

test('plain blockquote is not a callout', () => {
  const out = html('> Just a quote.')
  assert.ok(out.includes('callout-quote'))
  assert.ok(!out.includes('callout-title'))
})

test('headings get unique slugs and are collected for the TOC', () => {
  const { html: out, headings } = renderMarkdown('## acc\n\ntext\n\n## acc\n\nmore')
  assert.deepEqual(headings.map((h) => h.id), ['acc', 'acc-2'])
  assert.ok(out.includes('id="acc"'))
  assert.ok(out.includes('id="acc-2"'))
})

test('h1 and h4 are excluded from the TOC', () => {
  const { headings } = renderMarkdown('# Title\n\n## Section\n\n#### Aside')
  assert.deepEqual(headings.map((h) => h.text), ['Section'])
})

test('links resolve through resolveLink and external links get rel', () => {
  const out = html('[a](/x/) and [b](https://example.com)', {
    resolveLink: (href) => (href.startsWith('/') ? '/base' + href : href),
  })
  assert.ok(out.includes('href="/base/x/"'))
  assert.ok(out.includes('rel="noopener noreferrer"'))
  assert.ok(!out.includes('href="/base/https'), 'external links are left alone')
})

test('nested lists nest', () => {
  const out = html('- one\n- two\n  - inner a\n  - inner b')
  assert.match(out, /<li>two<ul><li>inner a<\/li><li>inner b<\/li><\/ul><\/li>/)
})

test('raw HTML blocks pass through untouched', () => {
  const src = '<div class="pinout" role="img" aria-label="x">\n<span class="pin pin-x">x0</span>\n</div>'
  assert.ok(html(src).includes('<span class="pin pin-x">x0</span>'))
})

test('slugify strips punctuation and collapses separators', () => {
  assert.equal(slugify('AN268: Two interfaces!'), 'an268-two-interfaces')
  assert.equal(slugify('`acc` and `dat`'), 'acc-and-dat')
})

test('escapeHtml covers the five entities', () => {
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;')
})
