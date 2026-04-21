import { FlowGraph } from '../core/flow-graph.js';

/**
 * ats_mute / ats_unmute — Mute or unmute methods via MCP tool.
 * Previously only available through web dashboard REST API.
 */
export function muteTool(graph: FlowGraph, args: Record<string, unknown>) {
  const className = args.className as string;
  const methodName = args.methodName as string;
  const mute = (args.mute as boolean) ?? true;

  if (!className || !methodName) {
    return { error: 'className and methodName are required' };
  }

  const data = graph.read();
  let found = false;

  // Check global_classes first
  if (data.global_classes) {
    const classEntry = data.global_classes[className];
    if (classEntry && typeof classEntry === 'object' && !Array.isArray(classEntry)) {
      const obj = classEntry as { methods: string[]; muted?: string[] };
      if (obj.methods.includes(methodName)) {
        if (!obj.muted) obj.muted = [];
        if (mute && !obj.muted.includes(methodName)) {
          obj.muted.push(methodName);
          found = true;
        } else if (!mute) {
          const idx = obj.muted.indexOf(methodName);
          if (idx >= 0) { obj.muted.splice(idx, 1); found = true; }
        }
      }
    }
  }

  // Check flow-specific classes
  for (const [, flow] of Object.entries(data.flows)) {
    const classEntry = flow.classes[className];
    if (!classEntry) continue;

    // Ensure V4+ format
    let classObj: { methods: string[]; muted?: string[]; needs_verify?: boolean; last_verified?: string };
    if (Array.isArray(classEntry)) {
      classObj = { methods: classEntry };
      flow.classes[className] = classObj;
    } else {
      classObj = classEntry as typeof classObj;
    }

    if (!classObj.methods.includes(methodName)) continue;
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
    return { error: `${className}.${methodName} not found or already ${mute ? 'muted' : 'unmuted'}` };
  }

  graph.write(data);

  return {
    success: true,
    action: mute ? 'muted' : 'unmuted',
    method: `${className}.${methodName}`,
    next_action: 'Hot Restart to apply changes. Muted methods remain in the graph but produce no log output.',
  };
}
