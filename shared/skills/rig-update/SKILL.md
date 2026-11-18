---
name: rig-update
description: Check whether agent-state is current with origin, and refresh both hosts when it is behind. Use when the user asks to update, upgrade, or check agent-state.
---

# Update agent-state

The kit no longer has a separate upstream: agent-state is the source, each host keeps its own clone, and every host's copy is rendered from that clone. An update is a pull, not an installer run.

1. Run `agent-state status`. It prints the tree's changes, the upstream counts, and any host copy that drifted.
2. Behind origin: run `agent-state pull`. It refuses a dirty tree, fast-forwards, and renders both homes. A dirty tree is committed with `agent-state snapshot` (on the user's go-ahead) or discarded by the user; never `git stash` it away silently.
3. A host copy reported as drifted with the tree clean: run `agent-state sync` to re-render it. Drift after a deliberate hand edit means the edit belongs in the shared tree, not the rendered file; take it there on the user's request.
4. Inspect the diff of what arrived yourself. Verify that the eight agents are present in both agent directories, the specialists carry their pi model pins, `fallback-runner` has no pin, no agent pins `max_turns`, and the repository's checks (`npm run check`) pass.
5. Keep an update separate from feature work. Launch `implementer` or any reviewer only on the user's explicit request. Bring a change that affects product behavior, security, or team workflow to the user for approval.
6. Report what was added, updated, preserved, or left unresolved. `agent-state push` only on the user's explicit request.

Hosts: pi runs `/agent-state pull` in a session; Claude Code runs `/pull` from the plugin (or `python3 -I "$AGENT_STATE_DIR/tools/state.py" pull`).
