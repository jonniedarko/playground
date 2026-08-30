/* =========================================================================
   Documentation figures.

   The only script a content page loads. It finds figure placeholders left in
   the markup and swaps them for real components, so a datasheet shows the
   actual chip rather than a drawing of one.

   Markup contract - the fallback content inside stays put when this never
   runs, so pages still make sense with JavaScript off:

     <div class="chip-figure" data-part="mc-4000">
       ...static pinout markup used as the fallback...
     </div>

   Optional attributes:
     data-cell="36"    grid size in px (default 40, 32 on narrow screens)
     data-code="..."   program to show; omit for the part's own sample,
                       set empty to show a bare chip
   ========================================================================= */

import './components.js'
import { CIRCUITS } from './circuits.js'
import { Machine } from './sim.js'

const TICK_MS = 550

const WIDE_CELL = 40
const NARROW_CELL = 32
const NARROW_AT = 380

function cellFor(el) {
  const explicit = Number(el.dataset.cell)
  if (explicit) return explicit
  return window.innerWidth < NARROW_AT ? NARROW_CELL : WIDE_CELL
}

/** Replace one placeholder with a live, non-interactive part. */
function upgrade(el) {
  const tag = el.dataset.part
  const ctor = tag && customElements.get(tag)
  if (!ctor) return false

  const meta = ctor.meta
  const cell = cellFor(el)

  const board = document.createElement('circuit-board')
  board.setAttribute('static', '')
  board.style.setProperty('--cell', cell + 'px')
  // One spare column each side so the pin traces and their labels have room.
  board.style.width = (meta.cols + 2) * cell + 'px'
  board.style.height = meta.rows * cell + 'px'

  const part = document.createElement(tag)
  part.setAttribute('x', '1')
  part.setAttribute('y', '0')
  part.setAttribute('static', '')
  part.setAttribute('labels', '')
  if (el.dataset.code !== undefined) part.setAttribute('code', el.dataset.code)

  board.appendChild(part)

  // Keep the fallback markup for screen readers and for anyone with JS off up
  // to this point; the live board is decorative once the label is on the figure.
  const label = el.getAttribute('aria-label') || `${meta.name} pin configuration`
  el.replaceChildren(board)
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', label)
  el.dataset.upgraded = 'true'
  return true
}

/** Build a whole reference circuit: parts, their programs, and the wires. */
function upgradeCircuit(el) {
  const spec = CIRCUITS[el.dataset.circuit]
  if (!spec) return false

  const cell = Number(el.dataset.cell) || spec.cell || 32
  const board = document.createElement('circuit-board')
  board.setAttribute('static', '')
  board.style.setProperty('--cell', cell + 'px')

  const made = spec.parts.map((p) => {
    const ctor = customElements.get(p.t)
    if (!ctor) return null
    const part = document.createElement(p.t)
    // Attributes that shape the part must land before it is connected, because
    // io-terminal resolves its pins from them.
    if (p.label) part.setAttribute('label', p.label)
    if (p.type) part.setAttribute('type', p.type)
    if (p.side) part.setAttribute('side', p.side)
    part.setAttribute('x', String(p.x + 1))
    part.setAttribute('y', String(p.y))
    part.setAttribute('static', '')
    part.setAttribute('labels', '')
    if (p.code !== undefined) part.setAttribute('code', p.code)
    board.appendChild(part)
    return part
  })

  if (made.some((p) => !p)) return false

  // Size the board to the parts, leaving a column each side for pin traces.
  let cols = 0
  let rows = 0
  spec.parts.forEach((p, n) => {
    const meta = made[n].meta
    cols = Math.max(cols, p.x + 1 + meta.cols)
    rows = Math.max(rows, p.y + meta.rows)
  })
  board.style.width = (cols + 1) * cell + 'px'
  board.style.height = rows * cell + 'px'

  el.replaceChildren(board)
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', el.getAttribute('aria-label') || spec.label || 'Circuit diagram')
  el.dataset.upgraded = 'true'

  // Wires need laid-out pins, so connect after the parts have been rendered.
  requestAnimationFrame(() => {
    for (const [from, to] of spec.wires) {
      const [ai, an] = from.split(':')
      const [bi, bn] = to.split(':')
      const pa = made[Number(ai)]
      const pb = made[Number(bi)]
      const ea = pa && pa.pinElement(an)
      const eb = pb && pb.pinElement(bn)
      if (!ea || !eb) {
        console.warn(`circuit ${el.dataset.circuit}: no pin for ${!ea ? from : to}`)
        continue
      }
      board.connect({ part: pa, pin: ea }, { part: pb, pin: eb })
    }
    el.dataset.wires = String(board.wires.length)
    // Only figures that opt in get controls; the rest stay illustrations.
    if (el.hasAttribute('data-run')) {
      el.runner = new Runner(el, board, made, spec, el.dataset.circuit)
    }
  })
  return true
}


