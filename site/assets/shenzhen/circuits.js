/* =========================================================================
   Reference circuits from the manual, as data.

   Each entry is what a documentation figure needs to draw itself: the parts,
   where they sit on the grid, the programs they run, and the wires between
   them. Keeping them here rather than in the markdown means the content stays
   readable, and the same definitions can seed the emulator later.

   Coordinates are grid cells. A wire endpoint is "<part index>:<pin name>".
   ========================================================================= */

/** Touch-activated light controller - Application Note 650. */
const an650 = {
  cell: 30,
  label:
    'Touch-activated light controller: a capacitive switch into an MC4000 that ' +
    'detects the rising edge, sending 0 or 1 over XBus to a second MC4000 that ' +
    'steps the lamp through off, 50% and 100%.',
  parts: [
    { t: 'io-terminal', x: 0, y: 2, label: 'switch', type: 'simple', side: 'right' },
    {
      t: 'mc-4000', x: 3, y: 1,
      code: [
        '# rising edge?',
        '  teq acc 0',
        '+ teq p0 100',
        '+ mov 1 x1',
        '- mov 0 x1',
        '  mov p0 acc',
        '  slp 1',
      ].join('\n'),
    },
    {
      t: 'mc-4000', x: 11, y: 1,
      code: [
        '  slx x0',
        '  teq x0 1',
        '+ add 50',
        '  tgt acc 100',
        '+ mov 0 acc',
        '  mov acc p1',
      ].join('\n'),
    },
    { t: 'io-terminal', x: 18, y: 2, label: 'lamp', type: 'simple', side: 'left' },
  ],
  wires: [
    ['0:switch', '1:p0'],
    ['1:x1', '2:x0'],
    ['2:p1', '3:lamp'],
  ],
}

/** Stepper motor controller - the DX300 datasheet's example circuit. */
const dx300Stepper = {
  cell: 28,
  label:
    'Stepper motor controller: an MC6000 driving motor-3 directly on p0 and the ' +
    'other three motor signals through a DX300 digital I/O expander over XBus.',
  parts: [
    {
      t: 'mc-6000', x: 1, y: 1,
      code: [
        '  mov 100 x0',
        '  mov 100 p0',
        '  slp 1',
        '  mov 10 x0',
        '  mov 0 p0',
        '  slp 1',
      ].join('\n'),
    },
    { t: 'dx-300', x: 9, y: 1 },
    { t: 'io-terminal', x: 14, y: 0, label: 'motor-2', type: 'simple', side: 'left' },
    { t: 'io-terminal', x: 14, y: 2, label: 'motor-1', type: 'simple', side: 'left' },
    { t: 'io-terminal', x: 14, y: 4, label: 'motor-0', type: 'simple', side: 'left' },
    { t: 'io-terminal', x: 1, y: 8, label: 'motor-3', type: 'simple', side: 'left' },
  ],
  wires: [
    ['0:x0', '1:x0'],
    ['1:p2', '2:motor-2'],
    ['1:p1', '3:motor-1'],
    ['1:p0', '4:motor-0'],
    ['0:p0', '5:motor-3'],
  ],
}

/** Data packet reverser - the 100P-14 datasheet's example circuit. */
const packetReverser = {
  cell: 28,
  label:
    'Data packet reverser: an MC6000 reading three-value packets from input, ' +
    'storing them in a 100P-14 RAM, then writing them back out to output in ' +
    'reverse order.',
  parts: [
    { t: 'io-terminal', x: 0, y: 2, label: 'input', type: 'xbus', side: 'right' },
    {
      t: 'mc-6000', x: 3, y: 0,
      // x3 is wired to the memory's a0, x2 to its d0 - the chip has no a0/d0
      // of its own. Store three values, then seek back and read them out.
      code: [
        '  mov 0 x3',
        '  mov x0 x2',
        '  mov x0 x2',
        '  mov x0 x2',
        '  mov 2 x3',
        '  mov x2 x1',
        '  mov 1 x3',
        '  mov x2 x1',
        '  mov 0 x3',
        '  mov x2 x1',
      ].join('\n'),
    },
    { t: 'p-100p14', x: 11, y: 1 },
    { t: 'io-terminal', x: 16, y: 2, label: 'output', type: 'xbus', side: 'left' },
  ],
  wires: [
    ['0:input', '1:x0'],
    ['1:x3', '2:a0'],
    ['1:x2', '2:d0'],
    ['1:x1', '3:output'],
  ],
}

