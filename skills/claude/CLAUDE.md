# ATS Protocol V5 — Claude Instructions

If `.ats/flow_graph.json` exists in this project:

1. **Call `ats_init` before starting any task.** Follow ALL instructions returned by the tool exactly.
2. **Never use `print()` or `debugPrint()`** — they are strictly forbidden.
3. **Never remove `ATS.trace()` calls** — they are permanent instrumentation.
4. **Never leave a flow `"active": true`** after finishing a debug session.
