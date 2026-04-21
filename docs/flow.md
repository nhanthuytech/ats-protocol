# ATS Protocol — Developer & AI Workflow (V6)

This document describes how ATS V6 changes the daily interaction between you (the developer) and your AI agent (Claude, Cursor, Gemini, or any MCP-compatible assistant).

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

### With ATS V6

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
  "priority": "high",
  "depends_on": ["PAYMENT_FLOW"],
  "classes": {
    "CartService": {
      "methods": ["checkout", "applyVoucher"],
      "last_verified": "2026-04-20"
    }
  }
}
```

> **How does AI know to do this?** At session start, AI calls `ats_init` via MCP — it receives all protocol rules and workflows in ~400 tokens. No heavy config files needed.

**With MCP Server:** AI can call `ats_instrument({ file: "lib/services/cart_service.dart", flow: "CHECKOUT_FLOW" })` to add traces to every public method at once, and update the graph automatically.

---

### Phase 2: Debug — Activate when you hit a bug

You discover a checkout bug. You tell AI: *"Checkout is broken — customer can't complete payment."*

AI uses MCP tools:
```
AI calls: ats_context("CHECKOUT_FLOW")
  → Receives: classes, edges, sessions, depends_on, global_classes — topologically sorted

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
  { "from": "CheckoutBloc.onCheckoutStarted", "to": "CartService.checkout", "type": "calls", "trigger": "user_tap" },
  { "from": "CartService.checkout", "to": "PaymentService.processPayment", "type": "calls", "state_impact": "paymentState" },
  { "from": "CheckoutBloc.onCheckoutStarted", "to": "VoucherService.validate", "type": "calls" }
]
```

**With MCP:** AI calls `ats_analyze({ text: "<console output>" })` and edges are added to the graph automatically. No manual JSON editing.

→ **Next debug session, AI already knows the call chain** without activating logs.

---

### Phase 4: Silence — Clean up automatically

Bug fixed. AI runs `ats_silence("CHECKOUT_FLOW")` and records what happened:

```json
"CHECKOUT_FLOW": {
  "active": false,
  "sessions": [
    {
      "date": "2026-04-20",
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

## V6 Features

### Global Classes

Shared services like `AuthService` and `AnalyticsService` don't need to be duplicated across flows:

```json
{
  "global_classes": {
    "AuthService": {
      "methods": ["login", "logout", "refreshToken"],
      "last_verified": "2026-04-20"
    }
  }
}
```

When **any** flow is active, `AuthService` methods are automatically traced.

### Priority Filtering

Control noise when many flows are active:

```json
"ANALYTICS_FLOW": {
  "priority": "low",
  "active": true
}
```

AI or developer calls `ATS.setMinPriority('high')` → only high-priority flows produce logs.

### Rich Edges

Edges now carry context about **what triggers them** and **what state they affect**:

```json
{ "from": "CheckoutBloc.onPaymentConfirmed", "to": "PaymentService.processPayment",
  "type": "calls", "trigger": "user_tap", "state_impact": "paymentState" }
```

### Method Muting via MCP

AI can directly mute noisy methods without editing JSON:

```
AI calls: ats_mute({ className: "Logger", methodName: "verbose" })
→ Method muted across all flows. Auto-syncs generated code.
```

---

## CodeGen Mechanism

ATS does **not** bundle JSON into your application binary. Instead:

```
flow_graph.json  ──(ats sync)──▶  ats_generated.g.dart  ──(Hot Restart)──▶  Runtime map
```

1. MCP Server compiles JSON → pure Dart `const Map` (includes global_classes + priorities)
2. `AtsGenerated.init()` loads map into memory — O(1), synchronous
3. `ATS.trace()` does map lookup:
   - Active flow → structured log
   - Inactive flow → **no-op** (returns immediately)
4. Hot Restart loads updated generated file → changes take effect instantly

**Zero production overhead:** `ATS.trace()` checks `kReleaseMode` as its very first operation.

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
- [MCP Server](../packages/ats-mcp-server/README.md) — 10 tools with examples
- [Migration V5 → V6](../planV6.md) — Upgrade guide
