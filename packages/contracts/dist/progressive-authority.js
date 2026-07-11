"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEMANTIC_SLICE_SCHEMA_VERSION = exports.PROGRESSIVE_AUTHORITY_SCHEMA_VERSION = void 0;
exports.deriveProgressiveAuthorityState = deriveProgressiveAuthorityState;
exports.authorityCeilingForState = authorityCeilingForState;
exports.unavailableProgressiveAuthorityEvidence = unavailableProgressiveAuthorityEvidence;
exports.normalizeProgressiveAuthorityEvidence = normalizeProgressiveAuthorityEvidence;
exports.evaluateProgressiveAuthorityRequirement = evaluateProgressiveAuthorityRequirement;
exports.PROGRESSIVE_AUTHORITY_SCHEMA_VERSION = 'neurcode.progressive-authority.v1.3';
exports.SEMANTIC_SLICE_SCHEMA_VERSION = 'neurcode.semantic-slice.v1.3';
function deriveProgressiveAuthorityState(input) {
    if (input.unavailable)
        return 'unavailable';
    if (input.failed)
        return 'failed';
    if (input.stale)
        return 'stale';
    if (input.discoveryInProgress)
        return 'discovering';
    if (!input.repositoryDiscovered)
        return 'not_started';
    if (input.structuralIndexing)
        return 'structural_indexing';
    if (input.partial || !input.structuralComplete)
        return 'partial';
    if (input.fullyEnriched)
        return 'fully_enriched';
    if (input.backgroundEnrichment)
        return 'background_enrichment';
    if (input.semanticSliceComplete)
        return 'semantic_slice_ready';
    if (input.semanticSliceRequested)
        return 'semantic_slice_pending';
    if (input.governanceReady)
        return 'governance_ready';
    return 'structural_ready';
}
function authorityCeilingForState(state) {
    if (state === 'fully_enriched')
        return 'repository_semantic';
    if (state === 'semantic_slice_ready' || state === 'background_enrichment')
        return 'plan_semantic_slice';
    if (state === 'structural_ready' || state === 'governance_ready')
        return 'complete_structural';
    if (state === 'stale' || state === 'partial' || state === 'semantic_slice_pending') {
        return 'credential_and_explicit_path';
    }
    return 'unavailable';
}
function clampCoverage(value) {
    const number = Number(value);
    if (!Number.isFinite(number))
        return 0;
    return Math.max(0, Math.min(1, number));
}
function boundedReasonCodes(value, fallback = []) {
    if (!Array.isArray(value))
        return fallback;
    return [...new Set(value.filter((entry) => typeof entry === 'string' && entry.length > 0))]
        .sort()
        .slice(0, 64);
}
function nullableMetric(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
}
function boundedString(value, max = 160) {
    return typeof value === 'string' && value.length > 0 ? value.slice(0, max) : null;
}
function hashString(value) {
    return typeof value === 'string' && /^[a-f0-9]{32,64}$/i.test(value) ? value.toLowerCase() : null;
}
function unavailableProgressiveAuthorityEvidence(reasonCode = 'progressive_authority_unavailable', generatedAt = new Date().toISOString()) {
    return {
        schemaVersion: exports.PROGRESSIVE_AUTHORITY_SCHEMA_VERSION,
        state: 'unavailable',
        repositoryFingerprint: null,
        graphSchemaVersion: null,
        cacheSchemaVersion: null,
        graphGeneration: null,
        indexedFiles: 0,
        eligibleFiles: 0,
        structuralCoverage: 0,
        semanticCoverage: 0,
        relevantPlanCoverage: null,
        semanticSliceId: null,
        planFingerprint: null,
        unsupportedAreas: [],
        stalenessReason: reasonCode,
        authorityCeiling: 'unavailable',
        measuredTimingMs: {
            discovery: null,
            structuralIndexing: null,
            semanticSlice: null,
            backgroundEnrichment: null,
        },
        measuredAggregateMemoryMb: {
            governanceReadyPeak: null,
            semanticSlicePeak: null,
            backgroundEnrichmentPeak: null,
            measurement: 'unavailable',
        },
        provenance: {
            structuralProvider: null,
            semanticProvider: null,
            typescriptVersion: null,
            sqliteVersion: null,
            sourceFree: true,
            clientAsserted: false,
        },
        generatedAt,
        reasonCodes: [reasonCode],
    };
}
/**
 * Fail-closed compatibility boundary. Older/malformed payloads never inherit
 * structural or semantic authority merely because they used the word "ready".
 */
