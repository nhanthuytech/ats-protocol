import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

/// Writes ATS trace logs to JSONL files.
///
/// Log location: {AppDocumentsDir}/.ats/logs/{FLOW_NAME}/{YYYY-MM-DD}.jsonl
///
/// Format (one JSON object per line):
/// {"ts":"...","flow":"PAYMENT_FLOW","class":"PaymentService","method":"processPayment","data":{...}}
///
/// To find logs on device/simulator:
///   iOS Simulator: ~/Library/Developer/CoreSimulator/Devices/.../Documents/.ats/logs/
///   Android Emulator: /data/data/{package}/.ats/logs/ (use adb pull)
///   Desktop: printed to debugPrint + file in app documents dir
class LogWriter {
  Directory? _logsDir;
  String? _logsDirPath;

  LogWriter._();

  static Future<LogWriter> create() async {
    final writer = LogWriter._();
    try {
      final appDir = await getApplicationDocumentsDirectory();
      writer._logsDirPath = '${appDir.path}/.ats/logs';
      writer._logsDir = Directory(writer._logsDirPath!);
      await writer._logsDir!.create(recursive: true);
      debugPrint('[ATS] Log directory: ${writer._logsDirPath}');
    } catch (e) {
      debugPrint('[ATS] ⚠️  Could not create log directory: $e');
    }
    return writer;
  }

  /// Write a trace entry. Fire-and-forget — never blocks the caller.
  void writeAsync({
    required String flow,
    required String className,
    required String methodName,
    dynamic data,
  }) {
    if (_logsDir == null) return;

    unawaited(_write(
      flow: flow,
      className: className,
      methodName: methodName,
      data: data,
    ));
  }

  Future<void> _write({
    required String flow,
    required String className,
    required String methodName,
    dynamic data,
  }) async {
    try {
      final date = _today();
      final flowDir = Directory('${_logsDir!.path}/$flow');
      await flowDir.create(recursive: true);

      final file = File('${flowDir.path}/$date.jsonl');
      final entry = {
        'ts': DateTime.now().toIso8601String(),
        'flow': flow,
        'class': className,
        'method': methodName,
        'data': _sanitize(data),
      };

      await file.writeAsString(
        '${json.encode(entry)}\n',
        mode: FileMode.append,
      );
    } catch (_) {
      // Intentionally silent — logging must never crash the app.
    }
  }

  String _today() => DateTime.now().toIso8601String().substring(0, 10);

  dynamic _sanitize(dynamic data) {
    if (data == null) return null;
    try {
      json.encode(data);
      return data;
    } catch (_) {
      return data.toString();
    }
  }

  /// Returns the path where logs are stored (useful for AI to know where to look).
  String? get logsDirPath => _logsDirPath;
}

/// Extension to suppress unawaited future warnings without lint suppression.
void unawaited(Future<void> future) {}
