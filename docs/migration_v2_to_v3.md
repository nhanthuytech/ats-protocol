# Hướng dẫn Nâng cấp ATS Protocol — V2 lên V3 (CodeGen)

Phiên bản V3 sử dụng kiến trúc **CodeGen O(1)**, không cần `--dart-define` hay config IDE.

> **Đang dùng V3 muốn lên V4?** Xem [migration_v3_to_v4.md](migration_v3_to_v4.md).

---

## Bước 1: Dọn sạch config cũ V2

1. **Xóa `.vscode/tasks.json`:** (nếu có đoạn script `ats_sync`).
2. **Dọn `launch.json`:**
   - Xoá `"preLaunchTask": "ats_sync"`
   - Xoá `"--dart-define-from-file=.ats/dart_defines.json"` ra khỏi `args`.
3. **Android Studio:** Vào **Run/Debug Configurations** → xoá `--dart-define` khỏi additional args.
4. **Xoá file:** `.ats/dart_defines.json` (V3 không dùng nữa).

## Bước 2: Sinh lại config V3

```bash
ats init
```

Tự tạo `ats.yaml` + `lib/generated/ats/ats_generated.g.dart`.

## Bước 3: Sửa `main.dart`

❌ **V2 cũ:**
```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ATS.init(); // ← XOÁ
  runApp(MyApp());
}
```

✅ **V3 mới:**
```dart
import 'package:ats_flutter/ats_flutter.dart';
import 'generated/ats/ats_generated.g.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  AtsGenerated.init(); // ← O(1), không cần await
  runApp(MyApp());
}
```

## Bước 4: Hot Restart

Nhấn `r` (terminal) hoặc `F5` (IDE). Xong!

---

> **Tiếp theo:** Nếu muốn nâng lên V4 (DAG + MCP Server), xem [migration_v3_to_v4.md](migration_v3_to_v4.md).
