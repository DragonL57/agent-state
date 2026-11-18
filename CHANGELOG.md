# Changelog

## Unreleased

### TASK-3 Plan and spawn parallel slices

- `reviewing.md` files a change that its branch, its commits, and `backlog task list` all fail to tie to a task as `must-fix`. Before this, the class had no entry, so the gap went unreported. `spec-reviewer` had the same hole at its "find the spec" step 3, where "say so explicitly" let the review continue.
- `snapshot` refuses a change whose message's first word is no task file's id, when the change touches a file that is not prose (`.md`, `.mdx`, `.txt`, `.rst`). The guard runs only in a repo with a `backlog/` directory and a commit, and the refusal lists the ids it saw. The match ignores case, and `task-*` names no task.
- The README's daily workflow shows a task code in its `snapshot` message, since a code change without one is now refused.
- The delegation rule asks for a plan whose slices name their files. Two slices with no common file run at the same time, and a plan that cannot split says why.
- `workflow.md` step 1 writes the plan in three passes: the file map, then the slices, then the steps inside each. The plan ends with a `Slices:` line in one of three forms, so a serial chain is stated rather than implied.
- `parallel.md` owns spawn timing, the brief rule, a copyable plan template, and "A slice on its own branch". A worktree slice takes `isolation: "worktree"` per call and its git commands are the user's to approve.
- `shared/playbooks/` is deleted. Six of its nine files had drifted from `rig/.rig/playbooks/`, the tree the contract reads, and `sync` rendered its `.md` files to both hosts' command folders, so both carried the old rules.
- A worktree slice sets `isolation: "worktree"` on its own `Agent` call. In frontmatter it would put every slice on a new branch from the default branch, where the orchestrator's diff never sees its edits.

### TASK-2 Render the Claude Code status line from the tracked tree

- The status line is one tracked script, `shared/statusline/claude.sh`, rendered to `~/.claude/statusline.sh` and made executable. It prints one row: directory, branch, model, effort, and the context bar with its max size.
- `hosts/claude/settings.json` is the Claude portable subset, holding only the `statusLine` key. `sync` merges it into `~/.claude/settings.json` and leaves the owner's other keys alone; a home file that is not a JSON object is refused.
- The render owns the `statusLine` key whole: a hand-set one is replaced on `sync`. `check` names a Claude `settings.json` that lost or changed the key, and a missing or non-executable `statusline.sh`.
- The script reads its fields through `jq`, then `STATUSLINE_JQ` and `STATUSLINE_PY` pick a different reader when a machine or a test needs one. Its Python fallback runs with `-I`.

### TASK-1 Render each host's home correctly

- `{{AGENT_STATE}}` resolves to the clone in both renderers (`tools/state.py`'s `rewrite_paths`, `extensions/pi-state/translate.ts`'s `claudePaths`). Rendered files named a home that held none of the content: ten paths were missing on pi and eleven on Claude Code.
- `sync`, `pull` and `check` touch only the hosts this machine renders. The tracked `config.json` `hosts` key names them, `AGENT_STATE_HOSTS` overrides it, and both run when neither is set. `hosts` prints the list.
- Three shared lines name a skill or prompt directory relative to the harness home instead of one host's absolute path: `shared/agents/uiux-reviewer.md`, `shared/skills/instruction-craft/SKILL.md`.
- Snapshot reads a dotted version string (`3.1048.0`) as a version, so a lockfile's `@aws-sdk/token-providers` entry no longer blocks every commit.

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
