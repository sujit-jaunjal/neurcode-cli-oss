"use strict";
/**
 * Intent State — lightweight persistence layer for the regression engine.
 *
 * Reads/writes a single JSON file at .neurcode/intent-state.json.
 * All functions are safe: they never throw and never crash verification.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPreviousState = loadPreviousState;
exports.saveCurrentState = saveCurrentState;
exports.buildCurrentState = buildCurrentState;
const fs_1 = require("fs");
const path_1 = require("path");
// ── Constants ─────────────────────────────────────────────────────────────────
const STATE_FILENAME = 'intent-state.json';
const NEURCODE_DIR = '.neurcode';
// ── Helpers ───────────────────────────────────────────────────────────────────
function statePath(projectRoot) {
    return (0, path_1.join)(projectRoot, NEURCODE_DIR, STATE_FILENAME);
}
function isValidState(v) {
    if (typeof v !== 'object' || v === null)
        return false;
    const obj = v;
    return (typeof obj.intent === 'string' &&
        typeof obj.timestamp === 'string' &&
        Array.isArray(obj.flowIssueIds) &&
        typeof obj.componentMap === 'object' &&
        obj.componentMap !== null);
}
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Load the saved intent state from the previous verify run.
 * Returns null if the file is absent, unreadable, or has an invalid schema.
 */
function loadPreviousState(projectRoot) {
    try {
        const raw = (0, fs_1.readFileSync)(statePath(projectRoot), 'utf8');
        const parsed = JSON.parse(raw);
        if (!isValidState(parsed))
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
/**
 * Persist the current intent engine state so the next verify run can detect
 * regressions.  Silently no-ops if any I/O error occurs.
 */
function saveCurrentState(projectRoot, state) {
    try {
        const dir = (0, path_1.join)(projectRoot, NEURCODE_DIR);
        (0, fs_1.mkdirSync)(dir, { recursive: true });
        (0, fs_1.writeFileSync)(statePath(projectRoot), JSON.stringify(state, null, 2), 'utf8');
    }
    catch {
        // Non-fatal: state write failure must never break verification
    }
}
/**
 * Build an IntentState from the current engine run results.
 * Called just before saveCurrentState.
 */
function buildCurrentState(intentText, intentSummary, flowIssueIds, componentMap) {
    return {
        intent: intentText,
        timestamp: new Date().toISOString(),
        intentSummary: intentSummary
            ? {
                domain: intentSummary.domain,
                coverage: intentSummary.coverage,
                weightedCoverage: intentSummary.weightedCoverage ?? intentSummary.coverage,
                status: intentSummary.status ?? 'SECURE',
                criticalMissing: intentSummary.criticalMissing ?? [],
            }
            : null,
        flowIssueIds,
        componentMap,
    };
}
//# sourceMappingURL=state.js.map