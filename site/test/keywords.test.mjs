import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { KEYWORD_HASHES, keywordHash } from '../assets/shenzhen/keywords.js'
import { Machine } from '../assets/shenzhen/sim.js'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CONTENT = path.join(ROOT, 'content/shenzhen-io')

/** Every `| `102 113` | MURDER |` row on a page, as [keyword, [a, b]]. */
function hashRows(markdown) {
  const rows = []
  for (const line of markdown.split('\n')) {
    const m = /^\|\s*`(\d{3})\s+(\d{3})`\s*\|\s*(.+?)\s*\|\s*$/.exec(line)
    if (m) rows.push([m[3], [Number(m[1]), Number(m[2])]])
  }
  return rows
}

/* The hashes exist twice: printed on the TV keyword list for a reader, and in
   keywords.js for the simulator. Nothing but this test stops the two drifting,
   and a page that disagrees with the part it documents is worse than either. */

test('keywords.js matches the TV keyword list page, exactly, both ways', async () => {
  const page = await fs.readFile(path.join(CONTENT, 'supplemental/tv-keywords.md'), 'utf8')
  const rows = hashRows(page)
  assert.equal(rows.length, 24, 'the page still lists 24 keywords')

  for (const [word, pair] of rows) {
    assert.deepEqual(keywordHash(word), pair, `${word} disagrees with the page`)
  }

  // And nothing in the table that the manual does not publish. The datasheet
  // contributes its own two examples; everything else must come off the page.
  const published = new Set([...rows.map(([w]) => w), 'RAVEN', 'DYNAMICS'])
  for (const word of Object.keys(KEYWORD_HASHES)) {
    assert.ok(published.has(word), `"${word}" is in keywords.js but not in the manual`)
  }
  assert.equal(Object.keys(KEYWORD_HASHES).length, published.size, 'no keyword is missing')
})

test('the two examples in the NLP2 datasheet are the ones the datasheet gives', async () => {
  const page = await fs.readFile(path.join(CONTENT, 'parts/specialist-parts.md'), 'utf8')
  assert.match(page, /"Raven" hashes to `271 390`/, 'the page still states this example')
  assert.match(page, /"Dynamics" to\s+`109 874`/, 'the page still states this example')
  assert.deepEqual(keywordHash('Raven'), [271, 390])
  assert.deepEqual(keywordHash('Dynamics'), [109, 874])
})

test('a word the manual does not publish has no hash, and is not invented', () => {
  assert.equal(keywordHash('BANANA'), null)
  assert.equal(keywordHash(''), null)
  // These are inherited Object properties. Upper-casing the lookup is what
  // actually keeps them out - there is no all-caps name on Object.prototype -
  // so this pins that, not the hasOwnProperty guard behind it, which no input
  // reaching this function can currently exercise.
  assert.equal(keywordHash('constructor'), null)
  assert.equal(keywordHash('toString'), null)
})

test('keywordHash is case- and space-insensitive, since the pages print capitals', () => {
  assert.deepEqual(keywordHash('emperor'), [711, 573])
  assert.deepEqual(keywordHash('  Emperor  '), [711, 573])
  assert.deepEqual(keywordHash('tennis racket'), [526, 367])
})

/* ------------------------------------------------------------------ the part */

const nlpRig = () => new Machine({
  parts: [
    { t: 'mc-6000', x: 0, y: 0, code: '  mov x0 dat\n  mov x0 acc\n  slp 9' },
    { t: 'nlp-2', x: 8, y: 0 },
  ],
  wires: [['0:x0', '1:keywords']],
})

test('NLP2 reports a keyword as two 3-digit values, in order', () => {
  const m = nlpRig()
  m.hearKeyword('EMPEROR')
  m.advance()
  assert.equal(m.parts[0].chip.regs.dat, 711, 'first half of the pair')
  assert.equal(m.parts[0].chip.regs.acc, 573, 'then the second')
})

test('NLP2 reads -999 when nothing was heard, without blocking the chip', () => {
  const m = nlpRig()
  m.advance()
  assert.equal(m.parts[0].chip.regs.dat, -999)
  assert.notEqual(m.parts[0].chip.state, 'block', 'the buffer is non-blocking')
})

test('NLP2 queues keywords and hands each half over exactly once', () => {
  const m = new Machine({
    parts: [
      { t: 'mc-6000', x: 0, y: 0, code: '  mov x0 dat\n  mov x0 dat\n  mov x0 dat\n  mov x0 acc\n  slp 9' },
      { t: 'nlp-2', x: 8, y: 0 },
    ],
    wires: [['0:x0', '1:keywords']],
  })
  m.hearKeyword('RAVEN')
  m.hearKeyword('DYNAMICS')
  m.advance()
  // Four reads across two keywords: 271, 390, 109, then 874.
  assert.equal(m.parts[0].chip.regs.dat, 109, 'the third read is the next keyword')
  assert.equal(m.parts[0].chip.regs.acc, 874, 'and the fourth is its second half')
  assert.deepEqual(m.parts[1].heard, [], 'everything queued was consumed')
})

test('NLP2 refuses a keyword the manual does not publish', () => {
  const m = nlpRig()
  assert.throws(() => m.hearKeyword('BANANA'), /publishes no hash/)
  // But a caller with a pair from somewhere else can still queue it.
  m.hear(123, 456)
  m.advance()
  assert.equal(m.parts[0].chip.regs.dat, 123)
})
