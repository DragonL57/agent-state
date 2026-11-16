# Harness work

Pending changes to this pi setup, and the decisions that would cost another
session to settle again.

Delete an open item when it lands. A settled decision stays until it stops
being true.

## Open

Nothing.

## Settled

- **The global install inherits the session model.** No agent under
  `~/.pi/agent/agents/` declares `model:`, and there is no `rig/models.json`.
  `fallback-runner` gets its alternate model in the launch call. The kit's
  target-repo install still pins per `models.sh`, so a repo gets
  role-appropriate models; this install does not.
- **The kit is the source for the playbooks and agents.** `/home/thelong/rig`
  owns `.rig/playbooks/` and `agents/`; `rig/sync.sh` renders them here. The
  rules, the two allowed differences, and `RIG_KIT` are in that script's header.
- **The kit's pre-commit hook runs `sync.sh --check`.** Installed by
  `rig/sync.sh --install-hook`, it bakes the kit path in, refuses a commit while
  this copy is behind, and refuses one whose staged playbooks differ from the
  working tree the render read. It will not overwrite a hook it did not write.
  Git does not track hooks, so a fresh clone needs the flag once.
- **The launch call is the only turn budget.** No agent pins `max_turns`, and
  `subagents.json` sets `defaultMaxTurns: 0`, because the runner takes the
  launch call first, then the agent's own `max_turns`, then the project
  default, and a nonzero default would cap the implementer too. The number
  recorded for display resolves the agent first, so a pinned agent would show
  a different number from the one enforced; `doc-3` carries the detail.
  `tools:` lists name pi built-ins only, so an extension tool there cannot
  fire a `tools-error` warning on every spawn.
- **`tests/test_harness.sh` is this tree's evidence.** The kit's suite cannot
  reach `rig/sync.sh`, so the renderer, the drift detector, the prune and the
  hook are covered here instead.

## Not here

Kit work belongs to upstream's backlog in `rig/backlog/`. Fork-only work stays
in this file, because a new task there collides with an upstream id on rebase.
