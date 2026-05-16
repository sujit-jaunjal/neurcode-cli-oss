"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadActiveEngineeringContext = loadActiveEngineeringContext;
exports.synthesizeEngineeringContextFromIntentPack = synthesizeEngineeringContextFromIntentPack;
exports.loadOrSynthesizeEngineeringContext = loadOrSynthesizeEngineeringContext;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const intelligence_runtime_common_1 = require("./intelligence-runtime-common");
const intent_contract_diagnostics_1 = require("./intent-contract-diagnostics");
function loadActiveEngineeringContext(projectRoot) {
    const basePath = (0, path_1.join)(projectRoot, '.neurcode');
    const intentPack = (0, intelligence_runtime_common_1.readJsonFile)((0, path_1.join)(basePath, intelligence_runtime_common_1.ACTIVE_INTENT_PACK_FILENAME));
    const contextPack = (0, intelligence_runtime_common_1.readJsonFile)((0, path_1.join)(basePath, intelligence_runtime_common_1.ACTIVE_CONTEXT_PACK_FILENAME));
    const repositoryGraph = (0, intelligence_runtime_common_1.readJsonFile)((0, path_1.join)(basePath, intelligence_runtime_common_1.ACTIVE_REPOSITORY_GRAPH_FILENAME));
    const invariantMemory = (0, intelligence_runtime_common_1.readJsonFile)((0, path_1.join)(basePath, intelligence_runtime_common_1.ACTIVE_INVARIANT_MEMORY_FILENAME));
    const sessionRuntime = (0, intelligence_runtime_common_1.readJsonFile)((0, path_1.join)(basePath, intelligence_runtime_common_1.ACTIVE_SESSION_RUNTIME_FILENAME));
    if (!intentPack || !contextPack || !repositoryGraph || !sessionRuntime) {
        return null;
    }
    const warnings = [];
    if (contextPack.intentPackId !== intentPack.intentPackId) {
        warnings.push('Context pack does not match the active intent pack.');
    }
    if (contextPack.repositoryGraphId !== repositoryGraph.graphId) {
        warnings.push('Context pack does not match the active repository intelligence graph.');
    }
    if (sessionRuntime.intentPackId !== intentPack.intentPackId) {
        warnings.push('Session runtime does not match the active intent pack.');
    }
    if (sessionRuntime.contextPackId !== contextPack.contextPackId) {
        warnings.push('Session runtime does not match the active context pack.');
    }
    if (sessionRuntime.repositoryGraphId !== repositoryGraph.graphId) {
        warnings.push('Session runtime does not match the active repository intelligence graph.');
    }
    if (!invariantMemory) {
        warnings.push('Active engineering context is missing invariant memory; semantic contract lineage will be degraded.');
    }
    else {
        if (invariantMemory.intentPackId !== intentPack.intentPackId) {
            warnings.push('Invariant memory does not match the active intent pack.');
        }
        if (invariantMemory.repositoryGraphId !== repositoryGraph.graphId) {
            warnings.push('Invariant memory does not match the active repository intelligence graph.');
        }
        if (sessionRuntime.invariantMemoryId && invariantMemory.invariantMemoryId !== sessionRuntime.invariantMemoryId) {
            warnings.push('Session runtime does not match the active invariant memory.');
        }
    }
    const currentBranch = (0, intelligence_runtime_common_1.getGitBranchName)(projectRoot);
    if (currentBranch && sessionRuntime.branchName && currentBranch !== sessionRuntime.branchName) {
        warnings.push(`Active engineering context was created on branch ${sessionRuntime.branchName}, current branch is ${currentBranch}.`);
    }
    warnings.push(...(0, intent_contract_diagnostics_1.evaluateIntentContractDiagnostics)({
        projectRoot,
        intentPack,
        contextPack,
        repositoryGraph,
    }));
    return {
        source: 'intent-runtime',
        intentPack,
        contextPack,
        repositoryGraph,
        invariantMemory,
        sessionRuntime,
        warnings,
    };
}
/**
 * Deterministic synthesis of a minimum-viable engineering context from
 * `intent-pack.json` alone.
 *
 * Background: the canonical intent-runtime requires four companion artefacts
 * (`intent-pack`, `context-pack`, `repository-graph`, `session-runtime`). In
 * enterprise contexts where only the intent contract has been authored — or
 * where the cloud-bootstrapped bundle is unavailable — scope governance,
 * forbidden-boundary enforcement and dependency-manifest drift detection
 * would otherwise be silently disabled.
 *
 * This synthesiser produces deterministic stub companion artefacts derived
 * from the intent-pack's own fields, allowing `evaluateGovernance()` and the
 * drift-intelligence engine to run with `source = "intent-runtime"` and
 * `synthesized = true`. Semantic narratives (ownership boundaries, semantic
 * contracts, invariants) remain empty — the synthesised context carries an
 * explicit `blindSpots` entry and a `synthesized` warning so downstream
 * consumers can label posture accordingly.
 *
 * Determinism guarantees:
 *   - All synthesized identifiers are SHA-256-derived from the intent-pack id.
 *   - All timestamps mirror `intentPack.createdAt`.
 *   - The function is pure with respect to `(intentPack, projectRoot)`.
 *   - Re-runs against an unchanged intent-pack yield byte-identical output.
 */
