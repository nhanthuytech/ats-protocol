import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { FlowGraph } from '../core/flow-graph.js';
import { DAG } from '../core/dag.js';

const PORT = 4567;

export function startWebServer(graphPath: string) {
  const graph = new FlowGraph(graphPath);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    try {
      // ─── API Routes ───
      if (pathname === '/api/flows' && req.method === 'GET') {
        return apiFlows(graph, res);
      }
      if (pathname.match(/^\/api\/flows\/[^/]+$/) && req.method === 'GET') {
        const name = decodeURIComponent(pathname.split('/')[3]);
        return apiFlowDetail(graph, name, res);
      }
      if (pathname.match(/^\/api\/flows\/[^/]+\/toggle$/) && req.method === 'POST') {
        const name = decodeURIComponent(pathname.split('/')[3]);
        const body = await readBody(req);
        return apiToggleFlow(graph, name, body, res);
      }
      if (pathname === '/api/methods/mute' && req.method === 'POST') {
        const body = await readBody(req);
        return apiMuteMethod(graph, body, true, res);
      }
      if (pathname === '/api/methods/unmute' && req.method === 'POST') {
        const body = await readBody(req);
        return apiMuteMethod(graph, body, false, res);
      }
      if (pathname === '/api/graph' && req.method === 'GET') {
        return apiGraph(graph, res);
      }

      // ─── Frontend ───
      if (pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(getDashboardHtml());
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });

  server.listen(PORT, () => {
    console.error(`\n🧠 ATS Dashboard: http://localhost:${PORT}\n`);
  });
}

// ─── API Handlers ───

function apiFlows(graph: FlowGraph, res: http.ServerResponse) {
  const data = graph.read();
  const flows = Object.entries(data.flows).map(([name, flow]) => {
    let methodCount = 0;
    let mutedCount = 0;
    for (const classValue of Object.values(flow.classes)) {
      const methods = FlowGraph.methodsFromClass(classValue);
      methodCount += methods.length;
      if (typeof classValue === 'object' && classValue !== null && !Array.isArray(classValue) && 'muted' in classValue) {
        mutedCount += ((classValue as any).muted ?? []).length;
      }
    }
    return {
      name,
      description: flow.description ?? '',
      active: flow.active ?? false,
      methodCount,
      mutedCount,
      classCount: Object.keys(flow.classes).length,
      edgeCount: (data.edges ?? []).filter(e =>
        graph.flowsForMethod(e.from).includes(name) || graph.flowsForMethod(e.to).includes(name)
      ).length,
      sessionCount: (flow.sessions ?? []).length,
    };
  });
  json(res, { flows, project: data.project });
}

function apiFlowDetail(graph: FlowGraph, name: string, res: http.ServerResponse) {
  const data = graph.read();
  const flow = data.flows[name];
  if (!flow) { res.writeHead(404); res.end(JSON.stringify({ error: 'Flow not found' })); return; }

  const classes = Object.entries(flow.classes).map(([className, classValue]) => {
    const methods = FlowGraph.methodsFromClass(classValue);
    const muted: string[] = (typeof classValue === 'object' && classValue !== null && !Array.isArray(classValue))
      ? ((classValue as any).muted ?? []) : [];

    const methodDetails = methods.map(m => {
      const key = `${className}.${m}`;
      const callers = (data.edges ?? []).filter(e => e.to === key).length;
      const callees = (data.edges ?? []).filter(e => e.from === key).length;
      return { name: m, muted: muted.includes(m), callers, callees };
    });
    return { name: className, methods: methodDetails, enabledCount: methods.length - muted.length, totalCount: methods.length };
  });

  const edges = (data.edges ?? []).filter(e =>
    graph.flowsForMethod(e.from).includes(name) || graph.flowsForMethod(e.to).includes(name)
  );

  json(res, {
    name,
    description: flow.description ?? '',
    active: flow.active ?? false,
    depends_on: flow.depends_on ?? [],
    classes,
    edges,
    sessions: flow.sessions ?? [],
    known_issues: flow.known_issues ?? [],
  });
}

