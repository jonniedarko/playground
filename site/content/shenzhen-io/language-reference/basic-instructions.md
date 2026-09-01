---
title: Basic instructions
description: nop, mov, jmp, slp and slx.
order: 3
---

## nop

```asm
nop
```

This instruction has no effect.

## mov

```asm
mov R/I R
```

Copy the value of the first operand into the second operand.

```asm
mov 100 p1     # drive simple I/O pin p1 high
mov x0 acc     # read an XBus packet into acc
mov acc dat    # copy between registers
```

## jmp

```asm
jmp L
```

Jump to the instruction following the specified label.

```asm
loop:
  mov 100 p1
  jmp loop
```

## slp

```asm
slp R/I
```

Sleep for the number of time units specified by the operand. A sleeping
microcontroller consumes no power.

See [Application Note 393](/shenzhen-io/application-notes/an393-sleep/) for why
sleeping - rather than looping - is the right way to wait for the next time
unit.

## slx

```asm
slx P
```

Sleep until data is available to be read on the XBus pin specified by the
operand.

`slx` only accepts an XBus pin. It is the idiomatic way to wait on an XBus
producer without burning power in a polling loop.

```asm
  slx x0         # wait for a packet
  mov x0 acc     # then read it
```
