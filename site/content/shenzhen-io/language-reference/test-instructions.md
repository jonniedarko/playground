---
title: Test instructions
description: teq, tgt, tlt and tcp - the four tests that enable and disable conditional instructions.
order: 5
---

A test instruction sets the state of every conditional instruction in the
program: those prefixed with `+` and those prefixed with `-`. The state persists
until the next test instruction runs.

For more information on the `+` and `-` prefixes, see
[Conditional execution](/shenzhen-io/language-reference/program-structure/#conditional-execution).

## teq

```asm
teq R/I R/I
```

Test if the value of the first operand (A) is equal to the value of the second
operand (B).

| Condition | Effect on `+` instructions | Effect on `-` instructions |
| --- | --- | --- |
| A is equal to B | Enabled | Disabled |
| A is not equal to B | Disabled | Enabled |

## tgt

```asm
tgt R/I R/I
```

Test if the value of the first operand (A) is greater than the value of the
second operand (B).

| Condition | Effect on `+` instructions | Effect on `-` instructions |
| --- | --- | --- |
| A is greater than B | Enabled | Disabled |
| A is not greater than B | Disabled | Enabled |

## tlt

```asm
tlt R/I R/I
```

Test if the value of the first operand (A) is less than the value of the second
operand (B).

| Condition | Effect on `+` instructions | Effect on `-` instructions |
| --- | --- | --- |
| A is less than B | Enabled | Disabled |
| A is not less than B | Disabled | Enabled |

## tcp

```asm
tcp R/I R/I
```

Compare the value of the first operand (A) to the value of the second operand
(B). Unlike the other three tests, `tcp` has a third outcome in which **both**
`+` and `-` instructions are disabled.

| Condition | Effect on `+` instructions | Effect on `-` instructions |
| --- | --- | --- |
| A is greater than B | Enabled | Disabled |
| A is equal to B | Disabled | Disabled |
| A is less than B | Disabled | Enabled |

> [!TIP]
> `tcp` is the compact way to write a three-branch comparison. Where `teq` plus
> `tgt` would cost two lines of program memory and two tests, `tcp` gives you
> greater / equal / less in one.
