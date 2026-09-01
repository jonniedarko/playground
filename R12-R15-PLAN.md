# R12–R15 — work orders

Four releases, written the way R11 was: minimal steps, no decisions left to the
agent executing them. Every choice the manual does not settle is made here, in
advance, and marked as a choice.

R11 is done and deployed. 21 of 22 parts run.

---

## Standing rules — every task, every release

1. **Make no decisions and no assumptions.** The content pages are the
   specification. Where a page is silent, this document decides. Where neither
   does, **stop and ask** — do not invent.
2. **Do not refactor anything the task does not name.** No drive-by
   improvements to adjacent code.
3. **Do not touch git.** No commits, no pushes, no branches. Work is reviewed
   and committed by the person who dispatched you.
4. **The gate is `npm run check && npm test`**, from `site/`. It must pass
   before you report done. Tasks that touch the workbench also need
   `npm run test:browser`.
5. **Every test must be able to fail.** Before finishing, break the code each
   test covers in the most plausible wrong way, confirm the test fails, restore.
   Report what you broke and that each was caught. This is not optional: three
   R11 tasks shipped tests that passed against both correct and incorrect code,
   and two of them were the core contract of the part.
6. **Report every place a page left you a choice**, and whether you stopped or
   proceeded. A quietly resolved ambiguity is the failure this process exists
   to prevent.
7. Zero dependencies. Node stdlib and browser built-ins only. The network is
   locked down — no npm, no PyPI.
8. Mobile is a requirement, not a pass at the end. Base CSS is phone. Tap
   targets ≥ 44px. Never hide an affordance behind `:hover` alone.

---

## Decisions made in advance

These are settled. Do not relitigate them; do not ask about them.

### Where things live

| Thing | File |
| --- | --- |
| `Spec` data | `site/assets/shenzhen/specs.js` |
| `verify()` | `site/assets/shenzhen/verify.js` — no DOM, testable under node |
| Puzzle content | `site/content/shenzhen-io/puzzles/` |
| URL codec | `site/assets/shenzhen/share.js` |
| Debug helpers | `site/assets/shenzhen/sim.js` (explainer), `ide.js` (UI) |

`verify.js` must not import `ide.js` or `components.js` — both touch `document`
and cannot load under node.

### The `Spec` shape

Data, in the style `circuits.js` already uses:

```js
{
  circuit: 'an650',        // key in circuits.js, or an inline spec object
  length: 12,              // time units to run
  inputs: { switch: [0, 0, 100, 100, 0] },
  expect: { lamp: [null, null, 0, 50, 50, 50] },
  tolerance: 0,            // absolute, per sample
}
```

- **Arrays are indexed by time unit**, from 0.
- **A short array holds its last value** for the remainder of the run. This is
  what makes `[0, 0, 100]` mean "press at unit 2 and keep it pressed".
- **`null` in an `expect` array means don't care.** Warm-up units need this.
- **A sample is taken after `advance()` completes that unit.** `expect.lamp[3]`
  is `machine.output('lamp')` after the 4th `advance()`. State this in a
  comment; it is the ambiguity every harness of this kind gets wrong.
- `tolerance` is absolute and applies to every signal. Default 0.

### What `verify()` returns

```js
{
  ok: false,
  divergence: { time: 3, signal: 'lamp', expected: 50, actual: 0 },
  power: 41,
  lines: 7,
  units: 12,
}
```

- **The first divergence only.** Not a list, not a boolean. The first
  divergence is the entire diagnostic value; a list of 400 is noise.
- `ok: true` gives `divergence: null`.
- A machine that deadlocks, errors, or halts before `length` is a failure, with
  the divergence naming the time unit it stopped and the reason in `signal`.
- `power` and `lines` come from the existing chip fields — that is the actual
  game's scoring, and the reason to report them.

### Step-backwards is re-run, not snapshot

The machine is **deterministic given its seed and its input timeline**
(`Machine.random` was seeded in R11 precisely so). So stepping back to unit
`t-1` rebuilds the machine and replays `t-1` units. No state capture, no
per-device save/restore hook, no ring buffer, and nothing to get subtly wrong
when a device grows a new field.

The cost is O(t) per step back. At the scale this workbench runs — tens of time
units, not millions — that is free. **Do not build a snapshot system.** If a
profile ever shows this hurting, that is a later problem with a later decision.

### What is not decided here

Anything this document does not cover is a **stop and ask**.

---

# R12 — Verification harness

The release that gives the bench a notion of *correct*. R13 cannot exist
without it.

## Task 12.1 — `verify()`, headless

**Files:** `site/assets/shenzhen/verify.js` (new), `site/test/verify.test.mjs` (new)

1. Write `verify(machine, spec)` per the decisions above. It drives an
   already-built `Machine`; it does not build one.
2. Apply each unit's inputs via `setInput` **before** that unit's `advance()`.
3. Sample outputs after `advance()`. Compare against `expect`, honouring
   `null` and `tolerance`.
