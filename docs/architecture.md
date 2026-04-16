# ATS Architecture & Internal Logic

> **How ATS works under the hood — from trace call to knowledge accumulation.**

This document explains the internal architecture and design decisions of ATS. Read this if you want to understand the system deeply, contribute to the codebase, or implement a new language SDK.

---

## Table of Contents

- [System Overview](#system-overview)
- [The Knowledge Graph](#the-knowledge-graph)
- [Runtime Flow: What Happens When trace() Is Called](#runtime-flow)
- [CodeGen Pipeline](#codegen-pipeline)
- [MCP Server Architecture](#mcp-server-architecture)
- [Graph Algorithms](#graph-algorithms)
- [Why These Design Decisions?](#design-decisions)

---

## System Overview

ATS has four layers, each with a specific responsibility:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AI Agent (Claude, Gemini, Cursor)            │
│                        Reads rules · calls tools · edits code       │
├──────────────────────────┬──────────────────────────────────────────┤
│  MCP Server (TypeScript) │  Language SDK (Dart, TS, Python...)     │
│  7 tools over JSON-RPC   │  trace() + CLI + codegen               │
│  Reads/writes graph      │  Reads generated maps at runtime       │
├──────────────────────────┴──────────────────────────────────────────┤
│                    flow_graph.json (V4)                             │
│                    DAG knowledge graph                              │
│                    flows · classes · methods · edges · sessions     │
└─────────────────────────────────────────────────────────────────────┘
```

**Data flow:**

1. **AI writes code** → adds `trace()` calls → maps classes to flows in JSON
2. **Developer runs app** → `trace()` outputs structured logs
3. **AI reads logs** → discovers edges → writes them back to JSON
4. **Next session** → AI reads JSON → already knows the codebase

The graph is the **single source of truth**. Everything flows through it.

---

## The Knowledge Graph

### Schema Structure

```
flow_graph.json
├── ats_version: "4.0.0"
├── project: "my_app"
├── updated_at: "2026-04-16T..."
├── flows
│   ├── CHECKOUT_FLOW
│   │   ├── description: "Cart to payment"
│   │   ├── active: false
│   │   ├── depends_on: ["PAYMENT_FLOW"]
│   │   ├── classes
│   │   │   ├── CartService
│   │   │   │   ├── methods: ["checkout", "applyVoucher"]
│   │   │   │   └── last_verified: "2026-04-16"
│   │   │   └── CheckoutBloc
│   │   │       └── methods: ["onCheckoutStarted"]
│   │   ├── known_issues: ["Race condition on slow networks"]
│   │   └── sessions: [{ date, action, note, resolved }]
│   └── PAYMENT_FLOW
│       └── ...
└── edges
    ├── { from: "CartService.checkout", to: "PaymentService.process", type: "calls" }
    └── { from: "CheckoutBloc.onCheckoutStarted", to: "CartService.checkout", type: "calls" }
```

### Why This Shape?

| Design choice | Reason |
|---|---|
| **Flows as top-level keys** | AI reads one flow at a time (~200 tokens) instead of the whole file |
| **Classes nested under flows** | One class can appear in multiple flows (shared services) |
| **Edges at root level** | Edges cross flow boundaries — they don't belong to any single flow |
| **Sessions array** | Append-only history. AI never loses context from previous debug sessions |
| **`depends_on`** | Enables topological sorting — AI gets upstream context automatically |
| **`last_verified`** | Drift detection — if a method was renamed, this date becomes stale |

### Edge Types

| Type | Meaning | Example |
|---|---|---|
| `calls` | Direct method invocation | `CartService.checkout → PaymentService.process` |
| `delegates` | Delegates work to another class | `Bloc → Repository` |
| `emits` | Emits an event consumed elsewhere | `PaymentBloc.emit(PaymentSuccess)` |
| `navigates` | Triggers UI navigation | `LoginBloc → DashboardScreen` |

---

## Runtime Flow

### What happens when `ATS.trace()` is called

```
ATS.trace('PaymentService', 'processPayment', data: order.toJson())
     │
     ▼
  ┌─ kReleaseMode? ──▶ YES → return (zero cost)
  │
  NO ▼
  ┌─ Lookup "PaymentService.processPayment" in _kMethodMap
  │   │
  │   ├─ NOT FOUND → return (O(1) miss, negligible cost)
  │   │
  │   └─ FOUND → returns ["PAYMENT_FLOW"]
  │         │
  │         ▼
  │      ┌─ Is "PAYMENT_FLOW" in _kActiveFlows?
  │      │   │
  │      │   ├─ NO → return (no-op)
  │      │   │
  │      │   └─ YES ▼
  │      │      Increment global sequence counter
  │      │      Compute depth from stack trace
  │      │      Print: [ATS][PAYMENT_FLOW][#007][d2] PaymentService.processPayment | {...}
  │      │      Write to .ats/logs/ (if file logging enabled)
```

### Performance Characteristics

| Scenario | Cost |
|---|---|
| Release build | **0** — returns before any logic |
| Method not in any flow | **O(1)** — single map lookup |
| Method in inactive flow | **O(1)** — map lookup + set check |
| Method in active flow | **O(1)** lookup + string formatting + print |

The entire trace path is **synchronous**. No futures, no streams, no allocations on the hot path (except the log string itself).

---

## CodeGen Pipeline

### Why codegen instead of runtime JSON parsing?

| Approach | Startup cost | Lookup cost | Hot Reload compatible? |
|---|---|---|---|
| Parse JSON at runtime | ~50ms (file I/O + decode) | O(1) | No — needs full restart |
| **Compile to const Map** | **0ms** (compiled into binary) | **O(1)** | **Yes — Hot Restart** |

### How it works

```
flow_graph.json ──(ats sync)──▶ ats_generated.g.dart ──(flutter run)──▶ runtime
```

The generated file is pure Dart with `const` values:

```dart
// AUTO-GENERATED BY ATS CLI — DO NOT EDIT
import 'package:ats_flutter/ats_flutter.dart';

const _kMethodMap = <String, List<String>>{
  'PaymentService.processPayment': ['PAYMENT_FLOW'],
  'PaymentService.refund': ['PAYMENT_FLOW'],
  'CartService.checkout': ['CHECKOUT_FLOW'],
  'CartService.applyVoucher': ['CHECKOUT_FLOW'],
};

const _kActiveFlows = <String>['CHECKOUT_FLOW'];

abstract class AtsGenerated {
  static void init() {
    ATS.internalInit(_kMethodMap, _kActiveFlows);
  }
}
```

**Key insight:** Because these are `const`, the Dart compiler bakes them into the binary at compile time. `init()` is just passing references — no copying, no parsing.

---

## MCP Server Architecture

### Protocol

The server speaks [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) over **stdio** (JSON-RPC). AI IDEs like Claude Code, Cursor, and VS Code + Continue connect to it automatically.

### Architecture

```
src/
├── index.ts                 # Server entry — registers 7 tools
├── core/
│   ├── flow-graph.ts        # FlowGraph class — reads/writes flow_graph.json
│   │                        # Provides: read(), write(), flows, projectRoot
│   └── dag.ts               # DAG class — 6 graph algorithms
│                            # Provides: topoSort, pageRank, centrality,
│                            #           shortestPath, communities, hasCycles
├── tools/
│   ├── context.ts           # Topo-sorted flow context delivery
│   ├── activate.ts          # Toggle active + exec "dart run ats_flutter sync"
│   ├── validate.ts          # Integrity: cycles, stale methods, invalid edges
│   ├── impact.ts            # BFS traversal for callers/callees from a method
│   ├── instrument.ts        # Regex AST parser for Dart/TS/Python
│   ├── analyze.ts           # Log parser: sequence+depth → edge discovery
│   ├── graph.ts             # Mermaid diagram generator (used by web)
│   └── rank.ts              # PageRank + centrality wrapper (used by web)
└── web/
    └── web-server.ts        # Express-like HTTP server + D3.js frontend
```

### Tool Design Principles

1. **Each tool does one thing and modifies the graph directly** — AI doesn't need a second call to apply results.
2. **`flow` is always required for `ats_instrument`** — AI always knows which flow it's working on. No guessing.
3. **`ats_analyze` auto-writes edges** — AI pastes logs once, tool handles the rest.
4. **Read tools (`context`, `impact`) never modify the graph** — safe to call anytime.

---

## Graph Algorithms

All algorithms live in `core/dag.ts` (265 LOC) and operate on a generic adjacency list built from `edges[]`.

### Kahn's Algorithm — Cycle Detection

Used by `ats_validate` to detect circular dependencies in `depends_on`:

```
A depends_on B, B depends_on C, C depends_on A → CYCLE DETECTED
```

Kahn's runs in O(V + E) and returns the cycle path if one exists.

### Topological Sort

Used by `ats_context` to deliver upstream dependencies in the correct order:

```
If CHECKOUT_FLOW depends_on PAYMENT_FLOW depends_on AUTH_FLOW:
AI receives: AUTH_FLOW → PAYMENT_FLOW → CHECKOUT_FLOW
```

This means AI understands the full context from root to target — without redundant calls.

### PageRank

Adapted from the original paper. Each method is a node, each edge is a link. Methods that many other methods call receive higher PageRank scores.

**Use case:** Web visualization sizes nodes by PageRank — the most "important" methods are visually larger.

### Betweenness Centrality

Measures how many shortest paths pass through a given node. High centrality = **bottleneck**. If this method breaks, many flows are affected.

**Use case:** Web visualization highlights bottleneck methods. Also used by `ats_impact` to calculate risk levels.

### Label Propagation (Community Detection)

Each node starts with its own label. Iteratively, each node adopts the most common label among its neighbors. Nodes that end up with the same label form a "community."

**Use case:** Suggests flow groupings when the graph is disorganized. "These 5 methods should probably be in the same flow."

### BFS Shortest Path

Standard breadth-first search from method A to method B, returning the path.

**Use case:** "What's the call chain from `LoginBloc.onLogin` to `DatabaseService.save`?"

---

## Design Decisions

### Why a single JSON file instead of a database?

- **Version controlled** — `git diff` shows exactly what changed. PRs can review graph changes.
- **No infrastructure** — No SQLite, no server, no setup. Works offline.
- **AI-readable** — AI can read JSON natively. No query language needed.
- **Merge-friendly** — JSON merge conflicts are straightforward to resolve.

At scale (>500 methods), the file gets large. Future solution: split by flow into separate files.

### Why compile-time codegen instead of runtime reflection?

- **Zero startup overhead** — `const` maps are free.
- **Tree-shakeable** — Dead code elimination works on `const` values.
- **No mirrors** — Dart's `dart:mirrors` is not available in Flutter.
- **Explicit** — The generated file is readable and debuggable.

### Why MCP instead of a custom protocol?

- **Standard** — MCP is backed by Anthropic and adopted by most AI IDEs.
- **Zero integration work** — Any MCP-compatible editor connects automatically.
- **Discoverable** — Tools are self-documenting with Zod schemas.
- **Bidirectional** — MCP supports notifications (future: live log streaming).

### Why TypeScript for the MCP Server?

- **Universal** — Works on any machine with Node.js (99% of developers).
- **MCP reference** — The official MCP SDK is TypeScript-first.
- **Language-agnostic** — The server only reads/writes JSON. It doesn't import any Dart/Python/Swift code.
- **Future distribution** — `npx ats-mcp-server` will work without cloning the repo.

---

## Related

- [Setup Guide](setup.md) — Installation walkthrough
- [Workflow Guide](flow.md) — Day-to-day usage
- [Protocol Spec](../spec/protocol.md) — Schema and contracts
- [New Language SDK Guide](sdk-guide.md) — How to implement ATS for a new language
