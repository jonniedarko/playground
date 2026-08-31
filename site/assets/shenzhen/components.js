/* =========================================================================
   Shenzhen-style circuit components — vanilla custom elements
   ES module. Importing it defines the elements and injects the board CSS.
   -------------------------------------------------------------------------
   Elements
     <circuit-board cell="40">      board surface, grid snapping, wiring
     <mc-4000 x y>                  9-line MCU,  acc / state / power
     <mc-4000x x y>                 9-line MCU,  XBus only
     <mc-6000 x y>                  14-line MCU, acc / dat / state / power
     <dx-300  x y>                  digital I/O expander

   Pin types
     xbus    amber dot   packets -999..999
     simple  plain tab   levels 0..100
   Only like connects to like. Enforced in CircuitBoard.tryConnect().

   Extras
     part.setCode(text)             clamped to the part's line limit
     part.exec = n                  highlight executing line (0-based, -1 off)
     part.setAttribute('thumb','')  palette mode: placeholder code, inert
   ========================================================================= */

import { PART_META } from './parts.js'

/* Every colour is a site token with the dark, authentic value as its fallback,
   so a component follows the page's colour scheme where the site defines
   --sz-*, and still renders correctly standing on its own. Custom properties
   inherit into shadow DOM, which is what makes this reach inside a part. */
const PALETTE = {
  bezelTop: 'var(--sz-bezel-top, #525d67)',
  bezelMid: 'var(--sz-bezel-mid, #303841)',
  bezelBottom: 'var(--sz-bezel-bottom, #232a31)',
  bodyTop: 'var(--sz-body-top, #1d232a)',
  bodyBottom: 'var(--sz-body-bottom, #12171c)',
  edge: 'var(--sz-edge, #05080a)',
  amber: 'var(--sz-amber, #f3c46f)',
  amberDeep: 'var(--sz-amber-deep, #b8862f)',
  amberLitTop: 'var(--sz-amber-lit-top, #f9d491)',
  amberLitBottom: 'var(--sz-amber-lit-bottom, #e5b559)',
  trace: 'var(--sz-trace, #2f9c85)',
  ink: 'var(--sz-ink, #241d14)',
  code: 'var(--sz-code, #e4e0d5)',
  comment: 'var(--sz-comment, #8b9189)',
  metal: 'var(--sz-metal, #b7c1c8)',
  metalLit: 'var(--sz-metal-lit, #e2cb96)',
  execBar: 'var(--sz-exec-bar, #5a2a20)',
  board: 'var(--sz-board, #0b1114)',
  boardGrid: 'var(--sz-board-grid, rgb(52 116 106 / .20))',
  boardShadow: 'var(--sz-board-shadow, inset 0 0 70px rgb(0 0 0 / .75))',
  codeBg: 'var(--sz-code-bg, #0c1215)',
  mnemonic: 'var(--sz-mnemonic, #ffffff)',
  btnTop: 'var(--sz-btn-top, #2e363f)',
  btnEdge: 'var(--sz-btn-edge, #0d1116)',
  btnText: 'var(--sz-btn-text, #aeb9c2)',
  alert: 'var(--sz-alert, #f0a598)',
  alertBg: 'var(--sz-alert-bg, #2a1614)',
  alertEdge: 'var(--sz-alert-edge, #7a2f27)',
  wireEnd: 'var(--sz-wire-end, #06110e)',
  wireCase: 'var(--sz-wire-case, #06110e)',
  wireBody: 'var(--sz-wire-body, #3fae93)',
  wireGroove: 'var(--sz-wire-groove, #24705f)',
  wireCore: 'var(--sz-wire-core, #8fe4cf)'
};

const CHAMFER = v => `polygon(${v} 0, calc(100% - ${v}) 0, 100% ${v},
  100% calc(100% - ${v}), calc(100% - ${v}) 100%, ${v} 100%,
  0 calc(100% - ${v}), 0 ${v})`;