function apiToggleFlow(graph: FlowGraph, name: string, body: any, res: http.ServerResponse) {
  const data = graph.read();
  if (!data.flows[name]) { res.writeHead(404); res.end(JSON.stringify({ error: 'Flow not found' })); return; }

  data.flows[name].active = body.active ?? !data.flows[name].active;
  graph.write(data);
  json(res, { success: true, active: data.flows[name].active });
}

function apiMuteMethod(graph: FlowGraph, body: any, mute: boolean, res: http.ServerResponse) {
  const { className, methodName } = body;
  if (!className || !methodName) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'className and methodName required' }));
    return;
  }

  const data = graph.read();
  let found = false;

  for (const [, flow] of Object.entries(data.flows)) {
    const classEntry = flow.classes[className];
    if (!classEntry) continue;

    // Ensure V4 format
    let classObj: { methods: string[]; muted?: string[]; needs_verify?: boolean; last_verified?: string };
    if (Array.isArray(classEntry)) {
      classObj = { methods: classEntry };
      flow.classes[className] = classObj;
    } else {
      classObj = classEntry as any;
    }

    if (!classObj.muted) classObj.muted = [];

    if (mute && !classObj.muted.includes(methodName)) {
      classObj.muted.push(methodName);
      found = true;
    } else if (!mute) {
      const idx = classObj.muted.indexOf(methodName);
      if (idx >= 0) { classObj.muted.splice(idx, 1); found = true; }
    }
  }

  if (!found) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: `${className}.${methodName} not found or already ${mute ? 'muted' : 'unmuted'}` }));
    return;
  }

  graph.write(data);
  json(res, { success: true, muted: mute });
}

function apiGraph(graph: FlowGraph, res: http.ServerResponse) {
  const data = graph.read();
  const ranks = DAG.pageRank(data.edges ?? []);
  const centrality = DAG.betweennessCentrality(data.edges ?? []);

  const nodes: Array<Record<string, unknown>> = [];
  const links: Array<Record<string, unknown>> = [];
  const nodeSet = new Set<string>();

  for (const [name, flow] of Object.entries(data.flows)) {
    let methodCount = 0;
    let mutedCount = 0;
    for (const classValue of Object.values(flow.classes)) {
      methodCount += FlowGraph.methodsFromClass(classValue).length;
      if (typeof classValue === 'object' && classValue !== null && !Array.isArray(classValue)) {
        mutedCount += ((classValue as any).muted ?? []).length;
      }
    }
    nodes.push({ id: name, type: 'flow', active: flow.active ?? false, description: flow.description ?? '', methodCount, mutedCount });
    nodeSet.add(name);
    for (const dep of flow.depends_on ?? []) links.push({ source: dep, target: name, type: 'depends_on' });
    if (flow.parent) links.push({ source: flow.parent, target: name, type: 'parent' });
  }

  for (const edge of data.edges ?? []) {
    for (const id of [edge.from, edge.to]) {
      if (!nodeSet.has(id)) {
        nodeSet.add(id);
        // Check if this method is muted
        let isMuted = false;
        const [cls, method] = id.split('.');
        for (const flow of Object.values(data.flows)) {
          const ce = flow.classes[cls];
          if (ce && typeof ce === 'object' && !Array.isArray(ce) && (ce as any).muted?.includes(method)) {
            isMuted = true; break;
          }
        }
        nodes.push({
          id, type: 'method', muted: isMuted,
          rank: Math.round((ranks.get(id) ?? 0) * 10000) / 10000,
          centrality: Math.round((centrality.get(id) ?? 0) * 100) / 100,
          flows: graph.flowsForMethod(id),
        });
      }
    }
    links.push({ source: edge.from, target: edge.to, type: edge.type });
  }

  json(res, { nodes, links, stats: { flows: Object.keys(data.flows).length, edges: (data.edges ?? []).length, nodes: nodes.length } });
}

// ─── Helpers ───

