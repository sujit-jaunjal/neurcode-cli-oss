/**
 * Shared honest "scale status" builder (Scale V4 / D3a).
 *
 * Single source of truth for what the local repository brain knows, how it is
 * stored, where caps bind, and what to run next. `readiness --json`,
 * `repo-status --json`, and the impact projection all read from this builder so
 * the runtime never reports three different stories about the same graph.
 *
 * Everything here is source-free: only counts, reason codes, byte sizes, and
 * backend identifiers — never paths' contents, diffs, or symbol bodies.
 */
import { type GraphImpactAuthority, type RepositoryGraphBackend, type RepositoryGraphStoreMode } from '@neurcode-ai/brain';
import type { LanguageCoverageMatrix } from '@neurcode-ai/contracts';
export declare const BRAIN_SCALE_STATUS_SCHEMA_VERSION: "neurcode.brain-scale-status.v1";
export interface ScaleFreshnessInput {
    state?: string | null;
    posture?: string | null;
    reasonCodes?: string[];
}
export interface BrainScaleStatus {
    schemaVersion: typeof BRAIN_SCALE_STATUS_SCHEMA_VERSION;
    indexed: boolean;
    storage: {
        /** Mode after env + tracked-file threshold resolution (D1c). */
        resolvedMode: RepositoryGraphStoreMode;
        modeReason: 'env_explicit' | 'auto_tracked_threshold' | 'portable_default';
        /** Backend actually selected for reads (prefers the on-disk artifact). */
        backend: RepositoryGraphBackend;
        backendReasonCode: string | null;
        nativeProbeOk: boolean;
        /** LOUD: an accelerated store was requested but reads fall back to portable. */
        acceleratedFallbackToPortable: boolean;
        autoStoreTrackedFileThreshold: number;
        bytes: number | null;
        recommendation: string | null;
    };
    freshness: {
        state: string | null;
        posture: string | null;
        reasonCodes: string[];
    };
    coverage: {
        impactAuthority: GraphImpactAuthority | null;
        coverageComplete: boolean | null;
        trackedFiles: number | null;
        eligibleFiles: number | null;
        discoveredFiles: number | null;
        indexedFiles: number | null;
        omittedFiles: number | null;
        /** Indexed files / eligible files, in percent (analytical coverage). */
        coveragePercent: number | null;
        omittedPackages: string[];
        omittedPathPrefixes: string[];
    };
    caps: {
        maxFiles: number | null;
        maxNodes: number | null;
        maxEdges: number | null;
        nodeCount: number | null;
        edgeCount: number | null;
        fileCapReached: boolean;
        nodeCapReached: boolean;
        edgeCapReached: boolean;
    };
    timings: {
        lastSource: string | null;
        lastState: string | null;
        lastDurationMs: number | null;
        peakRssMb: number | null;
        peakRssMeasurement: string | null;
        incrementalPathUsed: boolean;
    };
    /**
     * Honest per-language capability matrix (Iteration 7). Source-free: derived
     * from the persisted `coverage.languages` depth/facts, never source bodies.
     */
    languageMatrix: LanguageCoverageMatrix;
    notEvaluatedReasons: string[];
    nextCommand: string;
}
/**
 * Build the unified scale status. Synchronous and side-effect free: it only
 * reads the metadata sidecar, the store selection, and the lifecycle record.
 * Callers that already computed live freshness (readiness / repo-status) pass it
 * in via `liveFreshness`; otherwise the recorded metadata freshness is used.
 */
export declare function buildBrainScaleStatus(repoRoot: string, opts?: {
    liveFreshness?: ScaleFreshnessInput | null;
}): BrainScaleStatus;
//# sourceMappingURL=brain-scale-status.d.ts.map