# ATS Protocol V6 — Scalability & Intelligence Upgrade

> **Mục tiêu:** Tối ưu `flow_graph.json` để xử lý hàng trăm flows mà không bị phình, sửa bugs ẩn, giảm token cost cho AI, và bổ sung thông tin state/trigger mà V5 còn thiếu.

---

## 📋 Phần 1: Đánh Giá Nhận Định (thing1.md & thing2.md)

### thing1.md — Các ý tưởng tối ưu

| # | Ý tưởng | Đánh giá | Giải thích |
|---|---------|----------|------------|
| 1 | **`global_observables`** — Gom hàm xương sống dùng chung | ✅ **ĐÚNG & RẤT GIÁ TRỊ** | Hiện tại nếu `DataService.loadData` xuất hiện ở 8 flows, bạn phải khai báo 8 lần. Với `global_classes`, khai báo 1 lần, tất cả flows tự nhìn thấy. Đây là tối ưu #1 cho scalability. |
| 2 | **`priority`** — Mức ưu tiên HIGH/MEDIUM/LOW | ✅ **ĐÚNG** | Khi có 30+ flows active, console bị ngập. `priority` cho phép AI chỉ activate flow `HIGH` trước, giảm noise. Production không cần vì ATS đã `return` ngay ở `kReleaseMode`. |
| 3 | **Rút gọn classes** — Array cho đơn giản, Object cho complex | ⚠️ **ĐÃ CÓ SẴN** | Schema V4 **đã hỗ trợ cả hai format**. Xem `flow_graph_schema.json` dòng 72-82: `oneOf: [array, ClassEntry]`. Code `FlowGraph.methodsFromClass()` xử lý cả hai. |
| 4 | **`watch_logic` & `strategy`** — Key điều khiển thay vì text | ⚠️ **QUÁ PHỨC TẠP** | `VERBOSE_ON_INIT` nghe hấp dẫn nhưng đưa business logic vào config. Mỗi SDK phải hiểu các key này → maintenance burden lớn. Tốt hơn: dùng `tags` đã có + `priority`. |
| 5 | **`//` comment key** — Giả comment trong JSON | ⚠️ **KHÔNG NÊN** | JSON không hỗ trợ comment. Dùng key `"//"` tạo noise trong data. Đã có `description` cho flow và có thể thêm `note` cho class. |
| 6 | **`steps`** thay thế edges phẳng | ⚠️ **Ý ĐÚNG, CÁCH SAI** | Ý muốn gom edges vào flow là đúng. Nhưng `steps` riêng → **duplicate data** vì edges cross flow boundaries. Giải pháp: giữ edges ở root nhưng thêm **index by flow**. |

### thing2.md — Hạn chế & Chiến lược

| # | Nhận định | Đánh giá | Giải thích |
|---|-----------|----------|------------|
| 1 | **Code Drift** — Code thay đổi, JSON không cập nhật | ✅ **ĐÚNG** | Có `last_verified`, `needs_verify`, `ats_validate` scan source. Nhưng chưa tự động → cần CI/CD integration. |
| 2 | **Cấu trúc phẳng edges** — Khó quản lý khi flow tăng | ✅ **ĐÚNG** | Shopify example: **62 edges** trong 1 mảng phẳng → O(n) scan mỗi lần. |
| 3 | **Thiếu thông tin State** — Chỉ biết "ai gọi ai" | ✅ **ĐÚNG** | Edges chỉ có `from → to + type`. Thiếu "state nào thay đổi" và "cái gì trigger". |
| 4 | **Nhóm Edge theo Flow** | ✅ **ĐÚNG** *(cần cân nhắc)* | Edges cross flow boundaries. Giải pháp: **giữ root edges** + computed edge index. |
| 5 | **`state_impact`** trên flow | ✅ **ĐÚNG** | Optional field, không phá backward compatibility. |
| 6 | **Trigger type** (user_tap, api_response, v.v.) | ✅ **ĐÚNG** | Thêm `trigger` vào Edge definition là cách sạch nhất. |
| 7 | **ID Mapping** — ID cố định thay vì tên hàm | ❌ **SAI** | `CartService.checkout` chính là ID tự nhiên nhất. `m_0042` thì unreadable. Rename xử lý bởi `ats_validate` + `last_verified`. |
| 8 | **CI/CD Verification** | ✅ **ĐÚNG** | `ats_validate` scan source rồi, nhưng chưa tích hợp CI exit code. |
| 9 | **Visual hóa Mermaid** | ⚠️ **ĐÃ CÓ** | `graph.ts` export Mermaid. Web Dashboard đã có D3.js + PageRank. |
| 10 | **Runtime Mapping** | ⚠️ **ĐÃ CÓ** | `ATS.trace()` đã output `[ATS][FLOW_NAME][#SEQ][dDEPTH]`. |

