---
title: Registers
description: acc, dat, the pin registers and null - what each one does and which chips have them.
board: true
order: 2
---

Registers are used as sources and destinations for data manipulated by MCxxxx
instructions. The set of registers varies between MCxxxx models.

> [!WARNING]
> It is an error to use a register in a microcontroller program if that register
> is not present on that microcontroller. Check the
> [datasheet](/shenzhen-io/parts/) for the chip you are programming.

## acc

`acc` is the primary general-purpose register used for internal computation on
MCxxxx family microcontrollers. All arithmetic operations implicitly use and
modify the value of `acc`.

## dat

`dat` is a second register available on some MCxxxx family members. It can be
used in most contexts where `acc` is permitted.

The internal registers of MCxxxx microprocessors (`acc` and `dat`, if
available) are initialized to the value `0`.

## Pin registers

The pin registers (`p0`, `p1`, `x0`, `x1`, `x2`, `x3`) are used when reading
from or writing to the pins of MCxxxx microcontrollers. Reading and writing
through the pins allows a single MCxxxx microcontroller to communicate and
coordinate with other connected, compatible devices.

Each pin on an MCxxxx family microcontroller functions as either a simple I/O or
XBus interface. Refer to the appropriate datasheet for details on pin
functionality, and to
[Application Note 268](/shenzhen-io/application-notes/an268-interfaces/) for how
the two interface types differ.

> [!NOTE]
> At any given time, a simple I/O pin is either in input mode or output mode.
> Writing a value to a pin register puts the corresponding pin into output mode
> with the specified output value. Reading a value from a pin register puts the
> pin into input mode, clearing any previously set output value.

## null

`null` is a pseudo-register. Reading from the `null` register produces the value
`0`. Writing to the `null` register has no effect.

## Register availability by chip

<div class="circuit-figure" data-circuit="mcu-compare">
<p>MC4000 on the left with <code>acc</code> and four pins; MC6000 on the right with <code>acc</code>, <code>dat</code> and six.</p>
</div>

| Chip | `acc` | `dat` | Simple I/O | XBus |
| --- | --- | --- | --- | --- |
| [MC4000](/shenzhen-io/parts/mc4000/) | yes | - | `p0`, `p1` | `x0`, `x1` |
| [MC4000X](/shenzhen-io/parts/mc4000/) | yes | - | - | `x0`-`x3` |
| [MC6000](/shenzhen-io/parts/mc6000/) | yes | yes | `p0`, `p1` | `x0`-`x3` |

## Value range

Registers store integer values between **-999 and 999**, inclusive. If an
arithmetic operation would produce a result outside this range, the closest
allowed value is stored instead - see
[Arithmetic instructions](/shenzhen-io/language-reference/arithmetic-instructions/).
