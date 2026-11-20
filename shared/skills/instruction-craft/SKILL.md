---
name: instruction-craft
description: Write a prompt, instruction, context file, or skill that a model can act on, keep the context window lean while working, and decide where a rule belongs. Use when writing or editing AGENTS.md, CLAUDE.md, a prompt template, a skill, or any instruction, or when a session has grown long and expensive.
---

# Instruction craft

Three jobs: the sentence, the session, the placement.

## 1. The sentence

### Write the constraint, not the prescription

Bad: `Write clean code.`
Good: `Do not refactor or reformat code unrelated to the task.`

A constraint can be checked against the code. A command the agent must run stays
a command: the command is its own check.

### One action per rule, imperative mood

Bad: `You should try to make sure the tests are run before you commit.`
Good: `Run pnpm test before committing.`

Cut `should`, `try to`, `make sure`, `as appropriate`, `where possible`. Each
one is a decision the model has to make before it can act.

### Condition first

Bad: `Run the migration script when the schema changes.`
Good: `When the schema changes, run pnpm db:migrate.`

A trailing condition is the first thing a skim drops. A leading one frames what
follows.

### Name the moment, not the topic

Bad: `Be careful with the database.`
Good: `Before any write to prod, run pnpm db:dry-run and paste the row count.`

"Careful" has no moment attached, so it fires never or always.

### A placeholder is a defect

Bad: `Increase the timeout if the test is slow.`
Good: `Set the timeout to 30s. The suite takes 22s on CI, so 10s fails.`

A slot the writer left open is a slot the model fills with a guess.

### Number when order matters, bullet when it does not

Bad: `- Open the migration file` / `- Run pnpm db:migrate` / `- Add the column`
Good: `1. Add the column to the migration file` / `2. Run pnpm db:migrate`

A bullet list says the items are independent. When step two depends on step one,
the order is the rule.

### The altitude test

A rule states something the agent can verify it did. If two people could
disagree about whether it was followed, it is advice, not a rule.

Bad: `Write clean, maintainable code.`
Good: `Do not leave a function longer than the one it replaces.`

### Show the whole file

```markdown
# Payments service

- Do not log a card number, a CVV, or a full PAN. Log the last four digits.
- Run `pnpm test --filter payments` before every commit.
- When the schema changes, run `pnpm db:migrate` before the tests.
- Do not add a dependency for a problem the standard library solves.
- Do not refactor or reformat code unrelated to the task.
```

The header costs nothing and says what the file governs. The lines are negative
constraints, one names a check, and one is condition-first: the schema change is
the trigger, the migration is the action. Every rule is checkable, and none of it
repeats what the code already says.

## 2. What to cut

- Theory, philosophy, or a "why" with no imperative attached.
- Generic positive prescriptions: "follow code style", "keep functions small",
  "write clean code".
- Repository overviews, directory trees, architecture narratives.
- Anything the agent can read in the code, the README, or a manifest.
- Anything the harness already injects: tool descriptions, tool schemas, the
  system prompt. The harness copy is current; yours is a stale copy waiting to
  happen.
- A second home for a rule that already lives elsewhere in the file.
- A citation, a link, or an author name. The rule stands on its own, and a
  source line is one more thing to keep current.

What survives: exact commands with the flag that matters, rules that differ from
the default, boundaries, and project gotchas that cost real time when discovered
wrong.

The cut list is a test set for a draft, so its items are nouns.

## 3. The session

### Cap output at the source

Bad: `git log`, `cat build.log`, `pytest`.
Good: `git log --oneline -10`, `tail -40 build.log`, `pytest -x -q tests/test_x.py`.

A full dump costs the answer plus everything you did not need, and it stays in
context for the rest of the session. Reach for `--oneline`, `--stat`, `-l`,
`-c`, `-q`, `-x`, `head`, `tail` first.

### Do not paste back what you just read

