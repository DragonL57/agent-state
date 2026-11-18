# Rendering: what each host gets

This machine renders the hosts it is configured for, and each host's files are
correct on their own. Run the checks below after a renderer change, on a new
machine, and whenever the rendered home and the clone can disagree.

Baseline for section 3: the 2026-11-18 run, which fails section 2's targets
check on both hosts.

## (1) What a correct apply means

One repository serves both hosts. A machine may run both, either, or the other.
A rendered home stands alone:

1. **Installed.** The host's extension or plugin is enabled and points at this
   repository.
2. **Current.** The installed commit and the clone's `HEAD` are the same
   commit. The plugin pins its commit when it is installed.
3. **Configured alone.** A machine that runs one host renders that host only.
   Nothing in its files depends on the other host's home.
4. **Targets exist.** Every path a rendered file tells the agent to read
   exists on that machine.
5. **Convention.** Files land where the host reads them, in the host's format:
   pi gets `AGENTS.md`, `agents/`, `prompts/`, `skills/`; Claude gets
   `CLAUDE.md`, `agents/`, `commands/`, `skills/`.

Today the renderer fails 3 and 4 on both hosts. Section 3 has the evidence.

## (2) The checks

Each check prints findings or nothing. A pass prints nothing.

### Check 1, currency

```bash
root="${AGENT_STATE_DIR:-$HOME/agent-state}"
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

grep -L '^name:' ~/.claude/agents/*.md ~/.pi/agent/agents/*.md

grep -o 'bash [^ ]*/skills/[a-z-]*/sync.sh' ~/.claude/skills/modern-web-guidance/SKILL.md
```

Pass: every listed path exists, `grep -L` prints nothing, and the last line
prints one path ending in `modern-web-guidance/sync.sh`. The contract's tool
table names tools that are also skills (`agent-state`, `apple-design`) and a
plain tool (`todo`), so it does not answer which skill directories a host must
have; this line checks one skill the renderer ships and that names its own
script.

### Check 3, targets

```bash
for home in ~/.pi/agent ~/.claude; do
    grep -ho '/home/[^ `<>)]*' "$home"/AGENTS.md "$home"/CLAUDE.md "$home"/agents/*.md 2>/dev/null |
    sort -u | while read -r p; do [ -e "$p" ] || echo "missing ($home): $p"; done
done
mkdir -p ~/agent-state/decisions   # the decision trail writes into the clone; git ignores it
```

Pass: no `missing` line. `decisions/` is created on first use, so a fresh clone needs the `mkdir`. The `<>` exclusion drops `<slug>`, a template, not a
path. The 2026-11-18 baseline prints ten missing paths for pi and eleven for
Claude.

### Check 4, one host alone

A machine that runs only Claude renders only `~/.claude`, and the reverse.

```bash
pi="$(mktemp -d)"; claude="$(mktemp -d)"
AGENT_PI_HOME="$pi" AGENT_CLAUDE_HOME="$claude" AGENT_STATE_HOSTS=claude \
    python3 -I "$root/tools/state.py" sync
ls -A "$pi"          # expect nothing
ls "$claude"         # expect CLAUDE.md, agents, commands, skills
rm -rf "$pi" "$claude"
```

Pass: the unconfigured home stays empty. Both homes go to temp directories,
because a check that falls back to the real home cannot fail: the real home
already exists and hides the write. `AGENT_STATE_HOSTS` and the tracked key it
falls back to are F2's subject.

## (3) Findings at the 2026-11-18 baseline

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
assert the home resolution, and `tests/state.test.mjs:128` pins the rendered
contract. `CHANGELOG.md:9` records what 0.1.0 shipped and stays as written; the
change gets an `[Unreleased]` entry.

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

## (5) Done when

A single command settles this at the end, run on a clean clone:

```bash
python3 -I "$root/tools/state.py" sync && python3 -I "$root/tools/state.py" status
```

1. F1 is fixed in both renderers, and the rule is updated at every place its
   statement lives: `docs/design.md`, the README's `{{AGENT_STATE}}`
   paragraph, `shared/skills/agent-state/SKILL.md`, the docstrings.
2. The four tests named in F1 are changed to the new resolution, and
   `tests/state.test.mjs` gains one case per finding: a rendered host has no
   missing target, and a single-host render writes one home.
3. F2 renders only the configured hosts, and the README's five lines say so.
4. F3's cleanup lands with the same change.
5. Checks 1 to 4 pass on a clean clone, and section 3's baseline no longer
   reproduces.

When F1 to F3 are closed, their findings move to `HARNESS.md` Settled and this
document keeps its checks.
