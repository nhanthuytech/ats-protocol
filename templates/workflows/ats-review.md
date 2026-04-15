---
description: Review and fix stale entries in the ATS flow graph
---

# /ats-review — Fix Graph Drift

## Steps

### 1. Scan flow_graph.json
For each flow you're **currently working on** (NOT all flows):
- Open the source files for each class listed.
- Compare method names in source code vs in graph.

### 2. Fix drift
Apply these rules:

| Source code | Graph | Action |
|---|---|---|
| Method `process` exists | Graph says `processPayment` | **Rename** in graph: `processPayment` → `process` |
| Method deleted | Graph still lists it | Set `"needs_verify": true` on the class |
| New method exists | Not in graph | Add to graph |
| `ATS.trace()` has wrong string | — | Fix the trace string in source code |

**Key rule:** Rename > Delete. Never delete + re-add (loses edge/session history).

### 3. Update timestamps
For each verified class: set `"last_verified": "YYYY-MM-DD"`.
Remove `"needs_verify"` flag after confirming.

### 4. Check edges
For each edge in `"edges"` array:
- Verify `"from"` and `"to"` methods still exist.
- Remove edges pointing to deleted methods.
- Update edges if methods were renamed.

### 5. Sync
```bash
ats sync
```
This will also run cycle detection and edge validation automatically.

### 6. Record
Add session note:
```json
{ "date": "YYYY-MM-DD", "action": "update", "note": "Reviewed N classes, fixed M stale entries" }
```
