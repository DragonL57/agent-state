# Rendering: what each host gets

This machine renders the hosts it is configured for, and each host's files are
correct on their own. Run the checks below after a renderer change, on a new
machine, and whenever the rendered home and the clone can disagree.

Baseline for section 3: the 2026-11-18 run, which fails section 2's targets
check on both hosts it covered.

## (1) What a correct apply means

One repository serves every host. A machine may run any of them.
A rendered home stands alone:

1. **Installed.** The host's extension or plugin is enabled and points at this
   repository.
2. **Current.** The installed commit and the clone's `HEAD` are the same
   commit. The plugin pins its commit when it is installed.
3. **Configured alone.** A machine that runs one host renders that host only.
   Nothing in its files depends on another host's home.
4. **Targets exist.** Every absolute path a rendered file tells the agent to
   read exists on that machine. `HARNESS.md` is rendered beside the contract
   for this reason; check 3 covers absolute paths only.
5. **Convention.** Files land where the host reads them, in the host's format:
   pi gets `AGENTS.md`, `HARNESS.md`, `agents/`, `prompts/`, `skills/`;
   Claude gets `CLAUDE.md`, `HARNESS.md`, `agents/`, `commands/`, `skills/`;
   Vibe gets `AGENTS.md`, `HARNESS.md`, `skills/`, and `agents/*.toml`.

`shared/prompts/` is not rendered to Vibe. `~/.vibe/prompts/` holds custom
system prompts, chosen by `system_prompt_id`, not user commands, so a task
prompt placed there would be wrong. Vibe has no custom slash commands.

Checks 3 and 4 pass on every host; section 3 keeps the 2026-11-18 audit that
found them failing.

## (2) The checks

Each check prints findings or nothing. A pass prints nothing.

### Check 1, currency

```bash
root="${AGENT_STATE_DIR:-$HOME/agent-state}"   # set AGENT_STATE_DIR if the clone lives elsewhere
cat ~/.claude/plugins/installed_plugins.json
git -C "$root" rev-parse HEAD
python3 -I "$root/tools/state.py" status
python3 -I "$root/tools/state.py" check
```

Pass: the plugin's `gitCommitSha` equals `rev-parse`; `status` prints `clean`
and `upstream: 0 behind, 0 ahead`; `check` prints nothing. A failing `check`
prints one `agent-state: the <host> copy at <path> is stale. Run agent-state
sync.` line per file.

### Check 2, convention

```bash
ls ~/.pi/agent/AGENTS.md ~/.pi/agent/agents ~/.pi/agent/prompts ~/.pi/agent/skills
ls ~/.claude/CLAUDE.md ~/.claude/agents ~/.claude/commands ~/.claude/skills
ls ~/.vibe/AGENTS.md ~/.vibe/agents ~/.vibe/skills

grep -L '^name:' ~/.claude/agents/*.md

grep -o 'bash [^ ]*sync\.sh' ~/.claude/skills/modern-web-guidance/SKILL.md
```

Pass: every listed path exists, `grep -L` prints nothing, and the last line
prints `bash sync.sh`. The pi agents carry no `name:` line, so they are not in
the first `grep`. The contract's tool
table names tools that are also skills (`agent-state`, `apple-design`) and a
plain tool (`todo`), so it does not answer which skill directories a host must
have; this line checks one skill the renderer ships and that names its own
script.

### Check 3, targets

```bash
root="${AGENT_STATE_DIR:-$HOME/agent-state}"   # set AGENT_STATE_DIR if the clone lives elsewhere
mkdir -p "$root/decisions"   # the decision trail lives in the clone; git ignores it
for home in ~/.pi/agent ~/.claude ~/.vibe; do
    grep -hoE "($root[^ \`<>)*]*|~/[^ \`<>)*]*)" "$home"/AGENTS.md "$home"/CLAUDE.md "$home"/agents/*.md "$home"/agents/*.toml 2>/dev/null |
    sed "s|^~|$HOME|" | sort -u | while read -r p; do [ -e "$p" ] || echo "missing ($home): $p"; done
done
```

