# ATS Protocol — Developer & AI Workflow (V4)

Tài liệu này mô tả chi tiết cách ATS V4 thay đổi quy trình làm việc hàng ngày giữa bạn (Developer) và AI Agent (Claude, Cursor, Gemini).

---

## Vấn đề ATS giải quyết

**Không có ATS:**
1. App gặp lỗi.
2. Bạn bảo AI: *"Fix phần đăng nhập, xem log thử xem bị gì."*
3. AI mò 20-50 file, viết `print()` rải rác khắp nơi (~30K tokens).
4. Build lại app, xem log.
5. Sửa xong → phải dọn print(). AI quên xóa → log rác lọt vào release.
6. Hôm sau debug tiếp → AI mất context, scan lại từ đầu.

**Với ATS V4:**
1. AI gọi `ats_context("CHECKOUT_FLOW")` → nhận ngay danh sách class + edges (~200 tokens).
2. `ats activate CHECKOUT_FLOW` → structured log xuất hiện.
3. AI đọc log có sequence + depth → hiểu call chain tức thì.
4. Fix xong → `ats silence` → code sạch, không cần dọn.
5. Knowledge tích luỹ: edges, sessions, known_issues → hôm sau AI nhớ hết.

---

## Workflow Chuẩn V4

### Bước 1: Instrument — Đặt trace vào code (1 lần duy nhất)

Khi AI viết class mới hoặc chạm vào class cũ chưa có log:

```dart
class CartService {
  Future<void> checkout(Cart cart) async {
    ATS.trace('CartService', 'checkout', data: cart.toJson());
    // code checkout...
  }

  Future<void> applyVoucher(String code) async {
    ATS.trace('CartService', 'applyVoucher', data: {'code': code});
    // code voucher...
  }
}
```

AI tự map vào `.ats/flow_graph.json` (V4 format):
```json
"CHECKOUT_FLOW": {
  "description": "Giỏ hàng đến thanh toán",
  "active": false,
  "depends_on": ["PAYMENT_FLOW"],
  "classes": {
    "CartService": {
      "methods": ["checkout", "applyVoucher"],
      "last_verified": "2026-04-16"
    }
  }
}
```

> **Làm sao AI biết phải làm gì?** Tầng 1 (Rule) load tự động mỗi session — dạy AI 5 quy tắc cốt lõi trong ~500 tokens. Chi tiết hơn thì AI gọi workflow hoặc MCP tool.

---

### Bước 2: Debug — Kích hoạt flow (khi gặp bug)

Bạn phát hiện bug Checkout. Chat với AI: *"Xem giùm tao sao cái Checkout bị lỗi."*

**Cách 1 — AI dùng CLI:**
```bash
ats activate CHECKOUT_FLOW
```

**Cách 2 — AI dùng MCP Tool (nhanh hơn, ít token hơn):**
```
AI gọi: ats_context("CHECKOUT_FLOW")
→ Nhận: classes, edges, sessions, depends_on đã topo-sort

AI gọi: ats_activate("CHECKOUT_FLOW")
→ Flow bật, auto sync
```

AI phản hồi: *"Đã bật log cho CHECKOUT_FLOW. Nhấn r hoặc F5 để Hot Restart."*

---

### Bước 3: Đọc Log và Fix Bug

Bạn nhấn F5, thao tác mua hàng. Console hiện:

```
[ATS][CHECKOUT_FLOW][#001][d0] CartService.checkout | {"cart_id": "123", "total": 99}
[ATS][CHECKOUT_FLOW][#002][d1] PaymentGateway.process | {"status": "declined"}
[ATS][CHECKOUT_FLOW][#003][d1] VoucherService.validate | {"code": "SALE50", "valid": false}
```

**AI đọc pattern:**
- `#001 d0` → `#002 d1`: CartService.checkout **gọi** PaymentGateway.process
- `#001 d0` → `#003 d1`: CartService.checkout cũng **gọi** VoucherService.validate
- Payment bị declined → root cause rõ ràng

**AI tự thêm edges vừa phát hiện:**
```json
"edges": [
  { "from": "CartService.checkout", "to": "PaymentGateway.process", "type": "calls" },
  { "from": "CartService.checkout", "to": "VoucherService.validate", "type": "calls" }
]
```

