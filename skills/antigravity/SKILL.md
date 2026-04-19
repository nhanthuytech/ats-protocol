---
name: ats-flutter
description: ATS Protocol V5 workflow for Flutter projects. Activates when working in a Flutter project that has `.ats/flow_graph.json`. Calls ats_init via MCP to get full protocol instructions — no manual workflow needed.
---

# ATS Protocol V5 — Flutter Skill

If `.ats/flow_graph.json` exists in this project:

1. **Call `ats_init` via MCP before starting any task.** The tool returns all protocol instructions and graph context. Follow them exactly.
2. **Never use `print()` or `debugPrint()`** — they are strictly forbidden.
3. **Never remove `ATS.trace()` calls** — they are permanent instrumentation.
4. **Never leave a flow `"active": true`** after finishing a debug session.
