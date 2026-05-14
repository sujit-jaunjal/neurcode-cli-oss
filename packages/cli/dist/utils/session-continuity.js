"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLocalIntentSession = createLocalIntentSession;
exports.listLocalIntentSessions = listLocalIntentSessions;
exports.getActiveLocalIntentSession = getActiveLocalIntentSession;
exports.resumeLocalIntentSession = resumeLocalIntentSession;
exports.compareLocalIntentSessions = compareLocalIntentSessions;
const fs_1 = require("fs");
const path_1 = require("path");
const context_pack_1 = require("./context-pack");
const brain_context_1 = require("./brain-context");
const intelligence_runtime_common_1 = require("./intelligence-runtime-common");
const intent_pack_1 = require("./intent-pack");
const plan_sync_1 = require("./plan-sync");
const repository_intelligence_1 = require("./repository-intelligence");
const semantic_contract_intelligence_1 = require("./semantic-contract-intelligence");
const SESSION_PLAN_FILENAME = 'plan.json';
function resolveSessionIndexPath(projectRoot) {
    return (0, path_1.join)((0, intelligence_runtime_common_1.ensureNeurcodeRuntimeDir)(projectRoot), intelligence_runtime_common_1.SESSION_INDEX_FILENAME);
}
function resolveActivePaths(projectRoot) {
    const runtimeDir = (0, intelligence_runtime_common_1.ensureNeurcodeRuntimeDir)(projectRoot);
    return {
        intentPack: (0, path_1.join)(runtimeDir, intelligence_runtime_common_1.ACTIVE_INTENT_PACK_FILENAME),
        contextPack: (0, path_1.join)(runtimeDir, intelligence_runtime_common_1.ACTIVE_CONTEXT_PACK_FILENAME),
        repositoryGraph: (0, path_1.join)(runtimeDir, intelligence_runtime_common_1.ACTIVE_REPOSITORY_GRAPH_FILENAME),
        invariantMemory: (0, path_1.join)(runtimeDir, intelligence_runtime_common_1.ACTIVE_INVARIANT_MEMORY_FILENAME),
        sessionRuntime: (0, path_1.join)(runtimeDir, intelligence_runtime_common_1.ACTIVE_SESSION_RUNTIME_FILENAME),
    };
}
function resolveSessionDir(projectRoot, sessionId) {
    return (0, path_1.join)((0, intelligence_runtime_common_1.ensureSessionsDir)(projectRoot), sessionId);
}
function readSessionIndex(projectRoot) {
    return (0, intelligence_runtime_common_1.readJsonFile)(resolveSessionIndexPath(projectRoot)) || {
        schemaVersion: intelligence_runtime_common_1.LOCAL_INTELLIGENCE_SCHEMA_VERSION,
        activeSessionId: null,
        sessions: [],
        updatedAt: (0, intelligence_runtime_common_1.nowIso)(),
    };
}
function writeSessionIndex(projectRoot, index) {
    (0, intelligence_runtime_common_1.writeJsonFile)(resolveSessionIndexPath(projectRoot), index);
}
function readStoredSession(projectRoot, sessionId) {
    const sessionDir = resolveSessionDir(projectRoot, sessionId);
    const intentPack = (0, intelligence_runtime_common_1.readJsonFile)((0, path_1.join)(sessionDir, intelligence_runtime_common_1.ACTIVE_INTENT_PACK_FILENAME));
    const contextPack = (0, intelligence_runtime_common_1.readJsonFile)((0, path_1.join)(sessionDir, intelligence_runtime_common_1.ACTIVE_CONTEXT_PACK_FILENAME));
    const repositoryGraph = (0, intelligence_runtime_common_1.readJsonFile)((0, path_1.join)(sessionDir, intelligence_runtime_common_1.ACTIVE_REPOSITORY_GRAPH_FILENAME));
    const invariantMemory = (0, intelligence_runtime_common_1.readJsonFile)((0, path_1.join)(sessionDir, intelligence_runtime_common_1.ACTIVE_INVARIANT_MEMORY_FILENAME));
    const sessionRuntime = (0, intelligence_runtime_common_1.readJsonFile)((0, path_1.join)(sessionDir, intelligence_runtime_common_1.ACTIVE_SESSION_RUNTIME_FILENAME));
    const plan = (0, intelligence_runtime_common_1.readJsonFile)((0, path_1.join)(sessionDir, SESSION_PLAN_FILENAME));
    if (!intentPack || !contextPack || !repositoryGraph || !sessionRuntime) {
        return null;
    }
    return { intentPack, contextPack, repositoryGraph, invariantMemory, sessionRuntime, plan };
}
function persistActiveArtifacts(projectRoot, artifacts) {
    const activePaths = resolveActivePaths(projectRoot);
    (0, intelligence_runtime_common_1.writeJsonFile)(activePaths.intentPack, artifacts.intentPack);
    (0, intelligence_runtime_common_1.writeJsonFile)(activePaths.contextPack, artifacts.contextPack);
    (0, intelligence_runtime_common_1.writeJsonFile)(activePaths.repositoryGraph, artifacts.repositoryGraph);
    if (artifacts.invariantMemory) {
        (0, intelligence_runtime_common_1.writeJsonFile)(activePaths.invariantMemory, artifacts.invariantMemory);
    }
    (0, intelligence_runtime_common_1.writeJsonFile)(activePaths.sessionRuntime, artifacts.sessionRuntime);
    return activePaths;
}
function persistSessionSnapshot(projectRoot, sessionId, artifacts) {
    const sessionDir = resolveSessionDir(projectRoot, sessionId);
    (0, intelligence_runtime_common_1.ensureSessionsDir)(projectRoot);
    if (!(0, fs_1.existsSync)(sessionDir)) {
        (0, fs_1.mkdirSync)(sessionDir, { recursive: true });
    }
    (0, intelligence_runtime_common_1.writeJsonFile)((0, path_1.join)(sessionDir, intelligence_runtime_common_1.ACTIVE_INTENT_PACK_FILENAME), artifacts.intentPack);
    (0, intelligence_runtime_common_1.writeJsonFile)((0, path_1.join)(sessionDir, intelligence_runtime_common_1.ACTIVE_CONTEXT_PACK_FILENAME), artifacts.contextPack);
    (0, intelligence_runtime_common_1.writeJsonFile)((0, path_1.join)(sessionDir, intelligence_runtime_common_1.ACTIVE_REPOSITORY_GRAPH_FILENAME), artifacts.repositoryGraph);
    if (artifacts.invariantMemory) {
        (0, intelligence_runtime_common_1.writeJsonFile)((0, path_1.join)(sessionDir, intelligence_runtime_common_1.ACTIVE_INVARIANT_MEMORY_FILENAME), artifacts.invariantMemory);
    }
    (0, intelligence_runtime_common_1.writeJsonFile)((0, path_1.join)(sessionDir, intelligence_runtime_common_1.ACTIVE_SESSION_RUNTIME_FILENAME), artifacts.sessionRuntime);
    if (artifacts.plan) {
        (0, intelligence_runtime_common_1.writeJsonFile)((0, path_1.join)(sessionDir, SESSION_PLAN_FILENAME), artifacts.plan);
    }
    return sessionDir;
}
function buildContinuityLineage(previousRuntime, nextSessionId) {
    if (!previousRuntime) {
        return {
            previousSessionId: null,
            lineage: [nextSessionId],
            warnings: [],
        };
    }
    const lineage = [...previousRuntime.continuity.lineage, nextSessionId].slice(-12);
    return {
        previousSessionId: previousRuntime.sessionId,
        lineage,
        warnings: [],
    };
}
function createLocalIntentSession(input) {
    const plan = (0, plan_sync_1.ensureLocalPlan)(input.projectRoot);
    const repositoryGraph = (0, repository_intelligence_1.buildRepositoryIntelligenceGraph)({
        projectRoot: input.projectRoot,
        focusFiles: [...input.expectedFiles, ...input.contextAnalysis.suggestedFiles],
        contextSuggestions: input.contextAnalysis.details,
    });
    const intentPack = (0, intent_pack_1.buildIntentPack)({
        projectRoot: input.projectRoot,
        orgId: input.orgId,
        projectId: input.projectId,
        intent: input.intent,
        detectedSignals: input.detectedSignals,
        expectedFiles: input.expectedFiles,
        constraints: input.constraints,
        contextAnalysis: input.contextAnalysis,
        repositoryGraph,
    });
    const scope = {
        orgId: input.orgId,
        projectId: input.projectId,
    };
    const contextPack = (0, context_pack_1.buildContextPack)({
        projectRoot: input.projectRoot,
        intentPack,
        repositoryGraph,
        contextAnalysis: input.contextAnalysis,
        scope,
    });
    const sessionId = (0, intelligence_runtime_common_1.createLocalSessionId)(input.projectRoot, intentPack.intent.normalized);
    const currentIndex = readSessionIndex(input.projectRoot);
    const previousRuntime = currentIndex.activeSessionId
        ? readStoredSession(input.projectRoot, currentIndex.activeSessionId)?.sessionRuntime || null
        : null;
    const previousInvariantMemory = currentIndex.activeSessionId
        ? readStoredSession(input.projectRoot, currentIndex.activeSessionId)?.invariantMemory || null
        : null;
    const continuity = buildContinuityLineage(previousRuntime, sessionId);
    const brainStats = (0, brain_context_1.getBrainContextStats)(input.projectRoot, scope);
    const createdAt = (0, intelligence_runtime_common_1.nowIso)();
    const runtimeArtifactPaths = resolveActivePaths(input.projectRoot);
    const runtimeWithoutFingerprint = {
        schemaVersion: intelligence_runtime_common_1.LOCAL_INTELLIGENCE_SCHEMA_VERSION,
        sessionId,
        status: 'active',
        createdAt,
        updatedAt: createdAt,
        repoRoot: input.projectRoot,
        branchName: intentPack.governanceContext.branchName,
        headSha: intentPack.governanceContext.headSha,
        orgId: input.orgId,
        projectId: input.projectId,
        intentPackId: intentPack.intentPackId,
        contextPackId: contextPack.contextPackId,
        repositoryGraphId: repositoryGraph.graphId,
        invariantMemoryId: null,
        planPath: plan.path,
        artifactPaths: {
            intentPack: runtimeArtifactPaths.intentPack,
            contextPack: runtimeArtifactPaths.contextPack,
            repositoryGraph: runtimeArtifactPaths.repositoryGraph,
            invariantMemory: runtimeArtifactPaths.invariantMemory,
            plan: plan.path,
        },
        brainContext: {
            path: brainStats.path,
            scopeFound: brainStats.scopeFound,
            fileEntries: brainStats.fileEntries,
            eventEntries: brainStats.eventEntries,
            lastUpdatedAt: brainStats.lastUpdatedAt,
            lastRefreshAt: brainStats.lastRefreshAt,
        },
        continuity,
    };
    const sessionRuntime = {
        ...runtimeWithoutFingerprint,
        fingerprint: (0, intelligence_runtime_common_1.fingerprintValue)(runtimeWithoutFingerprint),
    };
    const invariantMemory = (0, semantic_contract_intelligence_1.buildEngineeringInvariantMemory)({
        intentPack,
        repositoryGraph,
        sessionRuntime,
        previousMemory: previousInvariantMemory,
    });
    sessionRuntime.invariantMemoryId = invariantMemory.invariantMemoryId;
    sessionRuntime.fingerprint = (0, intelligence_runtime_common_1.fingerprintValue)({
        ...runtimeWithoutFingerprint,
        invariantMemoryId: invariantMemory.invariantMemoryId,
    });
    const stored = {
        intentPack,
        contextPack,
        repositoryGraph,
        invariantMemory,
        sessionRuntime,
        plan: {
            intent: plan.intent,
            expectedFiles: plan.expectedFiles,
            constraints: plan.constraints,
            createdAt: plan.createdAt,
            lastUpdated: plan.lastUpdated,
        },
    };
    const sessionDir = persistSessionSnapshot(input.projectRoot, sessionId, stored);
    const activePaths = persistActiveArtifacts(input.projectRoot, stored);
    const nextSessions = currentIndex.sessions
        .filter((session) => session.sessionId !== sessionId)
        .concat({
        sessionId,
        createdAt,
        branchName: sessionRuntime.branchName,
        headSha: sessionRuntime.headSha,
        intentPackId: intentPack.intentPackId,
        contextPackId: contextPack.contextPackId,
        repositoryGraphId: repositoryGraph.graphId,
        invariantMemoryId: invariantMemory.invariantMemoryId,
        intentSummary: intentPack.intent.normalized.slice(0, 120),
    })
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    writeSessionIndex(input.projectRoot, {
        schemaVersion: intelligence_runtime_common_1.LOCAL_INTELLIGENCE_SCHEMA_VERSION,
        activeSessionId: sessionId,
        sessions: nextSessions,
        updatedAt: (0, intelligence_runtime_common_1.nowIso)(),
    });
    return {
        intentPack,
        contextPack,
        repositoryGraph,
        invariantMemory,
        sessionRuntime,
        plan,
        sessionDir,
        activePaths,
    };
}
function listLocalIntentSessions(projectRoot) {
    const index = readSessionIndex(projectRoot);
    return [...index.sessions].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
function getActiveLocalIntentSession(projectRoot) {
    const activeRuntimePath = resolveActivePaths(projectRoot).sessionRuntime;
    if ((0, fs_1.existsSync)(activeRuntimePath)) {
        const sessionRuntime = (0, intelligence_runtime_common_1.readJsonFile)(activeRuntimePath);
        const intentPack = (0, intelligence_runtime_common_1.readJsonFile)(resolveActivePaths(projectRoot).intentPack);
        const contextPack = (0, intelligence_runtime_common_1.readJsonFile)(resolveActivePaths(projectRoot).contextPack);
        const repositoryGraph = (0, intelligence_runtime_common_1.readJsonFile)(resolveActivePaths(projectRoot).repositoryGraph);
        const invariantMemory = (0, intelligence_runtime_common_1.readJsonFile)(resolveActivePaths(projectRoot).invariantMemory);
        if (sessionRuntime && intentPack && contextPack && repositoryGraph) {
            return { sessionRuntime, intentPack, contextPack, repositoryGraph, invariantMemory, plan: null };
        }
    }
    const index = readSessionIndex(projectRoot);
    if (!index.activeSessionId) {
        return null;
    }
    return readStoredSession(projectRoot, index.activeSessionId);
}
function resumeLocalIntentSession(projectRoot, sessionId) {
    const index = readSessionIndex(projectRoot);
    const targetSessionId = sessionId || index.activeSessionId || index.sessions[0]?.sessionId;
    if (!targetSessionId) {
        return null;
    }
    const stored = readStoredSession(projectRoot, targetSessionId);
    if (!stored) {
        return null;
    }
    const activePaths = persistActiveArtifacts(projectRoot, stored);
    if (stored.plan) {
        (0, intelligence_runtime_common_1.writeJsonFile)((0, plan_sync_1.ensureLocalPlan)(projectRoot).path, stored.plan);
    }
    writeSessionIndex(projectRoot, {
        ...index,
        activeSessionId: targetSessionId,
        updatedAt: (0, intelligence_runtime_common_1.nowIso)(),
    });
    return {
        ...stored,
        plan: (0, plan_sync_1.ensureLocalPlan)(projectRoot),
        sessionDir: resolveSessionDir(projectRoot, targetSessionId),
        activePaths,
    };
}
function diffValues(left, right) {
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    return {
        added: right.filter((value) => !leftSet.has(value)),
        removed: left.filter((value) => !rightSet.has(value)),
    };
}
function compareLocalIntentSessions(projectRoot, leftSessionId, rightSessionId) {
    const left = readStoredSession(projectRoot, leftSessionId);
    const right = readStoredSession(projectRoot, rightSessionId);
    if (!left || !right) {
        return null;
    }
    const fileDiff = diffValues(left.intentPack.approvedScope.files, right.intentPack.approvedScope.files);
    const moduleDiff = diffValues(left.intentPack.approvedScope.modules, right.intentPack.approvedScope.modules);
    const leftBoundaries = left.intentPack.forbiddenBoundaries.map((item) => `${item.type}:${item.path}`);
    const rightBoundaries = right.intentPack.forbiddenBoundaries.map((item) => `${item.type}:${item.path}`);
    const boundaryDiff = diffValues(leftBoundaries, rightBoundaries);
    return {
        leftSessionId,
        rightSessionId,
        sameIntent: left.intentPack.intent.normalized === right.intentPack.intent.normalized,
        sameBranch: left.sessionRuntime.branchName === right.sessionRuntime.branchName,
        approvedFilesAdded: fileDiff.added,
        approvedFilesRemoved: fileDiff.removed,
        modulesAdded: moduleDiff.added,
        modulesRemoved: moduleDiff.removed,
        boundariesAdded: boundaryDiff.added,
        boundariesRemoved: boundaryDiff.removed,
    };
}
//# sourceMappingURL=session-continuity.js.map