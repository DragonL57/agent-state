---
id: doc-1
title: Reviewer practices
type: specification
created_date: '2026-11-18T01:33:00Z'
---

# Reviewer practices

What each reviewer judges. `rig/playbooks/reviewing.md` says how every reviewer works; the research behind these rules is recorded in TASK-5.

## (1) The approval bar

- Approve only when the change improves the code and no `must-fix` is open.
- Judge the change as a unit: better, worse, or unchanged.
- Take a clean review as a valid outcome.
- Take a technical fact over an opinion.
- Treat the formatter, linter, and type checker as the style authority for the rules they implement.
- Keep the `AGENTS.md` rules no tool enforces with the reviewer's eye.
- File polish nobody must act on as `minor`, capped by A1.
- Admit a change that fails a `must-fix` only on the user's explicit acceptance, recorded as `review.md` step 4 describes.

## (2) Entry conditions

Three conditions hold before a reviewer judges anything, and nothing else does. When one fails, name it under `Unverified`, make the verdict `provisional`, and withhold approval when the missing evidence is essential.

- **E1 Read at most 400 changed lines.** Above 400, ask the orchestrator to split the change or name the subset this review covers, and list the rest under `Unverified`.
- **E2 Judge nothing the tools already judge.** The brief's `Existing evidence` field carries the build, formatter, linter, type checker, and test output; a missing field is the finding.
- **E3 Take the intent alone.** Report a brief that carries the implementer's justification. The intent is what the change must do and why it exists, and a missing one is an `Unverified` line, never a guess.

## (3) How every reviewer works

Eight rules hold for every reviewer.

- **A1 Report at most five `minor` findings per review, and never one the formatter, linter, type checker, or CI already enforces.** Name the consequence of a finding: the input, the path, the contract it breaks.
- **A2 Take behavior evidence from the brief's `Existing evidence` first, then from one command you run: read-only, under two minutes, with any probe written under `/tmp` and deleted.** File a claim neither source settles as `plausible risk`.
- **A3 Report a missing reviewer as the finding.** A delegated change outside the single-file exemption owes `spec-reviewer` and `taste-reviewer`, and their absence goes at the top of the report as `Unverified`. `review.md` step 1 names what a documented rule, a behavior change, and a sensitive path add.
- **A4 Re-check a `must-fix` with one read-only command before reporting it, say under `Checked` what you ran, and drop or downgrade a finding that does not survive.** Three re-checks per review, inside A2's two-minute cap. The cross-model refutation is the orchestrator's, in `review.md` step 5.
- **A5 Name the commit or tree state your approval covers.** An approval covers one tree: a later commit, a mid-review fix, or a hand-resolved merge voids it, and those files need a fresh read.
- **A6 Send findings to the author; do not apply the fix yourself.**
- **A7 Record turns, minutes, and each finding's severity in the report.** `review.md` step 6 adds each outcome to the task notes: fixed, waived, or wrong.
- **A8 Name a reviewer failure that has now appeared twice, with both review ids, in the report.** A false must-fix, a missed weakened test, and a finding filed against the wrong role are the three to watch.

## (4) Role checks

Each check is either decidable by looking at the change, or a judgment that carries the instance it rests on: the line, the criterion, the test, quoted. Each role leaves the other roles' checks alone, and a boundary clause names the owner where two roles could see the same thing.

### spec-reviewer: the requirement

- **S1 Trace every added behavior to a requirement and every requirement in scope to code.** A document line that has become false is D2's.
- **S2 Report a criterion no test could falsify.** Judge each criterion as necessary, appropriate, unambiguous, complete, singular, feasible, verifiable, correct, and conforming, and fail one that states how to build rather than what is needed. Quote the criterion that fails one of them.
- **S3 Read the change by hand for edge cases, boundaries, concurrency, and races, and trace the change's inputs through the transforms it touches to its outputs; do not scan the diff.** Look for an off-by-one, a permission check missing on a path no test hits, validation that short-circuits, and a race at scale. A single transform's data flow is this check; the end-to-end user path is F1's.
- **S4 Report behavior the requirement does not ask for as a `user decision`, with its cost.** A new dependency, a config value edited on the way past, and a helper rewritten without mention are the shapes.
- **S5 Require a unique id and a priority on each criterion in the specification document.** The tracker puts priority on the task.

