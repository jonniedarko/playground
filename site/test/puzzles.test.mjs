import test from 'node:test'
import assert from 'node:assert/strict'
import { Machine } from '../assets/shenzhen/sim.js'
import { verify } from '../assets/shenzhen/verify.js'
import { CIRCUITS } from '../assets/shenzhen/circuits.js'
import { SPECS } from '../assets/shenzhen/specs.js'

/*
 * R13.2's gate: "a puzzle whose own answer fails is worse than no puzzle."
 *
 * SPECS *is* the puzzle list - every key in specs.js names a circuit the
 * workbench can both grade (Verify, ide.js) and reveal (Reveal, ide.js,
 * loadPreset(key) against CIRCUITS[key]). This iterates Object.keys(SPECS)
 * rather than naming an650/dx300-stepper/packet-reverser by hand, so a
 * fourth spec added later (Task 12.2's pattern) is covered the moment it
 * lands here, with no matching edit required in this file. Task 12.2's own
 * tests (verify.test.mjs) additionally assert each shipped circuit by name,
 * with a comment explaining *why* it must pass from the manual's own words -
 * this test is the opposite: generic, exhaustive, and silent on why, purely
 * a gate against a spec/circuit pair that has drifted out of sync.
 */
test('every shipped puzzle\'s reference solution passes its own spec', () => {
  const keys = Object.keys(SPECS)
  // A puzzle list of zero would make every iteration below vacuously true -
  // the classic way a "for every X" test quietly stops testing anything.
  assert.ok(keys.length > 0, 'SPECS is empty - nothing to gate')

  for (const key of keys) {
    const spec = SPECS[key]
    const circuit = CIRCUITS[key]
    assert.ok(circuit, `SPECS.${key} has no matching circuit in circuits.js`)

    const result = verify(new Machine(circuit), spec)
    assert.equal(
      result.ok,
      true,
      `${key}'s reference circuit failed its own spec: ` +
      `${JSON.stringify(result.divergence)} (power ${result.power}, ` +
      `${result.lines} instructions)`,
    )
  }
})
