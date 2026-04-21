Những thay đổi "đắt giá" để tối ưu:
global_observables: Gom các hàm "xương sống" (như loadData) vào đây. Hệ thống sẽ tự động trace chúng mà bạn không cần khai báo lại trong từng flow.
priority: Thêm mức độ ưu tiên. Khi App chạy chậm hoặc trên Production, bạn có thể cấu hình chỉ log những flow HIGH.
Rút gọn classes: Thay vì viết object phức tạp cho mọi class, nếu class đó không có method nào bị muted, bạn chỉ cần truyền một Array tên method cho gọn.
watch_logic & strategy: Thay vì viết note bằng chữ, bạn đưa vào các key mang tính "điều khiển". Ví dụ: VERBOSE_ON_INIT sẽ báo cho hệ thống trace biết: "Nếu là lần đầu mở page, hãy in log thật chi tiết".
//: Dùng một key giả làm comment để giải thích ý đồ cấu trúc cho đồng nghiệp.
Với cấu trúc này, khi bạn thêm một biểu đồ mới, bạn chỉ cần tạo flow mới và liệt kê các class đặc thù của biểu đồ đó, các phần dùng chung đã có global lo.


"DRILL_DOWN_FLOW": {
  "description": "...",
  "state_impact": ["drillState", "visualParams", "loadTrigger"], // Những state bị ảnh hưởng
  "steps": [ // Thay thế edges phẳng bằng các bước có thứ tự
    {
      "id": "step1",
      "from": "BaseChartState.onChartPointTap",
      "to": "BaseChartState.onDrillDown",
      "trigger": "user_tap",
      "condition": "drillDownEnabled && canDrillDown",
      "state_change": "None"
    },
    {
      "id": "step2",
      "from": "BaseChartState.onDrillDown",
      "to": "VisualBloc._onDrillDown",
      "trigger": "emit_event",
      "state_change": "updates drillState"
    }
  ]
}
