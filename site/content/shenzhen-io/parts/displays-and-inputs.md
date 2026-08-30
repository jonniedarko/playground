---
title: Displays and inputs
description: The PartsPlus+ catalogue page - N4PB-8000 buttons, LX700 numeric display and LX910C custom LCD.
order: 10
---

*PartsPlus+ - "Your source for parts... plus!"*

Three parts share one catalogue page. All three use non-blocking XBus reads that
return `-999` when there is no event waiting.

## N4PB-8000 push-button controller

¥3 each.

- Push-button array controller with support for up to 8 buttons
- 4 non-blocking XBus pins

| Direction | Value | Result |
| --- | --- | --- |
| Read | `[button]` | `[button]` down event |
| Read | `-[button]` | `[button]` up event |
| Read | `-999` | No new button events |

A press produces the button's number; a release produces its negation. Polling
returns `-999` between events.

## LX700 numeric display

*LuX Industry.* ¥4 each.

- 7-segment numerical display with 2.5 digits and bonus minus sign
- Displays the full range of XBus values from -199 to 199

| Direction | Value | Result |
| --- | --- | --- |
| Write | `-199` to `199` | Display the value |
| Write | `-999` | Turn off all segments |

## LX910C custom LCD

*LuX Industry.* ¥8 each.

- Custom-manufactured for your unique application's display needs
- Integrated segment-based touchscreen controller

The part exposes four kinds of pin. `cN` drives segments, `tN` reports touches,
`qN` queries a segment's state, and each is addressed by segment number.

| Pin | Direction | Value | Result |
| --- | --- | --- | --- |
| `cN` | Write | `[segment]` | Turn on `[segment]` |
| `cN` | Write | `-[segment]` | Turn off `[segment]` |
| `cN` | Write | `999` | Turn on all segments |
| `cN` | Write | `-999` | Turn off all segments |
| `tN` | Read | `[segment]` | `[segment]` touch event |
| `tN` | Read | `-[segment]` | `[segment]` release event |
| `tN` | Read | `-999` | No new touch events |
| `qN` | Write / Read | `[segment]` | Query `[segment]` state; the subsequent read yields `1` or `0` depending on whether the segment is on |

> [!NOTE]
> The `qN` pins are used as a pair of operations: write the segment number you
> want to ask about, then read back the `1` or `0` answer.

### Custom display template

A custom LCD is specified by drawing the design and numbering each region, which
is what the segment numbers in the table above refer to. This is the template
from the manual, filled in for a reactor control panel - the same temperature,
power output and control rod readouts the
[Poseidon-779 spec](/shenzhen-io/supplemental/signal-specs/) describes.

![The LuX Industry custom LCD template, filled in for a thorium reactor control panel: compressor, turbine and generator blocks across the top with a power output bar, a coolant loop in the middle, and a thorium salt reactor along the bottom with a temperature bar and five control rod segments.](/assets/img/shenzhen/lux-lcd-template.png)

Reproduced from the manual. No component can draw this one - it is artwork
rather than a circuit.
