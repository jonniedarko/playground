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
import { verify as runVerify } from './verify.js'
import SPECS from './specs.js'
import { encodeBoard, decodeBoard, SHARE_BUDGET } from './share.js'

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

/** Puzzles reachable via `?puzzle=<key>` on the workbench link (see
    loadPuzzle() below and the puzzle pages in content/shenzhen-io/puzzles/).
    A key here must have both a spec (specs.js, to grade an attempt) and a
    circuit (circuits.js, to reveal) - loadPuzzle() checks both before
    trusting the query string. The display name matches each puzzle page's
    own `title` front matter. packet-reverser is not in PRESETS above (it is
    not offered as a dropdown starting point - a puzzle should start empty,
    not with the answer already loaded) but Reveal still reaches it, since
    reveal() calls loadPreset() directly rather than going through the
    dropdown's own list. */
const PUZZLES = {
  an650: 'AN650 light controller',
  'dx300-stepper': 'DX300 stepper',
  'packet-reverser': 'Packet reverser',
}

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

/* -------------------------------------------------------------- step back
   R15.3: stepping back is rebuild-and-replay, per R12-R15-PLAN.md - never a
   snapshot. Machine is deterministic given its spec (which carries the
   seed - see sim.js's Machine constructor) and its input timeline, so this
   is the only state kept: every setInput a person makes, tagged with the
   time unit it happened in. To reach t-1, build a fresh Machine from the
   same spec and replay t-1 units, applying whichever inputs were logged for
   each unit before that unit's advance() - the same "applied before
   advance" rule verify.js's own spec.inputs follows (see its module doc).

   Pure - no DOM - so it is exercised directly under node
   (test/ide-stepback.test.mjs); the Ide class below wires it to the sim bar
   and to the one place a person's input reaches the live machine
   (buildInputs' toggle handler). */

/** Null when there is no earlier unit to step back to - t=0 stays t=0. */
function stepBackTarget(time) {
  return time > 0 ? time - 1 : null
}

/** Apply every timeline entry recorded for `machine.time` that `cursor`
    hasn't reached yet, in the order they were recorded, and return the
    cursor advanced past them. Entries for a later time are left for a later
    call - the timeline only ever acts on "now". Called both by the live
    input handler's bookkeeping (where it is always a no-op, since that
    handler applies its own entry immediately and moves the cursor past it
    itself) and by tick() after a rewind, to catch a rebuilt machine up to
    the point replay stopped short of. */
function applyDueInputs(machine, log, cursor) {
  let i = cursor
  while (i < log.length && log[i].time === machine.time) {
    machine.setInput(log[i].label, log[i].value)
    i += 1
  }
  return i
}

/** Build a fresh Machine from `spec` and replay it up to (not including)
    `target` time units, applying `log`'s recorded inputs as it goes -
    exactly the rule applyDueInputs() states, run once per unit crossed.
    Returns the rebuilt machine and how far into the log replaying it
    reached: the cursor a live input or a later tick() resumes from. No
    part of the machine being stepped back from is read or copied - this
    takes only the spec (parts, wires, seed) and the timeline. */
function rebuildAndReplay(spec, log, target) {
  const machine = new Machine(spec)
  let cursor = 0
  for (let t = 0; t < target; t += 1) {
    cursor = applyDueInputs(machine, log, cursor)
    machine.advance()
  }
  return { machine, cursor }
}

/* ------------------------------------------------------------ breakpoints
   Pure helper functions to check if a breakpoint condition is met.
   Exported for testing; the Ide class calls them from tick() after each
   advance to decide whether to pause. */

/** Check if a line breakpoint should pause the simulation.
    Fires when a chip's PC reaches the target line (moving into it, not
    merely staying on it). Takes snapshots before and after the time unit
    to detect the transition. */
function shouldPauseLineBreakpoint(chipId, line, beforeSnapshot, afterSnapshot) {
  if (!beforeSnapshot || !afterSnapshot) return false
  const before = beforeSnapshot.find(s => s.id === chipId)
  const after = afterSnapshot.find(s => s.id === chipId)
  if (!after || after.pc === undefined) return false
  // Pause if we just moved into this line
  const wasNotThere = !before || before.pc === undefined || before.pc !== line
  return after.pc === line && wasNotThere
}

