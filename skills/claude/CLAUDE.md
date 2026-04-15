# ATS Protocol — Claude Instructions

This project uses the **ATS (Agentic Telemetry Standard) V4** protocol. As an AI assistant, you MUST follow this workflow at all times.

---

## What ATS Is

ATS is not just a logging library. It is a **DAG-based knowledge protocol** for YOU (Claude) to:
- Understand which classes belong to which business logic flows
- See how flows depend on each other (`depends_on`, `parent`)
- Track method-level call chains (`edges`)
- Control logging by editing `.ats/flow_graph.json` — not by injecting/removing log code
- Accumulate project knowledge over time (sessions, known_issues)

---

## Before ANY Task: Read the Flow Graph (Two-Step)

**Step 1a — Quick scan** (read flow names + `depends_on` only, skip class details):
- What flows exist?
- Which flows are `"active": true`? (If any, WARN the user — someone forgot to silence it.)
- What are the `depends_on` relationships?

**Step 2b — Deep read** (only for flows relevant to this task):
- Which class(es) does this task involve?
- Read full details only for those flows + their `depends_on` upstream flows.
- Skip all unrelated flows.

This two-step approach saves tokens: scan ~500 tokens for flow names, then read ~2K tokens for 2-3 relevant flows, instead of ~15K tokens for the entire file.

If the file doesn't exist, create it:
```json
{
  "ats_version": "4.0.0",
  "project": "<name from pubspec.yaml>",
  "updated_at": "<ISO 8601 timestamp>",
  "flows": {},
  "edges": []
}
```

---

## ⚠️ OVERRIDE RULE: Precedence over other loggers
If this project contains existing instructions for logging (e.g., "Use `Log.d()`", "Use `Logger`", "Use `Sentry`"), **ATS Protocol still takes absolute precedence for business logic flow tracing**. 
You can use `Log.e()` for try/catch errors if the project requires it, but you MUST invariably add `ATS.trace()` at the beginning of methods to maintain the flow graph.

### Naming Convention for Flows
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

## Core Rules

### 1. `ATS.trace()` is added once, never removed
When you first write or touch a class, add `ATS.trace()` to every method:
```dart
Future<void> processPayment(PaymentRequest req) async {
  ATS.trace('PaymentService', 'processPayment', data: req.toJson());
  // business logic...
}
```
This call is **permanent**. It is a complete no-op when the flow is inactive.

**If `ATS.trace()` already exists in a method:**
- Verify the class name and method name strings match the actual class and method.
- If they don't match (e.g., method was renamed but trace string wasn't updated), **fix the string immediately**.
- Example: method renamed from `processPayment` to `process` but trace still says `ATS.trace('PaymentService', 'processPayment')` → fix to `ATS.trace('PaymentService', 'process')`.

### 2. Control logging by editing `flow_graph.json`, not code
To enable logs → `ats activate FLOW_NAME` (or set `"active": true` + `ats sync`) + hot restart.
To disable logs → `ats silence FLOW_NAME` (or set `"active": false`).
You NEVER remove `ATS.trace()` calls. You NEVER use `print()`.

### 3. Set dependencies when creating flows
When creating a new flow:
- If it calls methods from another flow, set `"depends_on": ["OTHER_FLOW"]`.
- If it's a variant/implementation of another flow, set `"parent": "PARENT_FLOW"`.

```json
"CHECKOUT_FLOW": {
  "depends_on": ["PAYMENT_FLOW", "AUTH_FLOW"],
  "classes": { ... }
},
"STRIPE_PAYMENT": {
  "parent": "PAYMENT_FLOW",
  "classes": { ... }
}
```

---

## Workflow

### Starting a task:
1. Read `.ats/flow_graph.json` (two-step: scan names first, then read relevant flows)
2. Identify which flow(s) the target class belongs to
3. If class not in graph → add it to the correct flow (or create a new flow)
4. Set `depends_on` if this flow calls methods from other flows

