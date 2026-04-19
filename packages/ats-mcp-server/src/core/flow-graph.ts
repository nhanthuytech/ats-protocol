import * as fs from 'fs';
import * as path from 'path';

export interface FlowEntry {
  description?: string;
  active?: boolean;
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
  constructor(private graphPath: string) { }

  read(): FlowGraphData {
    if (!fs.existsSync(this.graphPath)) {
      throw new Error(`flow_graph.json not found at ${this.graphPath}`);
    }
    return JSON.parse(fs.readFileSync(this.graphPath, 'utf-8'));
  }

  write(graph: FlowGraphData): void {
    graph.updated_at = new Date().toISOString();
    fs.writeFileSync(this.graphPath, JSON.stringify(graph, null, 2));
    this.syncGeneratedCode(graph);
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

  /**
   * Generates lib/generated/ats/ats_generated.g.dart directly from TypeScript.
   * Matches the Dart CLI implementation exactly, but eliminates the need to spawn child processes.
   */
  private syncGeneratedCode(data: FlowGraphData): void {
    try {
      // ── Project Type Detection ──
      const isDart = fs.existsSync(path.join(this.projectRoot, 'pubspec.yaml'));
      const isTypeScript = fs.existsSync(path.join(this.projectRoot, 'package.json'));
      const isPython = fs.existsSync(path.join(this.projectRoot, 'requirements.txt')) || fs.existsSync(path.join(this.projectRoot, 'pyproject.toml'));

      if (!isDart) {
        // Node.js and Python runtimes can usually require()/load the JSON directly 
        // into memory at startup synchronously, so code-generation is unnecessary.
        // If we add TS/Python SDKs that need code-gen later, we can add it here.
        return;
      }

      // ── Dart/Flutter Generators ──
      const activeFlows: string[] = [];
      const staticMap: Record<string, string[]> = {};
      const mutedMethods = new Set<string>();

      // Read ats.yaml if exists, otherwise fallback to defaults
      const atsYamlPath = path.join(this.projectRoot, 'ats.yaml');
      let outputDir = 'lib/generated/ats';
      let outputFile = 'ats_generated.g.dart';
      if (fs.existsSync(atsYamlPath)) {
        const yaml = fs.readFileSync(atsYamlPath, 'utf8');
        for (const line of yaml.split('\n')) {
          const tLine = line.trim();
          if (tLine.startsWith('#')) continue; // skip full-line comments

          // Strip inline comments
          const content = tLine.split('#')[0].trim();
          if (!content) continue;

          if (content.startsWith('output-dir:')) {
            outputDir = content.replace('output-dir:', '').trim();
          } else if (content.startsWith('output-ats-file:')) {
            outputFile = content.replace('output-ats-file:', '').trim();
          }
        }
      }

      for (const [flowName, flow] of Object.entries(data.flows)) {
        // Collect muted methods globally
        for (const [className, classData] of Object.entries(flow.classes)) {
          if (!Array.isArray(classData) && classData.muted) {
            for (const method of classData.muted) mutedMethods.add(`${className}.${method}`);
          }
        }

        if (!flow.active) continue;
        activeFlows.push(flowName);

        for (const [className, classData] of Object.entries(flow.classes)) {
          const methods = FlowGraph.methodsFromClass(classData);
          for (const method of methods) {
            const key = `${className}.${method}`;
            if (!staticMap[key]) staticMap[key] = [];
            staticMap[key].push(flowName);
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

      const dartCode = `// AUTO-GENERATED BY ATS CLI (V4)
// DO NOT EDIT. THIS FILE IS COMPILED FROM .ats/flow_graph.json

import 'package:ats_flutter/ats_flutter.dart';

${mapBuffer}

${mutedBuffer}

const _kActiveFlows = <String>[${activeFlowsString}];

abstract class AtsGenerated {
  static void init() {
    ATS.resetSequence();
    ATS.internalInit(_kMethodMap, _kActiveFlows, _kMutedMethods);
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

