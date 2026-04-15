# Hướng dẫn Nâng cấp ATS Protocol (V2 lên V3 CodeGen)

Phiên bản V3 của ATS sử dụng kiến trúc **Tự sinh mã (CodeGen - O(1))**, giúp lập trình viên không cần thiết lập bất kỳ cấu hình rườm rà nào trên IDE như `--dart-define` ở bản cũ.

Nếu Project Flutter của bạn được tích hợp từ thời còn xài V2, hãy làm đúng 4 bước cực nhanh sau đây để dọn dẹp đồ cổ và tận hưởng môi trường 0-Config của V3:

---

## Bước 1: Quét sạch tàn tích config cũ của V2

Trước đây để chạy ATS, bạn từng phải cài `preLaunchTask` và `args` vào file hệ thống. Việc đầu tiên là đi dọn những thứ dư thừa này:

1. **Xóa file `tasks.json`:** Xoá tệp `.vscode/tasks.json` (nếu có đoạn script `ats_sync`).
2. **Dọn sạch `launch.json`:** Mở `.vscode/launch.json` và vứt bỏ những dòng sau ra khỏi config chạy app:
   - Xoá `"preLaunchTask": "ats_sync"`
   - Xoá `"--dart-define-from-file=.ats/dart_defines.json"` ra khỏi danh sách `args`. (Xoá luôn mảng `args` nếu nó trống).
3. **Android Studio:** Vào **Run/Debug Configurations** -> Tìm trường **Additional run args** -> Xoá bỏ sạch đoạn chữ `--dart-define` ở đó.
4. Xoá file rác `dart_defines.json` nằm trong thư mục `.ats/` của bạn (V3 đéo cần gọi nó nữa).

## Bước 2: Sinh lại File Cấu Hình V3 (ats.yaml)

Tại thư mục gốc của project, hít một hơi rồi gõ lệnh:
```bash
ats init
```

Lệnh này sẽ rà soát lại project của bạn và tự động văng ra một tệp `ats.yaml` ngang hàng với `pubspec.yaml` cùng với việc tạo tệp Compile mới nhất là `lib/generated/ats/ats_generated.g.dart`.

## Bước 3: Cập nhật hàm gọi `main.dart`

**Mở file `lib/main.dart` lên và sửa như sau:**

❌ **CODE V2 CŨ:**
```dart
import 'package:ats_flutter/ats_flutter.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ATS.init(); // <- XOÁ DÒNG NÀY (Hàm bị cảnh báo Deprecated)
  runApp(MyApp());
}
```

✅ **CODE V3 MỚI:**
```dart
import 'package:ats_flutter/ats_flutter.dart';
import 'generated/ats/ats_generated.g.dart'; // <- IMPORT FILE MỚI NÀY

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  AtsGenerated.init(); // <- GỌI HÀM NÀY, TỐC ĐỘ O(1) NGUYÊN BẢN
  runApp(MyApp());
}
```

## Bước 4: Tận hưởng đặc quyền Hot Restart V3
Xong! Từ nay mỗi khi bạn muốn quan sát log sau lưng (thay đổi giá trị qua lệnh `ats activate FLOW_NAME`). Kịch bản cũ bạn phải tắt hẳn app và F5 chạy lại từ đầu khá cực hình. Ở bản V3 này: Dù bạn xài IDE, Device Thật, iOS hay Android, cứ bấm phím **r** ở Terminal hoặc bấm nút **Hot Restart** trên góc IDE. Chớp mắt 1 nhịp là luồng log của bạn sẽ tự bật! Lập trình vui vẻ!
