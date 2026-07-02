/**
 * Strict recognizer for runtime recovery commands (Local-First Aha V1, P5).
 *
 * When the runtime identity guard denies protected operations (stale or
 * missing runtime manifest), the only way out used to be a human terminal:
 * the PreToolUse guard denied every Bash call — including the exact recovery
 * command it printed. That is the recurring identity deadlock. This
 * recognizer lets `session-hook check` allow precisely the documented
 * recovery commands and nothing else, so recovery is possible from inside the
 * governed agent while every other operation stays blocked.
 *
 * Deny-by-default posture:
 *  - single command only (no chaining, substitution, redirection, or globs)
 *  - `neurcode` (bare or path-suffixed) with `runtime repair`,
 *    `runtime identity`, or `doctor`, plus a small flag allowlist
 *  - `node <entrypoint> …` only when <entrypoint> resolves to the SAME file
 *    as the currently executing CLI — a foreign script is never allowed
 */
/**
 * True only for a single, argument-safe invocation of a documented runtime
 * recovery command. `currentEntrypoint` is the realpath of the executing CLI
 * bundle; a `node <script>` form is accepted only when the script is that file.
 */
export declare function isRuntimeRecoveryCommand(command: string, currentEntrypoint: string): boolean;
//# sourceMappingURL=session-hook-recovery.d.ts.map