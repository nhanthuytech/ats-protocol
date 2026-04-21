import * as fs from 'fs';
import * as path from 'path';

export interface FlowEntry {
  description?: string;
  active?: boolean;
  priority?: 'high' | 'normal' | 'low';
  depends_on?: string[];
  parent?: string;
  tags?: string[];
  classes: Record<string, string[] | { methods: string[]; muted?: string[]; needs_verify?: boolean; last_verified?: string }>;
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
  trigger?: 'user_tap' | 'user_input' | 'api_response' | 'bloc_event' | 'lifecycle' | 'timer' | 'system';
  state_impact?: string;
  condition?: string;
}

export interface FlowGraphData {
  ats_version: string;
  project: string;
  updated_at: string;
  global_classes?: Record<string, string[] | { methods: string[]; muted?: string[]; needs_verify?: boolean; last_verified?: string }>;
  flows: Record<string, FlowEntry>;
  edges?: Edge[];
}

export class FlowGraph {
  // ── Cache ──
  private _cache: FlowGraphData | null = null;
  private _cacheMtime: number = 0;
  private _edgeIndex: Map<string, Edge[]> | null = null;

  constructor(private graphPath: string) { }

  read(): FlowGraphData {
    if (!fs.existsSync(this.graphPath)) {
      throw new Error(`flow_graph.json not found at ${this.graphPath}`);
    }

    // Cache: only re-parse if file has changed
    const stat = fs.statSync(this.graphPath);
    if (this._cache && stat.mtimeMs === this._cacheMtime) {
      return this._cache;
    }

    this._cache = JSON.parse(fs.readFileSync(this.graphPath, 'utf-8'));
    this._cacheMtime = stat.mtimeMs;
    this._edgeIndex = null; // invalidate edge index
    return this._cache!;
  }

  write(graph: FlowGraphData): void {
    graph.updated_at = new Date().toISOString();
    fs.writeFileSync(this.graphPath, JSON.stringify(graph, null, 2));
    // Invalidate cache
    this._cache = null;
    this._edgeIndex = null;
    this.syncGeneratedCode(graph);
  }

  get flows(): Record<string, FlowEntry> {
    return this.read().flows;
  }

  get edges(): Edge[] {
    return this.read().edges ?? [];
  }

  get globalClasses(): FlowGraphData['global_classes'] {
    return this.read().global_classes;
  }

  /** Extract methods from a class entry (V3 array or V4+ object) */
  static methodsFromClass(classValue: unknown): string[] {
    if (Array.isArray(classValue)) return classValue;
    if (typeof classValue === 'object' && classValue !== null && 'methods' in classValue) {
      return (classValue as { methods: string[] }).methods;
    }
    return [];
  }

  /** Build set of all "Class.method" keys across all flows + global_classes */
  allMethodKeys(): Set<string> {
    const keys = new Set<string>();
    const data = this.read();

    // Global classes
    if (data.global_classes) {
      for (const [className, classValue] of Object.entries(data.global_classes)) {
        for (const method of FlowGraph.methodsFromClass(classValue)) {
          keys.add(`${className}.${method}`);
        }
      }
    }

    // Flow-specific classes
    for (const flow of Object.values(data.flows)) {
      for (const [className, classValue] of Object.entries(flow.classes)) {
        for (const method of FlowGraph.methodsFromClass(classValue)) {
          keys.add(`${className}.${method}`);
        }
      }
    }
    return keys;
  }

