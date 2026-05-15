"use strict";
/**
 * Advisory-Mode Orchestration
 * ---------------------------
 * Extracts the no-plan / advisory-first branch previously inlined at
 * `commands/verify.ts:4161–4321`.
 *
 * RESPONSIBILITIES (data-pure):
 *   - resolve auto-contract path when no change-contract is present
 *   - evaluate advisory signals (with runtime-pressure gating)
 *   - run structural rules (via the existing structural-analysis stage)
 *   - compute verdict / grade / score
 *   - assemble the advisory canonical payload
 *
 * EXPLICITLY NOT RESPONSIBLE FOR:
 *   - human-readable rendering (caller owns chalk + printFirstRunAdvisoryMessage)
 *   - emitting verify JSON (caller owns emitVerifyJson + emitCanonicalVerifyJson)
 *   - recording telemetry verdict (caller owns recordVerifyEvent)
 *   - calling exitWithEvidence (caller owns process termination)
 *
 * SEMANTIC PRESERVATION:
 *   The output `payload` is byte-equivalent to the prior inline literal at
 *   line ~4276 (the `emitVerifyJson({...})` call). Field order matches the
 *   inline implementation so JSON serialization is identical.
 *
 * REPLAY INVARIANT:
 *   - structural-analysis stage call is identical to the prior wire-in
 *   - advisory signals evaluation is identical to the prior call
 *   - structural-engine fault swallowing is preserved (try/swallow in compute)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAdvisoryMode = runAdvisoryMode;
const change_contract_1 = require("../../../utils/change-contract");
const advisory_signals_1 = require("../../../utils/advisory-signals");
const verify_runtime_stability_1 = require("../../../utils/verify-runtime-stability");
const advisory_mode_contract_1 = require("./advisory-mode-contract");
const helpers_1 = require("../helpers");
const stages_1 = require("../stages");
const structural_on_diff_1 = require("../../structural-on-diff");
const ADVISORY_MESSAGE = 'No plan linked yet. Ran advisory verification for quick first-run experience. ' +
    'Use `neurcode plan` and `neurcode contract import --auto-detect --write-change-contract` for full enforcement.';
/**
 * Compute the advisory-mode result. Replaces the inline compute region.
 *
 * Does not emit JSON, does not log, does not exit.
 */
