---
id: TASK-6
title: >-
  Revise instruction-craft against the agents.md format and Anthropic's skill
  guide
status: To Do
assignee: []
created_date: '2026-11-20T07:04:00Z'
updated_date: '2026-11-20T07:23:00Z'
labels: []
dependencies: []
ordinal: 6000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The skill routes AGENTS.md and skill rules through the sources at the top: agents.md format, Anthropic skill best practices, Anthropic context engineering.
The body stays under 500 lines.
Every claim carries its source.
The citation list holds no claim the body does not use.

- [ ] #2 The skill routes AGENTS.md and skill rules through the open AGENTS.md format and the skill-authoring guide at platform.claude.com, with no source named in the files.
Section 1 is gone; its rules stand in section 2.
references/skills.md holds the skill-authoring rules that section 5 links to.
Section 6 carries the nearest-file rule.
The body stays under 500 lines.
No vendor, company, product, or model name appears in either file.

- [ ] #3 references/skills.md holds the skill-authoring rules that section 4 links to from "Writing the skill".
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Delete the evidence section and the source list. Move the skill rules into references/skills.md. Put the AGENTS.md format and the nearest-file rule in the placement section. Cut every vendor, model, author, arXiv id, and URL.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User rulings: no citations of any kind; the nearest-file rule goes in the trimming section; format shape only; no CLAUDE.md line; a reference file; TASK-6 owns the commit and the changelog. Reviews: spec-reviewer changes needed (3 must-fix, all fixed). taste-reviewer changes needed (1 must-fix, fixed; 5 minor fixed; 2 rejected).
<!-- SECTION:NOTES:END -->
