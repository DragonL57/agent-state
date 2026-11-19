---
name: agent-state
description: Work with the Git-backed agent state shared by pi, Claude Code and Vibe — pull, status, snapshot, push, sync, the tracked/host-only split, cross-host translation, and new-host setup. Use when a task touches AGENTS.md, CLAUDE.md, skills, agents, prompts, playbooks, output styles, or the agent-state repository on any host.
---

# Agent state

One repository, `DragonL57/agent-state`, checked out on every machine and rendered into the configured homes by one manager, `tools/state.py`. The clone the script lives in is the default when `AGENT_STATE_DIR` is unset. Pi reaches it through the forked extension (`/agent-state`), Claude Code through the `agent-state` plugin's `/pull`, `/status`, `/snapshot`, `/push` and `/sync` commands, and Vibe through this skill (`/agent-state`). All three call the same script.

## The two halves

- **Shared, tracked, maintained for every host.** `shared/`: `AGENTS.md`, `agents/`, `playbooks/`, `prompts/`, `skills/`. These are written once in a harness-neutral voice and rendered per host.
- **Host-only, never tracked.** Credentials and runtime state: `auth.json`, `trust.json`, `models-store.json`, `.env`, sessions, package caches, each host's own `settings.json`, and Vibe's `config.toml` and `hooks.toml`. `tools/state.py` refuses to stage any of them, and the `.gitignore` keeps them out of `git status` noise. A host's tracked `hosts/<host>/settings.json` is the portable subset, merged into the home's file; keep credentials out of it, since the repository is public.

## Daily workflow, identical on every host

- `pull` before work on a host that may be behind
- edit, then `snapshot chore: <what changed>`
- `push` to publish; a host that wants the change runs `pull`

No command commits and pushes together. `pull` is fast-forward only and refuses a dirty tree.

| Host | Run it | Also available |
|---|---|---|
| pi | `/agent-state pull` | `/agent-state status`, `snapshot <msg>`, `push`, `sync` |
| Claude Code | `/pull` | `/snapshot`, `/push`, `/sync` |
| Vibe | `/agent-state`, then ask for `pull` | `status`, `snapshot <msg>`, `push`, `sync`, `check` |
| Any, in a shell | `python3 -I <clone>/tools/state.py <verb>` | |

## What the renderer translates

- **Contract.** `shared/AGENTS.md` becomes `~/.claude/CLAUDE.md` whole, with nothing stripped; on pi it becomes `~/.pi/agent/AGENTS.md` with `hosts/pi/AGENTS.append.md` appended, and on Vibe `~/.vibe/AGENTS.md` with `hosts/vibe/AGENTS.append.md` appended. `HARNESS.md` is copied beside each contract, because the contract tells the agent to read it there.
- **Agents.** `shared/agents/*.md` become Claude agent files with capitalised tools (`write` grants `Write, Edit`), `thinking`/`exclude_extensions` dropped, and every `{{AGENT_STATE}}` path pointing at the clone. Claude agents carry **no** `model:` or `effort:` so they inherit the session's. Vibe gets TOML subagents instead, described below.
- **Prompts** become `~/.claude/commands/*.md`, keeping `description` and `argument-hint`. Vibe has no custom slash commands, so they are not rendered there.
- **Skills** are symlinked into `~/.claude/skills/` and `~/.vibe/skills/`, except the pi-only ones (`pi-state-sync`).
- **Vibe agents.** `shared/agents/*.md` become `~/.vibe/agents/*.toml` with `agent_type = "subagent"`, Vibe tool names in `enabled_tools`, and the body as `instructions`. `model:` and `thinking:` are dropped, so a Vibe subagent inherits the session's model and effort. Every subagent gets `skill`, the only way Vibe reaches a skill. A declared Vibe subagent gets no MCP tool, because Vibe binds the child without integrations. Vibe's own `config.toml` is never rendered. `sync` removes an agent file it wrote and would no longer write, and a skill link it no longer writes. An agent file without the renderer's marker is the owner's and survives; under `skills/` only a real directory survives, so a hand-installed skill such as `kaneo-api` must be a directory, not a symlink.
- **Status line.** `shared/statusline/claude.sh` becomes `~/.claude/statusline.sh`, executable. `hosts/claude/settings.json` holds only the `statusLine` key, merged into the home's own file; every other key in that file stays put, and a hand-set `statusLine` is replaced on the next `sync`.

## Do not

- Do not hand-edit a rendered file (`~/.claude/CLAUDE.md`, `~/.claude/agents/*`, `~/.pi/agent/AGENTS.md`, `~/.vibe/AGENTS.md`, `~/.vibe/HARNESS.md`, `~/.vibe/agents/*.toml`). Edit `shared/` and run `sync`; `status` reports a host copy that drifted.
- Do not add a host-only file to `shared/`. Put it under `hosts/<name>/`.
- Do not commit `EXA_API_KEY`. `websearch.ts` reads `process.env.EXA_API_KEY`; set it in the login shell profile on each host.
- Do not refresh the modern-web-guidance corpus by accident. On a fresh clone run `bash shared/skills/modern-web-guidance/sync.sh` from the clone root once (about 700 KB from a pinned commit sha), then `--check`.
- The repository is **public**: every tracked file is world-readable. No credentials, no machine-identifying host paths, no operational detail that would be a problem if indexed.