async function runAdvisoryMode(input) {
    const { options, projectRoot, diffFiles, summary, runtimeCtx, changeContractRead, changeContractSummary, strictArtifactMode, pipelineCtx } = input;
    // ── Auto-contract generation ──────────────────────────────────────────
    let autoContractPath = null;
    let updatedChangeContractSummary = changeContractSummary;
    if (!changeContractRead.contract && !strictArtifactMode) {
        try {
            const fallbackPlanId = `advisory_${Date.now()}`;
            const advisoryContract = (0, advisory_mode_contract_1.buildMinimalAdvisoryContractFromDiff)(diffFiles, fallbackPlanId);
            autoContractPath = (0, change_contract_1.writeChangeContract)(projectRoot, advisoryContract, options.changeContract);
            updatedChangeContractSummary = {
                path: autoContractPath,
                exists: true,
                enforced: false,
                valid: true,
                planId: advisoryContract.planId,
                contractId: advisoryContract.contractId,
                coverage: {
                    expectedFiles: advisoryContract.expectedFiles.length,
                    changedFiles: diffFiles.length,
                    outOfContractFiles: 0,
                    missingExpectedFiles: 0,
                    blockedFilesTouched: 0,
                    actionMismatches: 0,
                    expectedSymbols: advisoryContract.expectedSymbols?.length || 0,
                    changedSymbols: 0,
                    missingExpectedSymbols: 0,
                    blockedSymbolsTouched: 0,
                    symbolActionMismatches: 0,
                    symbolRenameMatches: 0,
                    toleratedUnexpectedFiles: 0,
                    toleratedMissingExpectedSymbols: 0,
                },
                signature: changeContractSummary.signature,
                violations: [],
            };
        }
        catch {
            autoContractPath = null;
        }
    }
    // ── Advisory signals ──────────────────────────────────────────────────
    const advisorySignalsSkipped = (0, verify_runtime_stability_1.shouldSkipAdvisoryLayer)(runtimeCtx);
    const advisorySignals = advisorySignalsSkipped
        ? []
        : (0, advisory_signals_1.evaluateAdvisorySignals)({ diffFiles, summary });
    const advisoryWarnCount = advisorySignals.filter(s => s.severity === 'warn').length;
    // ── Structural rules (advisory) ───────────────────────────────────────
    let advisoryStructuralViolations = [];
    let advisoryStructuralBlockingCount = 0;
    try {
        const structuralResult = await (0, helpers_1.runStageOrFallback)(stages_1.structuralAnalysisStage, { projectRoot, diffFiles }, pipelineCtx, () => (0, structural_on_diff_1.runStructuralOnDiffFiles)(projectRoot, diffFiles));
        advisoryStructuralViolations = structuralResult.violations;
        advisoryStructuralBlockingCount = structuralResult.violations.filter(v => v.severity === 'BLOCKING').length;
    }
    catch {
        // Structural engine failure must never block advisory verify.
    }
    // ── Verdict / grade / score ──────────────────────────────────────────
    const hasFlags = advisoryWarnCount > 0 || advisoryStructuralBlockingCount > 0;
    const advisoryVerdict = hasFlags ? 'WARN' : 'PASS';
    const advisoryGrade = hasFlags ? 'C' : 'B';
    const advisoryScore = hasFlags ? 60 : 70;
    // ── Build violations array (advisory shape) ──────────────────────────
    const advisoryViolations = [
        ...advisorySignals.map(item => ({
            file: item.files[0] || '.',
            rule: `advisory:${item.code.toLowerCase()}`,
            severity: item.severity === 'warn' ? 'warn' : 'allow',
            message: `${item.title}: ${item.detail}`,
        })),
        ...advisoryStructuralViolations.map(v => ({
            file: v.filePath,
            rule: `structural-advisory:${v.ruleId.toLowerCase()}`,
            severity: 'warn',
            message: `${v.ruleId} ${v.ruleName}: ${v.evidence.slice(0, 100)} (advisory — link plan to enforce)`,
        })),
    ];
    // ── Canonical advisory payload assembly ──────────────────────────────
    const payload = {
        grade: advisoryGrade,
        score: advisoryScore,
        verdict: advisoryVerdict,
        violations: advisoryViolations,
        adherenceScore: advisoryScore,
        bloatCount: 0,
        bloatFiles: [],
        plannedFilesModified: 0,
        totalPlannedFiles: 0,
        message: ADVISORY_MESSAGE,
        scopeGuardPassed: true,
        mode: 'advisory_missing_plan',
        advisoryMode: true,
        advisorySignals,
        structuralViolations: advisoryStructuralViolations,
        structuralBlockingCount: advisoryStructuralBlockingCount,
        ...(advisoryStructuralBlockingCount > 0
            ? {
                structuralNote: `${advisoryStructuralBlockingCount} structural finding(s) surfaced in advisory mode. Link a plan to enforce.`,
            }
            : {}),
        policyOnly: true,
        policyOnlySource: 'fallback_missing_plan',
        ...(autoContractPath
            ? { changeContract: { ...updatedChangeContractSummary, path: autoContractPath } }
            : { changeContract: changeContractSummary }),
    };
    return {
        payload,
        telemetry: {
            verdict: advisoryVerdict,
            detail: `advisory_missing_plan;signals=${advisorySignals.length};warn=${advisoryWarnCount}`,
            files: diffFiles.map(f => f.path),
        },
        autoContractPath,
        message: ADVISORY_MESSAGE,
        updatedChangeContractSummary,
        advisorySignals,
        advisoryStructuralViolations,
        advisoryStructuralBlockingCount,
        advisorySignalsSkipped,
    };
}
//# sourceMappingURL=advisory-mode.js.map