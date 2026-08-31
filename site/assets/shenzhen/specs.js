/* =========================================================================
   Spec data for the shipped reference circuits (see verify.js for the Spec
   shape and circuits.js for the boards themselves).

   Every expected value below is derived from what the circuit's own content
   page says it does - never from running the circuit and recording whatever
   came out. A recorded spec would pass just as happily if the circuit were
   wrong, which defeats the point of R12. Each spec's comment quotes the
   sentence(s) it comes from.

   `null` marks a time unit that is a matter of internal settle/handshake
   timing the page does not state - only the SEQUENCE and the causal rule the
   page describes are asserted there, never an invented instant. Where a
   sample is firm (not null), it is firm because the value cannot differ
   regardless of any reasonable settle-timing assumption - see each spec's
   comment.
   ========================================================================= */

/**
 * AN650 touch-activated light controller.
 *
 * an650-light-controller.md: "When a user touches a capacitive switch, the
 * controller will detect the rising edge and advance the light to the next
 * intensity level - from off, to 50%, to 100%, and back to off." The first
 * chip "can detect a transition from low (0) to high (100)" by comparing the
 * new sample against the previous one - i.e. an EDGE, not a level. The
 * load-bearing property this spec exists to catch: holding the switch high
 * for many consecutive units must NOT keep advancing the lamp past the one
 * step the edge earned it. A spec built by recording actual output would
 * never think to test that - it would just record whatever came out.
 *
 * `switch` is pressed three times, each held for several units and released
 * for several units in between. Each press's very first 2-3 units are
 * `null`: the page states the lamp advances on the edge, but not which
 * settle pass within that time unit the two chips' XBus handshake completes
 * in, so that instant is a don't-care. Every unit well clear of a transition
 * is asserted firmly, including several units in a row *during* each hold -
 * that run of repeated identical values is what proves the level is not
 * being read again.
 */
export const an650Spec = {
  circuit: 'an650',
  length: 31,
  inputs: {
    switch: [
      0, 0, 0, // settle, untouched
      100, 100, 100, 100, 100, 100, // first press, held 6 units
      0, 0, 0, 0, 0, // released 5 units
      100, 100, 100, 100, 100, 100, // second press, held 6 units
      0, 0, 0, 0, 0, // released 5 units
      100, 100, 100, 100, 100, 100, // third press, held 6 units - wraps 100 -> off
    ],
  },
  expect: {
    lamp: [
      0, 0, 0,
      // first press: edge somewhere in the first 3 units of the hold: don't
      // care exactly when, but it must land on 50 and STAY there while held.
      null, null, null, 50, 50, 50,
      // released: still 50 - releasing is not an edge, nothing should change.
      50, 50, 50, 50, 50,
      // second press: edge advances 50 -> 100, then holds.
      null, null, null, 100, 100, 100,
      // released: still 100.
      100, 100, 100, 100, 100,
      // third press: edge wraps 100 -> off (page: "back to off").
      null, null, null, 0, 0, 0,
    ],
  },
  tolerance: 0,
}

/**
 * DX300 stepper motor controller.
 *
 * dx300.md: "The reference circuit controls a stepper motor using the DX300
 * to drive the motor-0, motor-1 and motor-2 signals, with the
 * microcontroller's own simple I/O pin p0 driving the remaining motor-3
 * signal." And from the DX300's own usage section: writing a 3-digit value
 * to an XBus pin sets the simple I/O pins high (100) or low (0) per digit -
 * ones column p0, tens p1, hundreds p2 - confirmed by the datasheet's own
 * example table (XBus 100 -> p0=0, p1=0, p2=100).
 *
 * circuits.js's program alternates writing x0=100 (digits 1,0,0 -> p2 on)
 * and x0=10 (digits 0,1,0 -> p1 on) each separated by `slp 1`, with p0
 * (motor-3) toggled 100/0 in step. AN393's "on for N units" example ties a
 * write to the unit it executes in, so each write is observable starting at
 * the very sample it happens on - a single chip talking to a passive,
 * always-ready expander (the DX300's own note: writing always succeeds and
 * takes effect) has no cross-chip handshake to be uncertain about, so no
 * `null` is needed here at all.
 */
export const dx300StepperSpec = {
  circuit: 'dx300-stepper',
  length: 4,
  inputs: {},
  expect: {
    'motor-3': [100, 0, 100, 0],
    'motor-2': [100, 0, 100, 0], // hundreds digit of x0: 100 -> 1, 10 -> 0
    'motor-1': [0, 100, 0, 100], // tens digit of x0: 100 -> 0, 10 -> 1
    'motor-0': [0, 0, 0, 0], // ones digit of x0 is always 0 in this program
  },
  tolerance: 0,
}

/**
 * 100P-14 data packet reverser.
 *
 * memory.md: "The reference circuit reads in 3-value packets from `input`
 * and writes them back out to `output` in reverse order, using a 100P-14 to
 * temporarily store the values." This is a pure property - [a, b, c] in
 * gives [c, b, a] out - so the values are chosen distinguishable (not a
 * palindrome, not all equal) and only the FINAL, settled value is asserted:
 * once the whole pass has run, `output` must be showing `11`, the FIRST
 * value fed in - because reversal means it was written LAST, and a display
 * holds its last-written value. That is testable without claiming to know
 * which unit shows the transient 33 or 22 in between.
 *
 * length is short (3, matching the 3 packets) specifically so the sample at
 * the end never runs into a second pass re-reading the held input value -
 * see the report for why a longer run is not safe to assert here.
 *
 * This spec is what found the io-terminal XBus bug: an XBus terminal had no
 * read or write side at all, so the circuit deadlocked on its first read and
 * had never once run. The spec was left as derived rather than loosened to
 * match the broken behaviour, and the simulator was fixed instead. Which is
 * the entire argument for deriving a spec from the page.
 */
export const packetReverserSpec = {
  circuit: 'packet-reverser',
  length: 3,
  inputs: { input: [11, 22, 33] },
  expect: { output: [null, null, 11] },
  tolerance: 0,
}

export const SPECS = {
  an650: an650Spec,
  'dx300-stepper': dx300StepperSpec,
  'packet-reverser': packetReverserSpec,
}

export default SPECS
