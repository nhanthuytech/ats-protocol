# ATS Protocol — Universal AI-Agent Tracing & Smart Logging SDKs

> **Turn your AI coding agent from a stateless debugger into a knowledge-accumulating partner.**
> High-performance Smart Logging SDKs for **Flutter**, **Node.js**, **Python**, and **Swift**.

[![CI](https://github.com/nhanthuytech/ats-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/nhanthuytech/ats-protocol/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

*(💡 GitHub Topics to add to repo: `flutter-sdk`, `nodejs-logging`, `python-tracing`, `swift-sdk`, `smart-logging`, `ai-agent`, `mcp-server`)*

---

## The Problem

Every time an AI agent touches your codebase, it starts from zero. It reads dozens of files, scatters `print()` statements, burns through 30K+ tokens, and forgets everything by next session. Debug logs leak into production. Context vanishes overnight.

## The Solution

**ATS** provides a zero-cost, high-performance **Smart Logging SDK for Flutter** paired with a universal AI-Agent tracing protocol. 

It gives your AI agent a persistent, version-controlled **knowledge graph** that maps every business flow to the exact classes and methods that implement it. The agent reads 200 tokens instead of 3,000. It activates structured logging with one command. It records what it learned — edges, sessions, known issues — so it never starts from scratch again.

```text
❌ Without ATS                         ✅ With ATS
───────────────────────────────        ──────────────────────────────
AI grep(20 files) → 5,000 tokens      ats_context("FLOW") → 200 tokens
print() scattered everywhere           ATS.trace() → structured, switchable
Debug done → forgot to clean up        ats silence → code stays clean
Tomorrow → starts from scratch         Sessions + edges → instant recall
```

---

## Architecture

```text
┌────────────────────────────────────────────────────────────────┐
│  ATS Protocol  ·  spec/protocol.md  ·  flow_graph_schema.json │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────┐      ┌───────────────────────────┐  │
│  │  MCP Server (TS)     │      │  Flutter SDK (Dart)       │  │
│  │  10 tools for AI     │      │  ATS.trace() runtime      │  │
│  │  ats doctor / setup  │      │  pub.dev: ats_flutter      │  │
│  └──────────┬───────────┘      └─────────────┬─────────────┘  │
│             │                                │                │
│             └────────────┬───────────────────┘                │
│                          │                                    │
│              ┌───────────▼────────────┐                       │
│              │  flow_graph.json       │                       │
│              │  DAG knowledge graph   │                       │
│              │  global_classes ·      │                       │
│              │  flows · edges ·       │                       │
│              │  priority · triggers   │                       │
│              └────────────────────────┘                       │
└────────────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure

```text
ats-protocol/
├── spec/                          # Protocol specification
│   ├── protocol.md                # Core protocol — schema, contracts, log format
│   └── flow_graph_schema.json     # JSON Schema for validation
├── docs/
│   ├── architecture.md           # Internal architecture deep dive
│   ├── flow.md                    # Developer + AI workflow guide
│   └── setup.md                   # Step-by-step setup
├── templates/
│   └── rules/                     # Lightweight AI rules (~500 tokens)
├── skills/
│   ├── antigravity/SKILL.md       # Gemini agent skill
│   └── claude/CLAUDE.md           # Claude agent skill
├── packages/
│   ├── ats_flutter/               # Dart/Flutter Smart Logging SDK
│   └── ats-mcp-server/            # TypeScript MCP Server (10 tools & CLI)
├── .github/workflows/ci.yml       # CI: Flutter tests + TS build
├── CONTRIBUTING.md
├── LICENSE (MIT)
└── README.md
```

---

## Quick Start (One Command Setup)

ATS is designed for zero-friction adoption. With a single command, ATS detects your environment, configures your AI agent (Cursor, Windsurf, Claude, Codex), and links the Flutter Smart Logging SDK.

### 1. Setup Environment
```bash
npx -y ats-mcp-server@latest setup --project . --agent auto --runtime auto
```
*This command auto-installs `ats_flutter`, configures your IDE's MCP settings, and generates the necessary sync files.*

### 2. Verify Health
```bash
npx ats doctor
```
*Checks if the knowledge graph is valid, Flutter SDK is synced, and MCP tools are ready.*

### 3. Instrument your code
```dart
import 'package:ats_flutter/ats_flutter.dart';

class PaymentService {
  Future<void> processPayment(Order order) async {
    ATS.trace('PaymentService', 'processPayment', data: order.toJson());
    // business logic...
  }
}
```

*For manual setup instructions, see our [Setup Guide](docs/setup.md).*

---

## How It Works

### The Debug Cycle

```text
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

## MCP Tools (10)

| Tool | What it does | Tokens saved |
|---|---|---|
| **`ats_init`** | **Skill Entry Point** — protocol instructions + graph overview + next_action | ~1,200/session |
| **`ats_context`** | Returns flow context — classes, methods, edges, global_classes, sessions | ~2,800/call |
| **`ats_activate`** | Activates flow logging + auto-syncs generated code + next_action hint | ~1,450/call |
| **`ats_silence`** | Deactivates flow logging + auto-syncs + next_action hint | ~1,450/call |
| **`ats_validate`** | Detects cycles, stale methods, invalid edges, invalid muted/priority | — |
| **`ats_impact`** | Blast radius analysis: callers, callees, affected flows, risk level | — |
| **`ats_instrument`** | Adds `ATS.trace()` skeleton to every public method in a file (Dart/TS/Python) | ~1,600/file |
| **`ats_analyze`** | Parses console/file logs → discovers call chains → auto-adds edges | ~1,900/call |
| **`ats_mute`** | Mute/unmute specific methods without editing JSON | — |
| **`ats_rank`** | PageRank importance, bottleneck detection, community analysis, shortest path | — |

[Full tool documentation →](packages/ats-mcp-server/README.md)

---

## V4 Log Format

```text
[ATS][FLOW_NAME][#SEQ][dDEPTH] Class.method | {data}
```

| Token | Purpose |
|---|---|
| `#SEQ` | Global execution sequence — AI reads the flow order |
| `dDEPTH` | Call stack depth — AI infers who called whom |

These two fields together let AI reconstruct the full call chain from flat console output — no source-level tracing needed.

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

## Web Dashboard

Interactive flow control dashboard with D3.js graph visualization:

```bash
npx ats dashboard --project .
# → http://localhost:4567
```

**Features:**
- **Flow list** — Toggle flows on/off with iOS-style switches
- **Flow detail** — Class tree, method checkboxes, edge table, session timeline
- **Method muting** — Uncheck noisy methods (e.g. loop-heavy `addValue`) to suppress logs without removing traces
- **D3 graph** — Force-directed DAG with PageRank-sized nodes, click to navigate
- **Dark theme** — GitHub-style dark mode, Inter + JetBrains Mono typography

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
| [Protocol Specification](spec/protocol.md) | Schema, contracts, log format |
| [MCP Server](packages/ats-mcp-server/README.md) | 10 tools with full input/output examples |
| [Flutter SDK](packages/ats_flutter/README.md) | Dart API reference |
| [Contributing](CONTRIBUTING.md) | How to contribute code, docs, or new SDKs |

---

## License

MIT — See [LICENSE](LICENSE)
