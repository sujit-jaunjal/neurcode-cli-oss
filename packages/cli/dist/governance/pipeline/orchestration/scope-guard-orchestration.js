"use strict";
/**
 * Scope-Guard + Governance Evaluation Orchestration
 * --------------------------------------------------
 * Extracts the plan-resolution / governance-evaluation / scope-guard compute
 * region previously inlined at `commands/verify.ts:4238–4376`.
 *
 * RESPONSIBILITIES (data-pure):
 *   - resolve plan scope (local Plan Sync vs remote plan fetch)
 *   - run the intent-aware engine
 *   - run structural analysis (via the existing plan-structural-analysis module)
 *   - call evaluateGovernance
 *   - resolve session ID and fetch allowed files
 *   - compute the approved-set intersection and filtered violations
 *
 * EXPLICITLY NOT RESPONSIBLE FOR:
 *   - rendering scope violations (chalk output, emitVerifyJson, exitWithEvidence)
 *   - `scopeGuardPassed` flag lifecycle (caller owns that)
 *   - catch-block error logging (caller owns the surrounding try/catch)
 *
 * SEMANTIC PRESERVATION:
 *   The computation sequence, fault-swallowing behaviour (intent engine, session
 *   fetch), and intersection logic are byte-identical to the prior inline region.
 *
 * REPLAY INVARIANT:
 *   - evaluateGovernance call params are identical to lines 4317-4330
 *   - runPlanStructuralAnalysis call is identical to lines 4312-4315
 *   - runIntentEngine call is identical to lines 4293-4302
 *   - getSessionId() fallback chain is identical to lines 4335-4342
 *   - allowedFiles resolution is identical to lines 4352-4371
 *   - approvedSet intersection is identical to lines 4373-4376
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runScopeGuardOrchestration = runScopeGuardOrchestration;
const governance_1 = require("../../../utils/governance");
const intent_engine_1 = require("../../../intent-engine");
const state_1 = require("../../../utils/state");
const plan_structural_analysis_1 = require("./plan-structural-analysis");
/**
 * Compute the scope-guard orchestration result. Replaces the inline compute
 * region at verify.ts:4239–4376.
 *
 * Does not emit JSON, does not log, does not exit.
 */