4. Return on the first divergence. Do not keep running.
5. Handle the three early-stop cases: `machine.error`, `machine.deadlock`, and
   every chip halted. Each is a failure naming the unit it happened at.

**Gate:** the gate, plus these tests — **both directions**:
- a correct circuit passes,
- a circuit deliberately made wrong fails **at the right time unit and signal**,
- a spec whose `expect` is all `null` passes trivially,
- a short `inputs` array holds its last value,
- `tolerance` accepts a near miss and rejects a far one,
- a deadlocking circuit reports the deadlock rather than hanging.

> A harness that only ever passes is the classic failure here. The
> deliberately-wrong test is the one that matters; write it first.

**Stop and ask if:** sampling before vs after `advance()` changes whether a
shipped circuit passes. That means the decision above is wrong and I need to
know, not have it worked around.

## Task 12.2 — Specs for the shipped circuits

**Files:** `site/assets/shenzhen/specs.js` (new), `site/test/verify.test.mjs`

1. Write a spec for **AN650**, the **DX300 stepper**, and the **100P-14 packet
   reverser** — circuits that already exist in `circuits.js` and already work.
2. Derive expected outputs from the manual's description of what each circuit
   does, **not** by running the circuit and recording whatever it produces.
   Recording the output makes the test tautological: it would pass even if the
   circuit were wrong.
3. Each spec gets a test asserting the shipped circuit passes it.

**Stop and ask if:** a shipped circuit fails a spec you derived from its page.
That is either a bug in the circuit or a misreading of the page, and both are
mine to resolve. **Do not adjust the spec until it passes.**

## Task 12.3 — Verify in the workbench

**Files:** `site/assets/shenzhen/ide.js`, `site/assets/style.css`

1. A **Verify** button in the existing sim bar. Runs the current board against
   the spec for the loaded preset, if there is one.
2. A pass/fail line in the existing readout. On failure, name the time unit,
   the signal, expected and actual — the whole point is the diagnostic.
3. Mark the failing time unit on the `<scope-trace>`.
4. Report power and lines alongside.
5. **Do not restructure the bar.** The panel is capped at `100dvh` with the
   palette top, board middle, bars bottom, and that cap is what keeps controls
   in thumb reach. A new button goes in the existing bar or it does not go in.

**Gate:** the gate, plus `npm run test:browser`, extended to click Verify on a
preset at 320px and 390px and assert the result line appears. Every control it
finds must clear 44px in both axes.

---

# R13 — Puzzle definitions

Content on top of R12. **Do not start until R12 is committed.**

These are the manual's own worked problems, not the game's campaign. This site
is a transcription; inventing puzzles would make it something else.

## Task 13.1 — Puzzle pages

**Files:** `site/content/shenzhen-io/puzzles/` (new section), `specs.js`

1. A section index plus one page per puzzle: **AN650 light controller**, **DX300
   stepper**, **packet reverser**.
2. Each page: the brief in the manual's own terms, the parts allowed, and the
   spec's inputs and expected outputs **as a table a reader can follow without
   running anything**.
3. Front matter: `board: true`, `wide: true`. Folder needs `index.md`.
4. Internal links root-relative (`/shenzhen-io/…`) so `BASE_PATH` applies.

**Stop and ask if:** a puzzle needs a part or a behaviour that does not exist.
PGA33X6 in particular does not run and must not appear in a puzzle.

## Task 13.2 — Attempt and reveal

**Files:** `site/assets/shenzhen/ide.js`, puzzle pages

1. A puzzle page loads its brief into the workbench with an **empty** board —
   the point is to attempt it.
2. A **reveal** affordance loads the manual's reference solution.
3. Reveal must not be behind `:hover` alone. It is a button, ≥ 44px.

**Gate:** the gate, plus a test that **every shipped puzzle's reference
solution passes its own spec**. That is a test, not a claim — a puzzle whose
own answer fails is worse than no puzzle.

---

# R14 — Share and import

**Do not start until R13 is committed.** Independent of R12's internals, but
sequenced after so the file does not churn under three tasks at once.

## Task 14.1 — URL round-trip

**Files:** `site/assets/shenzhen/share.js` (new), `site/test/share.test.mjs`
(new), `site/assets/shenzhen/ide.js`

1. Encode a board to a URL-safe string and back. `board.toJSON()` already
   exists; this is encoding plus a size budget.
2. **`toJSON` carries `label`/`type`/`side`.** Drop them and a saved
   `io-terminal` comes back with the wrong pin and loses its wires. The codec
   must round-trip them.
3. **No compression library** — none is installable. Use a compact field
   encoding (tag index, coordinates, wire index pairs, program text) plus
   base64url. Do not reach for `CompressionStream`.
4. **Budget: 2000 characters.** Over budget, the UI says so and offers the
   local save instead. It does not silently produce a URL that will be
   truncated by something downstream.

**Gate:** the gate, plus a round-trip test over a board with every part kind on
it, wires and programs included, asserting deep equality — and
`npm run test:browser` round-tripping through the actual UI at 320px.

**Stop and ask if:** a realistic board exceeds the budget. The fix is a
decision about what to drop, and that is mine.

