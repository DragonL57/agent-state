---
id: TASK-4
title: Give the test suite its own git identity
status: Done
assignee: []
created_date: '2026-11-18T09:46:00Z'
updated_date: '2026-11-18T09:48:00Z'
labels: []
dependencies: []
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The GitHub Actions runner has no global git identity, so every test that commits died with 'fatal: empty ident name'. The suite now sets GIT_AUTHOR_* and GIT_COMMITTER_* once, for the git helper, the manager spawn, and the manager-with-homes spawn. The six per-repo git config user.* lines are deleted, so the identity has one owner.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The suite sets a git identity for the git helper, the manager spawn, and the manager-with-homes spawn
- [x] #2 No test sets a per-repo git config user.*
- [x] #3 npm run check passes with no global git config: HOME empty, GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1
- [x] #4 Removing the identity from the manager spawn makes at least one test fail
<!-- AC:END -->
