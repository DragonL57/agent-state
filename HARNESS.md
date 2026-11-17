# Harness work

Pending changes to this pi setup, and the decisions that would cost another
session to settle again.

Delete an open item when it lands. A settled decision stays until it stops
being true.

## Open

- **The brief is the only unreviewed artifact.** The Operating Protocol tells the
  session the user is the verified owner, and the Delegation section makes the main session
  the only actor that talks to the user. When this install is driven by an
  external orchestrator, that orchestrator holds the user role: its brief
  arrives pre-approved and final. The six reviewers check the work against the
  brief, not against what the real principal asked for, so a vague or wrong
  brief is executed competently and passes review. Nothing in the harness
  reviews the translation from intent to brief. Until an intake step exists
  that writes the brief and a check that reads it back against the request,
  every downstream verdict inherits that first step's error.
- **Kit work: `review.md` still mandates the asks the grant removes.** Step 3
  says "ask the user" before raising a reviewer's budget, and step 4 says build
  no reviewer user decision until the user chooses. `AGENTS.md` now answers both
  under a grant, and the grant's "where a playbook or a skill asks, a grant
  answers" line settles the precedence. The kit copy still reads as binding, so
  land the matching clause there and re-render.

## Settled

- **The reviewer pair is mandatory; risk scales only the extras.** Every
  delegated change gets `spec-reviewer` and `taste-reviewer`, and risk decides
  only the reviewers added on top: `test-reviewer`, `docs-reviewer`,
  `uiux-reviewer`, and `final-reviewer`.
- **`fallback-runner` stays unpinned.** Its caller supplies an explicit model,
  because a fallback that inherits the writer's model is not a fallback. It is
  the only agent under `agents/` without a `model:` line, and the test enforces
  that.
- **The global install routes models per role.** `.rig/models.json` holds one
  model and effort per pinned agent, written by `rig/install.sh` and rendered
  into `agents/*.md`. Every role runs `mistral/deepseek-v4-1-flash-1017`, the
  only DeepSeek the Mistral provider carries here, and the effort is the only
  difference: implementer `medium`, taste, spec, test and uiux `high`,
  docs `low`, final `max`. One model across roles means the final review is
  not an independent opinion; the effort ladder is the compensation, and a
  second model is the fix once the account carries one. `tests/test_harness.sh`
  compares each agent file against `models.json`, so the file is the one place
  a model changes.
- **The kit is the source for the playbooks and agents.** `/home/thelong/rig`
  owns `.rig/playbooks/` and `agents/`; `rig/sync.sh` renders them here. The
  rules, the two allowed differences, and `RIG_KIT` are in that script's header.
- **The kit owns `verify-app`; this install holds the copy at
  `~/.pi/agent/skills/verify-app/`.** The source is
  `rig/.agents/skills/verify-app/`. `rig/install.sh` copies the kit's skills into
  the target's `.agents/skills/`, and pi reads the global copy at
  `skills/verify-app/`. That copy holds the feature map format
  (`verify/features.tsv`) and a Chrome DevTools Protocol driver
  (`assets/drive.py`) that returns reached, measured, and a screenshot, with
  exit 0 pass, 1 fail, 2 unreachable. Verified 2026-11-16 against a local
  fixture: two rows passed, a missing selector and a dead port both exited 2,
  and the screenshot showed the rendered page. The driver needs
  `websocket-client`; the venv is `~/.local/share/verify-app-venv`.
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
  the grant, the decision-trail path, the irreversible set, and the plan gate;
  `rig/playbooks/workflow.md` step 1 carries the `Done when:` exit condition.
  `tests/test_harness.sh` fails when any of them is dropped. Every grant rule is
  a constraint rather than advice, and the test fails on a bullet that reads as
  advice. The evidence for the polarity rule is in
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
