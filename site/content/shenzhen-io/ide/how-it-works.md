---
title: How it works
description: What the workbench simulator models, where it diverges from the game, and how it decides a design is stuck.
order: 1
---

The workbench runs a real interpreter, not an animation. This page says what
it actually models, so you know when to trust it.

> [!TIP] The short version
> - **Instructions, scheduling, XBus handshakes and power are modelled.** Trust these.
> - **The puzzle campaign, costs, verification and the shop are not.** It is a bench, not the game.
> - **A frozen design is reported, not hung.** The readout names the chips that are stuck.

---

## What it models

### The instruction set

`nop mov jmp slp slx add sub mul not dgt dst teq tgt tlt tcp`, plus labels,
`#` comments, `+`/`-` conditional lines and `@` first-pass-only lines.

Registers clamp to **-999 to 999**, the same as the hardware. A program that
runs off its last line **wraps to the first**.

### The conditional flag is tri-state

This is the detail most descriptions get wrong. The flag is not a boolean. It
is `none`, `true` or `false`:

| State | `+` lines | `-` lines |
| --- | --- | --- |
| `none` - before any test | skipped | skipped |
| `true` | run | skipped |
| `false` | skipped | run |

`tcp a b` is what makes three states necessary: greater sets `true`, less sets
`false`, and **equal sets `none`, disabling both**.

### Time and power

A time unit is one round of the scheduler. Chips run until they `slp` or
block, so a whole program can execute many times inside one time unit.

**Power is instructions actually executed.** A sleeping chip costs nothing, and
a conditional line that is switched off is skipped for free.

### XBus is a rendezvous

Nothing crosses an XBus wire until both sides are present - one writing, one
reading. A read with nobody writing stops that chip until somebody does.

That is modelled exactly, because it is the source of most designs that
mysteriously freeze.

### Simple I/O is a level

A value between `0` and `100` that just sits on the pin. Reading a simple pin
makes it an input and **drops whatever it was driving**, so a pin is one or the
other, never both.

---

## How it decides you are stuck

The scheduler tells three failures apart, and the readout names which:

| Readout | Means | Fatal? |
| --- | --- | --- |
| `Deadlock` | Every chip is blocked on an XBus pin. Nothing can ever resolve it | Yes |
| `Waiting` | A chip is blocked while others are still sleeping | Not provably - but it is the symptom you feel |
| An error message | A chip ran past its instruction budget without ever sleeping | Yes |

The budget is the important one. A chip that loops without `slp` would spin
forever, so it is caught and reported rather than locking up the page.

---

## What it does not model

| Not modelled | Why it matters |
| --- | --- |
| Puzzles, briefs and verification | There is no goal to meet here. Nothing is scored |
| Cost in ¥, or the shop | Parts are free on this bench |
| The campaign, the story, the emails | Read those in [Story documents](/shenzhen-io/story/) |
| Solitaire | Sorry |
| Analogue timing, noise, propagation delay | Time is whole units. Signals are exact |
| Most parts' behaviour | Every part in the manual is now drawable and wireable, but only the MCxxxx chips, DX300, memory and gates actually *do* anything when you press Run |

The last one is the practical limit, and it is worth being precise about.
Every part in the manual can be placed and wired here. Only some of them are
*simulated*:

| Part | Placed and wired | Runs |
| --- | --- | --- |
| MC4000, MC4000X, MC6000 | yes | yes |
| DX300, 100P-14, 200P-14, LC70Gxx | yes | yes |
| I/O terminals | yes | yes |
| MC4010, DT2415, C2S-RF901, FM Blaster | yes | not yet |
| N4PB-8000, LX700, LX910C | yes | not yet |
| D80C010-F, KUJI-EK1, PGA33X6, NLP2 | yes | not yet |

A part in the second group is a real component on the board - correct
footprint, correct pins, correct pin types, and a wire to it is checked the
same way. It simply sits there when the clock runs.

---

## Where the numbers come from

Every rule above is taken from a page in this section rather than guessed at:

- [Program structure](/shenzhen-io/language-reference/program-structure/) - conditionals, labels, wrapping
- [Registers](/shenzhen-io/language-reference/registers/) - `acc`, `dat`, clamping
- [Test instructions](/shenzhen-io/language-reference/test-instructions/) - `tcp` and the three-way flag
- [AN268: Two interfaces](/shenzhen-io/application-notes/an268-interfaces/) - XBus blocking
- [AN393: Sleep](/shenzhen-io/application-notes/an393-sleep/) - power and time units
