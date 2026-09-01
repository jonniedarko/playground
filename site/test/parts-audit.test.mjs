import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  registeredTags, isValidTagName, auditParts, auditCircuits, auditFigures, pinNames,
} from '../scripts/lib/parts-audit.mjs'
import { PART_META } from '../assets/shenzhen/parts.js'
import CIRCUITS from '../assets/shenzhen/circuits.js'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const NOT_PARTS = ['circuit-board', 'scope-trace']

/* ---------------------------------------------------------------- tag names */

test('a custom element name needs a hyphen', () => {
  assert.equal(isValidTagName('lx-700'), true)
  assert.equal(isValidTagName('mc-4000x'), true)
  assert.equal(isValidTagName('d80c010-f'), true)
  // The exact shape that threw inside customElements.define and took the whole
  // module with it, leaving every part on the page a fallback.
  assert.equal(isValidTagName('lx700'), false)
  assert.equal(isValidTagName('nlp2'), false)
  assert.equal(isValidTagName(''), false)
})

test('registeredTags finds both literal defines and the data-driven list', () => {
  const tags = registeredTags(`
    customElements.define('circuit-board', CircuitBoard);
    customElements.define('mc-4000', MC4000);
    const FIXED_PARTS = [
      'dt-2415', 'c2s-rf901',
      'nlp-2',
    ];
  `)
  assert.deepEqual([...tags].sort(), ['c2s-rf901', 'circuit-board', 'dt-2415', 'mc-4000', 'nlp-2'])
})

/* -------------------------------------------------------------------- parts */

test('auditParts reports metadata with no component, and the reverse', () => {
  const meta = { 'mc-4000': {}, 'gone-away': {} }
  const tags = new Set(['mc-4000', 'stray-part'])
  const found = auditParts({ meta, tags })

  assert.equal(found.some((p) => p.includes('"gone-away"') && p.includes('never registered')), true)
  assert.equal(found.some((p) => p.includes('"stray-part"') && p.includes('absent from PART_META')), true)
  assert.equal(found.some((p) => p.includes('mc-4000')), false)
})

test('auditParts ignores the elements that are chrome rather than parts', () => {
  const found = auditParts({
    meta: {}, tags: new Set(['circuit-board']), ignore: ['circuit-board'],
  })
  assert.deepEqual(found, [])
})

/* ----------------------------------------------------------------- circuits */

test('pinNames resolves an io-terminal from its label, not its metadata', () => {
  const meta = { 'io-terminal': { pins: [{ name: 'io' }] } }
  assert.deepEqual([...pinNames({ t: 'io-terminal', label: 'lamp' }, meta)], ['lamp'])
  assert.deepEqual([...pinNames({ t: 'io-terminal' }, meta)], ['io'])
})

test('auditCircuits catches a wire naming a pin the part does not have', () => {
  // The bug that actually shipped: the program wrote to a0 and d0, which are
  // the memory's pin names. The chip reaches them through x3 and x2.
  const meta = {
    'mc-6000': { pins: [{ name: 'x0' }, { name: 'x2' }] },
    'p-100p14': { pins: [{ name: 'a0' }, { name: 'd0' }] },
  }
  const circuits = {
    broken: {
      parts: [{ t: 'mc-6000' }, { t: 'p-100p14' }],
      wires: [['0:a0', '1:a0']],
    },
  }
  const found = auditCircuits({ circuits, meta })
  assert.equal(found.length, 1)
  assert.match(found[0], /mc-6000 has no pin "a0"/)
  // The message has to name the alternatives, or it just says "wrong".
  assert.match(found[0], /has x0, x2/)
})

test('auditCircuits catches an out-of-range part index and an unknown part', () => {
  const meta = { 'mc-4000': { pins: [{ name: 'x0' }] } }
  const found = auditCircuits({
    circuits: {
      bad: { parts: [{ t: 'mc-4000' }, { t: 'no-such-part' }], wires: [['0:x0', '7:x0']] },
    },
    meta,
  })
  assert.equal(found.some((p) => p.includes('unknown part "no-such-part"')), true)
  assert.equal(found.some((p) => p.includes('no part at index 7')), true)
})

/* ------------------------------------------------------------------ figures */

test('auditFigures catches a figure naming a part or circuit that does not exist', () => {
  const found = auditFigures({
    sources: [{ file: 'a.md', text: '<div data-part="dt-2416"></div><div data-circuit="nope"></div>' }],
    tags: new Set(['dt-2415']),
    circuits: { an650: {} },
  })
  assert.equal(found.length, 2)
  assert.match(found[0], /part "dt-2416"/)
  assert.match(found[1], /circuit "nope"/)
})

/* --------------------------------------------------------- the real content */
/* The audits above prove the rules. These prove the site currently obeys them,
   without needing a browser to find out. */

test('every part in the real catalogue is registered and validly named', async () => {
  const source = await fs.readFile(path.join(ROOT, 'assets/shenzhen/components.js'), 'utf8')
  assert.deepEqual(
    auditParts({ meta: PART_META, tags: registeredTags(source), ignore: NOT_PARTS }), [])
})

test('every wire in every shipped circuit names a pin that exists', () => {
  assert.deepEqual(auditCircuits({ circuits: CIRCUITS, meta: PART_META }), [])
})
