import test from 'node:test'
import assert from 'node:assert/strict'
import {
  encodeBoard, decodeBoard, SHARE_BUDGET, TAGS, base64urlEncode, base64urlDecode,
} from '../assets/shenzhen/share.js'
import { CIRCUITS } from '../assets/shenzhen/circuits.js'

/*
 * share.js round-trips circuit-board's own toJSON()/load() shape through a
 * URL-safe string — see its module doc. Every fixture here is a plain object
 * in that shape, built by hand rather than through components.js (which
 * touches `document` and cannot load under node) — the same reasoning
 * parts-audit.test.mjs and verify.test.mjs already follow.
 *
 * The trap this file exists to catch (per R12-R15-PLAN.md Task 14.1): an
 * encoder and a decoder written together are easy to make agree with each
 * other while both being wrong — decode(encode(x)) === x still passes if
 * both sides silently drop the same field. So besides the whole-object
 * round trip, the tests below assert specific decoded fields — label, type,
 * side, wire endpoints, program text — against explicit expected values,
 * not merely against whatever the input object happened to hold. The
 * io-terminal fixtures below cover every side x type combination on
 * purpose: a codec that quietly hard-codes one side, or one type, would
 * still pass a test that only ever wired up "left simple" terminals.
 */

/** A minimal two-part, one-wire board. */
function tinyBoard() {
  return {
    cell: 30,
    parts: [
      { tag: 'io-terminal', x: 0, y: 2, code: '', label: 'switch', type: 'simple', side: 'right' },
      { tag: 'mc-4000', x: 3, y: 1, code: '  mov p0 acc\n  slp 1' },
    ],
    wires: [
      { a: [0, 'switch'], b: [1, 'p0'] },
    ],
  }
}

/** Program text designed to break a codec that assumes plain ASCII, a
    single line, or a delimiter that could appear in free text: comments,
    blank-ish content, non-ASCII, and multiple newlines. */
const TRICKY_PROGRAM =
  '# 混合 comment — mixed script, an em dash, and a bell\n' +
  '  mov 100 p1\n' +
  '\n' +
  '# a blank line above this one\n' +
  '  slp 3\n' +
  '# done ⚡'

/** One instance of every placeable part tag, plus an io-terminal for each
    of the four side x type combinations — the specific trap named in the
    plan (drop `side` and a restored terminal resolves the wrong pin). */
function megaboard() {
  const parts = []
  let x = 0
  for (const tag of TAGS) {
    if (tag === 'io-terminal') continue // covered explicitly below
    parts.push({ tag, x: x++, y: 0, code: tag === 'mc-6000' ? TRICKY_PROGRAM : '' })
  }
  const leftSimple = parts.push({ tag: 'io-terminal', x: 0, y: 5, code: '', label: 'left-simple', type: 'simple', side: 'left' }) - 1
  const rightSimple = parts.push({ tag: 'io-terminal', x: 2, y: 5, code: '', label: 'right-simple', type: 'simple', side: 'right' }) - 1
  const leftXbus = parts.push({ tag: 'io-terminal', x: 4, y: 5, code: '', label: 'left-xbus', type: 'xbus', side: 'left' }) - 1
  const rightXbus = parts.push({ tag: 'io-terminal', x: 6, y: 5, code: '', label: 'right-xbus', type: 'xbus', side: 'right' }) - 1
  return {
    cell: 34,
    parts,
    wires: [
      { a: [leftSimple, 'left-simple'], b: [rightSimple, 'right-simple'] },
      { a: [leftXbus, 'left-xbus'], b: [rightXbus, 'right-xbus'] },
    ],
  }
}

/** circuits.js entries key parts on `t`, not `tag`, and hold a wire endpoint
    as "index:pin" strings — exactly the conversion ide.js's own
    specFromBoard()/loadPreset() do. Reproduced here rather than imported so
    this file stays independent of ide.js (which cannot load under node). */
function specToBoardJson(spec) {
  const parts = spec.parts.map((p) => {
    const out = { tag: p.t, x: p.x, y: p.y, code: p.code ?? '' }
    for (const k of ['label', 'type', 'side']) if (p[k] !== undefined) out[k] = p[k]
    return out
  })
  const wires = spec.wires.map(([a, b]) => {
    const [ai, an] = a.split(':')
    const [bi, bn] = b.split(':')
    return { a: [Number(ai), an], b: [Number(bi), bn] }
  })
  return { cell: spec.cell, parts, wires }
}

// ------------------------------------------------------------- base layer

test('base64url encode/decode round-trips arbitrary byte strings, every length mod 4', () => {
  for (let len = 0; len <= 11; len += 1) {
    const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 5) % 256)
    const encoded = base64urlEncode(bytes)
    assert.match(encoded, /^[A-Za-z0-9_-]*$/, `length ${len} produced non-URL-safe output`)
    assert.deepStrictEqual(base64urlDecode(encoded), bytes, `length ${len} did not round-trip`)
  }
})

// --------------------------------------------------------------- round trip

