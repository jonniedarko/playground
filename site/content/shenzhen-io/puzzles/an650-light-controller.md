---
title: AN650 light controller
description: Detect a capacitive switch's rising edge and step a lamp through off, 50% and 100%.
board: true
wide: true
order: 1
icon: 💡
---

## The brief

From [AN650: Touch-activated light controller](/shenzhen-io/application-notes/an650-light-controller/):

> When a user touches a capacitive switch, the controller will detect the
> rising edge and advance the light to the next intensity level - from off,
> to 50%, to 100%, and back to off.

The load-bearing word is *edge*. The same page spells out how the first chip
finds one:

> By storing the previous reading from the capacitive switch in `acc`, the
> first microcontroller can detect a transition from low (`0`) to high
> (`100`).

That is a comparison against the previous reading, not a read of the current
level. A build that just watches the switch and advances the lamp whenever it
reads high will keep climbing for as long as a touch is held, which is not
what the brief asks for: one touch, one step, however long it is held.

## Parts allowed

From the same page:

> The circuit consists of two MC4000 microcontrollers that communicate over
> XBus.

<div class="chip-figure" data-part="mc-4000" aria-label="MC4000 pin layout. Left side, top to bottom: x0 XBus, p0 simple I/O. Right side, top to bottom: p1 simple I/O, x1 XBus.">
<div class="pinout" role="img" aria-label="MC4000 pin layout. Left side, top to bottom: x0 XBus, p0 simple I/O. Right side, top to bottom: p1 simple I/O, x1 XBus.">
<div class="pinout-col"><span class="pin pin-x">x0</span><span class="pin pin-s">p0</span></div>
<div class="pinout-chip"><span class="pinout-name">MC4000</span></div>
<div class="pinout-col"><span class="pin pin-s">p1</span><span class="pin pin-x">x1</span></div>
</div>
</div>

| Part | Count | Datasheet |
| --- | --- | --- |
| MC4000 | 2 | [MC4000](/shenzhen-io/parts/mc4000/) |

## Inputs and outputs

| Terminal | Direction | Type | Values |
| --- | --- | --- | --- |
| `switch` | input | simple I/O | `0` untouched, `100` touched |
| `lamp` | output | simple I/O | `0` off, `50` half, `100` full |

## What a correct circuit must do

`switch` is touched three times below, each held for six time units with five
units released in between. This is the timeline the workbench's Verify
button checks a build against.

A `-` marks a time unit the brief doesn't pin to an exact instant - it falls
inside the first few units of a touch, while the edge is still being
detected. Every other cell is exact, including the runs of repeated values
while a touch is held: `lamp` must sit still there, not keep advancing.

| Time unit | switch (in) | lamp (expected) |
| --- | --- | --- |
| 0 | 0 | 0 |
| 1 | 0 | 0 |
| 2 | 0 | 0 |
| 3 | 100 | - |
| 4 | 100 | - |
| 5 | 100 | - |
| 6 | 100 | 50 |
| 7 | 100 | 50 |
| 8 | 100 | 50 |
| 9 | 0 | 50 |
| 10 | 0 | 50 |
| 11 | 0 | 50 |
| 12 | 0 | 50 |
| 13 | 0 | 50 |
| 14 | 100 | - |
| 15 | 100 | - |
| 16 | 100 | - |
| 17 | 100 | 100 |
| 18 | 100 | 100 |
| 19 | 100 | 100 |
| 20 | 0 | 100 |
| 21 | 0 | 100 |
| 22 | 0 | 100 |
| 23 | 0 | 100 |
| 24 | 0 | 100 |
| 25 | 100 | - |
| 26 | 100 | - |
| 27 | 100 | - |
| 28 | 100 | 0 |
| 29 | 100 | 0 |
| 30 | 100 | 0 |

The third touch wraps `100` back to `0` - the brief's own "and back to off".

Build it in the [workbench](/shenzhen-io/ide/). The finished reference
circuit is on the [AN650 page](/shenzhen-io/application-notes/an650-light-controller/)
itself.