/**
 * Deterministic, bounded service-boundary inference for the synthesised
 * context. Enumerates well-known monorepo prefixes (`services/`, `apps/`,
 * `packages/`) at depth 1 and records each top-level entry as a service or
 * module boundary. Read-only, single-level `readdirSync`; no recursive walk,
 * no AI inference. Returns a deterministically-sorted list — the same repo
 * state yields byte-identical output.
 *
 * Intentionally conservative: a repo that doesn't follow these conventions
 * gets an empty boundary list and downstream drift-intelligence relies on
 * intent-pack scope + path-classifier signals.
 */
function inferServiceBoundariesFromProjectRoot(projectRoot) {
    const boundaries = [];
    const conventions = [
        { dir: 'services', kind: 'service' },
        { dir: 'apps', kind: 'service' },
        { dir: 'packages', kind: 'module' },
    ];
    for (const { dir, kind } of conventions) {
        const fullPath = (0, path_1.join)(projectRoot, dir);
        let names;
        try {
            // Use string-mode readdir + explicit fs.statSync to sidestep the
            // Dirent<string>/Dirent<NonSharedBuffer> overload narrowing pain.
            names = (0, fs_1.readdirSync)(fullPath);
        }
        catch {
            continue;
        }
        for (const name of names) {
            if (name.startsWith('.'))
                continue;
            if (name === 'node_modules' || name === '__pycache__')
                continue;
            let isDir = false;
            try {
                // Lazy require to keep the import surface small.
                const { statSync } = require('fs');
                isDir = statSync((0, path_1.join)(fullPath, name)).isDirectory();
            }
            catch {
                continue;
            }
            if (!isDir)
                continue;
            boundaries.push({
                name,
                path: `${dir}/${name}`,
                kind,
            });
        }
    }
    boundaries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return boundaries;
}
function synthesizeEngineeringContextFromIntentPack(projectRoot, rawIntentPack) {
    const basePath = (0, path_1.join)(projectRoot, '.neurcode');
    // Defensively normalise the intent-pack so optional/legacy fields never
    // cause evaluateGovernance to throw on missing arrays. This is the local
    // ingress point for hand-authored intent contracts; real-world files
    // routinely omit semanticExpectations sub-arrays they don't yet use.
    const intentPack = normalizeIntentPackForRuntime(rawIntentPack);
    const seed = intentPack.intentPackId || intentPack.fingerprint || projectRoot;
    const hashSuffix = (label) => (0, crypto_1.createHash)('sha256').update(`${label}:${seed}`).digest('hex').slice(0, 16);
    const fingerprint = hashSuffix('synth-fingerprint');
    const contextPackId = `ctx-synth-${hashSuffix('ctx')}`;
    const repositoryGraphId = `graph-synth-${hashSuffix('graph')}`;
    const sessionId = `session-synth-${hashSuffix('session')}`;
    const synthAt = intentPack.createdAt || new Date(0).toISOString();
    const filterBoundary = (type) => intentPack.forbiddenBoundaries.filter((b) => b.type === type).map((b) => b.path);
    const contextPack = {
        schemaVersion: intentPack.schemaVersion,
        contextPackId,
        createdAt: synthAt,
        intentPackId: intentPack.intentPackId,
        repositoryGraphId,
        compiler: {
            mode: 'deterministic-bounded',
            sources: ['static-context'],
            precisionBudget: {
                maxSuggestedFiles: 0,
                maxBrainMatches: 0,
                maxStaticContextBytes: 0,
            },
        },
        selectedFiles: [],
        relatedModules: [...intentPack.approvedScope.modules],
        // Service-boundary inference adds deterministic monorepo-shape signal
        // to the synthesised context. Drift-intelligence consumes this to map
        // changed files onto declared service surfaces.
        serviceBoundaries: inferServiceBoundariesFromProjectRoot(projectRoot),
        dependencyManifests: [...intentPack.expectedDependencies],
        infraBoundaries: [...intentPack.expectedInfrastructure],
        staticContext: { hash: null, sourceCount: 0 },
        brainContext: { scopeFound: false, fileEntries: 0, eventEntries: 0, matchedEntries: 0 },
        advisory: {
            blindSpots: ['Synthesised context — no source-code scanning; semantic narratives are bounded.'],
            rationale: ['Generated from intent-pack-only mode; scope and forbidden-boundary enforcement remain active.'],
        },
        fingerprint,
    };
    const repositoryGraph = {
        schemaVersion: intentPack.schemaVersion,
        graphId: repositoryGraphId,
        generatedAt: synthAt,
        repository: {
            name: intentPack.governanceContext.repoName,
            rootPath: intentPack.governanceContext.projectRoot,
            branchName: intentPack.governanceContext.branchName,
            headSha: intentPack.governanceContext.headSha,
            workspaceId: null,
        },
        summary: {
            scannedSourceFiles: 0,
            moduleCount: intentPack.approvedScope.modules.length,
            serviceCount: intentPack.approvedScope.services.length,
            importEdges: 0,
            crossModuleEdges: 0,
            sensitiveBoundaryCount: intentPack.forbiddenBoundaries.filter((b) => b.type === 'sensitive').length,
            manifestCount: intentPack.expectedDependencies.length,
            crossRepoEdgeCount: 0,
            ownershipBoundaryCount: 0,
            semanticContractCount: 0,
            invariantCount: 0,
            runtimeBehaviorCount: 0,
            runtimeInteractionCount: 0,
            deploymentBoundaryCount: 0,
        },
        nodes: [],
        edges: [],
        boundaries: {
            sensitivePaths: filterBoundary('sensitive'),
            infraPaths: filterBoundary('infra'),
            ciPaths: filterBoundary('ci'),
            dependencyManifests: filterBoundary('dependency-manifest'),
        },
        semantic: {
            ownershipBoundaries: [],
            contracts: [],
            invariants: [],
            criticalDomains: [],
            runtime: {
                behaviorProfiles: [],
                interactions: [],
                deploymentBoundaries: [],
                criticalFlows: [],
                blindSpots: ['Synthesised graph — no semantic model available.'],
            },
        },
        blindSpots: ['Synthesised repository graph: ownership boundaries, contracts and invariants are empty.'],
        fingerprint,
    };
    const sessionRuntime = {
        schemaVersion: intentPack.schemaVersion,
        sessionId,
        status: 'active',
        createdAt: synthAt,
        updatedAt: synthAt,
        repoRoot: intentPack.governanceContext.projectRoot,
        branchName: intentPack.governanceContext.branchName,
        headSha: intentPack.governanceContext.headSha,
        orgId: intentPack.governanceContext.orgId,
        projectId: intentPack.governanceContext.projectId,
        intentPackId: intentPack.intentPackId,
        contextPackId,
        repositoryGraphId,
        invariantMemoryId: null,
        planPath: null,
        artifactPaths: {
            intentPack: (0, path_1.join)(basePath, intelligence_runtime_common_1.ACTIVE_INTENT_PACK_FILENAME),
            contextPack: (0, path_1.join)(basePath, intelligence_runtime_common_1.ACTIVE_CONTEXT_PACK_FILENAME),
            repositoryGraph: (0, path_1.join)(basePath, intelligence_runtime_common_1.ACTIVE_REPOSITORY_GRAPH_FILENAME),
            invariantMemory: null,
            plan: null,
        },
        brainContext: {
            path: (0, path_1.join)(basePath, 'brain.db'),
            scopeFound: false,
            fileEntries: 0,
            eventEntries: 0,
        },
        continuity: {
            previousSessionId: null,
            lineage: [],
            warnings: ['Synthesised session — intent-pack-only mode.'],
        },
        fingerprint,
    };
    const warnings = [
        'Engineering context synthesised from intent-pack alone. Scope, forbidden-boundary and dependency-manifest drift remain governed; semantic narratives (ownership, invariants) are degraded.',
    ];
    warnings.push(...(0, intent_contract_diagnostics_1.evaluateIntentContractDiagnostics)({
        projectRoot,
        intentPack,
        contextPack,
        repositoryGraph,
    }));
    return {
        source: 'intent-runtime',
        intentPack,
        contextPack,
        repositoryGraph,
        invariantMemory: null,
        sessionRuntime,
        warnings,
        synthesized: true,
    };
}
/**
 * Defensively normalise a (possibly partial) intent-pack so every array field
 * the rest of the runtime relies on is present with a sane default. Lets the
 * synthesiser ingest hand-authored intent contracts that omit unused fields.
 */
