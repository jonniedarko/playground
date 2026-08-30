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
      code: [
        '  mov 0 a0',
        '  mov x0 d0',
        '  mov x0 d0',
        '  mov x0 d0',
        '  mov 2 a0',
        '  mov d0 x1',
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
      code: [
        '  tgt p0 50',
        '+ mov 0 a0',
        '+ mov d0 x1',
        '+ mov d0 x1',
        '+ mov d0 x1',
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

export const CIRCUITS = {
  an650,
  'dx300-stepper': dx300Stepper,
  'packet-reverser': packetReverser,
  'packet-generator': packetGenerator,
  'logic-gates': logicGates,
}

export default CIRCUITS
