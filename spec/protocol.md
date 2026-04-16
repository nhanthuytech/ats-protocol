# ATS Protocol Specification

## Overview

The **Agentic Telemetry Standard (ATS)** is an open protocol that turns AI coding agents from stateless debuggers into knowledge-accumulating partners. It defines how agents interact with application telemetry through a persistent, version-controlled knowledge graph.

### Core Components

| Component | Purpose | Location |
|---|---|---|
| **Flow Graph** | DAG-based knowledge graph mapping business logic to code | `.ats/flow_graph.json` |
| **Runtime SDK** | `ATS.trace()` — near-zero-cost tracing embedded in source | Language-specific packages |
| **Agent Skill** | Instruction file teaching AI agents the protocol | `SKILL.md` / `CLAUDE.md` |
| **MCP Server** | 7 tools for zero-token graph management | `packages/ats-mcp-server` |

---

## Design Principles

1. **AI-first** — The protocol is designed for AI agents. Humans benefit indirectly through cleaner debugging, persistent context, and zero log pollution.

2. **Language-agnostic** — `flow_graph.json` is a universal schema. Any language can implement an SDK. A single MCP Server serves all of them.

3. **Zero production overhead** — When a flow is inactive, `trace()` calls are no-ops. In release builds, they short-circuit before any logic executes.

4. **Persistent knowledge** — The flow graph is committed to version control. Every debug session adds edges, sessions, and known issues. AI accumulates understanding over time — it never starts from scratch.

5. **IDE-agnostic** — No `launch.json`, `tasks.json`, or IDE-specific configuration. ATS works with any editor, any AI agent, any CI pipeline.

---

## Flow Graph Schema (V4)

The flow graph is a JSON file located at `.ats/flow_graph.json` (configurable via `ats.yaml`).

### Top-Level Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `ats_version` | string | ✅ | Protocol version (semver, e.g. `"4.0.0"`) |
| `project` | string | ✅ | Project name |
| `updated_at` | string | ✅ | ISO 8601 timestamp of last modification |
| `flows` | object | ✅ | Map of flow name → flow definition |
| `edges` | Edge[] | ✅ | Call relationships between methods across flows |

### Flow Definition

| Field | Type | Required | Description |
|---|---|---|---|
| `description` | string | ✅ | What this flow represents |
| `active` | boolean | ✅ | Whether trace logs are enabled |
| `classes` | object | ✅ | Map of class name → class definition |
| `depends_on` | string[] | — | Upstream flow dependencies |
| `tags` | string[] | — | Categorization labels |
| `known_issues` | string[] | — | AI-maintained list of known bugs |
| `sessions` | Session[] | — | Debug session history |

### Class Definition (V4)

| Field | Type | Required | Description |
|---|---|---|---|
| `methods` | string[] | ✅ | List of instrumented method names |
| `last_verified` | string | — | ISO date when methods were last confirmed in source |
| `needs_verify` | boolean | — | Flag for drift detection |

### Edge Definition

| Field | Type | Description |
|---|---|---|
| `from` | string | `Class.method` that initiates the call |
| `to` | string | `Class.method` that receives the call |
| `type` | string | Relationship type: `calls`, `delegates`, `emits`, or `navigates` |

### Session Definition

| Field | Type | Description |
|---|---|---|
| `date` | string | ISO 8601 date |
| `action` | string | `debug`, `refactor`, or `review` |
| `note` | string | What was done and what was found |
| `resolved` | boolean | Whether the issue was resolved |

### Naming Conventions

| Entity | Convention | Example |
|---|---|---|
| Flow names | `SCREAMING_SNAKE_CASE` | `PAYMENT_FLOW` |
| Class names | Exact source match | `PaymentService` |
| Method names | Exact source match | `processPayment` |

### Complete Example

```json
{
  "ats_version": "4.0.0",
  "project": "my_app",
  "updated_at": "2026-04-16T00:00:00Z",
  "flows": {
    "CHECKOUT_FLOW": {
      "description": "Cart to payment completion",
      "active": false,
      "depends_on": ["PAYMENT_FLOW"],
      "classes": {
        "CartService": {
          "methods": ["checkout", "applyVoucher"],
          "last_verified": "2026-04-16"
        },
        "CheckoutBloc": {
          "methods": ["onCheckoutStarted", "onPaymentConfirmed"],
          "last_verified": "2026-04-16"
        }
      },
      "known_issues": ["Voucher validation race condition on slow networks"],
      "sessions": [
        {
          "date": "2026-04-16",
          "action": "debug",
          "note": "Fixed race condition by debouncing voucher API calls",
          "resolved": true
        }
      ]
    },
    "PAYMENT_FLOW": {
      "description": "Payment processing and receipt generation",
      "active": false,
      "classes": {
        "PaymentService": {
          "methods": ["processPayment", "refund"],
          "last_verified": "2026-04-16"
        }
      }
    }
  },
  "edges": [
    { "from": "CheckoutBloc.onCheckoutStarted", "to": "CartService.checkout", "type": "calls" },
    { "from": "CartService.checkout", "to": "PaymentService.processPayment", "type": "calls" }
  ]
}
```

