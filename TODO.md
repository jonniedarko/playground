# TODO — Field Notes / SHENZHEN I/O section

Everything known to be outstanding, as of the merge of R0–R15.

Each entry says what the thing is, why it is not already done, and what
finishing it would actually take. Nothing here is speculative work someone
thought might be nice; every item was either hit during a release or found
by a check that now guards against it.

`ROADMAP.md` describes the releases. This file is the residue.

---

## Blocked on something outside the repo

### PGA33X6 does not run

The only part of twenty-two that does not. Its datasheet gives the *shape*
of a logic array — six product-term columns, a set/reset flip-flop, a
switchable sum of products — and no programming model at all: no encoding,
no configuration pin, no table mapping inputs to outputs.

Implementing it means inventing a fuse-map format **and** an editor for it.
That is closer to a second workbench than to a part, and everything it
produced would be invention on a site that is otherwise a transcription.

**It is not unfinished; it is unspecified.** Leave it unless the manual
turns out to document the encoding somewhere not yet transcribed.

### Importing a save file from the game

R14.3 looked for anything offline that would pin the format down and found
nothing: no specification, no sample file, no extension, no magic bytes,
and nothing in the manual, which documents the language and every part but
never how the game stores a design.

Guessing a byte layout would be worse than not having the feature — it
reads as knowledge and is fiction.

**Smallest honest next step:** obtain a real save file. Two of the *same*
circuit is better than one, so the fixed bytes can be told from the varying
ones (timestamps, run counts). Then a third of a visibly different circuit
to locate the parts and wires. Until someone has one, this stays closed.

---

## Real defects

### A code edit during a run silently restarts the machine

`ide.js` binds `code-changed` to `save()` only, never `invalidate()`. Edit
a chip's program in the modal while Play is running and `ensureMachine()`
rebuilds the machine from t=0 without going through `invalidate()`, so the
input timeline recorded for step-back is left holding entries from a run
that no longer exists.

Non-crashing, and narrow — terminal labels cannot change from a code-only
edit, so nothing resolves to the wrong pin. But it is wrong, it predates
R15.3, and it is the kind of thing that surfaces as "step back did
something strange" long after anyone remembers why.

**Fix:** decide whether a mid-run code edit should invalidate. It probably
should; the guard is that `code-changed` fires on every keystroke, which is
why it was debounced onto `save()` in the first place.

### Two chips of the same kind are indistinguishable in the readout

`explainBlocked()` names a part by `meta.name`, so a board with two MC4000s
produces two identical lines:

```
MC4000 is blocked reading x0, wired to MC4000 x0 - which is itself blocked.
MC4000 is blocked reading x0, wired to MC4000 x0 - which is itself blocked.
```

Which is exactly the situation the explainer exists for, and the one place
it stops being useful. The per-chip power readout already solved this —
`MC4000 #1`, `MC4000 #2`, numbered only when two would otherwise read alike
— so the answer exists and is not applied here.

**Fix:** reuse that naming. Note `part.label` is *not* a user's name for a
part: it defaults to the part's own name and is therefore always set.
`part.spec.label` is the one a person chose.

---

## Known divergences, deliberately left

### `lines` counts instructions, not the game's line score

`verify()` reports `lines` as executable instructions: blanks, comments
**and labels** all parse to no `op` and do not count. In the game a label
occupies a line.

The manual never defines the metric, so this is a reading rather than a
transcription. The workbench labels it "instructions" rather than "lines"
so the number is not presented as something it is not. Revisit only if a
puzzle is ever scored against the game's own figure.

### The packet reverser figure is still a still illustration

It runs now — the R12.2 XBus terminal fix is what made that true — but a
`data-run` figure's only input affordance is a **toggle per input
terminal**, which fits a simple I/O level and not an XBus stream. The
toggle can only ever hand the reverser `100`, so a reader pressing it three
times watches `100, 100, 100` come back and never sees the reversal.

Live is better than static, but not when live demonstrates nothing.

**Fix:** an affordance that can feed a terminal a *packet*. That is real UI
work, not the one-line `data-run` attribute — which is why the attribute
was added and then removed again.

---

## Housekeeping

### `CLAUDE.md` does not list the newer modules

The Components table stops at `ide.js`. Four modules added in R11–R14 are
missing from it: `verify.js`, `specs.js`, `share.js`, `keywords.js`. The
file is the first thing anyone reads to find their way around, so a gap
there costs someone a search.

### Asset URLs are not cache-busted

Every deploy ships the same `assets/style.css` and `assets/app.js`, so a
returning visitor can get stale assets against fresh HTML. Real symptom,
small fix: hash the filenames at build time and rewrite the references in
`layout()`.

### The sim bar is getting crowded

Run, Step, Step back, Break, Reset, Verify, Delete, zoom −/+, plus the
input toggles, plus two dropdowns and a name field in the file bar. Every
control still clears 44px in both axes and the sweep enforces that at 320px
and 390px, so nothing is broken — but the bar has absorbed four releases of
additions without ever being looked at as a whole.

Worth a deliberate pass before anything else is added to it.

---

## Not a problem, but worth knowing

**GitHub's Pages build can lag well behind the branch push.** On 2026-09-01
a deploy sat about six hours between the `pages` branch being updated and
GitHub's own "pages build and deployment" running. The branch content was
correct throughout.

If the live site looks stale, check that workflow run before assuming the
deploy failed. `git ls-tree -r --name-only origin/pages` verifies the branch
independently, and the build stamp in the footer names the commit the site
was built from.