## Task 14.2 — Named local saves

**Files:** `site/assets/shenzhen/ide.js`

Replace the single autosave slot with named saves. Keep the autosave as the
unnamed default so nobody loses the board they had open.

**Gate:** the gate, plus a browser test that a named save survives a reload.

## Task 14.3 — Game save format — **investigation only**

**Files:** none. Write findings into the task report.

SHENZHEN I/O has its own save format. Reading it would let a real design be
pasted in. The format is **undocumented and this may not be feasible.**

1. Establish, from material actually available offline, whether the format is
   documented anywhere in this repo or derivable from first principles.
2. **Write no code.** Report what you found.
3. **Do not fetch anything from the network** — it is locked down, and an
   attempt will fail in a way that wastes the task.

**Stop condition: this task always stops.** It ends in a report, never an
implementation. Whether to build it is my call after reading the findings.

---

# R15 — Debugging tools

Where the time actually goes when a design does not work.

## Task 15.1 — The blocked-chip explainer

**Do this first. It is the highest value per line in this document.**

Today the readout says `Waiting: chip 2`. Every design that mysteriously
freezes is this, and the readout does not say why.

**Files:** `site/assets/shenzhen/sim.js`, `site/test/sim.test.mjs`,
`site/assets/shenzhen/ide.js`

1. `chip.blocked` already holds the **instruction** that blocked. The pin is in
   that instruction, and `net(id, pin).members` gives what is on the other end.
   The raw material is there; this is a formatting problem, not new machinery.
2. Add `Machine.explainBlocked()` returning, per blocked chip: the chip, the
   pin, what is wired to that pin, and which of the three reasons applies —
   nothing wired at all, a partner that is itself blocked, or a partner that is
   sleeping.
3. Surface it in the workbench readout, replacing the bare `Waiting:` list.

**Gate:** the gate, plus a test per reason — an unwired XBus read, a mutual
deadlock, and a read whose partner is asleep — asserting the explanation names
the right pin and the right other end.

## Task 15.2 — Breakpoints

**Files:** `site/assets/shenzhen/sim.js`, `ide.js`, tests

1. Pause when a chip reaches a given line, or when a named signal changes.
2. The existing run loop already steps one time unit at a time; a breakpoint is
   a stop condition on that loop, not a new scheduler.

**Gate:** the gate, plus tests that a line breakpoint fires on the right unit
and a signal breakpoint fires on change and not otherwise.

## Task 15.3 — Step backwards

**Files:** `site/assets/shenzhen/ide.js`, tests

Implement as **rebuild and replay** — see the decision above. Record the input
timeline as the run proceeds; to step back to `t-1`, rebuild the machine from
the same spec and seed and replay `t-1` units.

**Do not build a snapshot system.**

**Gate:** the gate, plus a test that stepping back and forward again lands on
byte-identical state, including device state (a radio's buffer, a memory's
pointer, an oracle's drawn hexagram).

**Stop and ask if:** replay does not reproduce state exactly. That means
something is non-deterministic that should not be, and finding it is worth more
than the feature.

## Task 15.4 — Per-chip power

**Files:** `site/assets/shenzhen/ide.js`

Break the existing total down per chip. The field already exists per chip;
this is display only.

**Gate:** the gate, plus `npm run test:browser`.

---

## Order

```
R12.1 ─→ R12.2 ─→ R12.3          R12.1 first; nothing else can start
                    ↓
              R13.1 ─→ R13.2      needs R12 committed
                          ↓
              R14.1 ─→ R14.2      R14.3 is an investigation, any time
                          ↓
     R15.1 ─→ R15.2 ─→ R15.3 ─→ R15.4
```

**R15.1 does not actually depend on R12–R14.** If R12 stalls, pull it forward —
it is small, self-contained, and the most useful thing in this document.

Tasks that touch `ide.js` must run one at a time. That is most of them.

---

## Deliberately not here

- **PGA33X6.** Its datasheet describes the shape of a logic array but gives no
  programming model — no encoding, no configuration pin, no table mapping
  inputs to outputs. Implementing it means inventing a fuse-map format *and* an
  editor for it. It is not unfinished; it is unspecified.
- **Cache-busting on asset URLs.** Real but unrelated: every deploy ships the
  same `style.css` and `app.js` filenames, so a returning visitor can get stale
  assets against fresh HTML. A separate, smaller change.
- **The game's campaign puzzles.** This site is a transcription of the manual.

---

## Definition of done

| Release | Done when |
| --- | --- |
| R12 | `verify` reports a correct first divergence for a wrong circuit and passes a right one. Three shipped circuits have specs derived from their pages. Verify works in the workbench at 320px. |
| R13 | Three puzzle pages ship, and every reference solution passes its own spec as a test. |
| R14 | A board round-trips through a URL with wires and programs intact. Named saves survive a reload. The game-format question is answered in writing, either way. |
| R15 | A blocked chip says which pin and what is on the other end. Breakpoints fire. Step-back lands on identical state. |
