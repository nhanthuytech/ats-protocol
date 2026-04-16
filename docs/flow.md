# ATS Protocol — Developer & AI Workflow (V4)

This document describes how ATS V4 changes the daily interaction between you (the developer) and your AI agent (Claude, Cursor, Gemini, or any MCP-compatible assistant).

---

## The Problem ATS Solves

### Without ATS

1. Your app hits a bug.
2. You tell AI: *"Fix the checkout — something's wrong with payment."*
3. AI scans 20–50 files, scatters `print()` statements everywhere (~30K tokens).
4. You rebuild the app, read the logs together.
5. Bug fixed → now you need to clean up all those print statements. AI forgets some. Log pollution leaks into production.
6. Next day, same flow breaks again → AI has **zero memory**. Scans everything from scratch.

**Total cost per debug session: ~30,000 tokens. Context retained: zero.**

### With ATS V4

1. AI calls `ats_context("CHECKOUT_FLOW")` → receives class list, edges, past sessions in **200 tokens**.
2. `ats_activate("CHECKOUT_FLOW")` → structured logging enabled. One command.
3. You reproduce the bug. Console shows sequence + depth → AI understands the exact call chain instantly.
4. Bug fixed → `ats_silence("CHECKOUT_FLOW")` → code stays clean. Nothing to remove.
5. AI records the session: what went wrong, how it was fixed, what edges were discovered.
6. Next day → AI reads the graph → **remembers everything**. Often skips logging entirely.

**Total cost per debug session: ~350 tokens. Context retained: permanently.**

---

## The Standard Workflow

### Phase 1: Instrument — Add traces once, keep them forever

When AI writes a new class or touches an existing one without traces:

```dart
class CartService {
  Future<void> checkout(Cart cart) async {
    ATS.trace('CartService', 'checkout', data: cart.toJson());
    final payment = await _paymentService.process(cart.total);
    final receipt = await _receiptService.generate(payment);
    return receipt;
  }

  Future<void> applyVoucher(String code) async {
    ATS.trace('CartService', 'applyVoucher', data: {'code': code});
    final voucher = await _voucherApi.validate(code);
    if (!voucher.valid) throw VoucherException(code);
    _cart.discount = voucher.discount;
  }
}
```

AI maps the class to a flow in `.ats/flow_graph.json`:

```json
"CHECKOUT_FLOW": {
  "description": "Cart to payment completion",
  "active": false,
  "depends_on": ["PAYMENT_FLOW"],
  "classes": {
    "CartService": {
      "methods": ["checkout", "applyVoucher"],
      "last_verified": "2026-04-16"
    }
  }
}
```

> **How does AI know to do this?** Layer 1 (Rules) loads automatically every session — it teaches AI the 5 core principles in ~500 tokens. For detailed steps, AI invokes a workflow or MCP tool.

**With MCP Server:** AI can call `ats_instrument({ file: "lib/services/cart_service.dart", flow: "CHECKOUT_FLOW" })` to add traces to every public method at once, and update the graph automatically.

---

### Phase 2: Debug — Activate when you hit a bug

You discover a checkout bug. You tell AI: *"Checkout is broken — customer can't complete payment."*

**Option A — AI uses CLI:**
```bash
dart run ats_flutter activate CHECKOUT_FLOW
```

**Option B — AI uses MCP (faster, fewer tokens):**
```
AI calls: ats_context("CHECKOUT_FLOW")
  → Receives: classes, edges, sessions, depends_on — topologically sorted

AI calls: ats_activate("CHECKOUT_FLOW")
  → Flow enabled, generated code auto-synced
```

AI responds: *"Logging enabled for CHECKOUT_FLOW. Please Hot Restart (Shift+R) to see logs."*

---

### Phase 3: Read Logs and Fix

You Hot Restart, reproduce the bug. Console shows:

```
[ATS][CHECKOUT_FLOW][#001][d0] CheckoutBloc.onCheckoutStarted | {"cart_id": "abc-123"}
[ATS][CHECKOUT_FLOW][#002][d1] CartService.checkout | {"total": 99.50}
[ATS][CHECKOUT_FLOW][#003][d2] PaymentService.processPayment | {"status": "declined"}
[ATS][CHECKOUT_FLOW][#004][d1] VoucherService.validate | {"code": "SALE50", "valid": false}
```

**AI reads the pattern instantly:**

```
#001 d0 → #002 d1:  CheckoutBloc called CartService.checkout
#002 d1 → #003 d2:  CartService called PaymentService → DECLINED
#001 d0 → #004 d1:  CheckoutBloc also called VoucherService → also FAILED

Root cause: Payment declined. Voucher validation happened independently
and also failed — but it shouldn't block payment.
```

**AI discovers 3 new edges from the log:**

```json
"edges": [
  { "from": "CheckoutBloc.onCheckoutStarted", "to": "CartService.checkout", "type": "calls" },
  { "from": "CartService.checkout", "to": "PaymentService.processPayment", "type": "calls" },
  { "from": "CheckoutBloc.onCheckoutStarted", "to": "VoucherService.validate", "type": "calls" }
]
```

