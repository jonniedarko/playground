/* R15.3 - step backwards.
 *
 * ide.js cannot be instantiated under node (Ide's constructor touches
 * document, localStorage, window - see CLAUDE.md's note on components.js
 * for why the same is true there). But the replay machinery itself -
 * stepBackTarget(), applyDueInputs(), rebuildAndReplay() - is pure: no DOM,
 * so it is exported from ide.js and exercised directly here, the same
 * separation verify.js/specs.js already draw between logic and UI.
 *
 * The approach is rebuild-and-replay, decided in R12-R15-PLAN.md and not
 * revisited here: Machine is deterministic given its spec (seed included)
 * and its input timeline, so stepping back to t-1 means building a fresh
 * Machine and replaying t-1 units, applying whichever inputs were logged
 * for each unit before that unit's advance(). No snapshot of any kind.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { Machine } from '../assets/shenzhen/sim.js'
import { stepBackTarget, applyDueInputs, rebuildAndReplay } from '../assets/shenzhen/ide.js'

/* A board exercising the three devices the plan names by name for the
   byte-identical check: a radio's buffer, a memory's pointer (and its
   cells), and an oracle's drawn hexagram - which alone touches
   Machine.random, so it is the one that actually shows a seeding bug (see
   sim.js's Machine constructor and kuji-ek1's refresh() in devices.js).

     0 io-terminal 'go'    -> kuji-ek1's button        (drives the draw)
     1 kuji-ek1
     2 io-terminal 'line'  <- kuji-ek1's oracle         (just an observable)
     3 mc-6000  writes address 3, data 55 to memory, then 8 to radio A
     4 p-100p14 (RAM)      addressed/written by chip 3
     5 c2s-rf901 'A'       transmits (its own buffer stays empty)
     6 c2s-rf901 'B'       unwired - receives every other radio's broadcast
*/
const boardSpec = (seed) => ({
  seed,
  parts: [
    { t: 'io-terminal', x: 0, y: 0, label: 'go', type: 'simple', side: 'right' },
    { t: 'kuji-ek1', x: 4, y: 0 },
    { t: 'io-terminal', x: 8, y: 0, label: 'line', type: 'simple', side: 'left' },
    { t: 'mc-6000', x: 12, y: 0, code: '  mov 3 x0\n  mov 55 x1\n  mov 8 x2\n  slp 9' },
    { t: 'p-100p14', x: 20, y: 0 },
    { t: 'c2s-rf901', x: 26, y: 0, label: 'A' },
    { t: 'c2s-rf901', x: 32, y: 0, label: 'B' },
  ],
  wires: [
    ['0:go', '1:button'],
    ['1:oracle', '2:line'],
    ['3:x0', '4:a0'],
    ['3:x1', '4:d0'],
    ['3:x2', '5:transmit'],
  ],
})

/* A tiny stand-in for Ide.recordInput(): log the entry against the
   machine's current time, then apply it - the same order the real handler
   uses (see its own doc in ide.js), so the log this builds is exactly the
   shape rebuildAndReplay() and applyDueInputs() are built to consume. */
function drive(m, log) {
  return (label, value) => {
    log.push({ time: m.time, label, value })
    m.setInput(label, value)
  }
}

/** Deep, JSON-safe state for every part that matters - chip registers *and*
    the three device internals the gate calls out: a radio's buffer, a
    memory's cells and pointer, an oracle's wasHigh/values/triggeredAt. Not
    Machine.snapshot() - that exists for the UI and only carries pc/acc/dat/
    state/power, exactly the "not just acc" shortcut the gate warns against. */
function deepState(m) {
  return {
    time: m.time,
    deadlock: m.deadlock,
    error: m.error,
    parts: m.parts.map((p) => {
      const out = { tag: p.tag, label: p.label }
      if (p.chip) {
        out.chip = {
          pc: p.chip.pc,
          acc: p.chip.regs.acc,
          dat: 'dat' in p.chip.regs ? p.chip.regs.dat : null,
          flag: p.chip.flag,
          sleepUntil: p.chip.sleepUntil,
          halted: p.chip.halted,
          power: p.chip.power,
          firstPass: p.chip.firstPass,
        }
      }
      if (p.cells) out.memory = { cells: [...p.cells], ptr: { ...p.ptr } }
      if (p.tag === 'c2s-rf901') out.buffer = [...p.buffer]
      if (p.tag === 'kuji-ek1') {
        out.oracle = { wasHigh: p.wasHigh, values: p.values ? [...p.values] : null, triggeredAt: p.triggeredAt }
      }
      if (p.tag === 'io-terminal') out.value = p.value
      return out
    }),
  }
}

/** Run the standard scenario forward to t=4 on a fresh Machine, returning
    both the machine and the timeline recordInput() would have built. */
function runToFour(seed) {
  const m = new Machine(boardSpec(seed))
  const log = []
  const record = drive(m, log)
  record('go', 100)  // t=0: press, before that unit's advance()
  m.advance()         // -> t=1: the chip's three writes land this same unit
  m.advance()         // -> t=2
  record('go', 0)     // t=2: release, before the next advance()
  m.advance()         // -> t=3
  m.advance()          // -> t=4
  return { m, log }
}

// ------------------------------------------------------------- stepBackTarget

