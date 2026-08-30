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
  })
  return true
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