/** Data packet generator - the 200P-14 datasheet's example circuit. */
const packetGenerator = {
  cell: 28,
  label:
    'Data packet generator: an MC6000 that, on every time unit the trigger is ' +
    'high, reads a predetermined set of values from a 200P-14 ROM and sends ' +
    'them to output.',
  parts: [
    { t: 'io-terminal', x: 0, y: 2, label: 'trigger', type: 'simple', side: 'right' },
    {
      t: 'mc-6000', x: 3, y: 0,
      // x3 addresses the ROM, x2 reads it; the chip has no a0/d0 of its own.
      code: [
        '  tgt p0 50',
        '+ mov 0 x3',
        '+ mov x2 x1',
        '+ mov x2 x1',
        '+ mov x2 x1',
        '  slp 1',
      ].join('\n'),
    },
    { t: 'p-200p14', x: 11, y: 1 },
    { t: 'io-terminal', x: 16, y: 2, label: 'output', type: 'xbus', side: 'left' },
  ],
  wires: [
    ['0:trigger', '1:p0'],
    ['1:x3', '2:a0'],
    ['1:x2', '2:d0'],
    ['1:x1', '3:output'],
  ],
}

/** The four LC70Gxx gates side by side, as a pinout figure. */
const logicGates = {
  cell: 34,
  label:
    'The LC70Gxx family: LC70G04 inverter with one input, and the LC70G08 AND, ' +
    'LC70G32 OR and LC70G86 XOR gates with two inputs each. All pins are simple I/O.',
  parts: [
    { t: 'lc-70g04', x: 1, y: 0 },
    { t: 'lc-70g08', x: 5, y: 0 },
    { t: 'lc-70g32', x: 9, y: 0 },
    { t: 'lc-70g86', x: 13, y: 0 },
  ],
  wires: [],
}


/** Square wave generator - Application Note 393, and quick start example 1. */
const blink = {
  cell: 30,
  label:
    'Square wave generator: one MC4000 driving a lamp on p1, on for three time ' +
    'units and off for three.',
  parts: [
    {
      t: 'mc-4000', x: 0, y: 0,
      code: ['  mov 100 p1', '  slp 3', '  mov 0 p1', '  slp 3'].join('\n'),
    },
    { t: 'io-terminal', x: 8, y: 1, label: 'lamp', type: 'simple', side: 'left' },
  ],
  wires: [['0:p1', '1:lamp']],
}

/** Quick start example 2: drive an output from an input through a threshold. */
const buttonLamp = {
  cell: 30,
  label:
    'Reacting to an input: an MC4000 tests a button on p0 against the halfway ' +
    'threshold and drives the lamp on p1 from the result.',
  parts: [
    { t: 'io-terminal', x: 0, y: 1, label: 'button', type: 'simple', side: 'right' },
    {
      t: 'mc-4000', x: 3, y: 0,
      code: ['  tgt p0 50', '+ mov 100 p1', '- mov 0 p1', '  slp 1'].join('\n'),
    },
    { t: 'io-terminal', x: 11, y: 1, label: 'lamp', type: 'simple', side: 'left' },
  ],
  wires: [['0:button', '1:p0'], ['1:p1', '2:lamp']],
}

/** Quick start example 3: two chips synchronising over XBus. */
const xbusPair = {
  cell: 28,
  label:
    'Two chips over XBus: the sender reads a sensor and offers the value on x0; ' +
    'the receiver sleeps on slx until it arrives, then drives the lamp.',
  parts: [
    { t: 'io-terminal', x: 0, y: 1, label: 'sensor', type: 'simple', side: 'right' },
    { t: 'mc-4000', x: 3, y: 0, code: ['  mov p0 x0', '  slp 1'].join('\n') },
    { t: 'mc-4000', x: 11, y: 0, code: ['  slx x0', '  mov x0 p1'].join('\n') },
    { t: 'io-terminal', x: 19, y: 1, label: 'lamp', type: 'simple', side: 'left' },
  ],
  wires: [['0:sensor', '1:p0'], ['1:x0', '2:x0'], ['2:p1', '3:lamp']],
}

