import 'dart:convert';
import 'dart:io';

import 'package:args/args.dart';
import 'package:path/path.dart' as p;

import 'package:ats_flutter/src/cli/config.dart';

import 'skill_templates.dart';

// ─────────────────────────────────────────────────────────────────────────────
// ATS CLI Runner
// ─────────────────────────────────────────────────────────────────────────────

class AtsRunner {
  static const _version = '0.1.0';

  static Future<void> run(List<String> args) async {
    if (args.isEmpty) {
      _printHelp();
      return;
    }

    final command = args[0];
    final rest = args.length > 1 ? args.sublist(1) : <String>[];

    switch (command) {
      case 'run':
        await _runFlutter(rest);
      case 'init':
        await _runInit(rest);
      case 'skill':
        await _runSkill(rest);
      case 'status':
        await _runStatus();
      case 'sync':
      case 'build':
        await _runSync();
      case 'activate':
        await _runFlowToggle(rest, true);
      case 'silence':
        await _runFlowToggle(rest, false);
      case 'flows':
        await _runFlows();
      case 'graph':
        await _runGraph(rest);
      case '--version':
      case '-v':
        print('ats $_version');
      case '--help':
      case '-h':
      case 'help':
        _printHelp();
      default:
        _err('Unknown command: "$command". Run `ats help` for usage.');
        exit(1);
    }
  }

  // ───────────────────────────────────────────────────
  // ats init
  // ───────────────────────────────────────────────────

  // ───────────────────────────────────────────────────
  // ats run [...flutter run args]  (convenience fallback)
  // ───────────────────────────────────────────────────

  /// Wraps `flutter run` but no longer requires dart-define since V3 uses codegen.
  static Future<void> _runFlutter(List<String> args) async {
    final config = AtsConfig.load(Directory.current.path);
    final generatedFile = config.generatedFile;
    final graphFile = config.graphFile;

    if (!graphFile.existsSync()) {
      _err('.ats/flow_graph.json not found. Run `ats init` first.');
      exit(1);
    }

    if (!generatedFile.existsSync()) {
      await _generateDartCode(graphFile, generatedFile);
    }

    final flutterArgs = ['run', ...args];

    _ok('flutter run (ATS code statically injected via \$generatedFile)');
    print('');

    final result = await Process.start(
      'flutter',
      flutterArgs,
      mode: ProcessStartMode.inheritStdio,
    );
    exit(await result.exitCode);
  }

