import 'dart:convert';
import 'dart:io';

/// Shared helper for reading/writing flow_graph.json
class FlowGraph {
  final String path;

  FlowGraph(this.path);

  Map<String, dynamic> read() {
    final file = File(path);
    if (!file.existsSync()) {
      throw Exception('flow_graph.json not found at $path');
    }
    return jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
  }

  void write(Map<String, dynamic> graph) {
    graph['updated_at'] = DateTime.now().toUtc().toIso8601String();
    File(path).writeAsStringSync(
      const JsonEncoder.withIndent('  ').convert(graph),
    );
  }

  Map<String, dynamic> get flows =>
      (read()['flows'] as Map<String, dynamic>?) ?? {};

  List<dynamic> get edges =>
      (read()['edges'] as List<dynamic>?) ?? [];

  /// Extract methods list from a class entry (V3 array or V4 object)
  static List<String> methodsFromClass(dynamic classValue) {
    if (classValue is List) return classValue.cast<String>();
    if (classValue is Map) {
      return (classValue['methods'] as List<dynamic>?)?.cast<String>() ?? [];
    }
    return [];
  }

  /// Build a set of all "Class.method" keys across all flows
  Set<String> allMethodKeys() {
    final keys = <String>{};
    for (final flow in flows.values) {
      final classes = (flow as Map<String, dynamic>)['classes'] as Map<String, dynamic>? ?? {};
      for (final className in classes.keys) {
        for (final method in methodsFromClass(classes[className])) {
          keys.add('$className.$method');
        }
      }
    }
    return keys;
  }

  /// Find which flows a method belongs to
  List<String> flowsForMethod(String classMethod) {
    final result = <String>[];
    for (final entry in flows.entries) {
      final classes = (entry.value as Map<String, dynamic>)['classes'] as Map<String, dynamic>? ?? {};
      for (final className in classes.keys) {
        for (final method in methodsFromClass(classes[className])) {
          if ('$className.$method' == classMethod) {
            result.add(entry.key);
          }
        }
      }
    }
    return result;
  }
}