/* ---------- shared part styles ------------------------------------------ */
const PART_CSS = `
:host {
  --pad: calc(var(--cell) * .14);
  --ch: max(3px, calc(var(--cell) * .17));
  --line: calc((var(--rows) * var(--cell) - var(--pad) * 2 - 2px) / var(--lines, 1));
  position: absolute;
  display: block;
  box-sizing: border-box;
  width: calc(var(--cell) * var(--cols));
  height: calc(var(--cell) * var(--rows));
  left: calc(var(--cell) * var(--x, 0));
  top: calc(var(--cell) * var(--y, 0));
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  z-index: 2;
}
:host([dragging]) { z-index: 40; }
:host([dragging]) .frame { box-shadow: 0 6px 14px rgba(0,0,0,.7); }
:host([selected]) .frame { background: linear-gradient(180deg, ${PALETTE.amberDeep}, ${PALETTE.bezelBottom}); }

/* ---- board traces behind the pins ---- */
.trace {
  position: absolute;
  top: calc(var(--at) * 100%);
  width: calc(var(--cell) * .5);
  height: calc(var(--cell) * .38);
  transform: translateY(-50%);
  z-index: 0;
  background: repeating-linear-gradient(
    180deg, ${PALETTE.trace} 0 1px, transparent 1px calc(var(--cell) * .12));
  opacity: .5;
}
.trace[data-side="left"]  { right: 100%; }
.trace[data-side="right"] { left: 100%; }
.trace i {
  position: absolute;
  left: 2px; top: 50%;
  transform: translateY(-50%);
  padding: 0 1px;
  background: ${PALETTE.codeBg};
  color: ${PALETTE.trace};
  font: 400 calc(var(--cell) * .2)/1 var(--mono);
  font-style: normal;
  opacity: 0;
  transition: opacity .12s;
}
:host(:hover) .trace i { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .trace i { transition: none; } }

/* ---- bezel + body ---- */
.frame {
  position: absolute;
  inset: 0 5px;
  clip-path: ${CHAMFER('var(--ch)')};
  background: linear-gradient(168deg, ${PALETTE.bezelTop}, ${PALETTE.bezelMid} 40%, ${PALETTE.bezelBottom});
  box-shadow: 0 2px 4px rgba(0,0,0,.75);
}
.body {
  position: absolute;
  inset: 2px;
  box-sizing: border-box;
  clip-path: ${CHAMFER('calc(var(--ch) - 1px)')};
  background:
    linear-gradient(180deg, rgba(255,255,255,.05) 0 1px, transparent 1px),
    linear-gradient(172deg, ${PALETTE.bodyTop}, ${PALETTE.bodyBottom});
  display: flex;
  gap: calc(var(--cell) * .12);
  padding: var(--pad);
  overflow: hidden;
}

/* ---- pins ---- */
.pin {
  position: absolute;
  top: calc(var(--at) * 100%);
  transform: translateY(-50%);
  width: 9px;
  height: calc(var(--cell) * .52);
  padding: 0;
  border: 1px solid #0b1014;
  border-radius: 1px;
  background: linear-gradient(90deg, #dfe6ea, #9aa5ad 55%, #6b757e);
  box-shadow: 0 1px 2px rgba(0,0,0,.6);
  cursor: crosshair;
  z-index: 3;
}
.pin[data-side="left"]  { left: 0; }
.pin[data-side="right"] { right: 0; }
.pin[data-type="xbus"]::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 4px; height: 4px;
  border-radius: 50%;
  transform: translateY(-50%);
  background: ${PALETTE.amber};
  box-shadow: 0 0 3px rgba(243,196,111,.9);
}
.pin[data-side="left"][data-type="xbus"]::after  { right: -6px; }
.pin[data-side="right"][data-type="xbus"]::after { left: -6px; }
.pin:hover, .pin[data-armed] { background: linear-gradient(90deg,#fff,${PALETTE.metalLit} 60%,${PALETTE.amberDeep}); }
.pin:focus-visible { outline: 2px solid ${PALETTE.amber}; outline-offset: 2px; }
.pin[data-reject] { animation: reject .32s linear 2; }
@keyframes reject { 50% { background: #d0554a; } }

/* ---- code panel ---- */
.code {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  container-type: inline-size;
  font: 400 calc(var(--line) * .72)/var(--line) var(--mono);
  letter-spacing: .01em;
}
/* shrink to the widest supported line so long comments never clip */
.hl, textarea { font-size: min(calc(var(--line) * .72), 8.8cqw); }
.hl, textarea {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 0;
  border: 0;
  font: inherit;
  letter-spacing: inherit;
  white-space: pre;
  overflow: hidden;
}
.hl { color: ${PALETTE.code}; pointer-events: none; z-index: 2; }
.hl .m { color: ${PALETTE.mnemonic}; }
.hl .c { color: ${PALETTE.comment}; }
textarea {
  width: 100%; height: 100%;
  box-sizing: border-box;
  background: transparent;
  color: transparent;
  caret-color: ${PALETTE.amber};
  resize: none;
  z-index: 3;
}
textarea:focus { outline: 0; }
textarea::selection { background: #6d3a2d; }
.exec {
  position: absolute;
  left: calc(var(--pad) * -1); right: calc(var(--pad) * -1);
  height: var(--line);
  top: calc(var(--exec, 0) * var(--line));
  background: ${PALETTE.execBar};
  z-index: 1;
  display: none;
}
:host([exec]:not([exec="-1"])) .exec { display: block; }
.expand {
  position: absolute;
  right: 0; bottom: 0;
  width: 15px; height: 15px;
  display: grid; place-items: center;
  padding: 0;
  border: 1px solid ${PALETTE.btnEdge};
  border-radius: 2px;
  background: ${PALETTE.btnTop};
  color: ${PALETTE.btnText};
  font: 600 9px/1 var(--mono);
  cursor: pointer;
  opacity: 0;
  z-index: 4;
}
.body:hover .expand, .expand:focus-visible { opacity: 1; }
/* Without a pointer there is no hover to reveal it, and the larger editor is
   the only way to read a full program on a phone. Show it, and grow the hit
   area to 44px with a transparent pseudo-element - the badge stays 15px so it
   does not cover the code. */
@media (hover: none) {
  .expand { opacity: 1; }
  .expand::before {
    content: '';
    position: absolute;
    top: -15px; left: -29px; right: -6px; bottom: -6px;
  }
}

/* ---- register readouts ---- */
.regs {
  flex: 0 0 auto;
  width: calc(var(--cell) * 1.45);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.reg { flex: 0 0 auto; }
.reg b, .reg span {
  display: block;
  text-align: center;
  border: 1px solid ${PALETTE.amberDeep};
  background: linear-gradient(180deg, ${PALETTE.amberLitTop}, ${PALETTE.amber} 60%, ${PALETTE.amberLitBottom});
  color: ${PALETTE.ink};
  font: 700 calc(var(--cell) * .26)/1.5 var(--mono);
  border-radius: 2px;
}
.reg b { margin-bottom: 1px; }
.reg span { font-weight: 400; letter-spacing: .14em; }

/* ---- artwork parts: face bleeds to the body edge so rows line up with pins ---- */
.body.bleed { padding: 0; gap: 0; }
.body.bleed .face {
  position: absolute;
  left: -7px; top: -2px;
  width: calc(var(--cell) * var(--cols));
  height: calc(var(--cell) * var(--rows));
}
.face { flex: 1; display: block; min-width: 0; }
/* Face artwork, coloured from the scheme rather than from attributes. */
.face .ink-line { stroke: ${PALETTE.amber}; }
.face .lit { fill: ${PALETTE.amber}; }
.face .lit-text { fill: ${PALETTE.ink}; }

/* ---- palette thumbnail mode ---- */
:host([thumb]) { pointer-events: none; }
:host([thumb]) .expand,
:host([thumb]) textarea,
:host([thumb]) .trace,
:host([thumb]) .hl { display: none; }
.ghost { display: none; }
:host([thumb]) .ghost {
  display: block;
  position: absolute;
  inset: 0;
  z-index: 2;
}
.ghost u {
  display: block;
  height: calc(var(--line) * .42);
  margin-bottom: calc(var(--line) * .58);
  background: ${PALETTE.metal};
  text-decoration: none;
}

/* ---- plain-face parts (terminals, memory, gates) ---- */
.face-label {
  flex: 1;
  display: grid;
  place-items: center;
  gap: calc(var(--cell) * .06);
  min-width: 0;
  padding: calc(var(--cell) * .08);
  color: ${PALETTE.amber};
  font: 600 calc(var(--cell) * .26)/1.15 var(--mono);
  text-align: center;
  overflow: hidden;
}
.face-label b { font-weight: 700; letter-spacing: .02em; }
.face-label small {
  color: ${PALETTE.comment};
  font-size: calc(var(--cell) * .19);
  font-weight: 400;
  letter-spacing: .04em;
}
.cells {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  width: 100%;
}
.cells i {
  height: calc(var(--cell) * .12);
  background: ${PALETTE.trace};
  opacity: .55;
}

/* ---- a terminal carrying a live value ---- */
:host([lit]) .frame { background: linear-gradient(180deg, #b8862f, #6d4f1c); }
:host([lit]) .face-label b { color: #ffe6ad; }
.face-label .level { display: block; color: ${PALETTE.comment}; }
:host([lit]) .face-label .level { color: #f3c46f; }

/* ---- not-connected pins ----
   Drawn because the manual draws them, but they go nowhere: no metal, no tap
   target, and tryConnect refuses them. */
.pin[data-type="nc"] {
  background: none;
  border-color: transparent;
  border-left: 2px dotted ${PALETTE.metal};
  opacity: .5;
  cursor: default;
  pointer-events: none;
}
.pin[data-type="nc"]::before { content: none; }

/* ---- touch targets ----
   The visible pin tab is 9px wide, far below a usable tap size. Grow the hit
   area with a transparent pseudo-element, biased outward from the board edge so
   it never sits over the code panel. Visual size is unchanged. */
.pin::before {
  content: '';
  position: absolute;
  top: -16px;
  bottom: -16px;
}
.pin[data-side="left"]::before  { left: -30px; right: -6px; }
.pin[data-side="right"]::before { left: -6px; right: -30px; }

/* ---- figure mode ----
   A part used as a documentation figure: labels always legible, nothing to
   drag, type or wire. Labels must not depend on :hover - there is none on touch. */
:host([labels]) .trace i { opacity: 1; }
:host([static]) { pointer-events: none; }
:host([static]) .expand { display: none; }
:host([static]) textarea { display: none; }
:host([static]) .pin { cursor: default; }
`;

