"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildIntentPack = buildIntentPack;
const path_1 = require("path");
const intelligence_runtime_common_1 = require("./intelligence-runtime-common");
function deriveModuleName(filePath) {
    const normalized = (0, intelligence_runtime_common_1.normalizeRepoPath)(filePath);
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length <= 1) {
        return parts[0] || normalized;
    }
    if (['src', 'app', 'apps', 'services', 'packages', 'libs', 'lib'].includes(parts[0]) && parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
    }
    return parts[0];
}
function deriveServiceName(modulePath) {
    const normalized = modulePath.toLowerCase();
    if (normalized.includes('service')
        || normalized.includes('api')
        || normalized.includes('auth')
        || normalized.includes('billing')
        || normalized.includes('payment')
        || normalized.includes('worker')
        || normalized.includes('queue')) {
        return modulePath;
    }
    return null;
}
function buildBoundaryExpectations(graph) {
    const expectations = [];
    for (const pathValue of graph.boundaries.sensitivePaths.slice(0, 8)) {
        expectations.push({
            type: 'sensitive',
            path: pathValue,
            policy: 'review-required',
            reason: 'Sensitive boundary changes should be explicitly justified against engineering intent.',
        });
    }
    for (const pathValue of graph.boundaries.infraPaths.slice(0, 6)) {
        expectations.push({
            type: 'infra',
            path: pathValue,
            policy: 'forbidden',
            reason: 'Infrastructure edits expand blast radius and should stay out of routine implementation sessions unless declared.',
        });
    }
    for (const pathValue of graph.boundaries.ciPaths.slice(0, 4)) {
        expectations.push({
            type: 'ci',
            path: pathValue,
            policy: 'forbidden',
            reason: 'CI and release automation must not drift from application intent without explicit rollout approval.',
        });
    }
    for (const pathValue of graph.boundaries.dependencyManifests.slice(0, 6)) {
        expectations.push({
            type: 'dependency-manifest',
            path: pathValue,
            policy: 'review-required',
            reason: 'Dependency manifest edits should align with declared implementation scope and blast radius.',
        });
    }
    return expectations.sort((left, right) => left.path.localeCompare(right.path));
}
function buildIntentPack(input) {
    const createdAt = (0, intelligence_runtime_common_1.nowIso)();
    const normalizedIntent = (0, intelligence_runtime_common_1.normalizeText)(input.intent);
    const approvedFiles = (0, intelligence_runtime_common_1.dedupeSortedPaths)([
        ...input.expectedFiles,
        ...input.contextAnalysis.suggestedFiles,
    ]).slice(0, 24);
    const approvedModules = (0, intelligence_runtime_common_1.dedupeSorted)(approvedFiles.map(deriveModuleName)).slice(0, 12);
    const approvedServices = (0, intelligence_runtime_common_1.dedupeSorted)(approvedModules
        .map(deriveServiceName)
        .filter((value) => Boolean(value))).slice(0, 8);
    const blastRadiusLevel = approvedFiles.length >= 16
        ? 'high'
        : approvedFiles.length >= 8
            ? 'medium'
            : 'low';
    const expectedDependencies = (0, intelligence_runtime_common_1.dedupeSorted)(input.repositoryGraph.boundaries.dependencyManifests.map((pathValue) => (0, path_1.basename)(pathValue))).slice(0, 8);
    const expectedInfrastructure = (0, intelligence_runtime_common_1.dedupeSortedPaths)(input.repositoryGraph.boundaries.infraPaths).slice(0, 8);
    const forbiddenBoundaries = buildBoundaryExpectations(input.repositoryGraph);
    const checkpoints = [
        {
            id: 'scope-check',
            label: 'Scope stays within approved files and modules',
            rationale: 'Prevent AI drift into unrelated services or modules.',
        },
        {
            id: 'boundary-check',
            label: 'Sensitive, infra, CI, and dependency boundaries stay declared',
            rationale: 'Catch blast-radius expansion before remediation or merge.',
        },
        {
            id: 'reverify-check',
            label: 'Replay-linked reverify passes before rollout',
            rationale: 'Preserve deterministic governance lineage through remediation.',
        },
    ];
    const rolloutExpectations = (0, intelligence_runtime_common_1.dedupeSorted)([
        expectedInfrastructure.length > 0
            ? 'Treat infra and deployment files as out-of-scope unless explicitly approved.'
            : '',
        'Use `neurcode verify --evidence` before remediation handoff and again after fixes land.',
        'Keep implementation scoped to the declared change contract before CI governance.',
    ]);
    const governanceExpectations = (0, intelligence_runtime_common_1.dedupeSorted)([
        'Findings must remain replay-linked and explainable against declared intent.',
        'Unexpected cross-service, dependency, or CI drift should fail governance review.',
        'Remediation exports must preserve intent, policy, and replay lineage.',
    ]);
    const relevantBoundaries = (input.repositoryGraph.semantic?.ownershipBoundaries || []).filter((boundary) => approvedModules.includes(boundary.path) || approvedServices.includes(boundary.name));
    const semanticExpectations = {
        ownershipBoundaries: (0, intelligence_runtime_common_1.dedupeSorted)(relevantBoundaries.map((boundary) => boundary.name)).slice(0, 12),
        contractIds: (0, intelligence_runtime_common_1.dedupeSorted)((input.repositoryGraph.semantic?.contracts || [])
            .filter((contract) => relevantBoundaries.some((boundary) => boundary.id === contract.boundaryId))
            .map((contract) => contract.id)).slice(0, 16),
        invariantIds: (0, intelligence_runtime_common_1.dedupeSorted)((input.repositoryGraph.semantic?.invariants || [])
            .filter((invariant) => relevantBoundaries.some((boundary) => boundary.id === invariant.boundaryId)
            || invariant.scope === 'repository')
            .map((invariant) => invariant.id)).slice(0, 16),
        expectedResponsibilities: (0, intelligence_runtime_common_1.dedupeSorted)(relevantBoundaries.flatMap((boundary) => boundary.responsibilities)).slice(0, 16),
        expectedBehaviorKinds: (0, intelligence_runtime_common_1.dedupeSorted)((input.repositoryGraph.semantic?.runtime.behaviorProfiles || [])
            .filter((profile) => relevantBoundaries.some((boundary) => boundary.id === profile.boundaryId))
            .flatMap((profile) => profile.behaviorKinds)).slice(0, 16),
        expectedRuntimeFlows: (0, intelligence_runtime_common_1.dedupeSorted)((input.repositoryGraph.semantic?.runtime.interactions || [])
            .filter((interaction) => relevantBoundaries.some((boundary) => boundary.id === interaction.fromBoundaryId || boundary.id === interaction.toBoundaryId))
            .map((interaction) => `${interaction.kind}:${interaction.fromBoundaryName}->${interaction.toBoundaryName || interaction.subject}`)).slice(0, 20),
        expectedRolloutUnits: (0, intelligence_runtime_common_1.dedupeSorted)((input.repositoryGraph.semantic?.runtime.behaviorProfiles || [])
            .filter((profile) => relevantBoundaries.some((boundary) => boundary.id === profile.boundaryId))
            .flatMap((profile) => profile.rolloutUnits)).slice(0, 12),
    };
    const fingerprintPayload = {
        schemaVersion: intelligence_runtime_common_1.LOCAL_INTELLIGENCE_SCHEMA_VERSION,
        intent: normalizedIntent,
        approvedFiles,
        approvedModules,
        approvedServices,
        forbiddenBoundaries,
        constraints: (0, intelligence_runtime_common_1.dedupeSorted)(input.constraints),
        detectedSignals: (0, intelligence_runtime_common_1.dedupeSorted)(input.detectedSignals),
        semanticExpectations,
        repositoryGraphId: input.repositoryGraph.graphId,
    };
    const fingerprint = (0, intelligence_runtime_common_1.fingerprintValue)(fingerprintPayload);
    return {
        schemaVersion: intelligence_runtime_common_1.LOCAL_INTELLIGENCE_SCHEMA_VERSION,
        intentPackId: `intent-${fingerprint.slice(0, 16)}`,
        createdAt,
        updatedAt: createdAt,
        intent: {
            raw: input.intent,
            normalized: normalizedIntent,
        },
        governanceContext: {
            repoName: (0, path_1.basename)(input.projectRoot),
            projectRoot: input.projectRoot,
            branchName: (0, intelligence_runtime_common_1.getGitBranchName)(input.projectRoot),
            headSha: (0, intelligence_runtime_common_1.getGitHeadSha)(input.projectRoot),
            orgId: input.orgId,
            projectId: input.projectId,
        },
        approvedScope: {
            files: approvedFiles,
            modules: approvedModules,
            services: approvedServices,
        },
        forbiddenBoundaries,
        expectedDependencies,
        expectedInfrastructure,
        expectedBlastRadius: {
            level: blastRadiusLevel,
            rationale: blastRadiusLevel === 'high'
                ? 'Intent currently touches enough files or modules that governance should expect broader coordination risk.'
                : blastRadiusLevel === 'medium'
                    ? 'Intent spans multiple bounded files or modules and should be watched for adjacent drift.'
                    : 'Intent remains narrowly scoped and should stay within a small bounded file set.',
            expectedFiles: approvedFiles,
        },
        checkpoints,
        rolloutExpectations,
        governanceExpectations,
        constraints: (0, intelligence_runtime_common_1.dedupeSorted)(input.constraints),
        detectedSignals: (0, intelligence_runtime_common_1.dedupeSorted)(input.detectedSignals),
        semanticExpectations,
        contextHints: {
            suggestedFiles: (0, intelligence_runtime_common_1.dedupeSortedPaths)(input.contextAnalysis.suggestedFiles),
            confidence: input.contextAnalysis.confidence,
        },
        repositoryGraphId: input.repositoryGraph.graphId,
        fingerprint,
    };
}
//# sourceMappingURL=intent-pack.js.map