Pass: no `missing` line, except the host-only paths the Vibe append names
(`~/.vibe/config.toml`, `~/.vibe/skills/kaneo-api/SKILL.md`), which a new
machine installs by hand. `decisions/` is created on first use, so a fresh
clone needs the `mkdir` before the loop. The pattern matches the clone root and
`~/`, so a slash command such as `/reload` is not mistaken for a path. The `<>`
exclusion drops `<slug>`, a template, not a path, and `*` drops a glob such as
`~/.vibe/agents/*.toml`. `~/` is checked too: a rendered file that names
another host's home is a broken promise on a machine that runs only this host.
The 2026-11-18 baseline prints ten missing paths for pi and eleven for Claude.

### Check 4, one host alone

A machine that runs only Claude renders only `~/.claude`, and the reverse.

```bash
root="${AGENT_STATE_DIR:-$HOME/agent-state}"   # set AGENT_STATE_DIR if the clone lives elsewhere
pi="$(mktemp -d)"; claude="$(mktemp -d)"; vibe="$(mktemp -d)"
AGENT_PI_HOME="$pi" AGENT_CLAUDE_HOME="$claude" AGENT_VIBE_HOME="$vibe" \
    AGENT_STATE_HOSTS=claude python3 -I "$root/tools/state.py" sync
ls -A "$pi"          # expect nothing
ls -A "$vibe"        # expect nothing
ls "$claude"         # expect CLAUDE.md, HARNESS.md, agents, commands, settings.json, skills, statusline.sh
rm -rf "$pi" "$claude" "$vibe"
```

Pass: the unconfigured home stays empty. Every home goes to a temp directory,
because a check that falls back to the real home cannot fail: the real home
already exists and hides the write. `AGENT_STATE_HOSTS` and the tracked key it
falls back to are F2's subject.

## (3) Findings at the 2026-11-18 baseline

All three are closed. F3 closed on its acceptance criterion: nothing renders
into `rig/`, the old copies are gone, and check 3 stays silent. The `check`
line it proposed for a `rig/` directory was not added, because `drift()` has no
`rig/` check. The line references below are the 2026-11-18 tree, kept
as the record of what the audit found.

Severity follows `reviewing.md`: what breaks when the agent follows the file.

### F1, high: rendered paths name a home with none of the content

`rewrite_paths(text, root, home)` replaces `{{AGENT_STATE}}` with the host
home, and the content it names lives in the clone. The rendered files point at
`~/.claude/rig/.rig/playbooks/` and `~/.pi/agent/rig/.rig/playbooks/`. Neither
directory exists. Check 3 is the evidence: ten missing paths for pi, eleven for
Claude.

The clone is the right target. It is where playbooks, `prompts/`, skills and
`tools/state.py` live, and it exists on every machine that renders. The token
has 24 uses across 19 files. Each renderer site resolves it:

- the contract for each host,
- the agent bodies for each host,
- the command bodies,
- pi's prompts and skill text files,
- the Claude skills, which are links into the clone and need no rewrite.

Three shared lines name a host's own rendered output instead of clone content:
`shared/agents/uiux-reviewer.md:56` and `:66` name a skill directory, and
`shared/skills/instruction-craft/SKILL.md:187` names `prompts/`. Write those
relative to the harness's own directories, as `uiux-reviewer.md` already does
for a project's `.agents/skills/`. Each loses its literal "on pi" and "on
Claude Code" split, which becomes false once one text renders for both hosts.

Two renderers implement the rule. `tools/state.py` is the manager;
`extensions/pi-state/translate.ts:106` is the tested implementation that
`docs/design.md:7` says the manager mirrors. Both change together.

**Fix.** Resolve `{{AGENT_STATE}}` to `root` in `rewrite_paths` and in
`claudePaths`. Rewrite the three host lines relative to the skill and prompt
directories. Update the rule where it is stated:

- `docs/design.md:19-21`, the authoritative statement, plus one sentence in
  "The clone is not a home" (`:11-17`) that rendered text may name the clone.
