/**
 * Pilot Evidence Pack — pure builders (Iteration 10).
 *
 * After a pilot, a founder needs to hand engineering managers, principal
 * engineers, security reviewers, and procurement/IT a single, shareable packet
 * that explains what the Neurcode runtime control plane actually did — without a
 * live walkthrough and without leaking a single line of source.
 *
 * This module is the source-free, deterministic core. It takes already-parsed,
 * source-free inputs (extracted by the thin `neurcode pilot export` command from
 * `.neurcode/sessions/*.change-record.json`, `.neurcode/admission/*.json`, and
 * `.neurcode/pilot-metrics.json`) and turns them into:
 *
 *   1. {@link buildPilotEvidencePack} — a machine-readable manifest
 *      (`neurcode.pilot-evidence-pack.v1`).
 *   2. {@link renderPilotEvidencePackMarkdown} / {@link renderPilotEvidencePackHtml}
 *      — the human-readable executive packet.
 *
 * Hard rules (shared with utils/enterprise-eval-report.ts + utils/guided-eval.ts):
 *   - Source-free. Only paths, owners, symbol names, counts, verdicts, hashes,
 *     and tier labels are read or emitted. We NEVER copy source, diffs, patch
 *     bodies, raw prompts, secrets, or the admission record's natural-language
 *     `intentSummary` / `goal` prose — intent is represented by its hash and
 *     categories only. {@link assertPilotEvidencePackSourceFree} is the backstop.
 *   - Honest tiers. Deterministic path/approval/hash facts are separated from
 *     advisory inference; trust posture is reported truthfully (self-attested vs
 *     backend-signed) and never overclaims enforcement.
 *   - Deterministic. {@link computePilotEvidencePackHash} excludes wall-clock
 *     timestamps so the same input yields the same `contentHash`.
 *
 * Everything here is pure (no filesystem or network I/O).
 */
export declare const PILOT_EVIDENCE_PACK_SCHEMA_VERSION: "neurcode.pilot-evidence-pack.v1";
/**
 * Keys that would carry intent/prompt/task prose. The pilot evidence pack is
 * stricter than the admission record: even though the admission record's
 * `intentSummary` passes the project's source-free gate (it is intent, not
 * source), an executive packet for a security reviewer must not echo task text.
 * Mirror this set in scripts/source-free-leak-scan.mjs (SOURCE_LIKE_KEYS).
 */
