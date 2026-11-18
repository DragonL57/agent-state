#!/usr/bin/env bash
# SessionStart / UserPromptSubmit hook: say, once, when this host is behind.
#
# Read-only against Git. The check runs at most once every CHECK_INTERVAL
# seconds per session, because git's own network probe makes a per-prompt check
# too slow to run on every turn.
#
# Output contract: nothing when in sync, so a normal turn is untouched; when
# behind, one JSON result that adds the message to the model's context. Exit 0
# always: a hook must never block a session over configuration drift.
set -u

root="${AGENT_STATE_DIR:-$HOME/agent-state}"
manager="$root/tools/state.py"
state_dir="${CLAUDE_PLUGIN_DATA:-${TMPDIR:-/tmp}}/agent-state"
mkdir -p "$state_dir" 2>/dev/null || exit 0

# The hook input on stdin carries the session id and, for a prompt, the prompt
# source: "startup" for a session's first turn, so that turn names its event.
input="$(cat 2>/dev/null || true)"
field() {
    printf '%s' "$input" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -1
}
session="$(field session_id)"
session="${session:-default}"
source="$(field source)"
if [ "$source" = "startup" ]; then event=SessionStart; else event=UserPromptSubmit; fi

marker="$state_dir/checked-$session"
interval="${AGENT_STATE_CHECK_INTERVAL:-300}"
now="$(date +%s)"
if [ -f "$marker" ]; then
    last="$(cat "$marker" 2>/dev/null || echo 0)"
    case "$last" in ''|*[!0-9]*) last=0 ;; esac
    [ $((now - last)) -lt "$interval" ] && exit 0
fi
printf '%s\n' "$now" >"$marker"

[ -f "$manager" ] || exit 0

# Fetch quietly so "behind" is current without pulling. Offline is fine.
git -C "$root" fetch --quiet 2>/dev/null || true

message="$(python3 -I "$manager" check 2>/dev/null || true)"
[ -n "$message" ] || exit 0

# Escape for a JSON string: backslash first, then quote, then the newlines.
escaped="$(printf '%s' "$message" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr '\n' ' ')"
printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' "$event" "$escaped"
exit 0