function json(res: http.ServerResponse, data: unknown) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

// ─── Dashboard HTML ───

function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ATS Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
:root {
  --bg: #0d1117; --surface: #161b22; --surface-hover: #1c2333; --surface-active: #1f2a3d;
  --border: #30363d; --border-subtle: #21262d;
  --text-primary: #e6edf3; --text-secondary: #8b949e; --text-muted: #484f58;
  --accent: #58a6ff; --green: #3fb950; --green-subtle: #1a7f37;
  --amber: #d29922; --red: #f85149; --purple: #bc8cff;
  --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px;
  --sidebar-width: 240px;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--bg); color: var(--text-primary); font-family: 'Inter', -apple-system, sans-serif; height: 100vh; overflow: hidden; }

/* ─── Top Nav ─── */
#topnav { height: 56px; background: var(--surface); border-bottom: 1px solid var(--border); padding: 0 24px; display: flex; align-items: center; justify-content: space-between; }
#topnav .logo { font-size: 18px; font-weight: 600; color: var(--accent); }
#topnav .project { font-size: 13px; color: var(--text-secondary); }

/* ─── Layout ─── */
#app { display: flex; height: calc(100vh - 56px); }

/* ─── Sidebar ─── */
#sidebar { width: var(--sidebar-width); background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
#sidebar-header { padding: 16px; }
#sidebar-header label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); }
#search { width: 100%; margin-top: 10px; padding: 6px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-primary); font-size: 12px; outline: none; font-family: inherit; }
#search:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(88,166,255,0.15); }
#search::placeholder { color: var(--text-muted); }

