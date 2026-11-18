---
description: Stage, validate and commit this host's agent-state changes locally (never pushes)
argument-hint: <commit message>
allowed-tools: Bash
---

```bash
python3 -I "${AGENT_STATE_DIR:-$HOME/agent-state}/tools/state.py" snapshot "$ARGUMENTS"
```

Before running, show `git -C "${AGENT_STATE_DIR:-$HOME/agent-state}" status --short` and `git diff --stat` so the user sees what is about to be recorded. The manager refuses host-only files and literal secrets; if it refuses, report its message and do not work around it with a hand `git add`. Nothing is pushed: that is `agent-state push`, a separate step.
