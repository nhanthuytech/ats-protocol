import 'package:flutter/foundation.dart';

import 'flow_registry.dart';
import 'log_writer.dart';

/// ATS — Agentic Telemetry Standard
///
/// The main entry point for the ATS protocol in Flutter.
/// Designed to be used by AI Coding Agents (Cursor, Claude, Windsurf)
/// to instrument and understand project business logic flows.
///
/// ## How AI agents use this:
///
/// 1. Read `assets/ats/flow_graph.json` to understand which classes belong
///    to which flows.
/// 2. Call `ATS.trace()` in every method of a class (done once, never removed).
/// 3. Set `flow.active = true` in flow_graph.json + hot restart to enable logs.
/// 4. After debugging, set `flow.active = false` — logs become no-ops instantly.
///
/// ## Zero production overhead:
///
/// Every method in this class returns immediately if [kReleaseMode] is true.
/// ATS is completely invisible in production builds.
class ATS {
  static FlowRegistry? _registry;
  static LogWriter? _writer;
  static Set<String> _mutedMethods = {};
  static bool _initialized = false;

  // Private constructor — ATS is a static-only class.
  ATS._();

  // ─────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────

  /// Natively initializing the ATS protocol using Code-Gen Data.
  ///
  /// Do NOT call this directly. Use `AtsGenerated.init()` from your
  /// `lib/ats_generated.dart` file automatically created by `ats sync`.
  static Future<void> internalInit(
    Map<String, List<String>> staticMap,
    List<String> activeFlows, [
    Set<String>? mutedMethods,
  ]) async {
    if (kReleaseMode) return;
    if (_initialized) return;

    _registry = FlowRegistry.fromNative(staticMap, activeFlows);
    _mutedMethods = mutedMethods ?? {};
    _writer = await LogWriter.create();
    _initialized = true;

    if (_mutedMethods.isNotEmpty) {
      debugPrint('[ATS] Muted methods: ${_mutedMethods.length}');
    }
  }

  /// [DEPRECATED] — ATS V3 uses Dart CodeGen instead of dart-defines.
  ///
  /// Call `AtsGenerated.init()` instead.
  @Deprecated('Use AtsGenerated.init() instead.')
  static Future<void> init({String? customPath}) async {
    if (kReleaseMode) return;
    if (_initialized) return;

    _registry = await FlowRegistry.load(customPath: customPath);
    _writer = await LogWriter.create();
    _initialized = true;
  }

  // ─────────────────────────────────────────────────
  // Core API
  // ─────────────────────────────────────────────────

  /// Trace a method call.
  ///
  /// **AI agents call this at the start of every method — once, permanently.**
  /// It is a complete no-op if:
  /// - Running in release mode
  /// - ATS is not initialized
  /// - The method is not registered in any active flow
  ///
  /// Log format: `[ATS][FLOW_NAME][#SEQ][dDEPTH] Class.method | {data}`
  ///
  /// ```dart
  /// Future<void> processPayment(PaymentRequest req) async {
  ///   ATS.trace('PaymentService', 'processPayment', data: req.toJson());
  ///   // ... rest of the method
  /// }
  /// ```
  ///
  /// [className] — The class containing this method (exact name, no generics).
  /// [methodName] — The method name as a string.
  /// [data] — Optional payload. Must be JSON-serializable. Truncated if too large.
  static void trace(
    String className,
    String methodName, {
    dynamic data,
  }) {
    if (kReleaseMode || !_initialized || _registry == null) return;

    // O(1) muted check — skips noisy methods without removing them from graph
    final key = '$className.$methodName';
    if (_mutedMethods.contains(key)) return;

    final flows = _registry!.getFlowsForMethod(className, methodName);
    if (flows.isEmpty) return;

    final seq = _nextSeq();
    final depth = _currentDepth();
    final seqStr = seq.toString().padLeft(3, '0');

    for (final flow in flows) {
      // Log to console — AI reads this from IDE run output
      debugPrint('[ATS][$flow][#$seqStr][d$depth] $className.$methodName'
          '${data != null ? ' | $data' : ''}');

      // Log to file — persisted for later analysis
      _writer?.writeAsync(
        flow: flow,
        className: className,
        methodName: methodName,
        data: data,
      );
    }
  }

  // ─────────────────────────────────────────────────
  // Sequencer — tracks execution order and call depth
  // ─────────────────────────────────────────────────

  static int _seq = 0;

  static int _nextSeq() => ++_seq;

  /// Best-effort depth estimation from stack trace frames.
  /// Counts ATS.trace() appearances in the call stack.
  static int _currentDepth() {
    final frames = StackTrace.current.toString().split('\n');
    // Count how many frames are within the user's lib/ code
    // Use a simple heuristic: count frames between first and last app frame
    int appFrames = 0;
    for (final frame in frames) {
      if (frame.contains('package:') &&
          !frame.contains('package:ats_flutter') &&
          !frame.contains('package:flutter')) {
        appFrames++;
      }
    }
    // Normalize: 1-2 app frames = d0, 3-4 = d1, etc.
    return (appFrames ~/ 2).clamp(0, 10);
  }

  /// Reset sequence counter. Called on Hot Restart via AtsGenerated.init().
  static void resetSequence() => _seq = 0;

  // Flow Control (Removed in V2)
  // ─────────────────────────────────────────────────
  // Note: Runtime memory toggling of flows via code is removed to enforce
  // strict separation of design-time configuration and runtime execution.
  // To toggle a flow: edit flow_graph.json, ensure `ats sync` runs, and Hot Restart.

  // ─────────────────────────────────────────────────
  // Introspection (AI uses these to understand state)
  // ─────────────────────────────────────────────────

  /// Returns true if the given flow is currently active.
  static bool isActive(String flowName) {
    if (kReleaseMode || !_initialized) return false;
    return _registry?.isActive(flowName) ?? false;
  }

  /// Returns all flow names that are currently active.
  static List<String> get activeFlows {
    if (kReleaseMode || !_initialized) return [];
    return _registry?.toDebugMap()['active_flows'] as List<String>? ?? [];
  }

  /// Returns a structured summary of all flows and their current state.
  /// Useful for AI to understand the project at a glance.
  ///
  /// ```dart
  /// debugPrint(ATS.summary.toString());
  /// ```
  static Map<String, dynamic>? get summary {
    if (kReleaseMode || !_initialized) return null;
    return _registry?.toDebugMap();
  }

  /// Returns the path where log files are written.
  /// AI uses this to know where to look for logs on device/simulator.
  static String? get logsDirPath {
    if (kReleaseMode || !_initialized) return null;
    return _writer?.logsDirPath;
  }

  /// Whether ATS has been successfully initialized.
  static bool get isInitialized => _initialized && !kReleaseMode;
}
