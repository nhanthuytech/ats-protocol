# ATS Protocol — Developer & AI Workflow

Tài liệu này mô tả chi tiết cách ATS thay đổi quy trình làm việc (workflow) hàng ngày giữa bạn (Developer) và công cụ AI (Claude, Cursor, Antigravity).

---

## Vấn đề ATS giải quyết

Trong quy trình truyền thống:
1. App gặp lỗi.
2. Bạn bảo AI: *"Fix phần đăng nhập, xem log thử xem bị gì."*
3. AI mò vào code, viết 1 đống `print()` hoặc `debugPrint()` rải rác khắp ứng dụng.
4. Bạn build lại app, xem log.
5. Sửa xong lỗi, bạn lại phải bảo AI: *"Xóa bớt print đi, code bẩn quá."* hoặc AI quên xóa, log rác lọt vào release.

**Với ATS Protocol:** Không còn chuyện thêm/xóa `print()`. Log được đặt vào code **1 lần duy nhất và giữ nguyên vĩnh viễn**, nhưng việc hiển thị log được bật/tắt an toàn thông qua một file JSON.

---

## Workflow Chuẩn

### Bước 1: Lúc bắt tay vào code (Instrument)

Khi AI viết một class mới hoặc chạm vào một class cũ chưa có log, quy tắc của AI là gọi lệnh `ATS.trace()` ở các hàm quan trọng.

```dart
class CartService {
  Future<void> checkout(Cart cart) async {
    // 1. AI tự động đặt dòng này vào, VÀ KHÔNG BAO GIỜ XÓA ĐI
    ATS.trace('CartService', 'checkout', data: cart.toJson());
    // code checkout...
  }
}
```

Sau đó, AI tự động map class này vào file cấu hình `.ats/flow_graph.json`:
```json
"CHECKOUT_FLOW": {
  "active": false,
  "classes": {
    "CartService": ["checkout"]
  }
}
```

> **Làm sao AI biết phải làm gì?** Bạn đã chạy lệnh `ats skill install` lúc setup. Các lệnh này cài đặt metadata (`SKILL.md` / `CLAUDE.md`) để chỉ đạo AI thực hiện chính xác các quy tắc trên mà bạn không cần phải dặn dò lại.

---

### Bước 2: Debug một tính năng (Kích hoạt)

Hôm sau, bạn phát hiện có bug ở phần Checkout.
Bạn mở IDE, Chat với AI: *"Xem giùm tao sao cái Checkout bị lỗi."*

**Thay vì sửa code để in ra log, AI tự động:**
1. Chạy ngầm lệnh CLI: `ats activate CHECKOUT_FLOW`
2. Lệnh này đổi cờ `"active": true` trong `flow_graph.json`.
3. AI phản hồi: *"Tao đã bật log cho luồng CHECKOUT. Mày nhấn F5 (biểu tượng Play) ở IDE để chạy lại app rồi thao tác mua hàng nhé."*

---

### Bước 3: Xem Log và Fix Bug (Phân tích)

Bạn bấm F5, mở màn hình app và nhấn "Mua hàng".
Bởi vì cờ active đang là True, hàm `ATS.trace()` bắt đầu phát huy tác dụng và bắn một chuỗi log tuyệt đẹp ra màn hình console:
```text
[ATS][CHECKOUT_FLOW] CartService.checkout | {"cart_id": "123", "total": 99}
[ATS][CHECKOUT_FLOW] PaymentGateway.process | {"status": "declined"}
```

AI (hoặc chính bạn) đọc log này từ console, lập tức hiểu rằng bug xuất phát từ PaymentGateway từ chối thẻ. AI sửa logic code, không cần đụng gì tới các dòng code in log.

---

### Bước 4: Dọn dẹp (Silence)

Khi bug đã được sửa xong. AI (tự động) hoặc bạn chạy lệnh:
```bash
ats silence CHECKOUT_FLOW
```

Lệnh này đổi luồng checkout thành `"active": false`. 
Code không có gì thay đổi, nhưng hàm `ATS.trace()` trở lại trạng thái ngủ đông (no-op). IDE trở nên gọn gàng, performance được bảo toàn trọn vẹn.

File `.ats/flow_graph.json` trở mượt mà cùng các dòng comment cập nhật từ AI để ghi nhớ vấn đề nó mới fix xong:

```json
"CHECKOUT_FLOW": {
  "active": false,
  "last_debugged": "2026-04-15",
  "known_issues": [
    "Payment Gateway thỉnh thoảng trả về text declined thay vì enum"
  ],
  "classes": {
    "CartService": ["checkout"]
  }
}
```

File JSON này nên được `git commit` lên repo. Lần sau nếu 1 developer khác (hoặc AI) vào sửa luồng giỏ hàng, họ đọc file này và đoán trước được vấn đề.

---

## Chi tiết Cơ chế IDE / `--dart-define`

Với môi trường Mobile, file sinh ra trên Host Computer không thể được đọc trực tiếp từ App đang chạy giả lập. Tuy nhiên, nếu bạn phải bundle file vào APK thì ứng dụng bị to lên và chậm đi trong Producton.

**Cách ATS vượt qua:**
- `ats init` đã sinh ra file cấu hình `.vscode/launch.json` cho dự án của bạn.
- Khi bạn nhấn `F5` trong VSCode, nó tự động gọi cờ `--dart-define-from-file=.ats/dart_defines.json`.
- `dart_defines.json` lưu giữ toàn bộ dữ liệu rút gọn mỗi khi `ats activate / silence` được gọi.
- Do đó, ATS load log configurations mà **zero-overhead, zero-file size penalty** trong Production.

Bạn chỉ cần tận hưởng Debug. Mọi thao tác cấu hình đều do ATS CLI và AI Code Agent cáng đáng.
