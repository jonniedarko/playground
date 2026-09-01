---
title: Specialist parts
description: The one-off components - D80C010-F security chip, KUJI-EK1 oracle engine, PGA33X6 logic array and Raven NLP2.
board: true
order: 11
---

Four parts that each turn up in a single design. They share a page in the binder
because none of them fits a family.

## D80C010-F security key

*Decisive Pty Ltd.*

### Key features

- Stores a unique identification value that can be read over industry-standard
  XBus
- Hardened against reverse engineering, radiation, and electromagnetic pulse
  (EMP) weapons
- Temperature range of -40 °C to +95 °C

### Pin diagram

<div class="chip-figure" data-part="d80c010-f" aria-label="D80C010-F pin layout: two XBus read pins.">
<div class="pinout" role="img" aria-label="D80C010-F pin layout: two XBus read pins.">
<div class="pinout-col"><span class="pin pin-x">read</span></div>
<div class="pinout-chip"><span class="pinout-name">D80C010-F</span></div>
<div class="pinout-col"><span class="pin pin-x">read</span></div>
</div>
</div>

Both pins are read-only XBus and return the same stored identification value.

## KUJI-EK1 "Oracle Engine"

*KU-JI GK Ltd.*

An I Ching divination engine that recreates the traditional yarrow stalk method
in miniature using MEMS technology.

- Includes a built-in piezoelectric generator that converts a user's mechanical
  energy into electrical energy to conduct the divination process.
- **Generates an I Ching hexagram as a stream of 6 digital values over 6 time
  units, starting with the lowermost line.** A value of `100` corresponds to a
  solid line and a value of `0` corresponds to a broken line.
- Contains 50 microscopic precision-milled *Achillea millefolium* stalks.

<div class="chip-figure" data-part="kuji-ek1" aria-label="KUJI-EK1 pin layout: one unconnected pin, a button simple I/O input and an oracle simple I/O output.">
<div class="pinout" role="img" aria-label="KUJI-EK1 pin layout: one unconnected pin, a button simple I/O input and an oracle simple I/O output.">
<div class="pinout-col"><span class="pin pin-nc">N/C</span></div>
<div class="pinout-chip"><span class="pinout-name">KUJI-EK1</span></div>
<div class="pinout-col"><span class="pin pin-s">button</span><span class="pin pin-s">oracle</span></div>
</div>
</div>

| Pin | Type | Purpose |
| --- | --- | --- |
| `button` | Simple I/O | Starts a divination |
| `oracle` | Simple I/O | Six values, one per time unit, bottom line first |

## PGA33X6 programmable logic array

*崇信电子有限公司 (Chongxin Electronics).*

A flexible, powerful logic structure for cases that cannot be solved with
conventional parts or ordinary means.

### Highlights

- **(3)** simple buffered input pins
- **(3)** simple buffered output pins
- **(6)** product-term multiplication columns
- **(1)** set/reset flip-flop with feedback and direct output capability
- Organised as a switchable "sum of products" configuration, mapping inputs to
  outputs arbitrarily
- Can replace hundreds of discrete logic gates

### Pin diagram

<div class="chip-figure" data-part="pga-33x6" aria-label="PGA33X6 pin layout: three simple I/O inputs on the left, three simple I/O outputs on the right.">
<div class="pinout" role="img" aria-label="PGA33X6 pin layout: three simple I/O inputs on the left, three simple I/O outputs on the right.">
<div class="pinout-col"><span class="pin pin-s">i0</span><span class="pin pin-s">i1</span><span class="pin pin-s">i2</span></div>
<div class="pinout-chip"><span class="pinout-name">PGA33X6</span></div>
<div class="pinout-col"><span class="pin pin-s">o0</span><span class="pin pin-s">o1</span><span class="pin pin-s">o2</span></div>
</div>
</div>

> [!WARNING]
> Not suitable for low-power applications.

*PGA33X6DS_R4, 7 December 2021.*

## Raven Dynamics NLP2

*Raven Dynamics - natural language solutions.*

The first widely available implementation of NEME Slice technology. NLP2
references an extensive built-in English language index.

### Key features

- Built-in support for the English language with mapping to a predefined keyword
  set.
- Captures audio using built-in binaural microphones and processes spoken
  keywords as they are detected in the audio stream.
- **Keywords are reported over XBus as pairs of 3-digit values** and are
  buffered through an internal non-blocking buffer that yields `-999` when there
  is nothing to read.
- Raw audio pass-through is available in addition to the keyword stream.

<div class="chip-figure" data-part="nlp-2" aria-label="NLP2 pin layout: keywords XBus output, one unconnected pin, and an audio simple I/O pass-through.">
<div class="pinout" role="img" aria-label="NLP2 pin layout: keywords XBus output, one unconnected pin, and an audio simple I/O pass-through.">
<div class="pinout-col"><span class="pin pin-x">keywords</span><span class="pin pin-nc">N/C</span></div>
<div class="pinout-chip"><span class="pinout-name">NLP2</span></div>
<div class="pinout-col"><span class="pin pin-s">audio</span></div>
</div>
</div>

Words and phrases are hashed into a six-digit number delivered as two 3-digit
XBus values. For example, "Raven" hashes to `271 390` and "Dynamics" to
`109 874`. A working list of hashes appears in
[the TV keyword list](/shenzhen-io/supplemental/tv-keywords/).
