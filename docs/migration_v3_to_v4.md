# Hướng dẫn Nâng cấp ATS Protocol — V3 lên V4 (DAG Architecture)

V4 thêm kiến trúc **DAG (Directed Acyclic Graph)** vào ATS. Flow graph giờ đây không chỉ là danh sách class/method — mà là một **bản đồ quan hệ** giữa các flow, method-level call chains, và lịch sử debug.

> **100% backward compatible.** V3 format vẫn chạy. Không bắt buộc migration ngay. AI agent sẽ tự nâng cấp dần khi làm việc.

---

## Có gì mới trong V4

| Feature | V3 | V4 |
|---|---|---|
| ats_version | `"3.0.0"` | `"4.0.0"` |
| Class format | `"Class": ["m1", "m2"]` | `"Class": { "methods": ["m1", "m2"], "last_verified": "..." }` |
| Flow dependencies | ❌ | `"depends_on": ["AUTH_FLOW"]` |
| Sub-flows | ❌ | `"parent": "PAYMENT_FLOW"` |
| Method-level edges | ❌ | `"edges": [{ "from": "A.m1", "to": "B.m2", "type": "calls" }]` |
| Debug history | `known_issues` only | `sessions` + `known_issues` |
| Staleness tracking | ❌ | `"needs_verify"`, `"last_verified"` |
| Log format | `[ATS][FLOW] Class.method` | `[ATS][FLOW][#SEQ][dDEPTH] Class.method` |
| Cycle detection | ❌ | Kahn's algorithm trong `ats sync` |
| DAG visualization | ❌ | `ats graph` (Mermaid export) |
| MCP Server | ❌ | 6 tools: context, activate, silence, validate, impact, graph |
| AI system | SKILL.md (3000 tokens) | Rule (500t) + Workflow (800t) + MCP (0t) |

---

## Migration: 6 bước

### Bước 1: Cập nhật `ats_version`

Mở `.ats/flow_graph.json`:

```diff
-  "ats_version": "3.0.0",
+  "ats_version": "4.0.0",
```

### Bước 2: Nâng class format (tuỳ chọn)

V3 (vẫn hoạt động, không cần sửa):
```json
"PaymentService": ["processPayment", "refund"]
```

V4 (khuyến nghị — thêm metadata cho AI):
```json
"PaymentService": {
  "methods": ["processPayment", "refund"],
  "last_verified": "2026-04-16"
}
```

> **Không cần sửa hết một lần.** `ats sync` chấp nhận cả hai format cùng lúc. Để AI tự chuyển dần khi nó đụng vào từng class.

### Bước 3: Thêm `depends_on` vào flow (tuỳ chọn)

Nếu flow A dùng method từ flow B → khai báo dependency:

```diff
  "CHECKOUT_FLOW": {
    "description": "Giỏ hàng đến thanh toán",
    "active": false,
+   "depends_on": ["PAYMENT_FLOW", "AUTH_FLOW"],
    "classes": { ... }
  }
```

Nếu flow là variant/implementation của flow khác → dùng `parent`:

```diff
  "STRIPE_PAYMENT": {
+   "parent": "PAYMENT_FLOW",
    "active": false,
    "classes": { ... }
  }
```

