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
agents_dir="$(cd "$here/../agents" && pwd)"
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

# The hook is the only thing that runs --check without being asked, so it bakes
# the kit path in: a commit from another shell must check the same kit.
install_hook() {
    local gitdir hook
    if ! gitdir="$(git -C "$kit" rev-parse --absolute-git-dir 2>/dev/null)"; then
        echo "sync: $kit is not a git checkout, so there is no hook to install" >&2
        exit 2
    fi
    hook="$gitdir/hooks/pre-commit"
    if [ -e "$hook" ] && ! grep -q 'installed by rig sync.sh' "$hook"; then
        echo "sync: $hook exists and is not mine, so it is untouched" >&2
        exit 1
    fi
    mkdir -p "$gitdir/hooks"
    {
        echo '#!/bin/sh'
        echo '# installed by rig sync.sh --install-hook'
        echo '# Refuses a kit commit whose playbooks or agents were not rendered'
        echo '# into the global copy under ~/.pi/agent.'
        printf 'exec env RIG_KIT=%s "%s/sync.sh" --check\n' "$kit" "$here"
    } > "$hook"
    chmod +x "$hook"
    echo "sync: installed $hook"
}

if [ "$hook" = 1 ]; then
    install_hook
    exit 0
fi

# The second rule runs last because it puts a bare `AGENTS.md` back.
render_agent() {
    sed -e 's#\.rig/playbooks/#~/.pi/agent/rig/playbooks/#g' \
        -e 's#Read `AGENTS.md`#Read `~/.pi/agent/AGENTS.md`#g' \
        -e 's#Read `~/.pi/agent/AGENTS.md` in the repo root#Read `~/.pi/agent/AGENTS.md`, the global contract, plus any `AGENTS.md` in the repo root#g' \
        "$1"
}

out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
mkdir -p "$out/playbooks" "$out/agents"

for src in "$kit"/.rig/playbooks/*.md; do
    sed 's#\.rig/playbooks/#~/.pi/agent/rig/playbooks/#g' "$src" \
        > "$out/playbooks/$(basename "$src")"
done
for src in "$kit"/agents/*.md; do
    render_agent "$src" > "$out/agents/$(basename "$src")"
done

# A rule that stopped matching leaves a kit path or an unqualified contract
# reference in the output, which would send an agent to a file that does not
# exist here.
if grep -rl '\.rig/playbooks/' "$out" > /dev/null; then
    echo "sync: a playbook path survived the rewrite:" >&2
    grep -rn '\.rig/playbooks/' "$out" >&2
    exit 1
fi
if grep -rl 'Read `AGENTS.md`' "$out/agents" > /dev/null; then
    echo "sync: an agent kept an unqualified contract reference:" >&2
    grep -rn 'Read `AGENTS.md`' "$out/agents" >&2
    exit 1
fi

if [ "$check" = 1 ]; then
    drift=0
    diff -ru "$here/playbooks" "$out/playbooks" || drift=1
    diff -ru "$agents_dir" "$out/agents" || drift=1
    if [ "$drift" = 1 ]; then
        echo "sync: the global copy differs from the kit; run sync.sh to regenerate it" >&2
        exit 1
    fi
    echo "sync: up to date with $kit"
    exit 0
fi

# The kit is the whole content of both directories, so a file it no longer has
# is stale here. Without this, --check reports an orphan that sync.sh cannot
# clear.
for dst in "$here/playbooks"/*.md "$agents_dir"/*.md; do
    [ -e "$dst" ] || continue
    case "$dst" in
        "$here/playbooks/"*) [ -e "$out/playbooks/$(basename "$dst")" ] || rm -f "$dst" ;;
        *)                   [ -e "$out/agents/$(basename "$dst")" ] || rm -f "$dst" ;;
    esac
done

cp "$out"/playbooks/*.md "$here/playbooks/"
cp "$out"/agents/*.md "$agents_dir/"
echo "sync: wrote $(ls "$out/playbooks" | wc -l | tr -d ' ') playbooks and $(ls "$out/agents" | wc -l | tr -d ' ') agents from $kit"
