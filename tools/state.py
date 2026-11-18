#!/usr/bin/env python3
"""agent-state: one Git-backed configuration, maintained for pi and Claude Code.

The repository is the source. Each machine keeps one *clone* of it (its own
branch is never used: everything lives on `main`), and renders the configured
homes from it:

    ~/.pi/agent     pi's home; rendered from shared/ (AGENTS.md, skills, prompts)
    ~/.claude       Claude Code's home; rendered from shared/ in Claude's
                    conventions, plus the Claude plugin

The hosts a machine renders come from `AGENT_STATE_HOSTS`, then this clone's
`config.json` `hosts` key, then both.

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
)

# Portable parts of the tree, relative to the repo root.
# Filled from the resolved root, never read from the working directory: a
# command may run from anywhere and still must render the same tree.
SHARED = Path("shared")
PI = Path("hosts/pi")
CLAUDE = Path("hosts/claude")


def _bind(root: Path) -> None:
    global SHARED, PI, CLAUDE
    SHARED, PI, CLAUDE = root / "shared", root / "hosts" / "pi", root / "hosts" / "claude"


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
    path = path.replace("\\", "/").lstrip("./")
    for entry in HOST_ONLY:
        if entry.endswith("/"):
            if path.startswith(entry):
                return True
        elif path == entry:
            return True
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


def claude_agent(root: Path, path: Path, claude_home: Path) -> str | None:
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


def claude_contract(root: Path, claude_home: Path) -> str:
    """The whole contract, with the state path pointing at the clone.

    The owner's choice is that Claude Code carries the same rules as pi, so
    nothing is stripped. Both hosts resolve `{{AGENT_STATE}}` to the clone.
    """
    return rewrite_paths((SHARED / "AGENTS.md").read_text(), root)


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


def pi_home() -> Path:
    return _home("AGENT_PI_HOME", "~/.pi/agent")


def claude_home() -> Path:
    return _home("AGENT_CLAUDE_HOME", "~/.claude")


DEFAULT_HOSTS = ("pi", "claude")


def _hosts(root: Path) -> list[str]:
    """The hosts this machine renders: AGENT_STATE_HOSTS, then the tracked
    config.json `hosts` key, then both."""
    env = os.environ.get("AGENT_STATE_HOSTS")
    if env:
        hosts = [name.strip() for name in env.split(",") if name.strip()]
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
        if host not in DEFAULT_HOSTS:
            raise StateError(f"Unknown host {host!r}. Use: {', '.join(DEFAULT_HOSTS)}.")
    return hosts


def pi_contract(root: Path, home: Path) -> str:
    """shared/AGENTS.md with the pi-only environment rules appended."""
    text = rewrite_paths((SHARED / "AGENTS.md").read_text(), root).rstrip() + "\n"
    append = PI / "AGENTS.append.md"
    if append.exists():
        extra = rewrite_paths(append.read_text(), root).strip()
        if extra:
            text += "\n" + extra + "\n"
    return text


def check_homes(root: Path) -> None:
    """A clone nested inside a home it renders would overwrite its own sources."""
    if os.environ.get("AGENT_STATE_TEST"):
        needed = {"pi": "AGENT_PI_HOME", "claude": "AGENT_CLAUDE_HOME"}
        missing = [needed[host] for host in _hosts(root) if not os.environ.get(needed[host])]
        if missing:
            raise StateError("AGENT_STATE_TEST=1 refuses to render without " + " and ".join(missing) + ".")
    homes = [pi_home()] + ([claude_home()] if os.environ.get("AGENT_CLAUDE_HOME") or "claude" in _hosts(root) else [])
    for home in homes:
        if root == home or home in root.parents:
            raise StateError(
                f"The clone at {root} sits inside the home it renders ({home}). "
                f"Clone beside the home (for example ~/agent-state) and point "
                f"AGENT_STATE_DIR there."
            )


def render_home(root: Path, host: str) -> list[str]:
    """Write one host's derived files. Returns the paths written."""
    check_homes(root)
    written: list[str] = []
    if host == "pi":
        home = pi_home()
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
            written.append(str(dst))
        (home / "AGENTS.md").write_text(pi_contract(root, home))
        written.append(str(home / "AGENTS.md"))
        # Text files inside a copied skill keep the token otherwise.
        skill_files = (home / "skills").rglob("*") if (home / "skills").exists() else []
        for path in skill_files:
            if path.is_file() and path.suffix in (".md", ".sh", ".py"):
                original = path.read_text()
                rewritten = rewrite_paths(original, root)
                if rewritten != original:
                    path.write_text(rewritten)
        return written

    home = claude_home()
    home.mkdir(parents=True, exist_ok=True)
    (home / "CLAUDE.md").write_text(claude_contract(root, home))
    written.append(str(home / "CLAUDE.md"))
    for src in sorted((SHARED / "agents").glob("*.md")):
        text = claude_agent(root, src, home)
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
            dst.parent.mkdir(parents=True, exist_ok=True)
            if dst.is_symlink() or dst.exists():
                if dst.is_symlink():
                    dst.unlink()
                elif dst.is_dir():
                    shutil.rmtree(dst)
            dst.symlink_to(src, target_is_directory=True)
            written.append(str(dst))
    for src in sorted((CLAUDE / "output-styles").glob("*.md")):
        (home / "output-styles").mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, home / "output-styles" / src.name)
        written.append(str(home / "output-styles" / src.name))
    return written


