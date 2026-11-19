#!/usr/bin/env python3
"""agent-state: one Git-backed configuration, maintained for pi, Claude Code and Vibe.

The repository is the source. Each machine keeps one *clone* of it (its own
branch is never used: everything lives on `main`), and renders the configured
homes from it:

    ~/.pi/agent     pi's home; rendered from shared/ (AGENTS.md, skills, prompts)
    ~/.claude       Claude Code's home; rendered from shared/ in Claude's
                    conventions, plus the Claude plugin
    ~/.vibe         Vibe's home; rendered from shared/ in Vibe's conventions
                    (AGENTS.md, skills, agents as TOML subagents)

The hosts a machine renders come from `AGENT_STATE_HOSTS`, then this clone's
`config.json` `hosts` key, then all three.

Commands (same verbs on every host):

    pull      fetch and fast-forward this clone, then render the configured homes
    status    what changed in the tree, and which host copy drifted
    snapshot  stage, validate, and commit locally
    push      upload existing commits; never commits
    sync      render the configured homes from the clone without touching git
    check     print one line per host copy that drifted (hook payload)
    hosts     print the configured hosts, where each home lives, and the clone

The design rule is the parent package's: no command both writes a commit and
uploads it, and nothing runs Git from a lifecycle hook.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path

REPO = "DragonL57/agent-state"
DEFAULT_REMOTE = f"https://github.com/{REPO}.git"

# Files and directories that belong to a host, never to the shared tree.
HOST_ONLY = (
    ".env",
    ".env.keys",
    "auth.json",
    "trust.json",
    "models-store.json",
    "settings.json",
    "sessions/",
    "npm/",
    "git/",
    "bin/",
    "node_modules/",
    "mcp-cache.json",
    "mcp-npx-cache.json",
    "install/",
    "projects/",
    "plugins/",
    "todos/",
    "shell-snapshots/",
    "file-history/",
    "history.jsonl",
    "statsig/",
    "debug/",
    "ide/",
    "paste-cache/",
    "cache/",
    "backups/",
    "downloads/",
    "session-env/",
    ".last-cleanup",
    # Vibe's home: credentials, trust, caches, sessions, and its own config.
    "config.toml",
    "hooks.toml",
    "trusted_folders.toml",
    ".trusted_folders.toml.lock",
    "vibehistory",
    "cache.toml",
    "logs/",
    "locks/",
    "shell-tool/",
    "worktrees/",
    "skills-registry-cache/",
    "connector_bootstrap_cache.json",
    ".connector_bootstrap_cache.json.lock",
    "whoami_cache.json",
    "model_catalog_cache.json",
    "managed_config_cache.json",
    "ui_startup_config.json",
    "utility_model_cache.json",
    "experiment_eval_cache.json",
    "experiment_held_eval_cache.json",
    "scheduled-loops.json",
    "goal.json",
)

# A tracked template of a host-only file: `.env.example` documents the keys
# without holding one.
TEMPLATE_SUFFIXES = (".example", ".sample", ".template")

# Portable parts of the tree, relative to the repo root.
# Filled from the resolved root, never read from the working directory: a
# command may run from anywhere and still must render the same tree.
SHARED = Path("shared")
PI = Path("hosts/pi")
CLAUDE = Path("hosts/claude")
VIBE = Path("hosts/vibe")
# A host-only name there is the tracked portable subset, rendered into the
# home's own file: a host's credentials are never tracked, but its command
# wiring is.
SETTINGS = "settings.json"
STATUSLINE = "statusline.sh"
STATUSLINE_SOURCE = Path("shared/statusline/claude.sh")


def _bind(root: Path) -> None:
    global SHARED, PI, CLAUDE, VIBE
    SHARED, PI, CLAUDE, VIBE = (
        root / "shared",
        root / "hosts" / "pi",
        root / "hosts" / "claude",
        root / "hosts" / "vibe",
    )


def _dirs(path: Path) -> list[Path]:
    return sorted(child for child in path.iterdir() if child.is_dir()) if path.is_dir() else []

SECRET_KEY = re.compile(r"(?:api[-_]?key|token|secret|password|authorization)", re.I)
# A lockfile's values are package names and version pairs, never a secret.
SAFE_LITERAL = {"dummy", "local", "none", "ollama"}
VERSION = re.compile(r"^\d+\.\d+\.\d+")


class StateError(RuntimeError):
    pass


# --------------------------------------------------------------------------- git


def git(root: Path, *args: str, check: bool = True) -> str:
    result = subprocess.run(
        ["git", "-C", str(root), *args], capture_output=True, text=True, timeout=60
    )
    if check and result.returncode != 0:
        raise StateError(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout


def git_ok(root: Path, *args: str) -> bool:
    return subprocess.run(
        ["git", "-C", str(root), *args], capture_output=True, text=True
    ).returncode == 0


# ------------------------------------------------------------------ state root


def state_root() -> Path:
    """The repository checkout. AGENT_STATE_DIR, then a sibling of this script."""
    env = os.environ.get("AGENT_STATE_DIR")
    if env:
        return Path(env).expanduser().resolve()
    return Path(__file__).resolve().parent.parent


def is_state_root(path: Path) -> bool:
    return git_ok(path, "rev-parse", "--show-toplevel") and (
        (path / "tools" / "state.py").exists() or (path / "shared").exists()
    )


def require_root() -> Path:
    root = state_root()
    if not is_state_root(root):
        raise StateError(
            f"{root} is not an agent-state checkout. Set AGENT_STATE_DIR, or clone "
            f"{DEFAULT_REMOTE} there."
        )
    return root


# ------------------------------------------------------------------- allowlist


def is_forbidden(path: str) -> bool:
    """A host-only name, at the root of the tree only.

    `settings.json` at the root is a host's file; `hosts/pi/settings.json` is the
    tracked portable subset for the pi renderer.
    """
    # Not `lstrip("./")`: it takes a character set, so it would eat the leading
    # dot of `.env` and `.last-cleanup` and never match them.
    path = path.replace("\\", "/")
    for entry in HOST_ONLY:
        if entry.endswith("/"):
            if path.startswith(entry):
                return True
        elif path == entry or path.startswith(entry + "."):
            # A host writes its own copies beside the file: `config.toml.bak`
            # and `config.toml.bak.20261119144853` both hold the `api_key`.
            # A template holds no credential, so it stays trackable.
            return not path.endswith(TEMPLATE_SUFFIXES)
    return False


def tracked_violations(root: Path) -> list[str]:
    files = git(root, "ls-files", "-z").split("\0")
    return [path for path in files if path and is_forbidden(path)]


# --------------------------------------------------------------------- secrets


def _safe_reference(value: str) -> bool:
    value = value.strip()
    return (
        value.startswith("$")
        or value.startswith("!")
        or value.lower() in SAFE_LITERAL
        or bool(VERSION.match(value))
    )


def literal_secrets(value, path="$", issues: list[str] | None = None) -> list[str]:
    issues = [] if issues is None else issues
    if isinstance(value, list):
        for index, item in enumerate(value):
            literal_secrets(item, f"{path}[{index}]", issues)
    elif isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if isinstance(child, str) and SECRET_KEY.search(key) and not _safe_reference(child):
                issues.append(child_path)
            else:
                literal_secrets(child, child_path, issues)
    return issues


def inspect_json(root: Path) -> list[str]:
    """Every tracked JSON file is checked, not just two names: the tree is now larger."""
    issues: list[str] = []
    for rel in git(root, "ls-files", "-z", "--", "*.json").split("\0"):
        if not rel:
            continue
        try:
            data = json.loads((root / rel).read_text())
        except (json.JSONDecodeError, OSError) as error:
            issues.append(f"{rel}: invalid JSON ({error})")
            continue
        for issue in literal_secrets(data):
            issues.append(f"{rel}:{issue}")
    return issues


# -------------------------------------------------------------------- renders


def _frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    block, body = text[3:end], text[end + 4 :].lstrip("\n")
    keys: dict[str, str] = {}
    name = None
    for line in block.splitlines():
        match = re.match(r"([A-Za-z_.-]+):\s*(.*)", line)
        if match:
            name, value = match.group(1), match.group(2).strip()
            keys[name] = "" if value in (">", ">-", "|", "|-") else value
        elif name and line.startswith((" ", "\t")):
            keys[name] = (keys[name] + " " + line.strip()).strip()
    return keys, body


def rewrite_paths(text: str, root: Path) -> str:
    """The shared tree speaks in `{{AGENT_STATE}}`; it resolves to the clone, where the content lives."""
    return text.replace("{{AGENT_STATE}}", str(root))


CLAUDE_TOOLS = {
    "read": ["Read"],
    "bash": ["Bash"],
    "write": ["Write", "Edit"],
    "edit": ["Edit"],
    "replace": ["Edit"],
    "replace_match": ["Edit"],
    "insert": ["Edit"],
    "grep": ["Grep"],
    "find": ["Glob"],
    "ls": ["Glob"],
    "websearch": ["WebSearch"],
    "webfetch": ["WebFetch"],
    "todo": ["TodoWrite"],
}
DROPPED_TOOLS = {"codemode"}
# A skill both renders promise in the contract's tool-routing table may not sit
# here: exclusion would leave Claude told to load a skill it never receives.
PI_ONLY_SKILLS = {"pi-state-sync"}

# Vibe's tool names. `find` and `ls` are not Vibe tools at all, `grep` is one of
# Vibe's `RETIRED_TOOL_NAMES` (core/config/_setting_keys.py), and all three run
# through `bash`, so a pi agent that searches keeps a way to search. Web search
# and fetch come from the `connector_web_search` connector, whose tool names
# exist only once that connector is installed. A filter whose every name matches
# nothing empties the set: `_profile_tools` (app_server/_runtime.py) keeps only
# the available tools the filter matches.
VIBE_TOOLS = {
    "read": ["read_file"],
    "bash": ["bash"],
    "write": ["write_file", "edit"],
    "edit": ["edit"],
    "replace": ["edit"],
    "replace_match": ["edit"],
    "insert": ["edit"],
    "grep": ["bash"],
    "find": ["bash"],
    "ls": ["bash"],
    "websearch": [],
    "webfetch": [],
    "todo": ["todo"],
}


def claude_agent(root: Path, path: Path) -> str | None:
    keys, body = _frontmatter(path.read_text())
    if "builtin:mcp" in keys.get("exclude_extensions", ""):
        return None
    tools: list[str] = []
    for raw in keys.get("tools", "").split(","):
        name = raw.strip()
        if not name or name in DROPPED_TOOLS:
            continue
        for mapped in CLAUDE_TOOLS.get(name, [name]):
            if mapped not in tools:
                tools.append(mapped)
    lines = ["---", f"name: {path.stem}", f"description: {keys.get('description', '')}"]
    if tools:
        lines.append(f"tools: {', '.join(tools)}")
    lines += ["---", "", rewrite_paths(body, root)]
    return "\n".join(lines)


VIBE_MARKER = "# Rendered from shared/agents/ by tools/state.py. Do not edit."
# Vibe rejects a subagent whose instructions are longer than this
# (app_server/_agent_types.py, MAX_DECLARED_INSTRUCTION_CHARS).
VIBE_MAX_INSTRUCTION_CHARS = 65536
# TOML forbids these raw in any string, and a literal string cannot escape them.
TOML_FORBIDDEN = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _toml_string(value: str) -> str:
    """A TOML basic string. Control characters are escaped, not passed through."""
    out: list[str] = []
    for char in value:
        if char in '\\"':
            out.append("\\" + char)
        elif char == "\n":
            out.append("\\n")
        elif char == "\r":
            out.append("\\r")
        elif char == "\t":
            out.append("\\t")
        elif ord(char) < 0x20 or ord(char) == 0x7F:
            out.append(f"\\u{ord(char):04X}")
        else:
            out.append(char)
    return '"' + "".join(out) + '"'


def vibe_agent(root: Path, path: Path) -> str:
    """A pi agent definition as a Vibe subagent profile.

    Vibe reads agents as TOML. The body becomes `instructions`, the pi tool
    names become Vibe's, and `model:`/`thinking:` are dropped so the subagent
    inherits the session's model and effort, as the Claude renderer does.

    Vibe drops an agent file it cannot use and reports it only in its own
    warnings, so the renderer refuses the shapes it would drop: a reserved
    name, no description, an `enabled_tools` that matches nothing, a body a
    TOML literal string cannot hold, and instructions over Vibe's limit.

    One grant is Vibe's own: `skill`. A skill is reachable only through that
    tool, where pi reads the skill's files with `read`, so every agent gets it.
    `enabled_tools` is a whitelist, and a tool it does not name is denied.

    note: a declared Vibe subagent gets no MCP tool. Vibe binds a child with
    `integrations_enabled=False` and an empty MCP grant
    (mistralai_vibe_local_harness/vibe/_subagents/_configuration.py), and
    measures the ceiling against a catalogue built with `defer_mcp=True`
    (vibe/app_server/_runtime.py). Measured 2026-11-19: a `spec-reviewer` child
    has no `mcp_chrome_devtools.*` tool while an ad-hoc child does.
    """
    if path.stem.casefold() == "main":
        raise StateError(
            f"{path} would render as the agent name 'main', which Vibe reserves for hook matching."
        )
    keys, body = _frontmatter(path.read_text())
    description = keys.get("description", "").strip()
    if not description:
        raise StateError(f"{path} has no description; Vibe drops an agent without one.")
    declared = [raw.strip() for raw in keys.get("tools", "").split(",") if raw.strip()]
    tools: list[str] = []
    for name in declared:
        if name in DROPPED_TOOLS:
            continue
        for mapped in VIBE_TOOLS.get(name, [name]):
            if mapped not in tools:
                tools.append(mapped)
    if declared and not tools:
        # An absent `enabled_tools` means every tool to Vibe, so an empty one
        # cannot express "none": refuse rather than widen the agent silently.
        raise StateError(
            f"{path} declares only tools Vibe has no tool for "
            f"({', '.join(declared)}); an empty enabled_tools would grant every tool."
        )
    if "skill" not in tools:
        tools.append("skill")
    body = rewrite_paths(body, root)
    if len(body) > VIBE_MAX_INSTRUCTION_CHARS:
        raise StateError(
            f"{path} renders {len(body):,} characters of instructions; "
            f"Vibe's limit is {VIBE_MAX_INSTRUCTION_CHARS:,}."
        )
    if "'''" in body:
        raise StateError(f"{path} contains ''' and cannot be a TOML literal string.")
    forbidden = TOML_FORBIDDEN.search(body)
    if forbidden:
        raise StateError(
            f"{path} contains the control character {forbidden.group()!r}, "
            "which a TOML literal string cannot hold."
        )
    lines = [
        VIBE_MARKER,
        f"description = {_toml_string(description)}",
        'agent_type = "subagent"',
    ]
    if tools:
        lines.append("enabled_tools = [" + ", ".join(_toml_string(tool) for tool in tools) + "]")
    lines += ["instructions = '''", body.rstrip("\n"), "'''", ""]
    return "\n".join(lines)


def claude_settings_sync(root: Path, home: Path, mode: str = "write") -> str:
    """The tracked subset merged into the home's own settings file.

    The home's file holds the host's choices, and the render owns the keys the
    subset names. A file that is not an object is refused rather than replaced:
    it holds the user's configuration. `mode="probe"` answers which path the
    render would change, or "" when the file already matches.
    """
    tracked = CLAUDE / SETTINGS
    if not tracked.exists():
        return ""
    try:
        subset = json.loads(rewrite_paths(tracked.read_text(), root))
    except json.JSONDecodeError as error:
        raise StateError(f"{tracked} is not valid JSON ({error}).")
    if not isinstance(subset, dict):
        raise StateError(f"{tracked} is not a JSON object. Fix the tracked subset.")
    target = home / SETTINGS
    current: dict = {}
    if target.exists():
        try:
            current = json.loads(target.read_text())
        except json.JSONDecodeError as error:
            raise StateError(f"{target} is not valid JSON ({error}). Fix it before sync.")
        if not isinstance(current, dict):
            raise StateError(f"{target} is not a JSON object. Fix it before sync.")
    status_line = subset.get("statusLine")
    if isinstance(status_line, dict):
        status_line["command"] = str(root / STATUSLINE_SOURCE)
    merged = {**current, **subset}
    if merged == current:
        return ""
    if mode == "write":
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(merged, indent=2) + "\n")
    return str(target)


# --------------------------------------------------------------------- homes


def _home(variable: str, default: str) -> Path:
    """A render target. AGENT_STATE_TEST=1 without an override is a hard error:
    the test suite must never write into the real home."""
    value = os.environ.get(variable)
    if not value:
        if os.environ.get("AGENT_STATE_TEST"):
            raise StateError(f"{variable} must be set when AGENT_STATE_TEST=1")
        value = default
    return Path(value).expanduser()


# Each host's home: the variable that overrides it, and its default.
HOST_HOMES = {
    "pi": ("AGENT_PI_HOME", "~/.pi/agent"),
    "claude": ("AGENT_CLAUDE_HOME", "~/.claude"),
    "vibe": ("AGENT_VIBE_HOME", "~/.vibe"),
}
DEFAULT_HOSTS = tuple(HOST_HOMES)


def _require_host(host: str) -> None:
    # Both tables, so a host added to one and not the other is a message rather
    # than a KeyError from the dispatch.
    if host not in HOST_HOMES or host not in RENDERERS:
        raise StateError(f"Unknown host {host!r}. Use: {', '.join(DEFAULT_HOSTS)}.")


def host_home(host: str) -> Path:
    variable, default = HOST_HOMES[host]
    # Resolved, so the clone-inside-home guard sees through a symlinked home
    # and a `..` in the override.
    return _home(variable, default).resolve()


def _hosts(root: Path) -> list[str]:
    """The hosts this machine renders: AGENT_STATE_HOSTS, then the tracked
    config.json `hosts` key, then all of them."""
    env = os.environ.get("AGENT_STATE_HOSTS")
    if env:
        hosts = [name.strip() for name in env.split(",") if name.strip()]
        if not hosts:
            raise StateError("AGENT_STATE_HOSTS names no host. Use: " + ", ".join(DEFAULT_HOSTS) + ".")
    else:
        config = root / "config.json"
        try:
            data = json.loads(config.read_text()) if config.exists() else {}
        except json.JSONDecodeError as error:
            raise StateError(f"config.json is not valid JSON ({error}). Fix its `hosts` key.")
        hosts = data.get("hosts", list(DEFAULT_HOSTS))
        if not isinstance(hosts, list) or not hosts:
            raise StateError('config.json `hosts` must be a non-empty list, as in {"hosts": ["pi"]}.')
    for host in hosts:
        _require_host(host)
    return list(dict.fromkeys(hosts))


def host_contract(root: Path, host_dir: Path) -> str:
    """shared/AGENTS.md with the host's own environment rules appended."""
    text = rewrite_paths((SHARED / "AGENTS.md").read_text(), root).rstrip() + "\n"
    append = host_dir / "AGENTS.append.md"
    if append.exists():
        extra = rewrite_paths(append.read_text(), root).strip()
        if extra:
            text += "\n" + extra + "\n"
    return text


