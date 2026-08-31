# Roadmap — the full simulator and tools

Where the SHENZHEN I/O section stands, what is left to build, and in what
order. Written after R9; R0–R9 are done and shipped.

Companion to `CLAUDE.md`, which describes the code as it *is*. This file
describes what it is *not yet*.

---

## Where we are

| | Built | Simulated |
| --- | --- | --- |
| MC4000, MC4000X, MC6000 | yes | yes |
| DX300 | yes | yes |
| 100P-14, 200P-14 | yes | yes |
| LC70G04/08/32/86 | yes | yes |
| I/O terminals | yes | yes |
| MC4010 | yes | yes |
| DT2415, C2S-RF901, FM Blaster | yes | yes |
| N4PB-8000, LX700, LX910C | yes | yes |
| D80C010-F, KUJI-EK1, NLP2 | yes | yes |
| PGA33X6 | yes | **no** |

Every part in the manual is drawable, placeable and wireable with correct pins
and pin types. Twenty-one of the twenty-two run when the clock does. PGA33X6
does not: its datasheet describes the shape of a logic array but gives no
programming model to implement, so it stays undriven rather than guessed at.

The interpreter covers the whole instruction set, tri-state conditionals, XBus
rendezvous, sleep scheduling, power accounting, deadlock and stall detection,
and an instruction budget. 39 unit tests, 23 of them on the simulator.

**The gap is not the language. It is the devices, and everything around the
simulator that would make it a tool rather than a demo.**

---

## The releases

Each is independently shippable. Stop after any one and the site is coherent.

| R | Ships | Why it is next | Size |
| --- | --- | --- | --- |
| **R10** | Authoring tools | Repo scripts, so adding content stops being hand work | S |
| **R11** | Device behaviours | The eleven inert parts are the most visible gap | L |
| **R12** | Verification harness | Turns the bench into something you can be *right* on | M |
| **R13** | Puzzle definitions | Content on top of R12 | M |
| **R14** | Share and import | A design you cannot send is a design you cannot discuss | S |
| **R15** | Debugging tools | Where the time actually goes when a design misbehaves | M |

---

## R10 — Authoring tools

Repo scripts, so adding content stops being hand work.

- **`scripts/new-part.mjs`** — writes the `PART_META` entry, the `FIXED_PARTS`
  line, the datasheet page stub with its figure, and the catalogue entry. Four
  edits that are currently done by hand and easy to half-do.
- **`scripts/check.mjs` additions** — every `PART_META` tag has a component;
  every `data-part` in content resolves; every `circuits.js` wire endpoint
  names a pin that exists. All three are currently only caught in the browser.
- **`scripts/screenshot.mjs`** — the ad-hoc Playwright scripts written per
  release, made permanent and parameterised.

**The next release, Device behaviours (R11), is what exercises this
tooling** — eleven parts is exactly the situation the generator is for.

---

## R11 — Device behaviours

Make the eleven inert parts run. Each is small; the value is that a design
using them stops being a picture.

Group them by what the simulator has to learn:

### Pure functions of their input — no new machinery

| Part | Behaviour |
| --- | --- |
| **MC4010** | Command sequence in on any XBus pin, result readable from any pin. Needs a small per-part state machine collecting `op`, `A`, `B`. Division, remainder and modulus each have a documented sign rule — get those from the datasheet table, not from intuition |
| **LC70Gxx** | Already done |
| **D80C010-F** | Returns a fixed value on either pin. One line |

### Non-blocking XBus — new machinery

This is the interesting one. The current XBus is a strict rendezvous: a read
with no writer blocks. Three parts read `-999` instead.

| Part | Behaviour |
| --- | --- |
| **C2S-RF901** | Paired transceivers. `receive` yields `-999` when the buffer is empty. Two radios on a board form a link with no wire between them — the first part whose connection is not a wire |
| **N4PB-8000** | Button press yields the number, release its negation, `-999` when idle |
| **LX910C** | `tN` touch events, same `-999` idle rule; `qN` is a write-then-read pair |

**`Net` needs a non-blocking flavour.** Today a net is a rendezvous point. Add
a per-pin `blocking: false` in `PART_META`, and have the read path return
`-999` rather than parking the chip. Test it against the blocking path in the
same suite — the failure mode is a chip that silently never blocks again.

### Time and the outside world

