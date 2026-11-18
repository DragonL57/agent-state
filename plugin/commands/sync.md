---
description: Re-render ~/.claude and ~/.pi/agent from the agent-state checkout without touching git
allowed-tools: Bash
---

```bash
python3 -I "${AGENT_STATE_DIR:-$HOME/agent-state}/tools/state.py" sync
```

Use this after editing the checkout by hand. It writes the derived files only; it never commits or fetches. Report the printed count and the paths are already summarized by the manager.
