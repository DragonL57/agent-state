---
id: TASK-3
title: Make a git-record instruction close the work first
status: Done
assignee: []
created_date: '2026-11-17T07:50:00Z'
updated_date: '2026-11-17T08:01:00Z'
labels: []
dependencies: []
priority: high
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user's complaint: the agent pushes when told to push but never marks the task done. An instruction to record the work in git is a completion signal, so the tracker task must be closed before the command runs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The contract makes a git-record instruction close the tracker task and check the acceptance criteria before the command runs, and the suite fails when that rule is reworded.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered 2026-11-17. One bullet in # Git hygiene, three lines, plus two assertions in tests/test_harness.sh.

Final text:

- push, ship, land, and commit mean finish the work first: close the tracker task, check each acceptance criterion against the code, and report one that fails. The instruction also approves the commit that records the work.

Why it took three drafts: the first version said every todo to completed, which contradicted the existing rule that a todo becomes completed or blocked with a reason, and would have forced hiding abandoned work. It said the Backlog task, which named one tracker in a contract that says trackers are per project. It said completion signal, a coined phrase. And it left push costing two approvals, because an approval for an earlier step does not carry over.

Checks: tests/test_harness.sh 13 passed, 0 failed. Both new assertions proven to fire on a reworded copy. rig/tests/test_install.sh PASS. rig/sync.sh --check up to date. Negative constraints 63 before and after.
<!-- SECTION:NOTES:END -->
