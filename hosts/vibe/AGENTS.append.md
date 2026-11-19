# Vibe host facts

This host runs Mistral Vibe. Everything in the contract applies except where a
bullet below says otherwise. A table or fact below wins over the shared one.

- **The manager is the `agent-state` skill.** `/agent-state` loads it; every
  verb runs `python3 -I {{AGENT_STATE}}/tools/state.py <verb>`. Do not
  re-implement its git steps in the session.
- **Tools are Vibe's.** `read_file`, `write_file`, `edit`, `bash`, `skill`,
  `todo`, `wait`; subagents are spawned with `agents.spawn`, and there is no
  `task` tool. `agents.spawn` and `process.start` are reached through
  `run_typescript`. There is no `grep`, `find` or `ls` tool either: search and
  list through `bash`. Web search and fetch come from the
  `connector_web_search` connector, not from a builtin. The shared "Disabled
  built-in tools" bullet describes pi's `settings.json`, not this host.
- **The shared agents are subagents.** `~/.vibe/agents/*.toml` holds them with
  `agent_type = "subagent"`; spawn one by its `config_name`.
- **Vibe has no custom slash commands.** The shared prompts are not rendered
  here; ask for the same work in words.

## Tool routing (Vibe)

| Tool | Use it when | Never when |
| ---- | ----------- | ---------- |
| `todo` (action `write` / `read`) | Planning any 2+ step request, before anything else | Single trivial steps, pure conversation |
| `pkexec` | Privileged commands on Linux | Plain `sudo`, or a host without polkit (macOS: print the `sudo` command for the user) |
| Script file | Nested quotes, escapes, heredocs, JSON payloads for curl, anything over SSH | Fighting complex quoting inline |
| `git commit` through the bash tool | Every commit, `<task-code> <type>: <summary>` | Vague messages, unrelated changes in one commit |
| Slash commands | `/reload` after editing config or AGENTS.md, `/compact` to summarize context, `/model` / `/thinking` / `/theme`, `/mcp` for server status, `/skills` to browse skills | State-changing commands while a turn is busy |
| `mcp_chrome_devtools*` tools | Browser automation on the vibe-1/2/3 instances | A profile with a live Chrome, or pages another session opened |
| Skill files | Read the SKILL.md at the path in the skill tables before the work it covers | Doing that work from memory |

## Browser sessions (chrome-devtools MCP)

The servers live in `~/.vibe/config.toml`, which is host-only and never
rendered: a new machine adds them there before this section applies.

- Instances: `chrome-devtools` -> `vibe-1` (`mcp_chrome_devtools_*` tools),
  `chrome-devtools-2` -> `vibe-2`, `chrome-devtools-3` -> `vibe-3`.
- Do not reuse an instance whose profile already has a live Chrome: the second
  server joins that process and both sessions drive the same tabs. Claim the
  first free instance instead. One instance per session; no parallel sessions
  on one instance.
- Do not close, navigate, or reuse a page another session opened.
- Do not point at the `pi-1/2/3` profiles; those belong to pi.
- Free check before the first browser call:

```bash
for p in vibe-1 vibe-2 vibe-3; do
  if pgrep -f "[c]hrome .*--user-data-dir=$HOME/.cache/chrome-devtools-mcp/$p( |$)" >/dev/null; then echo "$p busy"; else echo "$p free"; fi
done
```

- Verify a rendered UI through the real page (`evaluate_script` for computed
  styles, geometry, contrast and DOM state; `list_network_requests` for the
  calls behind it). A screenshot is for the user to look at when they ask; it
  is never your evidence.

## Skill routing (Vibe)

The shared table applies. One more skill is installed here:

| Skill | Use it when | Never when |
| ----- | ----------- | ---------- |
| `kaneo-api` (`~/.vibe/skills/kaneo-api/SKILL.md`) | ANY Kaneo create/update/read/organize call: read the SKILL.md FIRST | Calling the API from memory |

`kaneo-api` holds the Bearer key, so it is host-only and never tracked.
Install it by hand as a real directory at `~/.vibe/skills/kaneo-api`; the
renderer never writes it, and it must not point into another host's home.

## Environment facts (Vibe)

- **Kaneo API:** deployed at `https://edtech.vmg.edu.vn` (workspace Edtech).
  Read `~/.vibe/skills/kaneo-api/SKILL.md` BEFORE any API call; it is
  the single source of truth for the API reference and the working Bearer key
  (the key lives only in the skill, never in this file). Never ask the user
  for the key; if it stops working, tell the user to recreate it in Settings →
  Account → API Keys and update the skill. Never touch the instance database
  directly (docker exec psql is forbidden by the user); use the HTTP API
  only. **Every task carries dates via the API fields: `startDate` = ngày
  tạo task, `dueDate` = ngày hoàn thành/deploy, luôn set cả hai, không để
  trống (chi tiết trong skill `kaneo-api`).**
