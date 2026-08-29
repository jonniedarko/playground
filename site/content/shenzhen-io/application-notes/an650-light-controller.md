---
title: 'AN650: Touch-activated light controller'
description: A two-chip reference design showing edge detection, XBus signalling and conditional execution.
order: 3
---

*诚尚Micro Application Note 650 - document CSM_TD_100650*

## Reference design

The following circuit is a reference design for a touch-activated light
controller. When a user touches a capacitive switch, the controller will detect
the rising edge and advance the light to the next intensity level - from off, to
50%, to 100%, and back to off.

The circuit consists of two [MC4000](/shenzhen-io/parts/mc4000/)
microcontrollers that communicate over XBus.

## First microcontroller: edge detection

The first microcontroller reads from the capacitive switch on simple I/O pin
`p0` and sends either a `0` or a `1` over XBus to the second microcontroller
every time unit:

- a value of `0` means that the switch was not touched;
- a value of `1` means that the switch was touched.

By storing the previous reading from the capacitive switch in `acc`, the first
microcontroller can detect a transition from low (`0`) to high (`100`).

## Second microcontroller: state machine

The second microcontroller stores the current state of the light in its `acc`
register. It:

1. waits for an XBus value from the first microcontroller using the `slx`
   instruction;
2. increments `acc` by 50 if the value is `1`;
3. resets `acc` back to `0` when it is incremented past 100.

The resulting value is then used to drive the light using simple I/O pin `p1`.

## What the design demonstrates

| Technique | Where it appears |
| --- | --- |
| Edge detection by keeping the previous sample | First chip, using `acc` as one-sample history |
| Blocking-free XBus waiting | Second chip, using `slx x0` |
| Conditional execution | Both chips, using `+`/`-` after a test |
| Wrapping a counter | Second chip, resetting `acc` past 100 |

> [!TIP]
> The rising-edge trick generalises: keep the last sample in a register, test
> the new one against it, and act only on the transition. Most input-handling
> puzzles want an edge, not a level.