Bad: quoting 60 lines of a file to "confirm" it, then editing it.
Good: quote the one line that decides the edit.

The file is already in context from the read. Quoting it again doubles the cost
and adds nothing.

### Keep the plan in the todo list, not in prose

Bad: restating the remaining steps in a message every turn.
Good: update the todo status; one sentence on what changed.

A prose plan goes stale the moment it is written and is paid for on every
subsequent turn. The todo list is the plan.

### Compact with a focus

Bad: `/compact`
Good: `/compact keep open todo ids and their subjects`

Say what the summary must keep, or the summarizer keeps what it finds
interesting.

### Batch independent reads

Bad: three reads in three turns for three files you already know you need.
Good: three reads in one turn, then a fourth only if it depends on them.

Three reads in one turn pay one turn's cost.

## 4. Where the rule goes

Ask in this order. Stop at the first yes.

1. Does the harness already say it, in a tool description or the system prompt?
   Then nowhere.
2. Does it fire on every request, in every project? Then `AGENTS.md`, one line,
   and only if no other line already says it.
3. Does an existing skill own the topic? Then extend that skill.
4. Does it need a trigger no existing skill claims? Then a new skill.
5. Does it run on demand, once, with arguments? Then a prompt template in the
   harness home's `prompts/` directory.

The AGENTS.md format sets the file's shape: plain markdown, no required headings,
no required fields, and one file per package as needed. Any content is legal in
it. The rules above govern what goes in.

### Put a tool where it fires

Bad: a twelve-row table of every tool with a "use when" and a "never when".
Good: the tool named in the step that needs it; the table kept for tools with no
flow position.

A catalogue makes the model map a name back to a situation on every turn. A step
in the flow is already a situation. Keep a routing table for the tools that have
no position.

### Extend before you create

Bad: a new skill whose description opens "Use when writing or editing..." when
another skill already routes on that phrase.
Good: extend the existing skill, or pick a trigger no skill claims.

A skill's description is its routing key: only `name` and `description` sit in
the system prompt at startup, and the model picks by reasoning over that text
alone. A new skill that routes on a claimed trigger does not add a capability;
it adds a coin flip.

### Writing the description

- Do not name a topic where the user's own words give a trigger. "Use when the
  user shares screenshots" opens the skill; "visual design expertise" does not.
- Promise only what the body delivers. A description that oversells opens the
  skill on work it cannot finish.
- Do not open two skills on the same phrase. Overlapping triggers mean the model
  picks one and the other never loads.

### Writing the skill

How a skill is laid out, kept short, and tested: see `references/skills.md`.

## 5. Trimming an existing file

1. Snapshot it. You will diff against this at the end.
2. Inventory rules, not lines. A bullet carrying two rules becomes two entries.
3. Classify each entry: keep, merge into another entry, move to a skill, or cut.
4. Cut only with a destination: the repo, the README, the harness, or another
   line in the file. "It looks obvious" is not a destination.
5. Rewrite the keeps at the altitude test above. Positive directive becomes
   negative constraint. Philosophy becomes a label.
6. Re-read the trimmed file against the inventory. Every keep present exactly
   once; every cut has its destination still in place.
7. Diff. Read every added line and ask which rule it serves.
8. Check sibling context files the loader picks up (`CLAUDE.md`, `.cursorrules`)
   for a rule that now lives in neither. Reload the session when done: a running
   session keeps the old file.

### What the loader picks first

The file nearest the one being edited wins. A package file overrides the root
file.

The user's own message overrides every file. Write a rule that the user will
want to break on purpose, and it will be broken on purpose.

## 6. The session that forgets

A rule holds at the top of a session and weakens as the work goes on. What
keeps a rule is re-surfacing it at the moment it fires, and a check the agent
runs, so the rule comes back as a command result rather than a memory.

- Do not shorten a long file to make its rules stick. Put the rule where the
  step that needs it is.
- Do not trust a summary to keep a rule the file states. State it in the step.
