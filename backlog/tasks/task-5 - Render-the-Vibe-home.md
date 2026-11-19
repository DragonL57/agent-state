---
id: TASK-5
title: Render the Vibe home
status: Done
assignee: []
created_date: '2026-11-19T08:00:00Z'
updated_date: '2026-11-19T08:00:00Z'
labels: []
dependencies: []
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mistral Vibe is the third host. `sync` renders `~/.vibe/AGENTS.md` from the shared contract plus `hosts/vibe/AGENTS.append.md`, symlinks every shared skill into `~/.vibe/skills/`, and writes each shared agent as `~/.vibe/agents/<name>.toml` with `agent_type = "subagent"`, Vibe tool names in `enabled_tools`, and the body as `instructions`. `model:` and `thinking:` are dropped, so a Vibe subagent inherits the session's model and effort. Vibe's `config.toml` and `hooks.toml` stay host-only, and `shared/prompts/` is not rendered because Vibe has no custom slash commands. `check` reports a Vibe contract or agent TOML that drifted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `sync` with `vibe` configured writes `~/.vibe/AGENTS.md`, `skills/`, and `agents/*.toml`
- [x] #2 Every rendered agent TOML parses with Vibe's own `AgentProfile.from_toml`
- [x] #3 A Vibe subagent carries no `model` or `thinking`, and its `enabled_tools` are Vibe's names
- [x] #4 `check` names a hand-edited Vibe contract or agent TOML
- [x] #5 A machine that does not configure `vibe` renders no `~/.vibe`
- [x] #6 `npm run check` passes
<!-- AC:END -->