→ Lần sau debug lại, AI đã biết call chain mà không cần bật log.

---

### Bước 4: Silence — Dọn dẹp (tự động)

Bug sửa xong. AI chạy:
```bash
ats silence CHECKOUT_FLOW
```

Đồng thời AI cập nhật graph:
```json
"CHECKOUT_FLOW": {
  "active": false,
  "last_debugged": "2026-04-16",
  "known_issues": [
    "PaymentGateway trả text 'declined' thay vì enum"
  ],
  "sessions": [
    {
      "date": "2026-04-16",
      "action": "debug",
      "note": "Fixed: PaymentGateway.process trả text thay vì enum, thêm parse fallback",
      "resolved": true
    }
  ]
}
```

`git commit` file JSON → developer khác (hoặc AI) vào sửa luồng này hôm sau sẽ đọc `sessions` và `known_issues` → không lặp lại công việc cũ.

---

## V4 so với V3: Workflow khác gì?

| Bước | V3 | V4 |
|---|---|---|
| Bắt đầu task | AI đọc toàn bộ flow_graph.json (~3000 tokens) | AI scan tên flow trước, đọc chi tiết flow liên quan (~500 tokens) |
| Tìm class liên quan | AI tìm trong JSON thủ công | `ats_context("FLOW")` trả context đã topo-sort |
| Debug log | `[ATS][FLOW] Class.method \| data` | `[ATS][FLOW][#SEQ][dDEPTH] Class.method \| data` |
| Hiểu call chain | AI phải đoán | AI đọc sequence + depth → biết chính xác ai gọi ai |
| Ghi nhớ | `known_issues` | `known_issues` + `sessions` + `edges` |
| Lần sau | AI đọc lại graph | AI đọc graph + biết edges → bỏ qua bước bật log |
| Phát hiện drift | Không có | `needs_verify`, `last_verified`, `ats_validate` |

---

## Cơ chế CodeGen (V3+)

ATS không bundle JSON vào APK. Thay vào đó:

1. `ats sync` biên dịch `flow_graph.json` → `ats_generated.g.dart` (một `const Map` thuần Dart).
2. `AtsGenerated.init()` load map vào memory ở thời điểm khởi tạo.
3. `ATS.trace()` tra cứu O(1) — nếu method không active → return ngay (no-op).
4. Hot Restart load lại file `.dart` mới → log thay đổi tức thì.

**Zero overhead trong production:** `ATS.trace()` check `kReleaseMode` đầu tiên → return ngay trong release build.

---

## 3-Layer AI System

```
┌──────────────────────────────────────────┐
│  Layer 1: RULE (luôn load, ~500 tokens)  │
│  5 quy tắc cốt lõi                       │
│  → AI biết: dùng trace, đọc graph       │
├──────────────────────────────────────────┤
│  Layer 2: WORKFLOW (gọi khi cần)         │
│  /ats-debug    → 8 bước debug flow      │
│  /ats-instrument → 7 bước instrument    │
│  /ats-review   → 6 bước fix drift       │
├──────────────────────────────────────────┤
│  Layer 3: MCP SERVER (0 AI tokens)       │
│  ats_context  → context đã topo-sort    │
│  ats_validate → phát hiện graph lỗi     │
│  ats_impact   → blast radius analysis   │
└──────────────────────────────────────────┘
```

**Phối hợp:**
- Mọi session → Layer 1 nhắc AI làm đúng
- Khi debug → Layer 2 (`/ats-debug`) hoặc Layer 3 (`ats_context` + `ats_activate`)
- Khi nghi ngờ graph cũ → Layer 2 (`/ats-review`) hoặc Layer 3 (`ats_validate`)

---

## Tổng kết

| Bạn làm gì | AI làm gì |
|---|---|
| Nhấn F5 chạy app | AI thêm `ATS.trace()` mỗi khi viết/sửa code |
| Báo bug | AI bật flow, đọc log, fix bug, tắt flow |
| Commit code | Graph (JSON) cũng được commit → knowledge lưu vĩnh viễn |
| Không làm gì | AI tự thêm edges, session notes, known_issues |

Code luôn sạch. Log luôn có sẵn. AI ngày càng hiểu project hơn.
