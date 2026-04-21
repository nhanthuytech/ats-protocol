# ATS Protocol Specification — V6

## Overview

The **Agentic Telemetry Standard (ATS)** is an open protocol that turns AI coding agents from stateless debuggers into knowledge-accumulating partners. It defines how agents interact with application telemetry through a persistent, version-controlled knowledge graph.

### Core Components

| Component | Purpose | Location |
|---|---|---|
| **Flow Graph** | DAG-based knowledge graph mapping business logic to code | `.ats/flow_graph.json` |
| **Runtime SDK** | `ATS.trace()` — near-zero-cost tracing embedded in source | Language-specific packages |
| **MCP Server** | 10 tools — `ats_init` is the V6 skill entry point | `packages/ats-mcp-server` |
| **Agent Hook** | Minimal 4-line rule: "call ats_init first" | `SKILL.md` / `CLAUDE.md` |

---

## Design Principles

1. **AI-first** — The protocol is designed for AI agents. Humans benefit indirectly through cleaner debugging, persistent context, and zero log pollution.

2. **Language-agnostic** — `flow_graph.json` is a universal schema. Any language can implement an SDK. A single MCP Server serves all of them.

3. **Zero production overhead** — When a flow is inactive, `trace()` calls are no-ops. In release builds, they short-circuit before any logic executes.

4. **Persistent knowledge** — The flow graph is committed to version control. Every debug session adds edges, sessions, and known issues. AI accumulates understanding over time — it never starts from scratch.

5. **IDE-agnostic** — No `launch.json`, `tasks.json`, or IDE-specific configuration. ATS works with any editor, any AI agent, any CI pipeline.

6. **MCP-as-Skill** — Protocol intelligence lives in the MCP Server (`ats_init`), not in text files. The agent hook is 4 lines. The tool delivers everything else on-demand, adaptively.

7. **Scale-ready (V6)** — `global_classes` eliminate duplication, `priority` controls noise, edge indexing provides O(1) lookups, and file caching prevents redundant I/O.

---

## V6 Architecture: 2-Layer AI System

```
Layer 1 — Agent Hook (4 lines in CLAUDE.md / SKILL.md)
  "If .ats exists, call ats_init before any task."
  Token cost: ~30 tokens/session

Layer 2 — Smart MCP Server (10 tools)
  ats_init  → returns protocol instructions + graph overview + next_action
  ats_*     → each returns data + next_action hint
  Token cost: ~400 tokens on first call, ~0 for subsequent tool calls
```

---

## Flow Graph Schema (V6)

The flow graph is a JSON file located at `.ats/flow_graph.json` (configurable via `ats.yaml`).

> **V5 → V6 migration:** No breaking changes. All new fields are optional. Existing graphs work unchanged.

### Top-Level Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `ats_version` | string | ✅ | Protocol version (semver, e.g. `"6.0.0"`) |
| `project` | string | ✅ | Project name |
| `updated_at` | string | ✅ | ISO 8601 timestamp of last modification |
| `global_classes` | object | — | **V6:** Shared classes auto-traced when ANY flow is active |
| `flows` | object | ✅ | Map of flow name → flow definition |
| `edges` | Edge[] | ✅ | Call relationships between methods across flows |

### `global_classes` (V6)

Classes that appear across many flows (e.g., `AuthService`, `AnalyticsService`, `DataService`). When declared here:
- They are traced whenever **any** flow is active.
- They do NOT need to be duplicated in each flow's `classes`.
- `muted` and `last_verified` work the same as in flow-level classes.

### Flow Definition

| Field | Type | Required | Description |
|---|---|---|---|
| `description` | string | ✅ | What this flow represents |
| `active` | boolean | ✅ | Whether trace logs are enabled |
| `priority` | string | — | **V6:** `"high"`, `"normal"` (default), or `"low"` |
| `classes` | object | ✅ | Map of class name → class definition |
| `depends_on` | string[] | — | Upstream flow dependencies |
| `parent` | string | — | Parent flow for sub-flow hierarchy |
| `tags` | string[] | — | Categorization labels |
| `known_issues` | string[] | — | AI-maintained list of known bugs |
| `sessions` | Session[] | — | Debug session history (max 5) |

### Class Definition

| Field | Type | Required | Description |
|---|---|---|---|
| `methods` | string[] | ✅ | List of instrumented method names |
| `muted` | string[] | — | Subset of methods to suppress from logging |
| `last_verified` | string | — | ISO date when methods were last confirmed in source |
| `needs_verify` | boolean | — | Flag for drift detection |

### Edge Definition

| Field | Type | Description |
|---|---|---|
| `from` | string | `Class.method` that initiates the call |
| `to` | string | `Class.method` that receives the call |
| `type` | string | Relationship type: `calls`, `delegates`, `emits`, or `navigates` |
| `trigger` | string | **V6:** What triggers this edge: `user_tap`, `user_input`, `api_response`, `bloc_event`, `lifecycle`, `timer`, `system` |
| `state_impact` | string | **V6:** Name of the state variable affected by this call |
| `condition` | string | Optional condition when this edge is taken |

### Naming Conventions

| Entity | Convention | Example |
|---|---|---|
| Flow names | `SCREAMING_SNAKE_CASE` + suffix | `PAYMENT_FLOW`, `APP_STARTUP_LIFECYCLE` |
| Flow suffix | `_FLOW`, `_LIFECYCLE`, `_WORKER` | See above |
| Class names | Exact source match | `PaymentService` |
| Method names | Exact source match | `processPayment` |

### Complete Example (V6)