  /// Compile generated Dart file from `.ats/flow_graph.json`
  /// Supports both V3 (array) and V4 (object with methods/needs_verify) class formats.
  static Future<void> _generateDartCode(
    File graphFile,
    File targetFile,
  ) async {
    try {
      final content = graphFile.readAsStringSync();
      final graph = jsonDecode(content) as Map<String, dynamic>;
      final flows = graph['flows'] as Map<String, dynamic>? ?? {};

      // ── Cycle detection on depends_on (Kahn's algorithm) ──
      if (!_validateNoCycles(flows)) {
        _err('Circular dependency detected in depends_on. Fix flow_graph.json before syncing.');
        return;
      }

      // ── Validate edges reference existing methods ──
      final edges = graph['edges'] as List<dynamic>? ?? [];
      _validateEdges(flows, edges);

      final activeFlows = <String>[];
      // Map form: 'Class.method': ['FLOW_A', 'FLOW_B']
      final Map<String, List<String>> staticMap = {};

      for (final flowName in flows.keys) {
        final flowNode = flows[flowName] as Map<String, dynamic>;
        final isActive = flowNode['active'] == true;
        if (!isActive) continue;

        activeFlows.add(flowName);

        final classes = flowNode['classes'] as Map<String, dynamic>? ?? {};
        for (final className in classes.keys) {
          // Support both V3 format (List) and V4 format (Map with "methods" key)
          final classValue = classes[className];
          List<String> methods;
          if (classValue is List) {
            // V3 format: "ClassName": ["method1", "method2"]
            methods = classValue.cast<String>();
          } else if (classValue is Map) {
            // V4 format: "ClassName": { "methods": ["method1", "method2"], ... }
            methods = (classValue['methods'] as List<dynamic>?)?.cast<String>() ?? [];
          } else {
            continue;
          }

          for (final method in methods) {
            final key = '$className.$method';
            staticMap[key] = [...(staticMap[key] ?? []), flowName];
          }
        }
      }

      // Format map to Dart code
      final mapBuffer = StringBuffer();
      mapBuffer.writeln('const _kMethodMap = <String, List<String>>{');
      for (final entry in staticMap.entries) {
        final flowsString = entry.value.map((e) => "'$e'").join(', ');
        mapBuffer.writeln("  '${entry.key}': [$flowsString],");
      }
      mapBuffer.writeln('};');

      final activeFlowsString = activeFlows.map((e) => "'$e'").join(', ');

      final dartCode = '''
// AUTO-GENERATED BY ATS CLI (V4)
// DO NOT EDIT. THIS FILE IS COMPILED FROM .ats/flow_graph.json

import 'package:ats_flutter/ats_flutter.dart';

$mapBuffer

const _kActiveFlows = <String>[$activeFlowsString];

abstract class AtsGenerated {
  static void init() {
    ATS.resetSequence();
    ATS.internalInit(_kMethodMap, _kActiveFlows);
  }
}
''';

      if (!targetFile.parent.existsSync()) {
        targetFile.parent.createSync(recursive: true);
      }
      targetFile.writeAsStringSync(dartCode);
    } catch (e) {
      _err('Failed to compile ats_generated.g.dart: $e');
    }
  }

  /// Kahn's algorithm: detect cycles in depends_on graph.
  /// Returns true if no cycle, false if cycle found.
  static bool _validateNoCycles(Map<String, dynamic> flows) {
    // Build adjacency list and in-degree map
    final Map<String, List<String>> adj = {};
    final Map<String, int> inDegree = {};

    for (final name in flows.keys) {
      adj.putIfAbsent(name, () => []);
      inDegree.putIfAbsent(name, () => 0);
    }

    for (final name in flows.keys) {
      final node = flows[name] as Map<String, dynamic>;
      final deps = node['depends_on'] as List<dynamic>? ?? [];
      for (final dep in deps) {
        final depStr = dep.toString();
        if (!flows.containsKey(depStr)) {
          _warn('Flow "$name" depends on "$depStr" which does not exist.');
          continue;
        }
        adj.putIfAbsent(depStr, () => []);
        adj[depStr]!.add(name);
        inDegree[name] = (inDegree[name] ?? 0) + 1;
      }
    }

    // Kahn's: start with nodes that have no incoming edges
    final queue = <String>[];
    for (final entry in inDegree.entries) {
      if (entry.value == 0) queue.add(entry.key);
    }

    int visited = 0;
    while (queue.isNotEmpty) {
      final node = queue.removeAt(0);
      visited++;
      for (final neighbor in (adj[node] ?? [])) {
        inDegree[neighbor] = (inDegree[neighbor] ?? 1) - 1;
        if (inDegree[neighbor] == 0) queue.add(neighbor);
      }
    }

    return visited == flows.length;
  }

