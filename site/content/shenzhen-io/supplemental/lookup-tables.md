---
title: Product lookup tables
description: The iNK colour space, the assembled meat primer, the cocktail list and the neural lattice substrates.
order: 3
---

Four documents that are, functionally, lookup tables.

## iNK SmartDye colour classification

*Confidential information. Do not redistribute without authorization.*

Incoming light is classified by wavelength into a value band, and each band maps
to a SmartDye colour.

| Light colour | Wavelength | Min value | Max value | SmartDye colour |
| --- | --- | --- | --- | --- |
| Red | 620-750 nm | 20 | 39 | `.blood` |
| Orange | 590-620 nm | 40 | 49 | Deep Nacho |
| Yellow | 570-590 nm | 50 | 59 | Chartreuse Abuse |
| Green | 495-570 nm | 60 | 69 | Ballistic Viridian |
| Blue | 450-495 nm | 70 | 79 | Cool Dad® |
| Violet | 380-450 nm | 80 | 89 | HyPURPLE |

Each dye also has a position in the two-axis SmartDye colour space:

| Colour | k-axis | n-axis |
| --- | --- | --- |
| Chartreuse Abuse | 5 | 5 |
| Deep Nacho | 50 | 5 |
| `.blood` | 95 | 5 |
| Ballistic Viridian | 5 | 60 |
| Neutral | 50 | 50 |
| Cool Dad® | 15 | 80 |
| HyPURPLE | 75 | 85 |

## The Assembled Meat Primer

Three sample specifications for the meat assembler. Each pattern is a set of
valve timings across `valve-0`, `valve-1` and `valve-2`, mixing lean (95% lean,
5% fat) and fat (20% lean, 80% fat).

| Pattern | Description | Calories | Fat (g) | Carbs (g) | Protein (g) |
| --- | --- | --- | --- | --- | --- |
| Cutlet-style | A traditional cutlet with fat around the edges that will crisp nicely when broiled | 217 | 16 | 0 | 19 |
| Steak-style | A lean "steak" inspired by the fine marbling of high-grade beef | 176 | 4 | 0 | 34 |
| Bacon-style | Rashers of good streaky bacon | 227 | 18 | 0 | 16 |

Serving size 100 grams. The valve first/last positions are given as a diagram in
the original and are best read in-game.

## The Elegant Bachelor - cocktail recipes

Six ingredients: vodka, gin and dry vermouth; sweetened lemon, lime and
cranberry mixes.

| Drink | Recipe |
| --- | --- |
| Vodka Shot | 1.5 oz vodka |
| Lemon Drop | 3 oz vodka, 1 oz lemon mix |
| Cosmopolitan | 2 oz vodka, 1 oz lime mix, 1 oz cranberry mix |
| Cape Cod | 2 oz vodka, 2 oz cranberry mix |
| Vodka Martini | 3 oz vodka, 1 oz dry vermouth |
| Gimlet | 3 oz gin, 1 oz lime mix |
| Gin Martini | 3 oz gin, 1 oz dry vermouth |

## Neural processing lattice

*SuemuraLab Biological Sciences Building.*

The cell-based "printer" assembles scaffolds in 6 x 6 chunks, from bottom to
top, using three substrates: a-MSH (`a`), b-P2 (`b`) and y(HG) (`y`). A dash
means no deposit.

The master scaffold layer templates, indexed 0 to 8, each describing one row of
six cells:

| Template | Row |
| --- | --- |
| 0 | `- - - - - -` |
| 1 | `a a a a a a` |
| 2 | `b b b b b b` |
| 3 | `a b a b a b` |
| 4 | `y a a y a y` |
| 5 | `- a a - a -` |
| 6 | `y - - y - y` |
| 7 | `- a - - - -` |
| 8 | `- - - - b -` |

A pattern is six template indices, applied bottom row first. For example the
pattern `1, 4, 6, 6, 0, 0` produces, reading top row down:

```text
- - - - - -
- - - - - -
y - - y - y
y - - y - y
y a a y a y
a a a a a a
```

and the pattern `2, 1, 2, 4, 7, 7`:

```text
- a - - - -
- a - - - -
y a a y a y
b b b b b b
a a a a a a
b b b b b b
```
