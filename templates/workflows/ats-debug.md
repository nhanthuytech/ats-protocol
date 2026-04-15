---
description: Debug a business logic flow using ATS structured logging
---

# /ats-debug — Debug a Flow

// turbo-all

## Steps

### 1. Identify the flow
Read `.ats/flow_graph.json`. Find the flow related to the bug.
Check `depends_on` to understand upstream dependencies.
Read `sessions` for past debug history — avoid repeating work.

### 2. Activate logging
```bash
ats activate FLOW_NAME
```

### 3. Hot Restart the app
Tell user to press `r` (terminal) or `F5` (IDE).
ATS logs will now appear in console.

### 4. Read structured logs
Log format: `[ATS][FLOW_NAME][#SEQ][dDEPTH] Class.method | {data}`

- `#NNN` — execution order (follow the sequence)
- `dN` — call depth (d0 = top-level, d1 = called by d0, d2 = called by d1)

### 5. Discover edges from log patterns
When `#005 d1` is immediately followed by `#006 d2`:
→ method at #005 **called** method at #006.

Add discovered call chains to `"edges"` in flow_graph.json:
```json
"edges": [
  { "from": "Class1.method1", "to": "Class2.method2", "type": "calls" }
]
```
Edge types: `calls`, `delegates`, `emits`, `navigates`.
Only add edges you have **actually observed** in logs.

### 6. Fix the bug
Use the structured logs + edges to understand the execution path.
If the bug involves an upstream flow (from `depends_on`), consider activating that flow too.

### 7. Silence and record
```bash
ats silence FLOW_NAME
```

Update the flow in `flow_graph.json`:
```json
{
  "last_debugged": "YYYY-MM-DD",
  "known_issues": ["description of any remaining issues"],
  "sessions": [
    { "date": "YYYY-MM-DD", "action": "debug", "note": "what you fixed and why", "resolved": true }
  ]
}
```
Keep max 5 sessions per flow. Remove oldest if adding 6th.

### 8. Sync if you edited JSON manually
```bash
ats sync
```
