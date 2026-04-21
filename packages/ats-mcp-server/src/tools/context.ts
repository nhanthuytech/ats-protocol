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
    const classes: Record<string, { methods: string[]; muted: string[] }> = {};
    for (const [cn, cv] of Object.entries(flow.classes)) {
      const methods = FlowGraph.methodsFromClass(cv);
      const muted = (typeof cv === 'object' && cv !== null && !Array.isArray(cv) && 'muted' in cv)
        ? ((cv as { muted?: string[] }).muted ?? []) : [];
      classes[cn] = { methods, muted };
    }

    const children = Object.entries(allFlows)
      .filter(([, f]) => f.parent === name)
      .map(([n]) => n);

    return {
      name,
      description: flow.description ?? '',
      active: flow.active ?? false,
      priority: flow.priority ?? 'normal',
      depends_on: flow.depends_on ?? [],
      classes,
      sub_flows: children,
      sessions: (flow.sessions ?? []).slice(-5),
      known_issues: flow.known_issues ?? [],
    };
  });

  // Use edge index for O(1) lookup instead of O(n) filter
  const relevantEdges = graph.edgesForFlow(flowName);

  // Global classes summary (condensed — just names + method counts)
  const data = graph.read();
  const globalSummary = data.global_classes
    ? Object.entries(data.global_classes).map(([cn, cv]) => ({
        class: cn,
        method_count: FlowGraph.methodsFromClass(cv).length,
      }))
    : [];

  const hasActiveFlow = flowContexts.some(f => f.active);
  const targetActive = allFlows[flowName]?.active ?? false;

  return {
    target_flow: flowName,
    context_flows: flowContexts,
    global_classes: globalSummary,
    edges: relevantEdges,
    traversal_depth: maxDepth,
    next_action: targetActive
      ? `Flow ${flowName} is already ACTIVE. Hot Restart if not done yet. Read logs and call ats_analyze() with console output.`
      : hasActiveFlow
        ? `Some upstream flows are active. If debugging, call ats_activate('${flowName}'). Otherwise, proceed with task — context is loaded.`
        : `Context loaded for ${flowName}. If debugging: call ats_activate('${flowName}') then tell user to Hot Restart. If developing: add ATS.trace() to new methods and register them in the graph.`,
  };
}