---

## 🔬 Phần 2: Review Toàn Bộ Source Code — Đánh Giá Từng Module

### 📦 Module 1: Flutter SDK (`packages/ats_flutter/`)

#### `ats_core.dart` (201 LOC) — ⭐ 8/10

**Tốt:**
- `kReleaseMode` check ở đầu mọi method → zero production overhead
- `_mutedMethods` O(1) set check trước khi format string → tối ưu
- API đơn giản, clean: `trace()`, `internalInit()`, `resetSequence()`

**Vấn đề:**
- 🐛 **`_currentDepth()` rất fragile** (dòng 139-153): Dùng `StackTrace.current.toString()` rồi đếm frames chứa `package:`, chia 2. Heuristic này cho kết quả sai khi:
  - Method gọi qua callback/closure (depth bị inflate)
  - Async/await (frames khác nhau giữa Dart VM versions)
  - Third-party packages (bị đếm nhầm)
- 💡 **Đề xuất V6:** Thay bằng explicit depth tracking: `ATS.trace('Class', 'method', depth: 1)` hoặc dùng Zone-based tracking.

#### `flow_registry.dart` (116 LOC) — ⭐ 7/10

**Tốt:**
- O(1) method lookup via HashMap
- Support cả CodeGen (V3+) và legacy dart-define (V1-V2)

**Vấn đề:**
- ⚠️ **Dead code** (dòng 35-78): `FlowRegistry.load()` static method và `_parse()` method là legacy code từ V1/V2 (dart-define strategy). V3+ dùng `fromNative()` exclusively. Code này không bao giờ được gọi trong flow hiện tại nhưng chiếm ~45 LOC.
- ⚠️ `_activeFlows` dùng `List<String>` → `isActive()` là O(n). Nên dùng `Set<String>` cho O(1).

#### `log_writer.dart` (103 LOC) — ⭐ 5/10

**Tốt:**
- Fire-and-forget async write, never blocks caller
- Graceful error handling (silent catch)

**Vấn đề:**
- 🐛 **CRITICAL: Không ghi `seq` và `depth`** (dòng 68-74): JSONL entry chỉ có `{ts, flow, class, method, data}`. `ats_analyze` cần `seq` + `depth` để reconstruct call chains. Khi `source: 'file'`, `parseLogFiles()` set `seq: 0, depth: 0` cho MỌI entry → phân tích call chain **hoàn toàn sai**.
- 🐛 **Custom `unawaited()`** (dòng 102): Dart SDK đã có `dart:async` `unawaited()` từ lâu. Bản custom này là empty function → Future thực sự bị discard silently (không log nếu write thất bại).

#### `ats_flutter_test.dart` (66 LOC) — ⭐ 4/10

**Vấn đề:**
- ⚠️ **Chỉ test FlowRegistry**, không test `ATS.trace()`, `LogWriter`, hay muted methods
- ⚠️ Không test `internalInit()` với mutedMethods parameter
- ⚠️ Không test priority (V6 feature)
- ⚠️ Không có integration test

---

### 📦 Module 2: MCP Server (`packages/ats-mcp-server/`)

#### `core/flow-graph.ts` (215 LOC) — ⭐ 9/10

