---
title: Memory - 100P-14 and 200P-14
description: Pingda RAM and ROM - fourteen cells, two auto-incrementing pointers.
board: true
order: 5
---

Both Pingda memory parts share the same interface: two independent, auto-
incrementing pointers, each with an address pin and a data pin.

## 100P-14 random-access memory

*Pingda Co. Ltd. - PD_VM_100 Datasheet, Rev 3, Mar 2020*

100P-14 random-access memory offers embedded system engineers additional storage
for today's increasingly data-driven world with a whopping fourteen memory
cells. With its convenient auto-increment feature, you won't have to waste
precious registers keeping track of memory addresses.

### Features

- **(14)** random-access memory cells
- **(2)** independent, auto-incrementing memory pointers

### Usage

- All memory cells initialize to a value of `0`.
- All memory pointers initialize to point at the first memory cell (address 0).
- Memory pointers can be **read and written** over XBus with the `a0` and `a1`
  address pins.
- Memory values referenced by pointers can be **read and written** over XBus
  with the `d0` and `d1` data pins.
- After reading from or writing to a data pin, the corresponding memory pointer
  will automatically increment to the next memory location.

### Pin configuration

<div class="chip-figure" data-part="p-100p14" data-code="" aria-label="100P-14 pin layout. Left side: a0 address, d0 data. Right side: d1 data, a1 address. All XBus.">
<div class="pinout" role="img" aria-label="100P-14 pin layout. Left side: a0 address, d0 data. Right side: d1 data, a1 address. All XBus.">
<div class="pinout-col"><span class="pin pin-x">a0</span><span class="pin pin-x">d0</span></div>
<div class="pinout-chip"><span class="pinout-name">100P-14</span></div>
<div class="pinout-col"><span class="pin pin-x">d1</span><span class="pin pin-x">a1</span></div>
</div>
</div>

### Example circuit: data packet reverser

The reference circuit reads in 3-value packets from `input` and writes them back
out to `output` in reverse order, using a 100P-14 to temporarily store the
values.

<div class="circuit-figure" data-circuit="packet-reverser">
<p>An MC6000 reads three values from <code>input</code> into the 100P-14 through <code>d0</code>, seeks back with <code>a0</code>, then writes them out to <code>output</code> in reverse.</p>
</div>

## 200P-14 read-only memory

*Pingda Co. Ltd. - PD_VM_200 Datasheet, Rev 3, Mar 2020*

200P-14 read-only memory offers embedded system engineers the ability to easily
access up to fourteen factory-programmed memory cells for a wide range of
diverse applications.

### Features

- **(14)** read-access memory cells
- **(2)** independent, auto-incrementing memory pointers

### Usage

- All memory cell values are **set in advance by the design engineer**.
- All memory pointers initialize to point at the first memory cell (address 0).
- Memory pointers can be **read** over XBus with the `a0` and `a1` address pins.
- Memory values referenced by pointers can be **read** over XBus with the `d0`
  and `d1` data pins.
- After reading from a data pin, the corresponding memory pointer will
  automatically increment to the next memory location.

### Pin configuration

<div class="chip-figure" data-part="p-200p14" data-code="" aria-label="200P-14 pin layout. Left side: a0 address, d0 data. Right side: d1 data, a1 address. All XBus.">
<div class="pinout" role="img" aria-label="200P-14 pin layout. Left side: a0 address, d0 data. Right side: d1 data, a1 address. All XBus.">
<div class="pinout-col"><span class="pin pin-x">a0</span><span class="pin pin-x">d0</span></div>
<div class="pinout-chip"><span class="pinout-name">200P-14</span></div>
<div class="pinout-col"><span class="pin pin-x">d1</span><span class="pin pin-x">a1</span></div>
</div>
</div>

### Example circuit: data packet generator

The reference circuit sends a data packet with a predetermined set of values to
`output` every time unit that `trigger` is high.

<div class="circuit-figure" data-circuit="packet-generator">
<p>While <code>trigger</code> is high, an MC6000 reads the factory-programmed values out of the 200P-14 and forwards them to <code>output</code>.</p>
</div>

## Comparing the two

| | 100P-14 | 200P-14 |
| --- | --- | --- |
| Cells | 14 | 14 |
| Cell contents | Initialise to `0` | Set at design time |
| Address pins `a0`/`a1` | Read and write | Read only |
| Data pins `d0`/`d1` | Read and write | Read only |
| Auto-increment on data access | Yes | Yes |

> [!TIP]
> Write to an address pin to seek; read or write a data pin to move. Because
> both pointers increment independently, one can be a write head and the other a
> read head over the same fourteen cells.
