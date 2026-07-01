"use strict";
/**
 * Session Management Command
 *
 * Manages AI coding sessions - list, end, and view session status.
 *
 * Commands:
 * - neurcode session list    - List all sessions
 * - neurcode session end     - End the current or specified session
 * - neurcode session status  - Show status of current session
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveLocalOperatorIdentity = void 0;
exports.resolveUnderstandingDiffFiles = resolveUnderstandingDiffFiles;
exports.buildLocalGovernanceStatus = buildLocalGovernanceStatus;
exports.localGovernanceStatusCommand = localGovernanceStatusCommand;
exports.resetStaleGovernanceSessionCommand = resetStaleGovernanceSessionCommand;
exports.replanGovernanceSessionCommand = replanGovernanceSessionCommand;
exports.decideGovernanceReplanCommand = decideGovernanceReplanCommand;
exports.viewPlanCommand = viewPlanCommand;
exports.showPlanModeCommand = showPlanModeCommand;
exports.freezePlanCommand = freezePlanCommand;
exports.unfreezePlanCommand = unfreezePlanCommand;
exports.approveGovernanceSessionCommand = approveGovernanceSessionCommand;
exports.showGovernanceObligationsCommand = showGovernanceObligationsCommand;
exports.waiveGovernanceObligationCommand = waiveGovernanceObligationCommand;
exports.listRuntimeSessionsCommand = listRuntimeSessionsCommand;
exports.showRuntimeSessionCommand = showRuntimeSessionCommand;
exports.aiChangeRecordCommand = aiChangeRecordCommand;
exports.collectChangeRecordImpactPaths = collectChangeRecordImpactPaths;
exports.buildChangeRecordImpactSummary = buildChangeRecordImpactSummary;
exports.exportAIChangeRecordForCli = exportAIChangeRecordForCli;
exports.verifyAIChangeRecordForCli = verifyAIChangeRecordForCli;
exports.structuralUnderstandingCommand = structuralUnderstandingCommand;
exports.listSessionsCommand = listSessionsCommand;
exports.endSessionCommand = endSessionCommand;
exports.endSessionCommandWithDependencies = endSessionCommandWithDependencies;
exports.sessionStatusCommand = sessionStatusCommand;
exports.listLocalSessionsCommand = listLocalSessionsCommand;
exports.currentLocalSessionCommand = currentLocalSessionCommand;
exports.resumeLocalSessionCommand = resumeLocalSessionCommand;
exports.compareLocalSessionsCommand = compareLocalSessionsCommand;
const config_1 = require("../config");
const api_client_1 = require("../api-client");
const state_1 = require("../utils/state");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const messages_1 = require("../utils/messages");
const project_root_1 = require("../utils/project-root");
const diff_parser_1 = require("@neurcode-ai/diff-parser");
const session_continuity_1 = require("../utils/session-continuity");
const runtime_evidence_1 = require("../utils/runtime-evidence");
const v0_governance_1 = require("../utils/v0-governance");
const runtime_connection_1 = require("../utils/runtime-connection");
const runtime_connection_2 = require("../utils/runtime-connection");
const runtime_live_1 = require("../utils/runtime-live");
const session_allowlist_rules_1 = require("../utils/session-allowlist-rules");
const runtime_outbox_1 = require("../utils/runtime-outbox");
const repo_brain_impact_1 = require("../utils/repo-brain-impact");
const structural_understanding_1 = require("../utils/structural-understanding");
const agent_guard_supervisor_1 = require("../utils/agent-guard-supervisor");
const hook_heartbeat_1 = require("../utils/hook-heartbeat");
const profile_drift_recovery_1 = require("../utils/profile-drift-recovery");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const readline = __importStar(require("readline"));
const runtime_state_1 = require("../utils/runtime-state");
const operator_identity_1 = require("../utils/operator-identity");
// Import chalk with fallback
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (str) => str,
        yellow: (str) => str,
        red: (str) => str,
        bold: (str) => str,
        dim: (str) => str,
        cyan: (str) => str,
        white: (str) => str,
        blue: (str) => str,
    };
}
// Re-export for callers that import from this module
var operator_identity_2 = require("../utils/operator-identity");
Object.defineProperty(exports, "deriveLocalOperatorIdentity", { enumerable: true, get: function () { return operator_identity_2.deriveLocalOperatorIdentity; } });
/**
 * Prompt user for input
 */
