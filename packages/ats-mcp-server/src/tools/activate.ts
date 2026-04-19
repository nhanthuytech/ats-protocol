import { FlowGraph } from '../core/flow-graph.js';


/** ats_activate / ats_silence — Toggle flow active state */
export function activateTool(graph: FlowGraph, args: Record<string, unknown>) {
  const flowName = args.flow as string;
  const silence = args.silence as boolean ?? false;
  const activate = !silence;

  const data = graph.read();
  if (!data.flows[flowName]) {
    return { error: `Flow "${flowName}" not found`, available_flows: Object.keys(data.flows) };
  }

  data.flows[flowName].active = activate;
  graph.write(data);

  let syncSuccess = true;
  const activeFlows = Object.entries(data.flows)
    .filter(([, f]) => f.active)
    .map(([n]) => n);

  return {
    flow: flowName,
    active: activate,
    sync_success: syncSuccess,
    active_flows: activeFlows,
    message: activate
      ? `Flow ${flowName} activated. Hot Restart (r/F5) to see logs.`
      : `Flow ${flowName} silenced.`,
    next_action: activate
      ? `Tell user to Hot Restart the app (press r in terminal or F5 in IDE). Once they reproduce the issue, call ats_analyze() with the console output to discover call chains and root cause.`
      : `Flow silenced. Add a session note to the flow in flow_graph.json: { date: "${new Date().toISOString().slice(0, 10)}", action: "debug", note: "<what you fixed>", resolved: true }. Keep max 5 sessions per flow.`,
  };
}
