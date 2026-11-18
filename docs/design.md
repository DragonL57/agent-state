# Design

## One tree, two hosts

Pi and Claude Code read the same ideas in different files. Pi wants `~/.pi/agent/AGENTS.md`, lowercase tool names and `thinking`; Claude Code wants `~/.claude/CLAUDE.md`, capitalised tool names, `name:` in agent frontmatter, and commands under `commands/`.

agent-state does not keep two copies. It keeps one source (`shared/`) and renders each host's home from it, with the translation rules in `extensions/pi-state/translate.ts` (tested) mirrored in `tools/state.py` (the implementation both hosts call).

## The clone is not a home

The repository is larger than either host home: it carries the tooling, tests, two source halves, and the rig kit. It therefore lives beside the homes, not inside one:

1. `AGENT_STATE_DIR`, when set (both hosts, first);
2. `PI_STATE_DIR`, then `PI_CODING_AGENT_DIR`, for the pi extension;
3. `~/agent-state`, the shared fallback: the pi extension's last resort and the Claude plugin's commands and hook.

Rendering writes *into* the host homes and never reads them back. A rendered file is derived: hand edits to `~/.claude/CLAUDE.md` or the pi `AGENTS.md` are lost on the next `sync`, and `check` reports exactly that drift so the hook can name it. Rendered text may name the clone, because the clone is the one place every machine has the content, and it is the same path on a pi-only machine and a Claude-only one.

## Which hosts a machine renders

A machine may run both hosts, either, or the other. `sync` and `pull` render the hosts named in `config.json`'s `hosts` key, or in `AGENT_STATE_HOSTS` (comma-separated), which wins over the file. With neither, they render both. A host outside that list is skipped, and `check` stays silent about it, so a Claude-only machine never grows a `~/.pi/agent`, and the reverse.

## `{{AGENT_STATE}}`

One token, one resolution. Shared files may not name a host path: `{{AGENT_STATE}}` becomes the clone root on both hosts, so `{{AGENT_STATE}}/rig/.rig/playbooks/workflow.md` is a file the clone holds. The clone is the right target because it is where playbooks, prompts, skills and `tools/state.py` live, and it is the same path on every machine. A host home holds only rendered output, and only the files this machine's `hosts` config asks for. Both renderers resolve the token the same way: `tools/state.py`'s `rewrite_paths` (the renderer's, and the one `claude_settings_sync` applies to the tracked subset) and `extensions/pi-state/translate.ts`'s `claudePaths`. The Claude renderer passes shared agent bodies through that substitution, so an agent's "read the playbook" line points at a file that exists on both sides.

## The tracked settings subset

A host's own `settings.json` holds credentials and runtime state, so it stays out of Git and `snapshot` refuses it at the root of a render. The tracked `hosts/<host>/settings.json` is the portable subset, and each host renders it in its own file format: the pi render copies the subset over the home's file whole (`render_home`, the pi branch), and Claude merges the keys it names.

Claude merges only the keys the tracked subset names. `hosts/claude/settings.json` carries the `statusLine` key and nothing else, so a render puts that key into `~/.claude/settings.json` and leaves every other key where the owner put it. The render owns that key whole: a hand-set `statusLine` in the home is replaced on the next `sync`, and `check` names the difference before that.

Claude refuses a home file that is not a JSON object. Replacing it would lose the owner's configuration.

The status line lives in the clone and renders to the home. `shared/statusline/claude.sh` copies to `~/.claude/statusline.sh` with the exec bit set. The render sets the home's command to `{clone}/shared/statusline/claude.sh`, so the source is what runs, and a clone that moved shows up as drift.

## Command boundaries

- `status` is read-only.
- `snapshot` validates, stages, and commits locally. It refuses root host-only names and literal secrets in any tracked JSON file.
- `pull` requires a clean tree and accepts fast-forward updates only, then renders.
- `push` uploads existing commits without creating or changing one.
- `sync` renders the configured hosts without touching Git.
- `check` prints findings and exits 1, but exits 0 outside a checkout so a session hook can never block. It reports the configured hosts only, including a Claude `settings.json` that lost or changed a key the subset names and a missing or non-executable `statusline.sh`.

No command performs both commit and push. No lifecycle hook writes to Git or fetches into the user's checkout.

## Why the plugin is separate from the extension

Claude Code loads plugins (`.claude-plugin/plugin.json` with commands and hooks); pi loads TypeScript extensions (`pi.extensions` in `package.json`). Both are thin: they resolve their verb and call `tools/state.py`. Keeping the work in the manager is what makes "the same command on both hosts" true rather than aspirational.

## Why agent and playbook bodies stay together

Each rig agent's body is shared verbatim and only its wrapper differs. `rig/harnesses.sh` has writers for pi, Claude Code, opencode, and codex; agent-state uses the pi and Claude writers' rules in `translate.ts`/`state.py`. The bodies here no longer repeat the project-scoped "read `.rig/playbooks/...`" preamble, because the contract they read is rendered globally into each home.

## Why sessions are excluded

Pi and Claude session transcripts routinely embed source snippets, shell output, model responses, tool metadata, and images. Configuration sync and transcript archival have different privacy and retention requirements, so this repository handles configuration only.