test('a tiny board round-trips whole', () => {
  const board = tinyBoard()
  const decoded = decodeBoard(encodeBoard(board))
  assert.deepStrictEqual(decoded, board)
})

test('the encoded string is URL-safe (share links are pasted into an href)', () => {
  const encoded = encodeBoard(megaboard())
  assert.match(encoded, /^[A-Za-z0-9_-]+$/)
})

test('every part kind round-trips, with wires and program text intact', () => {
  const board = megaboard()
  const decoded = decodeBoard(encodeBoard(board))

  // The trap-avoidance checks: explicit expected values, not a diff against
  // the input object. See the module doc above.
  assert.strictEqual(decoded.parts.length, board.parts.length)
  for (const tag of TAGS) {
    assert.ok(decoded.parts.some((p) => p.tag === tag), `no ${tag} in the decoded board`)
  }

  const byLabel = (label) => decoded.parts.find((p) => p.label === label)
  assert.deepStrictEqual(
    { side: byLabel('left-simple').side, type: byLabel('left-simple').type },
    { side: 'left', type: 'simple' },
  )
  assert.deepStrictEqual(
    { side: byLabel('right-simple').side, type: byLabel('right-simple').type },
    { side: 'right', type: 'simple' },
  )
  assert.deepStrictEqual(
    { side: byLabel('left-xbus').side, type: byLabel('left-xbus').type },
    { side: 'left', type: 'xbus' },
  )
  assert.deepStrictEqual(
    { side: byLabel('right-xbus').side, type: byLabel('right-xbus').type },
    { side: 'right', type: 'xbus' },
  )

  // A part that never had a label/type/side must not gain one on the way
  // back through — the flag byte has to say "absent", not "absent, but
  // let's default it to something".
  const chip = decoded.parts.find((p) => p.tag === 'mc-4000')
  assert.ok(!('label' in chip) && !('type' in chip) && !('side' in chip))

  // Wire endpoints, by value, against the specific pin names named above —
  // not "some wire array of the right length".
  const bySides = (a, b) => decoded.wires.find(
    (w) => (w.a[1] === a && w.b[1] === b) || (w.a[1] === b && w.b[1] === a),
  )
  assert.ok(bySides('left-simple', 'right-simple'), 'simple-pin wire lost')
  assert.ok(bySides('left-xbus', 'right-xbus'), 'xbus-pin wire lost')

  // Program text, exactly — newlines, a `#` comment, a blank line and
  // non-ASCII all included.
  assert.strictEqual(decoded.parts.find((p) => p.tag === 'mc-6000').code, TRICKY_PROGRAM)

  assert.strictEqual(decoded.cell, board.cell)
})

test('a shipped circuit (AN650) round-trips and fits comfortably under budget', () => {
  const board = specToBoardJson(CIRCUITS.an650)
  const encoded = encodeBoard(board)
  const decoded = decodeBoard(encoded)
  assert.deepStrictEqual(decoded, board)
  assert.ok(
    encoded.length <= SHARE_BUDGET,
    `AN650 encoded to ${encoded.length} chars, over the ${SHARE_BUDGET}-char budget`,
  )
})

// ------------------------------------------------------------------ budget

test('a large board exceeds SHARE_BUDGET — the codec does not silently shrink it', () => {
  const bigProgram = Array.from({ length: 14 }, (_, i) => `# line ${i} of a long, deliberately verbose comment`).join('\n')
  const parts = Array.from({ length: 10 }, (_, i) => ({ tag: 'mc-6000', x: i, y: 0, code: bigProgram }))
  const encoded = encodeBoard({ cell: 30, parts, wires: [] })
  assert.ok(
    encoded.length > SHARE_BUDGET,
    `expected this board to exceed ${SHARE_BUDGET} chars, got ${encoded.length}`,
  )
  // And it still round-trips — going over budget is a UI decision (ide.js
  // refuses to hand back a URL), not a codec failure.
  assert.deepStrictEqual(decodeBoard(encoded).parts.length, parts.length)
})

// -------------------------------------------------------------- corruption

test('decodeBoard rejects a share link from a different codec version', () => {
  const encoded = encodeBoard(tinyBoard())
  const bytes = base64urlDecode(encoded)
  bytes[0] = 99 // version byte
  const corrupted = base64urlEncode(bytes)
  assert.throws(() => decodeBoard(corrupted), /version/)
})

test('decodeBoard rejects a truncated share link', () => {
  const encoded = encodeBoard(megaboard())
  assert.throws(() => decodeBoard(encoded.slice(0, 12)), /share:/)
})

test('decodeBoard rejects a string with characters outside the base64url alphabet', () => {
  assert.throws(() => decodeBoard('not a valid share link!!'), /share:/)
})

test('encodeBoard rejects an unknown part tag rather than dropping it silently', () => {
  assert.throws(
    () => encodeBoard({ cell: 30, parts: [{ tag: 'not-a-real-part', x: 0, y: 0, code: '' }], wires: [] }),
    /unknown part tag/,
  )
})
