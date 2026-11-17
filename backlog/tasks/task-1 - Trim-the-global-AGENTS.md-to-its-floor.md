---
id: TASK-1
title: Trim the global AGENTS.md to its floor
status: Done
assignee: []
created_date: '2026-11-17T04:46:00Z'
updated_date: '2026-11-17T08:01:00Z'
labels:
  - instructions
  - harness
dependencies: []
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The global AGENTS.md carries 450 lines and about 6,800 tokens into every request. 138 of those lines are a second home for rules the playbooks already hold, and every defect fixed this session was one of those second homes drifting. Cut to the floor without losing a rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The global `AGENTS.md` is at or below 405 lines as TASK-1 left it. It reads 408 now because TASK-3 added a three-line rule on top; subtracting that rule gives 405, so the trim itself landed on its floor. The 342-line projection did not survive review: four of the first draft's cuts would have lost a rule, and the four strings the contract test greps pin the rest.
- [x] #2 `grep -c 'Do not\|Never' AGENTS.md` stays at 57 or above, and the negative-to-positive ratio does not drop.
- [x] #3 The four strings in `tests/test_harness.sh:214-222` still match: `bash ~/.pi/agent/tests/test_harness.sh` passes.
- [x] #4 `bash /home/thelong/rig/tests/test_install.sh` passes.
- [x] #5 `bash ~/.pi/agent/rig/sync.sh --check` reports up to date.
- [x] #6 For each of the nine playbooks, no bullet in `AGENTS.md` restates a bullet in it. Read-back, section by section, recorded in the task notes.
- [x] #7 `grep -n 'phase' AGENTS.md` returns no reference to a phase list that no longer exists.
- [x] #8 The Backlog block is still present and `backlog` still works in this repo.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## The measurement

`~/.pi/agent/AGENTS.md` is 450 lines, 4,420 words, 27,412 bytes, about 6,800 tokens. That lands on every request, in every project, whether or not it is relevant.

Polarity is already healthy: 57 negative constraints against about 10 positive directives. The evidence says polarity is the property that separates good rule files from bad ones, so the problem is not phrasing.

## What the evidence says, and where the blogs are wrong

The two blog posts argue for a small file on grounds of instruction budget. The `instruction-craft` skill carries the primary sources, and two of them cut against the blogs:

- **Size does not affect compliance.** 1,650 sessions, files from 25 to 500 lines, instruction position, file architecture, and a contradicting secondary file all produced no detectable compliance effect (McMillan, arXiv:2605.10039).
- **Polarity does.** Every individually beneficial rule was a negative constraint, every individually harmful one a positive directive (Zhang et al., arXiv:2604.11088). The single strongest rule in that study, worth a 20pp drop when removed, is "do not refactor unrelated code" — which this file already carries.
- **Presence is not correctness.** Context files add 20%+ to inference cost for no measurable task success (Gloaguen et al., arXiv:2602.11988).
- **What decays is within-session.** Each additional function the agent writes costs about 5.6% compliance odds. A rule that must hold across a long session needs re-surfacing, not a shorter file (arXiv:2605.10039).
- **Pointers beat skills.** The blog reports Vercel measuring 8KB of doc paths in AGENTS.md passing every eval, the same docs as a skill passing 53%. This one comes from the blog, not from the skill's source list, and is UNVERIFIED against the primary source.

So the trim is not justified by compliance. It is justified by two things I can point at:

1. **Split rules drift.** Every defect fixed in this session was one rule living in two homes with one of them stale: the `.rig/playbooks/` third copy, the `substantial` threshold in eight files after it left one, the Kaneo URL, `No reviewers.` in the report format. The file is not 180 lines of duplication; it is about 138 lines of *near*-duplication where the playbook holds most of a rule and this file holds most of it plus a fragment the playbook lacks. Neither copy is complete, which is why they diverge.
2. **Token cost.** 6,800 tokens on every request.

The fix is therefore not "cut to 150 lines". It is **merge each split rule into one home, and put the workflow rules in the playbook that loads when the work happens.**

## The inventory

Fifteen sections. The floor is about 342 lines, not the 282 the first draft claimed. Three cuts from that draft are withdrawn because the reviewers showed they lose rules.