#flow-list { flex: 1; overflow-y: auto; padding: 4px 8px; }
#flow-list::-webkit-scrollbar { width: 4px; } #flow-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.flow-item { display: flex; align-items: center; padding: 0 12px; height: 44px; border-radius: var(--radius-sm); cursor: pointer; gap: 10px; transition: background 0.15s; }
.flow-item:hover { background: var(--surface-hover); }
.flow-item.selected { background: var(--surface-active); border-left: 2px solid var(--accent); }
.flow-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.flow-dot.active { background: var(--green); }
.flow-dot.inactive { background: var(--text-muted); }
.flow-name { flex: 1; font-size: 13px; font-weight: 500; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flow-item.selected .flow-name { color: var(--text-primary); }

/* Toggle switch */
.toggle { position: relative; width: 36px; height: 20px; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle .slider { position: absolute; inset: 0; background: var(--border); border-radius: 10px; cursor: pointer; transition: background 0.2s; }
.toggle .slider::before { content: ''; position: absolute; height: 16px; width: 16px; left: 2px; top: 2px; background: white; border-radius: 50%; transition: transform 0.2s; }
.toggle input:checked + .slider { background: var(--green); }
.toggle input:checked + .slider::before { transform: translateX(16px); }

#sidebar-footer { padding: 12px 16px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-muted); }

/* ─── Main Content ─── */
#main { flex: 1; overflow-y: auto; padding: 24px 32px; }
#main::-webkit-scrollbar { width: 6px; } #main::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

/* Tabs */
.tabs { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
.tab { padding: 8px 20px; font-size: 13px; font-weight: 500; color: var(--text-secondary); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
.tab.active { color: var(--text-primary); border-bottom-color: var(--accent); }
.tab:hover:not(.active) { color: var(--text-primary); }

/* Flow Header Card */
.flow-header { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px 24px; margin-bottom: 24px; }
.flow-header .row1 { display: flex; align-items: center; justify-content: space-between; }
.flow-header h2 { font-size: 18px; font-weight: 600; font-family: 'JetBrains Mono', monospace; }
.badge { padding: 3px 10px; border-radius: var(--radius-sm); font-size: 11px; font-weight: 500; text-transform: uppercase; }
.badge-active { color: var(--green); background: rgba(63,185,80,0.15); }
.badge-inactive { color: var(--text-muted); background: rgba(72,79,88,0.2); }
.flow-header .desc { font-size: 13px; color: var(--text-secondary); margin-top: 4px; }
.chips { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
.chip { padding: 4px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 20px; font-size: 11px; color: var(--text-secondary); }
.stats-bar { display: flex; gap: 32px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-subtle); }
.stat { display: flex; flex-direction: column; gap: 2px; }
.stat-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.stat-value { font-size: 14px; font-weight: 600; }
.stat-value.warn { color: var(--amber); }

/* Section headings */
.section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.count-badge { background: var(--bg); border: 1px solid var(--border); padding: 1px 8px; border-radius: 10px; font-size: 11px; }

/* Class Tree */
.class-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; margin-bottom: 24px; }
.class-header { height: 44px; padding: 0 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: background 0.15s; }
.class-header:hover { background: var(--surface-hover); }
.class-header .left { display: flex; align-items: center; gap: 8px; }
.class-header .chevron { font-size: 10px; color: var(--text-muted); transition: transform 0.2s; display: inline-block; }
.class-header .chevron.open { transform: rotate(90deg); }
.class-header .cls-name { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; }
.class-header .cls-count { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: var(--bg); border: 1px solid var(--border); }
.class-header .cls-count.has-muted { color: var(--amber); border-color: rgba(210,153,34,0.3); }

.method-list { border-top: 1px solid var(--border-subtle); }
.method-row { height: 36px; padding: 0 16px 0 48px; display: flex; align-items: center; justify-content: space-between; transition: background 0.15s; }
.method-row:hover { background: var(--surface-hover); }
.method-row .left { display: flex; align-items: center; gap: 8px; }
.method-row input[type="checkbox"] { appearance: none; width: 16px; height: 16px; border: 1.5px solid var(--border); border-radius: 4px; cursor: pointer; position: relative; transition: all 0.15s; flex-shrink: 0; }
.method-row input[type="checkbox"]:checked { background: var(--accent); border-color: var(--accent); }
.method-row input[type="checkbox"]:checked::after { content: '✓'; position: absolute; top: -1px; left: 2px; font-size: 12px; color: white; }
.method-row .m-name { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.method-row .m-name.is-muted { text-decoration: line-through; color: var(--text-muted); }
.muted-badge { font-size: 9px; text-transform: uppercase; color: var(--amber); background: rgba(210,153,34,0.15); padding: 2px 6px; border-radius: 4px; font-weight: 600; }
.method-row .right { font-size: 12px; color: var(--text-muted); }

/* Edge Table */
.edge-table { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; margin-bottom: 24px; }
.edge-table table { width: 100%; border-collapse: collapse; }
.edge-table th { background: var(--bg); height: 36px; font-size: 11px; text-transform: uppercase; font-weight: 600; color: var(--text-muted); letter-spacing: 0.5px; text-align: left; padding: 0 16px; border-bottom: 1px solid var(--border); }
.edge-table td { height: 40px; padding: 0 16px; font-family: 'JetBrains Mono', monospace; font-size: 12px; border-bottom: 1px solid var(--border-subtle); }
.edge-table tr:last-child td { border-bottom: none; }
.edge-table tr:hover td { background: var(--surface-hover); }
.edge-table .arrow { color: var(--text-muted); }
.type-badge { padding: 3px 8px; border-radius: 4px; font-size: 9px; text-transform: uppercase; font-weight: 600; font-family: 'Inter', sans-serif; }
.type-calls { color: var(--green); background: rgba(63,185,80,0.15); }
.type-delegates { color: var(--amber); background: rgba(210,153,34,0.15); }
.type-emits { color: var(--red); background: rgba(248,81,73,0.15); }
.type-navigates { color: var(--purple); background: rgba(188,140,255,0.15); }

/* Sessions */
.session-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; margin-bottom: 24px; }
.session-entry { padding: 16px; border-bottom: 1px solid var(--border-subtle); }
.session-entry:last-child { border-bottom: none; }
.session-entry .row1 { display: flex; justify-content: space-between; align-items: center; }
.session-entry .date { font-size: 13px; color: var(--text-secondary); }
.session-entry .action-badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: rgba(88,166,255,0.15); color: var(--accent); }
.session-entry .note { font-size: 13px; margin-top: 6px; color: var(--text-primary); }

/* Empty state */
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); gap: 8px; }
.empty-state .icon { font-size: 48px; opacity: 0.3; }
.empty-state .title { font-size: 16px; color: var(--text-secondary); }

