# Changelog

## Unreleased

### TASK-1 Render each host's home correctly

- `{{AGENT_STATE}}` resolves to the clone in both renderers (`tools/state.py`'s `rewrite_paths`, `extensions/pi-state/translate.ts`'s `claudePaths`). Rendered files named a home that held none of the content: ten paths were missing on pi and eleven on Claude Code.
- `sync`, `pull` and `check` touch only the hosts this machine renders. The tracked `config.json` `hosts` key names them, `AGENT_STATE_HOSTS` overrides it, and both run when neither is set. `hosts` prints the list.
- Three shared lines name a skill or prompt directory relative to the harness home instead of one host's absolute path: `shared/agents/uiux-reviewer.md`, `shared/skills/instruction-craft/SKILL.md`.

## 0.1.0

First release of agent-state, a fork of `pi-state-sync` that serves pi and Claude Code from one tree.

- Rename the package, the command (`/agent-state`), and the repository to agent-state.
- One manager, `tools/state.py`, backs the pi extension and the Claude Code plugin, so the verbs cannot diverge: `pull`, `status`, `snapshot`, `push`, `sync`, `check`, `hosts`.
- Split the tree into `shared/` (both hosts) and `hosts/pi`, `hosts/claude` (host-only facts). `{{AGENT_STATE}}` is the only shared path token and resolves to each host's home.
- Render Claude Code's `CLAUDE.md`, agents, commands, skills, and output styles from the shared tree; Claude agents inherit the session model and effort.
- Add the Claude Code plugin: `/pull`, `/status`, `/snapshot`, `/push`, `/sync`, and a SessionStart/UserPromptSubmit hook that reports a behind checkout once per session.
- Fold the rig kit in: playbooks and agents live in `shared/`, the installer, harness writers, and bench tests live in `rig/`.
- Add `sync` and `check`; a dirty tree is refused by `pull`, never stashed.
- Refuse tracked host-only files at the root of the tree only, so `hosts/pi/settings.json` stays allowed.
- Refuse a literal secret in any tracked JSON file, not just two fixed names.
- Test guard: with `AGENT_STATE_TEST=1`, the manager refuses to render without explicit home overrides.

## 0.3.1 (upstream pi-state-sync)

- Fix existing-repository setup to clone and install remote state instead of attaching a dirty local repository.
- Preserve host-local credentials, sessions, package caches, and generated data during import.
- Back up replaced portable configuration to a timestamped sibling directory.
- Validate imported repositories before applying them and reload Pi afterward.
