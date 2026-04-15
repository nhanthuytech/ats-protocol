/// ATS — Agentic Telemetry Standard for Flutter
///
/// A protocol that gives AI Coding Agents (Cursor, Claude, Windsurf)
/// structured knowledge of your project's business logic flows.
///
/// ## Quick Start
///
/// 1. Add to pubspec.yaml:
///    ```yaml
///    dependencies:
///      ats_flutter: ^0.1.0
///    ```
///
/// 2. Initialize in main():
///    ```dart
///    import 'package:ats_flutter/ats_flutter.dart';
///    import 'generated/ats/ats_generated.g.dart';
///
///    void main() {
///      WidgetsFlutterBinding.ensureInitialized();
///      AtsGenerated.init();
///      runApp(const MyApp());
///    }
///    ```
///
/// 3. Trace methods (AI does this once per class):
///    ```dart
///    Future<void> processPayment(PaymentRequest req) async {
///      ATS.trace('PaymentService', 'processPayment', data: req.toJson());
///      // ... business logic
///    }
///    ```
///
/// 4. Control via `.ats/flow_graph.json`:
///    ```json
///    {
///      "flows": {
///        "PAYMENT_FLOW": {
///          "active": true,
///          "classes": { "PaymentService": ["processPayment"] }
///        }
///      }
///    }
///    ```
library ats_flutter;

export 'src/ats_core.dart' show ATS;
