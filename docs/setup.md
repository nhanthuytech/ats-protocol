# ATS Protocol — Setup Guide

This guide walks you through setting up ATS in your project, from zero to a fully connected AI-augmented debugging environment.

---

## Prerequisites

| Component | Requirement | Check |
|---|---|---|
| Flutter SDK | ≥ 3.29.0 | `flutter --version` |
| Node.js | ≥ 20 (only for MCP Server) | `node --version` |
| AI IDE | Claude Code, Cursor, VS Code + Continue, or any MCP-compatible editor | — |

---

## Step 1: Install the Flutter SDK

```bash
# Add ATS to your Flutter project
flutter pub add ats_flutter

# Initialize ATS — creates flow graph + generated code
dart run ats_flutter init
```

This creates:
```
your_project/
├── .ats/
│   └── flow_graph.json          # Knowledge graph (commit this to git)
├── lib/generated/ats/
│   └── ats_generated.g.dart     # Compiled lookup table (commit this too)
└── ats.yaml                     # Optional path configuration
```

---

## Step 2: Initialize in main.dart

```dart
import 'package:ats_flutter/ats_flutter.dart';
import 'generated/ats/ats_generated.g.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  AtsGenerated.init(); // O(1) — synchronous, no JSON parsing
  runApp(MyApp());
}
```

> **Why `AtsGenerated.init()`?** ATS compiles your flow graph into a native Dart `const Map` at build time. At runtime, it's just a map lookup — no file I/O, no parsing, no async. Changes take effect via Hot Restart.

---

## Step 3: Add traces to your code

Place `ATS.trace()` at the top of important methods:

```dart
class CartService {
  Future<void> checkout(Cart cart) async {
    ATS.trace('CartService', 'checkout', data: cart.toJson());
    final payment = await _paymentService.process(cart.total);
    // ...
  }

  Future<void> applyVoucher(String code) async {
    ATS.trace('CartService', 'applyVoucher', data: {'code': code});
    final voucher = await _voucherApi.validate(code);
    // ...
  }
}
```

Then map to a flow in `.ats/flow_graph.json`:

```json
{
  "flows": {
    "CHECKOUT_FLOW": {
      "description": "Cart to payment completion",
      "active": false,
      "classes": {
        "CartService": {
          "methods": ["checkout", "applyVoucher"],
          "last_verified": "2026-04-16"
        }
      }
    }
  }
}
```

Run sync to update generated code:
```bash
dart run ats_flutter sync
```

> **Tip:** Your AI agent handles all of this automatically when it has the ATS skill loaded. You rarely need to edit `flow_graph.json` by hand.

---

## Step 4: Set up MCP Server (Recommended)

The MCP Server gives AI agents 7 specialized tools, cutting token usage by ~95% compared to raw file reading.

### Build

```bash
cd packages/ats-mcp-server   # or wherever you cloned ats-protocol
npm install
npx tsc
```

### Connect to your IDE

<details>
<summary><b>Claude Code</b></summary>

Edit `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "ats": {
      "command": "node",
      "args": [
        "/absolute/path/to/ats-protocol/packages/ats-mcp-server/dist/index.js",
        "/absolute/path/to/your/flutter/project"
      ]
    }
  }
}
```

Restart Claude Code. You should see `ats` listed in available MCP tools.
</details>

