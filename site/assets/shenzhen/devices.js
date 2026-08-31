/* =========================================================================
   Device behaviours, keyed by part tag.

   sim.js is the machine: scheduling, instructions, nets, the XBus rendezvous.
   This file is what a device *does* when the machine asks it to — settle its
   outputs, answer an XBus read without blocking, take an XBus write, move a
   pointer after a read. Split out so sim.js does not grow a tag branch per
   part.

   Every key is optional; a device implements only what it needs.

     DEVICES['dx-300'] = {
       init(ctx, part) {},                        // per-build state, once
       refresh(ctx, part) {},                     // drive nets each settle
       canServe(ctx, part, pin) { return true },  // answer an xbus read without blocking?
       serve(ctx, part, pin) { return 0 },        // the value to supply
       accept(ctx, part, pin, value) {},          // take an xbus write
       afterRead(ctx, part, pin) {},              // pointer moves, etc
       tick(ctx, part) {},                        // once per time unit
     }

   ctx is the Machine. Devices may call ctx.net(part.id, pin),
   ctx.refreshDevices() and clamp (imported from sim.js). Devices must not
   reach into chip internals.
   ========================================================================= */

import { clamp } from './sim.js'

export const DEVICES = {}

// ------------------------------------------------------------------ dx-300

DEVICES['dx-300'] = {
  // XBus devices are always ready, so a chip talking to one never blocks.
  canServe(ctx, part, pin) {
    return true
  },

  // Offer whatever the digits are currently showing.
  serve(ctx, part, pin) {
    let v = 0
    for (const [n, name] of [[0, 'p0'], [1, 'p1'], [2, 'p2']]) {
      const src = ctx.net(part.id, name)
      v += (src && src.level >= 50 ? 1 : 0) * 10 ** n
    }
    return v
  },

  // Digits of the value drive p0 (ones), p1 (tens), p2 (hundreds).
  accept(ctx, part, pin, value) {
    const v = Math.abs(value)
    for (const [n, name] of [[0, 'p0'], [1, 'p1'], [2, 'p2']]) {
      const out = ctx.net(part.id, name)
      if (out) out.drivers.set(part.id, Math.floor(v / 10 ** n) % 10 ? 100 : 0)
    }
    ctx.refreshDevices()
  },
}

// ---------------------------------------------------------------- memory

/**
 * 100P-14 (RAM) and 200P-14 (ROM). Identical behaviour, distinguished only by
 * `part.meta.readOnly`. `part.cells` and `part.ptr` are set up by the machine
 * when it builds any part whose meta declares `cells` — that is generic
 * infrastructure, not device-specific, so it stays in sim.js's build().
 */
const memory = {
  canServe(ctx, part, pin) {
    return true
  },

  serve(ctx, part, pin) {
    if (pin.startsWith('d')) {
      const which = pin === 'd0' ? 'a0' : 'a1'
      return part.cells[part.ptr[which]]
    }
    if (pin.startsWith('a')) {
      return part.ptr[pin]
    }
  },

  accept(ctx, part, pin, value) {
    if (part.meta.readOnly) return // ROM ignores writes
    if (pin === 'a0' || pin === 'a1') {
      part.ptr[pin] = ((value % part.cells.length) + part.cells.length) % part.cells.length
    } else {
      const which = pin === 'd0' ? 'a0' : 'a1'
      part.cells[part.ptr[which]] = clamp(value)
      part.ptr[which] = (part.ptr[which] + 1) % part.cells.length
    }
  },

  // A device that supplied a value may need to move its pointer on.
  afterRead(ctx, part, pin) {
    if (pin && pin.startsWith('d')) {
      const which = pin === 'd0' ? 'a0' : 'a1'
      part.ptr[which] = (part.ptr[which] + 1) % part.cells.length
    }
  },
}

DEVICES['p-100p14'] = memory
DEVICES['p-200p14'] = memory

// ------------------------------------------------------------- io-terminal

DEVICES['io-terminal'] = {
  // Input terminals drive their net; everything else starts undriven.
  init(ctx, part) {
    part.value = 0
  },

  // Only an input terminal drives; an output one is driven by the chip.
  refresh(ctx, part) {
    const net = ctx.net(part.id, part.label)
    if (net && part.spec.side === 'right') net.drivers.set(part.id, part.value || 0)
  },
}