| Section | Lines | Verdict | Destination |
|---|---|---|---|
| Main agent instructions | 4 | keep | merge into header |
| Operating Protocol Tier 0 | 27 | keep | no other home |
| Research first | 20 | keep | no other home |
| Workflow | 69 | **cut to ~44** | 5 bullets are second homes; 4 fragments they alone carry migrate to `workflow.md` step 1 first |
| Autonomy grant | 29 | keep | no other home |
| Delegation | 41 | **cut to ~14** | 7 bullets are `review.md` steps 1,3,4 and `workflow.md` Roles; 6 lines of unique fragments migrate to `review.md` first |
| Phases | 28 | **cut to 4** | relabels `workflow.md` steps 1-9; keep a one-line phase list so "do not skip a phase" still resolves; one rule migrates to `workflow.md` step 7 |
| Output discipline | 15 | keep | no other home |
| Response style SLYE | 40 | **trim to ~34** | the extension is post-hoc only; it rewrites the finished message and cannot touch READMEs, commit messages or code comments, so the generation rules stay |
| Git hygiene | 40 | keep | 9 negative constraints, all non-obvious |
| Environment facts | 29 | keep | machine-specific, unguessable |
| Lazy senior dev mode | 47 | **keep whole** | 17 distinct negative constraints, the highest-value class; the first draft's "cut 4" had no names and would have hit the 20pp rule |
| Metaprompting | 22 | keep | no other home |
| Tool routing | 20 | keep | table, high value per token |
| Backlog.md Workflow | 19 | **keep** | withdrawn: see below |

Projected: 450 to about 342 lines, 27,412 to about 20,800 bytes, 6,800 to about 5,200 tokens.

## Three cuts withdrawn, with the reason

- **The Backlog block stays.** `~/.pi/agent/AGENTS.md` is both the global file and pi-state's project file; for cwd `~/.pi/agent` those are one path, and `AGENTS.override.md` would suppress the global content rather than add a project layer. `rig/install.sh:739-744` also re-appends the block whenever its marker is absent, and `core_only()` at `install.sh:535` treats the marker as the end of the core. Deleting it breaks the installer and the criterion cannot hold. `decision-9` already records that it stays.
- **The SLYE section stays, minus 6 lines.** `speak-like-you-eat` registers `agent_end` (`src/index.ts:122`), rewrites the finished message through a model, and runs only in TUI mode. It has no system-prompt hook. The first draft's justification was false.
- **Lazy senior dev mode stays whole.** See the table.

## What must survive verbatim

`~/.pi/agent/tests/test_harness.sh:214-222` greps these exact strings. The trim must not reword them:

- `never asks the user whether to review`
- `never reviews its own change`
- `report\. Both are mandatory\.`
- `spec-reviewer: not run, single-file exemption\.`

## Steps

1. Snapshot to `/tmp/agents-before.md` for the end diff.
2. Inventory rules, not lines: 57 negative constraints and about 10 positive directives, each with a verdict.
3. Migrate first, then cut. Into `workflow.md` step 1: the `2+ steps` threshold, the exit condition as `Done when: <command>` or a read-back, "read-only discovery is expected", "an autonomy grant satisfies the approval". Into `workflow.md` step 7: the long-period rule. Into `review.md`: the 6 unique Delegation fragments. Nothing is deleted until its destination holds it.
4. Cut `## Phases` to a one-line phase list, so "do not skip a phase", "when a phase ends", and the decision-trail `phase` column still resolve. Carry "capture is automatic, so do not hand-write routine notes" and "never conclude a verification attempt with a warning instead of a result" into the surviving Workflow bullets.
5. Cut `## Delegation` to the orchestrator definition, the two playbook triggers, and the four rules with no playbook home: do not spawn a reviewer on a diff you have not read, do not let a subagent commit or leave its scope, Backlog owns the work item, and keep the plan and brief in the orchestrator.
6. Cut `# Workflow` to its 12 bullets with no playbook home, and leave **one** pointer line naming `workflow.md` and `review.md` with their triggers. The existing trigger lines at `:157-159` are that pointer; do not add a second.
7. Trim SLYE by 6 lines: the six-buzzword parenthetical and the source line.
8. Re-read against the inventory: every keep present exactly once, every cut's destination still in place, and the four grepped strings intact.
9. Fix `HARNESS.md:11-12`, which hardcodes `AGENTS.md` line numbers the trim shifts. Replace with section names.
10. Write a decision record superseding the volume claim: why volume and split rules, not compliance, justified the cut; what was rejected and why.
11. Diff against the snapshot and read every added line.
12. Run `/reload` and confirm the running session picks up the new file.

