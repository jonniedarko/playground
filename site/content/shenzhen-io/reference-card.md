---
title: Reference card
description: The whole MCxxxx instruction set on one page - the fold-into-quarters card from the front of the binder.
order: 1
icon: 🗂️
---

*MCxxxx Family Language Reference Card - 诚尚Micro*

## Basic instructions

| Instruction | Operands | Effect |
| --- | --- | --- |
| `nop` | - | Does nothing. |
| `mov` | `R/I R` | Copy the first operand into the second. |
| `jmp` | `L` | Jump to the instruction following the label. |
| `slp` | `R/I` | Sleep for the given number of time units. |
| `slx` | `P` | Sleep until data is available on the given XBus pin. |

## Arithmetic instructions

| Instruction | Operands | Effect |
| --- | --- | --- |
| `add` | `R/I` | `acc = acc + operand` |
| `sub` | `R/I` | `acc = acc - operand` |
| `mul` | `R/I` | `acc = acc * operand` |
| `not` | - | `acc = 100` if `acc` is `0`, otherwise `acc = 0`. |
| `dgt` | `R/I` | Isolate the given digit of `acc`. |
| `dst` | `R/I R/I` | Set the given digit of `acc` to a value. |

## Test instructions

| Instruction | Operands | Effect |
| --- | --- | --- |
| `teq` | `R/I R/I` | Test whether A equals B. |
| `tgt` | `R/I R/I` | Test whether A is greater than B. |
| `tlt` | `R/I R/I` | Test whether A is less than B. |
| `tcp` | `R/I R/I` | Three-way compare of A against B. |

## Registers

| Register | Notes |
| --- | --- |
| `acc` | Accumulator. Present on every MCxxxx. |
| `dat` | Second general-purpose register. [1] |
| `p0`, `p1` | Simple I/O pin registers. [1] |
| `x0`, `x1`, `x2`, `x3` | XBus pin registers. [1] |
| `null` | Reads as `0`; writes are discarded. |

## Notation

| Notation | Meaning |
| --- | --- |
| `R` | Register |
| `I` | Integer [2] |
| `R/I` | Register or integer [2] |
| `P` | Pin register (`p0`, `p1`, and so on) |
| `L` | Label [3] |

---

**[1]** Not all registers are available on all microcontrollers. Refer to the
[parts datasheets](/shenzhen-io/parts/) for pin diagrams and register
information.

**[2]** Integer values must be in the range -999 to 999.

**[3]** Labels used as operands must be defined elsewhere in the program.
