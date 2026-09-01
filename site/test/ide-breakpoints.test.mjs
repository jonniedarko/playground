/* R15.2 - breakpoints.
 *
 * Test the pure breakpoint-checking functions exported from ide.js.
 * shouldPauseLineBreakpoint and shouldPauseSignalBreakpoint are called
 * from tick() to decide when to pause a running simulation.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { Machine } from '../assets/shenzhen/sim.js'
import { shouldPauseLineBreakpoint, shouldPauseSignalBreakpoint } from '../assets/shenzhen/ide.js'

/** A simple test rig with a chip and an output terminal. */
function rig(code) {
  return new Machine({
    parts: [
      { t: 'mc-4000', x: 0, y: 0, code },
      { t: 'io-terminal', x: 8, y: 0, label: 'out', type: 'simple', side: 'left' },
    ],
    wires: [['0:p1', '1:out']],
  })
}

/** Helper to advance n steps and return snapshots at each step, starting from t=0. */
function recordSnapshots(machine, steps) {
  const snapshots = [machine.snapshot()]
  for (let i = 0; i < steps; i++) {
    machine.advance()
    snapshots.push(machine.snapshot())
  }
  return snapshots
}

/** Helper to get the PC value from a snapshot for a given chip. */
function getPC(snapshot, chipId) {
  const chip = snapshot.find(s => s.id === chipId)
  return chip ? chip.pc : undefined
}

// --------------------------------------------------------- LINE BREAKPOINTS

test('shouldPauseLineBreakpoint: fires when PC reaches the target line', () => {
  // Program where each line takes one time unit (slp 1)
  // Line 0: slp 1 (sleeps for 1 unit, then PC wraps to 0)
  // Actually, in a single time unit, all instructions execute until hit a sleep.
  // So a program like "slp 0" will execute immediately.
  // Let's use a different approach: XBus blocking
  const m = new Machine({
    parts: [
      { t: 'mc-4000', x: 0, y: 0, code: '  add 1\n  add 2\n  slp 1' },
      { t: 'io-terminal', x: 8, y: 0, label: 'out', type: 'simple', side: 'left' },
    ],
    wires: []
  })
  const snapshots = recordSnapshots(m, 3)

  // After initial settle: all non-slp instructions execute, then hit slp -> PC wraps to 0
  // After advance 1: chip wakes up, executes all 3 instructions again -> PC wraps to 0
  // So PC is 0 after each settle.
  // This means we need a different approach.

  // Let's use a program with conditional that depends on a register:
  const m2 = new Machine({
    parts: [
      { t: 'mc-4000', x: 0, y: 0, code: '  mov 0 acc\nloop: add 1\n  teq acc 3\n+ slp 1\n- jmp loop' },
      { t: 'io-terminal', x: 8, y: 0, label: 'out', type: 'simple', side: 'left' },
    ],
    wires: []
  })

  // This program will keep looping through lines 1-4 until acc == 3, at which point it sleeps.
  // But all of this happens in a single time unit due to settle().

  // The real issue is that we can't rely on taking snapshots between individual instructions.
  // We need to either:
  // 1. Have a way to instrument the simulator to get PC values at specific points
  // 2. Test with programs structured so important lines align with time unit boundaries
  // 3. Test the function's logic directly with mock snapshots

  // Let's go with option 3: test with mocked snapshots
  const before = [{ id: 0, pc: 0 }, { id: 1 }]  // Part 0 is a chip at line 0
  const after = [{ id: 0, pc: 1 }, { id: 1 }]   // Part 0 moved to line 1

  assert.ok(
    shouldPauseLineBreakpoint(0, 1, before, after),
    'breaks when reaching line 1'
  )
})

test('shouldPauseLineBreakpoint: does not fire on neighbouring lines', () => {
  const before = [{ id: 0, pc: 0 }]
  const after1 = [{ id: 0, pc: 1 }]
  const after2 = [{ id: 0, pc: 2 }]

  // Breakpoint on line 1 should fire when reaching line 1
  assert.ok(
    shouldPauseLineBreakpoint(0, 1, before, after1),
    'breaks when reaching line 1'
  )

  // But not when reaching line 2
  assert.ok(
    !shouldPauseLineBreakpoint(0, 1, after1, after2),
    'does not break when reaching line 2'
  )

  // And not when at line 0
  assert.ok(
    !shouldPauseLineBreakpoint(0, 1, before, before),
    'does not break when staying at line 0'
  )
})

test('shouldPauseLineBreakpoint: fires when moving to target, not staying on it', () => {
  const atLine1 = [{ id: 0, pc: 1 }]
  const atLine2 = [{ id: 0, pc: 2 }]

  // Fires when moving INTO line 1
  const beforeLine1 = [{ id: 0, pc: 0 }]
  assert.ok(
    shouldPauseLineBreakpoint(0, 1, beforeLine1, atLine1),
    'breaks when moving into line 1'
  )

  // But doesn't fire if we're already at line 1 and move away
  assert.ok(
    !shouldPauseLineBreakpoint(0, 1, atLine1, atLine2),
    'does not break when leaving line 1'
  )

  // Or if we stay at line 1
  assert.ok(
    !shouldPauseLineBreakpoint(0, 1, atLine1, atLine1),
    'does not break when staying at line 1'
  )
})

