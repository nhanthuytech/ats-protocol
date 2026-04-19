# ATS Protocol — Claude Code Plugin

> Turn your AI coding agent from a stateless debugger into a knowledge-accumulating partner.

## Install

```bash
/plugin install ats-protocol
```

Or from local path:

```bash
/plugin install /path/to/ats-protocol/plugin
```

## What's Included

| Component | Description |
|---|---|
| **Skill** | Auto-activates when `.ats/flow_graph.json` exists — instructs AI to call `ats_init` |
| **MCP Server** | 8 tools: `ats_init`, `ats_context`, `ats_activate`, `ats_silence`, `ats_validate`, `ats_impact`, `ats_instrument`, `ats_analyze` |
| **Session Hook** | Auto-detects ATS projects on session start |
| **Sync Hook** | Verifies codegen sync after flow state changes |

## How It Works

1. **Plugin installs** → Claude Code auto-registers MCP server + skill + hooks
2. **You open a project** with `.ats/flow_graph.json` → skill activates automatically
3. **AI calls `ats_init`** → receives protocol rules + graph overview in ~200 tokens
4. **You debug** → AI activates flows, reads logs, adds edges, silences when done
5. **Knowledge accumulates** → edges, sessions, known issues persist in version control

## Multi-Project Support

If your workspace contains multiple ATS projects (monorepo), the AI will ask you which project to target:

```
AI: "I found 3 ATS projects: app, admin-portal, worker. Which one are you working on?"
You: "app"
AI: ats_init({ project: "app" }) → proceeds normally
```

## Requirements

- Node.js ≥ 18
- Claude Code with plugin support

## Related

- [ATS Protocol](https://github.com/nhanthuytech/ats-protocol) — Full monorepo
- [ATS Flutter SDK](https://github.com/nhanthuytech/ats-protocol/tree/main/packages/ats_flutter) — Dart/Flutter runtime
- [ATS MCP Server](https://github.com/nhanthuytech/ats-protocol/tree/main/packages/ats-mcp-server) — Standalone MCP tools

## License

MIT
