import * as fs from 'fs';
import * as path from 'path';
import { FlowGraph } from '../core/flow-graph.js';
import { DAG } from '../core/dag.js';

/** ats_validate — Check graph integrity (V6: global_classes, priority, muted validation) */
export function validateTool(graph: FlowGraph, args: Record<string, unknown>) {
  const data = graph.read();
  const flows = data.flows;
  const edges = data.edges ?? [];
  const issues: Array<Record<string, unknown>> = [];

  // 1. Cycle detection
  if (DAG.hasCycle(flows)) {
    issues.push({ type: 'cycle', message: 'Circular dependency detected in depends_on' });
  }

  // 2. Invalid depends_on references
  for (const [name, flow] of Object.entries(flows)) {
    for (const dep of flow.depends_on ?? []) {
      if (!flows[dep]) {
        issues.push({ type: 'missing_dependency', flow: name, depends_on: dep, message: `"${name}" depends on "${dep}" which does not exist` });
      }
    }
    if (flow.parent && !flows[flow.parent]) {
      issues.push({ type: 'missing_parent', flow: name, parent: flow.parent, message: `"${name}" has parent "${flow.parent}" which does not exist` });
    }
  }

  // 3. Invalid edge references
  const allMethods = graph.allMethodKeys();
  for (const edge of edges) {
    if (edge.from && !allMethods.has(edge.from)) {
      issues.push({ type: 'stale_edge', edge_from: edge.from, message: `Edge from "${edge.from}" references unknown method` });
    }
    if (edge.to && !allMethods.has(edge.to)) {
      issues.push({ type: 'stale_edge', edge_to: edge.to, message: `Edge to "${edge.to}" references unknown method` });
    }
    // V6: Validate trigger enum
    if (edge.trigger) {
      const validTriggers = ['user_tap', 'user_input', 'api_response', 'bloc_event', 'lifecycle', 'timer', 'system'];
      if (!validTriggers.includes(edge.trigger)) {
        issues.push({ type: 'invalid_trigger', edge: `${edge.from}->${edge.to}`, trigger: edge.trigger, message: `Invalid trigger "${edge.trigger}". Valid: ${validTriggers.join(', ')}` });
      }
    }
  }

  // 4. V6: Validate priority values
  for (const [name, flow] of Object.entries(flows)) {
    if (flow.priority && !['high', 'normal', 'low'].includes(flow.priority)) {
      issues.push({ type: 'invalid_priority', flow: name, priority: flow.priority, message: `Invalid priority "${flow.priority}". Valid: high, normal, low` });
    }
  }

  // 5. V6: Validate muted methods are subset of methods
  const validateClassMuted = (className: string, classValue: unknown, location: string) => {
    if (typeof classValue === 'object' && classValue !== null && !Array.isArray(classValue)) {
      const entry = classValue as { methods?: string[]; muted?: string[] };
      if (entry.muted && entry.methods) {
        for (const m of entry.muted) {
          if (!entry.methods.includes(m)) {
            issues.push({ type: 'invalid_muted', location, class: className, method: m, message: `Muted method "${m}" not found in methods array of "${className}" in ${location}` });
          }
        }
      }
    }
  };

  // Validate global_classes muted
  if (data.global_classes) {
    for (const [className, classValue] of Object.entries(data.global_classes)) {
      validateClassMuted(className, classValue, 'global_classes');
    }
  }

  // Validate per-flow class muted
  for (const [flowName, flow] of Object.entries(flows)) {
    for (const [className, classValue] of Object.entries(flow.classes)) {
      validateClassMuted(className, classValue, flowName);
    }
  }

  // 6. Scan source files for stale classes
  const libDir = path.join(graph.projectRoot, 'lib');
  if (fs.existsSync(libDir)) {
    const sourceClasses = new Set<string>();
    const scanDir = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scanDir(full);
        else if (entry.name.endsWith('.dart') || entry.name.endsWith('.ts') || entry.name.endsWith('.py')) {
          const content = fs.readFileSync(full, 'utf-8');
          for (const m of content.matchAll(/(?:export\s+)?class\s+(\w+)/g)) sourceClasses.add(m[1]);
        }
      }
    };
    scanDir(libDir);

    // Check flow classes
    for (const [name, flow] of Object.entries(flows)) {
      for (const className of Object.keys(flow.classes)) {
        if (!sourceClasses.has(className)) {
          issues.push({ type: 'missing_class', flow: name, class: className, message: `Class "${className}" in "${name}" not found in source` });
        }
      }
    }

    // V6: Check global_classes
    if (data.global_classes) {
      for (const className of Object.keys(data.global_classes)) {
        if (!sourceClasses.has(className)) {
          issues.push({ type: 'missing_class', location: 'global_classes', class: className, message: `Class "${className}" in global_classes not found in source` });
        }
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    stats: {
      total_flows: Object.keys(flows).length,
      total_methods: allMethods.size,
      total_edges: edges.length,
      global_classes: Object.keys(data.global_classes ?? {}).length,
      issues_found: issues.length,
    },
  };
}
