---
id: TASK-1
title: Render each host's home correctly (F1-F3)
status: Done
assignee:
  - '@DragonL57'
created_date: '2026-11-18T07:37:00Z'
updated_date: '2026-11-18T07:55:00Z'
labels: []
dependencies: []
references:
  - docs/rendering.md
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The renderer resolves {{AGENT_STATE}} to the host home, but the content it names (playbooks, prompts, skills, tools/state.py) lives in the clone. Every rendered file names a path that does not exist: 10 on pi, 11 on Claude. sync and pull also render both hosts on every machine, so a Claude-only machine gets ~/.pi/agent written and the reverse. The pi home holds nine stale playbook copies the renderer never writes. Spec: docs/rendering.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 {{AGENT_STATE}} resolves to the clone in both tools/state.py rewrite_paths and extensions/pi-state/translate.ts claudePaths
- [x] #2 Check 3 in docs/rendering.md prints no missing path for either host
- [x] #3 AGENT_STATE_HOSTS and the tracked hosts key limit sync and pull to the configured hosts; check 4 passes for each host
- [x] #4 The three host-relative lines (uiux-reviewer.md:56, :66, instruction-craft/SKILL.md:187) no longer name a home
- [x] #5 The rule is updated in docs/design.md, README.md:112, shared/skills/agent-state/SKILL.md:32 and :34, and the docstrings
- [x] #6 tests/translate.test.mjs and tests/state.test.mjs pin the new resolution and gain one case per finding
- [x] #7 The stale ~/.pi/agent/rig/playbooks copies are removed and check reports nothing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Write failing tests in tests/state.test.mjs: a rendered host has no missing target, and a single-host render writes one home (AGENT_STATE_HOSTS).
2. Implementer changes tools/state.py: rewrite_paths resolves to root; sync/pull/check loop over the hosts config or AGENT_STATE_HOSTS; the config file joins the refuse list.
3. Implementer changes extensions/pi-state/translate.ts claudePaths to the same rule, and the three host-relative shared lines.
4. Update the rule where it lives: docs/design.md:11-21, README.md:112 and the five both-homes lines, shared/skills/agent-state/SKILL.md:32 and :34, the docstrings at tools/state.py:227/:273 and translate.ts:103.
5. Run checks 1-4 from docs/rendering.md and npm test.
6. Remove the stale ~/.pi/agent/rig/playbooks copies after the render is clean.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Step 1 done: two failing tests in tests/state.test.mjs (a rendered file names an existing target; AGENT_STATE_HOSTS limits the render) and three in tests/translate.test.mjs repointed to the clone resolution. Config file decision: tracked config.json at the clone root, AGENT_STATE_HOSTS wins over it.

Implementation landed. tools/state.py: rewrite_paths resolves to root; _hosts() reads AGENT_STATE_HOSTS then config.json then both, validates the list, wraps JSON errors in StateError; sync/pull/drift loop over it; check_homes refuses a render under AGENT_STATE_TEST when a configured host's home is unset. translate.ts: claudePaths resolves to stateRoot, the dead claudeHome parameter removed. Contract-relative paths (AGENTS.md, HARNESS.md, decisions/, skills/<name>/) now render home-relative in shared/AGENTS.md, the seven shared agents, duo.md. F3: ~/.pi/agent/rig removed with the owner's go-ahead. Evidence: 26/26 tests, tsc clean, check exit 0, check 3 empty, check 4 empty in both directions, rendered 41 files into pi, claude. Reviewers: spec changes needed -> fixed (json guard, hosts type, dead parameter, duplicate render loop, docstrings); taste changes needed -> fixed (module docstring, pull/sync dedupe, error string, docstrings, marketplace line); docs changes needed -> fixed (module header, rig-update both copies, marketplace, index.ts, design wording, sync.sh path); test changes needed -> fixed (config.json case, malformed config, drift gating, prompts in the target test).

Verification: node --test 27/27 pass; tsc clean; check exit 0; check 3 empty for both homes; check 4 empty in both directions (AGENT_STATE_HOSTS=claude -> pi empty; AGENT_STATE_HOSTS=pi -> claude empty); rendered 41 files into pi, claude. Mutation checks: drift gate removed, hosts ignored, old resolution at the prompt/agent/command site, guard demanding both homes, unknown-host check removed, guard disabled — each fails at least one test. ~/.pi/agent/rig removed with the owner's go-ahead (stale copies; nothing reads them). Correction reviewers: spec clean after R1/R2 fixed (doubled backticks, per-host guard); test-reviewer findings fixed (guard test, unknown-host case, check reports config errors as one line, prompts in the target test).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
F1-F3 of docs/rendering.md closed. {{AGENT_STATE}} now resolves to the clone in both renderers (tools/state.py rewrite_paths, translate.ts claudePaths), so every rendered path points at a file the machine has: check 3 is empty on pi and Claude. sync, pull and check render only the hosts in config.json's hosts key, overridden by AGENT_STATE_HOSTS, default both; check 4 passes in both directions. Contract-relative paths (AGENTS.md, HARNESS.md, decisions/, skills/<name>/) render relative to the home that holds the contract. Three shared lines dropped their hard-coded host home. The stale ~/.pi/agent/rig copies are gone. Rules updated in docs/design.md, README.md, shared/skills/agent-state/SKILL.md, the module docstring, and both copies of rig-update. CHANGELOG [Unreleased] entry added. Evidence: 27/27 tests, tsc clean, check exit 0. Open follow-ups recorded in HARNESS.md: pi drift checks AGENTS.md only; a malformed config.json now fails check with one line, which is exit 1 (the hook does not block, it reports).
<!-- SECTION:FINAL_SUMMARY:END -->
