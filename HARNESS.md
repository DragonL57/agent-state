# Harness work

Pending changes to this two-host setup, and the decisions that would cost another session to settle again.

Delete an open item when it lands. A settled decision stays until it stops being true.

## Open

- **Post-merge pull on a second host is the first real test.** The two clones have never pulled from a shared `main` at once. Run `agent-state pull` on the Claude host after the pi host pushes, and confirm the rendered `CLAUDE.md` and agents match the shared tree, before trusting the loop.
- **Claude-side drift coverage is partial.** `check` compares `CLAUDE.md` and agent files. A hand edit to a rendered command or a symlinked skill is not compared, because a command is small and a skill is a symlink into the clone (so it cannot drift).
- **The rig's own installer is still in `rig/`.** `rig/install.sh` writes the kit into a *target project*; it has not been re-pointed at agent-state. Decide whether the kit keeps its own project installer or becomes `rig/` inside this repository only.

## Settled

- **The Claude shell uses `/pull`, `/status`, `/snapshot`, `/push`, `/sync`; pi uses `/agent-state <verb>`.** A command named `status` would collide with Claude Code's own built-in, so the plugin's commands are unprefixed. Both split verbs call the same `tools/state.py`.

- **One manager, two thin hosts.** The pi extension and the Claude plugin both call `tools/state.py`; neither re-implements a verb.
- **The full contract goes to Claude.** No section is stripped. Only paths and tool names are translated, because the owner asked for the same rules on both hosts.
- **Claude agents inherit the session model and effort.** The renderer drops `model:` and `thinking:`; it never pins either.
- **Same verbs on both hosts.** `pull`, `status`, `snapshot`, `push`, `sync`, `check`, `hosts`.
- **Public repository, by the owner's choice** after being told what the contract exposes.
