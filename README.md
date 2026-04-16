# ATS Protocol — Agentic Telemetry Standard

> **Turn your AI coding agent from a stateless debugger into a knowledge-accumulating partner.**

[![CI](https://github.com/nhanthuytech/ats-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/nhanthuytech/ats-protocol/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## The Problem

Every time an AI agent touches your codebase, it starts from zero. It reads dozens of files, scatters `print()` statements, burns through 30K+ tokens, and forgets everything by next session. Debug logs leak into production. Context vanishes overnight.

## The Solution

**ATS** gives your AI agent a persistent, version-controlled **knowledge graph** that maps every business flow to the exact classes and methods that implement it. The agent reads 200 tokens instead of 3,000. It activates structured logging with one command. It records what it learned — edges, sessions, known issues — so it never starts from scratch again.

```
❌ Without ATS                         ✅ With ATS
───────────────────────────────        ──────────────────────────────
AI grep(20 files) → 5,000 tokens      ats_context("FLOW") → 200 tokens
print() scattered everywhere           ATS.trace() → structured, switchable
Debug done → forgot to clean up        ats silence → code stays clean
Tomorrow → starts from scratch         Sessions + edges → instant recall
```

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  ATS Protocol  ·  spec/protocol.md  ·  flow_graph_schema.json │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────┐      ┌───────────────────────────┐  │
│  │  MCP Server (TS)     │      │  Flutter SDK (Dart)       │  │
│  │  7 tools for AI      │      │  ATS.trace() + CLI        │  │
│  │  Universal — any lang│      │  pub.dev: ats_flutter      │  │
│  └──────────┬───────────┘      └─────────────┬─────────────┘  │
│             │                                │                │
│             └────────────┬───────────────────┘                │
│                          │                                    │
│              ┌───────────▼────────────┐                       │
│              │  flow_graph.json (V4)  │                       │
│              │  DAG knowledge graph   │                       │
│              │  flows · edges ·       │                       │
│              │  sessions · issues     │                       │
│              └────────────────────────┘                       │
└────────────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure

```
ats-protocol/
├── spec/                          # Protocol specification
│   ├── protocol.md                # Core protocol — schema, contracts, log format
│   └── flow_graph_schema.json     # JSON Schema for validation
├── docs/
│   ├── flow.md                    # Developer + AI workflow guide
│   ├── setup.md                   # Step-by-step setup
│   ├── migration_v2_to_v3.md      # V2 → V3
│   └── migration_v3_to_v4.md      # V3 → V4 (DAG architecture)
├── templates/
│   ├── rules/                     # Lightweight AI rules (~500 tokens)
│   └── workflows/                 # Step-by-step guides (/debug, /instrument, /review)
├── skills/
│   ├── antigravity/SKILL.md       # Gemini agent skill
│   └── claude/CLAUDE.md           # Claude agent skill
├── packages/
│   ├── ats_flutter/               # Dart/Flutter SDK + CLI
│   └── ats-mcp-server/            # TypeScript MCP Server (7 tools)
├── .github/workflows/ci.yml       # CI: Flutter tests + TS build
├── CONTRIBUTING.md
├── LICENSE (MIT)
└── README.md
```

---

## Quick Start

### 1. Install Flutter SDK

```bash
flutter pub add ats_flutter
dart run ats_flutter init     # Creates .ats/flow_graph.json + generated code
```

### 2. Initialize in your app

```dart
import 'package:ats_flutter/ats_flutter.dart';
import 'generated/ats/ats_generated.g.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  AtsGenerated.init(); // O(1) — no JSON parsing, no async
  runApp(MyApp());
}
```

### 3. Instrument your code

```dart
class PaymentService {
  Future<void> processPayment(Order order) async {
    ATS.trace('PaymentService', 'processPayment', data: order.toJson());
    // business logic...
  }
}
```

### 4. Set up MCP Server (recommended)

```bash
cd packages/ats-mcp-server
npm install && npx tsc
```

Connect to your IDE — [setup guide →](docs/setup.md)

---

## How It Works

### The Debug Cycle

```
 YOU: "Checkout is broken"
  │
  ▼
 AI: ats_context("CHECKOUT_FLOW")     ← 200 tokens. Knows classes, edges, history.
  │
  ▼
 AI: ats_activate("CHECKOUT_FLOW")    ← Logging on. One command.
  │
  ▼
 YOU: Hot Restart → reproduce bug
  │
  ▼
 Console:
   [ATS][CHECKOUT_FLOW][#001][d0] CartService.checkout | {"cart_id": "123"}
   [ATS][CHECKOUT_FLOW][#002][d1] PaymentService.process | {"status": "declined"}
   [ATS][CHECKOUT_FLOW][#003][d1] VoucherService.validate | {"valid": false}
  │
  ▼
 AI: Reads sequence + depth → knows exact call chain
     #001 d0 → #002 d1: CartService called PaymentService
     #001 d0 → #003 d1: CartService also called VoucherService
     Root cause: Payment declined before voucher validation
  │
  ▼
 AI: Fixes bug → ats_silence("CHECKOUT_FLOW") → records session + edges
  │
  ▼
 NEXT TIME: AI reads graph → already knows the call chain. No logging needed.
```

---

## MCP Tools (7)

| Tool | What it does | Tokens saved |
|---|---|---|
| **`ats_context`** | Returns flow context — classes, methods, edges, sessions — topologically sorted | ~2,800/call |
| **`ats_activate`** | Activates flow logging + auto-syncs generated code | ~1,450/call |
| **`ats_silence`** | Deactivates flow logging + auto-syncs | ~1,450/call |
| **`ats_validate`** | Detects cycles, stale methods, invalid edges, orphan classes | — |
| **`ats_impact`** | Blast radius analysis: callers, callees, affected flows, risk level | — |
| **`ats_instrument`** | Adds `ATS.trace()` skeleton to every public method in a file (Dart/TS/Python) | ~1,600/file |
| **`ats_analyze`** | Parses console logs → discovers call chains → auto-adds edges to graph | ~1,900/call |

[Full tool documentation →](packages/ats-mcp-server/README.md)

---

## V4 Log Format

```
[ATS][FLOW_NAME][#SEQ][dDEPTH] Class.method | {data}
```

| Token | Purpose |
|---|---|
| `#SEQ` | Global execution sequence — AI reads the flow order |
| `dDEPTH` | Call stack depth — AI infers who called whom |

These two fields together let AI reconstruct the full call chain from flat console output — no source-level tracing needed.

---

## 3-Layer AI System

| Layer | When loaded | Token cost | Contains |
|---|---|---|---|
| **Rules** | Every session (automatic) | ~500 | 5 core principles — trace, read graph, activate, silence, record |
| **Workflows** | On demand (`/ats-debug`, `/ats-instrument`, `/ats-review`) | ~800 | Step-by-step guides for specific tasks |
| **MCP Server** | When called | ~0 | 7 automated tools — zero token overhead |

Rules ensure AI always follows the protocol. Workflows provide detailed guides when needed. MCP tools eliminate manual JSON editing entirely.

---

## Graph Algorithms

Six algorithms integrated in `core/dag.ts` for deep analysis:

| Algorithm | Purpose |
|---|---|
| **Kahn's Algorithm** | Cycle detection in flow dependencies |
| **Topological Sort** | Dependency ordering for context delivery |
| **PageRank** | Identify the most important methods in the codebase |
| **Betweenness Centrality** | Find bottleneck methods that many paths traverse |
| **Label Propagation** | Auto-suggest flow groupings from edge patterns |
| **BFS Shortest Path** | Find the call chain between any two methods |

---

## Web Visualization

Interactive DAG browser with D3.js force-directed graph:

```bash
npx tsx packages/ats-mcp-server/src/web/web-server.ts .
# → http://localhost:4567
```

Dark theme · Click-to-filter · PageRank-sized nodes · Edge coloring · Draggable + zoomable

---

## Language Support

| Language | SDK Package | Status |
|---|---|---|
| Dart / Flutter | [`ats_flutter`](packages/ats_flutter/) | ✅ Released |
| TypeScript / Node.js | `ats-node` | 🔜 Planned |
| Python | `ats-python` | 🔜 Planned |
| Swift | `ats-swift` | 🔜 Planned |

The MCP Server already supports instrumenting Dart, TypeScript, and Python source files.

---

## Documentation

| Document | Description |
|---|---|
| [Setup Guide](docs/setup.md) | Install SDK, configure MCP, connect IDE |
| [Developer + AI Workflow](docs/flow.md) | Day-to-day workflow with examples |
| [Architecture & Internal Logic](docs/architecture.md) | How ATS works under the hood |
| [New Language SDK Guide](docs/sdk-guide.md) | Build ATS for Node.js, Python, Swift, Go... |
| [Protocol Specification](spec/protocol.md) | Schema, contracts, log format |
| [MCP Server](packages/ats-mcp-server/README.md) | 7 tools with full input/output examples |
| [Flutter SDK](packages/ats_flutter/README.md) | Dart API reference + CLI commands |
| [Contributing](CONTRIBUTING.md) | How to contribute code, docs, or new SDKs |

---

## License

MIT — See [LICENSE](LICENSE)
