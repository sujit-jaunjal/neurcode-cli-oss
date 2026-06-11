"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_CURSOR_GATE_CLI_VERSION = exports.CURSOR_GATE_SCHEMA_VERSION = void 0;
exports.readBundledCliVersion = readBundledCliVersion;
exports.buildCliVersionStaleWarning = buildCliVersionStaleWarning;
exports.emitCliVersionStaleWarning = emitCliVersionStaleWarning;
exports.resolveCursorGateExitCode = resolveCursorGateExitCode;
exports.evaluateCursorGate = evaluateCursorGate;
exports.formatCursorGateCiErrors = formatCursorGateCiErrors;
exports.hookPinCliVersionsToTry = hookPinCliVersionsToTry;
exports.ensureHookPinnedCli = ensureHookPinnedCli;
exports.stripNeurcodeHookFragment = stripNeurcodeHookFragment;
exports.installCursorGateHook = installCursorGateHook;
exports.doctorCursorGateHook = doctorCursorGateHook;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_child_process_1 = require("node:child_process");
const contracts_1 = require("@neurcode-ai/contracts");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const agent_guard_1 = require("./agent-guard");
const cursor_mcp_agent_1 = require("./cursor-mcp-agent");
const runtime_live_1 = require("./runtime-live");
const v0_governance_1 = require("./v0-governance");
exports.CURSOR_GATE_SCHEMA_VERSION = 'neurcode.cursor-gate.v1';
exports.MIN_CURSOR_GATE_CLI_VERSION = '0.15.8';
function readBundledCliVersion() {
    try {
        const pkgPath = (0, node_path_1.join)(__dirname, '..', '..', 'package.json');
        const pkg = JSON.parse((0, node_fs_1.readFileSync)(pkgPath, 'utf8'));
        return pkg.version?.trim() || 'unknown';
    }
    catch {
        return 'unknown';
    }
}
/** Warn when the running CLI is too old for cursor gate (e.g. stale global @neurcode-ai/cli). */
function buildCliVersionStaleWarning(options) {
    const expectedVersion = readBundledCliVersion();
    const runningVersion = options?.runningVersionOverride?.trim() || expectedVersion;
    const minimumVersion = options?.minimumVersion?.trim() || exports.MIN_CURSOR_GATE_CLI_VERSION;
    const meetsMinimum = (0, contracts_1.isSemverAtLeast)(runningVersion, minimumVersion);
    if (meetsMinimum !== false)
        return null;
    return {
        id: 'cli_version_stale',
        status: 'warn',
        runningVersion,
        expectedVersion,
        minimumVersion,
        message: `CLI ${runningVersion} is older than ${minimumVersion}; cursor gate and enterprise hooks require @neurcode-ai/cli@${minimumVersion}+.`,
        remediation: [
            'npm install -g @neurcode-ai/cli@latest',
            'npm exec --package=@neurcode-ai/cli@latest -- neurcode cursor gate --help',
        ],
    };
}
function emitCliVersionStaleWarning(warning, json) {
    if (json)
        return;
    process.stderr.write(`⚠️  ${warning.message}\n`);
    for (const step of warning.remediation) {
        process.stderr.write(`   ${step}\n`);
    }
}
function repoRelativeArtifactPath(repoRoot, artifactPath) {
    const root = repoRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    const normalized = artifactPath.replace(/\\/g, '/');
    return normalized.startsWith(`${root}/`)
        ? normalized.slice(root.length + 1)
        : '<external-agent-guard-artifact>';
}
function guardEvaluationFingerprint(evaluation) {
    return (0, node_crypto_1.createHash)('sha256')
        .update(JSON.stringify({
        pass: evaluation.pass,
        status: evaluation.status,
        summary: evaluation.summary,
        changedFiles: evaluation.changedFiles.map((file) => ({
            path: file.path,
            changeType: file.changeType,
            classification: file.classification,
            evidence: file.evidence,
        })),
    }))
        .digest('hex')
        .slice(0, 24);
}
function guardEvaluationDetail(repoRoot, artifactPath, evaluation) {
    return {
        schemaVersion: 'neurcode.agent-guard-status.v1',
        guardId: evaluation.guardId,
        artifactPath: repoRelativeArtifactPath(repoRoot, artifactPath),
        reportFingerprint: guardEvaluationFingerprint(evaluation),
        pass: evaluation.pass,
        status: evaluation.status,
        summary: evaluation.summary,
        changedFiles: evaluation.changedFiles.slice(0, 100).map((file) => ({
            path: file.path,
            changeType: file.changeType,
            classification: file.classification,
            evidence: file.evidence,
        })),
        privacy: evaluation.privacy,
    };
}
async function publishGuardEvent(input) {
    const updated = (0, governance_runtime_1.appendEvent)(input.repoRoot, input.sessionId, input.event);
    if (updated) {
        await (0, runtime_live_1.publishRuntimeLiveStatus)(input.repoRoot, updated);
    }
}
async function publishGuardEvaluation(input) {
    const session = (0, governance_runtime_1.loadSession)(input.repoRoot, input.evaluation.sessionId);
    if (!session)
        return;
    const detail = guardEvaluationDetail(input.repoRoot, input.artifactPath, input.evaluation);
    const latestStatus = [...session.events]
        .reverse()
        .find((event) => event.type === 'agent_guard_status');
    if (latestStatus?.detail?.reportFingerprint === detail.reportFingerprint) {
        await (0, runtime_live_1.publishRuntimeLiveStatus)(input.repoRoot, session);
        return;
    }
    await publishGuardEvent({
        repoRoot: input.repoRoot,
        sessionId: input.evaluation.sessionId,
        event: {
            type: 'agent_guard_status',
            ts: input.evaluation.generatedAt,
            message: input.evaluation.pass
                ? 'Agent guard status: changed files have allowed pre-write evidence.'
                : 'Agent guard status: attention required for unverified or denied writes.',
            detail,
        },
    });
}
function buildRemediation(evaluation, sessionId) {
    if (!sessionId) {
        return [
            'neurcode cursor onboard --guard-start',
            'neurcode agent guard start cursor --goal "<task>" --plan "<source-free plan>"',
        ];
    }
    const base = [
        `neurcode agent guard status --session-id ${sessionId} --fail-on-unverified --json`,
        `neurcode agent guard finish --session-id ${sessionId} --fail-on-unverified`,
    ];
    if (!evaluation || evaluation.pass)
        return base;
    const paths = evaluation.changedFiles
        .filter((file) => file.classification === 'unverified_write' || file.classification === 'denied_but_changed')
        .slice(0, 5)
        .map((file) => `neurcode agent check ${file.path} --adapter cursor-mcp --session-id ${sessionId}`);
    return [...paths, ...base];
}
function enforcementSummary() {
    const capability = (0, governance_runtime_1.getAgentRuntimeAdapterCapability)('cursor-mcp');
    return {
        level: capability.enforcementLevel,
        controlLevel: capability.controlLevel,
        honestSummary: 'Cursor uses cooperative MCP edit.before checks plus local guard supervisor containment — not Claude-style hard pre-write deny. The cursor gate fail-closes git push, CI, and session handoff when guard detects unverified or denied-but-changed writes.',
    };
}
function resolveCursorGateExitCode(input) {
    if (input.errorCode)
        return 1;
    if (input.pass === false)
        return 2;
    return 0;
}
async function evaluateCursorGate(options) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const enforcement = enforcementSummary();
    const guardRead = (0, agent_guard_1.readAgentGuardArtifact)({
        repoRoot,
        sessionId: options.sessionId,
        artifactPath: options.guardPath,
    });
    if (!guardRead.artifact || !guardRead.artifact.active) {
        const errorCode = 'no_active_guard_session';
        const error = guardRead.error
            || 'No active agent guard session found. Start one with `neurcode cursor onboard` or `neurcode agent guard start cursor`.';
        if (!options.allowNoSession) {
            return {
                schemaVersion: exports.CURSOR_GATE_SCHEMA_VERSION,
                ok: false,
                exitCode: 1,
                sessionId: null,
                agentGuardPosture: null,
                summary: { unverifiedWrites: 0, deniedButChanged: 0, changedFiles: 0 },
                remediation: buildRemediation(null, null),
                enforcement,
                error,
                errorCode,
            };
        }
        return {
            schemaVersion: exports.CURSOR_GATE_SCHEMA_VERSION,
            ok: true,
            exitCode: 0,
            sessionId: null,
            agentGuardPosture: null,
            summary: { unverifiedWrites: 0, deniedButChanged: 0, changedFiles: 0 },
            remediation: buildRemediation(null, null),
            enforcement,
            error,
            errorCode,
        };
    }
    const artifact = guardRead.artifact;
    const sessionId = options.sessionId || artifact.sessionId;
    const session = (0, governance_runtime_1.loadSession)(repoRoot, sessionId) || (0, governance_runtime_1.loadActiveSession)(repoRoot);
    if (!session) {
        return {
            schemaVersion: exports.CURSOR_GATE_SCHEMA_VERSION,
            ok: false,
            exitCode: 1,
            sessionId,
            agentGuardPosture: null,
            summary: { unverifiedWrites: 0, deniedButChanged: 0, changedFiles: 0 },
            remediation: buildRemediation(null, sessionId),
            enforcement,
            error: `Local governance session ${sessionId} was not found.`,
            errorCode: 'session_not_found',
        };
    }
    const evaluation = (0, agent_guard_1.evaluateAgentGuard)(repoRoot, artifact, session);
    await publishGuardEvaluation({ repoRoot, artifactPath: guardRead.path, evaluation });
    const refreshed = (0, governance_runtime_1.loadSession)(repoRoot, sessionId) || session;
    const agentGuardPosture = (0, governance_runtime_1.buildAgentGuardPostureSummary)(refreshed);
    const exitCode = resolveCursorGateExitCode({ pass: evaluation.pass });
    return {
        schemaVersion: exports.CURSOR_GATE_SCHEMA_VERSION,
        ok: evaluation.pass,
        exitCode,
        sessionId,
        agentGuardPosture,
        summary: {
            unverifiedWrites: evaluation.summary.unverifiedWrites,
            deniedButChanged: evaluation.summary.deniedButChanged,
            changedFiles: evaluation.summary.changedFiles,
        },
        remediation: buildRemediation(evaluation, sessionId),
        enforcement,
        evaluation,
        artifactPath: guardRead.path,
    };
}
function formatCursorGateCiErrors(payload) {
    if (payload.exitCode === 0)
        return [];
    const lines = [];
    if (payload.errorCode) {
        lines.push(`::error title=Neurcode cursor gate::${payload.error || payload.errorCode}`);
        return lines;
    }
    const violations = payload.evaluation?.changedFiles.filter((file) => file.classification === 'unverified_write' || file.classification === 'denied_but_changed') || [];
    if (violations.length === 0) {
        lines.push('::error title=Neurcode cursor gate::Guard attention required before push or merge.');
        return lines;
    }
    for (const file of violations.slice(0, 20)) {
        lines.push(`::error file=${file.path}::${file.classification.replace(/_/g, ' ')} (${file.changeType})`);
    }
    return lines;
}
function hookPinnedCliDir(repoRoot) {
    return (0, node_path_1.resolve)(repoRoot, '.neurcode', 'hooks-cli');
}
function hookPinnedCliPath(repoRoot) {
    return (0, node_path_1.resolve)(hookPinnedCliDir(repoRoot), 'node_modules', '.bin', 'neurcode');
}
function hookPinCliVersionsToTry() {
    const bundled = readBundledCliVersion();
    const versions = [];
    const add = (version) => {
        const trimmed = version?.trim();
        if (!trimmed || trimmed === 'unknown' || versions.includes(trimmed))
            return;
        versions.push(trimmed);
    };
    add(bundled);
    add(exports.MIN_CURSOR_GATE_CLI_VERSION);
    for (const fallback of ['0.15.6', '0.15.5', '0.15.4']) {
        add(fallback);
    }
    return versions;
}
function ensureHookPinnedCli(repoRoot) {
    const cliDir = hookPinnedCliDir(repoRoot);
    const cliPath = hookPinnedCliPath(repoRoot);
    if ((0, node_fs_1.existsSync)(cliPath)) {
        return { ok: true, cliPath, message: `Pinned hook CLI present at ${cliPath}` };
    }
    (0, node_fs_1.mkdirSync)(cliDir, { recursive: true });
    let lastMessage = 'Failed to install pinned hook CLI.';
    for (const version of hookPinCliVersionsToTry()) {
        const install = (0, node_child_process_1.spawnSync)('npm', ['install', '--prefix', cliDir, '--silent', '--no-save', `@neurcode-ai/cli@${version}`], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        if (install.status === 0 && (0, node_fs_1.existsSync)(cliPath)) {
            return { ok: true, cliPath, message: `Installed pinned hook CLI @${version} at ${cliPath}` };
        }
        lastMessage = install.stderr?.trim() || install.stdout?.trim() || lastMessage;
    }
    return { ok: false, cliPath, message: lastMessage };
}
function buildCursorGateHookScript(hookKind) {
    const gitAction = hookKind === 'pre-push' ? 'push' : 'commit';
    const blockedLabel = hookKind === 'pre-push' ? 'push' : 'commit';
    const beforeAction = hookKind === 'pre-push' ? 'pushing' : 'committing';
    return `#!/usr/bin/env bash
set -euo pipefail

# Neurcode Cursor fail-closed ${blockedLabel} gate (cooperative enforcement handoff).
# Emergency bypass (audited): NEURCODE_CURSOR_GATE_SKIP=1 git ${gitAction} ...

if [[ "\${NEURCODE_CURSOR_GATE_SKIP:-0}" == "1" ]]; then
  echo "⚠️  NEURCODE_CURSOR_GATE_SKIP=1 — cursor gate bypassed (audited emergency only)." >&2
  exit 0
fi

ROOT="\$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CLI=()
PINNED_CLI="\$ROOT/.neurcode/hooks-cli/node_modules/.bin/neurcode"
if [[ -x "\$PINNED_CLI" ]]; then
  CLI=("\$PINNED_CLI")
elif [[ -n "\${NEURCODE_CLI:-}" && -x "\${NEURCODE_CLI}" ]]; then
  CLI=("\${NEURCODE_CLI}")
elif command -v neurcode >/dev/null 2>&1 && neurcode cursor gate --help 2>&1 | grep -q 'Fail-closed'; then
  CLI=(neurcode)
else
  echo "❌ Neurcode cursor gate: neurcode CLI not found or too old (need @neurcode-ai/cli@${exports.MIN_CURSOR_GATE_CLI_VERSION}+). Run: neurcode cursor gate install --force" >&2
  exit 1
fi

set +e
OUTPUT=$("\${CLI[@]}" cursor gate --dir "\$ROOT" --explain 2>&1)
STATUS=\$?
set -e

if [[ "\$STATUS" == "0" ]]; then
  exit 0
fi

echo "\$OUTPUT" >&2
cat >&2 <<'MSG'

❌ Neurcode cursor gate blocked this ${blockedLabel}.

Unverified or denied-but-changed writes were detected in the active guarded session.
Finish the session, fix bypassed writes, or run agent checks before ${beforeAction}.

  Remediation:
  neurcode cursor health
  neurcode agent guard status --fail-on-unverified --explain
  neurcode agent guard finish --fail-on-unverified

Emergency bypass (audited):
  NEURCODE_CURSOR_GATE_SKIP=1 git ${gitAction} ...
MSG
exit "\$STATUS"
`;
}
function runGit(args, cwd) {
    const result = (0, node_child_process_1.spawnSync)('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status ?? 1 };
}
function resolveCursorGateHookKinds(hook) {
    if (hook === 'both')
        return ['pre-commit', 'pre-push'];
    if (hook === 'pre-commit')
        return ['pre-commit'];
    return ['pre-push'];
}
function stripNeurcodeHookFragment(existing, marker, endMarker) {
    if (!existing.includes(marker))
        return existing;
    const pattern = new RegExp(`\\n?${escapeRegExp(marker)}[\\s\\S]*?${escapeRegExp(endMarker)}\\n?`, 'g');
    return existing.replace(pattern, '\n').trimEnd();
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function installSingleCursorGateHook(input) {
    const hooksDir = (0, node_path_1.resolve)(input.repoRoot, '.githooks');
    const hookPath = (0, node_path_1.resolve)(hooksDir, input.hookKind);
    const preservedHookPath = (0, node_path_1.resolve)(hooksDir, `${input.hookKind}.neurcode-preserved`);
    const neurcodeHookPath = (0, node_path_1.resolve)(input.repoRoot, '.neurcode', 'hooks', input.hookKind);
    (0, node_fs_1.mkdirSync)((0, node_path_1.resolve)(input.repoRoot, '.neurcode', 'hooks'), { recursive: true });
    (0, node_fs_1.writeFileSync)(neurcodeHookPath, buildCursorGateHookScript(input.hookKind), 'utf8');
    (0, node_fs_1.chmodSync)(neurcodeHookPath, 0o755);
    const marker = '# >>> neurcode-cursor-gate >>>';
    const endMarker = '# <<< neurcode-cursor-gate <<<';
    const existing = (0, node_fs_1.existsSync)(hookPath) ? (0, node_fs_1.readFileSync)(hookPath, 'utf8') : '';
    if (existing.includes(marker) && !input.force) {
        const hooksPathResult = runGit(['config', '--get', 'core.hooksPath'], input.repoRoot);
        const configured = hooksPathResult.status === 0 ? hooksPathResult.stdout.trim() : '';
        return {
            ok: true,
            repoRoot: input.repoRoot,
            hooksPath: hooksDir,
            hookKind: input.hookKind,
            hookPath,
            neurcodeHookPath,
            hooksPathConfigured: configured === '.githooks' || configured === hooksDir,
            message: `Cursor gate ${input.hookKind} hook already installed. Use --force to rewrite.`,
        };
    }
    (0, node_fs_1.mkdirSync)(hooksDir, { recursive: true });
    const existingWithoutNeurcode = stripNeurcodeHookFragment(existing, marker, endMarker).trim();
    if (existingWithoutNeurcode) {
        (0, node_fs_1.writeFileSync)(preservedHookPath, existingWithoutNeurcode.endsWith('\n') ? existingWithoutNeurcode : `${existingWithoutNeurcode}\n`, 'utf8');
        (0, node_fs_1.chmodSync)(preservedHookPath, 0o755);
    }
    const preservedBlock = existingWithoutNeurcode
        ? `PRESERVED_HOOK="${preservedHookPath}"
if [[ -x "$PRESERVED_HOOK" ]]; then
  "$PRESERVED_HOOK" "$@"
fi

`
        : '';
    const merged = `#!/usr/bin/env bash
set -euo pipefail

# Neurcode-composed ${input.hookKind}. Existing hook logic runs first as a
# subprocess so an internal "exit 0" cannot make the Neurcode gate unreachable.
${preservedBlock}${marker}
# Neurcode Cursor fail-closed ${input.hookKind === 'pre-push' ? 'push' : 'commit'} gate
exec "${neurcodeHookPath}" "$@"
${endMarker}
`;
    (0, node_fs_1.writeFileSync)(hookPath, merged, 'utf8');
    (0, node_fs_1.chmodSync)(hookPath, 0o755);
    return {
        ok: true,
        repoRoot: input.repoRoot,
        hooksPath: hooksDir,
        hookKind: input.hookKind,
        hookPath,
        neurcodeHookPath,
        hooksPathConfigured: false,
        message: `Installed Neurcode cursor gate ${input.hookKind} hook.`,
    };
}
function installCursorGateHook(input) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(input.dir || process.cwd());
    const hookKinds = resolveCursorGateHookKinds(input.hook);
    const pinnedCli = ensureHookPinnedCli(repoRoot);
    const hooks = hookKinds.map((hookKind) => installSingleCursorGateHook({
        repoRoot,
        hookKind,
        force: input.force,
    }));
    if (!pinnedCli.ok) {
        for (const hook of hooks) {
            hook.ok = false;
            hook.message = `${hook.message} ${pinnedCli.message}`.trim();
        }
    }
    const setResult = runGit(['config', 'core.hooksPath', '.githooks'], repoRoot);
    const hooksPathConfigured = setResult.status === 0;
    for (const hook of hooks) {
        hook.hooksPathConfigured = hooksPathConfigured;
        if (!hooksPathConfigured)
            hook.ok = false;
    }
    const ok = hooksPathConfigured && hooks.every((hook) => hook.ok);
    const label = hookKinds.length === 2
        ? 'pre-commit and pre-push'
        : hookKinds[0] === 'pre-commit'
            ? 'pre-commit'
            : 'pre-push';
    return {
        ok,
        repoRoot,
        hooksPath: (0, node_path_1.resolve)(repoRoot, '.githooks'),
        hooks,
        hooksPathConfigured,
        message: hooksPathConfigured
            ? `Installed Neurcode cursor gate ${label} hook${hookKinds.length > 1 ? 's' : ''}.`
            : `Failed to set core.hooksPath: ${setResult.stderr || setResult.stdout}`,
    };
}
function doctorCursorGateHookKind(repoRoot, hookKind, required) {
    const checks = [];
    const neurcodeHookPath = (0, node_path_1.resolve)(repoRoot, '.neurcode', 'hooks', hookKind);
    const hookPath = (0, node_path_1.resolve)(repoRoot, '.githooks', hookKind);
    const prefix = hookKind.replace('-', '_');
    const neurcodeExists = (0, node_fs_1.existsSync)(neurcodeHookPath);
    const githookExists = (0, node_fs_1.existsSync)(hookPath);
    const installed = neurcodeExists || githookExists;
    if (!required && !installed) {
        checks.push({
            id: `${prefix}_optional`,
            status: 'skip',
            message: `${hookKind} hook not installed (optional unless --hook both).`,
        });
        return checks;
    }
    checks.push({
        id: `neurcode_hook_script_${prefix}`,
        status: neurcodeExists ? 'pass' : 'fail',
        message: neurcodeExists
            ? `Found ${neurcodeHookPath}`
            : `Missing ${neurcodeHookPath}. Run: neurcode cursor gate install --hook ${hookKind}`,
    });
    if (neurcodeExists) {
        try {
            const stat = (0, node_fs_1.statSync)(neurcodeHookPath);
            const executable = (stat.mode & 0o111) !== 0;
            checks.push({
                id: `neurcode_hook_executable_${prefix}`,
                status: executable ? 'pass' : 'fail',
                message: executable
                    ? `${hookKind} hook script is executable`
                    : `${hookKind} hook script is not executable`,
            });
        }
        catch (error) {
            checks.push({
                id: `neurcode_hook_executable_${prefix}`,
                status: 'fail',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    checks.push({
        id: `githooks_${prefix}`,
        status: githookExists ? 'pass' : 'fail',
        message: githookExists
            ? `Found ${hookPath}`
            : `Missing ${hookPath}. Run: neurcode cursor gate install --hook ${hookKind}`,
    });
    if (githookExists) {
        const content = (0, node_fs_1.readFileSync)(hookPath, 'utf8');
        checks.push({
            id: `githooks_fragment_${prefix}`,
            status: content.includes('neurcode-cursor-gate') ? 'pass' : 'fail',
            message: content.includes('neurcode-cursor-gate')
                ? `${hookKind} delegates to Neurcode cursor gate`
                : `${hookKind} missing neurcode-cursor-gate marker`,
        });
    }
    return checks;
}
function doctorCursorGateHook(input) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(input.dir || process.cwd());
    const cliVersionWarning = buildCliVersionStaleWarning();
    const prePushInstalled = (0, node_fs_1.existsSync)((0, node_path_1.resolve)(repoRoot, '.githooks', 'pre-push'))
        || (0, node_fs_1.existsSync)((0, node_path_1.resolve)(repoRoot, '.neurcode', 'hooks', 'pre-push'));
    const preCommitInstalled = (0, node_fs_1.existsSync)((0, node_path_1.resolve)(repoRoot, '.githooks', 'pre-commit'))
        || (0, node_fs_1.existsSync)((0, node_path_1.resolve)(repoRoot, '.neurcode', 'hooks', 'pre-commit'));
    const requirePreCommit = preCommitInstalled;
    const requirePrePush = prePushInstalled || !preCommitInstalled;
    const checks = [
        ...doctorCursorGateHookKind(repoRoot, 'pre-push', requirePrePush),
        ...doctorCursorGateHookKind(repoRoot, 'pre-commit', requirePreCommit),
    ];
    const hooksPathResult = runGit(['config', '--get', 'core.hooksPath'], repoRoot);
    const configured = hooksPathResult.status === 0 ? hooksPathResult.stdout.trim() : '';
    const expected = '.githooks';
    const hooksNeeded = prePushInstalled || preCommitInstalled;
    checks.push({
        id: 'core_hooks_path',
        status: !hooksNeeded || configured === expected || configured === (0, node_path_1.resolve)(repoRoot, '.githooks')
            ? 'pass'
            : 'fail',
        message: configured
            ? `core.hooksPath=${configured}`
            : hooksNeeded
                ? 'core.hooksPath is unset. Run: neurcode cursor gate install'
                : 'core.hooksPath is unset (no hooks installed yet).',
    });
    if (cliVersionWarning) {
        checks.push({
            id: 'cli_version_stale',
            status: 'fail',
            message: cliVersionWarning.message,
        });
    }
    const mcpAdoption = (0, cursor_mcp_agent_1.inspectCursorMcpAdoptionPath)(repoRoot);
    for (const check of mcpAdoption.checks) {
        checks.push({
            id: check.id,
            status: check.status === 'warn' ? 'fail' : check.status,
            message: check.message,
        });
    }
    return {
        ok: checks.every((check) => check.status === 'pass'),
        checks,
        repoRoot,
        cliVersionWarning,
        mcpAdoption,
    };
}
//# sourceMappingURL=cursor-gate.js.map