**Tốt:**
- Clean interface definitions
- `syncGeneratedCode()` tự động gen Dart code khi write — rất thông minh
- Support ats.yaml config (custom output paths)
- Xử lý mutedMethods trong codegen

**Vấn đề:**
- ⚠️ **Không cache**: Mỗi gọi `this.flows` → `this.read()` → đọc + parse file. Web Dashboard gọi 3-4 API endpoints/page = 3-4 lần parse cùng file.
- ⚠️ `flowsForMethod()` là O(F×C×M) — scan toàn bộ flows × classes × methods. Với Shopify example (10 flows, 50 classes, 130 methods) = hàng nghìn comparisons mỗi lần.

#### `core/dag.ts` (266 LOC) — ⭐ 9/10

**Tốt:**
- 6 algorithms chuẩn: Kahn's, TopoSort, PageRank, Betweenness Centrality, Label Propagation, BFS Shortest Path
- Code sạch, mỗi algorithm tách riêng

**Vấn đề:**
- ⚠️ Minor: `detectCommunities()` dùng undirected graph cho label propagation nhưng ATS edges là directed. Kết quả community có thể misleading.

#### `tools/init.ts` (84 LOC) — ⭐ 9/10

**Tốt:**
- Compressed protocol instructions → ~400 tokens
- `suggested_next` adaptive: cảnh báo nếu flows còn active, guide next step

**Vấn đề:**
- ⚠️ Hardcoded version `'5.0.0'` (dòng 40) — nên đọc từ `data.ats_version` hoặc package.json

#### `tools/context.ts` (82 LOC) — ⭐ 8/10

**Tốt:**
- Topological BFS trên depends_on → upstream context delivery
- Respects maxDepth parameter

**Vấn đề:**
- ⚠️ `graph.edges.filter(...)` (dòng 63) — O(E) scan toàn bộ edges mỗi lần gọi
- ⚠️ Không trả thông tin muted methods cho AI biết

#### `tools/activate.ts` (36 LOC) — ⭐ 9/10

**Tốt:** Clean, single-purpose, auto-syncs generated code via `graph.write()`

#### `tools/validate.ts` (81 LOC) — ⭐ 7/10

**Tốt:**
- Cycle detection, invalid references, source code scan

**Vấn đề:**
- ⚠️ Source scan chỉ tìm CLASS, không verify METHOD existence (chỉ check class name, không check method name trong source)
- ⚠️ Không validate `muted` field (muted method có thể không tồn tại trong `methods` array)
- ⚠️ Không có `--ci` mode (exit code 1)

#### `tools/instrument.ts` (292 LOC) — ⭐ 7/10

**Tốt:**
- Multi-language: Dart, TypeScript, Python parsers
- Auto-registers instrumented methods in flow_graph.json

**Vấn đề:**
- ⚠️ **Dart parser quá đơn giản** (dòng 122-212): Regex-based → dễ bị sai khi gặp:
  - Generic types: `Future<Map<String, List<int>>>` (regex match sai)
  - Multi-line method signatures
  - Extension methods, mixins
- ⚠️ **TS parser duplicate trace** (dòng 230-253): Không check existing `console.log('[ATS]')` trước khi thêm → chạy 2 lần = 2 traces per method
- ⚠️ Python parser (`parsePython`) không detect `async def`

#### `tools/analyze.ts` (254 LOC) — ⭐ 6/10

**Tốt:**
- Hotspot detection, chain discovery, anomaly detection
- Auto-adds edges to graph

**Vấn đề:**
- 🐛 **`parseLogFiles()` không recurse subdirectories** (dòng 100-123): Logs ở `.ats/logs/FLOW_NAME/date.jsonl` nhưng function chỉ scan root dir → tìm thấy **0 files**
- 🐛 **File log entries thiếu seq/depth** (nhận từ LogWriter bug) → edge discovery từ file logs vô dụng
- ⚠️ Console text phải được paste bằng tay → error-prone cho AI

