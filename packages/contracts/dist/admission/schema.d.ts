/**
 * Runtime Admission — Phase A schema (Provenance Core V1).
 *
 * Source-free, deterministic provenance types shared across CLI, the future
 * OSS advisory Action, and future Enterprise enforcement. Phase A defines the
 * normalized git tree-delta, the governed coverage manifest, the self-attested
 * local artifact, and the consistency decision. No signing, no receipts, no
 * backend, no Action here — those are later phases.
 *
 * Two distinct hashes by design (do not collapse them):
 *   - deltaHash:       exact, base-specific tree-delta fingerprint (debugging /
 *                      deterministic reproduction).
 *   - coverageSetHash: governed-effect set fingerprint used for squash/rebase-
 *                      survivable, per-entry subset matching of a PR to sessions.
 */
export declare const ADMISSION_COVERAGE_MANIFEST_SCHEMA_VERSION: "neurcode.admission-coverage.v1";
export declare const SELF_ATTESTED_ADMISSION_RECORD_SCHEMA_VERSION: "neurcode.admission-record.v1";
export declare const ADMISSION_CONSISTENCY_DECISION_SCHEMA_VERSION: "neurcode.admission-consistency.v1";
/**
 * Mandatory honesty label. A locally committed artifact is authored by the same
 * untrusted principal who authored the diff, so it can be fabricated with
 * matching object ids. It is a claim, never proof.
 */
export declare const SELF_ATTESTED_ADMISSION_DISCLAIMER: string;
/** Git object hash format. Determines object-id hex width (40 vs 64). */
export type GitObjectFormat = 'sha1' | 'sha256';
/** Post-image (or pre-image, for deletes) object kind, derived from git mode. */
export type AdmissionObjectType = 'blob' | 'symlink' | 'submodule' | 'absent';
/** Normalized change kind. Renames are normalized to delete + add (never a 'rename' type). */
export type AdmissionChangeType = 'added' | 'modified' | 'deleted' | 'typechanged';
/**
 * Descriptive classification of a covered effect (source-free).
 *
 * NOTE: classification is descriptive, not an eligibility verdict. Strict
 * runtime admission (see `isStrictlyAdmissible`) accepts only pre-write
 * governance (`governed_prewrite`, `governed_delete`). `observed_postwrite`
 * means the write was only observed after the fact — visible, but NOT strictly
 * admissible. `generated` is admissible only under an explicit policy opt-in.
 */
export type AdmissionCoverageClassification = 'governed_prewrite' | 'governed_delete' | 'observed_postwrite' | 'generated' | 'ungoverned';
/** Canonical git file modes used by this contract. */
export declare const GIT_MODE_BLOB: "100644";
export declare const GIT_MODE_EXEC: "100755";
export declare const GIT_MODE_SYMLINK: "120000";
export declare const GIT_MODE_SUBMODULE: "160000";
export declare const GIT_MODE_ABSENT: "000000";
/**
 * Exact normalized tree-delta entry. Object ids are content-addressed git
 * hashes (non-invertible); no file content is ever carried.
 */
export interface AdmissionDeltaEntry {
    /** Post-image path; for a delete, the deleted path. */
    path: string;
    changeType: AdmissionChangeType;
    /** Object kind of the side that carries identity (new side, or old side for deletes). */
    objectType: AdmissionObjectType;
    /** Pre-image mode, or '000000' when absent (added). */
    oldMode: string;
    /** Post-image mode, or '000000' when absent (deleted). */
    newMode: string;
    /** Pre-image object id, or the all-zeros id when absent. */
    oldObjectId: string;
    /** Post-image object id, or the all-zeros id when absent. */
    newObjectId: string;
}
/**
 * A single governed effect. Identity fields per the matching contract:
 *   added/modified/typechanged → path + newMode + newObjectId
 *   deleted                    → path + oldMode + oldObjectId
 * The identity mode/id are flattened into `mode`/`objectId` so matching is a
 * simple per-entry set membership test. `classification` and `sessions` are
 * annotations and are intentionally excluded from coverageSetHash.
 */
