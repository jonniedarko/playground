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

// -------------------------------------------------------------- canServe

// Task 1 left these returning true unconditionally, which was harmless only
// because every pin they were ever actually asked about was one they serve.
// Step 7 tightens them: a foreign pin name must now read as "nothing to
// serve", not "sure, here you go".
test('every existing canServe refuses a pin it does not serve', () => {
  const m = new Machine({ parts: [{ t: 'dx-300', x: 0, y: 0 }] })
  assert.equal(DEVICES['dx-300'].canServe(m, m.parts[0], 'bogus'), false)

  const mem = new Machine({ parts: [{ t: 'p-100p14', x: 0, y: 0 }] })
  assert.equal(DEVICES['p-100p14'].canServe(mem, mem.parts[0], 'bogus'), false)
  assert.equal(DEVICES['p-100p14'].canServe(mem, mem.parts[0], 'd0'), true, 'still serves its real pins')

  const d80 = new Machine({ parts: [{ t: 'd80c010-f', x: 0, y: 0 }] })
  assert.equal(DEVICES['d80c010-f'].canServe(d80, d80.parts[0], 'bogus'), false)

  const mc = new Machine({ parts: [{ t: 'mc-4010', x: 0, y: 0 }] })
  assert.equal(DEVICES['mc-4010'].canServe(mc, mc.parts[0], 'bogus'), false)
})

// ---------------------------------------------------------------- n4pb-8000

/** One MC4000X chip wired x0 to the given device's given pin, reading it into acc. */
const readRig = (deviceTag, devicePin, extraParts = [], extraWires = []) => new Machine({
  parts: [
    { t: 'mc-4000x', x: 0, y: 0, code: '  mov x0 acc\n  slp 9' },
    { t: deviceTag, x: 8, y: 0 },
    ...extraParts,
  ],
  wires: [['0:x0', `1:${devicePin}`], ...extraWires],
})

test('N4PB-8000 idle: -999, and the chip does not block waiting for one', () => {
  const m = readRig('n4pb-8000', 'x0')
  assert.equal(m.advance(), true, 'a blocking: false pin never parks the reader')
  assert.equal(m.parts[0].chip.regs.acc, -999)
  assert.notEqual(m.parts[0].chip.state, 'block')
})

test('N4PB-8000 press yields the button number, release its negation', () => {
  // Two chips on two different pins (x0, x1) of the same controller, to show
  // the event queue is shared across pins, not private to one.
  const m = readRig('n4pb-8000', 'x0', [
    { t: 'mc-4000x', x: 16, y: 0, code: '  slp 1\n  mov x1 acc\n  slp 9' },
  ], [['2:x1', '1:x1']])
  m.pressButton('N4PB-8000', 5)
  m.advance() // unit 0: the first chip's read consumes the press event
  assert.equal(m.parts[0].chip.regs.acc, 5, 'a press reads as the button number')

  m.releaseButton('N4PB-8000', 5)
  m.advance() // unit 1: the second chip wakes and consumes the release event, on x1
  assert.equal(m.parts[2].chip.regs.acc, -5, 'a release reads as its negation')
})

test('N4PB-8000 events queue in order and are each read exactly once', () => {
  // slp 1, not readRig's slp 9: this chip must attempt a fresh read every
  // single time unit for the three advances below to each land one.
  const m = new Machine({
    parts: [
      { t: 'mc-4000x', x: 0, y: 0, code: '  mov x0 acc\n  slp 1' },
      { t: 'n4pb-8000', x: 8, y: 0 },
    ],
    wires: [['0:x0', '1:x0']],
  })
  m.pressButton('N4PB-8000', 2)
  m.releaseButton('N4PB-8000', 2)
  m.advance()
  assert.equal(m.parts[0].chip.regs.acc, 2, 'first event read first')
  m.advance()
  assert.equal(m.parts[0].chip.regs.acc, -2, 'second event read next')
  m.advance()
  assert.equal(m.parts[0].chip.regs.acc, -999, 'queue is empty again')
})

