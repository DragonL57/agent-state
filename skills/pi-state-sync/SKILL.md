---
name: pi-state-sync
description: Work with the Git-backed pi state at ~/.pi/agent — /pistate pull, status, snapshot and push, the tracked-file allowlist, new-host setup, and the modern-web-guidance corpus. Use when a task touches pi settings, skills, extensions, prompts, themes, AGENTS.md, or the pi-state repository.
---

# Pi state sync

Pi state is Git-backed at `~/.pi/agent` on branch `main`, remote `https://github.com/DragonL57/pi-state` (private), via `npm:@moejay/pi-state-sync`. Git root is `~/.pi/agent` itself.

## Tracked

Allowlist: `.gitignore`, `README.md`, `settings.json`, `subagents.json`, `models.json`, `keybindings.json`, `AGENTS.md`, `SYSTEM.md`, `APPEND_SYSTEM.md`, `agents/`, `pandino/`, `extensions/`, `skills/`, `prompts/`, `themes/`.

Ignored: `.env`, `auth.json`, `trust.json`, `models-store.json`, `sessions/`, `npm/`, `git/`, `bin/`, `node_modules/`.

## Daily workflow

- `/pistate pull` before work on another host
- `/pistate status` to review
- `/pistate snapshot chore: <msg>` to commit
- `/pistate push` to push

Manual fallback: `git -C ~/.pi/agent status`, `git -C ~/.pi/agent push`.

## New host

1. `pi install npm:@moejay/pi-state-sync`
2. Start pi, then `/pistate configure existing DragonL57/pi-state`
3. `/login` per host
4. Set `EXA_API_KEY` in the shell env

## Do not

- Do not commit `EXA_API_KEY`. `websearch.ts` reads `process.env.EXA_API_KEY` directly; set it host-locally in the login shell profile (`~/.zshrc` on macOS, `~/.bashrc` on Linux). There is no dotenvx; `.env` is gitignored and unused.
- Do not expect `/pistate pull` to bring the modern-web-guidance corpus. `skills/modern-web-guidance/guides/` and `INDEX.md` are gitignored (209 guides, 1.97 MB), so pi-state carries only `SKILL.md` and `sync.sh`.
- Do not refresh that corpus by accident. On a fresh clone run `bash ~/.pi/agent/skills/modern-web-guidance/sync.sh` once (about 700 KB from a pinned commit sha), then `--check`. `--latest` installs upstream main and prints the sha; then set `PIN_SHA` in `sync.sh` and commit.
- Do not drop the validator patch: installed `core.ts` adds `ratio` and `not-needed` to `SAFE_LITERAL_SECRETS` to avoid false positives.
