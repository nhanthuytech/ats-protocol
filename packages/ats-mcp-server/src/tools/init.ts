import { FlowGraph } from '../core/flow-graph.js';

/**
 * ats_init — V5 MCP-as-Skill entry point.
 *
 * Returns compressed protocol instructions + graph overview in one call.
 * Replaces the need for a heavy CLAUDE.md / SKILL.md.
 * AI calls this at the start of every task instead of reading text files.
 */
export function initTool(graph: FlowGraph) {
  const data = graph.read();
  const flows = data.flows ?? {};

  const activeFlows = Object.entries(flows)
    .filter(([, f]) => f.active)
    .map(([n]) => n);

  const flowOverview = Object.entries(flows).map(([name, flow]) => {
    let methodCount = 0;
    for (const cv of Object.values(flow.classes ?? {})) {
      methodCount += FlowGraph.methodsFromClass(cv).length;
    }
    return {
      name,
      active: flow.active ?? false,
      depends_on: flow.depends_on ?? [],
      class_count: Object.keys(flow.classes ?? {}).length,
      method_count: methodCount,
      known_issues: (flow.known_issues ?? []).length,
    };
  });

  const suggestedNext = activeFlows.length > 0
    ? `⚠️ WARN USER: Flows still active from previous session: [${activeFlows.join(', ')}]. Ask if they should be silenced before proceeding.`
    : `Graph loaded (${flowOverview.length} flows). Identify which flow your task involves, then call ats_context('<FLOW_NAME>') for full details.`;

  return {
    // ── Compressed Protocol Instructions ──────────────────────────────────
    protocol: {
      version: '5.0.0',
      core_rules: [
        'ATS.trace() is PERMANENT — add to every method once, NEVER remove.',
        'Control logging via flow_graph.json only — toggle "active", never edit code.',
        'Register every class you write or touch in the correct flow.',
        'Silence flows after debugging — NEVER leave active:true when done.',
        'Add a session note after every debug or refactor task.',
        'NEVER use print() or debugPrint() — they are strictly forbidden.',
      ],
      auto_triggers: {
        user_reports_bug:
          'call ats_context → ats_activate → tell user Hot Restart → call ats_analyze with logs → fix → ats_silence → add session note',
        new_class_written:
          'add ATS.trace() to ALL methods → register class in correct flow (V4 object format) → run ats sync',
        method_renamed:
          'update ATS.trace() string in source + rename in flow_graph.json (rename > delete to preserve history) → ats sync',
        before_modifying_method:
          'call ats_impact("ClassName.methodName") to understand blast radius first',
        refactor_complete:
          'compare source vs graph for touched classes, fix drift, set last_verified, run ats sync',
      },
      flow_naming: 'UPPER_SNAKE_CASE + required suffix: _FLOW (user-triggered), _LIFECYCLE (system/background), _WORKER (cron/sync)',
      class_format: {
        description: 'Always use V4 object format when registering classes:',
        example: { methods: ['method1', 'method2'], muted: ['noisyLoopMethod'], last_verified: 'YYYY-MM-DD' },
      },
      sensitive_data: "Redact sensitive fields: { email: user.email, password: '***' }",
      session_limit: 'Keep max 5 sessions per flow — remove oldest when adding 6th.',
      multi_flow_classes: 'A class can appear in multiple flows — list only the methods relevant to each flow.',
    },

    // ── Graph Overview ────────────────────────────────────────────────────
    graph: {
      project: data.project ?? 'unknown',
      total_flows: flowOverview.length,
      edge_count: (data.edges ?? []).length,
      flows: flowOverview,
      active_flows: activeFlows,
    },

    // ── Adaptive Next Action ──────────────────────────────────────────────
    suggested_next: suggestedNext,
  };
}