/** Check if a signal breakpoint should pause the simulation.
    Fires when a named output signal's value changes. The caller is
    responsible for tracking before/after values. */
function shouldPauseSignalBreakpoint(beforeValue, afterValue) {
  return beforeValue !== afterValue
}

/* ----------------------------------------------------------------- verify
   Index into a time-indexed array, holding the last entry past its end -
   the same rule verify.js applies to spec.inputs. Duplicated here rather
   than imported: verify.js's `at()` is a private module helper, and this
   file must not reach past verify()'s own return value for the pass/fail
   call - see recordVerifyTrace below for why the same rule is still needed
   here, for the scope trace alone.
   ------------------------------------------------------------------------ */
function heldValue(arr, t) {
  return arr[t < arr.length ? t : arr.length - 1]
}

/** The line placed in the existing sim-readout on Verify. See verify.js's
    module doc for the return shape. `lines` is presented as "instructions":
    verify() counts only executable lines - blanks, comments and labels do
    not count - which is not the game's own line score, so it is labelled
    for what it actually is. */
function formatVerify(result) {
  const meta = `power ${result.power}   instructions ${result.lines}   units ${result.units}`
  if (result.ok) return `Verify: PASS   ${meta}`
  const d = result.divergence
  // error/deadlock/halted divergences carry no expected value - see verify.js.
  const detail = d.expected === null
    ? `${d.signal}: ${d.actual}`
    : `${d.signal} expected ${d.expected} got ${d.actual}`
  return `Verify: FAIL at t=${d.time} - ${detail}   ${meta}`
}

