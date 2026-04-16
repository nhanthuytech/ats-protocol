import { Edge, FlowEntry } from './flow-graph.js';

/**
 * DAG algorithms: cycle detection, topo sort, PageRank, centrality, shortest path
 */
export class DAG {
  // ──────────────────────────────────────────────
  // Cycle detection — Kahn's algorithm
  // ──────────────────────────────────────────────

  static hasCycle(flows: Record<string, FlowEntry>): boolean {
    const names = Object.keys(flows);
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const name of names) {
      inDegree.set(name, 0);
      adj.set(name, []);
    }

    for (const name of names) {
      const deps = flows[name].depends_on ?? [];
      for (const dep of deps) {
        if (!flows[dep]) continue;
        adj.get(dep)!.push(name);
        inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
      }
    }

    const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([n]) => n);
    let visited = 0;

    while (queue.length > 0) {
      const node = queue.shift()!;
      visited++;
      for (const n of adj.get(node) ?? []) {
        const d = (inDegree.get(n) ?? 1) - 1;
        inDegree.set(n, d);
        if (d === 0) queue.push(n);
      }
    }

    return visited !== names.length;
  }

  // ──────────────────────────────────────────────
  // Topological sort — DFS based
  // ──────────────────────────────────────────────

  static topoSort(flows: Record<string, FlowEntry>): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (name: string) => {
      if (visited.has(name) || !flows[name]) return;
      visited.add(name);
      for (const dep of flows[name].depends_on ?? []) {
        visit(dep);
      }
      result.push(name);
    };

    for (const name of Object.keys(flows)) visit(name);
    return result;
  }

  // ──────────────────────────────────────────────
  // PageRank — find most important methods
  // ──────────────────────────────────────────────

  static pageRank(edges: Edge[], iterations = 20, damping = 0.85): Map<string, number> {
    const nodes = new Set<string>();
    const inLinks = new Map<string, string[]>();
    const outCount = new Map<string, number>();

    for (const edge of edges) {
      nodes.add(edge.from);
      nodes.add(edge.to);
      if (!inLinks.has(edge.to)) inLinks.set(edge.to, []);
      inLinks.get(edge.to)!.push(edge.from);
      outCount.set(edge.from, (outCount.get(edge.from) ?? 0) + 1);
    }

    const n = nodes.size;
    if (n === 0) return new Map();

    const rank = new Map<string, number>();
    for (const node of nodes) rank.set(node, 1 / n);

    for (let i = 0; i < iterations; i++) {
      const newRank = new Map<string, number>();
      for (const node of nodes) {
        let sum = 0;
        for (const source of inLinks.get(node) ?? []) {
          sum += (rank.get(source) ?? 0) / (outCount.get(source) ?? 1);
        }
        newRank.set(node, (1 - damping) / n + damping * sum);
      }
      for (const [k, v] of newRank) rank.set(k, v);
    }

    return rank;
  }

  // ──────────────────────────────────────────────
  // Betweenness Centrality — find bottleneck methods
  // ──────────────────────────────────────────────

  static betweennessCentrality(edges: Edge[]): Map<string, number> {
    const nodes = new Set<string>();
    const adj = new Map<string, string[]>();

    for (const edge of edges) {
      nodes.add(edge.from);
      nodes.add(edge.to);
      if (!adj.has(edge.from)) adj.set(edge.from, []);
      adj.get(edge.from)!.push(edge.to);
    }

    const centrality = new Map<string, number>();
    for (const node of nodes) centrality.set(node, 0);

    for (const source of nodes) {
      // BFS from source
      const stack: string[] = [];
      const predecessors = new Map<string, string[]>();
      const sigma = new Map<string, number>(); // shortest path count
      const dist = new Map<string, number>();
      const delta = new Map<string, number>();

      for (const n of nodes) {
        predecessors.set(n, []);
        sigma.set(n, 0);
        dist.set(n, -1);
        delta.set(n, 0);
      }

      sigma.set(source, 1);
      dist.set(source, 0);
      const queue = [source];

      while (queue.length > 0) {
        const v = queue.shift()!;
        stack.push(v);
        for (const w of adj.get(v) ?? []) {
          if (dist.get(w)! < 0) {
            queue.push(w);
            dist.set(w, dist.get(v)! + 1);
          }
          if (dist.get(w) === dist.get(v)! + 1) {
            sigma.set(w, sigma.get(w)! + sigma.get(v)!);
            predecessors.get(w)!.push(v);
          }
        }
      }

      while (stack.length > 0) {
        const w = stack.pop()!;
        for (const v of predecessors.get(w)!) {
          delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
        }
        if (w !== source) {
          centrality.set(w, centrality.get(w)! + delta.get(w)!);
        }
      }
    }

    return centrality;
  }

  // ──────────────────────────────────────────────
  // Shortest path — BFS between two methods
  // ──────────────────────────────────────────────

  static shortestPath(edges: Edge[], from: string, to: string): string[] | null {
    const adj = new Map<string, string[]>();
    for (const edge of edges) {
      if (!adj.has(edge.from)) adj.set(edge.from, []);
      adj.get(edge.from)!.push(edge.to);
    }

    const visited = new Set<string>();
    const parent = new Map<string, string>();
    const queue = [from];
    visited.add(from);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === to) {
        // Reconstruct path
        const path: string[] = [];
        let node: string | undefined = to;
        while (node) {
          path.unshift(node);
          node = parent.get(node);
        }
        return path;
      }
      for (const neighbor of adj.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          parent.set(neighbor, current);
          queue.push(neighbor);
        }
      }
    }

    return null;
  }

  // ──────────────────────────────────────────────
  // Community detection — simple label propagation
  // ──────────────────────────────────────────────

  static detectCommunities(edges: Edge[]): Map<string, string[]> {
    const adj = new Map<string, Set<string>>();

    for (const edge of edges) {
      if (!adj.has(edge.from)) adj.set(edge.from, new Set());
      if (!adj.has(edge.to)) adj.set(edge.to, new Set());
      adj.get(edge.from)!.add(edge.to);
      adj.get(edge.to)!.add(edge.from); // undirected for community detection
    }

    const labels = new Map<string, number>();
    let labelId = 0;
    for (const node of adj.keys()) labels.set(node, labelId++);

    // Iterate label propagation
    for (let iter = 0; iter < 10; iter++) {
      let changed = false;
      for (const node of adj.keys()) {
        const neighborLabels = new Map<number, number>();
        for (const neighbor of adj.get(node) ?? []) {
          const l = labels.get(neighbor)!;
          neighborLabels.set(l, (neighborLabels.get(l) ?? 0) + 1);
        }
        if (neighborLabels.size === 0) continue;
        const maxLabel = [...neighborLabels.entries()].sort((a, b) => b[1] - a[1])[0][0];
        if (labels.get(node) !== maxLabel) {
          labels.set(node, maxLabel);
          changed = true;
        }
      }
      if (!changed) break;
    }

    // Group by label
    const communities = new Map<number, string[]>();
    for (const [node, label] of labels) {
      if (!communities.has(label)) communities.set(label, []);
      communities.get(label)!.push(node);
    }

    // Return as community_N → members
    const result = new Map<string, string[]>();
    let i = 0;
    for (const members of communities.values()) {
      if (members.length > 1) {
        result.set(`community_${i++}`, members);
      }
    }
    return result;
  }
}
