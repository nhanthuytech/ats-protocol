# ATS MCP Server

MCP (Model Context Protocol) server cho ATS Protocol. Cung cấp 7 tools để AI agent quản lý flow graph mà không cần đọc file JSON.

## Cài đặt

```bash
npm install
npx tsc
```

## Chạy

### MCP Server (cho AI agents)

```bash
node dist/index.js /path/to/your/project
```

### Web Visualization (cho developers)

```bash
npx tsx src/web/web-server.ts /path/to/your/project
# → http://localhost:4567
```

## Cấu hình IDE

### Claude Code / Cursor

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

## 7 MCP Tools

| Tool | Input | Output | Ai gọi |
|---|---|---|---|
| `ats_context` | `flow` | Classes, methods, edges, sessions (topo-sorted) | AI |
| `ats_activate` | `flow` | Toggle active + auto sync | AI / Dev |
| `ats_silence` | `flow` | Toggle inactive + auto sync | AI / Dev |
| `ats_validate` | — | Cycles, stale methods, invalid edges | AI / Dev |
| `ats_impact` | `method` | Callers, callees, affected flows, risk | AI |
| `ats_instrument` | `file` + `flow` | Add trace skeleton + update graph | AI / Dev |
| `ats_analyze` | `text` (logs) | Parse logs → auto-add edges to graph | AI |

## Architecture

```
src/
├── index.ts              # MCP entry point (JSON-RPC over stdio)
├── core/
│   ├── flow-graph.ts     # Graph reader/writer + types
│   └── dag.ts            # Graph algorithms (PageRank, centrality, shortest path)
├── tools/
│   ├── context.ts        # ats_context
│   ├── activate.ts       # ats_activate / ats_silence
│   ├── validate.ts       # ats_validate
│   ├── impact.ts         # ats_impact
│   ├── instrument.ts     # ats_instrument (Dart/TS/Python parser)
│   ├── analyze.ts        # ats_analyze (log parser + edge discovery)
│   ├── graph.ts          # Mermaid DAG export (used by web)
│   └── rank.ts           # Graph analytics (used by web)
└── web/
    └── web-server.ts     # D3.js DAG visualization
```

## Token Savings

| Without MCP | With MCP |
|---|---|
| AI reads flow_graph.json (~3000 tokens) | `ats_context` (~200 tokens) |
| AI edits JSON + runs sync (~1500 tokens) | `ats_activate` (~50 tokens) |
| AI reads logs + adds edges (~2000 tokens) | `ats_analyze` (~100 tokens) |
