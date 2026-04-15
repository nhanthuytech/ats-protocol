# ATS Protocol — Improvement Roadmap

## Vấn đề hiện tại

SKILL.md hiện tại chứa TẤT CẢ instructions trong 1 file (~3000 tokens). AI phải đọc toàn bộ mỗi session, dù 80% nội dung chỉ cần khi debug. Điều này:

- Lãng phí tokens mỗi session (~2500 tokens thừa)
- AI dễ bỏ sót rules vì document quá dài
- Không tận dụng được format phù hợp cho từng loại công việc

## Kiến trúc mới: 3 Tầng

```
┌────────────────────────────────────────────┐
│  Tầng 1: RULE (luôn load, ~500 tokens)     │
│  "Nhắc nhở cốt lõi"                        │
│  → AI đọc mỗi session, rất nhẹ            │
├────────────────────────────────────────────┤
│  Tầng 2: WORKFLOW (gọi khi cần)            │
│  "/ats-debug", "/ats-instrument"            │
│  → AI load khi user gọi hoặc tự trigger    │
├────────────────────────────────────────────┤
│  Tầng 3: MCP TOOL (tương lai)              │
│  ats.context(), ats.instrument()            │
│  → AI gọi function, không đọc doc          │
└────────────────────────────────────────────┘
```

Mỗi tầng thay thế nhu cầu đọc document dài bằng cơ chế hiệu quả hơn.

---

## Tầng 1: Rule — Nhắc nhở cốt lõi (Luôn load)

### Mục đích
Tối thiểu 5-7 dòng mà AI phải nhớ ở MỌI session. Chỉ chứa "PHẢI làm gì" và "KHÔNG được làm gì", không giải thích chi tiết.

### Vị trí file theo từng AI agent

| Agent | File | Cách load |
|---|---|---|
| Claude | `CLAUDE.md` gốc project (append markers) | Tự động đọc khi mở project |
| Gemini | `.gemini/settings.json` hoặc custom rules | Tự động load |
| Cursor | `.cursor/rules/ats.mdc` | Tự động load khi match pattern |

### Nội dung Rule (~500 tokens)

