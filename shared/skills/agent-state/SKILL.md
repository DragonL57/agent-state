---
name: agent-state
description: Work with the Git-backed agent state shared by pi and Claude Code — pull, status, snapshot, push, sync, the tracked/host-only split, cross-host translation, and new-host setup. Use when a task touches AGENTS.md, CLAUDE.md, skills, agents, prompts, playbooks, output styles, or the agent-state repository on either host.
---

# Agent state

One repository, `DragonL57/agent-state`, checked out on every machine at `~/agent-state` and rendered into the configured homes by one manager, `tools/state.py`. Pi reaches it through the forked extension (`/agent-state`) and Claude Code through the `agent-state` plugin's `/pull`, `/status`, `/snapshot`, `/push` and `/sync` commands. Both call the same script.

## The two halves

- **Shared, tracked, maintained for both hosts.** `shared/`: `AGENTS.md`, `agents/`, `playbooks/`, `prompts/`, `skills/`. These are written once in a harness-neutral voice and rendered per host.
- **Host-only, never tracked.** Credentials and runtime state: `auth.json`, `trust.json`, `models-store.json`, `.env`, sessions, package caches, and each host's own `settings.json`. `tools/state.py` refuses to stage any of them, and the `.gitignore` keeps them out of `git status` noise. A host's tracked `hosts/<host>/settings.json` is the portable subset, merged into the home's file; keep credentials out of it, since the repository is public.

## Daily workflow, identical on both hosts

- `pull` before work on a host that may be behind
- edit, then `snapshot chore: <what changed>`
- `push` to publish; a host that wants the change runs `pull`

No command commits and pushes together. `pull` is fast-forward only and refuses a dirty tree.

| Host | Run it | Also available |
|---|---|---|
| pi | `/agent-state pull` | `/agent-state status`, `snapshot <msg>`, `push`, `sync` |
| Claude Code | `/pull` | `/snapshot`, `/push`, `/sync` |
| Either, in a shell | `python3 -I ~/agent-state/tools/state.py <verb>` | |

## What the renderer translates

- **Contract.** `shared/AGENTS.md` becomes `~/.claude/CLAUDE.md` with the pi-only environment rules left out; on pi it becomes `~/.pi/agent/AGENTS.md` with `hosts/pi/AGENTS.append.md` appended.
- **Agents.** `shared/agents/*.md` become Claude agent files with capitalised tools (`write` grants `Write, Edit`), `thinking`/`exclude_extensions` dropped, and every `{{AGENT_STATE}}` path pointing at the clone. Claude agents carry **no** `model:` or `effort:` so they inherit the session's.
- **Prompts** become `~/.claude/commands/*.md`, keeping `description` and `argument-hint`.
- **Skills** are symlinked into `~/.claude/skills/`, except the pi-only ones (`pi-state-sync`).
- **Status line.** `shared/statusline/claude.sh` becomes `~/.claude/statusline.sh`, executable. `hosts/claude/settings.json` holds only the `statusLine` key, merged into the home's own file; every other key in that file stays put, and a hand-set `statusLine` is replaced on the next `sync`.

## Do not

- Do not hand-edit a rendered file (`~/.claude/CLAUDE.md`, `~/.claude/agents/*`, `~/.pi/agent/AGENTS.md`). Edit `shared/` and run `sync`; `status` reports a host copy that drifted.
- Do not add a host-only file to `shared/`. Put it under `hosts/<name>/`.
- Do not commit `EXA_API_KEY`. `websearch.ts` reads `process.env.EXA_API_KEY`; set it in the login shell profile on each host.
- Do not refresh the modern-web-guidance corpus by accident. On a fresh clone run `bash shared/skills/modern-web-guidance/sync.sh` from the clone root once (about 700 KB from a pinned commit sha), then `--check`.
- The repository is **public**: every tracked file is world-readable. No credentials, no machine-identifying host paths, no operational detail that would be a problem if indexed.
