/* ---------------------------------------------------------------- ide.js
   The workbench: an editable board with a palette, a simulator bar and a
   full-screen code editor.

   Everything here is assembled from parts that already exist - `circuit-board`
   does placement, dragging and wiring; `Machine` does the running. What this
   file adds is the shell around them and, more than anything, the touch
   affordances the board itself has no opinion about: an on-screen delete for
   a phone with no Delete key, zoom buttons instead of a fiddly slider, and a
   sim bar within thumb reach rather than pinned to the top.

   Loaded by embed.js on a page carrying `.ide`.
   ------------------------------------------------------------------------ */

import { Machine } from './sim.js'
import { PART_META } from './parts.js'
import CIRCUITS from './circuits.js'

const TICK_MS = 550
const STORE_KEY = 'sz-ide-board'
const CELL_MIN = 22
const CELL_MAX = 52
const CELL_STEP = 4

/** The palette, in the order a beginner meets them. */
const PALETTE = [
  { tag: 'mc-4000', name: 'MC4000' },
  { tag: 'mc-4000x', name: 'MC4000X' },
  { tag: 'mc-6000', name: 'MC6000' },
  { tag: 'dx-300', name: 'DX300' },
  { tag: 'p-100p14', name: '100P-14' },
  { tag: 'p-200p14', name: '200P-14' },
  { tag: 'lc-70g04', name: 'NOT' },
  { tag: 'lc-70g08', name: 'AND' },
  { tag: 'lc-70g32', name: 'OR' },
  { tag: 'lc-70g86', name: 'XOR' },
  { tag: 'io-terminal', name: 'Button', attrs: { label: 'button', type: 'simple', side: 'right' } },
  { tag: 'io-terminal', name: 'Lamp', attrs: { label: 'lamp', type: 'simple', side: 'left' } },
  { tag: 'io-terminal', name: 'Sensor', attrs: { label: 'sensor', type: 'simple', side: 'right' } },
  { tag: 'io-terminal', name: 'Motor', attrs: { label: 'motor', type: 'simple', side: 'left' } },
  { tag: 'io-terminal', name: 'Keypad', attrs: { label: 'keypad', type: 'xbus', side: 'right' } },
  { tag: 'io-terminal', name: 'Display', attrs: { label: 'display', type: 'xbus', side: 'left' } },
  { tag: 'mc-4010', name: 'MC4010' },
  { tag: 'dt-2415', name: 'DT2415' },
  { tag: 'c2s-rf901', name: 'Radio' },
  { tag: 'fm-blaster', name: 'FM Blaster' },
  { tag: 'n4pb-8000', name: 'N4PB-8000' },
  { tag: 'lx-700', name: 'LX700' },
  { tag: 'lx-910c', name: 'LX910C' },
  { tag: 'd80c010-f', name: 'D80C010-F' },
  { tag: 'kuji-ek1', name: 'KUJI-EK1' },
  { tag: 'pga-33x6', name: 'PGA33X6' },
  { tag: 'nlp-2', name: 'NLP2' },
]

/** Circuits offered as starting points, by their circuits.js key. */
const PRESETS = [
  ['an650', 'AN650 light controller'],
  ['xbus-pair', 'XBus pair'],
  ['blink', 'Blink'],
  ['button-lamp', 'Button and lamp'],
  ['dx300-stepper', 'DX300 stepper'],
]

const el = (tag, cls, text) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text !== undefined) n.textContent = text
  return n
}

/* ------------------------------------------------------------------ spec
   The simulator takes the same shape circuits.js uses, so the live board is
   translated into one every time it is run. Part order is board order, which
   is what wire endpoints index into.
   ------------------------------------------------------------------------ */
function specFromBoard(board) {
  const parts = board.parts
  return {
    parts: parts.map((p) => {
      const out = { t: p.tagName.toLowerCase(), code: p.getAttribute('code') ?? undefined }
      for (const a of ['label', 'type', 'side']) {
        if (p.hasAttribute(a)) out[a] = p.getAttribute(a)
      }
      return out
    }),
    wires: board.wires.map((w) => [
      `${parts.indexOf(w.a.part)}:${w.a.pin.dataset.pin}`,
      `${parts.indexOf(w.b.part)}:${w.b.pin.dataset.pin}`,
    ]),
  }
}

/** A terminal's label has to be unique: it is the simulator's handle on it. */
function uniqueLabel(board, base) {
  const used = new Set(board.parts.map((p) => p.getAttribute('label')).filter(Boolean))
  if (!used.has(base)) return base
  for (let n = 2; ; n += 1) if (!used.has(`${base}-${n}`)) return `${base}-${n}`
}

