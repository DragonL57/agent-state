# Pi host facts

This host runs the pi harness. Everything in the contract applies as written.

- **Disabled built-in tools:** `edit`, `find`, `ls`, `grep` are turned off in
  `~/.pi/agent/settings.json` (`defaultTools`). Use bash commands or a Python
  script. `replace` (from pi-hashline-edit-pro) is the only edit tool.
- **The manager is the command.** `/agent-state pull|snapshot|push|sync` shells
  out to `{{AGENT_STATE}}/tools/state.py`; do not re-implement its git steps in
  the session.
