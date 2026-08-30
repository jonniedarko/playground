import test from 'node:test'
import assert from 'node:assert/strict'
import { Machine, clamp, parseProgram } from '../assets/shenzhen/sim.js'
import { CIRCUITS } from '../assets/shenzhen/circuits.js'

/** One MC4000 with a lamp on p1 and a button on p0, so tests can poke and look. */
const rig = (code, extra = {}) => new Machine({
  parts: [
    { t: 'io-terminal', x: 0, y: 0, label: 'button', type: 'simple', side: 'right' },
    { t: 'mc-4000', x: 3, y: 0, code },
    { t: 'io-terminal', x: 11, y: 0, label: 'lamp', type: 'simple', side: 'left' },
  ],
  wires: [['0:button', '1:p0'], ['1:p1', '2:lamp']],
  ...extra,
})

// ------------------------------------------------------------------ parsing

test('parses labels, conditionals and comments', () => {
  const { program, labels } = parseProgram('loop:  teq acc 10\n+ jmp end\n  add 1  # bump\nend:')
  assert.deepEqual([...labels.entries()], [['loop', 0], ['end', 3]])
  assert.equal(program[0].op, 'teq')
  assert.equal(program[1].cond, '+')
  assert.deepEqual(program[2].args, ['1'])
  assert.equal(program[3].op, null, 'a bare label is not an instruction')
})

test('program is clamped to the chip line limit', () => {
  const m = rig(Array.from({ length: 20 }, (_, n) => `  add ${n}`).join('\n'))
  assert.equal(m.parts[1].chip.program.length, 9, 'MC4000 holds nine lines')
})

// -------------------------------------------------------------- arithmetic

test('arithmetic lands in acc and saturates at the limits', () => {
  const m = rig('  mov 800 acc\n  add 400\n  slp 1')
  m.advance()
  assert.equal(m.parts[1].chip.regs.acc, 999, '800 + 400 clamps to 999')

  const n = rig('  mov -800 acc\n  sub 400\n  slp 1')
  n.advance()
  assert.equal(n.parts[1].chip.regs.acc, -999)
  assert.equal(clamp(5000), 999)
})

test('not inverts to the simple I/O levels', () => {
  const m = rig('  mov 0 acc\n  not\n  slp 1')
  m.advance()
  assert.equal(m.parts[1].chip.regs.acc, 100)
  const n = rig('  mov 7 acc\n  not\n  slp 1')
  n.advance()
  assert.equal(n.parts[1].chip.regs.acc, 0)
})

test('dgt and dst match the manual worked examples', () => {
  const cases = [
    ['  mov 596 acc\n  dgt 0\n  slp 1', 6],
    ['  mov 596 acc\n  dgt 1\n  slp 1', 9],
    ['  mov 596 acc\n  dgt 2\n  slp 1', 5],
    ['  mov 596 acc\n  dst 0 7\n  slp 1', 597],
    ['  mov 596 acc\n  dst 1 7\n  slp 1', 576],
    ['  mov 596 acc\n  dst 2 7\n  slp 1', 796],
  ]
  for (const [code, expected] of cases) {
    const m = rig(code)
    m.advance()
    assert.equal(m.parts[1].chip.regs.acc, expected, code.split('\n')[1].trim())
  }
})

// ------------------------------------------------------------- conditionals

test('conditionals are inert until a test runs', () => {
  // No test instruction, so neither the + nor the - line may run.
  const m = rig('+ mov 100 p1\n- mov 100 p1\n  slp 1')
  m.advance()
  assert.equal(m.output('lamp'), 0, 'nothing drove the lamp')
  assert.equal(m.parts[1].chip.power, 1, 'only the slp cost power')
})

test('a test enables one branch and skips the other for free', () => {
  const m = rig('  tgt p0 50\n+ mov 100 p1\n- mov 0 p1\n  slp 1')
  m.setInput('button', 100)
  m.advance()
  assert.equal(m.output('lamp'), 100)
  assert.equal(m.parts[1].chip.power, 3, 'the skipped line cost nothing')

  m.setInput('button', 0)
  m.advance()
  assert.equal(m.output('lamp'), 0)
})

