"use strict";
/**
 * Evidence-derived governance reality assessment.
 *
 * This is not a compliance certification and it never asserts that code is
 * safe or correct. It answers a narrower operational question: which Neurcode
 * governance capabilities have actually been observed for one repository?
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOVERNANCE_REALITY_CAPABILITY_IDS = exports.GOVERNANCE_REALITY_SCHEMA_VERSION = void 0;
exports.buildGovernanceRealityAssessment = buildGovernanceRealityAssessment;
exports.GOVERNANCE_REALITY_SCHEMA_VERSION = 'neurcode.governance-reality.v1';
exports.GOVERNANCE_REALITY_CAPABILITY_IDS = [
    'repository_context',
    'brain_intelligence',
    'agent_integration',
    'safe_change_governed',
    'protected_boundary_enforced',
    'exact_path_containment',
    'session_integrity',
    'evidence_delivery',
    'replay_integrity',
];
const COPY = {
    repository_context: {
        label: 'Repository context',
        question: 'Is this assessment bound to an owned repository?',
        proven: 'Repository ownership and scope are bound.',
        partial: 'Some repository metadata exists, but ownership is incomplete.',
        failed: 'Repository identity is inconsistent or inaccessible.',
        not_evaluated: 'No repository has been connected for this scope.',
        recoveryLabel: 'Connect the repository',
        recoveryCommand: (agent) => `neurcode setup --repo <repository-path>${agent ? ` --agent ${agent}` : ''}`,
        recoveryHref: 'runtime-control-plane',
    },
    brain_intelligence: {
        label: 'Brain intelligence',
        question: 'Did the local Brain participate with usable repository facts?',
        proven: 'A fresh Brain and repository topology were observed.',
        partial: 'Brain intelligence is available with bounded freshness or coverage.',
        failed: 'Brain construction reported a failure.',
        not_evaluated: 'No usable Brain evidence has been observed.',
        recoveryLabel: 'Build or refresh Brain',
        recoveryCommand: () => 'neurcode brain retry',
        recoveryHref: 'repo-intelligence',
    },
    agent_integration: {
        label: 'Agent integration',
        question: 'Did the selected coding agent report an active Neurcode integration?',
        proven: 'An agent integration and runtime authority were observed.',
        partial: 'Runtime setup exists, but active agent integration is not fully evidenced.',
        failed: 'The runtime authority is stale, incompatible, or unavailable.',
        not_evaluated: 'No agent integration has reported runtime readiness.',
        recoveryLabel: 'Activate the coding agent',
        recoveryCommand: (agent) => `neurcode agent bootstrap ${agent || '<claude|cursor|codex|vscode|copilot>'}`,
        recoveryHref: 'runtime-control-plane',
    },
    safe_change_governed: {
        label: 'Safe change governed',
        question: 'Has a bounded, allowed change passed through a governed session?',
        proven: 'At least one allowed change received a governance pass.',
        partial: 'A governed session exists, but no allowed change has been observed.',
        failed: 'The safe-change scenario ended in a runtime failure.',
        not_evaluated: 'The safe-change scenario has not been exercised.',
        recoveryLabel: 'Run a bounded governed task',
        recoveryCommand: (agent) => `neurcode agent start ${agent || '<agent>'} --goal "<bounded task>"`,
        recoveryHref: 'runtime-control-plane',
    },
    protected_boundary_enforced: {
        label: 'Protected boundary',
        question: 'Has a protected-path attempt been stopped or held for approval?',
        proven: 'A protected boundary produced a block or approval-required decision.',
        partial: 'Protected boundaries are configured, but no enforcement event is recorded.',
        failed: 'A protected-boundary scenario reported an enforcement failure.',
        not_evaluated: 'No protected-boundary scenario has been exercised.',
        recoveryLabel: 'Exercise a protected boundary',
        recoveryCommand: (agent) => `neurcode agent start ${agent || '<agent>'} --goal "Propose one bounded change that touches an approval-required path"`,
        recoveryHref: 'runtime-control-plane?view=approvals',
    },
    exact_path_containment: {
        label: 'Exact-path containment',
        question: 'Was one exact path approved while a neighboring protected path remained contained?',
        proven: 'An exact-path approval and subsequent neighboring block were both observed.',
        partial: 'An approval was observed, but neighboring-path containment is not yet evidenced.',
        failed: 'An approval failed to apply or containment was violated.',
        not_evaluated: 'Exact-path approval containment has not been exercised.',
        recoveryLabel: 'Complete the approval scenario',
        recoveryCommand: () => null,
        recoveryHref: 'runtime-control-plane?view=approvals',
    },
    session_integrity: {
        label: 'Session integrity',
        question: 'Did a governed session finish with a bounded intent and terminal record?',
        proven: 'A governed session reached a terminal evidence state.',
        partial: 'A governed session is active or has not produced a terminal record.',
        failed: 'The governed session ended in an integrity failure.',
        not_evaluated: 'No governed session has been observed.',
        recoveryLabel: 'Finish and report the session',
        recoveryCommand: () => 'neurcode agent report --latest',
        recoveryHref: 'runtime-control-plane',
    },
    evidence_delivery: {
        label: 'Evidence delivery',
        question: 'Did source-free governed-session evidence reach the selected workspace?',
        proven: 'Source-free session evidence is available in the workspace.',
        partial: 'Local evidence exists, but cloud delivery is pending or unavailable.',
        failed: 'Evidence delivery entered a failed or dead-letter state.',
        not_evaluated: 'No governed-session evidence has been generated.',
        recoveryLabel: 'Sync runtime evidence',
        recoveryCommand: () => 'neurcode sync --runtime',
        recoveryHref: 'runtime-evidence',
    },
    replay_integrity: {
        label: 'Replay integrity',
        question: 'Does the finished session have a stable replay hash?',
        proven: 'A stable replay hash is present for a finished session.',
        partial: 'A session record exists, but replay integrity is pending.',
        failed: 'Replay integrity validation failed.',
        not_evaluated: 'No replayable session record has been observed.',
        recoveryLabel: 'Finalize the session record',
        recoveryCommand: () => 'neurcode session export-admission --explain',
        recoveryHref: 'replay',
    },
};
function capability(id, signal, agent) {
    const copy = COPY[id];
    const recovery = signal.status === 'proven' ? null : {
        label: copy.recoveryLabel,
        command: copy.recoveryCommand(agent),
        href: copy.recoveryHref,
    };
    return {
        id,
        label: copy.label,
        question: copy.question,
        status: signal.status,
        summary: copy[signal.status],
        evidence: signal.evidence || [],
        limitations: signal.limitations || [],
        recovery,
    };
}
function buildGovernanceRealityAssessment(signals) {
    const agent = signals.agent || null;
    const capabilities = [
        capability('repository_context', signals.repositoryContext, agent),
        capability('brain_intelligence', signals.brainIntelligence, agent),
        capability('agent_integration', signals.agentIntegration, agent),
        capability('safe_change_governed', signals.safeChangeGoverned, agent),
        capability('protected_boundary_enforced', signals.protectedBoundaryEnforced, agent),
        capability('exact_path_containment', signals.exactPathContainment, agent),
        capability('session_integrity', signals.sessionIntegrity, agent),
        capability('evidence_delivery', signals.evidenceDelivery, agent),
        capability('replay_integrity', signals.replayIntegrity, agent),
    ];
    const count = (status) => capabilities.filter((item) => item.status === status).length;
    const proven = count('proven');
    const partial = count('partial');
    const failed = count('failed');
    const notEvaluated = count('not_evaluated');
    const posture = failed > 0
        ? 'attention_required'
        : proven === capabilities.length
            ? 'review_ready'
            : proven === 0 && partial === 0
                ? 'not_started'
                : 'in_progress';
    const next = capabilities.find((item) => item.status === 'failed')
        || capabilities.find((item) => item.status === 'partial')
        || capabilities.find((item) => item.status === 'not_evaluated')
        || null;
    return {
        schemaVersion: exports.GOVERNANCE_REALITY_SCHEMA_VERSION,
        generatedAt: signals.generatedAt || new Date().toISOString(),
        scope: {
            workspaceId: signals.workspaceId || null,
            workspaceKind: signals.workspaceKind,
            repoId: signals.repoId || null,
            repoLabel: signals.repoLabel,
            agent,
        },
        posture,
        score: {
            proven,
            partial,
            failed,
            notEvaluated,
            total: capabilities.length,
            percent: Math.round((proven / capabilities.length) * 100),
        },
        capabilities,
        nextAction: next ? {
            capabilityId: next.id,
            label: next.recovery?.label || 'Review the evidence gap',
            reason: next.summary,
            command: next.recovery?.command || null,
            href: next.recovery?.href || null,
        } : {
            capabilityId: null,
            label: 'Review the evidence record',
            reason: 'All operational governance scenarios have evidence for this repository.',
            command: null,
            href: 'runtime-evidence',
        },
        claims: {
            operationalEvidenceOnly: true,
            complianceCertification: false,
            codeSafetyGuaranteed: false,
            sourceReviewedByCloud: false,
        },
        privacy: {
            sourceUploaded: false,
            promptsStored: false,
            diffsStored: false,
            machinePathsStored: false,
        },
    };
}
//# sourceMappingURL=index.js.map