def check_homes(root: Path) -> None:
    """A clone nested inside a home it renders would overwrite its own sources."""
    hosts = _hosts(root)
    if os.environ.get("AGENT_STATE_TEST"):
        missing = [HOST_HOMES[host][0] for host in hosts if not os.environ.get(HOST_HOMES[host][0])]
        if missing:
            raise StateError("AGENT_STATE_TEST=1 refuses to render without " + " and ".join(missing) + ".")
    for host in hosts:
        home = host_home(host)
        if root == home or home in root.parents:
            raise StateError(
                f"The clone at {root} sits inside the home it renders ({home}). "
                f"Clone beside the home (for example ~/agent-state) and point "
                f"AGENT_STATE_DIR there."
            )


def _link_skill(src: Path, dst: Path) -> None:
    """A skill is a link into the clone, so it cannot drift from its source."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.is_symlink() or dst.is_file():
        dst.unlink()
    elif dst.is_dir():
        # A real directory is a skill the owner installed by hand, and it may
        # hold a credential. Refuse rather than delete it.
        raise StateError(
            f"{dst} is a real directory, not a link into the clone. "
            f"Move it aside, or rename the shared skill it collides with."
        )
    dst.symlink_to(src, target_is_directory=True)


def _harness_text(root: Path) -> str | None:
    """HARNESS.md beside the contract, with the token resolved, or None when the clone has none."""
    source = root / "HARNESS.md"
    return rewrite_paths(source.read_text(), root) if source.exists() else None


def _render_harness(root: Path, home: Path, written: list[str]) -> None:
    """The contract tells the agent to read HARNESS.md beside it, so it is rendered too."""
    target = home / "HARNESS.md"
    text = _harness_text(root)
    if text is None:
        # The clone dropped it, so a copy left in the home is this renderer's orphan.
        if target.exists():
            target.unlink()
        return
    target.write_text(text)
    written.append(str(target))


def _drift_harness(host: str, home: Path, expected: str | None) -> list[tuple[str, str]]:
    """HARNESS.md beside the contract: stale, missing, or left behind by a dropped source."""
    target = home / "HARNESS.md"
    if expected is None:
        return [(host, str(target))] if target.exists() else []
    return _drift_file(host, target, expected)


def _render_pi(root: Path, home: Path, written: list[str]) -> None:
    home.mkdir(parents=True, exist_ok=True)
    pairs = [(PI / "settings.json", home / "settings.json")]
    for src in sorted((SHARED / "agents").glob("*.md")):
        pairs.append((src, home / "agents" / src.name))
    for src in sorted((SHARED / "prompts").glob("*.md")):
        pairs.append((src, home / "prompts" / src.name))
    for src in _dirs(SHARED / "skills"):
        pairs.append((src, home / "skills" / src.name))
    for src, dst in pairs:
        if src.is_dir():
            dst.mkdir(parents=True, exist_ok=True)
            shutil.copytree(src, dst, dirs_exist_ok=True)
        elif src.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(rewrite_paths(src.read_text(), root))
        else:
            continue
        written.append(str(dst))
    (home / "AGENTS.md").write_text(host_contract(root, PI))
    written.append(str(home / "AGENTS.md"))
    _render_harness(root, home, written)
    # Text files inside a copied skill keep the token otherwise.
    skill_files = (home / "skills").rglob("*") if (home / "skills").exists() else []
    for path in skill_files:
        if path.is_file() and path.suffix in (".md", ".sh", ".py"):
            original = path.read_text()
            rewritten = rewrite_paths(original, root)
            if rewritten != original:
                path.write_text(rewritten)


def _render_vibe(root: Path, home: Path, written: list[str]) -> None:
    home.mkdir(parents=True, exist_ok=True)
    # Every agent is rendered before anything is written, so a refused one
    # leaves the home as it was instead of half-rendered.
    agents = {
        f"{src.stem}.toml": vibe_agent(root, src)
        for src in sorted((SHARED / "agents").glob("*.md"))
    }
    (home / "AGENTS.md").write_text(host_contract(root, VIBE))
    written.append(str(home / "AGENTS.md"))
    _render_harness(root, home, written)
    (home / "agents").mkdir(parents=True, exist_ok=True)
    for name, text in agents.items():
        target = home / "agents" / name
        target.write_text(text)
        written.append(str(target))
    # Vibe loads every `agents/*.toml` it finds, so a file this renderer wrote
    # and would no longer write stays a live subagent until it is removed. The
    # marker is the ownership test: a file the owner wrote is theirs.
    for path in sorted((home / "agents").glob("*.toml")):
        if path.name in agents or not path.is_file():
            continue
        try:
            owned = path.read_text().startswith(VIBE_MARKER)
        except (OSError, UnicodeDecodeError) as error:
            # `check` reports it as stale, so a silent skip would leave a
            # finding no `sync` can clear. Name it instead.
            raise StateError(
                f"{path} cannot be read ({error}). Fix it or remove it before the next sync."
            ) from error
        if owned:
            path.unlink()
    sources = [src for src in _dirs(SHARED / "skills") if src.name not in PI_ONLY_SKILLS]
    for src in sources:
        dst = home / "skills" / src.name
        _link_skill(src, dst)
        written.append(str(dst))
    # Vibe lists every directory under `skills/` that holds a `SKILL.md`, so a
    # link this renderer no longer writes stays a skill until it is removed.
    # Only a link into `shared/skills/<same name>` is this renderer's: a link
    # the owner made, and a real directory such as `kaneo-api`, are theirs.
    names = {src.name for src in sources}
    if (home / "skills").is_dir():
        for path in sorted((home / "skills").iterdir()):
            if path.name in names or not path.is_symlink():
                continue
            if path.resolve() == (SHARED / "skills" / path.name).resolve():
                path.unlink()


def _render_claude(root: Path, home: Path, written: list[str]) -> None:
    home.mkdir(parents=True, exist_ok=True)
    (home / "CLAUDE.md").write_text(host_contract(root, CLAUDE))
    written.append(str(home / "CLAUDE.md"))
    _render_harness(root, home, written)
    for src in sorted((SHARED / "agents").glob("*.md")):
        text = claude_agent(root, src)
        if text is None:
            continue
        (home / "agents").mkdir(parents=True, exist_ok=True)
        (home / "agents" / src.name).write_text(text)
        written.append(str(home / "agents" / src.name))
    for src in sorted((SHARED / "prompts").glob("*.md")):
        keys, body = _frontmatter(src.read_text())
        head = ["---"]
        if keys.get("description"):
            head.append(f"description: {keys['description']}")
        if keys.get("argument-hint"):
            head.append(f"argument-hint: {keys['argument-hint']}")
        head += ["---", "", rewrite_paths(body, root)]
        (home / "commands").mkdir(parents=True, exist_ok=True)
        (home / "commands" / src.name).write_text("\n".join(head))
        written.append(str(home / "commands" / src.name))
    for src in _dirs(SHARED / "skills"):
        if src.name not in PI_ONLY_SKILLS:
            dst = home / "skills" / src.name
            _link_skill(src, dst)
            written.append(str(dst))
    for src in sorted((CLAUDE / "output-styles").glob("*.md")):
        (home / "output-styles").mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, home / "output-styles" / src.name)
        written.append(str(home / "output-styles" / src.name))
    script = root / STATUSLINE_SOURCE
    if script.exists():
        target = home / STATUSLINE
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(script, target)
        target.chmod(0o755)
        written.append(str(target))
    settings = claude_settings_sync(root, home)
    if settings:
        written.append(settings)


RENDERERS = {"pi": _render_pi, "claude": _render_claude, "vibe": _render_vibe}


def render_home(root: Path, host: str) -> list[str]:
    """Write one host's derived files. Returns the paths written."""
    _require_host(host)
    check_homes(root)
    written: list[str] = []
    RENDERERS[host](root, host_home(host), written)
    return written


