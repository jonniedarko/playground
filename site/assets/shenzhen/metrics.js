/* =========================================================================
   Board metrics: production cost, instructions, power - the three readings
   the bench's status strip carries under the board.

   Pure - no DOM, no import from components.js/ide.js/embed.js - so a status
   strip built on this can be exercised under plain node, the same reasoning
   verify.js and share.js already follow. sim.js stays the machine; this file
   only reads PART_META and parseProgram, both already node-safe.

   verify.js computes power and lines the same way, but only for a Machine
   that is already built and running. This module exists so the status strip
   can show the same numbers from raw board state - before a run, or for
   parts a Machine was never built from - without constructing one.
   ========================================================================= */

import { PART_META } from './parts.js'
import { parseProgram } from './sim.js'

/**
 * Sum of each part's PART_META cost. A tag missing from PART_META, or one
 * whose entry has no numeric cost (there are none today, but nothing here
 * assumes that stays true), contributes 0 rather than NaN.
 */
export function productionCost(parts) {
  return (parts ?? []).reduce((total, part) => {
    const cost = PART_META[part?.tag]?.cost
    return total + (typeof cost === 'number' && Number.isFinite(cost) ? cost : 0)
  }, 0)
}

/**
 * Total executable instructions across every part.
 *
 * "Executable" is read off parseProgram(), the same parser sim.js runs on:
 * every line gets an `op`, and a line with no instruction on it - blank,
 * comment-only, or a bare label with nothing after the colon - parses to
 * `op: null`. A label or a conditional marker (+ - @) in front of a real
 * instruction does not clear `op`, so that line still counts. This is a
 * property of what parseProgram calls an instruction, not a count taken
 * from watching the game.
 *
 * A part's line limit (PART_META[tag].lines) is passed straight through as
 * parseProgram's maxLines, so a line past the chip's physical limit is
 * dropped before counting - the chip cannot hold it, so it cannot run it.
 * A tag missing from PART_META, or a part with no code, contributes 0.
 */
export function linesOfCode(parts) {
  return (parts ?? []).reduce((total, part) => {
    const meta = PART_META[part?.tag]
    if (!meta) return total
    const { program } = parseProgram(part.code, meta.lines)
    return total + program.filter((instruction) => instruction.op).length
  }, 0)
}

/** Sum of `power` across a Machine.snapshot() array; a part with no chip
    (and so no power reading) or a non-finite value contributes 0. */
export function totalPower(snapshot) {
  return (snapshot ?? []).reduce((total, entry) => {
    const power = entry?.power
    return total + (typeof power === 'number' && Number.isFinite(power) ? power : 0)
  }, 0)
}

export default { productionCost, linesOfCode, totalPower }
