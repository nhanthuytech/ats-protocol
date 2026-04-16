import * as fs from 'fs';
import * as path from 'path';
import { FlowGraph } from '../core/flow-graph.js';
import { DAG } from '../core/dag.js';

/** ats_validate — Check graph integrity */
export function validateTool(graph: FlowGraph, args: Record<string, unknown>) {
  const flows = graph.flows;
  const edges = graph.edges;
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
  }

  // 4. Scan source files for stale classes
  const libDir = path.join(graph.projectRoot, 'lib');
  if (fs.existsSync(libDir)) {
    const dartClasses = new Set<string>();
    const scanDir = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scanDir(full);
        else if (entry.name.endsWith('.dart') || entry.name.endsWith('.ts') || entry.name.endsWith('.py')) {
          const content = fs.readFileSync(full, 'utf-8');
          // Dart: class ClassName
          for (const m of content.matchAll(/class\s+(\w+)/g)) dartClasses.add(m[1]);
          // TypeScript: class ClassName / export class
          for (const m of content.matchAll(/(?:export\s+)?class\s+(\w+)/g)) dartClasses.add(m[1]);
          // Python: class ClassName
          for (const m of content.matchAll(/class\s+(\w+)/g)) dartClasses.add(m[1]);
        }
      }
    };
    scanDir(libDir);

    for (const [name, flow] of Object.entries(flows)) {
      for (const className of Object.keys(flow.classes)) {
        if (!dartClasses.has(className)) {
          issues.push({ type: 'missing_class', flow: name, class: className, message: `Class "${className}" in "${name}" not found in source` });
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
      issues_found: issues.length,
    },
  };
}
