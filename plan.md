# ATS Protocol — Implementation Plan

> **Mục tiêu:** Flutter SDK + AI Skill → Universal (TypeScript/Python)
> **Updated:** 2026-04-15

---

## 🎯 Tóm tắt design đã thống nhất

ATS gồm 3 thành phần:

1. **`ATS.trace()`** — AI inject vào method **một lần duy nhất** khi viết class lần đầu. Sau đó không đụng vào nữa.
2. **`flow_graph.json`** — Bộ não. AI chỉ edit file này để bật/tắt log (đổi `active` flag). Không đụng vào code.
3. **`SKILL.md`** — Hướng dẫn workflow chuẩn cho AI agent. Đây là thành phần quan trọng nhất.

**Nguyên tắc cốt lõi:**
- Một class có thể thuộc **nhiều flows** (mapping ở method level)
- Bật/tắt log = **chỉ edit JSON**, không edit code
- `ATS.trace()` là **no-op** khi flow inactive — zero overhead
- Knowledge tích lũy: graph càng đầy → AI càng thông minh

---

## 📦 Phase 1 — Flutter SDK (`ats_flutter`)

### 1.1 API

```dart
// Trong method — AI thêm một lần duy nhất
ATS.trace('ClassName', 'methodName', data: payload);

// Programmatic control (CLI hoặc AI dùng)
ATS.activate('PAYMENT_FLOW');
ATS.silence('PAYMENT_FLOW');
ATS.isActive('PAYMENT_FLOW'); // → bool
```

### 1.2 Runtime logic của `ATS.trace()`

```dart
static void trace(String className, String methodName, {dynamic data}) {
  // Đọc flow_graph.json
  // Tìm className.methodName trong flows nào
  // Nếu flow đó active → ghi log ra .ats/logs/
  // Nếu không → no-op (zero cost)
  if (kReleaseMode) return; // Không bao giờ log production
}
```

### 1.3 Schema `flow_graph.json`

```json
{
  "ats_version": "1.0.0",
  "project": "my_flutter_app",
  "updated_at": "2026-04-15T13:00:00Z",
  "flows": {
    "PAYMENT_FLOW": {
      "description": "Toàn bộ luồng thanh toán VNPAY và Stripe",
      "active": false,
      "classes": {
        "PaymentService": ["processPayment", "refund", "validateCard"],
        "CheckoutBloc": ["onCheckoutStarted", "onPaymentConfirmed"],
        "TransactionModel": ["fromJson", "toJson"]
      }
    }
  }
}
```

**Multi-flow per class** — một method có thể thuộc nhiều flows:

```json
{
  "flows": {
    "AUTH_FLOW": {
      "classes": { "UserService": ["login", "getUser"] }
    },
    "PROFILE_FLOW": {
      "classes": { "UserService": ["updateProfile", "getUser"] }
    }
  }
}
```

`UserService.getUser` xuất hiện trong cả 2 flows.
Khi `AUTH_FLOW.active = true` → `getUser` được log vì thuộc `AUTH_FLOW`.
Khi cả 2 active → `getUser` log một lần (deduplicate).

### 1.4 Log output format

File: `.ats/logs/{FLOW_NAME}/{YYYY-MM-DD}.jsonl`

```jsonl
{"ts":"2026-04-15T13:01:00Z","flow":"PAYMENT_FLOW","class":"PaymentService","method":"processPayment","data":{"amount":150000},"ms":0}
{"ts":"2026-04-15T13:01:01Z","flow":"PAYMENT_FLOW","class":"CheckoutBloc","method":"onCheckoutStarted","data":null,"ms":1}
```

**`.gitignore` mặc định:**
```
.ats/logs/
```
**Commit vào git:**
```
.ats/flow_graph.json   ← knowledge tích lũy
```

### 1.5 File structure của package

```
packages/ats_flutter/
├── lib/
│   ├── ats_flutter.dart       # Public API
│   └── src/
│       ├── ats_core.dart      # ATS.trace(), activate(), silence()
│       ├── flow_registry.dart # Đọc/ghi flow_graph.json
│       └── log_writer.dart    # Ghi JSONL log
├── example/
│   └── flutter_todo_app/      # Demo đầy đủ
└── pubspec.yaml
```

---

## 📝 Phase 2 — AI Skill (`skills/flutter/SKILL.md`)

Đây là thành phần quan trọng nhất — định nghĩa workflow chuẩn cho mọi AI agent.

### Nội dung SKILL.md