export declare const FORBIDDEN_PROSE_KEYS: ReadonlySet<string>;
/** Source-free projection of one `.neurcode/sessions/<id>.change-record.json`. */
export interface PilotSessionInput {
    sessionId: string;
    status: string | null;
    scopeMode: string | null;
    trustLevel: string | null;
    verdict: string | null;
    counts: {
        ok: number;
        warn: number;
        block: number;
        approval: number;
        planEvents: number;
        events: number;
    };
    /** Intent is represented by hash + categories only — never the prose summary. */
    intentHash: string | null;
    intentCategories: string[];
    approvals: {
        approvalRequired: boolean;
        exactPathApprovalOnly: boolean;
        approvedExactPathCount: number;
        neighborSensitiveBlocked: boolean;
        blockedBoundaryCount: number;
        boundaryOwnerCount: number;
    };
    /** Deterministic blocked-boundary globs (repo-relative; coarse patterns). */
    blockedBoundaries: string[];
    plan: {
        timelineCount: number;
        pendingAmendmentCount: number;
    };
    reuseAdvisoryCount: number;
    evidenceReceipt: string | null;
    hashes: {
        recordHash: string | null;
        replayHash: string | null;
    };
}
/** Source-free projection of one `.neurcode/admission/<id>.json`. */
export interface PilotAdmissionInput {
    sessionId: string;
    attestationKind: string | null;
    trustLevel: string | null;
    sessionStatus: string | null;
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
    /** Repo-relative globs / paths — coarse risk surfaces, never source. */
    paths: {
        blocked: string[];
        denied: string[];
        approvalRequiredSurfaces: string[];
        approvedExact: string[];
        changed: string[];
    };
    manifest: {
        entryCount: number;
        deltaHash: string | null;
        coverageSetHash: string | null;
        /** Per-path git object metadata: path + change type + blob object ids (hashes, not contents). */
        delta: Array<{
            path: string;
            changeType: string;
            oldObjectId: string | null;
            newObjectId: string | null;
        }>;
    };
    integrity: {
        sourceFree: boolean;
        replayHash: string | null;
        evidenceIntegrityStatus: string | null;
        receiptPresent: boolean;
    };
}
/** Source-free projection of the local pilot-metrics rollup (optional). */
export interface PilotMetricsInput {
    periodDays: number;
    totalVerifyRuns: number;
    totalBlockingCaught: number;
    totalStructuralCaught: number;
    averagePassRate: number;
    suppressionRate: number;
    aiDebtTrend: string;
}
/** Source-free projection of `neurcode brain readiness` (optional). */
export interface PilotBrainReadinessInput {
    state: string | null;
    filesIndexed: number | null;
    filesScanned: number | null;
    percent: number | null;
}
export interface BuildPilotEvidencePackInput {
    generatedAt: string;
    cliVersion: string | null;
    repoRootHash: string | null;
    repoName: string | null;
    sessions: PilotSessionInput[];
    admissions: PilotAdmissionInput[];
    metrics: PilotMetricsInput | null;
    brainReadiness?: PilotBrainReadinessInput | null;
}
export type PilotCompletenessStatus = 'complete' | 'partial' | 'empty';
export interface PilotEvidencePack {
    schemaVersion: typeof PILOT_EVIDENCE_PACK_SCHEMA_VERSION;
    /** Wall-clock generation time — EXCLUDED from {@link contentHash}. */
    generatedAt: string;
    /** sha256 of the stable serialization of this pack with `generatedAt` removed. */
    contentHash: string;
    cli: {
        version: string | null;
    };
    repo: {
        rootHash: string | null;
        name: string | null;
    };
    completeness: {
        status: PilotCompletenessStatus;
        missingArtifacts: string[];
        notes: string[];
    };
    summary: {
        sessionCount: number;
        admissionRecordCount: number;
        verdictCounts: Record<string, number>;
        governedEditChecks: number;
        blockedPathTotal: number;
        deniedPathTotal: number;
        approvedExactPathTotal: number;
        riskFamilyCount: number;
        dependencyChangeCount: number;
        trustPosture: {
            selfAttested: number;
            backendSigned: number;
            other: number;
        };
        headline: string;
    };
    sessions: Array<{
        sessionId: string;
        status: string | null;
        verdict: string | null;
        scopeMode: string | null;
        trustLevel: string | null;
        intentHash: string | null;
        intentCategories: string[];
        counts: PilotSessionInput['counts'];
        approvedExactPathCount: number;
        neighborSensitiveBlocked: boolean;
        planEvents: number;
        pendingAmendments: number;
        reuseAdvisoryCount: number;
    }>;
    blockedRiskFamilies: Array<{
        family: string;
        surfaceCount: number;
        sampleSurfaces: string[];
    }>;
    approvals: {
        sessionsRequiringApproval: number;
        exactPathOnlySessions: number;
        approvedExactPathTotal: number;
        neighborDenyObservedSessions: number;
        blockedPathTotal: number;
        deniedPathTotal: number;
    };
    planDrift: {
        planEventTotal: number;
        pendingAmendmentTotal: number;
        planTimelineTotal: number;
        sessionsWithPlanActivity: number;
        note: string;
    };
    dependencyChanges: {
        governedChangeCount: number;
        files: Array<{
            path: string;
            changeType: string;
            objectHash: string | null;
        }>;
        note: string;
    };
    evidenceHashes: Array<{
        sessionId: string;
        recordHash: string | null;
        replayHash: string | null;
        deltaHash: string | null;
        coverageSetHash: string | null;
    }>;
    brainReadiness: PilotBrainReadinessInput | null;
    metrics: PilotMetricsInput | null;
    whatStayedLocal: {
        statement: string;
        facts: string[];
    };
    limitations: string[];
    truthTiers: {
        deterministic: string[];
        advisory: string[];
    };
    privacy: {
        sourceFree: true;
        excludes: string[];
    };
}
/** Map a coarse glob / path to a stable risk-family bucket. Source-free. */
export declare function classifyRiskFamily(surface: string): string;
/** True when a repo-relative path is a recognized dependency manifest / lockfile. */
export declare function isDependencyManifest(path: string): boolean;
/**
 * Build the source-free pilot evidence pack from already-parsed inputs. The
 * returned object carries a stable {@link PilotEvidencePack.contentHash}; the
 * caller should still run {@link assertPilotEvidencePackSourceFree} before
 * writing or printing (defense in depth — the harness asserts the same).
 */
export declare function buildPilotEvidencePack(input: BuildPilotEvidencePackInput): PilotEvidencePack;
/**
 * Compute the stable content hash of a pack: sha256 over the sorted-key
 * serialization with `generatedAt` (and the hash field itself) removed, so the
 * same input always yields the same hash regardless of generation time.
 */
export declare function computePilotEvidencePackHash(pack: PilotEvidencePack): string;
/**
 * Throw if a would-be pilot evidence artifact carries source/diff/secret shapes
 * (delegated to the shared enterprise-eval scan) or any prose-intent key.
 */
export declare function assertPilotEvidencePackSourceFree(value: unknown, label?: string): void;
export declare function renderPilotEvidencePackMarkdown(pack: PilotEvidencePack): string;
export declare function renderPilotEvidencePackHtml(pack: PilotEvidencePack): string;
//# sourceMappingURL=pilot-evidence-pack.d.ts.map