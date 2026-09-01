---
title: Full-screen bench
description: What the full-screen workbench puts where - the status strip's four readings, and where each control moved to.
order: 2
icon: 🖥️
---

The [full-screen workbench](/workbench/) is this same workbench with the screen
to itself: run controls on a rail down the left, the board and its status strip
in the middle, the parts catalogue with its prices down the right, and a panel
underneath for the part you have selected and for what Verify made of the
circuit. It is the arrangement the game uses.

Nothing there is a different simulator. It is the same board, the same
interpreter and the same saved design - open either page and you get the board
you left.

This page is the reading matter that will not fit on a screen given over to a
tool.

## What the status strip counts

| Reading | Means |
| --- | --- |
| **Show wires** | Fades the parts so a crowded board's traces can be followed |
| **Test run** | The result of the last **Verify**, or `-` if it has not been run |
| **Production cost** | The catalogue price of every part on the board, added up |
| **Power usage** | Total power drawn by the chips at the current time unit |
| **Instructions** | Executable instructions across every chip. Comments, blank lines and bare labels do not count - which is why this is not labelled the way the game labels it, since a label occupies a line there |

Cost is the sum of the datasheet prices in the [parts
section](/shenzhen-io/parts/). There is no budget to stay under and no shop to
buy from - the number is there because a design that does the job for less is
the better design.

## Where the controls went

| Control | Lives |
| --- | --- |
| Run, Step, Step back, Break, Reset, Delete | The left rail, top to bottom |
| **−** / **+** grid size | Bottom of the left rail |
| **Exit** | Top of the rail. Back to the [panel workbench](/shenzhen-io/ide/) |
| Load, Clear, Save as, Load saved, Share | The **Board** disclosure in the status strip |
| Verify | The **Verification** tab, with its trace underneath |
| A terminal's name | The row of toggles under the board |

## On a phone

The rail, the catalogue and the panel stack instead of sitting side by side -
catalogue at the top, board in the middle, controls in thumb reach at the
bottom, which is [the panel workbench](/shenzhen-io/ide/) in all but name. On a
short screen the middle column scrolls, so the catalogue and the controls never
leave the screen.

## Where to go next

- Open it → [Full-screen workbench](/workbench/)
- The stacked version, with the site around it → [Workbench](/shenzhen-io/ide/)
- What the simulator models → [How it works](/shenzhen-io/ide/how-it-works/)