function normalizeIntentPackForRuntime(intentPack) {
    const arr = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []);
    const semanticIn = (intentPack.semanticExpectations || {});
    const semanticExpectations = {
        ownershipBoundaries: arr(semanticIn.ownershipBoundaries),
        contractIds: arr(semanticIn.contractIds),
        // Tolerate legacy/hand-authored intent-packs that store `invariants`
        // (free-form strings) instead of `invariantIds` (registry references).
        invariantIds: arr(semanticIn.invariantIds).concat(arr(semanticIn.invariants)),
        expectedResponsibilities: arr(semanticIn.expectedResponsibilities),
        expectedBehaviorKinds: arr(semanticIn.expectedBehaviorKinds),
        expectedRuntimeFlows: arr(semanticIn.expectedRuntimeFlows),
        expectedRolloutUnits: arr(semanticIn.expectedRolloutUnits),
    };
    const expectedBlastRadius = intentPack.expectedBlastRadius || {
        level: 'low',
        rationale: 'Not declared in intent-pack.',
        expectedFiles: intentPack.approvedScope?.files ?? [],
    };
    const contextHints = intentPack.contextHints || { suggestedFiles: [], confidence: 0 };
    return {
        ...intentPack,
        approvedScope: {
            files: arr(intentPack.approvedScope?.files),
            modules: arr(intentPack.approvedScope?.modules),
            services: arr(intentPack.approvedScope?.services),
        },
        forbiddenBoundaries: Array.isArray(intentPack.forbiddenBoundaries) ? intentPack.forbiddenBoundaries : [],
        expectedDependencies: arr(intentPack.expectedDependencies),
        expectedInfrastructure: arr(intentPack.expectedInfrastructure),
        checkpoints: Array.isArray(intentPack.checkpoints) ? intentPack.checkpoints : [],
        rolloutExpectations: arr(intentPack.rolloutExpectations),
        governanceExpectations: arr(intentPack.governanceExpectations),
        constraints: arr(intentPack.constraints),
        detectedSignals: arr(intentPack.detectedSignals),
        semanticExpectations,
        expectedBlastRadius,
        contextHints,
        fingerprint: intentPack.fingerprint || '',
        repositoryGraphId: intentPack.repositoryGraphId ?? null,
    };
}
/**
 * Load the active engineering context, or — when only `intent-pack.json` is
 * present — synthesise a deterministic minimum-viable context so the
 * intent-governed runtime activates locally without cloud connectivity.
 *
 * Returns `null` only when no intent-pack is present at all.
 */
function loadOrSynthesizeEngineeringContext(projectRoot) {
    const existing = loadActiveEngineeringContext(projectRoot);
    if (existing)
        return existing;
    const basePath = (0, path_1.join)(projectRoot, '.neurcode');
    const intentPack = (0, intelligence_runtime_common_1.readJsonFile)((0, path_1.join)(basePath, intelligence_runtime_common_1.ACTIVE_INTENT_PACK_FILENAME));
    if (!intentPack)
        return null;
    return synthesizeEngineeringContextFromIntentPack(projectRoot, intentPack);
}
//# sourceMappingURL=active-engineering-context.js.map