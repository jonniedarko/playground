---
title: Language reference
description: The MCxxxx programming system - program structure, registers, and the full instruction set.
order: 3
icon: 📘
---

*MCxxxx Family Language Reference - 诚尚Micro, document CSM_TD_100202*

The MCxxxx family of microcontrollers employs a common programming system to
simplify system design and reduce new product development time. A program
written for one member of the MCxxxx family can be re-used in any other MCxxxx
microcontroller with few or no changes.

Programs for the MCxxxx are assembled from a small but versatile set of
operations. Each line of an MCxxxx program can contain an instruction, which
consists of the instruction's name followed by zero or more instruction
operands.

MCxxxx microcontrollers are designed to be used in power-constrained
environments and applications, and the MCxxxx programming system has been
designed accordingly. While a MCxxxx microcontroller is in a sleep state, it
consumes no power. Otherwise, power consumption is proportional to the number of
instructions executed.

> [!NOTE]
> MCxxxx microcontrollers have varying features, pinouts and program space
> limitations, described in the model-specific datasheets. Some adaptation may
> be required to account for these model-specific differences.

## In this section