  /// Validate that all edges reference existing methods in flows.
  static void _validateEdges(Map<String, dynamic> flows, List<dynamic> edges) {
    // Build set of all known "Class.method" keys
    final known = <String>{};
    for (final flowNode in flows.values) {
      final classes = (flowNode as Map<String, dynamic>)['classes'] as Map<String, dynamic>? ?? {};
      for (final className in classes.keys) {
        final classValue = classes[className];
        List<String> methods;
        if (classValue is List) {
          methods = classValue.cast<String>();
        } else if (classValue is Map) {
          methods = (classValue['methods'] as List<dynamic>?)?.cast<String>() ?? [];
        } else {
          continue;
        }
        for (final m in methods) {
          known.add('$className.$m');
        }
      }
    }

    for (final edge in edges) {
      final e = edge as Map<String, dynamic>;
      final from = e['from'] as String? ?? '';
      final to = e['to'] as String? ?? '';
      if (from.isNotEmpty && !known.contains(from)) {
        _warn('Edge from "$from" references unknown method.');
      }
      if (to.isNotEmpty && !known.contains(to)) {
        _warn('Edge to "$to" references unknown method.');
      }
    }
  }

  static Future<void> _runSync() async {
    final config = AtsConfig.load(Directory.current.path);
    final generatedFile = config.generatedFile;
    final graphFile = config.graphFile;

    if (!graphFile.existsSync()) {
      _err('.ats/flow_graph.json not found. Run `ats init` first.');
      exit(1);
    }

    await _generateDartCode(graphFile, generatedFile);
    _ok('Synced ${config.outputDir}/${config.outputFile} with compiled mappings.');
  }

  static Future<void> _runInit(List<String> args) async {
    final parser = ArgParser()
      ..addOption('project',
          abbr: 'p', help: 'Project directory (default: current)');
    late ArgResults opts;
    try {
      opts = parser.parse(args);
    } catch (e) {
      _err('$e\n\nUsage: ats init [--project <dir>]');
      exit(1);
    }

    final projectDir = Directory(opts['project'] as String? ?? '.');
    if (!projectDir.existsSync()) {
      _err('Directory not found: ${projectDir.path}');
      exit(1);
    }

    // Detect project name from pubspec.yaml
    final pubspec = File(p.join(projectDir.path, 'pubspec.yaml'));
    String projectName = p.basename(projectDir.absolute.path);
    if (pubspec.existsSync()) {
      final lines = pubspec.readAsLinesSync();
      for (final line in lines) {
        if (line.startsWith('name:')) {
          projectName = line.split(':').last.trim();
          break;
        }
      }
    } else {
      _warn('pubspec.yaml not found. Is this a Flutter project?');
    }

    // Load config (or defaults)
    final config = AtsConfig.load(projectDir.path);
    final graphDir = config.graphDirectory;
    final graphFile = config.graphFile;

    // Create flow_graph.json if not exists
    if (graphFile.existsSync()) {
      _warn('.ats/flow_graph.json already exists. Skipping.');
    } else {
      graphDir.createSync(recursive: true);
      final content = kFlowGraphTemplate
          .replaceAll('{PROJECT_NAME}', projectName)
          .replaceAll('{NOW}', DateTime.now().toIso8601String());
      graphFile.writeAsStringSync(content);
      _ok('Created ${_rel(projectDir, graphFile)}');
    }

    // Create optional ats.yaml if not configured
    final yamlFile = File(p.join(projectDir.path, 'ats.yaml'));
    if (!yamlFile.existsSync()) {
      final yamlContent = '''# ATS Configuration File
# Read more at: https://github.com/nhanthuytech/ats-protocol
#
# ats-dir: .ats                     # Where flow_graph.json is stored
# output-dir: lib/generated/ats     # Where the compiled code is placed
# output-ats-file: ats_generated.g.dart   # The name of the compiled dart file
''';
      yamlFile.writeAsStringSync(yamlContent);
      _ok('Created ats.yaml template');
    }

    _ok('No pubspec.yaml assets changes needed (file is NOT bundled into APK)');

    // Check main.dart for AtsGenerated.init()
    final mainFile = File(p.join(projectDir.path, 'lib', 'main.dart'));
    if (mainFile.existsSync()) {
      final mainContent = mainFile.readAsStringSync();
      if (!mainContent.contains('AtsGenerated.init()')) {
        _warn(
          'Add to your main() before runApp():\n'
          '\n'
          '  import \'package:ats_flutter/ats_flutter.dart\';\n'
          '  import \'\${config.outputDir}/\${config.outputFile}\';\n'
          '\n'
          '  void main() {\n'
          '    WidgetsFlutterBinding.ensureInitialized();\n'
          '    AtsGenerated.init();\n'
          '    runApp(const MyApp());\n'
          '  }\n',
        );
      } else {
        _ok('main.dart already calls AtsGenerated.init()');
      }
    }

    // Set up Code Gen
    final generatedFile = config.generatedFile;
    await _generateDartCode(graphFile, generatedFile);

    _ok('ATS CodeGen successfully setup in `${config.outputDir}/${config.outputFile}`!');

    print('');
    _ok('ATS initialized in "$projectName". Run `ats skill install` to set up AI skills.');
  }

