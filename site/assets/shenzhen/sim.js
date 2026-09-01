/* =========================================================================
   MCxxxx simulator.

   Executes the circuits in circuits.js the way the manual describes them:
   time units as the clock, power as instructions actually run, arithmetic
   clamped to the register range, conditionals that start switched off, and
   XBus as a rendezvous that blocks until both sides show up.

   No DOM. The UI drives it; the tests drive it too.

     const m = new Machine(CIRCUITS.blink)
     m.setInput('button', 100)
     m.advance()            // run one time unit
     m.output('lamp')       // what the lamp is being driven to
   ========================================================================= */

import { PART_META } from './parts.js'
import { DEVICES } from './devices.js'
import { keywordHash } from './keywords.js'

export const MIN = -999
export const MAX = 999

/** Registers hold whole numbers in [-999, 999]; anything past that saturates. */
export const clamp = (v) => Math.max(MIN, Math.min(MAX, Math.trunc(v)))

/** Thrown when an instruction cannot complete because XBus has no partner yet. */
const BLOCKED = Symbol('blocked')

/** A chip that never sleeps would spin forever; stop and report instead of hanging. */
const INSTRUCTIONS_PER_TIME_UNIT = 10000

// -------------------------------------------------------------------- rng

/**
 * KUJI-EK1 needs a source of randomness the tests can still pin down, so
 * Machine.random is a seeded PRNG rather than Math.random. An unseeded RNG
 * makes every test that touches it flaky, which is the only reason it is
 * seeded at all - nothing about the algorithm or the default seed comes from
 * a datasheet. mulberry32: small, dependency-free, good enough for a coin
 * flip per hexagram line.
 */
const DEFAULT_SEED = 1

