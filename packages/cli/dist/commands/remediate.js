"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.remediateCommand = remediateCommand;
const crypto_1 = require("crypto");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const project_root_1 = require("../utils/project-root");
const manual_approvals_1 = require("../utils/manual-approvals");
const core_1 = require("@neurcode-ai/core");
const analysis_1 = require("@neurcode-ai/analysis");
const cli_json_1 = require("../utils/cli-json");
const chalk = (0, cli_json_1.loadChalk)();
function emitJson(payload) {
    (0, cli_json_1.emitJson)(payload);
}
function resolveStrictArtifacts(options) {
    if (options.strictArtifacts === true)
        return true;
    if (options.strictArtifacts === false)
        return false;
    return process.env.NEURCODE_ENTERPRISE_MODE === '1' || process.env.CI === 'true';
}
function resolveEnforceChangeContract(options, strictArtifacts) {
    if (options.enforceChangeContract === true)
        return true;
    if (options.enforceChangeContract === false)
        return false;
    if (process.env.NEURCODE_VERIFY_ENFORCE_CHANGE_CONTRACT === '1')
        return true;
    return strictArtifacts;
}
function resolveRequireRuntimeGuard(options) {
    if (options.requireRuntimeGuard === true)
        return true;
    if (options.requireRuntimeGuard === false)
        return false;
    return process.env.NEURCODE_REMEDIATE_REQUIRE_RUNTIME_GUARD === '1';
}
function parsePositiveInt(raw) {
    if (!raw)
        return null;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return null;
    return parsed;
}
function resolveRequireApproval(options) {
    if (options.requireApproval === true)
        return true;
    if (options.requireApproval === false)
        return false;
    return process.env.NEURCODE_REMEDIATE_REQUIRE_APPROVAL === '1';
}
function resolveMinApprovals(options) {
    if (Number.isFinite(options.minApprovals)) {
        return Math.max(1, Math.min(5, Math.floor(Number(options.minApprovals))));
    }
    const envValue = parsePositiveInt(process.env.NEURCODE_REMEDIATE_MIN_APPROVALS);
    if (envValue != null) {
        return Math.max(1, Math.min(5, envValue));
    }
    return 1;
}
function resolveRollbackOnRegression(options) {
    if (options.rollbackOnRegression === true)
        return true;
    if (options.rollbackOnRegression === false)
        return false;
    if (process.env.NEURCODE_REMEDIATE_ROLLBACK_ON_REGRESSION === '0')
        return false;
    return true;
}
function resolveRequireRollbackSnapshot(options) {
    if (options.requireRollbackSnapshot === true)
        return true;
    if (options.requireRollbackSnapshot === false)
        return false;
    if (process.env.NEURCODE_ENTERPRISE_MODE === '1')
        return true;
    return process.env.NEURCODE_REMEDIATE_REQUIRE_ROLLBACK_SNAPSHOT === '1';
}
function resolveSnapshotLimits(options) {
    const maxFiles = Number.isFinite(options.snapshotMaxFiles)
        ? Math.max(100, Math.floor(Number(options.snapshotMaxFiles)))
        : (parsePositiveInt(process.env.NEURCODE_REMEDIATE_SNAPSHOT_MAX_FILES) || 5000);
    const maxBytes = Number.isFinite(options.snapshotMaxBytes)
        ? Math.max(5_000_000, Math.floor(Number(options.snapshotMaxBytes)))
        : (parsePositiveInt(process.env.NEURCODE_REMEDIATE_SNAPSHOT_MAX_BYTES) || 128_000_000);
    const maxFileBytes = Number.isFinite(options.snapshotMaxFileBytes)
        ? Math.max(100_000, Math.floor(Number(options.snapshotMaxFileBytes)))
        : (parsePositiveInt(process.env.NEURCODE_REMEDIATE_SNAPSHOT_MAX_FILE_BYTES) || 8_000_000);
    return {
        maxFiles,
        maxBytes,
        maxFileBytes,
    };
}
function resolveApprovalCommitSha(projectRoot, explicitCommit) {
    if (explicitCommit && explicitCommit.trim()) {
        return explicitCommit.trim().toLowerCase();
    }
    const run = (0, child_process_1.spawnSync)('git', ['rev-parse', 'HEAD'], {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (run.status !== 0) {
        return null;
    }
    const sha = String(run.stdout || '').trim().toLowerCase();
    return sha || null;
}
function resolveApprovalState(projectRoot, commitSha, minApprovals) {
    if (!commitSha) {
        return {
            commitSha: null,
            distinctApprovers: 0,
            satisfied: false,
            message: 'Unable to resolve HEAD commit for manual approval gating.',
        };
    }
    const approvals = (0, manual_approvals_1.getManualApprovalsForCommit)(projectRoot, commitSha);
    const distinctApprovers = (0, manual_approvals_1.countDistinctApprovers)(approvals);
    const satisfied = distinctApprovers >= minApprovals;
    const message = satisfied
        ? `Manual approvals satisfied (${distinctApprovers}/${minApprovals}) for commit ${commitSha}.`
        : `Manual approvals required (${distinctApprovers}/${minApprovals}) for commit ${commitSha}.`;
    return {
        commitSha,
        distinctApprovers,
        satisfied,
        message,
    };
}
function parseNulSeparated(raw) {
    return raw
        .split('\u0000')
        .map((entry) => entry.trim())
        .filter(Boolean);
}
function runGitCapture(projectRoot, args) {
    const run = (0, child_process_1.spawnSync)('git', args, {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
        ok: run.status === 0,
        stdout: String(run.stdout || ''),
        stderr: String(run.stderr || ''),
    };
}
function listSnapshotPaths(projectRoot) {
    const tracked = runGitCapture(projectRoot, ['ls-files', '-z']);
    if (!tracked.ok) {
        return {
            paths: [],
            error: `git ls-files failed: ${tracked.stderr.trim() || 'unknown error'}`,
        };
    }
    const untracked = runGitCapture(projectRoot, ['ls-files', '--others', '--exclude-standard', '-z']);
    if (!untracked.ok) {
        return {
            paths: [],
            error: `git ls-files --others failed: ${untracked.stderr.trim() || 'unknown error'}`,
        };
    }
    const unique = new Set();
    for (const entry of [...parseNulSeparated(tracked.stdout), ...parseNulSeparated(untracked.stdout)]) {
        const normalized = entry.replace(/\\/g, '/').replace(/^\.\//, '').trim();
        if (!normalized || normalized.startsWith('.git/'))
            continue;
        if (normalized.includes('\u0000'))
            continue;
        unique.add(normalized);
    }
    return {
        paths: [...unique].sort((a, b) => a.localeCompare(b)),
        error: null,
    };
}
function withinProject(projectRoot, relativePath) {
    if (!relativePath)
        return false;
    if (relativePath.startsWith('/'))
        return false;
    if (relativePath.startsWith('../'))
        return false;
    const normalized = relativePath.replace(/\\/g, '/');
    if (normalized.includes('/../') || normalized === '..')
        return false;
    const absolute = (0, path_1.resolve)(projectRoot, relativePath);
    return absolute === projectRoot || absolute.startsWith(`${projectRoot}${path_1.sep}`);
}
function createRollbackSnapshot(projectRoot, limits) {
    const listed = listSnapshotPaths(projectRoot);
    if (listed.error) {
        return {
            snapshot: null,
            message: listed.error,
        };
    }
    if (listed.paths.length > limits.maxFiles) {
        return {
            snapshot: null,
            message: `rollback snapshot skipped: ${listed.paths.length} files exceeds maxFiles=${limits.maxFiles}`,
        };
    }
    const snapshotId = `snapshot-${Date.now()}`;
    const rootDir = (0, path_1.join)(projectRoot, '.neurcode', 'remediate', 'snapshots', snapshotId);
    const filesDir = (0, path_1.join)(rootDir, 'files');
    (0, fs_1.mkdirSync)(filesDir, { recursive: true });
    const files = [];
    let totalBytes = 0;
    for (const relativePath of listed.paths) {
        if (!withinProject(projectRoot, relativePath)) {
            (0, fs_1.rmSync)(rootDir, { recursive: true, force: true });
            return {
                snapshot: null,
                message: `rollback snapshot skipped unsafe path: ${relativePath}`,
            };
        }
        const absolutePath = (0, path_1.join)(projectRoot, relativePath);
        let stats;
        try {
            stats = (0, fs_1.statSync)(absolutePath);
        }
        catch {
            continue;
        }
        if (!stats.isFile())
            continue;
        const fileSize = Number(stats.size) || 0;
        if (fileSize > limits.maxFileBytes) {
            (0, fs_1.rmSync)(rootDir, { recursive: true, force: true });
            return {
                snapshot: null,
                message: `rollback snapshot skipped: ${relativePath} size ${fileSize} exceeds maxFileBytes=${limits.maxFileBytes}`,
            };
        }
        totalBytes += fileSize;
        if (totalBytes > limits.maxBytes) {
            (0, fs_1.rmSync)(rootDir, { recursive: true, force: true });
            return {
                snapshot: null,
                message: `rollback snapshot skipped: total bytes ${totalBytes} exceeds maxBytes=${limits.maxBytes}`,
            };
        }
        const content = (0, fs_1.readFileSync)(absolutePath);
        const snapshotFilePath = (0, path_1.join)(filesDir, relativePath);
        (0, fs_1.mkdirSync)((0, path_1.dirname)(snapshotFilePath), { recursive: true });
        (0, fs_1.writeFileSync)(snapshotFilePath, content);
        files.push({
            path: relativePath,
            sha256: (0, crypto_1.createHash)('sha256').update(content).digest('hex'),
            size: fileSize,
        });
    }
    const manifestPath = (0, path_1.join)(rootDir, 'manifest.json');
    (0, fs_1.writeFileSync)(manifestPath, JSON.stringify({
        snapshotId,
        createdAt: new Date().toISOString(),
        projectRoot,
        totalBytes,
        fileCount: files.length,
        limits,
        files,
    }, null, 2) + '\n', 'utf-8');
    return {
        snapshot: {
            snapshotId,
            rootDir,
            filesDir,
            files,
            totalBytes,
        },
        message: `rollback snapshot created (${files.length} files, ${totalBytes} bytes)`,
    };
}
function restoreRollbackSnapshot(projectRoot, snapshot) {
    const listed = listSnapshotPaths(projectRoot);
    if (listed.error) {
        return {
            restored: false,
            message: `rollback restore failed: ${listed.error}`,
        };
    }
    const snapshotPaths = new Set(snapshot.files.map((entry) => entry.path));
    const snapshotRootRelative = snapshot.rootDir
        .replace(projectRoot, '')
        .replace(/^[\\/]+/, '')
        .replace(/\\/g, '/');
    let removedCount = 0;
    for (const currentPath of listed.paths) {
        if (currentPath.startsWith('.git/'))
            continue;
        if (snapshotRootRelative
            && (currentPath === snapshotRootRelative || currentPath.startsWith(`${snapshotRootRelative}/`))) {
            continue;
        }
        if (snapshotPaths.has(currentPath))
            continue;
        if (!withinProject(projectRoot, currentPath))
            continue;
        const absolutePath = (0, path_1.join)(projectRoot, currentPath);
        try {
            const stats = (0, fs_1.statSync)(absolutePath);
            if (!stats.isFile())
                continue;
            (0, fs_1.rmSync)(absolutePath, { force: true });
            removedCount += 1;
        }
        catch {
            // Ignore best-effort cleanup failures.
        }
    }
    let restoredCount = 0;
    for (const entry of snapshot.files) {
        if (!withinProject(projectRoot, entry.path)) {
            return {
                restored: false,
                message: `rollback restore aborted due to unsafe snapshot path: ${entry.path}`,
            };
        }
        const source = (0, path_1.join)(snapshot.filesDir, entry.path);
        const destination = (0, path_1.join)(projectRoot, entry.path);
        if (!(0, fs_1.existsSync)(source)) {
            return {
                restored: false,
                message: `rollback restore failed: missing snapshot file ${entry.path}`,
            };
        }
        (0, fs_1.mkdirSync)((0, path_1.dirname)(destination), { recursive: true });
        (0, fs_1.copyFileSync)(source, destination);
        restoredCount += 1;
    }
    return {
        restored: true,
        message: `rollback restored ${restoredCount} files and removed ${removedCount} generated files`,
    };
}
function cleanupRollbackSnapshot(snapshot) {
    if (!snapshot)
        return;
    try {
        (0, fs_1.rmSync)(snapshot.rootDir, { recursive: true, force: true });
    }
    catch {
        // Ignore cleanup errors.
    }
}
function buildVerifyArgs(options, strictArtifacts, enforceChangeContract) {
    const args = ['verify'];
    if (options.planId)
        args.push('--plan-id', options.planId);
    if (options.projectId)
        args.push('--project-id', options.projectId);
    if (options.policyOnly)
        args.push('--policy-only');
    if (options.requirePlan)
        args.push('--require-plan');
    if (options.requirePolicyLock)
        args.push('--require-policy-lock');
    if (options.skipPolicyLock)
        args.push('--skip-policy-lock');
    if (strictArtifacts)
        args.push('--strict-artifacts');
    if (enforceChangeContract)
        args.push('--enforce-change-contract');
    if (options.noRecord !== true)
        args.push('--record');
    return args;
}
function buildShipArgs(options) {
    const maxFixAttempts = 1;
    const goal = options.goal?.trim() || 'Auto-remediate governance verification violations';
    const args = ['ship', goal, '--max-fix-attempts', String(maxFixAttempts), '--require-pass'];
    if (options.projectId)
        args.push('--project-id', options.projectId);
    if (options.skipTests !== false)
        args.push('--skip-tests');
    if (options.requirePolicyLock)
        args.push('--require-policy-lock');
    if (options.skipPolicyLock)
        args.push('--skip-policy-lock');
    if (options.noRecord === true)
        args.push('--no-record');
    if (options.publishCard === false)
        args.push('--no-publish-card');
    return args;
}
function isVerifyPass(snapshot) {
    return snapshot.exitCode === 0 && snapshot.verdict === 'PASS';
}
function toVerifySnapshot(result) {
    return {
        exitCode: result.exitCode,
        verdict: (0, cli_json_1.asString)(result.payload, 'verdict'),
        score: (0, cli_json_1.asNumber)(result.payload, 'score'),
        message: (0, cli_json_1.asString)(result.payload, 'message'),
        violations: (0, cli_json_1.asViolationsCount)(result.payload),
    };
}
function hasImproved(before, after) {
    if (isVerifyPass(after))
        return true;
    if (after.violations < before.violations)
        return true;
    if (typeof before.score === 'number'
        && typeof after.score === 'number'
        && Number.isFinite(before.score)
        && Number.isFinite(after.score)
        && after.score > before.score) {
        return true;
    }
    return false;
}
function resolveAutoRepairAiLog(options) {
    if (options.autoRepairAiLog === true)
        return true;
    if (options.autoRepairAiLog === false)
        return false;
    if (process.env.NEURCODE_REMEDIATE_AUTO_REPAIR_AI_LOG === '0')
        return false;
    return true;
}
function parseSigningKeyRing(raw) {
    if (!raw || !raw.trim()) {
        return {};
    }
    const out = {};
    for (const token of raw.split(/[,\n;]+/)) {
        const trimmed = token.trim();
        if (!trimmed)
            continue;
        const separator = trimmed.indexOf('=');
        if (separator <= 0)
            continue;
        const keyId = trimmed.slice(0, separator).trim();
        const key = trimmed.slice(separator + 1).trim();
        if (!keyId || !key)
            continue;
        out[keyId] = key;
    }
    return out;
}
function resolveAiLogSigningConfig() {
    const signingKeys = parseSigningKeyRing(process.env.NEURCODE_GOVERNANCE_SIGNING_KEYS);
    const envSigningKey = process.env.NEURCODE_GOVERNANCE_SIGNING_KEY?.trim()
        || process.env.NEURCODE_AI_LOG_SIGNING_KEY?.trim()
        || '';
    let signingKey = envSigningKey || null;
    let signingKeyId = process.env.NEURCODE_GOVERNANCE_SIGNING_KEY_ID?.trim() || null;
    if (!signingKey && Object.keys(signingKeys).length > 0) {
        if (signingKeyId && signingKeys[signingKeyId]) {
            signingKey = signingKeys[signingKeyId];
        }
        else {
            const fallbackKeyId = Object.keys(signingKeys).sort((a, b) => a.localeCompare(b))[0];
            signingKey = signingKeys[fallbackKeyId];
            signingKeyId = signingKeyId || fallbackKeyId;
        }
    }
    const signer = process.env.NEURCODE_GOVERNANCE_SIGNER?.trim()
        || process.env.USER
        || 'neurcode-cli';
    return {
        signingKey,
        signingKeyId,
        signer,
    };
}
function isAiChangeJustification(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const candidate = value;
    return (typeof candidate.task === 'string'
        && typeof candidate.generatedAt === 'string'
        && Array.isArray(candidate.changes));
}
function extractChangeJustificationFromLog(projectRoot) {
    const logPath = (0, core_1.resolveNeurcodeFile)(projectRoot, core_1.AI_CHANGE_LOG_FILENAME);
    const raw = (0, core_1.readJsonFile)(logPath, null);
    if (!raw)
        return null;
    if (isAiChangeJustification(raw)) {
        return raw;
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        const envelope = raw;
        const nested = envelope.changeJustification;
        if (isAiChangeJustification(nested)) {
            return nested;
        }
    }
    return null;
}
function shouldAttemptAiLogRepair(verifyRun) {
    const payloadMessage = (0, cli_json_1.asString)(verifyRun.payload, 'message') || '';
    const combined = `${payloadMessage}\n${verifyRun.stdout}\n${verifyRun.stderr}`.toLowerCase();
    if (combined.includes('ai change-log integrity check failed')) {
        return true;
    }
    const violations = verifyRun.payload?.violations;
    if (Array.isArray(violations)) {
        for (const entry of violations) {
            if (!entry || typeof entry !== 'object')
                continue;
            const rule = entry.rule;
            if (typeof rule === 'string' && rule.toLowerCase().includes('ai_change_log_integrity')) {
                return true;
            }
        }
    }
    return false;
}
function attemptAiLogIntegrityRepair(projectRoot) {
    const payload = extractChangeJustificationFromLog(projectRoot);
    if (!payload) {
        return {
            attempted: true,
            repaired: false,
            backupPath: null,
            message: 'No valid AI change-log payload found to repair.',
        };
    }
    const auditPath = (0, core_1.resolveNeurcodeFile)(projectRoot, core_1.AI_CHANGE_LOG_AUDIT_FILENAME);
    let backupPath = null;
    try {
        if ((0, fs_1.existsSync)(auditPath)) {
            backupPath = `${auditPath}.backup.${Date.now()}`;
            (0, fs_1.copyFileSync)(auditPath, backupPath);
            (0, fs_1.unlinkSync)(auditPath);
        }
    }
    catch (error) {
        return {
            attempted: true,
            repaired: false,
            backupPath,
            message: `Failed to prepare AI log audit repair: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
    try {
        const signing = resolveAiLogSigningConfig();
        (0, analysis_1.writeAiChangeLogWithIntegrity)(projectRoot, payload, {
            signingKey: signing.signingKey,
            keyId: signing.signingKeyId,
            signer: signing.signer,
        });
        return {
            attempted: true,
            repaired: true,
            backupPath,
            message: backupPath
                ? `AI change-log integrity repaired (audit backup: ${backupPath}).`
                : 'AI change-log integrity repaired.',
        };
    }
    catch (error) {
        return {
            attempted: true,
            repaired: false,
            backupPath,
            message: `AI change-log repair failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}
async function remediateCommand(options = {}) {
    const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const strictArtifacts = resolveStrictArtifacts(options);
    const enforceChangeContract = resolveEnforceChangeContract(options, strictArtifacts);
    const requireRuntimeGuard = resolveRequireRuntimeGuard(options);
    const requireApproval = resolveRequireApproval(options);
    const minApprovals = resolveMinApprovals(options);
    const approvalCommit = resolveApprovalCommitSha(projectRoot, options.approvalCommit);
    const autoRepairAiLog = resolveAutoRepairAiLog(options);
    const rollbackOnRegression = resolveRollbackOnRegression(options);
    const requireRollbackSnapshot = resolveRequireRollbackSnapshot(options);
    const snapshotLimits = resolveSnapshotLimits(options);
    const maxAttempts = Number.isFinite(options.maxFixAttempts) && Number(options.maxFixAttempts) >= 0
        ? Math.floor(Number(options.maxFixAttempts))
        : 2;
    try {
        let baselineVerifyRun = await (0, cli_json_1.runCliJson)(buildVerifyArgs(options, strictArtifacts, enforceChangeContract));
        let currentSnapshot = toVerifySnapshot(baselineVerifyRun);
        let aiLogRepair = {
            attempted: false,
            repaired: false,
            backupPath: null,
            message: null,
        };
        if (autoRepairAiLog && !isVerifyPass(currentSnapshot) && shouldAttemptAiLogRepair(baselineVerifyRun)) {
            aiLogRepair = attemptAiLogIntegrityRepair(projectRoot);
            if (aiLogRepair.repaired) {
                baselineVerifyRun = await (0, cli_json_1.runCliJson)(buildVerifyArgs(options, strictArtifacts, enforceChangeContract));
                currentSnapshot = toVerifySnapshot(baselineVerifyRun);
            }
        }
        const attempts = [];
        let stopReason = 'verify_passed_without_remediation';
        if (isVerifyPass(currentSnapshot)) {
            const output = {
                success: true,
                remediated: false,
                preflight: {
                    aiLogRepair,
                },
                strictMode: {
                    strictArtifacts,
                    enforceChangeContract,
                    requireRuntimeGuard,
                },
                governance: {
                    requireApproval,
                    minApprovals,
                    approvalCommit,
                    rollbackOnRegression,
                    requireRollbackSnapshot,
                    snapshotLimits: {
                        maxFiles: snapshotLimits.maxFiles,
                        maxBytes: snapshotLimits.maxBytes,
                        maxFileBytes: snapshotLimits.maxFileBytes,
                    },
                },
                baseline: currentSnapshot,
                attempts,
                finalVerify: currentSnapshot,
                stopReason,
                message: 'Verify already passed. No remediation required.',
                timestamp: new Date().toISOString(),
            };
            if (options.json) {
                emitJson(output);
            }
            else {
                console.log(chalk.bold.cyan('\n🛠️  Neurcode Remediate\n'));
                if (aiLogRepair.attempted) {
                    console.log(aiLogRepair.repaired
                        ? chalk.green(`✅ ${aiLogRepair.message || 'AI change-log integrity repaired.'}`)
                        : chalk.yellow(`⚠️  ${aiLogRepair.message || 'AI change-log integrity repair was attempted but did not complete.'}`));
                }
                console.log(chalk.green('✅ Verify already PASS. No remediation required.'));
            }
            return;
        }
        if (maxAttempts === 0) {
            stopReason = 'max_attempts_zero';
            const output = {
                success: false,
                remediated: false,
                preflight: {
                    aiLogRepair,
                },
                strictMode: {
                    strictArtifacts,
                    enforceChangeContract,
                    requireRuntimeGuard,
                },
                governance: {
                    requireApproval,
                    minApprovals,
                    approvalCommit,
                    rollbackOnRegression,
                    requireRollbackSnapshot,
                    snapshotLimits: {
                        maxFiles: snapshotLimits.maxFiles,
                        maxBytes: snapshotLimits.maxBytes,
                        maxFileBytes: snapshotLimits.maxFileBytes,
                    },
                },
                baseline: currentSnapshot,
                attempts,
                finalVerify: currentSnapshot,
                stopReason,
                message: 'Remediation attempts disabled (--max-fix-attempts 0).',
                timestamp: new Date().toISOString(),
            };
            if (options.json) {
                emitJson(output);
            }
            else {
                console.log(chalk.bold.cyan('\n🛠️  Neurcode Remediate\n'));
                console.log(chalk.red('❌ Remediation attempts disabled and verify is not PASS.'));
            }
            process.exit(1);
        }
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const attemptSummary = {
                attempt,
                before: currentSnapshot,
                approval: {
                    required: requireApproval,
                    satisfied: !requireApproval,
                    commitSha: approvalCommit,
                    minimumApprovals: minApprovals,
                    distinctApprovers: 0,
                    message: requireApproval ? 'Approval check pending.' : 'Approval gate disabled.',
                },
                runtimeGuard: {
                    executed: false,
                    pass: null,
                    message: null,
                },
                ship: {
                    executed: false,
                    exitCode: null,
                    status: null,
                    finalPlanId: null,
                },
                after: null,
                improved: null,
                delta: {
                    score: null,
                    violations: null,
                },
                rollback: {
                    snapshotCreated: false,
                    snapshotId: null,
                    restored: false,
                    postRollbackVerify: null,
                    message: rollbackOnRegression ? 'Rollback snapshot pending.' : 'Rollback disabled.',
                },
                stopReason: null,
            };
            if (requireApproval) {
                const approvalState = resolveApprovalState(projectRoot, approvalCommit, minApprovals);
                attemptSummary.approval.commitSha = approvalState.commitSha;
                attemptSummary.approval.distinctApprovers = approvalState.distinctApprovers;
                attemptSummary.approval.satisfied = approvalState.satisfied;
                attemptSummary.approval.message = approvalState.message;
                if (!approvalState.satisfied) {
                    attemptSummary.stopReason = 'approval_required';
                    attempts.push(attemptSummary);
                    stopReason = 'approval_required';
                    break;
                }
            }
            let rollbackSnapshot = null;
            if (rollbackOnRegression) {
                const snapshotResult = createRollbackSnapshot(projectRoot, snapshotLimits);
                if (snapshotResult.snapshot) {
                    rollbackSnapshot = snapshotResult.snapshot;
                    attemptSummary.rollback.snapshotCreated = true;
                    attemptSummary.rollback.snapshotId = rollbackSnapshot.snapshotId;
                    attemptSummary.rollback.message = snapshotResult.message;
                }
                else {
                    attemptSummary.rollback.message = snapshotResult.message;
                    if (requireRollbackSnapshot) {
                        attemptSummary.stopReason = 'rollback_snapshot_unavailable';
                        attempts.push(attemptSummary);
                        stopReason = 'rollback_snapshot_unavailable';
                        break;
                    }
                }
            }
            if (requireRuntimeGuard) {
                attemptSummary.runtimeGuard.executed = true;
                const guardRun = await (0, cli_json_1.runCliJson)(['guard', 'check', '--head']);
                const guardPass = guardRun.exitCode === 0;
                attemptSummary.runtimeGuard.pass = guardPass;
                attemptSummary.runtimeGuard.message =
                    (0, cli_json_1.asString)(guardRun.payload, 'message')
                        || (guardPass ? 'Runtime guard check passed.' : 'Runtime guard check failed.');
                if (!guardPass) {
                    cleanupRollbackSnapshot(rollbackSnapshot);
                    attemptSummary.stopReason = 'runtime_guard_blocked';
                    attempts.push(attemptSummary);
                    stopReason = 'runtime_guard_blocked';
                    break;
                }
            }
            const shipRun = await (0, cli_json_1.runCliJson)(buildShipArgs(options));
            attemptSummary.ship.executed = true;
            attemptSummary.ship.exitCode = shipRun.exitCode;
            attemptSummary.ship.status = (0, cli_json_1.asString)(shipRun.payload, 'status');
            attemptSummary.ship.finalPlanId = (0, cli_json_1.asString)(shipRun.payload, 'finalPlanId');
            const afterVerifyRun = await (0, cli_json_1.runCliJson)(buildVerifyArgs(options, strictArtifacts, enforceChangeContract));
            const afterSnapshot = toVerifySnapshot(afterVerifyRun);
            attemptSummary.after = afterSnapshot;
            attemptSummary.delta = {
                score: typeof currentSnapshot.score === 'number' && typeof afterSnapshot.score === 'number'
                    ? afterSnapshot.score - currentSnapshot.score
                    : null,
                violations: afterSnapshot.violations - currentSnapshot.violations,
            };
            attemptSummary.improved = hasImproved(currentSnapshot, afterSnapshot);
            if (attemptSummary.improved === false && rollbackOnRegression) {
                if (rollbackSnapshot) {
                    const restoreResult = restoreRollbackSnapshot(projectRoot, rollbackSnapshot);
                    attemptSummary.rollback.restored = restoreResult.restored;
                    attemptSummary.rollback.message = restoreResult.message;
                    if (!restoreResult.restored && requireRollbackSnapshot) {
                        attemptSummary.stopReason = 'rollback_restore_failed';
                        attempts.push(attemptSummary);
                        stopReason = 'rollback_restore_failed';
                        cleanupRollbackSnapshot(rollbackSnapshot);
                        break;
                    }
                    if (restoreResult.restored) {
                        const rollbackVerifyRun = await (0, cli_json_1.runCliJson)(buildVerifyArgs(options, strictArtifacts, enforceChangeContract));
                        const rollbackSnapshotVerify = toVerifySnapshot(rollbackVerifyRun);
                        attemptSummary.rollback.postRollbackVerify = rollbackSnapshotVerify;
                        currentSnapshot = rollbackSnapshotVerify;
                    }
                    else {
                        currentSnapshot = afterSnapshot;
                    }
                }
                else {
                    attemptSummary.rollback.message = 'Rollback requested but snapshot was not available for this attempt.';
                    currentSnapshot = afterSnapshot;
                }
            }
            else {
                currentSnapshot = afterSnapshot;
            }
            cleanupRollbackSnapshot(rollbackSnapshot);
            attempts.push(attemptSummary);
            if (isVerifyPass(afterSnapshot)) {
                stopReason = 'verify_passed_after_remediation';
                break;
            }
            if (!attemptSummary.improved) {
                attemptSummary.stopReason = 'no_progress';
                stopReason = 'no_progress';
                break;
            }
            if (attempt === maxAttempts) {
                stopReason = 'max_attempts_exhausted';
            }
        }
        const success = isVerifyPass(currentSnapshot);
        const output = {
            success,
            remediated: attempts.length > 0,
            preflight: {
                aiLogRepair,
            },
            strictMode: {
                strictArtifacts,
                enforceChangeContract,
                requireRuntimeGuard,
            },
            governance: {
                requireApproval,
                minApprovals,
                approvalCommit,
                rollbackOnRegression,
                requireRollbackSnapshot,
                snapshotLimits: {
                    maxFiles: snapshotLimits.maxFiles,
                    maxBytes: snapshotLimits.maxBytes,
                    maxFileBytes: snapshotLimits.maxFileBytes,
                },
            },
            baseline: toVerifySnapshot(baselineVerifyRun),
            attempts,
            finalVerify: currentSnapshot,
            stopReason,
            message: success
                ? 'Auto-remediation completed and verify now passes.'
                : 'Auto-remediation finished but verify is still not PASS.',
            timestamp: new Date().toISOString(),
        };
        if (options.json) {
            emitJson(output);
            process.exit(success ? 0 : 1);
        }
        console.log(chalk.bold.cyan('\n🛠️  Neurcode Remediate\n'));
        if (output.preflight.aiLogRepair.attempted) {
            console.log(output.preflight.aiLogRepair.repaired
                ? chalk.green(`✅ ${output.preflight.aiLogRepair.message || 'AI change-log integrity repaired before remediation.'}`)
                : chalk.yellow(`⚠️  ${output.preflight.aiLogRepair.message || 'AI change-log integrity repair was attempted but did not complete.'}`));
            if (output.preflight.aiLogRepair.backupPath) {
                console.log(chalk.dim(`   Audit backup: ${output.preflight.aiLogRepair.backupPath}`));
            }
        }
        console.log(chalk.dim(`Baseline verify: ${output.baseline.verdict || 'UNKNOWN'}`
            + `${output.baseline.score != null ? ` (score ${output.baseline.score})` : ''}`
            + `, violations: ${output.baseline.violations}`));
        console.log(chalk.dim(`Strict mode: artifacts=${strictArtifacts ? 'on' : 'off'}, `
            + `change-contract=${enforceChangeContract ? 'on' : 'off'}, `
            + `runtime-guard=${requireRuntimeGuard ? 'required' : 'optional'}`));
        console.log(chalk.dim(`Governance: approval=${requireApproval ? `required(${minApprovals})` : 'optional'}, `
            + `rollback=${rollbackOnRegression ? 'on' : 'off'}`
            + `${rollbackOnRegression ? ` [maxFiles=${snapshotLimits.maxFiles}, maxBytes=${snapshotLimits.maxBytes}]` : ''}`));
        for (const attempt of output.attempts) {
            const after = attempt.after;
            const afterLabel = after
                ? `${after.verdict || 'UNKNOWN'}${after.score != null ? ` (score ${after.score})` : ''}, violations: ${after.violations}`
                : 'n/a';
            console.log(chalk.dim(`Attempt ${attempt.attempt}: ship=${attempt.ship.status || 'UNKNOWN'}, verify=${afterLabel}`));
            if (attempt.runtimeGuard.executed) {
                console.log(chalk.dim(`  runtime guard: ${attempt.runtimeGuard.pass ? 'pass' : 'block'}`
                    + `${attempt.runtimeGuard.message ? ` (${attempt.runtimeGuard.message})` : ''}`));
            }
            if (attempt.approval.required) {
                console.log(chalk.dim(`  approvals: ${attempt.approval.satisfied ? 'satisfied' : 'blocked'} `
                    + `(${attempt.approval.distinctApprovers}/${attempt.approval.minimumApprovals})`
                    + `${attempt.approval.commitSha ? ` on ${attempt.approval.commitSha}` : ''}`));
            }
            if (attempt.rollback.snapshotCreated || attempt.rollback.restored || attempt.rollback.message) {
                const rollbackPrefix = attempt.rollback.restored ? 'restored' : (attempt.rollback.snapshotCreated ? 'captured' : 'skipped');
                console.log(chalk.dim(`  rollback: ${rollbackPrefix}`
                    + `${attempt.rollback.snapshotId ? ` (${attempt.rollback.snapshotId})` : ''}`
                    + `${attempt.rollback.message ? ` - ${attempt.rollback.message}` : ''}`));
            }
            if (attempt.rollback.postRollbackVerify) {
                const rollbackVerify = attempt.rollback.postRollbackVerify;
                console.log(chalk.dim(`  rollback verify: ${rollbackVerify.verdict || 'UNKNOWN'}`
                    + `${rollbackVerify.score != null ? ` (score ${rollbackVerify.score})` : ''}`
                    + `, violations: ${rollbackVerify.violations}`));
            }
            if (attempt.improved === false) {
                console.log(chalk.yellow('  no measurable governance improvement; stopping remediation loop'));
            }
        }
        console.log(success
            ? chalk.green(`✅ Final verify PASS${output.finalVerify.score != null ? ` (score ${output.finalVerify.score})` : ''}`)
            : chalk.red(`❌ Final verify ${output.finalVerify.verdict || 'UNKNOWN'}`
                + `${output.finalVerify.score != null ? ` (score ${output.finalVerify.score})` : ''}`
                + `, violations: ${output.finalVerify.violations}`));
        console.log(chalk.dim(`Stop reason: ${output.stopReason}`));
        console.log(chalk.dim(output.message));
        if (!success) {
            process.exit(1);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (options.json) {
            emitJson({
                success: false,
                remediated: false,
                preflight: {
                    aiLogRepair: {
                        attempted: false,
                        repaired: false,
                        backupPath: null,
                        message: null,
                    },
                },
                strictMode: {
                    strictArtifacts,
                    enforceChangeContract,
                    requireRuntimeGuard,
                },
                governance: {
                    requireApproval,
                    minApprovals,
                    approvalCommit,
                    rollbackOnRegression,
                    requireRollbackSnapshot,
                    snapshotLimits: {
                        maxFiles: snapshotLimits.maxFiles,
                        maxBytes: snapshotLimits.maxBytes,
                        maxFileBytes: snapshotLimits.maxFileBytes,
                    },
                },
                baseline: {
                    exitCode: 1,
                    verdict: null,
                    score: null,
                    message: null,
                    violations: 0,
                },
                attempts: [],
                finalVerify: {
                    exitCode: 1,
                    verdict: null,
                    score: null,
                    message: null,
                    violations: 0,
                },
                stopReason: 'runtime_error',
                message,
                timestamp: new Date().toISOString(),
            });
            process.exit(1);
        }
        console.error(chalk.red(`\n❌ Remediation failed: ${message}\n`));
        process.exit(1);
    }
}
//# sourceMappingURL=remediate.js.map