#### `tools/rank.ts` (103 LOC) — ⭐ 8/10

**Tốt:** 4 actions (rank, bottleneck, communities, path) clean

**Vấn đề:**
- ⚠️ **Không expose qua MCP** — chỉ dùng trong web-server, AI agents không truy cập được

#### `tools/graph.ts` (41 LOC) — ⭐ 7/10 — Cùng vấn đề: không expose qua MCP

#### `web/web-server.ts` (722 LOC) — ⭐ 6/10

**Tốt:**
- Đầy đủ API endpoints (flows list, detail, toggle, mute/unmute, graph)
- D3.js visualization với PageRank-sized nodes
- Professional dark theme UI

**Vấn đề:**
- ⚠️ **Monolith**: 722 LOC inline HTML + CSS + JavaScript trong 1 function string. Unmaintainable.
- ⚠️ `web/public/` directory tồn tại nhưng trống — HTML nên tách ra đây
- ⚠️ **Escape hell**: Template literal với escape sequences `\\\\'` rất khó đọc/debug
- ⚠️ Không có error handling cho API responses (frontend `api()` function)
- ⚠️ Không responsive (sidebar cứng 240px, xem trên mobile thì hỏng)

#### `index.ts` (182 LOC) — ⭐ 8/10

**Tốt:**
- Clean multi-project discovery via `discoverGraphPaths()`
- `resolveGraph()` elegant: auto-select khi 1 project, ask khi multiple

**Vấn đề:**
- ⚠️ **`rank.ts` và `graph.ts` KHÔNG được register** — README nói "8 tools" nhưng chỉ có 7 MCP tools (init, context, activate, silence, validate, impact, instrument, analyze). `rank` và `graph` chỉ chạy trong web-server.
- ⚠️ `console.error` ở dòng 178 hardcode version `v5.0.0`

#### `cli.ts` (36 LOC) — ⭐ 7/10

**Vấn đề:**
- ⚠️ Chỉ có 1 command (`dashboard`). Không có `ats validate --ci`, `ats sync`, v.v.

---

### 📦 Module 3: Schema & Spec

#### `spec/flow_graph_schema.json` (173 LOC) — ⭐ 6/10

**Vấn đề:**
- 🐛 **CRITICAL: Thiếu `muted` field** trong ClassEntry definition (dòng 103-122). ClassEntry chỉ có `methods`, `needs_verify`, `last_verified`. Nhưng code sử dụng `muted` field rộng rãi. Schema validation sẽ **reject** bất kỳ graph nào dùng `muted`.
- ⚠️ Title vẫn là "ATS Flow Graph V4" — nên update version theo release

#### `spec/protocol.md` (272 LOC) — ⭐ 8/10

**Vấn đề:**
- ⚠️ Inconsistencies: Nói "8 tools" (dòng 13, 215) nhưng table chỉ list 8 (ats_init đếm = 8, nhưng README.md root nói "7 tools for AI" dòng 38)
- ⚠️ CLI commands section (dòng 253-262) list `ats init`, `ats sync` v.v. nhưng V5 đã **remove CLI từ Flutter SDK** (xem CHANGELOG.md). Outdated.

---

### 📦 Module 4: Skills & Templates

#### `skills/` (V5 style — minimal) — ⭐ 9/10 

**Tốt:** antifravity SKILL.md (14 LOC) và claude CLAUDE.md (9 LOC) đều minimal ~30 tokens. Đúng philosophy V5.

#### `templates/rules/` (V4 style — heavy) — ⭐ 5/10

**Vấn đề:**
- ⚠️ **Outdated V4 content**: `claude.md` (36 LOC) và `gemini-skill.md` (41 LOC) vẫn dùng V4 3-layer model, reference `/ats-debug` workflow commands đã bị xóa, và không mention `ats_init`
- ⚠️ Confusion potential: user copy V4 template thay vì V5 skill → sai workflow

#### `plugin/` — ⭐ 8/10

