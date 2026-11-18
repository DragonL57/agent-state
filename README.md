# agent-state

Git-backed configuration for **two agent hosts at once**: [pi](https://pi.dev) and [Claude Code](https://claude.com/claude-code).

One repository holds the contract, agents, playbooks, prompts, skills and rig kit. Each host keeps its own clone and renders its own home from it: pi into its agent home (`AGENTS.md`, `agents/`, `prompts/`, `skills/`, `settings.json`), Claude Code into `~/.claude` (`CLAUDE.md`, `agents/`, `commands/`, `skills/`) plus the Claude plugin. A change is written once, on either host, and the other host picks it up with its own `pull`.

## Install (Claude Code)

```text
/plugin install agent-state --marketplace DragonL57/agent-state
```

Then, once per machine:

```bash
git clone https://github.com/DragonL57/agent-state.git ~/agent-state
python3 -I ~/agent-state/tools/state.py pull
```

The plugin adds `/pull`, `/status`, `/snapshot`, `/push` and `/sync` (unprefixed, because a command named `status` would collide with Claude Code's own built-in), and a hook that tells a session, once, when this host is behind origin. `AGENT_STATE_DIR` points at a clone elsewhere; the default is `~/agent-state`.

## Install (pi)

```bash
pi install git:github.com/DragonL57/agent-state
```

Restart pi, then:

```text
/agent-state configure
```

This repository holds only the two shared halves (`shared/`, `hosts/`) and the tooling, so it does not live in the pi home itself: clone it to `~/agent-state`, set `AGENT_STATE_DIR` to it, and the extension's `/agent-state configure <clone-url>` connects `origin` to it. The pi home stays a host directory that the manager renders, next to the secrets and sessions that never leave it. Pass another clone URL as the argument to use a fork.

## The verbs

The same verbs run on both hosts and are implemented once, in `tools/state.py`.

| Verb | What it does |
| --- | --- |
| `pull` | Refuses a dirty tree, fast-forwards, re-renders both homes |
| `status` | Tree changes, commits behind/ahead of origin, host copies that drifted |
| `snapshot [message]` | Stages, refuses host-only files and literal secrets, commits **locally** |
| `push` | Uploads existing commits; never commits |
| `sync` | Re-renders both homes from the clone; never touches Git |
| `check` | The hook payload: nothing when in sync, one line per finding otherwise |
| `hosts` | Where the state, each home, and origin live |

No verb both records and publishes, and nothing runs Git from a lifecycle hook.

## Repository layout

```text
shared/              the source of truth for both hosts
  AGENTS.md          the full contract; Claude gets all of it, only paths differ
  agents/            pi-frontmatter agent definitions, translated for Claude
  playbooks/         the rig playbooks
  prompts/           slash commands (/duo exists on both hosts)
  skills/            SKILL.md trees
hosts/pi/            pi-only: AGENTS.append.md, the portable settings.json subset
hosts/claude/        Claude-only: output styles
rig/                 the rig kit (agents, skills, installers, bench tests)
plugin/              the Claude Code plugin (commands, hooks)
extensions/pi-state/ the pi extension: an /agent-state command over the manager
tools/state.py       the manager both hosts call
```

`{{AGENT_STATE}}` is the only path a shared file may use. The pi renderer resolves it to the pi home, the Claude renderer to `~/.claude`; a shared file that hard-codes either path is a bug.

## Translation rules

| pi | Claude Code |
| --- | --- |
| `tools: read, bash, write` | `tools: Read, Bash, Write, Edit` (`codemode` dropped) |
| `thinking:`, `exclude_extensions:` | dropped |
| `model:` on a shared agent | kept for pi, dropped for Claude: Claude agents inherit the session model and effort |
| `description:`, folded | `name:` added, description folded to one line |
| `prompts/*.md` | `commands/*.md` (description and `argument-hint` carry) |
| skill directories | symlinked into `~/.claude/skills/` (except pi-only skills) |

## Daily workflow

Pull before work on a host. After a change to the configuration, snapshot on the user's go-ahead, then push.

```text
# pi
/agent-state pull
/agent-state snapshot chore: tighten review playbook
/agent-state push

# Claude Code
/pull
/snapshot chore: tighten review playbook
/push
```

Never edit a rendered file (`~/.claude/CLAUDE.md`, the pi `AGENTS.md`): the next render overwrites it. Edit the shared tree and `sync`.

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

The suite renders into temporary homes only. With `AGENT_STATE_TEST=1` set, the manager refuses to run unless `AGENT_PI_HOME` and `AGENT_CLAUDE_HOME` are given, so a test can never write into the real homes.

## History

A fork of [moejay/pi-state-sync](https://github.com/moejay/pi-state-sync) (MIT), renamed and extended to serve pi and Claude Code from one tree.

## License

MIT