test('tcp is three-way: equal disables both branches', () => {
  const m = rig('  tcp acc 0\n+ mov 100 p1\n- mov 50 p1\n  slp 1')
  m.advance()
  assert.equal(m.parts[1].chip.flag, 'none', 'acc equals 0')
  assert.equal(m.output('lamp'), 0, 'neither branch ran')

  const gt = rig('  mov 5 acc\n  tcp acc 0\n+ mov 100 p1\n  slp 1')
  gt.advance()
  assert.equal(gt.output('lamp'), 100)

  const lt = rig('  mov -5 acc\n  tcp acc 0\n- mov 60 p1\n  slp 1')
  lt.advance()
  assert.equal(lt.output('lamp'), 60)
})

// ------------------------------------------------------------ control flow

test('a program with no jmp wraps from the last line to the first', () => {
  const m = rig('  add 1\n  slp 1')
  m.advance()
  m.advance()
  assert.equal(m.parts[1].chip.regs.acc, 2, 'ran twice, so it wrapped')
  assert.equal(m.parts[1].chip.firstPass, false)
})

test('@ runs only on the first pass', () => {
  const m = rig('@ mov 5 acc\n  add 1\n  slp 1')
  m.advance()
  assert.equal(m.parts[1].chip.regs.acc, 6)
  m.advance()
  assert.equal(m.parts[1].chip.regs.acc, 7, 'the @ line did not run again')
})

test('jmp goes to its label', () => {
  const m = rig('  mov 3 acc\nl:sub 1\n  tgt acc 0\n+ jmp l\n  slp 1')
  m.advance()
  assert.equal(m.parts[1].chip.regs.acc, 0)
})

// ----------------------------------------------------------------- timing

test('slp advances the clock by the number of time units asked for', () => {
  const m = rig('  mov 100 p1\n  slp 3\n  mov 0 p1\n  slp 3')
  m.advance()
  assert.equal(m.output('lamp'), 100)
  m.run(2)
  assert.equal(m.output('lamp'), 100, 'still high three time units in')
  m.advance()
  assert.equal(m.output('lamp'), 0, 'then it drops')
})

test('the blink circuit produces a square wave', () => {
  const m = new Machine(CIRCUITS.blink)
  const seen = []
  for (let t = 0; t < 6; t += 1) {
    m.advance()
    seen.push(m.output('lamp'))
  }
  assert.deepEqual(seen, [100, 100, 100, 0, 0, 0], 'three on, three off')
})

test('a chip that never sleeps is caught, not left spinning', () => {
  const m = rig('l:add 1\n  jmp l')
  m.advance()
  assert.match(String(m.error), /without sleeping/)
})

// ------------------------------------------------------------------- pins

test('reading a simple I/O pin drops whatever it was driving', () => {
  const m = rig('  mov 100 p1\n  slp 1')
  m.advance()
  assert.equal(m.output('lamp'), 100)

  const n = rig('  mov 100 p1\n  mov p1 acc\n  slp 1')
  n.advance()
  assert.equal(n.output('lamp'), 0, 'the read turned the pin back into an input')
})

// ------------------------------------------------------------------ XBus

test('two chips complete an XBus handshake', () => {
  const m = new Machine(CIRCUITS['xbus-pair'])
  m.setInput('sensor', 100)
  m.advance()
  assert.equal(m.deadlock, null)
  assert.equal(m.output('lamp'), 100, 'the value crossed the bus and drove the lamp')
})

test('both sides waiting on XBus is reported as deadlock, not a hang', () => {
  const m = new Machine({
    parts: [
      { t: 'mc-4000', x: 0, y: 0, code: '  mov x0 acc\n  slp 1' },
      { t: 'mc-4000', x: 8, y: 0, code: '  mov x1 acc\n  slp 1' },
    ],
    wires: [['0:x0', '1:x1']],
  })
  m.advance()
  assert.ok(Array.isArray(m.deadlock), 'deadlock is reported')
  assert.match(m.deadlock.join(' '), /blocked on mov/)
  assert.equal(m.time, 0, 'the clock does not advance past a deadlock')
})

test('a chip blocked while another only sleeps is reported as stalled', () => {
  // Not provably fatal - the sleeper could in principle wake and write - but it
  // is the symptom players hit, so it must not pass silently.
  const m = new Machine({
    parts: [
      { t: 'mc-4000', x: 0, y: 0, code: '  mov x0 acc\n  slp 1' },
      { t: 'mc-4000', x: 8, y: 0, code: '  slp 9' },
    ],
    wires: [['0:x0', '1:x1']],
  })
  m.advance()
  assert.equal(m.deadlock, null, 'not everyone is blocked')
  assert.match(m.stalled.join(' '), /MC4000 blocked on mov x0/)
})

