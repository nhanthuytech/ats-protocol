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
}
