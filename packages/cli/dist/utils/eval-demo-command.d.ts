/**
 * Shared front-door command body for the one-command enterprise demo.
 *
 * Both `neurcode eval demo` and the headline `neurcode pilot start` delegate to
 * {@link runEvalDemoCommandAction}, so `pilot start` is a genuinely thin alias to
 * the same {@link runEvalDemo} engine — there is exactly one governance loop and
 * one renderer, never a fork. Keep all demo presentation here so the two entry
 * points can never drift.
 */
import { type EvalDemoPreflight, type EvalDemoRunResult } from './eval-demo';
export declare function printPreflight(preflight: EvalDemoPreflight): void;
export declare function printDemoResult(result: EvalDemoRunResult): void;
export interface EvalDemoCommandOptions {
    dir?: string;
    agent?: string;
    fixture?: boolean;
    preflight?: boolean;
    json?: boolean;
}
/**
 * The shared action body for `eval demo` and `pilot start`. Resolves the repo
 * root, runs preflight (or the full loop), renders the result, and sets the exit
 * code. Returns nothing — it owns `process.exitCode` exactly as the original
 * `eval demo` action did, so the two front doors are byte-identical in behavior.
 */
export declare function runEvalDemoCommandAction(options: EvalDemoCommandOptions): void;
//# sourceMappingURL=eval-demo-command.d.ts.map