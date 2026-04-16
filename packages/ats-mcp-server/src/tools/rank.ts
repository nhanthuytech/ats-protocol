import { FlowGraph } from '../core/flow-graph.js';
import { DAG } from '../core/dag.js';

/**
 * ats_rank — PageRank, centrality, community detection, shortest path
 */
export function rankTool(graph: FlowGraph, args: Record<string, unknown>) {
  const action = (args.action as string) ?? 'rank';
  const edges = graph.edges;

  switch (action) {
    case 'rank': {
      const ranks = DAG.pageRank(edges);
      const sorted = [...ranks.entries()].sort((a, b) => b[1] - a[1]);
      return {
        action: 'pagerank',
        description: 'Methods ranked by importance (how many other methods depend on them)',
        results: sorted.slice(0, 15).map(([method, score], i) => ({
          rank: i + 1,
          method,
          score: Math.round(score * 10000) / 10000,
          flows: graph.flowsForMethod(method),
        })),
        total_nodes: ranks.size,
      };
    }

    case 'bottleneck': {
      const centrality = DAG.betweennessCentrality(edges);
      const sorted = [...centrality.entries()].sort((a, b) => b[1] - a[1]);
      return {
        action: 'betweenness_centrality',
        description: 'Methods that are bottlenecks — all paths go through them. Risky to change.',
        results: sorted.slice(0, 10).map(([method, score], i) => ({
          rank: i + 1,
          method,
          centrality: Math.round(score * 1000) / 1000,
          flows: graph.flowsForMethod(method),
          risk: score > 5 ? 'high' : score > 1 ? 'medium' : 'low',
        })),
      };
    }

    case 'communities': {
      const communities = DAG.detectCommunities(edges);
      return {
        action: 'community_detection',
        description: 'Groups of methods that are tightly connected. Consider making each community a flow.',
        communities: Object.fromEntries(communities),
        suggestion: [...communities.entries()]
          .filter(([, members]) => {
            // Check if members span multiple flows
            const flows = new Set<string>();
            for (const m of members) {
              for (const f of graph.flowsForMethod(m)) flows.add(f);
            }
            return flows.size > 1;
          })
          .map(([name, members]) => ({
            community: name,
            members,
            note: 'These methods are tightly coupled but span multiple flows. Consider consolidating.',
          })),
      };
    }

    case 'path': {
      const from = args.from as string;
      const to = args.to as string;
      if (!from || !to) return { error: 'Provide "from" and "to" method names' };

      const path = DAG.shortestPath(edges, from, to);
      if (!path) {
        return { action: 'shortest_path', from, to, reachable: false, path: null };
      }

      // Build edge details along the path
      const edgeDetails: Array<{ from: string; to: string; type: string }> = [];
      for (let i = 0; i < path.length - 1; i++) {
        const edge = edges.find(e => e.from === path[i] && e.to === path[i + 1]);
        edgeDetails.push({
          from: path[i],
          to: path[i + 1],
          type: edge?.type ?? 'unknown',
        });
      }

      return {
        action: 'shortest_path',
        from,
        to,
        reachable: true,
        path,
        edges: edgeDetails,
        hops: path.length - 1,
      };
    }

    default:
      return { error: `Unknown action "${action}". Available: rank, bottleneck, communities, path` };
  }
}
