"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildContextPack = buildContextPack;
const brain_context_1 = require("./brain-context");
const intelligence_runtime_common_1 = require("./intelligence-runtime-common");
const neurcode_context_1 = require("./neurcode-context");
const MAX_CONTEXT_SUGGESTIONS = 8;
const MAX_BRAIN_MATCHES = 6;
const MAX_STATIC_CONTEXT_BYTES = 64 * 1024;
function deriveServiceBoundaries(graph, approvedModules) {
    const approved = new Set(approvedModules);
    return graph.nodes
        .filter((node) => node.type === 'service' || node.type === 'module')
        .map((node) => ({
        name: node.label,
        path: node.path || node.label,
        kind: node.category === 'infra'
            ? 'infra'
            : node.category === 'ui'
                ? 'ui'
                : node.category === 'api'
                    ? 'api'
                    : node.category === 'worker'
                        ? 'worker'
                        : node.category === 'shared'
                            ? 'shared'
                            : node.type === 'service'
                                ? 'service'
                                : 'module',
    }))
        .sort((left, right) => {
        const leftPriority = approved.has(left.path) ? 0 : left.kind === 'service' ? 1 : 2;
        const rightPriority = approved.has(right.path) ? 0 : right.kind === 'service' ? 1 : 2;
        return leftPriority - rightPriority || left.path.localeCompare(right.path);
    })
        .slice(0, 12);
}
function buildContextPack(input) {
    const staticContext = (0, neurcode_context_1.loadStaticNeurcodeContext)(input.projectRoot, {
        orgId: input.scope.orgId || undefined,
        projectId: input.scope.projectId || undefined,
    });
    const brainStats = (0, brain_context_1.getBrainContextStats)(input.projectRoot, input.scope);
    const brainMatches = (0, brain_context_1.searchBrainContextEntries)(input.projectRoot, input.scope, input.intentPack.intent.normalized, { limit: MAX_BRAIN_MATCHES });
    const selectedFiles = [];
    for (const suggestion of input.contextAnalysis.details.slice(0, MAX_CONTEXT_SUGGESTIONS)) {
        selectedFiles.push({
            path: suggestion.file,
            confidence: suggestion.confidence,
            source: 'context-engine',
            reasons: suggestion.reasons,
        });
    }
    for (const entry of brainMatches.entries) {
        if (selectedFiles.some((item) => item.path === entry.path)) {
            continue;
        }
        selectedFiles.push({
            path: entry.path,
            confidence: Math.max(0, Math.min(1, Number(entry.score.toFixed(2)))),
            source: 'brain-context',
            reasons: ['Matched prior repo-local engineering context for this intent.'],
            summary: entry.summary,
            symbols: entry.symbols,
        });
    }
    for (const pathValue of input.intentPack.approvedScope.files.slice(0, MAX_CONTEXT_SUGGESTIONS)) {
        if (selectedFiles.some((item) => item.path === pathValue)) {
            continue;
        }
        selectedFiles.push({
            path: pathValue,
            confidence: input.intentPack.contextHints.confidence,
            source: 'repository-intelligence',
            reasons: ['Approved by the current intent pack scope.'],
        });
    }
    const advisoryBlindSpots = [
        ...input.repositoryGraph.blindSpots,
        !brainStats.scopeFound
            ? 'No org/project-scoped brain context was available, so continuity depends on local packs and static repo context only.'
            : '',
        staticContext.sources.length === 0
            ? 'No explicit static Neurcode context files were found; architectural intent depends on repository structure and session memory.'
            : '',
    ].filter(Boolean);
    const fingerprintPayload = {
        schemaVersion: intelligence_runtime_common_1.LOCAL_INTELLIGENCE_SCHEMA_VERSION,
        intentPackId: input.intentPack.intentPackId,
        repositoryGraphId: input.repositoryGraph.graphId,
        selectedFiles: selectedFiles.map((item) => ({
            path: item.path,
            confidence: item.confidence,
            source: item.source,
        })),
        relatedModules: input.intentPack.approvedScope.modules,
        serviceBoundaries: deriveServiceBoundaries(input.repositoryGraph, input.intentPack.approvedScope.modules),
    };
    const fingerprint = (0, intelligence_runtime_common_1.fingerprintValue)(fingerprintPayload);
    return {
        schemaVersion: intelligence_runtime_common_1.LOCAL_INTELLIGENCE_SCHEMA_VERSION,
        contextPackId: `context-${fingerprint.slice(0, 16)}`,
        createdAt: (0, intelligence_runtime_common_1.nowIso)(),
        intentPackId: input.intentPack.intentPackId,
        repositoryGraphId: input.repositoryGraph.graphId,
        compiler: {
            mode: 'deterministic-bounded',
            sources: [
                'context-engine',
                ...(brainMatches.entries.length > 0 ? ['brain-context'] : []),
                ...(staticContext.sources.length > 0 ? ['static-context'] : []),
                'repository-intelligence',
            ],
            precisionBudget: {
                maxSuggestedFiles: MAX_CONTEXT_SUGGESTIONS,
                maxBrainMatches: MAX_BRAIN_MATCHES,
                maxStaticContextBytes: MAX_STATIC_CONTEXT_BYTES,
            },
        },
        selectedFiles: selectedFiles
            .sort((left, right) => right.confidence - left.confidence || left.path.localeCompare(right.path))
            .slice(0, MAX_CONTEXT_SUGGESTIONS + MAX_BRAIN_MATCHES),
        relatedModules: input.intentPack.approvedScope.modules,
        serviceBoundaries: deriveServiceBoundaries(input.repositoryGraph, input.intentPack.approvedScope.modules),
        dependencyManifests: input.repositoryGraph.boundaries.dependencyManifests.slice(0, 12),
        infraBoundaries: [...input.repositoryGraph.boundaries.infraPaths, ...input.repositoryGraph.boundaries.ciPaths].slice(0, 12),
        staticContext: {
            hash: staticContext.text ? staticContext.hash : null,
            sourceCount: staticContext.sources.length,
        },
        brainContext: {
            scopeFound: brainStats.scopeFound,
            fileEntries: brainStats.fileEntries,
            eventEntries: brainStats.eventEntries,
            matchedEntries: brainMatches.entries.length,
        },
        advisory: {
            blindSpots: advisoryBlindSpots,
            rationale: [
                'Context pack stays intentionally bounded to the smallest high-signal file and boundary set available for this intent.',
                'Repository structure, prior repo memory, and static context are additive hints. The intent pack remains the canonical governance boundary.',
            ],
        },
        fingerprint,
    };
}
//# sourceMappingURL=context-pack.js.map