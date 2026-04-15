import '../core/flow_graph.dart';

/// ats_graph — Export DAG as Mermaid diagram
class GraphTool {
  final FlowGraph _graph;

  GraphTool(String graphPath) : _graph = FlowGraph(graphPath);

  Map<String, dynamic> execute(Map<String, dynamic> args) {
    final includeMethods = args['include_methods'] as bool? ?? false;
    final flows = _graph.flows;
    final edges = _graph.edges;

    final buffer = StringBuffer();
    buffer.writeln('graph TD');

    final connected = <String>{};

    // Flow-level edges from depends_on
    for (final name in flows.keys) {
      final node = flows[name] as Map<String, dynamic>;
      final deps = node['depends_on'] as List<dynamic>? ?? [];
      final parent = node['parent'] as String?;
      final isActive = node['active'] == true;

      // Style active flows
      if (isActive) {
        buffer.writeln('    style $name fill:#4CAF50,color:#fff');
      }

      for (final dep in deps) {
        buffer.writeln('    $dep --> $name');
        connected.addAll([dep.toString(), name]);
      }
      if (parent != null) {
        buffer.writeln('    $parent -.-> $name');
        connected.addAll([parent, name]);
      }
    }

    // Standalone flows
    for (final name in flows.keys) {
      if (!connected.contains(name)) {
        buffer.writeln('    $name');
      }
    }

    // Method-level edges
    if (includeMethods && edges.isNotEmpty) {
      buffer.writeln();
      for (final edge in edges) {
        final e = edge as Map<String, dynamic>;
        final from = (e['from'] as String? ?? '').replaceAll('.', '_');
        final to = (e['to'] as String? ?? '').replaceAll('.', '_');
        final type = e['type'] as String? ?? 'calls';
        final fromLabel = e['from'] as String? ?? '';
        final toLabel = e['to'] as String? ?? '';
        buffer.writeln('    $from["$fromLabel"] -->|$type| $to["$toLabel"]');
      }
    }

    return {
      'format': 'mermaid',
      'diagram': buffer.toString(),
      'stats': {
        'flows': flows.length,
        'edges': edges.length,
      },
    };
  }
}
