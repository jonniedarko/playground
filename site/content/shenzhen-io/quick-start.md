---
title: Quick start
description: The whole system in one page - six facts, the two pin types, and three programs you can type in and watch run.
order: 0
icon: 🚀
---

> [!TIP] If you read nothing else, read this
> - `acc` is your **only scratchpad**. All arithmetic lands there.
> - **Time units are the clock.** `slp 1` moves you to the next one.
> - **Power = instructions you actually run.** Sleeping is free.
> - **Two pin types.** Unmarked = simple I/O. Yellow dot = XBus. They never connect to each other.
> - **XBus waits.** Touching an XBus pin stops the chip until the other side shows up.
> - **`+` and `-` lines start switched off.** A test instruction switches them on.

Everything below is those six facts, slower.

---

## The four concepts

### 1. `acc` is the only scratchpad

Every arithmetic instruction reads `acc` and writes back to `acc`. You never say
where the result goes.

```asm
  mov 5 acc    # acc = 5
  add 3        # acc = 8
  mul 2        # acc = 16
```

Values clamp to **-999 to 999**. `800` plus `400` is `999`, not `1200`.

The MC4000 has *only* `acc`. The MC6000 adds a second one called `dat`.

### 2. Time units are the clock

The chip runs *far* faster than the world around it. A whole program can run
many times inside one time unit.

**`slp` is the only way to move time forward.** A loop that just spins does not
advance the clock — it burns power going nowhere.

```asm
  slp 1        # go to the start of the next time unit
  slp 3        # skip three
```

### 3. Power is instructions run

Your score is how many instructions actually execute. Two ways to spend less:

- **Sleep.** A sleeping chip costs nothing.
- **Skip.** A `+`/`-` line that is switched off is skipped and costs nothing.

### 4. Everything is a pin

Pins are registers. Read one to get the world's value, write one to change it.

```asm
  mov p0 acc     # read pin p0 into acc
  mov 100 p1     # drive pin p1 to 100
```

> [!NOTE]
> Writing a simple I/O pin makes it an **output**. Reading it makes it an
> **input** and wipes whatever you were outputting. A pin is one or the other,
> never both at once.

---

## The two interfaces

This is the part that catches everyone. There are two kinds of pin and they
behave completely differently.

| | Simple I/O | XBus |
| --- | --- | --- |
| **Looks like** | unmarked pin | pin with a **yellow dot** |
| **Values** | 0 to 100 | -999 to 999 |
| **Means** | a level, held continuously | one packet, sent once |
| **Timing** | read/write any time | **waits for the other side** |
| **Use for** | buttons, LEDs, motors, mics | chip-to-chip, keypads, displays |

**They never connect to each other.** Unmarked joins to unmarked, yellow dot
joins to yellow dot. If a wire refuses to attach, this is why.

### Simple I/O: a level

Think of a dimmer switch. `0` is off, `100` is full, `50` is half. The value
just sits there until you change it. Reading never waits.

### XBus: a handshake

Think of handing someone a note. **Nothing moves until both people are there** —
one holding it out, one reaching for it.

So an XBus read with nobody writing **stops your chip dead** until somebody
writes. Same the other way.

That is not a bug, it is how you synchronise two chips. But it is also the
number one reason a design mysteriously freezes.

```asm
  slx x0         # sleep until there is something on x0
  mov x0 acc     # now read it
```

`slx` sleeps until data is ready. A plain `mov x0 acc` would also wait — `slx`
just lets you wait in one place and read in another.

---

## Example 1: blink an output

**Goal:** make pin `p1` turn on for 3 time units, off for 3, forever.

**You need:** one MC4000. Wire `p1` to whatever you're lighting up.

**Type this:**

```asm
  mov 100 p1
  slp 3
  mov 0 p1
  slp 3
```

**What happens:**

| Line | Effect |
| --- | --- |
| `mov 100 p1` | `p1` becomes an output at full |
| `slp 3` | clock jumps forward 3 time units, chip costs nothing |
| `mov 0 p1` | `p1` drops to off |
| `slp 3` | 3 more time units |
| *(end)* | execution **wraps back to line 1** and repeats |

> [!TIP]
> There is no `jmp` here. When a program runs off the bottom it starts again at
> the top, so a plain list of instructions is already a loop.

---

## Example 2: react to an input

**Goal:** light `p1` while button `p0` is held.

**You need:** one MC4000. `p0` to the button, `p1` to the lamp. Both unmarked
pins.

**Type this:**

```asm
  tgt p0 50
+ mov 100 p1
- mov 0 p1
  slp 1
```

