---
description: Fast-forward this host's agent-state checkout and re-render ~/.claude from it
allowed-tools: Bash
---

Run the shared manager and report exactly what it printed:

```bash
python3 -I "${AGENT_STATE_DIR:-$HOME/agent-state}/tools/state.py" pull
```

Rules:

- Run the command, then report the output verbatim. Do not paraphrase it.
- If it exits non-zero, report the error and stop. Do not retry with `git pull` by hand; the refusal is the guard (a dirty tree, or history that is not a fast-forward).
- After a successful pull, tell the user when the re-rendered `CLAUDE.md`, `settings.json` or an agent file changed, because those take effect in a new session. Skills and commands are picked up live.
