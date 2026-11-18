# Security

## Goals

agent-state reduces accidental publication of credentials and runtime data while making configuration commits reviewable.

The manager:

- stages the tracked tree only, so a host-only file has to be tracked to matter; it refuses any tracked host-only name at the root;
- scans every tracked JSON file for literal secrets and accepts only references (`$VAR`, `!command`) or known local placeholders;
- executes Git with argument arrays rather than shell-built commands;
- requires an explicit verb for every commit, pull, and push;
- never force-pushes, stashes, or auto-resolves conflicts.

## This repository is public

The owner chose a public repository. Read `shared/AGENTS.md` as published text: it describes operating rules and environment facts for a private setup. Nothing in the tree is a secret by the manager's definition, but the *content* is personal.

## Out of scope

This is not a general secret scanner. Secrets can still appear in an agent, playbook, prompt, skill, or commit message the JSON check does not read, and in Git history. Review `git diff --cached` before publishing.

A public repository is indexed and mirrored. Deleting a file later does not un-publish it; rotate anything that leaks.

## Host-local files

Never commit:

- `.env.keys` — dotenvx private keys
- `auth.json`, `trust.json`, `models-store.json` — OAuth and model caches
- `sessions/`, `projects/`, `history.jsonl` — transcripts
- `npm/`, `git/`, `bin/`, `plugins/`, caches — runtime state