test('stepBackTarget: t-1, except at t=0 where there is nothing earlier', () => {
  assert.equal(stepBackTarget(5), 4)
  assert.equal(stepBackTarget(1), 0)
  assert.equal(stepBackTarget(0), null, 'no earlier unit than t=0')
})

// ------------------------------------------------------------- applyDueInputs

test('applyDueInputs applies only entries at the machine\'s current time, in order, and advances the cursor past them', () => {
  const m = new Machine(boardSpec(1))
  const log = [{ time: 0, label: 'go', value: 100 }, { time: 0, label: 'go', value: 0 }, { time: 1, label: 'go', value: 100 }]
  const cursor = applyDueInputs(m, log, 0)
  assert.equal(cursor, 2, 'both t=0 entries are consumed, the t=1 one is not')
  assert.equal(m.terminal('go').value, 0, 'the later of the two same-time entries wins, applied in order')
})

test('applyDueInputs is a no-op when the cursor is already caught up', () => {
  const m = new Machine(boardSpec(1))
  const log = [{ time: 0, label: 'go', value: 100 }]
  const cursor = applyDueInputs(m, log, 1) // already past the only entry
  assert.equal(cursor, 1)
  assert.equal(m.terminal('go').value, 0, 'nothing was (re)applied')
})

// ------------------------------------------------------------- rebuildAndReplay

test('rebuildAndReplay to target=0 returns a fresh, unreplayed machine', () => {
  const { m, log } = runToFour(1)
  const { machine, cursor } = rebuildAndReplay(m.spec, log, 0)
  assert.equal(machine.time, 0)
  assert.equal(cursor, 0, 'nothing at t=0 has been consumed yet - it is still pending')
})

test('rebuildAndReplay reaches the requested time unit, replaying every unit crossed', () => {
  const { m, log } = runToFour(1)
  const { machine } = rebuildAndReplay(m.spec, log, 3)
  assert.equal(machine.time, 3)
})

// ------------------------------------------------------- the gate: byte-identical

test('stepping back then forward again lands on byte-identical state - chip AND device state', () => {
  const { m, log } = runToFour(42)
  const before = deepState(m)
  assert.equal(before.time, 4)

  // Sanity: this scenario actually exercises the three devices the gate
  // names, not all-zero/empty defaults a broken replay could fake its way
  // past.
  const radioB = before.parts.find((p) => p.label === 'B')
  const memory = before.parts.find((p) => p.tag === 'p-100p14')
  const oracle = before.parts.find((p) => p.tag === 'kuji-ek1')
  assert.deepEqual(radioB.buffer, [8], 'radio B actually received something')
  assert.equal(memory.memory.cells[3], 55, 'the cell actually got written')
  assert.equal(memory.memory.ptr.a0, 4, 'the pointer actually moved')
  assert.ok(Array.isArray(oracle.oracle.values) && oracle.oracle.values.length === 6, 'a hexagram was actually drawn')

  // Step back to t=3, then forward to t=4 again - stepBack()'s own logic,
  // reproduced here since it is a two-line method on Ide (rebuild, then let
  // the next tick() catch the machine up via applyDueInputs before it
  // advances - see both methods in ide.js).
  const target = stepBackTarget(m.time)
  assert.equal(target, 3)
  const { machine: back, cursor } = rebuildAndReplay(m.spec, log, target)
  assert.equal(back.time, 3, 'rebuildAndReplay lands exactly one unit behind')

  const caughtUp = applyDueInputs(back, log, cursor)
  back.advance()

  assert.equal(back.time, 4)
  assert.deepStrictEqual(deepState(back), before, 'forward again must reproduce every field, not just acc')
  assert.ok(caughtUp >= cursor)
})

test('repeated step-backs land on the same state as replaying straight to that unit', () => {
  const { m, log } = runToFour(7)
  // From t=4: back to 3, then back again to 2. Each press is an independent
  // rebuild-and-replay from t=0 (no snapshot, no memo - see stepBack()'s own
  // doc comment in ide.js), so this also proves that stacking presses does
  // not accumulate any drift of its own.
  const step1 = rebuildAndReplay(m.spec, log, stepBackTarget(4)).machine
  const step2 = rebuildAndReplay(m.spec, log, stepBackTarget(step1.time)).machine
  const direct = rebuildAndReplay(m.spec, log, 2).machine
  assert.equal(step2.time, 2)
  assert.deepStrictEqual(deepState(step2), deepState(direct))
})

// --------------------------------------------------- proof: seed matters

test('proof the byte-identical check would catch a machine rebuilt with the WRONG seed', () => {
  const { m, log } = runToFour(42)
  const target = stepBackTarget(m.time)

  const right = rebuildAndReplay(m.spec, log, target).machine
  // Same parts, same wires, same timeline - only the seed differs, exactly
  // what a bug that dropped or mis-carried spec.seed through a rebuild
  // would produce.
  const wrongSpec = { ...m.spec, seed: (m.spec.seed ?? 1) + 1 }
  const wrong = rebuildAndReplay(wrongSpec, log, target).machine

  const hexOf = (mm) => mm.parts.find((p) => p.tag === 'kuji-ek1').values
  assert.notDeepEqual(hexOf(wrong), hexOf(right), 'a different seed must draw a different hexagram')
  // And that difference is exactly what the gate's deepStrictEqual would
  // trip on - it compares this same field. See the report for the second,
  // more direct proof: sabotaging stepBack() itself to hardcode a seed and
  // watching the test above fail.
})
