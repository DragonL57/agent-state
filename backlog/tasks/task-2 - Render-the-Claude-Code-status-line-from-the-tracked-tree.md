---
id: TASK-2
title: Render the Claude Code status line from the tracked tree
status: Done
assignee:
  - '@DragonL57'
created_date: '2026-11-18T08:09:00Z'
updated_date: '2026-11-18T08:23:00Z'
labels: []
dependencies: []
ordinal: 2000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 shared/statusline/claude.sh is the one tracked copy and prints one line
- [x] #2 sync renders ~/.claude/statusline.sh executable and sets statusLine in ~/.claude/settings.json without touching other keys
- [x] #3 the tracked hosts/claude/settings.json carries only statusLine, so credentials stay out of Git
- [x] #4 check exits 1 naming the Claude statusline when the command, script, or key is missing, and 0 when rendered
- [x] #5 node --test and npx tsc --noEmit pass
- [x] #6 README, docs/design.md, shared/skills/agent-state/SKILL.md and CHANGELOG describe it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move the working statusline script to shared/statusline/claude.sh, with __field, __emit and __sgr reading STATUSLINE_JQ and STATUSLINE_PY so the test can hand it a stubbed jq. 2. tests/statusline.test.mjs: one case for a render, one proving the jq claim feeds the rendering. 3. hosts/claude/settings.json: the host-only subset {"statusLine": {...}} with {{AGENT_STATE}}. 4. tools/state.py: claude_paths resolves the token; render_home copies statusline/claude.sh (0755) and merges the paired settings.json keys into the rendered home's existing host-only settings.json. drift reports a mismatched command, missing script, or lost keys. 5. Docs: README layout and translation table, docs/design.md command boundaries and rendering, shared/skills/agent-state/SKILL.md, CHANGELOG.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: tracked script shared/statusline/claude.sh (one row, max context size, STATUSLINE_JQ/STATUSLINE_PY for tests); hosts/claude/settings.json holds only statusLine with {{AGENT_STATE}}; render_home copies the script 0755 and merges the subset into ~/.claude/settings.json; drift reports a lost key, missing script, or non-exec bit. Tests: tests/statusline.test.mjs, 4 cases. Evidence: node --test 32/32, npx tsc --noEmit clean, sync then check exit 0 on this machine, check exit 1 naming settings.json after removing statusLine, four mutations each red.

Review round 1: spec 5 must-fix, taste 2 must-fix + 6 minor, test 1 must-fix + 2 minor; all applied. Corrections: chmod +x on the tracked script; the render sets statusLine.command to {root}/shared/statusline/claude.sh so a moved clone is drift; check never blocks (a config error or nested clone is one stdout finding line, exit 1); the tracked subset must be a JSON object; claude_paths dropped in favour of rewrite_paths; the two settings helpers collapsed into claude_settings_write(write=False) for drift; PORTABLE_SETTINGS_KEYS deleted; dead script helpers removed (145 lines). Tests 34/34, four mutations red, tsc clean, real sync then check exit 0.

Review round 2 (delta): spec 2 must-fix + 4 minor, taste 1 must-fix + 5 minor, test 1 must-fix + 4 minor; all applied. The test must-fix was real: the merge test read a settings snapshot captured before sync, so it could never see the merge. Tests now re-read the file; verified by hand that theme and enableWorkflows survive a sync. Also: design.md no longer names the deleted claude_paths, says 'lost or changed a key', and names the render as the owner of statusLine; claude_settings_write renamed claude_settings_sync(root, home, mode='write'|'probe'); the script comment no longer claims the tests set the env vars; two stale comments removed. Evidence: node --test 34/34, tsc clean, live sync then check exit 0, home keeps theme.

Review round 3 (delta): spec-reviewer clean. Its one nit, the script header saying 'renders' where the renderer copies, applied. Final verification this session: npm run check 34/34, tsc clean; python3 -I tools/state.py sync -> 'Rendered 42 files into: pi, claude.', check exit 0, shared/statusline/claude.sh byte-identical to ~/.claude/statusline.sh; ~/.claude/settings.json keeps enableWorkflows, enabledPlugins, extraKnownMarketplaces, statusLine, theme with command /home/thelong/coding/agent-state/shared/statusline/claude.sh; the row renders '[agent-state]:main · Opus 5.5 / high · ctx ━━━━━━━━──────────── 42.5%/200k'.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The Claude Code status line now lives in the tracked tree. shared/statusline/claude.sh is the one copy (one row: dir, branch, model, effort, ctx bar with used % and max size). sync copies it to ~/.claude/statusline.sh mode 0755 and merges the tracked hosts/claude/settings.json subset into ~/.claude/settings.json, owning the statusLine key and pointing its command at the clone's script, so a moved clone shows as drift; every other key the user set stays. check reports a lost or changed key, a missing or non-executable script, a changed command, and a broken config as one line with exit 1, never a crash. hosts/claude/settings.json carries only statusLine, so no credential can ride in through it. README, docs/design.md, SKILL.md and CHANGELOG (TASK-2) describe it. Verified: 34/34 node tests, tsc clean, live sync then check exit 0, row rendered on this machine. Work is uncommitted; no commit was requested.
<!-- SECTION:FINAL_SUMMARY:END -->
