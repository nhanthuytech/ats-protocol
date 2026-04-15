# ATS Protocol — Core Rules

This project uses ATS (Agentic Telemetry Standard) V4 for structured logging and AI-driven flow management.

## ALWAYS
1. Read `.ats/flow_graph.json` at task start (scan flow names + `depends_on` first, read details for relevant flows only).
2. Add `ATS.trace('ClassName', 'methodName', data: ...)` to EVERY method when you first touch a class. Verify existing traces match actual names — fix if wrong.
3. Update `flow_graph.json` after each task: add new methods, set `depends_on`, write session note (max 5 per flow).
4. Use V4 class format: `"ClassName": { "methods": ["m1", "m2"], "last_verified": "YYYY-MM-DD" }`

## NEVER
- Use `print()` or `debugPrint()` — use `ATS.trace()`.
- Remove existing `ATS.trace()` calls — they are permanent.
- Leave a flow `"active": true` after finishing.
- Update flows you haven't read source code for — set `"needs_verify": true` instead.

## Graph Safety
- **Rename > Delete**: method renamed → rename in graph, don't delete + re-add.
- **Verify before trust**: open source file, confirm methods match graph before editing.

## Log format
```
[ATS][FLOW_NAME][#SEQ][dDEPTH] Class.method | {data}
```
When `#005 d1` → `#006 d2`: method #005 called #006. Add discovered edges to `"edges"` array.

## Commands
- `ats activate FLOW` / `ats silence FLOW` — toggle logging
- `ats sync` — compile after manual JSON edits
- `ats graph` — export DAG as Mermaid

## Workflows
- Debugging a flow → follow `/ats-debug` workflow
- Instrument existing feature → follow `/ats-instrument` workflow
- Fix stale graph entries → follow `/ats-review` workflow