**With MCP:** AI calls `ats_analyze({ text: "<console output>" })` and edges are added to the graph automatically. No manual JSON editing.

→ **Next debug session, AI already knows the call chain** without activating logs.

---

### Phase 4: Silence — Clean up automatically

Bug fixed. AI runs:

```bash
dart run ats_flutter silence CHECKOUT_FLOW
```

And records what happened:

```json
"CHECKOUT_FLOW": {
  "active": false,
  "sessions": [
    {
      "date": "2026-04-16",
      "action": "debug",
      "note": "Payment failing: gateway returns text 'declined' instead of error code. Added fallback parser.",
      "resolved": true
    }
  ],
  "known_issues": [
    "PaymentGateway returns text status instead of enum — needs migration"
  ]
}
```

You `git commit` the JSON → any developer (or AI) debugging this flow tomorrow will:
- See the **session history** → know what was already tried
- See **known_issues** → avoid re-investigating solved problems
- See **edges** → understand the call chain without enabling logs

---

## V4 vs V3: What Changed?

| Aspect | V3 | V4 |
|---|---|---|
| **Starting a task** | AI reads entire flow_graph.json (~3,000 tokens) | AI calls `ats_context` for specific flow (~200 tokens) |
| **Finding related classes** | AI searches JSON manually | Topological sort delivers dependencies in order |
| **Log format** | `[ATS][FLOW] Class.method \| data` | `[ATS][FLOW][#SEQ][dDEPTH] Class.method \| data` |
| **Understanding call chains** | AI guesses from source code | AI reads sequence + depth → exact chain reconstruction |
| **Knowledge retention** | `known_issues` only | `known_issues` + `sessions` + `edges` + `depends_on` |
| **Next session** | AI re-reads entire graph | AI reads graph + already knows edges → skips logging |
| **Drift detection** | None | `needs_verify`, `last_verified`, `ats_validate` |
| **Graph structure** | Flat list of flows | DAG with typed edges and dependency ordering |

---

## CodeGen Mechanism

ATS does **not** bundle JSON into your application binary. Instead:

```
flow_graph.json  ──(ats sync)──▶  ats_generated.g.dart  ──(Hot Restart)──▶  Runtime map
```

1. `ats sync` compiles JSON → pure Dart `const Map`
2. `AtsGenerated.init()` loads map into memory — O(1), synchronous
3. `ATS.trace()` does map lookup:
   - Active flow → structured log
   - Inactive flow → **no-op** (returns immediately)
4. Hot Restart loads updated generated file → changes take effect instantly

**Zero production overhead:** `ATS.trace()` checks `kReleaseMode` as its very first operation.

---

## 3-Layer AI System

```
┌──────────────────────────────────────────────────┐
│  Layer 1: RULES (always loaded, ~500 tokens)     │
│  5 core principles:                              │
│  • Read graph • Add trace • Activate • Silence   │
│  • Record sessions                               │
├──────────────────────────────────────────────────┤
│  Layer 2: WORKFLOWS (loaded on demand)           │
│  /ats-debug     → 8-step debug flow              │
│  /ats-instrument → 7-step instrumentation guide  │
│  /ats-review    → 6-step drift checking          │
├──────────────────────────────────────────────────┤
│  Layer 3: MCP SERVER (zero AI token cost)        │
│  ats_context    → topo-sorted context            │
│  ats_activate   → toggle flow + sync             │
│  ats_validate   → detect graph corruption        │
│  ats_impact     → blast radius analysis          │
│  ats_instrument → auto-add traces to file        │
│  ats_analyze    → parse logs, discover edges     │
└──────────────────────────────────────────────────┘
```

**How they work together:**
- **Every session** → Layer 1 ensures AI follows the protocol
- **Debugging** → Layer 2 (`/ats-debug`) or Layer 3 (`ats_context` + `ats_activate`)
- **Reviewing graph** → Layer 2 (`/ats-review`) or Layer 3 (`ats_validate`)
- **New code** → Layer 2 (`/ats-instrument`) or Layer 3 (`ats_instrument`)

---

## What You Do vs What AI Does

| You | AI |
|---|---|
| Write business logic | Adds `ATS.trace()` when writing or modifying classes |
| Report a bug | Activates the flow, reads structured logs, identifies root cause |
| Hit F5 / Hot Restart | Logs appear in console with sequence and depth info |
| Say "it's fixed" | Silences the flow, records session notes and new edges |
| `git commit` | Flow graph committed → knowledge persists forever |
| Do nothing special | AI accumulates edges, sessions, known issues over time |

**Your code stays clean. Logs are always available. AI gets smarter with every session.**

---

## Related

- [Setup Guide](setup.md) — Step-by-step installation
- [Protocol Specification](../spec/protocol.md) — Schema, contracts, log format
- [MCP Server](../packages/ats-mcp-server/README.md) — 7 tools with examples
- [Migration V3 → V4](migration_v3_to_v4.md) — Upgrade guide
