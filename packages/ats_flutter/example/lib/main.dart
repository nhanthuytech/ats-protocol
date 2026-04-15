// ignore: unused_import
import 'package:ats_flutter/ats_flutter.dart';
import 'generated/ats/ats_generated.g.dart';
import 'package:flutter/material.dart';

// ─────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize ATS with Native CodeGen Map.
  AtsGenerated.init();

  runApp(const AtsExampleApp());
}

// ─────────────────────────────────────────────────────────
// Example services — instrumented with ATS.trace()
// ─────────────────────────────────────────────────────────

class PaymentService {
  Future<String> processPayment(Map<String, dynamic> req) async {
    // AI added this trace once — never removed.
    // When PAYMENT_FLOW.active = true → logs to console + file.
    // When active = false → complete no-op.
    ATS.trace('PaymentService', 'processPayment', data: req);

    await Future.delayed(const Duration(milliseconds: 500));
    return 'tx_${DateTime.now().millisecondsSinceEpoch}';
  }

  Future<bool> refund(String txId) async {
    ATS.trace('PaymentService', 'refund', data: {'txId': txId});
    await Future.delayed(const Duration(milliseconds: 300));
    return true;
  }

  bool validateCard(String cardNumber) {
    ATS.trace('PaymentService', 'validateCard',
        data: {'last4': cardNumber.substring(cardNumber.length - 4)});
    return cardNumber.length == 16;
  }
}

class AuthService {
  Future<Map<String, dynamic>> login(String email, String password) async {
    ATS.trace('AuthService', 'login', data: {'email': email});
    await Future.delayed(const Duration(milliseconds: 400));
    return {'userId': 'usr_123', 'token': 'tok_abc'};
  }

  Future<void> logout() async {
    ATS.trace('AuthService', 'logout');
    await Future.delayed(const Duration(milliseconds: 100));
  }
}

class UserService {
  // getUser belongs to BOTH AUTH_FLOW and PROFILE_FLOW.
  // When either flow is active, this method logs.
  Future<Map<String, dynamic>> getUser(String userId) async {
    ATS.trace('UserService', 'getUser', data: {'userId': userId});
    await Future.delayed(const Duration(milliseconds: 200));
    return {'id': userId, 'name': 'Demo User', 'email': 'demo@example.com'};
  }

  Future<void> updateProfile(Map<String, dynamic> data) async {
    ATS.trace('UserService', 'updateProfile', data: data);
    await Future.delayed(const Duration(milliseconds: 300));
  }
}

// ─────────────────────────────────────────────────────────
// App UI — ATS Debug Panel
// ─────────────────────────────────────────────────────────

class AtsExampleApp extends StatelessWidget {
  const AtsExampleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ATS Example',
      theme: ThemeData.dark(useMaterial3: true),
      home: const AtsDebugPanel(),
    );
  }
}

class AtsDebugPanel extends StatefulWidget {
  const AtsDebugPanel({super.key});

  @override
  State<AtsDebugPanel> createState() => _AtsDebugPanelState();
}

class _AtsDebugPanelState extends State<AtsDebugPanel> {
  final _payment = PaymentService();
  final _auth = AuthService();
  final _user = UserService();
  final List<String> _log = [];

  void _addLog(String msg) => setState(() => _log.insert(0, msg));

  void _toggleFlow(String flow) {
    _addLog('⚠️ Runtime toggling is disabled. Edit flow_graph.json and run ats sync.');
  }

  @override
  Widget build(BuildContext context) {
    final flows = ATS.activeFlows;

    return Scaffold(
      appBar: AppBar(
        title: const Text('ATS Protocol — Demo'),
        backgroundColor: Colors.black87,
      ),
      backgroundColor: const Color(0xFF0D1117),
      body: Column(
        children: [
          // Flow toggles
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Flows',
                    style: TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.5)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: flows
                      .map((f) => FilterChip(
                            label: Text(f,
                                style: const TextStyle(fontSize: 11)),
                            selected: ATS.isActive(f),
                            onSelected: (_) => _toggleFlow(f),
                            selectedColor: Colors.green.shade900,
                          ))
                      .toList(),
                ),
              ],
            ),
          ),

          // Action buttons
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _ActionButton(
                  label: 'processPayment',
                  onTap: () async {
                    final tx = await _payment
                        .processPayment({'amount': 150000, 'currency': 'VND'});
                    _addLog('✓ processPayment → $tx');
                  },
                ),
                _ActionButton(
                  label: 'validateCard',
                  onTap: () {
                    final ok =
                        _payment.validateCard('4111111111111111');
                    _addLog('✓ validateCard → $ok');
                  },
                ),
                _ActionButton(
                  label: 'login',
                  onTap: () async {
                    final r = await _auth.login(
                        'user@example.com', '***');
                    _addLog('✓ login → ${r['userId']}');
                  },
                ),
                _ActionButton(
                  label: 'getUser (AUTH+PROFILE)',
                  onTap: () async {
                    final u = await _user.getUser('usr_123');
                    _addLog('✓ getUser → ${u['name']}');
                  },
                ),
              ],
            ),
          ),

          const SizedBox(height: 8),
          const Divider(color: Colors.white12),

          // Log output
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Row(
              children: [
                const Text('App Log',
                    style:
                        TextStyle(color: Colors.white38, fontSize: 11)),
                const Spacer(),
                if (ATS.logsDirPath != null)
                  Text('ATS logs → ${ATS.logsDirPath}',
                      style: const TextStyle(
                          color: Colors.green, fontSize: 10)),
              ],
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _log.length,
              itemBuilder: (_, i) => Text(
                _log[i],
                style: const TextStyle(
                    color: Colors.white70, fontSize: 12, height: 1.8),
              ),
            ),
          ),

          // Info
          Container(
            padding: const EdgeInsets.all(12),
            color: Colors.white.withValues(alpha: 0.05),
            child: const Text(
              'Check IDE console for [ATS] output. '
              'Toggle flows above then tap actions to see logs.',
              style: TextStyle(color: Colors.white38, fontSize: 11),
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _ActionButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        side: const BorderSide(color: Colors.white24),
        foregroundColor: Colors.white70,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        textStyle: const TextStyle(fontSize: 12),
      ),
      child: Text(label),
    );
  }
}
