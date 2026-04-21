# ATS Protocol — Setup Guide (V6)

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
```

Then create the ATS directory structure manually or let AI do it via `ats_init`:

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
  "ats_version": "6.0.0",
  "project": "my_app",
  "global_classes": {},
  "flows": {
    "CHECKOUT_FLOW": {
      "description": "Cart to payment completion",
      "active": false,
      "priority": "high",
      "classes": {
        "CartService": {
          "methods": ["checkout", "applyVoucher"],
          "last_verified": "2026-04-20"
        }
      }
    }
  },
  "edges": []
}
```

> **Tip:** Your AI agent handles all of this automatically when it has the ATS skill loaded. You rarely need to edit `flow_graph.json` by hand.

---

## Step 4: Set up MCP Server (Recommended)

The MCP Server gives AI agents 10 specialized tools. `ats_init` delivers full protocol instructions on-demand — no heavy config files needed.

### Build

```bash
cd packages/ats-mcp-server   # or wherever you cloned ats-protocol
npm install
npx tsc
```

### Connect to your IDE

<details>
<summary><b>Claude Code</b></summary>

Use the Claude Code CLI to add the server:

```bash
# Run from your Flutter project root
claude mcp add ats -- node /absolute/path/to/ats-protocol/packages/ats-mcp-server/dist/index.js
```

This auto-writes the config for the current project. Restart Claude Code — you should see `ats` listed in available MCP tools.
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
"Call ats_init and tell me what flows exist in this project."
```

The agent should call `ats_init` and receive full protocol instructions + graph overview in one call.

### Available Tools (10)

| Tool | What AI uses it for |
|---|---|
| `ats_init` | **Call first** — gets protocol instructions + graph overview |
| `ats_context` | Understanding a flow — classes, methods, edges, global_classes, history |
| `ats_activate` | Turning on logging for a flow |
| `ats_silence` | Turning off logging after debugging |
| `ats_validate` | Checking graph integrity — cycles, stale methods, invalid muted/priority |
| `ats_impact` | Analyzing blast radius before modifying a method |
| `ats_instrument` | Auto-adding `ATS.trace()` to every method in a file |
| `ats_analyze` | Parsing console/file logs to discover call chains |
| `ats_mute` | **V6:** Muting/unmuting specific methods without editing JSON |
| `ats_rank` | **V6:** PageRank importance, bottleneck detection, community analysis |

[Full tool documentation →](../packages/ats-mcp-server/README.md)

---

## Step 5: Install AI Agent Hook (Recommended)

Add a minimal 4-line hook so AI agents automatically know to call `ats_init` at task start.

### For Claude Code

```bash
# In your Flutter project root
mkdir -p .claude
cat > .claude/CLAUDE.md << 'EOF'
# ATS Protocol V6
If `.ats/flow_graph.json` exists in this project:
1. Call `ats_init` before starting any task.
2. Follow all instructions returned by the tool exactly.
3. Never use print() or debugPrint() — they are forbidden.
4. Never remove ATS.trace() calls from code.
EOF
```

### For Gemini (Antigravity)

```bash
mkdir -p .gemini/antigravity/skills/ats-flutter
cp /path/to/ats-protocol/skills/antigravity/SKILL.md \
   .gemini/antigravity/skills/ats-flutter/SKILL.md
```

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
2. Check that your class/method names in `flow_graph.json` match the source code exactly.
3. Run `ats_validate` to check for graph inconsistencies.

### MCP tools not showing in IDE

1. Verify the MCP server built successfully: `cd packages/ats-mcp-server && npx tsc`
2. Check that `dist/index.js` exists
3. Use **absolute paths** in your MCP configuration
4. Restart your IDE after changing MCP config

### Too much noise in logs

1. Use `ats_mute` to silence noisy methods: `ats_mute({ className: "Logger", methodName: "verbose" })`
2. Set flow `"priority": "low"` for non-critical flows
3. Use `ATS.setMinPriority('high')` at runtime to only show high-priority flows

---

## Related Documentation

| Document | Description |
|---|---|
| [Developer + AI Workflow](flow.md) | Day-to-day workflow with detailed examples |
| [Protocol Specification](../spec/protocol.md) | V6 Schema, contracts, log format |
| [MCP Server](../packages/ats-mcp-server/README.md) | 10 tools with full input/output examples |
| [Flutter SDK](../packages/ats_flutter/README.md) | Dart API reference |
| [Contributing](../CONTRIBUTING.md) | How to contribute |