**Tốt:**
- hooks/session-start/detect.sh: Auto-detect ATS projects
- hooks/post-tool-use/verify-sync.sh: Check codegen freshness
- .mcp.json: Clean config with `${CLAUDE_PLUGIN_ROOT}` variable

**Vấn đề:**
- ⚠️ `mcp-servers/ats/dist` và `mcp-servers/ats/node_modules` là **plain text files** (70 bytes, 78 bytes) — đây là path references chứ không phải actual compiled code. Plugin install script cần được test.

---

### 📦 Module 5: Documentation

#### `README.md` (272 LOC) — ⭐ 8/10

**Vấn đề:**
- ⚠️ Inconsistent: "7 tools" ở dòng 75, tên `ats_init = V5 skill` — nhưng tools table dòng 167-177 list 8 tools (đúng)
- ⚠️ Architecture diagram nói "V5" nhưng dòng 39 nói `flow_graph.json (V5)` trong khi schema title vẫn V4

#### `docs/flow.md` (260 LOC) — ⭐ 5/10

**Vấn đề:**
- ⚠️ **Fully V4 content**: Toàn bộ document viết về "V4", reference 3-layer system, `/ats-debug` workflow, `dart run ats_flutter activate` (CLI đã bị remove ở V5)
- ⚠️ Nên rewrite hoàn toàn cho V5/V6 workflow

#### `docs/setup.md` (308 LOC) — ⭐ 6/10

