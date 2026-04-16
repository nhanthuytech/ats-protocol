# ATS Flutter — Setup Guide (V4)

Hướng dẫn tích hợp ATS V4 vào một Flutter project hiện có.

> **Nâng cấp?** Nếu bạn đang dùng V2 hoặc V3, xem [Hướng dẫn Migration](migration_v2_to_v3.md).

---

## 1. Thêm dependency

```yaml
# pubspec.yaml
dependencies:
  ats_flutter:
    path: /Users/MAC/Documents/Project/ats-protocol/packages/ats_flutter
    # Sau khi publish pub.dev:
    # ats_flutter: ^0.1.0
```

```bash
flutter pub get
```

> **Không cần thêm gì vào `flutter.assets`.**
> File cấu hình ATS **không** được bundle vào APK/IPA.

---

## 2. Cài đặt ATS CLI (Global)

```bash
dart pub global activate -s path /Users/MAC/Documents/Project/ats-protocol/packages/ats_flutter
# Sau khi publish lên pub.dev:
# dart pub global activate ats_flutter
```

---

## 3. Khởi tạo ATS trong project

```bash
cd /path/to/your/flutter/project
ats init
```

Lệnh này tự động tạo:

| File | Mô tả |
|---|---|
| `.ats/flow_graph.json` | Knowledge graph — bộ não của project |
| `ats.yaml` | Config thư mục (tùy biến được) |
| `lib/generated/ats/ats_generated.g.dart` | Compiled Dart Map (O(1) lookup) |

---

## 3b. Tùy biến đường dẫn (Tùy chọn)

Chỉnh `ats.yaml` (ngang hàng với `pubspec.yaml`):

```yaml
ats-dir: .ats                             # Nơi chứa flow_graph.json
output-dir: lib/generated/ats             # Thư mục sinh code
output-ats-file: ats_generated.g.dart     # Tên file code
```

Nếu không có `ats.yaml`, ATS dùng giá trị mặc định.

---

## 4. Cập nhật `main.dart`

```dart
import 'package:ats_flutter/ats_flutter.dart';
import 'generated/ats/ats_generated.g.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  AtsGenerated.init(); // O(1), gọi một lần duy nhất
  runApp(const MyApp());
}
```

---

## 5. Install AI Agent System

ATS V4 có 3 tầng: **Rule** (nhẹ, luôn load) + **Workflow** (gọi khi cần) + **MCP Server** (optional).

### Tầng 1+2: Rule + Workflow

```bash
ats skill install              # Tự detect AI agent, cài rule + workflow
```

Lệnh này cài:
- **Claude:** Append ATS rules vào `CLAUDE.md`, copy workflows vào `.agents/workflows/`
- **Gemini:** Copy skill vào `.gemini/skills/ats-flutter/`, copy workflows
- **Cursor:** Copy rule file vào `.cursor/rules/`

### Tầng 3: MCP Server (Optional — tiết kiệm 93% tokens)

```bash
# Chạy MCP server
dart run /path/to/ats-protocol/packages/ats_mcp_server/bin/server.dart .
```

Cấu hình trong IDE:

**Claude Code** (`.claude/mcp.json`):
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

**Cursor** (`.cursor/mcp.json`):
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

MCP Server cung cấp 6 tools:

| Tool | Mô tả |
|---|---|
| `ats_context` | Trả context flow đã topo-sort (thay thế đọc JSON) |
| `ats_activate` | Bật logging cho flow (auto sync) |
| `ats_silence` | Tắt logging cho flow (auto sync) |
| `ats_validate` | Phát hiện cycles, stale methods, invalid edges |
| `ats_impact` | Phân tích blast radius khi sửa method |
| `ats_graph` | Export DAG dạng Mermaid |

---

## 6. Chạy App

Kiến trúc CodeGen không yêu cầu config IDE đặc biệt.

1. Nhấn **Run/Play** bình thường (VS Code / Android Studio / Terminal).
2. Khi AI (hoặc bạn) dùng `ats activate` / `ats silence`, file `ats_generated.g.dart` tự cập nhật.
3. Nhấn **Hot Restart** (`r` hoặc `F5`) để load config mới.

```bash
flutter run
# Hoặc:
ats run
```

---

## 7. Sử dụng hàng ngày

### Bật/tắt debug flow:
```bash
ats activate PAYMENT_FLOW    # Bật log → Hot Restart → xem console
ats silence PAYMENT_FLOW     # Tắt log → xong, code sạch
```

### Sửa JSON thủ công → compile:
```bash
ats sync
```

### Xem tất cả flows:
```bash
ats flows
```

### Export DAG diagram:
```bash
ats graph                       # In ra terminal
ats graph --methods             # Bao gồm method-level edges
ats graph --output dag.md       # Ghi ra file
```

### Log console output (V4):
```
[ATS] Registry initialized via CodeGen.
[ATS] Active flows: [PAYMENT_FLOW]
[ATS][PAYMENT_FLOW][#001][d0] PaymentService.processPayment | {amount: 150000, currency: VND}
[ATS][PAYMENT_FLOW][#002][d1] StripeGateway.charge | {intent: pi_xxx}
[ATS][PAYMENT_FLOW][#003][d0] CheckoutBloc.onPaymentConfirmed | {txId: tx_12345}
```

- `[#NNN]` — Thứ tự thực thi (execution sequence)
- `[dN]` — Độ sâu gọi (d0 = top-level, d1 = được gọi bởi d0)

---

## 8. Thêm ATS.trace() vào code

AI agent sẽ tự làm bước này. Nếu muốn thêm thủ công:

```dart
class PaymentService {
  Future<String> processPayment(PaymentRequest req) async {
    ATS.trace('PaymentService', 'processPayment', data: req.toJson());
    // ... code cũ
  }

  Future<bool> refund(String txId) async {
    ATS.trace('PaymentService', 'refund', data: {'txId': txId});
    // ... code cũ
  }
}
```

Sau đó cập nhật `.ats/flow_graph.json` (V4 format):

```json
{
  "ats_version": "4.0.0",
  "project": "your_app",
  "updated_at": "2026-04-16T00:00:00Z",
  "flows": {
    "PAYMENT_FLOW": {
      "description": "Checkout và payment lifecycle",
      "active": false,
      "depends_on": ["AUTH_FLOW"],
      "classes": {
        "PaymentService": {
          "methods": ["processPayment", "refund"],
          "last_verified": "2026-04-16"
        }
      }
    }
  },
  "edges": []
}
```

> **V3 format vẫn hoạt động:** `"PaymentService": ["processPayment", "refund"]` — backward compatible.

---

## 9. .gitignore

```gitignore
# ATS logs (không commit)
.ats/logs/

# .ats/flow_graph.json KHÔNG ignore — đây là knowledge base, PHẢI commit
```

---

## 10. Tóm tắt

| Bước | Lệnh |
|---|---|
| Cài dependency | `pubspec.yaml` + `flutter pub get` |
| Cài CLI | `dart pub global activate -s path ...` |
| Khởi tạo | `ats init` |
| Thêm vào main | `AtsGenerated.init()` |
| Cài AI agent | `ats skill install` |
| MCP Server (optional) | `dart run .../server.dart .` |
| Chạy app | Nhấn F5 hoặc `ats run` |
| Bật debug | `ats activate <FLOW>` |
| Tắt debug | `ats silence <FLOW>` |
| Export DAG | `ats graph` |

> **Production:** `AtsGenerated.init()` và `ATS.trace()` là **complete no-op** trong release builds.
> Zero bytes thêm vào APK, zero runtime overhead.
