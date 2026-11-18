---
description: Show what changed in the tree, how far this host is from origin, and which host copy drifted
allowed-tools: Bash
---

Run the shared manager and report exactly what it printed:

```bash
python3 -I "${AGENT_STATE_DIR:-$HOME/agent-state}/tools/state.py" status
```

Rules:

- Report the output verbatim. `upstream: N behind, M ahead` and `drifted (<host>): <path>` lines are the actionable ones.
- Only this host's clone matters here: the other host catches up with its own pull.
