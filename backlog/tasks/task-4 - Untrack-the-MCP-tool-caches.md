---
id: TASK-4
title: Untrack the MCP tool caches
status: Done
assignee: []
created_date: '2026-11-17T08:16:00Z'
updated_date: '2026-11-17T08:17:00Z'
labels: []
dependencies: []
priority: low
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
mcp-cache.json and mcp-npx-cache.json are host-local runtime data: MCP tool schemas each host rebuilds on connect. They were tracked by accident, were never on the pi-state-sync allowlist, and were refreshed by hand in commit after commit. Ignore them and untrack them once.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both caches are in .gitignore and named in the pi-state-sync Ignored list.
- [x] #2 git ls-files no longer lists either cache, and both files still exist on disk.
- [x] #3 git status is clean of them, and the suite still passes.
<!-- AC:END -->