test('shouldPauseLineBreakpoint: returns false for invalid input', () => {
  const m = rig('  mov 100 acc\n  slp 1')
  const snapshots = recordSnapshots(m, 2)

  // Null snapshots
  assert.ok(
    !shouldPauseLineBreakpoint(0, 1, null, snapshots[1]),
    'handles null before snapshot'
  )
  assert.ok(
    !shouldPauseLineBreakpoint(0, 1, snapshots[0], null),
    'handles null after snapshot'
  )

  // Non-existent chip
  assert.ok(
    !shouldPauseLineBreakpoint(999, 1, snapshots[0], snapshots[1]),
    'returns false for non-existent chip'
  )

  // Non-chip part (like a terminal)
  // Part 1 is a terminal, not a chip, so it has no PC
  // But chip 0 is still valid
  assert.ok(
    !shouldPauseLineBreakpoint(1, 0, snapshots[0], snapshots[1]),
    'returns false when target is not a chip'
  )
})

// -------------------------------------------------------- SIGNAL BREAKPOINTS

test('shouldPauseSignalBreakpoint: fires when value changes', () => {
  assert.ok(
    shouldPauseSignalBreakpoint(0, 100),
    'breaks when signal changes from 0 to 100'
  )
  assert.ok(
    shouldPauseSignalBreakpoint(50, 75),
    'breaks when signal changes from 50 to 75'
  )
})

test('shouldPauseSignalBreakpoint: does not fire when value stays the same', () => {
  assert.ok(
    !shouldPauseSignalBreakpoint(100, 100),
    'does not break when signal stays at 100'
  )
  assert.ok(
    !shouldPauseSignalBreakpoint(0, 0),
    'does not break when signal stays at 0'
  )
  assert.ok(
    !shouldPauseSignalBreakpoint(50, 50),
    'does not break when signal stays at 50'
  )
})

test('shouldPauseSignalBreakpoint: detects change to 0', () => {
  assert.ok(
    shouldPauseSignalBreakpoint(100, 0),
    'breaks when signal changes to 0'
  )
  assert.ok(
    shouldPauseSignalBreakpoint(1, 0),
    'breaks when signal changes from 1 to 0'
  )
})

test('shouldPauseSignalBreakpoint: handles undefined values', () => {
  const result1 = shouldPauseSignalBreakpoint(undefined, undefined)
  assert.ok(!result1, 'does not break when both undefined')

  const result2 = shouldPauseSignalBreakpoint(undefined, 100)
  assert.ok(result2, 'breaks when undefined becomes defined')

  const result3 = shouldPauseSignalBreakpoint(100, undefined)
  assert.ok(result3, 'breaks when value becomes undefined')
})

// --------------------------------------------------------- INTEGRATION TEST

test('line breakpoint works with mocked snapshots', () => {
  // Test that the function correctly identifies transitions
  const atLine0 = [{ id: 0, pc: 0 }]
  const atLine1 = [{ id: 0, pc: 1 }]
  const atLine2 = [{ id: 0, pc: 2 }]
  const atLine3 = [{ id: 0, pc: 3 }]

  // Moving from line 0 to line 1 should trigger breakpoint on line 1
  assert.ok(
    shouldPauseLineBreakpoint(0, 1, atLine0, atLine1),
    'breaks when moving 0->1 and breakpoint is on line 1'
  )

  // But moving from line 1 to line 2 should not trigger breakpoint on line 1
  assert.ok(
    !shouldPauseLineBreakpoint(0, 1, atLine1, atLine2),
    'does not break when at line 2 even though breakpoint is on line 1'
  )

  // Repeatedly reaching the same line should still trigger
  assert.ok(
    shouldPauseLineBreakpoint(0, 1, atLine0, atLine1),
    'breaks again when moving back to line 1'
  )

  // But not when staying on that line
  const stillAtLine1 = [{ id: 0, pc: 1 }]
  assert.ok(
    !shouldPauseLineBreakpoint(0, 1, atLine1, stillAtLine1),
    'does not break when staying at line 1'
  )
})

test('signal breakpoint fires correctly in sequence', () => {
  // Test multiple transitions
  assert.ok(
    shouldPauseSignalBreakpoint(0, 50),
    'breaks on 0->50'
  )
  assert.ok(
    !shouldPauseSignalBreakpoint(50, 50),
    'does not break on 50->50'
  )
  assert.ok(
    shouldPauseSignalBreakpoint(50, 100),
    'breaks on 50->100'
  )
  assert.ok(
    shouldPauseSignalBreakpoint(100, 0),
    'breaks on 100->0 (change to zero)'
  )
  assert.ok(
    !shouldPauseSignalBreakpoint(0, 0),
    'does not break on 0->0'
  )
})
