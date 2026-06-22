"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_CHANGE_RECORD_TYPE = exports.AI_CHANGE_RECORD_SCHEMA_VERSION = exports.sessionPath = exports.sessionsDir = exports.replaySession = exports.finishSession = exports.buildPlanTimeline = exports.activeAgentPlanRevision = exports.evaluateSessionPlanCoherence = exports.classifyAgentPlanAmendment = exports.decideAgentPlanAmendment = exports.amendAgentPlan = exports.captureAgentPlan = exports.attachAgentPlan = exports.evaluatePlanCoherencePolicy = exports.evaluateIntentCoherence = exports.refreshArchitectureObligations = exports.waiveArchitectureObligation = exports.expireArchitectureObligationWaivers = exports.expireSessionApprovals = exports.activeApprovalPaths = exports.revokeSessionApproval = exports.approveSession = exports.appendEvent = exports.loadSession = exports.loadActiveSession = exports.createSession = exports.topologySupportGlobs = exports.topologyPackageRootsForPaths = exports.topologyHasPath = exports.topologyGlobsForIntent = exports.topologyFacts = exports.compileRepositoryTopology = exports.REPOSITORY_TOPOLOGY_SCHEMA_VERSION = exports.ownersForPath = exports.DEFAULT_RUNTIME_LOCAL_MODE = exports.DEFAULT_PLAN_COHERENCE_MODE = exports.checkFileBoundary = exports.buildRepoGovernanceProfile = exports.validatePrivacySafeCloudPayload = exports.sanitizeRepoRelativePath = exports.sanitizeLocalPrivateText = exports.normalizeIntentContent = exports.isIntentSummaryV1 = exports.detectCredentialText = exports.canonicalIntentHash = exports.buildIntentSummary = exports.assertPrivacySafeCloudPayload = exports.INTENT_SUMMARY_SCHEMA_VERSION = exports.INTENT_PRIVACY_POLICY_VERSION = void 0;
exports.validateSelfAttestedRecordConsistency = exports.unionCoverageManifests = exports.unionCoverageEntries = exports.sortDeltaEntries = exports.sortCoverageEntries = exports.readSelfAttestedAdmissionRecordFromText = exports.readSelfAttestedAdmissionRecord = exports.normalizeDeltaEntries = exports.deriveCoverageEntries = exports.computeDeltaHash = exports.computeCoverageSetHash = exports.buildCoverageManifest = exports.compileDeterministicConstraints = exports.resolveImportSpecifier = exports.modulesInPlay = exports.moduleIdForPath = exports.isModuleTestSatisfiable = exports.findModuleForPath = exports.extractImportSpecifiers = exports.deriveGraphObligationSeeds = exports.dependentsOf = exports.dependenciesOf = exports.buildArchitectureGraph = exports.ARCHITECTURE_GRAPH_SCHEMA_VERSION = exports.summarizeArchitectureObligations = exports.normalizeArchitectureObligationPolicy = exports.isArchitectureObligationWaiverActive = exports.evaluateArchitectureEdit = exports.planDeclaredApprovalRequiredPaths = exports.evaluateArchitectureObligationFeedback = exports.effectiveArchitectureObligationMode = exports.deriveArchitectureObligations = exports.activeArchitectureObligationWaivers = exports.DEFAULT_ARCHITECTURE_OBLIGATION_POLICY = exports.ARCHITECTURE_OBLIGATION_SCHEMA_VERSION = exports.buildAgentGuardPostureSummary = exports.AGENT_GUARD_POSTURE_SCHEMA_VERSION = exports.buildAgentInvocationSummary = exports.AGENT_INVOCATION_OBSERVABILITY_SCHEMA_VERSION = exports.writeAIChangeRecord = exports.verifyAIChangeRecordReceipt = exports.stableStringify = exports.stableHash = exports.canonicalAIChangeRecordHash = exports.buildAIChangeRecordReceipt = exports.buildAIChangeRecord = exports.assertSourceFreeAIChangeRecordPayload = exports.aiChangeRecordPath = exports.AI_CHANGE_RECORD_SIGNING_VERSION = exports.AI_CHANGE_RECORD_RECEIPT_SCHEMA_VERSION = void 0;
exports.normalizeAgentRuntimeEvent = exports.listAgentRuntimeAdapterCapabilities = exports.getAgentRuntimeAdapterCapability = exports.AGENT_RUNTIME_DECISION_SCHEMA_VERSION = exports.AGENT_RUNTIME_ADAPTER_SCHEMA_VERSION = exports.sanitizePlanCoherence = exports.sanitizeAgentPlan = exports.isTestOrUtilityPath = exports.planImpliesSupportWork = exports.evaluatePlanCoherence = exports.parsePlanSteps = exports.extractExpectedTargetsFromText = exports.extractAgentPlan = exports.AGENT_PLAN_SCHEMA_VERSION = void 0;
exports.extractPlannedFilePaths = extractPlannedFilePaths;
exports.resolvePlanVerdict = resolvePlanVerdict;
exports.buildPlanVerificationMessage = buildPlanVerificationMessage;
exports.evaluatePlanVerification = evaluatePlanVerification;
var intent_privacy_1 = require("./intent-privacy");
Object.defineProperty(exports, "INTENT_PRIVACY_POLICY_VERSION", { enumerable: true, get: function () { return intent_privacy_1.INTENT_PRIVACY_POLICY_VERSION; } });
Object.defineProperty(exports, "INTENT_SUMMARY_SCHEMA_VERSION", { enumerable: true, get: function () { return intent_privacy_1.INTENT_SUMMARY_SCHEMA_VERSION; } });
Object.defineProperty(exports, "assertPrivacySafeCloudPayload", { enumerable: true, get: function () { return intent_privacy_1.assertPrivacySafeCloudPayload; } });
Object.defineProperty(exports, "buildIntentSummary", { enumerable: true, get: function () { return intent_privacy_1.buildIntentSummary; } });
Object.defineProperty(exports, "canonicalIntentHash", { enumerable: true, get: function () { return intent_privacy_1.canonicalIntentHash; } });
Object.defineProperty(exports, "detectCredentialText", { enumerable: true, get: function () { return intent_privacy_1.detectCredentialText; } });
Object.defineProperty(exports, "isIntentSummaryV1", { enumerable: true, get: function () { return intent_privacy_1.isIntentSummaryV1; } });
Object.defineProperty(exports, "normalizeIntentContent", { enumerable: true, get: function () { return intent_privacy_1.normalizeIntentContent; } });
Object.defineProperty(exports, "sanitizeLocalPrivateText", { enumerable: true, get: function () { return intent_privacy_1.sanitizeLocalPrivateText; } });
Object.defineProperty(exports, "sanitizeRepoRelativePath", { enumerable: true, get: function () { return intent_privacy_1.sanitizeRepoRelativePath; } });
Object.defineProperty(exports, "validatePrivacySafeCloudPayload", { enumerable: true, get: function () { return intent_privacy_1.validatePrivacySafeCloudPayload; } });
// V0: Repo Governance Profile
var profile_1 = require("./profile");
Object.defineProperty(exports, "buildRepoGovernanceProfile", { enumerable: true, get: function () { return profile_1.buildRepoGovernanceProfile; } });
Object.defineProperty(exports, "checkFileBoundary", { enumerable: true, get: function () { return profile_1.checkFileBoundary; } });
Object.defineProperty(exports, "DEFAULT_PLAN_COHERENCE_MODE", { enumerable: true, get: function () { return profile_1.DEFAULT_PLAN_COHERENCE_MODE; } });
Object.defineProperty(exports, "DEFAULT_RUNTIME_LOCAL_MODE", { enumerable: true, get: function () { return profile_1.DEFAULT_RUNTIME_LOCAL_MODE; } });
Object.defineProperty(exports, "ownersForPath", { enumerable: true, get: function () { return profile_1.ownersForPath; } });
var repository_topology_1 = require("./repository-topology");
Object.defineProperty(exports, "REPOSITORY_TOPOLOGY_SCHEMA_VERSION", { enumerable: true, get: function () { return repository_topology_1.REPOSITORY_TOPOLOGY_SCHEMA_VERSION; } });
Object.defineProperty(exports, "compileRepositoryTopology", { enumerable: true, get: function () { return repository_topology_1.compileRepositoryTopology; } });
Object.defineProperty(exports, "topologyFacts", { enumerable: true, get: function () { return repository_topology_1.topologyFacts; } });
Object.defineProperty(exports, "topologyGlobsForIntent", { enumerable: true, get: function () { return repository_topology_1.topologyGlobsForIntent; } });
Object.defineProperty(exports, "topologyHasPath", { enumerable: true, get: function () { return repository_topology_1.topologyHasPath; } });
Object.defineProperty(exports, "topologyPackageRootsForPaths", { enumerable: true, get: function () { return repository_topology_1.topologyPackageRootsForPaths; } });
Object.defineProperty(exports, "topologySupportGlobs", { enumerable: true, get: function () { return repository_topology_1.topologySupportGlobs; } });
// V0: Session store
var session_1 = require("./session");
Object.defineProperty(exports, "createSession", { enumerable: true, get: function () { return session_1.createSession; } });
Object.defineProperty(exports, "loadActiveSession", { enumerable: true, get: function () { return session_1.loadActiveSession; } });
Object.defineProperty(exports, "loadSession", { enumerable: true, get: function () { return session_1.loadSession; } });
Object.defineProperty(exports, "appendEvent", { enumerable: true, get: function () { return session_1.appendEvent; } });
Object.defineProperty(exports, "approveSession", { enumerable: true, get: function () { return session_1.approveSession; } });
Object.defineProperty(exports, "revokeSessionApproval", { enumerable: true, get: function () { return session_1.revokeSessionApproval; } });
Object.defineProperty(exports, "activeApprovalPaths", { enumerable: true, get: function () { return session_1.activeApprovalPaths; } });
Object.defineProperty(exports, "expireSessionApprovals", { enumerable: true, get: function () { return session_1.expireSessionApprovals; } });
Object.defineProperty(exports, "expireArchitectureObligationWaivers", { enumerable: true, get: function () { return session_1.expireArchitectureObligationWaivers; } });
Object.defineProperty(exports, "waiveArchitectureObligation", { enumerable: true, get: function () { return session_1.waiveArchitectureObligation; } });
Object.defineProperty(exports, "refreshArchitectureObligations", { enumerable: true, get: function () { return session_1.refreshArchitectureObligations; } });
Object.defineProperty(exports, "evaluateIntentCoherence", { enumerable: true, get: function () { return session_1.evaluateIntentCoherence; } });
Object.defineProperty(exports, "evaluatePlanCoherencePolicy", { enumerable: true, get: function () { return session_1.evaluatePlanCoherencePolicy; } });
Object.defineProperty(exports, "attachAgentPlan", { enumerable: true, get: function () { return session_1.attachAgentPlan; } });
Object.defineProperty(exports, "captureAgentPlan", { enumerable: true, get: function () { return session_1.captureAgentPlan; } });
Object.defineProperty(exports, "amendAgentPlan", { enumerable: true, get: function () { return session_1.amendAgentPlan; } });
Object.defineProperty(exports, "decideAgentPlanAmendment", { enumerable: true, get: function () { return session_1.decideAgentPlanAmendment; } });
Object.defineProperty(exports, "classifyAgentPlanAmendment", { enumerable: true, get: function () { return session_1.classifyAgentPlanAmendment; } });
Object.defineProperty(exports, "evaluateSessionPlanCoherence", { enumerable: true, get: function () { return session_1.evaluateSessionPlanCoherence; } });
Object.defineProperty(exports, "activeAgentPlanRevision", { enumerable: true, get: function () { return session_1.activeAgentPlanRevision; } });
Object.defineProperty(exports, "buildPlanTimeline", { enumerable: true, get: function () { return session_1.buildPlanTimeline; } });
Object.defineProperty(exports, "finishSession", { enumerable: true, get: function () { return session_1.finishSession; } });
Object.defineProperty(exports, "replaySession", { enumerable: true, get: function () { return session_1.replaySession; } });
Object.defineProperty(exports, "sessionsDir", { enumerable: true, get: function () { return session_1.sessionsDir; } });
Object.defineProperty(exports, "sessionPath", { enumerable: true, get: function () { return session_1.sessionPath; } });
var ai_change_record_1 = require("./ai-change-record");
Object.defineProperty(exports, "AI_CHANGE_RECORD_SCHEMA_VERSION", { enumerable: true, get: function () { return ai_change_record_1.AI_CHANGE_RECORD_SCHEMA_VERSION; } });
Object.defineProperty(exports, "AI_CHANGE_RECORD_TYPE", { enumerable: true, get: function () { return ai_change_record_1.AI_CHANGE_RECORD_TYPE; } });
Object.defineProperty(exports, "AI_CHANGE_RECORD_RECEIPT_SCHEMA_VERSION", { enumerable: true, get: function () { return ai_change_record_1.AI_CHANGE_RECORD_RECEIPT_SCHEMA_VERSION; } });
Object.defineProperty(exports, "AI_CHANGE_RECORD_SIGNING_VERSION", { enumerable: true, get: function () { return ai_change_record_1.AI_CHANGE_RECORD_SIGNING_VERSION; } });
Object.defineProperty(exports, "aiChangeRecordPath", { enumerable: true, get: function () { return ai_change_record_1.aiChangeRecordPath; } });
Object.defineProperty(exports, "assertSourceFreeAIChangeRecordPayload", { enumerable: true, get: function () { return ai_change_record_1.assertSourceFreeAIChangeRecordPayload; } });
Object.defineProperty(exports, "buildAIChangeRecord", { enumerable: true, get: function () { return ai_change_record_1.buildAIChangeRecord; } });
Object.defineProperty(exports, "buildAIChangeRecordReceipt", { enumerable: true, get: function () { return ai_change_record_1.buildAIChangeRecordReceipt; } });
Object.defineProperty(exports, "canonicalAIChangeRecordHash", { enumerable: true, get: function () { return ai_change_record_1.canonicalAIChangeRecordHash; } });
Object.defineProperty(exports, "stableHash", { enumerable: true, get: function () { return ai_change_record_1.stableHash; } });
Object.defineProperty(exports, "stableStringify", { enumerable: true, get: function () { return ai_change_record_1.stableStringify; } });
Object.defineProperty(exports, "verifyAIChangeRecordReceipt", { enumerable: true, get: function () { return ai_change_record_1.verifyAIChangeRecordReceipt; } });
Object.defineProperty(exports, "writeAIChangeRecord", { enumerable: true, get: function () { return ai_change_record_1.writeAIChangeRecord; } });
var agent_invocation_observability_1 = require("./agent-invocation-observability");
Object.defineProperty(exports, "AGENT_INVOCATION_OBSERVABILITY_SCHEMA_VERSION", { enumerable: true, get: function () { return agent_invocation_observability_1.AGENT_INVOCATION_OBSERVABILITY_SCHEMA_VERSION; } });
Object.defineProperty(exports, "buildAgentInvocationSummary", { enumerable: true, get: function () { return agent_invocation_observability_1.buildAgentInvocationSummary; } });
var agent_guard_posture_1 = require("./agent-guard-posture");
Object.defineProperty(exports, "AGENT_GUARD_POSTURE_SCHEMA_VERSION", { enumerable: true, get: function () { return agent_guard_posture_1.AGENT_GUARD_POSTURE_SCHEMA_VERSION; } });
Object.defineProperty(exports, "buildAgentGuardPostureSummary", { enumerable: true, get: function () { return agent_guard_posture_1.buildAgentGuardPostureSummary; } });
var architecture_obligations_1 = require("./architecture-obligations");
Object.defineProperty(exports, "ARCHITECTURE_OBLIGATION_SCHEMA_VERSION", { enumerable: true, get: function () { return architecture_obligations_1.ARCHITECTURE_OBLIGATION_SCHEMA_VERSION; } });
Object.defineProperty(exports, "DEFAULT_ARCHITECTURE_OBLIGATION_POLICY", { enumerable: true, get: function () { return architecture_obligations_1.DEFAULT_ARCHITECTURE_OBLIGATION_POLICY; } });
Object.defineProperty(exports, "activeArchitectureObligationWaivers", { enumerable: true, get: function () { return architecture_obligations_1.activeArchitectureObligationWaivers; } });
Object.defineProperty(exports, "deriveArchitectureObligations", { enumerable: true, get: function () { return architecture_obligations_1.deriveArchitectureObligations; } });
Object.defineProperty(exports, "effectiveArchitectureObligationMode", { enumerable: true, get: function () { return architecture_obligations_1.effectiveArchitectureObligationMode; } });
Object.defineProperty(exports, "evaluateArchitectureObligationFeedback", { enumerable: true, get: function () { return architecture_obligations_1.evaluateArchitectureObligationFeedback; } });
Object.defineProperty(exports, "planDeclaredApprovalRequiredPaths", { enumerable: true, get: function () { return architecture_obligations_1.planDeclaredApprovalRequiredPaths; } });
Object.defineProperty(exports, "evaluateArchitectureEdit", { enumerable: true, get: function () { return architecture_obligations_1.evaluateArchitectureEdit; } });
Object.defineProperty(exports, "isArchitectureObligationWaiverActive", { enumerable: true, get: function () { return architecture_obligations_1.isArchitectureObligationWaiverActive; } });
Object.defineProperty(exports, "normalizeArchitectureObligationPolicy", { enumerable: true, get: function () { return architecture_obligations_1.normalizeArchitectureObligationPolicy; } });
Object.defineProperty(exports, "summarizeArchitectureObligations", { enumerable: true, get: function () { return architecture_obligations_1.summarizeArchitectureObligations; } });
// V2: Repository Architecture Graph (module boundaries + dependency edges)
var architecture_graph_1 = require("./architecture-graph");
Object.defineProperty(exports, "ARCHITECTURE_GRAPH_SCHEMA_VERSION", { enumerable: true, get: function () { return architecture_graph_1.ARCHITECTURE_GRAPH_SCHEMA_VERSION; } });
Object.defineProperty(exports, "buildArchitectureGraph", { enumerable: true, get: function () { return architecture_graph_1.buildArchitectureGraph; } });
Object.defineProperty(exports, "dependenciesOf", { enumerable: true, get: function () { return architecture_graph_1.dependenciesOf; } });
Object.defineProperty(exports, "dependentsOf", { enumerable: true, get: function () { return architecture_graph_1.dependentsOf; } });
Object.defineProperty(exports, "deriveGraphObligationSeeds", { enumerable: true, get: function () { return architecture_graph_1.deriveGraphObligationSeeds; } });
Object.defineProperty(exports, "extractImportSpecifiers", { enumerable: true, get: function () { return architecture_graph_1.extractImportSpecifiers; } });
Object.defineProperty(exports, "findModuleForPath", { enumerable: true, get: function () { return architecture_graph_1.findModuleForPath; } });
Object.defineProperty(exports, "isModuleTestSatisfiable", { enumerable: true, get: function () { return architecture_graph_1.isModuleTestSatisfiable; } });
Object.defineProperty(exports, "moduleIdForPath", { enumerable: true, get: function () { return architecture_graph_1.moduleIdForPath; } });
Object.defineProperty(exports, "modulesInPlay", { enumerable: true, get: function () { return architecture_graph_1.modulesInPlay; } });
Object.defineProperty(exports, "resolveImportSpecifier", { enumerable: true, get: function () { return architecture_graph_1.resolveImportSpecifier; } });
var constraints_1 = require("./constraints");
Object.defineProperty(exports, "compileDeterministicConstraints", { enumerable: true, get: function () { return constraints_1.compileDeterministicConstraints; } });
// Runtime Admission — pure provenance core (Phase A)
var admission_provenance_1 = require("./admission-provenance");
Object.defineProperty(exports, "buildCoverageManifest", { enumerable: true, get: function () { return admission_provenance_1.buildCoverageManifest; } });
Object.defineProperty(exports, "computeCoverageSetHash", { enumerable: true, get: function () { return admission_provenance_1.computeCoverageSetHash; } });
Object.defineProperty(exports, "computeDeltaHash", { enumerable: true, get: function () { return admission_provenance_1.computeDeltaHash; } });
Object.defineProperty(exports, "deriveCoverageEntries", { enumerable: true, get: function () { return admission_provenance_1.deriveCoverageEntries; } });
Object.defineProperty(exports, "normalizeDeltaEntries", { enumerable: true, get: function () { return admission_provenance_1.normalizeDeltaEntries; } });
Object.defineProperty(exports, "readSelfAttestedAdmissionRecord", { enumerable: true, get: function () { return admission_provenance_1.readSelfAttestedAdmissionRecord; } });
Object.defineProperty(exports, "readSelfAttestedAdmissionRecordFromText", { enumerable: true, get: function () { return admission_provenance_1.readSelfAttestedAdmissionRecordFromText; } });
Object.defineProperty(exports, "sortCoverageEntries", { enumerable: true, get: function () { return admission_provenance_1.sortCoverageEntries; } });
Object.defineProperty(exports, "sortDeltaEntries", { enumerable: true, get: function () { return admission_provenance_1.sortDeltaEntries; } });
Object.defineProperty(exports, "unionCoverageEntries", { enumerable: true, get: function () { return admission_provenance_1.unionCoverageEntries; } });
Object.defineProperty(exports, "unionCoverageManifests", { enumerable: true, get: function () { return admission_provenance_1.unionCoverageManifests; } });
Object.defineProperty(exports, "validateSelfAttestedRecordConsistency", { enumerable: true, get: function () { return admission_provenance_1.validateSelfAttestedRecordConsistency; } });
// V1: Agent Plan Capture (source-free model of the agent's stated plan)
var agent_plan_1 = require("./agent-plan");
Object.defineProperty(exports, "AGENT_PLAN_SCHEMA_VERSION", { enumerable: true, get: function () { return agent_plan_1.AGENT_PLAN_SCHEMA_VERSION; } });
Object.defineProperty(exports, "extractAgentPlan", { enumerable: true, get: function () { return agent_plan_1.extractAgentPlan; } });
Object.defineProperty(exports, "extractExpectedTargetsFromText", { enumerable: true, get: function () { return agent_plan_1.extractExpectedTargetsFromText; } });
Object.defineProperty(exports, "parsePlanSteps", { enumerable: true, get: function () { return agent_plan_1.parsePlanSteps; } });
Object.defineProperty(exports, "evaluatePlanCoherence", { enumerable: true, get: function () { return agent_plan_1.evaluatePlanCoherence; } });
Object.defineProperty(exports, "planImpliesSupportWork", { enumerable: true, get: function () { return agent_plan_1.planImpliesSupportWork; } });
Object.defineProperty(exports, "isTestOrUtilityPath", { enumerable: true, get: function () { return agent_plan_1.isTestOrUtilityPath; } });
Object.defineProperty(exports, "sanitizeAgentPlan", { enumerable: true, get: function () { return agent_plan_1.sanitizeAgentPlan; } });
Object.defineProperty(exports, "sanitizePlanCoherence", { enumerable: true, get: function () { return agent_plan_1.sanitizePlanCoherence; } });
// V1: Agent Runtime Adapter Layer (hooks / MCP / IDE / future agents)
var agent_runtime_adapter_1 = require("./agent-runtime-adapter");
Object.defineProperty(exports, "AGENT_RUNTIME_ADAPTER_SCHEMA_VERSION", { enumerable: true, get: function () { return agent_runtime_adapter_1.AGENT_RUNTIME_ADAPTER_SCHEMA_VERSION; } });
Object.defineProperty(exports, "AGENT_RUNTIME_DECISION_SCHEMA_VERSION", { enumerable: true, get: function () { return agent_runtime_adapter_1.AGENT_RUNTIME_DECISION_SCHEMA_VERSION; } });
Object.defineProperty(exports, "getAgentRuntimeAdapterCapability", { enumerable: true, get: function () { return agent_runtime_adapter_1.getAgentRuntimeAdapterCapability; } });
Object.defineProperty(exports, "listAgentRuntimeAdapterCapabilities", { enumerable: true, get: function () { return agent_runtime_adapter_1.listAgentRuntimeAdapterCapabilities; } });
Object.defineProperty(exports, "normalizeAgentRuntimeEvent", { enumerable: true, get: function () { return agent_runtime_adapter_1.normalizeAgentRuntimeEvent; } });
const constraints_2 = require("./constraints");
function normalizeRepoPath(pathValue) {
    return pathValue.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function extractPlannedFilePaths(planFiles) {
    const plannedFilePaths = new Set();
    for (const file of planFiles) {
        const normalizedPath = normalizeRepoPath(file.path);
        if (!normalizedPath) {
            continue;
        }
        if (file.action === 'MODIFY' || file.action === 'CREATE') {
            plannedFilePaths.add(normalizedPath);
        }
    }
    return Array.from(plannedFilePaths);
}
function detectConstraintViolations(intentConstraints, policyRules, extraConstraintRules, changedFiles, fileContents) {
    const compiled = (0, constraints_2.compileDeterministicConstraints)({
        intentConstraints,
        policyRules,
    });
    const rules = [
        ...compiled.rules,
        ...(extraConstraintRules || []),
    ];
    if (rules.length === 0) {
        return [];
    }
    const violations = [];
    const seenViolations = new Set();
    const normalizedFileContents = {};
    for (const [path, content] of Object.entries(fileContents || {})) {
        normalizedFileContents[normalizeRepoPath(path)] = content;
    }
    const pathMatchesRule = (rule, filePath) => {
        const include = rule.pathIncludes || [];
        const exclude = rule.pathExcludes || [];
        if (include.length > 0 && !include.some((pattern) => pattern.test(filePath))) {
            return false;
        }
        if (exclude.length > 0 && exclude.some((pattern) => pattern.test(filePath))) {
            return false;
        }
        return true;
    };
    const countMatches = (pattern, input) => {
        if (!input)
            return 0;
        const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
        const re = new RegExp(pattern.source, flags);
        let total = 0;
        for (const _match of input.matchAll(re)) {
            total += 1;
        }
        return total;
    };
    const addedLinesByPath = new Map();
    for (const file of changedFiles) {
        const addedLines = (file.hunks || []).flatMap((hunk) => hunk.lines
            .filter((line) => line.type === 'added')
            .map((line) => line.content));
        addedLinesByPath.set(file.path, addedLines.join('\n'));
    }
    const candidateRepoPaths = new Set([
        ...changedFiles.map((file) => file.path),
        ...Object.keys(normalizedFileContents),
    ]);
    for (const rule of rules) {
        if (rule.evaluationMode === 'signature_delta') {
            for (const file of changedFiles) {
                if (!pathMatchesRule(rule, file.path)) {
                    continue;
                }
                const addedSignatureLines = (file.hunks || []).flatMap((hunk) => hunk.lines
                    .filter((line) => line.type === 'added' && new RegExp(rule.pattern.source, rule.pattern.flags).test(line.content))
                    .map((line) => line.content));
                const removedSignatureLines = (file.hunks || []).flatMap((hunk) => hunk.lines
                    .filter((line) => line.type === 'removed' && new RegExp(rule.pattern.source, rule.pattern.flags).test(line.content))
                    .map((line) => line.content));
                const deltaCount = addedSignatureLines.length + removedSignatureLines.length;
                if (deltaCount === 0) {
                    continue;
                }
                const violation = `Exported API signature delta detected in ${file.path} ` +
                    `(added ${addedSignatureLines.length}, removed ${removedSignatureLines.length}, violates constraint: "${rule.displayName}")`;
                if (!seenViolations.has(violation)) {
                    seenViolations.add(violation);
                    violations.push(violation);
                }
            }
            continue;
        }
        const hasMatchBounds = (typeof rule.maxMatchesPerFile === 'number' && Number.isFinite(rule.maxMatchesPerFile))
            || (typeof rule.minMatchesPerFile === 'number' && Number.isFinite(rule.minMatchesPerFile));
        if (rule.evaluationScope === 'repo' && hasMatchBounds) {
            let repoMatchCount = 0;
            let scannedPaths = 0;
            for (const filePath of candidateRepoPaths) {
                if (!pathMatchesRule(rule, filePath)) {
                    continue;
                }
                const fullContent = normalizedFileContents[filePath];
                const addedFallback = addedLinesByPath.get(filePath) || '';
                const haystack = rule.evaluationMode === 'full_file' && typeof fullContent === 'string'
                    ? fullContent
                    : addedFallback;
                if (!haystack) {
                    continue;
                }
                scannedPaths += 1;
                repoMatchCount += countMatches(rule.pattern, haystack);
            }
            if (typeof rule.maxMatchesPerFile === 'number'
                && Number.isFinite(rule.maxMatchesPerFile)
                && repoMatchCount > rule.maxMatchesPerFile) {
                const violation = `${rule.matchToken} matched ${repoMatchCount} times across repository scope ` +
                    `(limit ${rule.maxMatchesPerFile}, scanned ${scannedPaths} file(s), violates constraint: "${rule.displayName}")`;
                if (!seenViolations.has(violation)) {
                    seenViolations.add(violation);
                    violations.push(violation);
                }
            }
            if (typeof rule.minMatchesPerFile === 'number'
                && Number.isFinite(rule.minMatchesPerFile)
                && repoMatchCount < rule.minMatchesPerFile) {
                const violation = `${rule.matchToken} matched ${repoMatchCount} times across repository scope ` +
                    `(minimum ${rule.minMatchesPerFile}, scanned ${scannedPaths} file(s), violates constraint: "${rule.displayName}")`;
                if (!seenViolations.has(violation)) {
                    seenViolations.add(violation);
                    violations.push(violation);
                }
            }
            continue;
        }
        for (const file of changedFiles) {
            if (!pathMatchesRule(rule, file.path)) {
                continue;
            }
            if (!file.hunks || file.hunks.length === 0) {
                continue;
            }
            const addedLines = addedLinesByPath.get(file.path) || '';
            if (hasMatchBounds) {
                const fullContent = normalizedFileContents[file.path];
                const haystack = rule.evaluationMode === 'full_file' && typeof fullContent === 'string'
                    ? fullContent
                    : addedLines;
                const matchCount = countMatches(rule.pattern, haystack);
                if (typeof rule.maxMatchesPerFile === 'number'
                    && Number.isFinite(rule.maxMatchesPerFile)
                    && matchCount > rule.maxMatchesPerFile) {
                    const violation = `${rule.matchToken} matched ${matchCount} times in ${file.path} ` +
                        `(limit ${rule.maxMatchesPerFile}, violates constraint: "${rule.displayName}")`;
                    if (!seenViolations.has(violation)) {
                        seenViolations.add(violation);
                        violations.push(violation);
                    }
                }
                if (typeof rule.minMatchesPerFile === 'number'
                    && Number.isFinite(rule.minMatchesPerFile)
                    && matchCount < rule.minMatchesPerFile) {
                    const violation = `${rule.matchToken} matched ${matchCount} times in ${file.path} ` +
                        `(minimum ${rule.minMatchesPerFile}, violates constraint: "${rule.displayName}")`;
                    if (!seenViolations.has(violation)) {
                        seenViolations.add(violation);
                        violations.push(violation);
                    }
                }
                continue;
            }
            for (const hunk of file.hunks) {
                for (const line of hunk.lines) {
                    if (line.type !== 'added') {
                        continue;
                    }
                    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
                    if (!pattern.test(line.content)) {
                        continue;
                    }
                    const violation = `${rule.matchToken} found in ${file.path} (violates constraint: \"${rule.displayName}\")`;
                    if (seenViolations.has(violation)) {
                        continue;
                    }
                    seenViolations.add(violation);
                    violations.push(violation);
                }
            }
        }
    }
    return violations;
}
function resolvePlanVerdict(input) {
    if (input.constraintViolations.length > 0) {
        return 'FAIL';
    }
    if (input.totalPlannedFiles === 0 && input.plannedFilesModified === 0) {
        // 0/0 is treated as incomplete, not perfect adherence.
        return 'FAIL';
    }
    if (input.bloatCount > 0 && input.adherenceScore < 50) {
        return 'FAIL';
    }
    if (input.bloatCount > 0 || input.adherenceScore < 80) {
        return 'WARN';
    }
    return 'PASS';
}
function buildPlanVerificationMessage(result) {
    if (result.constraintViolations.length > 0) {
        return `❌ Constraint violation: ${result.constraintViolations[0]}${result.constraintViolations.length > 1 ? ` (+${result.constraintViolations.length - 1} more)` : ''}`;
    }
    if (result.totalPlannedFiles === 0 && result.plannedFilesModified === 0) {
        return '❌ Incomplete: No planned files to verify (0/0). Plan may be malformed.';
    }
    if (result.verdict === 'PASS') {
        return `✅ Plan adherence: ${result.adherenceScore}% (${result.plannedFilesModified}/${result.totalPlannedFiles} planned files modified)`;
    }
    if (result.verdict === 'WARN') {
        return `⚠️  Plan adherence: ${result.adherenceScore}% (${result.plannedFilesModified}/${result.totalPlannedFiles} planned files modified)${result.bloatCount > 0 ? `, ${result.bloatCount} unexpected file(s) changed` : ''}`;
    }
    return `❌ Plan adherence: ${result.adherenceScore}% (${result.plannedFilesModified}/${result.totalPlannedFiles} planned files modified), ${result.bloatCount} unexpected file(s) changed`;
}
function evaluatePlanVerification(input) {
    const plannedFilePaths = extractPlannedFilePaths(input.planFiles);
    const plannedSet = new Set(plannedFilePaths);
    const normalizedChangedFiles = input.changedFiles.map((file) => ({
        ...file,
        path: normalizeRepoPath(file.path),
        oldPath: file.oldPath ? normalizeRepoPath(file.oldPath) : undefined,
        hunks: file.hunks || [],
    }));
    const changedFilePaths = Array.from(new Set(normalizedChangedFiles
        .map((file) => file.path)
        .filter(Boolean)));
    const changedSet = new Set(changedFilePaths);
    const bloatFiles = changedFilePaths.filter((pathValue) => !plannedSet.has(pathValue));
    const bloatCount = bloatFiles.length;
    const totalPlannedFiles = plannedSet.size;
    const plannedFilesModified = plannedFilePaths.filter((pathValue) => changedSet.has(pathValue)).length;
    const adherenceScore = totalPlannedFiles > 0
        ? Math.round((plannedFilesModified / totalPlannedFiles) * 100)
        : 0;
    const constraintViolations = detectConstraintViolations(input.intentConstraints, input.policyRules, input.extraConstraintRules, normalizedChangedFiles, input.fileContents);
    const verdict = resolvePlanVerdict({
        bloatCount,
        adherenceScore,
        totalPlannedFiles,
        plannedFilesModified,
        constraintViolations,
    });
    const totalAdded = input.diffStats
        ? input.diffStats.totalAdded
        : normalizedChangedFiles.reduce((sum, file) => sum + file.added, 0);
    const totalRemoved = input.diffStats
        ? input.diffStats.totalRemoved
        : normalizedChangedFiles.reduce((sum, file) => sum + file.removed, 0);
    const diffSummary = {
        added: totalAdded,
        removed: totalRemoved,
        files: normalizedChangedFiles.map((file) => ({
            path: file.path,
            oldPath: file.oldPath,
            changeType: file.changeType,
            added: file.added,
            removed: file.removed,
            hunks: file.hunks || [],
        })),
        bloatFiles,
        plannedFilesModified,
        totalPlannedFiles,
    };
    const message = buildPlanVerificationMessage({
        constraintViolations,
        totalPlannedFiles,
        plannedFilesModified,
        verdict,
        adherenceScore,
        bloatCount,
    });
    return {
        adherenceScore,
        bloatCount,
        bloatFiles,
        plannedFilesModified,
        totalPlannedFiles,
        scopeGuardPassed: bloatCount === 0,
        constraintViolations,
        verdict,
        diffSummary,
        message,
    };
}
//# sourceMappingURL=index.js.map