- `README.md`, the `{{AGENT_STATE}}` paragraph.
- `shared/skills/agent-state/SKILL.md`, the "What the renderer translates"
  bullets: the path resolution, and the skill exclusion, which named
  `modern-web-guidance` and `verify-app` where the code's `PI_ONLY_SKILLS` is
  `{"pi-state-sync"}`.
- the docstrings at `tools/state.py` `rewrite_paths` and `claude_contract`, and
  `translate.ts` `claudePaths`.

Change the tests with it: `tests/translate.test.mjs:39-43`, `:56` and `:70`
assert the home resolution, and `tests/state.test.mjs`'s "sync renders every
configured home and check reports a stale one" pins the rendered contract.
`CHANGELOG.md:9` records what 0.1.0 shipped and stays as written; the change
gets an `[Unreleased]` entry.

**Acceptance.** Check 3 prints nothing for the configured hosts.

### F2, high: `sync` and `pull` render both hosts on every machine

`cmd_sync` and `cmd_pull` call `render_home` for pi and Claude unconditionally
(`tools/state.py:434`, `:439`). A Claude-only machine gets `~/.pi/agent`
written, and a pi-only machine gets `~/.claude` written. The owner wants each
machine to render the host it runs.

**Fix.** Add a `hosts` key to a tracked `config.json` at the clone root,
defaulting to `["pi", "claude"]`, and let `AGENT_STATE_HOSTS` (comma-separated)
override it. `sync`, `pull` and `check` loop over that list. Rendering an
unconfigured host is skipped, not an error. A pulled commit may reset the key
to the default; the machine's `AGENT_STATE_HOSTS` wins and the shell profile
carries it.

`drift` already prints nothing for a host whose contract file is missing, so a
skipped host stays silent in `status` and `check` without a new code path. One
gap stays open: `drift` checks only `AGENTS.md` for pi, so a stale
`~/.pi/agent/agents/*` passes `check`. That is `HARNESS.md` Open, not this
finding.

Update the README lines that promise both homes: the intro, `sync` under the
quick start, `configure`, the verb table's `pull` and `sync` rows, and the daily
workflow paragraph.

**Acceptance.** Check 4 passes for each host.

### F3, medium: the pi home holds stale playbook copies

The 2026-11-18 machine's `~/.pi/agent/rig/playbooks/` held nine playbooks at
their old path, five of them differing from `rig/.rig/playbooks/`, plus an old
`sync.sh`. Nothing renders into `rig/`. A pi-only machine can
read playbooks this repository no longer maintains.

**Fix.** After F1, render nothing into `rig/` and remove the old copies from
the pi home. `check` gains one line for a `rig/` directory it did not write.

**Acceptance.** Every path in check 3 exists, and `check` stays silent.

## (4) Out of scope

- Which plugins a host loads. That is the host's loader.
- The rules inside the contract. They stay; only where the token resolves
  changes.

## (5) What closed

A single command settles this at the end, run on a clean clone:

```bash
root="${AGENT_STATE_DIR:-$HOME/agent-state}"   # set AGENT_STATE_DIR if the clone lives elsewhere
python3 -I "$root/tools/state.py" sync && python3 -I "$root/tools/state.py" status
```

1. F1 closed in both renderers, and the rule is stated at every place it lives:
   `docs/design.md`, the README's `{{AGENT_STATE}}` paragraph,
   `shared/skills/agent-state/SKILL.md`, the docstrings.
2. The four tests named in F1 were changed to the new resolution, and
   `tests/state.test.mjs` gained one case per finding: a rendered host has no
   missing target, and a single-host render writes one home.
3. F2 closed: only the configured hosts render, and the README's five lines say
   so.
4. F3's cleanup landed with the same change.
5. Checks 1 to 4 pass on a clean clone, and section 3's baseline no longer
   reproduces.

When F1 to F3 are closed, their findings move to `HARNESS.md` Settled and this
document keeps its checks.
