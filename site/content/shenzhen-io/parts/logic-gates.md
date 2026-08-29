---
title: LC70Gxx logic gates
description: The Logic Company's inverter, AND, OR and XOR gates for simple I/O.
order: 6
---

*The Logic Company - LC70G04 / LC70G08 / LC70G32 / LC70G86*

## Description

We could all use a little more logic in our lives. The LC70Gxx logic gate family
offers that bit of extra logic you've been wanting - and for not a lot of money.

- **LC70G04** is a one-input, one-output inverter.
- **LC70G08** is a two-input, one-output AND gate.
- **LC70G32** is a two-input, one-output OR gate.
- **LC70G86** is a two-input, one-output XOR gate.

## Signal thresholds

> [!WARNING]
> When measuring inputs, signals **less than 50** are interpreted as "off",
> while signals **greater than or equal to 50** are interpreted as "on".

This threshold matters when a gate is fed anything other than a clean `0` or
`100` - a partially dimmed light or an averaged sensor reading will be rounded
to a logic level at 50.

## Pin locations

The two-input gates take `input A` and `input B` on one side and produce
`output` on the other. The inverter is a smaller part with a single input and a
single output. All pins are simple I/O.

<div class="pinout" role="img" aria-label="LC70G08, G32 and G86 pin layout: input A and input B on the left, output on the right. All simple I/O.">
<div class="pinout-col"><span class="pin pin-s">in A</span><span class="pin pin-s">in B</span></div>
<div class="pinout-chip"><span class="pinout-name">LC70G08 / G32 / G86</span></div>
<div class="pinout-col"><span class="pin pin-s">out</span></div>
</div>

<div class="pinout" role="img" aria-label="LC70G04 inverter pin layout: one simple I/O input on the left, one inverted simple I/O output on the right.">
<div class="pinout-col"><span class="pin pin-s">in A</span></div>
<div class="pinout-chip"><span class="pinout-name">LC70G04</span></div>
<div class="pinout-col"><span class="pin pin-s">out</span></div>
</div>

## Output table

| A | B | Inverter LC70G04 | AND LC70G08 | OR LC70G32 | XOR LC70G86 |
| --- | --- | --- | --- | --- | --- |
| 0 | 0 | 1 | 0 | 0 | 0 |
| 0 | 1 | 1 | 0 | 1 | 1 |
| 1 | 0 | 0 | 0 | 1 | 1 |
| 1 | 1 | 0 | 1 | 1 | 0 |

The inverter's output depends only on A.

> [!TIP]
> A gate costs no program memory and no power, so pushing a boolean operation
> off the microcontroller and into an LC70Gxx is often cheaper than the two or
> three lines it would take in code - as long as you have the board space.