def drift(root: Path) -> list[tuple[str, str]]:
    """Which host copies differ from what the clone would render. Read-only, git-free."""
    check_homes(root)
    hosts = _hosts(root)
    findings: list[tuple[str, str]] = []
    if "pi" in hosts:
        home = pi_home()
        if (home / "AGENTS.md").exists():
            render = pi_contract(root, home)
            if (home / "AGENTS.md").read_text() != render:
                findings.append(("pi", str(home / "AGENTS.md")))
    if "claude" in hosts:
        home = claude_home()
        contract = claude_contract(root, home)
        if (home / "CLAUDE.md").exists() and (home / "CLAUDE.md").read_text() != contract:
            findings.append(("claude", str(home / "CLAUDE.md")))
        for src in sorted((SHARED / "agents").glob("*.md")):
            expected = claude_agent(root, src, home)
            target = home / "agents" / src.name
            if expected is not None and target.exists() and target.read_text() != expected:
                findings.append(("claude", str(target)))
    return findings


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
    findings = drift(root)
    for host, path in findings:
        summary.append(f"drifted ({host}): {path}")
    return "\n".join(summary)


def cmd_snapshot(root: Path, message: str) -> str:
    violations = tracked_violations(root)
    if violations:
        raise StateError("Tracked host-only files: " + ", ".join(violations))
    issues = inspect_json(root)
    if issues:
        raise StateError("Literal secrets or invalid JSON: " + ", ".join(issues))
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
    counts = behind(root)
    if counts and counts[0] > 0:
        lines.append(
            f"agent-state: this checkout is {counts[0]} commit(s) behind origin. "
            f"Run `agent-state pull` before relying on this configuration."
        )
    for host, path in drift(root):
        lines.append(f"agent-state: the {host} copy at {path} is stale. Run `agent-state sync`.")
    return "\n".join(lines)


def cmd_hosts(root: Path) -> str:
    return "\n".join(
        [
            f"state:  {root}",
            f"hosts:  {', '.join(_hosts(root))}",
            f"pi:     {pi_home()}",
            f"claude: {claude_home()}",
            f"origin: {git(root, 'remote', 'get-url', 'origin', check=False).strip() or 'not set'}",
        ]
    )


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
        try:
            text = cmd_check(root)
        except StateError as error:
            print(f"agent-state: {error}", file=sys.stderr)
            return 1
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
