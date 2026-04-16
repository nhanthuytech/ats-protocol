# 🧠 ATS MCP Server

> **Universal AI agent toolkit for managing code knowledge graphs.**  
> Parse → Instrument → Debug → Analyze — with near-zero token overhead.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP_Protocol-1.12-green)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

---

## The Problem

Every time an AI agent debugs your code, it spends **3,000–5,000 tokens** just to understand project structure: reading JSON files, grepping the codebase, building a mental model. Next session? Starts from scratch.

**ATS MCP Server** collapses that to **50–200 tokens** with 7 specialized tools. AI calls a function → gets structured data → acts immediately.

```
❌ Without MCP:
   AI reads flow_graph.json        ~3,000 tokens
   AI edits JSON to toggle flow    ~1,500 tokens
   AI reads logs, finds patterns   ~2,000 tokens
   ─────────────────────────────
   Per debug session:              ~6,500 tokens

✅ With MCP:
   ats_context("PAYMENT_FLOW")        200 tokens
   ats_activate("PAYMENT_FLOW")        50 tokens
   ats_analyze(console_log)           100 tokens
   ─────────────────────────────
   Per debug session:                 350 tokens → ~95% savings
```

---

## Quick Start

### 1. Build

```bash
cd packages/ats-mcp-server
npm install
npx tsc
```

### 2. Connect to your AI IDE

<details>
<summary><b>Claude Code</b> — ~/.claude/mcp.json</summary>

```json
{
  "mcpServers": {
    "ats": {
      "command": "node",
      "args": ["/absolute/path/to/ats-mcp-server/dist/index.js", "/path/to/project"]
    }
  }
}
```
</details>

<details>
<summary><b>Cursor</b> — .cursor/mcp.json</summary>

```json
{
  "mcpServers": {
    "ats": {
      "command": "node",
      "args": ["/absolute/path/to/ats-mcp-server/dist/index.js", "."]
    }
  }
}
```
</details>

<details>
<summary><b>VS Code + Continue</b></summary>

```json
{
  "mcpServers": {
    "ats": {
      "command": "node",
      "args": ["/absolute/path/to/ats-mcp-server/dist/index.js", "."]
    }
  }
}
```
</details>

### 3. Use

AI agents automatically discover and call tools when needed. Or ask directly:

```
"Show context for PAYMENT_FLOW"       → AI calls ats_context
"Turn on checkout logging"            → AI calls ats_activate
"Instrument cart_service.dart"        → AI calls ats_instrument
```

---

## 7 Tools

### `ats_context` — Understand a flow in 200 tokens

AI receives **topologically-sorted** context instead of reading the entire JSON:

```
AI calls: ats_context({ flow: "CHECKOUT_FLOW", depth: 2 })

Returns:
{
  "target_flow": "CHECKOUT_FLOW",
  "context_flows": [
    {
      "name": "AUTH_FLOW",              ← upstream dependency
      "classes": { "AuthService": ["login", "refreshToken"] }
    },
    {
      "name": "CHECKOUT_FLOW",          ← target
      "classes": {
        "CartService": ["checkout", "applyVoucher"],
        "CheckoutBloc": ["onCheckoutStarted"]
      },
      "sessions": [
        { "date": "2026-04-15", "note": "Fixed race condition in voucher validation" }
      ]
    }
  ],
  "edges": [
    { "from": "CheckoutBloc.onCheckoutStarted", "to": "CartService.checkout", "type": "calls" }
  ]
}
```

---

### `ats_activate` / `ats_silence` — Toggle flow logging

```
ats_activate({ flow: "PAYMENT_FLOW" })
→ { "active": true, "sync_success": true, "message": "Flow activated. Hot Restart to see logs." }

ats_silence({ flow: "PAYMENT_FLOW" })
→ { "active": false, "message": "Flow silenced." }
```

One call replaces: read JSON → edit field → save → run sync → verify.

---

### `ats_validate` — Detect graph corruption

```
ats_validate()
→ {
    "valid": false,
    "issues": [
      { "type": "cycle", "message": "Circular dependency: A → B → C → A" },
      { "type": "missing_class", "flow": "PAYMENT_FLOW", "class": "OldService" },
      { "type": "stale_edge", "from": "Deleted.method" }
    ],
    "stats": { "total_flows": 8, "total_methods": 45, "total_edges": 12 }
  }
```

Runs Kahn's algorithm for cycle detection, cross-references methods against source code, and validates all edge endpoints.

---

### `ats_impact` — Blast radius before modifying code

```
ats_impact({ method: "PaymentService.processPayment" })
→ {
    "callers": [
      { "method": "CheckoutBloc.onPaymentConfirmed", "type": "calls" }
    ],
    "callees": [
      { "method": "StripeGateway.charge", "type": "calls" },
      { "method": "ReceiptService.generate", "type": "delegates" }
    ],
    "affected_flows": ["CHECKOUT_FLOW", "PAYMENT_FLOW", "RECEIPT_FLOW"],
    "risk": "high",
    "recommendation": "Critical junction. Test thoroughly before changing."
  }
```

AI checks this **before** modifying any method to understand downstream consequences.

---

### `ats_instrument` — Add trace to an entire file

