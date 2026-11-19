# Harness work

Pending changes to this three-host setup, and the decisions that would cost another session to settle again.

Delete an open item when it lands. A settled decision stays until it stops being true.

## Open

- **Post-merge pull on a second host is the first real test.** The two clones have never pulled from a shared `main` at once. Run `agent-state pull` on the Claude host after the pi host pushes, and confirm the rendered `CLAUDE.md` and agents match the shared tree, before trusting the loop.
- **pi-side drift coverage is partial.** `check` compares pi's `AGENTS.md` only, so a stale `~/.pi/agent/agents/*` or `prompts/*` passes. `docs/rendering.md` F2 records the same gap. Fix: render each file and compare it, as the Claude agent loop already does.
- **Claude-side drift coverage is partial.** `check` compares `CLAUDE.md`, agent files and skill links. A hand edit to a rendered command is not compared, because a command is small. An orphaned agent file is not reported either: a Claude agent carries no marker, so the renderer cannot tell its own leftover from an agent the owner wrote.
- **`npm pack` ships `hosts/` but not `shared/`.** `package.json` `files` lists the host append files and no contract to render them against. The extension resolves the manager from the clone, not from the package, so neither entry is needed; decide whether the package is a clone or an extension before changing the list.
- **Vibe has no behind-check hook.** The Claude plugin tells a session once when the checkout is behind origin; Vibe's `session_start` hook could do the same through `additional_context`, but nothing renders `~/.vibe/hooks.toml` yet. Until then, `pull` from the `agent-state` skill is the check.
- **A declared Vibe subagent gets no MCP tool.** Vibe binds the child with `integrations_enabled=False` and an empty MCP grant (`mistralai_vibe_local_harness/vibe/_subagents/_configuration.py`), and measures the ceiling against a catalogue built with `defer_mcp=True` (`vibe/app_server/_runtime.py`). The renderer writes no MCP glob into `enabled_tools`. When Vibe fills the grant, add one `<server>_*` glob per `[[mcp_servers]]` in the host `config.toml`. `enabled_tools` matches the name Vibe publishes (`<server>_<tool>`), and the Runtime route (`mcp_<server>.<tool>`) is a different name.
- **The rig's own installer is still in `rig/`.** `rig/install.sh` writes the kit into a *target project*; it has not been re-pointed at agent-state. Decide whether the kit keeps its own project installer or becomes `rig/` inside this repository only.

## Settled

- **Vibe is the third host.** `~/.vibe` renders `AGENTS.md` and `HARNESS.md`, symlinks every shared skill except the pi-only ones into `skills/`, and writes each shared agent as `agents/<name>.toml` with `agent_type = "subagent"`. `model:` and `thinking:` are dropped, so a Vibe subagent inherits the session's model and effort, as a Claude agent does. `sync` removes an agent file it wrote and would no longer write, and a skill link it no longer writes. An agent file without the renderer's marker is the owner's and survives; under `skills/` only a real directory survives, so a hand-installed skill such as `kaneo-api` must be a directory, not a symlink. Vibe's `config.toml` and `hooks.toml` stay host-only, and `shared/prompts/` is not rendered: `~/.vibe/prompts/` holds custom system prompts, not user commands.
- **`{{AGENT_STATE}}` resolves to the clone.** Playbooks, prompts, skills and `tools/state.py` live there, and every machine has it; the host home holds rendered output only. A relative path in the contract resolves in the home that holds the contract for `HARNESS.md` and `skills/<name>/`, which are rendered there; `decisions/` lives in the clone, at `{{AGENT_STATE}}/decisions/`. Findings F1-F3 of `docs/rendering.md` are closed; the checks there stay.
- **The Claude shell uses `/pull`, `/status`, `/snapshot`, `/push`, `/sync`; pi uses `/agent-state <verb>`.** A command named `status` would collide with Claude Code's own built-in, so the plugin's commands are unprefixed. Both split verbs call the same `tools/state.py`.

- **One manager, three thin hosts.** The pi extension and the Claude plugin both call `tools/state.py`, and Vibe's `agent-state` skill calls it too; none re-implements a verb.
- **The full contract goes to Claude.** No section is stripped. Only paths and tool names are translated, because the owner asked for the same rules on every host.
- **Claude agents inherit the session model and effort.** The renderer drops `model:` and `thinking:`; it never pins either.
- **Same verbs on every host.** `pull`, `status`, `snapshot`, `push`, `sync`, `check`, `hosts`.
- **Public repository, by the owner's choice** after being told what the contract exposes.
