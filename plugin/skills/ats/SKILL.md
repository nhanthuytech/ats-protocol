---
name: ats-protocol
description: Agentic Telemetry Standard — structured flow-based debugging for AI agents
activation:
  fileExists: .ats/flow_graph.json
---

# ATS Protocol

When this project has `.ats/flow_graph.json`:

1. **Call `ats_init` tool** at the start of every task — it returns all protocol rules and graph context
2. **Follow the instructions** returned by `ats_init` exactly
3. **Never use `print()`** or `debugPrint()` — use `ATS.trace()` only
4. **Never leave flows active** after debugging is complete — call `ats_silence`
5. **Add a session note** after every debug or refactor task
