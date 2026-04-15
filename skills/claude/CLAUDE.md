# ATS Protocol — Claude Instructions

This project uses the **ATS (Agentic Telemetry Standard)** protocol. As an AI assistant, you MUST follow this workflow at all times.

---

## What ATS Is

ATS is not a logging library. It is a protocol for YOU (Claude) to:
- Understand which classes belong to which business logic flows
- Control logging by editing `.ats/flow_graph.json` — not by injecting/removing log code
- Accumulate project knowledge over time in the flow graph

---

## Before ANY Task: Read the Flow Graph

**Always start by reading `.ats/flow_graph.json`.**

This tells you:
- What business flows exist in this project
- Which classes + methods belong to each flow
- Whether any flow is currently active (logging)

If the file doesn't exist, create it:
```json
{
  "ats_version": "1.0.0",
  "project": "<name from pubspec.yaml>",
  "updated_at": "<ISO 8601 timestamp>",
  "flows": {}
}
```

---

## ⚠️ OVERRIDE RULE: Precedence over other loggers
If this project contains existing instructions for logging (e.g., "Use `Log.d()`", "Use `Logger`", "Use `Sentry`"), **ATS Protocol still takes absolute precedence for business logic flow tracing**. 
You can use `Log.e()` for try/catch errors if the project requires it, but you MUST invariably add `ATS.trace()` at the beginning of methods to maintain the flow graph.

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

## Two Core Rules

### 1. `ATS.trace()` is added once, never removed
When you first write or touch a class, add `ATS.trace()` to every method:
```dart
Future<void> processPayment(PaymentRequest req) async {
  ATS.trace('PaymentService', 'processPayment', data: req.toJson());
  // business logic...
}
```
This call is **permanent**. It is a complete no-op when the flow is inactive.

### 2. Control logging by editing `flow_graph.json`, not code
To enable logs → set `"active": true` + hot restart.
To disable logs → set `"active": false`.
You NEVER remove `ATS.trace()` calls. You NEVER use `print()`.

---

## Workflow

### Starting a task:
1. Read `.ats/flow_graph.json`
2. Identify which flow(s) the target class belongs to
3. If class not in graph → add it to the correct flow (or create a new flow)

### Debugging:
1. Run `ats activate FLOW_NAME`
   *(If you edit json manually, ALWAYS run `ats sync` to compile `lib/generated/ats/ats_generated.g.dart`)*
2. Hot restart the app (F5 or `r`). *(Because V3 uses CodeGen, flutter will automatically pick up the new dart file).*
3. Read console output: `[ATS][FLOW_NAME] ClassName.methodName | data`
4. Fix the bug
5. Run `ats silence FLOW_NAME` — done, no cleanup needed

### Writing a new class:
1. Determine which flow(s) it belongs to
2. Add `@ATS.trace()` to every method
3. Register the class + methods in `flow_graph.json`
4. Leave `"active": false`

### Explicit user request ("Map feature X to ATS"):
When the user asks you to add an existing feature/flow to ATS:
1. Find all classes related to the feature using codebase search.
2. Add `ATS.trace()` to their methods.
3. Group them under a new flow (e.g., `X_FLOW`) in `.ats/flow_graph.json`.
4. Keep `"active": false` unless otherwise requested.

### Finishing any task:
- Update `"updated_at"` in `flow_graph.json`
- Add newly discovered methods/classes to the graph
- Update `"known_issues"` if relevant
- Update `"last_debugged"` if you debugged this flow

---

## Multi-Flow Classes

A class can belong to **multiple flows** at the method level:
```json
"AUTH_FLOW":    { "classes": { "UserService": ["login", "getUser"] } },
"PROFILE_FLOW": { "classes": { "UserService": ["updateProfile", "getUser"] } }
```
`UserService.getUser` logs when EITHER flow is active.

---

## ATS API Reference

```dart
// Initialize (in main.dart — do this once if not present)
import 'generated/ats/ats_generated.g.dart';

AtsGenerated.init(); // reads exactly O(1) from compiled native constraints

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
  "ats_version": "1.0.0",
  "project": "your_app",
  "updated_at": "2026-01-01T00:00:00Z",
  "flows": {}
}
```

---

## Prohibited Actions

- ❌ `print()` or `debugPrint()` — use `ATS.trace()` instead
- ❌ Removing `ATS.trace()` calls — they are permanent instrumentation
- ❌ Leaving a flow `"active": true` after finishing — always silence when done
- ❌ Skipping the flow graph at task start — always read it first
