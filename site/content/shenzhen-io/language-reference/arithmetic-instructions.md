---
title: Arithmetic instructions
description: add, sub, mul, not, dgt and dst - all of which act on acc.
order: 4
---

Registers can store integer values between **-999 and 999**, inclusive. If an
arithmetic operation would produce a result outside this range, the closest
allowed value is stored instead.

> [!NOTE]
> If `acc` contains the value `800` and the instruction `add 400` is executed,
> then the value `999` is stored in `acc`.

Every arithmetic instruction implicitly reads and writes `acc`.

## add

```asm
add R/I
```

Add the value of the first operand to the value of the `acc` register and store
the result in the `acc` register.

## sub

```asm
sub R/I
```

Subtract the value of the first operand from the value of the `acc` register and
store the result in the `acc` register.

## mul

```asm
mul R/I
```

Multiply the value of the first operand by the value of the `acc` register and
store the result in the `acc` register.

## not

```asm
not
```

If the value in `acc` is `0`, store a value of `100` in `acc`. Otherwise, store a
value of `0` in `acc`.

This is the standard way to invert a simple I/O level, since simple I/O treats
`0` as off and `100` as fully on.

## dgt

```asm
dgt R/I
```

Isolate the specified digit of the value in the `acc` register and store the
result in the `acc` register. Digit `0` is the ones column, digit `1` the tens,
digit `2` the hundreds.

## dst

```asm
dst R/I R/I
```

Set the digit of `acc` specified by the first operand to the value of the second
operand.

## Worked examples

Reading and writing individual digits is how you pack several signals into one
XBus value - see the [DX300](/shenzhen-io/parts/dx300/) datasheet for the
canonical use.

| `acc` | Instruction | Result in `acc` |
| --- | --- | --- |
| 596 | `dgt 0` | 6 |
| 596 | `dgt 1` | 9 |
| 596 | `dgt 2` | 5 |
| 596 | `dst 0 7` | 597 |
| 596 | `dst 1 7` | 576 |
| 596 | `dst 2 7` | 796 |