/* ------------------------------------------------------------------- ide */
class Ide {
  constructor(root) {
    this.root = root
    this.timer = null
    this.machine = null
    // Which PRESETS key is on the board, if any - set by loadPreset, cleared
    // by clear(). Most boards carry no spec at all: the two other presets
    // (xbus-pair, blink, button-lamp) have none, and a board restored from a
    // previous session (restore(), below) never sets this at all.
    this.presetKey = null
    // Set once, by loadPuzzle(), when this page load opened via ?puzzle=.
    // Unlike presetKey it is never cleared afterwards - it names which
    // puzzle Reveal answers for the rest of this page's life, independent of
    // whatever the board is later cleared to or loaded with.
    this.puzzleKey = null
    // The note text announce() falls back to once its own transient message
    // times out - see announce() below. Blank outside puzzle mode.
    this.puzzleNote = ''
    // R15.3's entire memory: every setInput a person made, tagged with the
    // time unit it happened in - see the module doc above rebuildAndReplay().
    // logCursor is how many of these are already reflected in this.machine's
    // current state; recordInput() keeps it caught up as inputs happen live,
    // stepBack() resets it to wherever a rebuild's replay stopped short of.
    // Cleared wherever the machine starts over from t=0 - reset(),
    // invalidate(), loadPuzzle() - since a stale entry would name a time
    // unit, or a terminal, that no longer means what it did.
    this.inputLog = []
    this.logCursor = 0
    // R15.2: breakpoints array. Each entry is { type: 'line', chipId, line }
    // or { type: 'signal', label }. Checked in tick() to pause when conditions
    // are met. Cleared when the machine is rebuilt (reset, invalidate, etc).
    this.breakpoints = []
    // Track previous signal values to detect changes for signal breakpoints.
    this.prevSignalValues = new Map()
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
    this.stepBackBtn = this.button('Step back', () => this.stepBack())
    this.breakBtn = this.button('Break: off', () => this.cycleSignalBreak())
    this.resetBtn = this.button('Reset', () => this.reset())
    this.verifyBtn = this.button('Verify', () => this.verify())
    this.delBtn = this.button('Delete', () => this.deleteSelected(), 'ide-danger')
    this.delBtn.disabled = true
    bar.append(this.playBtn, this.stepBtn, this.stepBackBtn, this.breakBtn, this.resetBtn, this.verifyBtn, this.delBtn)

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

    // Verify's diagnostic trace. Hidden until Verify actually has a spec to
    // run - most boards never show this at all. `.sim-scope` is the class
    // the runnable-figure scope trace already uses (embed.js); reused here
    // rather than given a rule of its own. `.sim-scope-wrap` exists only to
    // give the mark below something to position against - see style.css.
    this.scopeWrap = el('div', 'sim-scope-wrap')
    this.scopeWrap.hidden = true
    this.scope = document.createElement('scope-trace')
    this.scope.className = 'sim-scope'
    this.scopeMark = el('div', 'sim-scope-mark')
    this.scopeMark.hidden = true
    this.scopeMark.setAttribute('aria-hidden', 'true')
    this.scopeWrap.append(this.scope, this.scopeMark)
    bar.appendChild(this.scopeWrap)
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

    // Share: encodes the live board into a URL (share.js) and writes it
    // into the note below - see share() for the budget message and the
    // over-budget path. A real button in the bar that already exists, not a
    // new one - see the R14.1 constraint in R12-R15-PLAN.md.
    bar.appendChild(this.button('Share', () => this.share()))

    // Reveal: hidden until a puzzle is actually open (loadPuzzle sets
    // puzzleKey and un-hides it) - most visits never see this button. A real
    // button, not a hover affordance, and never disabled - .hidden uses the
    // DOM property (see syncSelection's aria-pressed pattern elsewhere in
    // this file), and no class below gives .ide-reveal a `display` of its
    // own, so the plain [hidden] UA rule applies untouched - the opposite
    // situation from .ide-modal, which needs an explicit override because it
    // sets display:flex itself (see style.css).
    this.revealBtn = this.button('Reveal', () => this.reveal(), 'ide-reveal')
    this.revealBtn.hidden = true
    bar.appendChild(this.revealBtn)

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

    const breakHere = this.button('Break here', () => this.toggleLineBreak())
    const done = this.button('Done', () => this.closeEditor(), 'ide-primary')
    panel.append(this.modalTitle, this.modalArea, this.modalCount, breakHere, done)
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
    this.presetKey = null
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
    this.presetKey = key
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
    // PRESETS names circuits the dropdown itself offers; PUZZLES covers the
    // rest (packet-reverser, reached only through reveal() below).
    this.announce(`Loaded ${PRESETS.find(([k]) => k === key)?.[1] || PUZZLES[key] || key}`)
  }

  /** Entered via `?puzzle=<key>` on the workbench link (a puzzle page's own
      "Build it in the workbench" link, see content/shenzhen-io/puzzles/) -
      an EMPTY board bound to that puzzle's spec, so the point is to attempt
      it and Verify grades the attempt, not the answer.

      Deliberately does not call invalidate() or save(): opening a puzzle
      must not touch whatever board was autosaved from an earlier session.
      This mirrors invalidate() (pause, drop the stale machine, rebuild the
      input bar, clear any stale Verify trace, sync the readout) but leaves
      the save() call out - the previous save stays exactly as it was until
      an actual edit happens here, at which point place()/deleteSelected()
      etc. save over it exactly as they already do for every other board
      edit. That first edit is disclosed in the note (see the persistent
      message below), not hidden. */
  loadPuzzle(key) {
    this.puzzleKey = key
    this.presetKey = key
    this.pause()
    this.board.clearWires()
    this.board.parts.forEach((p) => p.remove())
    this.board.select(null)
    this.syncSelection()
    this.machine = null
    // Same reasoning as invalidate() - an empty board has no timeline either.
    this.inputLog = []
    this.logCursor = 0
    this.buildInputs()
    this.hideVerify()
    this.sync()
    this.puzzleNote = `Puzzle: ${PUZZLES[key]}. Empty board - your last saved ` +
      'board is untouched until you edit this one.'
    this.note.textContent = this.puzzleNote
    this.revealBtn.hidden = false
    this.revealBtn.setAttribute('aria-label', `Reveal ${PUZZLES[key]}'s reference solution`)
  }

