---
title: 'AN268: Two interfaces, limitless possibilities'
description: Simple I/O versus XBus - value ranges, blocking behaviour, and which to reach for.
board: true
order: 1
---

*诚尚Micro Application Note 268 - document CSM_TD_100268*

There are two types of pins on MCxxxx microcontrollers: **simple I/O** and
**XBus**. Note that they are not interoperable, and can only be connected to
another pin of the same type.

## Simple I/O

Simple I/O values are continuous signal levels from **0 to 100**, inclusive.
Simple I/O pins are unmarked.

Simple I/O is used for applications such as connecting a microcontroller to a
simple input - a button, switch or microphone - or a simple output, such as an
LED, a speaker or a motor.

## XBus

XBus values are discrete data packets from **-999 to 999**, inclusive. XBus pins
are marked with a yellow dot.

XBus is commonly used to transmit data between two microcontrollers, or between
a microcontroller and a complex input or output such as a keypad or a numeric
display.

## Simple I/O vs. XBus behavior

Simple I/O pins can be read or written **at any time**, with no regard to the
state of connected devices.

XBus, however, is a **synchronized protocol**. Data over XBus pins is only
transferred when there is both a reader attempting to read and a writer
attempting to write.

> [!WARNING]
> If a read or write is attempted on an XBus pin without a corresponding
> operation on a connected device, **the operation will block**. The
> microcontroller stops there until the other side shows up.

<div class="circuit-figure" data-circuit="interfaces" data-run>
<p>One MC4000 carrying both kinds: an unmarked simple I/O pin to a switch, and a yellow-dotted XBus pin to a display.</p>
</div>

## At a glance

| | Simple I/O | XBus |
| --- | --- | --- |
| Marking | Unmarked | Yellow dot |
| Value range | 0 to 100 | -999 to 999 |
| Meaning | Continuous signal level | Discrete data packet |
| Timing | Read or write any time | Synchronised; blocks until both sides ready |
| Typical use | Buttons, LEDs, motors, microphones | Chip-to-chip data, keypads, displays |

> [!TIP]
> Because XBus blocks, `slx` exists: it sleeps the chip until a packet is
> available rather than blocking mid-program. A few parts - such as the
> [C2S-RF901 radio](/shenzhen-io/parts/radio/) and the
> [N4PB-8000 button controller](/shenzhen-io/parts/displays-and-inputs/) -
> deliberately break the rule with non-blocking buffers that return `-999` when
> there is nothing to read.
