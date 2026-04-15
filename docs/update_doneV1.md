# Kế hoạch Nâng cấp Kiến trúc ATS (Inverted Index Compile & Sync V2)

Mục tiêu cốt lõi: Ngừng nhồi file `flow_graph.json` vào bộ nhớ App Flutter tại Runtime. Dùng CLI đóng vai trò như compiler để vắt ra chuỗi "Mapping String" siêu nhẹ nhúng vào `--dart-define`.

## Các thay đổi dự kiến

### 1. `packages/ats_flutter/lib/src/cli/runner.dart` (Phần Lõi CLI)
- **Cập nhật `_generateDartDefines()`**: Thay vì nén nguyên cục JSON quăng vào `ATS_FLOW_GRAPH`, logic mới sẽ duyệt qua file Json. Nó **chỉ tìm các Flow đang `active = true`**, bóc tách từng Method và gộp thành một chuỗi `ATS_METHOD_MAP`.
  - Format output: `Class.method=FLOW_A,FLOW_B|Class.method2=FLOW_A`
- **Bổ sung lệnh `ats sync` (hoặc `ats build`)**: Lệnh này đơn giản là manual trigger gọi lại hàm `_generateDartDefines()` để force update file `.ats/dart_defines.json`.
- **Cập nhật lệnh `ats init`**:
  - Ghi đè `.vscode/launch.json` để nhét thuộc tính bắt buộc `"preLaunchTask": "ats_sync"`.
  - Tự động sinh thêm file `.vscode/tasks.json` để khai báo cái task ngầm `ats sync` kia cho VSCode tự động kích hoạt.

### 2. `packages/ats_flutter/lib/src/flow_registry.dart` (Phần Lõi Runtime App)
- **Xóa sổ JSON Parsing**: Xoá hoàn toàn lệnh `jsonDecode` khỏi runtime của Flutter build. App không còn hiểu cấu trúc gốc của `flow_graph.json` nữa.
- **Thêm logic O(1) Parser**: Đọc biến môi trường `String.fromEnvironment('ATS_METHOD_MAP')`, hàm `.split('|')` siêu mỏng nhẹ, rồi ném vào cái `Map<String, List<String>> _activeMethodsMap`.
- Trạng thái fallback `dart:io` (Khi chạy macOS Desktop / Windows): Thay vì nhảy đi parse `flow_graph.json`, nó sẽ đi parse `.ats/dart_defines.json` do CLI sinh ra để đọc lấy cái chuỗi cấu hình.

### 3. `packages/ats_flutter/lib/src/ats_core.dart`
- Tối giản hàm `ATS.trace()`. Vì `_registry` đã lọc từ Compile-time là **chỉ nạp những Flow đang active**, nên không cần hàm `isActive(...)` check tại thời điểm Run-time nữa.
  - Logic mới: `if (_activeMethodsMap.containsKey(key)) { for(var flow in flows) { in ra } }`
- Tối giản hàm `ATS.status` và các hàm introspect vì bộ nhớ giờ bị "mù" description, nó chỉ biết Method nào map với luồng nào.

### 4. Cập nhật Documentation (`setup.md` & `SKILL.md`)
- Hướng dẫn Developer (và AI) biết về vai trò của lệnh `ats sync` cũng như setup của VSCode Tasks.

---

## Ý kiến/Review (Cần xác nhận)
Mày verify coi logic `ats sync` bằng `tasks.json` và `preLaunchTask` cho VSCode này đã đủ mượt cho anh em dev nhà mày chưa? Nếu ổn tao sẽ quất luôn.