  // ───────────────────────────────────────────────────
  // ats skill [install|claude]
  // ───────────────────────────────────────────────────

  static Future<void> _runSkill(List<String> args) async {
    if (args.isEmpty) {
      _printSkillHelp();
      return;
    }

    switch (args[0]) {
      case 'install':
        await _skillInstall(args.sublist(1));
      case 'claude':
        await _skillClaude(args.sublist(1));
      default:
        _err('Unknown skill subcommand: "${args[0]}"');
        _printSkillHelp();
        exit(1);
    }
  }

  /// ats skill install [--global] [--dir <path>]
  static Future<void> _skillInstall(List<String> args) async {
    final parser = ArgParser()
      ..addFlag('global',
          abbr: 'g', help: 'Install to global Antigravity skills directory')
      ..addOption('dir', abbr: 'd', help: 'Custom target directory');
    late ArgResults opts;
    try {
      opts = parser.parse(args);
    } catch (e) {
      _err('$e\n\nUsage: ats skill install [--global] [--dir <path>]');
      exit(1);
    }

    late Directory targetDir;

    if (opts['dir'] != null) {
      targetDir = Directory(opts['dir'] as String);
    } else if (opts['global'] == true) {
      // Global Antigravity skills directory
      final home = _homeDir();
      targetDir = Directory(
          p.join(home, '.gemini', 'antigravity', 'skills', 'ats-flutter'));
    } else {
      // Local project: .agents/skills/ats-flutter/
      targetDir = Directory(p.join('.agents', 'skills', 'ats-flutter'));
    }

    targetDir.createSync(recursive: true);
    final skillFile = File(p.join(targetDir.path, 'SKILL.md'));
    skillFile.writeAsStringSync(kAntigravitySkillContent);

    final label =
        opts['global'] == true ? 'global Antigravity' : 'local project';
    _ok('SKILL.md installed to $label skills directory:');
    print('   ${skillFile.absolute.path}');
    print('');
    print('Antigravity will automatically load this skill when working in');
    print('projects with assets/ats/flow_graph.json.');
  }

