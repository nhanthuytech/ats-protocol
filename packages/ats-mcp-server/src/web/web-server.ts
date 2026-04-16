import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { FlowGraph } from '../core/flow-graph.js';
import { DAG } from '../core/dag.js';

const PORT = 4567;

export function startWebServer(graphPath: string) {
  const graph = new FlowGraph(graphPath);

  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(getHtml());
    } else if (req.url === '/api/graph') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      const data = graph.read();
      const ranks = DAG.pageRank(data.edges ?? []);
      const centrality = DAG.betweennessCentrality(data.edges ?? []);

      // Build nodes + links for D3
      const nodes: Array<Record<string, unknown>> = [];
      const links: Array<Record<string, unknown>> = [];
      const nodeSet = new Set<string>();

      // Flow nodes
      for (const [name, flow] of Object.entries(data.flows)) {
        nodes.push({
          id: name,
          type: 'flow',
          active: flow.active ?? false,
          description: flow.description ?? '',
          methodCount: Object.values(flow.classes).reduce((a, c) => a + FlowGraph.methodsFromClass(c).length, 0),
        });
        nodeSet.add(name);

        for (const dep of flow.depends_on ?? []) {
          links.push({ source: dep, target: name, type: 'depends_on' });
        }
        if (flow.parent) {
          links.push({ source: flow.parent, target: name, type: 'parent' });
        }
      }

      // Method nodes (if edges exist)
      for (const edge of data.edges ?? []) {
        if (!nodeSet.has(edge.from)) {
          nodeSet.add(edge.from);
          nodes.push({
            id: edge.from,
            type: 'method',
            rank: Math.round((ranks.get(edge.from) ?? 0) * 10000) / 10000,
            centrality: Math.round((centrality.get(edge.from) ?? 0) * 100) / 100,
            flows: graph.flowsForMethod(edge.from),
          });
        }
        if (!nodeSet.has(edge.to)) {
          nodeSet.add(edge.to);
          nodes.push({
            id: edge.to,
            type: 'method',
            rank: Math.round((ranks.get(edge.to) ?? 0) * 10000) / 10000,
            centrality: Math.round((centrality.get(edge.to) ?? 0) * 100) / 100,
            flows: graph.flowsForMethod(edge.to),
          });
        }
        links.push({ source: edge.from, target: edge.to, type: edge.type });
      }

      res.end(JSON.stringify({ nodes, links, stats: { flows: Object.keys(data.flows).length, edges: (data.edges ?? []).length } }));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(PORT, () => {
    console.log(`\n🧠 ATS DAG Visualization: http://localhost:${PORT}\n`);
  });
}

function getHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ATS Flow Graph — DAG Visualization</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0d1117; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; overflow: hidden; }
    #header { position: fixed; top: 0; left: 0; right: 0; z-index: 10; padding: 16px 24px; background: linear-gradient(180deg, #0d1117 0%, transparent 100%); display: flex; align-items: center; gap: 16px; }
    #header h1 { font-size: 18px; color: #58a6ff; font-weight: 600; }
    #header .stats { font-size: 13px; color: #8b949e; }
    #header .legend { margin-left: auto; display: flex; gap: 16px; font-size: 12px; }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
    svg { width: 100vw; height: 100vh; }
    .link { stroke-opacity: 0.4; fill: none; }
    .link.depends_on { stroke: #58a6ff; stroke-width: 2; }
    .link.parent { stroke: #8b949e; stroke-width: 1.5; stroke-dasharray: 5,5; }
    .link.calls { stroke: #3fb950; stroke-width: 1.5; }
    .link.delegates { stroke: #d29922; stroke-width: 1.5; }
    .link.emits { stroke: #f85149; stroke-width: 1.5; }
    .link.navigates { stroke: #bc8cff; stroke-width: 1.5; }
    .node-flow { fill: #1f6feb; stroke: #58a6ff; stroke-width: 2; cursor: pointer; }
    .node-flow.active { fill: #238636; stroke: #3fb950; }
    .node-method { fill: #21262d; stroke: #30363d; stroke-width: 1.5; cursor: pointer; }
    .node-label { font-size: 11px; fill: #c9d1d9; text-anchor: middle; pointer-events: none; font-weight: 500; }
    .node-label-method { font-size: 9px; fill: #8b949e; }
    .arrow { fill: #8b949e; }
    #tooltip { position: fixed; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px 16px; font-size: 12px; pointer-events: none; opacity: 0; transition: opacity 0.15s; max-width: 300px; z-index: 20; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
    #tooltip .title { font-weight: 600; color: #58a6ff; margin-bottom: 4px; }
    #tooltip .detail { color: #8b949e; margin: 2px 0; }
  </style>
</head>
<body>
  <div id="header">
    <h1>🧠 ATS Flow Graph</h1>
    <span class="stats" id="stats"></span>
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background:#1f6feb"></div>Flow</div>
      <div class="legend-item"><div class="legend-dot" style="background:#238636"></div>Active</div>
      <div class="legend-item"><div class="legend-dot" style="background:#21262d;border:1px solid #30363d"></div>Method</div>
      <div class="legend-item"><div class="legend-dot" style="background:#3fb950"></div>calls</div>
      <div class="legend-item"><div class="legend-dot" style="background:#d29922"></div>delegates</div>
    </div>
  </div>
  <div id="tooltip"></div>
  <svg id="graph"></svg>

  <script>
    fetch('/api/graph').then(r => r.json()).then(data => {
      document.getElementById('stats').textContent = data.stats.flows + ' flows · ' + data.stats.edges + ' edges · ' + data.nodes.length + ' nodes';

      const width = window.innerWidth;
      const height = window.innerHeight;
      const svg = d3.select('#graph');

      // Arrow markers
      svg.append('defs').selectAll('marker')
        .data(['calls', 'delegates', 'emits', 'navigates', 'depends_on', 'parent'])
        .join('marker')
        .attr('id', d => 'arrow-' + d)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 20).attr('refY', 0)
        .attr('markerWidth', 6).attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path').attr('d', 'M0,-5L10,0L0,5')
        .attr('class', 'arrow');

      const g = svg.append('g');

      // Zoom
      svg.call(d3.zoom().scaleExtent([0.1, 5]).on('zoom', e => g.attr('transform', e.transform)));

      const sim = d3.forceSimulation(data.nodes)
        .force('link', d3.forceLink(data.links).id(d => d.id).distance(d => d.type === 'depends_on' ? 150 : 100))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide(40));

      const link = g.selectAll('.link')
        .data(data.links).join('line')
        .attr('class', d => 'link ' + d.type)
        .attr('marker-end', d => 'url(#arrow-' + d.type + ')');

      const node = g.selectAll('.node')
        .data(data.nodes).join('g')
        .call(d3.drag().on('start', dragStart).on('drag', dragged).on('end', dragEnd));

      node.append('circle')
        .attr('r', d => d.type === 'flow' ? 20 : 12 + (d.rank || 0) * 500)
        .attr('class', d => d.type === 'flow' ? ('node-flow' + (d.active ? ' active' : '')) : 'node-method');

      node.append('text')
        .attr('class', d => d.type === 'flow' ? 'node-label' : 'node-label node-label-method')
        .attr('dy', d => d.type === 'flow' ? 32 : 22)
        .text(d => d.type === 'flow' ? d.id : d.id.split('.').pop());

      // Tooltip
      const tooltip = document.getElementById('tooltip');
      node.on('mouseover', (e, d) => {
        let html = '<div class="title">' + d.id + '</div>';
        if (d.type === 'flow') {
          html += '<div class="detail">Type: Flow</div>';
          html += '<div class="detail">Active: ' + (d.active ? '✅' : '❌') + '</div>';
          html += '<div class="detail">Methods: ' + d.methodCount + '</div>';
          if (d.description) html += '<div class="detail">' + d.description + '</div>';
        } else {
          html += '<div class="detail">Type: Method</div>';
          html += '<div class="detail">PageRank: ' + (d.rank || 0) + '</div>';
          html += '<div class="detail">Centrality: ' + (d.centrality || 0) + '</div>';
          if (d.flows?.length) html += '<div class="detail">Flows: ' + d.flows.join(', ') + '</div>';
        }
        tooltip.innerHTML = html;
        tooltip.style.opacity = 1;
        tooltip.style.left = (e.pageX + 12) + 'px';
        tooltip.style.top = (e.pageY - 12) + 'px';
      }).on('mouseout', () => { tooltip.style.opacity = 0; });

      sim.on('tick', () => {
        link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
        node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
      });

      function dragStart(e, d) { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
      function dragged(e, d) { d.fx = e.x; d.fy = e.y; }
      function dragEnd(e, d) { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }
    });
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
