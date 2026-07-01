/**
 * Runtime Risk Pack builder (Iteration 11 — AppSec-Adjacent Runtime Risk Pack).
 *
 * Produces the one honest, source-free answer to "what AppSec-adjacent runtime
 * boundaries must an AI agent obey before a write lands, and what does each one
 * enforce?" — without becoming an AppSec scanner.
 *
 * Single source of enforcement truth: the Runtime Safety Kernel. For each of the
 * eight roadmap categories this builder runs a representative fixture path
 * through {@link evaluateRuntimeSafetyCheck} — the *same* funnel the Claude/
 * Cursor/Codex hooks use — and copies the kernel's decision (`family`,
 * `enforcementAction`, `truthTier`, `reasonIds`) verbatim. It NEVER re-implements
 * classify logic, and the contract's `family` type is the same
 * `ManagerEvidenceRiskFamily` the kernel and manager dashboard use, so no new
 * taxonomy can drift in.
 *
 * Source-free by construction: category ids, labels, kernel reason codes,
 * families, action strings, truth tiers, counts, and synthetic *fixture* paths —
 * never repository source, diffs, prompts, secrets, or CVE text. Pure: no
 * filesystem or network I/O; `generatedAt` and `cliVersion` are injected.
 */
import { type RuntimeRiskCategoryId, type RuntimeRiskPackReport } from '@neurcode-ai/contracts';
export interface RuntimeRiskPackInput {
    generatedAt: string;
    cliVersion: string | null;
}
/**
 * Probe fixtures per category — exported so the authority gate can re-run the
 * kernel over the exact same inputs and prove the doctor copies the kernel
 * decision verbatim (no second source of truth).
 */
export declare const RUNTIME_RISK_PROBES: ReadonlyArray<{
    id: RuntimeRiskCategoryId;
    probe: {
        filePath: string;
        previousContent?: string | null;
        proposedContent?: string | null;
    };
}>;
/**
 * Build the source-free Runtime Risk Pack report. Pure: every enforcement field
 * is derived by re-running the canonical kernel funnel over fixture probes.
 */
export declare function buildRuntimeRiskPackReport(input: RuntimeRiskPackInput): RuntimeRiskPackReport;
//# sourceMappingURL=runtime-risk-pack.d.ts.map