---

## V4 Log Format

```
[ATS][FLOW_NAME][#SEQ][dDEPTH] Class.method | {optional_data}
```

| Token | Purpose |
|---|---|
| `FLOW_NAME` | Which flow is being traced |
| `#SEQ` | Global sequence number — execution order |
| `dDEPTH` | Call stack depth — who called whom |
| `Class.method` | Source code location |
| `{data}` | Optional structured data (JSON) |

**Key insight:** Sequence + Depth together allow AI to reconstruct the entire call chain without source-level tracing:

```
[ATS][CHECKOUT_FLOW][#001][d0] CheckoutBloc.onCheckoutStarted
[ATS][CHECKOUT_FLOW][#002][d1] CartService.checkout         ← called by #001 (depth 0→1)
[ATS][CHECKOUT_FLOW][#003][d2] PaymentService.processPayment ← called by #002 (depth 1→2)
[ATS][CHECKOUT_FLOW][#004][d1] ReceiptService.generate       ← called by #001 (depth back to 1)
```

---

## Runtime SDK Contract

Any ATS SDK implementation **must** provide:

### `trace(className, methodName, {data})`

1. **Release mode check** — If running in release/production, return immediately. Zero overhead.
2. **Flow lookup** — O(1) lookup: does `Class.method` belong to an active flow?
3. **If active** — Print structured log line in V4 format.
4. **If inactive** — No-op. Return immediately.

### `internalInit(methodMap, activeFlows)`

Accepts a pre-compiled map of `"Class.method" → [flowNames]` and a set of active flow names. Called once at app startup from generated code.

---

## CodeGen Architecture (V3+)

ATS does not bundle JSON into the application binary. Instead:

1. `ats sync` compiles `flow_graph.json` → `ats_generated.g.dart` (a `const Map` in native Dart).
2. `AtsGenerated.init()` loads the map into memory at initialization.
3. `ATS.trace()` performs O(1) map lookup — if method not active → return immediately.
4. Hot Restart reloads the generated `.dart` file → log changes take effect instantly.

```dart
// AUTO-GENERATED BY ATS CLI — DO NOT EDIT
import 'package:ats_flutter/ats_flutter.dart';

const _kMethodMap = <String, List<String>>{
  'PaymentService.processPayment': ['PAYMENT_FLOW'],
  'PaymentService.refund': ['PAYMENT_FLOW'],
};

const _kActiveFlows = <String>['PAYMENT_FLOW'];

abstract class AtsGenerated {
  static void init() {
    ATS.internalInit(_kMethodMap, _kActiveFlows);
  }
}
```

---

## Agent Skill Contract

An ATS skill file (`SKILL.md` / `CLAUDE.md`) must instruct the AI agent to:

1. **Read** `flow_graph.json` at the start of every task (or call `ats_context`).
2. **Map** new classes to the appropriate flow when writing or modifying code.
3. **Activate** flows when debugging (via `ats activate <FLOW>` or `ats_activate` MCP tool).
4. **Silence** flows when done (via `ats silence <FLOW>` or `ats_silence` MCP tool).
5. **Instrument** classes with `ATS.trace()` on first encounter.
6. **Never remove** `ATS.trace()` calls — they are permanent instrumentation.
7. **Record** sessions, discovered edges, and known issues after each debug session.
8. **Update** the `updated_at` timestamp when modifying the graph.

---

## Configuration (`ats.yaml`)

Optional YAML file at project root controlling paths:

```yaml
ats-dir: .ats                           # Where flow_graph.json lives
output-dir: lib/generated/ats           # Where generated code is placed
output-ats-file: ats_generated.g.dart   # Generated file name
```

Defaults are used if absent.

---

## CLI Commands

| Command | Description |
|---|---|
| `ats init` | Initialize ATS in a project |
| `ats sync` | Compile `flow_graph.json` → generated code |
| `ats activate <FLOW>` | Set flow active + auto-sync |
| `ats silence <FLOW>` | Set flow inactive + auto-sync |
| `ats status` | Show all flows and their states |
| `ats graph` | Export DAG as Mermaid diagram |

---

## Versioning

- Protocol version follows **semver**.
- SDK versions are independent but declare which protocol version they support.
- The `ats_version` field in `flow_graph.json` indicates the protocol version.
- Migration guides: [V2→V3](../docs/migration_v2_to_v3.md)  |  [V3→V4](../docs/migration_v3_to_v4.md)