export interface AdmissionCoverageEntry {
    path: string;
    changeType: AdmissionChangeType;
    objectType: AdmissionObjectType;
    /** Identity mode: newMode for non-deletes, oldMode for deletes. */
    mode: string;
    /** Identity object id: newObjectId for non-deletes, oldObjectId for deletes. */
    objectId: string;
    classification: AdmissionCoverageClassification;
    /** Contributing governed session ids, sorted and de-duplicated. */
    sessions: string[];
}
export interface AdmissionCoverageManifest {
    schemaVersion: typeof ADMISSION_COVERAGE_MANIFEST_SCHEMA_VERSION;
    objectFormat: GitObjectFormat;
    framingVersion: string;
    entryCount: number;
    /** Exact, base-specific normalized tree-delta fingerprint (full SHA-256 hex). */
    deltaHash: string;
    /** Squash/rebase-survivable governed-effect set fingerprint (full SHA-256 hex). */
    coverageSetHash: string;
    /** Normalized delta entries, canonically sorted. */
    delta: AdmissionDeltaEntry[];
    /** Derived governed coverage entries, canonically sorted. */
    coverage: AdmissionCoverageEntry[];
}
export interface AdmissionSessionRef {
    sessionId: string;
    replayHash?: string;
    profileHash?: string;
}
export type AdmissionCaptureMode = 'worktree' | 'committed';
export interface AdmissionCaptureDescriptor {
    mode: AdmissionCaptureMode;
    capturedAt: string;
    baseRef?: string;
    headRef?: string;
}
/** Source-free repo identifiers. Hashes of local/remote paths, never the URL itself. */
export interface AdmissionRepoIdentifiers {
    name?: string;
    rootHash?: string;
    remoteHash?: string;
}
export type RuntimeAdmissionTrustLevel = 'unsigned_local' | 'self_attested' | 'backend_signed';
export interface RuntimeAdmissionAgentHost {
    adapter: string | null;
    enforcementLevel: string | null;
    controlLevel?: string | null;
    automatic?: boolean;
}
export interface RuntimeAdmissionReceiptSummary {
    present: boolean;
    trustLevel: RuntimeAdmissionTrustLevel;
    receiptId?: string;
    keyId?: string | null;
    replayHash?: string | null;
    signatureStatus?: string | null;
    verificationStatus?: string | null;
    signedAt?: string | null;
    verifier?: string | null;
}
export interface RuntimeAdmissionContext {
    schemaVersion: 'neurcode.runtime-admission-context.v1';
    trustLevel: RuntimeAdmissionTrustLevel;
    createdAt: string;
    sessionId: string;
    sessionStatus: 'active' | 'finished' | string;
    agentHost: RuntimeAdmissionAgentHost;
    intentSummary: string | null;
    scopeMode: string | null;
    counts: {
        changedPaths: number;
        blockedPaths: number;
        suggestedApprovalPaths: number;
        approvedExactPaths: number;
        deniedPaths: number;
        approvalRequiredSurfaces: number;
        owners: number;
        preWriteChecks: number;
        allowedChecks: number;
        warningChecks: number;
    };
    paths: {
        changed: string[];
        blocked: string[];
        suggestedApproval: string[];
        approvedExact: string[];
        denied: string[];
        approvalRequiredSurfaces: string[];
    };
    owners: Array<{
        owner: string;
        count: number;
    }>;
    guard: {
        status: string;
        verifiedPrewrite: number;
        deniedButChanged: number;
        unverifiedWrites: number;
        observedAfterOnly: number;
    };
    integrity: {
        sourceFree: true;
        replayHash: string | null;
        replayHashStatus: 'present' | 'missing';
        deltaHash: string;
        coverageSetHash: string;
        evidenceIntegrityStatus: 'local_self_attested' | 'backend_signed' | 'unsigned_local';
        receipt: RuntimeAdmissionReceiptSummary;
    };
    approvalAssurance?: {
        dominant: string | null;
        levels: Record<string, number>;
    };
}
/**
 * The local runtime artifact, written to ignored runtime state under
 * .neurcode/admission/<sessionId>.json. A selected record may later be exported
 * explicitly for the OSS advisory Action. Self-attested by construction — see
 * SELF_ATTESTED_ADMISSION_DISCLAIMER.
 */