/* ---------- base class -------------------------------------------------- */
class SzPart extends HTMLElement {
  static observedAttributes = ['x', 'y', 'exec'];

  get meta() { return this.constructor.meta; }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    if (!this._built) { this._built = true; this._build(); }
    this.setAttribute('part-name', this.meta.name);
    this._syncPos();
  }

  attributeChangedCallback(name) {
    if (!this._built) return;
    if (name === 'exec') this.style.setProperty('--exec', Math.max(0, +this.getAttribute('exec') || 0));
    else this._syncPos();
  }

  _syncPos() {
    this.style.setProperty('--x', this.getAttribute('x') || 0);
    this.style.setProperty('--y', this.getAttribute('y') || 0);
    this.style.setProperty('--cols', this.meta.cols);
    this.style.setProperty('--rows', this.meta.rows);
    this.style.setProperty('--lines', this.meta.lines || 1);
    this.dispatchEvent(new CustomEvent('part-moved', { bubbles: true }));
  }

  _build() {
    const pins = this.meta.pins.map(p => `
      <span class="trace" data-side="${p.side}" style="--at:${p.at}"><i>${p.name}</i></span>
      <button class="pin" type="button"
              data-pin="${p.name}" data-type="${p.type}" data-side="${p.side}"
              style="--at:${p.at}"
              title="${p.name} — ${p.type === 'xbus' ? 'XBus' : 'simple I/O'}"
              aria-label="${this.meta.name} pin ${p.name}, ${p.type === 'xbus' ? 'XBus' : 'simple I O'}"></button>`).join('');
    this.shadowRoot.innerHTML =
      `<style>${PART_CSS}</style>${pins}<div class="frame"><div class="body${this.meta.bleed ? ' bleed' : ''}">${this.bodyHTML()}</div></div>`;
    this.afterBuild?.();
  }

  bodyHTML() { return ''; }

  /** Highlighted line index, or -1 for none. */
  get exec() { return +this.getAttribute('exec'); }
  set exec(n) { this.setAttribute('exec', n); }

  pinElement(name) { return this.shadowRoot.querySelector(`.pin[data-pin="${name}"]`); }
  pinElements() { return [...this.shadowRoot.querySelectorAll('.pin')]; }
}

/* ---------- microcontrollers -------------------------------------------- */
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Marker column and comments, coloured the way the game does. */
function highlight(code, lines) {
  const rows = code.split('\n');
  while (rows.length < lines) rows.push('');
  return rows.slice(0, lines).map(row => {
    const hash = row.indexOf('#');
    const body = hash === -1 ? row : row.slice(0, hash);
    const tail = hash === -1 ? '' : `<span class="c">${esc(row.slice(hash))}</span>`;
    const marker = /^[+\-@]/.test(body) ? `<span class="m">${body[0]}</span>` : '';
    const rest = marker ? body.slice(1) : body;
    return `${marker}${esc(rest)}${tail}` || ' ';
  }).join('\n');
}

class SzMcu extends SzPart {
  bodyHTML() {
    const regs = this.meta.regs.map(r =>
      `<div class="reg"><b>${r}</b><span>${r === 'acc' || r === 'dat' ? '0' : '----'}</span></div>`).join('');
    const ghost = this.meta.ghost.map(w => `<u style="width:${w}%"></u>`).join('');
    return `
      <div class="code">
        <div class="exec"></div>
        <pre class="hl" aria-hidden="true"></pre>
        <textarea spellcheck="false" autocapitalize="off" autocorrect="off"
                  aria-label="${this.meta.name} program"></textarea>
        <div class="ghost" aria-hidden="true">${ghost}</div>
        <button class="expand" type="button" title="Open larger editor">⤢</button>
      </div>
      <div class="regs">${regs}</div>`;
  }

  afterBuild() {
    this.editor = this.shadowRoot.querySelector('textarea');
    this.hl = this.shadowRoot.querySelector('.hl');
    // An explicit empty `code` means a bare chip; only a missing attribute
    // falls back to the part's sample program.
    this.setCode(this.hasAttribute('code') ? this.getAttribute('code') : (this.meta.sample || ''));
    this.editor.addEventListener('input', () => this.setCode(this.editor.value));
    this.editor.addEventListener('pointerdown', e => e.stopPropagation());
    const expand = this.shadowRoot.querySelector('.expand');
    expand.addEventListener('pointerdown', e => e.stopPropagation());
    expand.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('open-editor', { bubbles: true, composed: true, detail: this }));
    });
  }

  get code() { return this.editor ? this.editor.value : (this.getAttribute('code') || ''); }

  setCode(text) {
    const clamped = String(text).split('\n').slice(0, this.meta.lines).join('\n');
    if (this.editor && this.editor.value !== clamped) this.editor.value = clamped;
    if (this.hl) this.hl.innerHTML = highlight(clamped, this.meta.lines);
    this.setAttribute('code', clamped);
    this.dispatchEvent(new CustomEvent('code-changed', { bubbles: true, composed: true, detail: this }));
  }

  get linesUsed() { return this.code.split('\n').filter(l => l.trim()).length; }

  /** Write one register readout. The simulator drives these while it runs. */
  setRegister(name, text) {
    const index = this.meta.regs.indexOf(name);
    if (index < 0) return;
    const cell = this.shadowRoot.querySelectorAll('.reg span')[index];
    if (cell) cell.textContent = String(text);
  }

  /** Put every readout back to how a chip looks before anything has run. */
  resetRegisters() {
    this.meta.regs.forEach(r => this.setRegister(r, r === 'acc' || r === 'dat' ? '0' : '----'));
    this.removeAttribute('exec');
  }
}

class MC4000 extends SzMcu {
  static meta = PART_META['mc-4000'];
}

class MC4000X extends SzMcu {
  static meta = PART_META['mc-4000x'];
}

class MC6000 extends SzMcu {
  static meta = PART_META['mc-6000'];
}

/* ---------- DX300 digital I/O expander ---------------------------------- */
class DX300 extends SzPart {
  static meta = PART_META['dx-300'];

  bodyHTML() {
    /* full-bleed 60 x 100 viewBox == the 3 x 5 footprint, so the three rows
       land exactly on the pins; the artwork is inset inside the viewBox.
       Colours come from classes rather than presentation attributes: browsers
       differ on whether var() resolves in an attribute, and the scheme has to
       reach this drawing like everything else. */
    const rows = [20, 50, 80];
    const flags = rows.map(y => `<path d="M40 ${y - 6} h9 l4 6 -4 6 H40 z"/>`).join('');
    const digits = rows.map(y => `<text x="44.5" y="${y + 3.2}">0</text>`).join('');
    return `<svg class="face" viewBox="0 0 60 100" preserveAspectRatio="none" aria-hidden="true">
      <g class="ink-line" fill="none" stroke-width="1.4" stroke-linecap="butt">
        <path d="M0 20 H10 M0 80 H10 M10 20 V80 M0 50 H17"/>
        <path d="M25 50 H34 M34 20 V80 M34 20 H40 M34 80 H40"/>
        <path d="M53 20 H60 M53 50 H60 M53 80 H60"/>
        <path d="M39 37 h3 v-6 h4 v6 h3"/>
        <path d="M39 67 h3 v-6 h4 v6 h3"/>
      </g>
      <circle class="lit" cx="10" cy="50" r="1.8"/>
      <rect class="lit" x="17" y="46" width="8" height="8"/>
      <g class="lit">${flags}</g>
      <g class="lit-text" font-family="monospace" font-size="8.5" font-weight="700"
         text-anchor="middle">${digits}</g>
    </svg>`;
  }
}

/* ---------- I/O terminal ------------------------------------------------
   The labelled devices a reference circuit hangs off its microcontrollers:
   button, lamp, motor-0, trigger, output. One typed pin and a name, which is
   all any of them are on a board, so a single part covers the lot.

   Per-instance attributes, because these vary by use rather than by model:
     label="motor-0"   text on the face, and the pin name
     type="simple"     or "xbus"
     side="left"       which edge the pin sits on (default right)
   ------------------------------------------------------------------------ */
class IOTerminal extends SzPart {
  static meta = PART_META['io-terminal'];

  /* Resolved per instance rather than per class - attributes decide the pin. */
  get meta() {
    const label = this.getAttribute('label') || 'io';
    return {
      ...IOTerminal.meta,
      name: label,
      pins: [{
        name: label,
        type: this.getAttribute('type') === 'xbus' ? 'xbus' : 'simple',
        side: this.getAttribute('side') === 'left' ? 'left' : 'right',
        at: .5
      }]
    };
  }

  bodyHTML() {
    return `<div class="face-label"><b>${esc(this.getAttribute('label') || 'io')}</b>
      <small class="level"></small></div>`;
  }

  /** Show the value the terminal is carrying, and light it when it is on. */
  setLevel(value) {
    const cell = this.shadowRoot.querySelector('.level');
    if (cell) cell.textContent = value === null || value === undefined ? '' : String(value);
    this.toggleAttribute('lit', Number(value) >= 50);
  }
}

/* ---------- Pingda memory ----------------------------------------------- */
class SzMemory extends SzPart {
  bodyHTML() {
    const cells = Array.from({ length: 14 }, () => '<i></i>').join('');
    return `<div class="face-label"><b>${this.meta.name}</b>
      <div class="cells" aria-hidden="true">${cells}</div>
      <small>${this.meta.kind}</small></div>`;
  }
}


class P100P14 extends SzMemory {
  static meta = PART_META['p-100p14'];
}

class P200P14 extends SzMemory {
  static meta = PART_META['p-200p14'];
}

/* ---------- The Logic Company gates -------------------------------------
   Signals below 50 read as off, 50 and above as on. The inverter has one
   input; the rest take two.
   ------------------------------------------------------------------------ */
class SzGate extends SzPart {
  bodyHTML() {
    return `<div class="face-label"><b>${this.meta.op}</b><small>${this.meta.name}</small></div>`;
  }
}


class LC70G04 extends SzGate {
  static meta = PART_META['lc-70g04'];
}
class LC70G08 extends SzGate {
  static meta = PART_META['lc-70g08'];
}
class LC70G32 extends SzGate {
  static meta = PART_META['lc-70g32'];
}
class LC70G86 extends SzGate {
  static meta = PART_META['lc-70g86'];
}

/* ---------- parts that are a face and pins, nothing more -----------------
   Eleven of the manual's components are the same shape: a name, a footprint
   and a pin list, with no program and no readouts. A class each would be
   eleven copies of one method, so they are built from PART_META instead.
   Anything with behaviour - a program, cells, a per-instance pin - still gets
   a real class above.
   ------------------------------------------------------------------------ */
class SzFixed extends SzPart {
  bodyHTML() {
    const kind = this.meta.kind ? `<small>${esc(this.meta.kind)}</small>` : '';
    return `<div class="face-label"><b>${esc(this.meta.name)}</b>${kind}</div>`;
  }
}

/** Register one data-only part. Returns the class, for the export list. */
function definePart(tag) {
  const meta = PART_META[tag];
  if (!meta) throw new Error(`definePart: no PART_META for ${tag}`);
  // A custom element name must contain a hyphen. Without this the registry
  // throws mid-module and every part on the page silently stays a fallback,
  // which is a long way from the actual mistake.
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(tag)) {
    throw new Error(`definePart: "${tag}" is not a valid custom element name (needs a hyphen)`);
  }
  const cls = class extends SzFixed { static meta = meta; };
  Object.defineProperty(cls, 'name', { value: tag });
  customElements.define(tag, cls);
  return cls;
}

/** Every part built from data alone. */
const FIXED_PARTS = [
  'mc-4010', 'dt-2415', 'c2s-rf901', 'fm-blaster', 'n4pb-8000',
  'lx-700', 'lx-910c', 'd80c010-f', 'kuji-ek1', 'pga-33x6', 'nlp-2',
];

/* ---------- board ------------------------------------------------------- */
const BOARD_CSS = `
circuit-board {
  --cell: 40px;
  --mono: ui-monospace, "SF Mono", "Roboto Mono", Menlo, Consolas, monospace;
  position: relative;
  display: block;
  overflow: auto;
  touch-action: pan-x pan-y;
  background-color: ${PALETTE.board};
  background-image:
    linear-gradient(45deg, ${PALETTE.boardGrid} 25%, transparent 25%, transparent 75%, ${PALETTE.boardGrid} 75%),
    linear-gradient(45deg, ${PALETTE.boardGrid} 25%, transparent 25%, transparent 75%, ${PALETTE.boardGrid} 75%);
  background-size: 4px 4px, 4px 4px;
  background-position: 0 0, 2px 2px;
  box-shadow: ${PALETTE.boardShadow};
}
circuit-board > svg.wires {
  position: absolute;
  inset: 0;
  width: 100%; height: 100%;
  pointer-events: none;
  z-index: 3;
  overflow: visible;
}
circuit-board[static] { overflow: visible; touch-action: auto; box-shadow: none; }
circuit-board[static] .wire-hit { pointer-events: none; cursor: default; }
circuit-board .wire-hit { stroke: transparent; fill: none; pointer-events: stroke; cursor: pointer; }
circuit-board g.wire path { fill: none; stroke-linejoin: miter; stroke-linecap: butt; }
/* Conductor stack, outermost first. Widths are set in script because they
   scale with the cell; the colours live here so they follow the scheme. */
circuit-board g.wire .w-case   { stroke: ${PALETTE.wireCase}; }
circuit-board g.wire .w-body   { stroke: ${PALETTE.wireBody}; }
circuit-board g.wire .w-groove { stroke: ${PALETTE.wireGroove}; }
circuit-board g.wire .w-core   { stroke: ${PALETTE.wireCore}; }
circuit-board g.wire:hover .w-body { stroke: ${PALETTE.amber}; }
circuit-board g.wire .w-end { stroke: ${PALETTE.wireEnd}; }
circuit-board path.draft { stroke: ${PALETTE.amber}; stroke-width: 2; stroke-dasharray: 5 4; fill: none; }
circuit-board .toast {
  position: absolute;
  left: 50%; bottom: 12px;
  transform: translateX(-50%);
  z-index: 60;
  padding: 6px 12px;
  border: 1px solid ${PALETTE.alertEdge};
  border-radius: 3px;
  background: ${PALETTE.alertBg};
  color: ${PALETTE.alert};
  font: 500 12px/1.3 var(--mono);
  pointer-events: none;
  opacity: 0;
  transition: opacity .18s;
}
circuit-board .toast[open] { opacity: 1; }
@media (prefers-reduced-motion: reduce) { circuit-board .toast { transition: none; } }
`;

/* Conductor stack, outermost first: [class, width factor]. Green, to read as a
   board trace rather than a bare metal jumper. The colours are in BOARD_CSS,
   keyed on these classes, so they follow the page's colour scheme - setting
   them as presentation attributes here would pin them to one theme. */
const RIBBON = [
  ['w-case', 1.00],
  ['w-body', 0.86],
  ['w-groove', 0.52],
  ['w-core', 0.20]
];

class CircuitBoard extends HTMLElement {
  static observedAttributes = ['cell'];

  connectedCallback() {
    if (this._built) return;
    this._built = true;

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('wires');
    this.appendChild(this.svg);

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    this.appendChild(this.toastEl);

    this.wires = [];
    this.selected = null;

    this.addEventListener('pointerdown', this._onDown);
    this.addEventListener('part-moved', () => this.redrawWires());
    this.addEventListener('keydown', this._onKey);
    this.tabIndex = 0;
    new ResizeObserver(() => this.redrawWires()).observe(this);
    this._applyCell();
  }

  attributeChangedCallback() { this._applyCell(); }

  _applyCell() {
    const v = this.getAttribute('cell');
    if (v) this.style.setProperty('--cell', `${parseFloat(v)}px`);
    requestAnimationFrame(() => this.redrawWires());
  }

