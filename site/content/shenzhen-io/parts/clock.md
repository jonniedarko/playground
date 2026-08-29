---
title: DT2415 incremental clock
description: Denver Timekeeping's real-time clock - emits the number of 15-minute increments since midnight.
order: 7
---

*Denver Timekeeping - DT2415 Incremental Clock*

## Key features

- Emits a simple I/O signal that corresponds to the number of 15-minute
  increments since midnight.
- Includes a built-in backup battery so that the time is kept, even when power
  is not available.

## Pin configuration

<div class="pinout" role="img" aria-label="DT2415 pin layout: two unconnected pins on the left, one time index simple I/O output on the right.">
<div class="pinout-col"><span class="pin pin-nc">N/C</span><span class="pin pin-nc">N/C</span></div>
<div class="pinout-chip"><span class="pinout-name">DT2415</span></div>
<div class="pinout-col"><span class="pin pin-s">time index</span></div>
</div>

| Pin | Type | Purpose |
| --- | --- | --- |
| `time index` | Simple I/O | Current 15-minute index, 0 to 95 |
| Two pins | - | Not connected |

## Example output

| Time | 00:00-00:14 | 00:15-00:29 | 00:30-00:44 | 00:45-00:59 | ... | 23:45-23:59 |
| --- | --- | --- | --- | --- | --- | --- |
| Index | 0 | 1 | 2 | 3 | ... | 95 |

> [!NOTE]
> The index runs 0 to 95, which is inside the simple I/O range of 0 to 100 but
> not a percentage. Treat it as a number, not a signal level.

## The Denver Timekeeping story

When Denver Timekeeping founders Chad and Becca set up their small-batch chip
fab in the mountain town of Denver, Colorado, there were many who were dubious,
to say the least. "You can't manufacture in America anymore," they said. "It's
too expensive, and hasn't all that expertise left the country anyhow?"

But Chad and Becca persistently stuck to their vision of inexpensive, reliable,
and American-made timekeeping chips manufactured the old way. Made in the cool
air and with the pure water of the Rocky Mountains, this real-time clock
includes a backup battery that ensures the time is kept even when power is not -
a must-have for ruggedized devices.
