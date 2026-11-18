---
id: TASK-5
title: Make the reviewers follow documented engineering practices
status: Done
assignee: []
created_date: '2026-11-18T01:32:00Z'
updated_date: '2026-11-18T01:55:00Z'
labels: []
dependencies: []
priority: high
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The five reviewer agents (spec, taste, test, docs, final) carry good advice with no named source, and they miss practices with strong evidence behind them: no diff-size entry gate (defect density collapses above 250-400 changed lines, SmartBear/Cisco 2500 reviews; Google calls 1000 changed lines too large), no requirements-quality test on the acceptance criteria (ISO/IEC/IEEE 29148:2018 5.2.5), no information-hiding or cyclomatic-complexity check, and a mutation check whose evidence (Just et al., FSE 2014: mutant detection tracks real-fault detection independent of coverage, 73% coupling) is stated nowhere. Write one specification that names every practice and its source, then rewrite the shared playbook and the five agent files against it. Turn budgets, the uiux reviewer, the implementer, and testing.md are out of scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The specification doc-1 (backlog/docs/specs/) is distilled rules only: 36 rule lines (E1-E3, A1-A8, S1-S5, T1-T8, V1-V6, D1-D3, F1-F3), each opening with the rule, carrying no citation and no rationale; the five rewritten reviewer agent files name no check it does not carry.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan

1. Specification as doc-1: approval bar, three entry conditions, eight universal rules A1-A8, per-role checks with a source each. Done, revised twice.

2. Update `rig/playbooks/reviewing.md`: the approval bar, E1-E3, A1-A8 as one shared block, and the /tmp probe allowance. Update `rig/playbooks/review.md`: risk tier that adds reviewers to the mandatory pair, the `Existing evidence` field, intent without the implementer's justification, the five-minor cap, approval bound to the tree, the cross-model refutation in step 5, the landing read in step 6. Add the sensitive-path list A3 points at to `HARNESS.md`.

3. Rewrite the five role files against the spec: name the check ids, stay under 40 lines each.

4. Verify with grep per check id, then read the whole diff back.

5. Run spec-reviewer and taste-reviewer on the diff.

Exit: every role check id appears in its agent file, every E and A id in reviewing.md, and the diff read back shows no rule stated twice.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Spec written as doc-1 and round one of spec-reviewer came back changes needed. Fixed: T5 source added and F1 folded into section 1; entry conditions cut to three (size, tools, rationale) since E4 and E5 restated reviewing.md; section 2 preamble now states one consequence; the undefined emergency escape hatch replaced by the user-acceptance path in review.md step 4; T6 makes the AGENTS.md comment allowlist operative; T7 scoped to tool-implemented rules so the eye keeps the AGENTS.md rules no tool enforces; E2 and T7 now name one carrier (the brief's Existing evidence field); five role collisions given an owner in a boundary clause (S1/D2, S3/F2, S4/T5, D3/F4, E2/T7); the unscoreable checks now require the quoted instance; S5 scoped to the specification; the unsourced 15-file cap dropped; 200 changed to the case study's 250; the 60-minute bound added. V3 scoped inside testing.md rather than dropping the check.

Spec review cost, per review.md step 6. Round 1: spec-reviewer, 7 of 12 turns, 1.1 min, no timed-out commands, verdict changes needed, 14 must-fix. Round 2 (correction check): spec-reviewer, 8 of 8 turns, 0.7 min, hit the turn limit, verdict changes needed, 2 must-fix + 2 minor, all fixed by the orchestrator; a third pass was not run.

Revision after the user challenged the research base. Round one was anchored in human-review literature only (1976-2018). Added an agent-era layer: seven universal rules A1-A7 (precision duty and a five-minor cap, evidence-with-command, depth follows risk, adversarial check on every must-fix, approval bound to the tree, author fixes rather than reviewer, measure reverts and repair), plus T8 reuse-before-addition, V6 tests-not-weakened, S3 widened to the plausible wrong change, and pre-existing as a finding tag. Sources added: Anthropic best practices, Solving code review at Anthropic, verification, context engineering; Claude Code Code Review docs and Claude Academy; DORA 2025; METR RCT (19% slowdown against a forecast 24% speedup); GitClear 211M lines; Uber uReview (75% usefulness, 65% vs 51% addressed); Meta MetaMateCR (reviewer-facing patches slowed reviews 5%); GitHub agent-PR review guidance; three AI-review benchmarks with their conflict of interest noted. E3 was rewritten as intent-travels-justification-does-not, because a reviewer handed the generator's reasoning is swayed by it.

Third round: spec-reviewer on the agent-era layer, 8 of 12 turns, 1.2 min, verdict changes needed, 13 must-fix + 5 minor. Fixed: A3 rewritten so risk adds reviewers instead of removing the mandatory pair, and the impossible two-approval tier replaced by the user reading the change; A2 routes through the brief and the two-minute cap with /tmp probes, and files unevidenced claims as plausible risk; A4 split so the reviewer re-checks with one command and the cross-model refutation is review.md step 5; A7 keeps only what a review turn can observe and pushes the landing signal to step 6; the rule set now covers all six reviewers and gains A8 (a recurring reviewer failure becomes a check); S3 and F2 given separate jobs; V6 exempts a test removed with its behavior; the architecture exclusion scoped to system-level design; T8 given a boundary clause; the five-minor cap labelled a starting ceiling; E3 softened and pointed at the brief line; pre-existing now cites the reviewing.md rule instead of restating it; four over-strong citations reduced to what their source measures.

Fourth round, form only: the user flagged that the rules were written as essays with their reasoning inline. Rewrote every rule line to open with the rule (imperative or negative), then only the numbers it needs, then the source. Round four review (spec-reviewer, 5 of 8 turns, 1.0 min, changes needed) found 3 must-fix: A3 and A8 named an act a read-only reviewer cannot perform, now both reviewer-side (A3 reports a missing reviewer run, A8 names the failure with both review ids and leaves the repair to review.md step 6); S2's 'fail' was ambiguous, now 'a criterion no test could falsify'. 13 minors fixed too: the reasoning clauses and tool-pipeline walks moved into the source parentheses, the A2/A4 command-budget contradiction resolved (three re-checks inside A2's two-minute cap), the duplicate T7/E2 and A2/probe statements cut, T3's uncounted second criterion folded into one sentence, and F2's execution half now points at review.md step 3. Every one of the 36 rule lines carries a source.