  /** Find which flows a method belongs to (includes global_classes → all flows) */
  flowsForMethod(classMethod: string): string[] {
    const data = this.read();
    const result: string[] = [];

    // Check if method is in global_classes → belongs to ALL flows
    if (data.global_classes) {
      for (const [className, classValue] of Object.entries(data.global_classes)) {
        for (const method of FlowGraph.methodsFromClass(classValue)) {
          if (`${className}.${method}` === classMethod) {
            return Object.keys(data.flows);
          }
        }
      }
    }

    // Check flow-specific classes
    for (const [flowName, flow] of Object.entries(data.flows)) {
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

  /** O(1) edge lookup by flow name using computed index */
  edgesForFlow(flowName: string): Edge[] {
    if (!this._edgeIndex) {
      this._edgeIndex = this.buildEdgeIndex();
    }
    return this._edgeIndex.get(flowName) ?? [];
  }

  /** Build computed edge index: flowName → Edge[] */
  private buildEdgeIndex(): Map<string, Edge[]> {
    const data = this.read();
    const index = new Map<string, Edge[]>();

    for (const edge of data.edges ?? []) {
      const sourceFlows = this.flowsForMethod(edge.from);
      const targetFlows = this.flowsForMethod(edge.to);
      const allFlows = new Set([...sourceFlows, ...targetFlows]);

      for (const flow of allFlows) {
        if (!index.has(flow)) index.set(flow, []);
        index.get(flow)!.push(edge);
      }
    }

    return index;
  }

  /** Check if a method exists in global_classes */
  isGlobalMethod(classMethod: string): boolean {
    const data = this.read();
    if (!data.global_classes) return false;

    for (const [className, classValue] of Object.entries(data.global_classes)) {
      for (const method of FlowGraph.methodsFromClass(classValue)) {
        if (`${className}.${method}` === classMethod) return true;
      }
    }
    return false;
  }

  /** Get the project root directory from graph path */
  get projectRoot(): string {
    // graph is at <root>/.ats/flow_graph.json
    return path.resolve(path.dirname(this.graphPath), '..');
  }

  /**
   * Generates lib/generated/ats/ats_generated.g.dart directly from TypeScript.
   * V6: includes global_classes in method map + flow priorities.
   */
  private syncGeneratedCode(data: FlowGraphData): void {
    try {
      // ── Project Type Detection ──
      const isDart = fs.existsSync(path.join(this.projectRoot, 'pubspec.yaml'));

      if (!isDart) {
        // Node.js and Python runtimes can usually require()/load the JSON directly 
        // into memory at startup synchronously, so code-generation is unnecessary.
        return;
      }

      // ── Dart/Flutter Generators ──
      const activeFlows: string[] = [];
      const staticMap: Record<string, string[]> = {};
      const mutedMethods = new Set<string>();
      const flowPriorities: Record<string, string> = {};

      // Read ats.yaml if exists, otherwise fallback to defaults
      const atsYamlPath = path.join(this.projectRoot, 'ats.yaml');
      let outputDir = 'lib/generated/ats';
      let outputFile = 'ats_generated.g.dart';
      if (fs.existsSync(atsYamlPath)) {
        const yaml = fs.readFileSync(atsYamlPath, 'utf8');
        for (const line of yaml.split('\n')) {
          const tLine = line.trim();
          if (tLine.startsWith('#')) continue;

          const content = tLine.split('#')[0].trim();
          if (!content) continue;

          if (content.startsWith('output-dir:')) {
            outputDir = content.replace('output-dir:', '').trim();
          } else if (content.startsWith('output-ats-file:')) {
            outputFile = content.replace('output-ats-file:', '').trim();
          }
        }
      }

      // Collect global_classes muted methods
      if (data.global_classes) {
        for (const [className, classData] of Object.entries(data.global_classes)) {
          if (!Array.isArray(classData) && classData.muted) {
            for (const method of classData.muted) mutedMethods.add(`${className}.${method}`);
          }
        }
      }

      for (const [flowName, flow] of Object.entries(data.flows)) {
        // Collect flow priorities
        if (flow.priority && flow.priority !== 'normal') {
          flowPriorities[flowName] = flow.priority;
        }

        // Collect muted methods
        for (const [className, classData] of Object.entries(flow.classes)) {
          if (!Array.isArray(classData) && classData.muted) {
            for (const method of classData.muted) mutedMethods.add(`${className}.${method}`);
          }
        }

        if (!flow.active) continue;
        activeFlows.push(flowName);

        // Add flow-specific methods
        for (const [className, classData] of Object.entries(flow.classes)) {
          const methods = FlowGraph.methodsFromClass(classData);
          for (const method of methods) {
            const key = `${className}.${method}`;
            if (!staticMap[key]) staticMap[key] = [];
            if (!staticMap[key].includes(flowName)) staticMap[key].push(flowName);
          }
        }
      }

      // Add global_classes methods → map to ALL active flows
      if (data.global_classes && activeFlows.length > 0) {
        for (const [className, classData] of Object.entries(data.global_classes)) {
          const methods = FlowGraph.methodsFromClass(classData);
          for (const method of methods) {
            const key = `${className}.${method}`;
            if (!staticMap[key]) staticMap[key] = [];
            for (const flow of activeFlows) {
              if (!staticMap[key].includes(flow)) staticMap[key].push(flow);
            }
          }
        }
      }

      let mapBuffer = 'const _kMethodMap = <String, List<String>>{\n';
      for (const [key, flows] of Object.entries(staticMap)) {
        mapBuffer += `  '${key}': [${flows.map(f => `'${f}'`).join(', ')}],\n`;
      }
      mapBuffer += '};';

      let mutedBuffer = 'const _kMutedMethods = <String>{\n';
      for (const method of Array.from(mutedMethods)) {
        mutedBuffer += `  '${method}',\n`;
      }
      mutedBuffer += '};';

      const activeFlowsString = activeFlows.map(f => `'${f}'`).join(', ');

      // V6: Flow priorities map
      let priorityBuffer = 'const _kFlowPriorities = <String, String>{\n';
      for (const [flow, priority] of Object.entries(flowPriorities)) {
        priorityBuffer += `  '${flow}': '${priority}',\n`;
      }
      priorityBuffer += '};';

      const dartCode = `// AUTO-GENERATED BY ATS CLI (V6)
// DO NOT EDIT. THIS FILE IS COMPILED FROM .ats/flow_graph.json

import 'package:ats_flutter/ats_flutter.dart';

${mapBuffer}

${mutedBuffer}

const _kActiveFlows = <String>[${activeFlowsString}];

${priorityBuffer}

abstract class AtsGenerated {
  static void init() {
    ATS.resetSequence();
    ATS.internalInit(_kMethodMap, _kActiveFlows, _kMutedMethods, _kFlowPriorities);
  }
}
`;
      const outPath = path.join(this.projectRoot, outputDir, outputFile);
      const targetDir = path.dirname(outPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.writeFileSync(outPath, dartCode);
    } catch (e) {
      console.error('[ATS FlowGraph] Failed to sync dart code:', e);
    }
  }
}