function promptUser(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
function truncate(value, max = 96) {
    return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}
function compactList(values, max = 6) {
    if (values.length === 0)
        return 'none';
    const shown = values.slice(0, max).join(', ');
    return values.length > max ? `${shown} +${values.length - max} more` : shown;
}
function eventLabel(event) {
    if (event.type === 'check_ok')
        return 'OK';
    if (event.type === 'check_warn')
        return 'WARN';
    if (event.type === 'check_block')
        return 'BLOCK';
    if (event.type === 'approval_decision')
        return 'APPROVE';
    if (event.type === 'session_start')
        return 'START';
    if (event.type === 'plan_captured')
        return 'PLAN';
    if (event.type === 'plan_amended')
        return 'REPLAN';
    if (event.type === 'obligation_waiver_decision')
        return 'WAIVE';
    if (event.type === 'obligation_state_changed')
        return 'OBLIG';
    if (event.type === 'structural_understanding')
        return 'STRUCT';
    if (event.type === 'session_finish')
        return 'FINISH';
    return event.type.toUpperCase();
}
function approvalContextFrom(event) {
    const detail = event?.detail;
    const raw = detail && typeof detail === 'object'
        ? detail['approvalContext']
        : null;
    if (!raw || typeof raw !== 'object')
        return null;
    const context = raw;
    const owners = Array.isArray(context['owners'])
        ? context['owners'].filter((owner) => typeof owner === 'string')
        : [];
    return {
        blockedPath: typeof context['blockedPath'] === 'string' ? context['blockedPath'] : event?.filePath,
        owners,
        suggestedApprovalPath: typeof context['suggestedApprovalPath'] === 'string'
            ? context['suggestedApprovalPath']
            : event?.filePath,
    };
}
const UNTRACKED_UNDERSTANDING_EXCLUDED_DIRS = new Set([
    '.git',
    '.neurcode',
    '.neurcode-admission',
    '.neurcode-ai-record',
    '.cache',
    '.next',
    'build',
    'cache',
    'coverage',
    'dist',
    'evidence',
    'generated',
    'node_modules',
    'out',
    'vendor',
]);
const UNTRACKED_UNDERSTANDING_SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;
const UNTRACKED_UNDERSTANDING_GENERATED_FILE = /(?:\.d\.ts|\.map|\.min\.js|\.bundle\.js|\.generated\.[cm]?[jt]sx?)$/i;
function normalizeUnderstandingPath(value) {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function eligibleUntrackedUnderstandingPath(repoRoot, value) {
    const normalized = normalizeUnderstandingPath(value);
    if (!normalized || normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../'))
        return null;
    const segments = normalized.split('/');
    if (segments.includes('..') || segments.some((segment) => UNTRACKED_UNDERSTANDING_EXCLUDED_DIRS.has(segment.toLowerCase()))) {
        return null;
    }
    if (UNTRACKED_UNDERSTANDING_GENERATED_FILE.test(normalized))
        return null;
    const absolutePath = (0, node_path_1.join)(repoRoot, normalized);
    try {
        const stat = (0, node_fs_1.lstatSync)(absolutePath);
        if (!stat.isFile() || stat.isSymbolicLink())
            return null;
    }
    catch {
        return null;
    }
    return normalized;
}
function untrackedDiffFile(repoRoot, path) {
    let lines = [];
    if (UNTRACKED_UNDERSTANDING_SOURCE.test(path)) {
        const text = (0, node_fs_1.readFileSync)((0, node_path_1.join)(repoRoot, path), 'utf8').replace(/\r\n/g, '\n');
        lines = text ? text.split('\n') : [];
        if (lines.at(-1) === '')
            lines.pop();
    }
    return {
        path,
        changeType: 'add',
        addedLines: lines.length,
        removedLines: 0,
        hunks: lines.length > 0
            ? [{
                    oldStart: 0,
                    oldLines: 0,
                    newStart: 1,
                    newLines: lines.length,
                    lines: lines.map((content, index) => ({
                        type: 'added',
                        content,
                        lineNumber: index + 1,
                    })),
                }]
            : [],
        provenance: 'git-untracked',
    };
}
function resolveUnderstandingDiffFiles(repoRoot, options = {}) {
    const args = ['diff'];
    if (options.staged) {
        args.push('--cached');
    }
    else if (options.base && options.base.trim()) {
        args.push(options.base.trim());
    }
    else {
        args.push('HEAD');
    }
    const diffText = (0, node_child_process_1.execFileSync)('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    const selected = (0, diff_parser_1.parseDiff)(diffText);
    if (options.staged)
        return selected;
    const untrackedOutput = (0, node_child_process_1.execFileSync)('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    const byPath = new Map(selected.map((file) => [normalizeUnderstandingPath(file.path), file]));
    for (const rawPath of untrackedOutput.split('\0')) {
        const path = eligibleUntrackedUnderstandingPath(repoRoot, rawPath);
        if (!path || byPath.has(path))
            continue;
        byPath.set(path, untrackedDiffFile(repoRoot, path));
    }
    return [...byPath.values()].sort((a, b) => normalizeUnderstandingPath(a.path).localeCompare(normalizeUnderstandingPath(b.path)));
}
function loadLocalGovernanceSession(repoRoot, sessionId) {
    return sessionId ? (0, governance_runtime_1.loadSession)(repoRoot, sessionId) : (0, governance_runtime_1.loadActiveSession)(repoRoot);
}
function normalizeApprovalPathForCloudMatch(repoRoot, inputPath) {
    const normalized = inputPath.trim().replace(/\\/g, '/');
    if (!normalized)
        return normalized;
    if ((0, node_path_1.isAbsolute)(normalized)) {
        return (0, node_path_1.relative)(repoRoot, normalized).replace(/\\/g, '/').replace(/^\.\//, '');
    }
    return normalized.replace(/^\.\//, '').replace(/^\//, '');
}
function latestEventTimestamp(session) {
    return [...session.events]
        .reverse()
        .find((event) => typeof event.ts === 'string' && event.ts.trim())?.ts ||
        new Date(0).toISOString();
}
function sessionAgeMinutes(session, now = new Date()) {
    const started = Date.parse(latestEventTimestamp(session));
    if (!Number.isFinite(started))
        return Number.POSITIVE_INFINITY;
    return Math.max(0, (now.getTime() - started) / 60_000);
}
function approvedPathMatches(filePath, approvedPath) {
    const normalizedFile = filePath.replace(/\\/g, '/');
    const normalizedApproved = approvedPath.replace(/\\/g, '/');
    if (normalizedFile === normalizedApproved)
        return true;
    if (normalizedApproved.endsWith('/**')) {
        const prefix = normalizedApproved.slice(0, -3);
        return normalizedFile === prefix || normalizedFile.startsWith(`${prefix}/`);
    }
    if (normalizedApproved.includes('*')) {
        // Keep reset-stale conservative for uncommon glob approvals: do not assume
        // a block is resolved unless it is an exact path or directory-scope grant.
        return false;
    }
    return false;
}
function pendingApprovalBlock(session, now = new Date()) {
    const activeApprovals = (0, governance_runtime_1.activeApprovalPaths)(session.contract, now.toISOString());
    for (const event of [...session.events].reverse()) {
        if (event.type !== 'check_block')
            continue;
        const context = approvalContextFrom(event);
        const suggestedApprovalPath = context?.suggestedApprovalPath || event.filePath || null;
        if (!suggestedApprovalPath)
            continue;
        if (activeApprovals.some((approved) => approvedPathMatches(suggestedApprovalPath, approved))) {
            continue;
        }
        return {
            filePath: event.filePath || context?.blockedPath || null,
            suggestedApprovalPath,
            owners: context?.owners ?? [],
            message: event.message,
        };
    }
    return null;
}
function activePointerInspection(repoRoot) {
    const path = (0, node_path_1.join)(repoRoot, '.neurcode', 'active-session.json');
    if (!(0, node_fs_1.existsSync)(path))
        return { state: 'missing', sessionId: null, session: null };
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        if (parsed.sessionId === null)
            return { state: 'cleared', sessionId: null, session: null };
        if (typeof parsed.sessionId !== 'string' || !parsed.sessionId.trim()) {
            return { state: 'malformed', sessionId: null, session: null };
        }
        const session = (0, governance_runtime_1.loadSession)(repoRoot, parsed.sessionId);
        if (!session || session.status !== 'active') {
            return { state: 'stale', sessionId: parsed.sessionId, session };
        }
        return { state: 'valid', sessionId: parsed.sessionId, session };
    }
    catch {
        return { state: 'malformed', sessionId: null, session: null };
    }
}
function validGovernanceSessionRecord(value) {
    if (!value || typeof value !== 'object')
        return false;
    const record = value;
    return (typeof record.sessionId === 'string' &&
        typeof record.profileHash === 'string' &&
        (record.status === 'active' || record.status === 'finished') &&
        Array.isArray(record.events) &&
        Boolean(record.contract && typeof record.contract === 'object'));
}
function scanSessionRecords(repoRoot) {
    const directory = (0, governance_runtime_1.sessionsDir)(repoRoot);
    if (!(0, node_fs_1.existsSync)(directory))
        return { active: [], malformed: [] };
    const active = [];
    const malformed = [];
    for (const entry of (0, node_fs_1.readdirSync)(directory, { withFileTypes: true })
        .filter((item) => item.isFile() && item.name.endsWith('.json') && !item.name.endsWith('.change-record.json'))
        .sort((a, b) => a.name.localeCompare(b.name))) {
        const relativePath = `.neurcode/sessions/${entry.name}`;
        try {
            const parsed = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(directory, entry.name), 'utf8'));
            if (!validGovernanceSessionRecord(parsed)) {
                malformed.push({ file: relativePath, reasonCode: 'invalid_session_record' });
                continue;
            }
            if (entry.name !== `${parsed.sessionId}.json`) {
                malformed.push({ file: relativePath, reasonCode: 'session_id_filename_mismatch' });
                continue;
            }
            if (parsed.status === 'active')
                active.push(parsed);
        }
        catch {
            malformed.push({ file: relativePath, reasonCode: 'malformed_json' });
        }
    }
    return {
        active: active.sort((a, b) => a.sessionId.localeCompare(b.sessionId)),
        malformed,
    };
}
function recoveryReasonCode(pointer, sessionId) {
    if (pointer.state === 'valid') {
        return pointer.sessionId === sessionId
            ? 'stale_referenced_active_session'
            : 'orphan_unreferenced_active_record';
    }
    if (pointer.state === 'missing')
        return 'orphan_missing_active_pointer';
    if (pointer.state === 'cleared')
        return 'orphan_cleared_active_pointer';
    if (pointer.state === 'malformed')
        return 'orphan_malformed_active_pointer';
    return 'orphan_stale_active_pointer';
}
function activeSessionLiveness(repoRoot, sessionId, now) {
    const reasons = [];
    const supervisor = (0, agent_guard_supervisor_1.inspectAgentGuardSupervisor)(repoRoot, sessionId);
    if (supervisor.state?.sessionId === sessionId &&
        supervisor.alive &&
        ['running', 'starting', 'stopping'].includes(supervisor.effectiveStatus)) {
        reasons.push('live_supervisor_process');
    }
    const heartbeat = (0, hook_heartbeat_1.readHookHeartbeat)(repoRoot);
    const heartbeatAt = Date.parse(heartbeat?.lastEvent.ts ?? '');
    if (heartbeat?.lastEvent.sessionId === sessionId &&
        Number.isFinite(heartbeatAt) &&
        now.getTime() - heartbeatAt >= 0 &&
        now.getTime() - heartbeatAt <= 5 * 60_000) {
        reasons.push('fresh_hook_heartbeat');
    }
    return reasons;
}
function clearInvalidActivePointer(repoRoot, pointer) {
    if (pointer.state === 'valid')
        return;
    const directory = (0, node_path_1.join)(repoRoot, '.neurcode');
    (0, node_fs_1.mkdirSync)(directory, { recursive: true });
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(directory, 'active-session.json'), JSON.stringify({ sessionId: null }, null, 2) + '\n', 'utf8');
}
function buildLocalGovernanceStatus(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const runtimeState = (0, runtime_state_1.classifyRuntimeState)(repoRoot);
    const session = loadLocalGovernanceSession(repoRoot, options.sessionId);
    const connection = (0, runtime_connection_1.loadRuntimeConnection)(repoRoot);
    if (!session) {
        return {
            ok: false,
            repoRoot,
            active: false,
            message: options.sessionId
                ? `Local governance session ${options.sessionId} was not found.`
                : 'No active in-flow governance session found.',
            connection,
            runtimeState,
        };
    }
    const recentEvents = session.events.slice(-10);
    const staleness = (0, v0_governance_1.getProfileStaleness)(repoRoot);
    const profileAction = (0, v0_governance_1.profileFreshnessActionForSession)(staleness, session.profileHash);
    const pendingProfileDecisions = (0, profile_drift_recovery_1.pendingProfileDriftDecisions)(session);
    const profileFreshness = (0, v0_governance_1.buildProfileFreshnessSignal)(staleness, profileAction, {
        sessionProfileHash: session.profileHash,
        ...(profileAction === 'session_restart_required'
            ? {
                recoveryReason: 'active_session_profile_changed',
                recoveryCommand: profile_drift_recovery_1.PROFILE_DRIFT_RECOVERY_COMMAND,
                unresolvedHumanDecisions: pendingProfileDecisions.length > 0,
            }
            : {}),
    });
    const latestBlock = [...session.events].reverse().find((event) => event.type === 'check_block');
    const latestApprovalContext = approvalContextFrom(latestBlock);
    const suggestedApprovalPath = latestApprovalContext?.suggestedApprovalPath ||
        latestBlock?.filePath ||
        null;
    return {
        ok: true,
        repoRoot,
        active: session.status === 'active',
        sessionId: session.sessionId,
        status: session.status,
        goal: session.contract.goal,
        profileHash: session.profileHash,
        profileFreshness,
        scopeMode: session.contract.scopeMode,
        planCoherenceMode: session.contract.planCoherenceMode ?? 'warn',
        planMode: session.contract.planMode ?? governance_runtime_1.DEFAULT_PLAN_CONTROL_MODE,
        planFrozen: (0, governance_runtime_1.derivePlanPhase)(session.contract) === 'implementation',
        planPhase: (0, governance_runtime_1.derivePlanPhase)(session.contract),
        agentPlan: session.contract.agentPlan ?? null,
        agentPlanRevision: typeof session.contract.agentPlanRevision === 'number'
            ? session.contract.agentPlanRevision
            : session.contract.agentPlan
                ? 1
                : null,
        pendingPlanAmendments: (session.contract.planAmendmentProposals ?? [])
            .filter((proposal) => proposal.status === 'pending'),
        architectureObligations: session.contract.architectureObligations ?? [],
        allowedGlobs: session.contract.allowedGlobs,
        sensitiveGlobs: session.contract.sensitiveGlobs,
        approvalRequiredGlobs: session.contract.approvalRequiredGlobs,
        approvedPaths: session.contract.approvedPaths,
        recentEvents,
        agentInvocation: (0, governance_runtime_1.buildAgentInvocationSummary)(session),
        agentGuard: (0, governance_runtime_1.buildAgentGuardPostureSummary)(session),
        agentSupervisor: (0, agent_guard_supervisor_1.inspectAgentGuardSupervisor)(repoRoot, session.sessionId),
        latestBlock: latestBlock
            ? {
                filePath: latestBlock.filePath,
                message: latestBlock.message,
                owners: latestApprovalContext?.owners ?? [],
                suggestedApprovalPath,
                approveCommand: suggestedApprovalPath
                    ? `neurcode session approve --path ${suggestedApprovalPath}`
                    : null,
            }
            : null,
        recordPath: `.neurcode/sessions/${session.sessionId}.json`,
        connection,
        runtimeState,
    };
}
function localGovernanceStatusCommand(options = {}) {
    const status = buildLocalGovernanceStatus(options);
    if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        if (!status.ok)
            process.exitCode = 1;
        return;
    }
    console.log('');
    console.log(chalk.bold('Neurcode in-flow session'));
    console.log(chalk.dim('-'.repeat(72)));
    console.log(`Repo: ${chalk.white(status.repoRoot)}`);
    console.log(`Runtime: ${chalk.white(status.runtimeState.state)} · recover \`${status.runtimeState.recoveryCommand}\``);
    if (!status.ok) {
        console.log(chalk.yellow(status.message));
        if (status.connection) {
            const sync = status.connection.autoSync;
            console.log(chalk.dim(`Cloud: connected to ${status.connection.repo.name} · auto-sync ${sync.enabled ? 'on' : 'off'} · ${sync.lastStatus || 'never'}`));
        }
        console.log(chalk.dim('Next: run `neurcode activate claude`, then prompt Claude Code in this repo.'));
        console.log('');
        process.exitCode = 1;
        return;
    }
    const activeStatus = status;
    console.log(`Session: ${chalk.white(activeStatus.sessionId)} ${activeStatus.active ? chalk.green('active') : chalk.dim(activeStatus.status)}`);
    console.log(`Goal:    ${chalk.white(truncate(activeStatus.goal))}`);
    console.log(`Scope:   ${chalk.white(activeStatus.scopeMode)}`);
    console.log(`Profile: ${chalk.white(activeStatus.profileFreshness.status)} cache · ` +
        `${chalk.white(activeStatus.profileFreshness.sessionCompatibility)} session`);
    if (activeStatus.profileFreshness.sessionCompatibility === 'incompatible') {
        console.log(chalk.yellow(`Hashes:  session ${activeStatus.profileHash.slice(0, 12)} · ` +
            `current ${activeStatus.profileFreshness.currentProfileHash.slice(0, 12)}`));
        console.log(chalk.yellow(`Recover: ${profile_drift_recovery_1.PROFILE_DRIFT_RECOVERY_COMMAND} ` +
            `(--force abandons unresolved operator state${activeStatus.profileFreshness.unresolvedHumanDecisions ? '; unresolved decisions are present' : ''})`));
    }
    console.log(`Plan:    ${chalk.white(activeStatus.planMode)} mode · ` +
        `${activeStatus.planFrozen ? chalk.cyan('frozen') : chalk.dim('open')}` +
        `${activeStatus.agentPlanRevision ? chalk.dim(` · rev ${activeStatus.agentPlanRevision}`) : chalk.dim(' · no plan')}` +
        chalk.dim(` · coherence ${activeStatus.planCoherenceMode}`));
    console.log(chalk.dim(`         ${(0, governance_runtime_1.describePlanControlMode)(activeStatus.planMode).headline}`));
    console.log(chalk.dim(`         View: neurcode session plan · Freeze: neurcode session plan freeze`));
    console.log(`Agent:   ${chalk.white(activeStatus.agentInvocation.status.replace(/_/g, ' '))}` +
        chalk.dim(` · score ${activeStatus.agentInvocation.score}`) +
        chalk.dim(` · checks ${activeStatus.agentInvocation.preWriteCheckCount}`));
    if (activeStatus.agentGuard.status !== 'not_started') {
        console.log(`Guard:   ${chalk.white(activeStatus.agentGuard.status.replace(/_/g, ' '))}` +
            chalk.dim(` · changed ${activeStatus.agentGuard.summary.changedFiles}`) +
            chalk.dim(` · unverified ${activeStatus.agentGuard.summary.unverifiedWrites}`) +
            chalk.dim(` · denied-changed ${activeStatus.agentGuard.summary.deniedButChanged}`));
    }
    if (activeStatus.agentSupervisor.effectiveStatus !== 'missing') {
        console.log(`Watch:   ${chalk.white(activeStatus.agentSupervisor.effectiveStatus.replace(/_/g, ' '))}` +
            chalk.dim(` · ${activeStatus.agentSupervisor.alive ? 'alive' : 'not running'}`) +
            chalk.dim(` · checks ${activeStatus.agentSupervisor.state?.evaluationCount ?? 0}`));
    }
    if (activeStatus.agentPlan?.summary) {
        console.log(`Summary: ${chalk.white(truncate(activeStatus.agentPlan.summary))}`);
    }
    if (activeStatus.agentInvocation.gaps[0]) {
        console.log(`Next:    ${chalk.yellow(activeStatus.agentInvocation.nextAction)}`);
    }
    if (activeStatus.pendingPlanAmendments.length > 0) {
        const proposal = activeStatus.pendingPlanAmendments[0];
        console.log(`Re-plan: ${chalk.yellow(`${proposal.proposalId} pending human decision · ${proposal.risk.level} risk`)}`);
    }
    const obligationSummary = (0, governance_runtime_1.summarizeArchitectureObligations)(activeStatus.architectureObligations);
    console.log(`Obligations: ${chalk.white(`${obligationSummary.satisfied}/${obligationSummary.total} satisfied`)}${obligationSummary.blockingPending ? chalk.red(` · ${obligationSummary.blockingPending} blocking pending`) : ''}${obligationSummary.criticalAdvisoryPending ? chalk.yellow(` · ${obligationSummary.criticalAdvisoryPending} critical advisory pending`) : ''}${obligationSummary.otherAdvisoryPending ? chalk.dim(` · ${obligationSummary.otherAdvisoryPending} advisory pending`) : ''}`);
    for (const obligation of activeStatus.architectureObligations.filter((item) => item.status === 'pending').slice(0, 3)) {
        console.log(chalk.dim(`  pending ${obligation.severity.padEnd(8)} ${obligation.title}`));
    }
    console.log(`Allowed: ${chalk.dim(compactList(activeStatus.allowedGlobs))}`);
    console.log(`Gates:   ${chalk.dim(compactList(activeStatus.approvalRequiredGlobs))}`);
    console.log(`Approved:${chalk.dim(' ' + compactList(activeStatus.approvedPaths))}`);
    console.log('');
    console.log(chalk.bold('Recent events'));
    if (activeStatus.recentEvents.length === 0) {
        console.log(chalk.dim('  none'));
    }
    else {
        for (const event of activeStatus.recentEvents) {
            const target = event.filePath || event.decision || '';
            console.log(chalk.dim(`  ${eventLabel(event).padEnd(7)} ${target}`));
        }
    }
    console.log('');
    if (activeStatus.latestBlock?.suggestedApprovalPath) {
        console.log(chalk.bold('Latest block'));
        console.log(`  Path:  ${chalk.white(activeStatus.latestBlock.filePath || activeStatus.latestBlock.suggestedApprovalPath)}`);
        if (activeStatus.latestBlock.owners.length > 0) {
            console.log(`  Owner: ${chalk.white(activeStatus.latestBlock.owners.join(', '))}`);
        }
        console.log(`  UI:    ${chalk.cyan(`Approve exactly ${activeStatus.latestBlock.suggestedApprovalPath} in Runtime Control Plane`)}`);
        console.log(`  CLI:   ${chalk.cyan(activeStatus.latestBlock.approveCommand)}`);
        console.log(chalk.dim(`  MCP:   neurcode_session_approve({ path: "${activeStatus.latestBlock.suggestedApprovalPath}" })`));
        console.log('');
    }
    console.log(chalk.dim(`Record: ${activeStatus.recordPath}`));
    if (activeStatus.connection) {
        const sync = activeStatus.connection.autoSync;
        const transport = (0, runtime_outbox_1.inspectRuntimeOutbox)(activeStatus.repoRoot);
        console.log(chalk.dim(`Cloud:  connected to ${activeStatus.connection.repo.name} · auto-sync ${sync.enabled ? 'on' : 'off'} · ${sync.lastStatus || 'never'}`));
        console.log(chalk.dim(`Live:   ${transport.health} · ${transport.pendingEvents} queued · ${transport.retryingEvents} retrying · ${transport.deadLetterEvents} dead-lettered ` +
            `${transport.lastError ? `· last error ${transport.lastError}` : ''}`));
    }
    console.log('');
}
async function resetStaleGovernanceSessionCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const now = new Date();
    const maxAgeMinutes = Number.isFinite(options.maxAgeMinutes)
        ? Math.max(0, Number(options.maxAgeMinutes))
        : 120;
    const pointer = activePointerInspection(repoRoot);
    const records = scanSessionRecords(repoRoot);
    const output = (payload, statusCode = 0) => {
        if (options.json) {
            console.log(JSON.stringify(payload, null, 2));
        }
        else if (payload.ok === true) {
            console.log(chalk.green(String(payload.message || 'Stale session reset complete.')));
            if (payload.sessionId)
                console.log(chalk.dim(`Session: ${payload.sessionId}`));
            if (payload.replayHash)
                console.log(chalk.dim(`replayHash: ${payload.replayHash}`));
        }
        else {
            console.error(chalk.yellow(String(payload.message || payload.error || 'No reset performed.')));
            if (payload.suggestedApprovalPath) {
                console.error(chalk.dim(`Pending approval: ${payload.suggestedApprovalPath}`));
            }
        }
        process.exitCode = statusCode;
    };
    if (records.active.length === 0) {
        output({
            ok: true,
            reset: false,
            repoRoot,
            reason: 'no_active_session',
            pointerState: pointer.state,
            malformedRecords: records.malformed,
            message: 'No active in-flow governance session found.',
        });
        return;
    }
    const recovered = [];
    const skipped = [];
    for (const active of records.active) {
        if (options.sessionId && active.sessionId !== options.sessionId)
            continue;
        const ageMinutes = sessionAgeMinutes(active, now);
        const pending = pendingApprovalBlock(active, now);
        const stale = ageMinutes >= maxAgeMinutes;
        const liveness = activeSessionLiveness(repoRoot, active.sessionId, now);
        const reasonCode = recoveryReasonCode(pointer, active.sessionId);
        if (liveness.length > 0) {
            skipped.push({
                sessionId: active.sessionId,
                reason: 'session_live',
                reasonCode,
                liveness,
                ageMinutes: Number(ageMinutes.toFixed(2)),
            });
            continue;
        }
        if (pending && !stale && options.force !== true) {
            skipped.push({
                sessionId: active.sessionId,
                reason: 'fresh_pending_approval',
                reasonCode,
                ageMinutes: Number(ageMinutes.toFixed(2)),
                filePath: pending.filePath,
                owners: pending.owners,
                suggestedApprovalPath: pending.suggestedApprovalPath,
            });
            continue;
        }
        if (!stale && options.force !== true) {
            skipped.push({
                sessionId: active.sessionId,
                reason: 'session_not_stale',
                reasonCode,
                ageMinutes: Number(ageMinutes.toFixed(2)),
                pendingApproval: pending,
            });
            continue;
        }
        const pointerReferenced = pointer.state === 'valid' && pointer.sessionId === active.sessionId;
        (0, governance_runtime_1.appendEvent)(repoRoot, active.sessionId, {
            type: 'user_decision',
            ts: now.toISOString(),
            decision: pointerReferenced ? 'reset_stale_session' : 'recover_orphaned_session',
            detail: {
                source: 'local_cli',
                recovery: true,
                reasonCode,
                pointerState: pointer.state,
                force: options.force === true,
                maxAgeMinutes,
                ageMinutes: Number(ageMinutes.toFixed(2)),
                pendingApproval: pending,
                livenessChecks: ['bounded_event_age', 'guard_supervisor_process', 'hook_heartbeat'],
            },
        });
        const livePointerPath = (0, node_path_1.join)(repoRoot, '.neurcode', 'active-session.json');
        const preservedLivePointer = pointer.state === 'valid' && pointer.sessionId !== active.sessionId && (0, node_fs_1.existsSync)(livePointerPath)
            ? (0, node_fs_1.readFileSync)(livePointerPath, 'utf8')
            : null;
        let finished = null;
        try {
            finished = (0, governance_runtime_1.finishSession)(repoRoot, active.sessionId, {
                reason: reasonCode,
                ...(pending ? {
                    unresolvedApprovalBlocks: [{
                            filePath: pending.filePath || pending.suggestedApprovalPath || 'unknown',
                            suggestedApprovalPath: pending.suggestedApprovalPath || pending.filePath || 'unknown',
                        }],
                    completionStatus: options.force === true ? 'abandoned' : 'attention_required',
                } : {
                    completionStatus: options.force === true ? 'abandoned' : 'expired',
                }),
            });
        }
        finally {
            if (preservedLivePointer !== null) {
                (0, node_fs_1.writeFileSync)(livePointerPath, preservedLivePointer, 'utf8');
            }
        }
        if (!finished) {
            skipped.push({ sessionId: active.sessionId, reason: 'finish_failed', reasonCode });
            continue;
        }
        const supervisor = (0, agent_guard_supervisor_1.inspectAgentGuardSupervisor)(repoRoot, finished.sessionId);
        if (supervisor.state?.sessionId === finished.sessionId) {
            (0, agent_guard_supervisor_1.stopSupervisorOnSessionCompletion)(repoRoot);
        }
        await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, finished);
        const replay = (0, governance_runtime_1.replaySession)(finished);
        recovered.push({
            sessionId: finished.sessionId,
            previousGoal: finished.contract.goal,
            status: finished.status,
            completionStatus: finished.completionStatus,
            reasonCode,
            replayHash: finished.replayHash,
            replayVerified: replay.matchesOriginal,
            ageMinutes: Number(ageMinutes.toFixed(2)),
            forced: options.force === true,
            recordPath: `.neurcode/sessions/${finished.sessionId}.json`,
            evidencePath: (0, node_path_1.relative)(repoRoot, (0, governance_runtime_1.aiChangeRecordPath)(repoRoot, finished.sessionId)).replace(/\\/g, '/'),
        });
    }
    if (recovered.length > 0) {
        clearInvalidActivePointer(repoRoot, pointer);
        const first = recovered[0];
        output({
            ok: true,
            reset: true,
            repoRoot,
            sessionId: recovered.length === 1 ? first.sessionId : undefined,
            status: recovered.length === 1 ? first.status : 'finished',
            replayHash: recovered.length === 1 ? first.replayHash : undefined,
            ageMinutes: recovered.length === 1 ? first.ageMinutes : undefined,
            maxAgeMinutes,
            forced: options.force === true,
            pointerState: pointer.state,
            recoveredCount: recovered.length,
            recovered,
            skipped,
            malformedRecords: records.malformed,
            message: `Recovered ${recovered.length} stale or orphaned active session record${recovered.length === 1 ? '' : 's'}.`,
        });
        return;
    }
    const primary = skipped.find((item) => item.sessionId === pointer.sessionId) ?? skipped[0];
    if (primary?.reason === 'fresh_pending_approval') {
        output({
            ok: false,
            reset: false,
            repoRoot,
            ...primary,
            reason: 'pending_approval',
            maxAgeMinutes,
            pointerState: pointer.state,
            malformedRecords: records.malformed,
            message: 'Active session is fresh and waiting on an unresolved approval; no cleanup was performed.',
            next: [
                `Approve exactly ${primary.suggestedApprovalPath} from the dashboard or MCP.`,
                `Or explicitly abandon only this session with \`neurcode session cleanup-stale --session-id ${primary.sessionId} --abandon\`.`,
            ],
        }, 2);
        return;
    }
    if (primary?.reason === 'finish_failed') {
        output({
            ok: false,
            reset: false,
            repoRoot,
            ...primary,
            pointerState: pointer.state,
            malformedRecords: records.malformed,
            message: `Could not finish active session ${primary.sessionId}.`,
        }, 1);
        return;
    }
    output({
        ok: true,
        reset: false,
        repoRoot,
        ...primary,
        maxAgeMinutes,
        pointerState: pointer.state,
        skipped,
        malformedRecords: records.malformed,
        message: primary?.reason === 'session_live'
            ? `Session ${primary.sessionId} has current process or heartbeat liveness evidence and was preserved.`
            : `Active session ${primary?.sessionId} is not stale yet (${Number(primary?.ageMinutes ?? 0).toFixed(1)}m < ${maxAgeMinutes}m).`,
    });
}
async function replanGovernanceSessionCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    let planText = options.plan;
    if (!planText && options.planFile) {
        const planPath = (0, node_path_1.isAbsolute)(options.planFile)
            ? options.planFile
            : (0, node_path_1.resolve)(repoRoot, options.planFile);
        planText = (0, node_fs_1.readFileSync)(planPath, 'utf8');
    }
    // `amend-plan --scope <glob>` is sugar for adding expected globs to the plan;
    // merge it with any explicit --add-glob values.
    const addExpectedGlobs = [...(options.addGlob || []), ...(options.scope || [])];
    try {
        const result = (0, governance_runtime_1.amendAgentPlan)(repoRoot, {
            sessionId: options.sessionId,
            planText,
            summary: options.summary,
            addSteps: options.addStep,
            removeSteps: options.removeStep,
            addExpectedFiles: options.addFile,
            removeExpectedFiles: options.removeFile,
            addExpectedGlobs,
            removeExpectedGlobs: options.removeGlob,
            addConstraints: options.addConstraint,
            removeConstraints: options.removeConstraint,
            addRisks: options.addRisk,
            removeRisks: options.removeRisk,
            reason: options.reason,
            source: 'manual',
            proposedBy: options.proposedBy || 'human',
            decidedBy: options.decidedBy,
        });
        const session = (0, governance_runtime_1.loadSession)(repoRoot, result.sessionId);
        if (session)
            await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, session);
        if (options.json) {
            console.log(JSON.stringify({ ok: true, repoRoot, ...result }, null, 2));
            return;
        }
        console.log('');
        if (result.status === 'pending') {
            console.log(chalk.yellow(`Plan amendment pending human decision: ${result.proposal?.proposalId || result.eventId}`));
            console.log(chalk.dim(`Risk:     ${result.risk.level}`));
            console.log(chalk.dim(`Reasons:  ${compactList(result.risk.reasons, 6)}`));
            console.log(chalk.dim(`Accept:   neurcode session replan-decide --proposal-id ${result.proposal?.proposalId || result.eventId} --decision accept --reason "<why>"`));
            console.log('');
            return;
        }
        console.log(chalk.green(`Plan updated: revision ${result.previousRevision} -> ${result.revision}`));
        console.log(chalk.dim(`Session:  ${result.sessionId}`));
        console.log(chalk.dim(`Action:   ${result.action}`));
        console.log(chalk.dim(`Reason:   ${result.reason}`));
        const activePlan = result.activePlan;
        if (activePlan?.summary) {
            console.log(`Plan:     ${chalk.white(truncate(activePlan.summary))}`);
        }
        if (activePlan?.expectedFiles.length) {
            console.log(chalk.dim(`Files:    ${compactList(activePlan.expectedFiles, 12)}`));
        }
        console.log('');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
            console.log(JSON.stringify({ ok: false, repoRoot, error: message }, null, 2));
        }
        else {
            (0, messages_1.printError)('Re-plan Failed', message, [
                'Use --plan "<new plan>" for a full replacement, or --add-step / --add-file for a patch.',
            ]);
        }
        process.exitCode = 1;
    }
}
async function decideGovernanceReplanCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    if (!options.proposalId || !options.decision) {
        (0, messages_1.printError)('Missing Re-plan Decision', undefined, [
            'Usage: neurcode session replan-decide --proposal-id <id> --decision <accept|reject> --reason "<why>"',
        ]);
        process.exitCode = 2;
        return;
    }
    try {
        const result = (0, governance_runtime_1.decideAgentPlanAmendment)(repoRoot, {
            sessionId: options.sessionId,
            proposalId: options.proposalId,
            decision: options.decision,
            reason: options.reason,
            decidedBy: options.decidedBy,
            source: 'manual',
        });
        const session = (0, governance_runtime_1.loadSession)(repoRoot, result.sessionId);
        if (session)
            await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, session);
        if (options.json) {
            console.log(JSON.stringify({ ok: true, repoRoot, ...result }, null, 2));
            return;
        }
        console.log('');
        console.log(result.decision === 'accept'
            ? chalk.green(`Plan amendment accepted: ${result.proposalId}`)
            : chalk.yellow(`Plan amendment rejected: ${result.proposalId}`));
        console.log(chalk.dim(`Session:  ${result.sessionId}`));
        console.log(chalk.dim(`Status:   ${result.status}`));
        if (result.revision)
            console.log(chalk.dim(`Revision: ${result.previousRevision} -> ${result.revision}`));
        console.log('');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
            console.log(JSON.stringify({ ok: false, repoRoot, error: message }, null, 2));
        }
        else {
            (0, messages_1.printError)('Re-plan Decision Failed', message);
        }
        process.exitCode = 1;
    }
}
// ── Plan negotiation UX (view / mode / freeze / unfreeze) ─────────────────────
function loadPlanSession(repoRoot, options) {
    return options.sessionId
        ? (0, governance_runtime_1.loadSession)(repoRoot, options.sessionId)
        : (0, governance_runtime_1.loadActiveSession)(repoRoot);
}
function printNoActivePlanSession(options, repoRoot) {
    if (options.json) {
        console.log(JSON.stringify({ ok: false, repoRoot, error: 'no active governance session' }, null, 2));
    }
    else {
        (0, messages_1.printError)('No Active Session', 'No active in-flow governance session found.', [
            'Start a governed task first (e.g. `neurcode run claude --goal "<task>"`), then re-run this command.',
        ]);
    }
    process.exitCode = 1;
}
/** `neurcode session plan` — view the active plan, its mode, and freeze state. */
function viewPlanCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const session = loadPlanSession(repoRoot, options);
    if (!session) {
        printNoActivePlanSession(options, repoRoot);
        return;
    }
    const view = (0, governance_runtime_1.buildPlanNegotiationView)(session);
    if (options.json) {
        console.log(JSON.stringify({ ok: true, repoRoot, ...view }, null, 2));
        return;
    }
    console.log('');
    console.log(chalk.bold('Active plan'));
    console.log(chalk.dim('-'.repeat(72)));
    console.log(`Session: ${chalk.white(view.sessionId)} ${session.status === 'active' ? chalk.green('active') : chalk.dim(session.status)}`);
    console.log(`Mode:    ${chalk.white(view.planMode)} · ${view.frozen ? chalk.cyan('frozen') : chalk.dim('open (planning)')}${view.frozenExplicit ? '' : chalk.dim(' · implicit')}`);
    console.log(chalk.dim(`         ${view.planModeDescription.headline}`));
    if (view.frozen) {
        console.log(chalk.dim(`         ${view.planModeDescription.afterFreeze}`));
    }
    else {
        console.log(chalk.dim(`         ${view.planModeDescription.planningPhase}`));
    }
    if (view.frozenExplicit && view.frozenAt) {
        console.log(chalk.dim(`Frozen:  rev ${view.frozenRevision ?? '?'} at ${view.frozenAt}${view.frozenBy ? ` by ${view.frozenBy}` : ''}`));
    }
    if (view.hasPlan) {
        console.log(`Plan:    ${chalk.white(`rev ${view.activePlanRevision}`)}${view.planVersions > 1 ? chalk.dim(` · ${view.planVersions} versions`) : ''}`);
        if (view.summary)
            console.log(`Summary: ${chalk.white(truncate(view.summary))}`);
        if (view.steps.length) {
            console.log(chalk.bold('Steps'));
            for (const step of view.steps.slice(0, 8))
                console.log(chalk.dim(`  • ${truncate(step)}`));
        }
        if (view.expectedFiles.length)
            console.log(`Files:   ${chalk.dim(compactList(view.expectedFiles, 12))}`);
        if (view.expectedGlobs.length)
            console.log(`Globs:   ${chalk.dim(compactList(view.expectedGlobs, 12))}`);
    }
    else {
        console.log(chalk.yellow('Plan:    none captured yet — the agent has not exposed a plan.'));
        console.log(chalk.dim('         Capture/extend via `neurcode session replan --plan "<plan>"` or MCP `neurcode_session_replan`.'));
    }
    console.log(`Signals: ${chalk.dim(`${view.pendingAmendments.length} pending amendment(s) · ${view.driftWarningCount} drift warn · ${view.blockedBoundaryCount} block(s) · ${view.approvedPaths.length} approved path(s)`)}`);
    if (view.pendingAmendments.length > 0) {
        const pending = view.pendingAmendments[0];
        console.log(chalk.yellow(`Re-plan: ${pending.proposalId} (${pending.risk} risk) — accept with \`neurcode session replan-decide --proposal-id ${pending.proposalId} --decision accept\``));
    }
    console.log('');
    console.log(chalk.dim(`Freeze:  neurcode session plan freeze   ·   Unfreeze: neurcode session plan unfreeze`));
    console.log(chalk.dim(`Amend:   neurcode session replan --add-file <path>   ·   Approve: neurcode session approve --path <file>`));
    console.log('');
}
/** `neurcode session plan mode` — show + explain the active plan control mode. */
function showPlanModeCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const session = loadPlanSession(repoRoot, options);
    // Mode is a repo policy; explain all three either way so help is useful even
    // without an active session.
    const activeMode = session ? (session.contract.planMode ?? governance_runtime_1.DEFAULT_PLAN_CONTROL_MODE) : null;
    const frozen = session ? (0, governance_runtime_1.derivePlanPhase)(session.contract) === 'implementation' : null;
    const modes = ['observe', 'advise', 'enforce_after_freeze'];
    if (options.json) {
        console.log(JSON.stringify({
            ok: true,
            repoRoot,
            activeMode,
            frozen,
            defaultMode: governance_runtime_1.DEFAULT_PLAN_CONTROL_MODE,
            modes: modes.map((mode) => (0, governance_runtime_1.describePlanControlMode)(mode)),
        }, null, 2));
        return;
    }
    console.log('');
    console.log(chalk.bold('Plan control mode'));
    console.log(chalk.dim('-'.repeat(72)));
    if (activeMode) {
        console.log(`Active:  ${chalk.white(activeMode)} · ${frozen ? chalk.cyan('frozen') : chalk.dim('open (planning)')}`);
    }
    else {
        console.log(chalk.yellow('No active session — showing how each mode behaves.'));
    }
    console.log('');
    for (const mode of modes) {
        const description = (0, governance_runtime_1.describePlanControlMode)(mode);
        const marker = mode === activeMode ? chalk.green('●') : chalk.dim('○');
        console.log(`${marker} ${chalk.white(mode)}${mode === governance_runtime_1.DEFAULT_PLAN_CONTROL_MODE ? chalk.dim(' (default)') : ''}`);
        console.log(chalk.dim(`    ${description.headline}`));
        console.log(chalk.dim(`    Planning: ${description.planningPhase}`));
        console.log(chalk.dim(`    After freeze: ${description.afterFreeze}`));
    }
    console.log('');
    console.log(chalk.dim('Set the mode in .neurcode/governance.json ("planMode") — see `neurcode bootstrap-policy`.'));
    console.log(chalk.dim('Freeze the plan with `neurcode session plan freeze` to start enforcement.'));
    console.log('');
}
async function runPlanFreezeCommand(freeze, options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    try {
        const result = freeze
            ? (0, governance_runtime_1.freezePlan)(repoRoot, { sessionId: options.sessionId, by: options.by, reason: options.reason })
            : (0, governance_runtime_1.unfreezePlan)(repoRoot, { sessionId: options.sessionId, by: options.by, reason: options.reason });
        const session = (0, governance_runtime_1.loadSession)(repoRoot, result.sessionId);
        if (session)
            await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, session);
        if (options.json) {
            console.log(JSON.stringify({ ok: true, repoRoot, ...result }, null, 2));
            return;
        }
        console.log('');
        const description = (0, governance_runtime_1.describePlanControlMode)(result.planMode);
        if (freeze) {
            console.log(result.changed
                ? chalk.green(`Plan frozen at revision ${result.activePlanRevision}.`)
                : chalk.dim('Plan was already frozen.'));
            console.log(chalk.dim(`Mode:    ${result.planMode} — ${description.afterFreeze}`));
            if (result.planMode === 'enforce_after_freeze') {
                console.log(chalk.dim(`Now:     writes outside the ${result.planFileCount} planned file(s) block until you amend the plan or approve the exact path.`));
            }
            console.log(chalk.dim('Unfreeze with `neurcode session plan unfreeze` to reopen planning.'));
        }
        else {
            console.log(result.changed
                ? chalk.green('Plan unfrozen — reopened for planning.')
                : chalk.dim('Plan was already open for planning.'));
            console.log(chalk.dim(`Mode:    ${result.planMode} — ${description.planningPhase}`));
            console.log(chalk.dim('Plan-drift blocking is suspended; credential/secret guards remain in force.'));
            console.log(chalk.dim('Re-freeze with `neurcode session plan freeze` to resume enforcement.'));
        }
        console.log('');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
            console.log(JSON.stringify({ ok: false, repoRoot, error: message }, null, 2));
        }
        else {
            (0, messages_1.printError)(freeze ? 'Freeze Plan Failed' : 'Unfreeze Plan Failed', message, [
                'Start a governed task first, then retry. Use --session-id to target a specific session.',
            ]);
        }
        process.exitCode = 1;
    }
}
/** `neurcode session plan freeze` — freeze the active plan. */
async function freezePlanCommand(options = {}) {
    await runPlanFreezeCommand(true, options);
}
/** `neurcode session plan unfreeze` — reopen the active plan for planning. */
async function unfreezePlanCommand(options = {}) {
    await runPlanFreezeCommand(false, options);
}
async function approveGovernanceSessionCommand(options = {}) {
    const path = options.path;
    if (!path) {
        (0, messages_1.printError)('Missing Approval Path', undefined, ['Usage: neurcode session approve --path <file-or-glob>']);
        process.exitCode = 2;
        return;
    }
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    try {
        const sessionId = options.sessionId || (0, governance_runtime_1.loadActiveSession)(repoRoot)?.sessionId;
        const normalizedPath = normalizeApprovalPathForCloudMatch(repoRoot, path);
        const discoveredCloudApproval = sessionId
            ? await (0, runtime_live_1.findRuntimeLiveApprovalRequest)(repoRoot, sessionId, normalizedPath)
            : null;
        const explicitCloudApproval = options.requestId && sessionId
            ? {
                id: options.requestId,
                sessionId,
                path: normalizedPath,
                reason: options.reason || 'Operator approved exact path',
                status: 'requested',
                requestedBy: 'local_operator',
                expiresAt: undefined,
            }
            : null;
        const matchingCloudApproval = discoveredCloudApproval || explicitCloudApproval;
        // Derive actor identity using the shared helper so all local approval
        // ingresses produce consistent, non-null approvedBy and assurance values.
        const localIdentity = (0, operator_identity_1.deriveLocalOperatorIdentity)(repoRoot);
        // Only an API-fetched cloud approval (discoveredCloudApproval) with a non-empty
        // requestedBy is trusted as hosted_verified.  Synthetic --request-id approvals
        // (explicitCloudApproval) use local identity — they are NOT authenticated hosted proofs.
        const hostedActor = discoveredCloudApproval?.requestedBy?.trim() || null;
        const result = (0, governance_runtime_1.approveSession)(repoRoot, path, {
            reason: options.reason,
            sessionId: options.sessionId,
            source: matchingCloudApproval ? 'dashboard' : 'local_cli',
            approvedBy: hostedActor ?? localIdentity.approvedBy,
            assurance: hostedActor ? 'hosted_verified' : localIdentity.assurance,
            requestId: matchingCloudApproval?.id || null,
            expiresAt: matchingCloudApproval?.expiresAt || undefined,
        });
        if (matchingCloudApproval?.id) {
            (0, runtime_live_1.queueRuntimeLiveApprovalAppliedAck)(repoRoot, result.sessionId, matchingCloudApproval, {
                appliedPath: result.approvedPath,
                expiresAt: result.expiresAt,
            });
        }
        const session = (0, governance_runtime_1.loadSession)(repoRoot, result.sessionId);
        if (session) {
            (0, session_allowlist_rules_1.refreshSessionScopeRules)({ dir: repoRoot, sessionId: session.sessionId });
            await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, session);
        }
        if (options.json) {
            console.log(JSON.stringify({
                ok: true,
                repoRoot,
                ...result,
                runtimeApprovalRequest: matchingCloudApproval?.id
                    ? {
                        id: matchingCloudApproval.id,
                        source: discoveredCloudApproval ? 'matched' : 'explicit',
                        acknowledgementQueued: true,
                    }
                    : null,
            }, null, 2));
            return;
        }
        console.log('');
        console.log(chalk.green(`Approved: ${result.approvedPath}`));
        console.log(chalk.dim(`Session:  ${result.sessionId}`));
        console.log(chalk.dim(`Approved paths: ${compactList(result.approvedPaths, 12)}`));
        if (matchingCloudApproval?.id) {
            console.log(chalk.dim(`Runtime request: ${matchingCloudApproval.id} (${discoveredCloudApproval ? 'matched' : 'explicit'})`));
        }
        console.log('');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
            console.log(JSON.stringify({ ok: false, repoRoot, error: message }, null, 2));
        }
        else {
            (0, messages_1.printError)('Approval Failed', message);
        }
        process.exitCode = 1;
    }
}
function showGovernanceObligationsCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const session = loadLocalGovernanceSession(repoRoot, options.sessionId);
    if (!session) {
        const message = options.sessionId
            ? `Local governance session ${options.sessionId} was not found.`
            : 'No active in-flow governance session found.';
        if (options.json)
            console.log(JSON.stringify({ ok: false, repoRoot, error: message }, null, 2));
        else
            (0, messages_1.printError)('Architecture Obligations Unavailable', message);
        process.exitCode = 1;
        return;
    }
    const obligations = session.contract.architectureObligations ?? [];
    const summary = (0, governance_runtime_1.summarizeArchitectureObligations)(obligations);
    if (options.json) {
        console.log(JSON.stringify({
            ok: true,
            repoRoot,
            sessionId: session.sessionId,
            summary,
            obligations,
            waivers: session.contract.architectureObligationWaivers ?? [],
            policy: session.contract.architectureObligationPolicy ?? { mode: 'warn', ruleModes: {} },
        }, null, 2));
        return;
    }
    console.log('');
    console.log(chalk.bold(`Architecture obligations · ${session.sessionId}`));
    console.log(chalk.dim('-'.repeat(72)));
    const policy = session.contract.architectureObligationPolicy ?? { mode: 'warn', ruleModes: {} };
    console.log(`Policy:  ${chalk.white(policy.mode)}${Object.keys(policy.ruleModes).length ? chalk.dim(` · ${Object.keys(policy.ruleModes).length} rule override(s)`) : ''}`);
    console.log(`Summary: ${chalk.white(`${summary.satisfied}/${summary.total} satisfied`)}${summary.waived ? chalk.yellow(` · ${summary.waived} waived`) : ''}${summary.blockingPending ? chalk.red(` · ${summary.blockingPending} blocking pending`) : ''}${summary.criticalAdvisoryPending ? chalk.yellow(` · ${summary.criticalAdvisoryPending} critical advisory pending`) : ''}${summary.otherAdvisoryPending ? chalk.dim(` · ${summary.otherAdvisoryPending} advisory pending`) : ''}`);
    console.log('');
    if (obligations.length === 0) {
        console.log(chalk.dim('No deterministic architecture obligations derived for this session.'));
    }
    for (const obligation of obligations) {
        const status = obligation.status === 'satisfied'
            ? chalk.green('satisfied')
            : obligation.status === 'waived'
                ? chalk.yellow('waived')
                : chalk.yellow('pending');
        console.log(`${status.padEnd(18)} ${chalk.white(obligation.title)} ${chalk.dim(`[${obligation.effectiveMode ?? 'warn'}]`)}`);
        console.log(chalk.dim(`  ${obligation.requiredEvidence[0]}`));
        if (obligation.observedEvidence[0])
            console.log(chalk.dim(`  evidence: ${obligation.observedEvidence[0].summary}`));
        if (obligation.status === 'pending')
            console.log(chalk.dim(`  waive: neurcode session waive-obligation --id ${obligation.id} --reason "<why>"`));
    }
    console.log('');
}
async function waiveGovernanceObligationCommand(options = {}) {
    if (!options.obligationId) {
        (0, messages_1.printError)('Missing Obligation ID', undefined, [
            'Usage: neurcode session waive-obligation --id <obligation-id> --reason "<why>"',
        ]);
        process.exitCode = 2;
        return;
    }
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    try {
        const result = (0, governance_runtime_1.waiveArchitectureObligation)(repoRoot, options.obligationId, {
            reason: options.reason,
            sessionId: options.sessionId,
            expiresAt: options.expiresAt,
            ttlMs: typeof options.ttlMinutes === 'number' && Number.isFinite(options.ttlMinutes)
                ? Math.max(0, Math.floor(options.ttlMinutes * 60 * 1000))
                : undefined,
            waivedBy: options.waivedBy,
            source: options.waiverSource || 'local_cli',
        });
        const session = (0, governance_runtime_1.loadSession)(repoRoot, result.sessionId);
        if (session)
            await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, session);
        if (options.json) {
            console.log(JSON.stringify({ ok: true, repoRoot, ...result }, null, 2));
            return;
        }
        console.log('');
        console.log(chalk.yellow(`Waived obligation: ${result.obligationId}`));
        console.log(chalk.dim(`Session:  ${result.sessionId}`));
        console.log(chalk.dim(`Expires:  ${result.expiresAt || 'never'}`));
        console.log(chalk.dim(`Reason:   ${result.waiver.reason}`));
        console.log('');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
            console.log(JSON.stringify({ ok: false, repoRoot, error: message }, null, 2));
        }
        else {
            (0, messages_1.printError)('Obligation Waiver Failed', message);
        }
        process.exitCode = 1;
    }
}
function listRuntimeSessionsCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const records = (0, runtime_evidence_1.listRuntimeSessions)(repoRoot);
    if (options.json) {
        console.log(JSON.stringify({
            ok: true,
            repoRoot,
            count: records.length,
            sessions: records.map((record) => ({
                sessionId: record.session.sessionId,
                status: record.session.status,
                goal: record.session.contract.goal,
                scopeMode: record.session.contract.scopeMode,
                blockCount: record.blockCount,
                warnCount: record.warnCount,
                okCount: record.okCount,
                approvalCount: record.approvalCount,
                approvedPaths: record.session.contract.approvedPaths,
                replayHash: record.session.replayHash,
                recordPath: record.path,
            })),
        }, null, 2));
        return;
    }
    console.log('');
    console.log(chalk.bold('Neurcode in-flow sessions'));
    console.log(chalk.dim('-'.repeat(96)));
    console.log(`Repo: ${chalk.white(repoRoot)}`);
    console.log('');
    if (records.length === 0) {
        console.log(chalk.dim('No local governance sessions found.'));
        console.log(chalk.dim('Next: run `neurcode activate claude`, then prompt Claude Code in this repo.'));
        console.log('');
        return;
    }
    const rows = [['Session', 'Status', 'Scope', 'Blocks', 'Warns', 'Approvals', 'Goal']];
    for (const record of records) {
        rows.push([
            record.session.sessionId,
            record.session.status,
            record.session.contract.scopeMode,
            String(record.blockCount),
            String(record.warnCount),
            String(record.approvalCount),
            truncate(record.session.contract.goal, 44),
        ]);
    }
    (0, messages_1.printTable)(rows);
    console.log(chalk.dim('Show details: neurcode session show <session-id>'));
    console.log('');
}
function showRuntimeSessionCommand(sessionId, options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const session = (0, governance_runtime_1.loadSession)(repoRoot, sessionId);
    if (!session) {
        if (options.json) {
            console.log(JSON.stringify({ ok: false, repoRoot, error: `Session not found: ${sessionId}` }, null, 2));
        }
        else {
            (0, messages_1.printError)('Session Not Found', `No local governance session found for ${sessionId}`);
        }
        process.exitCode = 1;
        return;
    }
    const records = (0, runtime_evidence_1.listRuntimeSessions)(repoRoot);
    const record = records.find((candidate) => candidate.session.sessionId === sessionId);
    const blockCount = record?.blockCount ?? session.events.filter((event) => event.type === 'check_block').length;
    const warnCount = record?.warnCount ?? session.events.filter((event) => event.type === 'check_warn').length;
    const okCount = record?.okCount ?? session.events.filter((event) => event.type === 'check_ok').length;
    const approvalCount = record?.approvalCount ?? session.events.filter((event) => event.type === 'approval_decision').length;
    const payload = {
        ok: true,
        repoRoot,
        sessionId: session.sessionId,
        status: session.status,
        goal: session.contract.goal,
        scopeMode: session.contract.scopeMode,
        agentPlan: session.contract.agentPlan ?? null,
        agentPlanRevision: session.contract.agentPlanRevision ?? (session.contract.agentPlan ? 1 : null),
        agentPlanRevisions: session.contract.agentPlanRevisions ?? [],
        architectureObligations: session.contract.architectureObligations ?? [],
        allowedGlobs: session.contract.allowedGlobs,
        approvalRequiredGlobs: session.contract.approvalRequiredGlobs,
        approvedPaths: session.contract.approvedPaths,
        blockCount,
        warnCount,
        okCount,
        approvalCount,
        replayHash: session.replayHash,
        recordPath: record?.path ?? `.neurcode/sessions/${session.sessionId}.json`,
        events: session.events,
    };
    if (options.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
    }
    console.log('');
    console.log(chalk.bold(`Neurcode session ${session.sessionId}`));
    console.log(chalk.dim('-'.repeat(72)));
    console.log(`Status:   ${chalk.white(session.status)}`);
    console.log(`Goal:     ${chalk.white(session.contract.goal)}`);
    console.log(`Scope:    ${chalk.white(session.contract.scopeMode)}`);
    console.log(`Plan:     ${chalk.white(session.contract.planCoherenceMode ?? 'warn')}${session.contract.agentPlanRevision ? chalk.dim(` · rev ${session.contract.agentPlanRevision}`) : ''}`);
    if (session.contract.agentPlan?.summary) {
        console.log(`Agent:    ${chalk.white(truncate(session.contract.agentPlan.summary))}`);
    }
    const obligationSummary = (0, governance_runtime_1.summarizeArchitectureObligations)(session.contract.architectureObligations ?? []);
    console.log(`Obligations: ${chalk.white(`${obligationSummary.satisfied}/${obligationSummary.total} satisfied`)}${obligationSummary.blockingPending ? chalk.red(` · ${obligationSummary.blockingPending} blocking pending`) : ''}${obligationSummary.criticalAdvisoryPending ? chalk.yellow(` · ${obligationSummary.criticalAdvisoryPending} critical advisory pending`) : ''}${obligationSummary.otherAdvisoryPending ? chalk.dim(` · ${obligationSummary.otherAdvisoryPending} advisory pending`) : ''}`);
    console.log(`Allowed:  ${chalk.dim(compactList(session.contract.allowedGlobs))}`);
    console.log(`Gates:    ${chalk.dim(compactList(session.contract.approvalRequiredGlobs))}`);
    console.log(`Approved: ${chalk.dim(compactList(session.contract.approvedPaths))}`);
    console.log(`Events:   ok=${okCount} warn=${warnCount} block=${blockCount} approvals=${approvalCount}`);
    console.log(`Replay:   ${chalk.dim(session.replayHash ?? 'n/a')}`);
    console.log('');
    console.log(chalk.bold('Timeline'));
    for (const event of session.events) {
        const target = event.filePath || event.decision || event.message || '';
        console.log(chalk.dim(`  ${event.ts}  ${eventLabel(event).padEnd(7)} ${target}`));
    }
    console.log('');
}
function resolveAIChangeRecordSession(repoRoot, options) {
    if (options.sessionId)
        return (0, governance_runtime_1.loadSession)(repoRoot, options.sessionId);
    const active = (0, governance_runtime_1.loadActiveSession)(repoRoot);
    if (active && !options.latest)
        return active;
    const [latest] = (0, runtime_evidence_1.listRuntimeSessions)(repoRoot);
    return latest?.session ?? active ?? null;
}
function renderAIChangeRecord(record, recordPath) {
    const counts = record.session.counts;
    const blocked = record.trajectory.filter((path) => path.verdicts.includes('block'));
    const warned = record.trajectory.filter((path) => path.verdicts.includes('warn'));
    const activeApprovals = record.approvals.filter((approval) => approval.status === 'active');
    const pendingAmendments = record.plan.pendingAmendments.length;
    const consequenceImpacts = topConsequenceImpactsFromRecord(record.understanding.latest?.consequenceUnderstanding);
    const consequenceFindings = topConsequenceFindingsFromRecord(record.understanding.latest?.consequenceUnderstanding);
    const reuseFindings = reuseFindingsFromRecord(record.understanding.latest);
    console.log('');
    console.log(chalk.bold(`AI Change Record ${record.session.sessionId}`));
    console.log(chalk.dim('-'.repeat(76)));
    console.log(`Repo:      ${chalk.white(record.session.repoName)}`);
    console.log(`Status:    ${chalk.white(record.session.status)}${record.integrity.replayHashStatus === 'present' ? '' : chalk.yellow(' · replay pending')}`);
    console.log(`Goal:      ${chalk.white(truncate(record.intent.contract?.summary || record.session.goal, 120))}`);
    console.log(`Scope:     ${chalk.white(record.session.scopeMode)} · ${chalk.dim(compactList(record.scope.allowedGlobs, 8))}`);
    console.log(`Plan:      ${chalk.white(record.plan.activeSummary ? truncate(record.plan.activeSummary, 120) : 'not captured')}${record.plan.activeRevision ? chalk.dim(` · rev ${record.plan.activeRevision}`) : ''}`);
    if (pendingAmendments > 0) {
        console.log(`Re-plan:   ${chalk.yellow(`${pendingAmendments} pending amendment${pendingAmendments === 1 ? '' : 's'}`)}`);
    }
    console.log(`Checks:    ok=${counts.ok} warn=${counts.warn} block=${counts.block} approvals=${counts.approval}`);
    console.log(`Oblig:     ${record.architecture.summary.satisfied}/${record.architecture.summary.total} satisfied${record.architecture.summary.blockingPending ? chalk.yellow(` · ${record.architecture.summary.blockingPending} blocking`) : ''}`);
    console.log(`Approvals: ${activeApprovals.length} active · ${record.approvals.length} lifecycle entr${record.approvals.length === 1 ? 'y' : 'ies'}`);
    if (record.accountability) {
        const facts = record.accountability.facts;
        console.log('');
        console.log(chalk.bold('Change accountability'));
        console.log(`Asked:    ${chalk.white(truncate(facts.agentGoal, 120))}`);
        console.log(`Touched:  ${chalk.dim(compactList(facts.touchedPaths, 8))}`);
        console.log(`Allowed:  ${chalk.dim(compactList(facts.allowedPaths, 6))}`);
        console.log(`Blocked:  ${facts.blockedBoundaries.length > 0 ? chalk.yellow(compactList(facts.blockedBoundaries, 6)) : chalk.dim('none')}`);
        console.log(`Owners:   ${facts.boundaryOwners.length > 0 ? chalk.white(compactList(facts.boundaryOwners, 6)) : chalk.dim('not recorded')}`);
        console.log(`Approval: ${facts.approvalRequired ? chalk.yellow('required') : chalk.dim('not required')} · ${facts.exactPathApprovalOnly ? 'exact-path only' : 'no exact approval applied'}`);
        console.log(`Neighbor: ${facts.neighboringSensitiveFilesBlocked ? chalk.green('contained') : chalk.dim('not observed')}`);
        console.log(`Receipt:  ${chalk.dim(facts.evidenceReceipt)} · source excluded=${facts.sourceExcluded ? 'yes' : 'no'}`);
        if (record.accountability.assumptions.length > 0) {
            console.log(`Assume:   ${chalk.dim(compactList(record.accountability.assumptions, 2))}`);
        }
    }
    if (record.understanding.latest) {
        const understanding = record.understanding.latest;
        console.log(`Understand: ${understanding.changedSymbolCount} changed symbols · ` +
            `${understanding.referenceCount} references · ${understanding.testReferenceCount} test refs`);
        const digest = understanding.digest;
        const topConsequences = digest?.topConsequences ?? [];
        if (topConsequences.length > 0) {
            const hidden = digest?.hidden && typeof digest.hidden === 'object'
                ? digest.hidden
                : {};
            const hiddenRefs = typeof hidden.references === 'number' ? hidden.references : 0;
            const hiddenTests = typeof hidden.testReferences === 'number' ? hidden.testReferences : 0;
            console.log(`Digest:    ${topConsequences.length} consequences · hidden ${hiddenRefs} refs / ${hiddenTests} tests`);
        }
        if (consequenceImpacts.length > 0) {
            const headline = consequenceHeadlineFromRecord(record.understanding.latest?.consequenceUnderstanding);
            if (headline)
                console.log(`Reach:     ${headline}`);
            console.log(`Impacts:   ${consequenceImpacts.length} grouped impact${consequenceImpacts.length === 1 ? '' : 's'}`);
            for (const impact of consequenceImpacts.slice(0, 5)) {
                const consumers = impact.productionConsumerCount > 0 || impact.testConsumerCount > 0
                    ? ` · ${impact.productionConsumerCount} prod file(s), ${impact.testConsumerCount} test file(s)`
                    : '';
                const flags = [
                    impact.highFanout ? 'high-fanout' : null,
                    impact.architectureRelevant ? 'architecture-relevant' : null,
                ].filter(Boolean).join(', ');
                console.log(chalk.dim(`  ${impact.rank}. ${truncate(impact.summary, 140)}${consumers}${flags ? ` · ${flags}` : ''}`));
            }
        }
        else if (consequenceFindings.length > 0) {
            const headline = consequenceHeadlineFromRecord(record.understanding.latest?.consequenceUnderstanding);
            if (headline)
                console.log(`Reach:     ${headline}`);
            console.log(`Consequences: ${consequenceFindings.length} ranked finding${consequenceFindings.length === 1 ? '' : 's'}`);
            for (const finding of consequenceFindings.slice(0, 5)) {
                const consumers = finding.consumerCount > 0
                    ? ` · ${finding.nonTestConsumerCount} non-test consumer(s), ${finding.testConsumerCount} test`
                    : '';
                const reasons = finding.reasonCodes.slice(0, 3).join(', ');
                console.log(chalk.dim(`  ${finding.rank}. ${truncate(finding.summary, 140)}${consumers}${reasons ? ` · ${reasons}` : ''}`));
            }
        }
        if (reuseFindings.length > 0) {
            console.log(`Reuse:     ${reuseFindings.length} advisory finding${reuseFindings.length === 1 ? '' : 's'}`);
            for (const finding of reuseFindings.slice(0, 5)) {
                console.log(chalk.dim(`  ${finding.changed.file}#${finding.changed.name} resembles ` +
                    `${finding.existing.file}#${finding.existing.name} · ${finding.matchType} · ${finding.confidence}`));
            }
        }
    }
    if (blocked.length > 0) {
        console.log('');
        console.log(chalk.bold('Blocked paths'));
        for (const item of blocked.slice(0, 8)) {
            const owners = item.owners.length ? ` · ${item.owners.join(', ')}` : '';
            const approval = item.suggestedApprovalPath ? ` · approve ${item.suggestedApprovalPath}` : '';
            console.log(chalk.dim(`  ${item.filePath}${owners}${approval}`));
        }
        if (blocked.length > 8)
            console.log(chalk.dim(`  +${blocked.length - 8} more`));
    }
    if (warned.length > 0) {
        console.log('');
        console.log(chalk.bold('Warned paths'));
        for (const item of warned.slice(0, 5)) {
            console.log(chalk.dim(`  ${item.filePath}`));
        }
        if (warned.length > 5)
            console.log(chalk.dim(`  +${warned.length - 5} more`));
    }
    console.log('');
    console.log(`Record:    ${chalk.dim(recordPath)}`);
    console.log(`Hash:      ${chalk.dim(record.integrity.recordHash)}`);
    console.log(`Replay:    ${chalk.dim(record.integrity.replayHash ?? 'pending-session-finish')}`);
    console.log(chalk.dim('Privacy:   source-free; no source code, diff hunks, patches, or shell command bodies.'));
    console.log('');
}
function consequenceHeadlineFromRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const summary = value.summary;
    if (!summary || typeof summary !== 'object' || Array.isArray(summary))
        return null;
    const headline = summary.headline;
    return typeof headline === 'string' && headline.trim() ? headline.trim() : null;
}
function topConsequenceImpactsFromRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return [];
    const record = value;
    if (!Array.isArray(record.topImpacts))
        return [];
    return record.topImpacts.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            return [];
        const row = item;
        const summary = typeof row.summary === 'string' ? row.summary.trim() : '';
        if (!summary)
            return [];
        const rank = typeof row.rank === 'number' && Number.isFinite(row.rank) ? row.rank : 0;
        const productionConsumerCount = typeof row.productionConsumerCount === 'number' && Number.isFinite(row.productionConsumerCount) ? row.productionConsumerCount : 0;
        const testConsumerCount = typeof row.testConsumerCount === 'number' && Number.isFinite(row.testConsumerCount) ? row.testConsumerCount : 0;
        const highFanout = row.highFanout === true;
        const architectureRelevant = row.architectureRelevant === true;
        const reasonCodes = Array.isArray(row.reasonCodes)
            ? row.reasonCodes.filter((reason) => typeof reason === 'string').slice(0, 6)
            : [];
        return [{ rank, summary, productionConsumerCount, testConsumerCount, highFanout, architectureRelevant, reasonCodes }];
    }).sort((a, b) => a.rank - b.rank || a.summary.localeCompare(b.summary));
}
function topConsequenceFindingsFromRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return [];
    const record = value;
    if (!Array.isArray(record.topFindings))
        return [];
    return record.topFindings.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            return [];
        const row = item;
        const summary = typeof row.summary === 'string' ? row.summary.trim() : '';
        if (!summary)
            return [];
        const rank = typeof row.rank === 'number' && Number.isFinite(row.rank) ? row.rank : 0;
        const consumerCount = typeof row.consumerCount === 'number' && Number.isFinite(row.consumerCount) ? row.consumerCount : 0;
        const nonTestConsumerCount = typeof row.nonTestConsumerCount === 'number' && Number.isFinite(row.nonTestConsumerCount) ? row.nonTestConsumerCount : 0;
        const testConsumerCount = typeof row.testConsumerCount === 'number' && Number.isFinite(row.testConsumerCount) ? row.testConsumerCount : 0;
        const reasonCodes = Array.isArray(row.reasonCodes)
            ? row.reasonCodes.filter((reason) => typeof reason === 'string').slice(0, 6)
            : [];
        return [{ rank, summary, consumerCount, nonTestConsumerCount, testConsumerCount, reasonCodes }];
    }).sort((a, b) => a.rank - b.rank || a.summary.localeCompare(b.summary));
}
function reuseFindingsFromRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return [];
    const raw = value.reuseFindings;
    return Array.isArray(raw)
        ? raw.filter((item) => Boolean(item) &&
            typeof item === 'object' &&
            !Array.isArray(item) &&
            item.schemaVersion === 'neurcode.reuse-finding.v1')
        : [];
}
function aiChangeRecordCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const session = resolveAIChangeRecordSession(repoRoot, options);
    if (!session) {
        if (options.json) {
            console.log(JSON.stringify({
                ok: false,
                repoRoot,
                error: options.sessionId
                    ? `Session not found: ${options.sessionId}`
                    : 'No local governance sessions found.',
            }, null, 2));
        }
        else {
            (0, messages_1.printError)('AI Change Record Not Found', options.sessionId
                ? `No local governance session found for ${options.sessionId}`
                : 'No local governance sessions found.');
        }
        process.exitCode = 1;
        return;
    }
    const { record, path } = (0, governance_runtime_1.writeAIChangeRecord)(repoRoot, session);
    if (options.json) {
        console.log(JSON.stringify({
            ok: true,
            repoRoot,
            recordPath: path,
            record,
        }, null, 2));
        return;
    }
    renderAIChangeRecord(record, path.replace(`${repoRoot}/`, ''));
}
const PUBLIC_AI_CHANGE_RECORD_DIR = '.neurcode-ai-record';
function publicAIChangeRecordPath(repoRoot, sessionId) {
    if (!/^[A-Za-z0-9._-]+$/.test(sessionId)) {
        throw new Error('AI Change Record session id is not safe for an artifact filename');
    }
    return (0, node_path_1.join)(repoRoot, PUBLIC_AI_CHANGE_RECORD_DIR, `${sessionId}.json`);
}
function writeJsonFile(path, value) {
    const dir = (0, node_path_1.dirname)(path);
    if (!(0, node_fs_1.existsSync)(dir))
        (0, node_fs_1.mkdirSync)(dir, { recursive: true });
    (0, node_fs_1.writeFileSync)(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}
function readJsonFile(path) {
    return JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
}
function extractRecordAndReceipt(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { record: null, receipt: null };
    const obj = value;
    const record = obj.record && typeof obj.record === 'object' && obj.record.recordType === 'ai-change-accountability-record'
        ? obj.record
        : obj.recordType === 'ai-change-accountability-record'
            ? obj
            : null;
    const receipt = obj.receipt && typeof obj.receipt === 'object'
        ? obj.receipt
        : obj.backendReceipt && typeof obj.backendReceipt === 'object'
            ? obj.backendReceipt
            : obj.schemaVersion === 'neurcode.ai-change-record-receipt.v1'
                ? obj
                : null;
    return { record, receipt };
}
/**
 * Collect the real, source-free file paths that a change touched or intended to
 * touch, for impact analysis. Approved/blocked paths are stored as hashes for
 * privacy and are deliberately excluded; the filter drops any non-path token.
 */
function collectChangeRecordImpactPaths(record) {
    const facts = record?.accountability?.facts ?? {};
    const pathTokens = record?.intent?.contract?.target?.pathTokens ?? [];
    const intentSummaryPaths = record?.intent?.summary?.paths ?? [];
    const expectedPathGlobs = record?.intent?.expectedPathGlobs ?? [];
    const candidates = [
        ...(Array.isArray(facts.touchedPaths) ? facts.touchedPaths : []),
        ...(Array.isArray(facts.allowedPaths) ? facts.allowedPaths : []),
        ...(Array.isArray(facts.warnedPaths) ? facts.warnedPaths : []),
        ...(Array.isArray(pathTokens) ? pathTokens : []),
        ...(Array.isArray(intentSummaryPaths) ? intentSummaryPaths : []),
        ...(Array.isArray(expectedPathGlobs) ? expectedPathGlobs : []),
    ];
    return Array.from(new Set(candidates
        .filter((p) => typeof p === 'string' && p.trim().length > 0)
        .map((p) => p.replace(/\\/g, '/'))
        // Drop hashed/opaque tokens — keep only things that look like file paths.
        .filter((p) => p.includes('/') || p.includes('.'))));
}
/**
 * Build a source-free {@link ImpactSummary} for an AI Change Record. Advisory:
 * never throws and never auto-builds the brain — when the brain is not indexed
 * the summary is honestly degraded (brainStatus: 'missing') rather than absent.
 */
function buildChangeRecordImpactSummary(repoRoot, record) {
    try {
        const paths = collectChangeRecordImpactPaths(record);
        if (paths.length === 0)
            return null;
        return (0, repo_brain_impact_1.summarizeImpact)((0, repo_brain_impact_1.buildRepoBrainImpactForRepo)(repoRoot, paths, { autoBuild: false }));
    }
    catch {
        return null;
    }
}
async function exportAIChangeRecordForCli(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const session = resolveAIChangeRecordSession(repoRoot, options);
    if (!session) {
        throw new Error(options.sessionId
            ? `No local governance session found for ${options.sessionId}`
            : 'No local governance sessions found');
    }
    const { record, path: localPath } = (0, governance_runtime_1.writeAIChangeRecord)(repoRoot, session);
    let receipt = null;
    let verification = null;
    const warnings = [];
    let trustLevel = record.integrity.trustLevel;
    if (options.signed) {
        try {
            const config = (0, config_1.loadConfig)();
            const connection = (0, runtime_connection_1.loadRuntimeConnection)(repoRoot);
            const metadata = (0, runtime_connection_2.collectRuntimeRepoMetadata)(repoRoot);
            const client = new api_client_1.ApiClient(config);
            const response = await client.signAIChangeRecord({
                repoId: connection?.repo.id ?? null,
                repoKey: connection?.repo.repoKey ?? metadata.remoteHash ?? metadata.rootHash,
                sessionId: record.session.sessionId,
                recordHash: record.integrity.recordHash,
                recordSchemaVersion: record.schemaVersion,
                recordGeneratedAt: record.generatedAt,
            });
            receipt = response.receipt || null;
            verification = response.verification || null;
            trustLevel = String(verification?.trustLevel || (response.ok ? 'backend_signed_verified' : 'backend_signed_invalid'));
            if (!response.ok) {
                warnings.push('Backend signing returned a non-valid verification result; exported as signed evidence needing review.');
            }
        }
        catch (error) {
            warnings.push(`Backend signing unavailable; exported self-attested record only: ${error instanceof Error ? error.message : String(error)}`);
            trustLevel = 'self_attested';
        }
    }
    // Source-free impact intelligence is advisory metadata alongside the signed
    // record — it is a sibling of `record`, so it never changes the record hash
    // or any backend receipt verification.
    const impactSummary = buildChangeRecordImpactSummary(repoRoot, record);
    const envelope = {
        schemaVersion: 'neurcode.ai-change-record-export.v1',
        generatedAt: new Date().toISOString(),
        trustLevel,
        record,
        ...(impactSummary ? { impactSummary } : {}),
        ...(receipt ? { receipt } : {}),
        ...(verification ? { verification } : {}),
        warnings,
        privacy: {
            sourceUploaded: false,
            sourceFree: true,
            excludes: ['source code', 'diff hunks', 'patch bodies', 'raw prompts', 'secrets', 'raw file contents'],
        },
    };
    const publicPath = options.output ? (0, node_path_1.resolve)(repoRoot, options.output) : publicAIChangeRecordPath(repoRoot, record.session.sessionId);
    writeJsonFile(publicPath, envelope);
    return {
        ok: true,
        repoRoot,
        sessionId: record.session.sessionId,
        localPath,
        publicPath,
        publicRelativePath: (0, node_path_1.relative)(repoRoot, publicPath).replace(/\\/g, '/'),
        recordHash: record.integrity.recordHash,
        trustLevel,
        receipt: {
            present: Boolean(receipt),
            receiptId: typeof receipt?.receiptId === 'string' ? receipt.receiptId : null,
            keyId: typeof receipt?.signingKeyId === 'string' ? receipt.signingKeyId : null,
            verificationStatus: String(verification?.trustLevel || verification?.status || (receipt ? 'backend_signed_unverified' : 'self_attested')),
        },
        warnings,
    };
}
function verifyAIChangeRecordForCli(options = {}) {
    if (!options.record)
        throw new Error('--record is required');
    const recordPayload = readJsonFile((0, node_path_1.resolve)(options.record));
    const recordParts = extractRecordAndReceipt(recordPayload);
    const receiptPayload = options.receipt ? readJsonFile((0, node_path_1.resolve)(options.receipt)) : recordPayload;
    const receiptParts = extractRecordAndReceipt(receiptPayload);
    const record = recordParts.record;
    const receipt = receiptParts.receipt;
    if (!record)
        throw new Error('No AI Change Record found in --record JSON');
    if (!receipt)
        throw new Error('No AI Change Record receipt found; pass --receipt or provide an export envelope');
    const verification = (0, governance_runtime_1.verifyAIChangeRecordReceipt)({
        recordHash: record.integrity.recordHash,
        receipt,
        signingSecret: process.env.NEURCODE_AI_CHANGE_RECORD_SIGNING_SECRET || null,
        expectedSigningKeyId: process.env.NEURCODE_AI_CHANGE_RECORD_SIGNING_KEY_ID || null,
    });
    return {
        ok: verification.valid,
        recordHash: record.integrity.recordHash,
        receiptId: verification.receiptId,
        trustLevel: verification.trustLevel,
        verification,
        privacy: {
            sourceUploaded: false,
            sourceFree: true,
        },
    };
}
function referenceLabel(ref) {
    const owner = ref.referencingSymbol
        ? `${ref.referencingFile}#${ref.referencingSymbol}:${ref.line}`
        : `${ref.referencingFile}:${ref.line}`;
    const test = ref.isTestFile ? ' test' : '';
    return `${ref.targetFile}#${ref.targetSymbol} <- ${owner}${test}`;
}
function structuralEventDetail(artifact, artifactPath, repoRoot) {
    return {
        schemaVersion: artifact.schemaVersion,
        artifactHash: artifact.artifactHash,
        artifactPath: artifactPath.replace(`${repoRoot}/`, ''),
        analysis: artifact.analysis,
        changedSymbols: artifact.changedSymbols.map((symbol) => ({
            file: symbol.file,
            name: symbol.name,
            kind: symbol.kind,
            action: symbol.action,
        })),
        topReferences: artifact.references.slice(0, 25).map((ref) => ({
            targetFile: ref.targetFile,
            targetSymbol: ref.targetSymbol,
            referencingFile: ref.referencingFile,
            referencingSymbol: ref.referencingSymbol,
            line: ref.line,
            isTestFile: ref.isTestFile,
        })),
        suppressedArtifacts: artifact.suppressedArtifacts,
        digest: artifact.digest,
        repoSymbolIndex: artifact.repoSymbolIndex,
        reuseFindings: artifact.reuseFindings,
        consequenceUnderstanding: artifact.consequenceUnderstanding,
        planAlignment: artifact.planAlignment,
        boundaryImpact: artifact.boundaryImpact,
        privacy: artifact.privacy,
    };
}
function renderStructuralUnderstanding(artifact, artifactPath, repoRoot) {
    const analysis = artifact.analysis;
    console.log('');
    console.log(chalk.bold('Local Structural Understanding'));
    console.log(chalk.dim('-'.repeat(76)));
    console.log(`Mode:      ${analysis.confidence}${analysis.reason ? chalk.yellow(` · ${analysis.reason}`) : ''}`);
    console.log(`Files:     ${analysis.changedFileCount} changed · ${analysis.filesAnalyzed} analyzed`);
    console.log(`Symbols:   ${analysis.changedSymbolCount} changed`);
    console.log(`Edges:     ${analysis.referenceCount} references · ${analysis.testReferenceCount} test references`);
    if (artifact.suppressedArtifacts?.length > 0) {
        const preview = artifact.suppressedArtifacts
            .slice(0, 3)
            .map((item) => `${item.path} (${item.reasonCode})`)
            .join(', ');
        const suffix = artifact.suppressedArtifacts.length > 3
            ? `, +${artifact.suppressedArtifacts.length - 3} more`
            : '';
        console.log(chalk.yellow(`Suppressed: ${artifact.suppressedArtifacts.length} generated artifact(s): ${preview}${suffix}`));
    }
    const consequence = artifact.consequenceUnderstanding;
    if (consequence?.analyzed &&
        (consequence.topImpacts.length > 0 ||
            consequence.topFindings.length > 0 ||
            consequence.effectDeltas.length > 0 ||
            consequence.contractDeltas.length > 0 ||
            consequence.inheritorProjections.length > 0)) {
        console.log('');
        console.log(chalk.bold('Consequence understanding'));
        if (consequence.summary.headline) {
            console.log(chalk.dim(`  ${consequence.summary.headline}`));
        }
        if (consequence.topImpacts.length > 0) {
            for (const impact of consequence.topImpacts.slice(0, 6)) {
                const reachable = impact.reachableProductionConsumerCount ?? impact.productionConsumerCount;
                const external = impact.externalProductionConsumerCount ?? 0;
                const consumers = reachable > 0 || impact.testConsumerCount > 0
                    ? ` · ${reachable} reachable prod file(s), ${external} external, ${impact.testConsumerCount} test file(s)`
                    : '';
                const flags = [
                    impact.highFanout ? 'high-fanout' : null,
                    impact.architectureRelevant ? 'architecture-relevant' : null,
                ].filter(Boolean).join(', ');
                const reasons = impact.reasonCodes.slice(0, 3).join(', ');
                console.log(chalk.dim(`  ${impact.rank}. ${impact.summary}${consumers}${flags ? ` · ${flags}` : ''}${reasons ? ` · ${reasons}` : ''}`));
            }
            if (consequence.topFindings.length > consequence.topImpacts.length) {
                console.log(chalk.dim(`  Raw findings: ${consequence.topFindings.length} deterministic finding(s) collapsed into ${consequence.topImpacts.length} impact(s).`));
            }
        }
        else if (consequence.topFindings.length > 0) {
            for (const finding of consequence.topFindings.slice(0, 8)) {
                const consumers = finding.consumerCount > 0
                    ? ` · ${finding.nonTestConsumerCount} non-test consumer(s), ${finding.testConsumerCount} test`
                    : '';
                const reasons = finding.reasonCodes.slice(0, 3).join(', ');
                console.log(chalk.dim(`  ${finding.rank}. ${finding.summary}${consumers} · ${reasons}`));
            }
        }
        else {
            for (const effect of consequence.effectDeltas.slice(0, 5)) {
                console.log(chalk.dim(`  ${effect.file}#${effect.symbol} ${effect.direction} ${effect.effectCategory}` +
                    ` (${effect.calleeName}${effect.line ? ` @ line ${effect.line}` : ''})`));
            }
        }
    }
    if (artifact.reuseFindings.length > 0) {
        console.log('');
        console.log(chalk.bold('Reuse governance advisories'));
        console.log(chalk.dim(`  ${artifact.reuseFindings.length} advisory finding${artifact.reuseFindings.length === 1 ? '' : 's'} from ` +
            `${artifact.repoSymbolIndex.indexedSymbolCount} indexed TS/JS symbol${artifact.repoSymbolIndex.indexedSymbolCount === 1 ? '' : 's'}.`));
        for (const finding of artifact.reuseFindings.slice(0, 8)) {
            console.log(chalk.dim(`  ${finding.changed.file}#${finding.changed.name} -> ${finding.existing.file}#${finding.existing.name}` +
                ` · ${finding.matchType} · ${finding.confidence}`));
        }
    }
    if (artifact.digest.topReferences.length > 0 || artifact.digest.topSymbols.length > 0) {
        console.log('');
        console.log(chalk.bold('Structural digest'));
        for (const symbol of artifact.digest.topSymbols.slice(0, 3)) {
            console.log(chalk.dim(`  ${symbol.file}#${symbol.name} · ${symbol.referenceCount} refs` +
                ` · ${symbol.crossPackageReferenceCount} cross-package` +
                ` · ${symbol.testReferenceCount} tests`));
        }
        if (artifact.digest.topConsequences.length > 0) {
            console.log(chalk.dim('  Top consequences:'));
            for (const item of artifact.digest.topConsequences.slice(0, 5)) {
                const reasons = item.reasonCodes.slice(0, 3).join(', ');
                const lines = item.representativeLines.length ? ` lines ${item.representativeLines.join(',')}` : '';
                console.log(chalk.dim(`    ${item.rank}. ${item.targetFile}#${item.targetSymbol} <- ${item.referencingFile}` +
                    ` · ${item.referenceCount} refs (${item.nonTestReferenceCount} non-test, ${item.testReferenceCount} tests)${lines} · ${reasons}`));
            }
        }
        else if (artifact.digest.topReferences.length > 0) {
            console.log(chalk.dim('  Most relevant references:'));
            for (const ref of artifact.digest.topReferences.slice(0, 5)) {
                const reasons = ref.reasonCodes.slice(0, 3).join(', ');
                console.log(chalk.dim(`    ${ref.rank}. ${referenceLabel(ref)} · ${reasons}`));
            }
        }
        console.log(chalk.dim(`  Hidden: ${artifact.digest.hidden.references} refs, ` +
            `${artifact.digest.hidden.testReferences} test refs, ` +
            `${artifact.digest.hidden.lowSignalReferences} low-signal refs.`));
    }
    if (artifact.changedSymbols.length > 0) {
        console.log('');
        console.log(chalk.bold('Changed symbols'));
        for (const symbol of artifact.changedSymbols.slice(0, 10)) {
            const refs = artifact.references.filter((ref) => ref.targetFile === symbol.file &&
                ref.targetSymbol === symbol.name &&
                ref.targetKind === symbol.kind);
            const tests = refs.filter((ref) => ref.isTestFile);
            console.log(chalk.dim(`  ${symbol.file}#${symbol.name} (${symbol.kind}) · ${refs.length} refs · ${tests.length} tests`));
        }
        if (artifact.changedSymbols.length > 10) {
            console.log(chalk.dim(`  +${artifact.changedSymbols.length - 10} more`));
        }
    }
    if (artifact.references.length > 0) {
        console.log('');
        console.log(chalk.bold('Relational facts'));
        for (const ref of artifact.references.slice(0, 12)) {
            console.log(chalk.dim(`  ${referenceLabel(ref)}`));
        }
        if (artifact.references.length > 12) {
            console.log(chalk.dim(`  +${artifact.references.length - 12} more references in artifact`));
        }
    }
    if (artifact.planAlignment) {
        console.log('');
        console.log(chalk.bold('Plan vs actual'));
        console.log(chalk.dim(`  planned touched:   ${compactList(artifact.planAlignment.plannedFilesTouched, 6)}`));
        console.log(chalk.dim(`  unplanned touched: ${compactList(artifact.planAlignment.unplannedFilesTouched, 6)}`));
        console.log(chalk.dim(`  symbols named:     ${compactList(artifact.planAlignment.changedSymbolsMentionedInPlan, 6)}`));
    }
    if (artifact.boundaryImpact.length > 0) {
        console.log('');
        console.log(chalk.bold('Boundary impact'));
        for (const item of artifact.boundaryImpact.slice(0, 8)) {
            const approval = item.approvalRequired ? chalk.yellow('approval-required') : 'owned';
            console.log(chalk.dim(`  ${item.file} · ${approval} · ${compactList(item.owners, 4)}`));
        }
    }
    console.log('');
    console.log(`Artifact:  ${chalk.dim(artifactPath.replace(`${repoRoot}/`, ''))}`);
    console.log(`Hash:      ${chalk.dim(artifact.artifactHash)}`);
    console.log(chalk.dim('Privacy:   facts-only; no source code, diff hunks, patch text, or model judgments.'));
    console.log('');
}
function structuralUnderstandingCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const session = resolveAIChangeRecordSession(repoRoot, options);
    if (!session) {
        if (options.json) {
            console.log(JSON.stringify({
                ok: false,
                repoRoot,
                error: 'No local governance session found. Start a governed session before building structural understanding.',
            }, null, 2));
        }
        else {
            (0, messages_1.printError)('No Governed Session', 'Start a governed session first, then run `neurcode session understanding` while the agent change is in progress.');
        }
        process.exitCode = 1;
        return;
    }
    let diffFiles = [];
    try {
        diffFiles = resolveUnderstandingDiffFiles(repoRoot, options);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
            console.log(JSON.stringify({ ok: false, repoRoot, sessionId: session.sessionId, error: message }, null, 2));
        }
        else {
            (0, messages_1.printError)('Unable to Read Diff', message);
        }
        process.exitCode = 1;
        return;
    }
    const profile = (0, v0_governance_1.getProfileStaleness)(repoRoot).currentProfile;
    const artifact = (0, structural_understanding_1.buildStructuralUnderstanding)(repoRoot, diffFiles, {
        session,
        profile,
        maxProgramFiles: options.maxProgramFiles,
        timeBudgetMs: options.timeBudgetMs,
    });
    const artifactPath = (0, structural_understanding_1.writeStructuralUnderstanding)(repoRoot, session.sessionId, artifact);
    const message = artifact.analysis.analyzed
        ? `Structural understanding: ${artifact.analysis.changedSymbolCount} changed symbols, ${artifact.analysis.referenceCount} references, ${artifact.analysis.testReferenceCount} test references.`
        : `Structural understanding not analyzed: ${artifact.analysis.reason ?? 'unknown reason'}.`;
    const eventSession = (0, governance_runtime_1.appendEvent)(repoRoot, session.sessionId, {
        type: 'structural_understanding',
        ts: artifact.generatedAt,
        message,
        detail: structuralEventDetail(artifact, artifactPath, repoRoot),
    });
    if (eventSession)
        (0, governance_runtime_1.writeAIChangeRecord)(repoRoot, eventSession);
    if (options.json) {
        console.log(JSON.stringify({
            ok: true,
            repoRoot,
            sessionId: session.sessionId,
            artifactPath,
            artifact,
        }, null, 2));
        return;
    }
    renderStructuralUnderstanding(artifact, artifactPath, repoRoot);
}
/**
 * List all sessions
 */
