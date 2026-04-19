#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';
import { FlowGraph } from './core/flow-graph.js';
import { contextTool } from './tools/context.js';
import { activateTool } from './tools/activate.js';
import { validateTool } from './tools/validate.js';
import { impactTool } from './tools/impact.js';
import { instrumentTool } from './tools/instrument.js';
import { analyzeTool } from './tools/analyze.js';
import { initTool } from './tools/init.js';

const workspaceRoot = process.argv[2] ?? process.cwd();

// ── Auto-discover all .ats/flow_graph.json in workspace ──────────────────────

function discoverGraphPaths(root: string, maxDepth = 5): string[] {
  const results: string[] = [];
  const skip = new Set(['node_modules', '.git', '.dart_tool', 'build', 'dist', '.pub-cache']);

  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    const candidate = path.join(dir, '.ats', 'flow_graph.json');
    if (fs.existsSync(candidate)) {
      results.push(candidate);
      return;
    }
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || skip.has(entry.name)) continue;
        walk(path.join(dir, entry.name), depth + 1);
      }
    } catch { /* permission denied */ }
  }

  walk(root, 0);
  return results;
}

const discovered = discoverGraphPaths(workspaceRoot);

// Map: project key (relative dir) → FlowGraph instance
const graphs = new Map<string, FlowGraph>();
for (const gp of discovered) {
  const projectDir = path.resolve(path.dirname(gp), '..');
  const key = path.relative(workspaceRoot, projectDir) || '.';
  graphs.set(key, new FlowGraph(gp));
}

if (graphs.size > 0) {
  console.error(`[ATS] Discovered ${graphs.size} project(s): ${[...graphs.keys()].join(', ')}`);
}

/** Resolve which graph to use */
function resolveGraph(project?: string): FlowGraph | { error: string; available_projects: string[] } {
  const keys = [...graphs.keys()];

  if (keys.length === 0) {
    return { error: 'No .ats/flow_graph.json found. Run `ats init` first.', available_projects: [] };
  }

  if (project) {
    const g = graphs.get(project);
    if (g) return g;
    return { error: `Project "${project}" not found.`, available_projects: keys };
  }

  if (keys.length === 1) return graphs.get(keys[0])!;

  return {
    error: 'Multiple ATS projects found. Ask the user which project to use, then pass it as the "project" parameter.',
    available_projects: keys,
  };
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'ats-mcp-server',
  version: '5.0.0',
});

const projectParam = z.string().optional().describe(
  'Project sub-directory (required when multiple ATS projects exist). Use value from available_projects.'
);

// ── 0. ats_init ──
server.tool(
  'ats_init',
  'V5 SKILL ENTRY POINT — Call at task start. If multiple projects exist, returns the list for user selection.',
  { project: projectParam },
  async (args) => {
    const g = resolveGraph(args.project as string | undefined);
    if ('error' in g) return { content: [{ type: 'text', text: JSON.stringify(g, null, 2) }] };
    return { content: [{ type: 'text', text: JSON.stringify(initTool(g), null, 2) }] };
  },
);

// ── 1. ats_context ──
server.tool(
  'ats_context',
  'Get topologically-sorted context for a flow.',
  { flow: z.string(), depth: z.number().optional(), project: projectParam },
  async (args) => {
    const g = resolveGraph(args.project as string | undefined);
    if ('error' in g) return { content: [{ type: 'text', text: JSON.stringify(g, null, 2) }] };
    return { content: [{ type: 'text', text: JSON.stringify(contextTool(g, args), null, 2) }] };
  },
);

// ── 2. ats_activate ──
server.tool(
  'ats_activate',
  'Activate a flow to enable ATS.trace() logging. Auto-syncs generated code.',
  { flow: z.string(), project: projectParam },
  async (args) => {
    const g = resolveGraph(args.project as string | undefined);
    if ('error' in g) return { content: [{ type: 'text', text: JSON.stringify(g, null, 2) }] };
    return { content: [{ type: 'text', text: JSON.stringify(activateTool(g, args), null, 2) }] };
  },
);

// ── 3. ats_silence ──
server.tool(
  'ats_silence',
  'Silence a flow to disable logging. Auto-syncs generated code.',
  { flow: z.string(), project: projectParam },
  async (args) => {
    const g = resolveGraph(args.project as string | undefined);
    if ('error' in g) return { content: [{ type: 'text', text: JSON.stringify(g, null, 2) }] };
    return { content: [{ type: 'text', text: JSON.stringify(activateTool(g, { ...args, silence: true }), null, 2) }] };
  },
);

// ── 4. ats_validate ──
server.tool(
  'ats_validate',
  'Validate flow graph: detect cycles, stale methods, invalid edges.',
  { project: projectParam },
  async (args) => {
    const g = resolveGraph(args.project as string | undefined);
    if ('error' in g) return { content: [{ type: 'text', text: JSON.stringify(g, null, 2) }] };
    return { content: [{ type: 'text', text: JSON.stringify(validateTool(g, args), null, 2) }] };
  },
);

// ── 5. ats_impact ──
server.tool(
  'ats_impact',
  'Analyze blast radius before modifying a method.',
  { method: z.string(), project: projectParam },
  async (args) => {
    const g = resolveGraph(args.project as string | undefined);
    if ('error' in g) return { content: [{ type: 'text', text: JSON.stringify(g, null, 2) }] };
    return { content: [{ type: 'text', text: JSON.stringify(impactTool(g, args), null, 2) }] };
  },
);

// ── 6. ats_instrument ──
server.tool(
  'ats_instrument',
  'Add ATS.trace() to all public methods in a source file. Supports Dart, TypeScript, Python.',
  {
    file: z.string(),
    flow: z.string(),
    dry_run: z.boolean().optional(),
    project: projectParam,
  },
  async (args) => {
    const g = resolveGraph(args.project as string | undefined);
    if ('error' in g) return { content: [{ type: 'text', text: JSON.stringify(g, null, 2) }] };
    return { content: [{ type: 'text', text: JSON.stringify(instrumentTool(g, args), null, 2) }] };
  },
);

// ── 7. ats_analyze ──
server.tool(
  'ats_analyze',
  'Parse ATS console logs to discover call chains and auto-add edges.',
  {
    source: z.enum(['console', 'file']).optional(),
    text: z.string().optional(),
    project: projectParam,
  },
  async (args) => {
    const g = resolveGraph(args.project as string | undefined);
    if ('error' in g) return { content: [{ type: 'text', text: JSON.stringify(g, null, 2) }] };
    return { content: [{ type: 'text', text: JSON.stringify(analyzeTool(g, args), null, 2) }] };
  },
);

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`ATS MCP Server v5.0.0 — ${graphs.size} project(s), 8 tools ready`);
}

main().catch(console.error);