/* Toast */
.toast { position: fixed; bottom: 24px; right: 24px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); min-width: 280px; z-index: 1000; display: flex; align-items: center; gap: 10px; animation: toastIn 0.3s ease; }
.toast .t-icon { font-size: 16px; }
.toast .t-text { font-size: 13px; }
.toast .t-sub { font-size: 12px; color: var(--text-muted); }
@keyframes toastIn { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

/* Graph container */
#graph-container { width: 100%; height: calc(100vh - 160px); }
#graph-container svg { width: 100%; height: 100%; }
.node-flow { fill: #1f6feb; stroke: #58a6ff; stroke-width: 2; cursor: pointer; }
.node-flow.active { fill: #238636; stroke: #3fb950; }
.node-method { fill: #21262d; stroke: #30363d; stroke-width: 1.5; cursor: pointer; }
.node-method.muted { fill: #161b22; stroke: var(--text-muted); stroke-dasharray: 3,3; opacity: 0.5; }
.node-label { font-size: 11px; fill: var(--text-primary); text-anchor: middle; pointer-events: none; font-weight: 500; }
.node-label-method { font-size: 9px; fill: var(--text-secondary); }
.link { stroke-opacity: 0.4; fill: none; }
.link.depends_on { stroke: #58a6ff; stroke-width: 2; }
.link.calls { stroke: #3fb950; stroke-width: 1.5; }
.link.delegates { stroke: #d29922; stroke-width: 1.5; }
.link.emits { stroke: #f85149; stroke-width: 1.5; }
.link.navigates { stroke: #bc8cff; stroke-width: 1.5; }
.arrow { fill: #8b949e; }
#tooltip { position: fixed; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px 16px; font-size: 12px; pointer-events: none; opacity: 0; transition: opacity 0.15s; max-width: 300px; z-index: 20; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
#tooltip .tt-title { font-weight: 600; color: var(--accent); margin-bottom: 4px; }
#tooltip .tt-detail { color: var(--text-secondary); margin: 2px 0; }
  </style>
</head>
<body>
  <div id="topnav">
    <span class="logo">🧠 ATS Dashboard</span>
    <span class="project" id="project-name"></span>
  </div>
  <div id="app">
    <div id="sidebar">
      <div id="sidebar-header">
        <label>Flows</label>
        <input type="text" id="search" placeholder="Search flows..." />
      </div>
      <div id="flow-list"></div>
      <div id="sidebar-footer"></div>
    </div>
    <div id="main">
      <div class="empty-state" id="empty-state"><div class="icon">🧠</div><div class="title">Select a flow</div><div>Click on a flow in the sidebar to view its details</div></div>
      <div id="detail-view" style="display:none">
        <div class="tabs"><div class="tab active" data-tab="detail">DETAIL</div><div class="tab" data-tab="graph">GRAPH</div></div>
        <div id="tab-detail"></div>
        <div id="tab-graph" style="display:none"><div id="graph-container"><svg id="graph-svg"></svg></div></div>
      </div>
    </div>
  </div>
  <div id="tooltip"></div>
  <div id="toast-container"></div>

<script>
const API = '';
let allFlows = [];
let selectedFlow = null;

// ─── Init ───
async function init() {
  const data = await api('/api/flows');
  allFlows = data.flows;
  document.getElementById('project-name').textContent = data.project;
  renderSidebar();
}

// ─── Sidebar ───
function renderSidebar(filter = '') {
  const list = document.getElementById('flow-list');
  const filtered = filter ? allFlows.filter(f => f.name.toLowerCase().includes(filter.toLowerCase())) : allFlows;
  
  list.innerHTML = filtered.map(f => \`
    <div class="flow-item\${selectedFlow === f.name ? ' selected' : ''}" data-flow="\${f.name}" onclick="selectFlow('\${f.name}')">
      <div class="flow-dot \${f.active ? 'active' : 'inactive'}"></div>
      <span class="flow-name">\${f.name}</span>
      <label class="toggle" onclick="event.stopPropagation()">
        <input type="checkbox" \${f.active ? 'checked' : ''} onchange="toggleFlow('\${f.name}', this.checked)" />
        <span class="slider"></span>
      </label>
    </div>
  \`).join('');

  const active = allFlows.filter(f => f.active).length;
  const muted = allFlows.reduce((s, f) => s + f.mutedCount, 0);
  document.getElementById('sidebar-footer').textContent = allFlows.length + ' flows · ' + active + ' active · ' + muted + ' muted';
}

document.getElementById('search').addEventListener('input', e => renderSidebar(e.target.value));

// ─── Toggle Flow ───
async function toggleFlow(name, active) {
  const f = allFlows.find(f => f.name === name);
  if (f) f.active = active;
  renderSidebar(document.getElementById('search').value);
  
  await api('/api/flows/' + encodeURIComponent(name) + '/toggle', { active });
  toast((active ? '🟢' : '⚫') + ' ' + name + (active ? ' activated' : ' silenced'), 'Hot Restart to apply');
  if (selectedFlow === name) selectFlow(name);
}

// ─── Select Flow ───
async function selectFlow(name) {
  selectedFlow = name;
  renderSidebar(document.getElementById('search').value);
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('detail-view').style.display = '';

  const data = await api('/api/flows/' + encodeURIComponent(name));
  renderDetail(data);
}

// ─── Tabs ───
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const t = tab.dataset.tab;
    document.getElementById('tab-detail').style.display = t === 'detail' ? '' : 'none';
    document.getElementById('tab-graph').style.display = t === 'graph' ? '' : 'none';
    if (t === 'graph') renderGraph();
  });
});

// ─── Detail View ───
function renderDetail(data) {
  const totalMethods = data.classes.reduce((s, c) => s + c.totalCount, 0);
  const totalMuted = data.classes.reduce((s, c) => s + c.totalCount - c.enabledCount, 0);
  
  let html = '<div class="flow-header">';
  html += '<div class="row1"><h2>' + data.name + '</h2><span class="badge ' + (data.active ? 'badge-active' : 'badge-inactive') + '">' + (data.active ? 'Active' : 'Inactive') + '</span></div>';
  html += '<div class="desc">' + (data.description || 'No description') + '</div>';
  if (data.depends_on.length) html += '<div class="chips">' + data.depends_on.map(d => '<span class="chip">' + d + '</span>').join('') + '</div>';
  html += '<div class="stats-bar">';
  html += '<div class="stat"><span class="stat-label">Methods</span><span class="stat-value">' + totalMethods + '</span></div>';
  html += '<div class="stat"><span class="stat-label">Edges</span><span class="stat-value">' + data.edges.length + '</span></div>';
  html += '<div class="stat"><span class="stat-label">Sessions</span><span class="stat-value">' + data.sessions.length + '</span></div>';
  html += '<div class="stat"><span class="stat-label">Muted</span><span class="stat-value' + (totalMuted > 0 ? ' warn' : '') + '">' + totalMuted + '</span></div>';
  html += '</div></div>';

  // Classes
  html += '<div class="section-title">Classes <span class="count-badge">' + data.classes.length + '</span></div>';
  html += '<div class="class-card">';
  data.classes.forEach(cls => {
    const hasMuted = cls.enabledCount < cls.totalCount;
    html += '<div class="class-header" onclick="this.querySelector(\\'.chevron\\').classList.toggle(\\'open\\');this.nextElementSibling.style.display=this.nextElementSibling.style.display===\\'none\\'?\\'\\':\\'none\\'">';
    html += '<div class="left"><span class="chevron open">▶</span><span class="cls-name">' + cls.name + '</span></div>';
    html += '<span class="cls-count' + (hasMuted ? ' has-muted' : '') + '">' + cls.enabledCount + '/' + cls.totalCount + '</span>';
    html += '</div>';
    html += '<div class="method-list">';
    cls.methods.forEach(m => {
      const conn = m.callers > 0 && m.callees > 0 ? '↔ ' + (m.callers + m.callees) :
                    m.callees > 0 ? '→ ' + m.callees + ' callees' :
                    m.callers > 0 ? '← ' + m.callers + ' callers' : '';
      html += '<div class="method-row">';
      html += '<div class="left"><input type="checkbox" ' + (!m.muted ? 'checked' : '') + ' onchange="muteMethod(\\'' + cls.name + '\\',\\'' + m.name + '\\',!this.checked)" />';
      html += '<span class="m-name' + (m.muted ? ' is-muted' : '') + '">' + m.name + '</span>';
      if (m.muted) html += '<span class="muted-badge">MUTED</span>';
      html += '</div>';
      html += '<div class="right">' + conn + '</div>';
      html += '</div>';
    });
    html += '</div>';
  });
  html += '</div>';

  // Edges
  if (data.edges.length > 0) {
    html += '<div class="section-title">Edges <span class="count-badge">' + data.edges.length + '</span></div>';
    html += '<div class="edge-table"><table><thead><tr><th>From</th><th></th><th>To</th><th>Type</th></tr></thead><tbody>';
    data.edges.forEach(e => {
      html += '<tr><td>' + e.from + '</td><td class="arrow">→</td><td>' + e.to + '</td><td><span class="type-badge type-' + e.type + '">' + e.type + '</span></td></tr>';
    });
    html += '</tbody></table></div>';
  }

  // Sessions
  if (data.sessions.length > 0) {
    html += '<div class="section-title">Sessions <span class="count-badge">' + data.sessions.length + '</span></div>';
    html += '<div class="session-card">';
    data.sessions.forEach(s => {
      html += '<div class="session-entry"><div class="row1"><span class="date">📅 ' + s.date + '</span>';
      html += '<span class="action-badge">' + s.action + '</span>';
      html += '<span>' + (s.resolved ? '✅' : '❌') + '</span></div>';
      html += '<div class="note">' + s.note + '</div></div>';
    });
    html += '</div>';
  }

  document.getElementById('tab-detail').innerHTML = html;
}

// ─── Mute Method ───
async function muteMethod(className, methodName, mute) {
  const endpoint = mute ? '/api/methods/mute' : '/api/methods/unmute';
  await api(endpoint, { className, methodName });
  toast((mute ? '🔇' : '🔊') + ' ' + className + '.' + methodName + (mute ? ' muted' : ' unmuted'), 'Hot Restart to apply');
  
  // Refresh
  const fdata = await api('/api/flows');
  allFlows = fdata.flows;
  renderSidebar(document.getElementById('search').value);
  if (selectedFlow) selectFlow(selectedFlow);
}

// ─── Graph View ───
async function renderGraph() {
  const container = document.getElementById('graph-container');
  const data = await api('/api/graph');
  document.getElementById('graph-svg').innerHTML = '';

  const width = container.clientWidth;
  const height = container.clientHeight;
  const svg = d3.select('#graph-svg');

  svg.append('defs').selectAll('marker')
    .data(['calls','delegates','emits','navigates','depends_on','parent'])
    .join('marker').attr('id', d => 'arrow-' + d)
    .attr('viewBox','0 -5 10 10').attr('refX',20).attr('refY',0)
    .attr('markerWidth',6).attr('markerHeight',6).attr('orient','auto')
    .append('path').attr('d','M0,-5L10,0L0,5').attr('class','arrow');

  const g = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.1,5]).on('zoom', e => g.attr('transform', e.transform)));

  const sim = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.links).id(d => d.id).distance(d => d.type === 'depends_on' ? 150 : 100))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width/2, height/2))
    .force('collision', d3.forceCollide(40));

  const link = g.selectAll('.link').data(data.links).join('line')
    .attr('class', d => 'link ' + d.type)
    .attr('marker-end', d => 'url(#arrow-' + d.type + ')');

  const node = g.selectAll('.node').data(data.nodes).join('g')
    .call(d3.drag().on('start', dragStart).on('drag', dragged).on('end', dragEnd));

  node.append('circle')
    .attr('r', d => d.type === 'flow' ? 20 : 12 + (d.rank || 0) * 500)
    .attr('class', d => {
      if (d.type === 'flow') return 'node-flow' + (d.active ? ' active' : '');
      return 'node-method' + (d.muted ? ' muted' : '');
    });

  node.append('text')
    .attr('class', d => d.type === 'flow' ? 'node-label' : 'node-label node-label-method')
    .attr('dy', d => d.type === 'flow' ? 32 : 22)
    .text(d => d.type === 'flow' ? d.id : d.id.split('.').pop());

  // Click flow → navigate to detail
  node.filter(d => d.type === 'flow').on('click', (e, d) => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-tab="detail"]').classList.add('active');
    document.getElementById('tab-detail').style.display = '';
    document.getElementById('tab-graph').style.display = 'none';
    selectFlow(d.id);
  });

  const tooltip = document.getElementById('tooltip');
  node.on('mouseover', (e, d) => {
    let html = '<div class="tt-title">' + d.id + '</div>';
    if (d.type === 'flow') {
      html += '<div class="tt-detail">Type: Flow</div>';
      html += '<div class="tt-detail">Active: ' + (d.active ? '✅' : '❌') + '</div>';
      html += '<div class="tt-detail">Methods: ' + d.methodCount + '</div>';
      if (d.mutedCount) html += '<div class="tt-detail">Muted: ' + d.mutedCount + '</div>';
      if (d.description) html += '<div class="tt-detail">' + d.description + '</div>';
    } else {
      html += '<div class="tt-detail">Type: Method</div>';
      if (d.muted) html += '<div class="tt-detail">⚠ MUTED</div>';
      html += '<div class="tt-detail">PageRank: ' + (d.rank || 0) + '</div>';
      if (d.flows?.length) html += '<div class="tt-detail">Flows: ' + d.flows.join(', ') + '</div>';
    }
    tooltip.innerHTML = html;
    tooltip.style.opacity = 1;
    tooltip.style.left = (e.pageX + 12) + 'px';
    tooltip.style.top = (e.pageY - 12) + 'px';
  }).on('mouseout', () => { tooltip.style.opacity = 0; });

  sim.on('tick', () => {
    link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
    node.attr('transform', d => 'translate('+d.x+','+d.y+')');
  });

  function dragStart(e,d){if(!e.active)sim.alphaTarget(0.3).restart();d.fx=d.x;d.fy=d.y;}
  function dragged(e,d){d.fx=e.x;d.fy=e.y;}
  function dragEnd(e,d){if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null;}
}

// ─── Toast ───
function toast(text, sub) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<span class="t-icon">✓</span><div><div class="t-text">' + text + '</div>' + (sub ? '<div class="t-sub">' + sub + '</div>' : '') + '</div>';
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.2s'; setTimeout(() => el.remove(), 200); }, 3000);
}

// ─── API Helper ───
async function api(url, body) {
  const opts = body ? { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) } : {};
  const res = await fetch(API + url, opts);
  return res.json();
}

// ─── Keyboard ───
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); document.getElementById('search').focus(); }
  if (e.key === 'Escape') { document.getElementById('search').value = ''; document.getElementById('search').blur(); renderSidebar(); }
});

init();
</script>
</body>
</html>`;
}

// CLI entry
if (process.argv[1]?.includes('web-server')) {
  const root = process.argv[2] ?? '.';
  const graphPath = path.join(root, '.ats', 'flow_graph.json');
  startWebServer(graphPath);
}
