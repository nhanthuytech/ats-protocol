# Changelog

All notable changes to `ats_flutter` will be documented in this file.

## [0.1.0] - 2026-04-15

### Added
- `ATS.init()` — initialize from `assets/ats/flow_graph.json`
- `ATS.trace(className, methodName, data)` — instrument a method (no-op when inactive)
- `ATS.activate(flowName)` / `ATS.silence(flowName)` — runtime flow control
- `ATS.isActive()`, `ATS.activeFlows`, `ATS.allFlows`, `ATS.summary`, `ATS.logsDirPath`
- `FlowRegistry` — loads and manages flow graph with multi-flow method mapping
- `LogWriter` — fire-and-forget JSONL log writer to app documents directory
- **CLI `ats`** — command-line tool:
  - `ats init` — set up ATS in a Flutter project
  - `ats skill install [--global]` — install Antigravity SKILL.md
  - `ats skill claude` — install CLAUDE.md for Claude Desktop / Claude Code
  - `ats status` — show all flows and active state
  - `ats flows` — list flows with classes and methods
  - `ats activate <FLOW>` / `ats silence <FLOW>` — toggle flow logging
- `spec/flow_graph_schema.json` — language-agnostic JSON Schema
- `skills/antigravity/SKILL.md` — Antigravity AI skill
- `skills/claude/CLAUDE.md` — Claude Desktop / Claude Code instructions
- Example Flutter app with multi-flow demo
- 14 unit tests (FlowEntry + FlowRegistry)
- Zero production overhead — all code paths guarded by `kReleaseMode`