  /// ats skill claude [--global] [--dir <path>]
  static Future<void> _skillClaude(List<String> args) async {
    final parser = ArgParser()
      ..addFlag('global',
          abbr: 'g',
          help: 'Install to ~/.claude/CLAUDE.md (applies to ALL projects)')
      ..addOption('dir',
          abbr: 'd', help: 'Target project directory (default: current dir)')
      ..addFlag('dot-claude',
          help: 'Install to .claude/CLAUDE.md instead of root CLAUDE.md');
    late ArgResults opts;
    try {
      opts = parser.parse(args);
    } catch (e) {
      _err(
          '$e\n\nUsage: ats skill claude [--global] [--dir <path>] [--dot-claude]');
      exit(1);
    }

    final File target;

    if (opts['global'] == true) {
      // Global: ~/.claude/CLAUDE.md — applies to ALL Claude Code sessions
      final home = _homeDir();
      final dir = Directory(p.join(home, '.claude'));
      dir.createSync(recursive: true);
      target = File(p.join(dir.path, 'CLAUDE.md'));
    } else {
      final baseDir = opts['dir'] as String? ?? '.';
      final useDotClaude = opts['dot-claude'] as bool? ?? false;

      if (useDotClaude) {
        final dir = Directory(p.join(baseDir, '.claude'));
        dir.createSync(recursive: true);
        target = File(p.join(dir.path, 'CLAUDE.md'));
      } else {
        // Standard: CLAUDE.md at project root
        target = File(p.join(baseDir, 'CLAUDE.md'));
      }
    }

    if (target.existsSync()) {
      final existing = target.readAsStringSync();
      if (existing.contains('ATS Protocol')) {
        _warn('CLAUDE.md already contains ATS instructions. Skipping.');
        print('   Path: ${target.absolute.path}');
        return;
      }
      // Append to existing CLAUDE.md (e.g. user already has their own)
      target.writeAsStringSync('\n\n---\n\n$kClaudeSkillContent',
          mode: FileMode.append);
      _ok('ATS instructions appended to:');
    } else {
      target.writeAsStringSync(kClaudeSkillContent);
      _ok('CLAUDE.md created at:');
    }

    print('   ${target.absolute.path}');
    print('');

    if (opts['global'] == true) {
      print('This applies to ALL Claude Code sessions on this machine.');
    } else {
      print(
          'Claude Code loads this automatically when working in this project.');
      print(
          'Tip: commit CLAUDE.md to git so your team gets the same instructions.');
    }
  }

  // ───────────────────────────────────────────────────
  // ats status
  // ───────────────────────────────────────────────────

  static Future<void> _runStatus() async {
    final graph = _loadGraph();
    if (graph == null) return;

    final flows = graph['flows'] as Map<String, dynamic>? ?? {};
    if (flows.isEmpty) {
      print('No flows defined yet. Run `ats init` first.');
      return;
    }

    print('');
    print('Project: ${graph['project']}  (ATS ${graph['ats_version']})');
    print('Updated: ${graph['updated_at'] ?? 'unknown'}');
    print('');
    print('┌─────────────────────────────────────────────────────────┐');
    print('│  Flow                    │ Active │ Classes │ Methods    │');
    print('├─────────────────────────────────────────────────────────┤');

    for (final entry in flows.entries) {
      final name = entry.key;
      final data = entry.value as Map<String, dynamic>;
      final active = data['active'] == true;
      final classes = data['classes'] as Map<String, dynamic>? ?? {};
      final methodCount =
          classes.values.fold<int>(0, (sum, v) => sum + (v as List).length);

      final paddedName = name.padRight(24);
      final statusIcon = active ? '🟢 YES' : '   no ';
      final classCount = classes.length.toString().padLeft(7);
      final methods = methodCount.toString().padLeft(7);

      print('│  $paddedName │ $statusIcon │$classCount │$methods   │');
    }
    print('└─────────────────────────────────────────────────────────┘');
    print('');

    final activeFlows = flows.entries
        .where((e) => (e.value as Map)['active'] == true)
        .map((e) => e.key)
        .toList();

    if (activeFlows.isNotEmpty) {
      _warn('Active flows: ${activeFlows.join(', ')}');
      print('   Remember to silence flows when debugging is complete!');
      print('   Run: ats silence <FLOW_NAME>');
    }
  }

  // ───────────────────────────────────────────────────
  // ats flows
  // ───────────────────────────────────────────────────

  static Future<void> _runFlows() async {
    final graph = _loadGraph();
    if (graph == null) return;

    final flows = graph['flows'] as Map<String, dynamic>? ?? {};
    if (flows.isEmpty) {
      print('No flows defined yet.');
      return;
    }

    print('');
    for (final entry in flows.entries) {
      final data = entry.value as Map<String, dynamic>;
      final active = data['active'] == true;
      final classes = data['classes'] as Map<String, dynamic>? ?? {};
      print('${active ? '🟢' : '⚫'} ${entry.key}');
      print('   ${data['description'] ?? '(no description)'}');
      for (final cls in classes.entries) {
        final methods = (cls.value as List).join(', ');
        print('   · ${cls.key}: $methods');
      }
      print('');
    }
  }