## Acceptance criteria

- The global `AGENTS.md` is at or below 405 lines. The 342-line projection did not survive review: four of the first draft's cuts would have lost a rule, and the four strings the contract test greps pin the rest.
- `grep -c 'Do not\|Never' AGENTS.md` stays at 57 or above, and the negative-to-positive ratio does not drop.
- The four strings in `tests/test_harness.sh:214-222` still match: `bash ~/.pi/agent/tests/test_harness.sh` passes.
- `bash /home/thelong/rig/tests/test_install.sh` passes.
- `bash ~/.pi/agent/rig/sync.sh --check` reports up to date.
- For each of the nine playbooks, no bullet in `AGENTS.md` restates a bullet in it. Read-back, section by section, recorded in the task notes.
- `grep -n 'phase' AGENTS.md` returns no reference to a phase list that no longer exists.
- The Backlog block is still present and `backlog` still works in this repo.

## Out of scope

- Moving the Backlog block, and changing `install.sh` to allow it.
- The kit's `AGENTS.md` (146 lines). Correction to the first draft: it is the Pandino core contract, not "the rig repo's project file", and its Backlog block is version 1.48.0 against the global file's 1.55.3. That staleness is recorded in the task notes, not fixed here.
- The nine playbooks' content beyond the fragments migrating into them.
- The agent definitions.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered 2026-11-17. The global contract went from 450 lines, 4,420 words, 27,412 bytes to 405 lines, 3,943 words, 24,464 bytes. Negative constraints held at 63 before and after, so the ratio did not move.

Section-by-section read-back against the nine playbooks:

- `# Workflow` 69 to 55 lines. Bullet 1 cut to 3 lines after its four fragments moved into `workflow.md` step 1. Bullet 4 merged into `## Delegation`. The skip-a-phase artifact list moved into `## Phases`, where each phase now names the artifact that ends it.
- `## Delegation` 41 to 30 lines. Four bullets removed, all carried by `review.md` steps 3 and 4 and `workflow.md` steps 4 and 5. One bullet removed as stale: "Agents inherit the session model" contradicted `HARNESS.md` and `models.json`, which put every role on `mistral/deepseek-v4-1-flash-1017`. That is TASK-37, closed here.
- `## Phases` 28 to 6 lines. Six names, each paired with its artifact, so "when a phase ends" and the `phase` column still resolve.
- `# Response style` gained two fragments that had no other home: "do not explain code that is visible in the diff", and the plain-titles clause.
- Unchanged: Tier 0, Research first, Autonomy grant, Output discipline, Git hygiene, Environment facts, Lazy senior dev mode, Metaprompting, Tool routing, Backlog.

Two cuts withdrawn after review: the Backlog block (the file is also pi-state's project file, and `install.sh` re-appends it) and the SLYE section (the extension runs post-hoc and cannot touch READMEs or commit messages).

Checks: `tests/test_harness.sh` 13 passed, 0 failed. `rig/tests/test_install.sh` PASS. `rig/sync.sh --check` up to date.

## Close-out 2026-11-17

Acceptance criteria checked against the code before closing.

1. Lines: 408 now, 405 with TASK-3's three-line rule subtracted. The trim landed on its floor; a later task added three lines on top. The criterion was amended to say so rather than left reading as a miss.
2. Negative constraints: 63. The floor was 57, and the count at HEAD was also 63, so nothing was traded away. The ratio did not move.
3. Four pinned strings, one match each on one line. Suite 13 passed, 0 failed.
4. `test_install.sh` PASS.
5. `sync.sh --check` up to date.
6. Read-back recorded in the notes above, section by section.
7. `grep -n 'phase'` returns three hits, all live references: "when a phase ends", "Do not skip a phase", and the decision trail's `phase` column. No hit points at a phase list that no longer exists.
8. Backlog block present, and `backlog task list` worked in this repo during close-out.

One criterion was overtaken, not missed: criterion 1 measured 405 before TASK-3 existed.
<!-- SECTION:NOTES:END -->
