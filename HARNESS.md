# Harness work

Pending changes to this pi setup. The session todo list covers one turn; this
file covers what outlives it.

Delete an item when it lands. Keep a decision here only when settling it again
would cost another session.

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
- **The launch call is the only turn budget.** No agent pins `max_turns`, and
  `subagents.json` sets `defaultMaxTurns: 0`, because the runner resolves
  `explicit ?? agent ?? default` and a nonzero default would cap the
  implementer too. `tools:` lists name pi built-ins only, so an extension tool
  there cannot fire a `tools-error` warning on every spawn.

## Waiting

- The kit change is uncommitted in `/home/thelong/rig`: 16 files, fork-only,
  expected to conflict on rebase. Commit it on request.

## Not here

Kit work belongs to upstream's backlog in `rig/backlog/`. Fork-only work stays
in this file, because a new task there collides with an upstream id on rebase.
