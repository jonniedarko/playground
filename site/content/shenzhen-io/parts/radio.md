---
title: C2S-RF901 radio
description: Chennai Comms wireless transceiver with a non-blocking receive buffer.
order: 8
---

*Chennai Comms Solutions - C2S-RF901*

## Description

A low-power RF transceiver with a built-in antenna and auto-sensing RF switch,
the C2S-RF901 sends and receives data over a reliable wireless link using a dual
XBus connection.

## Non-blocking buffer

All data received is passed through an internal non-blocking buffer.

> [!WARNING]
> Reading from the C2S-RF901 when no data is available yields a value of
> **`-999`** instead of blocking until data arrives, which is the usual
> [XBus behaviour](/shenzhen-io/application-notes/an268-interfaces/). Your
> program must check for `-999` rather than assuming every read produced a real
> packet.

## Pin configuration

Transmit and receive pins are located on the same side of the part, so the
component does not have to be rotated awkwardly to fit a design.

<div class="pinout" role="img" aria-label="C2S-RF901 pin layout: receive and transmit XBus pins, both on the same side.">
<div class="pinout-col"><span class="pin pin-x">receive</span><span class="pin pin-x">transmit</span></div>
<div class="pinout-chip"><span class="pinout-name">C2S-RF901</span></div>
<div class="pinout-col"></div>
</div>

| Pin | Type | Direction |
| --- | --- | --- |
| `receive` | XBus | Read; yields `-999` when the buffer is empty |
| `transmit` | XBus | Write |

## Usage pattern

Because reads never block, a radio receiver is usually polled once per time unit
and the `-999` sentinel filtered out:

```asm
  mov x0 acc      # read from receive; -999 if nothing arrived
  teq acc -999
- mov acc x1      # only forward real packets
  slp 1
```
