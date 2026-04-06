/**
 * Shared CLI JSON utilities.
 *
 * Centralized helpers for ANSI stripping, JSON extraction from mixed CLI
 * output streams, and typed child-process invocations. Previously duplicated
 * across bootstrap.ts, remediate.ts, and other command files.
 */
/** Strip ANSI escape codes from a string. */
export declare function stripAnsi(value: string): string;
/**
 * Scan backwards for the last parseable JSON **object** in a mixed
 * stdout+stderr output stream. Returns `null` when no valid JSON object is
 * found.
 */
export declare function extractLastJsonObject(output: string): Record<string, unknown> | null;
/** Safely read a `string` from a record. */
export declare function asString(record: Record<string, unknown> | null, key: string): string | null;
/** Safely read a finite `number` from a record. */
export declare function asNumber(record: Record<string, unknown> | null, key: string): number | null;
/** Count elements if `violations` is an array, else 0. */
export declare function asViolationsCount(record: Record<string, unknown> | null): number;
export interface CliInvocationResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    payload: Record<string, unknown> | null;
    command: string[];
}
/**
 * Spawn a sub-invocation of the current Neurcode CLI process (`process.argv[1]`)
 * with `--json` appended and parse the JSON output.
 */
export declare function runCliJson(commandArgs: string[], options?: {
    cwd?: string;
}): Promise<CliInvocationResult>;
/** Emit a JSON object to `stdout`. */
export declare function emitJson(payload: Record<string, unknown>): void;
interface ChalkFallback {
    green: (value: string) => string;
    yellow: (value: string) => string;
    red: (value: string) => string;
    bold: ChalkFallback & ((value: string) => string);
    dim: (value: string) => string;
    cyan: (value: string) => string;
    white: (value: string) => string;
    [key: string]: unknown;
}
/**
 * Load chalk with a graceful fallback that returns unstyled strings.
 * Automatically disables colors in CI environments.
 */
export declare function loadChalk(): ChalkFallback;
export {};
//# sourceMappingURL=cli-json.d.ts.map