---
name: ats-flutter
description: ATS Protocol V6 — structured logging + AI flow management for Flutter. Activates when `.ats/flow_graph.json` exists.
---

# ATS Protocol V6 — Core Rules

This project uses ATS (Agentic Telemetry Standard) V6 for structured logging and AI-driven flow management.

## ALWAYS
1. Call `ats_init` via MCP before starting any task — it returns all protocol instructions.
2. Add `ATS.trace('ClassName', 'methodName', data: ...)` to EVERY method when you first touch a class. Verify existing traces match actual names — fix if wrong.
3. Update `flow_graph.json` after each task: add new methods, set `depends_on`, write session note (max 5 per flow).
4. Use V4+ class format: `"ClassName": { "methods": ["m1", "m2"], "last_verified": "YYYY-MM-DD" }`
5. Use `global_classes` for shared services (AuthService, AnalyticsService) — declare once, traced across all flows.

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

## V6 Features
- `global_classes` — shared services declared once at top-level
- `priority` — flow-level: `high`, `normal`, `low`
- `trigger` — edge-level: `user_tap`, `api_response`, `bloc_event`, etc.
- `state_impact` — edge-level: name of state variable affected
- `ats_mute` — mute/unmute methods via MCP tool
- `ats_rank` — PageRank, bottleneck detection, community analysis
