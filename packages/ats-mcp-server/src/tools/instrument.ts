import * as fs from 'fs';
import * as path from 'path';
import { FlowGraph } from '../core/flow-graph.js';

interface InstrumentResult {
  file: string;
  flow: string;
  instrumented: number;
  already_had: number;
  methods: string[];
}

/**
 * ats_instrument — Add ATS.trace() skeleton to all methods in a file.
 * Requires flow name. Supports Dart, TypeScript, Python.
 */
export function instrumentTool(
  graph: FlowGraph,
  args: Record<string, unknown>,
): InstrumentResult | { error: string } {
  const filePath = args.file as string;
  const flowName = args.flow as string;
  const dryRun = (args.dry_run as boolean) ?? false;

  if (!flowName) {
    return { error: 'flow is required. AI/dev must specify which flow this file belongs to.' };
  }

  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(graph.projectRoot, filePath);

  if (!fs.existsSync(fullPath)) {
    return { error: `File not found: ${fullPath}` };
  }

  const ext = path.extname(fullPath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  let parsed: ParseResult;

  switch (ext) {
    case '.dart':
      parsed = parseDart(content);
      break;
    case '.ts':
    case '.js':
      parsed = parseTS(content);
      break;
    case '.py':
      parsed = parsePython(content);
      break;
    default:
      return { error: `Unsupported: ${ext}. Use .dart, .ts, .js, .py` };
  }

  if (parsed.methods.length === 0) {
    return { error: `No instrumentable methods found in ${path.basename(fullPath)}` };
  }

  // Write instrumented code
  if (!dryRun && parsed.instrumented > 0) {
    fs.writeFileSync(fullPath, parsed.output);
  }

  // Update flow_graph.json
  if (!dryRun) {
    const data = graph.read();
    if (!data.flows[flowName]) {
      data.flows[flowName] = {
        active: false,
        classes: {},
        description: `Instrumented from ${path.basename(fullPath)}`,
      };
    }

    const byClass = new Map<string, string[]>();
    for (const m of parsed.methods) {
      const [cls, method] = m.split('.');
      if (!byClass.has(cls)) byClass.set(cls, []);
      byClass.get(cls)!.push(method);
    }

    for (const [cls, methods] of byClass) {
      const existing = FlowGraph.methodsFromClass(data.flows[flowName].classes[cls]);
      const merged = [...new Set([...existing, ...methods])];
      data.flows[flowName].classes[cls] = {
        methods: merged,
        last_verified: new Date().toISOString().split('T')[0],
      };
    }

    graph.write(data);
  }

  return {
    file: fullPath,
    flow: flowName,
    instrumented: parsed.instrumented,
    already_had: parsed.alreadyHad,
    methods: parsed.methods,
  };
}

// ─── Parser types ───

interface ParseResult {
  output: string;
  methods: string[]; // "ClassName.methodName"
  instrumented: number;
  alreadyHad: number;
}

// ─── Dart parser ───

const SKIP_METHODS = new Set([
  'build', 'dispose', 'initState', 'didChangeDependencies',
  'didUpdateWidget', 'deactivate', 'reassemble', 'toString',
  'toJson', 'fromJson', 'hashCode', 'noSuchMethod',
  'createState', 'debugFillProperties',
]);

function parseDart(content: string): ParseResult {
  const lines = content.split('\n');
  const out: string[] = [];
  const methods: string[] = [];
  let instrumented = 0;
  let alreadyHad = 0;

  let currentClass: string | null = null;
  let braceDepth = 0;
  let classDepth = -1;
  let inMethod = false;
  let methodName = '';
  let hasTrace = false;
  let needsInsert = false;

  const hasImport =
    content.includes("package:ats_flutter/ats_flutter.dart");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Class detection
    const classMatch = trimmed.match(/^(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      currentClass = classMatch[1];
      classDepth = braceDepth;
    }

    // Brace tracking
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') {
        braceDepth--;
        if (braceDepth === classDepth) {
          currentClass = null;
          classDepth = -1;
        }
        if (inMethod) {
          inMethod = false;
        }
      }
    }

    // Method detection (inside class, not nested)
    if (currentClass && !inMethod) {
      const methodMatch = trimmed.match(
        /^(?:static\s+)?(?:Future\s*<[^>]*>\s+|void\s+|int\s+|String\s+|bool\s+|double\s+|dynamic\s+|[\w<>,?\s]+\s+)?(\w+)\s*\([^)]*\)\s*(?:async\s*)?{?\s*$/,
      );

      if (
        methodMatch &&
        !SKIP_METHODS.has(methodMatch[1]) &&
        methodMatch[1] !== currentClass && // not constructor
        !methodMatch[1].startsWith('_') // skip private
      ) {
        methodName = methodMatch[1];
        inMethod = true;
        hasTrace = false;
        needsInsert = true;
        methods.push(`${currentClass}.${methodName}`);
      }
    }

    // Check existing trace
    if (inMethod && needsInsert && trimmed.includes('ATS.trace(')) {
      hasTrace = true;
      needsInsert = false;
      alreadyHad++;
    }

    // Insert trace after opening brace
    if (inMethod && needsInsert && trimmed.includes('{') && !trimmed.startsWith('class')) {
      out.push(line);
      const indent = (line.match(/^(\s*)/)?.[1] ?? '') + '  ';
      out.push(`${indent}ATS.trace('${currentClass}', '${methodName}');`);
      needsInsert = false;
      instrumented++;
      continue;
    }

    out.push(line);
  }

  // Add import
  if (instrumented > 0 && !hasImport) {
    out.unshift("import 'package:ats_flutter/ats_flutter.dart';");
  }

  return { output: out.join('\n'), methods, instrumented, alreadyHad };
}

