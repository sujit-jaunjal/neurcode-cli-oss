"use strict";
/**
 * Shared CLI JSON utilities.
 *
 * Centralized helpers for ANSI stripping, JSON extraction from mixed CLI
 * output streams, and typed child-process invocations. Previously duplicated
 * across bootstrap.ts, remediate.ts, and other command files.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripAnsi = stripAnsi;
exports.extractLastJsonObject = extractLastJsonObject;
exports.asString = asString;
exports.asNumber = asNumber;
exports.asViolationsCount = asViolationsCount;
exports.runCliJson = runCliJson;
exports.emitJson = emitJson;
exports.loadChalk = loadChalk;
const child_process_1 = require("child_process");
/* -------------------------------------------------------------------------- */
/*  ANSI / JSON helpers                                                       */
/* -------------------------------------------------------------------------- */
/** Strip ANSI escape codes from a string. */
function stripAnsi(value) {
    return value.replace(/\u001b\[[0-9;]*m/g, '');
}
/**
 * Scan backwards for the last parseable JSON **object** in a mixed
 * stdout+stderr output stream. Returns `null` when no valid JSON object is
 * found.
 */
function extractLastJsonObject(output) {
    const clean = stripAnsi(output).trim();
    const end = clean.lastIndexOf('}');
    if (end === -1)
        return null;
    for (let start = end; start >= 0; start -= 1) {
        if (clean[start] !== '{')
            continue;
        const candidate = clean.slice(start, end + 1);
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch {
            // Keep searching until a parseable JSON object is found.
        }
    }
    return null;
}
/* -------------------------------------------------------------------------- */
/*  Typed helpers                                                             */
/* -------------------------------------------------------------------------- */
/** Safely read a `string` from a record. */
function asString(record, key) {
    if (!record)
        return null;
    const value = record[key];
    return typeof value === 'string' ? value : null;
}
/** Safely read a finite `number` from a record. */
function asNumber(record, key) {
    if (!record)
        return null;
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
/** Count elements if `violations` is an array, else 0. */
function asViolationsCount(record) {
    if (!record)
        return 0;
    const value = record.violations;
    if (!Array.isArray(value))
        return 0;
    return value.length;
}
/**
 * Spawn a sub-invocation of the current Neurcode CLI process (`process.argv[1]`)
 * with `--json` appended and parse the JSON output.
 */
async function runCliJson(commandArgs, options) {
    const args = commandArgs.includes('--json') ? [...commandArgs] : [...commandArgs, '--json'];
    const stdoutChunks = [];
    const stderrChunks = [];
    const cwd = options?.cwd ?? process.cwd();
    const exitCode = await new Promise((resolvePromise, reject) => {
        const child = (0, child_process_1.spawn)(process.execPath, [process.argv[1], ...args], {
            cwd,
            env: {
                ...process.env,
                CI: process.env.CI || 'true',
                FORCE_COLOR: '0',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        child.stdout.on('data', (chunk) => stdoutChunks.push(String(chunk)));
        child.stderr.on('data', (chunk) => stderrChunks.push(String(chunk)));
        child.on('error', (error) => reject(error));
        child.on('close', (code) => resolvePromise(typeof code === 'number' ? code : 1));
    });
    const stdout = stdoutChunks.join('');
    const stderr = stderrChunks.join('');
    const payload = extractLastJsonObject(`${stdout}\n${stderr}`);
    return {
        exitCode,
        stdout,
        stderr,
        payload,
        command: args,
    };
}
/** Emit a JSON object to `stdout`. */
function emitJson(payload) {
    console.log(JSON.stringify(payload, null, 2));
}
const identity = (value) => value;
/**
 * Load chalk with a graceful fallback that returns unstyled strings.
 * Automatically disables colors in CI environments.
 */
function loadChalk() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const real = require('chalk');
        if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
            real.level = 0;
        }
        return real;
    }
    catch {
        const fallback = {
            green: identity,
            yellow: identity,
            red: identity,
            dim: identity,
            cyan: identity,
            white: identity,
            bold: Object.assign(identity, {
                green: identity,
                yellow: identity,
                red: identity,
                dim: identity,
                cyan: identity,
                white: identity,
                bold: identity,
            }),
        };
        return fallback;
    }
}
//# sourceMappingURL=cli-json.js.map