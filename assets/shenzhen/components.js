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

const PALETTE = {
  bezelTop: '#525d67',
  bezelBottom: '#232a31',
  bodyTop: '#1d232a',
  bodyBottom: '#12171c',
  edge: '#05080a',
  amber: '#f3c46f',
  amberDeep: '#b8862f',
  trace: '#2f9c85',
  ink: '#241d14',
  code: '#e4e0d5',
  comment: '#8b9189',
  metal: '#b7c1c8',
  execBar: '#5a2a20'
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
:host([selected]) .frame { background: linear-gradient(180deg, #8a7a4e, #4a4230); }

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
  background: #0c1215;
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
  background: linear-gradient(168deg, ${PALETTE.bezelTop}, #303841 40%, ${PALETTE.bezelBottom});
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
.pin:hover, .pin[data-armed] { background: linear-gradient(90deg,#fff,#e2cb96 60%,#a98a45); }
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
.hl .m { color: #ffffff; }
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
  border: 1px solid #0d1116;
  border-radius: 2px;
  background: #2e363f;
  color: #aeb9c2;
  font: 600 9px/1 var(--mono);
  cursor: pointer;
  opacity: 0;
  z-index: 4;
}
.body:hover .expand, .expand:focus-visible { opacity: 1; }

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
  background: linear-gradient(180deg, #f9d491, ${PALETTE.amber} 60%, #e5b559);
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
  background: #4d5560;
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
}

class MC4000 extends SzMcu {
  static meta = {
    name: 'MC4000', cost: 3, cols: 6, rows: 4, lines: 9,
    regs: ['acc', 'state', 'power'],
    ghost: [70, 84, 62, 78, 55, 80, 66, 48, 72],
    pins: [
      { name: 'x0', type: 'xbus', side: 'left', at: .25 },
      { name: 'p0', type: 'simple', side: 'left', at: .75 },
      { name: 'p1', type: 'simple', side: 'right', at: .25 },
      { name: 'x1', type: 'xbus', side: 'right', at: .75 }
    ],
    sample: '# On for three,\n# off for three:\n  mov 100 p1\n  slp 3\n  mov 0 p1\n  slp 3'
  };
}

class MC4000X extends SzMcu {
  static meta = {
    name: 'MC4000X', cost: 3, cols: 6, rows: 4, lines: 9,
    regs: ['acc', 'state', 'power'],
    ghost: [64, 80, 58, 74, 68, 50, 76, 60, 44],
    pins: [
      { name: 'x0', type: 'xbus', side: 'left', at: .25 },
      { name: 'x1', type: 'xbus', side: 'left', at: .75 },
      { name: 'x2', type: 'xbus', side: 'right', at: .25 },
      { name: 'x3', type: 'xbus', side: 'right', at: .75 }
    ],
    sample: '  slx x0\n  mov x0 acc\n  mov acc x2'
  };
}

class MC6000 extends SzMcu {
  static meta = {
    name: 'MC6000', cost: 5, cols: 6, rows: 6, lines: 14,
    regs: ['acc', 'dat', 'state', 'power'],
    ghost: [72, 60, 84, 55, 78, 66, 50, 80, 62, 74, 58, 68, 46, 76],
    pins: [
      { name: 'x0', type: 'xbus', side: 'left', at: .2 },
      { name: 'x1', type: 'xbus', side: 'left', at: .5 },
      { name: 'p0', type: 'simple', side: 'left', at: .8 },
      { name: 'p1', type: 'simple', side: 'right', at: .2 },
      { name: 'x3', type: 'xbus', side: 'right', at: .5 },
      { name: 'x2', type: 'xbus', side: 'right', at: .8 }
    ],
    sample: '@ mov 50 p1\n  slx x3\n  mov x3 dat\n  mov 13 acc\ni:teq dat 0\n+ mov x0 p1\n- mov x2 p1\n  slp 1\n  sub 1\n  tlt acc 0\n- jmp i'
  };
}

/* ---------- DX300 digital I/O expander ---------------------------------- */
class DX300 extends SzPart {
  static meta = {
    name: 'DX300', cost: 1, cols: 3, rows: 5, bleed: true,
    pins: [
      { name: 'x0', type: 'xbus', side: 'left', at: .2 },
      { name: 'x1', type: 'xbus', side: 'left', at: .5 },
      { name: 'x2', type: 'xbus', side: 'left', at: .8 },
      { name: 'p2', type: 'simple', side: 'right', at: .2 },
      { name: 'p1', type: 'simple', side: 'right', at: .5 },
      { name: 'p0', type: 'simple', side: 'right', at: .8 }
    ]
  };

  bodyHTML() {
    const A = PALETTE.amber;
    /* full-bleed 60 x 100 viewBox == the 3 x 5 footprint, so the three rows
       land exactly on the pins; the artwork is inset inside the viewBox. */
    const rows = [20, 50, 80];
    const flags = rows.map(y => `<path d="M40 ${y - 6} h9 l4 6 -4 6 H40 z"/>`).join('');
    const digits = rows.map(y => `<text x="44.5" y="${y + 3.2}">0</text>`).join('');
    return `<svg class="face" viewBox="0 0 60 100" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="${A}" stroke-width="1.4" stroke-linecap="butt">
        <path d="M0 20 H10 M0 80 H10 M10 20 V80 M0 50 H17"/>
        <path d="M25 50 H34 M34 20 V80 M34 20 H40 M34 80 H40"/>
        <path d="M53 20 H60 M53 50 H60 M53 80 H60"/>
        <path d="M39 37 h3 v-6 h4 v6 h3"/>
        <path d="M39 67 h3 v-6 h4 v6 h3"/>
      </g>
      <circle cx="10" cy="50" r="1.8" fill="${A}"/>
      <rect x="17" y="46" width="8" height="8" fill="${A}"/>
      <g fill="${A}">${flags}</g>
      <g fill="${PALETTE.ink}" font-family="monospace" font-size="8.5" font-weight="700"
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
  static meta = {
    name: 'I/O', cost: 0, cols: 2, rows: 2,
    pins: [{ name: 'io', type: 'simple', side: 'right', at: .5 }]
  };

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
    return `<div class="face-label"><b>${esc(this.getAttribute('label') || 'io')}</b></div>`;
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

const MEMORY_PINS = [
  { name: 'a0', type: 'xbus', side: 'left', at: .25 },
  { name: 'd0', type: 'xbus', side: 'left', at: .75 },
  { name: 'd1', type: 'xbus', side: 'right', at: .25 },
  { name: 'a1', type: 'xbus', side: 'right', at: .75 }
];

class P100P14 extends SzMemory {
  static meta = { name: '100P-14', kind: 'RAM', cost: 5, cols: 4, rows: 4, pins: MEMORY_PINS };
}

class P200P14 extends SzMemory {
  static meta = { name: '200P-14', kind: 'ROM', cost: 5, cols: 4, rows: 4, pins: MEMORY_PINS };
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

const gatePins = (inputs) => [
  ...(inputs === 1
    ? [{ name: 'a', type: 'simple', side: 'left', at: .5 }]
    : [{ name: 'a', type: 'simple', side: 'left', at: .25 },
       { name: 'b', type: 'simple', side: 'left', at: .75 }]),
  { name: 'out', type: 'simple', side: 'right', at: .5 }
];

class LC70G04 extends SzGate {
  static meta = { name: 'LC70G04', op: 'NOT', cost: 1, cols: 2, rows: 2, inputs: 1, pins: gatePins(1) };
}
class LC70G08 extends SzGate {
  static meta = { name: 'LC70G08', op: 'AND', cost: 1, cols: 2, rows: 2, inputs: 2, pins: gatePins(2) };
}
class LC70G32 extends SzGate {
  static meta = { name: 'LC70G32', op: 'OR', cost: 1, cols: 2, rows: 2, inputs: 2, pins: gatePins(2) };
}
class LC70G86 extends SzGate {
  static meta = { name: 'LC70G86', op: 'XOR', cost: 1, cols: 2, rows: 2, inputs: 2, pins: gatePins(2) };
}

/* ---------- board ------------------------------------------------------- */
const BOARD_CSS = `
circuit-board {
  --cell: 40px;
  --mono: ui-monospace, "SF Mono", "Roboto Mono", Menlo, Consolas, monospace;
  position: relative;
  display: block;
  overflow: auto;
  touch-action: pan-x pan-y;
  background-color: #0b1114;
  background-image:
    linear-gradient(45deg, rgba(52,116,106,.20) 25%, transparent 25%, transparent 75%, rgba(52,116,106,.20) 75%),
    linear-gradient(45deg, rgba(52,116,106,.20) 25%, transparent 25%, transparent 75%, rgba(52,116,106,.20) 75%);
  background-size: 4px 4px, 4px 4px;
  background-position: 0 0, 2px 2px;
  box-shadow: inset 0 0 70px rgba(0,0,0,.75);
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
circuit-board g.wire:hover .w-body { stroke: ${PALETTE.amber}; }
circuit-board path.draft { stroke: ${PALETTE.amber}; stroke-width: 2; stroke-dasharray: 5 4; fill: none; }
circuit-board .toast {
  position: absolute;
  left: 50%; bottom: 12px;
  transform: translateX(-50%);
  z-index: 60;
  padding: 6px 12px;
  border: 1px solid #7a2f27;
  border-radius: 3px;
  background: #2a1614;
  color: #f0a598;
  font: 500 12px/1.3 var(--mono);
  pointer-events: none;
  opacity: 0;
  transition: opacity .18s;
}
circuit-board .toast[open] { opacity: 1; }
@media (prefers-reduced-motion: reduce) { circuit-board .toast { transition: none; } }
`;

/* conductor stack, outermost first: [class, width factor, colour] */
const RIBBON = [
  ['w-case', 1.00, '#0a0f13'],
  ['w-body', 0.86, PALETTE.metal],
  ['w-groove', 0.52, '#78838c'],
  ['w-core', 0.20, '#cfd8de']
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

  addPart(tag, x = 1, y = 1) {
    const el = document.createElement(tag);
    el.setAttribute('x', x);
    el.setAttribute('y', y);
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
    this.drawWire(wire);
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

  drawWire(wire) {
    const cell = this.cell;
    const a = this._anchor(wire.a.pin);
    const b = this._anchor(wire.b.pin);
    const d = routeOrthogonal(a, b, cell);
    const gauge = Math.max(7, cell * 0.2);

    wire.layers.forEach((p, i) => {
      p.setAttribute('d', d);
      p.setAttribute('stroke', RIBBON[i][2]);
      p.setAttribute('stroke-width', (gauge * RIBBON[i][1]).toFixed(2));
    });
    wire.hit.setAttribute('d', d);
    wire.hit.setAttribute('stroke-width', gauge + 8);

    const stub = Math.max(4, cell * 0.13);
    [[a, wire.ends[0]], [b, wire.ends[1]]].forEach(([pt, el]) => {
      el.setAttribute('d', `M${pt.x} ${pt.y} H${pt.x + pt.dir * stub}`);
      el.setAttribute('stroke', '#1a2229');
      el.setAttribute('stroke-width', (gauge * 1.3).toFixed(2));
    });
  }

  redrawWires() { this.wires.forEach(w => this.drawWire(w)); }

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
      parts: parts.map(p => ({
        tag: p.tagName.toLowerCase(),
        x: Number(p.getAttribute('x')) || 0,
        y: Number(p.getAttribute('y')) || 0,
        code: p.getAttribute('code') || ''
      })),
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
      const el = this.addPart(p.tag, p.x, p.y);
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

/** Right-angled ribbon route between two pin anchors. */
function routeOrthogonal(a, b, cell) {
  const out = Math.max(10, cell * 0.4);
  const ax = a.x + a.dir * out;
  const bx = b.x + b.dir * out;
  const facing = (a.dir === 1 && b.dir === -1 && bx > ax) || (a.dir === -1 && b.dir === 1 && ax > bx);
  if (facing) {
    const mid = Math.round((ax + bx) / 2);
    return `M${a.x} ${a.y} H${mid} V${b.y} H${b.x}`;
  }
  const lane = Math.round(Math.max(a.y, b.y) + cell * 0.9);
  return `M${a.x} ${a.y} H${ax} V${lane} H${bx} V${b.y} H${b.x}`;
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

export {
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
  PALETTE,
  highlight,
  routeOrthogonal,
};
