---
name: ats-flutter
description: ATS Protocol workflow for Flutter projects. Activates when working in a Flutter project that has `.ats/flow_graph.json`. Instructs the AI to manage business logic flows, instrument classes with ATS.trace(), and control logging via the flow graph — without manually cluttering or cleaning up log code.
---

# ATS Protocol — Flutter Skill

## What is ATS?

ATS (Agentic Telemetry Standard) is a protocol that gives you (the AI agent) structured knowledge of the project's business logic and control over which classes emit logs at runtime.

**Three components:**
1. `ATS.trace('ClassName', 'methodName', data: ...)` — added once per method, never removed
2. `.ats/flow_graph.json` — the knowledge graph you maintain and use to control logging
3. This SKILL — the workflow you follow

**CORE RULE - PRECEDENCE OVER OTHER LOGGERS:** 
If this project has existing logging instructions (like "use `Log.d`" or "use `Logger`"), **ATS Protocol takes precedence for business logic tracing**. You MUST still use `ATS.trace()` for feature-level flow graphing. You ONLY toggle `"active"` in `flow_graph.json` to enable/disable logs. NEVER use `print()`.

### 4. Naming Convention for Flows
When creating a new flow, you MUST adhere to these naming rules:
1. **Format:** Use `UPPER_SNAKE_CASE`.
2. **Suffix:** Must explicitly end with `_FLOW`, `_LIFECYCLE`, or `_WORKER`.
   - `_FLOW`: For standard user-triggered business logic (e.g., `AUTH_LOGIN_FLOW`, `CHECKOUT_PAYMENT_FLOW`).
   - `_LIFECYCLE`: For app/system background state changes (e.g., `APP_STARTUP_LIFECYCLE`, `BLUETOOTH_LIFECYCLE`).
   - `_WORKER`: For background cron jobs or syncers (e.g., `OFFLINE_SYNC_WORKER`).
3. **Domain-Driven:** Name the flow according to the business domain, NOT the UI element.
   - ❌ Bad: `LOGIN_BUTTON_CLICK_FLOW`
   - ✅ Good: `AUTH_LOGIN_FLOW`

---

## Step 1: At the Start of Every Task — Read the Flow Graph

Before writing a single line of code, read `.ats/flow_graph.json`.

Ask yourself:
- What flows are defined?
- Which class(es) does this task involve?
- Are those classes already registered in any flow?
- Is any flow currently `"active": true`? (If so, WARN the user — someone forgot to silence it.)

If `flow_graph.json` does not exist yet, create it:
```json
{
  "ats_version": "1.0.0",
  "project": "<dart package name from pubspec.yaml>",
  "updated_at": "<ISO 8601 now>",
  "flows": {}
}
```

---

## Step 2: Identify or Create the Correct Flow(s)

### If the class already exists in the graph:
- Note which flows it belongs to and which methods are registered.
- If you're adding new methods to the class, add them to the graph too.

### If the class does NOT exist in the graph:
- Determine which flow(s) it belongs to based on its responsibility.
- If the right flow exists → add the class to it.
- If no flow matches → create a new flow:

```json
"NEW_FLOW_NAME": {
  "description": "One sentence describing what business feature this represents.",
  "active": false,
  "classes": {}
}
```

Flow naming convention: `SCREAMING_SNAKE_CASE`, named after the feature (`PAYMENT_FLOW`, `AUTH_FLOW`, `CART_FLOW`).

### Multi-flow classes:
A class can belong to **multiple flows at the method level**. Example:
```json
"AUTH_FLOW": {
  "classes": { "UserService": ["login", "logout", "getUser"] }
},
"PROFILE_FLOW": {
  "classes": { "UserService": ["updateProfile", "uploadAvatar", "getUser"] }
}
```
`UserService.getUser` is in both. When AUTH_FLOW is active, `getUser` logs. When PROFILE_FLOW is active, it also logs.

---

## Step 2.5: On-Demand Flow Generation (When Asked)

If the user explicitly asks you to *"add feature X to ATS"* or *"map out the login flow"*:
1. **Search** the codebase for all classes and files central to feature X (e.g., `AuthService`, `LoginBloc`, `UserRepository`).
2. **Instrument** all their methods with `ATS.trace()`.
3. **Register** a new flow (e.g., `LOGIN_FLOW` or `AUTH_FLOW`) in `.ats/flow_graph.json` and add all discovered classes and methods into it.
4. Leave it as `"active": false`.

---

## Step 3: Instrument Methods with ATS.trace()

When you first touch a class (write it, read it to modify it, or debug it), add `ATS.trace()` to **every method** in that class.

