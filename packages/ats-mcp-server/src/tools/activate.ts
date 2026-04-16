import { FlowGraph } from '../core/flow-graph.js';
import { execSync } from 'child_process';

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

  // Try to run ats sync
  let syncSuccess = false;
  try {
    execSync('ats sync', { cwd: graph.projectRoot, stdio: 'pipe' });
    syncSuccess = true;
  } catch { syncSuccess = false; }

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
  };
}
