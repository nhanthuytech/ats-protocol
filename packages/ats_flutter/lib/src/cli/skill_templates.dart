// AUTO-GENERATED. DO NOT EDIT.

const kFlowGraphTemplate = '''{
  "ats_version": "1.0.0",
  "project": "{PROJECT_NAME}",
  "updated_at": "{NOW}",
  "flows": {}
}''';

const kAntigravitySkillContent = '''---
name: ats-flutter
description: ATS Protocol workflow for Flutter projects. Activates when working in a Flutter project that has `.ats/flow_graph.json`. Instructs the AI to manage business logic flows, instrument classes with ATS.trace(), and control logging via the flow graph — without manually cluttering or cleaning up log code.
---

# ATS Protocol — Flutter Skill

## What is ATS?

ATS (Agentic Telemetry Standard) is a protocol that gives you (the AI agent) structured knowledge of the project\'s business logic and control over which classes emit logs at runtime.

**Three components:**
1. `ATS.trace(\'ClassName\', \'methodName\', data: ...)` — added once per method, never removed
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
- If you\'re adding new methods to the class, add them to the graph too.

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
  ATS.trace(\'ClassName\', \'methodName\', data: <relevant_payload>);
  // ... rest of method
}
```

### Rules for `data`:
- Pass the most relevant input: request object, id, key params.
- Must be JSON-serializable (Map, String, num, bool, List, null).
- For sensitive data (passwords, tokens), pass `null` or redacted form: `{\'email\': email, \'password\': \'***\'}`.
- For complex objects, call `.toJson()` if available.

### Example:
```dart
class PaymentService {
  Future<String> processPayment(PaymentRequest req) async {
    ATS.trace(\'PaymentService\', \'processPayment\', data: req.toJson());
    // ...
  }

  Future<bool> refund(String txId) async {
    ATS.trace(\'PaymentService\', \'refund\', data: {\'txId\': txId});
    // ...
  }

  bool validateCard(String cardNumber) {
    ATS.trace(\'PaymentService\', \'validateCard\',
        data: {\'last4\': cardNumber.substring(cardNumber.length - 4)});
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
2. Update `"last_debugged"` to today\'s date.
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

If the project doesn\'t have ATS initialized yet, add to `main()`:

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
ATS.trace(\'ClassName\', \'methodName\', data: payload);

// Check state
ATS.isActive(\'PAYMENT_FLOW\');   // → bool
ATS.activeFlows;                 // → [\'PAYMENT_FLOW\']
ATS.allFlows;                    // → [\'PAYMENT_FLOW\', \'AUTH_FLOW\', ...]
ATS.summary;                     // → full debug map
ATS.logsDirPath;                 // → path to log files
```

The flow graph (`.ats/flow_graph.json`) is the single source of truth. Edit it, or use the `ats` CLI.
''';

const kClaudeSkillContent = '''# ATS Protocol — Claude Instructions

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

If the file doesn\'t exist, create it:
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
  ATS.trace(\'PaymentService\', \'processPayment\', data: req.toJson());
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
import \'generated/ats/ats_generated.g.dart\';

AtsGenerated.init(); // reads exactly O(1) from compiled native constraints

// Instrument (add to every method, permanently)
ATS.trace(\'ClassName\', \'methodName\', data: jsonSerializablePayload);

// Introspect
ATS.isActive(\'FLOW_NAME\');  // bool
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
import \'package:ats_flutter/ats_flutter.dart\';
import \'generated/ats/ats_generated.g.dart\';

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
''';