// ─── TypeScript parser ───

function parseTS(content: string): ParseResult {
  const lines = content.split('\n');
  const out: string[] = [];
  const methods: string[] = [];
  let instrumented = 0;
  let alreadyHad = 0;
  let currentClass: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    const classMatch = trimmed.match(/^(?:export\s+)?class\s+(\w+)/);
    if (classMatch) currentClass = classMatch[1];

    if (currentClass) {
      const methodMatch = trimmed.match(
        /^(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[\w<>[\]|]+)?\s*{/,
      );
      if (
        methodMatch &&
        !['constructor', 'if', 'for', 'while', 'switch'].includes(methodMatch[1])
      ) {
        methods.push(`${currentClass}.${methodMatch[1]}`);

        // Check if next line already has console.log ATS
        out.push(line);
        const indent = (line.match(/^(\s*)/)?.[1] ?? '') + '  ';
        out.push(
          `${indent}console.log('[ATS][${currentClass}.${methodMatch[1]}]');`,
        );
        instrumented++;
        continue;
      }
    }

    if (trimmed.includes("console.log('[ATS]")) alreadyHad++;
    out.push(line);
  }

  return { output: out.join('\n'), methods, instrumented, alreadyHad };
}

// ─── Python parser ───

function parsePython(content: string): ParseResult {
  const lines = content.split('\n');
  const out: string[] = [];
  const methods: string[] = [];
  let instrumented = 0;
  let alreadyHad = 0;
  let currentClass: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    const classMatch = trimmed.match(/^class\s+(\w+)/);
    if (classMatch) currentClass = classMatch[1];

    if (currentClass) {
      const defMatch = trimmed.match(/^def\s+(\w+)\s*\(/);
      if (defMatch && !defMatch[1].startsWith('_')) {
        methods.push(`${currentClass}.${defMatch[1]}`);
        out.push(line);
        const indent = (line.match(/^(\s*)/)?.[1] ?? '') + '    ';
        out.push(`${indent}print(f"[ATS][${currentClass}.${defMatch[1]}]")`);
        instrumented++;
        continue;
      }
    }

    if (trimmed.includes("print(f\"[ATS]")) alreadyHad++;
    out.push(line);
  }

  return { output: out.join('\n'), methods, instrumented, alreadyHad };
}
