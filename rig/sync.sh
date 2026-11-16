#!/usr/bin/env bash
# Render this install's playbooks and agents from the Rig kit.
#
# The kit's `.rig/playbooks/` and `agents/` are the source. This install reads
# the same files from `~/.pi/agent/rig/playbooks/` and `~/.pi/agent/agents/`,
# so exactly two kinds of difference are allowed, and nothing else:
#   - the playbook path prefix, because these files sit in the home directory
#     instead of inside the repository being worked on;
#   - the contract an agent is told to read, because a subagent replaces its
#     system prompt and does not inherit `AGENTS.md`. Only the "Read ..." line
#     is qualified. A later bare `AGENTS.md` in an agent body means the contract
#     of the repository under review, which is right in both copies.
#
# Usage:
#   sync.sh           render the global copy from the kit
#   sync.sh --check   render into a temp dir and diff; write nothing, exit 1 on
#                     drift, so a kit edit that was not synced is caught
#   sync.sh --install-hook
#                     write a pre-commit hook in the kit that runs --check, so
#                     the drift is caught at commit time instead of by memory
#
# The kit checkout is `$RIG_KIT`, default `$HOME/rig`.
set -euo pipefail

kit="${RIG_KIT:-$HOME/rig}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
playbooks_dir="$here/playbooks"
agents_dir="$(cd "$here/.." && pwd)/agents"
check=0
hook=0
case "${1-}" in
    "") ;;
    --check) check=1 ;;
    --install-hook) hook=1 ;;
    *) echo "usage: sync.sh [--check | --install-hook]" >&2; exit 2 ;;
esac

if [ ! -d "$kit/.rig/playbooks" ] || [ ! -d "$kit/agents" ]; then
    echo "sync: no kit at $kit (set RIG_KIT to the checkout)" >&2
    exit 2
fi

