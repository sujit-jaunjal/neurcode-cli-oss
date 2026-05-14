"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadActiveEngineeringContext = loadActiveEngineeringContext;
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
//# sourceMappingURL=active-engineering-context.js.map