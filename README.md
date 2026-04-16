# ATS Protocol — Agentic Telemetry Standard

**ATS** biến project thành một **knowledge graph tự duy trì**, nơi AI agent tự thêm/tắt log, phát hiện call chains, và tích lũy kiến thức qua mỗi session debug — không cần developer can thiệp.

[![CI](https://github.com/nhanthuytech/ats-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/nhanthuytech/ats-protocol/actions/workflows/ci.yml)

---

## Vấn đề ATS giải quyết

❌ **Không có ATS:** AI mò 20-50 file, print() rải rác, 30K tokens, quên xóa log, hôm sau mất context.

✅ **Với ATS:** AI gọi `ats_context("PAYMENT_FLOW")` → 200 tokens, bật log có cấu trúc, đọc call chain, fix xong tắt, knowledge lưu vĩnh viễn.

## Kiến trúc

```
┌──────────────────────────────────────────────────────────────┐
│  ATS Protocol (spec + docs + templates)                      │
├──────────────────────────────────────────────────────────────┤
│  MCP Server (TypeScript)     │  Flutter SDK (Dart)           │
│  7 tools cho AI agents       │  ATS.trace() + CLI            │
│  Universal — mọi ngôn ngữ   │  pub.dev: ats_flutter         │
├──────────────────────────────────────────────────────────────┤
│  flow_graph.json — DAG-based knowledge graph                 │
│  flows → classes → methods → edges → sessions                │
└──────────────────────────────────────────────────────────────┘
```

## Monorepo Structure

```
ats-protocol/
├── spec/                          # Protocol specification
│   ├── protocol.md                # Core protocol (language-agnostic)
│   └── flow_graph_schema.json     # JSON Schema V4
├── docs/                          # Guides
│   ├── flow.md                    # Developer + AI workflow
│   ├── setup.md                   # Setup guide
│   ├── migration_v2_to_v3.md      # V2→V3
│   └── migration_v3_to_v4.md      # V3→V4 (DAG)
├── templates/                     # AI agent templates
│   ├── rules/                     # Lightweight rules (~500 tokens)
│   └── workflows/                 # Step-by-step guides
├── skills/                        # Full AI skill files
│   ├── antigravity/SKILL.md       # Gemini
│   └── claude/CLAUDE.md           # Claude
├── packages/
│   ├── ats_flutter/               # Dart/Flutter SDK + CLI
│   └── ats-mcp-server/            # TypeScript MCP Server
├── .github/workflows/ci.yml       # CI for both packages
├── CONTRIBUTING.md
├── LICENSE                        # MIT
└── README.md
```

## Quick Start

### 1. Flutter SDK

```bash
# Thêm dependency
flutter pub add ats_flutter

# Khởi tạo ATS trong project
dart run ats_flutter init

# Instrument code (AI hoặc dev thêm ATS.trace() vào methods)
# Sync flow_graph.json → generated code
dart run ats_flutter sync
```

```dart
import 'package:ats_flutter/ats_flutter.dart';
import 'generated/ats/ats_generated.g.dart';

void main() {
  AtsGenerated.init();
  runApp(MyApp());
}

class PaymentService {
  Future<void> processPayment(Order order) async {
    ATS.trace('PaymentService', 'processPayment', data: order.toJson());
    // ...
  }
}
```

### 2. MCP Server

```bash
cd packages/ats-mcp-server
npm install && npx tsc
```

Cấu hình IDE (Claude Code / Cursor):

```json
{
  "mcpServers": {
    "ats": {
      "command": "node",
      "args": ["/path/to/ats-mcp-server/dist/index.js", "."]
    }
  }
}
```

### 3. Web Visualization

```bash
npx tsx packages/ats-mcp-server/src/web/web-server.ts .
# → http://localhost:4567
```

## MCP Tools (7)

| Tool | Mô tả | Token tiết kiệm |
|---|---|---|
| `ats_context` | Lấy flow context (topo-sorted) | ~2800/lần |
| `ats_activate` | Bật flow logging | ~1450/lần |
| `ats_silence` | Tắt flow logging | ~1450/lần |
| `ats_validate` | Check cycles, stale methods, invalid edges | — |
| `ats_impact` | Blast radius trước khi sửa method | — |
| `ats_instrument` | Thêm trace skeleton vào file (Dart/TS/Python) | ~1600/file |
| `ats_analyze` | Parse log → auto-add edges vào graph | ~1900/lần |

## V4 Log Format

```
[ATS][PAYMENT_FLOW][#001][d0] CheckoutBloc.onCheckout | {"cart_id": "123"}
[ATS][PAYMENT_FLOW][#002][d1] PaymentService.process | {"amount": 99}
[ATS][PAYMENT_FLOW][#003][d2] StripeGateway.charge | {"status": "ok"}
```

- `#SEQ` — thứ tự thực thi (AI đọc flow)
- `dDEPTH` — độ sâu call stack (AI suy ra ai gọi ai)

## 3-Layer AI System

| Layer | Khi nào load | Token |
|---|---|---|
| **Rule** | Mọi session | ~500 |
| **Workflow** (`/ats-debug`, `/ats-instrument`, `/ats-review`) | Khi cần | ~800 |
| **MCP Server** (7 tools) | Khi gọi | 0 |

## Graph Algorithms (core/dag.ts)

- **Kahn's algorithm** — Cycle detection
- **Topological sort** — Dependency ordering
- **PageRank** — Method importance ranking
- **Betweenness Centrality** — Bottleneck detection
- **Community Detection** — Auto-suggest flow groupings
- **BFS Shortest Path** — Call chain between two methods

## Supported Languages

| Language | SDK | Status |
|---|---|---|
| Dart/Flutter | `ats_flutter` | ✅ Released |
| TypeScript/Node.js | `ats-node` | 🔜 Planned |
| Python | `ats-python` | 🔜 Planned |
| Swift | `ats-swift` | 🔜 Planned |

MCP Server đã hỗ trợ instrument cho cả Dart, TypeScript, và Python.

## Documentation

- [Setup Guide](docs/setup.md)
- [Developer + AI Workflow](docs/flow.md)
- [Migration V3→V4](docs/migration_v3_to_v4.md)
- [Protocol Spec](spec/protocol.md)
- [MCP Server](packages/ats-mcp-server/README.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT
