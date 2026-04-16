# Contributing to ATS Protocol

Thanks for your interest in contributing to ATS! This guide will help you get started.

---

## Project Structure

```
ats-protocol/
├── spec/                          # Protocol specification (language-agnostic)
│   ├── protocol.md                # Core protocol definition — schema, contracts, formats
│   └── flow_graph_schema.json     # JSON Schema for flow_graph.json validation
├── docs/                          # Guides and references
│   ├── flow.md                    # Developer + AI agent workflow
│   ├── setup.md                   # Step-by-step setup guide
│   ├── migration_v2_to_v3.md      # V2 → V3 migration
│   └── migration_v3_to_v4.md      # V3 → V4 migration (DAG)
├── templates/                     # AI agent template files
│   ├── rules/                     # Lightweight rules (~500 tokens per session)
│   └── workflows/                 # Step-by-step guides (/ats-debug, etc.)
├── skills/                        # Full AI agent skill files
│   ├── antigravity/SKILL.md       # Gemini (Antigravity) agent
│   └── claude/CLAUDE.md           # Claude agent
├── packages/
│   ├── ats_flutter/               # Dart/Flutter SDK + CLI
│   └── ats-mcp-server/            # TypeScript MCP Server (universal)
├── .github/workflows/ci.yml       # CI: Flutter tests + TypeScript build
├── CONTRIBUTING.md                # ← You are here
├── LICENSE                        # MIT
└── README.md                      # Project overview
```

---

## Getting Started

### Prerequisites

| Package | Requirement |
|---|---|
| **ats_flutter** | Flutter SDK ≥ 3.29.0 |
| **ats-mcp-server** | Node.js ≥ 20 |

### Flutter SDK

```bash
cd packages/ats_flutter
flutter pub get
dart analyze --fatal-infos
dart format --set-exit-if-changed lib test
flutter test
```

### MCP Server (TypeScript)

```bash
cd packages/ats-mcp-server
npm install
npx tsc --noEmit   # Type check
npx tsc            # Build
```

---

## What to Contribute

| Area | Description | Difficulty |
|---|---|---|
| 🐛 **Bug fixes** | SDK, CLI, or MCP Server bugs | Easy |
| 📝 **Documentation** | Improve guides, examples, or translations | Easy |
| 🤖 **AI agent skills** | Add support for new agents (Copilot, Windsurf, etc.) | Medium |
| 🔧 **MCP tools** | Add new analysis tools in `packages/ats-mcp-server/src/tools/` | Medium |
| 🌐 **New language SDKs** | Add `packages/ats_node`, `packages/ats_python`, etc. | Hard |
| 📊 **Graph algorithms** | Add new algorithms to `core/dag.ts` | Hard |

### Adding a New Language SDK

1. Create `packages/ats_<language>/`
2. Implement the runtime contract from `spec/protocol.md`:
   - `trace(className, methodName, {data})` — O(1) lookup, no-op when inactive
   - `internalInit(methodMap, activeFlows)` — Accept pre-compiled mappings
3. Zero overhead in production builds
4. Add CI job in `.github/workflows/ci.yml`
5. Update the root `README.md` language support table

### Adding a New MCP Tool

1. Create `packages/ats-mcp-server/src/tools/<tool_name>.ts`
2. Export a function: `toolNameTool(graph: FlowGraph, args: Record<string, unknown>)`
3. Register in `src/index.ts` with `server.tool()`
4. Add Zod schema for input validation
5. Update `packages/ats-mcp-server/README.md` tools table

---

## Pull Request Guidelines

1. **Keep PRs focused** — One feature or fix per PR.
2. **Run checks before submitting:**
   ```bash
   # Flutter SDK
   cd packages/ats_flutter && dart analyze && flutter test

   # MCP Server
   cd packages/ats-mcp-server && npx tsc --noEmit
   ```
3. **Update documentation** if your change affects the public API, CLI, or MCP tools.
4. **Follow existing code style** — Dart formatting enforced by `dart format`, TypeScript by `tsc --strict`.
5. **Write descriptive commit messages** — e.g. `feat(mcp): add ats_instrument tool` or `fix(flutter): handle empty flow graph`.

---

## Reporting Issues

When filing an issue, please include:

- **ATS version** (`ats --version` or check `ats_version` in `flow_graph.json`)
- **Runtime version** (`flutter --version` / `node --version`)
- **Steps to reproduce** the issue
- **Expected vs actual behavior**
- **Console output** including any `[ATS]` log lines

---

## Development Tips

- **Test MCP tools locally**: `echo '{"method":"ats_context","params":{"flow":"TEST"}}' | node dist/index.js .`
- **View web visualization**: `npx tsx src/web/web-server.ts .` → `http://localhost:4567`
- **Validate flow_graph.json**: Use `spec/flow_graph_schema.json` with any JSON Schema validator

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
