import 'dart:io';
import 'package:ats_flutter/src/cli/runner.dart';

/// ATS CLI entry point.
///
/// Install globally:
///   dart pub global activate ats_flutter
///
/// Then use anywhere:
///   ats init
///   ats skill install --global
///   ats skill claude
///   ats status
///   ats activate PAYMENT_FLOW
///   ats silence AUTH_FLOW
void main(List<String> args) async {
  try {
    await AtsRunner.run(args);
  } catch (e, st) {
    stderr.writeln('\x1B[31m✗ Unexpected error: $e\x1B[0m');
    stderr.writeln(st);
    exit(1);
  }
}
