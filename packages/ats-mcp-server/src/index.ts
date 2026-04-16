#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as path from 'path';
import { FlowGraph } from './core/flow-graph.js';
import { contextTool } from './tools/context.js';
import { activateTool } from './tools/activate.js';
import { validateTool } from './tools/validate.js';
import { impactTool } from './tools/impact.js';
import { instrumentTool } from './tools/instrument.js';
import { analyzeTool } from './tools/analyze.js';

const projectRoot = process.argv[2] ?? process.cwd();
const graphPath = path.join(projectRoot, '.ats', 'flow_graph.json');
const graph = new FlowGraph(graphPath);

const server = new McpServer({
  name: 'ats-mcp-server',
  version: '0.1.0',
});

// ── 1. ats_context — AI lấy context thay vì đọc JSON ──
server.tool(
  'ats_context',
  'Get topologically-sorted context for a flow: classes, methods, edges, sessions. Use INSTEAD of reading flow_graph.json.',
  { flow: z.string().describe('Flow name, e.g. PAYMENT_FLOW'), depth: z.number().optional().describe('Dependency traversal depth, default 2') },
  async (args) => ({ content: [{ type: 'text', text: JSON.stringify(contextTool(graph, args), null, 2) }] }),
);

// ── 2. ats_activate — Bật flow logging ──
server.tool(
  'ats_activate',
  'Activate a flow to enable ATS.trace() logging. Auto-syncs generated code.',
  { flow: z.string().describe('Flow name to activate') },
  async (args) => ({ content: [{ type: 'text', text: JSON.stringify(activateTool(graph, args), null, 2) }] }),
);

// ── 3. ats_silence — Tắt flow logging ──
server.tool(
  'ats_silence',
  'Silence a flow to disable logging. Auto-syncs generated code.',
  { flow: z.string().describe('Flow name to silence') },
  async (args) => ({ content: [{ type: 'text', text: JSON.stringify(activateTool(graph, { ...args, silence: true }), null, 2) }] }),
);

// ── 4. ats_validate — Check graph integrity ──
server.tool(
  'ats_validate',
  'Validate flow graph: detect cycles, stale methods, invalid edges, orphan classes.',
  {},
  async (args) => ({ content: [{ type: 'text', text: JSON.stringify(validateTool(graph, args), null, 2) }] }),
);

// ── 5. ats_impact — Blast radius before changing a method ──
server.tool(
  'ats_impact',
  'Analyze blast radius: find all callers, callees, and affected flows before modifying a method.',
  { method: z.string().describe('Class.method format, e.g. PaymentService.processPayment') },
  async (args) => ({ content: [{ type: 'text', text: JSON.stringify(impactTool(graph, args), null, 2) }] }),
);

// ── 6. ats_instrument — Add trace skeleton to a file ──
server.tool(
  'ats_instrument',
  'Add ATS.trace() to all public methods in a source file. Updates flow_graph.json. Supports Dart, TypeScript, Python.',
  {
    file: z.string().describe('Path to source file (relative or absolute)'),
    flow: z.string().describe('Flow name to register methods under (REQUIRED)'),
    dry_run: z.boolean().optional().describe('If true, preview only'),
  },
  async (args) => ({ content: [{ type: 'text', text: JSON.stringify(instrumentTool(graph, args), null, 2) }] }),
);

// ── 7. ats_analyze — Parse logs, auto-add edges ──
server.tool(
  'ats_analyze',
  'Parse ATS console logs to discover call chains and auto-add edges to flow_graph.json.',
  {
    source: z.enum(['console', 'file']).optional().describe('"console" (provide text) or "file" (read .ats/logs/)'),
    text: z.string().optional().describe('Console output containing [ATS] log lines'),
  },
  async (args) => ({ content: [{ type: 'text', text: JSON.stringify(analyzeTool(graph, args), null, 2) }] }),
);

// Start
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ATS MCP Server running — 7 tools ready');
}

main().catch(console.error);
