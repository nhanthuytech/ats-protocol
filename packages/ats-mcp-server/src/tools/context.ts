import { FlowGraph, FlowEntry } from '../core/flow-graph.js';
import { DAG } from '../core/dag.js';

/** ats_context — Topological-sorted context for a flow */
export function contextTool(graph: FlowGraph, args: Record<string, unknown>) {
  const flowName = args.flow as string;
  const maxDepth = (args.depth as number) ?? 2;
  const allFlows = graph.flows;

  if (!allFlows[flowName]) {
    return { error: `Flow "${flowName}" not found`, available_flows: Object.keys(allFlows) };
  }

  // Collect upstream flows via BFS on depends_on
  const visited = new Set<string>();
  const ordered: string[] = [];

  function collectUpstream(name: string, depth: number) {
    if (visited.has(name) || !allFlows[name]) return;
    visited.add(name);
    if (depth < maxDepth) {
      for (const dep of allFlows[name].depends_on ?? []) {
        collectUpstream(dep, depth + 1);
      }
    }
    ordered.push(name); // topological: add after dependencies
  }

  collectUpstream(flowName, 0);

  // Build context for each flow
  const flowContexts = ordered.map(name => {
    const flow = allFlows[name];
    const classes: Record<string, string[]> = {};
    for (const [cn, cv] of Object.entries(flow.classes)) {
      classes[cn] = FlowGraph.methodsFromClass(cv);
    }

    const children = Object.entries(allFlows)
      .filter(([, f]) => f.parent === name)
      .map(([n]) => n);

    return {
      name,
      description: flow.description ?? '',
      active: flow.active ?? false,
      depends_on: flow.depends_on ?? [],
      classes,
      sub_flows: children,
      sessions: (flow.sessions ?? []).slice(-5),
      known_issues: flow.known_issues ?? [],
    };
  });

  // Collect relevant edges
  const relevantKeys = new Set<string>();
  for (const ctx of flowContexts) {
    for (const [cn, methods] of Object.entries(ctx.classes)) {
      for (const m of methods) relevantKeys.add(`${cn}.${m}`);
    }
  }

  const relevantEdges = graph.edges.filter(e =>
    relevantKeys.has(e.from) || relevantKeys.has(e.to)
  );

  return { target_flow: flowName, context_flows: flowContexts, edges: relevantEdges, traversal_depth: maxDepth };
}
