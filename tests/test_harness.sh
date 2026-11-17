#!/usr/bin/env bash
# Check the harness sync mechanism and the install's own budget setting.
#
# The kit's suite cannot reach `rig/sync.sh`, because the script lives here and
# the kit does not ship it. Without this file the renderer, the drift detector,
# the prune and the hook have no evidence behind them at all.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pass=0
fail=0
block_failed=0
ok() {
    [ "$block_failed" -eq 0 ] && pass=$((pass + 1))
    block_failed=0
}
bad() {
    echo "FAIL: $1" >&2
    fail=$((fail + 1))
    block_failed=1
}

sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT

kit="$sandbox/kit with a space"
install="$sandbox/install"
mkdir -p "$kit/.rig/playbooks" "$kit/agents" "$install/rig/playbooks" "$install/agents" "$install/.rig"
cp "$repo/rig/sync.sh" "$install/rig/sync.sh"
# The render layers this install's model pins back on, so the sandbox needs the
# same file the install has, or these render tests would exercise another path.
cp "$repo/.rig/models.json" "$install/.rig/models.json"
printf 'Read `.rig/playbooks/design.md`.\n' > "$kit/.rig/playbooks/design.md"
printf 'Read `AGENTS.md`.\n' > "$kit/agents/worker.md"

sync() {
    RIG_KIT="$kit" bash "$install/rig/sync.sh" "$@" 2>&1
}

# A clean render writes both files and rewrites the playbook path.
out="$(sync)"
[ $? -eq 0 ] || bad "a clean render exited non-zero: $out"
[ -f "$install/rig/playbooks/design.md" ] || bad "the render did not write the playbook"
[ -f "$install/agents/worker.md" ] || bad "the render did not write the agent"
grep -q '~/.pi/agent/rig/playbooks/design.md' "$install/rig/playbooks/design.md" ||
    bad "the render left the kit path in the playbook"
grep -q '~/.pi/agent/AGENTS.md' "$install/agents/worker.md" ||
    bad "the render left the contract reference unqualified"

# A render from the kit must keep the install's model pins. The kit carries no
# model, so a render that dropped them would put every reviewer back on the
# session model, which is the defect the routing file exists to prevent.
printf -- '---\ndescription: test agent\ntools: read\nthinking: high\n---\n\nBody.\n' > "$kit/agents/worker.md"
printf '{"pi":{"worker":{"model":"mistral/deepseek-v4-1-flash-1017","effort":"low"}}}\n' \
    > "$install/.rig/models.json"
sync > /dev/null 2>&1 || bad "a render with model pins exited non-zero"
grep -qxF 'model: mistral/deepseek-v4-1-flash-1017' "$install/agents/worker.md" \
    || bad "the render dropped the model pin"
grep -qxF 'thinking: low' "$install/agents/worker.md" \
    || bad "the render did not apply the pinned effort"
# Leave the sandbox as the later checks expect it: the kit's own worker file and
# the install's real routing file, so a clean copy still checks clean.
printf 'Read `AGENTS.md`.\n' > "$kit/agents/worker.md"
cp "$repo/.rig/models.json" "$install/.rig/models.json"
sync > /dev/null 2>&1
ok

# A clean copy checks clean.
out="$(sync --check)"
[ $? -eq 0 ] || bad "--check called a clean copy drifted: $out"
ok

# A hand edit in the install is drift, and a plain run heals it.
printf 'hand edited\n' >> "$install/rig/playbooks/design.md"
out="$(sync --check)"
[ $? -eq 1 ] || bad "--check missed a hand-edited playbook"
sync > /dev/null
out="$(sync --check)"
[ $? -eq 0 ] || bad "--check still reported drift after a render: $out"
ok

# A file the kit no longer has is drift, and the render removes it out loud.
printf 'stale\n' > "$install/agents/gone.md"
out="$(sync --check)"
[ $? -eq 1 ] || bad "--check missed an orphaned agent"
out="$(sync)"
[ -e "$install/agents/gone.md" ] && bad "the render left an orphaned agent"
case "$out" in
    *"removed $install/agents/gone.md"*) ;;
    *) bad "the render removed an agent without saying so" ;;