`ats sync` sẽ tự kiểm tra:
- ✅ `depends_on` references flow tồn tại
- ✅ Không có circular dependency (Kahn's algorithm)
- ⚠️ Cảnh báo nếu flow reference không tồn tại

### Bước 4: Thêm `edges` array (tuỳ chọn)

Thêm top-level `"edges"` array vào flow_graph.json:

```diff
  {
    "ats_version": "4.0.0",
    "flows": { ... },
+   "edges": []
  }
```

Bạn **không cần tự thêm edge**. AI agent sẽ tự phát hiện call chains từ log:

```
Log: [ATS][PAYMENT_FLOW][#005][d1] PaymentService.processPayment | ...
Log: [ATS][PAYMENT_FLOW][#006][d2] StripeGateway.charge | ...
```

AI thấy `#005 d1` → `#006 d2` → suy ra:
```json
"edges": [
  { "from": "PaymentService.processPayment", "to": "StripeGateway.charge", "type": "calls" }
]
```

Edge types: `calls`, `delegates`, `emits`, `navigates`.

### Bước 5: Cài AI Agent System mới

```bash
ats skill install
```

Lệnh này cài:
- **Rule nhẹ** (~500 tokens, luôn load) — thay thế SKILL.md dài 3000 tokens
- **Workflows** (`/ats-debug`, `/ats-instrument`, `/ats-review`) — load khi cần

### Bước 6: (Optional) Cài MCP Server

```bash
# Chạy MCP server
dart run /path/to/ats-protocol/packages/ats_mcp_server/bin/server.dart .
```

Cấu hình trong IDE:
```json
{
  "mcpServers": {
    "ats": {
      "command": "dart",
      "args": ["run", "/path/to/ats_mcp_server/bin/server.dart", "."]
    }
  }
}
```

MCP Server thay thế việc AI đọc file JSON. AI gọi function → nhận data đã xử lý:

| Tool | Thay thế cho |
|---|---|
| `ats_context("FLOW")` | AI đọc toàn bộ flow_graph.json |
| `ats_activate("FLOW")` | `ats activate FLOW` CLI |
| `ats_validate()` | AI kiểm tra graph thủ công |
| `ats_impact("Class.method")` | AI grep codebase tìm callers |
| `ats_graph()` | `ats graph` CLI |

---

## Sync và verify

```bash
ats sync
```

V4 sync sẽ:
- ✅ Parse cả V3 array format và V4 object format
- ✅ Validate `depends_on` (cycle detection)
- ✅ Validate `edges` (method references tồn tại)
- ✅ Gen `ats_generated.g.dart` với `ATS.resetSequence()` cho Hot Restart

---

## Ví dụ: V3 → V4 hoàn chỉnh

### V3 (trước):
```json
{
  "ats_version": "3.0.0",
  "project": "my_app",
  "updated_at": "2026-04-15T00:00:00Z",
  "flows": {
    "PAYMENT_FLOW": {
      "description": "Payment processing",
      "active": false,
      "classes": {
        "PaymentService": ["processPayment", "refund"],
        "CheckoutBloc": ["onCheckoutStarted", "onPaymentConfirmed"]
      },
      "known_issues": ["Webhook race condition"],
      "last_debugged": "2026-04-15"
    },
    "AUTH_FLOW": {
      "description": "Authentication",
      "active": false,
      "classes": {
        "AuthService": ["login", "logout"]
      }
    }
  }
}
```

### V4 (sau):
```json
{
  "ats_version": "4.0.0",
  "project": "my_app",
  "updated_at": "2026-04-16T00:00:00Z",
  "flows": {
    "PAYMENT_FLOW": {
      "description": "Payment processing",
      "active": false,
      "depends_on": ["AUTH_FLOW"],
      "classes": {
        "PaymentService": {
          "methods": ["processPayment", "refund"],
          "last_verified": "2026-04-16"
        },
        "CheckoutBloc": {
          "methods": ["onCheckoutStarted", "onPaymentConfirmed"],
          "last_verified": "2026-04-16"
        }
      },
      "known_issues": ["Webhook race condition"],
      "last_debugged": "2026-04-16",
      "sessions": [
        { "date": "2026-04-16", "action": "update", "note": "Migrated to V4 format", "resolved": true }
      ]
    },
    "AUTH_FLOW": {
      "description": "Authentication",
      "active": false,
      "classes": {
        "AuthService": {
          "methods": ["login", "logout"],
          "last_verified": "2026-04-16"
        }
      }
    }
  },
  "edges": [
    { "from": "CheckoutBloc.onPaymentConfirmed", "to": "PaymentService.processPayment", "type": "calls" }
  ]
}
```

---

## FAQ

**Q: Phải migrate hết 1 lần không?**
Không. V3 format vẫn chạy. Nâng cấp dần — AI agent tự chuyển format khi nó đụng vào từng class.

**Q: Log format cũ `[ATS][FLOW] Class.method` còn hoạt động không?**
V4 runtime tự thêm `[#SEQ][dDEPTH]` vào log. Không cần sửa code. Update `ats_flutter` package là đủ.

**Q: `ats sync` có bị lỗi với V3 format không?**
Không. `ats sync` detect format tự động:
- `"ClassName": [...]` → V3 array
- `"ClassName": { "methods": [...] }` → V4 object

**Q: MCP Server bắt buộc không?**
Không. MCP Server là optional, chỉ giúp tiết kiệm token. Rule + Workflow đã đủ để V4 hoạt động.

**Q: `edges` phải tự khai báo không?**
Không. AI tự phát hiện call chains từ log sequence + depth. `edges` tích luỹ tự nhiên qua các session debug.
