---
title: Signal and formula specs
description: Harmonic maximization, the PP-221 illuminator modes, the 2A27 actuator state space and the sound effect samples.
order: 1
---

## Harmonic maximization

*The Sunnyvale Institute for Audio Engineering.*

Buried in the marketing copy is the entire specification:

> [!SPEC] The formula
> `AUDIO_OUT = (AUDIO_IN - 50) x 4 + 50`

Everything else on the page - "crisp highs and booming lows, all in perfect
balance" - is prose. The transform is a gain of 4 about a midpoint of 50.

Remember that simple I/O clamps to 0-100, so inputs outside 37.5-62.5 saturate.

## PP-221 carbine target illuminator

Three predefined settings selected by radar range. The radar reports a range as
a number of time units.

| Radar range | Laser | 20° flood | 60° flood |
| --- | --- | --- | --- |
| 1-2 time units | 0% | off | **on** |
| 3-4 time units | 50% | **on** | off |
| 5-6 time units | 100% | off | off |

- **Short range mode** - for close-quarters situations and room-to-room
  engagements, the flood light is set to a wide diffusion to illuminate the
  largest possible area without wasting power on an aiming laser.
- **Mid range mode** - for urban environments, the flood light narrows and the
  laser point enables precise aiming.
- **Long range mode** - the highest-power laser point with the lowest
  divergence, for outdoor situations or excessive non-natural ambient
  illumination.

## Poseidon-779 2A27 actuator control

*Thorium mining unit, actuator control subsystem.*

A geometric visualisation of a state space. The actuator control must take a
value dependent on its X and Y inputs.

| Region | Output |
| --- | --- |
| X < 20 | 50 |
| 40 ≤ X < 80 **and** 40 ≤ Y < 80 | 0 (the danger flux point) |
| X ≥ 60 | 30 |
| Upper band | 80 |
| Lower band | 30 |
| Remainder | 40 |

> [!WARNING]
> The `0` value area in the middle is required so that the actuator avoids the
> flux point. It is a safety requirement, not an optimisation.

> [!NOTE]
> The original page is a diagram rather than a table; the regions above are read
> off the printed boundaries. Check the in-game diagram before relying on the
> edge cases.

## DarkLord555's creepy sound effects

Sample sequences, one value per time unit.

| Effect | File | Samples |
| --- | --- | --- |
| Sinister Giggle | `giggle.wav` | 100 80 41 14 14 41 69 74 54 27 19 40 75 |
| Unsettling Laugh | `laugh.wav` | 20 76 11 30 17 27 48 81 29 74 24 19 |
| Blood-Curdling Cry | `cry.wav` | 16 36 42 14 10 58 100 76 26 28 70 80 42 |
| Startling Crash | `crash.wav` | 39 44 95 67 17 38 39 24 30 |
| Creepy Singing (Ring Around the Rosie) | `ring.wav` | 90 33 86 64 97 98 87 32 13 45 36 50 80 |

*"These sound effects were recorded and modified by me, DarkLord555. They are
free to use."*
