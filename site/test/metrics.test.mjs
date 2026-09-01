import test from 'node:test'
import assert from 'node:assert/strict'
import { productionCost, linesOfCode, totalPower } from '../assets/shenzhen/metrics.js'

// ------------------------------------------------------------- empty/nullish

test('all three metrics return 0 for null, undefined and an empty array', () => {
  for (const empty of [null, undefined, []]) {
    assert.equal(productionCost(empty), 0)
    assert.equal(linesOfCode(empty), 0)
    assert.equal(totalPower(empty), 0)
  }
})

// --------------------------------------------------------------------- cost

test('productionCost sums real tags, treats io-terminal as free, and ignores an unknown tag', () => {
  const parts = [
    { tag: 'mc-4000' }, // cost 3
    { tag: 'dx-300' }, // cost 1
    { tag: 'io-terminal' }, // cost 0
    { tag: 'not-a-real-part' }, // absent from PART_META
  ]
  assert.equal(productionCost(parts), 4)
})

// ---------------------------------------------------------------- lines of code

test('linesOfCode counts only lines that parse to an instruction', () => {
  // Comment, blank, bare label, label+instruction, conditional marker,
  // plain instruction. mc-4000 has no line limit that trims this program.
  const code = [
    '# a comment, not an instruction',
    '',
    'l:',
    'k: mov 1 p1',
    '+ mov 2 p1',
    '  slp 1',
  ].join('\n')
  assert.equal(linesOfCode([{ tag: 'mc-4000', code }]), 3, 'only k:, +, and slp are executable')
})

test('linesOfCode drops lines past the chip line limit', () => {
  // mc-4000's limit is 9 lines. Twelve real instructions in, only 9 count.
  const code = Array.from({ length: 12 }, (_, i) => `  mov ${i} p1`).join('\n')
  assert.equal(linesOfCode([{ tag: 'mc-4000', code }]), 9)
})

test('linesOfCode contributes 0 for a part with no code and for an unknown tag', () => {
  assert.equal(linesOfCode([{ tag: 'mc-4000' }, { tag: 'not-a-real-part', code: '  mov 1 p1' }]), 0)
})

test('linesOfCode sums across several parts', () => {
  const parts = [
    { tag: 'mc-4000', code: '  mov 1 p1\n  slp 1' }, // 2
    { tag: 'dx-300', code: '# no-op, dx-300 has no program of its own' }, // 0
    { tag: 'mc-4000x', code: '  slx x0\n  mov x0 acc\n  mov acc x2' }, // 3
  ]
  assert.equal(linesOfCode(parts), 5)
})

// ------------------------------------------------------------------- power

test('totalPower sums power across a snapshot, treating missing or non-finite entries as 0', () => {
  const snapshot = [
    { id: 0, tag: 'mc-4000', power: 4 },
    { id: 1, tag: 'io-terminal' }, // no chip -> no power field at all
    { id: 2, tag: 'mc-4000', power: NaN },
    { id: 3, tag: 'mc-4000', power: Infinity },
    { id: 4, tag: 'mc-4000', power: 6 },
  ]
  assert.equal(totalPower(snapshot), 10)
})
