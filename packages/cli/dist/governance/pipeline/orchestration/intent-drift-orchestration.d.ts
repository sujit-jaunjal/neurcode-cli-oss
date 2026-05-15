/**
 * Intent Drift Orchestration
 * ---------------------------
 * Wraps the intent-governance module (`governance/intent/*`) into an
 * orchestration surface consumable by verify.ts. Pattern matches the other
 * orchestration modules:
 *
 *   - Caller hands us inputs (projectRoot, diffFiles, options).
 *   - We load the contract, run drift detection, return a typed result.
 *   - We do NOT render, log, or emit JSON. Caller owns presentation.
 *   - On any internal error, we return a safe empty result. Drift detection
 *     is opt-in; a malformed contract must never break verification.
 *
 * Phase 1 INVARIANT: drift detection is ADVISORY by default. The detector
 * only emits BLOCK-severity violations when `enforce: true` is passed
 * explicitly. Callers wishing to enforce must read the contract's
 * enforcement signal (a future schema field, or an environment opt-in).
 *
 * Intelligence classification: DETERMINISTIC (delegated to inner module).
 */
import { type DriftReport } from '../../intent';
import type { DiffFile } from '@neurcode-ai/diff-parser';
export interface IntentDriftOrchestrationInput {
    /** Absolute project root. */
    projectRoot: string;
    /** Parsed diff files for the current change. */
    diffFiles: DiffFile[];
    /** Optional contract path override (relative to projectRoot). */
    contractPath?: string;
    /**
     * When true, forbidden-edge violations are emitted as `block` severity.
     * Default is `false` — advisory-only, safe-by-default rollout.
     * Tier-up to enforcement happens via NEURCODE_INTENT_ENFORCE=1 or a future
     * contract field; callers compute this externally and pass it in.
     */
    enforce?: boolean;
}
export interface IntentDriftOrchestrationResult {
    /**
     * True when a contract file was found and parsed (regardless of contents).
     * False when the project has no `.neurcode/intent.json` — drift detection
     * is then skipped and `report` reflects an empty run.
     */
    contractPresent: boolean;
    /** Absolute path of the contract we looked at. */
    contractPath: string;
    /** Validation errors encountered while loading the contract, if any. */
    contractErrors: string[];
    /** Soft warnings from the loader. */
    contractWarnings: string[];
    /** Whether enforcement was active for this run. */
    enforced: boolean;
    /** The drift report. Always present, even when no contract was found. */
    report: DriftReport;
}
/**
 * Run the intent-drift detection orchestration. Safe to call on every verify run.
 *
 * Cost model:
 *   - No contract → ~1ms (filesystem stat + early return).
 *   - Contract present → proportional to (diff size × layer count). For a typical
 *     50-file diff against a 5-layer contract, well under 50ms.
 */
export declare function runIntentDriftOrchestration(input: IntentDriftOrchestrationInput): IntentDriftOrchestrationResult;
//# sourceMappingURL=intent-drift-orchestration.d.ts.map