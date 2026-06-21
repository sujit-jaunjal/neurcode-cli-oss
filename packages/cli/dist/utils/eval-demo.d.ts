/**
 * `neurcode eval demo` — the one-command local enterprise demo runner.
 *
 * Drives a complete, safe, deterministic governance loop against a throwaway
 * fixture repository and produces a source-free enterprise report + dashboard
 * summary. A first-time engineering manager or senior engineer can run a single
 * command, watch the runtime allow a safe edit, block a protected boundary,
 * contain an exact-path approval, keep a neighbor blocked, and export a
 * source-free AI Change Record — without founder handholding, GitHub Actions, or
 * cloud authentication.
 *
 * The loop is driven by self-spawning the *real* built CLI against the fixture,
 * so what an evaluator sees is the actual product enforcing — not a re-implemented
 * mock. Every expected assertion is checked; any critical failure fails the run
 * loudly and the report records exactly which checkpoint did not hold.
 *
 * Hard rules (shared with utils/guided-eval.ts):
 *   - Source-free: only paths, owners, symbol names, counts, verdicts, hashes,
 *     and tier labels are read or emitted. {@link assertEnterpriseEvalSourceFree}
 *     is the backstop before anything is written.
 *   - Honest trust posture: self-attested local record unless a backend signing
 *     key is configured and a receipt actually verifies. Never claims public-key
 *     cryptographic signing for an HMAC backend receipt.
 *   - The only writers are the fixture scaffold and the `.neurcode/eval/`
 *     report/summary artifacts (gitignored). User source is never touched.
 */
import { type GuidedEvalAgent, type GuidedEvalEnforcement } from './guided-eval';
import { type DemoCheckpoint, type EnterpriseEvalReport, type EvalDemoFacts, type EvalDemoSummary } from './enterprise-eval-report';
export declare const EVAL_DEMO_RUN_SCHEMA_VERSION: "neurcode.eval-demo-run.v1";
/**
 * Resolve the entry of the *running* CLI so the demo drives the real product.
 * Works under a global install, `npx`, and local development. Prefers the
 * compiled layout (dist/commands/eval-demo.js → ../index.js), then argv[1].
 */
export declare function resolveCliEntry(): string;
export type PreflightStatus = 'ok' | 'warn' | 'info';
export interface PreflightCheck {
    id: string;
    label: string;
    status: PreflightStatus;
    detail: string;
    recovery?: string;
}
export interface EvalDemoPreflight {
    schemaVersion: 'neurcode.eval-preflight.v1';
    generatedAt: string;
    agent: GuidedEvalAgent;
    ok: boolean;
    checks: PreflightCheck[];
    backendSigningConfigured: boolean;
}
/**
 * Buyer-friendly preflight: Node/npm, CLI version + multiple-install recovery,
 * repo + fixture state, GitHub Actions (explicitly not required), and whether
 * evidence will be backend-signed or self-attested. Short and honest.
 */
export declare function buildEvalDemoPreflight(repoRoot: string, options?: {
    agent?: GuidedEvalAgent;
    generatedAt?: string;
}): EvalDemoPreflight;
export interface RunEvalDemoOptions {
    repoRoot: string;
    agent?: string;
    /** Skip the actual loop and only return preflight (used by --preflight). */
    preflightOnly?: boolean;
    generatedAt?: string;
    /** Test seam: override the CLI entry that gets self-spawned. */
    cliEntry?: string;
    /** Emit per-step progress lines. */
    onStep?: (line: string) => void;
}
export interface EvalDemoArtifacts {
    reportMarkdownPath: string;
    reportJsonPath: string;
    summaryJsonPath: string;
    guidedReportMarkdownPath: string;
}
export interface EvalDemoRunResult {
    schemaVersion: typeof EVAL_DEMO_RUN_SCHEMA_VERSION;
    ok: boolean;
    agent: GuidedEvalAgent;
    enforcement: GuidedEvalEnforcement;
    preflight: EvalDemoPreflight;
    checkpoints: DemoCheckpoint[];
    facts: EvalDemoFacts;
    report: EnterpriseEvalReport;
    summary: EvalDemoSummary;
    artifacts: EvalDemoArtifacts;
}
/**
 * Run the complete one-command enterprise demo. Returns a structured result; the
 * command layer renders it and sets the exit code. Throws only on a programming
 * error — expected governance failures are recorded as failed checkpoints with
 * `ok: false`, so the report still explains exactly what did not hold.
 */
export declare function runEvalDemo(options: RunEvalDemoOptions): EvalDemoRunResult;
//# sourceMappingURL=eval-demo.d.ts.map