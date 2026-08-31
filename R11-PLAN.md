# R11 — Device behaviours: agent work order

Make the eleven inert parts run. Seven tasks, in order. **One agent per task.**
Do not start a task until the one before it is committed.

This is a work order, not a discussion. Every decision that could be made has
been made below. Where one has not, the instruction is to stop and ask.

---

## Rules for every agent, every task

Read these first. They override anything you infer from the code.

1. **Do not make decisions.** If the plan does not say what to do, stop and ask.
   A guess that happens to be right is still a failure here.
2. **Do not invent behaviour.** Every part's behaviour comes from its datasheet
   page under `site/content/shenzhen-io/parts/`. If the page does not state it,
   stop and ask. Do not use knowledge of the real game.
3. **Never modify an existing passing test to make your change pass.** If an
   existing test fails, stop and ask. That test is describing a regression.
4. **Never add a dependency.** There is no network. Node standard library only.
5. **Do not commit, push, or deploy.** Leave the work in the working tree.
6. **Do not touch files outside the list your task names.**
7. **Do not work on PGA33X6.** It is deferred. See "Explicitly out of scope".
8. **Finish by running the gate** (below) and reporting its exact output.

### The gate

```
cd site && npm run check && npm test
```

Both must pass. `check` must end `- clean`. `npm test` must report `# fail 0`.
Paste the last line of each into your report.

Do not run `npm run test:browser` unless your task says to. It takes minutes.

### How to report

State, in this order:
1. Which files you changed, and one line each on what changed.
2. The gate output.
3. Anything you stopped on, or `nothing ambiguous`.

Do not summarise the plan back. Do not describe work you did not do.

---

## Explicitly out of scope for R11

Do not do any of these. If a task seems to require one, stop and ask.

- **PGA33X6.** A programmable logic array needs a configuration UI, a save
  format and feedback-path simulation. It is a separate release.
- **The workbench's visual readouts** beyond what Task 7 names.
- **Any change to the MCxxxx instruction set**, the scheduler, or power
  accounting.
- **Refactoring anything the task does not name.**

---

## Task 1 — Extract `devices.js` from `sim.js`

**This is a pure refactor. Behaviour must not change.**

`sim.js` is 620 lines and hardcodes device behaviour in five places with
`if (part.tag === 'dx-300')` and `if (part.cells)`. R11 roughly doubles that
file. Split it before adding to it, not after.

### Files
- `site/assets/shenzhen/devices.js` — new
- `site/assets/shenzhen/sim.js` — edit
- `site/test/devices.test.mjs` — new

### The contract

Create `devices.js` exporting `DEVICES`, an object keyed by part tag. Every
key is optional; a device implements only what it needs.

```js
export const DEVICES = {
  'dx-300': {
    init(ctx, part) {},                        // per-build state, once
    refresh(ctx, part) {},                     // drive nets each settle
    canServe(ctx, part, pin) { return true },  // answer an xbus read without blocking?
    serve(ctx, part, pin) { return 0 },        // the value to supply
    accept(ctx, part, pin, value) {},          // take an xbus write
    afterRead(ctx, part, pin) {},              // pointer moves, etc
    tick(ctx, part) {},                        // once per time unit
  },
}
```

`ctx` is the `Machine`. Devices may call `ctx.net(part.id, pin)`,
`ctx.refreshDevices()` and use `clamp` imported from `sim.js`. Devices must not
reach into chip internals.

### Steps

1. Read `sim.js` in full. Find every place a part's behaviour is decided by its
   tag or by `part.cells`: `refreshDevices`, `deviceReaderOn`, `deviceAccept`,
   `afterDeviceRead`, `serveDevices`.
2. Create `devices.js` with entries for `dx-300`, `p-100p14`, `p-200p14`,
   `io-terminal`, and the four `lc-70g*` gates, moving the existing logic
   verbatim. Change no behaviour, no numbers, no ordering.
3. In `sim.js`, replace each hardcoded branch with a lookup into `DEVICES`.
   Keep the gate fixed-point loop and the terminal pass in `refreshDevices`;
   they now call the device's `refresh`.
4. Add `site/test/devices.test.mjs` asserting that every tag in `DEVICES` exists
   in `PART_META`, and that `dx-300`, both memories, `io-terminal` and all four
   gates have an entry.

### Gate

