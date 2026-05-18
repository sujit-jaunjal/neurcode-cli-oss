"use strict";
/**
 * Runtime state guardrails.
 *
 * Detects the operational state of a project root and produces structured
 * "what's next" guidance when a command would otherwise fail with a raw
 * runtime / git / filesystem error.
 *
 * Pure, deterministic, no network. Read-only. No mutations to .neurcode/
 * or any other on-disk state.
 *
 * Aesthetic discipline: subtle sophistication, no terminal theatrics.
 * Aligned with the operational-experience refabrication phase
 * (docs/ux/final-operational-experience-report.md).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectRuntimeState = detectRuntimeState;
exports.renderRuntimeStateGuidance = renderRuntimeStateGuidance;
exports.guardRequired = guardRequired;
const fs_1 = require("fs");
const child_process_1 = require("child_process");
const path_1 = require("path");
const chalk_1 = __importDefault(require("chalk"));
function safeExec(cmd, cwd) {
    try {
        return (0, child_process_1.execSync)(cmd, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    }
    catch {
        return null;
    }
}
function detectRuntimeState(projectRoot) {
    const root = (0, path_1.resolve)(projectRoot);
    const gitDir = safeExec('git rev-parse --git-dir', root);
    const isGitRepo = !!gitDir;
    const headSha = isGitRepo ? safeExec('git rev-parse --verify HEAD', root) : null;
    const hasHeadCommit = !!headSha;
    const hasNeurcodeDir = (0, fs_1.existsSync)((0, path_1.resolve)(root, '.neurcode'));
    const hasIntentPack = (0, fs_1.existsSync)((0, path_1.resolve)(root, '.neurcode/intent-pack.json'));
    const hasLastVerifyOutput = (0, fs_1.existsSync)((0, path_1.resolve)(root, '.neurcode/last-verify-output.json'));
    return {
        projectRoot: root,
        isGitRepo,
        hasHeadCommit,
        hasNeurcodeDir,
        hasIntentPack,
        hasLastVerifyOutput,
    };
}
/**
 * Render an operational-guidance panel when a command cannot run because
 * a prerequisite is not met. Same aesthetic as the welcome banner + the
 * `neurcode home` panels: subtle, structured, no theatrics.
 *
 * The panel writes to stderr (so JSON-mode callers piping stdout get clean
 * JSON or no output) and returns the exit code the caller should propagate.
 */
function renderRuntimeStateGuidance(issue, state, options = {}) {
    const label = options.commandLabel ?? 'this command';
    const print = (line = '') => process.stderr.write(line + '\n');
    print('');
    print(chalk_1.default.bold(`neurcode  ·  runtime state guidance`));
    print(chalk_1.default.dim(`  ${label} cannot continue — a prerequisite is not yet satisfied.`));
    print('');
    switch (issue) {
        case 'not-a-git-repo':
            print(`  ${chalk_1.default.bold('Issue')}        not inside a git repository`);
            print(`  ${chalk_1.default.bold('Path')}         ${chalk_1.default.dim(state.projectRoot)}`);
            print('');
            print(`  ${chalk_1.default.bold('Why this matters')}`);
            print(chalk_1.default.dim('    Neurcode governs change against a declared intent contract. The'));
            print(chalk_1.default.dim('    diff between the current working tree and a base ref is the input'));
            print(chalk_1.default.dim('    to the verify pipeline. Without git, there is no diff to govern.'));
            print('');
            print(`  ${chalk_1.default.bold('Recommended next step')}`);
            print(chalk_1.default.cyan('    git init && git add . && git commit -m "chore: baseline"'));
            print('');
            break;
        case 'no-head-commit':
            print(`  ${chalk_1.default.bold('Issue')}        git repository has no HEAD commit yet`);
            print(`  ${chalk_1.default.bold('Path')}         ${chalk_1.default.dim(state.projectRoot)}`);
            print('');
            print(`  ${chalk_1.default.bold('Why this matters')}`);
            print(chalk_1.default.dim('    Verify needs a base commit to diff against. A freshly-initialised'));
            print(chalk_1.default.dim('    git repository has no HEAD until something is committed.'));
            print('');
            print(`  ${chalk_1.default.bold('Recommended next step')}`);
            print(chalk_1.default.cyan('    git add . && git commit -m "chore: baseline"'));
            print(chalk_1.default.dim('    Then re-run verify; the working-tree diff will resolve cleanly.'));
            print('');
            break;
        case 'no-neurcode-dir':
            print(`  ${chalk_1.default.bold('Issue')}        no .neurcode/ directory in the project root`);
            print(`  ${chalk_1.default.bold('Path')}         ${chalk_1.default.dim(state.projectRoot)}`);
            print('');
            print(`  ${chalk_1.default.bold('Why this matters')}`);
            print(chalk_1.default.dim('    Neurcode reads its governance state from .neurcode/ — the intent'));
            print(chalk_1.default.dim('    contract, evidence artefacts, control-plane snapshots, and replay'));
            print(chalk_1.default.dim('    state all live there. Without it, verify has no contract to enforce.'));
            print('');
            print(`  ${chalk_1.default.bold('Recommended next step')}`);
            print(chalk_1.default.cyan('    neurcode start') + chalk_1.default.dim(' "what you intend to change"'));
            print(chalk_1.default.dim('    This declares the intent contract and initialises .neurcode/.'));
            print('');
            break;
        case 'no-intent-pack':
            print(`  ${chalk_1.default.bold('Issue')}        no intent contract on disk`);
            print(`  ${chalk_1.default.bold('Path')}         ${chalk_1.default.dim(state.projectRoot)}/.neurcode/intent-pack.json`);
            print('');
            print(`  ${chalk_1.default.bold('Why this matters')}`);
            print(chalk_1.default.dim('    Neurcode is intent-first. Verify needs a declared intent contract'));
            print(chalk_1.default.dim('    to know what scope to govern. Without it, runtime falls back to'));
            print(chalk_1.default.dim('    structural rules only — the dominant value of the runtime (scope'));
            print(chalk_1.default.dim('    guard, forbidden-boundary enforcement, import-edge governance) is'));
            print(chalk_1.default.dim('    inactive.'));
            print('');
            print(`  ${chalk_1.default.bold('Recommended next step')}`);
            print(chalk_1.default.cyan('    neurcode start') + chalk_1.default.dim(' "what you intend to change"'));
            print('');
            break;
    }
    print(chalk_1.default.dim('  See: ') + chalk_1.default.cyan('neurcode home') + chalk_1.default.dim(' for the current runtime state.'));
    print('');
    return 2;
}
/**
 * Convenience: detect state + render guidance + return the exit code for
 * the FIRST unsatisfied prerequisite (in lifecycle order). Returns null if
 * all required prerequisites are satisfied.
 */
function guardRequired(projectRoot, required, options = {}) {
    const state = detectRuntimeState(projectRoot);
    const checks = [
        ['not-a-git-repo', !state.isGitRepo],
        ['no-head-commit', state.isGitRepo && !state.hasHeadCommit],
        ['no-neurcode-dir', !state.hasNeurcodeDir],
        ['no-intent-pack', !state.hasIntentPack],
    ];
    for (const [issue, failed] of checks) {
        if (!required.includes(issue))
            continue;
        if (!failed)
            continue;
        return renderRuntimeStateGuidance(issue, state, options);
    }
    return null;
}
//# sourceMappingURL=runtime-state.js.map