async function listSessionsCommand(options) {
    try {
        if (options.local) {
            listRuntimeSessionsCommand(options);
            return;
        }
        const config = (0, config_1.loadConfig)();
        if (!config.apiKey) {
            config.apiKey = (0, config_1.requireApiKey)();
        }
        const client = new api_client_1.ApiClient(config);
        const projectId = options.projectId || config.projectId;
        (0, messages_1.printSection)('Session History');
        (0, messages_1.printInfo)('Fetching sessions', projectId ? `Project: ${projectId}` : 'All projects');
        const sessions = await client.getSessions(projectId, options.all ? 100 : 20);
        if (sessions.length === 0) {
            (0, messages_1.printInfo)('No Sessions Found', 'You haven\'t created any sessions yet.\n   Start one with: neurcode plan "<your intent>"');
            return;
        }
        // Group sessions by status
        const activeSessions = sessions.filter(s => s.status === 'active');
        const completedSessions = sessions.filter(s => s.status === 'completed');
        const cancelledSessions = sessions.filter(s => s.status === 'cancelled');
        if (activeSessions.length > 0) {
            (0, messages_1.printSection)('Active Sessions');
            const tableRows = [
                ['Session ID', 'Title/Intent', 'Created', 'Files Changed']
            ];
            for (const session of activeSessions) {
                const title = session.title || session.intentDescription || 'Untitled';
                const shortId = session.sessionId.substring(0, 16) + '...';
                const created = new Date(session.createdAt).toLocaleDateString();
                tableRows.push([
                    shortId,
                    title.length > 40 ? title.substring(0, 40) + '...' : title,
                    created,
                    '—' // Files changed would need additional API call
                ]);
            }
            (0, messages_1.printTable)(tableRows);
        }
        if (completedSessions.length > 0) {
            (0, messages_1.printSection)('Completed Sessions');
            console.log(chalk.dim(`   ${completedSessions.length} completed session(s)`));
            if (!options.all && completedSessions.length > 5) {
                console.log(chalk.dim('   (Showing most recent. Use --all to see all)'));
            }
            console.log('');
        }
        if (cancelledSessions.length > 0) {
            (0, messages_1.printSection)('Cancelled Sessions');
            console.log(chalk.dim(`   ${cancelledSessions.length} cancelled session(s)`));
            console.log('');
        }
        (0, messages_1.printInfo)('Session Management', [
            `Active: ${activeSessions.length} | Completed: ${completedSessions.length} | Cancelled: ${cancelledSessions.length}`,
            'End a session: neurcode session end [session-id]',
            'View session details: neurcode session status [session-id]'
        ].join('\n   • '));
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('401') || error.message.includes('403')) {
                await (0, messages_1.printAuthError)(error);
            }
            else if (error.message.includes('project') || error.message.includes('404')) {
                (0, messages_1.printProjectError)(error, options.projectId);
            }
            else {
                (0, messages_1.printError)('Failed to List Sessions', error);
            }
        }
        else {
            (0, messages_1.printError)('Failed to List Sessions', String(error));
        }
        process.exit(1);
    }
}
/**
 * End a session
 */
