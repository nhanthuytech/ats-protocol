import { FlowGraph } from '../core/flow-graph.js';

/** ats_graph — Export DAG as Mermaid diagram */
export function graphTool(graph: FlowGraph, args: Record<string, unknown>) {
  const includeMethods = args.include_methods as boolean ?? false;
  const flows = graph.flows;
  const edges = graph.edges;

  const lines: string[] = ['graph TD'];
  const connected = new Set<string>();

  for (const [name, flow] of Object.entries(flows)) {
    if (flow.active) lines.push(`    style ${name} fill:#4CAF50,color:#fff`);
    for (const dep of flow.depends_on ?? []) {
      lines.push(`    ${dep} --> ${name}`);
      connected.add(dep);
      connected.add(name);
    }
    if (flow.parent) {
      lines.push(`    ${flow.parent} -.-> ${name}`);
      connected.add(flow.parent);
      connected.add(name);
    }
  }

  for (const name of Object.keys(flows)) {
    if (!connected.has(name)) lines.push(`    ${name}`);
  }

  if (includeMethods && edges.length > 0) {
    lines.push('');
    for (const e of edges) {
      const from = e.from.replace(/\./g, '_');
      const to = e.to.replace(/\./g, '_');
      lines.push(`    ${from}["${e.from}"] -->|${e.type}| ${to}["${e.to}"]`);
    }
  }

  return { format: 'mermaid', diagram: lines.join('\n'), stats: { flows: Object.keys(flows).length, edges: edges.length } };
}
