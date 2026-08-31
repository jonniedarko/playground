/* =========================================================================
   verify() - compare a running Machine against a Spec.

   Headless: no DOM, drives a Machine the caller already built. This is the
   diagnostic core of the workbench's "does my circuit do the right thing"
   feature - the UI (ide.js) and the shipped-circuit specs (specs.js) both
   sit on top of this.

   ------------------------------------------------------------- Spec shape

     {
       circuit: 'an650',        // not read here - the caller already built
                                 // the Machine from it. Kept on Spec only so
                                 // other code (ide.js, specs.js) knows which
                                 // circuit a Spec is for.
       length: 12,               // time units to run
       inputs: { switch: [0, 0, 100, 100, 0] },
       expect: { lamp: [null, null, 0, 50, 50, 50] },
       tolerance: 0,             // absolute, per sample. Default 0.
     }

   - Arrays (both `inputs` and `expect`) are indexed by time unit, from 0.
     A short array holds its last value for the remainder of the run - this
     is what makes `[0, 0, 100]` mean "press at unit 2 and keep it pressed".
   - `null` in an `expect` array means don't care.
   - **A sample is taken after advance() completes that unit.**
     `expect.lamp[3]` is `machine.output('lamp')` after the *4th* advance()
     (t runs 0..length-1, so index 3 is the fourth call). This is the
     ambiguity every harness of this shape gets wrong, so it is stated
     twice: once here, once at the sampling call site below.
   - Inputs for a unit are applied via setInput *before* that unit's
     advance() - see the loop below, setInput always precedes advance().
   ========================================================================= */

/** Index into a time-indexed array, holding the last entry past its end. */
function at(arr, t) {
  return arr[t < arr.length ? t : arr.length - 1]
}

/**
 * Build the object verify() returns once the run has stopped, one way or
 * another. `divergence` is null on success; power/lines/units are always
 * reported, since the point of a failure report is the diagnostic, not just
 * pass/fail.
 */
function report(machine, spec, divergence) {
  const chips = machine.parts.filter((p) => p.chip).map((p) => p.chip)
  return {
    ok: divergence === null,
    divergence,
    // The game's own scoring: power is instructions actually executed,
    // summed across chips (mirrors the readout ide.js already builds from
    // Machine.snapshot()).
    //
    // `lines` counts executable instructions - blanks, comments and label
    // lines all parse to no `op` and so do not count. The manual never
    // defines the metric, and a label does occupy a line on screen, so this
    // is a reading rather than a transcription. Present it as instructions,
    // not as the game's own line score.
    power: chips.reduce((n, c) => n + c.power, 0),
    lines: chips.reduce((n, c) => n + c.program.filter((ins) => ins.op).length, 0),
    // The run's intended length, not how far it got - a failure at time 3
    // of a 12-unit spec still reports units: 12, so the caller can see how
    // much of the run never happened.
    units: spec.length,
  }
}

/**
 * Drive `machine` (already built from `spec.circuit`, or whatever the
 * caller wants) through `spec.length` time units, checking `spec.expect`
 * against what the machine actually outputs.
 *
 * Returns on the FIRST divergence - not a list, not a boolean. See the
 * module doc above for the Spec shape and the return shape.
 */
export function verify(machine, spec) {
  const length = spec.length
  const inputs = spec.inputs || {}
  const expect = spec.expect || {}
  const tolerance = spec.tolerance ?? 0
  const inputLabels = Object.keys(inputs)
  const expectLabels = Object.keys(expect)

  for (let t = 0; t < length; t += 1) {
    // Inputs for this unit are applied before this unit's advance().
    for (const label of inputLabels) machine.setInput(label, at(inputs[label], t))

    machine.advance()

    // Sample AFTER advance() has completed this unit - see the module doc.
    //
    // This happens before the early-stop checks below, and the order is
    // deliberate: what should have happened by now is a different question
    // from whether the machine can go on. A one-shot circuit does all its
    // work in a single unit and then blocks waiting for input that never
    // comes - the packet reverser is exactly this - and reporting that as a
    // failure would mark a circuit wrong for having finished.
    for (const signal of expectLabels) {
      const expected = at(expect[signal], t)
      if (expected === null) continue // don't care
      const actual = machine.output(signal)
      if (Math.abs(actual - expected) > tolerance) {
        return report(machine, spec, { time: t, signal, expected, actual })
      }
    }

    // Three early-stop cases, checked once this unit's expectations are
    // satisfied. Each is a failure naming the time unit it happened at, with
    // the reason in `signal` rather than a signal name - there is no
    // expected/actual pair for "the machine broke", so `expected` is null
    // and `actual` carries whatever detail the machine itself recorded.
    if (machine.error) {
      return report(machine, spec, { time: t, signal: 'error', expected: null, actual: machine.error })
    }
    if (machine.deadlock) {
      return report(machine, spec, { time: t, signal: 'deadlock', expected: null, actual: machine.deadlock.join('; ') })
    }
    const chips = machine.parts.filter((p) => p.chip)
    if (chips.length && chips.every((p) => p.chip.halted)) {
      return report(machine, spec, { time: t, signal: 'halted', expected: null, actual: 'every chip halted' })
    }
  }

  return report(machine, spec, null)
}

export default verify
