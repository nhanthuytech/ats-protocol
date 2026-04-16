import { FlowGraph } from '../core/flow-graph.js';

/** ats_impact — Bidirectional DFS blast radius analysis */
export function impactTool(graph: FlowGraph, args: Record<string, unknown>) {
  const method = args.method as string;
  const edges = graph.edges;

  const callers = edges.filter(e => e.to === method).map(e => ({ method: e.from, type: e.type, condition: e.condition }));
  const callees = edges.filter(e => e.from === method).map(e => ({ method: e.to, type: e.type, condition: e.condition }));

  const affectedFlows = new Set<string>();
  for (const f of graph.flowsForMethod(method)) affectedFlows.add(f);
  for (const c of callers) for (const f of graph.flowsForMethod(c.method)) affectedFlows.add(f);
  for (const c of callees) for (const f of graph.flowsForMethod(c.method)) affectedFlows.add(f);

  const risk = affectedFlows.size >= 3 || callers.length >= 3 ? 'high'
    : affectedFlows.size >= 2 || callers.length >= 1 ? 'medium' : 'low';

  return {
    method,
    callers,
    callees,
    affected_flows: [...affectedFlows],
    risk,
    recommendation: risk === 'high'
      ? 'Critical junction. Test thoroughly before changing.'
      : risk === 'medium'
        ? 'Affects multiple flows. Review upstream callers.'
        : 'Low impact. Safe to modify.',
  };
}