// --------------------------------------------------------------- c2s-rf901

test('C2S-RF901 receive is idle at -999 and never blocks the reader', () => {
  const m = readRig('c2s-rf901', 'receive')
  assert.equal(m.advance(), true)
  assert.equal(m.parts[0].chip.regs.acc, -999)
  assert.notEqual(m.parts[0].chip.state, 'block')
})

test('a value written to one radio\'s transmit reaches every other radio\'s receive', () => {
  // Three radios, no wire between any of them - the page's "usage pattern"
  // for the part is a poll-and-forward loop; this proves the broadcast side.
  const m = new Machine({
    parts: [
      { t: 'mc-4000x', x: 0, y: 0, code: '  mov 7 x0\n  slp 9' }, // writes to radio A's transmit
      { t: 'c2s-rf901', x: 8, y: 0, label: 'A' },
      { t: 'c2s-rf901', x: 16, y: 0, label: 'B' },
      { t: 'c2s-rf901', x: 24, y: 0, label: 'C' },
    ],
    wires: [['0:x0', '1:transmit']],
  })
  m.advance()
  const [, a, b, c] = m.parts
  assert.equal(a.buffer.length, 0, 'a radio does not receive its own transmission')
  assert.equal(b.buffer[0], 7, 'every other radio receives it')
  assert.equal(c.buffer[0], 7, 'every other radio receives it')
})

test('C2S-RF901 receive gives the buffered value, not -999, once one exists', () => {
  // A radio never receives its own transmission, so this needs two of them:
  // one that transmits, one whose receive the reading chip is wired to.
  const m = new Machine({
    parts: [
      { t: 'mc-4000x', x: 0, y: 0, code: '  slp 1\n  mov x0 acc\n  slp 9' },
      { t: 'c2s-rf901', x: 8, y: 0, label: 'receiver' },
      { t: 'mc-4000x', x: 16, y: 0, code: '  mov 42 x0\n  slp 9' },
      { t: 'c2s-rf901', x: 24, y: 0, label: 'transmitter' },
    ],
    wires: [['0:x0', '1:receive'], ['2:x0', '3:transmit']],
  })
  m.advance() // unit 0: part 3 transmits, landing in part 1's buffer
  m.advance() // unit 1: part 0 wakes and reads it
  assert.equal(m.parts[0].chip.regs.acc, 42, 'the buffered value wins over the -999 fallback')
})

// ----------------------------------------------------------------- lx-910c

test('LX910C t0 is idle at -999 and never blocks the reader', () => {
  const m = readRig('lx-910c', 't0')
  assert.equal(m.advance(), true)
  assert.equal(m.parts[0].chip.regs.acc, -999)
  assert.notEqual(m.parts[0].chip.state, 'block')
})

test('LX910C t0 reports a queued touch, not -999, once one exists', () => {
  const m = readRig('lx-910c', 't0')
  m.parts[1].touches.push(3)
  m.advance()
  assert.equal(m.parts[0].chip.regs.acc, 3, 'the queued touch wins over the -999 fallback')
})

test('LX910C cN turns individual segments on and off, per the datasheet table', () => {
  const m = new Machine({ parts: [{ t: 'lx-910c', x: 0, y: 0 }] })
  const [dev, part] = [DEVICES['lx-910c'], m.parts[0]]
  dev.accept(m, part, 'c0', 4) // turn on segment 4
  dev.accept(m, part, 'q0', 4)
  assert.equal(dev.serve(m, part, 'q0'), 1, '[segment] turns it on')

  dev.accept(m, part, 'c0', -4) // turn off segment 4
  dev.accept(m, part, 'q0', 4)
  assert.equal(dev.serve(m, part, 'q0'), 0, '-[segment] turns it off')
})