The gate, plus: **all 49 existing tests must still pass unchanged.** If any
existing test needed editing, you have changed behaviour. Stop and ask.

### Stop and ask if
- Any existing test fails or needs editing.
- A branch in `sim.js` does not map cleanly onto the contract above.

---

## Task 2 — Non-blocking XBus

Today an XBus read with no writer parks the chip. Three parts must instead
yield `-999`. Build the machinery now, with no parts using it yet.

### Files
- `site/assets/shenzhen/parts.js` — edit
- `site/assets/shenzhen/sim.js` — edit
- `site/test/sim.test.mjs` — edit (add tests only)

### Steps

1. Support an optional `blocking: false` on a pin in `PART_META`. Absent means
   blocking, which is every pin today.
2. In the read path, a read on a net whose device side is non-blocking returns
   `-999` immediately instead of parking the chip.
3. Add tests, in this order:
   - a blocking XBus read with no writer still blocks (**existing behaviour, must
     not regress**);
   - a non-blocking read with no writer returns `-999` and the chip continues;
   - a non-blocking read with a writer present returns the written value, not
     `-999`.

### Gate

The gate. The first test above is the important one: the failure mode of this
change is a chip that silently never blocks again.

### Stop and ask if
- Making the non-blocking path work requires changing how blocking reads
  resolve.
- You cannot write the three tests without changing an existing one.

---

## Task 3 — D80C010-F and MC4010

Two parts, no new machinery. Both are pure functions of their input.

### Files
- `site/assets/shenzhen/devices.js` — edit
- `site/test/devices.test.mjs` — edit

### Steps

1. Read `site/content/shenzhen-io/parts/specialist-parts.md` for D80C010-F and
   `site/content/shenzhen-io/parts/mc4010.md` for MC4010. **These pages are the
   specification.**
2. **D80C010-F**: both pins are read-only and return the same stored
   identification value. The page does not say what the value is. **Use `1000`
   and say so in a code comment.** Do not invent a rationale for it.
3. **MC4010**: a command sequence is written to any pin — an operation code then
   one or two values — and the result is readable from any pin. Implement the
   operation table exactly as the page lists it.
4. Sign rules: the page states them for divide, remainder and modulus. Take them
   from the table. **Do not reason about what they should be.**
5. Add one test per operation in the page's table, using the page's own values
   where it gives them.

### Gate

The gate.

### Stop and ask if
- The page's operation table is ambiguous for any row.
- An operation needs a value the page does not give.
- You find yourself deciding what a sign rule should be.

---

## Task 4 — N4PB-8000, C2S-RF901, LX910C

The three non-blocking readers. **Requires Task 2.**

### Files
- `site/assets/shenzhen/parts.js` — edit (mark pins non-blocking)
- `site/assets/shenzhen/devices.js` — edit
- `site/assets/shenzhen/sim.js` — edit only if the input API needs it
- `site/test/devices.test.mjs` — edit

### Steps

1. Read `displays-and-inputs.md` (N4PB-8000, LX910C) and `radio.md`
   (C2S-RF901).
2. Mark the relevant pins `blocking: false` in `PART_META`.
3. **N4PB-8000**: a press yields the button number, a release its negation,
   and `-999` when there is no event. Add a way to queue a press and a release
   from a test. Name it `Machine.pressButton(label, n)` and
   `Machine.releaseButton(label, n)`.
4. **C2S-RF901**: paired transceivers. A value written to one radio's
   `transmit` becomes readable on **every other radio's** `receive` on the same
   board. `receive` yields `-999` when the buffer is empty. **Two radios pair
   with no wire between them** — this is the only part whose connection is not
   a wire.
5. **LX910C**: `tN` yields touch events with the same `-999` idle rule. `qN` is
   a write-then-read pair: write a segment number, the next read returns `1` or
   `0`. `cN` accepts segment writes per the page's table.
6. Test each part reading `-999` when idle **and** not blocking the chip. That
   second assertion is the one that catches the bug.

### Gate

The gate.

### Stop and ask if
- The pairing rule for more than two radios is unclear. The page describes a
  link, not a network.
- LX910C's `qN` pairing needs state the page does not describe.
- Any part needs a test-facing API beyond the two named in step 3.

---

## Task 5 — DT2415 and KUJI-EK1

Both need something the machine does not have yet.

