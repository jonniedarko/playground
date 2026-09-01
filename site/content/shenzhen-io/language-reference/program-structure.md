---
title: Program structure
description: How a line of MCxxxx assembly is put together - labels, conditions, instructions and comments.
order: 1
---

## Line format

Each line of an MCxxxx program must have the following structure:

```text
LABEL CONDITION INSTRUCTION COMMENT
```

All components are optional, but must appear in the specified order if present.
Examples of syntactically valid lines:

```asm
# This line is a comment.
loop:            # until ACC is ten
  teq acc 10
+ jmp end
  mov 50 x2
  add 1
  jmp loop
end:
  mov 0 acc      # reset counter
```

## Comments

Any text following a `#` symbol is ignored until the end of the line. Comments
improve developer productivity by allowing the behavior of code to be described
in-line with the program itself.

## Labels

Labels must appear first on a line, and are followed by a colon (`:`). Labels
are used as jump targets by the `jmp` instruction.

Labels must begin with a letter and may contain alphabetic, numeric and
underscore characters.

## Conditional execution

All instructions in the MCxxxx programming language are capable of conditional
execution. Prefixing an instruction with a `+` or `-` symbol will cause that
instruction to be enabled or disabled by [test instructions](/shenzhen-io/language-reference/test-instructions/).

When an instruction is disabled by a test instruction, it will be skipped and
**will not consume power**. Instructions with no prefix are never disabled and
always execute normally.

> [!WARNING]
> All conditional instructions start in a disabled state. A test instruction
> must be executed before any conditional instruction will run.

For an example of conditional instructions in use, see
[Application Note 650: Touch-activated light controller](/shenzhen-io/application-notes/an650-light-controller/).

## Instruction operands

Each type of instruction requires a fixed number of operands. If an instruction
has any associated operands, they must appear following the instruction name,
separated by spaces. For the benefit of development productivity, the MCxxxx
programming system does not require the use of redundant punctuation to separate
instruction operands.

Instruction operands are described with the following notation:

| Notation | Meaning |
| --- | --- |
| `R` | Register |
| `I` | Integer [1] |
| `R/I` | Register or integer [1] |
| `P` | Pin register (`p0`, `p1`, and so on) |
| `L` | Label [2] |

**[1]** Integer values must be in the range -999 to 999.

**[2]** Labels used as operands must be defined elsewhere in the program.
