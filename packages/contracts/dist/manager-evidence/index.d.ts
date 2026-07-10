/**
 * Manager Evidence Dashboard - source-free aggregate contract.
 *
 * Org-scoped rollup of runtime governance value for engineering managers.
 * Only paths, owners, hashes, counts, reason codes, verdicts, timestamps, and
 * tenant ids are permitted. No source, prompts, diffs, secrets, or raw user
 * identities. Actor identifiers are always hashed/prefix form.
 */
export declare const MANAGER_EVIDENCE_SUMMARY_SCHEMA_VERSION: "neurcode.manager-evidence-summary.v1";
/**
 * Risk families surfaced to managers. Mirrors `RuntimeSafetyFamily` in
 * `@neurcode-ai/governance-runtime`; kept as a local copy so `contracts`
 * remains a dependency-free leaf package. Keep in sync if the kernel families
 * change.
 */
export declare const MANAGER_EVIDENCE_RISK_FAMILIES: readonly ["runtime_scope", "sensitive_surface", "credential_or_secret", "dependency_supply_chain", "auth_rbac_boundary", "migration_data_boundary", "infra_deploy_boundary", "test_or_verification_gap", "plan_drift", "approval_required_boundary"];
export type ManagerEvidenceRiskFamily = (typeof MANAGER_EVIDENCE_RISK_FAMILIES)[number];
export declare function isManagerEvidenceRiskFamily(value: unknown): value is ManagerEvidenceRiskFamily;
/**
 * Truth tier for a metric row. `deterministic` = recorded governance fact;
 * `advisory-derived` = inferred/heuristic signal (e.g. neighbor containment),
 * never presented as a hard guarantee.
 */
export type ManagerEvidenceTier = 'deterministic' | 'advisory-derived';
/**
 * Source-free allowlist of field names that may appear in any manager-evidence
 * payload. Used by the authority harness / leak scan to assert no source-like
 * keys leak into the aggregate.
 */
export declare const MANAGER_EVIDENCE_ALLOWED_FIELDS: readonly ["schemaVersion", "generatedAt", "organizationId", "tier", "window", "since", "until", "appliedFilters", "available", "reason", "repoKey", "riskFamily", "actor", "team", "scope", "repos", "sessions", "activeSessions", "finishedSessions", "owners", "attempts", "totalChecks", "allowedEdits", "allowedWithAdvisories", "blocked", "total", "byFamily", "family", "count", "topPaths", "path", "topOwners", "owner", "approvals", "granted", "boundariesTouched", "boundary", "planDrift", "sessionsWithDrift", "dependencyChanges", "governed", "byKind", "kind", "credentialBlocksLocal", "note", "neighborContainment", "sessionsWithContainedDenials", "byRepo", "sourceFree", "sourceUploaded", "localOnly", "synced", "privacy", "uploadedFields"];
export interface ManagerEvidenceFamilyCount {
    family: ManagerEvidenceRiskFamily | string;
    count: number;
}
export interface ManagerEvidencePathCount {
    path: string;
    count: number;
}
export interface ManagerEvidenceOwnerCount {
    owner: string;
    count: number;
}
export interface ManagerEvidenceKindCount {
    kind: string;
    count: number;
}
export interface ManagerEvidenceBoundaryCount {
    boundary: string;
    count: number;
}
export interface ManagerEvidenceRepoCount {
    repoKey: string;
    sessions: number;
    blocked: number;
}
export interface ManagerEvidenceSummary {
    schemaVersion: typeof MANAGER_EVIDENCE_SUMMARY_SCHEMA_VERSION;
    generatedAt: string;
    /** Caller's own organization id (tenant scope echo; never cross-org). */
    organizationId: string;
    window: {
        since: string | null;
        until: string | null;
        appliedFilters: {
            repoKey: string | null;
            riskFamily: ManagerEvidenceRiskFamily | string | null;
            /** Hashed/prefix actor id only - never a raw user identity. */
            actor: string | null;
        };
        /** Honest capability flags for filters not backed by data in V1. */
        available: {
            team: boolean;
            reason: string;
        };
    };
    scope: {
        repos: number;
        sessions: number;
        activeSessions: number;
        finishedSessions: number;
        owners: number;
    };
    attempts: {
        totalChecks: number;
        allowedEdits: number;
        allowedWithAdvisories: number;
        tier: ManagerEvidenceTier;
    };
    blocked: {
        total: number;
        byFamily: ManagerEvidenceFamilyCount[];
        topPaths: ManagerEvidencePathCount[];
        topOwners: ManagerEvidenceOwnerCount[];
        tier: ManagerEvidenceTier;
    };
    approvals: {
        /** Exact-path approvals granted (all runtime approvals are exact-path). */
        granted: number;
        boundariesTouched: ManagerEvidenceBoundaryCount[];
        tier: ManagerEvidenceTier;
    };
    planDrift: {
        sessionsWithDrift: number;
        tier: ManagerEvidenceTier;
    };
    dependencyChanges: {
        governed: number;
        byKind: ManagerEvidenceKindCount[];
        tier: ManagerEvidenceTier;
    };
    credentialBlocksLocal: {
        count: number;
        note: string;
        tier: ManagerEvidenceTier;
    };
    neighborContainment: {
        sessionsWithContainedDenials: number;
        tier: ManagerEvidenceTier;
    };
    byRepo: ManagerEvidenceRepoCount[];
    sourceFree: {
        sourceUploaded: false;
        localOnly: string[];
        synced: string[];
    };
    privacy: {
        sourceUploaded: false;
        uploadedFields: string[];
    };
}
//# sourceMappingURL=index.d.ts.map