/* ---------------------------------------------------------------- runner
   Drives a figure's circuit with the simulator: run, step, reset, live
   registers, the executing line, and what each terminal is carrying.
   ---------------------------------------------------------------------- */
class Runner {
  constructor(figure, board, parts, spec, name) {
    this.figure = figure
    this.board = board
    this.parts = parts
    this.spec = spec
    this.name = name
    this.machine = new Machine(spec)
    this.timer = null
    this.buildControls()
    this.sync()
  }

  get inputs() {
    // Terminals that feed the circuit rather than being driven by it.
    return this.spec.parts
      .map((p, id) => ({ ...p, id }))
      .filter((p) => p.t === 'io-terminal' && p.side === 'right')
  }

  buildControls() {
    const bar = document.createElement('div')
    bar.className = 'sim-bar'

    this.playBtn = this.button('Run', () => this.toggle(), 'sim-play')
    this.stepBtn = this.button('Step', () => { this.pause(); this.tick() })
    this.resetBtn = this.button('Reset', () => this.reset())
    bar.append(this.playBtn, this.stepBtn, this.resetBtn)

    for (const input of this.inputs) {
      const toggle = this.button(input.label, () => {
        const on = this.machine.terminal(input.label).value >= 50
        this.machine.setInput(input.label, on ? 0 : 100)
        toggle.setAttribute('aria-pressed', on ? 'false' : 'true')
        this.sync()
      }, 'sim-input')
      toggle.setAttribute('aria-pressed', 'false')
      bar.appendChild(toggle)
    }

    this.readout = document.createElement('p')
    this.readout.className = 'sim-readout'
    this.readout.setAttribute('role', 'status')
    bar.appendChild(this.readout)

    this.figure.appendChild(bar)

    if (this.figure.hasAttribute('data-scope')) {
      this.scope = document.createElement('scope-trace')
      this.scope.className = 'sim-scope'
      this.figure.appendChild(this.scope)
    }
  }

  button(text, onClick, extra = '') {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'sim-btn' + (extra ? ' ' + extra : '')
    b.textContent = text
    b.addEventListener('click', onClick)
    return b
  }

  toggle() {
    if (this.timer) this.pause()
    else this.play()
  }

  play() {
    if (this.timer) return
    this.playBtn.textContent = 'Pause'
    this.timer = setInterval(() => this.tick(), TICK_MS)
    this.figure.dataset.running = 'true'
  }

  pause() {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
    this.playBtn.textContent = 'Run'
    delete this.figure.dataset.running
  }

  reset() {
    this.pause()
    const inputs = new Map(this.inputs.map((i) => [i.label, this.machine.terminal(i.label).value]))
    this.machine = new Machine(this.spec)
    for (const [label, value] of inputs) this.machine.setInput(label, value)
    if (this.scope) this.scope.clear()
    for (const part of this.parts) part.resetRegisters?.()
    this.sync()
  }

  tick() {
    const ok = this.machine.advance()
    this.sync()
    if (!ok) this.pause()
  }

  sync() {
    const m = this.machine
    for (const snap of m.snapshot()) {
      const el = this.parts[snap.id]
      if (!el) continue
      if (el.setRegister) {
        el.setRegister('acc', snap.acc)
        if (snap.dat !== null) el.setRegister('dat', snap.dat)
        el.setRegister('state', snap.state.toUpperCase())
        el.setRegister('power', snap.power)
        el.setAttribute('exec', String(snap.pc))
      }
      if (el.setLevel) el.setLevel(m.output(snap.label))
    }

    if (this.scope) {
      const outs = this.spec.parts.filter((p) => p.t === 'io-terminal' && p.side === 'left')
      this.scope.record(Object.fromEntries(outs.map((o) => [o.label, m.output(o.label)])))
    }

    const power = m.snapshot().reduce((n, s) => n + (s.power || 0), 0)
    let status = `t=${m.time}   power ${power}`
    if (m.error) status = m.error
    else if (m.deadlock) status = 'Deadlock: ' + m.deadlock.join('; ')
    else if (m.stalled && m.stalled.length) status = 'Waiting: ' + m.stalled.join('; ')
    this.readout.textContent = status
    this.figure.dataset.simState = m.error ? 'error' : m.deadlock ? 'deadlock' : 'ok'
    this.figure.dataset.time = String(m.time)
  }
}

function upgradeAll() {
  for (const el of document.querySelectorAll('.chip-figure[data-part]:not([data-upgraded])')) {
    upgrade(el)
  }
  for (const el of document.querySelectorAll('.circuit-figure[data-circuit]:not([data-upgraded])')) {
    upgradeCircuit(el)
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', upgradeAll, { once: true })
} else {
  upgradeAll()
}

export { upgrade, upgradeCircuit, upgradeAll }
