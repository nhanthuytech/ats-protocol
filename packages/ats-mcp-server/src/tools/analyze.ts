import * as fs from 'fs';
import * as path from 'path';
import { FlowGraph, Edge } from '../core/flow-graph.js';

interface LogEntry {
  flow: string;
  seq: number;
  depth: number;
  method: string;
  data?: string;
  timestamp: string;
}

interface AnalysisResult {
  hotspots: Array<{ method: string; call_count: number; avg_depth: number; flows: string[] }>;
  call_chains: Array<{ chain: string[]; count: number; avg_length: number }>;
  discovered_edges: Edge[];
  edges_added: number;
  anomalies: Array<{ method: string; issue: string; severity: 'low' | 'medium' | 'high' }>;
  stats: {
    total_entries: number;
    unique_methods: number;
    unique_flows: number;
    time_range: { start: string; end: string } | null;
  };
}

/**
 * ats_analyze — Parse ATS logs and discover patterns, edges, anomalies
 */
export function analyzeTool(graph: FlowGraph, args: Record<string, unknown>): AnalysisResult | { error: string } {
  const source = (args.source as string) ?? 'console';
  let entries: LogEntry[];

  if (source === 'console') {
    // Parse from provided console text
    const text = args.text as string;
    if (!text) {
      return { error: 'Provide "text" with console output containing [ATS] logs, or "source": "file" with log path' };
    }
    entries = parseConsoleLog(text);
  } else {
    // Parse from JSONL log files
    const logDir = path.join(graph.projectRoot, '.ats', 'logs');
    if (!fs.existsSync(logDir)) {
      return { error: `Log directory not found: ${logDir}` };
    }
    entries = parseLogFiles(logDir);
  }

  if (entries.length === 0) {
    return { error: 'No ATS log entries found' };
  }

  const result = analyzeEntries(entries, graph);

  // Auto-add discovered edges to graph
  if (result.discovered_edges.length > 0) {
    const data = graph.read();
    if (!data.edges) data.edges = [];
    const existingKeys = new Set(data.edges.map(e => `${e.from}->${e.to}`));
    let added = 0;

    for (const edge of result.discovered_edges) {
      const key = `${edge.from}->${edge.to}`;
      if (!existingKeys.has(key)) {
        data.edges.push(edge);
        existingKeys.add(key);
        added++;
      }
    }

    if (added > 0) graph.write(data);
    result.edges_added = added;
  }

  return result;
}

function parseConsoleLog(text: string): LogEntry[] {
  const entries: LogEntry[] = [];
  const pattern = /\[ATS\]\[(\w+)\]\[#(\d+)\]\[d(\d+)\]\s+(\w+\.\w+)(?:\s*\|\s*(.*))?/g;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    entries.push({
      flow: match[1],
      seq: parseInt(match[2]),
      depth: parseInt(match[3]),
      method: match[4],
      data: match[5],
      timestamp: new Date().toISOString(),
    });
  }

  return entries;
}

function parseLogFiles(logDir: string): LogEntry[] {
  const entries: LogEntry[] = [];

  for (const file of fs.readdirSync(logDir)) {
    if (!file.endsWith('.jsonl')) continue;
    const lines = fs.readFileSync(path.join(logDir, file), 'utf-8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        entries.push({
          flow: entry.flow ?? '',
          seq: entry.seq ?? 0,
          depth: entry.depth ?? 0,
          method: `${entry.class ?? ''}.${entry.method ?? ''}`,
          data: entry.data ? JSON.stringify(entry.data) : undefined,
          timestamp: entry.timestamp ?? '',
        });
      } catch { /* skip invalid lines */ }
    }
  }

  return entries;
}

function analyzeEntries(entries: LogEntry[], graph: FlowGraph): AnalysisResult {
  // 1. Hotspots — most called methods
  const methodCounts = new Map<string, { count: number; depths: number[]; flows: Set<string> }>();
  for (const e of entries) {
    if (!methodCounts.has(e.method)) {
      methodCounts.set(e.method, { count: 0, depths: [], flows: new Set() });
    }
    const mc = methodCounts.get(e.method)!;
    mc.count++;
    mc.depths.push(e.depth);
    mc.flows.add(e.flow);
  }

  const hotspots = [...methodCounts.entries()]
    .map(([method, data]) => ({
      method,
      call_count: data.count,
      avg_depth: data.depths.reduce((a, b) => a + b, 0) / data.depths.length,
      flows: [...data.flows],
    }))
    .sort((a, b) => b.call_count - a.call_count)
    .slice(0, 10);

  // 2. Discover edges from sequence + depth patterns
  const discoveredEdges: Edge[] = [];
  const edgeSet = new Set<string>();

  for (let i = 0; i < entries.length - 1; i++) {
    const curr = entries[i];
    const next = entries[i + 1];

    // If next has depth = curr.depth + 1 and next.seq = curr.seq + 1
    // → curr called next
    if (next.seq === curr.seq + 1 && next.depth === curr.depth + 1) {
      const key = `${curr.method}->${next.method}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        discoveredEdges.push({
          from: curr.method,
          to: next.method,
          type: 'calls',
        });
      }
    }
  }

  // 3. Detect call chains (sequences of consecutive calls)
  const chains: string[][] = [];
  let currentChain: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    if (currentChain.length === 0) {
      currentChain.push(entries[i].method);
    } else if (i > 0 && entries[i].seq === entries[i - 1].seq + 1) {
      currentChain.push(entries[i].method);
    } else {
      if (currentChain.length > 1) chains.push([...currentChain]);
      currentChain = [entries[i].method];
    }
  }
  if (currentChain.length > 1) chains.push(currentChain);

  // Aggregate chains
  const chainCounts = new Map<string, { chain: string[]; count: number }>();
  for (const chain of chains) {
    const key = chain.join(' → ');
    if (!chainCounts.has(key)) chainCounts.set(key, { chain, count: 0 });
    chainCounts.get(key)!.count++;
  }

  const callChains = [...chainCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(c => ({ chain: c.chain, count: c.count, avg_length: c.chain.length }));

  // 4. Anomaly detection
  const anomalies: AnalysisResult['anomalies'] = [];

  // Check for suspiciously high call counts (possible loops)
  for (const [method, data] of methodCounts) {
    if (data.count > 50) {
      anomalies.push({
        method,
        issue: `Called ${data.count} times — possible infinite loop or excessive recursion`,
        severity: data.count > 200 ? 'high' : 'medium',
      });
    }
  }

  // Check for depth anomalies
  for (const [method, data] of methodCounts) {
    const maxDepth = Math.max(...data.depths);
    if (maxDepth > 5) {
      anomalies.push({
        method,
        issue: `Max call depth ${maxDepth} — deep nesting may indicate architectural issues`,
        severity: maxDepth > 8 ? 'high' : 'low',
      });
    }
  }

  // Stats
  const uniqueFlows = new Set(entries.map(e => e.flow));
  const timestamps = entries.map(e => e.timestamp).filter(t => t);

  return {
    hotspots,
    call_chains: callChains,
    discovered_edges: discoveredEdges,
    edges_added: 0,
    anomalies,
    stats: {
      total_entries: entries.length,
      unique_methods: methodCounts.size,
      unique_flows: uniqueFlows.size,
      time_range: timestamps.length >= 2
        ? { start: timestamps[0], end: timestamps[timestamps.length - 1] }
        : null,
    },
  };
}