/* ------------------------------------------------------------------- ide */
class Ide {
  constructor(root) {
    this.root = root
    this.timer = null
    this.machine = null
    this.build()
    this.restore()
  }

  /* ----- construction ----- */
  build() {
    this.root.replaceChildren()

    this.board = document.createElement('circuit-board')
    this.board.className = 'ide-board'
    this.cell = window.innerWidth < 420 ? 26 : 34
    this.board.setAttribute('cell', String(this.cell))

    this.root.append(
      this.buildPalette(),
      this.buildStage(),
      this.buildSimBar(),
      this.buildFileBar(),
      this.buildEditor(),
    )

    this.board.addEventListener('open-editor', (e) => this.openEditor(e.detail))
    this.board.addEventListener('click', () => this.syncSelection())
    this.board.addEventListener('code-changed', () => this.save())
    this.root.dataset.ready = 'true'
  }

  buildPalette() {
    const wrap = el('div', 'ide-palette')
    wrap.setAttribute('role', 'group')
    wrap.setAttribute('aria-label', 'Add a part')
    for (const item of PALETTE) {
      const b = el('button', 'ide-chip', item.name)
      b.type = 'button'
      b.addEventListener('click', () => this.place(item))
      wrap.appendChild(b)
    }
    return wrap
  }

  buildStage() {
    const stage = el('div', 'ide-stage')
    stage.appendChild(this.board)
    return stage
  }

  buildSimBar() {
    const bar = el('div', 'ide-bar ide-bar-sim')
    this.playBtn = this.button('Run', () => this.toggle(), 'sim-play')
    this.stepBtn = this.button('Step', () => { this.pause(); this.tick() })
    this.resetBtn = this.button('Reset', () => this.reset())
    this.delBtn = this.button('Delete', () => this.deleteSelected(), 'ide-danger')
    this.delBtn.disabled = true
    bar.append(this.playBtn, this.stepBtn, this.resetBtn, this.delBtn)

    // Zoom buttons rather than a range input: a slider is the one control that
    // is genuinely worse with a thumb than with a mouse.
    const zoom = el('div', 'ide-zoom')
    zoom.append(
      this.button('−', () => this.zoom(-CELL_STEP), 'ide-icon', 'Zoom out'),
      this.button('+', () => this.zoom(CELL_STEP), 'ide-icon', 'Zoom in'),
    )
    bar.appendChild(zoom)

    this.inputBar = el('div', 'ide-inputs')
    bar.appendChild(this.inputBar)

    this.readout = el('p', 'sim-readout')
    this.readout.setAttribute('role', 'status')
    bar.appendChild(this.readout)
    return bar
  }

  buildFileBar() {
    const bar = el('div', 'ide-bar ide-bar-file')

    const label = el('label', 'ide-preset')
    label.append(el('span', null, 'Load'))
    const select = el('select', 'ide-select')
    select.appendChild(new Option('Choose a circuit…', ''))
    for (const [key, name] of PRESETS) select.appendChild(new Option(name, key))
    select.addEventListener('change', () => {
      if (select.value) this.loadPreset(select.value)
      select.value = ''
    })
    label.appendChild(select)
    bar.append(label, this.button('Clear', () => this.clear()))

    this.note = el('p', 'ide-note')
    this.note.setAttribute('role', 'status')
    bar.appendChild(this.note)
    return bar
  }

