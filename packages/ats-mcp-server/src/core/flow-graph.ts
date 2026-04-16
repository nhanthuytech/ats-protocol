import * as fs from 'fs';
import * as path from 'path';

export interface FlowEntry {
  description?: string;
  active?: boolean;
  depends_on?: string[];
  parent?: string;
  tags?: string[];
  classes: Record<string, string[] | { methods: string[]; needs_verify?: boolean; last_verified?: string }>;
  known_issues?: string[];
  last_debugged?: string;
  sessions?: SessionEntry[];
}

export interface SessionEntry {
  date: string;
  action: 'debug' | 'refactor' | 'update' | 'feature';
  note: string;
  resolved?: boolean;
}

export interface Edge {
  from: string;
  to: string;
  type: 'calls' | 'delegates' | 'emits' | 'navigates';
  condition?: string;
}

export interface FlowGraphData {
  ats_version: string;
  project: string;
  updated_at: string;
  flows: Record<string, FlowEntry>;
  edges?: Edge[];
}

export class FlowGraph {
  constructor(private graphPath: string) {}

  read(): FlowGraphData {
    if (!fs.existsSync(this.graphPath)) {
      throw new Error(`flow_graph.json not found at ${this.graphPath}`);
    }
    return JSON.parse(fs.readFileSync(this.graphPath, 'utf-8'));
  }

  write(graph: FlowGraphData): void {
    graph.updated_at = new Date().toISOString();
    fs.writeFileSync(this.graphPath, JSON.stringify(graph, null, 2));
  }

  get flows(): Record<string, FlowEntry> {
    return this.read().flows;
  }

  get edges(): Edge[] {
    return this.read().edges ?? [];
  }

  /** Extract methods from a class entry (V3 array or V4 object) */
  static methodsFromClass(classValue: unknown): string[] {
    if (Array.isArray(classValue)) return classValue;
    if (typeof classValue === 'object' && classValue !== null && 'methods' in classValue) {
      return (classValue as { methods: string[] }).methods;
    }
    return [];
  }

  /** Build set of all "Class.method" keys across all flows */
  allMethodKeys(): Set<string> {
    const keys = new Set<string>();
    for (const flow of Object.values(this.flows)) {
      for (const [className, classValue] of Object.entries(flow.classes)) {
        for (const method of FlowGraph.methodsFromClass(classValue)) {
          keys.add(`${className}.${method}`);
        }
      }
    }
    return keys;
  }

  /** Find which flows a method belongs to */
  flowsForMethod(classMethod: string): string[] {
    const result: string[] = [];
    for (const [flowName, flow] of Object.entries(this.flows)) {
      for (const [className, classValue] of Object.entries(flow.classes)) {
        for (const method of FlowGraph.methodsFromClass(classValue)) {
          if (`${className}.${method}` === classMethod) {
            result.push(flowName);
          }
        }
      }
    }
    return result;
  }

  /** Get the project root directory from graph path */
  get projectRoot(): string {
    // graph is at <root>/.ats/flow_graph.json
    return path.resolve(path.dirname(this.graphPath), '..');
  }
}
