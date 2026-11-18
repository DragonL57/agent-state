# Parallel agents

Read this after `.rig/playbooks/workflow.md` steps 1 and 5, when the plan splits into slices that touch no shared file.

Give small or short-lived projects one implementer at a time. Run agents in parallel only when the time they save is longer than the time they cost to set up and merge.

## The plan that makes parallel work

A plan written as numbered steps runs serially, whatever the orchestrator intends. Write the file map first, then the slices, then the steps.

```text
Files
  src/enum.ts          +2 cases
  src/reader.ts        handles the two cases
  src/writer.ts        emits them
  tests/fixtures/r.ts  fixtures the reader needs
  tests/fixtures/w.ts  fixtures the writer needs
  docs/schema.md       the new cases

Slices
  F  foundation   src/enum.ts                          check: npm test
  A  read path    src/reader.ts, tests/fixtures/r.ts   waits: F
  B  write path   src/writer.ts, tests/fixtures/w.ts   waits: F
  C  docs         docs/schema.md                       waits: none

Slices: F, C; A, B after F.
```

A and B pair because `r.ts` and `w.ts` are separate files. C edits a document, so it waits for no code and can run beside F.

## Spawn the slices together

Two slices that wait for nothing start in the same message, one `Agent` call each. A slice that lands clean unblocks the slices that named it; spawn them in the next message. While the slices run, the orchestrator reads the plan and prepares the integration checks.

## The brief is the whole context

A fresh agent knows only what its brief contains. Give each one the goal, the files it owns, and its check command; step 5's brief covers the rest. A brief you cannot write means the task is not understood well enough to split.

## Foundations first, then parallel

The foundations are in the working tree before the parallel slices start: one agent owns the enum every slice touches, the state machine, and the shared constants. Then assign the remaining agents files that no other slice touches, including any shared test helper or fixture. When two agents would write the same file, branch, or key, split the target so each owns its part. Add coordination only when one shared writer is a real invariant.

Keep callers working when you change an API, so each slice starts from a tree that builds.

## One checkout, disjoint files

Every slice in the planning tree works in the same checkout. Nothing is committed until the work is done and reviewed, so a slice here sees another slice's half-finished edits.

Three rules keep that safe:

- A slice never regenerates a shared artifact: a lockfile, codegen output, formatter output, or a snapshot. Hand install, codegen, format, and snapshot updates to one `implementer` after every slice lands.
- A slice's check covers its own files. A slice reports a failure outside its file set and leaves that file alone. The orchestrator re-runs that check after the neighbour lands.
- The orchestrator reads each slice with `git diff -- <its files>` and `git status --porcelain -- <its files>` before integrating, so a new file shows up too.

## A slice on its own branch

A slice that must merge as its own branch, or must start without the tree's uncommitted work, runs in a worktree. `Agent` takes `isolation: "worktree"` per call, so the orchestrator asks for it on that slice and leaves the others in the planning tree. Creating a worktree and merging its branch are git commands the user approves first.

The worktree starts from the default branch, with none of the planning tree's uncommitted work. `worktree.baseRef` set to `"head"` in Claude Code's settings file starts it from the session's HEAD instead; otherwise the orchestrator commits workflow step 4's failing tests before spawning, which needs the user's approval.

Integrate a worktree slice by its branch, never by `git status`: its edits exist only there. Read `git diff <its base> <its branch> -- <its files>`, and merge it after the slice's check passes and the user approves the merge.

## Work no slice covers

Each agent can finish its slice and still leave a bug in work no slice covered: a constant that disagrees across two slices, documentation describing deleted behavior, or a stub that stops the feature working end to end. The orchestrator finds those gaps.

Name each agent's files in its slice, hand the leftovers to an `implementer`, and integrate: read each diff, run checks matched to each artifact's purpose, and trace one user path end to end. One integration pass covers the cross-slice contradictions that per-slice reviews cannot see, under `.rig/playbooks/review.md`.