# Only `.md` files are rendered, so anything else in the kit's two source
# directories would be dropped without a word.
for dir in "$kit/.rig/playbooks" "$kit/agents"; do
    for path in "$dir"/*; do
        [ -e "$path" ] || continue
        case "$path" in
            *.md) ;;
            *) echo "sync: $path is not a .md file, and only .md files are rendered" >&2
               exit 1 ;;
        esac
    done
done

# The hook is the only thing that runs --check without being asked, so it bakes
# the kit path in: a commit from another shell must check the same kit.
install_hook() {
    local hookdir hook tmp
    if ! hookdir="$(git -C "$kit" rev-parse --path-format=absolute --git-path hooks 2>/dev/null)"; then
        echo "sync: $kit is not a git checkout, so there is no hook to install" >&2
        exit 2
    fi
    hook="$hookdir/pre-commit"
    if [ -e "$hook" ] && ! grep -q 'installed by rig sync.sh' "$hook"; then
        echo "sync: $hook exists and is not mine, so it is untouched" >&2
        exit 1
    fi
    mkdir -p "$hookdir"
    # Written beside the target and moved in, so a failed write cannot leave a
    # half hook that the next run refuses as foreign.
    tmp="$hook.tmp"
    {
        echo '#!/bin/sh'
        echo '# installed by rig sync.sh --install-hook'
        echo '# Refuses a kit commit whose playbooks or agents were not rendered'
        echo '# into the global copy under ~/.pi/agent.'
        printf 'cd "%s" || exit 1\n' "$kit"
        echo '# The render reads the working tree; a commit records the index. So a'
        echo '# staged playbook that differs from the working tree ships text the'
        echo '# install never saw. Unstaged edits are fine: the commit omits them.'
        echo 'if [ -n "$(git diff --cached --name-only -- .rig/playbooks agents)" ] &&'
        echo '    ! git diff --quiet -- .rig/playbooks agents; then'
        echo '    echo "pre-commit: a staged playbook or agent differs from the working tree" >&2'
        echo '    echo "pre-commit: the render read the working tree, which this commit does not record" >&2'
        echo '    exit 1'
        echo 'fi'
        echo 'if [ -n "$(git ls-files --others --exclude-standard -- .rig/playbooks agents)" ]; then'
        echo '    echo "pre-commit: the kit has playbooks or agents that this commit does not add" >&2'
        echo '    echo "pre-commit: the install already has them, so add them before committing" >&2'
        echo '    exit 1'
        echo 'fi'
        printf 'exec env RIG_KIT="%s" "%s/sync.sh" --check\n' "$kit" "$here"
    } > "$tmp"
    chmod +x "$tmp"
    mv "$tmp" "$hook"
    echo "sync: installed $hook"
}

if [ "$hook" = 1 ]; then
    install_hook
    exit 0
fi

# The repo-root rule has to run before the bare-reference rule, because the
# bare rule would otherwise rewrite the repo-root rule's input. The guard below
# catches a swap, which drops the repository's own contract.
render() {
    sed -e 's#\.rig/playbooks/#~/.pi/agent/rig/playbooks/#g' \
        -e 's#Read `AGENTS.md` in the repo root#Read `~/.pi/agent/AGENTS.md`, the global contract, plus any `AGENTS.md` in the repo root#g' \
        -e 's#Read `AGENTS.md`#Read `~/.pi/agent/AGENTS.md`#g' \
        "$1"
}

out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
mkdir -p "$out/playbooks" "$out/agents"

for src in "$kit"/.rig/playbooks/*.md; do
    render "$src" > "$out/playbooks/$(basename "$src")"
done
for src in "$kit"/agents/*.md; do
    render "$src" > "$out/agents/$(basename "$src")"
done

# The kit's agents carry no model, because the kit serves four harnesses and the
# model is the harness's choice. This install resolves one model and effort per
# agent into `.rig/models.json`, and the installer renders them into the agent
# frontmatter. A render from the kit alone would erase them, so the same pins
# are layered back on here and both writers agree on the file. fallback-runner
# has no entry: its caller supplies a model.
apply_model_pins() {
    local models="$here/../.rig/models.json" agent name model effort
    [ -f "$models" ] || return 0
    while IFS=$'\t' read -r name model effort; do
        [ -n "$name" ] || continue
        agent="$out/agents/$name.md"
        [ -f "$agent" ] || continue
        awk -v model="$model" -v effort="$effort" '
            BEGIN { fence = 0 }
            /^---$/ {
                fence++
                if (fence == 2) print "model: " model
            }
            fence < 2 && /^thinking:/ { print "thinking: " effort; next }
            { print }
        ' "$agent" > "$agent.pinned" && mv "$agent.pinned" "$agent"
    done < <(python3 -c '
import json, sys
saved = json.load(open(sys.argv[1]))
for name, entry in sorted(saved.get("pi", {}).items()):
    print("%s\t%s\t%s" % (name, entry.get("model", ""), entry.get("effort", "")))
' "$models")
}
apply_model_pins

# A rule that stopped matching leaves a kit path or an unqualified contract
# reference in the output, which would send an agent to a file that does not
# exist here.
fail_on_leftover() {
    local pattern="$1" message="$2" hits
    if hits="$(grep -rnF "$pattern" "$out")"; then
        echo "sync: $message" >&2
        printf '%s\n' "$hits" >&2
        exit 1
    fi
}
fail_on_leftover '.rig/playbooks/' 'a playbook path survived the rewrite:'
fail_on_leftover 'Read `AGENTS.md`' 'an agent kept an unqualified contract reference:'
fail_on_leftover 'Read `~/.pi/agent/AGENTS.md` in the repo root' \
    'the contract rules ran out of order, so the repo contract was dropped:'

# True when either destination holds something the render did not produce.
drifted() {
    local dst src pair
    for pair in "playbooks:$playbooks_dir" "agents:$agents_dir"; do
        dst="${pair#*:}"
        src="$out/${pair%%:*}"
        diff -ru "$dst" "$src" > /dev/null || return 0
    done
    return 1
}

if [ "$check" = 1 ]; then
    if drifted; then
        diff -ru "$playbooks_dir" "$out/playbooks" || true
        diff -ru "$agents_dir" "$out/agents" || true
        echo "sync: the global copy differs from the kit; run sync.sh to regenerate it" >&2
        exit 1
    fi
    echo "sync: up to date with $kit"
    exit 0
fi

# The kit is the whole content of both directories, so anything it no longer
# has is stale here. The prune matches what the diff compares: every entry, not
# just `*.md`, or a stray file would block every commit and no run could clear
# it.
prune() {
    local dst="$1" src="$2" path
    mkdir -p "$dst"
    for path in "$dst"/* "$dst"/.[!.]*; do
        [ -e "$path" ] || continue
        [ -e "$src/$(basename "$path")" ] && continue
        echo "sync: removed $path, which the kit no longer has" >&2
        rm -rf "$path"
    done
}
prune "$playbooks_dir" "$out/playbooks"
prune "$agents_dir" "$out/agents"

# Name every file this run replaces: a hand edit here dies silently otherwise.
for path in "$out"/playbooks/*.md "$out"/agents/*.md; do
    name="$(basename "$path")"
    case "$path" in
        */playbooks/*) dst="$playbooks_dir/$name" ;;
        *) dst="$agents_dir/$name" ;;
    esac
    if [ -e "$dst" ] && ! cmp -s "$path" "$dst"; then
        echo "sync: rewrote $dst"
    fi
done
cp "$out"/playbooks/*.md "$playbooks_dir/"
cp "$out"/agents/*.md "$agents_dir/"

# Success means the copy now matches the kit, not that the copy ran.
if drifted; then
    echo "sync: the global copy still differs from the kit after writing:" >&2
    diff -ru "$playbooks_dir" "$out/playbooks" >&2 || true
    diff -ru "$agents_dir" "$out/agents" >&2 || true
    exit 1
fi
echo "sync: wrote $(ls "$out/playbooks" | wc -l | tr -d ' ') playbooks and $(ls "$out/agents" | wc -l | tr -d ' ') agents from $kit"
