import '../core/flow_graph.dart';

/// ats_context — Topological-sorted context for a flow
class ContextTool {
  final FlowGraph _graph;

  ContextTool(String graphPath) : _graph = FlowGraph(graphPath);

  Map<String, dynamic> execute(Map<String, dynamic> args) {
    final flowName = args['flow'] as String;
    final maxDepth = args['depth'] as int? ?? 2;
    final allFlows = _graph.flows;

    if (!allFlows.containsKey(flowName)) {
      return {'error': 'Flow "$flowName" not found'};
    }

    // Topological sort: collect upstream flows via BFS on depends_on
    final visited = <String>{};
    final ordered = <String>[];
    _collectUpstream(flowName, allFlows, visited, ordered, 0, maxDepth);

    // Build context for each flow in topological order
    final flowContexts = <Map<String, dynamic>>[];
    for (final name in ordered) {
      final flow = allFlows[name] as Map<String, dynamic>;
      final classes = flow['classes'] as Map<String, dynamic>? ?? {};
      final classMap = <String, List<String>>{};
      for (final cn in classes.keys) {
        classMap[cn] = FlowGraph.methodsFromClass(classes[cn]);
      }

      // Find sub-flows (children)
      final children = allFlows.entries
          .where((e) => (e.value as Map<String, dynamic>)['parent'] == name)
          .map((e) => e.key)
          .toList();

      flowContexts.add({
        'name': name,
        'description': flow['description'] ?? '',
        'active': flow['active'] ?? false,
        'depends_on': flow['depends_on'] ?? [],
        'classes': classMap,
        'sub_flows': children,
        'sessions': (flow['sessions'] as List<dynamic>?)?.take(5).toList() ?? [],
        'known_issues': flow['known_issues'] ?? [],
      });
    }

    // Collect edges relevant to these flows
    final allEdges = _graph.edges;
    final relevantMethodKeys = <String>{};
    for (final ctx in flowContexts) {
      final classes = ctx['classes'] as Map<String, List<String>>;
      for (final cn in classes.keys) {
        for (final m in classes[cn]!) {
          relevantMethodKeys.add('$cn.$m');
        }
      }
    }

    final relevantEdges = allEdges.where((e) {
      final edge = e as Map<String, dynamic>;
      return relevantMethodKeys.contains(edge['from']) ||
             relevantMethodKeys.contains(edge['to']);
    }).toList();

    return {
      'target_flow': flowName,
      'context_flows': flowContexts,
      'edges': relevantEdges,
      'traversal_depth': maxDepth,
    };
  }

  void _collectUpstream(
    String flowName,
    Map<String, dynamic> allFlows,
    Set<String> visited,
    List<String> ordered,
    int currentDepth,
    int maxDepth,
  ) {
    if (visited.contains(flowName) || !allFlows.containsKey(flowName)) return;
    visited.add(flowName);

    if (currentDepth < maxDepth) {
      final flow = allFlows[flowName] as Map<String, dynamic>;
      final deps = flow['depends_on'] as List<dynamic>? ?? [];
      for (final dep in deps) {
        _collectUpstream(dep.toString(), allFlows, visited, ordered, currentDepth + 1, maxDepth);
      }
    }

    ordered.add(flowName); // Add after dependencies = topological order
  }
}
