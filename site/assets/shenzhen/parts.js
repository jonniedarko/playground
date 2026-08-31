/* =========================================================================
   Part metadata, with no DOM in sight.

   components.js renders these and sim.js executes them, so the pin lists have
   to agree. Keeping the data here means there is one copy rather than two that
   drift, and it lets the simulator be tested under plain Node.

   pins: name, type ('xbus' | 'simple' | 'nc'), side ('left' | 'right'), at (0..1)

   An 'nc' pin is a real, drawn pin that is not connected to anything inside
   the part. The manual shows them, so the components do too, but nothing may
   wire to one and the simulator never puts one in a net.

   An xbus pin may also carry `blocking: false`. Absent (or true) is today's
   behaviour: a chip reading that pin over the bus with no writer present
   parks until one arrives. `blocking: false` means the *other* side of the
   net — the device wired to that pin — never makes a reader wait: with no
   writer present the read yields -999 at once instead of blocking. No part
   sets this yet; see sim.js's readPin.
   ========================================================================= */

export const PART_META = {
  'mc-4000': {
    name: 'MC4000', cost: 3, cols: 6, rows: 4, lines: 9,
    regs: ['acc', 'state', 'power'],
    ghost: [70, 84, 62, 78, 55, 80, 66, 48, 72],
    pins: [
      { name: 'x0', type: 'xbus', side: 'left', at: 0.25 },
      { name: 'p0', type: 'simple', side: 'left', at: 0.75 },
      { name: 'p1', type: 'simple', side: 'right', at: 0.25 },
      { name: 'x1', type: 'xbus', side: 'right', at: 0.75 },
    ],
    sample: '# On for three,\n# off for three:\n  mov 100 p1\n  slp 3\n  mov 0 p1\n  slp 3',
  },

  'mc-4000x': {
    name: 'MC4000X', cost: 3, cols: 6, rows: 4, lines: 9,
    regs: ['acc', 'state', 'power'],
    ghost: [64, 80, 58, 74, 68, 50, 76, 60, 44],
    pins: [
      { name: 'x0', type: 'xbus', side: 'left', at: 0.25 },
      { name: 'x1', type: 'xbus', side: 'left', at: 0.75 },
      { name: 'x2', type: 'xbus', side: 'right', at: 0.25 },
      { name: 'x3', type: 'xbus', side: 'right', at: 0.75 },
    ],
    sample: '  slx x0\n  mov x0 acc\n  mov acc x2',
  },

  'mc-6000': {
    name: 'MC6000', cost: 5, cols: 6, rows: 6, lines: 14,
    regs: ['acc', 'dat', 'state', 'power'],
    ghost: [72, 60, 84, 55, 78, 66, 50, 80, 62, 74, 58, 68, 46, 76],
    pins: [
      { name: 'x0', type: 'xbus', side: 'left', at: 0.2 },
      { name: 'x1', type: 'xbus', side: 'left', at: 0.5 },
      { name: 'p0', type: 'simple', side: 'left', at: 0.8 },
      { name: 'p1', type: 'simple', side: 'right', at: 0.2 },
      { name: 'x3', type: 'xbus', side: 'right', at: 0.5 },
      { name: 'x2', type: 'xbus', side: 'right', at: 0.8 },
    ],
    sample:
      '@ mov 50 p1\n  slx x3\n  mov x3 dat\n  mov 13 acc\ni:teq dat 0\n+ mov x0 p1\n' +
      '- mov x2 p1\n  slp 1\n  sub 1\n  tlt acc 0\n- jmp i',
  },

  'dx-300': {
    name: 'DX300', cost: 1, cols: 3, rows: 5, bleed: true,
    pins: [
      { name: 'x0', type: 'xbus', side: 'left', at: 0.2 },
      { name: 'x1', type: 'xbus', side: 'left', at: 0.5 },
      { name: 'x2', type: 'xbus', side: 'left', at: 0.8 },
      { name: 'p2', type: 'simple', side: 'right', at: 0.2 },
      { name: 'p1', type: 'simple', side: 'right', at: 0.5 },
      { name: 'p0', type: 'simple', side: 'right', at: 0.8 },
    ],
  },

  'io-terminal': {
    name: 'I/O', cost: 0, cols: 2, rows: 2,
    pins: [{ name: 'io', type: 'simple', side: 'right', at: 0.5 }],
  },

  'p-100p14': {
    name: '100P-14', kind: 'RAM', cost: 5, cols: 4, rows: 4, cells: 14,
    pins: [
      { name: 'a0', type: 'xbus', side: 'left', at: 0.25 },
      { name: 'd0', type: 'xbus', side: 'left', at: 0.75 },
      { name: 'd1', type: 'xbus', side: 'right', at: 0.25 },
      { name: 'a1', type: 'xbus', side: 'right', at: 0.75 },
    ],
  },

  /* ---- parts with a face and pins but no program of their own ----
     Every one of these is a name, a footprint and a pin list, so they are
     built from data rather than a class each. The `kind` is the small line
     under the name on the face. */

  'mc-4010': {
    name: 'MC4010', kind: 'math', cost: 5, cols: 4, rows: 4,
    pins: [
      { name: 'x0', type: 'xbus', side: 'left', at: 0.25 },
      { name: 'x1', type: 'xbus', side: 'left', at: 0.75 },
      { name: 'x2', type: 'xbus', side: 'right', at: 0.25 },
      { name: 'x3', type: 'xbus', side: 'right', at: 0.75 },
    ],
  },

  'dt-2415': {
    name: 'DT2415', kind: 'clock', cost: 5, cols: 3, rows: 3,
    pins: [
      { name: 'nc0', type: 'nc', side: 'left', at: 0.28 },
      { name: 'nc1', type: 'nc', side: 'left', at: 0.72 },
      { name: 'time', type: 'simple', side: 'right', at: 0.5 },
    ],
  },

  'c2s-rf901': {
    name: 'C2S-RF901', kind: 'radio', cost: 6, cols: 4, rows: 3,
    pins: [
      { name: 'receive', type: 'xbus', side: 'left', at: 0.28, blocking: false },
      { name: 'transmit', type: 'xbus', side: 'left', at: 0.72 },
    ],
  },

  'fm-blaster': {
    name: 'FM Blaster', kind: 'sound', cost: 5, cols: 4, rows: 3,
    pins: [
      { name: 'note', type: 'xbus', side: 'left', at: 0.28 },
      { name: 'instrument', type: 'xbus', side: 'left', at: 0.72 },
    ],
  },

  'n4pb-8000': {
    name: 'N4PB-8000', kind: 'buttons', cost: 3, cols: 3, rows: 4,
    pins: [
      { name: 'x0', type: 'xbus', side: 'left', at: 0.25, blocking: false },
      { name: 'x1', type: 'xbus', side: 'left', at: 0.75, blocking: false },
      { name: 'x2', type: 'xbus', side: 'right', at: 0.25, blocking: false },
      { name: 'x3', type: 'xbus', side: 'right', at: 0.75, blocking: false },
    ],
  },

  'lx-700': {
    name: 'LX700', kind: 'display', cost: 4, cols: 3, rows: 3,
    pins: [{ name: 'x0', type: 'xbus', side: 'left', at: 0.5 }],
  },

  'lx-910c': {
    name: 'LX910C', kind: 'LCD', cost: 8, cols: 4, rows: 4,
    pins: [
      { name: 'c0', type: 'xbus', side: 'left', at: 0.2 },
      { name: 't0', type: 'xbus', side: 'left', at: 0.5, blocking: false },
      { name: 'q0', type: 'xbus', side: 'left', at: 0.8 },
    ],
  },

  'd80c010-f': {
    name: 'D80C010-F', kind: 'security', cost: 5, cols: 3, rows: 3,
    pins: [
      { name: 'read0', type: 'xbus', side: 'left', at: 0.5 },
      { name: 'read1', type: 'xbus', side: 'right', at: 0.5 },
    ],
  },

  'kuji-ek1': {
    name: 'KUJI-EK1', kind: 'oracle', cost: 5, cols: 3, rows: 4,
    pins: [
      { name: 'nc0', type: 'nc', side: 'left', at: 0.5 },
      { name: 'button', type: 'simple', side: 'right', at: 0.25 },
      { name: 'oracle', type: 'simple', side: 'right', at: 0.75 },
    ],
  },

  'pga-33x6': {
    name: 'PGA33X6', kind: 'logic array', cost: 8, cols: 4, rows: 5,
    pins: [
      { name: 'i0', type: 'simple', side: 'left', at: 0.2 },
      { name: 'i1', type: 'simple', side: 'left', at: 0.5 },
      { name: 'i2', type: 'simple', side: 'left', at: 0.8 },
      { name: 'o0', type: 'simple', side: 'right', at: 0.2 },
      { name: 'o1', type: 'simple', side: 'right', at: 0.5 },
      { name: 'o2', type: 'simple', side: 'right', at: 0.8 },
    ],
  },

  'nlp-2': {
    name: 'NLP2', kind: 'language', cost: 8, cols: 4, rows: 4,
    pins: [
      { name: 'keywords', type: 'xbus', side: 'left', at: 0.28 },
      { name: 'nc0', type: 'nc', side: 'left', at: 0.72 },
      { name: 'audio', type: 'simple', side: 'right', at: 0.5 },
    ],
  },

  'p-200p14': {
    name: '200P-14', kind: 'ROM', cost: 5, cols: 4, rows: 4, cells: 14, readOnly: true,
    pins: [
      { name: 'a0', type: 'xbus', side: 'left', at: 0.25 },
      { name: 'd0', type: 'xbus', side: 'left', at: 0.75 },
      { name: 'd1', type: 'xbus', side: 'right', at: 0.25 },
      { name: 'a1', type: 'xbus', side: 'right', at: 0.75 },
    ],
  },
}

/** Gate pins: the inverter takes one input, the rest take two. */
const gatePins = (inputs) => [
  ...(inputs === 1
    ? [{ name: 'a', type: 'simple', side: 'left', at: 0.5 }]
    : [
        { name: 'a', type: 'simple', side: 'left', at: 0.25 },
        { name: 'b', type: 'simple', side: 'left', at: 0.75 },
      ]),
  { name: 'out', type: 'simple', side: 'right', at: 0.5 },
]

for (const [tag, name, op, inputs] of [
  ['lc-70g04', 'LC70G04', 'NOT', 1],
  ['lc-70g08', 'LC70G08', 'AND', 2],
  ['lc-70g32', 'LC70G32', 'OR', 2],
  ['lc-70g86', 'LC70G86', 'XOR', 2],
]) {
  PART_META[tag] = { name, op, inputs, cost: 1, cols: 2, rows: 2, pins: gatePins(inputs) }
}

export default PART_META