def _drift_file(host: str, path: Path, expected: str | None) -> list[tuple[str, str]]:
    """One rendered file: missing, unreadable, or different from its render.

    `expected is None` means the renderer would not write this file at all.
    """
    if expected is None:
        return []
    try:
        actual = path.read_text()
    except (OSError, UnicodeDecodeError):
        return [(host, str(path))]
    return [] if actual == expected else [(host, str(path))]


def _drift_agents(
    host: str, home: Path, expected: dict[str, str | None], marker: str | None
) -> list[tuple[str, str]]:
    """Every agent the renderer would write, plus the ones it wrote and no longer would.

    An orphan is reported only when it carries the renderer's marker: a file the
    owner wrote by hand in the same directory is theirs, not drift.
    """
    findings: list[tuple[str, str]] = []
    for name, text in expected.items():
        findings += _drift_file(host, home / "agents" / name, text)
    if marker and (home / "agents").is_dir():
        # Vibe loads `agents/*.toml` only, so that is the set it can leave behind.
        for path in sorted((home / "agents").glob("*.toml")):
            if path.name in expected or not path.is_file():
                continue
            try:
                owned = path.read_text().startswith(marker)
            except (OSError, UnicodeDecodeError):
                owned = True
            if owned:
                findings.append((host, str(path)))
    return findings


