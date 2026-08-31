---
title: FM Blaster sound module
description: FM/iX tone generator - one voice, ten preset instruments, MIDI-style note numbers.
board: true
order: 9
---

*FM/iX Sound Module - FM Blaster, Mountleaf Sound Concepts*

## Description

The FM/iX FM Blaster is a versatile FM-based tone generator applicable to a
diverse set of devices from PC-compatible sound cards to video game consoles to
consumer keyboards.

## Features

- **1 voice of polyphony** - a new note or instrument change will stop the
  current note.
- **10 preset instruments** with built-in envelopes.
- Industry standard tuning (equal temperament).
- Includes bass drum and snare/hihat combination.

## Pin configuration

<div class="chip-figure" data-part="fm-blaster" aria-label="FM Blaster pin layout: a note input pin and an instrument input pin.">
<div class="pinout" role="img" aria-label="FM Blaster pin layout: a note input pin and an instrument input pin.">
<div class="pinout-col"><span class="pin pin-x">note</span><span class="pin pin-x">instrument</span></div>
<div class="pinout-chip"><span class="pinout-name">FM Blaster</span></div>
<div class="pinout-col"></div>
</div>
</div>

| Pin | Purpose |
| --- | --- |
| `note` | The note number to play |
| `instrument` | Which of the ten presets to use |

## Instrument list

| Code | Instrument | Code | Instrument |
| --- | --- | --- | --- |
| 00 | Harpsiclav | 05 | Bellrimba |
| 01 | Plucktar | 06 | Reso Strings |
| 02 | Tines | 07 | Glass Pad |
| 03 | Hollow Bass | 08 | Hi-Snare |
| 04 | Rubber Bass | 09 | Bass Drum |

## Note values

Notes are numbered chromatically in the usual MIDI fashion. The white keys of
the printed keyboard run:

```text
36 38 40 41 43 45 47 48 50 52 53 55 57 59 60 62 64 65 67 69 71 72 74 76 77 79
81 83 84 86 88 89 91 93 95 96
```

and the black keys interleave:

```text
37 39 42 44 46 49 51 54 56 58 61 63 66 68 70 73 75 78 80 82 85 87 90 92 94
```

**Middle C is note 60.** Adding 12 raises a note by one octave.