async function endSessionCommand(options) {
    return endSessionCommandWithDependencies(options);
}
function endSessionOutput(options, payload, exitCode = 0) {
    if (options.json) {
        console.log(JSON.stringify({ ...payload, exitCode }, null, 2));
    }
    else if (payload.ok === true) {
        console.log(chalk.green(String(payload.message || 'Session ended.')));
        if (payload.sessionId)
            console.log(chalk.dim(`Session: ${payload.sessionId}`));
        if (payload.replayHash)
            console.log(chalk.dim(`replayHash: ${payload.replayHash}`));
    }
    else {
        console.error(chalk.red(String(payload.message || payload.error || 'Session end failed.')));
        const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
        for (const candidate of candidates) {
            const item = candidate;
            console.error(chalk.dim(`  ${item.sessionId || 'unknown'}: ${item.command || ''}`));
        }
    }
    process.exitCode = exitCode;
}
async function finishLocalGovernanceSession(repoRoot, session, completionStatus) {
    if (session.status === 'finished') {
        return {
            ok: true,
            ended: false,
            mode: 'local',
            status: 'already_finished',
            sessionId: session.sessionId,
            replayHash: session.replayHash || null,
            message: `Local governance session ${session.sessionId} is already finished.`,
        };
    }
    (0, governance_runtime_1.appendEvent)(repoRoot, session.sessionId, {
        type: 'user_decision',
        ts: new Date().toISOString(),
        decision: 'local_session_end_requested',
        message: 'Operator ended the local governance session.',
        detail: {
            source: 'local_cli',
            command: 'session end',
        },
    });
    const finished = (0, governance_runtime_1.finishSession)(repoRoot, session.sessionId, {
        reason: 'local_session_end_requested',
        completionStatus: completionStatus ?? 'completed',
    });
    if (!finished)
        throw new Error(`Local governance session ${session.sessionId} could not be finished.`);
    (0, agent_guard_supervisor_1.stopSupervisorOnSessionCompletion)(repoRoot);
    let liveStatusPublished = true;
    try {
        await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, finished);
    }
    catch {
        liveStatusPublished = false;
    }
    const replay = (0, governance_runtime_1.replaySession)(finished);
    return {
        ok: true,
        ended: true,
        mode: 'local',
        status: finished.status,
        completionStatus: finished.completionStatus,
        sessionId: finished.sessionId,
        replayHash: finished.replayHash,
        replayVerified: replay.matchesOriginal,
        liveStatusPublished,
        recordPath: `.neurcode/sessions/${finished.sessionId}.json`,
        evidencePath: (0, node_path_1.relative)(repoRoot, (0, governance_runtime_1.aiChangeRecordPath)(repoRoot, finished.sessionId)).replace(/\\/g, '/'),
        message: `Local governance session ${finished.sessionId} ended with replay-valid evidence.`,
    };
}
async function endSessionCommandWithDependencies(options, dependencies = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const isInteractive = dependencies.isInteractive ??
        (() => Boolean(process.stdin.isTTY && process.stdout.isTTY));
    const prompt = dependencies.prompt ?? promptUser;
    try {
        if (options.sessionId) {
            const local = (0, governance_runtime_1.loadSession)(repoRoot, options.sessionId);
            if (local) {
                endSessionOutput(options, await finishLocalGovernanceSession(repoRoot, local, options.completionStatus));
                return;
            }
            if (options.local) {
                endSessionOutput(options, {
                    ok: false,
                    ended: false,
                    mode: 'local',
                    reason: 'local_session_not_found',
                    sessionId: options.sessionId,
                    message: `Local governance session ${options.sessionId} was not found.`,
                }, 2);
                return;
            }
        }
        else {
            const records = scanSessionRecords(repoRoot);
            if (records.active.length === 1) {
                endSessionOutput(options, await finishLocalGovernanceSession(repoRoot, records.active[0], options.completionStatus));
                return;
            }
            if (records.active.length > 1) {
                if (!isInteractive()) {
                    endSessionOutput(options, {
                        ok: false,
                        ended: false,
                        mode: 'local',
                        reason: 'multiple_local_sessions_noninteractive',
                        candidates: records.active.map((session) => ({
                            sessionId: session.sessionId,
                            command: `neurcode session end --session-id ${session.sessionId}`,
                        })),
                        malformedRecords: records.malformed,
                        message: 'Multiple active local governance sessions were found; noninteractive selection is disabled.',
                    }, 2);
                    return;
                }
                console.log(chalk.bold('Multiple active local governance sessions'));
                records.active.forEach((session, index) => {
                    console.log(`  ${index + 1}. ${session.sessionId} · ${truncate(session.contract.goal, 72)}`);
                });
                const answer = await prompt(`Select local session to end (1-${records.active.length}): `);
                const selected = Number.parseInt(answer, 10);
                if (!Number.isInteger(selected) || selected < 1 || selected > records.active.length) {
                    endSessionOutput(options, {
                        ok: false,
                        ended: false,
                        mode: 'local',
                        reason: 'invalid_local_selection',
                        message: 'No local session was ended.',
                    }, 2);
                    return;
                }
                endSessionOutput(options, await finishLocalGovernanceSession(repoRoot, records.active[selected - 1], options.completionStatus));
                return;
            }
            if (options.local) {
                endSessionOutput(options, {
                    ok: true,
                    ended: false,
                    mode: 'local',
                    reason: 'no_active_local_session',
                    malformedRecords: records.malformed,
                    message: 'No active local governance session found.',
                });
                return;
            }
        }
        let config = null;
        let client = dependencies.cloudClient;
        if (!client) {
            config = (0, config_1.loadConfig)();
            if (!config.apiKey)
                config.apiKey = (0, config_1.requireApiKey)();
            client = new api_client_1.ApiClient(config);
        }
        let sessionId = options.sessionId;
        if (!sessionId) {
            const stateSessionId = (0, state_1.getSessionId)() || undefined;
            if (stateSessionId && (0, governance_runtime_1.loadSession)(repoRoot, stateSessionId)) {
                const local = (0, governance_runtime_1.loadSession)(repoRoot, stateSessionId);
                endSessionOutput(options, await finishLocalGovernanceSession(repoRoot, local, options.completionStatus));
                return;
            }
            sessionId = stateSessionId;
        }
        if (!sessionId) {
            const sessions = await client.getSessions(options.projectId || config?.projectId, 20);
            const active = sessions.filter((session) => session.status === 'active');
            if (active.length === 0) {
                endSessionOutput(options, {
                    ok: true,
                    ended: false,
                    mode: 'cloud',
                    reason: 'no_active_cloud_session',
                    message: 'No active local or cloud session found.',
                });
                return;
            }
            if (active.length > 1 && !isInteractive()) {
                endSessionOutput(options, {
                    ok: false,
                    ended: false,
                    mode: 'cloud',
                    reason: 'multiple_cloud_sessions_noninteractive',
                    candidates: active.map((session) => ({
                        sessionId: session.sessionId,
                        command: `neurcode session end --session-id ${session.sessionId}`,
                    })),
                    message: 'Multiple active cloud sessions were found; noninteractive selection is disabled.',
                }, 2);
                return;
            }
            if (active.length === 1) {
                sessionId = active[0].sessionId;
            }
            else {
                active.forEach((session, index) => {
                    const title = session.title || session.intentDescription || 'Untitled';
                    console.log(`  ${index + 1}. ${title} · ${session.sessionId}`);
                });
                const answer = await prompt(`Select cloud session to end (1-${active.length}): `);
                const selected = Number.parseInt(answer, 10);
                if (!Number.isInteger(selected) || selected < 1 || selected > active.length) {
                    endSessionOutput(options, {
                        ok: false,
                        ended: false,
                        mode: 'cloud',
                        reason: 'invalid_cloud_selection',
                        message: 'No cloud session was ended.',
                    }, 2);
                    return;
                }
                sessionId = active[selected - 1].sessionId;
            }
        }
        if (!sessionId) {
            endSessionOutput(options, {
                ok: false,
                ended: false,
                mode: 'cloud',
                reason: 'cloud_session_not_resolved',
                message: 'No cloud session could be resolved.',
            }, 2);
            return;
        }
        const sessionData = await client.getSession(sessionId);
        const session = sessionData.session;
        if (session.status === 'completed' || session.status === 'cancelled') {
            endSessionOutput(options, {
                ok: true,
                ended: false,
                mode: 'cloud',
                status: session.status,
                sessionId,
                message: `Cloud session ${sessionId} is already ${session.status}.`,
            });
            return;
        }
        if (isInteractive()) {
            const confirm = await prompt(`End cloud session ${sessionId}? (y/n): `);
            if (!['y', 'yes'].includes(confirm.toLowerCase())) {
                endSessionOutput(options, {
                    ok: true,
                    ended: false,
                    mode: 'cloud',
                    reason: 'operator_cancelled',
                    sessionId,
                    message: 'Cloud session was not ended.',
                });
                return;
            }
        }
        await client.endSession(sessionId);
        try {
            if ((0, state_1.getSessionId)() === sessionId) {
                const { clearSessionId } = await Promise.resolve().then(() => __importStar(require('../utils/state')));
                clearSessionId();
            }
        }
        catch {
            // Legacy local cloud pointer cleanup is best-effort.
        }
        endSessionOutput(options, {
            ok: true,
            ended: true,
            mode: 'cloud',
            status: 'completed',
            sessionId,
            message: `Cloud session ${sessionId} ended successfully.`,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const notFound = /not found|404/i.test(message);
        endSessionOutput(options, {
            ok: false,
            ended: false,
            mode: 'unknown',
            reason: notFound ? 'session_not_found' : 'session_end_failed',
            sessionId: options.sessionId || null,
            error: message,
            message: notFound
                ? `Session ${options.sessionId || ''} was not found locally or in the cloud.`.trim()
                : `Failed to end session: ${message}`,
        }, notFound ? 2 : 1);
    }
}
/**
 * Show session status
 */
async function sessionStatusCommand(options) {
    try {
        const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
        const localSession = loadLocalGovernanceSession(repoRoot, options.sessionId);
        if (localSession || options.local || (options.json && !options.projectId)) {
            localGovernanceStatusCommand(options);
            return;
        }
        const config = (0, config_1.loadConfig)();
        if (!config.apiKey) {
            config.apiKey = (0, config_1.requireApiKey)();
        }
        const client = new api_client_1.ApiClient(config);
        let sessionId = options.sessionId || (0, state_1.getSessionId)();
        if (!sessionId) {
            (0, messages_1.printError)('No Session Found', undefined, [
                'No active session in this directory',
                'Start a session: neurcode plan "<your intent>"',
                'Or specify a session: neurcode session status <session-id>'
            ]);
            process.exit(1);
        }
        const sessionData = await client.getSession(sessionId);
        const session = sessionData.session;
        await (0, messages_1.printSuccessBanner)('Session Status');
        (0, messages_1.printSection)('Session Details');
        console.log(chalk.white(`   Title: ${session.title || session.intentDescription || 'Untitled'}`));
        console.log(chalk.white(`   Status: ${session.status === 'active' ? chalk.green('Active') : session.status === 'completed' ? chalk.dim('Completed') : chalk.yellow('Cancelled')}`));
        console.log(chalk.white(`   Created: ${new Date(session.createdAt).toLocaleString()}`));
        if (session.endedAt) {
            console.log(chalk.white(`   Ended: ${new Date(session.endedAt).toLocaleString()}`));
        }
        console.log(chalk.white(`   Files Changed: ${sessionData.files?.length || 0}`));
        console.log(chalk.dim(`   Session ID: ${sessionId}`));
        console.log('');
        if (session.status === 'active') {
            (0, messages_1.printInfo)('Active Session', [
                'This session is currently active',
                'End it with: neurcode session end',
                'Or continue working and end it when done'
            ].join('\n   • '));
        }
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('401') || error.message.includes('403')) {
                await (0, messages_1.printAuthError)(error);
            }
            else if (error.message.includes('not found') || error.message.includes('404')) {
                (0, messages_1.printError)('Session Not Found', error, [
                    `Session "${options.sessionId || 'unknown'}" could not be found`,
                    'List your sessions: neurcode session list',
                    'Start a new session: neurcode plan "<your intent>"'
                ]);
            }
            else {
                (0, messages_1.printError)('Failed to Get Session Status', error);
            }
        }
        else {
            (0, messages_1.printError)('Failed to Get Session Status', String(error));
        }
        process.exit(1);
    }
}
function listLocalSessionsCommand(options = {}) {
    try {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const sessions = (0, session_continuity_1.listLocalIntentSessions)(projectRoot);
        if (options.json) {
            console.log(JSON.stringify({
                success: true,
                projectRoot,
                count: sessions.length,
                sessions,
            }, null, 2));
            return;
        }
        (0, messages_1.printSection)('Local Intent Sessions');
        if (sessions.length === 0) {
            (0, messages_1.printInfo)('No Local Sessions', 'Run `neurcode start "<intent>"` to create a persistent intent runtime session.');
            return;
        }
        const rows = [['Session ID', 'Created', 'Branch', 'Intent']];
        for (const session of sessions.slice(0, 12)) {
            rows.push([
                session.sessionId.length > 26 ? `${session.sessionId.slice(0, 26)}...` : session.sessionId,
                new Date(session.createdAt).toLocaleString(),
                session.branchName || '—',
                session.intentSummary.length > 42 ? `${session.intentSummary.slice(0, 42)}...` : session.intentSummary,
            ]);
        }
        (0, messages_1.printTable)(rows);
    }
    catch (error) {
        (0, messages_1.printError)('Failed to List Local Sessions', error instanceof Error ? error : String(error));
        process.exit(1);
    }
}
function currentLocalSessionCommand(options = {}) {
    try {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const active = (0, session_continuity_1.getActiveLocalIntentSession)(projectRoot);
        if (!active) {
            if (options.json) {
                console.log(JSON.stringify({
                    success: false,
                    message: 'No active local intent session found.',
                }, null, 2));
                process.exit(1);
                return;
            }
            (0, messages_1.printInfo)('No Active Local Session', 'Run `neurcode start "<intent>"` to create the canonical local session runtime.');
            return;
        }
        if (options.json) {
            console.log(JSON.stringify({
                success: true,
                projectRoot,
                sessionRuntime: active.sessionRuntime,
                intentPack: active.intentPack,
                contextPack: active.contextPack,
            }, null, 2));
            return;
        }
        (0, messages_1.printSection)('Active Local Intent Session');
        console.log(chalk.white(`   Session ID: ${active.sessionRuntime.sessionId}`));
        console.log(chalk.white(`   Intent: ${active.intentPack.intent.normalized}`));
        console.log(chalk.white(`   Branch: ${active.sessionRuntime.branchName || '—'}`));
        console.log(chalk.white(`   Intent Pack: ${active.intentPack.intentPackId}`));
        console.log(chalk.white(`   Context Pack: ${active.contextPack.contextPackId}`));
        console.log(chalk.white(`   Repo Graph: ${active.repositoryGraph.graphId}`));
        console.log(chalk.dim(`   Created: ${new Date(active.sessionRuntime.createdAt).toLocaleString()}`));
        console.log('');
    }
    catch (error) {
        (0, messages_1.printError)('Failed to Read Local Session', error instanceof Error ? error : String(error));
        process.exit(1);
    }
}
function resumeLocalSessionCommand(options = {}) {
    try {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const resumed = (0, session_continuity_1.resumeLocalIntentSession)(projectRoot, options.sessionId);
        if (!resumed) {
            if (options.json) {
                console.log(JSON.stringify({
                    success: false,
                    message: 'Unable to resume local session. No stored session matched the requested ID.',
                }, null, 2));
                process.exit(1);
                return;
            }
            (0, messages_1.printError)('Unable to Resume Local Session', undefined, ['No stored session matched the requested ID.', 'List available sessions with: neurcode session list-local']);
            process.exit(1);
        }
        if (options.json) {
            console.log(JSON.stringify({
                success: true,
                sessionId: resumed.sessionRuntime.sessionId,
                intentPackId: resumed.intentPack.intentPackId,
                contextPackId: resumed.contextPack.contextPackId,
                repositoryGraphId: resumed.repositoryGraph.graphId,
                activePaths: resumed.activePaths,
            }, null, 2));
            return;
        }
        (0, messages_1.printSuccess)('Local Session Restored', [
            `Session ${resumed.sessionRuntime.sessionId} is now active.`,
            `Intent: ${resumed.intentPack.intent.normalized}`,
            `Intent pack: ${resumed.intentPack.intentPackId}`,
        ].join('\n   • '));
    }
    catch (error) {
        (0, messages_1.printError)('Failed to Resume Local Session', error instanceof Error ? error : String(error));
        process.exit(1);
    }
}
function compareLocalSessionsCommand(options = {}) {
    try {
        if (!options.left || !options.right) {
            throw new Error('Both --left and --right session IDs are required.');
        }
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const comparison = (0, session_continuity_1.compareLocalIntentSessions)(projectRoot, options.left, options.right);
        if (!comparison) {
            throw new Error('Unable to load one or both local sessions.');
        }
        if (options.json) {
            console.log(JSON.stringify({
                success: true,
                comparison,
            }, null, 2));
            return;
        }
        (0, messages_1.printSection)('Local Session Comparison');
        console.log(chalk.white(`   Left: ${comparison.leftSessionId}`));
        console.log(chalk.white(`   Right: ${comparison.rightSessionId}`));
        console.log(chalk.white(`   Same intent: ${comparison.sameIntent ? 'yes' : 'no'}`));
        console.log(chalk.white(`   Same branch: ${comparison.sameBranch ? 'yes' : 'no'}`));
        console.log('');
        (0, messages_1.printInfo)('Scope Delta', [
            `Approved files added: ${comparison.approvedFilesAdded.length || 0}`,
            `Approved files removed: ${comparison.approvedFilesRemoved.length || 0}`,
            `Modules added: ${comparison.modulesAdded.length || 0}`,
            `Modules removed: ${comparison.modulesRemoved.length || 0}`,
            `Boundary expectations added: ${comparison.boundariesAdded.length || 0}`,
            `Boundary expectations removed: ${comparison.boundariesRemoved.length || 0}`,
        ].join('\n   • '));
    }
    catch (error) {
        (0, messages_1.printError)('Failed to Compare Local Sessions', error instanceof Error ? error : String(error));
        process.exit(1);
    }
}
//# sourceMappingURL=session.js.map