import test from 'node:test'
import assert from 'node:assert/strict'
import { Machine } from '../assets/shenzhen/sim.js'
import { DEVICES } from '../assets/shenzhen/devices.js'
import { PART_META } from '../assets/shenzhen/parts.js'

test('every DEVICES tag exists in PART_META', () => {
  for (const tag of Object.keys(DEVICES)) {
    assert.ok(tag in PART_META, `${tag} is in DEVICES but not PART_META`)
  }
})

test('dx-300 has a device entry', () => {
  assert.ok(DEVICES['dx-300'])
})

test('both memories have a device entry', () => {
  assert.ok(DEVICES['p-100p14'])
  assert.ok(DEVICES['p-200p14'])
})

test('io-terminal has a device entry', () => {
  assert.ok(DEVICES['io-terminal'])
})

test('all four gates have a device entry', () => {
  assert.ok(DEVICES['lc-70g04'])
  assert.ok(DEVICES['lc-70g08'])
  assert.ok(DEVICES['lc-70g32'])
  assert.ok(DEVICES['lc-70g86'])
})

// ------------------------------------------------------------- d80c010-f

test('D80C010-F returns its stored identification value on both pins', () => {
  // Read through the device directly, not through a chip register: acc and
  // every other MCxxxx register clamps to 999, which would silently hide a
  // 1000 regardless of what the device actually serves.
  const m = new Machine({ parts: [{ t: 'd80c010-f', x: 0, y: 0 }] })
  const part = m.parts[0]
  const device = DEVICES['d80c010-f']
  assert.equal(device.canServe(m, part, 'read0'), true)
  assert.equal(device.canServe(m, part, 'read1'), true)
  assert.equal(device.serve(m, part, 'read0'), 1000, 'read0 gives the identification value')
  assert.equal(device.serve(m, part, 'read1'), 1000, 'read1 gives the same identification value')
})

// ----------------------------------------------------------------- mc-4010

/** Wires a single chip's x0 to the MC4010 and runs `code`, returning its acc. */
const mc4010Result = (code) => {
  const m = new Machine({
    parts: [
      { t: 'mc-4000x', x: 0, y: 0, code: `${code}\n  slp 9` },
      { t: 'mc-4010', x: 8, y: 0 },
    ],
    wires: [['0:x0', '1:x0']],
  })
  m.advance()
  return m.parts[0].chip.regs.acc
}

test('MC4010 Set: 10 A -> A', () => {
  assert.equal(mc4010Result('  mov 10 x0\n  mov 7 x0\n  mov x0 acc'), 7)
})

test('MC4010 Add: 20 A B -> A + B', () => {
  assert.equal(mc4010Result('  mov 20 x0\n  mov 3 x0\n  mov 4 x0\n  mov x0 acc'), 7)
})

test('MC4010 Subtract: 30 A B -> A - B', () => {
  assert.equal(mc4010Result('  mov 30 x0\n  mov 10 x0\n  mov 4 x0\n  mov x0 acc'), 6)
})

test('MC4010 Multiply: 40 A B -> A x B', () => {
  assert.equal(mc4010Result('  mov 40 x0\n  mov 6 x0\n  mov 7 x0\n  mov x0 acc'), 42)
})

test('MC4010 Divide: 50 A B -> A / B (the page\'s own worked example)', () => {
  assert.equal(mc4010Result('  mov 50 x0\n  mov 20 x0\n  mov 4 x0\n  mov x0 acc'), 5)
})

test('MC4010 Remainder: 51 A B -> remainder of A / B, negative if A was negative', () => {
  assert.equal(mc4010Result('  mov 51 x0\n  mov -7 x0\n  mov 3 x0\n  mov x0 acc'), -1)
})

test('MC4010 Modulus: 60 A B -> A mod B, negative if B was negative', () => {
  assert.equal(mc4010Result('  mov 60 x0\n  mov 7 x0\n  mov -3 x0\n  mov x0 acc'), -2)
})

test('MC4010 Exponent: 70 A B -> A to the power of B', () => {
  assert.equal(mc4010Result('  mov 70 x0\n  mov 2 x0\n  mov 5 x0\n  mov x0 acc'), 32)
})