  get cell() { return parseFloat(getComputedStyle(this).getPropertyValue('--cell')) || 40; }
  get parts() { return [...this.children].filter(el => el instanceof SzPart); }

  addPart(tag, x = 1, y = 1, attrs = null) {
    const el = document.createElement(tag);
    el.setAttribute('x', x);
    el.setAttribute('y', y);
    // Shaping attributes must land before the part is connected: io-terminal
    // resolves its pin from them when it first renders.
    if (attrs) {
      ['label', 'type', 'side'].forEach(a => {
        if (attrs[a] !== undefined && attrs[a] !== null) el.setAttribute(a, attrs[a]);
      });
    }
    this.appendChild(el);
    return el;
  }

  removePart(part) {
    this.wires.filter(w => w.a.part === part || w.b.part === part).forEach(w => this.removeWire(w));
    if (this.selected === part) this.selected = null;
    part.remove();
  }

  select(part) {
    this.parts.forEach(p => p.toggleAttribute('selected', p === part));
    this.selected = part;
  }

  /* ----- interaction ----- */
  _onDown = e => {
    if (this.hasAttribute('static')) return;
    if (e.button !== undefined && e.button > 0) return;
    const path = e.composedPath();
    const pin = path.find(n => n.classList && n.classList.contains('pin'));
    const part = path.find(n => n instanceof SzPart);
    if (pin && part) { this._startWire(e, part, pin); return; }
    if (part) { this.select(part); this._startDrag(e, part); return; }
    this.select(null);
  };

  _onKey = e => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected) {
      const active = this.selected.shadowRoot?.activeElement;
      if (active && active.tagName === 'TEXTAREA') return;
      e.preventDefault();
      this.removePart(this.selected);
    }
  };

  _startDrag(e, part) {
    const cell = this.cell;
    const rect = this.getBoundingClientRect();
    const px = (Number(part.getAttribute('x')) || 0) * cell;
    const py = (Number(part.getAttribute('y')) || 0) * cell;
    const grabX = e.clientX - rect.left + this.scrollLeft - px;
    const grabY = e.clientY - rect.top + this.scrollTop - py;
    part.setAttribute('dragging', '');
    this.setPointerCapture(e.pointerId);

    const move = ev => {
      part.setAttribute('x', Math.max(0, Math.round((ev.clientX - rect.left + this.scrollLeft - grabX) / cell)));
      part.setAttribute('y', Math.max(0, Math.round((ev.clientY - rect.top + this.scrollTop - grabY) / cell)));
    };
    const up = () => {
      part.removeAttribute('dragging');
      this.removeEventListener('pointermove', move);
      this.removeEventListener('pointerup', up);
      this.removeEventListener('pointercancel', up);
      this.redrawWires();
    };
    this.addEventListener('pointermove', move);
    this.addEventListener('pointerup', up);
    this.addEventListener('pointercancel', up);
  }

  _startWire(e, part, pin) {
    e.preventDefault();
    pin.setAttribute('data-armed', '');
    this.setPointerCapture(e.pointerId);

    const draft = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    draft.setAttribute('class', 'draft');
    this.svg.appendChild(draft);
    const from = this._anchor(pin);

    const move = ev => {
      const p = this._toLocal(ev.clientX, ev.clientY);
      draft.setAttribute('d', `M${from.x} ${from.y} L${p.x} ${p.y}`);
    };
    const up = ev => {
      this.removeEventListener('pointermove', move);
      this.removeEventListener('pointerup', up);
      this.removeEventListener('pointercancel', up);
      draft.remove();
      pin.removeAttribute('data-armed');
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const hitPart = target instanceof SzPart ? target : null;
      const hitPin = hitPart
        ? hitPart.shadowRoot.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.pin')
        : null;
      if (hitPart && hitPin) this.tryConnect(part, pin, hitPart, hitPin);
    };
    this.addEventListener('pointermove', move);
    this.addEventListener('pointerup', up);
    this.addEventListener('pointercancel', up);
  }

  /* ----- connection rules ----- */
  tryConnect(partA, pinA, partB, pinB) {
    const reject = (msg, el) => {
      this.toast(msg);
      el.setAttribute('data-reject', '');
      setTimeout(() => el.removeAttribute('data-reject'), 700);
      return null;
    };
    if (partA === partB && pinA === pinB) return null;
    if (partA === partB) return reject('A part cannot wire to itself.', pinB);

    const ta = pinA.dataset.type, tb = pinB.dataset.type;
    if (ta === 'nc' || tb === 'nc') {
      return reject('That pin is not connected to anything inside the part.', pinB);
    }
    if (ta !== tb) {
      const label = t => (t === 'xbus' ? 'XBus' : 'simple I/O');
      return reject(`${label(ta)} connects only to ${label(ta)} — ${pinB.dataset.pin} is ${label(tb)}.`, pinB);
    }
    const dupe = this.wires.some(w =>
      (w.a.pin === pinA && w.b.pin === pinB) || (w.a.pin === pinB && w.b.pin === pinA));
    if (dupe) return reject('Those pins are already wired.', pinB);

    return this.connect({ part: partA, pin: pinA }, { part: partB, pin: pinB });
  }

  connect(a, b) {
    const NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'wire');
    const wire = { a, b, g, layers: [], ends: [], type: a.pin.dataset.type };

    RIBBON.forEach(([cls]) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('class', cls);
      g.appendChild(p);
      wire.layers.push(p);
    });
    for (let i = 0; i < 2; i++) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('class', 'w-end');
      g.appendChild(p);
      wire.ends.push(p);
    }
    wire.hit = document.createElementNS(NS, 'path');
    wire.hit.setAttribute('class', 'wire-hit');
    g.appendChild(wire.hit);

    // A figure board is a picture: nothing to cut.
    if (!this.hasAttribute('static')) {
      g.addEventListener('click', () => this.removeWire(wire));
    }
    this.svg.appendChild(g);
    this.wires.push(wire);
    this.redrawWires();
    this.dispatchEvent(new CustomEvent('wires-changed', { detail: this.wires }));
    return wire;
  }

  removeWire(wire) {
    wire.g.remove();
    this.wires = this.wires.filter(w => w !== wire);
    this.dispatchEvent(new CustomEvent('wires-changed', { detail: this.wires }));
  }

  clearWires() { [...this.wires].forEach(w => this.removeWire(w)); }

  /* ----- geometry ----- */
  _toLocal(clientX, clientY) {
    const r = this.getBoundingClientRect();
    return { x: clientX - r.left + this.scrollLeft, y: clientY - r.top + this.scrollTop };
  }

  _anchor(pin) {
    const r = pin.getBoundingClientRect();
    const side = pin.dataset.side;
    const p = this._toLocal(side === 'left' ? r.left : r.right, r.top + r.height / 2);
    p.dir = side === 'left' ? -1 : 1;
    return p;
  }

  /** Every part's box in board coordinates, for the router to steer around. */
  partRects() {
    return this.parts.map(part => {
      const r = part.getBoundingClientRect();
      const tl = this._toLocal(r.left, r.top);
      return { x0: tl.x, y0: tl.y, x1: tl.x + r.width, y1: tl.y + r.height };
    });
  }

  drawWire(wire, rects = this.partRects(), lanes = []) {
    const cell = this.cell;
    const a = this._anchor(wire.a.pin);
    const b = this._anchor(wire.b.pin);
    const d = routeAvoiding(a, b, cell, rects, lanes);
    const gauge = Math.max(7, cell * 0.2);

    wire.layers.forEach((p, i) => {
      p.setAttribute('d', d);
      p.setAttribute('stroke-width', (gauge * RIBBON[i][1]).toFixed(2));
    });
    wire.hit.setAttribute('d', d);
    wire.hit.setAttribute('stroke-width', gauge + 8);

    const stub = Math.max(4, cell * 0.13);
    [[a, wire.ends[0]], [b, wire.ends[1]]].forEach(([pt, el]) => {
      el.setAttribute('d', `M${pt.x} ${pt.y} H${pt.x + pt.dir * stub}`);
      el.setAttribute('stroke-width', (gauge * 1.3).toFixed(2));
    });
  }

  redrawWires() {
    // Route the whole set in one pass so each wire can see the lanes already
    // claimed and pick a different one.
    const rects = this.partRects();
    const lanes = [];
    this.wires.forEach(w => this.drawWire(w, rects, lanes));
  }

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.setAttribute('open', '');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.removeAttribute('open'), 2400);
  }

  /* ----- serialisation ----- */
  toJSON() {
    const parts = this.parts;
    return {
      cell: this.cell,
      // label/type/side shape an io-terminal's only pin, so a saved board that
      // dropped them would come back with the wrong pin and lose its wires.
      parts: parts.map(p => {
        const out = {
          tag: p.tagName.toLowerCase(),
          x: Number(p.getAttribute('x')) || 0,
          y: Number(p.getAttribute('y')) || 0,
          code: p.getAttribute('code') || ''
        };
        ['label', 'type', 'side'].forEach(a => {
          if (p.hasAttribute(a)) out[a] = p.getAttribute(a);
        });
        return out;
      }),
      wires: this.wires.map(w => ({
        a: [parts.indexOf(w.a.part), w.a.pin.dataset.pin],
        b: [parts.indexOf(w.b.part), w.b.pin.dataset.pin]
      }))
    };
  }

  load(data) {
    this.clearWires();
    this.parts.forEach(p => p.remove());
    const made = data.parts.map(p => {
      const el = this.addPart(p.tag, p.x, p.y, p);
      if (p.code) el.setCode?.(p.code);
      return el;
    });
    requestAnimationFrame(() => {
      data.wires.forEach(w => {
        const pa = made[w.a[0]], pb = made[w.b[0]];
        if (!pa || !pb) return;
        this.connect(
          { part: pa, pin: pa.pinElement(w.a[1]) },
          { part: pb, pin: pb.pinElement(w.b[1]) });
      });
    });
  }
}

