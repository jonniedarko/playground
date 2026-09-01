---
title: Full-screen bench
description: The workbench laid out like the game - sim controls on the left rail, the board and its status strip in the middle, the parts catalogue down the right.
board: true
wide: true
order: 2
icon: 🖥️
---

<div class="ide" data-layout="full">
<p>The bench needs JavaScript. Without it, the worked examples on the <a href="/shenzhen-io/quick-start/">quick start</a> and in the <a href="/shenzhen-io/application-notes/">application notes</a> cover the same ground as static diagrams.</p>
</div>

The same workbench as the [panel version](/shenzhen-io/ide/), arranged the way
the game arranges it: the run controls on a rail down the left, the board and
its status strip in the middle, the parts catalogue with its prices down the
right, and a panel underneath for the part you have selected and for what
Verify made of the circuit.

Nothing here is a different simulator. It is the same board, the same
interpreter and the same saved design - open either page and you get the board
you left.

The page opens as the bench, covering the screen - no site header, nothing
scrolling underneath. **Notes** in the rail puts it back into the page so this
text can be read, and turns into **Full screen** to go back. **Exit** leaves
for the panel workbench.


## What the status strip counts

| Reading | Means |
| --- | --- |
| **Show wires** | Fades the parts so a crowded board's traces can be followed |
| **Test run** | The result of the last **Verify**, or `-` if it has not been run |
| **Production cost** | The catalogue price of every part on the board, added up |
| **Power usage** | Total power drawn by the chips at the current time unit |
| **Instructions** | Executable instructions across every chip. Comments, blank lines and bare labels do not count - which is why this is not labelled the way the game labels it, since a label occupies a line there |

Cost is the sum of the datasheet prices in the [parts
section](/shenzhen-io/parts/). There is no budget to stay under here and no
shop to buy from - the number is there because a design that does the job for
less is the better design.

## Where the controls went

| Control | Now lives |
| --- | --- |
| Run, Step, Step back, Break, Reset, Delete | The left rail, top to bottom |
| **−** / **+** grid size | Bottom of the left rail |
| Load, Clear, Save as, Load saved, Share | The **Board** disclosure in the status strip |
| **Notes** / **Full screen** | The rail. Uncovers this page, and covers it again |
| **Exit** | The rail, top. Back to the panel workbench |
| Verify | The **Verification** tab, with its trace underneath |
| A terminal's name | The row of toggles under the board |

## On a phone

The rail, the catalogue and the panel stack instead of sitting side by side -
catalogue at the top, board in the middle, controls in thumb reach at the
bottom, which is [the panel workbench](/shenzhen-io/ide/) in all but name. Use
whichever page you prefer; on a small screen they converge.