test('MC4010 Square root: 80 A -> sqrt(A), rounded down', () => {
  assert.equal(mc4010Result('  mov 80 x0\n  mov 50 x0\n  mov x0 acc'), 7)
})

test('MC4010 Min: 90 A B -> smaller of A and B', () => {
  assert.equal(mc4010Result('  mov 90 x0\n  mov -3 x0\n  mov 5 x0\n  mov x0 acc'), -3)
})

test('MC4010 Max: 91 A B -> larger of A and B', () => {
  assert.equal(mc4010Result('  mov 91 x0\n  mov -3 x0\n  mov 5 x0\n  mov x0 acc'), 5)
})

test('MC4010 result is readable any number of times, from any pin', () => {
  const m = new Machine({
    parts: [
      { t: 'mc-4000x', x: 0, y: 0, code: '  mov 20 x0\n  mov 3 x0\n  mov 4 x0\n  mov x0 acc\n  mov x0 acc\n  slp 9' },
      { t: 'mc-4010', x: 8, y: 0 },
    ],
    wires: [['0:x0', '1:x0']],
  })
  m.advance()
  assert.equal(m.parts[0].chip.regs.acc, 7, 'reading twice still gives the same result')
})

/* The datasheet's table stops at the well-behaved cases. These are the ones it
   leaves unstated, pinned so a later change has to be deliberate. The values
   themselves are not from the page; what matters is that none of them is NaN,
   which would poison every comparison a chip made on the result afterwards. */

test('MC4010 sign rules are two different conventions, not one', () => {
  // The trap: JS `%` matches remainder and does NOT match modulus, so an
  // implementation using it for both passes the first pair and fails these.
  const remainder = (a, b) => mc4010Result(`  mov 51 x0\n  mov ${a} x0\n  mov ${b} x0\n  mov x0 acc`)
  const modulus = (a, b) => mc4010Result(`  mov 60 x0\n  mov ${a} x0\n  mov ${b} x0\n  mov x0 acc`)

  assert.equal(remainder(-7, 3), -1, 'remainder follows the sign of A')
  assert.equal(remainder(7, -3), 1, 'remainder follows the sign of A')
  assert.equal(modulus(7, -3), -2, 'modulus follows the sign of B')
  assert.equal(modulus(-7, 3), 2, 'modulus follows the sign of B')
})

test('MC4010 never produces NaN from a case the datasheet omits', () => {
  const cases = [
    ['divide by zero', '  mov 50 x0\n  mov 7 x0\n  mov 0 x0\n  mov x0 acc'],
    ['zero over zero', '  mov 50 x0\n  mov 0 x0\n  mov 0 x0\n  mov x0 acc'],
    ['remainder by zero', '  mov 51 x0\n  mov 7 x0\n  mov 0 x0\n  mov x0 acc'],
    ['modulus by zero', '  mov 60 x0\n  mov 7 x0\n  mov 0 x0\n  mov x0 acc'],
    ['square root of a negative', '  mov 80 x0\n  mov -4 x0\n  mov x0 acc'],
  ]
  for (const [name, code] of cases) {
    assert.equal(mc4010Result(code), 0, `${name} settles to 0`)
  }
})

test('MC4010 divide truncates toward zero, like every other register write', () => {
  assert.equal(mc4010Result('  mov 50 x0\n  mov -7 x0\n  mov 2 x0\n  mov x0 acc'), -3)
  assert.equal(mc4010Result('  mov 50 x0\n  mov 7 x0\n  mov 2 x0\n  mov x0 acc'), 3)
})

test('MC4010 clamps a result that overflows the register range', () => {
  assert.equal(mc4010Result('  mov 70 x0\n  mov 2 x0\n  mov 20 x0\n  mov x0 acc'), 999)
})

test('MC4010 ignores a value that is not an opcode rather than jamming', () => {
  // A stray write must not leave the buffer permanently out of step: the very
  // next complete sequence still has to work.
  assert.equal(mc4010Result('  mov 99 x0\n  mov 20 x0\n  mov 3 x0\n  mov 4 x0\n  mov x0 acc'), 7)
})