esac
ok

# A stray file that is not a playbook is still drift, and the render must be
# able to clear it. Otherwise every commit is refused with advice that does
# nothing.
printf 'backup\n' > "$install/rig/playbooks/design.md~"
out="$(sync --check)"
[ $? -eq 1 ] || bad "--check missed a stray non-markdown file"
sync > /dev/null
[ -e "$install/rig/playbooks/design.md~" ] && bad "the render could not clear a stray file"
out="$(sync --check)"
[ $? -eq 0 ] || bad "--check still reported drift after clearing a stray file: $out"
ok

# A kit file that is not markdown would be dropped without a word.
printf 'note\n' > "$kit/.rig/playbooks/notes.txt"
out="$(sync)"
[ $? -eq 1 ] || bad "a non-markdown kit file did not stop the render"
rm -f "$kit/.rig/playbooks/notes.txt"
ok

# The hook refuses a foreign hook and a kit that is not a checkout.
git -C "$kit" init -q
printf '#!/bin/sh\necho mine\n' > "$kit/.git/hooks/pre-commit"
out="$(sync --install-hook)"
[ $? -eq 1 ] || bad "the hook installer overwrote a foreign hook"
grep -q 'echo mine' "$kit/.git/hooks/pre-commit" ||
    bad "the hook installer changed a foreign hook"
rm -rf "$kit/.git"
out="$(sync --install-hook)"
[ $? -eq 2 ] || bad "the hook installer accepted a kit that is not a checkout"
ok

# The installed hook passes a clean tree, refuses a staged-then-edited one, and
# refuses a playbook the commit leaves untracked. The render reads the working
# tree, so the install matches it and the drift check alone would pass: only
# these guards catch that the commit records text the install never saw.
git -C "$kit" init -q
git -C "$kit" add -A > /dev/null
git -C "$kit" -c user.email=t@example.com -c user.name=t commit -qm base
sync --install-hook > /dev/null
out="$(cd "$kit" && bash .git/hooks/pre-commit 2>&1)"
[ $? -eq 0 ] || bad "the hook refused a clean kit: $out"
printf 'Read `.rig/playbooks/design.md` and more.\n' > "$kit/.rig/playbooks/design.md"
git -C "$kit" add -A > /dev/null
printf 'Read `.rig/playbooks/design.md` and more still.\n' > "$kit/.rig/playbooks/design.md"
sync > /dev/null
out="$(cd "$kit" && bash .git/hooks/pre-commit 2>&1)"
[ $? -eq 1 ] || bad "the hook passed a commit whose staged content differs from the render"
git -C "$kit" add -A > /dev/null
git -C "$kit" -c user.email=t@example.com -c user.name=t commit -qm staged > /dev/null 2>&1
printf 'Read `.rig/playbooks/design.md` and more again.\n' > "$kit/.rig/playbooks/new.md"
sync > /dev/null
out="$(cd "$kit" && bash .git/hooks/pre-commit 2>&1)"
[ $? -eq 1 ] || bad "the hook passed a playbook the commit does not add"
ok

# The budget lives in this file alone, and 0 is the only value that leaves the
# launch call in charge.
[ -f "$repo/subagents.json" ] || bad "subagents.json is missing"
default="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["defaultMaxTurns"])' \
    "$repo/subagents.json" 2>/dev/null)"
if [ -z "$default" ]; then
    bad "could not read defaultMaxTurns from subagents.json"
elif [ "$default" != "0" ]; then
    bad "subagents.json defaultMaxTurns is '$default', which caps every agent"
fi
ok

