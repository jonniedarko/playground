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

function upgradeAll() {
  for (const el of document.querySelectorAll('.chip-figure[data-part]:not([data-upgraded])')) {
    upgrade(el)
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', upgradeAll, { once: true })
} else {
  upgradeAll()
}

export { upgrade, upgradeAll }
