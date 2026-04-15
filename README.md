# 🧠 Agentic Telemetry Standard (ATS)

> A **structured logging library** + **AI agent skill** for Flutter. ATS gives AI coding agents (Cursor, Claude, Windsurf) a persistent map of your project's business logic, so they can toggle debug logs per flow instead of scattering `print()` everywhere.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/nhanthuytech/ats-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/nhanthuytech/ats-protocol/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/Platform-Flutter%20%7C%20Dart-blueviolet)](https://flutter.dev)
[![AI Ready](https://img.shields.io/badge/AI%20Agent-Native-green)](https://cursor.so)

---

## 🎯 What ATS is

ATS has two parts:

1. **A logging library** (`ats_flutter`) — provides `ATS.trace()`, a lightweight tracing function that respects flow-level on/off switches. When a flow is off, the call is a no-op.
2. **An AI agent skill** (`SKILL.md`) — a set of instructions that teaches AI agents how to read, update, and maintain `flow_graph.json` — the JSON file that maps classes to business flows.

Together, they let your AI agent:
- Know which classes belong to which business flow.
- Toggle logs on/off by flow, not by file.
- Accumulate project knowledge across sessions (the graph is committed to git).

---

## 🔥 The Exact Problem

When an AI agent tries to debug an issue in `CheckoutBloc`:

**Without ATS:**
1. AI scans 50 different files trying to find related classes.
2. AI randomly injects `print()` everywhere.
3. Bug fixed → AI (or you) has to manually clean up every injected `print()`.
4. Next session: AI loses context, starts scanning from scratch.

**With ATS:**
1. AI reads `flow_graph.json` → immediately knows `CheckoutBloc` belongs to the `PAYMENT_FLOW`.
2. AI updates `PAYMENT_FLOW.active = true` in JSON → related logs are instantly activated.
3. Bug fixed → AI runs `ats silence` → logs are muted. Code stays clean.
4. Next session: `flow_graph.json` remains. AI starts the session instantly with deep architectural context.

---

## ⚙️ How V3 Works (Native CodeGen)

ATS V3 uses a **CodeGen** architecture. Instead of parsing JSON at runtime, the CLI compiles `flow_graph.json` into a static Dart Map. This means flow lookups at runtime are O(1) with no JSON overhead.

### 1. `ATS.trace()` — Instrument code just once

AI adds this trace line when it first writes or encounters a class. **It never needs to be added again.**

```dart
class PaymentService {
  Future<void> processPayment(PaymentRequest req) async {
    ATS.trace('PaymentService', 'processPayment', data: req); // ← Added just once
    // ... business logic
  }

  Future<void> refund(String txId) async {
    ATS.trace('PaymentService', 'refund', data: txId); // ← Added just once
    // ... business logic
  }
}
```

When a flow is not active, `ATS.trace()` functions as a complete **no-op**, preventing any memory allocation or performance overhead.

---

### 2. `flow_graph.json` & `ats.yaml` — The Project Brain

The JSON mapping file is tracked at `.ats/flow_graph.json` and customized via `ats.yaml` (similar to Flutter's `l10n.yaml`). It gets **committed to git** and grows as the project scales.

```json
{
  "ats_version": "3.0.0",
  "project": "my_flutter_app",
  "flows": {
    "PAYMENT_FLOW": {
      "description": "Handles all Stripe and App Store transactions",
      "active": false,
      "classes": {
        "PaymentService": ["processPayment", "refund", "validateCard"],
        "CheckoutBloc": ["onCheckoutStarted", "onPaymentConfirmed"],
        "TransactionModel": ["fromJson", "toJson"]
      }
    },
    "AUTH_FLOW": {
      "description": "Login, registration, and token refreshes",
      "active": false,
      "classes": {
        "AuthService": ["login", "logout", "refreshToken"],
        "UserService": ["getUser", "validateSession"]
      }
    }
  }
}
```

**A single class can participate in multiple flows:**
```json
"classes": {
  "UserService": {
    "AUTH_FLOW": ["getUser", "validateSession"],
    "PROFILE_FLOW": ["updateProfile", "uploadAvatar"]
  }
}
```

**Toggling logs = switching the `active` flag. No code needs to be modified.**

---

### 3. `SKILL.md` — Instructions for the AI Agent

This instruction file defines the **standardized workflow** that the AI agent must follow. This is the cornerstone of ATS — it transforms a reactive AI into an organized, architectural agent.

---

## 🔄 AI Agent Working Loop

```
Task Started (Fix Bug / Build Feature)
          │
          ▼
Reads .ats/flow_graph.json
→ Identifies which flow the target class belongs to
→ If the class is unmapped → Maps it to the relevant flow
          │
          ▼
If debugging is required: sets flow.active = true
          │
          ▼
Codes / Debugs / Tests
          │
          ▼
If class is missing ATS.trace():
  → Injects ATS.trace() into each method  ← done once, never revisited
          │
          ▼
Task Finished: AI runs `ats silence` (Mutes the flow, compiles Native)
Code remains clean. No cleanup required.
          │
          ▼
Graph grows richer → Next AI session starts with full context
```

> **A Note on Debugging:** When the AI toggles the `active: true/false` flag, simply trigger a **Hot Restart** (press `r` or `F5`) in your IDE. The new logging configuration takes effect instantly without a full project rebuild!

---

## 📈 Value Over Time

| Timeline | What the AI knows about your project |
|---|---|
| Day 1 | `flow_graph.json` is empty, AI scans files manually |
| Week 1 | 3–5 flows mapped, AI skips scanning for known areas |
| Month 1 | 10+ flows, AI understands core business logic |
| Month 3 | Comprehensive graph, AI rarely needs to explore blindly |

---

## 🏗 Repository Structure

```text
ats-protocol/
├── spec/                          # Protocol specification (language-agnostic)
│   ├── flow_graph_schema.json     # JSON Schema for flow_graph.json
│   └── protocol.md                # Full protocol spec
│
├── skills/                        # AI Agent Skills
│   ├── antigravity/
│   │   └── SKILL.md               # Skill for Antigravity (Gemini) agents
│   └── claude/
│       └── CLAUDE.md              # Skill for Claude agents
│
├── packages/
│   └── ats_flutter/               # Dart/Flutter SDK + CLI
│       ├── lib/
│       │   ├── src/ats_core.dart  # ATS.trace(), runtime control
│       │   └── ats_flutter.dart   # Public API
│       ├── bin/ats.dart           # CLI entry point
│       └── pubspec.yaml
│
├── docs/                          # Setup & migration guides
└── .github/workflows/ci.yml      # CI pipeline
```

**Getting Started:**
1. Add `ats_flutter` to your `pubspec.yaml`.
2. Run `ats init` → generates `.ats/flow_graph.json`, `ats.yaml`, and `lib/generated/ats/ats_generated.g.dart`.
3. Call `AtsGenerated.init()` in your `main()` before `runApp()`.
4. Run `ats skill install --global` → your AI Agent is ready to work with ATS.

---

## 🌐 Roadmap

- **v1.x** — Flutter SDK + `flow_graph.json` core schemas.
- **v2.x** — SKILL.md setup for Cursor / Claude + V2 Architecture.
- **v3.0** — **CURRENT:** O(1) CodeGen, `ats.yaml` configuration, Hot Restart support. CLI expansions: `ats init`, `ats sync`, `ats activate`, `ats silence`.
- **v4.0** — Node.js SDK + Python SDK + Universal MCP Server integrations.