```json
{
  "ats_version": "6.0.0",
  "project": "my_app",
  "updated_at": "2026-04-20T00:00:00Z",
  "global_classes": {
    "AuthService": {
      "methods": ["login", "logout", "refreshToken", "validateSession"],
      "last_verified": "2026-04-20"
    },
    "AnalyticsService": {
      "methods": ["trackEvent", "trackScreen"],
      "last_verified": "2026-04-20"
    }
  },
  "flows": {
    "CHECKOUT_FLOW": {
      "description": "Cart to payment completion",
      "active": false,
      "priority": "high",
      "depends_on": ["PAYMENT_FLOW"],
      "classes": {
        "CartService": {
          "methods": ["checkout", "applyVoucher"],
          "muted": ["applyVoucher"],
          "last_verified": "2026-04-20"
        },
        "CheckoutBloc": {
          "methods": ["onCheckoutStarted", "onPaymentConfirmed"],
          "last_verified": "2026-04-20"
        }
      },
      "known_issues": ["Voucher validation race condition on slow networks"],
      "sessions": [
        {
          "date": "2026-04-20",
          "action": "debug",
          "note": "Fixed race condition by debouncing voucher API calls",
          "resolved": true
        }
      ]
    },
    "PAYMENT_FLOW": {
      "description": "Payment processing and receipt generation",
      "active": false,
      "priority": "high",
      "classes": {
        "PaymentService": {
          "methods": ["processPayment", "refund"],
          "last_verified": "2026-04-20"
        }
      }
    }
  },
  "edges": [
    { "from": "CheckoutBloc.onCheckoutStarted", "to": "CartService.checkout", "type": "calls", "trigger": "user_tap" },
    { "from": "CartService.checkout", "to": "PaymentService.processPayment", "type": "calls", "state_impact": "paymentState" }
  ]
}
```

---

## Log Format (unchanged from V4)

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

**Key insight:** Sequence + Depth together allow AI to reconstruct the entire call chain without source-level tracing.

---

## Runtime SDK Contract

Any ATS SDK implementation **must** provide:

### `trace(className, methodName, {data})`

1. **Release mode check** — If running in release/production, return immediately. Zero overhead.
2. **Flow lookup** — O(1) lookup: does `Class.method` belong to an active flow?
3. **Mute check** — O(1) set check: is this method muted?
4. **Priority check (V6)** — If flow priority is below minimum threshold, skip.
5. **If active and not muted** — Print structured log line in V4 format.
6. **If inactive or muted** — No-op. Return immediately.

### `internalInit(methodMap, activeFlows, mutedMethods, flowPriorities)`

Accepts pre-compiled maps from generated code. Called once at app startup.
- `flowPriorities` (V6): Optional `Map<String, String>` of flow name → priority level.

### `setMinPriority(priority)` (V6)

Sets the minimum priority level for logging. Methods in flows below this priority will be silenced.

---

## CodeGen Architecture

ATS does not bundle JSON into the application binary. Instead:

1. MCP Server compiles `flow_graph.json` → `ats_generated.g.dart` (a `const Map` in native Dart) on every `ats_activate`/`ats_silence` call.
2. `AtsGenerated.init()` loads the map into memory at initialization.
3. `ATS.trace()` performs O(1) map lookup — if method not active → return immediately.
4. Hot Restart reloads the generated `.dart` file → log changes take effect instantly.

V6 codegen includes:
- `_kMethodMap` — method → flow mapping (includes global_classes)
- `_kMutedMethods` — set of muted methods
- `_kActiveFlows` — list of active flow names
- `_kFlowPriorities` — map of flow name → priority (V6)

---

## MCP Tools (10)

| Tool | What it does | Role |
|---|---|---|
| **`ats_init`** | Returns protocol instructions + graph overview + next_action | **Skill Entry Point** — call first |
| **`ats_context`** | Returns flow context — classes, methods, edges, sessions, global_classes | Returns `next_action` hint |
| **`ats_activate`** | Activates flow logging + auto-syncs generated code | Returns `next_action` hint |
| **`ats_silence`** | Deactivates flow logging + auto-syncs | Returns `next_action` hint |
| **`ats_validate`** | Detects cycles, stale methods, invalid edges, invalid muted/priority | — |
| **`ats_impact`** | Blast radius analysis: callers, callees, affected flows, risk level | — |
| **`ats_instrument`** | Adds `ATS.trace()` skeleton to every public method in a file | — |
| **`ats_analyze`** | Parses console/file logs → discovers call chains → auto-adds edges | Returns `next_action` hint |
| **`ats_mute`** | **V6:** Mute/unmute specific methods via MCP tool | Auto-syncs generated code |
| **`ats_rank`** | **V6:** PageRank importance, bottleneck detection, community analysis | Graph topology analysis |

---

## Agent Skill Contract

An ATS skill file must instruct the AI agent to:

1. **Call `ats_init`** at the start of every task (via MCP tool).
2. **Follow instructions** returned by `ats_init` exactly.
3. **Never use `print()`** or remove `ATS.trace()` calls.
4. **Never leave a flow active** after finishing.

The skill file itself should be **minimal** (~30 tokens). All protocol details are delivered by `ats_init`.

---

## Configuration (`ats.yaml`) (unchanged)

```yaml
ats-dir: .ats
output-dir: lib/generated/ats
output-ats-file: ats_generated.g.dart
```

---

## CLI Commands

| Command | Description |
|---|---|
| `ats dashboard [dir]` | Open web visualization |

> **Note:** CLI commands `init`, `sync`, `activate`, `silence`, `status`, `graph` were moved to MCP Server in V5. Use MCP tools instead.

---

## Versioning

- Protocol version follows **semver**.
- SDK versions are independent but declare which protocol version they support.
- The `ats_version` field in `flow_graph.json` indicates the protocol version.
- **V5 → V6 migration:** No breaking changes. Add `global_classes`, `priority`, `trigger`, `state_impact` as needed. Existing graphs work unchanged.