<details>
<summary><b>Cursor</b></summary>

Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "ats": {
      "command": "node",
      "args": [
        "/absolute/path/to/ats-protocol/packages/ats-mcp-server/dist/index.js",
        "."
      ]
    }
  }
}
```

Restart Cursor. The tools appear automatically.
</details>

<details>
<summary><b>VS Code + Continue</b></summary>

Add to your Continue configuration:

```json
{
  "mcpServers": {
    "ats": {
      "command": "node",
      "args": [
        "/absolute/path/to/ats-protocol/packages/ats-mcp-server/dist/index.js",
        "."
      ]
    }
  }
}
```
</details>

### Verify it works

Ask your AI agent:
```
"What flows exist in this project?"
```

The agent should call `ats_context` and respond with your flow list — **not** read `flow_graph.json` directly.

### Available Tools

| Tool | What AI uses it for |
|---|---|
| `ats_context` | Understanding a flow — classes, methods, edges, history |
| `ats_activate` | Turning on logging for a flow |
| `ats_silence` | Turning off logging after debugging |
| `ats_validate` | Checking graph integrity — cycles, stale methods |
| `ats_impact` | Analyzing blast radius before modifying a method |
| `ats_instrument` | Auto-adding `ATS.trace()` to every method in a file |
| `ats_analyze` | Parsing console logs to discover call chains |

[Full tool documentation →](../packages/ats-mcp-server/README.md)

---

## Step 5: Install AI Agent Skills (Recommended)

Skills teach AI agents the ATS protocol automatically. Without them, you'd need to explain the workflow every session.

### For Gemini (Antigravity)

```bash
# In your Flutter project
mkdir -p .gemini/antigravity/skills/ats-flutter
cp /path/to/ats-protocol/skills/antigravity/SKILL.md \
   .gemini/antigravity/skills/ats-flutter/SKILL.md
```

### For Claude

```bash
cp /path/to/ats-protocol/skills/claude/CLAUDE.md .claude/CLAUDE.md
```

### What the skill teaches

1. Read `flow_graph.json` at the start of every task
2. Add `ATS.trace()` when writing or modifying classes
3. Map new classes to appropriate flows
4. Activate flows when debugging, silence when done
5. Record sessions, edges, and known issues

---

## Step 6: Web Visualization (Optional)

See your entire flow graph as an interactive DAG in the browser:

```bash
npx tsx /path/to/ats-protocol/packages/ats-mcp-server/src/web/web-server.ts \
    /path/to/your/flutter/project
# → http://localhost:4567
```

Features:
- **Force-directed graph** — Nodes sized by importance (PageRank)
- **Flow filtering** — Click a flow to isolate its methods
- **Edge coloring** — Different colors for `calls`, `delegates`, `emits`, `navigates`
- **Dark theme** — Easy on the eyes during late-night debugging
- **Drag + zoom** — Explore large graphs interactively

---

## Step 7: Add to .gitignore

ATS generates some files that should be committed, and some that shouldn't:

```gitignore
# Commit these:
# .ats/flow_graph.json          ← Knowledge graph
# lib/generated/ats/            ← Generated code

# Ignore these:
.ats/logs/                       # Runtime log files
```

---

## Workflow Summary

| You do | AI does |
|---|---|
| Write business logic | Adds `ATS.trace()` to methods, maps them to flows |
| Report a bug | Activates the flow, reads structured logs, fixes the bug |
| Hit F5 / restart | Logs appear in console with sequence + depth |
| Say "done" | Silences the flow, records session notes + discovered edges |
| `git commit` | Flow graph committed — next session starts with full context |

---

## Troubleshooting

### No logs appearing after activate

1. Make sure you **Hot Restarted** (not just Hot Reloaded) — `AtsGenerated.init()` uses `const` values that need a restart.
2. Verify the flow is active: `dart run ats_flutter status`
3. Check that your class/method names in `flow_graph.json` match the source code exactly.

### MCP tools not showing in IDE

1. Verify the MCP server built successfully: `cd packages/ats-mcp-server && npx tsc`
2. Check that `dist/index.js` exists
3. Use **absolute paths** in your MCP configuration
4. Restart your IDE after changing MCP config

### Generated file errors

```bash
dart run ats_flutter sync    # Regenerate from flow_graph.json
```

---

## Related Documentation

| Document | Description |
|---|---|
| [Developer + AI Workflow](flow.md) | Day-to-day workflow with detailed examples |
| [Protocol Specification](../spec/protocol.md) | Schema, contracts, log format |
| [MCP Server](../packages/ats-mcp-server/README.md) | 7 tools with full input/output examples |
| [Flutter SDK](../packages/ats_flutter/README.md) | Dart API reference + CLI commands |
| [Migration V3 → V4](migration_v3_to_v4.md) | Upgrade guide to DAG architecture |
| [Contributing](../CONTRIBUTING.md) | How to contribute |
