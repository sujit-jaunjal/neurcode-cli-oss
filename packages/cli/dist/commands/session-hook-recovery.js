"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRuntimeRecoveryCommand = isRuntimeRecoveryCommand;
const node_fs_1 = require("node:fs");
const SHELL_METACHARACTERS = /[;&|`$<>(){}*?!\n\r\\"']/;
const ALLOWED_SUBCOMMANDS = [
    { tokens: ['runtime', 'repair'] },
    { tokens: ['runtime', 'identity'] },
    { tokens: ['doctor'] },
];
const VALUE_FLAGS = new Set(['--dir']);
const BOOLEAN_FLAGS = new Set(['--json', '--runtime']);
function safeRealpath(path) {
    try {
        return (0, node_fs_1.realpathSync)(path);
    }
    catch {
        return path;
    }
}
function tokenize(command) {
    const trimmed = command.trim();
    if (!trimmed || trimmed.length > 400)
        return null;
    if (SHELL_METACHARACTERS.test(trimmed))
        return null;
    return trimmed.split(/\s+/);
}
function matchesSubcommandGrammar(tokens) {
    const matched = ALLOWED_SUBCOMMANDS.find(({ tokens: expected }) => expected.every((expectedToken, index) => tokens[index] === expectedToken));
    if (!matched)
        return false;
    let index = matched.tokens.length;
    while (index < tokens.length) {
        const flag = tokens[index];
        if (BOOLEAN_FLAGS.has(flag)) {
            index += 1;
            continue;
        }
        if (VALUE_FLAGS.has(flag)) {
            const value = tokens[index + 1];
            if (!value || value.startsWith('-'))
                return false;
            index += 2;
            continue;
        }
        return false;
    }
    return true;
}
/**
 * True only for a single, argument-safe invocation of a documented runtime
 * recovery command. `currentEntrypoint` is the realpath of the executing CLI
 * bundle; a `node <script>` form is accepted only when the script is that file.
 */
function isRuntimeRecoveryCommand(command, currentEntrypoint) {
    const tokens = tokenize(command);
    if (!tokens || tokens.length < 2)
        return false;
    const [head, ...rest] = tokens;
    const headBase = head.split('/').pop() || head;
    if (headBase === 'neurcode') {
        return matchesSubcommandGrammar(rest);
    }
    if (headBase === 'node') {
        const script = rest[0];
        if (!script || script.startsWith('-'))
            return false;
        const resolvedEntry = safeRealpath(currentEntrypoint);
        if (safeRealpath(script) !== resolvedEntry)
            return false;
        return matchesSubcommandGrammar(rest.slice(1));
    }
    return false;
}
//# sourceMappingURL=session-hook-recovery.js.map