### Files
- `site/assets/shenzhen/sim.js` — edit
- `site/assets/shenzhen/devices.js` — edit
- `site/test/sim.test.mjs`, `site/test/devices.test.mjs` — edit

### Steps

1. Read `clock.md` (DT2415) and `specialist-parts.md` (KUJI-EK1).
2. **Wall clock**: add `Machine.timeOfDay`, in minutes past midnight, settable,
   defaulting to `0`. It does **not** advance on its own in R11 — a test sets
   it. Do not tie it to time units.
3. **DT2415**: drives its simple I/O pin with the 15-minute index, 0 to 95,
   derived from `timeOfDay`.
4. **Seeded RNG**: add `Machine.random`, seeded from a `seed` option on the
   constructor, defaulting to a fixed constant. **An unseeded RNG makes every
   test flaky** — this is why it is seeded.
5. **KUJI-EK1**: when `button` goes high, emit six values on `oracle`, one per
   time unit, starting with the lowermost line. `100` is a solid line, `0` a
   broken one. Use `Machine.random`.
6. Test DT2415 at three times of day from the page's own table. Test KUJI-EK1
   emits exactly six values, one per time unit, and that two machines with the
   same seed emit the same six.

### Gate

The gate.

### Stop and ask if
- The page does not give enough of the index table to test three points.
- KUJI-EK1's behaviour on a second button press while emitting is unclear.

---

## Task 6 — LX700, FM Blaster, NLP2

Three output sinks. They hold a value; nothing reads them.

### Files
- `site/assets/shenzhen/devices.js` — edit
- `site/test/devices.test.mjs` — edit

### Steps

1. Read `displays-and-inputs.md` (LX700), `fm-blaster.md`, and
   `specialist-parts.md` (NLP2).
2. **LX700**: holds a written value between −199 and 199. `-999` blanks it.
   Expose what it holds as `part.display` for the workbench to read later.
3. **FM Blaster**: holds `note` and `instrument`. No audio. Expose both.
4. **NLP2**: **stop here and ask.** The manual does not specify the keyword
   index, so any implementation invents content. The rest of this site is a
   faithful transcription. Do not invent it and do not skip it silently —
   report that you have stopped on NLP2 and completed the other two.
5. Test that each part holds what was written, and that LX700 blanks on `-999`.

### Gate

The gate.

### Stop and ask if
- Anything other than NLP2 requires inventing a value.

---

## Task 7 — Documentation and workbench readouts

Last. Only after Tasks 1–6 are committed.

### Files
- `site/content/shenzhen-io/ide/how-it-works.md` — edit
- `site/assets/shenzhen/ide.js` — edit
- `ROADMAP.md` — edit
- `CLAUDE.md` — edit

### Steps

1. `how-it-works.md` has a table listing which parts are placed-and-wired versus
   which run. **Update it to match what is now true.** Every row must be
   checked against the code, not against this plan.
2. In the workbench, show what LX700 and FM Blaster hold, using the fields
   Task 6 exposed. **Readouts only. Do not change the layout.**
3. `ROADMAP.md`: update the "Where we are" table. Parts still not simulated
   stay marked **no**.
4. `CLAUDE.md`: document `devices.js` and the `DEVICES` contract in the
   Components section, and non-blocking XBus in the Simulator section.
5. Run `cd site && npm run test:browser` as well as the gate. This task touches
   the workbench, so the browser sweep applies.

### Gate

The gate, plus `npm run test:browser` clean.

### Stop and ask if
- The `how-it-works` table cannot be made accurate because a part's status is
  unclear.
- The browser sweep fails for any reason.

---

## Order and dependencies

```
Task 1  (refactor, alone)
   ↓
Task 2  (non-blocking xbus machinery)
   ↓
Task 3 ── Task 4 ── Task 5 ── Task 6      Task 3 needs only Task 1
   ↓                                       Task 4 needs Task 2
Task 7  (docs, last)
```

Task 3 may run as soon as Task 1 is committed. Tasks 4, 5 and 6 touch the same
two files, so run them one at a time, not in parallel.

---

## Definition of done for R11

- The gate passes.
- `npm run test:browser` passes.
- Ten of the eleven parts run. PGA33X6 is deferred, and NLP2 is stopped on
  pending a decision about invented content.
- `how-it-works.md` states exactly which parts run, and is correct.
