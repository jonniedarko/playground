---
title: 'AN393: Make sure to get enough sleep'
description: Why slp is the right way to wait, and how time units relate to instruction count.
board: true
order: 2
---

*诚尚Micro Application Note 393 - document CSM_TD_100393*

- CPUs are typically much faster than the signals they are reading and writing.
- A CPU can execute a very large number of instructions within one time unit.
- To advance to the beginning of the next time unit, a CPU can go to sleep.
- To put a CPU to sleep, use the `slp` instruction and specify the number of
  time units to sleep.

## Why this matters

Time units are the simulation's clock, not the CPU's. Inside a single time unit
a microcontroller can run as many instructions as its program memory allows, so
"waiting" by looping does not advance time - it only burns power.

`slp` is the only way to move the chip forward to the start of a later time
unit, and a sleeping chip consumes no power at all.

## Example circuit: square wave generator

The following program generates a square wave on simple I/O pin `p1` that is on
(`100`) for 3 time units and off (`0`) for 3 time units.

```asm
  mov 100 p1
  slp 3
  mov 0 p1
  slp 3
```

With no `jmp`, the program wraps from the last line back to the first, giving a
continuous six-time-unit period.

<div class="circuit-figure" data-circuit="blink">
<p>An MC4000 driving a lamp on <code>p1</code>: on for three time units, off for three.</p>
</div>

> [!NOTE]
> The listing above is reconstructed from the note's stated behaviour: the
> original page prints the program as a screenshot of the in-game editor rather
> than as selectable text.