/** AN268: the two pin types, side by side on one chip. */
const interfaces = {
  cell: 30,
  label:
    'The two interfaces on one MC4000: an unmarked simple I/O pin carrying a ' +
    'level from a switch, and a yellow-dotted XBus pin carrying packets to a display.',
  parts: [
    { t: 'io-terminal', x: 0, y: 1, label: 'switch', type: 'simple', side: 'right' },
    { t: 'mc-4000', x: 3, y: 0, code: '' },
    { t: 'io-terminal', x: 11, y: 0, label: 'display', type: 'xbus', side: 'left' },
  ],
  wires: [['0:switch', '1:p0'], ['1:x1', '2:display']],
}

/** The two microcontrollers together, for the register availability table. */
const mcuCompare = {
  cell: 28,
  label:
    'MC4000 and MC6000 side by side: nine lines and acc against fourteen lines, ' +
    'acc and dat, and twice the XBus pins.',
  parts: [
    { t: 'mc-4000', x: 0, y: 1, code: '' },
    { t: 'mc-6000', x: 8, y: 0, code: '' },
  ],
  wires: [],
}

/** Every component the site can draw, as the parts index illustration. */
const catalogue = {
  cell: 26,
  label:
    'The component catalogue: MC4000, MC4000X, MC6000 and MC4010 processors; ' +
    'the DX300 expander, 100P-14 RAM, 200P-14 ROM and a generic I/O terminal; ' +
    'the four LC70Gxx logic gates; and the specialist parts - DT2415 clock, ' +
    'C2S-RF901 radio, FM Blaster, N4PB-8000 buttons, LX700 and LX910C ' +
    'displays, D80C010-F security key, KUJI-EK1 oracle, PGA33X6 logic array ' +
    'and Raven NLP2.',
  // Columns are spaced by footprint plus three cells: a pin's trace label
  // sticks out past the part, so parts packed to their own width collide at
  // the labels rather than at the bodies.
  parts: [
    // The microcontrollers look alike at a glance, so name each one in its own
    // code panel rather than leaving four blank boxes.
    { t: 'mc-4000', x: 0, y: 0, code: '# MC4000\n# 9 lines\n# acc' },
    { t: 'mc-4000x', x: 9, y: 0, code: '# MC4000X\n# XBus only\n# 9 lines' },
    { t: 'mc-6000', x: 18, y: 0, code: '# MC6000\n# 14 lines\n# acc + dat' },

    { t: 'dx-300', x: 0, y: 7 },
    { t: 'p-100p14', x: 6, y: 7 },
    { t: 'p-200p14', x: 13, y: 7 },
    { t: 'io-terminal', x: 20, y: 8, label: 'button', type: 'simple', side: 'right' },

    { t: 'lc-70g04', x: 0, y: 13 },
    { t: 'lc-70g08', x: 5, y: 13 },
    { t: 'lc-70g32', x: 10, y: 13 },
    { t: 'lc-70g86', x: 15, y: 13 },
    { t: 'mc-4010', x: 20, y: 13 },

    { t: 'dt-2415', x: 0, y: 19 },
    { t: 'c2s-rf901', x: 6, y: 19 },
    { t: 'fm-blaster', x: 13, y: 19 },
    { t: 'n4pb-8000', x: 20, y: 19 },

    { t: 'lx-700', x: 0, y: 24 },
    { t: 'lx-910c', x: 6, y: 24 },
    { t: 'd80c010-f', x: 13, y: 24 },
    { t: 'kuji-ek1', x: 19, y: 24 },

    { t: 'pga-33x6', x: 0, y: 30 },
    { t: 'nlp-2', x: 8, y: 30 },
  ],
  wires: [],
}

export const CIRCUITS = {
  an650,
  'dx300-stepper': dx300Stepper,
  'packet-reverser': packetReverser,
  'packet-generator': packetGenerator,
  'logic-gates': logicGates,
  blink,
  'button-lamp': buttonLamp,
  'xbus-pair': xbusPair,
  interfaces,
  'mcu-compare': mcuCompare,
  catalogue,
}

export default CIRCUITS