function mulberry32(seed) {
  let a = seed >>> 0
  return function random() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ------------------------------------------------------------------ parsing

const PIN_NAME = /^[px]\d$/

/**
 * Parse one program into instructions plus a label table.
 * Every line is `LABEL CONDITION INSTRUCTION COMMENT`, all parts optional.
 */
export function parseProgram(source, maxLines = Infinity) {
  const raw = String(source ?? '').split('\n')
  const lines = Number.isFinite(maxLines) ? raw.slice(0, maxLines) : raw
  const labels = new Map()
  const errors = []

  const program = lines.map((original, index) => {
    let text = original
    const hash = text.indexOf('#')
    if (hash > -1) text = text.slice(0, hash)
    text = text.trim()

    const label = /^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(text)
    if (label) {
      if (labels.has(label[1])) errors.push(`line ${index + 1}: duplicate label "${label[1]}"`)
      labels.set(label[1], index)
      text = label[2].trim()
    }

    let cond = null
    const marker = /^([+\-@])\s*(.*)$/.exec(text)
    if (marker) {
      cond = marker[1]
      text = marker[2].trim()
    }

    if (!text) return { op: null, args: [], cond, index }
    const parts = text.split(/\s+/)
    return { op: parts[0].toLowerCase(), args: parts.slice(1), cond, index }
  })

  return { program, labels, errors }
}

// ------------------------------------------------------------------- chip

class Chip {
  constructor(tag, code, id) {
    this.tag = tag
    this.id = id
    this.meta = PART_META[tag]
    this.regs = { acc: 0 }
    if (this.meta.regs && this.meta.regs.includes('dat')) this.regs.dat = 0
    this.pins = new Map(this.meta.pins.map((p) => [p.name, p]))
    this.reset(code)
  }

  reset(code = this.code) {
    this.code = code ?? ''
    const parsed = parseProgram(this.code, this.meta.lines)
    this.program = parsed.program
    this.labels = parsed.labels
    this.errors = parsed.errors
    this.pc = 0
    this.regs.acc = 0
    if ('dat' in this.regs) this.regs.dat = 0
    // Conditionals start disabled: neither + nor - runs until a test says so.
    this.flag = 'none'
    this.sleepUntil = -1
    this.blocked = null
    this.power = 0
    this.firstPass = true
    this.halted = this.program.every((i) => !i.op)
  }

  get state() {
    if (this.halted) return 'halt'
    if (this.blocked) return 'block'
    if (this.sleepUntil >= 0) return 'sleep'
    return 'run'
  }
}

// ------------------------------------------------------------------ nets

/** A wire group. Simple I/O carries a level; XBus carries one packet at a time. */
class Net {
  constructor(type) {
    this.type = type
    this.members = []
    this.drivers = new Map() // simple I/O: part id -> value it is driving
    this.reads = [] // xbus: parts waiting to read
    this.writes = [] // xbus: parts waiting to write, with the value
  }

  get level() {
    let out = 0
    for (const v of this.drivers.values()) out = Math.max(out, v)
    return out
  }
}

// --------------------------------------------------------------- machine

export class Machine {
  constructor(spec) {
    this.spec = spec
    this.build()
  }

  build() {
    this.time = 0
    this.deadlock = null
    this.error = null
    // Wall clock for DT2415: minutes past midnight. Does not advance on its
    // own in R11 - nothing here ticks it, only a test (or a caller) sets it.
    this.timeOfDay = 0
    // Seeded once per build so a reset() re-seeds deterministically too.
    this.random = mulberry32(this.spec.seed ?? DEFAULT_SEED)
    this.parts = this.spec.parts.map((p, id) => {
      const meta = PART_META[p.t]
      if (!meta) throw new Error(`unknown part: ${p.t}`)
      const base = { id, tag: p.t, meta, spec: p, label: p.label || meta.name }
      if (meta.lines) return Object.assign(base, { chip: new Chip(p.t, p.code ?? meta.sample, id) })
      if (meta.cells) return Object.assign(base, { cells: new Array(meta.cells).fill(0), ptr: { a0: 0, a1: 0 } })
      return base
    })

    // Wires: union the endpoints into nets.
    this.nets = []
    const netOf = new Map() // "id:pin" -> Net
    for (const [from, to] of this.spec.wires || []) {
      const ends = [from, to].map((e) => {
        const [idx, pin] = e.split(':')
        return { id: Number(idx), pin }
      })
      const type = this.pinMeta(ends[0].id, ends[0].pin).type
      let net = netOf.get(from) || netOf.get(to)
      if (!net) {
        net = new Net(type)
        this.nets.push(net)
      }
      for (const end of ends) {
        const key = `${end.id}:${end.pin}`
        if (!netOf.has(key)) {
          netOf.set(key, net)
          net.members.push(end)
        }
      }
    }
    this.netOf = netOf

    // Per-build device state, once — e.g. an input terminal's starting value.
    for (const part of this.parts) {
      const device = DEVICES[part.tag]
      if (device && device.init) device.init(this, part)
    }
    this.refreshDevices()
  }

  reset() {
    this.build()
  }

  pinMeta(id, pin) {
    const part = this.parts[id] || this.spec.parts[id]
    const meta = part.meta || PART_META[part.t]
    if (meta.pins.length === 1 && part.spec) {
      // io-terminal names its single pin after its label.
      return { ...meta.pins[0], name: part.spec.label || meta.pins[0].name, type: part.spec.type || meta.pins[0].type }
    }
    const found = meta.pins.find((p) => p.name === pin)
    if (!found) throw new Error(`part ${id} (${meta.name}) has no pin "${pin}"`)
    return found
  }

  net(id, pin) {
    return this.netOf.get(`${id}:${pin}`) || null
  }

  /** Find a part by its terminal label. */
  terminal(label) {
    return this.parts.find((p) => p.tag === 'io-terminal' && p.label === label)
  }

  /**
   * Set what an input terminal presents to the circuit.
   *
   * A simple terminal is a level, so this replaces it. An XBus one is a
   * stream, so this hands it one more value to be read: the two pin types
   * are different contracts, and a queue is what "a chip reads a packet"
   * means.
   */
  setInput(label, value) {
    const part = this.terminal(label)
    if (!part) throw new Error(`no terminal labelled "${label}"`)
    if (part.spec.type === 'xbus') {
      part.queue.push(clamp(value))
      return this
    }
    part.value = clamp(value)
    this.refreshDevices()
    return this
  }

  /**
   * Read a terminal: the level on it for a simple one, and for an XBus one
   * the last value it was handed, since a stream has no level to read.
   */
  output(label) {
    const part = this.terminal(label)
    if (!part) throw new Error(`no terminal labelled "${label}"`)
    if (part.spec.type === 'xbus') return part.value || 0
    const net = this.net(part.id, part.label)
    return net ? net.level : 0
  }

  /** Everything an XBus output terminal has been handed, in order. */
  received(label) {
    const part = this.terminal(label)
    if (!part) throw new Error(`no terminal labelled "${label}"`)
    return part.received || []
  }

  /** Find an N4PB-8000 by its label, the same way terminal() finds an io-terminal. */
  buttonController(label) {
    const part = this.parts.find((p) => p.tag === 'n4pb-8000' && p.label === label)
    if (!part) throw new Error(`no N4PB-8000 labelled "${label}"`)
    return part
  }

  /** Queue a button-down event: the next read of any of its pins yields n. */
  pressButton(label, n) {
    this.buttonController(label).events.push(n)
    return this
  }

  /** Queue a button-up event: the next read of any of its pins yields -n. */
  releaseButton(label, n) {
    this.buttonController(label).events.push(-n)
    return this
  }

  /** Find an NLP2, by label when there is more than one. */
  recogniser(label) {
    const found = this.parts.filter((p) => p.tag === 'nlp-2' && (label === undefined || p.label === label))
    if (!found.length) throw new Error(label === undefined ? 'no NLP2 on this board' : `no NLP2 labelled "${label}"`)
    return found[0]
  }

  /**
   * Queue a keyword the manual publishes a hash for. The pair is sent as two
   * 3-digit values, so this pushes both halves in order.
   *
   * A word the manual does not list is refused rather than hashed: the hash
   * function is not in the manual, and guessing one would put invented data
   * on a page that is otherwise a transcription.
   */
  hearKeyword(word, label) {
    const pair = keywordHash(word)
    if (!pair) {
      throw new Error(
        `the manual publishes no hash for "${word}". Use Machine.hear(a, b) with a known pair, ` +
        'or add it to keywords.js only if the manual actually lists it.')
    }
    return this.hear(pair[0], pair[1], label)
  }

  /** Queue a hash pair directly, for a keyword that has one but no name here. */
  hear(a, b, label) {
    this.recogniser(label).heard.push(a, b)
    return this
  }

  // ----------------------------------------------------------- devices

  /** Terminals, gates and a few standalone devices are continuous: recompute what they drive. */
  refreshDevices() {
    // True sources first: what an io-terminal presents to the board. Other
    // devices with a refresh (dt-2415, kuji-ek1) may read a net an io-terminal
    // drives in the very same pass, so the source has to go first.
    for (const part of this.parts) {
      if (part.tag !== 'io-terminal') continue
      const device = DEVICES[part.tag]
      if (device && device.refresh) device.refresh(this, part)
    }
    // Everything else that drives continuously but is not a gate (dt-2415's
    // time index, kuji-ek1's oracle stream). Gates get their own fixed-point
    // pass below because they may depend on each other; these do not.
    for (const part of this.parts) {
      if (part.tag === 'io-terminal' || part.meta.op) continue
      const device = DEVICES[part.tag]
      if (device && device.refresh) device.refresh(this, part)
    }
    // Gates settle after their inputs, so run them to a fixed point.
    for (let pass = 0; pass < 8; pass += 1) {
      let changed = false
      for (const part of this.parts) {
        if (!part.meta.op) continue
        const device = DEVICES[part.tag]
        if (!device || !device.refresh) continue
        const out = this.net(part.id, 'out')
        const before = out ? out.drivers.get(part.id) : undefined
        device.refresh(this, part)
        if (out && out.drivers.get(part.id) !== before) changed = true
      }
      if (!changed) break
    }
  }

  // -------------------------------------------------------------- pins

  readPin(chip, name) {
    const meta = chip.pins.get(name)
    if (!meta) throw new Error(`${chip.meta.name} has no pin ${name}`)
    const net = this.net(chip.id, name)

    if (meta.type === 'simple') {
      // Reading makes the pin an input, dropping whatever it was driving.
      if (net) net.drivers.delete(chip.id)
      this.refreshDevices()
      return net ? net.level : 0
    }

    if (!net) throw BLOCKED // an unwired XBus pin waits forever
    const pending = net.writes.find((w) => w.id !== chip.id)
    if (!pending) {
      // A pin marked blocking: false never makes a reader wait. But a device
      // that has something to hand over must still be asked first, or a part
      // whose whole contract is "a value if there is one, -999 if not" would
      // answer -999 forever. deviceReaderOn is that question; when it says no,
      // there is nothing to wait for and the read yields -999 at once.
      if (!this.deviceReaderOn(net, chip.id) && this.deviceSideNonBlocking(net, chip.id)) return MIN
      if (!net.reads.some((r) => r.id === chip.id)) net.reads.push({ id: chip.id })
      throw BLOCKED
    }
    net.writes.splice(net.writes.indexOf(pending), 1)
    net.reads = net.reads.filter((r) => r.id !== chip.id)
    this.afterDeviceRead(pending)
    return pending.value
  }

  writePin(chip, name, value) {
    const meta = chip.pins.get(name)
    if (!meta) throw new Error(`${chip.meta.name} has no pin ${name}`)
    const net = this.net(chip.id, name)

    if (meta.type === 'simple') {
      if (net) net.drivers.set(chip.id, Math.max(0, Math.min(100, value)))
      this.refreshDevices()
      return
    }

    if (!net) throw BLOCKED
    const waiting = net.reads.find((r) => r.id !== chip.id)
    const device = this.deviceAcceptorOn(net, chip.id)
    if (!waiting && !device) {
      if (!net.writes.some((w) => w.id === chip.id)) net.writes.push({ id: chip.id, value })
      throw BLOCKED
    }
    if (device) {
      this.deviceAccept(device, net, value)
    } else {
      net.reads.splice(net.reads.indexOf(waiting), 1)
      net.pendingValue = value
      const target = this.parts[waiting.id]
      if (target.chip) target.chip.deliver = value
    }
    net.writes = net.writes.filter((w) => w.id !== chip.id)
  }

  /** True if some other pin on this net is explicitly marked blocking: false. */
  deviceSideNonBlocking(net, exceptId) {
    return net.members.some((m) => m.id !== exceptId && this.pinMeta(m.id, m.pin).blocking === false)
  }

  /** XBus devices are always ready, so a chip talking to one never blocks. */
  deviceReaderOn(net, exceptId) {
    for (const member of net.members) {
      if (member.id === exceptId) continue
      const part = this.parts[member.id]
      const device = part && DEVICES[part.tag]
      if (device && device.canServe && device.canServe(this, part, member.pin)) return { part, pin: member.pin }
    }
    return null
  }

  /**
   * A device that will take a write on this pin.
   *
   * Reading and writing are two different questions, and a write-only pin
   * answers them differently: `transmit` on a radio takes a write and has
   * nothing to read back. Asking canServe for both made such a pin either
   * refuse the write or answer a read it could not honour - a radio handed
   * back a packet from its receive buffer, an LCD handed back undefined. A
   * device says canAccept when the two differ; most parts read and write on
   * the same pins and need only canServe.
   */
  deviceAcceptorOn(net, exceptId) {
    for (const member of net.members) {
      if (member.id === exceptId) continue
      const part = this.parts[member.id]
      const device = part && DEVICES[part.tag]
      const can = device && (device.canAccept || device.canServe)
      if (can && can.call(device, this, part, member.pin)) return { part, pin: member.pin }
    }
    return null
  }

  deviceAccept(reader, net, value) {
    const { part, pin } = reader
    const device = DEVICES[part.tag]
    if (device && device.accept) device.accept(this, part, pin, value)
  }

  /** A device that supplied a value may need to move its pointer on. */
  afterDeviceRead(pending) {
    const part = this.parts[pending.id]
    const device = part && DEVICES[part.tag]
    if (device && device.afterRead) device.afterRead(this, part, pending.pin)
  }

  /** Offer whatever the XBus devices on a net can supply to a waiting reader. */
  serveDevices() {
    let served = false
    for (const net of this.nets) {
      if (net.type !== 'xbus' || !net.reads.length) continue
      for (const member of net.members) {
        const part = this.parts[member.id]
        if (!part) continue
        const device = DEVICES[part.tag]
        if (!device || !device.canServe || !device.canServe(this, part, member.pin)) continue
        if (!device.serve) continue
        const value = device.serve(this, part, member.pin)
        net.writes.push({ id: part.id, value, pin: member.pin })
        served = true
        break
      }
    }
    return served
  }

  // ------------------------------------------------------- instructions

  value(chip, token) {
    if (token === undefined) throw new Error('missing operand')
    if (/^[+-]?\d+$/.test(token)) return clamp(Number(token))
    const name = token.toLowerCase()
    if (name === 'null') return 0
    if (name in chip.regs) return chip.regs[name]
    if (PIN_NAME.test(name)) return this.readPin(chip, name)
    throw new Error(`${chip.meta.name}: unknown operand "${token}"`)
  }

  store(chip, token, value) {
    const name = String(token).toLowerCase()
    if (name === 'null') return
    if (name in chip.regs) {
      chip.regs[name] = clamp(value)
      return
    }
    if (PIN_NAME.test(name)) {
      this.writePin(chip, name, value)
      return
    }
    throw new Error(`${chip.meta.name}: cannot write to "${token}"`)
  }

  /** Run one instruction on one chip. Returns true if the chip did something. */
  stepChip(part) {
    const chip = part.chip
    if (!chip || chip.halted || chip.blocked || chip.sleepUntil > this.time) return false
    if (chip.sleepUntil >= 0 && chip.sleepUntil <= this.time) chip.sleepUntil = -1

    const ins = chip.program[chip.pc]
    const advance = () => {
      chip.pc += 1
      if (chip.pc >= chip.program.length) {
        chip.pc = 0
        chip.firstPass = false
      }
    }

    // A blank line, or one switched off, costs nothing.
    if (!ins || !ins.op) {
      advance()
      return true
    }
    if (ins.cond === '+' && chip.flag !== 'true') return advance() || true
    if (ins.cond === '-' && chip.flag !== 'false') return advance() || true
    if (ins.cond === '@' && !chip.firstPass) return advance() || true

    try {
      this.exec(chip, ins)
    } catch (e) {
      if (e === BLOCKED) {
        chip.blocked = ins
        return false
      }
      chip.halted = true
      chip.error = e.message
      this.error = e.message
      return false
    }
    chip.power += 1
    if (!chip.jumped) advance()
    chip.jumped = false
    return true
  }

  exec(chip, ins) {
    const a = ins.args
    const v = (n) => this.value(chip, a[n])
    switch (ins.op) {
      case 'nop':
        return
      case 'mov':
        return this.store(chip, a[1], v(0))
      case 'jmp': {
        const target = chip.labels.get(a[0])
        if (target === undefined) throw new Error(`no label "${a[0]}"`)
        chip.pc = target
        chip.jumped = true
        return
      }
      case 'slp': {
        const units = Math.max(1, v(0))
        chip.sleepUntil = this.time + units
        return
      }
      case 'slx': {
        const net = this.net(chip.id, String(a[0]).toLowerCase())
        const ready = net && (net.writes.some((w) => w.id !== chip.id) || this.deviceWriterOn(net, chip.id))
        if (!ready) {
          if (net && !net.reads.some((r) => r.id === chip.id)) net.reads.push({ id: chip.id })
          chip.sleepUntil = this.time + 1
          chip.awaiting = String(a[0]).toLowerCase()
        }
        return
      }
      case 'add':
        return void (chip.regs.acc = clamp(chip.regs.acc + v(0)))
      case 'sub':
        return void (chip.regs.acc = clamp(chip.regs.acc - v(0)))
      case 'mul':
        return void (chip.regs.acc = clamp(chip.regs.acc * v(0)))
      case 'not':
        return void (chip.regs.acc = chip.regs.acc === 0 ? 100 : 0)
      case 'dgt': {
        const d = v(0)
        const s = Math.abs(chip.regs.acc)
        return void (chip.regs.acc = Math.floor(s / 10 ** d) % 10)
      }
      case 'dst': {
        const d = v(0)
        const value = v(1)
        const sign = chip.regs.acc < 0 ? -1 : 1
        const s = Math.abs(chip.regs.acc)
        const pow = 10 ** d
        const digit = Math.floor(s / pow) % 10
        return void (chip.regs.acc = clamp(sign * (s - digit * pow + (Math.abs(value) % 10) * pow)))
      }
      case 'teq':
        return void (chip.flag = v(0) === v(1) ? 'true' : 'false')
      case 'tgt':
        return void (chip.flag = v(0) > v(1) ? 'true' : 'false')
      case 'tlt':
        return void (chip.flag = v(0) < v(1) ? 'true' : 'false')
      case 'tcp': {
        const x = v(0)
        const y = v(1)
        // Equal disables both + and -, which is what makes tcp three-way.
        return void (chip.flag = x > y ? 'true' : x < y ? 'false' : 'none')
      }
      default:
        throw new Error(`unknown instruction "${ins.op}"`)
    }
  }

  deviceWriterOn(net, exceptId) {
    return Boolean(this.deviceReaderOn(net, exceptId))
  }

  // --------------------------------------------------------- scheduling

  /** Unblock any chip whose XBus partner has now arrived. */
  resolve() {
    let progressed = this.serveDevices()
    for (const part of this.parts) {
      const chip = part.chip
      if (!chip || !chip.blocked) continue
      const saved = chip.blocked
      chip.blocked = null
      if (this.stepChip(part)) progressed = true
      else if (!chip.blocked) chip.blocked = saved
    }
    return progressed
  }

  /** Run every chip until they are all sleeping or blocked. */
  settle() {
    // A device whose output depends on the current time unit (kuji-ek1) must
    // be asked at least once per unit even if no chip touches a pin that
    // unit - otherwise a board with no chip at all never advances it.
    this.refreshDevices()
    let budget = INSTRUCTIONS_PER_TIME_UNIT
    for (;;) {
      let progressed = false
      for (const part of this.parts) {
        if (!part.chip) continue
        while (this.stepChip(part)) {
          progressed = true
          if (--budget <= 0) {
            this.error = `${part.meta.name} ran ${INSTRUCTIONS_PER_TIME_UNIT} instructions without sleeping`
            return
          }
        }
      }
      if (this.resolve()) progressed = true
      if (!progressed) break
    }

    const chips = this.parts.filter((p) => p.chip && !p.chip.halted).map((p) => p.chip)
    const describe = (c) => `${c.meta.name} blocked on ${c.blocked.op} ${c.blocked.args.join(' ')}`

    // Everyone waiting on everyone: nothing can ever move again.
    //
    // Except a chip waiting on the board edge. An XBus input terminal is fed
    // from outside the machine, so an empty one may simply not have been
    // handed its next value yet - the packet reverser reads a value per time
    // unit and blocks in between, which is the circuit working, not failing.
    // Deadlock has to mean provably fatal or it is worthless as a signal, so
    // an edge-waiter downgrades the verdict to stalled.
    const onEdge = chips.some((c) => this.waitingOnEdge(c.id))
    if (chips.length && chips.every((c) => c.blocked) && !onEdge) this.deadlock = chips.map(describe)

    // Blocked while others merely sleep is not provably fatal, but it is the
    // symptom players actually hit, so surface it rather than sitting silent.
    this.stalled = chips.filter((c) => c.blocked).map(describe)
  }

  /**
   * Is this chip blocked reading from an XBus input terminal - the board's
   * edge - rather than from another part of the circuit? Only the edge can
   * be refilled from outside, so only the edge makes a block survivable.
   */
  waitingOnEdge(chipId) {
    for (const net of this.nets) {
      if (!net.reads.some((r) => r.id === chipId)) continue
      for (const member of net.members) {
        const part = this.parts[member.id]
        if (part && part.tag === 'io-terminal' && part.spec.type === 'xbus' && part.spec.side === 'right') {
          return true
        }
      }
    }
    return false
  }

  /**
   * Which token of a blocked instruction is the pin it blocked on, and was
   * that a read or a write.
   *
   * `chip.blocked.args` are raw tokens - a register, an immediate, a label,
   * or a pin - and the pin can be either operand (`mov x0 acc` reads x0;
   * `mov acc x1` writes x1). Rather than assume a position, this walks the
   * args in the order the interpreter itself evaluates them (mov reads its
   * first operand before writing its second; every other instruction that
   * touches a pin only reads) and asks the chip's own pin list whether each
   * token is an XBus pin at all - only XBus reads and writes ever block, so
   * a simple-pin token, register or immediate is skipped.
   *
   * For the token that is a pin, the net tells the rest: no net at all means
   * readPin/writePin threw before ever registering a wait (nothing wired);
   * otherwise this chip's id is exactly what got pushed onto net.reads or
   * net.writes the moment it blocked, so that registration - not the arg's
   * static position - is the ground truth for read vs write.
   *
   * Returns null only if chip.blocked is set but no arg resolves to a pin,
   * which should not happen; callers treat that as "could not explain".
   */
  blockedPin(chip, ins) {
    for (let i = 0; i < ins.args.length; i += 1) {
      const name = String(ins.args[i]).toLowerCase()
      const meta = chip.pins.get(name)
      if (!meta || meta.type !== 'xbus') continue
      const net = this.net(chip.id, name)
      if (!net) return { pin: name, net: null, direction: ins.op === 'mov' && i === 1 ? 'write' : 'read' }
      if (net.reads.some((r) => r.id === chip.id)) return { pin: name, net, direction: 'read' }
      if (net.writes.some((w) => w.id === chip.id)) return { pin: name, net, direction: 'write' }
      // This candidate's read or write went through fine - the instruction
      // blocked on a later operand instead. Keep looking.
    }
    return null
  }

  /**
   * Explain one blocked chip: which pin, what (if anything) is wired to it,
   * and why the wait hasn't resolved. Pure formatting over state settle()
   * already keeps in chip.blocked / net.reads / net.writes - see
   * blockedPin() above for how the pin itself is found.
   *
   * `reason` is one of:
   *   'unwired'  - nothing is wired to the pin at all.
   *   'edge'     - the other end is an XBus input terminal (the board's own
   *                edge) with nothing queued yet. Distinct from 'unwired'
   *                because something IS wired there; it is simply fed from
   *                outside the circuit, the same case waitingOnEdge() already
   *                downgrades a full deadlock for.
   *   'blocked'  - the other end is a chip, and that chip is itself blocked.
   *   'sleeping' - the other end is a chip, and that chip is asleep.
   *   'halted'   - the other end is a chip with no program to run at all, so
   *                it can never reach the pin. Not one of the task's three
   *                named reasons, but a real, reachable state this function
   *                must still describe rather than mis-file as something
   *                else - see the R15.1 task report.
   *   'other'    - the other end is a non-chip device (or something odder)
   *                that is neither serving nor accepting right now, e.g. a
   *                write-only part like LX700 or FM Blaster being read.
   *                Also not one of the three; kept honest rather than forced
   *                into a reason that would misdescribe it.
   */
  explainOne(part) {
    const chip = part.chip
    const ins = chip.blocked
    const found = this.blockedPin(chip, ins)
    const base = { id: part.id, tag: part.tag, label: part.label, op: ins.op, args: ins.args.slice() }
    const verb = (d) => (d === 'write' ? 'writing' : 'reading')

    if (!found) {
      return {
        ...base, pin: null, direction: null, reason: 'other', partner: null,
        message: `${part.label} is blocked on "${ins.op} ${ins.args.join(' ')}" (no pin identified).`,
      }
    }

    const { pin, net, direction } = found

    if (!net) {
      return {
        ...base, pin, direction, reason: 'unwired', partner: null,
        message: `${part.label} is blocked ${verb(direction)} ${pin}: nothing is wired to it.`,
      }
    }

    const otherEnd = net.members.find((m) => m.id !== part.id)
    const otherPart = otherEnd ? this.parts[otherEnd.id] : null
    const partner = otherPart ? { id: otherPart.id, tag: otherPart.tag, label: otherPart.label, pin: otherEnd.pin } : null

    if (otherPart && otherPart.tag === 'io-terminal' && otherPart.spec.type === 'xbus' && otherPart.spec.side === 'right') {
      return {
        ...base, pin, direction, reason: 'edge', partner,
        message: `${part.label} is waiting for input on ${pin}, from the "${otherPart.label}" terminal.`,
      }
    }

    if (otherPart && otherPart.chip) {
      const oc = otherPart.chip
      if (oc.blocked) {
        return {
          ...base, pin, direction, reason: 'blocked', partner,
          message: `${part.label} is blocked ${verb(direction)} ${pin}, wired to ${otherPart.label} ${otherEnd.pin} - which is itself blocked.`,
        }
      }
      if (oc.sleepUntil >= 0) {
        return {
          ...base, pin, direction, reason: 'sleeping', partner,
          message: `${part.label} is blocked ${verb(direction)} ${pin}, wired to ${otherPart.label} ${otherEnd.pin} - which is asleep.`,
        }
      }
      if (oc.halted) {
        return {
          ...base, pin, direction, reason: 'halted', partner,
          message: `${part.label} is blocked ${verb(direction)} ${pin}, wired to ${otherPart.label} ${otherEnd.pin} - which has no program running.`,
        }
      }
      // Should not occur once settle() has stopped every chip is halted,
      // blocked or asleep - but describe it rather than mis-file it.
      return {
        ...base, pin, direction, reason: 'other', partner,
        message: `${part.label} is blocked ${verb(direction)} ${pin}, wired to ${otherPart.label} ${otherEnd.pin}.`,
      }
    }

    // Something non-chip is wired there (or nothing at all, which should not
    // happen for a real net) but is not currently serving or accepting.
    return {
      ...base, pin, direction, reason: 'other', partner,
      message: partner
        ? `${part.label} is blocked ${verb(direction)} ${pin}, wired to ${otherPart.label} ${otherEnd.pin} - which has nothing for it right now.`
        : `${part.label} is blocked ${verb(direction)} ${pin}.`,
    }
  }

  /** Explain every chip currently blocked (chip.blocked, not merely asleep). */
  explainBlocked() {
    return this.parts.filter((p) => p.chip && p.chip.blocked).map((p) => this.explainOne(p))
  }

  /** Advance the clock by one time unit. Returns false if it cannot. */
  advance() {
    this.settle()
    if (this.deadlock || this.error) return false
    this.time += 1
    for (const part of this.parts) {
      const chip = part.chip
      if (chip && chip.sleepUntil >= 0 && chip.sleepUntil <= this.time) chip.sleepUntil = -1
    }
    return true
  }

  run(timeUnits) {
    for (let n = 0; n < timeUnits; n += 1) if (!this.advance()) return false
    return true
  }

  /** Snapshot for the UI: what to show on each chip. */
  snapshot() {
    return this.parts.map((part) => {
      if (!part.chip) return { id: part.id, tag: part.tag, label: part.label }
      const c = part.chip
      return {
        id: part.id,
        tag: part.tag,
        label: part.label,
        pc: c.pc,
        acc: c.regs.acc,
        dat: 'dat' in c.regs ? c.regs.dat : null,
        state: c.state,
        power: c.power,
      }
    })
  }
}

export default Machine
