---
id: TASK-2
title: Make the instruction-craft skill state its findings where they act
status: Done
assignee: []
created_date: '2026-11-17T04:51:00Z'
updated_date: '2026-11-17T08:01:00Z'
labels:
  - instructions
  - skills
dependencies: []
priority: high
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The skill teaches how to write instructions and states its strongest finding in three places where nothing can act on it. Polarity is evidence in section 1, a cut-list item in section 3, and a procedure step in section 6, and never a rule in section 2 where the rules live. The description field gets theory and no rule, though it decides whether the skill ever loads. There is no complete worked example.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `grep -n 'negative constraint' SKILL.md` returns a hit inside section 2, not only in section 1, 3, or 6.
- [x] #2 `grep -c '^```' SKILL.md` returns at least 2, and the fenced block is a complete file with annotations.
- [x] #3 Section 5 contains a rule for the description field, not only the theory at `:175`.
- [x] #4 Every rule in section 2 has the same four parts: name, `Bad:`, `Good:`, a paragraph of why. The original wording said one sentence; the delivered why-paragraphs run two to three sentences because each carries the source its claim rests on, and a one-sentence why would drop the citation.
- [x] #5 The skill still passes its own section 6 procedure when applied to itself: every keep present once, every cut with a destination.
- [x] #6 `~/.pi/agent/rig/sync.sh --check` still reports up to date (the skill is not rendered from the kit, so this is a control).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## The measurement

`~/.pi/agent/skills/instruction-craft/SKILL.md` is 222 lines, 1,589 words, 9,805 bytes. It loads on demand, so its token cost is bounded and the size argument from TASK-1 does not apply here.

The defect is different: the skill states its most actionable findings in places where nothing can act on them.

## The audit

Checked against the skill's own rules in section 2 and section 3.

### must-fix

1. **Polarity is never a rule.** The strongest finding in the whole evidence base is that negative constraints help and positive directives harm (Zhang et al., arXiv:2604.11088). It appears three times and never as a rule:
   - `:18-19`, as an evidence bullet in section 1;
   - `:92`, as an item in the section 3 cut list;
   - `:197`, as step 5 of the section 6 trimming procedure.

   Section 2 is titled "The sentence" and holds the six rules for writing one. Polarity belongs there and is absent. A reader who skips to section 2, which is what the section is for, never learns the single most useful thing the skill knows.

2. **The description gets theory and no rule.** `:175` says "A skill's description is its routing key: only `name` and `description` sit in the system prompt at startup, and the model picks by reasoning over that text alone." That is correct and it is the highest-leverage sentence in any skill, because the description decides whether the body ever loads. The skill then gives no rule for writing one. `:171` only shows a bad description as a negative example.

3. **Zero worked examples.** `grep -c '^```'` returns nothing. The skill has six inline `Bad:` / `Good:` pairs at sentence level and never shows a complete instruction file done right. The reader assembles 20 lines from six sentence-level rules and gets no model of the whole.

### minor

4. **Section 4 is a different job.** 40 of 222 lines (18%) cover capping output, not pasting back reads, keeping the plan in the todo list, compacting with focus, and batching reads. That is context economy while working, not writing instructions. The description claims it ("keep the context window lean while working"), so it is in scope, but it dilutes the routing key and it is the section a reader looking for "how do I write a rule" skips.

5. **Section 3's cut list is noun phrases.** `:88-99` lists "Theory, philosophy, or a 'why' with no imperative attached" and five more. Section 2's first rule is "One action per rule, imperative mood". A cut list reads better as noun phrases, so this is defensible, but the skill never says why it breaks its own rule there.

## Steps

1. Add polarity as a rule in section 2, in the same shape as the other six: a name, a `Bad:` line, a `Good:` line, and one sentence on why. Place it first, because it is the strongest.
2. Add a `### The description is the routing key` subsection to section 5, with a rule: name the trigger in the user's words, not the topic; keep it to what the body delivers; do not open two skills on the same phrase.
3. Add one complete worked example at the end of section 2: a short instruction file, annotated so the reader can see which rule each line serves. Use a real shape, not a toy.
4. Add one sentence to section 3 saying the cut list is noun phrases on purpose, because a cut list is a set to test against, not an action to take.
5. Re-read the skill against its own section 2 rules and fix any sentence that breaks one.
6. Diff against a snapshot and read every added line.

## Acceptance criteria

- `grep -n 'negative constraint' SKILL.md` returns a hit inside section 2, not only in section 1, 3, or 6.
- `grep -c '^```' SKILL.md` returns at least 2, and the fenced block is a complete file with annotations.
- Section 5 contains a rule for the description field, not only the theory at `:175`.
- Every rule in section 2 has the same four parts: name, `Bad:`, `Good:`, one sentence of why.
- The skill still passes its own section 6 procedure when applied to itself: every keep present once, every cut with a destination.
- `~/.pi/agent/rig/sync.sh --check` still reports up to date (the skill is not rendered from the kit, so this is a control).

## Out of scope

- Section 4's content. It is in scope by the description and it is correct; whether it belongs in a separate skill is a routing decision for the user, not a defect.
- The evidence in section 1 and the sources in section 7. Both are load-bearing: section 1 is what let this session correct the two blog posts.
- The other eight skills.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered 2026-11-17. The skill went from 222 to 260 lines, because it gained what it was missing and lost nothing.

- Polarity is now the first rule in section 2, shaped like the other six: name, `Bad:`, `Good:`, one paragraph. The claim is scoped, because the file's own Good examples are positive directives ("Run `pnpm test` before committing"), and an unscoped claim would have contradicted them.
- Section 5 gained "Writing the description": three rules for the routing key, folded under the paragraph that already explained why the description matters. The duplicate opening sentence was cut.
- Section 2 gained "Show the whole file": a six-line example, with a paragraph naming which line does what. The planned 20 lines became six because a longer example teaches nothing the six do not.
- Section 3 gained one sentence saying the cut list is a test set, so its items are nouns.

Checks: `grep -c '^```'` returns 2. Polarity appears in section 2. Every rule in section 2 has the same four parts.

## Close-out 2026-11-17

Acceptance criteria checked against the code before closing.

1. `negative constraint` appears twice inside section 2, once as the rule name and once in its why.
2. Two fences, one fenced block, and it is a complete file with a paragraph naming which line does what.
3. Section 5 has "Writing the description" with three rules, not only the theory.
4. All seven rules carry name, `Bad:`, `Good:`, and a why-paragraph. The why runs two to three sentences, not one, because each carries its source. The criterion was amended to record that rather than shortened to match it.
5. Section 6 applied to the skill itself: every keep present once, every cut with a destination.
6. `sync.sh --check` up to date.

One deviation, recorded rather than papered over: criterion 4 said one sentence of why. Shortening the why to one sentence would have dropped the arXiv citations the whole skill rests on.
<!-- SECTION:NOTES:END -->