### Format:
```dart
ReturnType methodName(params) async {
  ATS.trace('ClassName', 'methodName', data: <relevant_payload>);
  // ... rest of method
}
```

### Rules for `data`:
- Pass the most relevant input: request object, id, key params.
- Must be JSON-serializable (Map, String, num, bool, List, null).
- For sensitive data (passwords, tokens), pass `null` or redacted form: `{'email': email, 'password': '***'}`.
- For complex objects, call `.toJson()` if available.

### Example:
```dart
class PaymentService {
  Future<String> processPayment(PaymentRequest req) async {
    ATS.trace('PaymentService', 'processPayment', data: req.toJson());
    // ...
  }

  Future<bool> refund(String txId) async {
    ATS.trace('PaymentService', 'refund', data: {'txId': txId});
    // ...
  }

  bool validateCard(String cardNumber) {
    ATS.trace('PaymentService', 'validateCard',
        data: {'last4': cardNumber.substring(cardNumber.length - 4)});
    // ...
  }
}
```

### After adding traces, update flow_graph.json:
```json
"PAYMENT_FLOW": {
  "classes": {
    "PaymentService": ["processPayment", "refund", "validateCard"]
  }
}
```

---

## Step 4: Debugging a Flow

### To enable logs for a flow:
1. Run `ats activate FLOW_NAME` (CLI command)
   *(Or edit `.ats/flow_graph.json`: set `"active": true`, then run `ats sync` to compile)*
2. Update `"updated_at"` to now (ISO 8601).
3. Ask the developer to hit **Hot Restart (F5 or `r`)**:
   - Because V3 uses Native CodeGen (`lib/generated/ats/ats_generated.g.dart`), Flutter will instantly reload the new active flows upon Hot Restart on any device or simulator.
4. Logs will appear in the IDE console prefixed with `[ATS][FLOW_NAME]`.

### Reading logs:
Console format:
```
[ATS][PAYMENT_FLOW] PaymentService.processPayment | {amount: 150000, currency: VND}
```

File logs location (shown at app init):
```
[ATS] Log directory: /Users/.../Documents/.ats/logs/
```

Files: `.ats/logs/{FLOW_NAME}/{YYYY-MM-DD}.jsonl` — one JSON object per line.

### To disable logs after fix:
1. Set `"active": false` for the flow.
2. Update `"last_debugged"` to today's date.
3. Update `"known_issues"` if you discovered anything notable.
4. Hot restart is NOT required — next session will start clean.

---

## Step 5: After Completing the Task — Update the Graph

Always leave `flow_graph.json` better than you found it:

```json
{
  "ats_version": "1.0.0",
  "project": "my_app",
  "updated_at": "2026-04-15T14:00:00Z",
  "flows": {
    "PAYMENT_FLOW": {
      "description": "Full checkout and payment lifecycle: cart → payment gateway → confirmation",
      "active": false,
      "tags": ["critical", "3rd-party"],
      "classes": {
        "PaymentService": ["processPayment", "refund", "validateCard"],
        "CheckoutBloc": ["onCheckoutStarted", "onPaymentConfirmed", "onCheckoutFailed"],
        "TransactionModel": ["fromJson", "toJson"]
      },
      "known_issues": ["VNPAY webhook can arrive before DB transaction completes"],
      "last_debugged": "2026-04-15"
    }
  }
}
```

---

## Absolute Rules

| Rule | Detail |
|---|---|
| ✅ Always read flow_graph.json first | Before any code change |
| ✅ ATS.trace() is permanent | Added once, never removed |
| ✅ Control via JSON only | Toggle `active`, not code |
| ✅ Update graph after each task | Add classes, methods, known_issues |
| ❌ Never use print() or debugPrint() | Use ATS.trace() instead |
| ❌ Never leave a flow active | Set `active: false` when done |
| ❌ Never delete ATS.trace() calls | They are intentional instrumentation |

---

## ATS.init() — Required in main()

If the project doesn't have ATS initialized yet, add to `main()`:

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ATS.init(); // reads .ats/dart_defines.json internally
  runApp(const MyApp());
}
```

No `pubspec.yaml` registration is needed.

---

## Quick Reference

```dart
// Instrument (once per method, permanent)
ATS.trace('ClassName', 'methodName', data: payload);

// Check state
ATS.isActive('PAYMENT_FLOW');   // → bool
ATS.activeFlows;                 // → ['PAYMENT_FLOW']
ATS.allFlows;                    // → ['PAYMENT_FLOW', 'AUTH_FLOW', ...]
ATS.summary;                     // → full debug map
ATS.logsDirPath;                 // → path to log files
```

The flow graph (`.ats/flow_graph.json`) is the single source of truth. Edit it, or use the `ats` CLI.