async function runScopeGuardOrchestration(input) {
    const { useLocalPlanSync, localPlanSync, localPlanExpectedFiles, finalPlanId, client, diffFiles, projectRoot, configData, signing, orgGovernanceSettings, shouldIgnore, } = input;
    // ── Step A: Modified files ────────────────────────────────────────────────
    const modifiedFiles = diffFiles.map(f => f.path);
    // ── Step B: Resolve plan scope ────────────────────────────────────────────
    let originalIntent = '';
    let governanceTask = 'Plan verification';
    let planFiles = [];
    let planDependencies = [];
    let remotePlanSessionId = null;
    let planSyncUsed = false;
    if (useLocalPlanSync) {
        const localIntent = (localPlanSync.intent || '').trim();
        const localConstraintText = localPlanSync.constraints.length > 0 ? localPlanSync.constraints.join('; ') : '';
        planFiles = [...localPlanExpectedFiles];
        originalIntent = localIntent || localConstraintText;
        governanceTask = localIntent
            ? `Local Plan Sync: ${localIntent}`
            : 'Local Plan Sync verification';
        planSyncUsed = true;
    }
    else {
        const planData = await client.getPlan(finalPlanId);
        originalIntent = planData.intent || '';
        const planTitle = typeof planData.content.title === 'string'
            ? planData.content.title?.trim()
            : '';
        const planSummary = typeof planData.content.summary === 'string' ? planData.content.summary.trim() : '';
        governanceTask = planTitle || planSummary || originalIntent || 'Plan verification';
        planFiles = planData.content.files
            .filter((f) => f.action === 'CREATE' || f.action === 'MODIFY')
            .map((f) => f.path);
        planDependencies = Array.isArray(planData.content.dependencies)
            ? planData.content.dependencies.filter((item) => typeof item === 'string')
            : [];
        remotePlanSessionId = planData.sessionId || null;
    }
    const planFilesForVerification = [...new Set([...planFiles, ...localPlanExpectedFiles])];
    const intentConstraintsForVerification = originalIntent || undefined;
    // ── Intent-Aware Engine ───────────────────────────────────────────────────
    let intentEngineIssues = [];
    let intentEngineDomains = [];
    let intentEngineSummary = null;
    let intentEngineFlowIssues = [];
    let intentEngineRegressions = [];
    if (intentConstraintsForVerification && diffFiles.length > 0) {
        try {
            const engineResult = (0, intent_engine_1.runIntentEngine)(intentConstraintsForVerification, diffFiles, projectRoot);
            intentEngineIssues = engineResult.intentIssues;
            intentEngineDomains = engineResult.checkedDomains;
            intentEngineSummary = engineResult.intentSummary;
            intentEngineFlowIssues = engineResult.flowIssues;
            intentEngineRegressions = engineResult.regressions;
        }
        catch {
            // Non-fatal: intent engine errors must never break verification
        }
    }
    // ── Structural Rule Engine (plan-mode) ────────────────────────────────────
    const planStructural = (0, plan_structural_analysis_1.runPlanStructuralAnalysis)({ projectRoot, diffFiles });
    // ── Governance Evaluation ─────────────────────────────────────────────────
    const governanceResult = (0, governance_1.evaluateGovernance)({
        projectRoot,
        task: governanceTask,
        expectedFiles: planFilesForVerification,
        expectedDependencies: planDependencies,
        diffFiles,
        contextCandidates: planFilesForVerification,
        orgGovernance: orgGovernanceSettings,
        requireSignedAiLogs: signing.signedLogsRequired,
        // Normalise null → undefined to match evaluateGovernance's optional params.
        signingKey: signing.signingKey ?? undefined,
        signingKeyId: signing.signingKeyId ?? undefined,
        signingKeys: signing.signingKeys,
        signer: signing.signer,
    });
    // ── Session ID Resolution ─────────────────────────────────────────────────
    // Priority: state file → config.sessionId → config.lastSessionId → plan sessionId
    // Use explicit if/else chain to keep TypeScript narrowing clear.
    let sessionIdString = (0, state_1.getSessionId)();
    if (!sessionIdString) {
        if (typeof configData.sessionId === 'string') {
            sessionIdString = configData.sessionId;
        }
        else if (typeof configData.lastSessionId === 'string') {
            sessionIdString = configData.lastSessionId;
        }
    }
    if (!sessionIdString && remotePlanSessionId) {
        sessionIdString = remotePlanSessionId;
    }
    // ── Allowed Files (from session) ──────────────────────────────────────────
    let allowedFiles = [];
    let sessionResolutionNote = null;
    if (sessionIdString) {
        try {
            const sessionData = await client.getSession(sessionIdString);
            allowedFiles = sessionData.session.allowedFiles || [];
        }
        catch {
            // Non-fatal: session fetch failure means scope-guard uses plan files only
            sessionResolutionNote = 'session_not_available';
        }
    }
    else {
        sessionResolutionNote = 'no_session_id';
    }
    // ── Step C: Intersection Logic ────────────────────────────────────────────
    const approvedSet = new Set([...planFilesForVerification, ...allowedFiles]);
    const violations = modifiedFiles.filter(f => !approvedSet.has(f));
    const filteredViolations = violations.filter((p) => !shouldIgnore(p));
    return {
        // Plan scope
        planFilesForVerification,
        planDependencies,
        intentConstraintsForVerification,
        governanceTask,
        remotePlanSessionId,
        // Intent engine
        intentEngineIssues,
        intentEngineDomains,
        intentEngineSummary,
        intentEngineFlowIssues,
        intentEngineRegressions,
        // Structural
        structuralViolations: planStructural.violations,
        structuralRulesApplied: planStructural.rulesApplied,
        structuralSuppressedCount: planStructural.suppressedCount,
        // Governance
        governanceResult,
        // Scope guard
        modifiedFiles,
        allowedFiles,
        approvedSet,
        violations,
        filteredViolations,
        sessionIdString,
        // UI hints
        planSyncUsed,
        planSyncFileCount: planFiles.length,
        sessionResolutionNote,
    };
}
//# sourceMappingURL=scope-guard-orchestration.js.map