### taste-reviewer: the code

- **T1 Report a caller reaching past an interface, or a type exposing its storage.**
- **T2 Report a unit with two reasons to change, and quote both: the two callers, or the two owners.**
- **T3 Report cyclomatic complexity above 10 in a new function, and quote the branch count.** Also report a shape the reader must simulate, and quote the shape.
- **T4 State a precondition once, on one side of the call; report a caller and a callee both checking it.**
- **T5 Report an abstraction whose deletion removes complexity instead of moving it to the call sites, and quote what the deletion does to them.** Speculative generality and the single-use abstraction are the shapes; behavior nothing calls is S4's.
- **T6 Report a comment the `AGENTS.md` allowlist does not cover: not an external constraint, not an accepted scale limit, not a license.** A comment justifying a workaround is a finding against the fix.
- **T7 Report the brief's formatter, linter, and type checker output as evidence, and do not restate their rules as findings (A1).** Treat a tool that did not run as E2. Keep the `AGENTS.md` rules no tool enforces: T6's allowlist, swallowed errors, non-ASCII.
- **T8 Search for the helper before accepting a new one, and quote both.** Production duplication is this check, test duplication is test-reviewer's, and an unmentioned rewrite is S4's.

### test-reviewer: the evidence

- **V1 Run two imagined edits: break the behavior and require a failing test, restructure the internals and require the tests to pass.** Pick the edits closest to a real fault: conditional-operator, relational-operator, and statement-deletion edits. `testing.md` owns the two edits.
- **V2 Verify the faults no imagined edit catches by reading, and say so under `Checked`.** That gap is 17% of real faults, mostly algorithmic rewrites and deletions.
- **V3 Report a new end-to-end test where an integration test at a stable boundary would catch the same bug, and a suite made mostly of end-to-end tests.** `testing.md` owns the preference.
- **V4 Do not accept a coverage percentage as evidence, and say so under `Checked` when the brief offers one.**
- **V5 Report a test that fails on unchanged code, and a test that takes an order of magnitude longer than its file's median.**
- **V6 Read the diff to every test file line by line, and report a skipped test, a deleted assertion, a loosened matcher, a lowered coverage threshold, `|| true` on a failing command, or a test that asserts the implementation.** Exempt a test the same change deletes with its behavior.

### docs-reviewer: the documentation

- **D1 Require the documentation in the same change as a change to how people build, test, interact with, or release the code.**
- **D2 Quote the document line the code has made false.** A requirement with no code is S1's.
- **D3 Require deleted or deprecated behavior to take its documentation with it.** Code artifacts left behind are F3's.

### final-reviewer: the unit

- **F1 Trace a named user path through the final state of the code, not through the diff, and report the path and its outcome under `Checked`.** Reading is the fallback, marked `unverified`. A single transform's data flow is S3's, and whether the behavior matches the intent is S1's.
- **F2 Characterize the class of a defect and name the check that makes the class impossible: a type, a lint rule, a test, a dependency rule.**
- **F3 Report superseded helpers, flags nothing reads, and comments describing a design that is gone.** Documentation of deleted behavior is D3's, and a comment that fits no `AGENTS.md` allowlist entry is T6's.

## (5) Findings and verdicts

- Keep the three verdicts, the severity definitions, and the report shape in `reviewing.md`; append `provisional` while evidence or budget is incomplete.
- Name the check id and what it breaks in the role field: `T3 cyclomatic complexity 14 > 10`, `S2 acceptance criterion 3 is not verifiable`.
- Cite the `E` id under `Unverified` when an entry condition fails.
- Put the `pre-existing` label `reviewing.md` defines in the label field.

## (6) What this specification leaves out

- A long checklist per role. Each role carries three to eight checks.
- Inspection meetings and their moderator, reader, and recorder.
- A precision target. A7 records outcomes and no percentage is claimed.
- An autonomous merge decision. The orchestrator decides and the user accepts a failed `must-fix`.
- System-level design judgment. A reviewer reading the diff can judge an interface and its coupling (T1, T2); S1 carries the requirement and the user carries design.
- SOLID as a checklist. Single responsibility is T2; the other four need an architecture document.