## Research record (removed from doc-1 on the user's instruction; doc-1 is distilled rules only)

- Google, *Engineering Practices: Code Review Developer Guide* — "The Standard of Code Review", "What to Look For in a Code Review", "Small CLs", "Context". <https://google.github.io/eng-practices/review/>
- IEEE Std 1028-2008, *IEEE Standard for Software Reviews and Audits* — review types, minimum entry criteria, exit decision, reinspection.
- ISO/IEC/IEEE 29148:2018, *Requirements engineering* — §5.2.5 characteristics of individual requirements, §5.2.6 characteristics of a requirement set, §5.2.7 requirement language criteria, §5.2.8 requirements attributes.
- IEEE Computer Society, *SWEBOK Guide v4.0* (Washizaki, ed., 2024) — Software Quality Knowledge Area, §2.4.1 Defect Characterization.
- C. Sadowski, E. Söderberg, L. Church, M. Sipko, A. Bacchelli, "Modern Code Review: A Case Study at Google", ICSE-SEIP 2018.
- A. Bacchelli and C. Bird, "Expectations, Outcomes, and Challenges of Modern Code Review", ICSE 2013.
- Smart Bear Software, *Best Kept Secrets of Peer Code Review* (Cisco MeetingPlace case study, 2500 reviews, 3.2M lines, 2006) — review size, inspection rate, review duration.
- R. Just, D. Jalali, L. Inozemtseva, M. D. Ernst, R. Holmes, G. Fraser, "Are Mutants a Valid Substitute for Real Faults in Software Testing?", FSE 2014.
- M. Wacker, "Just Say No to More End-to-End Tests", Google Testing Blog, 2015. M. Cohn, *Succeeding with Agile*, 2009.
- P. Rigby and C. Bird, "Convergent Contemporary Software Peer Review Practices", ESEC/FSE 2013.
- D. L. Parnas, "On the Criteria To Be Used in Decomposing Systems into Modules", CACM 15(12), 1972.
- W. P. Stevens, G. J. Myers, L. L. Constantine, "Structured Design", IBM Systems Journal 13(2), 1974. R. C. Martin, single responsibility, *Principles of OOD*, 2002.
- T. J. McCabe, "A Complexity Measure", IEEE TSE SE-2(4), 1976.
- B. Meyer, "Applying Design by Contract", *IEEE Computer*, 1992.
- M. E. Fagan, "Design and Code Inspections to Reduce Errors in Program Development", IBM Systems Journal 15(3), 1976.
- W. Cunningham, technical debt, OOPSLA experience report, 1992.