/**
 * Right-angled ribbon route between two pin anchors that keeps clear of the
 * parts on the board.
 *
 * The old version picked a lane from the pin positions alone, so a long run
 * between two same-side pins was drawn straight through whatever sat between
 * them. This one treats every part as an obstacle and picks the nearest
 * horizontal lane that is actually free, then records the lane so the next
 * wire does not land on top of it.
 */
function routeAvoiding(a, b, cell, rects, lanes) {
  const out = Math.max(12, cell * 0.45);
  // Smaller than `out`, so a pin's own part never blocks its own stub.
  const pad = Math.max(5, cell * 0.16);
  const gap = Math.max(6, cell * 0.22);
  const ax = a.x + a.dir * out;
  const bx = b.x + b.dir * out;

  const hitsH = (y, x0, x1) => {
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    return rects.some(r => y > r.y0 - pad && y < r.y1 + pad && hi > r.x0 - pad && lo < r.x1 + pad);
  };
  const hitsV = (x, y0, y1) => {
    const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
    return rects.some(r => x > r.x0 - pad && x < r.x1 + pad && hi > r.y0 - pad && lo < r.y1 + pad);
  };
  const taken = (y, x0, x1) => lanes.some(l =>
    Math.abs(l.y - y) < gap &&
    Math.max(x0, x1) > Math.min(l.x0, l.x1) &&
    Math.min(x0, x1) < Math.max(l.x0, l.x1));

  const claim = (y, x0, x1, d) => { lanes.push({ y, x0, x1 }); return d; };

  // Straight across, when the pins line up and nothing is in the way.
  if (Math.abs(a.y - b.y) < 1 && !hitsH(a.y, a.x, b.x) && !taken(a.y, a.x, b.x)) {
    return claim(a.y, a.x, b.x, `M${a.x} ${a.y} H${b.x}`);
  }

  // Pins facing each other: one vertical in the gap between them.
  const facing = (a.dir === 1 && b.dir === -1 && bx > ax) || (a.dir === -1 && b.dir === 1 && ax > bx);
  if (facing) {
    const mid = Math.round((ax + bx) / 2);
    if (!hitsV(mid, a.y, b.y) && !hitsH(a.y, a.x, mid) && !hitsH(b.y, mid, b.x)) {
      lanes.push({ y: a.y, x0: a.x, x1: mid });
      return claim(b.y, mid, b.x, `M${a.x} ${a.y} H${mid} V${b.y} H${b.x}`);
    }
  }

  // Otherwise run out to a lane. Prefer one near the middle of the two pins,
  // and search the clear bands above and below every part.
  const midY = (a.y + b.y) / 2;
  const candidates = [a.y, b.y];
  for (const r of rects) {
    candidates.push(r.y0 - pad - gap);
    candidates.push(r.y1 + pad + gap);
  }
  candidates.sort((p, q) => Math.abs(p - midY) - Math.abs(q - midY));

  for (const base of candidates) {
    for (let n = 0; n < 8; n += 1) {
      const lane = Math.round(base + (n % 2 ? -1 : 1) * Math.ceil(n / 2) * gap);
      if (hitsH(lane, ax, bx) || taken(lane, ax, bx)) continue;
      if (hitsV(ax, a.y, lane) || hitsV(bx, lane, b.y)) continue;
      return claim(lane, ax, bx, `M${a.x} ${a.y} H${ax} V${lane} H${bx} V${b.y} H${b.x}`);
    }
  }

  // Nothing clear: go below everything rather than through anything.
  const floor = Math.round(rects.reduce((m, r) => Math.max(m, r.y1), Math.max(a.y, b.y)) + pad + gap * (lanes.length + 1));
  return claim(floor, ax, bx, `M${a.x} ${a.y} H${ax} V${floor} H${bx} V${b.y} H${b.x}`);
}