```markdown
# ATS Flutter Skill

## Khi bắt đầu bất kỳ task nào trong project Flutter có ATS:

1. Đọc `.ats/flow_graph.json`
2. Xác định class đang làm thuộc flow nào
   - Nếu class chưa có trong graph → thêm vào flow phù hợp (tạo flow mới nếu cần)
   - Một class có thể thuộc nhiều flows ở method level

## Khi debug:
3. Set `flow.active = true` trong flow_graph.json (không edit code)
4. Yêu cầu developer chạy app để collect logs
5. Đọc `.ats/logs/{FLOW_NAME}/` để phân tích

## Khi code class mới hoặc đọc class lần đầu:
6. Thêm `ATS.trace('ClassName', 'methodName', data: ...)` vào MỌI method
   - Đây là thao tác làm MỘT LẦN DUY NHẤT — không làm lại
   - Cập nhật flow_graph.json: thêm class + methods vào đúng flow

## Sau khi fix xong:
7. Set `flow.active = false` (không edit code)
8. Cập nhật flow_graph.json nếu hiểu thêm về flow

## Quy tắc tuyệt đối:
- KHÔNG bao giờ remove ATS.trace() khỏi code
- KHÔNG inject log bằng print() hay debugPrint()
- Bật/tắt = chỉ edit JSON, không đụng vào .dart files
```

---

## 🔧 Phase 3 — CLI Tools

```bash
ats status               # Hiện active flows + log count hôm nay
ats activate PAYMENT_FLOW  # Set active: true
ats silence PAYMENT_FLOW   # Set active: false
ats logs PAYMENT_FLOW      # Tail logs real-time
ats graph                # In ra flow_graph.json dạng tree
```

CLI là optional wrapper cho việc edit `flow_graph.json` — AI có thể edit file JSON trực tiếp nếu không có CLI.

---

## 🌐 Phase 4 — Universal

Sau khi Flutter thành công:

```
ats-protocol/
├── spec/
│   ├── flow_graph_schema.json   # JSON Schema chuẩn, language-agnostic
│   └── protocol.md
├── skills/
│   ├── flutter/SKILL.md         # ← Phase 2
│   ├── typescript/SKILL.md      # ← Phase 4
│   └── python/SKILL.md          # ← Phase 4
└── packages/
    ├── ats_flutter/             # ← Phase 1
    ├── ats_typescript/          # ← Phase 4
    └── ats_python/              # ← Phase 4
```

**Universal = Chỉ cần thêm SKILL.md + SDK mới. Spec không đổi.**

---

## 📅 Milestones

### M1 — Flutter SDK core (1-2 tuần)
- [ ] `ATS.trace()` với no-op khi inactive
- [ ] `ATS.activate()` / `ATS.silence()` 
- [ ] Flow registry đọc/ghi `flow_graph.json`
- [ ] JSONL log writer
- [ ] kReleaseMode guard
- [ ] Example Flutter app

### M2 — SKILL.md (song song với M1)
- [ ] `skills/flutter/SKILL.md` — workflow đầy đủ
- [ ] Test với Cursor, Claude Desktop, Windsurf
- [ ] `skills/universal/SKILL.md`

### M3 — CLI (1 tuần)
- [ ] `ats activate/silence/status/logs`
- [ ] `dart pub global activate ats_flutter`

### M4 — Publish
- [ ] Unit tests đầy đủ
- [ ] Publish `ats_flutter` lên pub.dev
- [ ] README + example hoàn chỉnh

### M5 — Universal (sau khi Flutter stable)
- [ ] TypeScript SDK
- [ ] Python SDK
- [ ] Universal SKILL.md

---

## ⚠️ Quyết định kỹ thuật quan trọng

| Quyết định | Lựa chọn | Lý do |
|---|---|---|
| Log format | JSONL | Append-only, stream-friendly, AI-readable |
| Control mechanism | JSON file edit | AI tự edit được, git-trackable, diff-able |
| Log location | `.ats/logs/` | Gitignore, predictable path |
| Graph location | `.ats/flow_graph.json` | Commit vào git, tích lũy theo thời gian |
| Production guard | `kReleaseMode` | Safety tuyệt đối |
| MCP Server | **Không làm ở Phase 1-3** | Không cần — AI edit JSON trực tiếp được |
| build_runner | **Không dùng** | Không thể inject vào method, thêm complexity |
| Annotation | Chỉ dùng làm metadata | Không thay thế được việc inject log |
