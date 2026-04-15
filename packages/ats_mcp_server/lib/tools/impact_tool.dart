import '../core/flow_graph.dart';

/// ats_impact — Bidirectional DFS to find blast radius of a method change
class ImpactTool {
  final FlowGraph _graph;

  ImpactTool(String graphPath) : _graph = FlowGraph(graphPath);

  Map<String, dynamic> execute(Map<String, dynamic> args) {
    final method = args['method'] as String;
    final edges = _graph.edges;

    // Find callers (who calls this method)
    final callers = <Map<String, dynamic>>[];
    for (final edge in edges) {
      final e = edge as Map<String, dynamic>;
      if (e['to'] == method) {
        callers.add({
          'method': e['from'],
          'type': e['type'],
          'condition': e['condition'],
        });
      }
    }

    // Find callees (what this method calls)
    final callees = <Map<String, dynamic>>[];
    for (final edge in edges) {
      final e = edge as Map<String, dynamic>;
      if (e['from'] == method) {
        callees.add({
          'method': e['to'],
          'type': e['type'],
          'condition': e['condition'],
        });
      }
    }

    // Find affected flows
    final affectedFlows = <String>{};
    affectedFlows.addAll(_graph.flowsForMethod(method));
    for (final c in callers) {
      affectedFlows.addAll(_graph.flowsForMethod(c['method'] as String));
    }
    for (final c in callees) {
      affectedFlows.addAll(_graph.flowsForMethod(c['method'] as String));
    }

    // Risk assessment
    String risk;
    if (affectedFlows.length >= 3 || callers.length >= 3) {
      risk = 'high';
    } else if (affectedFlows.length >= 2 || callers.length >= 1) {
      risk = 'medium';
    } else {
      risk = 'low';
    }

    return {
      'method': method,
      'callers': callers,
      'callees': callees,
      'affected_flows': affectedFlows.toList(),
      'risk': risk,
      'recommendation': risk == 'high'
          ? 'This method is a critical junction. Test thoroughly before changing.'
          : risk == 'medium'
              ? 'This method affects multiple flows. Review upstream callers.'
              : 'Low impact. Safe to modify.',
    };
  }
}