// ------------------------------------------------------------------- gates

/** LC70G04/08/32/86: op and inputs come from PART_META, the logic is shared. */
const logicGate = {
  refresh(ctx, part) {
    const read = (pin) => {
      const net = ctx.net(part.id, pin)
      return net ? net.level : 0
    }
    const on = (v) => v >= 50
    const a = on(read('a'))
    const b = part.meta.inputs === 2 ? on(read('b')) : false
    const result =
      part.meta.op === 'NOT' ? !a
        : part.meta.op === 'AND' ? a && b
        : part.meta.op === 'OR' ? a || b
        : a !== b
    const out = ctx.net(part.id, 'out')
    if (out) out.drivers.set(part.id, result ? 100 : 0)
  },
}

for (const tag of ['lc-70g04', 'lc-70g08', 'lc-70g32', 'lc-70g86']) {
  DEVICES[tag] = logicGate
}

// -------------------------------------------------------------- d80c010-f

DEVICES['d80c010-f'] = {
  // The datasheet says both pins return "the stored identification value" but
  // never gives that value. 1000 is used here arbitrarily, per instruction —
  // it is not taken from the page and carries no other meaning.
  init(ctx, part) {
    part.identification = 1000
  },

  // Read-only XBus: always has the value ready, on either pin.
  canServe(ctx, part, pin) {
    return true
  },

  serve(ctx, part, pin) {
    return part.identification
  },
}

// ----------------------------------------------------------------- mc-4010

/**
 * Math co-processor. A command sequence — an opcode then one or two operand
 * values — is written a value at a time to any pin; once the sequence is
 * complete the `result` register updates and is readable from any pin, any
 * number of times, until the next command completes.
 *
 * Sign rules for remainder and modulus are the datasheet's own, verbatim:
 * remainder takes the sign of A (truncating division's remainder), modulus
 * the sign of B (floored division's remainder). These are two distinct
 * conventions by design, not JS `%` — hence the explicit formulas below
 * rather than the `%` operator.
 */
const MC4010_ARITY = { 10: 1, 20: 2, 30: 2, 40: 2, 50: 2, 51: 2, 60: 2, 70: 2, 80: 1, 90: 2, 91: 2 }

DEVICES['mc-4010'] = {
  init(ctx, part) {
    part.result = 0
    part.pending = []
  },

  // Always has a result ready, on any pin.
  canServe(ctx, part, pin) {
    return true
  },

  serve(ctx, part, pin) {
    return part.result
  },

  // Any pin accepts the next value of the in-progress command sequence.
  accept(ctx, part, pin, value) {
    part.pending.push(value)
    const op = part.pending[0]
    const arity = MC4010_ARITY[op]
    if (arity === undefined) {
      // Not an opcode this datasheet defines. Start the sequence over on the
      // next value rather than let a bad first value jam the buffer forever.
      part.pending = []
      return
    }
    if (part.pending.length < arity + 1) return // sequence still incomplete

    const [, a, b] = part.pending
    const result =
      op === 10 ? a
        : op === 20 ? a + b
        : op === 30 ? a - b
        : op === 40 ? a * b
        : op === 50 ? a / b
        : op === 51 ? a - b * Math.trunc(a / b) // negative if A was negative
        : op === 60 ? a - b * Math.floor(a / b) // negative if B was negative
        : op === 70 ? a ** b
        : op === 80 ? Math.floor(Math.sqrt(a)) // rounded down
        : op === 90 ? Math.min(a, b)
        : Math.max(a, b) // 91: Max
    // Divide by zero, 0/0 and the square root of a negative are cases the
    // datasheet does not cover. They arrive here as Infinity or NaN, and a NaN
    // reaching a register poisons every comparison made on it afterwards, so
    // they all settle to 0. That value is a safe default, not the page's.
    // `+ 0` folds the -0 a fractional exponent truncates to back into 0.
    part.result = Number.isFinite(result) ? clamp(result) + 0 : 0
    part.pending = []
  },
}

export default DEVICES
