"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyRuntimeState = classifyRuntimeState;
exports.detectRuntimeState = detectRuntimeState;
exports.renderRuntimeStateGuidance = renderRuntimeStateGuidance;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const cli_runtime_1 = require("@neurcode-ai/cli-runtime");
const v0_governance_1 = require("./v0-governance");
const session_start_transaction_1 = require("./session-start-transaction");
function activePointer(repoRoot) {
    const path = (0, node_path_1.join)(repoRoot, '.neurcode', 'active-session.json');
    if (!(0, node_fs_1.existsSync)(path))
        return { present: false, sessionId: null, readable: true };
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        return {
            present: true,
            sessionId: typeof parsed.sessionId === 'string' && parsed.sessionId ? parsed.sessionId : null,
            readable: parsed.sessionId === null || typeof parsed.sessionId === 'string',
        };
    }
    catch {
        return { present: true, sessionId: null, readable: false };
    }
}
function hooksOrAdapterInstalled(repoRoot) {
    return [
        '.claude/settings.json',
        '.claude/settings.local.json',
        '.github/hooks/neurcode.json',
        '.cursor/mcp.json',
        '.vscode/settings.json',
    ].some((path) => (0, node_fs_1.existsSync)((0, node_path_1.join)(repoRoot, path)));
}
function hasSessionRecords(repoRoot) {
    try {
        const directory = (0, governance_runtime_1.sessionsDir)(repoRoot);
        return (0, node_fs_1.existsSync)(directory) && (0, node_fs_1.readdirSync)(directory).some((entry) => entry.endsWith('.json'));
    }
    catch {
        return false;
    }
}
function sensitiveCounts(profile) {
    const counts = {};
    for (const boundary of profile?.sensitiveBoundaries ?? []) {
        counts[boundary.tag] = (counts[boundary.tag] ?? 0) + 1;
    }
    return counts;
}
function recoveryCommand(state) {
    if (state === 'not_installed')
        return 'neurcode activate claude';
    if (state === 'installed_not_activated')
        return 'neurcode run claude --goal "Governed goal: describe the intended change"';
    if (state === 'active_compatible_session')
        return 'neurcode session status --local --json';
    if (state === 'session_starting')
        return 'neurcode session status --local --json';
    if (state === 'session_start_failed')
        return 'neurcode doctor --runtime --json';
    if (state === 'stale_or_incompatible_session')
        return 'neurcode session reset-stale --force --json';
    if (state === 'enforcement_paused')
        return 'neurcode cursor mode advisory --json';
    return 'neurcode runtime repair';
}
function classifyRuntimeState(repoRootInput) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(repoRootInput);
    const pointer = activePointer(repoRoot);
    const profileRead = (0, v0_governance_1.readGovernanceProfile)(repoRoot);
    const profile = profileRead.profile;
    const profilePresent = (0, node_fs_1.existsSync)((0, v0_governance_1.profilePath)(repoRoot));
    const manifestPresent = (0, node_fs_1.existsSync)((0, cli_runtime_1.runtimeManifestPath)(repoRoot));
    const manifest = (0, cli_runtime_1.readActivatedRuntimeManifest)(repoRoot);
    const hooksInstalled = hooksOrAdapterInstalled(repoRoot);
    const sessionRecordsPresent = hasSessionRecords(repoRoot);
    const governanceExpected = profilePresent || manifestPresent || pointer.present || sessionRecordsPresent;
    const starting = (0, session_start_transaction_1.inspectSessionStartTransaction)(repoRoot);
    const activeSession = pointer.sessionId ? (0, governance_runtime_1.loadSession)(repoRoot, pointer.sessionId) : null;
    const compatible = activeSession && profile
        ? activeSession.profileHash === profile.profileHash
        : activeSession ? null : null;
    let state;
    const reasons = [];
    if (profile?.runtimeConfig.localMode === 'paused') {
        state = 'enforcement_paused';
        reasons.push('intentional_local_pause');
    }
    else if (starting?.ownerState === 'alive_same') {
        state = 'session_starting';
        reasons.push(`session_start_phase:${starting.phase}`);
    }
    else if (starting) {
        state = 'session_start_failed';
        reasons.push(`session_start_owner:${starting.ownerState}`);
        reasons.push(`session_start_phase:${starting.phase}`);
    }
    else if ((profilePresent && !profile) || (manifestPresent && !manifest) || !pointer.readable) {
        state = 'runtime_unavailable';
        if (profilePresent && !profile)
            reasons.push('profile_unreadable');
        if (manifestPresent && !manifest)
            reasons.push('runtime_manifest_unreadable_or_incompatible');
        if (!pointer.readable)
            reasons.push('active_pointer_unreadable');
    }
    else if (pointer.sessionId && (!activeSession || compatible === false)) {
        state = 'stale_or_incompatible_session';
        reasons.push(!activeSession ? 'active_session_record_missing' : 'session_profile_incompatible');
    }
    else if (activeSession && compatible === true && activeSession.status === 'active') {
        state = 'active_compatible_session';
        reasons.push('active_session_profile_compatible');
    }
    else if (!governanceExpected && !hooksInstalled) {
        state = 'not_installed';
        reasons.push('runtime_artifacts_absent');
    }
    else if (!governanceExpected && hooksInstalled) {
        state = 'installed_not_activated';
        reasons.push('adapter_installed_without_governance_state');
    }
    else {
        state = 'session_start_failed';
        reasons.push('governance_expected_without_active_session');
    }
    const configuredBoundaryCount = profile
        ? profile.runtimeConfig.approvalRequiredGlobs.length
            + profile.runtimeConfig.sensitiveGlobs.length
            + profile.runtimeConfig.safeSupportGlobs.length
        : 0;
    return {
        schemaVersion: governance_runtime_1.RUNTIME_STATE_SCHEMA_VERSION,
        state,
        governanceExpected,
        protectedPathsFailClosed: governanceExpected
            && state !== 'enforcement_paused'
            && state !== 'active_compatible_session',
        recoveryCommand: recoveryCommand(state),
        evidence: {
            metadataOnly: true,
            hooksOrAdapterInstalled: hooksInstalled,
            runtimeManifestPresent: manifestPresent,
            profilePresent,
            profileReadable: !profilePresent || Boolean(profile),
            activePointerPresent: pointer.present,
            activeSessionPresent: Boolean(activeSession),
            sessionProfileCompatible: compatible,
            trackedFileCount: profile?.topology.trackedFileCount ?? null,
            ownershipBoundaryCount: profile?.ownershipBoundaries.length ?? 0,
            approvalBoundaryCount: profile?.approvalRequiredPaths.length ?? 0,
            sensitiveBoundaryCounts: sensitiveCounts(profile),
            configuredBoundaryCount,
            reasonCodes: reasons,
        },
    };
}
function detectRuntimeState(repoRootInput) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(repoRootInput);
    const gitProbe = (0, node_child_process_1.spawnSync)('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2_000,
    });
    const isGitRepo = gitProbe.status === 0 && String(gitProbe.stdout).trim() === 'true';
    const headProbe = isGitRepo
        ? (0, node_child_process_1.spawnSync)('git', ['rev-parse', '--verify', 'HEAD'], {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 2_000,
        })
        : null;
    return {
        isGitRepo,
        hasHeadCommit: headProbe?.status === 0,
        hasNeurcodeDir: (0, node_fs_1.existsSync)((0, node_path_1.join)(repoRoot, '.neurcode')),
        hasIntentPack: (0, node_fs_1.existsSync)((0, node_path_1.join)(repoRoot, '.neurcode', 'intent-pack.json'))
            || (0, node_fs_1.existsSync)((0, node_path_1.join)(repoRoot, '.neurcode', 'intent.json')),
        hasLastVerifyOutput: (0, node_fs_1.existsSync)((0, node_path_1.join)(repoRoot, '.neurcode', 'last-verify-output.json')),
        enforcement: classifyRuntimeState(repoRoot),
    };
}
function renderRuntimeStateGuidance(issue, state, options = {}) {
    const commandLabel = options.commandLabel || 'this command';
    const guidance = {
        'not-a-git-repo': {
            message: `${commandLabel} requires a Git repository.`,
            recovery: 'git init',
        },
        'no-head-commit': {
            message: `${commandLabel} requires an initial Git commit before HEAD-based analysis.`,
            recovery: 'git add -A && git commit -m "Initial commit"',
        },
        'no-neurcode-dir': {
            message: `${commandLabel} requires initialized Neurcode state.`,
            recovery: state.enforcement.recoveryCommand,
        },
        'no-intent-pack': {
            message: `${commandLabel} requires a captured intent/plan artifact.`,
            recovery: 'neurcode plan --help',
        },
    };
    const selected = guidance[issue];
    process.stderr.write([
        '',
        'Neurcode needs attention',
        selected.message,
        `Runtime state: ${state.enforcement.state}`,
        `Run exactly: ${selected.recovery}`,
        '',
    ].join('\n'));
    return 2;
}
//# sourceMappingURL=runtime-state.js.map