| Part | Behaviour |
| --- | --- |
| **DT2415** | 15-minute index, 0–95. Needs a notion of wall-clock time in the machine, not just time units. Add `Machine.timeOfDay`, settable, advancing with the clock at a configurable rate |
| **KUJI-EK1** | Six values over six time units on `oracle` after `button` goes high. Needs a seeded RNG so a run is reproducible — an unseeded one makes every test flaky |

### Output-only sinks

| Part | Behaviour |
| --- | --- |
| **LX700** | Holds and displays −199..199, blank on `-999` |
| **FM Blaster** | Holds note and instrument. No audio; a readout is enough |
| **NLP2** | Keyword stream from an audio input. Needs invented content — mark it clearly as invented, since the manual does not specify the index |

### The one that is a project on its own

**PGA33X6** — a programmable sum-of-products array with six product terms and
a set/reset flip-flop. It needs a configuration UI (a grid of switchable
connections), a serialisation format, and simulation of the feedback path.
**Ship this last, or defer it.** It is closer to a second editor than to a
part.

**Gate:** one `node --test` case per part, driven headless. A part that reads
`-999` when idle needs an explicit test that it does *not* block, because that
is the bug that will not show up any other way.

---

## R12 — Verification harness

Right now the bench has no notion of correct. This is what turns it into a
tool: give a circuit an expected output and let it tell you whether you got
there.

- **`Spec`**: named inputs over time, expected outputs over time, and a
  tolerance. Data, in the shape `circuits.js` already uses.
- **`verify(machine, spec)`**: runs to the spec's length, returns the first
  divergence — time unit, signal, expected, actual. Not a boolean; the first
  divergence is the entire diagnostic value.
- **In the workbench**: a Verify button, a pass/fail line, and the failing time
  unit marked on the scope trace.
- **Power and lines used** reported alongside, since that is the actual game.

**Gate:** `verify` returns a correct divergence for a deliberately wrong
circuit, and passes a correct one. Both directions — a harness that only ever
passes is the classic failure here.

---

## R13 — Puzzle definitions

Content on top of R12. A handful of the manual's own worked problems as specs
you can attempt in the workbench.

- Start with the ones already documented: AN650 light controller, the DX300
  stepper, the packet reverser.
- Each gets a brief, a spec, and a "reveal a working solution" affordance.
- **Not the game's campaign.** These are the manual's examples, which is what
  this site is a transcription of.

**Gate:** every shipped puzzle's reference solution passes its own spec. That
is a test, not a claim.

---

## R14 — Share and import

- **URL round-trip.** A board serialises to a compressed query string, so a
  design can be pasted into a message. `toJSON` already exists; this is
  encoding plus a size budget.
- **Import from the game.** SHENZHEN I/O has its own save format. Reading it
  would let a real design be pasted in. **Investigate before promising** — the
  format is undocumented and this may not be feasible.
- **Named local saves**, replacing the single autosave slot.

**Gate:** round-trip a board through a URL and get the same board, wires and
programs included, at 320px and on desktop.

---

## R15 — Debugging tools

Where the time actually goes when a design does not work.

- **Breakpoints** — pause when a chip reaches a line, or when a signal changes.
- **Step backwards.** Requires snapshotting state per time unit; bounded to the
  last N units so memory stays fixed.
- **Per-chip power breakdown**, not just the total.
- **A blocked-chip explainer.** The readout says `Waiting: chip 2`. It should
  say which pin, and what is on the other end of it.

The last one is the highest value per line of code in this list. Every design
that mysteriously freezes is this.

---

## Risks, honestly

| Risk | Handling |
| --- | --- |
| **Non-blocking XBus contaminates the blocking path** | Build it behind an explicit per-pin flag, test both in the same suite. This is the one change that can break already-working circuits |
| **PGA33X6 is a second editor** | Defer it. Ship the other ten and say so |
| **The game's save format may be unreadable** | Investigate in a timebox before committing to R14's second bullet |
| **Verification without divergence reporting is useless** | A pass/fail boolean would technically satisfy R12 and help nobody. The first divergence is the deliverable |
| **NLP2 needs invented content** | Mark it as invented on the page. The rest of this site is a faithful transcription and should not quietly stop being one |
| **Sim file size** | `sim.js` is 620 lines and will roughly double. Split device behaviours into `devices.js` before it gets there, not after |

---

## What is deliberately not here

- **The game's campaign, story progression, or shop.** This is a manual
  transcription with a bench attached, not a reimplementation.
- **Solitaire.**
- **Analogue timing, noise, propagation delay.** Time is whole units and
  signals are exact. That matches how the manual describes the hardware.
- **Multiplayer or accounts.** The site is static and should stay static.
