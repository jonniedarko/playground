/* =========================================================================
   Device behaviours, keyed by part tag.

   sim.js is the machine: scheduling, instructions, nets, the XBus rendezvous.
   This file is what a device *does* when the machine asks it to — settle its
   outputs, answer an XBus read without blocking, take an XBus write, move a
   pointer after a read. Split out so sim.js does not grow a tag branch per
   part.

   Every key is optional; a device implements only what it needs.

     DEVICES['dx-300'] = {
       init(ctx, part) {},                          // per-build state, once
       refresh(ctx, part) {},                       // drive nets each settle
       canServe(ctx, part, pin) { return true },    // answer an xbus READ without blocking?
       canAccept(ctx, part, pin) { return true },    // will this pin take a WRITE?
       serve(ctx, part, pin) { return 0 },          // the value to supply
       accept(ctx, part, pin, value) {},            // take an xbus write
       afterRead(ctx, part, pin) {},                // pointer moves, etc
       tick(ctx, part) {},                          // once per time unit
     }

   canServe and canAccept answer two different questions: canServe is "can
   this pin be read", canAccept is "will this pin take a write". Most parts
   read and write on the same pins and need only canServe - the machine falls
   back to it for canAccept when a device does not define one. A pin that is
   write-only (e.g. a radio's `transmit`) must return false from canServe and
   true from canAccept; a read-only pin the reverse. Never let a pin claim
   canServe for a read that serve() has no branch for.

   ctx is the Machine. Devices may call ctx.net(part.id, pin),
   ctx.refreshDevices(), ctx.random() and clamp (imported from sim.js).
   Devices must not reach into chip internals.
   ========================================================================= */

import { clamp } from './sim.js'

export const DEVICES = {}

// ------------------------------------------------------------------ dx-300

