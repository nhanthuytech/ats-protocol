import 'package:flutter_test/flutter_test.dart';
import 'package:ats_flutter/src/flow_registry.dart';

// ─────────────────────────────────────────────
// FlowRegistry Tests (CLI Inverted-Index Mock)
// ─────────────────────────────────────────────

void main() {
  group('FlowRegistry — compilation parsing', () {
    late FlowRegistry registry;

    setUp(() {
      // Mock the compiled native Map injected by ATS CodeGen:
      const activeFlows = ['PAYMENT_FLOW', 'AUTH_FLOW'];
      const mapping = {
        'PaymentService.processPayment': ['PAYMENT_FLOW'],
        'PaymentService.refund': ['PAYMENT_FLOW'],
        'AuthService.login': ['AUTH_FLOW'],
        'UserService.getUser': ['AUTH_FLOW', 'PROFILE_FLOW'],
      };

      registry = FlowRegistry.fromNative(mapping, activeFlows);
    });

    test('loads correct number of active flows', () {
      final debug = registry.toDebugMap();
      expect((debug['active_flows'] as List).length, 2);
    });

    test('getFlowsForMethod returns correct single flow', () {
      final flows =
          registry.getFlowsForMethod('PaymentService', 'processPayment');
      expect(flows, contains('PAYMENT_FLOW'));
      expect(flows.length, 1);
    });

    test('getFlowsForMethod returns multiple flows for shared method', () {
      // UserService.getUser is mapped to both AUTH_FLOW and PROFILE_FLOW
      final flows = registry.getFlowsForMethod('UserService', 'getUser');
      expect(flows, containsAll(['AUTH_FLOW', 'PROFILE_FLOW']));
      expect(flows.length, 2);
    });

    test(
        'getFlowsForMethod returns empty array for unknown class/method (O(1) miss)',
        () {
      final flows = registry.getFlowsForMethod('UnknownClass', 'doSomething');
      expect(flows, isEmpty);
    });

    test('isActive returns true for active flow', () {
      expect(registry.isActive('PAYMENT_FLOW'), isTrue);
      expect(registry.isActive('AUTH_FLOW'), isTrue);
    });

    test('isActive returns false for inactive flow', () {
      // PROFILE_FLOW is in mapping, but not in active list
      expect(registry.isActive('PROFILE_FLOW'), isFalse);
    });

    test('isActive returns false for non-existent flow', () {
      expect(registry.isActive('NONEXISTENT_FLOW'), isFalse);
    });
  });

  // ─────────────────────────────────────────────
  // V6: ActiveFlows Set performance test
  // ─────────────────────────────────────────────

  group('FlowRegistry — V6 Set-based activeFlows', () {
    test('isActive is O(1) with Set (handles large flow lists)', () {
      // Simulate a project with 100 active flows
      final mapping = <String, List<String>>{};
      final flows = <String>[];
      for (var i = 0; i < 100; i++) {
        final flowName = 'FLOW_$i';
        flows.add(flowName);
        mapping['Class$i.method'] = [flowName];
      }

      final registry = FlowRegistry.fromNative(mapping, flows);

      // All 100 flows should be active (O(1) each)
      expect(registry.isActive('FLOW_0'), isTrue);
      expect(registry.isActive('FLOW_50'), isTrue);
      expect(registry.isActive('FLOW_99'), isTrue);
      expect(registry.isActive('FLOW_100'), isFalse);
    });

    test('toDebugMap returns List for active_flows', () {
      final registry = FlowRegistry.fromNative(
        {'A.b': ['F1']},
        ['F1', 'F2'],
      );
      final debug = registry.toDebugMap();
      expect(debug['active_flows'], isA<List>());
      expect((debug['active_flows'] as List).length, 2);
    });
  });

  // ─────────────────────────────────────────────
  // V6: fromMock factory
  // ─────────────────────────────────────────────

  group('FlowRegistry — fromMock', () {
    test('fromMock parses JSON strings correctly', () {
      final registry = FlowRegistry.fromMock(
        '{"Svc.x":["F1"]}',
        '["F1"]',
      );
      expect(registry.isActive('F1'), isTrue);
      expect(registry.getFlowsForMethod('Svc', 'x'), ['F1']);
    });

    test('fromMock handles empty strings', () {
      final registry = FlowRegistry.fromMock('', '');
      expect(registry.isActive('ANYTHING'), isFalse);
      expect(registry.getFlowsForMethod('A', 'b'), isEmpty);
    });
  });
}