function normalizeProgressiveAuthorityEvidence(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return unavailableProgressiveAuthorityEvidence('progressive_authority_missing');
    }
    const input = value;
    if (input.schemaVersion !== exports.PROGRESSIVE_AUTHORITY_SCHEMA_VERSION) {
        return unavailableProgressiveAuthorityEvidence('progressive_authority_schema_incompatible');
    }
    const states = [
        'not_started', 'discovering', 'structural_indexing', 'structural_ready', 'governance_ready',
        'semantic_slice_pending', 'semantic_slice_ready', 'background_enrichment', 'fully_enriched',
        'stale', 'partial', 'failed', 'unavailable',
    ];
    const state = states.includes(input.state)
        ? input.state
        : 'unavailable';
    const structuralCoverage = clampCoverage(input.structuralCoverage);
    const semanticCoverage = clampCoverage(input.semanticCoverage);
    const relevantPlanCoverage = input.relevantPlanCoverage == null
        ? null
        : clampCoverage(input.relevantPlanCoverage);
    const timing = input.measuredTimingMs && typeof input.measuredTimingMs === 'object'
        ? input.measuredTimingMs
        : {};
    const memory = input.measuredAggregateMemoryMb && typeof input.measuredAggregateMemoryMb === 'object'
        ? input.measuredAggregateMemoryMb
        : {};
    let ceiling = authorityCeilingForState(state);
    const reasonCodes = boundedReasonCodes(input.reasonCodes);
    if (ceiling !== 'unavailable' && ceiling !== 'credential_and_explicit_path' && structuralCoverage < 1) {
        ceiling = 'credential_and_explicit_path';
        reasonCodes.push('structural_coverage_incomplete');
    }
    if (ceiling === 'plan_semantic_slice' && relevantPlanCoverage !== 1) {
        ceiling = structuralCoverage === 1 ? 'complete_structural' : 'credential_and_explicit_path';
        reasonCodes.push('semantic_slice_coverage_incomplete');
    }
    if (ceiling === 'repository_semantic' && semanticCoverage < 1) {
        ceiling = relevantPlanCoverage === 1
            ? 'plan_semantic_slice'
            : structuralCoverage === 1 ? 'complete_structural' : 'credential_and_explicit_path';
        reasonCodes.push('repository_semantic_coverage_incomplete');
    }
    return {
        ...unavailableProgressiveAuthorityEvidence('normalized_progressive_authority'),
        ...input,
        schemaVersion: exports.PROGRESSIVE_AUTHORITY_SCHEMA_VERSION,
        state,
        repositoryFingerprint: hashString(input.repositoryFingerprint),
        graphSchemaVersion: boundedString(input.graphSchemaVersion),
        cacheSchemaVersion: Number.isSafeInteger(input.cacheSchemaVersion) && Number(input.cacheSchemaVersion) >= 0
            ? Number(input.cacheSchemaVersion)
            : null,
        graphGeneration: Number.isSafeInteger(input.graphGeneration) && Number(input.graphGeneration) >= 0
            ? Number(input.graphGeneration)
            : null,
        indexedFiles: Math.max(0, Math.floor(Number(input.indexedFiles) || 0)),
        eligibleFiles: Math.max(0, Math.floor(Number(input.eligibleFiles) || 0)),
        structuralCoverage,
        semanticCoverage,
        relevantPlanCoverage,
        semanticSliceId: hashString(input.semanticSliceId),
        planFingerprint: hashString(input.planFingerprint),
        unsupportedAreas: boundedReasonCodes(input.unsupportedAreas),
        stalenessReason: boundedString(input.stalenessReason),
        authorityCeiling: ceiling,
        measuredTimingMs: {
            discovery: nullableMetric(timing.discovery),
            structuralIndexing: nullableMetric(timing.structuralIndexing),
            semanticSlice: nullableMetric(timing.semanticSlice),
            backgroundEnrichment: nullableMetric(timing.backgroundEnrichment),
        },
        measuredAggregateMemoryMb: {
            governanceReadyPeak: nullableMetric(memory.governanceReadyPeak),
            semanticSlicePeak: nullableMetric(memory.semanticSlicePeak),
            backgroundEnrichmentPeak: nullableMetric(memory.backgroundEnrichmentPeak),
            measurement: ['sampled_process_tree_rss', 'sampled_process_rss', 'unavailable'].includes(String(memory.measurement))
                ? memory.measurement
                : 'unavailable',
        },
        provenance: {
            structuralProvider: boundedString(input.provenance?.structuralProvider),
            semanticProvider: boundedString(input.provenance?.semanticProvider),
            typescriptVersion: boundedString(input.provenance?.typescriptVersion),
            sqliteVersion: boundedString(input.provenance?.sqliteVersion),
            sourceFree: true,
            clientAsserted: false,
        },
        generatedAt: Number.isFinite(Date.parse(String(input.generatedAt)))
            ? String(input.generatedAt)
            : new Date().toISOString(),
        reasonCodes: [...new Set(reasonCodes)].sort(),
    };
}
function evaluateProgressiveAuthorityRequirement(input) {
    const evidence = normalizeProgressiveAuthorityEvidence(input.evidence);
    if (input.requirement === 'credential_or_explicit_path') {
        const granted = Boolean(evidence.repositoryFingerprint)
            && evidence.state !== 'failed'
            && evidence.state !== 'unavailable'
            && evidence.state !== 'not_started';
        return { granted, deterministic: granted, reasonCodes: [granted ? 'explicit_path_authority_available' : 'repository_binding_unavailable'] };
    }
    if (input.requirement === 'complete_structural') {
        const granted = evidence.structuralCoverage === 1
            && ['complete_structural', 'plan_semantic_slice', 'repository_semantic'].includes(evidence.authorityCeiling);
        return { granted, deterministic: granted, reasonCodes: [granted ? 'complete_structural_coverage' : 'structural_coverage_unproven'] };
    }
    if (input.requirement === 'semantic_slice') {
        const granted = evidence.relevantPlanCoverage === 1
            && ['plan_semantic_slice', 'repository_semantic'].includes(evidence.authorityCeiling);
        return { granted, deterministic: granted, reasonCodes: [granted ? 'semantic_slice_covers_plan' : 'semantic_slice_does_not_cover_claim'] };
    }
    const granted = evidence.semanticCoverage === 1 && evidence.authorityCeiling === 'repository_semantic';
    return { granted, deterministic: granted, reasonCodes: [granted ? 'repository_semantic_coverage_complete' : 'repository_semantic_coverage_unproven'] };
}
//# sourceMappingURL=progressive-authority.js.map