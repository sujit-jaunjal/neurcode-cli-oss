"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BRAIN_SCALE_STATUS_SCHEMA_VERSION = void 0;
exports.buildBrainScaleStatus = buildBrainScaleStatus;
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
const brain_1 = require("@neurcode-ai/brain");
const brain_lifecycle_1 = require("./brain-lifecycle");
exports.BRAIN_SCALE_STATUS_SCHEMA_VERSION = 'neurcode.brain-scale-status.v1';
function uniqueSorted(values) {
    return [...new Set(values)].sort();
}
function scaleRecommendation(input) {
    if (!input.indexed) {
        return 'Run `neurcode brain repo-index` to build the source-free local graph.';
    }
    if (input.acceleratedFallbackToPortable) {
        return 'NEURCODE_GRAPH_STORE requested accelerated SQLite but the native probe failed — '
            + 'using portable JSON (full rewrite each index). Install the native module or run the '
            + 'authority gate, then re-index.';
    }
    const acceleratedRequested = input.resolvedMode === 'sqlite' || input.resolvedMode === 'auto';
    if (input.backend === 'portable' && acceleratedRequested && input.nativeProbeOk) {
        return 'Accelerated store requested and native probe succeeds — run '
            + '`NEURCODE_GRAPH_STORE=sqlite neurcode brain repo-index` to migrate the portable graph to SQLite.';
    }
    if (input.backend === 'portable'
        && input.trackedFiles != null
        && input.trackedFiles > brain_1.AUTO_STORE_TRACKED_FILE_THRESHOLD) {
        return `Repository has ${input.trackedFiles} tracked files (> ${brain_1.AUTO_STORE_TRACKED_FILE_THRESHOLD}); `
            + 'set NEURCODE_GRAPH_STORE=auto for bounded SQLite incremental before large-repo pilots.';
    }
    return null;
}
function scaleNextCommand(input) {
    if (!input.indexed || input.acceleratedFallbackToPortable)
        return 'neurcode brain repo-index';
    const acceleratedRequested = input.resolvedMode === 'sqlite' || input.resolvedMode === 'auto';
    if (input.backend === 'portable' && acceleratedRequested && input.nativeProbeOk) {
        return 'NEURCODE_GRAPH_STORE=sqlite neurcode brain repo-index';
    }
    return 'neurcode brain repo-refresh';
}
/**
 * Build the unified scale status. Synchronous and side-effect free: it only
 * reads the metadata sidecar, the store selection, and the lifecycle record.
 * Callers that already computed live freshness (readiness / repo-status) pass it
 * in via `liveFreshness`; otherwise the recorded metadata freshness is used.
 */