```markdown
# ATS Protocol — Core Rules

This project uses ATS (Agentic Telemetry Standard) for structured logging.

## ALWAYS
1. Read `.ats/flow_graph.json` at task start (scan flow names first, read details for relevant flows only).
2. Add `ATS.trace('ClassName', 'methodName', data: ...)` to EVERY method when you first touch a class.
3. Verify existing `ATS.trace()` strings match actual class/method names. Fix if wrong.
4. Update flow_graph.json after each task: add new methods, set depends_on, write session note.
5. When debugging, use workflow: /ats-debug

## NEVER
- Use `print()` or `debugPrint()` for business logic — use `ATS.trace()`.
- Remove existing `ATS.trace()` calls — they are permanent.
- Leave a flow `"active": true` after finishing.
- Update flows you haven't read source code for.

## Quick format
Class in graph V4: `"ClassName": { "methods": ["m1", "m2"], "last_verified": "YYYY-MM-DD" }`
Log output: `[ATS][FLOW_NAME][#SEQ][dDEPTH] Class.method | {data}`
```

**Tại sao hiệu quả:** AI đọc 500 tokens thay vì 3000. Biết đủ để làm đúng 90% công việc. Khi cần chi tiết (debug, instrument cả feature) → gọi workflow.

---

## Tầng 2: Workflow — Quy trình từng bước (Gọi khi cần)

### Mục đích
Quy trình chi tiết, step-by-step cho các tác vụ phức tạp. Chỉ load khi AI cần hoặc user gọi.

### Vị trí file

```
my_project/
├── .agents/workflows/
│   ├── ats-debug.md         ← /ats-debug
│   ├── ats-instrument.md    ← /ats-instrument
│   └── ats-review.md        ← /ats-review
```

### Workflow 1: `/ats-debug` — Debug một flow

```markdown
---
description: Debug a business logic flow using ATS structured logging
---

## Steps

1. **Identify the flow**
   Read `.ats/flow_graph.json`, find the flow related to the bug.
   Check `depends_on` to understand upstream dependencies.

2. **Activate logging**
   ```bash
   ats activate FLOW_NAME
   ```

3. **Hot Restart the app**
   Tell user to press `r` or `F5`. ATS logs will now appear in console.

4. **Read structured logs**
   Logs format: `[ATS][FLOW_NAME][#SEQ][dDEPTH] Class.method | {data}`
   - Follow sequence numbers (#001, #002...) for execution order.
   - Follow depth (d0 → d1 → d2) to trace call chains.

5. **Discover edges from logs**
   When `#005 d1` is followed by `#006 d2` → method at #005 called method at #006.
   Add discovered edges to flow_graph.json:
   ```json
   "edges": [
     { "from": "Class1.method1", "to": "Class2.method2", "type": "calls" }
   ]
   ```

6. **Fix the bug**

7. **Silence and record**
   ```bash
   ats silence FLOW_NAME
   ```
   Add session note to the flow:
   ```json
   "sessions": [
     { "date": "YYYY-MM-DD", "action": "debug", "note": "what you fixed", "resolved": true }
   ]
   ```
   Keep max 5 sessions per flow. Remove oldest if adding 6th.

8. **Sync if you edited JSON manually**
   ```bash
   ats sync
   ```
```

### Workflow 2: `/ats-instrument` — Thêm ATS vào một feature có sẵn

```markdown
---
description: Instrument an existing feature with ATS tracing
---

## Steps

1. **Identify all classes** related to the feature.
   Search the codebase for classes central to the feature.
   Example: for "payment", find PaymentService, CheckoutBloc, CartService, etc.

2. **Create or identify the flow**
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

3. **Instrument each class**
   For every class found in step 1:
   - Add `ATS.trace('ClassName', 'methodName', data: ...)` as the first line of every method.
   - For data parameter: pass the most relevant input (id, request object, key params).
   - For sensitive data: redact (`{'password': '***'}`).
   - For complex objects: use `.toJson()` if available.

4. **Register in flow_graph.json**
   ```json
   "ClassName": {
     "methods": ["method1", "method2", "method3"],
     "last_verified": "YYYY-MM-DD"
   }
   ```

5. **Set dependencies**
   If this flow calls methods from other flows → add `"depends_on": [...]`.
   If this flow is a variant of another → add `"parent": "..."`.

6. **Run sync**
   ```bash
   ats sync
   ```

7. **Verify**
   Leave `"active": false`. The flow is now instrumented and ready for future debugging.
```

### Workflow 3: `/ats-review` — Kiểm tra và sửa graph drift

```markdown
---
description: Review and fix stale entries in the ATS flow graph
---

## Steps

1. **Scan flow_graph.json**
   For each flow you're currently working on (NOT all flows):
   - Open the source files for each class listed.
   - Compare method names in source vs in graph.

2. **Fix drift**
   - Method renamed → rename in graph (don't delete + re-add).
   - Method deleted → set `"needs_verify": true` on the class.
   - Method added → add to graph.
   - ATS.trace() string doesn't match → fix the string.

3. **Update timestamps**
   For each verified class: `"last_verified": "YYYY-MM-DD"`.

4. **Sync**
   ```bash
   ats sync
   ```
```

### Khi nào workflow được trigger

| Trigger | Workflow |
|---|---|
| User gõ `/ats-debug` | ats-debug.md |
| User nói "thêm ATS vào feature X" | ats-instrument.md |
| User nói "kiểm tra flow graph" | ats-review.md |
| AI phát hiện `needs_verify: true` hoặc `last_verified` quá cũ | ats-review.md (tự trigger) |
| AI gặp bug và cần debug | ats-debug.md (tự trigger) |

**Tại sao hiệu quả:** Workflow chỉ load khi cần (~800 tokens mỗi workflow), không phải mọi session. AI đọc step-by-step nên ít bỏ sót.

---

## Tầng 3: MCP Tool — Function Calls (Tương lai)

### Mục đích
Thay vì AI đọc document rồi tự thực hiện, AI gọi function → tool xử lý và trả kết quả. Không cần đọc bất kỳ document nào.

### Kiến trúc

```
┌──────────────┐    function call    ┌──────────────────┐
│   AI Agent   │ ──────────────────→ │  ATS MCP Server  │
│  (bất kỳ)    │ ←────────────────── │  (Dart process)  │
└──────────────┘    structured data  └────────┬─────────┘
                                              │
                                     reads/writes
                                              │
                                     ┌────────▼─────────┐
                                     │ flow_graph.json   │
                                     │ source files      │
                                     └──────────────────┘
```

### API Design

#### `ats.context` — Trả về context cho một flow
```
Input:  { "flow": "PAYMENT_FLOW", "depth": 2 }
Output: {
  "flow": "PAYMENT_FLOW",
  "description": "Core payment processing",
  "depends_on": ["AUTH_FLOW"],
  "classes": {
    "PaymentService": ["processPayment", "refund"]
  },
  "edges_in": [
    { "from": "CheckoutBloc.onPaymentConfirmed", "type": "calls" }
  ],
  "edges_out": [
    { "to": "StripeGateway.charge", "type": "delegates" }
  ],
  "recent_sessions": [
    { "date": "2026-04-15", "note": "Fixed webhook race condition" }
  ],
  "upstream_flows": {
    "AUTH_FLOW": {
      "classes": ["AuthService", "UserService"]
    }
  }
}
```

AI gọi 1 function → nhận đầy đủ context → không cần đọc JSON file, không cần topo-sort trong đầu.

#### `ats.instrument` — Tự động thêm trace vào class
```
Input:  { "file": "lib/services/payment_service.dart" }
Output: {
  "modified": true,
  "methods_instrumented": ["processPayment", "refund", "getStatus"],
  "methods_already_instrumented": ["validateCard"],
  "methods_fixed": [
    { "method": "process", "old_trace": "processPayment", "new_trace": "process" }
  ],
  "graph_updated": true
}
```

Tool tự:
1. Parse Dart AST → tìm tất cả methods
2. Thêm ATS.trace() nếu chưa có
3. Sửa trace string nếu sai
4. Cập nhật flow_graph.json
5. Trả report cho AI

#### `ats.activate` / `ats.silence`
```
Input:  { "flow": "PAYMENT_FLOW" }
Output: { "success": true, "active_flows": ["PAYMENT_FLOW"] }
```

#### `ats.validate`
```
Input:  {}
Output: {
  "cycles": [],
  "stale_methods": [
    { "class": "PaymentService", "method": "processPayment", "reason": "method not found in source" }
  ],
  "orphan_traces": [
    { "file": "lib/services/cart_service.dart", "class": "CartService", "method": "checkout", "not_in_graph": true }
  ],
  "edge_warnings": [
    { "from": "CheckoutBloc.onConfirm", "reason": "method not found" }
  ]
}
```

#### `ats.impact`
```
Input:  { "method": "PaymentService.processPayment" }
Output: {
  "callers": ["CheckoutBloc.onPaymentConfirmed"],
  "callees": ["StripeGateway.charge", "VnpayGateway.createUrl"],
  "affected_flows": ["CHECKOUT_FLOW", "STRIPE_PAYMENT", "VNPAY_PAYMENT"],
  "risk": "high"
}
```

#### `ats.graph`
```
Input:  { "format": "mermaid", "include_methods": false }
Output: { "diagram": "graph TD\n  AUTH_FLOW --> PAYMENT_FLOW\n  ..." }
```

### Tại sao MCP Tool là format mạnh nhất

| Tiêu chí | Rule/Skill | Workflow | MCP Tool |
|---|---|---|---|
| Token tiêu thụ | ~500-3000/session | ~800 khi gọi | ~100 per call |
| AI có thể làm sai | Có | Ít hơn | Không (tool validate) |
| Hỗ trợ agent nào | Phải viết riêng cho mỗi agent | Tùy agent | MỌI agent hỗ trợ MCP |
| Tự động sửa trace | Không (AI tự sửa) | Không | Có (parse AST) |
| Phát hiện graph drift | Phụ thuộc AI | Phụ thuộc AI | Tự động (source scan) |

### Tech stack cho MCP Server

```
ats-mcp-server/
├── bin/
│   └── server.dart          ← MCP JSON-RPC server
├── lib/
│   ├── tools/
│   │   ├── context.dart     ← ats.context implementation
│   │   ├── instrument.dart  ← ats.instrument (AST-based)
│   │   ├── validate.dart    ← ats.validate (drift detection)
│   │   ├── impact.dart      ← ats.impact (reverse DFS)
│   │   └── graph.dart       ← ats.graph (Mermaid export)
│   ├── core/
│   │   ├── flow_graph.dart  ← Read/write flow_graph.json
│   │   ├── dart_parser.dart ← Parse Dart files for class/method names
│   │   └── dag.dart         ← Cycle detection, topo-sort, centrality
│   └── server.dart          ← MCP protocol handler
├── pubspec.yaml
└── README.md
```

Dùng `package:analyzer` để parse Dart AST → biết chính xác class nào có method gì → so sánh với graph → phát hiện drift tự động.

---

## Lộ trình thực hiện

### Phase 1: Tách Rule + Workflow (1-2 ngày)
- Rút gọn SKILL.md / CLAUDE.md thành rule nhẹ (~500 tokens)
- Tạo 3 workflow files: ats-debug, ats-instrument, ats-review
- CLI `ats skill install` cài đúng file vào đúng vị trí

### Phase 2: CLI install cho nhiều agent (1 ngày)
- `ats skill install --claude` → append markers vào CLAUDE.md
- `ats skill install --gemini` → tạo .gemini/skills/ats-flutter/SKILL.md
- `ats skill install --cursor` → tạo .cursor/rules/ats.mdc
- `ats skill install --all` → tất cả

### Phase 3: MCP Server MVP (3-5 ngày)
- Implement ats.context + ats.activate + ats.silence
- Chạy được trên Claude Code + VS Code + Cursor

### Phase 4: MCP Server Full (1-2 tuần)
- ats.instrument (AST-based auto-instrumentation)
- ats.validate (drift detection)
- ats.impact (reverse DFS)
- Publish lên npm/pub cho dễ cài

---

## So sánh token consumption

Giả sử 1 session debug thông thường:

| Bước | Hiện tại (SKILL.md) | Rule + Workflow | MCP Tool |
|---|---|---|---|
| Load instructions | 3000 tokens | 500 tokens | 0 tokens |
| Đọc flow_graph.json | 2000 tokens | 2000 tokens | 0 (tool trả data đã filter) |
| Load debug workflow | - | 800 tokens | 0 |
| Gọi context function | - | - | 200 tokens (input + output) |
| Gọi validate function | - | - | 150 tokens |
| **Tổng overhead** | **5000 tokens** | **3300 tokens** | **350 tokens** |
| **Tiết kiệm** | baseline | 34% | **93%** |

MCP Tool tiết kiệm 93% tokens so với cách hiện tại vì AI không đọc document, chỉ gọi function và nhận data đã xử lý.
