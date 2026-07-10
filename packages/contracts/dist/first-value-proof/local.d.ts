/**
 * Local-First Aha V1 — source-free local first-value proof artifact.
 *
 * Produced by `neurcode pilot start` before any login: it records the local
 * block → exact-path approval → neighbor containment decision sequence, the
 * honest host enforcement tier, and a replay/proof hash. It must never carry
 * source text, prompts, diffs, secrets, raw args, or absolute paths.
 * Repo-relative paths and reason codes are the only location vocabulary.
 */
export declare const LOCAL_FIRST_VALUE_SCHEMA_VERSION: "neurcode.local-first-value.v1";
/** How write decisions were produced for this proof. */
export type LocalFirstValueDecisionSource = 
/** The real installed hook entrypoint evaluated a synthetic pre-write payload. */
'host_hook_binary'
/** The same decision kernel was called as a library (no healthy hook available). */
 | 'kernel_library';
export type LocalFirstValueEnforcementTier = 
/** Hard pre-write hooks are wired and the runtime identity is healthy. */
'hard_hook'
/** Hard hooks are wired but currently degraded (for example stale runtime identity). */
 | 'hard_hook_degraded'
/** The agent is asked to check before writing; it can be bypassed by a non-cooperating agent. */
 | 'cooperative'
/** The integration only observes; it cannot block a write. */
 | 'observe_only'
/** No agent integration is wired in this repository yet. */
 | 'not_wired';
export type LocalFirstValueContainment = 'contained' | 'not_contained' | 'not_evaluated';
export type LocalFirstValueStepId = 'protected_write_blocked' | 'exact_path_approved' | 'approved_write_allowed' | 'neighbor_write_blocked';
export interface LocalFirstValueDecision {
    step: LocalFirstValueStepId;
    /** Repo-relative path only; absolute paths are forbidden. */
    path: string;
    verdict: 'block' | 'ok' | 'warn' | 'approved';
    reasonCodes: string[];
    decisionSource: LocalFirstValueDecisionSource;
}
export interface LocalFirstValueArtifact {
    schemaVersion: typeof LOCAL_FIRST_VALUE_SCHEMA_VERSION;
    proofId: string;
    generatedAt: string;
    repo: {
        label: string | null;
        hash: string | null;
        gitDetected: boolean;
    };
    detection: {
        trackedFileCount: number | null;
        sensitiveBoundaryCount: number;
        approvalRequiredGlobCount: number;
        ownershipRuleCount: number;
        codeownersDetected: boolean;
    };
    host: {
        agent: string;
        enforcementTier: LocalFirstValueEnforcementTier;
        /** One honest sentence about what this host can and cannot enforce. */
        enforcementNote: string;
        identityHealthy: boolean | null;
        recoveryCommand: string | null;
    };
    sessionId: string | null;
    /** Replay hash of the finished local proof session, when one was recorded. */
    replayHash: string | null;
    decisions: LocalFirstValueDecision[];
    blockedPathCount: number;
    approvedExactPath: string | null;
    neighborPath: string | null;
    neighborContainment: LocalFirstValueContainment;
    /** The exact command that would approve only the blocked path. */
    approvalCommand: string | null;
    nextActions: {
        local: string;
        login: string;
    };
    limitations: string[];
    privacy: {
        sourceUploaded: false;
        promptsUploaded: false;
        diffsUploaded: false;
        absolutePathsStored: false;
        sourceFree: true;
    };
    /** Stable content hash over every field above (computed with contentHash=''). */
    contentHash: string;
}
/** Pure-JS stable hash so this module stays usable in browser bundles. */
export declare function localFirstValueStableHash(input: string): string;
export declare function localFirstValueContentHash(artifact: Omit<LocalFirstValueArtifact, 'contentHash'>): string;
/**
 * Source-free scan for the local proof artifact (and any rendering of it).
 * Field names carrying decision paths are allowed; absolute path VALUES are not.
 */
export declare function validateLocalFirstValueSourceFree(input: unknown): {
    ok: boolean;
    errors: string[];
};
/** Structural + privacy assertion used by writers before an artifact is persisted. */
export declare function assertLocalFirstValueArtifact(artifact: LocalFirstValueArtifact): LocalFirstValueArtifact;
//# sourceMappingURL=local.d.ts.map