def _drift_skills(host: str, home: Path, sources: list[Path]) -> list[tuple[str, str]]:
    """A skill link that is missing, dangling, or points somewhere else."""
    findings: list[tuple[str, str]] = []
    for src in sources:
        dst = home / "skills" / src.name
        if not dst.is_symlink() or dst.resolve() != src.resolve():
            findings.append((host, str(dst)))
    return findings


def drift(root: Path) -> Iterator[tuple[str, str]]:
    """Which host copies differ from what the clone would render. Read-only, git-free.

    A generator, so a source the renderer refuses surfaces as one finding after
    the ones already collected instead of replacing them.
    """
    check_homes(root)
    hosts = _hosts(root)
    skills = [src for src in _dirs(SHARED / "skills") if src.name not in PI_ONLY_SKILLS]
    harness = _harness_text(root)
    if "pi" in hosts:
        home = host_home("pi")
        yield from _drift_file("pi", home / "AGENTS.md", host_contract(root, PI))
        yield from _drift_harness("pi", home, harness)
    if "vibe" in hosts:
        home = host_home("vibe")
        yield from _drift_file("vibe", home / "AGENTS.md", host_contract(root, VIBE))
        yield from _drift_harness("vibe", home, harness)
        expected: dict[str, str | None] = {}
        for src in sorted((SHARED / "agents").glob("*.md")):
            expected[f"{src.stem}.toml"] = vibe_agent(root, src)
        yield from _drift_agents("vibe", home, expected, VIBE_MARKER)
        yield from _drift_skills("vibe", home, skills)
    if "claude" in hosts:
        home = host_home("claude")
        yield from _drift_file("claude", home / "CLAUDE.md", host_contract(root, CLAUDE))
        yield from _drift_harness("claude", home, harness)
        expected = {}
        for src in sorted((SHARED / "agents").glob("*.md")):
            expected[src.name] = claude_agent(root, src)
        yield from _drift_agents("claude", home, expected, None)
        yield from _drift_skills("claude", home, skills)
        stale_settings = claude_settings_sync(root, home, mode="probe")
        if stale_settings:
            yield ("claude", stale_settings)
        script = root / STATUSLINE_SOURCE
        if script.exists():
            target = home / STATUSLINE
            if not target.exists() or target.read_text() != script.read_text() or not (target.stat().st_mode & 0o111):
                yield ("claude", str(target))


