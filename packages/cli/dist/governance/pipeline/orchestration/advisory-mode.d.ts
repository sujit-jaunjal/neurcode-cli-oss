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
import { type AdvisorySignal } from '../../../utils/advisory-signals';
import { type VerifyRuntimeContext } from '../../../utils/verify-runtime-stability';
import type { GovernancePipelineContext } from '../types';
import type { DiffFile } from '@neurcode-ai/diff-parser';
import type { DiffSummary } from '@neurcode-ai/diff-parser';
import type { StructuralViolation } from '../../../structural-rules/types';
/**
 * Mode-specific subset of `ChangeContractSummary` consumed by this module.
 * Defined narrowly to avoid coupling to verify.ts's internal interface.
 *
 * Field types match the verify.ts `ChangeContractSummary` (notably
 * `valid: boolean | null` and an optional/loose `coverage` shape) so we can
 * pass the summary through without explicit casts.
 */
export interface AdvisoryChangeContractSummary {
    path: string;
    exists: boolean;
    enforced: boolean;
    valid: boolean | null;
    planId: string | null;
    contractId: string | null;
    coverage?: Record<string, number> | unknown;
    signature?: unknown;
    violations: ReadonlyArray<unknown>;
}
export interface AdvisoryModeInput {
    options: {
        json?: boolean;
        changeContract?: string;
        demo?: boolean;
    };
    projectRoot: string;
    diffFiles: DiffFile[];
    summary: DiffSummary;
    runtimeCtx: VerifyRuntimeContext;
    changeContractRead: {
        contract: unknown;
    };
    changeContractSummary: AdvisoryChangeContractSummary;
    strictArtifactMode: boolean;
    pipelineCtx: GovernancePipelineContext;
}
export interface AdvisoryModeResult {
    /** Canonical payload ready to be passed to emitVerifyJson. */
    payload: Record<string, unknown>;
    /** Verdict for `recordVerifyEvent`. */
    telemetry: {
        verdict: 'WARN' | 'PASS';
        detail: string;
        files: string[];
    };
    /** Path of auto-generated change contract, when one was written. */
    autoContractPath: string | null;
    /** Auto-generated message text shown both in JSON and human modes. */
    message: string;
    /** Updated change-contract summary when an auto-contract was written. */
    updatedChangeContractSummary: AdvisoryChangeContractSummary;
    /** Advisory signals (forwarded to human render). */
    advisorySignals: AdvisorySignal[];
    /** Structural findings (advisory). */
    advisoryStructuralViolations: StructuralViolation[];
    /** Count of BLOCKING-severity structural findings in advisory mode. */
    advisoryStructuralBlockingCount: number;
    /** True when the advisory-signals layer was skipped due to runtime pressure. */
    advisorySignalsSkipped: boolean;
}
/**
 * Compute the advisory-mode result. Replaces the inline compute region.
 *
 * Does not emit JSON, does not log, does not exit.
 */
export declare function runAdvisoryMode(input: AdvisoryModeInput): Promise<AdvisoryModeResult>;
//# sourceMappingURL=advisory-mode.d.ts.map