function buildBrainScaleStatus(repoRoot, opts = {}) {
    const selection = (0, brain_1.resolveReadStoreSelection)(repoRoot);
    const metadata = (0, brain_1.readRepositoryGraphMetadata)(repoRoot);
    const lifecycle = (0, brain_lifecycle_1.readBrainLifecycle)(repoRoot);
    const probe = (0, brain_1.probeNativeGraphStore)();
    const resolvedMode = (0, brain_1.resolveRepositoryGraphStoreMode)(repoRoot);
    const envRaw = (process.env.NEURCODE_GRAPH_STORE ?? '').trim().toLowerCase();
    const envExplicit = ['sqlite', 'native', 'auto', 'portable', 'json'].includes(envRaw);
    const modeReason = envExplicit
        ? 'env_explicit'
        : resolvedMode === 'auto'
            ? 'auto_tracked_threshold'
            : 'portable_default';
    const ca = metadata?.coverageAuthority ?? null;
    const limits = metadata?.limits ?? null;
    const indexed = Boolean(metadata);
    const acceleratedRequested = resolvedMode === 'sqlite' || resolvedMode === 'auto';
    const acceleratedFallbackToPortable = acceleratedRequested && selection.backend === 'portable' && !probe.ok;
    const freshnessSource = opts.liveFreshness ?? metadata?.freshness ?? null;
    const eligibleFiles = ca?.eligibleFiles ?? null;
    const indexedFiles = ca?.indexedFiles ?? null;
    const coveragePercent = eligibleFiles != null && eligibleFiles > 0 && indexedFiles != null
        ? Number(((indexedFiles / eligibleFiles) * 100).toFixed(1))
        : null;
    const incrementalPathUsed = [
        ...(freshnessSource?.reasonCodes ?? []),
        ...(lifecycle?.reasonCodes ?? []),
    ].includes('bounded_sqlite_incremental');
    const trackedFiles = ca?.trackedFiles ?? null;
    // When coverage-authority metadata is absent (e.g. a legacy portable artifact),
    // fall back to freshness/limit reason codes so the caps surface never claims a
    // cap is "not reached" while freshness already reports it binding (D3a honesty).
    const capReasonCodes = new Set([
        ...(freshnessSource?.reasonCodes ?? []),
        ...(ca?.reasonCodes ?? []),
    ]);
    const fileCapReached = ca?.fileCapReached
        ?? (capReasonCodes.has('file_limit') || capReasonCodes.has('file_cap_reached'));
    const nodeCapReached = ca?.nodeCapReached
        ?? (capReasonCodes.has('node_limit_reached') || capReasonCodes.has('node_cap_reached'));
    const edgeCapReached = ca?.edgeCapReached
        ?? (capReasonCodes.has('edge_limit_reached') || capReasonCodes.has('edge_cap_reached'));
    return {
        schemaVersion: exports.BRAIN_SCALE_STATUS_SCHEMA_VERSION,
        indexed,
        storage: {
            resolvedMode,
            modeReason,
            backend: selection.backend,
            backendReasonCode: selection.reasonCode ?? null,
            nativeProbeOk: probe.ok,
            acceleratedFallbackToPortable,
            autoStoreTrackedFileThreshold: brain_1.AUTO_STORE_TRACKED_FILE_THRESHOLD,
            bytes: metadata?.graphBytes ?? null,
            recommendation: scaleRecommendation({
                indexed,
                backend: selection.backend,
                resolvedMode,
                acceleratedFallbackToPortable,
                nativeProbeOk: probe.ok,
                trackedFiles,
            }),
        },
        freshness: {
            state: freshnessSource?.state ?? null,
            posture: freshnessSource?.posture ?? null,
            reasonCodes: [...(freshnessSource?.reasonCodes ?? [])],
        },
        coverage: {
            impactAuthority: ca?.impactAuthority ?? null,
            coverageComplete: ca?.coverageComplete ?? null,
            trackedFiles,
            eligibleFiles,
            discoveredFiles: ca?.discoveredFiles ?? null,
            indexedFiles,
            omittedFiles: ca?.omittedFiles ?? null,
            coveragePercent,
            omittedPackages: ca?.omittedPackages ?? [],
            omittedPathPrefixes: ca?.omittedPathPrefixes?.slice(0, 12) ?? [],
        },
        caps: {
            maxFiles: limits?.maxFiles ?? null,
            maxNodes: limits?.maxNodes ?? null,
            maxEdges: limits?.maxEdges ?? null,
            nodeCount: metadata?.nodeCount ?? null,
            edgeCount: metadata?.edgeCount ?? null,
            fileCapReached,
            nodeCapReached,
            edgeCapReached,
        },
        timings: {
            lastSource: lifecycle?.source ?? null,
            lastState: lifecycle?.state ?? null,
            lastDurationMs: lifecycle?.elapsedMs ?? null,
            peakRssMb: lifecycle?.peakRssMb ?? null,
            peakRssMeasurement: lifecycle?.peakRssMeasurement ?? null,
            incrementalPathUsed,
        },
        // Derived from the persisted per-language coverage in the metadata sidecar
        // (depth + facts only) — no full-graph load, no source. Always emits the
        // seven roadmap languages; coverageComplete gates per-query authority, not
        // these per-language capability tiers.
        languageMatrix: (0, brain_1.buildLanguageCoverageMatrix)({
            coverageLanguages: metadata?.coverage?.languages ?? null,
            coverageComplete: ca?.coverageComplete ?? null,
        }),
        notEvaluatedReasons: uniqueSorted([
            ...(ca?.reasonCodes ?? []),
            ...(freshnessSource?.reasonCodes ?? []),
        ]),
        nextCommand: scaleNextCommand({
            indexed,
            backend: selection.backend,
            resolvedMode,
            acceleratedFallbackToPortable,
            nativeProbeOk: probe.ok,
        }),
    };
}
//# sourceMappingURL=brain-scale-status.js.map