# ------------------------------------------------------------------- commands


def behind(root: Path) -> tuple[int, int] | None:
    """Commits behind upstream and ahead of it, or None without a tracking branch."""
    if not git_ok(root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"):
        return None
    counts = git(root, "rev-list", "--left-right", "--count", "@{u}...HEAD").split()
    return int(counts[0]), int(counts[1])


def cmd_pull(root: Path) -> str:
    if git(root, "status", "--porcelain").strip():
        raise StateError("The state tree is dirty. Snapshot or discard changes first.")
    git(root, "pull", "--ff-only")
    return "Pulled. " + cmd_sync(root)


def cmd_sync(root: Path) -> str:
    hosts = _hosts(root)
    written: list[str] = []
    for host in hosts:
        written += render_home(root, host)
    return f"Rendered {len(written)} files into: {', '.join(hosts)}."


def cmd_status(root: Path) -> str:
    changes = git(root, "status", "--short").strip()
    counts = behind(root)
    summary = ["clean" if not changes else changes]
    if counts:
        upstream_behind, ahead = counts
        summary.append(f"upstream: {upstream_behind} behind, {ahead} ahead")
    try:
        for host, path in drift(root):
            summary.append(f"drifted ({host}): {path}")
    except StateError as error:
        # The git summary above is still worth printing.
        summary.append(f"cannot render: {error}")
    return "\n".join(summary)


# A prose file: the change needs no Backlog task.
PROSE_SUFFIXES = (".md", ".mdx", ".txt", ".rst")


def task_code_missing(root: Path, message: str, paths: list[str]) -> None:
    """Raise unless the message's first word is a task id, when a path outside `backlog/`
    is not prose. No rule applies without a `backlog/` directory, before the first commit,
    or when every changed path outside `backlog/` is prose. The id is the task file's name
    up to ` - `, as Backlog names it (`task-3` for `task-3 - Title.md`)."""
    if not (root / "backlog").is_dir() or not git_ok(root, "rev-parse", "--verify", "HEAD"):
        return
    outside = [p for p in paths if p and not p.startswith("backlog/")]
    if not outside or all(p.lower().endswith(PROSE_SUFFIXES) for p in outside):
        return
    code = message.split(" ", 1)[0].upper() if message else ""
    ids = {path.name.split(" - ", 1)[0].upper() for path in (root / "backlog" / "tasks").glob("task-*")}
    if code in ids:
        return
    raise StateError(
        "No Backlog task for this change. Start the message with a task code such as TASK-3 "
        '(any case): run `backlog task create "..."`, then `snapshot "TASK-3 ..."`. Tasks here: '
        + (", ".join(sorted(ids)) or "none")
    )


def cmd_snapshot(root: Path, message: str) -> str:
    violations = tracked_violations(root)
    if violations:
        raise StateError("Tracked host-only files: " + ", ".join(violations))
    issues = inspect_json(root)
    if issues:
        raise StateError("Literal secrets or invalid JSON: " + ", ".join(issues))
    # Before staging, so a refusal leaves the index as it was found.
    untracked = git(root, "ls-files", "-m", "-o", "--exclude-standard", "-z").split("\0")
    task_code_missing(root, message, untracked)
    git(root, "add", "-A", "--", ".")
    staged = git(root, "diff", "--cached", "--name-only", "-z").split("\0")
    leaked = [path for path in staged if path and is_forbidden(path)]
    if leaked:
        # Unstage only what this snapshot staged, so work staged before it stays.
        git(root, "reset", "-q", "--", *leaked, check=False)
        raise StateError("Refused to stage host-only files: " + ", ".join(leaked))
    # `--quiet` exits 1 when there *are* staged changes; it prints nothing either way.
    if git_ok(root, "diff", "--cached", "--quiet"):
        return "Nothing to commit."
    git(root, "commit", "-m", message or "chore: update agent state")
    return f"Committed: {message or 'chore: update agent state'}"


def cmd_push(root: Path) -> str:
    violations = tracked_violations(root)
    if violations:
        raise StateError("Tracked host-only files: " + ", ".join(violations))
    git(root, "push")
    return "Pushed."


def cmd_check(root: Path) -> str:
    """One line per finding, nothing when clean. Exit 1 when anything is behind or drifted."""
    lines: list[str] = []
    try:
        counts = behind(root)
        if counts and counts[0] > 0:
            lines.append(
                f"agent-state: this checkout is {counts[0]} commit(s) behind origin. "
                f"Run `agent-state pull` before relying on this configuration."
            )
        for host, path in drift(root):
            lines.append(f"agent-state: the {host} copy at {path} is stale. Run `agent-state sync`.")
    except (StateError, OSError) as error:
        # `git()` raises StateError; the OSError is a file read. A hook never
        # blocks a session, so either is one finding line, after the findings
        # already collected.
        lines.append(f"agent-state: {error}")
    return "\n".join(lines)


def cmd_hosts(root: Path) -> str:
    hosts = _hosts(root)
    lines = [f"state:  {root}", f"hosts:  {', '.join(hosts)}"]
    lines += [f"{host + ':':7} {host_home(host)}" for host in hosts]
    lines.append(f"origin: {git(root, 'remote', 'get-url', 'origin', check=False).strip() or 'not set'}")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="agent-state", description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=["pull", "status", "snapshot", "push", "sync", "check", "hosts"])
    parser.add_argument("message", nargs="*", help="snapshot commit message")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args(argv)

    if args.command == "check":
        try:
            root = require_root()
            _bind(root)
        except StateError:
            return 0  # A hook must never block a session over a missing checkout.
        text = cmd_check(root)
        if text:
            print(text, file=sys.stderr if args.json else sys.stdout)
        return 1 if text else 0

    try:
        root = require_root()
        _bind(root)
        if args.command == "pull":
            out = cmd_pull(root)
        elif args.command == "sync":
            out = cmd_sync(root)
        elif args.command == "status":
            out = cmd_status(root)
        elif args.command == "snapshot":
            out = cmd_snapshot(root, " ".join(args.message))
        elif args.command == "push":
            out = cmd_push(root)
        else:
            out = cmd_hosts(root)
    except (StateError, OSError) as error:
        print(f"agent-state: {error}", file=sys.stderr)
        return 1
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
