"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENTERPRISE_ROLLOUT_MODES = exports.ENTERPRISE_TRUST_STATES = exports.ENTERPRISE_ADMISSION_DECISION_SCHEMA_VERSION = exports.ENTERPRISE_TRUST_DECISION_SCHEMA_VERSION = exports.ENTERPRISE_POSTURE_REPORT_SCHEMA_VERSION = void 0;
exports.canonicalEnterprisePosturePayload = canonicalEnterprisePosturePayload;
exports.evaluateEnterpriseTrust = evaluateEnterpriseTrust;
exports.resolveEnterpriseRollout = resolveEnterpriseRollout;
exports.evaluateEnterpriseAdmission = evaluateEnterpriseAdmission;
const activation_journey_1 = require("./activation-journey");
exports.ENTERPRISE_POSTURE_REPORT_SCHEMA_VERSION = 'neurcode.enterprise-posture-report.v1';
exports.ENTERPRISE_TRUST_DECISION_SCHEMA_VERSION = 'neurcode.enterprise-trust-decision.v1';
exports.ENTERPRISE_ADMISSION_DECISION_SCHEMA_VERSION = 'neurcode.enterprise-admission-decision.v1';
exports.ENTERPRISE_TRUST_STATES = [
    'not_enrolled', 'enrolled_unobserved', 'healthy', 'degraded', 'stale',
    'drifted', 'incompatible', 'unsupported', 'revoked', 'unknown',
];
exports.ENTERPRISE_ROLLOUT_MODES = ['observe', 'warn', 'enforce', 'exempt'];
function stable(value) {
    if (Array.isArray(value))
        return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value)
            .filter(([, child]) => child !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
function canonicalEnterprisePosturePayload(report) {
    return stable(report);
}
function decision(state, facts, now, reasons, remediation) {
    const observedMs = facts.observedAt ? Date.parse(facts.observedAt) : NaN;
    return {
        schemaVersion: exports.ENTERPRISE_TRUST_DECISION_SCHEMA_VERSION,
        state,
        trusted: state === 'healthy' || state === 'degraded',
        reasonCodes: reasons,
        remediationCodes: remediation.length > 0 ? remediation : ['none'],
        evidenceAt: facts.observedAt,
        evaluatedAt: now.toISOString(),
        ageSeconds: Number.isFinite(observedMs) ? Math.max(0, Math.floor((now.getTime() - observedMs) / 1000)) : null,
        capability: facts.host ? (0, activation_journey_1.getActivationHostCapability)(facts.host) : null,
        facts: { ...facts },
    };
}
function evaluateEnterpriseTrust(facts, options = {}) {
    const now = options.now || new Date();
    if (!facts.enrolled)
        return decision('not_enrolled', facts, now, ['installation_not_enrolled'], ['reenroll_installation']);
    if (facts.revokedAt)
        return decision('revoked', facts, now, ['installation_revoked'], ['contact_organization_admin']);
    if (!facts.observedAt)
        return decision('enrolled_unobserved', facts, now, ['installation_never_observed'], ['run_trust_report']);
    if (!facts.signatureValid)
        return decision('unknown', facts, now, ['evidence_signature_invalid'], ['reenroll_installation']);
    if (!facts.receiptVerified)
        return decision('unknown', facts, now, ['evidence_receipt_unverified'], ['run_trust_report']);
    if (!facts.bindingValid)
        return decision('unknown', facts, now, ['evidence_binding_invalid'], ['reenroll_installation']);
    if (!facts.host)
        return decision('unsupported', facts, now, ['host_unsupported'], ['select_supported_host']);
    if (!facts.versionsCompatible)
        return decision('incompatible', facts, now, ['version_incompatible'], ['upgrade_cli']);
    if (facts.configIntegrity === 'drifted' || facts.configFingerprintMatches === false) {
        return decision('drifted', facts, now, ['configuration_drift'], ['repair_host_configuration']);
    }
    const observedMs = Date.parse(facts.observedAt);
    if (!Number.isFinite(observedMs) || now.getTime() - observedMs > facts.freshnessSeconds * 1000) {
        return decision('stale', facts, now, ['evidence_stale'], ['run_trust_report']);
    }
    const degradedReasons = [];
    const degradedRemediation = [];
    if (!facts.policyAssigned || !facts.policyVersionMatches) {
        degradedReasons.push('policy_assignment_mismatch');
        degradedRemediation.push('refresh_policy_assignment');
    }
    if (facts.installationState && facts.installationState !== 'healthy') {
        degradedReasons.push('host_installation_attention');
        degradedRemediation.push('repair_host_configuration');
    }
    if (facts.hostTrustState === 'unknown' || facts.hostTrustState === 'user_action_required') {
        degradedReasons.push('host_trust_unverified');
        degradedRemediation.push('verify_host_trust');
    }
    if (degradedReasons.length > 0)
        return decision('degraded', facts, now, degradedReasons, degradedRemediation);
    return decision('healthy', facts, now, ['healthy_authenticated_evidence'], ['none']);
}
function matches(scope, input) {
    return (!scope.repositoryId || scope.repositoryId === input.repositoryId)
        && (!scope.host || scope.host === input.host)
        && (!scope.memberId || scope.memberId === input.memberId);
}
function stablePercent(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % 100;
}
function resolveEnterpriseRollout(input) {
    const now = input.now || new Date();
    if (input.isPersonal)
        return { mode: 'observe', reasonCode: 'personal_workspace', scopeId: null, exceptionId: null };
    const exception = input.exceptions.find((item) => !item.revokedAt && Date.parse(item.expiresAt) > now.getTime() && matches(item, input));
    if (exception)
        return { mode: 'exempt', reasonCode: 'active_exception', scopeId: null, exceptionId: exception.id };
    if (input.emergencyPaused)
        return { mode: 'observe', reasonCode: 'emergency_pause', scopeId: null, exceptionId: null };
    if (input.activationAt && Date.parse(input.activationAt) > now.getTime())
        return { mode: 'observe', reasonCode: 'scheduled', scopeId: null, exceptionId: null };
    const inExplicitCohort = input.repositoryCohort.length === 0 || input.repositoryCohort.includes(input.repositoryId);
    const inPercentage = Math.max(0, Math.min(100, input.rolloutPercentage)) > stablePercent(`${input.repositoryId}:${input.installationId}`);
    if (!inExplicitCohort || !inPercentage)
        return { mode: 'observe', reasonCode: 'outside_cohort', scopeId: null, exceptionId: null };
    const matching = input.scopes.filter((item) => item.active && matches(item, input)).sort((left, right) => {
        const score = (item) => Number(Boolean(item.repositoryId)) + Number(Boolean(item.host)) + Number(Boolean(item.memberId));
        return score(right) - score(left) || left.id.localeCompare(right.id);
    });
    if (matching[0])
        return { mode: matching[0].mode, reasonCode: 'scope_override', scopeId: matching[0].id, exceptionId: null };
    return { mode: input.defaultMode, reasonCode: 'organization_default', scopeId: null, exceptionId: null };
}
function evaluateEnterpriseAdmission(input) {
    const capability = input.trust.capability;
    const hardSecurity = input.trust.state === 'revoked'
        || input.trust.reasonCodes.includes('evidence_signature_invalid')
        || input.trust.reasonCodes.includes('evidence_binding_invalid');
    let outcome = input.governanceDecision;
    const reasons = [...input.trust.reasonCodes, `rollout_${input.rollout.reasonCode}`];
    if (hardSecurity)
        outcome = 'deny';
    else if (input.rollout.mode === 'exempt' || input.rollout.mode === 'observe') {
        if (outcome === 'deny')
            outcome = 'approval_required';
    }
    else if (input.rollout.mode === 'warn' && !input.trust.trusted) {
        if (outcome === 'allow')
            outcome = 'warn';
    }
    else if (input.rollout.mode === 'enforce' && !input.trust.trusted) {
        if (input.trust.state === 'stale' && input.staleBehavior === 'warn')
            outcome = outcome === 'allow' ? 'warn' : outcome;
        else
            outcome = 'deny';
    }
    return {
        schemaVersion: exports.ENTERPRISE_ADMISSION_DECISION_SCHEMA_VERSION,
        outcome,
        reasonCodes: reasons,
        trustState: input.trust.state,
        rolloutMode: input.rollout.mode,
        automaticHostInterception: capability?.automaticPreWriteInterception === true,
        limitation: capability?.limitation || null,
    };
}
//# sourceMappingURL=enterprise-trust.js.map