**What happens:**

| Line | Effect |
| --- | --- |
| `tgt p0 50` | reads `p0`, asks "is it greater than 50?" |
| `+ mov 100 p1` | runs **only if yes** — lamp on |
| `- mov 0 p1` | runs **only if no** — lamp off |
| `slp 1` | wait one time unit, then wrap to the top |

The test flips a switch inside the chip. `+` lines run when the test passed,
`-` lines when it failed. Whichever one doesn't run is skipped for free.

**Why 50?** A button gives you `0` or `100`, but sensors give in-between values.
50 is the halfway line. (Logic gates use the same threshold.)

> [!WARNING]
> A `+` or `-` line with **no test before it never runs**. Conditional lines
> start switched off. If a line seems to be ignored, check there is a `t`
> instruction above it.

---

## Example 3: two chips over XBus

**Goal:** chip A reads a sensor, sends the value to chip B, which drives a lamp.

**You need:** two MC4000s. Wire A's `x0` to B's `x0` — both yellow-dot pins.
Sensor to A's `p0`, lamp to B's `p1`.

**Chip A (the sender):**

```asm
  mov p0 x0
  slp 1
```

**Chip B (the receiver):**

```asm
  slx x0
  mov x0 p1
```

**What happens:**

| Step | Chip A | Chip B |
| --- | --- | --- |
| 1 | reads `p0`, offers it on `x0` — **waits** | asleep on `slx x0` |
| 2 | *(both sides present)* | wakes up |
| 3 | hand-off completes | reads `x0`, drives `p1` |
| 4 | `slp 1` | wraps to top, sleeps again |

Neither chip needs to know the other's timing. The handshake *is* the
synchronisation — that is what XBus is for.

---

## Stuck?

| Symptom | Cause | Fix |
| --- | --- | --- |
| A `+` or `-` line never runs | Conditionals start switched off | Put a test (`teq`, `tgt`, `tlt`, `tcp`) above it |
| Chip freezes, nothing happens | XBus read or write with nobody on the other end | Check the wire; use `slx` to wait properly |
| A wire refuses to connect | Mixing pin types | Unmarked ↔ unmarked, yellow dot ↔ yellow dot |
| Output never changes / time never moves | No `slp` anywhere | Add `slp 1` |
| Error about a register | That chip doesn't have it | MC4000 has `acc` only. `dat` is MC6000 |
| Maths gives exactly `999` or `-999` | Values clamp at the limits | Scale your numbers down |
| An output went dead | You read the pin, which wiped the output | A pin is input *or* output, not both |
| Out of room | MC4000 = **9 lines**, MC6000 = **14** | Split across two chips, or use a bigger one |

---

## Cheat sheet

Everything you need, repeated so you don't have to scroll up.

**Move and jump**

| | |
| --- | --- |
| `mov R/I R` | copy first into second |
| `jmp L` | jump to a label |
| `slp R/I` | sleep N time units |
| `slx P` | sleep until an XBus pin has data |
| `nop` | do nothing |

**Maths — all of it lands in `acc`**

| | |
| --- | --- |
| `add R/I` | `acc = acc + x` |
| `sub R/I` | `acc = acc - x` |
| `mul R/I` | `acc = acc * x` |
| `not` | `0` becomes `100`, anything else becomes `0` |
| `dgt R/I` | keep one digit of `acc` |
| `dst R/I R/I` | set one digit of `acc` |

**Tests — switch the `+` and `-` lines**

| | |
| --- | --- |
| `teq a b` | equal |
| `tgt a b` | a greater than b |
| `tlt a b` | a less than b |
| `tcp a b` | greater → `+`, less → `-`, equal → neither |

**Numbers**

| | |
| --- | --- |
| Simple I/O | `0` to `100` |
| XBus | `-999` to `999` |
| Registers | `-999` to `999`, clamped |
| On / off threshold | `50` |

**Chips**

| | Program lines | Registers | Pins |
| --- | --- | --- | --- |
| MC4000 | 9 | `acc` | 2 simple, 2 XBus |
| MC6000 | 14 | `acc`, `dat` | 2 simple, 4 XBus |

---

## Where to go next

- Need one instruction, right now → [Reference card](/shenzhen-io/reference-card/)
- Confused by `+` and `-` → [Program structure](/shenzhen-io/language-reference/program-structure/)
- Confused by XBus blocking → [AN268: Two interfaces](/shenzhen-io/application-notes/an268-interfaces/)
- What a specific chip can do → [Parts datasheets](/shenzhen-io/parts/)