Instead of AI editing methods one by one (~800 tokens/file), the tool parses the whole file and injects `ATS.trace()` skeletons:

```
ats_instrument({ file: "lib/services/payment_service.dart", flow: "PAYMENT_FLOW" })
→ {
    "instrumented": 5,
    "already_had": 2,
    "methods": [
      "PaymentService.processPayment",
      "PaymentService.refund",
      "PaymentService.validateCard",
      "PaymentService.createReceipt",
      "PaymentService.notifyWebhook"
    ],
    "flow": "PAYMENT_FLOW"
  }
```

**Multi-language support:**

| Language | Trace injected | Auto-skipped |
|---|---|---|
| Dart | `ATS.trace('Class', 'method');` | `build()`, `dispose()`, `initState()`, `_private()` |
| TypeScript | `console.log('[ATS][Class.method]');` | `constructor`, `_private()` |
| Python | `print(f"[ATS][Class.method]")` | `__init__()`, `_private()` |

`flow` is **required** — AI always knows which flow it's working on.

---

### `ats_analyze` — Parse logs, auto-discover call chains

AI pastes console output → tool detects call chains and **writes new edges to the graph automatically**:

```
ats_analyze({
  source: "console",
  text: `
    [ATS][CHECKOUT_FLOW][#001][d0] CartService.checkout | {"id": "123"}
    [ATS][CHECKOUT_FLOW][#002][d1] PaymentService.processPayment | {"amount": 99}
    [ATS][CHECKOUT_FLOW][#003][d2] StripeGateway.charge | {"status": "ok"}
    [ATS][CHECKOUT_FLOW][#004][d1] ReceiptService.generate | {"receipt": "R-456"}
  `
})
→ {
    "edges_added": 3,
    "discovered_edges": [
      { "from": "CartService.checkout", "to": "PaymentService.processPayment" },
      { "from": "PaymentService.processPayment", "to": "StripeGateway.charge" },
      { "from": "CartService.checkout", "to": "ReceiptService.generate" }
    ],
    "hotspots": [
      { "method": "CartService.checkout", "call_count": 1, "avg_depth": 0 }
    ],
    "anomalies": []
  }
```

Edges accumulate over debug sessions → next time AI reads the graph, call chains are **already known** without needing logs.

---

## Web Visualization

Interactive DAG browser — D3.js force-directed graph with dark theme:

```bash
npx tsx src/web/web-server.ts /path/to/your/project
# → http://localhost:4567
```

**Features:**
- 🔵 **Flow nodes** — sized by method count
- 🟢 **Active flows** — green highlight
- ⚪ **Method nodes** — sized by PageRank score
- 🔗 **Edges** — color-coded by type (calls, delegates, emits, navigates)
- 🔍 **Hover tooltips** — description, PageRank, centrality metrics
- 🖱️ **Drag + zoom** — explore the graph interactively

---

## Graph Algorithms

Six algorithms are integrated in `core/dag.ts` (265 LOC):

| Algorithm | Purpose | Used by |
|---|---|---|
| **Kahn's** | Cycle detection | `ats_validate` |
| **Topological Sort** | Dependency ordering | `ats_context` |
| **PageRank** | Method importance ranking | Web visualization |
| **Betweenness Centrality** | Bottleneck identification | Web visualization |
| **Label Propagation** | Community detection / flow grouping | Web visualization |
| **BFS Shortest Path** | Find call chain between any two methods | Web visualization |

---

## Architecture

```
src/
├── index.ts                 # MCP entry — JSON-RPC over stdio
├── core/
│   ├── flow-graph.ts        # Graph reader/writer + TypeScript interfaces
│   └── dag.ts               # 6 graph algorithms (265 LOC)
├── tools/
│   ├── context.ts           # Topo-sorted flow context
│   ├── activate.ts          # Toggle flow + auto sync
│   ├── validate.ts          # Integrity checks (cycles, stale refs)
│   ├── impact.ts            # Blast radius analysis
│   ├── instrument.ts        # Multi-language AST parser (Dart/TS/Python)
│   ├── analyze.ts           # Log parser + edge auto-discovery
│   ├── graph.ts             # Mermaid DAG export (internal)
│   └── rank.ts              # Graph analytics (internal)
└── web/
    └── web-server.ts        # D3.js interactive visualization server
```

**1,580 LOC TypeScript** — zero runtime dependencies beyond the MCP SDK.

---

## Why TypeScript?

The MCP Server is **language-agnostic** — it reads/writes `flow_graph.json`, which is a universal format. TypeScript was chosen because:

- **99% of developers** already have Node.js installed
- MCP standard uses TypeScript as its **reference implementation**
- **One command install**: `npm install`
- **Future distribution**: `npx ats-mcp-server`
- Works with **any language SDK** (Dart, Python, Swift, Go...)

---

## Related

- [ATS Protocol](../../README.md) — Protocol specification and monorepo
- [ATS Flutter SDK](../ats_flutter/README.md) — Dart/Flutter runtime with `ATS.trace()` API
- [Setup Guide](../../docs/setup.md) — Full setup instructions
- [Developer Workflow](../../docs/flow.md) — How AI agents use ATS

## License

MIT — See [LICENSE](../../LICENSE)