**Vấn đề:**
- ⚠️ Step 1 reference `dart run ats_flutter init` — CLI đã bị remove ở V5
- ⚠️ Step 3 reference `dart run ats_flutter sync` — CLI đã bị remove ở V5
- ⚠️ Troubleshooting reference `dart run ats_flutter status` — CLI đã bị remove ở V5
- ⚠️ "Related Documentation" reference `migration_v3_to_v4.md` (doesn't exist in docs/)

#### `docs/architecture.md` (351 LOC) — ⭐ 8/10 — Good but references V4 in places

#### `CONTRIBUTING.md` (137 LOC) — ⭐ 7/10

**Vấn đề:**
- ⚠️ Structure diagram (dòng 17-18) reference `migration_v2_to_v3.md`, `migration_v3_to_v4.md` — files don't exist
- ⚠️ Reference `workflows/` directory — doesn't exist anymore

#### `CI workflow` (.github/workflows/ci.yml, 61 LOC) — ⭐ 8/10

**Vấn đề:**
- ⚠️ Không chạy `ats_validate` trong CI — missed opportunity

---

## 🪲 Phần 3: Tổng Hợp Bugs & Issues

### 🔴 CRITICAL (Phải sửa trước khi release V6)

| # | Bug | File | Mô tả |
|---|-----|------|--------|
| B1 | **Schema thiếu `muted` field** | `spec/flow_graph_schema.json` | `ClassEntry` thiếu `"muted"` property. Schema validation reject mọi graph dùng muted. |
| B2 | **LogWriter thiếu seq/depth** | `ats_flutter/lib/src/log_writer.dart` | JSONL không ghi `seq`, `depth` → file-based `ats_analyze` hoàn toàn broken. |
| B3 | **`parseLogFiles()` không recurse** | `ats-mcp-server/src/tools/analyze.ts` | Logs ở subdirectories (`logs/FLOW_NAME/date.jsonl`) nhưng function chỉ scan root → 0 files found. |

### 🟡 HIGH (Nên sửa ở V6)

| # | Issue | File | Mô tả |
|---|-------|------|--------|
| H1 | **Không cache FlowGraph reads** | `core/flow-graph.ts` | Mỗi tool call = đọc + parse file JSON. Web dashboard = 3-4 lần/page. |
| H2 | **Flat edges O(n) scan** | Multiple files | `graph.edges.filter()` scan toàn bộ mảng trong context.ts, web-server.ts, impact.ts. |
| H3 | **`_currentDepth()` fragile** | `ats_core.dart` | StackTrace heuristic cho kết quả sai với async/callback/closures. |
| H4 | **Thiếu MCP tool `ats_mute`** | `index.ts` | AI phải tay edit JSON để mute. Nên có tool riêng. |
| H5 | **Thiếu MCP tool từ `rank.ts`** | `index.ts` | PageRank/bottleneck/communities/path chỉ dùng được qua web, AI không access. |
| H6 | **TS instrument duplicate traces** | `tools/instrument.ts` | Chạy 2 lần AppendOnMethodStart lần = 2 traces. Thiếu existing check cho TS/Python parsers. |

### 🟢 LOW (Cleanup / Nice-to-have)

| # | Issue | File | Mô tả |
|---|-------|------|--------|
| L1 | **V4 outdated docs** | `docs/flow.md`, `docs/setup.md` | Reference CLI commands đã bị remove ở V5. |
| L2 | **V4 outdated templates** | `templates/rules/` | Reference V4 3-layer, /ats-debug commands. |
| L3 | **FlowRegistry dead code** | `flow_registry.dart` | `load()` và `_parse()` legacy methods, ~45 LOC. |
| L4 | **isActive() O(n)** | `flow_registry.dart` | Dùng List thay vì Set cho `_activeFlows`. |
| L5 | **Hardcoded versions** | `init.ts`, `index.ts` | Version `'5.0.0'` hardcoded nhiều chỗ. |
| L6 | **Missing migration docs** | `CONTRIBUTING.md` | Reference files `migration_v2_to_v3.md` không tồn tại. |
| L7 | **web/public/ empty** | `web/` | Directory tồn tại nhưng trống, HTML inline trong TS. |
| L8 | **Custom unawaited()** | `log_writer.dart` | Dart SDK đã cung cấp `unawaited()` từ `dart:async`. |

---

## 🔍 Phần 4: Phân Tích Bottleneck Khi Scale

### Bottleneck 1: Duplicate Class Declarations (CRITICAL)

```
Shopify example thực tế — AuthService cần ở mọi flow:

"CHECKOUT_FLOW":    { "classes": { "AuthService": { "methods": [...] } } }
"PAYMENT_FLOW":     { "classes": { "AuthService": { "methods": [...] } } }
"PROFILE_FLOW":     { "classes": { "AuthService": { "methods": [...] } } }
"NOTIFICATION_FLOW": { "classes": { "AuthService": { "methods": [...] } } }
... tối thiểu 7 flows dùng AuthService

→ 7× JSON block cho cùng 1 class. Shopify example 830 LOC JSON, ~30% là duplicate.
```

### Bottleneck 2: Flat Edges Array (HIGH)

```
Shopify example: 62 edges trong 1 mảng phẳng.
Real-world project sẽ có 200-500 edges.

Mỗi lần ats_context() hoặc apiFlowDetail():
  → graph.edges.filter(e => ...) = O(E) scan toàn bộ
  → Mỗi filter gọi flowsForMethod() = O(F×C×M)
  → Total: O(E × F × C × M) per request ← rất chậm ở scale
```

### Bottleneck 3: AI Token Cost (MEDIUM)

```
ats_context("CHECKOUT_FLOW") trả về:
  - CHECKOUT_FLOW: 4 classes, 16 methods
  - CART_FLOW (dependency): 4 classes, 18 methods
  - PAYMENT_FLOW (dependency): 5 classes, 17 methods
  - AUTH_FLOW (transitive): 4 classes, 15 methods
  - SHIPPING_FLOW (dependency): 4 classes, 14 methods
  + ALL related edges

→ ~800 tokens thay vì target 200.
```

---

## 🏗️ Phần 5: V6 Schema Changes

### Feature 1: `global_classes` (Giải quyết Bottleneck 1)

```json
{
  "ats_version": "6.0.0",
  "global_classes": {
    "AuthService": {
      "methods": ["login", "logout", "refreshToken", "validateSession"],
      "last_verified": "2026-04-20"
    },
    "AnalyticsService": {
      "methods": ["trackEvent", "trackScreen", "setUserProperties"],
      "last_verified": "2026-04-20"
    }
  },
  "flows": { ... }
}
```

**Runtime:** Khi BẤT KỲ flow nào active → global_classes đều được trace.
**Backward compatible:** `global_classes` absent → hoạt động như V5.

### Feature 2: `priority` trên Flow

```json
"CHECKOUT_FLOW": {
  "priority": "high",
  "active": true
}
```

| Priority | Behavior | Use case |
|----------|----------|----------|
| `high` | Luôn trace khi active | Critical business flows |
| `normal` | Default, trace khi active | Standard flows |
| `low` | Chỉ trace khi `ATS_LOG_LEVEL=low` | Noisy/verbose flows |

### Feature 3: Rich Edges

```json
{
  "from": "CheckoutBloc.onPaymentConfirmed",
  "to": "PaymentService.processPayment",
  "type": "calls",
  "trigger": "user_tap",
  "state_impact": "paymentState"
}
```

Optional `trigger` enum: `user_tap | user_input | api_response | bloc_event | lifecycle | timer | system`
Optional `state_impact` string: tên state variable bị ảnh hưởng.

### Feature 4: Edge Index (computed, không thay đổi schema)

MCP Server tự build in-memory index khi đọc graph:
```
edgesForFlow("CHECKOUT_FLOW") → [edge1, edge2, ...] // O(1) lookup
```

### Feature 5: MCP Tool `ats_mute` / `ats_unmute`

```
AI calls: ats_mute({ className: "MatrixColumn", methodName: "addValue" })
→ Mutes across all flows + auto-syncs
```

---

## 🚫 Những Thứ KHÔNG Làm (& Tại Sao)

| Đề xuất | Lý do reject |
|---------|-------------|
| `steps` array thay edges | Duplicate data. Edges cross flows. Rich Edges + index đạt mục tiêu tốt hơn. |
| ID Mapping cho methods | `CartService.checkout` tự nó là ID. Indirection layer không cần. |
| `watch_logic` / `strategy` | Quá abstract. Business logic trong config = maintenance nightmare. |
| `//` comment keys | JSON noise. Dùng `description` fields. |
| Split file per flow | Premature. Edge index + global_classes giải quyết 90% bottleneck. |

---

## 📐 Phần 6: Implementation Plan

### Phase 0: Bug Fixes (CRITICAL — trước mọi feature)

| Task | File | LOC |
|------|------|-----|
| Fix B1: Thêm `muted` field vào ClassEntry schema | `spec/flow_graph_schema.json` | ~5 |
| Fix B2: LogWriter ghi `seq` + `depth` vào JSONL | `ats_flutter/lib/src/log_writer.dart` | ~10 |
| Fix B3: `parseLogFiles()` recurse subdirectories | `ats-mcp-server/src/tools/analyze.ts` | ~15 |
| Fix H6: TS/Python instrument check existing traces | `ats-mcp-server/src/tools/instrument.ts` | ~10 |
| Fix L4: `_activeFlows` dùng Set thay List | `ats_flutter/lib/src/flow_registry.dart` | ~5 |
| Fix L8: Dùng `dart:async` unawaited | `ats_flutter/lib/src/log_writer.dart` | ~3 |

### Phase 1: Schema & Core

| Task | File | LOC |
|------|------|-----|
| Thêm `global_classes` top-level field | `spec/protocol.md` | ~15 |
| Thêm `priority` enum vào FlowEntry | `spec/protocol.md` | ~10 |
| Thêm `trigger`, `state_impact` vào Edge | `spec/protocol.md` | ~10 |
| Update JSON Schema → V6 | `spec/flow_graph_schema.json` | ~30 |

### Phase 2: MCP Server

| Task | File | LOC |
|------|------|-----|
| Update interfaces + edge index + cache | `core/flow-graph.ts` | ~80 |
| Context dùng edge index + global info | `tools/context.ts` | ~20 |
| Init thêm global_class_count + V6 rules | `tools/init.ts` | ~15 |
| Validate global_classes + priority + muted + CI mode | `tools/validate.ts` | ~30 |
| Instrument skip global_classes | `tools/instrument.ts` | ~10 |
| Analyze auto-detect trigger + recurse logs | `tools/analyze.ts` | ~20 |
| **New: ats_mute / ats_unmute MCP tool** | `tools/mute.ts` + `index.ts` | ~50 |
| **New: ats_rank exposed as MCP tool** | `index.ts` | ~20 |
| Web dashboard: priority badges, trigger cols | `web/web-server.ts` | ~60 |
| Bump versions | `package.json`, `index.ts` | ~5 |

### Phase 3: Flutter SDK

| Task | File | LOC |
|------|------|-----|
| Priority support in trace() | `ats_core.dart` | ~30 |
| Bump version + changelog | `pubspec.yaml`, `CHANGELOG.md` | ~20 |
| New tests: muted, priority, trace output | `test/ats_flutter_test.dart` | ~60 |

### Phase 4: Documentation Cleanup

| Task | File | LOC |
|------|------|-----|
| Rewrite flow.md cho V6 | `docs/flow.md` | ~200 |
| Fix setup.md (remove CLI references) | `docs/setup.md` | ~30 |
| Update architecture.md | `docs/architecture.md` | ~40 |
| Update root README.md | `README.md` | ~30 |
| Delete/update outdated templates | `templates/rules/` | ~50 |
| Fix CONTRIBUTING.md dead references | `CONTRIBUTING.md` | ~10 |
| Bump plugin version | `plugin/.claude-plugin/plugin.json` | ~2 |

### Phase 5: CI Enhancement

| Task | File | LOC |
|------|------|-----|
| Add `ats validate --ci` step to CI | `.github/workflows/ci.yml` | ~10 |
| Validate example shopify_clone graph | `.github/workflows/ci.yml` | ~5 |

---

## 📊 Impact Summary

| Layer | Files | Est. LOC |
|-------|-------|----------|
| Bug Fixes (Phase 0) | 4 | ~48 |
| Schema & Spec (Phase 1) | 2 | ~65 |
| MCP Server (Phase 2) | 9 | ~310 |
| Flutter SDK (Phase 3) | 4 | ~110 |
| Documentation (Phase 4) | 7 | ~362 |
| CI (Phase 5) | 1 | ~15 |
| **Total** | **~27 files** | **~910 LOC** |

---

## 🗺️ Critical Path

```
Phase 0 (Bugs) ──► Phase 1 (Schema) ──► Phase 2 (MCP Server) ──┬──► Phase 3 (Flutter SDK)
                                                                  │
                                                                  └──► Phase 4 (Docs)
                                                                  │
                                                                  └──► Phase 5 (CI)
```

Phase 0 → 1 → 2 là strict dependency chain. Phases 3, 4, 5 có thể chạy song song sau Phase 2.

---

## 🔄 Migration Path (V5 → V6)

**Zero breaking changes.** V5 graphs hoạt động bình thường trong V6.

| Change | Required? | AI tự làm? |
|--------|-----------|-----------|
| Fix `ats_version` → `"6.0.0"` | Recommended | ✅ `ats_init` sẽ suggest |
| Extract shared classes → `global_classes` | Optional | ✅ AI detect & suggest |
| Add `priority` to flows | Optional | ✅ Default `"normal"` |
| Add `trigger`/`state_impact` to edges | Optional | ✅ `ats_analyze` auto-suggest |

---

## ✅ Verification Plan

```bash
# Phase 0: Bug verifications
cd packages/ats_flutter && flutter test           # Existing + new tests pass
cd packages/ats-mcp-server && npx tsc --noEmit    # TS type check

# Phase 1-2: Schema + MCP Server
# Test V6 graph with all new fields
# Test backward compat with V5 Shopify example graph

# Phase 3: Flutter SDK
flutter test                                       # Priority tests
# Manual: verify trace output includes priority filtering

# Phase 4: Docs
# Manual: review each doc for V4/V5 references

# Phase 5: CI
# Push to branch → verify CI runs ats_validate
```
