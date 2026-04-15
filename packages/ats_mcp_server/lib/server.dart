import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;

import 'tools/context_tool.dart';
import 'tools/activate_tool.dart';
import 'tools/validate_tool.dart';
import 'tools/impact_tool.dart';
import 'tools/graph_tool.dart';

/// ATS MCP Server — JSON-RPC 2.0 over stdin/stdout
class AtsMcpServer {
  final String projectRoot;
  late final Map<String, Function(Map<String, dynamic>)> _tools;

  AtsMcpServer(this.projectRoot) {
    final graphPath = p.join(projectRoot, '.ats', 'flow_graph.json');
    _tools = {
      'ats_context': (args) => ContextTool(graphPath).execute(args),
      'ats_activate': (args) => ActivateTool(graphPath).execute(args),
      'ats_silence': (args) => ActivateTool(graphPath).execute({...args, 'silence': true}),
      'ats_validate': (args) => ValidateTool(graphPath, projectRoot).execute(args),
      'ats_impact': (args) => ImpactTool(graphPath).execute(args),
      'ats_graph': (args) => GraphTool(graphPath).execute(args),
    };
  }

  Future<void> run() async {
    await for (final line in stdin.transform(utf8.decoder).transform(const LineSplitter())) {
      try {
        final request = jsonDecode(line) as Map<String, dynamic>;
        final response = await _handleRequest(request);
        stdout.writeln(jsonEncode(response));
      } catch (e) {
        stdout.writeln(jsonEncode(_errorResponse(null, -32700, 'Parse error: $e')));
      }
    }
  }

  Future<Map<String, dynamic>> _handleRequest(Map<String, dynamic> request) async {
    final id = request['id'];
    final method = request['method'] as String?;
    final params = request['params'] as Map<String, dynamic>? ?? {};

    switch (method) {
      case 'initialize':
        return _result(id, {
          'protocolVersion': '2024-11-05',
          'capabilities': {'tools': {}},
          'serverInfo': {'name': 'ats-mcp-server', 'version': '0.1.0'},
        });

      case 'notifications/initialized':
        return _result(id, {});

      case 'tools/list':
        return _result(id, {'tools': _toolDefinitions()});

      case 'tools/call':
        final toolName = params['name'] as String?;
        final toolArgs = params['arguments'] as Map<String, dynamic>? ?? {};
        if (toolName == null || !_tools.containsKey(toolName)) {
          return _errorResponse(id, -32602, 'Unknown tool: $toolName');
        }
        try {
          final result = await _tools[toolName]!(toolArgs);
          return _result(id, {
            'content': [{'type': 'text', 'text': jsonEncode(result)}],
          });
        } catch (e) {
          return _result(id, {
            'content': [{'type': 'text', 'text': 'Error: $e'}],
            'isError': true,
          });
        }

      default:
        return _errorResponse(id, -32601, 'Method not found: $method');
    }
  }

  List<Map<String, dynamic>> _toolDefinitions() => [
    {
      'name': 'ats_context',
      'description': 'Get context for a flow: classes, methods, edges, sessions, upstream dependencies (topologically sorted). Use this INSTEAD of reading flow_graph.json directly.',
      'inputSchema': {
        'type': 'object',
        'properties': {
          'flow': {'type': 'string', 'description': 'Flow name (e.g. PAYMENT_FLOW)'},
          'depth': {'type': 'integer', 'description': 'How many levels of depends_on to traverse. Default: 2', 'default': 2},
        },
        'required': ['flow'],
      },
    },
    {
      'name': 'ats_activate',
      'description': 'Activate a flow to enable ATS.trace() logging. Runs ats sync automatically.',
      'inputSchema': {
        'type': 'object',
        'properties': {
          'flow': {'type': 'string', 'description': 'Flow name to activate'},
        },
        'required': ['flow'],
      },
    },
    {
      'name': 'ats_silence',
      'description': 'Silence a flow to disable logging. Runs ats sync automatically.',
      'inputSchema': {
        'type': 'object',
        'properties': {
          'flow': {'type': 'string', 'description': 'Flow name to silence'},
        },
        'required': ['flow'],
      },
    },
    {
      'name': 'ats_validate',
      'description': 'Validate the flow graph: detect cycles, stale methods, orphan traces, invalid edges.',
      'inputSchema': {
        'type': 'object',
        'properties': {},
      },
    },
    {
      'name': 'ats_impact',
      'description': 'Analyze impact of changing a method: find all callers, callees, and affected flows.',
      'inputSchema': {
        'type': 'object',
        'properties': {
          'method': {'type': 'string', 'description': 'Method in Class.method format (e.g. PaymentService.processPayment)'},
        },
        'required': ['method'],
      },
    },
    {
      'name': 'ats_graph',
      'description': 'Export the flow DAG as a Mermaid diagram.',
      'inputSchema': {
        'type': 'object',
        'properties': {
          'include_methods': {'type': 'boolean', 'description': 'Include method-level edges', 'default': false},
        },
      },
    },
  ];

  Map<String, dynamic> _result(dynamic id, Map<String, dynamic> result) => {
    'jsonrpc': '2.0', 'id': id, 'result': result,
  };

  Map<String, dynamic> _errorResponse(dynamic id, int code, String message) => {
    'jsonrpc': '2.0', 'id': id, 'error': {'code': code, 'message': message},
  };
}
