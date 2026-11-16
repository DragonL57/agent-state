# Harness work

Pending changes to this pi setup, and the decisions that would cost another
session to settle again.

Delete an open item when it lands. A settled decision stays until it stops
being true.

## Open

- **Kit work: scale the reviewer set by risk.** `rig/playbooks/review.md` step 1
  gives every delegated change `spec-reviewer` and `taste-reviewer`. The cost is
  fixed and the risk is not, so a long run stalls on review it did not need.
  Land in the kit: a full set at the code-ready head, one verifier at a new head
  after a rebase or a conflict resolution, none for wording, and a restack whose
  `git patch-id` is unchanged keeps its verdict. The kit checkout is absent on
  this host, so this cannot be rendered here.
- **Kit work: `review.md` still mandates the asks the grant removes.** Step 3
  says "ask the user" before raising a reviewer's budget, and step 4 says build
  no reviewer user decision until the user chooses. `AGENTS.md` now answers both
  under a grant, and the grant's "where a playbook or a skill asks, a grant
  answers" line settles the precedence. The kit copy still reads as binding, so
  land the matching clause there and re-render.
- **Kit work: a verify skill per repo.** `skills/` has no equivalent of pstack's
  `create-verification-skill`: a project-local feature map plus a driver CLI, so
  a reviewer reads a screenshot instead of a diff. `browser-sessions` and the
  chrome-devtools MCP are the runtime lane; the map and the driver are missing.

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
  hook are covered here instead, plus the contract rules named below.
- **`AGENTS.md` is not rendered from the kit.** `rig/sync.sh` writes only
  `rig/playbooks/*.md` and `agents/*.md`, so the contract is edited here and a
  hand edit survives a render. A playbook or agent edit does not: it is drift
  until the kit has it.
- **The contract's autonomy rules are checked, not trusted.** `AGENTS.md` names
  the grant, the `Done when:` plan field, the decision-trail path, and the
  irreversible set, and `tests/test_harness.sh` fails when one is dropped. Every
  grant rule is a constraint rather than advice, and the test fails on a bullet
  that reads as advice. The evidence for the polarity rule is in
  `skills/instruction-craft/SKILL.md` section 1.
- **The decision trail stays out of the user's repos.** A grant run writes
  `~/.pi/agent/decisions/<slug>.tsv`, not a file in the repo root, because git
  hygiene forbids `clean` and the dirty worktree belongs to the user.
- **A contract edit needs no approval under a grant.** The metaprompting ladder
  puts a check before a prose edit, so most self-repair lands in a test that
  fails on the old behavior. The remaining prose edits are reported with their
  evidence, and `tests/test_harness.sh` is the check that they did not break the
  contract.

## Not here

Kit work belongs to upstream's backlog in `rig/backlog/`. Fork-only work stays
in this file, because a new task there collides with an upstream id on rebase.
