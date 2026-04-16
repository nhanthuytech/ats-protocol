# Contributing to ATS Protocol

Thanks for your interest in contributing to ATS!

## Project Structure

```
ats-protocol/
├── spec/                       # Protocol specification (language-agnostic)
│   ├── protocol.md             # Core protocol definition
│   └── flow_graph_schema.json  # JSON Schema for flow_graph.json
├── docs/                       # Guides and references
├── templates/                  # AI agent rule + workflow templates
│   ├── rules/                  # Per-agent rules (Claude, Gemini)
│   └── workflows/              # Step-by-step workflows (/ats-debug, etc.)
├── skills/                     # Full AI agent skill files
│   ├── antigravity/            # Gemini (Antigravity) skill
│   └── claude/                 # Claude skill
├── packages/
│   ├── ats_flutter/            # Dart/Flutter SDK + CLI
│   └── ats-mcp-server/        # TypeScript MCP Server (universal)
└── README.md
```

## Getting Started

### Flutter SDK

```bash
cd packages/ats_flutter
flutter pub get
flutter test
dart analyze
```

### MCP Server (TypeScript)

```bash
cd packages/ats-mcp-server
npm install
npx tsc
```

## What to Contribute

| Area | Description |
|---|---|
| **Bug fixes** | SDK or CLI bugs → open issue or PR |
| **New language SDKs** | Add `packages/ats_node`, `packages/ats_python`, etc. Follow `spec/protocol.md` |
| **MCP tools** | Add new tools to `packages/ats-mcp-server/src/tools/` |
| **AI agent skills** | Add support for new agents under `skills/` or `templates/` |
| **Documentation** | Improvements to docs, examples, or translations |

## Pull Request Guidelines

1. Keep PRs focused — one feature or fix per PR.
2. Run checks before submitting:
   - Flutter: `dart analyze && flutter test`
   - MCP Server: `npx tsc --noEmit`
3. Update docs if your change affects the public API, CLI, or MCP tools.
4. Follow existing code style in each package.

## Reporting Issues

Include:
- ATS version (`ats --version`)
- Flutter/Node.js version
- Steps to reproduce
- Expected vs actual behavior

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