  /** Full-screen code editor, for reading a program that will not fit on a chip. */
  buildEditor() {
    const dlg = el('div', 'ide-modal')
    dlg.hidden = true
    dlg.setAttribute('role', 'dialog')
    dlg.setAttribute('aria-modal', 'true')
    dlg.setAttribute('aria-label', 'Edit program')

    const panel = el('div', 'ide-modal-panel')
    this.modalTitle = el('h2', 'ide-modal-title', 'Program')
    this.modalArea = el('textarea', 'ide-modal-area')
    this.modalArea.spellcheck = false
    this.modalArea.setAttribute('autocapitalize', 'off')
    this.modalArea.setAttribute('autocorrect', 'off')
    this.modalArea.setAttribute('aria-label', 'Program source')
    this.modalCount = el('p', 'ide-modal-count')

    const done = this.button('Done', () => this.closeEditor(), 'ide-primary')
    panel.append(this.modalTitle, this.modalArea, this.modalCount, done)
    dlg.appendChild(panel)

    this.modalArea.addEventListener('input', () => {
      if (this.editing) this.editing.setCode(this.modalArea.value)
      this.countLines()
    })
    dlg.addEventListener('click', (e) => { if (e.target === dlg) this.closeEditor() })
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dlg.hidden) this.closeEditor()
    })
    this.modal = dlg
    return dlg
  }

  button(text, onClick, extra = '', label = '') {
    const b = el('button', 'sim-btn' + (extra ? ' ' + extra : ''), text)
    b.type = 'button'
    if (label) b.setAttribute('aria-label', label)
    b.addEventListener('click', onClick)
    return b
  }

  /* ----- board edits ----- */
  place(item) {
    const attrs = item.attrs ? { ...item.attrs } : null
    if (attrs && attrs.label) attrs.label = uniqueLabel(this.board, attrs.label)
    const spot = this.freeSpot(item.tag)
    const part = this.board.addPart(item.tag, spot.x, spot.y, attrs)
    this.board.select(part)
    this.syncSelection()
    this.announce(`${item.name} added`)
    this.invalidate()
  }

  /** First column-major slot whose footprint clears the parts already down.
      Footprints are grown by a cell so parts never land flush against one
      another - touching parts put their pins' 44px hit areas on top of each
      other, and a wire drag then starts and ends on the same pin. */
  freeSpot(tag) {
    const meta = PART_META[tag] || { cols: 2, rows: 2 }
    const gap = 1
    const taken = this.board.parts.map((p) => ({
      x: Number(p.getAttribute('x')) || 0,
      y: Number(p.getAttribute('y')) || 0,
      cols: (p.meta || {}).cols || 2,
      rows: (p.meta || {}).rows || 2,
    }))
    const clash = (x, y) => taken.some((t) =>
      x < t.x + t.cols + gap && x + meta.cols + gap > t.x &&
      y < t.y + t.rows + gap && y + meta.rows + gap > t.y)
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 40; x += 1) if (!clash(x, y)) return { x, y }
    }
    return { x: 0, y: 0 }
  }

  deleteSelected() {
    const part = this.board.selected
    if (!part) return
    const name = part.getAttribute('part-name') || 'Part'
    this.board.removePart(part)
    this.syncSelection()
    this.announce(`${name} removed`)
    this.invalidate()
  }

  syncSelection() {
    const has = Boolean(this.board.selected)
    this.delBtn.disabled = !has
    this.delBtn.textContent = has
      ? `Delete ${this.board.selected.getAttribute('part-name') || 'part'}`
      : 'Delete'
  }

  zoom(by) {
    this.cell = Math.max(CELL_MIN, Math.min(CELL_MAX, this.cell + by))
    this.board.setAttribute('cell', String(this.cell))
    this.announce(`Grid ${this.cell}px`)
  }

  clear() {
    this.pause()
    this.board.clearWires()
    this.board.parts.forEach((p) => p.remove())
    this.board.select(null)
    this.syncSelection()
    this.invalidate()
    this.announce('Board cleared')
  }

  loadPreset(key) {
    const spec = CIRCUITS[key]
    if (!spec) return
    this.pause()
    this.board.load({
      parts: spec.parts.map((p) => ({
        tag: p.t, x: p.x, y: p.y, code: p.code ?? '',
        label: p.label, type: p.type, side: p.side,
      })),
      wires: spec.wires.map(([a, b]) => {
        const [ai, an] = a.split(':')
        const [bi, bn] = b.split(':')
        return { a: [Number(ai), an], b: [Number(bi), bn] }
      }),
    })
    this.board.select(null)
    this.syncSelection()
    // `load` wires up on the next frame, so the run has to wait for it too.
    requestAnimationFrame(() => requestAnimationFrame(() => this.invalidate()))
    this.announce(`Loaded ${PRESETS.find(([k]) => k === key)?.[1] || key}`)
  }

  /* ----- editor ----- */
  openEditor(part) {
    this.editing = part
    this.modalTitle.textContent = `${part.getAttribute('part-name') || 'Chip'} program`
    this.modalArea.value = part.code
    this.modal.hidden = false
    this.countLines()
    this.modalArea.focus()
  }

  closeEditor() {
    if (this.modal.hidden) return
    this.modal.hidden = true
    if (this.editing) {
      this.editing.setCode(this.modalArea.value)
      this.invalidate()
    }
    this.editing = null
    // Don't strand keyboard focus on a panel that is no longer there.
    this.board.focus({ preventScroll: true })
  }

  countLines() {
    const max = this.editing?.meta.lines || 0
    const used = this.modalArea.value.split('\n').length
    this.modalCount.textContent = `${used} of ${max} lines`
    this.modalCount.classList.toggle('over', used > max)
  }

  /* ----- running ----- */
  invalidate() {
    this.pause()
    this.machine = null
    this.buildInputs()
    this.sync()
    this.save()
  }

  /* What the simulator cares about. Wiring is done by dragging on the board,
     which reports nothing back here, so rather than trying to catch every edit
     the machine is rebuilt whenever this string changes. Position is not in it:
     moving a part rearranges the picture, not the circuit. */
  signature() {
    const parts = this.board.parts
    return parts
      .map((p) => [p.tagName, p.getAttribute('label') || '', p.getAttribute('code') || ''].join('~'))
      .join('|') + '#' + this.board.wires
        .map((w) => `${parts.indexOf(w.a.part)}:${w.a.pin.dataset.pin}-${parts.indexOf(w.b.part)}:${w.b.pin.dataset.pin}`)
        .join(',')
  }

  ensureMachine() {
    const sig = this.signature()
    if (this.machine && sig === this.sig) return this.machine
    this.sig = sig
    try {
      this.machine = new Machine(specFromBoard(this.board))
      this.problem = null
    } catch (err) {
      this.machine = null
      this.problem = err.message
    }
    return this.machine
  }

  buildInputs() {
    this.inputBar.replaceChildren()
    for (const part of this.board.parts) {
      if (part.tagName.toLowerCase() !== 'io-terminal') continue
      if (part.getAttribute('side') === 'left') continue
      const label = part.getAttribute('label')
      const b = this.button(label, () => {
        const m = this.ensureMachine()
        if (!m) return
        const on = m.terminal(label).value >= 50
        m.setInput(label, on ? 0 : 100)
        b.setAttribute('aria-pressed', on ? 'false' : 'true')
        this.sync()
      }, 'sim-input')
      b.setAttribute('aria-pressed', 'false')
      this.inputBar.appendChild(b)
    }
  }

  toggle() { if (this.timer) this.pause(); else this.play() }

  play() {
    if (this.timer) return
    if (!this.ensureMachine()) { this.sync(); return }
    this.playBtn.textContent = 'Pause'
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  pause() {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
    this.playBtn.textContent = 'Run'
  }

  reset() {
    this.pause()
    this.machine = null
    this.board.parts.forEach((p) => p.resetRegisters?.())
    this.buildInputs()
    this.sync()
  }

  tick() {
    const m = this.ensureMachine()
    if (!m) { this.pause(); this.sync(); return }
    const ok = m.advance()
    this.sync()
    if (!ok) this.pause()
  }

  sync() {
    const m = this.machine
    if (!m) {
      this.readout.textContent = this.problem
        ? `Cannot run: ${this.problem}`
        : this.board.parts.length
          ? 'Ready. Press Run.'
          : 'Empty board. Add a part from the palette.'
      this.root.dataset.simState = this.problem ? 'error' : 'ok'
      return
    }

    const parts = this.board.parts
    for (const snap of m.snapshot()) {
      const part = parts[snap.id]
      if (!part) continue
      if (part.setRegister) {
        part.setRegister('acc', snap.acc)
        if (snap.dat !== null) part.setRegister('dat', snap.dat)
        part.setRegister('state', snap.state.toUpperCase())
        part.setRegister('power', snap.power)
        part.setAttribute('exec', String(snap.pc))
      }
      if (part.setLevel) part.setLevel(m.output(snap.label))
    }

    const power = m.snapshot().reduce((n, s) => n + (s.power || 0), 0)
    let status = `t=${m.time}   power ${power}`
    if (m.error) status = m.error
    else if (m.deadlock) status = 'Deadlock: ' + m.deadlock.join('; ')
    else if (m.stalled && m.stalled.length) status = 'Waiting: ' + m.stalled.join('; ')
    this.readout.textContent = status
    this.root.dataset.simState = m.error ? 'error' : m.deadlock ? 'deadlock' : 'ok'
  }

  announce(text) {
    this.note.textContent = text
    clearTimeout(this._noteT)
    this._noteT = setTimeout(() => { this.note.textContent = '' }, 2600)
  }

  /* ----- persistence ----- */
  /** Debounced: `code-changed` fires on every keystroke. */
  save() {
    clearTimeout(this._saveT)
    this._saveT = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(this.board.toJSON()))
      } catch { /* private mode, a full quota - the board still works */ }
    }, 250)
  }

  restore() {
    let saved = null
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null') } catch { saved = null }
    if (saved && Array.isArray(saved.parts) && saved.parts.length) {
      this.board.load(saved)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        this.buildInputs()
        this.sync()
      }))
      this.announce('Restored your last board')
      return
    }
    this.loadPreset('an650')
  }
}

/** Upgrade every `.ide` placeholder on the page. */
function upgradeIde() {
  for (const root of document.querySelectorAll('.ide:not([data-ready])')) {
    root.ide = new Ide(root)
  }
}

export { Ide, upgradeIde, specFromBoard }