# Every pinned agent declares the model and effort .rig/models.json holds, so
# the routing file is the one place a model changes and a hand edit to an agent
# file is caught here. fallback-runner stays unpinned: its caller supplies one.
models="$repo/.rig/models.json"
[ -f "$models" ] || bad ".rig/models.json is missing"
if [ -f "$models" ]; then
    while IFS=$'\t' read -r agent model effort; do
        file="$repo/agents/$agent.md"
        [ -f "$file" ] || { bad "agents/$agent.md is missing"; continue; }
        want="$model"
        got="$(sed -n 's/^model: *//p' "$file" | head -1)"
        [ "$got" = "$want" ] \
            || bad "agents/$agent.md pins '${got:-nothing}', models.json holds '$want'"
        [ -n "$effort" ] || continue
        got="$(sed -n 's/^thinking: *//p' "$file" | head -1)"
        [ "$got" = "$effort" ] \
            || bad "agents/$agent.md thinks '${got:-nothing}', models.json holds '$effort'"
    done < <(python3 -c '
import json, sys
saved = json.load(open(sys.argv[1]))
for agent, entry in sorted(saved.get("pi", {}).items()):
    print("%s\t%s\t%s" % (agent, entry.get("model", ""), entry.get("effort", "")))
' "$models")
    grep -q '^model:' "$repo/agents/fallback-runner.md" \
        && bad "fallback-runner.md pins a model; its caller supplies one"
fi
ok

# The contract's load-bearing rules are checked, not trusted. A grant is what
# lets a run finish without a checkpoint per step. The plan gate and the exit
# condition are what tell it when to start and when to stop, and they live in
# two files: the gate in the contract, the procedure in the playbook. A later
# edit that drops any of them leaves no trace, so check the names here.
contract="$repo/AGENTS.md"
[ -f "$contract" ] || bad "AGENTS.md is missing"
grant="$(sed -n '/^## Autonomy grant$/,/^## /p' "$contract")"
[ -n "$grant" ] || bad "AGENTS.md lost its Autonomy grant section"
planbook="$repo/rig/playbooks/workflow.md"
[ -f "$planbook" ] || bad "workflow.md is missing"
grep -q 'Done when:' "$planbook" ||
    bad "workflow.md no longer requires an exit condition in the plan"
grep -q 'before the plan exists' "$contract" ||
    bad "AGENTS.md no longer gates work on a plan"
grep -q 'rig/playbooks/workflow.md' "$contract" ||
    bad "AGENTS.md no longer points at the playbook that holds the plan procedure"
! grep -q 'Done when:' "$contract" ||
    bad "AGENTS.md duplicates the exit condition that workflow.md step 1 owns"
grep -q 'decisions/<slug>.tsv' "$contract" ||
    bad "AGENTS.md lost the decision-trail convention"
grep -q 'reset --hard' <<< "$grant" ||
    bad "the grant no longer names the irreversible set"
grep -q 'reviewer' <<< "$grant" ||
    bad "the grant no longer covers a reviewer's user decision"
grep -q 'never asks the user whether to review' "$contract" ||
    bad "AGENTS.md lets the orchestrator ask the user whether to review"
grep -q 'never reviews its own change' "$contract" ||
    bad "AGENTS.md lets the orchestrator review its own change"
grep -q 'report\. Both are mandatory\.' "$contract" ||
    bad "AGENTS.md no longer makes spec-reviewer and taste-reviewer mandatory"
! grep -q 'No reviewers\.' "$contract" ||
    bad "AGENTS.md offers 'No reviewers.' as a report line again"
grep -q 'spec-reviewer: not run, single-file exemption\.' "$contract" ||
    bad "AGENTS.md's single-file exemption line no longer names a reviewer and its verdict"
ok

# The playbooks live in the kit and in `rig/playbooks/`. `rig/install.sh` writes
# a third copy to `.rig/playbooks/` on every run, so a directory there is a stale
# copy that the next install restores and agents can read in place of the
# rendered one.
[ -e "$repo/.rig/playbooks" ] &&
    bad ".rig/playbooks exists; rig/install.sh recreates that stale third copy on every run"
ok

# Every grant rule is a constraint, not advice. The evidence on rule polarity
# finds positive directives harmful and negative constraints helpful, so a
# bullet here that reads as advice is a defect rather than a style choice. A
# stop rule is a constraint too, so it is allowed beside the negatives.
while IFS= read -r line; do
    case "$line" in
        '- Do not '*) ;;
        '- Stop and report '*) ;;
        '- '*) bad "the grant has a rule that reads as advice: $line" ;;
    esac
done <<< "$grant"
ok

echo "test_harness.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