Agent-era practice:

- Anthropic, "Best practices for Claude Code" — verification, deterministic vs non-deterministic instructions, and the warning that a reviewer asked to find problems always finds something. <https://code.claude.com/docs/en/best-practices>
- Anthropic, "Solving code review at Anthropic" — continuous review, finders plus a voting panel, `REVIEW.md`, risk tiers, approval per commit, revert rate as guardrail, 16% to 54% substantive comments, merged PRs doubling as the reverted share fell more than 40%. <https://claude.dev/blog/solving-code-review-at-anthropic/>
- Anthropic, "How the Claude Code team thinks about verification" — end-to-end, property and differential tests, ~90% of code written and reviewed by Claude, the rubric grader's 10-point lift.
- Anthropic, "Effective context engineering for AI agents" (2025) and "Building effective agents" (2024) — context, and the evaluator-optimizer pattern this harness implements.
- Claude Code docs: Code Review (Find, Verify, Rank, Post; Important, Nit, Pre-existing; never approves or blocks; does not build or run the code), Customize Code Review (cap nits, skip what CI enforces, skip generated paths), Review locally with /code-review (a fresh subagent that never saw the conversation), ultrareview.
- Claude Academy, *Claude Code 101: Code review* — the second reviewer from a clean context, and the three piles: fix now, ask why, leave it.
- Claude Code power user tips (Anthropic Help Center) — verification first, parallel sessions, plan mode.
- Google Cloud, *2025 State of AI-assisted Software Development* (DORA) — AI as amplifier, throughput up and instability up, 30% with little or no trust. <https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report>
- J. Becker et al., "Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity", METR, arXiv 2507.09089 — 19% slowdown against a forecast 24% speedup.
- GitClear, *AI Copilot Code Quality: 2025 Look Back* — 211M changed lines, cloned blocks up 8x, moved lines down to 9.5%.
- Uber, "uReview: Scalable, Trustworthy GenAI for Code Review at Uber" (2025) — multi-stage generate, grade, filter, dedupe; 75% usefulness; 65% addressed against 51% for human comments.
- Meta, "AI-Assisted Fixes to Code Review Comments at Scale", arXiv 2507.13499 — reviewer-facing patches slowed reviews 5%, author-facing did not; 19.7% actionable-to-applied.
- Google, "Resolving Code Review Comments with Machine Learning", ICSE-SEIP 2024 — 7.5% of reviewer comments resolved by an ML edit.
- GitHub Blog, "Agent pull requests are everywhere. Here's how to review them." (2026) — CI gaming, reuse blindness, hallucinated correctness.
- GitHub Docs, *Using custom instructions to unlock the power of Copilot code review* and *Responsible use of Copilot code review* — do not duplicate linters, high-confidence findings only, instruction files have a length ceiling, verify every comment.
- Augment Code, "We benchmarked 7 AI code review tools on real-world PRs" (2025); Signal65, *Evaluating AI Code Review Tools* (2026); Greptile, *AI Code Review Benchmarks* (2025) — precision and recall spreads, and the vendor conflict of interest.

Fifth round: three reviewers in parallel, spec + taste + docs (14/12/16 turn budgets, 51s/23s/29s, 11/4/10 tool uses). All three: changes needed. 12 must-fix closed, plus 14 minor. What they caught that one reviewer missed: A3's 'whatever its size' killed the single-file exemption (AGENTS.md:58, workflow.md:18) and its trigger list duplicated review.md step 1; F2 cited review.md step 3, which sets the budget; S3 and F2 both traced the same path and F2 ceded intent to S1, not S3; the AGENTS.md no-tool list sat in the approval bar and in T6/T7 at once; A5 and A7 asked for action after the report was filed; the approval bar's 'definitely improves code health' could not be checked; S2 counted nine qualities and said 'the other eight'; the F2-F4 ids skipped F1 with nothing explaining the hole, so the role is now F1-F3; 'mutant' and 'hourglass/ice-cream cone' were vocabulary a reader had to look up, now 'imagined edit' and 'a suite made mostly of end-to-end tests'.

