# Design

## One tree, two hosts

Pi and Claude Code read the same ideas in different files. Pi wants `~/.pi/agent/AGENTS.md`, lowercase tool names and `thinking`; Claude Code wants `~/.claude/CLAUDE.md`, capitalised tool names, `name:` in agent frontmatter, and commands under `commands/`.

agent-state does not keep two copies. It keeps one source (`shared/`) and renders each host's home from it, with the translation rules in `extensions/pi-state/translate.ts` (tested) mirrored in `tools/state.py` (the implementation both hosts call).

## The clone is not a home

The repository is larger than either host home: it carries the tooling, tests, two source halves, and the rig kit. It therefore lives beside the homes, not inside one:

1. `AGENT_STATE_DIR`, when set (both hosts, first);
2. `PI_STATE_DIR`, then `PI_CODING_AGENT_DIR`, for the pi extension;
3. `~/agent-state`, the shared fallback: the pi extension's last resort and the Claude plugin's commands and hook.

Rendering writes *into* the host homes and never reads them back. A rendered file is derived: hand edits to `~/.claude/CLAUDE.md` or the pi `AGENTS.md` are lost on the next `sync`, and `check` reports exactly that drift so the hook can name it.

## `{{AGENT_STATE}}`

One token, two resolutions. Shared files may not name a host path: `{{AGENT_STATE}}/AGENTS.md` becomes the pi home for pi and `~/.claude` for Claude. The Claude renderer passes shared agent bodies through the same substitution, so an agent's "read the contract" line points at the right file on both sides.

## Command boundaries

- `status` is read-only.
- `snapshot` validates, stages, and commits locally. It refuses root host-only names and literal secrets in any tracked JSON file.
- `pull` requires a clean tree and accepts fast-forward updates only, then renders.
- `push` uploads existing commits without creating or changing one.
- `sync` renders without touching Git.
- `check` prints findings and exits 1, but exits 0 outside a checkout so a session hook can never block.

No command performs both commit and push. No lifecycle hook writes to Git or fetches into the user's checkout.

## Why the plugin is separate from the extension

Claude Code loads plugins (`.claude-plugin/plugin.json` with commands and hooks); pi loads TypeScript extensions (`pi.extensions` in `package.json`). Both are thin: they resolve their verb and call `tools/state.py`. Keeping the work in the manager is what makes "the same command on both hosts" true rather than aspirational.

## Why agent and playbook bodies stay together

Each rig agent's body is shared verbatim and only its wrapper differs. `rig/harnesses.sh` has writers for pi, Claude Code, opencode, and codex; agent-state uses the pi and Claude writers' rules in `translate.ts`/`state.py`. The bodies here no longer repeat the project-scoped "read `.rig/playbooks/...`" preamble, because the contract they read is rendered globally into each home.

## Why sessions are excluded

Pi and Claude session transcripts routinely embed source snippets, shell output, model responses, tool metadata, and images. Configuration sync and transcript archival have different privacy and retention requirements, so this repository handles configuration only.
