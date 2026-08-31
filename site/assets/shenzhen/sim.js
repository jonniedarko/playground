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

export const MIN = -999
export const MAX = 999

/** Registers hold whole numbers in [-999, 999]; anything past that saturates. */
export const clamp = (v) => Math.max(MIN, Math.min(MAX, Math.trunc(v)))

/** Thrown when an instruction cannot complete because XBus has no partner yet. */
const BLOCKED = Symbol('blocked')

/** A chip that never sleeps would spin forever; stop and report instead of hanging. */
const INSTRUCTIONS_PER_TIME_UNIT = 10000

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

  /** Set the level an input terminal presents to the circuit. */
  setInput(label, value) {
    const part = this.terminal(label)
    if (!part) throw new Error(`no terminal labelled "${label}"`)
    part.value = clamp(value)
    this.refreshDevices()
    return this
  }

  /** Read the level on a terminal, whoever is driving it. */
  output(label) {
    const part = this.terminal(label)
    if (!part) throw new Error(`no terminal labelled "${label}"`)
    const net = this.net(part.id, part.label)
    return net ? net.level : 0
  }

  // ----------------------------------------------------------- devices

  /** Terminals and gates are continuous: recompute what they drive. */
  refreshDevices() {
    for (const part of this.parts) {
      if (part.tag === 'io-terminal') {
        const device = DEVICES[part.tag]
        if (device && device.refresh) device.refresh(this, part)
      }
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
    const device = this.deviceReaderOn(net, chip.id)
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
    if (chips.length && chips.every((c) => c.blocked)) this.deadlock = chips.map(describe)

    // Blocked while others merely sleep is not provably fatal, but it is the
    // symptom players actually hit, so surface it rather than sitting silent.
    this.stalled = chips.filter((c) => c.blocked).map(describe)
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