test('slx waits for data instead of spinning', () => {
  const m = new Machine(CIRCUITS['xbus-pair'])
  m.setInput('sensor', 60)
  m.run(2)
  assert.equal(m.error, null)
  assert.equal(m.output('lamp'), 60)
})

// ---------------------------------------------------------------- devices

test('DX300 unpacks the digits of an XBus value onto its simple pins', () => {
  const m = new Machine({
    parts: [
      { t: 'mc-6000', x: 0, y: 0, code: '  mov 101 x0\n  slp 9' },
      { t: 'dx-300', x: 8, y: 0 },
      { t: 'io-terminal', x: 12, y: 0, label: 'a', type: 'simple', side: 'left' },
      { t: 'io-terminal', x: 12, y: 2, label: 'b', type: 'simple', side: 'left' },
      { t: 'io-terminal', x: 12, y: 4, label: 'c', type: 'simple', side: 'left' },
    ],
    wires: [['0:x0', '1:x0'], ['1:p0', '2:a'], ['1:p1', '3:b'], ['1:p2', '4:c']],
  })
  m.advance()
  assert.equal(m.output('a'), 100, 'ones digit 1 -> p0 on')
  assert.equal(m.output('b'), 0, 'tens digit 0 -> p1 off')
  assert.equal(m.output('c'), 100, 'hundreds digit 1 -> p2 on')
})

test('memory auto-increments its pointer on every data access', () => {
  const m = new Machine({
    parts: [
      { t: 'mc-6000', x: 0, y: 0, code: '  mov 11 x0\n  mov 22 x0\n  mov 33 x0\n  slp 9' },
      { t: 'p-100p14', x: 8, y: 0 },
    ],
    wires: [['0:x0', '1:d0']],
  })
  m.advance()
  const cells = m.parts[1].cells
  assert.deepEqual(cells.slice(0, 3), [11, 22, 33], 'three writes landed in three cells')
  assert.equal(m.parts[1].ptr.a0, 3, 'pointer moved on each time')
})

// ----------------------------------------------------------------- gates

test('logic gates use the 50 threshold and their truth table', () => {
  const build = (tag, a, b) => {
    const m = new Machine({
      parts: [
        { t: 'io-terminal', x: 0, y: 0, label: 'a', type: 'simple', side: 'right' },
        { t: 'io-terminal', x: 0, y: 3, label: 'b', type: 'simple', side: 'right' },
        { t: tag, x: 4, y: 0 },
        { t: 'io-terminal', x: 8, y: 0, label: 'out', type: 'simple', side: 'left' },
      ],
      wires: [['0:a', '2:a'], ...(tag === 'lc-70g04' ? [] : [['1:b', '2:b']]), ['2:out', '3:out']],
    })
    m.setInput('a', a)
    m.setInput('b', b)
    return m.output('out')
  }
  assert.equal(build('lc-70g04', 0, 0), 100, 'NOT 0 is on')
  assert.equal(build('lc-70g04', 100, 0), 0)
  assert.equal(build('lc-70g08', 100, 100), 100, 'AND')
  assert.equal(build('lc-70g08', 100, 0), 0)
  assert.equal(build('lc-70g32', 0, 100), 100, 'OR')
  assert.equal(build('lc-70g32', 0, 0), 0)
  assert.equal(build('lc-70g86', 100, 0), 100, 'XOR')
  assert.equal(build('lc-70g86', 100, 100), 0)
  assert.equal(build('lc-70g08', 49, 100), 0, 'below 50 reads as off')
  assert.equal(build('lc-70g08', 50, 100), 100, '50 and above reads as on')
})

// ------------------------------------------------------- documented circuits

test('every documented circuit parses and runs without error', () => {
  for (const [name, spec] of Object.entries(CIRCUITS)) {
    const m = new Machine(spec)
    for (const part of m.parts) {
      if (part.chip) assert.deepEqual(part.chip.errors, [], `${name}: ${part.meta.name} program errors`)
    }
    m.run(3)
    assert.equal(m.error, null, `${name} raised: ${m.error}`)
  }
})
