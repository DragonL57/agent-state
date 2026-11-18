#!/usr/bin/env bash
set -u
# The Claude Code status line: one row. `agent-state sync` copies it to
# ~/.claude/statusline.sh, and the rendered `statusLine` command runs this
# file in the clone.
INPUT="$(cat)"
export INPUT_JSON="$INPUT"

__sgr() { printf '\033[%sm' "$1"; }
__reset() { printf '\033[0m'; }

# STATUSLINE_JQ and STATUSLINE_PY pick the field reader for a machine or a test.
__JQ="${STATUSLINE_JQ:-jq}"
if command -v "$__JQ" >/dev/null 2>&1; then
  __field() {
    printf '%s' "$INPUT_JSON" | "$__JQ" -r --arg p "$1" '
      ($p | split(".")) as $parts
      | reduce $parts[] as $k (.; if type == "object" and has($k) then .[$k] else null end)
      | if . == null then "" else (if type == "string" then . else tostring end) end
    ' 2>/dev/null
  }
else
  if [ -n "${STATUSLINE_PY:-}" ]; then
    __PY="$STATUSLINE_PY"
  elif command -v python3 >/dev/null 2>&1 && python3 -c 'import sys' >/dev/null 2>&1; then
    __PY=python3
  elif command -v python >/dev/null 2>&1; then
    __PY=python
  else
    __PY=""
  fi
  __field() {
    if [ -z "$__PY" ]; then printf ''; return; fi
    PATH_ARG="$1" "$__PY" -I - <<'PYEOF' 2>/dev/null
import json, os
d = json.loads(os.environ.get('INPUT_JSON','{}') or '{}')
p = os.environ.get('PATH_ARG','')
cur = d
for part in p.split('.'):
    if isinstance(cur, dict) and part in cur:
        cur = cur[part]
    else:
        cur = None
        break
if cur is None:
    print('', end='')
elif isinstance(cur, bool):
    print('true' if cur else 'false', end='')
else:
    print(cur, end='')
PYEOF
  }
fi

__basename() { local s="$1"; printf '%s' "${s##*/}"; }
__bar() {
  local pct="$1" width="$2" filled="$3" empty="$4"
  local p i n=0 e=0
  p=${pct%.*}
  [ -z "$p" ] && p=0
  if [ "$p" -lt 0 ]; then p=0; fi
  if [ "$p" -gt 100 ]; then p=100; fi
  n=$(( (p * width + 50) / 100 ))
  e=$((width - n))
  local out=""
  for ((i=0; i<n; i++)); do out+="$filled"; done
  for ((i=0; i<e; i++)); do out+="$empty"; done
  printf '%s' "$out"
}
__git_branch() {
  local cwd dir
  cwd="$(__field workspace.current_dir)"
  if [ -z "$cwd" ]; then cwd="$(__field cwd)"; fi
  if [ -n "$cwd" ] && command -v git >/dev/null 2>&1; then
    git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null
  else
    __field workspace.git_worktree
  fi
}
__emit() {
  local style="$1" text="$2"
  if [ -n "$style" ]; then __sgr "$style"; fi
  printf '%s' "$text"
  if [ -n "$style" ]; then __reset; fi
}
__norm_int() {
  # Coerce a possibly-decimal/empty/garbage field value to a non-negative
  # integer string.
  local v="$1"
  v="${v%%.*}"
  case "$v" in
    ''|*[!0-9]*) printf '0' ;;
    *) printf '%s' "$v" ;;
  esac
}
__fmt_token_compact() {
  local n
  n="$(__norm_int "$1")"
  if [ "$n" -lt 1000 ]; then printf '%s' "$n"; return; fi
  if [ "$n" -lt 1000000 ]; then
    local whole=$((n / 1000))
    local rem=$((n - whole * 1000))
    local dec=$((rem / 100))
    if [ "$dec" -eq 0 ]; then printf '%dk' "$whole"; else printf '%d.%dk' "$whole" "$dec"; fi
    return
  fi
  local whole=$((n / 1000000))
  local rem=$((n - whole * 1000000))
  local dec=$((rem / 100000))
  if [ "$dec" -eq 0 ]; then printf '%dM' "$whole"; else printf '%d.%dM' "$whole" "$dec"; fi
}
__emit '38;2;198;160;246;49' '['
__v="$(__field 'workspace.current_dir')"
__v="$(__basename "$__v")"
__emit '38;2;198;160;246;49' "$__v"
__emit '38;2;198;160;246;49' ']'
__emit '38;2;238;212;159;49' ':'
__out="$(__git_branch)"
__emit '38;2;238;212;159;49' "$__out"
__emit '2;38;2;202;211;245' ' · '
__v="$(__field 'model.display_name')"
__emit '1;38;2;245;169;127;49' "$__v"
__emit '2;38;2;202;211;245' ' / '
if [ "$(__field 'thinking.enabled')" = 'true' ]; then
  __v="$(__field 'effort.level')"
  __emit '2;38;2;202;211;245' "$__v"
fi
__emit '2;38;2;202;211;245' ' · '
__emit '38;2;138;173;244' 'ctx '
__v="$(__field 'context_window.used_percentage')"
__bar_out="$(__bar "$__v" 20 '━' '─')"
__emit '38;2;138;173;244' "$__bar_out"
__emit '38;2;138;173;244' ' '
__v="$(__field 'context_window.used_percentage')"
__emit '38;2;138;173;244' "$__v"
__emit '38;2;138;173;244' '%'
__v="$(__field 'context_window.context_window_size')"
__v="$(__fmt_token_compact "$__v")"
if [ -n "$__v" ] && [ "$__v" != '0' ]; then
  __emit '2;38;2;202;211;245' '/'
  __emit '38;2;138;173;244' "$__v"
fi

exit 0

