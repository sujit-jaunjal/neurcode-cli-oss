"use strict";
/**
 * Pilot Readiness Validator (Phase 6 — Pilot Readiness Hardening)
 *
 * Checks that a repository meets all prerequisites for a reliable Neurcode
 * onboarding. Designed to be runnable in under 10 seconds with no external
 * network calls.
 *
 * Usage: runPilotReadinessCheck(projectRoot) → PilotReadinessReport
 *
 * Returns:
 *   ready:    true if all blockers pass (warnings are non-blocking)
 *   blockers: list of hard failures that prevent governance from running
 *   warnings: list of soft issues that degrade experience but don't block
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPilotReadinessCheck = runPilotReadinessCheck;
const fs_1 = require("fs");
const path_1 = require("path");
const child_process_1 = require("child_process");
// ── Helpers ───────────────────────────────────────────────────────────────────
function check(name, fn) {
    try {
        const result = fn();
        return { name, ...result };
    }
    catch (e) {
        return {
            name,
            status: 'fail',
            message: `Check threw unexpectedly: ${e instanceof Error ? e.message : String(e)}`,
        };
    }
}
function nodeVersion() {
    const v = process.version; // e.g. 'v18.12.0'
    return parseInt(v.slice(1).split('.')[0] ?? '0', 10);
}
// ── Individual checks ─────────────────────────────────────────────────────────
function checkGitAvailable() {
    try {
        (0, child_process_1.execSync)('git --version', { stdio: 'ignore', timeout: 3000 });
        return { status: 'pass', message: 'git is available.' };
    }
    catch {
        return { status: 'fail', message: 'git is not available in PATH. Neurcode requires git to compute diffs.' };
    }
}
function checkNodeVersion() {
    const major = nodeVersion();
    if (major >= 20)
        return { status: 'pass', message: `Node.js v${major} (≥20 recommended).` };
    if (major >= 18)
        return { status: 'pass', message: `Node.js v${major} (supported; v20+ recommended for best performance).` };
    return { status: 'fail', message: `Node.js v${major} is below minimum requirement (18). Upgrade to Node.js 18 or later.` };
}
function checkNeurcodeDir(projectRoot) {
    const dir = (0, path_1.join)(projectRoot, '.neurcode');
    if (!(0, fs_1.existsSync)(dir)) {
        // Not existing is fine — it will be created on first run
        // But check that the parent directory is writable
        try {
            (0, fs_1.accessSync)(projectRoot, fs_1.constants.W_OK);
            return { status: 'pass', message: '.neurcode/ does not exist yet (will be created on first verify run). Project root is writable.' };
        }
        catch {
            return { status: 'fail', message: `Project root '${projectRoot}' is not writable. Cannot create .neurcode/ directory.` };
        }
    }
    try {
        (0, fs_1.accessSync)(dir, fs_1.constants.W_OK);
        return { status: 'pass', message: '.neurcode/ directory exists and is writable.' };
    }
    catch {
        return { status: 'fail', message: '.neurcode/ directory exists but is not writable. Check file permissions.' };
    }
}
function checkPolicyLock(projectRoot) {
    const lockPath = (0, path_1.join)(projectRoot, '.neurcode', 'neurcode.policy.lock.json');
    if (!(0, fs_1.existsSync)(lockPath)) {
        return {
            status: 'warn',
            message: 'Policy lock file (neurcode.policy.lock.json) not found. Run `neurcode policy bootstrap` to create it.',
        };
    }
    try {
        const raw = (0, fs_1.readFileSync)(lockPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {
            return { status: 'pass', message: 'Policy lock file exists and is valid JSON.' };
        }
        return { status: 'warn', message: 'Policy lock file exists but content is not a valid JSON object.' };
    }
    catch {
        return { status: 'fail', message: 'Policy lock file exists but is corrupt (invalid JSON). Delete and re-run `neurcode policy bootstrap`.' };
    }
}
function checkCacheHealth(projectRoot) {
    const cachePath = (0, path_1.join)(projectRoot, '.neurcode', 'structural-cache.json');
    if (!(0, fs_1.existsSync)(cachePath)) {
        return { status: 'pass', message: 'No structural cache found (cold start — normal for first run).' };
    }
    try {
        const raw = (0, fs_1.readFileSync)(cachePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' &&
            parsed !== null &&
            typeof parsed.version === 'number' &&
            typeof parsed.entries === 'object') {
            const entryCount = Object.keys(parsed.entries).length;
            return { status: 'pass', message: `Structural cache exists and is valid (${entryCount} entries).` };
        }
        return { status: 'warn', message: 'Structural cache exists but has unexpected format. It will be regenerated on next verify run.' };
    }
    catch {
        return { status: 'warn', message: 'Structural cache file is corrupt. It will be regenerated on next verify run.' };
    }
}
function checkRepoCompatibility(projectRoot) {
    // Detect potentially unsupported repo configurations
    const cargoToml = (0, path_1.join)(projectRoot, 'Cargo.toml');
    const goMod = (0, path_1.join)(projectRoot, 'go.mod');
    const packageJson = (0, path_1.join)(projectRoot, 'package.json');
    const requirementsTxt = (0, path_1.join)(projectRoot, 'requirements.txt');
    const pyprojectToml = (0, path_1.join)(projectRoot, 'pyproject.toml');
    const pomXml = (0, path_1.join)(projectRoot, 'pom.xml');
    const detected = [];
    if ((0, fs_1.existsSync)(packageJson))
        detected.push('Node.js/TypeScript');
    if ((0, fs_1.existsSync)(requirementsTxt) || (0, fs_1.existsSync)(pyprojectToml))
        detected.push('Python');
    if ((0, fs_1.existsSync)(goMod))
        detected.push('Go');
    if ((0, fs_1.existsSync)(pomXml))
        detected.push('Java/Maven');
    if ((0, fs_1.existsSync)(cargoToml))
        detected.push('Rust');
    if (detected.length === 0) {
        return {
            status: 'warn',
            message: 'No recognized dependency manifest found (package.json, requirements.txt, go.mod, pom.xml). ' +
                'Repo may be unsupported. Structural rules will run in degraded mode.',
        };
    }
    if ((0, fs_1.existsSync)(cargoToml) && detected.length === 1) {
        return {
            status: 'warn',
            message: 'Pure Rust repository detected. Structural rules currently support TypeScript, JavaScript, and Python. ' +
                'Policy engine will still run; structural analysis will be limited.',
        };
    }
    return {
        status: 'pass',
        message: `Detected ecosystem(s): ${detected.join(', ')}. Structural rules are supported.`,
    };
}
function checkGitRepo(projectRoot) {
    const gitDir = (0, path_1.join)(projectRoot, '.git');
    if (!(0, fs_1.existsSync)(gitDir)) {
        return {
            status: 'fail',
            message: 'Not a git repository (no .git directory found). Neurcode requires git history to compute diffs.',
        };
    }
    return { status: 'pass', message: 'Git repository detected.' };
}
function checkActivePlan(projectRoot) {
    // Check for a plan state file — existence indicates a plan is linked
    const stateFile = (0, path_1.join)(projectRoot, '.neurcode', 'state.json');
    if (!(0, fs_1.existsSync)(stateFile)) {
        return {
            status: 'warn',
            message: 'No Neurcode state file found. Run `neurcode plan` to set an intent before verifying. ' +
                'Without a plan, verify runs in advisory-only mode.',
        };
    }
    try {
        const raw = (0, fs_1.readFileSync)(stateFile, 'utf-8');
        const state = JSON.parse(raw);
        const planId = state.activePlanId ?? state.planId;
        if (planId && typeof planId === 'string') {
            return { status: 'pass', message: `Active plan detected: ${planId.slice(0, 16)}...` };
        }
        return {
            status: 'warn',
            message: 'State file found but no active plan linked. Run `neurcode plan` to set intent.',
        };
    }
    catch {
        return { status: 'warn', message: 'State file is unreadable. Run `neurcode plan` to re-link a plan.' };
    }
}
// ── Main entry point ──────────────────────────────────────────────────────────
/**
 * Run all pilot readiness checks for a repository.
 *
 * @param projectRoot  Absolute path to the project root
 * @returns            PilotReadinessReport with ready flag, blockers, warnings, and per-check results
 */
function runPilotReadinessCheck(projectRoot) {
    const startMs = Date.now();
    const checks = [
        check('git-available', () => checkGitAvailable()),
        check('git-repository', () => checkGitRepo(projectRoot)),
        check('node-version', () => checkNodeVersion()),
        check('neurcode-dir', () => checkNeurcodeDir(projectRoot)),
        check('repo-compatibility', () => checkRepoCompatibility(projectRoot)),
        check('policy-lock', () => checkPolicyLock(projectRoot)),
        check('cache-health', () => checkCacheHealth(projectRoot)),
        check('active-plan', () => checkActivePlan(projectRoot)),
    ];
    const blockers = checks
        .filter(c => c.status === 'fail')
        .map(c => `[${c.name}] ${c.message}`);
    const warnings = checks
        .filter(c => c.status === 'warn')
        .map(c => `[${c.name}] ${c.message}`);
    return {
        ready: blockers.length === 0,
        blockers,
        warnings,
        checks,
        durationMs: Date.now() - startMs,
    };
}
//# sourceMappingURL=pilot-readiness.js.map