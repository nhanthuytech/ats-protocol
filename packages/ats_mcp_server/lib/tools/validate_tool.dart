import 'dart:io';

import '../core/flow_graph.dart';

/// ats_validate — Check graph integrity: cycles, stale methods, invalid edges
class ValidateTool {
  final FlowGraph _graph;
  final String _projectRoot;

  ValidateTool(String graphPath, this._projectRoot) : _graph = FlowGraph(graphPath);

  Map<String, dynamic> execute(Map<String, dynamic> args) {
    final flows = _graph.flows;
    final edges = _graph.edges;
    final issues = <Map<String, dynamic>>[];

    // 1. Cycle detection (Kahn's algorithm)
    final hasCycle = !_checkNoCycles(flows);
    if (hasCycle) {
      issues.add({'type': 'cycle', 'message': 'Circular dependency detected in depends_on'});
    }

    // 2. Invalid depends_on references
    for (final entry in flows.entries) {
      final flow = entry.value as Map<String, dynamic>;
      final deps = flow['depends_on'] as List<dynamic>? ?? [];
      for (final dep in deps) {
        if (!flows.containsKey(dep.toString())) {
          issues.add({
            'type': 'missing_dependency',
            'flow': entry.key,
            'depends_on': dep.toString(),
            'message': 'Flow "${entry.key}" depends on "$dep" which does not exist',
          });
        }
      }
      // Check parent
      final parent = flow['parent'] as String?;
      if (parent != null && !flows.containsKey(parent)) {
        issues.add({
          'type': 'missing_parent',
          'flow': entry.key,
          'parent': parent,
          'message': 'Flow "${entry.key}" has parent "$parent" which does not exist',
        });
      }
    }

    // 3. Invalid edge references
    final allMethods = _graph.allMethodKeys();
    for (final edge in edges) {
      final e = edge as Map<String, dynamic>;
      final from = e['from'] as String? ?? '';
      final to = e['to'] as String? ?? '';
      if (from.isNotEmpty && !allMethods.contains(from)) {
        issues.add({
          'type': 'stale_edge',
          'edge_from': from,
          'message': 'Edge from "$from" references unknown method',
        });
      }
      if (to.isNotEmpty && !allMethods.contains(to)) {
        issues.add({
          'type': 'stale_edge',
          'edge_to': to,
          'message': 'Edge to "$to" references unknown method',
        });
      }
    }

    // 4. Stale methods (scan source files)
    final staleEntries = _findStaleMethods(flows);
    issues.addAll(staleEntries);

    return {
      'valid': issues.isEmpty,
      'issues': issues,
      'stats': {
        'total_flows': flows.length,
        'total_methods': allMethods.length,
        'total_edges': edges.length,
        'issues_found': issues.length,
      },
    };
  }

  List<Map<String, dynamic>> _findStaleMethods(Map<String, dynamic> flows) {
    final issues = <Map<String, dynamic>>[];
    final libDir = Directory('$_projectRoot/lib');
    if (!libDir.existsSync()) return issues;

    // Collect all class names from Dart files
    final dartClasses = <String>{};
    for (final file in libDir.listSync(recursive: true)) {
      if (file is File && file.path.endsWith('.dart')) {
        final content = file.readAsStringSync();
        final classPattern = RegExp(r'class\s+(\w+)');
        for (final match in classPattern.allMatches(content)) {
          dartClasses.add(match.group(1)!);
        }
      }
    }

    // Check if classes in graph exist in source
    for (final entry in flows.entries) {
      final classes = (entry.value as Map<String, dynamic>)['classes'] as Map<String, dynamic>? ?? {};
      for (final className in classes.keys) {
        if (!dartClasses.contains(className)) {
          issues.add({
            'type': 'missing_class',
            'flow': entry.key,
            'class': className,
            'message': 'Class "$className" in flow "${entry.key}" not found in lib/',
          });
        }
      }
    }

    return issues;
  }

  bool _checkNoCycles(Map<String, dynamic> flows) {
    final inDegree = <String, int>{};
    final adj = <String, List<String>>{};

    for (final name in flows.keys) {
      adj.putIfAbsent(name, () => []);
      inDegree.putIfAbsent(name, () => 0);
    }

    for (final name in flows.keys) {
      final deps = (flows[name] as Map<String, dynamic>)['depends_on'] as List<dynamic>? ?? [];
      for (final dep in deps) {
        final d = dep.toString();
        if (!flows.containsKey(d)) continue;
        adj.putIfAbsent(d, () => []);
        adj[d]!.add(name);
        inDegree[name] = (inDegree[name] ?? 0) + 1;
      }
    }

    final queue = inDegree.entries.where((e) => e.value == 0).map((e) => e.key).toList();
    int visited = 0;
    while (queue.isNotEmpty) {
      final node = queue.removeAt(0);
      visited++;
      for (final n in (adj[node] ?? [])) {
        inDegree[n] = (inDegree[n] ?? 1) - 1;
        if (inDegree[n] == 0) queue.add(n);
      }
    }
    return visited == flows.length;
  }
}
