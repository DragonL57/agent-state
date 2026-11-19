# agent-state

Git-backed configuration for **three agent hosts**: [pi](https://pi.dev), [Claude Code](https://claude.com/claude-code), and [Mistral Vibe](https://docs.mistral.ai/vibe/code/overview).

One repository holds the contract, agents, playbooks, prompts, skills and rig kit. Each machine keeps one clone and renders the homes of the hosts it runs: pi into its agent home (`AGENTS.md`, `HARNESS.md`, `agents/`, `prompts/`, `skills/`, `settings.json`), Claude Code into `~/.claude` (`CLAUDE.md`, `HARNESS.md`, `agents/`, `commands/`, `skills/`, `statusline.sh`, the `statusLine` key in `settings.json`) plus the Claude plugin, and Vibe into `~/.vibe` (`AGENTS.md`, `HARNESS.md`, `skills/`, `agents/` as TOML subagents). A machine that runs one host renders one home. A change is written once, on any host, and the others pick it up with their own `pull`.

## Quick start

One clone per machine serves every host on it. Clone it beside the homes, never inside one:

```bash
git clone https://github.com/DragonL57/agent-state.git ~/agent-state
```

The clone is the state; the homes (`~/.pi/agent`, `~/.claude`, `~/.vibe`) are rendered *from* it. Point the hosts at the clone with `AGENT_STATE_DIR`, then render:

```bash
export AGENT_STATE_DIR=~/agent-state    # add to your shell profile
python3 -I ~/agent-state/tools/state.py sync
```

`sync` writes the configured homes from the clone. Everything below is the per-host install.

> The clone the script lives in is the default when `AGENT_STATE_DIR` is unset, so the export is optional — set it if you run the script from somewhere other than the clone.

### Which hosts a machine renders

`sync`, `pull` and `check` touch only the hosts this machine is configured for. The tracked `config.json` names them:

```json
{ "hosts": ["pi", "claude", "vibe"] }
```

A machine that runs one host writes its own list, for example `{ "hosts": ["pi"] }`.

`AGENT_STATE_HOSTS` (comma-separated, for example `AGENT_STATE_HOSTS=claude,vibe`) overrides the file, so set it in the machine's shell profile when a pull rewrites `config.json` with the wrong list. With neither set, all three homes render. `hosts` prints the list the manager is using.

## Install (Claude Code)

```text
/plugin install agent-state --marketplace DragonL57/agent-state
```

The plugin adds `/pull`, `/status`, `/snapshot`, `/push` and `/sync` (unprefixed, because a command named `status` would collide with Claude Code's own built-in), and a hook that tells a session, once, when this host is behind origin.

## Install (Vibe)

Vibe has no plugin to install: the clone is the install. Run the quick start's `sync` with `vibe` in the host list:

```bash
AGENT_STATE_HOSTS=vibe python3 -I ~/agent-state/tools/state.py sync
```

Then start Vibe. `/reload` picks up the contract and the skills. A new or changed agent TOML needs a Vibe restart.

`sync` writes `~/.vibe/AGENTS.md` and `~/.vibe/HARNESS.md`, links every shared skill except the pi-only ones into `~/.vibe/skills/`, and renders each shared agent as a TOML subagent in `~/.vibe/agents/`. Vibe's own `config.toml`, `hooks.toml`, `.env`, sessions and caches stay host-only and are never tracked.

The verbs are the `agent-state` skill: type `/agent-state` in Vibe, then ask for `pull`, `status`, `snapshot`, `push`, `sync`, `check` or `hosts`. The skill runs `~/agent-state/tools/state.py`; it does not re-implement the git steps.

Vibe has no custom slash commands, so `shared/prompts/` is not rendered there. Ask for the same work in words.

## Install (pi)

```bash
pi install git:github.com/DragonL57/agent-state
```

Restart pi, then connect the clone from the quick start:

```text
/agent-state configure
```

`configure` connects `origin` if the clone has none, then renders the configured homes. A clone made with `git clone` already has `origin`, so it reports "already configured" and stops; in that case the quick start's `sync` is the step that renders. If the clone does not exist it errors with the `git clone` line rather than creating state inside the pi home. Pass a URL to use a fork: `/agent-state configure https://github.com/you/agent-state.git`.

### Migrating off the old `pi-state` layout

Earlier versions kept the checkout *inside* the pi home, so `~/.pi/agent` was the repository itself. That no longer works: the clone renders the pi home, and the manager refuses a clone nested inside a home it writes, because rendering would overwrite the clone's own sources.

Move it out in one step:

```bash
git clone https://github.com/DragonL57/agent-state.git ~/agent-state
export AGENT_STATE_DIR=~/agent-state
python3 -I ~/agent-state/tools/state.py sync
```

The old layout tracked about 200 files that the current tree derives instead. Do **not** delete `~/.pi/agent` to clean this up: it also holds host-only state that never belonged in the repository — `auth.json`, sessions, package caches — and it may hold uncommitted edits. Only the rendered leftovers are safe to remove, and only after `~/agent-state` renders:

```bash
# Old rendered playbooks; the kit's sources are now rig/.rig/playbooks/.
rm -rf ~/.pi/agent/rig/playbooks

# The old checkout's own git metadata, once ~/agent-state is rendering.
# This does not touch auth.json, sessions/, npm/ or any untracked file.
rm -rf ~/.pi/agent/.git
```

Before removing `.git`, check for uncommitted work you care about:

```bash
git -C ~/.pi/agent status --short
```

Anything listed there is not in the repository; either move it into `~/agent-state` and `snapshot` it, or keep the file where it is. Remove `.git` only when that list is empty or accounted for.

## The verbs

The same verbs run on every host and are implemented once, in `tools/state.py`.

| Verb | What it does |
| --- | --- |
| `pull` | Refuses a dirty tree, fast-forwards, re-renders the configured homes |
| `status` | Tree changes, commits behind/ahead of origin, host copies that drifted |
| `snapshot [message]` | Stages, refuses host-only files and literal secrets, commits **locally** |
| `push` | Uploads existing commits; never commits |
| `sync` | Re-renders the configured homes from the clone; never touches Git |
| `check` | The hook payload: nothing when in sync, one line per finding otherwise |
| `hosts` | The configured hosts, where the state, each home, and origin live |

No verb both records and publishes, and nothing runs Git from a lifecycle hook.

## Repository layout

```text
shared/              the source of truth for every host
  AGENTS.md          the full contract; every host gets all of it, only paths differ
  agents/            pi-frontmatter agent definitions, translated per host
  prompts/           slash commands (/duo exists on pi and Claude Code)
  skills/            SKILL.md trees
  statusline/        the Claude Code status line, rendered to ~/.claude/statusline.sh
hosts/pi/            pi-only: AGENTS.append.md, the portable settings.json subset
hosts/claude/        Claude-only: output styles, the portable settings.json subset
                     (the tracked statusLine key, merged into the home's file)
hosts/vibe/          Vibe-only: AGENTS.append.md
rig/                 the rig kit: agents, skills, installers, bench tests, and
                     .rig/playbooks/ (the playbooks the contract reads)
plugin/              the Claude Code plugin (commands, hooks)
extensions/pi-state/ the pi extension: an /agent-state command over the manager
tools/state.py       the manager every host calls
```

`docs/subagents.md` compares the ways Claude Code runs work at once and maps them onto this setup.

`{{AGENT_STATE}}` is the only path a shared file may use. Every renderer resolves it to the clone, where playbooks, prompts and `tools/state.py` live; a shared file that hard-codes a home path is a bug.

## Translation rules

| pi | Claude Code | Vibe |
| --- | --- | --- |
| `tools: read, bash, write` | `tools: Read, Bash, Write, Edit` (`codemode` dropped) | `enabled_tools = ["read_file", "bash", "write_file", "edit", "skill"]` (`find`/`ls` dropped: the shell covers them; `skill` is always added) |
| `thinking:`, `exclude_extensions:` | dropped | dropped |
| `model:` on a shared agent | kept for pi, dropped for Claude: Claude agents inherit the session model and effort | dropped: Vibe subagents inherit the session model and effort |
| `description:`, folded | `name:` added, description folded to one line | `description` kept, folded to one line |
| agent file | `agents/<name>.md` | `agents/<name>.toml`, `agent_type = "subagent"`, body as `instructions` |
| `prompts/*.md` | `commands/*.md` (description and `argument-hint` carry) | not rendered: Vibe has no custom slash commands |
| skill directories | symlinked into `~/.claude/skills/`; every rendered skill is shared, so every host receives the same rendered set | symlinked into `~/.vibe/skills/` |
| `shared/statusline/claude.sh` | copied to `~/.claude/statusline.sh`, executable | not rendered |
| `hosts/claude/settings.json` | its keys merged into `~/.claude/settings.json`; every other key stays | not rendered: Vibe's `config.toml` stays host-only |

## Daily workflow

The verbs are automated, and identical on every host:

```text
# pi
/agent-state pull
/agent-state snapshot "TASK-3 chore: tighten review playbook"
/agent-state push

# Claude Code
/pull
/snapshot "TASK-3 chore: tighten review playbook"
/push

# Vibe
/agent-state
# then ask for: pull, snapshot "TASK-3 chore: tighten review playbook", push
```

The message starts with the code of the Backlog task the change serves.

`snapshot` refuses a change whose message's first word is no task id, when the change touches a file that is not prose (`.md`, `.mdx`, `.txt`, `.rst`). A repo without a `backlog/` directory, and a repo before its first commit, have no such rule.

`pull` is the one to run first on any machine: it fast-forwards the clone and re-renders the configured homes, so it is also how a host picks up a change made on another. Without a plugin command, call the manager directly and get the same result:

```bash
python3 -I ~/agent-state/tools/state.py pull     # fetch + fast-forward + re-render
python3 -I ~/agent-state/tools/state.py status   # what changed, and what drifted
```

`pull` refuses a dirty tree rather than merging over it. `snapshot` records locally, `push` publishes; no single verb does both, so a change is reviewed before it leaves the machine.

Never edit a rendered file (`~/.claude/CLAUDE.md`, the pi `AGENTS.md`, `~/.vibe/AGENTS.md`, `~/.vibe/agents/*.toml`): the next render overwrites it. Edit the shared tree and `sync`.

## Secrets

Host-local credentials stay out of the tree: `auth.json`, `.env.keys`, sessions, and caches are refused at snapshot time. Provider keys in a tracked JSON file must be references (`$VAR`, `!command`), never literals; the manager refuses a literal. Encrypt a committed `.env` with [dotenvx](https://dotenvx.com/docs/quickstart/encryption) and keep `.env.keys` outside Git.

## Who this repository is for

It is public because the owner chose to keep it public. Read `shared/AGENTS.md` before relying on anything here: it is written for one person's machines, and it states operating rules, git hygiene, and environment facts that describe a private setup. It is not a general-purpose template.

## Development

```bash
npm test          # node --test: manager, translation, extension helpers
npm run typecheck
npm run check     # both
```

The suite renders into temporary homes only. With `AGENT_STATE_TEST=1` set, the manager refuses to run unless every configured host's home variable is given (`AGENT_PI_HOME`, `AGENT_CLAUDE_HOME`, `AGENT_VIBE_HOME`). The guard only covers the calls that set it, so every test that spawns the manager hands over all three homes, and the suite clears an inherited `AGENT_STATE_HOSTS` before it starts.

## History

A fork of [moejay/pi-state-sync](https://github.com/moejay/pi-state-sync) (MIT), renamed and extended to serve pi, Claude Code and Vibe from one tree.

## License

MIT