  // ───────────────────────────────────────────────────
  // ats activate <FLOW> / ats silence <FLOW>
  // ───────────────────────────────────────────────────

  static Future<void> _runFlowToggle(List<String> args, bool activate) async {
    if (args.isEmpty) {
      _err('Usage: ats ${activate ? 'activate' : 'silence'} <FLOW_NAME>');
      exit(1);
    }

    final flowName = args[0].toUpperCase();
    final graphFile = _findGraphFile();
    if (graphFile == null) return;

    final raw = graphFile.readAsStringSync();
    final graph = jsonDecode(raw) as Map<String, dynamic>;
    final flows = graph['flows'] as Map<String, dynamic>? ?? {};

    if (!flows.containsKey(flowName)) {
      _err(
          'Flow "$flowName" not found. Available flows: ${flows.keys.join(', ')}');
      exit(1);
    }

    (flows[flowName] as Map<String, dynamic>)['active'] = activate;
    graph['updated_at'] = DateTime.now().toIso8601String();

    graphFile.writeAsStringSync(
      const JsonEncoder.withIndent('  ').convert(graph),
    );

    // Keep config synced generated file in sync with flow_graph.json
    final config = AtsConfig.load(graphFile.parent.parent.path);
    final generatedFile = config.generatedFile;
    await _generateDartCode(graphFile, generatedFile);

    final icon = activate ? '🟢' : '⚫';
    _ok('$icon $flowName is now ${activate ? 'ACTIVE' : 'SILENT'}');

    print('');
    print('   ⚠️  LƯU Ý KHI UPDATE LOG KHÔNG HIỆN:');
    print(
        '   • Dùng Hot Restart (phím r hoặc F5) để Flutter nạp lại tệp ${config.outputDir}/${config.outputFile}.');
  }

  // ───────────────────────────────────────────────────
  // ats graph
  // ───────────────────────────────────────────────────

