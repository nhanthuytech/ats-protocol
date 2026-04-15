import 'dart:io';

import 'package:ats_mcp_server/server.dart';

void main(List<String> args) async {
  final projectRoot = args.isNotEmpty ? args[0] : Directory.current.path;
  final server = AtsMcpServer(projectRoot);
  await server.run();
}
