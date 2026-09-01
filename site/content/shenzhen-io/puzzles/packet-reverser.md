---
title: Packet reverser
description: Store three XBus values in a 100P-14 and write them back out in reverse order.
board: true
wide: true
order: 3
icon: 🔃
---

## The brief

From the [100P-14 datasheet](/shenzhen-io/parts/memory/):

> The reference circuit reads in 3-value packets from `input` and writes
> them back out to `output` in reverse order, using a 100P-14 to temporarily
> store the values.

The 100P-14's own usage section is what makes that possible: writing to a
data pin auto-increments its pointer, and the pointer itself can be written
to seek.

> Memory pointers can be **read and written** over XBus with the `a0` and
> `a1` address pins. Memory values referenced by pointers can be **read and
> written** over XBus with the `d0` and `d1` data pins. After reading from or
> writing to a data pin, the corresponding memory pointer will automatically
> increment to the next memory location.

That shapes the puzzle: write the three incoming values in, seek the pointer
back to the start, then read them out. Reading forward from address 0 gives
back the order they went in, over `output`, not reversed - reversing means
choosing a different read order, not just reading forward.

## Parts allowed

One MC6000, one 100P-14.

<div class="chip-figure" data-part="mc-6000" aria-label="MC6000 pin layout. Left side, top to bottom: x0 XBus, x1 XBus, p0 simple I/O. Right side, top to bottom: p1 simple I/O, x3 XBus, x2 XBus.">
<div class="pinout" role="img" aria-label="MC6000 pin layout. Left side, top to bottom: x0 XBus, x1 XBus, p0 simple I/O. Right side, top to bottom: p1 simple I/O, x3 XBus, x2 XBus.">
<div class="pinout-col"><span class="pin pin-x">x0</span><span class="pin pin-x">x1</span><span class="pin pin-s">p0</span></div>
<div class="pinout-chip"><span class="pinout-name">MC6000</span></div>
<div class="pinout-col"><span class="pin pin-s">p1</span><span class="pin pin-x">x3</span><span class="pin pin-x">x2</span></div>
</div>
</div>

<div class="chip-figure" data-part="p-100p14" data-code="" aria-label="100P-14 pin layout. Left side: a0 address, d0 data. Right side: d1 data, a1 address. All XBus.">
<div class="pinout" role="img" aria-label="100P-14 pin layout. Left side: a0 address, d0 data. Right side: d1 data, a1 address. All XBus.">
<div class="pinout-col"><span class="pin pin-x">a0</span><span class="pin pin-x">d0</span></div>
<div class="pinout-chip"><span class="pinout-name">100P-14</span></div>
<div class="pinout-col"><span class="pin pin-x">d1</span><span class="pin pin-x">a1</span></div>
</div>
</div>

| Part | Count | Datasheet |
| --- | --- | --- |
| MC6000 | 1 | [MC6000](/shenzhen-io/parts/mc6000/) |
| 100P-14 | 1 | [100P-14 / 200P-14](/shenzhen-io/parts/memory/) |

## Inputs and outputs

| Terminal | Direction | Type |
| --- | --- | --- |
| `input` | input | XBus |
| `output` | output | XBus |

## What a correct circuit must do

The manual states the *behaviour* - reverse order - not a specific set of
numbers. The three values below are the example run the workbench's Verify
button checks a build against: distinguishable values, so a build that
reverses correctly can't be confused with one that doesn't.

| Time unit | input (in) | output (expected) |
| --- | --- | --- |
| 0 | 11 | - |
| 1 | 22 | - |
| 2 | 33 | 11 |

Only the last time unit's `output` is asserted firmly. `output` is written
partway through the run - which unit exactly is an implementation detail -
so the earlier cells are marked `-`. What's fixed is the end state once the
whole pass has run: `output` must be showing `11`, the *first* value fed in,
because reversal means it was the *last* one written, and a terminal holds
whatever it was last written.

Build it in the [workbench](/shenzhen-io/ide/?puzzle=packet-reverser) - that
link opens an empty board bound to this puzzle, so Verify checks an attempt
against the table above. Stuck? The workbench's own **Reveal** button loads
the finished circuit; it is also on the [100P-14 page](/shenzhen-io/parts/memory/)
itself.
