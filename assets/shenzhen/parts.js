/* =========================================================================
   Part metadata, with no DOM in sight.

   components.js renders these and sim.js executes them, so the pin lists have
   to agree. Keeping the data here means there is one copy rather than two that
   drift, and it lets the simulator be tested under plain Node.

   pins: name, type ('xbus' | 'simple'), side ('left' | 'right'), at (0..1)
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
