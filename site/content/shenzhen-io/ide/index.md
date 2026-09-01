---
title: Workbench
description: A live MCxxxx workbench - place parts, wire them up, write programs and run them in the browser.
board: true
wide: true
order: 1
icon: 🛠️
---

> [!TIP] How to use it in four steps
> 1. **Tap a part** in the palette strip to drop it on the board.
> 2. **Drag** it where you want it. **Drag pin to pin** to wire two parts.
> 3. **Tap a chip's code panel** and type. `⤢` opens a full-screen editor.
> 4. **Run.** The buttons under the board step time forward.

The AN650 light controller is loaded to start with. Your board is saved in this
browser as you work, so you can leave and come back.

<div class="ide">
<p>The workbench needs JavaScript. Without it, the worked examples on the <a href="/shenzhen-io/quick-start/">quick start</a> and in the <a href="/shenzhen-io/application-notes/">application notes</a> cover the same ground as static diagrams.</p>
</div>

The same workbench in the game's own arrangement - run controls on a rail,
the parts catalogue down the side, the screen to itself - is at [Full-screen
workbench](/workbench/); [what it puts where](/shenzhen-io/ide/bench/) is
written up separately. Same board, same saved design.

## What the controls do

| Control | Does |
| --- | --- |
| Palette strip | Adds that part to the first free spot |
| **Run** / **Pause** | Advances time continuously |
| **Step** | One time unit, then stops |
| **Reset** | Back to time zero. Programs and wiring stay |
| **Delete** | Removes the selected part and its wires |
| **−** / **+** | Grid size, for fitting more on a small screen |
| **Load** | Replaces the board with a worked circuit |
| **Clear** | Empties the board |
| A terminal's name | Toggles that input between `0` and `100` |

The readout on the right shows the time unit and total power. When a design
freezes it says why - see [what it models](/shenzhen-io/ide/how-it-works/).

## Wiring rules, repeated

You do not have to scroll back to the [quick start](/shenzhen-io/quick-start/)
for these.

| | Simple I/O | XBus |
| --- | --- | --- |
| **Looks like** | unmarked pin | pin with a **yellow dot** |
| **Values** | 0 to 100 | -999 to 999 |
| **Timing** | read/write any time | **waits for the other side** |

**They never connect to each other.** If a wire refuses to attach, that is why.

## If something will not work

| Symptom | Cause | Fix |
| --- | --- | --- |
| A wire will not attach | Mixing pin types | Unmarked ↔ unmarked, yellow dot ↔ yellow dot |
| `Deadlock` in the readout | Both sides of an XBus wire are waiting | One side has to `slp` or `slx`, not block forever |
| `Waiting` in the readout | An XBus pin has nobody on the other end | Wire it, or drop the instruction |
| Nothing moves, power climbs | No `slp` anywhere | Add `slp 1` |
| A line will not fit | MC4000 holds **9** lines, MC6000 **14** | Split it across two chips |
| `Cannot run` | A wire points at a pin the part does not have | Delete the wire and redraw it |
| Board is gone | Your browser cleared its storage | Load a circuit and start again |

## Where to go next

- The rules, in one page → [Quick start](/shenzhen-io/quick-start/)
- One instruction, right now → [Reference card](/shenzhen-io/reference-card/)
- What this simulator does and does not model → [How it works](/shenzhen-io/ide/how-it-works/)
- The same workbench full-screen → [Full-screen workbench](/workbench/)
- What the full-screen one puts where → [Full-screen bench](/shenzhen-io/ide/bench/)
