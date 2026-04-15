# ATS Flutter — Setup Guide

Hướng dẫn tích hợp ATS vào một Flutter project hiện có.

⚠️ **Lưu ý:** Nếu hệ thống của bạn đang chạy phiên bản cũ (V2) và muốn nâng cấp lên V3 CodeGen 0-Config, vui lòng xem [Hướng dẫn Migration từ V2 lên V3](migration_v2_to_v3.md) trước khi đọc tiếp!

---

## 1. Thêm dependency

Trong `pubspec.yaml` của project:

```yaml
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

## 2. Cài đặt ATS CLI toàn cục (Global)

Để không phải gõ đường dẫn dài dòng, hãy cài command `ats` vào máy của bạn:

```bash
dart pub global activate -s path /Users/MAC/Documents/Project/ats-protocol/packages/ats_flutter
# Sau khi publish lên pub.dev, lệnh sẽ ngắn gọn là:
# dart pub global activate ats_flutter
```

## 3. Khởi tạo ATS trong project

Vào thư mục gốc của Flutter project, gõ:

```bash
ats init
```

Lệnh này sinh ra thư mục `.ats/` chứa file cấu hình `flow_graph.json`, đồng thời tự động tạo file `ats.yaml` mẫu và compile tệp Dart Map vào `lib/generated/ats/ats_generated.g.dart` với thời gian O(1).

---

## 3b. Tùy biến thư mục lưu đồ & đường dẫn sinh code (Tùy chọn)

Nếu bạn không thích thư mục mặc định do đặc thù riêng của dự án, bạn có thể chỉnh sửa thiết lập qua tệp `ats.yaml` vừa được lệnh `ats init` tạo nằm ngang hàng với `pubspec.yaml` (giác quan sử dụng tương tự `l10n.yaml`):

```yaml
# ATS Configuration File
ats-dir: .ats                             # Nơi chứa flow_graph.json
output-dir: lib/generated/ats             # Thư mục đích sinh code
output-ats-file: ats_generated.g.dart     # Tên file code sinh ra
```
*Ghi chú: Nếu hệ thống không tìm thấy `ats.yaml` nó sẽ luôn quay về dùng mặc định.*

---

## 4. Cập nhật `main.dart` của bạn

Bạn chỉ cần import tệp vừa sinh ra và gọi hàm init của nó (Không cần dùng `await`):

```dart
import 'generated/ats/ats_generated.g.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  
  AtsGenerated.init(); // Gọi một lần duy nhất, O(1) performance
  runApp(const MyApp());
}
```

---

## 5. Install AI skill

### Cho Antigravity (đã cài global, tự động load):
```bash
ats skill install --global
```

### Cho Claude Code:
```bash
cd /path/to/your/flutter/project
ats skill claude
```

---

## 6. Chạy app (0-Config)

Kiến trúc CodeGen của ATS V3 không yêu cầu bất kỳ thiết lập Môi Trường Cục Bộ/IDE nào.

1. Bất kể bạn xài **VS Code** hay **Android Studio**, cứ bấm Run/Play như một App bình thường. Không cần thêm `--dart-define` arg!
2. Mỗi khi AI (hoặc bạn) dùng lệnh `ats activate / ats silence` để thay đổi luồng log, file `lib/generated/ats/ats_generated.g.dart` sẽ lập tức được cập nhật.
3. Nếu bạn đang chạy App, hãy bấm **Hot Restart (F5 hoặc `r`)**. Flutter sẽ tự tải lại Native Dart File mà không cần build lại bất kì C++ core nào!

### Cho Terminal CLI nhanh:
```bash
flutter run
# Hoặc lệnh ats wrapper (Không có sự khác biệt về logic)
ats run
```

---

## 7. Cách dùng hàng ngày

Cốt lõi của kiến trúc ATS V3 là lệnh **`ats sync`**. Nó giúp đồng bộ thay đổi từ `.ats/flow_graph.json` nén thành file mã nguồn `.dart`.

### Compile config sau khi nhúng tay sửa file JSON:
Nếu bạn sửa tệp `flow_graph.json` thủ công, hãy chạy lệnh này để biên dịch nó thành Mapping String (hoặc đơn giản là nhấn F5 nếu dùng VS Code):
```bash
ats sync
```

### Quản lý nóng bằng các lệnh CLI (Tự động sync phía sau):
Bật luồng (Lệnh này sẽ bật trạng thái trong JSON và lập tức tự chạy `ats sync` đẻ code cho bạn):
```bash
ats activate PAYMENT_FLOW
```

Tắt luồng:
```bash
ats silence PAYMENT_FLOW
```

Xem trạng thái luồng:
```bash
ats status
```



### Log console output:
```
[ATS] 3 flows loaded. Active: [PAYMENT_FLOW]
[ATS][PAYMENT_FLOW] PaymentService.processPayment | {amount: 150000, currency: VND}
[ATS][PAYMENT_FLOW] CheckoutBloc.onPaymentConfirmed | {txId: tx_12345}
```

---

## 8. Thêm ATS.trace() vào code

AI agent (Antigravity/Claude) sẽ tự làm bước này khi chỉnh sửa code.  
Nếu muốn tự thêm thủ công:

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

Sau đó cập nhật `.ats/flow_graph.json`:

```json
{
  "ats_version": "1.0.0",
  "project": "your_app",
  "updated_at": "2026-04-15T00:00:00Z",
  "flows": {
    "PAYMENT_FLOW": {
      "description": "Checkout và payment lifecycle",
      "active": false,
      "classes": {
        "PaymentService": ["processPayment", "refund"]
      }
    }
  }
}
```

---

## 9. .gitignore

Thêm vào `.gitignore` của project:

```gitignore
# ATS local configuration (không commit)
.ats/dart_defines.json
.ats/logs/

# .ats/flow_graph.json KHÔNG ignore — đây là knowledge base, cần commit
```

---

## 10. Tóm tắt

| Bước | Lệnh |
|---|---|
| Cài dependency | `pubspec.yaml` + `flutter pub get` |
| Khởi tạo | `ats init` |
| Thêm vào main | `await ATS.init()` |
| Cài skill AI | `ats skill install --global` + `ats skill claude` |
| Chạy app | Nhấn F5 (VSCode) hoặc `ats run` |
| Bật debug | `ats activate <FLOW>` |
| Tắt debug | `ats silence <FLOW>` |

> **Production:** `ATS.init()` và `ATS.trace()` là **complete no-op** trong release builds.  
> Zero bytes thêm vào APK, zero runtime overhead.
