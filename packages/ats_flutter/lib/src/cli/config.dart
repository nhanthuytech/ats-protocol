import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:yaml/yaml.dart';

class AtsConfig {
  final String projectPath;
  final String graphDir;
  final String outputDir;
  final String outputFile;

  AtsConfig({
    required this.projectPath,
    required this.graphDir,
    required this.outputDir,
    required this.outputFile,
  });

  /// Path to the graph directory
  Directory get graphDirectory => Directory(p.join(projectPath, graphDir));

  /// Path to the primary flow_graph.json file
  File get graphFile => File(p.join(graphDirectory.path, 'flow_graph.json'));

  /// Path to the output gen file
  File get generatedFile => File(p.join(projectPath, outputDir, outputFile));

  /// Loads `ats.yaml` from the given projectPath.
  /// Falls back to defaults if not found.
  static AtsConfig load(String projectPath) {
    final file = File(p.join(projectPath, 'ats.yaml'));

    String atsDir = '.ats';
    String outputDir = 'lib/generated/ats';
    String outputFile = 'ats_generated.g.dart';

    if (file.existsSync()) {
      try {
        final content = file.readAsStringSync();
        final doc = loadYaml(content);

        if (doc is YamlMap) {
          if (doc.containsKey('ats-dir')) {
            atsDir = doc['ats-dir'].toString();
          }
          if (doc.containsKey('output-dir')) {
            outputDir = doc['output-dir'].toString();
          }
          if (doc.containsKey('output-ats-file')) {
            outputFile = doc['output-ats-file'].toString();
          }
        }
      } catch (e) {
        print('⚠️  [ATS] Thất bại khi đọc ats.yaml: $e');
      }
    }

    return AtsConfig(
      projectPath: projectPath,
      graphDir: atsDir,
      outputDir: outputDir,
      outputFile: outputFile,
    );
  }
}