  static Future<void> _runGraph(List<String> args) async {
    final graph = _loadGraph();
    if (graph == null) return;

    final flows = graph['flows'] as Map<String, dynamic>? ?? {};
    final edges = graph['edges'] as List<dynamic>? ?? [];
    final includeMethods = args.contains('--methods');

    final buffer = StringBuffer();
    buffer.writeln('```mermaid');
    buffer.writeln('graph TD');

    // Flow-level edges from depends_on
    for (final name in flows.keys) {
      final node = flows[name] as Map<String, dynamic>;
      final deps = node['depends_on'] as List<dynamic>? ?? [];
      final parent = node['parent'] as String?;

      for (final dep in deps) {
        buffer.writeln('    $dep --> $name');
      }
      if (parent != null) {
        buffer.writeln('    $parent -.-> $name');
      }
    }

    // Standalone flows (no edges)
    for (final name in flows.keys) {
      final node = flows[name] as Map<String, dynamic>;
      final deps = node['depends_on'] as List<dynamic>? ?? [];
      final parent = node['parent'] as String?;

      // Check if this flow has any connections
      bool hasConnection = deps.isNotEmpty || parent != null;
      if (!hasConnection) {
        // Check if any other flow depends on it
        for (final otherName in flows.keys) {
          final otherNode = flows[otherName] as Map<String, dynamic>;
          final otherDeps = otherNode['depends_on'] as List<dynamic>? ?? [];
          final otherParent = otherNode['parent'] as String?;
          if (otherDeps.contains(name) || otherParent == name) {
            hasConnection = true;
            break;
          }
        }
      }
      if (!hasConnection) {
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

    buffer.writeln('```');

    final output = buffer.toString();

    // Check for --output flag
    final outputIdx = args.indexOf('--output');
    if (outputIdx != -1 && outputIdx + 1 < args.length) {
      final outFile = File(args[outputIdx + 1]);
      outFile.writeAsStringSync(output);
      _ok('Graph exported to ${outFile.path}');
    } else {
      print(output);
    }
  }

  // ───────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────

  static File? _findGraphFile() {
    final config = AtsConfig.load(Directory.current.path);
    if (config.graphFile.existsSync()) {
      return config.graphFile;
    }
    // Search for flow_graph.json in common fallback locations
    final candidates = [
      'assets/ats/flow_graph.json',
      '.ats/flow_graph.json',
    ];
    for (final c in candidates) {
      final f = File(c);
      if (f.existsSync()) return f;
    }
    _err(
      'flow_graph.json not found.\n'
      'Run `ats init` to set up ATS in this project.',
    );
    return null;
  }

  static Map<String, dynamic>? _loadGraph() {
    final file = _findGraphFile();
    if (file == null) return null;
    try {
      return jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
    } catch (e) {
      _err('Invalid flow_graph.json: $e');
      return null;
    }
  }

  static String _homeDir() {
    return Platform.environment['HOME'] ??
        Platform.environment['USERPROFILE'] ??
        '.';
  }

  static String _rel(Directory base, File file) {
    return p.relative(file.path, from: base.path);
  }

  static void _ok(String msg) => print('\x1B[32m✓\x1B[0m $msg');
  static void _warn(String msg) => print('\x1B[33m⚠\x1B[0m $msg');
  static void _err(String msg) => stderr.writeln('\x1B[31m✗\x1B[0m $msg');

  // ───────────────────────────────────────────────────
  // Help text
  // ───────────────────────────────────────────────────

  static void _printHelp() {
    print('''
\x1B[1mats\x1B[0m — Agentic Telemetry Standard CLI v$_version

\x1B[1mUSAGE\x1B[0m
  ats <command> [options]

\x1B[1mCOMMANDS\x1B[0m
  run [flutter args]      flutter run + auto-inject ATS_FLOW_GRAPH (no asset needed)
  init                    Set up ATS in a Flutter project
  skill install           Install SKILL.md for Antigravity AI
  skill install --global  Install to global Antigravity skills directory
  skill claude            Install CLAUDE.md for Claude Desktop / Claude Code
  skill claude --global   Install to ~/.claude/CLAUDE.md (all projects)
  status                  Show all flows and their active state
  flows                   List flows with classes and methods
  activate <FLOW>         Set a flow active (start logging)
  silence <FLOW>          Silence a flow (stop logging)
  graph                   Export DAG as Mermaid diagram

\x1B[1mEXAMPLES\x1B[0m
  ats init
  ats run                            # replaces: flutter run
  ats run --device-id emulator-5554  # pass through flutter run args
  ats skill install --global
  ats skill claude
  ats status
  ats activate PAYMENT_FLOW
  ats silence PAYMENT_FLOW

Run \x1B[1mats help <command>\x1B[0m for detailed options.
''');
  }

  static void _printSkillHelp() {
    print('''
\x1B[1mats skill\x1B[0m — Install AI agent skills for ATS

\x1B[1mSUBCOMMANDS\x1B[0m
  install                 Install SKILL.md to .agents/skills/ats-flutter/ (local)
  install --global        Install SKILL.md to ~/.gemini/antigravity/skills/ats-flutter/
  install --dir <path>    Install SKILL.md to a custom directory
  claude                  Install CLAUDE.md to current project root
  claude --global         Install to ~/.claude/CLAUDE.md (all Claude Code sessions)
  claude --dir <path>     Install CLAUDE.md to a specific project directory
  claude --dot-claude     Install to .claude/CLAUDE.md instead of root
''');
  }
}