/* ---------- register ---------------------------------------------------- */
const style = document.createElement('style');
style.textContent = BOARD_CSS;
document.head.appendChild(style);

customElements.define('circuit-board', CircuitBoard);
customElements.define('mc-4000', MC4000);
customElements.define('mc-4000x', MC4000X);
customElements.define('mc-6000', MC6000);
customElements.define('dx-300', DX300);
customElements.define('io-terminal', IOTerminal);
customElements.define('p-100p14', P100P14);
customElements.define('p-200p14', P200P14);
customElements.define('lc-70g04', LC70G04);
customElements.define('lc-70g08', LC70G08);
customElements.define('lc-70g32', LC70G32);
customElements.define('lc-70g86', LC70G86);

const FIXED = Object.fromEntries(FIXED_PARTS.map(tag => [tag, definePart(tag)]));

/* ---------- scope trace -------------------------------------------------
   A rolling plot of what a pin has been doing, one step per time unit. The
   manual prints this as a screenshot; here it is drawn from the run.
   ------------------------------------------------------------------------ */
class ScopeTrace extends HTMLElement {
  static SAMPLES = 24;

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    if (!this._built) {
      this._built = true;
      this.series = new Map();
      this.width = this.clientWidth || 260;
      // The plot is drawn in real pixels, so it has to be redrawn when the
      // element is resized rather than stretched to fit.
      this._ro = new ResizeObserver(() => {
        const w = this.clientWidth || 260;
        if (Math.abs(w - this.width) < 1) return;
        this.width = w;
        this._render();
      });
      this._ro.observe(this);
      this._render();
    }
  }

  disconnectedCallback() { this._ro?.disconnect(); }

  /** Record one sample per named signal. */
  record(values) {
    for (const [name, value] of Object.entries(values)) {
      if (!this.series.has(name)) this.series.set(name, []);
      const list = this.series.get(name);
      list.push(Number(value) || 0);
      if (list.length > ScopeTrace.SAMPLES) list.shift();
    }
    this._render();
  }

  clear() { this.series = new Map(); this._render(); }

  _render() {
    const names = [...this.series.keys()];
    // One user unit is one CSS pixel. The viewBox used to be a fixed 100 wide
    // and stretched to fit with preserveAspectRatio="none", which scaled x by
    // ~3 and y by 1 - the waveform did not care, but it left the row labels
    // three times too wide. Drawing at the element's real width keeps text at
    // its true proportions.
    const w = Math.max(120, Math.round(this.width || this.clientWidth || 260));
    const rowH = 30;
    const h = Math.max(rowH, names.length * rowH);
    const rows = names.map((name, row) => {
      const values = this.series.get(name);
      // Baseline for the row label, then the band the wave swings inside it.
      const label = row * rowH + 11;
      const top = row * rowH + 17;
      const bottom = row * rowH + 28;
      // Step plot: hold each sample for its whole time unit.
      const step = w / Math.max(1, ScopeTrace.SAMPLES);
      let d = '';
      values.forEach((v, i) => {
        const y = v >= 50 ? top : bottom;
        const x = i * step;
        d += (i === 0 ? `M${x} ${y}` : `L${x} ${y}`) + ` L${x + step} ${y}`;
        if (i < values.length - 1) {
          const next = values[i + 1] >= 50 ? top : bottom;
          if (next !== y) d += ` L${x + step} ${next}`;
        }
      });
      return `<g><text x="0" y="${label}">${name}</text>
        <path d="${d || `M0 ${bottom} L${w} ${bottom}`}"/></g>`;
    }).join('');

    this.shadowRoot.innerHTML = `<style>
      :host { display: block; }
      svg { display: block; width: 100%; height: ${h}px; }
      path { fill: none; stroke: ${PALETTE.trace}; stroke-width: 1.5; }
      text { fill: ${PALETTE.comment}; font: 400 10px var(--mono, monospace); letter-spacing: .04em; }
    </style>
    <svg viewBox="0 0 ${w} ${h}" role="img"
         aria-label="${names.join(' and ')} over time">${rows || ''}</svg>`;
  }
}

customElements.define('scope-trace', ScopeTrace);

export {
  ScopeTrace,
  CircuitBoard,
  SzPart,
  SzMcu,
  MC4000,
  MC4000X,
  MC6000,
  DX300,
  IOTerminal,
  SzMemory,
  P100P14,
  P200P14,
  SzGate,
  LC70G04,
  LC70G08,
  LC70G32,
  LC70G86,
  SzFixed,
  definePart,
  FIXED_PARTS,
  FIXED,
  PALETTE,
  highlight,
  routeAvoiding,
};
