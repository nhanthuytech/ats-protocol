---
description: Instrument an existing feature with ATS tracing
---

# /ats-instrument — Add ATS to a Feature

## Steps

### 1. Identify all classes
Search the codebase for classes central to the feature.
Example: for "payment", find `PaymentService`, `CheckoutBloc`, `CartService`, etc.

### 2. Create or find the flow
Check if a matching flow already exists in `.ats/flow_graph.json`.
If not, create one:
```json
"FEATURE_FLOW": {
  "description": "One sentence describing the business feature",
  "active": false,
  "depends_on": ["OTHER_FLOW_IF_APPLICABLE"],
  "classes": {}
}
```
Flow naming: `UPPER_SNAKE_CASE` ending with `_FLOW`, `_LIFECYCLE`, or `_WORKER`.

### 3. Instrument each class
For every class found in step 1, add `ATS.trace()` as the first line of every method:

```dart
Future<void> processPayment(PaymentRequest req) async {
  ATS.trace('PaymentService', 'processPayment', data: req.toJson());
  // ... existing code
}
```

Rules for `data` parameter:
- Pass the most relevant input: id, request object, key params.
- Sensitive data: redact → `{'password': '***'}`.
- Complex objects: use `.toJson()` if available.
- No data needed: omit the parameter.

### 4. Register in flow_graph.json
```json
"ClassName": {
  "methods": ["method1", "method2", "method3"],
  "last_verified": "YYYY-MM-DD"
}
```

### 5. Set dependencies
- Flow calls methods from other flows → `"depends_on": ["OTHER_FLOW"]`
- Flow is a variant of another → `"parent": "PARENT_FLOW"`

### 6. Sync
```bash
ats sync
```

### 7. Done
Leave `"active": false`. The flow is now instrumented and ready for future debugging.
Add a session note:
```json
{ "date": "YYYY-MM-DD", "action": "feature", "note": "Instrumented FEATURE_FLOW with N classes" }
```