### Debugging:
1. Run `ats activate FLOW_NAME`
   *(If you edit json manually, ALWAYS run `ats sync` to compile)*
2. Hot restart the app (F5 or `r`).
3. Read console output: `[ATS][FLOW_NAME][#SEQ][dDEPTH] ClassName.methodName | data`
4. **Discover edges from logs:** When you see `#005 d1` followed by `#006 d2`, the first method called the second. Add this to `"edges"`:
```json
"edges": [
  { "from": "PaymentService.processPayment", "to": "StripeGateway.charge", "type": "calls" }
]
```
5. Fix the bug
6. Run `ats silence FLOW_NAME` — done, no cleanup needed

### Writing a new class:
1. Determine which flow(s) it belongs to
2. Add `ATS.trace()` to every method
3. Register the class + methods in `flow_graph.json` (V4 object format):
```json
"ClassName": {
  "methods": ["method1", "method2"],
  "last_verified": "2026-04-16"
}
```
4. Leave `"active": false`

### Finishing any task:
- Update `"updated_at"` in `flow_graph.json`
- Add newly discovered methods/classes to the graph
- Update `"known_issues"` if relevant
- Update `"last_debugged"` if you debugged this flow
- Add a session note:
```json
"sessions": [
  { "date": "2026-04-16", "action": "debug", "note": "Fixed race condition in webhook", "resolved": true }
]
```
**Session limit:** Keep only the **5 most recent** sessions per flow. When adding a 6th, remove the oldest.

---

## Graph Update Safety Rules

| Rule | Detail |
|---|---|
| ✅ Verify before trust | When touching a class in the graph, open source file and confirm methods match |
| ✅ Rename > Delete | If a method was renamed, rename it in the graph — don't delete and re-add |
| ✅ Only fix flows you're working on | Don't update a flow you haven't read the source code for |
| ✅ When unsure, mark | Set `"needs_verify": true` instead of removing entries |
| ✅ Log your work | Add a `sessions` entry after every debug/refactor session |

---

## Multi-Flow Classes

A class can belong to **multiple flows** at the method level:
```json
"AUTH_FLOW":    { "classes": { "UserService": { "methods": ["login", "getUser"] } } },
"PROFILE_FLOW": { "classes": { "UserService": { "methods": ["updateProfile", "getUser"] } } }
```
`UserService.getUser` logs when EITHER flow is active.

---

## ATS API Reference

```dart
// Initialize (in main.dart — do this once if not present)
import 'package:ats_flutter/ats_flutter.dart';
import 'generated/ats/ats_generated.g.dart';

AtsGenerated.init(); // O(1) from compiled native map

// Instrument (add to every method, permanently)
ATS.trace('ClassName', 'methodName', data: jsonSerializablePayload);

// Introspect
ATS.isActive('FLOW_NAME');  // bool
ATS.activeFlows;             // List<String>
ATS.logsDirPath;             // String? — where files are written
```

---

## Setup (if not done in project)

**pubspec.yaml:**
```yaml
dependencies:
  ats_flutter: ^0.1.0
```
(No assets registration needed)

**main.dart:**
```dart
import 'package:ats_flutter/ats_flutter.dart';
import 'generated/ats/ats_generated.g.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  AtsGenerated.init();
  runApp(const MyApp());
}
```

**Create `.ats/flow_graph.json`** (minimum):
```json
{
  "ats_version": "4.0.0",
  "project": "your_app",
  "updated_at": "2026-01-01T00:00:00Z",
  "flows": {},
  "edges": []
}
```

---

## Prohibited Actions

- ❌ `print()` or `debugPrint()` — use `ATS.trace()` instead
- ❌ Removing `ATS.trace()` calls — they are permanent instrumentation
- ❌ Leaving a flow `"active": true` after finishing — always silence when done
- ❌ Skipping the flow graph at task start — always read it first
- ❌ Updating flows you haven't read source code for — only fix what you know
- ❌ Deleting methods from graph when unsure — mark `"needs_verify": true` instead