Implementation notes from the docs review, to apply when the agent files are written:
- reviewing.md:23 says style findings are minor 'even when a project rule covers them', which A1 forbids. Amend the severity definition to exclude tool-enforced rules, or A1 becomes dead text.
- HARNESS.md has only Open, Settled and Not here; the sensitive-path list needs a new section. review.md step 1 is the alternative home, since reviewer membership already lives there.
- The five agent files are 21-27 lines. Shared rules (E1-E3, A1-A8, step 5) can only live in reviewing.md; the per-role rules land at 32 lines for taste, inside the 40-line cap, provided the new rule lines replace the old prose in each file instead of stacking on it.
- Already written, near-verbatim, in an existing file (this text must be replaced, not added next to it): S4 and S1 in spec-reviewer.md; S3 in spec-reviewer.md; T6 in taste-reviewer.md and AGENTS.md:322-328; T7 in taste-reviewer.md; V1 in testing.md:15-20; V3 in testing.md:9 and test-reviewer.md:15; F1 and F3 in final-reviewer.md:17-19; F2's class list in reviewing.md:26; A6 in reviewing.md:3; A2's cap in reviewing.md:10; A4's Checked field in reviewing.md:50; A7 in reviewing.md:52 and review.md:20; D1 in docs.md:44.

## Implementation, 2026-11-18

Kit first, then render. The kit at /home/thelong/rig owns .rig/playbooks/ and agents/; ~/.pi/agent renders them with rig/sync.sh, so every rule was written in the kit and 'sync.sh --check' now reports up to date. Three implementers ran in parallel on disjoint files (45s/73s/90s, 20/30/34 tool uses at a 40-turn budget).

Landed: reviewing.md 55 -> 87 lines (sections Entry conditions E1-E3, How every reviewer works A1-A8, Approve; the minor definition no longer contradicts A1; the label list accepts pre-existing; the entry preamble asks for the E id). review.md 40 -> 41 (step 1: the single-file exemption owes neither reviewer, and a change on a sensitive path takes final-reviewer plus the user's read; step 5: cross-model refutation when two reviewers disagree or a finding returns; step 6: each finding's outcome, fixed/waived/wrong). Five agent files carry their own ids and point at reviewing.md for the shared rules: spec 27 -> 29 (S1-S5), taste 24 -> 26 (T1-T8), test 25 -> 26 (V1-V6), docs 21 -> 27 (D1-D3), final 23 -> 23 (F1-F3). HARNESS.md gained the sensitive-path list.

Review, one integration pass: spec-reviewer changes needed (2 must-fix, 5 minor), taste-reviewer changes needed (1 must-fix, 6 minor), docs-reviewer changes needed (2 must-fix, 3 minor). Cost 51.9s/14 uses, 28.8s/8 uses, 49.4s/15 uses at 20-turn budgets.

Fixed after that pass: the three agent role-field lines now name the check id, as doc-1 section (5) requires; the sensitive-path list names its root per entry, because '.rig/playbooks/' exists only in the kit and 'rig/sync.sh' only in the install, so a single-root list silently missed half its paths; A4's pointer to a cross-model refutation in review.md step 5 resolved to nothing until step 5 gained the clause; T3 now quotes the shape; T5 routes dead code to F3 instead of S4; the duplicate approval-bar bullet on the formatter is gone; T7 no longer cites AGENTS.md rules that do not exist (ordering, naming, logging were never written there); the docs role field names what it breaks.

Correction checks, 8-turn budget: spec 40.1s/16 uses (changes needed, 2 items), taste 18.1s/14 uses (clean), docs 11.0s/7 uses (clean). Both spec items then fixed: docs role field, and T7's phantom AGENTS.md rules.

Rejected with reasons on the record: the taste reviewer's rewrite of 'Take a technical fact over an opinion' (longer, same meaning); collapsing the counted openers ('Eight rules hold for every reviewer', 'and nothing else does'), which close a set and are what stop a ninth rule being invented; A7's pointer sentence, which describes what the orchestrator does; the duplicated two-minute cap and read-only clauses, each in a section a reader may enter cold.

Evidence: tests/test_harness.sh 13 passed 0 failed; rig/tests/test_install.sh PASS; rig/sync.sh --check up to date; every role id appears once in its own file and nowhere else; no agent file over 29 lines against the 40-line cap.
<!-- SECTION:NOTES:END -->