  /** The reveal affordance: replaces the board with the puzzle's reference
      solution from circuits.js. This IS loadPreset() - reveal is exactly
      "load this circuit", the same operation the Load dropdown performs for
      its own list, just reached by a different control and not limited to
      what PRESETS offers as a dropdown starting point (packet-reverser has
      no dropdown entry - see the PUZZLES comment above - but Reveal still
      reaches it, because this calls loadPreset() directly). */
  reveal() {
    if (!this.puzzleKey) return
    const key = this.puzzleKey
    this.puzzleNote = `Revealed: ${PUZZLES[key]}'s reference solution.`
    this.loadPreset(key)
  }

  /* ----- editor ----- */
  /* ----- setting a breakpoint -------------------------------------------
     The checks below were reachable only from code until now: nothing in
     the workbench ever put an entry in this.breakpoints, so a debugger
     nobody can arm is not a debugger. These are the two ways in, both
     inside bars that already exist.
     --------------------------------------------------------------------- */

  /** Output terminals, which are the signals worth breaking on. */
  breakableSignals() {
    return [...this.board.querySelectorAll('io-terminal')]
      .filter((t) => t.getAttribute('side') === 'left')
      .map((t) => t.getAttribute('label'))
      .filter(Boolean)
  }

  /** Cycle the signal breakpoint: off, then each output terminal, then off
      again. A cycling button rather than a picker because the sim bar has
      room for one control, not for a list. */
  cycleSignalBreak() {
    const signals = this.breakableSignals()
    const current = this.breakpoints.find((b) => b.type === 'signal')
    this.breakpoints = this.breakpoints.filter((b) => b.type !== 'signal')
    if (signals.length) {
      const next = current ? signals.indexOf(current.label) + 1 : 0
      if (next < signals.length) this.breakpoints.push({ type: 'signal', label: signals[next] })
    }
    this.syncBreakButton()
    this.announce(this.breakBtn.textContent)
  }

  syncBreakButton() {
    const on = this.breakpoints.find((b) => b.type === 'signal')
    this.breakBtn.textContent = on ? `Break: ${on.label}` : 'Break: off'
  }

