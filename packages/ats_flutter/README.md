# ATS Flutter — Runtime SDK

> **Structured, switchable telemetry for Flutter apps — designed for AI agents.**

[![CI](https://github.com/nhanthuytech/ats-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/nhanthuytech/ats-protocol/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

---

## What It Does

`ats_flutter` is the **Runtime SDK** — it provides `ATS.trace()` which runs **inside your Flutter app** on the user's device. Unlike `print()` or `debugPrint()`, ATS traces are:

- **Switchable** — Turn flows on/off without touching code. No more commenting out logs.
- **Structured** — Sequence numbers + call depth let AI reconstruct exact call chains.
- **Persistent** — Knowledge accumulates in `flow_graph.json`, committed to git. AI never starts from scratch.
- **Zero-cost** — In release builds, `ATS.trace()` short-circuits before any logic. Zero overhead.
- **Mutable** — Individual methods can be muted to suppress noisy logs without removing them from the graph.

---

## V5 Architecture — Where This Package Fits

```
┌──────────────────────────────────────────────────────────────────┐
│  MCP Server (TypeScript)        ← Universal, all languages      │
│  • AI tools (init, activate, silence, instrument, ...)          │
│  • CLI (init, sync, activate)                                   │
│  • CodeGen (auto-generates ats_generated.g.dart)                │
│  • Web Dashboard (D3.js visualization at localhost:4567)        │
├──────────────────────────────────────────────────────────────────┤
│  ats_flutter (Dart)             ← THIS PACKAGE                  │
│  • ATS.trace()                  — runs inside your Flutter app  │
│  • FlowRegistry                 — O(1) method→flow lookup       │
│  • LogWriter                    — file-based log persistence    │
└──────────────────────────────────────────────────────────────────┘
```

> **Note:** CLI commands (`init`, `sync`, `activate`, `silence`) are handled by the MCP Server. This package is runtime-only.

---

## Installation

```yaml
# pubspec.yaml
dependencies:
  ats_flutter: ^0.2.0
```

```bash
flutter pub get
```

---

## Usage

### 1. Initialize at startup

```dart
import 'package:ats_flutter/ats_flutter.dart';
import 'generated/ats/ats_generated.g.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  AtsGenerated.init(); // O(1) — no JSON parsing, no async, no await
  runApp(MyApp());
}
```

### 2. Add traces to your methods

```dart
class PaymentService {
  Future<void> processPayment(Order order) async {
    ATS.trace('PaymentService', 'processPayment', data: order.toJson());
    // Your business logic stays exactly the same.
    final result = await _gateway.charge(order.total);
    // ...
  }

  Future<void> refund(String transactionId) async {
    ATS.trace('PaymentService', 'refund', data: {'id': transactionId});
    await _gateway.refund(transactionId);
  }
}
```

### 3. Control flows via AI or Dashboard

AI agents use MCP tools to toggle flows:
```
ats_activate({ flow: "PAYMENT_FLOW" })   → enables logging + auto-syncs .g.dart
ats_silence({ flow: "PAYMENT_FLOW" })    → disables logging + auto-syncs .g.dart
```

Or toggle via the Web Dashboard at `http://localhost:4567`.

### 4. Read structured logs

```
[ATS][PAYMENT_FLOW][#001][d0] CheckoutBloc.onCheckout | {"cart_id": "abc"}
[ATS][PAYMENT_FLOW][#002][d1] PaymentService.processPayment | {"amount": 99}
[ATS][PAYMENT_FLOW][#003][d2] StripeGateway.charge | {"status": "ok"}
```

| Token | Purpose | Example |
|---|---|---|
| `FLOW_NAME` | Which business flow | `PAYMENT_FLOW` |
| `#SEQ` | Execution order | `#003` |
| `dDEPTH` | Call stack depth | `d2` |
| `Class.method` | Source location | `StripeGateway.charge` |
| `{data}` | Optional JSON payload | `{"status": "ok"}` |

---

## API Reference

### `ATS.trace(className, methodName, {data})`

The core tracing function. AI agents add this to every method once — it is **permanent** and **never removed**.

```dart
ATS.trace('PaymentService', 'processPayment', data: {'amount': 99});
```

**Behavior:**
- Release mode → returns immediately (zero cost)
- Not initialized → returns immediately
- Method muted → returns immediately
- Method not in active flow → returns immediately
- Method in active flow → prints structured log

### `ATS.internalInit(methodMap, activeFlows, [mutedMethods])`

Called by `AtsGenerated.init()` from the generated code. **Do not call directly.**

### `ATS.isActive(flowName)` → `bool`

Check if a specific flow is currently active.

### `ATS.activeFlows` → `List<String>`

Get all currently active flow names.

### `ATS.isInitialized` → `bool`

Whether ATS has been initialized.

---

## Architecture

```
lib/
├── ats_flutter.dart              # Public API — exports ATS class
└── src/
    ├── ats_core.dart             # ATS.trace() + sequence + depth + muting
    ├── flow_registry.dart        # O(1) method→flow hash map
    └── log_writer.dart           # File-based JSONL logging to .ats/logs/
```

---

## How CodeGen Works (V5)

The **MCP Server** (not this package) handles code generation:

1. AI calls `ats_activate("PAYMENT_FLOW")` via MCP
2. MCP Server updates `flow_graph.json`
3. MCP Server auto-detects `pubspec.yaml` → generates `ats_generated.g.dart`
4. Developer does Hot Restart → new generated code takes effect

```dart
// AUTO-GENERATED BY ATS MCP Server — DO NOT EDIT
import 'package:ats_flutter/ats_flutter.dart';

const _kMethodMap = <String, List<String>>{
  'PaymentService.processPayment': ['PAYMENT_FLOW'],
  'PaymentService.refund': ['PAYMENT_FLOW'],
};

const _kMutedMethods = <String>{};

const _kActiveFlows = <String>['PAYMENT_FLOW'];

abstract class AtsGenerated {
  static void init() {
    ATS.resetSequence();
    ATS.internalInit(_kMethodMap, _kActiveFlows, _kMutedMethods);
  }
}
```

---

## Tests

```bash
flutter test
```

Tests cover:
- Flow registry initialization
- Single and multi-flow method lookups
- Unknown class/method handling (O(1) miss)
- Active/inactive flow detection
- Muted method suppression

---

## Works With

| Tool | How |
|---|---|
| **MCP Server** | AI calls `ats_instrument` to auto-add traces, `ats_activate` to toggle |
| **Claude Plugin** | `/plugin install ats-protocol` — auto-registers MCP + skills + hooks |
| **Gemini / Cursor / Windsurf** | Configure MCP server in settings |
| **Web Dashboard** | D3.js interactive DAG at `localhost:4567` |
| **CI/CD** | `ats_validate` in CI catches stale methods and broken edges |

---

## Related

- [ATS Protocol](../../README.md) — Protocol overview and monorepo
- [MCP Server](../ats-mcp-server/README.md) — 8 AI agent tools + CLI + CodeGen
- [SDK Guide](../../docs/sdk-guide.md) — Build ATS for a new language
- [Setup Guide](../../docs/setup.md) — Full installation walkthrough

## License

MIT — See [LICENSE](../../LICENSE)
