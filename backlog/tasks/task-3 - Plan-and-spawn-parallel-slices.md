---
id: TASK-3
title: Plan and spawn parallel slices
status: Done
assignee: []
created_date: '2026-11-18T08:35:00Z'
updated_date: '2026-11-18T09:02:00Z'
labels: []
dependencies: []
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The contract and playbooks asked for parallel implementers without saying how a plan reaches that state. A plan written as numbered steps runs serially, and 'isolation: worktree' in the implementer's frontmatter put every slice on its own branch, where the orchestrator's diff never saw it. An unconsumed copy of the playbooks at shared/playbooks/ had already drifted from rig/.rig/playbooks/, the tree the contract reads.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 shared/AGENTS.md tells the orchestrator to plan slices that name their files and to run file-disjoint slices together
- [x] #2 rig/.rig/playbooks/workflow.md step 1 gives the three-pass plan and the Slices: line in three forms
- [x] #3 rig/.rig/playbooks/workflow.md step 5 carries one spawn pointer; parallel.md owns spawn timing, the brief rule, and the worktree recipe
- [x] #4 No agent frontmatter sets isolation, so a shared-checkout slice starts from the planning tree
- [x] #5 The worktree section names its git commands as ones the user approves, and the merge as approval-gated
- [x] #6 shared/playbooks/ is deleted or in sync with rig/.rig/playbooks/, and README names one playbook tree
- [x] #7 npm run check passes and sync then check exit 0 on this machine
- [x] #8 CHANGELOG [Unreleased] carries a TASK-3 entry
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. shared/AGENTS.md: the delegation rule names files and runs file-disjoint slices together.
2. workflow.md step 1: three passes (files, slices, steps) and the Slices: line; step 5: one spawn pointer to parallel.md.
3. parallel.md: spawn-timing section, brief-context section, worked plan template, and 'A slice on its own branch' with the approval-gated git commands.
4. Drop isolation from shared/agents/implementer.md; pass it per Agent call instead.
5. Settle the playbook tree: delete shared/playbooks/ (user decision), fix README.
6. CHANGELOG TASK-3 entry; sync, check, npm run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review round 1: spec 2 must-fix (shared/playbooks drift, worktree contradiction), 7 minor; taste 1 must-fix set, 17 minor. All applied except the shared/playbooks delete, which is the user's decision. Round 2: spec requested two fixes (README:62 line, workflow.md 'no git command' false once a worktree path exists), taste requested the one-message rule get one home. All applied: the rule lives at parallel.md:33, workflow.md:27 and AGENTS.md point at it.
<!-- SECTION:NOTES:END -->