  /** Toggle a line breakpoint on the line the caret is in, for the chip the
      editor is open on. The caret is how a person says "this line" in a
      textarea; there is no gutter to tap. Program index and source line are
      the same thing - a comment or a blank still parses to an entry - so the
      caret's line number is the pc to break on. */
  toggleLineBreak() {
    if (!this.editing) return
    const chipId = [...this.board.children].indexOf(this.editing)
    const line = this.modalArea.value.slice(0, this.modalArea.selectionStart).split('\n').length - 1
    const at = this.breakpoints.findIndex(
      (b) => b.type === 'line' && b.chipId === chipId && b.line === line)
    if (at > -1) {
      this.breakpoints.splice(at, 1)
      this.announce(`Breakpoint cleared on line ${line + 1}`)
    } else {
      this.breakpoints.push({ type: 'line', chipId, line })
      this.announce(`Break on line ${line + 1}`)
    }
  }

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
    // A structural edit makes the recorded timeline meaningless too - it may
    // name a terminal that no longer exists, or a time unit in a run this
    // now-different circuit never had.
    this.inputLog = []
    this.logCursor = 0
    // R15.2: clear breakpoints on structural change (they may refer to
    // deleted parts or terminals)
    this.breakpoints = []
    if (this.breakBtn) this.syncBreakButton()
    this.prevSignalValues.clear()
    this.buildInputs()
    // A structural edit makes any earlier Verify diagnostic stale - the
    // scope trace and mark were drawn from the circuit as it stood before
    // this change, not as it stands now.
    this.hideVerify()
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
    // label -> button, so syncInputButtons() (below) can refresh the toggle
    // display after stepBack() rebuilds behind whatever it last showed.
    this.inputButtons = new Map()
    for (const part of this.board.parts) {
      if (part.tagName.toLowerCase() !== 'io-terminal') continue
      if (part.getAttribute('side') === 'left') continue
      const label = part.getAttribute('label')
      const b = this.button(label, () => {
        const m = this.ensureMachine()
        if (!m) return
        const on = m.terminal(label).value >= 50
        this.recordInput(label, on ? 0 : 100)
        b.setAttribute('aria-pressed', on ? 'false' : 'true')
        this.sync()
      }, 'sim-input')
      b.setAttribute('aria-pressed', 'false')
      this.inputBar.appendChild(b)
      this.inputButtons.set(label, b)
    }
  }

  /** The one place a person's input reaches the live machine: apply it and
      log it in the same breath, so this.inputLog stays exactly the record
      stepBack() needs. A press that lands after a rewind - logCursor behind
      inputLog's own length - abandons whatever was recorded past this
      point first: the timeline forks here, the same as an edit after undo
      in any other tool. See the rebuildAndReplay() module doc above. */
  recordInput(label, value) {
    const m = this.machine
    if (!m) return
    if (this.logCursor < this.inputLog.length) this.inputLog.length = this.logCursor
    this.inputLog.push({ time: m.time, label, value })
    this.logCursor = this.inputLog.length
    m.setInput(label, value)
  }

  /** Refresh every input toggle's lit/unlit state from the machine.
      buildInputs() only ever sets one to 'false' at creation - true the
      rest of the time, since normally nothing but that very button's own
      click ever changes the terminal it reads. stepBack() breaks that: it
      can leave a terminal driving high while its button still shows
      unpressed, so sync() (below) calls this every time it runs. */
  syncInputButtons() {
    const m = this.machine
    if (!m || !this.inputButtons) return
    for (const [label, b] of this.inputButtons) {
      const part = m.terminal(label)
      if (part) b.setAttribute('aria-pressed', part.value >= 50 ? 'true' : 'false')
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
    // Back to t=0: the timeline so far belongs to a run that no longer
    // exists.
    this.inputLog = []
    this.logCursor = 0
    // R15.2: clear breakpoints on reset (state has changed)
    this.breakpoints = []
    if (this.breakBtn) this.syncBreakButton()
    this.prevSignalValues.clear()
    this.board.parts.forEach((p) => p.resetRegisters?.())
    this.buildInputs()
    this.sync()
  }

  tick() {
    const m = this.ensureMachine()
    if (!m) { this.pause(); this.sync(); return }
    // A no-op unless this machine was just rebuilt behind the timeline by
    // stepBack() - the live path keeps logCursor caught up itself, in
    // recordInput() above.
    this.logCursor = applyDueInputs(m, this.inputLog, this.logCursor)

    // R15.2: Collect state before advance for breakpoint checking
    const beforeSnapshot = m.snapshot()
    const beforeSignalValues = new Map()
    for (const bp of this.breakpoints) {
      if (bp.type === 'signal') {
        try {
          beforeSignalValues.set(bp.label, m.output(bp.label))
        } catch {
          // Signal doesn't exist - skip it
        }
      }
    }

    const ok = m.advance()
    this.sync()

    // R15.2: Check breakpoints after advance
    if (ok && this.breakpoints.length > 0) {
      const afterSnapshot = m.snapshot()
      for (const bp of this.breakpoints) {
        if (bp.type === 'line') {
          if (shouldPauseLineBreakpoint(bp.chipId, bp.line, beforeSnapshot, afterSnapshot)) {
            this.pause()
            return
          }
        } else if (bp.type === 'signal') {
          const before = beforeSignalValues.get(bp.label)
          let after
          try {
            after = m.output(bp.label)
          } catch {
            continue
          }
          if (shouldPauseSignalBreakpoint(before, after)) {
            this.pause()
            return
          }
        }
      }
    }

    if (!ok) this.pause()
  }

  /** R15.3: rebuild from the current machine's own spec (same parts, wires,
      program text and seed - see the Machine constructor in sim.js) and
      replay it to one unit short of where it stands now. See
      rebuildAndReplay()'s module doc above for why this reproduces state
      exactly rather than approximately, and does so by construction, not by
      keeping anything from the machine being stepped back from. A no-op at
      t=0 - stepBackTarget() says so - since there is no earlier unit. */
  stepBack() {
    this.pause()
    const m = this.machine
    const target = m ? stepBackTarget(m.time) : null
    if (target === null) { this.sync(); return }
    const { machine, cursor } = rebuildAndReplay(m.spec, this.inputLog, target)
    this.machine = machine
    this.logCursor = cursor
    this.sync()
  }

  sync() {
    const m = this.machine
    this.stepBackBtn.disabled = !m || stepBackTarget(m.time) === null
    if (!m) {
      this.readout.textContent = this.problem
        ? `Cannot run: ${this.problem}`
        : this.board.parts.length
          ? 'Ready. Press Run.'
          : 'Empty board. Add a part from the palette.'
      this.root.dataset.simState = this.problem ? 'error' : 'ok'
      return
    }
    // stepBack() can change a terminal's value without going through the
    // one button that normally keeps its own display in step - see
    // syncInputButtons()'s doc above.
    this.syncInputButtons()

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
    // Deadlock and stalled differ in severity, not in what the reader needs:
    // both mean chips are stuck, and both want to know on which pin and
    // against what. A deadlock is the case the explainer exists for, so it
    // would be odd for it to be the one line that still says only "blocked
    // on mov x0 acc".
    const why = () => m.explainBlocked().map((e) => e.message).join(' ')
    if (m.error) status = m.error
    else if (m.deadlock) status = 'Deadlock: ' + why()
    else if (m.stalled && m.stalled.length) status = 'Waiting: ' + why()
    const chips = this.chipPowerReadout(m)
    if (chips) status += '   ' + chips
    const held = this.deviceReadout(m)
    if (held) status += '   ' + held
    this.readout.textContent = status
    this.root.dataset.simState = m.error ? 'error' : m.deadlock ? 'deadlock' : 'ok'
  }

  /** What LX700 and FM Blaster are currently holding, appended to the same
      status line as everything else - not a new panel, just more of the
      text that line already carries. Numbered when there is more than one
      of a kind, since neither part carries a label of its own. */
  deviceReadout(m) {
    const lx = m.parts.filter((p) => p.tag === 'lx-700')
    const fm = m.parts.filter((p) => p.tag === 'fm-blaster')
    const bits = []
    lx.forEach((part, i) => {
      const tag = lx.length > 1 ? `LX700 ${i + 1}` : 'LX700'
      bits.push(`${tag} ${part.display === null || part.display === undefined ? 'blank' : part.display}`)
    })
    fm.forEach((part, i) => {
      const tag = fm.length > 1 ? `FM Blaster ${i + 1}` : 'FM Blaster'
      const note = part.note === null || part.note === undefined ? 'none' : part.note
      const instrument = part.instrument === null || part.instrument === undefined ? 'none' : part.instrument
      bits.push(`${tag} note ${note} instrument ${instrument}`)
    })
    return bits.join('   ')
  }

  /** Per-chip power, appended to the same status line as the total, so a
      board where one chip is burning everything says so. Named the way the
      rest of the UI names a part - its display name, not its tag - and
      numbered only when two chips would otherwise read identically. The `#`
      is there because "MC4000 2 41" is three bare numbers in a row. */
  chipPowerReadout(m) {
    const chips = m.parts.filter((p) => p.chip)
    if (!chips.length) return ''

    const sameName = (part) => chips.filter((p) => p.tag === part.tag)
    return chips.map((part) => {
      const kin = sameName(part)
      // part.label is NOT a user label - it defaults to the part's own name,
      // so it is always set and would swallow the numbering below. The spec's
      // label is the one a person actually chose.
      const name = part.spec.label
        || (kin.length > 1 ? `${part.meta.name} #${kin.indexOf(part) + 1}` : part.meta.name)
      return `${name} ${part.chip.power}`
    }).join('   ')
  }

  /* ----- share -----
     R14.1: encodes the live board into a URL anyone can open back into this
     same workbench. share.js speaks board.toJSON()'s own shape (see its
     module doc), so there is nothing to convert here beyond building the
     link and writing it somewhere a person can read or copy it from -
     `this.note` already exists for status text (buildFileBar above), so the
     result lands there rather than opening any new panel.

     SHARE_BUDGET (share.js) is the line this refuses to cross: past it, the
     encoded string might not survive being pasted into whatever the link
     travels through - a chat client, a URL shortener, the address bar
     itself - so this hands back nothing rather than a link something
     downstream could silently truncate. The board is already saved to this
     device on every edit (save(), below) - that save is what the
     over-budget message points back to; there is no separate "local save"
     control to offer here (that is Task 14.2, named saves, not this task).
     ------------------------------------------------------------------- */
  share() {
    clearTimeout(this._noteT)
    let encoded
    try {
      encoded = encodeBoard(this.board.toJSON())
    } catch (err) {
      this.note.textContent = `Cannot share: ${err.message}`
      return
    }
    if (encoded.length > SHARE_BUDGET) {
      this.note.textContent =
        `Too big to share as a link (${encoded.length} of ${SHARE_BUDGET} characters). ` +
        'This board is already saved on this device - come back to it here instead.'
      return
    }
    const url = `${location.origin}${location.pathname}?board=${encoded}`
    this.note.textContent = `Share link (${encoded.length} of ${SHARE_BUDGET} chars, copied): ${url}`
    // Best-effort: not every context grants clipboard access (an iframe, a
    // denied permission, an insecure origin), and the link is readable in
    // the note either way - the text above says "copied" for the common
    // case but the link itself is what actually matters if that fails.
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).catch(() => {})
  }

  /** Loads a board carried on `?board=<share.js encoding>` - the other end
      of share() above. Called from restore() before anything falls back to
      localStorage, the same priority ?puzzle= already gets and for the same
      reason: an explicit link in the address bar says more than whatever
      was last autosaved. Structured like loadPreset() (pause, load, drop
      selection, let load()'s next-frame wiring finish, then invalidate()) -
      opening a share link is exactly "load this circuit", the same
      operation, just sourced from a URL instead of circuits.js. Unlike
      loadPuzzle(), this DOES overwrite the autosave slot (via invalidate()'s
      own save() call) - the same as Load and Reveal already do, and
      deliberate: a share link is something a person opened on purpose. */
  loadShared(encoded) {
    let data
    try {
      data = decodeBoard(encoded)
    } catch (err) {
      this.announce(`Could not open that share link: ${err.message}`)
      return false
    }
    this.presetKey = null
    this.pause()
    this.board.load(data)
    this.board.select(null)
    this.syncSelection()
    requestAnimationFrame(() => requestAnimationFrame(() => this.invalidate()))
    this.announce('Loaded board from share link')
    return true
  }

  /* ----- verify -----
     Checks the current board against the spec for whichever preset was last
     loaded - see the Files table in R12-R15-PLAN.md: SPECS lives in
     specs.js, verify() in verify.js, neither of which this task may touch.
     This is glue: build a Machine from the live board and hand it to
     verify() exactly as verify.test.mjs does. */
  verify() {
    this.pause()
    const spec = this.presetKey && SPECS[this.presetKey]
    if (!spec) {
      this.hideVerify()
      this.readout.textContent = 'Verify: no spec for the loaded circuit.'
      this.root.dataset.simState = 'ok'
      return
    }
    let result
    try {
      // runVerify is inside the same try as Machine's own construction, not
      // just alongside it: a puzzle's empty (or still-partial) board has no
      // `switch`/`input`/... terminal yet, and Machine.setInput throws on a
      // missing one (sim.js) the moment verify.js applies that unit's
      // inputs - reachable the instant a puzzle page's board opens and
      // Verify gets pressed before anything is built. Same diagnostic
      // message either way; the visitor sees "cannot run", not a crash.
      const machine = new Machine(specFromBoard(this.board))
      result = runVerify(machine, spec)
    } catch (err) {
      this.hideVerify()
      this.readout.textContent = `Verify: cannot run - ${err.message}`
      this.root.dataset.simState = 'error'
      return
    }
    this.readout.textContent = formatVerify(result)
    this.root.dataset.simState = result.ok ? 'ok' : 'error'
    this.recordVerifyTrace(spec, result)
  }

  /** Feeds the scope trace a per-unit series to draw. verify() above returns
      only the first divergence, not a timeline - by design, see verify.js's
      module doc - so this replays the same board on a second, fresh Machine
      purely for the picture. Deterministic given the same spec and the
      default seed (sim.js), so it reproduces exactly what runVerify() just
      drove through; heldValue() applies spec.inputs on the same timeline
      verify() used, for the same reason.

      This always stops at the failing unit, not spec.length - which is what
      lets setVerifyMark below place the mark with a plain fraction: the
      failing sample is always the LAST column the trace has drawn. */
  recordVerifyTrace(spec, result) {
    this.scope.clear()
    const expectLabels = Object.keys(spec.expect || {})
    if (!expectLabels.length) { this.hideVerify(); return }
    let machine
    try {
      machine = new Machine(specFromBoard(this.board))
    } catch {
      this.hideVerify()
      return
    }
    const inputs = spec.inputs || {}
    const inputLabels = Object.keys(inputs)
    const stopAt = result.divergence ? result.divergence.time : spec.length - 1
    for (let t = 0; t <= stopAt; t += 1) {
      for (const label of inputLabels) machine.setInput(label, heldValue(inputs[label], t))
      machine.advance()
      const sample = {}
      for (const signal of expectLabels) sample[signal] = machine.output(signal)
      this.scope.record(sample)
    }
    this.scopeWrap.hidden = false
    const cap = customElements.get('scope-trace')?.SAMPLES || 24
    this.setVerifyMark(result.divergence ? Math.min(stopAt + 1, cap) : null)
  }

  /** Marks the failing column on the scope trace as a plain overlay block,
      positioned by a left/width percentage rather than any pixel math or a
      reach into scope-trace's shadow DOM (components.js is not this task's
      file to edit). `shownFromStart` is the count of samples the trace is
      currently holding (1-based) at the moment the run stopped - always the
      LAST column drawn, per recordVerifyTrace above, so column index
      shownFromStart - 1 out of `cap` total columns is exact. */
  setVerifyMark(shownFromStart) {
    if (!shownFromStart) { this.scopeMark.hidden = true; return }
    const cap = customElements.get('scope-trace')?.SAMPLES || 24
    const col = shownFromStart - 1
    this.scopeMark.style.left = `${(col / cap) * 100}%`
    this.scopeMark.style.width = `${(1 / cap) * 100}%`
    this.scopeMark.hidden = false
  }

  /** Clears a stale Verify diagnostic - called whenever the board's
      structure changes or is wiped, so a scope trace and mark from before
      the edit never linger over a now-different circuit. */
  hideVerify() {
    this.scopeWrap.hidden = true
    this.scopeMark.hidden = true
    this.scope.clear()
  }

  announce(text) {
    this.note.textContent = text
    clearTimeout(this._noteT)
    // Reverts to the persistent puzzle-mode message, not blank, once one is
    // set (loadPuzzle/reveal) - a transient "Part added" must not wipe out
    // the standing "your saved board is untouched" disclosure.
    this._noteT = setTimeout(() => { this.note.textContent = this.puzzleNote || '' }, 2600)
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
    // A puzzle page's workbench link carries ?puzzle=<key> (the obvious
    // mechanism for a plain page-to-page link, no state to thread through
    // otherwise). Checked, and acted on, before localStorage is ever read -
    // see loadPuzzle()'s own doc comment for why: the saved board must stay
    // exactly as it was until an actual edit happens.
    const params = new URLSearchParams(window.location.search)
    const puzzle = params.get('puzzle')
    if (puzzle && SPECS[puzzle] && CIRCUITS[puzzle]) {
      this.loadPuzzle(puzzle)
      return
    }
    // A share.js link (see share()/loadShared() above). Same up-front
    // priority as ?puzzle= and for the same reason - an explicit link beats
    // whatever localStorage happens to hold. A bad or corrupted link falls
    // through to the normal restore path below rather than leaving the page
    // stuck - loadShared() has already announced why.
    const shared = params.get('board')
    if (shared && this.loadShared(shared)) return
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

export { Ide, upgradeIde, specFromBoard, stepBackTarget, applyDueInputs, rebuildAndReplay, shouldPauseLineBreakpoint, shouldPauseSignalBreakpoint }