test('LX910C cN 999 and -999 turn every segment on or off', () => {
  const m = new Machine({ parts: [{ t: 'lx-910c', x: 0, y: 0 }] })
  const [dev, part] = [DEVICES['lx-910c'], m.parts[0]]

  dev.accept(m, part, 'c0', 999)
  dev.accept(m, part, 'q0', 1)
  assert.equal(dev.serve(m, part, 'q0'), 1, '999 turns on a segment never individually set')

  dev.accept(m, part, 'c0', -999)
  dev.accept(m, part, 'q0', 1)
  assert.equal(dev.serve(m, part, 'q0'), 0, '-999 turns off a segment never individually set')
})

test('LX910C qN is a write-then-read pair, exercised over an actual wire', () => {
  const m = new Machine({
    parts: [
      { t: 'mc-4000x', x: 0, y: 0, code: '  mov 999 x0\n  mov 6 x2\n  mov x2 acc\n  slp 9' },
      { t: 'lx-910c', x: 8, y: 0 },
    ],
    wires: [['0:x0', '1:c0'], ['0:x2', '1:q0']],
  })
  m.advance()
  assert.equal(m.parts[0].chip.regs.acc, 1, 'segment 6 reads on after turning on every segment')
})

/* Reading and writing are separate questions, and a write-only pin answers
   them differently. Asking one question for both let a read of a write-only
   pin return something serve() could not honour. */

test('a write-only pin does not answer a read', () => {
  const readPin = (tag, pin, setup) => {
    const m = new Machine({
      parts: [{ t: 'mc-6000', x: 0, y: 0, code: '  mov x0 dat\n  slp 9' }, { t: tag, x: 8, y: 0 }],
      wires: [['0:x0', `1:${pin}`]],
    })
    if (setup) setup(m)
    m.advance()
    return m.parts[0].chip
  }

  // The radio handed back a packet from its receive buffer - wrong pin, and
  // without consuming it, so the same packet read forever.
  const radio = readPin('c2s-rf901', 'transmit', (m) => m.parts[1].buffer.push(42))
  assert.notEqual(radio.regs.dat, 42, 'transmit must not serve the receive buffer')
  assert.equal(radio.state, 'block', 'nothing to read there, so the chip waits')

  // The LCD fell through serve() with no branch for c0 and handed over undefined.
  const lcd = readPin('lx-910c', 'c0')
  assert.equal(typeof lcd.regs.dat, 'number', 'a register never takes undefined')
  assert.equal(lcd.state, 'block')
})

test('a write-only pin still accepts a write', () => {
  // The other half: refusing the read must not refuse the write with it.
  const writePin = (tag, pin) => {
    const m = new Machine({
      parts: [{ t: 'mc-6000', x: 0, y: 0, code: `  mov 7 x0\n  mov 99 dat\n  slp 9` }, { t: tag, x: 8, y: 0 }],
      wires: [['0:x0', `1:${pin}`]],
    })
    m.advance()
    return m.parts[0].chip
  }
  assert.equal(writePin('c2s-rf901', 'transmit').regs.dat, 99, 'the write went through')
  assert.equal(writePin('lx-910c', 'c0').regs.dat, 99, 'the write went through')
})

test('a radio broadcast reaches every other radio and not the sender', () => {
  const m = new Machine({
    parts: [
      { t: 'mc-6000', x: 0, y: 0, code: '  mov 9 x0\n  slp 9' },
      { t: 'c2s-rf901', x: 8, y: 0 },
      { t: 'c2s-rf901', x: 8, y: 8 },
      { t: 'c2s-rf901', x: 8, y: 16 },
    ],
    wires: [['0:x0', '1:transmit']],
  })
  m.advance()
  assert.deepEqual(m.parts[1].buffer, [], 'a radio does not hear itself')
  assert.deepEqual(m.parts[2].buffer, [9])
  assert.deepEqual(m.parts[3].buffer, [9])
})
