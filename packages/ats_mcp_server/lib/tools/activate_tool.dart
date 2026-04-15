import 'dart:io';

import '../core/flow_graph.dart';

/// ats_activate / ats_silence — Toggle flow active state
class ActivateTool {
  final FlowGraph _graph;

  ActivateTool(String graphPath) : _graph = FlowGraph(graphPath);

  Map<String, dynamic> execute(Map<String, dynamic> args) {
    final flowName = args['flow'] as String;
    final silence = args['silence'] as bool? ?? false;
    final activate = !silence;

    final graph = _graph.read();
    final flows = graph['flows'] as Map<String, dynamic>? ?? {};

    if (!flows.containsKey(flowName)) {
      return {'error': 'Flow "$flowName" not found', 'available_flows': flows.keys.toList()};
    }

    (flows[flowName] as Map<String, dynamic>)['active'] = activate;
    _graph.write(graph);

    // Run ats sync
    final syncResult = Process.runSync('ats', ['sync'], workingDirectory: File(_graph.path).parent.parent.path);

    final activeFlows = flows.entries
        .where((e) => (e.value as Map<String, dynamic>)['active'] == true)
        .map((e) => e.key)
        .toList();

    return {
      'flow': flowName,
      'active': activate,
      'sync_success': syncResult.exitCode == 0,
      'active_flows': activeFlows,
      'message': activate
          ? 'Flow $flowName activated. Hot Restart (r/F5) to see logs.'
          : 'Flow $flowName silenced.',
    };
  }
}
