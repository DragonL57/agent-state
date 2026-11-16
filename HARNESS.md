# Harness work

Pending changes to this pi setup. The session todo list covers one turn; this
file covers what outlives it.

Delete an item when it lands, and say what landed in the commit message.

## Open

### 1. Port the global install's fixes into rig

`rig/agents/*.md` still carries what the global install already fixed.

- `max_turns: 20` on four reviewers and `40` on final-reviewer. Frontmatter
  overrides the launch call (`invocation-config.ts:139`), so the 8-turn
  correction budget in `rig/.rig/playbooks/review.md` step 5 never applies.
  Delete the five lines and update `rig/tests/test_install.sh:774-777`, which
  asserts them.
- `tools: read, grep, find, ls, bash` on six agents. `grep`, `find`, and `ls`
  are off in `settings.json`, so those three are dead. Drop them.
- `tools: all` on the implementer, which hands it git. Narrow the list and ban
  the git commands.
- `rig-update` step 6 tells the reader to confirm model pins that no agent
  declares. Drop the clause.

Check: `grep -c '^max_turns:' rig/agents/*.md` reports 0 for every file, and
`bash rig/tests/test_install.sh` passes.

### 2. Restore grilling in the global workflow playbook

`rig/playbooks/workflow.md` step 1 says to use `grilling` when the user asks or
when a product choice blocks the slice. The global copy dropped that line
because the skill was not installed. `rig/README.md` lists grilling as an
optional external skill, so the conditional belongs in
`rig/playbooks/workflow.md`.

Check: `grep -c grilling ~/.pi/agent/rig/playbooks/workflow.md` reports 1.

### 3. Decide what the global install is

Two copies of the same playbooks exist. `~/.pi/agent/rig/playbooks/` is
hand-fixed; `rig/.rig/playbooks/` is upstream's. They differ by up to 14 lines
per file, and each copy names its own path prefix, so they are never
byte-identical. Either the global install becomes the kit's own output, or the
hand-built copy stays and the kit is only a source to read.

Check: one copy is authoritative, and the other is deleted or regenerated from
it.

### 4. Give the global agents model routing

The kit ships `models.sh` and generates `.rig/models.json`. The global install
has neither, so every agent inherits the session model. `fallback-runner` is
meant to run on a model other than the writer's.

Check: `~/.pi/agent/rig/models.json` exists and at least one agent declares a
`model:`.

### 5. Delete pandino-trial

`/home/thelong/pandino-trial` holds stale `.pandino/` copies from before the
rename. It is scratch.

Check: the directory is gone.

## Not here

Kit work belongs to upstream's backlog in `rig/backlog/`. Fork-only work stays
in this file, because a new task there collides with an upstream id on rebase.
Item 1 is fork-only: it edits files upstream owns, so it lands as its own commit
and is expected to conflict on rebase.