DEVICES['dx-300'] = {
  // XBus devices are always ready, so a chip talking to one never blocks -
  // but only on the three pins this part actually has (x0, x1, x2).
  canServe(ctx, part, pin) {
    return pin.startsWith('x')
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
  // Ready on its two data pins and its two address pins - matches serve()'s
  // own dispatch below, so the two stay in step.
  canServe(ctx, part, pin) {
    return pin.startsWith('d') || pin.startsWith('a')
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

  // Read-only XBus: always has the value ready, on either of its two pins.
  canServe(ctx, part, pin) {
    return pin === 'read0' || pin === 'read1'
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

  // Always has a result ready, on any of its four xbus pins.
  canServe(ctx, part, pin) {
    return pin.startsWith('x')
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

// ---------------------------------------------------------------- n4pb-8000

/**
 * Push-button controller. A press reads as the button's number, a release as
 * its negation; idle reads yield -999 (parts.js marks all four pins
 * `blocking: false`). The datasheet gives no per-pin mapping for its up-to-8
 * buttons across 4 pins, so - as with D80C010-F's two pins and MC4010's four -
 * this is one shared FIFO answered from any pin, matching Machine.pressButton
 * / releaseButton, which take no pin argument either.
 */
DEVICES['n4pb-8000'] = {
  init(ctx, part) {
    part.events = [] // n for a press, -n for a release
  },

  canServe(ctx, part, pin) {
    if (!pin.startsWith('x')) return false
    return part.events.length > 0
  },

  // Peek only; afterRead consumes. Serving without a guaranteed consumption
  // (e.g. two reads racing the same net) must not drop an unread event.
  serve(ctx, part, pin) {
    return part.events[0]
  },

  afterRead(ctx, part, pin) {
    part.events.shift()
  },
}

// --------------------------------------------------------------- c2s-rf901

/**
 * Paired transceiver. `transmit` always accepts a write - a radio never
 * stores its own outgoing packet, it hands it straight off - and broadcasts
 * it onto every other C2S-RF901 on the board's `receive` buffer. The page
 * never states the rule for more than two radios on a board; "every other
 * radio" is this task's own instruction (radio.md itself describes only a
 * single radio's own dual-pin link, not how radios reach each other), so
 * that is what this implements. `receive` yields -999 when its buffer is
 * empty (parts.js marks it `blocking: false`).
 */
DEVICES['c2s-rf901'] = {
  init(ctx, part) {
    part.buffer = [] // FIFO of values received from other radios' transmit
  },

  // Only `receive` can be read, and only with a packet buffered. `transmit`
  // is write-only: answering a read there handed back a packet from the
  // receive buffer, on the wrong pin and without consuming it.
  canServe(ctx, part, pin) {
    return pin === 'receive' && part.buffer.length > 0
  },

  canAccept(ctx, part, pin) {
    return pin === 'transmit'
  },

  serve(ctx, part, pin) {
    return part.buffer[0] // peek; afterRead consumes
  },

  accept(ctx, part, pin, value) {
    if (pin !== 'transmit') return
    for (const other of ctx.parts) {
      if (other.tag === 'c2s-rf901' && other.id !== part.id) other.buffer.push(value)
    }
  },

  afterRead(ctx, part, pin) {
    if (pin === 'receive') part.buffer.shift()
  },
}

// ---------------------------------------------------------------- lx-910c

/**
 * Custom LCD: `cN` drives segments, `tN` reports touches, `qN` queries a
 * segment's state. This part has exactly one of each (c0, t0, q0) - the "N"
 * in the datasheet names the segment addressed by the value, not a family of
 * pins.
 *
 * `t0` is an event queue with the same idle -999 as N4PB-8000 (parts.js
 * marks it `blocking: false`). `c0` and `q0` are not: the datasheet's table
 * gives `tN` an explicit `-999` row but gives `qN` none, so `qN` is a plain
 * always-answers register - like D80C010-F or DX300 - rather than an event
 * stream: write the segment to ask about, then read back its state, which
 * only works if the write is always accepted and the read always answers.
 * Segment state itself is a sparse map over a blanket on/off default, since
 * the datasheet gives no bound on how many segments a custom design has.
 */
DEVICES['lx-910c'] = {
  init(ctx, part) {
    part.touches = []         // FIFO: segment for touch-down, -segment for release
    part.segments = new Map() // segment number -> explicit on/off
    part.allOn = false        // blanket state where segments has no entry
    part.queryPending = null  // segment last asked about via q0
  },

  // `c0` is write-only - it drives segments and has nothing to report - so it
  // says no here and yes to canAccept. Saying yes to both made a read of `c0`
  // fall through serve() with no branch and hand a register `undefined`.
  canServe(ctx, part, pin) {
    if (pin === 'q0') return true
    if (pin === 't0') return part.touches.length > 0
    return false
  },

  canAccept(ctx, part, pin) {
    return pin === 'c0' || pin === 'q0'
  },

  serve(ctx, part, pin) {
    if (pin === 't0') return part.touches[0] // peek; afterRead consumes
    if (pin === 'q0') {
      const on = part.segments.has(part.queryPending) ? part.segments.get(part.queryPending) : part.allOn
      return on ? 1 : 0
    }
  },

  accept(ctx, part, pin, value) {
    if (pin === 'c0') {
      if (value === 999) { part.allOn = true; part.segments.clear() }
      else if (value === -999) { part.allOn = false; part.segments.clear() }
      else if (value < 0) part.segments.set(-value, false)
      else part.segments.set(value, true)
    } else if (pin === 'q0') {
      part.queryPending = value
    }
  },

  afterRead(ctx, part, pin) {
    if (pin === 't0') part.touches.shift()
  },
}

// ------------------------------------------------------------------ dt-2415

/**
 * Wall clock. Drives its one simple pin with the 15-minute index (0-95)
 * derived from `ctx.timeOfDay` (minutes past midnight, clock.md's own
 * table). timeOfDay does not advance on its own - refresh() just reads
 * whatever it currently is, every time it is asked, so setting it and
 * calling ctx.refreshDevices() (or advancing the clock) is enough to move
 * the reading. The modulo guards a timeOfDay of 1440 or more (a whole day
 * or past it) or negative; the datasheet doesn't need this since its table
 * never leaves 0-1439, so it is defensive, not a documented wraparound rule.
 */
DEVICES['dt-2415'] = {
  refresh(ctx, part) {
    const net = ctx.net(part.id, 'time')
    if (!net) return
    const minutes = ((ctx.timeOfDay % 1440) + 1440) % 1440
    net.drivers.set(part.id, Math.floor(minutes / 15))
  },
}

// ----------------------------------------------------------------- kuji-ek1

/**
 * Oracle engine. `button` going high starts a divination: six values on
 * `oracle`, one per time unit, starting with the lowermost line (100 solid,
 * 0 broken - specialist-parts.md's own wording). Driven from ctx.time rather
 * than a private counter, so refresh() answers the same way no matter how
 * many times a settle() calls it within one unit, and Machine.settle() asks
 * it at least once per unit even when nothing else does.
 *
 * The page says nothing about `button` going high again while a divination
 * is already running (specialist-parts.md gives only "starts a
 * divination"). This does not invent a queue or a restart for that case: a
 * rising edge is ignored while one is still in progress, so the run in
 * progress finishes exactly as it started - the least behaviour beyond what
 * the page states. Flagged, not silently decided; see the R11 Task 5 report.
 */
DEVICES['kuji-ek1'] = {
  init(ctx, part) {
    part.wasHigh = false
    part.values = null      // six 0/100 values, chosen once per divination
    part.triggeredAt = null // ctx.time of the rising edge that started it
  },

  refresh(ctx, part) {
    const buttonNet = ctx.net(part.id, 'button')
    const high = buttonNet ? buttonNet.level >= 50 : false
    const running = part.triggeredAt !== null && ctx.time - part.triggeredAt < 6
    if (high && !part.wasHigh && !running) {
      part.values = Array.from({ length: 6 }, () => (ctx.random() < 0.5 ? 0 : 100))
      part.triggeredAt = ctx.time
    }
    part.wasHigh = high

    if (!part.values) return
    const oracleNet = ctx.net(part.id, 'oracle')
    if (!oracleNet) return
    // Once past the sixth unit, hold the topmost (last) line rather than
    // going undriven - the page says nothing past the sixth value either.
    const index = Math.min(ctx.time - part.triggeredAt, 5)
    oracleNet.drivers.set(part.id, part.values[index])
  },
}

export default DEVICES
