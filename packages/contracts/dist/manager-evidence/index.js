"use strict";
/**
 * Manager Evidence Dashboard - source-free aggregate contract.
 *
 * Org-scoped rollup of runtime governance value for engineering managers.
 * Only paths, owners, hashes, counts, reason codes, verdicts, timestamps, and
 * tenant ids are permitted. No source, prompts, diffs, secrets, or raw user
 * identities. Actor identifiers are always hashed/prefix form.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANAGER_EVIDENCE_ALLOWED_FIELDS = exports.MANAGER_EVIDENCE_RISK_FAMILIES = exports.MANAGER_EVIDENCE_SUMMARY_SCHEMA_VERSION = void 0;
exports.isManagerEvidenceRiskFamily = isManagerEvidenceRiskFamily;
exports.MANAGER_EVIDENCE_SUMMARY_SCHEMA_VERSION = 'neurcode.manager-evidence-summary.v1';
/**
 * Risk families surfaced to managers. Mirrors `RuntimeSafetyFamily` in
 * `@neurcode-ai/governance-runtime`; kept as a local copy so `contracts`
 * remains a dependency-free leaf package. Keep in sync if the kernel families
 * change.
 */
exports.MANAGER_EVIDENCE_RISK_FAMILIES = [
    'runtime_scope',
    'sensitive_surface',
    'credential_or_secret',
    'dependency_supply_chain',
    'auth_rbac_boundary',
    'migration_data_boundary',
    'infra_deploy_boundary',
    'test_or_verification_gap',
    'plan_drift',
    'approval_required_boundary',
];
function isManagerEvidenceRiskFamily(value) {
    return (typeof value === 'string' &&
        exports.MANAGER_EVIDENCE_RISK_FAMILIES.includes(value));
}
/**
 * Source-free allowlist of field names that may appear in any manager-evidence
 * payload. Used by the authority harness / leak scan to assert no source-like
 * keys leak into the aggregate.
 */
exports.MANAGER_EVIDENCE_ALLOWED_FIELDS = [
    'schemaVersion',
    'generatedAt',
    'organizationId',
    'tier',
    'window',
    'since',
    'until',
    'appliedFilters',
    'available',
    'reason',
    'repoKey',
    'riskFamily',
    'actor',
    'team',
    'scope',
    'repos',
    'sessions',
    'activeSessions',
    'finishedSessions',
    'owners',
    'attempts',
    'totalChecks',
    'allowedEdits',
    'allowedWithAdvisories',
    'blocked',
    'total',
    'byFamily',
    'family',
    'count',
    'topPaths',
    'path',
    'topOwners',
    'owner',
    'approvals',
    'granted',
    'boundariesTouched',
    'boundary',
    'planDrift',
    'sessionsWithDrift',
    'dependencyChanges',
    'governed',
    'byKind',
    'kind',
    'credentialBlocksLocal',
    'note',
    'neighborContainment',
    'sessionsWithContainedDenials',
    'byRepo',
    'sourceFree',
    'sourceUploaded',
    'localOnly',
    'synced',
    'privacy',
    'uploadedFields',
];
//# sourceMappingURL=index.js.map