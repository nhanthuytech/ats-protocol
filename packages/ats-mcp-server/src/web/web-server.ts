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

      // ─── Static Assets (CSS, JS) ───
      if (pathname.startsWith('/css/') || pathname.startsWith('/js/')) {
        const webDir = getWebDir();
        const filePath = path.join(webDir, pathname);
        // Security: prevent path traversal
        if (!filePath.startsWith(webDir)) {
          res.writeHead(403); res.end('Forbidden'); return;
        }
        if (fs.existsSync(filePath)) {
          const ext = path.extname(filePath);
          const mimeTypes: Record<string, string> = {
            '.css': 'text/css',
            '.js': 'application/javascript',
          };
          res.writeHead(200, {
            'Content-Type': mimeTypes[ext] || 'application/octet-stream',
            'Cache-Control': 'public, max-age=3600',
          });
          res.end(fs.readFileSync(filePath, 'utf-8'));
          return;
        }
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
      priority: flow.priority ?? 'normal',
      methodCount,
      mutedCount,
      classCount: Object.keys(flow.classes).length,
      edgeCount: graph.edgesForFlow(name).length,
      sessionCount: (flow.sessions ?? []).length,
    };
  });

  // Global classes summary
  const globalClasses = data.global_classes ?? {};
  let globalMethodCount = 0;
  let globalMutedCount = 0;
  for (const cv of Object.values(globalClasses)) {
    globalMethodCount += FlowGraph.methodsFromClass(cv).length;
    if (typeof cv === 'object' && cv !== null && !Array.isArray(cv) && 'muted' in cv) {
      globalMutedCount += ((cv as any).muted ?? []).length;
    }
  }

  json(res, { flows, project: data.project, globalClasses: { classCount: Object.keys(globalClasses).length, methodCount: globalMethodCount, mutedCount: globalMutedCount } });
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

  // V6: global_classes that are relevant to this flow
  const globalClasses = data.global_classes ? Object.entries(data.global_classes).map(([className, classValue]) => {
    const methods = FlowGraph.methodsFromClass(classValue);
    const muted: string[] = (typeof classValue === 'object' && classValue !== null && !Array.isArray(classValue))
      ? ((classValue as any).muted ?? []) : [];
    const methodDetails = methods.map(m => {
      const key = `${className}.${m}`;
      const callers = (data.edges ?? []).filter(e => e.to === key).length;
      const callees = (data.edges ?? []).filter(e => e.from === key).length;
      return { name: m, muted: muted.includes(m), callers, callees };
    });
    return { name: className, methods: methodDetails, enabledCount: methods.length - muted.length, totalCount: methods.length, isGlobal: true };
  }) : [];

  // V6: Use edge index for O(1) lookup
  const edges = graph.edgesForFlow(name);

  json(res, {
    name,
    description: flow.description ?? '',
    active: flow.active ?? false,
    priority: flow.priority ?? 'normal',
    depends_on: flow.depends_on ?? [],
    classes,
    globalClasses,
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
    nodes.push({ id: name, type: 'flow', active: flow.active ?? false, priority: flow.priority ?? 'normal', description: flow.description ?? '', methodCount, mutedCount });
    nodeSet.add(name);
    for (const dep of flow.depends_on ?? []) links.push({ source: dep, target: name, type: 'depends_on' });
    if (flow.parent) links.push({ source: flow.parent, target: name, type: 'parent' });
  }

  for (const edge of data.edges ?? []) {
    for (const id of [edge.from, edge.to]) {
      if (!nodeSet.has(id)) {
        nodeSet.add(id);
        // Check if this method is muted (in flows or global_classes)
        let isMuted = false;
        const isGlobal = graph.isGlobalMethod(id);
        const [cls, method] = id.split('.');
        // Check global_classes
        if (data.global_classes?.[cls]) {
          const ce = data.global_classes[cls];
          if (typeof ce === 'object' && !Array.isArray(ce) && (ce as any).muted?.includes(method)) {
            isMuted = true;
          }
        }
        // Check flow classes
        if (!isMuted) {
          for (const flow of Object.values(data.flows)) {
            const ce = flow.classes[cls];
            if (ce && typeof ce === 'object' && !Array.isArray(ce) && (ce as any).muted?.includes(method)) {
              isMuted = true; break;
            }
          }
        }
        nodes.push({
          id, type: 'method', muted: isMuted, isGlobal,
          rank: Math.round((ranks.get(id) ?? 0) * 10000) / 10000,
          centrality: Math.round((centrality.get(id) ?? 0) * 100) / 100,
          flows: graph.flowsForMethod(id),
        });
      }
    }
    links.push({ source: edge.from, target: edge.to, type: edge.type, trigger: edge.trigger, state_impact: edge.state_impact });
  }

  const globalClassCount = Object.keys(data.global_classes ?? {}).length;
  json(res, { nodes, links, stats: { flows: Object.keys(data.flows).length, edges: (data.edges ?? []).length, nodes: nodes.length, globalClasses: globalClassCount } });
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

// ─── Web Directory Resolution ───

let _webDir: string | null = null;

function getWebDir(): string {
  if (_webDir) return _webDir;
  const candidates = [
    path.dirname(new URL(import.meta.url).pathname),                              // dist/web
    path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'src', 'web'), // src/web (dev)
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'dashboard.html'))) {
      _webDir = dir;
      return dir;
    }
  }
  return candidates[0]; // fallback
}

let _dashboardHtmlCache: string | null = null;

function getDashboardHtml(): string {
  if (_dashboardHtmlCache) return _dashboardHtmlCache;
  const htmlPath = path.join(getWebDir(), 'dashboard.html');
  if (fs.existsSync(htmlPath)) {
    _dashboardHtmlCache = fs.readFileSync(htmlPath, 'utf-8');
    return _dashboardHtmlCache;
  }
  return '<html><body><h1>Dashboard HTML not found</h1></body></html>';
}

// CLI entry
if (process.argv[1]?.includes('web-server')) {
  const root = process.argv[2] ?? '.';
  const graphPath = path.join(root, '.ats', 'flow_graph.json');
  startWebServer(graphPath);
}
