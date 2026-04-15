# ATS Protocol — Upgrade Ideas 🚀

Tài liệu này lưu trữ các ý tưởng nâng cấp hệ thống (Feature Roadmap) & thuật toán (Algorithmic Optimizations) để sau này review và thực thi.

---

## 1. Tối ưu Runtime & Cấu trúc File JSON

### 1.1. Inverted Index Compile-Time (CLI Biên dịch JSON)
- **Vấn đề:** Bắt App Flutter parse file JSON khổng lồ ở Runtime chỉ để tìm biến `active` là tiêu tốn Memory/CPU vô ích.
- **Giải pháp:** Đẩy cục nợ này cho CLI. Khi thao tác CLI (`ats activate` hoặc `ats build/sync`), CLI tự parse `flow_graph.json` và vắt ra một chuỗi "Mapping String" siêu nhẹ:
  `PageBloc._onLoadPage:PIVOT_FLOW|CartBloc.checkout:PAYMENT_FLOW`
- Môi trường App (`ATS.init()`) chỉ nhận đúng cái chuỗi String này qua `--dart-define` và chẻ nó ra `O(1)`, hoàn toàn ly khai khỏi JSON parser.

### 1.2. Chống lệch pha trạng thái (Desync) bằng `preLaunchTask`
- **Vấn đề:** Nếu Dev sửa file json bằng tay (`"active": true`) mà quên chạy CLI generate ra Mapping String, app sẽ tịt log vì chuỗi dart-define cũ.
- **Giải pháp:** 
  1. Bổ sung lệnh `ats sync` (hoặc `ats build`) để compile lại file dart_defines.
  2. Bổ sung `"preLaunchTask": "ats_sync"` vào file `.vscode/launch.json`. Bằng cách này, mỗi lần thằng Dev nhấn nút F5, VSCode sẽ ngầm chạy `ats sync` đằng sau lưng trong nửa giây trước khi gọi trình biên dịch Flutter. Cấu trúc Mapping String sẽ luôn được Compile mới nhất 100% không bao giờ gặp lỗi lệch pha.

### 1.3. Pattern Matching / Wildcards (`*`)
- **Vấn đề:** Phải nhập thủ công danh sách 100 hàm của một Repo/Service, làm file JSON bị phình.
- **Giải pháp:** Hỗ trợ Regex / Asterisk:
  ```json
  "classes": {
    "AuthRepository": ["*"],
    "CheckoutBloc": ["onPayment*", "submit*"]
  }
  ```
- **Kết quả:** Giảm 80% kích thước JSON, AI đỡ phải liệt kê lắt nhắt.

### 1.3. Directed Acyclic Graph (DAG) cho Logic Flow
- **Giải pháp:** Bổ sung thuộc tính `edges` để định hình luồng chay của dữ liệu.
  ```json
  "edges": [
    "PageBloc._onLoadPage -> VisualBloc._loadData"
  ]
  ```
- **Kết quả:** Biến `flow_graph.json` thành "Tài liệu Sống". Có thể dễ dàng dùng tool export ra `Mermaid Diagram` để mô phỏng Kiến trúc Hệ thống một cách trực quan bằng Hình ảnh (Flowcharts).

---

## 2. Nâng cấp Developer Experience (UX/DX)

### 2.1. In-App Log Viewer (AtsOverlayWidget)
- **Tính năng:** Cung cấp 1 widget tích hợp thẳng vòng ngoài Material App. Tester/Developer chỉ việc "Lắc màn hình điện thoại" (Shake) là sẽ popup lên một cái Terminal Layer overlay đè lên App UI.
- **Công dụng:** Mlem cho dân QA, Tester khi test feature hoặc bắt bug realtime ngay trên ĐT thật mà không cắm cáp IDE. Có cả nút Pause/Play luồng.

### 2.2. ATS Remote Sinks (Đẩy log lên hệ thống cảnh báo)
- **Tính năng:** Cho phép cấu hình `Sinks`:
  ```dart
  await ATS.init(sinks: [
     ConsoleSink(),
     FileSink(),
     SentrySink(),
  ]);
  ```
- **Công dụng:** Biến trace của ATS thành Breadcrumbs gửi lên Sentry, Datadog hay Crashlytics khi app xảy ra Fatal Exception. (Production-ready).

### 2.3. Hỗ trợ Flutter Web (Fallback IO)
- **Tính năng:** Bypass thằng `dart:io` `File` do Web không hỗ trợ. Fallback hệ thống file cục bộ bằng `window.console` (JS) hoặc `IndexedDB/SharedPrefs`. Tránh throw Error trên nền tảng Web.

### 2.4. Custom Lints (ats_lints)
- **Tính năng:** Đính kèm 1 analyzer plugin `ats_lints`.
- **Công dụng:** IDE gạch chân đỏ lòm nếu Dev dám gõ `print()` trong những class đã nằm trong `flow_graph.json`. Mắng thẳng mặt *"Use ATS.trace() you fool!"*

### 2.5. VS Code Extension Native
- **Tính năng:** Extension `ATS Flutter Protocol`.
- **Công dụng:** Bấm 1 nút bật panel bên hông. View danh sách luồng bằng UI Cây (TreeView), click nút Gạt (Toggle Switch) để update JSON, khỏi phải mở Terminal lên gõ vòng vòng.