export interface SelfAttestedAdmissionRecord {
    schemaVersion: typeof SELF_ATTESTED_ADMISSION_RECORD_SCHEMA_VERSION;
    attestationKind: 'self-attested';
    admissionContractVersion: string;
    disclaimer: string;
    sessionId: string;
    sessionRefs: AdmissionSessionRef[];
    repo: AdmissionRepoIdentifiers;
    capture: AdmissionCaptureDescriptor;
    manifest: AdmissionCoverageManifest;
    runtimeContext?: RuntimeAdmissionContext;
}
export type AdmissionConsistencyVerdict = 'self_attested_complete' | 'self_attested_incomplete' | 'self_attested_inconsistent' | 'no_record';
/**
 * Output of validating a self-attested record against a recomputed ground-truth
 * delta. `trustLevel` is always 'self-attested' in Phase A; `notProof` is always
 * true. Coverage verdict is decided by per-entry subset matching (squash/rebase
 * survivable). `deltaHashMatches` is a diagnostic only and never gates coverage.
 */
export interface AdmissionConsistencyDecision {
    schemaVersion: typeof ADMISSION_CONSISTENCY_DECISION_SCHEMA_VERSION;
    verdict: AdmissionConsistencyVerdict;
    trustLevel: 'self-attested';
    notProof: true;
    /** True only when the PR delta is byte-identical to the captured delta (same base, no rebase). */
    deltaHashMatches: boolean;
    /** Ground-truth changed paths covered by an admission-eligible entry. */
    coveredPaths: string[];
    /** Ground-truth paths with no admission-eligible coverage (drift / post-session edits). */
    uncoveredPaths: string[];
    /** Coverage entries not present in the ground-truth delta (stale/multi-session/padding). */
    unexpectedCoverage: string[];
    reasons: string[];
}
export declare function objectIdHexLength(format: GitObjectFormat): number;
export declare function zeroObjectId(format: GitObjectFormat): string;
export declare function isZeroObjectId(objectId: string): boolean;
export declare function isValidObjectId(objectId: string, format: GitObjectFormat): boolean;
export declare function isKnownGitMode(mode: string): boolean;
export declare function objectTypeForMode(mode: string): AdmissionObjectType;
/**
 * Canonical, ordered field list for a delta entry. The field ORDER is part of
 * the hashing contract and must never be reordered.
 */
export declare function deltaEntryCanonicalFields(entry: AdmissionDeltaEntry): string[];
/**
 * Canonical, ordered identity field list for a coverage entry.
 *
 * Identity per the matching contract:
 *   present (added/modified/typechanged) → path + newMode + newObjectId
 *   deleted                              → path + oldMode + oldObjectId
 *
 * `mode`/`objectId` already hold the correct side. `changeType` collapses to a
 * single present/deleted flag so a squash/rebase that reclassifies modified↔added
 * (same resulting content) still matches. `objectType` is derived from `mode` and
 * is excluded. `classification` and `sessions` are annotations and excluded.
 */
export declare function coverageEntryCanonicalFields(entry: AdmissionCoverageEntry): string[];
/** Stable in-memory identity key for set/union operations (not a security hash). */
export declare function coverageEntryIdentityKey(entry: AdmissionCoverageEntry): string;
/**
 * Descriptive test: did this effect have ANY governance evidence (pre- or
 * post-write, or generated)? Use this for descriptive surfaces (telemetry,
 * "what did the runtime observe"). It is NOT the admission eligibility test.
 */
export declare function isGovernedClassification(classification: AdmissionCoverageClassification): boolean;
export type AdmissionEligibilityMode = 'strict' | 'descriptive';
export interface AdmissionEligibilityOptions {
    /** 'strict' (default): pre-write governance only. 'descriptive': any evidence. */
    mode?: AdmissionEligibilityMode;
    /** When true, 'generated' counts as admissible under strict mode (explicit policy opt-in). */
    allowGenerated?: boolean;
}
/**
 * Strict runtime admission eligibility. Only pre-write governance is admissible:
 * `governed_prewrite` and `governed_delete`. `observed_postwrite` is visible but
 * NOT admissible (the write was only seen after it happened). `generated` is
 * admissible only when `allowGenerated` is explicitly set by policy.
 */
export declare function isStrictlyAdmissible(classification: AdmissionCoverageClassification, options?: AdmissionEligibilityOptions): boolean;
/**
 * Eligibility predicate honoring the requested mode. Strict (default) uses
 * `isStrictlyAdmissible`; descriptive uses `isGovernedClassification`.
 */
export declare function isAdmissibleClassification(classification: AdmissionCoverageClassification, options?: AdmissionEligibilityOptions): boolean;
//# sourceMappingURL=schema.d.ts.map