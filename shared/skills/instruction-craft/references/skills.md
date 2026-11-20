# Skill craft

What a skill needs once the decision to write one is made. A skill is a folder
with a `SKILL.md` at its top, and only that file's `name` and `description` sit
in the system prompt at startup.

## Contents

- The file, and when it loses to a line in the contract
- The description
- The body
- References
- Scripts
- Steps and checks
- Words
- Testing

## The file

```text
skill-name/
  SKILL.md
  references/guide.md
  scripts/check.py
```

- One folder per skill, named to match `name`.
- `name` is lowercase letters, numbers, and hyphens, 64 characters at most. It
  names the activity: `pdf-processing`, not `helper`.
- `description` is filled in and 1,024 characters at most.
- Do not put a dated statement in the file. A sentence that turns wrong on a
  date costs a reader a wrong decision on that date. A deprecation date is the
  one exception, and it sits in the closed section for old methods below.

Below roughly a screen of procedure, a skill loses to a line in the contract. A
skill pays its body every time it opens, plus the routing decision every time
it might.

## The description

The description is the only text the model has when it picks the skill, from a
list that can hold a hundred.

- Write in third person. "Runs the migration and checks the row count." "I can
  help with migrations" reads as chat and routes unreliably.
- State what it does and when to open it, in that order.
- Name the triggers in the user's own words. "Use when the user mentions a
  failed deploy or pastes a stack trace" opens on those moments.
- Keep the key terms that a person would say, and the topic's own technical
  words.

Bad: `Helps with documents`
Good: `Checks the row count before and after a migration. Use when a change touches the schema.`

## The body

- Keep `SKILL.md` under 500 lines. Past that the model reads a fraction of it.
  Move the rest into a reference file.
- Assume the reader knows its tools, its language, and the task. Cut the
  explanation of what a test is or what git does.
- Add no option the reader never needs. One default, then the escape hatch:
  "Use the fast reader. For a scanned page, convert to an image and read it with
  the same tool."
- Write the rule and the value. A number with no reason is a slot the reader
  fills with a guess: `Set the timeout to 30s. CI takes 22s, so 10s fails.`
- Keep one term for one thing. Field, field, field. Not field, box, control.
- Put old methods in one closed section with the date, when a reader might still
  meet them. `Deprecated 2025-08: the v1 endpoint.` The current method keeps the
  main text.

## References

- Link a reference from `SKILL.md` directly, one level deep. A file that links
  to another file gets opened with `head -100` and read half through.
- Name the file for its content: `form-validation-rules.md`, not `doc2.md`.
- Split by domain when the domains do not overlap on a task. A finance question
  should open `reference/finance.md` and pay nothing for `reference/sales.md`.
- Put a contents list at the top of any reference longer than 100 lines. A
  reader that previews the file sees the map first.
- Write forward slashes in every path, on every platform.

## Scripts

A script the skill ships beats code the model writes at run time: it is the same
every time, it costs no tokens until it runs, and it fails in one place.

- Say which one the reader does.
  - "Run `scripts/validate.py <path>` and fix what it reports." (run)
  - "See `scripts/score.py` for the ranking rule." (read)
- Have the script handle its own errors and name the fix: "Field `signature_date`
  not found. Fields present: `customer_name`, `order_total`." A script that
  reports only a traceback hands the work back.
- Justify every constant in a comment. A number with no reason is one the
  reader cannot tune.
- List the packages the script needs, with the install line. Assume nothing is
  installed.

## Steps and checks

- For a task with many steps, put the steps in order and give the reader a list
  to copy and tick off. Each step names its command and the thing that proves
  it worked.
- For a task with one right answer, run a check and loop: validate, fix what it
  named, validate again, continue when it passes.
- For a batch that changes many places, have the reader write the plan to a file
  and check the file before applying it. Reversible planning beats an
  irreversible mistake.
- Take the decision points in order: "Is this a new file? Then follow A.
  Otherwise follow B." A branch the reader has to invent is a branch it gets
  wrong.

## Words

- Imperative mood, one action a sentence.
- The condition first: "When the schema changes, run `pnpm db:migrate`."
- A concrete example beats a description. One input and output pair teaches
  the format faster than a paragraph about it.
- Show a template when the output shape matters, and say whether it is fixed
  or a starting point.

## Testing

The writer of the skill is the worst judge of it. It reads what it meant.

- Have a second session do a real task with the skill in front of it, not a
  made-up one.
- Watch which files it opens and in what order. A file it never opens is a
  signpost problem or a file that earns nothing.
- Watch the route. A skill that opens on the wrong task has a description
  problem. A skill that never opens on the right one has a trigger the user
  does not use.
- Check what the reader missed, then change one line and run the task again.
