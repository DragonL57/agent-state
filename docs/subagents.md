# Running subagents in parallel

Sources: [Run agents in parallel](https://code.claude.com/docs/en/agents), [Create custom subagents](https://code.claude.com/docs/en/sub-agents), [Run parallel sessions with worktrees](https://code.claude.com/docs/en/worktrees), [Dynamic workflows](https://code.claude.com/docs/en/workflows).

Claude Code has five ways to run work at once. Pick by who decides what runs next, then by whether the workers edit the same files.

| Approach | Who decides what runs next | Where results go | Use it when |
| --- | --- | --- | --- |
| Subagents | Claude, turn by turn | Back into the session that spawned them | A side task would flood the main context |
| Agent view (`claude agents`) | You dispatch each session | To you | Several independent tasks you check on later |
| Agent teams (experimental) | A lead session | A shared task list the teammates read | Workers must talk to each other |
| Dynamic workflows | A script | Script variables, never your context | Dozens of agents, or findings cross-checked |
| Projects / threads | You start each thread | One project conversation | Work spans days, machine can be off |

`/batch` is a packaged use of subagents plus worktrees: it splits one large change into 5 to 30 isolated workers.

## The four things that decide whether parallel pays

- **Shared files.** Workers that write the same file undo each other. Partition by file, or isolate with worktrees. Agent teams have no worktree isolation, so their teammates must own disjoint files.
- **Self-sufficiency.** A fresh subagent knows only its brief. `parallel.md` owns that rule.
- **A verification loop.** A session that can run its own tests needs less supervision. Add a verifier agent before adding a third parallel worker.
- **Review capacity.** The ceiling is how many diffs you can read. Start at two or three workers, and add one only while review keeps up.

## How this repository lines up

- Slice partition by file and the one-writer rule for shared artifacts: `{{AGENT_STATE}}/rig/.rig/playbooks/parallel.md`.
- Brief, review, and integration: `{{AGENT_STATE}}/rig/.rig/playbooks/review.md`.
- Agents that own a file slice need write access, which `implementer` has. Every reviewer here is read-only on purpose: a reviewer that edits both reviews and supplies the change.
- Reviewers run in parallel already, on the same diff, each with its own lens. That is safe because none of them writes.
- Isolation: `isolation: "worktree"` on one `Agent` call. In frontmatter it puts every slice on its own branch, where the orchestrator's diff misses it. The worktree starts from the default branch, or from the session's HEAD with `worktree.baseRef: "head"`.
- In this repo, parallel implementers share one checkout and take disjoint files, as `parallel.md` says. A worktree is for a slice you merge as its own branch.
- Model and effort: a subagent runs on the parent's model unless its frontmatter sets `model` or `effort`. Exploration and mechanical edits can run on a cheaper model; review and planning want the parent's.
- Instruction files: a subagent in a worktree takes its instructions from the main conversation. It does not load the worktree's own `CLAUDE.md`, so a brief must not depend on that copy.
- Context: every subagent `description` loads into every session. 15,000 tokens combined is where Claude Code warns at startup, so keep each description to one line and put detail in the body.
- Cost: every agent sends its own requests against the same limits. An agent you do not need costs the tokens and the rerun of the work it got wrong.

## In practice

1. Finish the plan first, as `.rig/playbooks/workflow.md` step 1 says.
2. Move the shared pieces (enum, constants, schema, shared test helper) into one landed edit before any slice starts.
3. Spawn implementers on disjoint file sets in one message, so they run at the same time. Give each one the brief `parallel.md` describes.
4. While they run, read the plan and trace the user path. Do not busy-wait.
5. Integrate: read each slice's diff, run its check, then one pass for the contradictions only the whole change shows.
6. Reviewers on the whole change, in parallel, all read-only. Fix, then verify with a command.
