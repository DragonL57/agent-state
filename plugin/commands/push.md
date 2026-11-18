---
description: Upload existing agent-state commits (never creates one)
allowed-tools: Bash
---

```bash
python3 -I "${AGENT_STATE_DIR:-$HOME/agent-state}/tools/state.py" push
```

Show `git -C "${AGENT_STATE_DIR:-$HOME/agent-state}" log --oneline @{u}..HEAD` first, so the user sees which commits are being published. If there is nothing to push, say so and stop. This command never commits: a change that is not recorded yet is `agent-state snapshot`.
