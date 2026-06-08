"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtimeCloudStatusCommand = runtimeCloudStatusCommand;
exports.runtimeHygieneCommand = runtimeHygieneCommand;
exports.runtimeResetStaleCloudCommand = runtimeResetStaleCloudCommand;
exports.runtimeCommand = runtimeCommand;
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const api_client_1 = require("../api-client");
const config_1 = require("../config");
const runtime_connection_1 = require("../utils/runtime-connection");
const runtime_outbox_1 = require("../utils/runtime-outbox");
const v0_governance_1 = require("../utils/v0-governance");
const runtime_identity_1 = require("./runtime-identity");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (s) => s,
        yellow: (s) => s,
        red: (s) => s,
        cyan: (s) => s,
        dim: (s) => s,
        bold: (s) => s,
    };
}
function firstString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function safeStatus(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : 'unknown';
}
function unique(values) {
    return [...new Set(values.filter((value) => value.trim().length > 0))];
}
function matchSession(liveSessions, sessionId) {
    if (sessionId) {
        return liveSessions.find((item) => item.sessionId === sessionId) || null;
    }
    return liveSessions.find((item) => item.status === 'active') || null;
}
function isActiveRuntimeSession(session) {
    return Boolean(session && session.status === 'active' && session.lifecycle?.phase !== 'finished');
}
function latestApprovalPath(liveSession, approvals) {
    return firstString(liveSession?.latestBlock?.suggestedApprovalPath)
        || firstString(liveSession?.latestEvent?.suggestedApprovalPath)
        || firstString(liveSession?.lifecycle?.blockedPath)
        || firstString(approvals.find((item) => item.status === 'pending')?.path)
        || firstString(approvals[0]?.path);
}
function approvalVisibleForPath(approvals, sessionId, path) {
    return approvals.some((approval) => {
        const sessionMatches = !sessionId || approval.sessionId === sessionId;
        const pathMatches = !path || approval.path === path;
        return sessionMatches && pathMatches && ['pending', 'applied', 'failed', 'denied', 'revoked', 'expired'].includes(approval.status);
    });
}
function nextActionFor(payload) {
    const approvalStatus = payload.dashboard.approvalStatuses[0];
    if (!payload.dashboard.liveSessionVisible) {
        return 'No matching live session is visible in the dashboard yet; confirm the agent is connected and live transport is healthy.';
    }
    if (approvalStatus === 'pending') {
        return 'Operator approval is queued. Let the agent re-check the exact path; neighboring files remain blocked.';
    }
    if (approvalStatus === 'applied') {
        return 'Dashboard approval has been applied. Retry only the exact approved path, then test the neighboring file remains blocked.';
    }
    if (payload.dashboard.blockedApprovalVisible) {
        return `Approval request is visible with status ${approvalStatus || 'unknown'}. Follow the dashboard decision state.`;
    }
    if (payload.liveSession?.latestBlock) {
        return 'Live session is visible with a block, but no approval request is visible yet; refresh dashboard or re-run the governed check.';
    }
    return payload.operationsStatus?.sessions?.reasons?.[0] || 'Runtime cloud state is visible; continue governed agent work.';
}
async function fetchCloudStatus(repoRoot, connection, activeSession, options) {
    const config = (0, config_1.loadConfig)();
    config.apiUrl = connection.apiUrl;
    config.orgId = connection.organizationId;
    config.projectId = connection.projectId || config.projectId;
    config.apiKey = (0, config_1.requireApiKey)(connection.organizationId);
    const client = new api_client_1.ApiClient(config);
    const repoKey = options.repoKey || connection.repo.repoKey;
    const initialSessionId = firstString(options.sessionId) || activeSession?.sessionId || null;
    const [operationsStatus, liveSessionsResponse, evidenceSummary] = await Promise.all([
        client.getRuntimeOperationsStatus(),
        client.getRuntimeLiveSessions({ repoKey, limit: 50 }),
        client.getRuntimeEvidenceSummary({ repoKey }),
    ]);
    const liveSession = matchSession(liveSessionsResponse.liveSessions, initialSessionId);
    const sessionId = initialSessionId || liveSession?.sessionId || null;
    const approvalsResponse = await client.getRuntimeControlPlaneApprovals({
        repoKey,
        sessionId: sessionId || undefined,
        status: 'all',
        limit: 50,
    });
    const approvals = approvalsResponse.approvals || [];
    const approvalsForSession = sessionId ? approvals : [];
    const exactApprovalPath = latestApprovalPath(liveSession, approvalsForSession);
    const approvalStatuses = unique(approvalsForSession
        .filter((approval) => (!sessionId || approval.sessionId === sessionId) && (!exactApprovalPath || approval.path === exactApprovalPath))
        .map((approval) => safeStatus(approval.status)));
    const liveTransport = (0, runtime_outbox_1.inspectRuntimeOutbox)(repoRoot);
    const dashboard = {
        liveSessionVisible: isActiveRuntimeSession(liveSession),
        blockedApprovalVisible: Boolean(sessionId && approvalVisibleForPath(approvals, sessionId, exactApprovalPath)),
        exactApprovalPath,
        approvalStatuses,
        nextAction: '',
    };
    const payload = {
        ok: true,
        generatedAt: new Date().toISOString(),
        repoRoot,
        repo: connection.repo,
        sessionId,
        dashboard,
        liveSession,
        approvals,
        operationsStatus,
        bulkEvidence: {
            localAutoSync: connection.autoSync || null,
            cloudIngestion: operationsStatus.ingestion || null,
            evidenceSummary: evidenceSummary.summary || null,
        },
        liveTransport,
        privacy: {
            sourceUploaded: false,
            commandMode: 'read_only',
            uploadedFields: [
                'session ids',
                'approval paths',
                'owners',
                'status counters',
                'delivery sequence',
                'payload hashes',
                'timestamps',
            ],
        },
    };
    payload.dashboard.nextAction = nextActionFor(payload);
    return payload;
}
function printCloudStatus(payload) {
    const live = payload.dashboard.liveSessionVisible ? chalk.green('yes') : chalk.yellow('no');
    const approval = payload.dashboard.blockedApprovalVisible ? chalk.green('yes') : chalk.yellow('no');
    const ingestionStatus = payload.operationsStatus?.ingestion?.status || 'unknown';
    const ingestionReason = payload.operationsStatus?.ingestion?.reasons?.[0];
    const sessionStatus = payload.operationsStatus?.sessions?.status || 'unknown';
    const sessionReason = payload.operationsStatus?.sessions?.reasons?.[0];
    console.log(chalk.bold('Runtime cloud status'));
    console.log(chalk.dim(`Repo:       ${payload.repo?.name || 'unpaired'}${payload.repo?.repoKey ? ` (${payload.repo.repoKey})` : ''}`));
    console.log(chalk.dim(`Session:    ${payload.sessionId || 'none'}`));
    console.log(`Dashboard:  live session ${live} · approval visible ${approval}`);
    if (payload.dashboard.exactApprovalPath) {
        console.log(chalk.dim(`Exact path: ${payload.dashboard.exactApprovalPath}`));
    }
    if (payload.dashboard.approvalStatuses.length > 0) {
        console.log(chalk.dim(`Approvals:  ${payload.dashboard.approvalStatuses.join(', ')}`));
    }
    console.log(chalk.dim(`Live state: ${sessionStatus}${sessionReason ? ` · ${sessionReason}` : ''}`));
    console.log(chalk.dim(`Transport:  ${payload.liveTransport.health} · pending ${payload.liveTransport.pendingEvents} · dead letters ${payload.liveTransport.deadLetterEvents}`));
    console.log(chalk.dim(`Bulk sync:  local ${payload.bulkEvidence.localAutoSync?.lastStatus || 'unknown'} · cloud ${ingestionStatus}${ingestionReason ? ` · ${ingestionReason}` : ''}`));
    if (payload.bulkEvidence.evidenceSummary) {
        const summary = payload.bulkEvidence.evidenceSummary;
        console.log(chalk.dim(`Evidence:   sessions ${summary.sessions} · blocks ${summary.blockedEdits} · approvals ${summary.approvalsGranted}`));
    }
    console.log('');
    console.log(chalk.bold('Next action'));
    console.log(chalk.dim(`  ${payload.dashboard.nextAction}`));
    console.log('');
    console.log(chalk.dim('Privacy: read-only command; no source, diff, patch, before/after, or file content is uploaded.'));
}
function buildClientForConnection(connection) {
    const config = (0, config_1.loadConfig)();
    config.apiUrl = connection.apiUrl;
    config.orgId = connection.organizationId;
    config.projectId = connection.projectId || config.projectId;
    config.apiKey = (0, config_1.requireApiKey)(connection.organizationId);
    return new api_client_1.ApiClient(config);
}
async function runtimeCloudStatusCommand(options = {}) {
    try {
        const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
        const connection = (0, runtime_connection_1.loadRuntimeConnection)(repoRoot);
        const liveTransport = (0, runtime_outbox_1.inspectRuntimeOutbox)(repoRoot);
        if (!connection) {
            const payload = {
                ok: false,
                generatedAt: new Date().toISOString(),
                repoRoot,
                repo: null,
                sessionId: firstString(options.sessionId),
                error: 'Repository is not paired with the Runtime Control Plane.',
                next: 'Run `neurcode activate claude --connect <token>` or connect the repo from the dashboard.',
                liveTransport,
                privacy: {
                    sourceUploaded: false,
                    commandMode: 'read_only',
                },
            };
            if (options.json) {
                console.log(JSON.stringify(payload, null, 2));
            }
            else {
                console.error(chalk.red(payload.error));
                console.log(chalk.dim(payload.next));
            }
            process.exitCode = 1;
            return;
        }
        const activeSession = (0, governance_runtime_1.loadActiveSession)(repoRoot);
        const payload = await fetchCloudStatus(repoRoot, connection, activeSession, options);
        if (options.json) {
            console.log(JSON.stringify(payload, null, 2));
            return;
        }
        printCloudStatus(payload);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
            console.log(JSON.stringify({
                ok: false,
                error: message,
                generatedAt: new Date().toISOString(),
                privacy: {
                    sourceUploaded: false,
                    commandMode: 'read_only',
                },
            }, null, 2));
        }
        else {
            console.error(chalk.red(`Runtime cloud status failed: ${message}`));
        }
        process.exitCode = 1;
    }
}
async function runtimeHygieneCommand(options = {}) {
    try {
        const connection = (0, runtime_connection_1.loadRuntimeConnection)((0, v0_governance_1.resolveRepoRoot)(process.cwd()));
        if (!connection) {
            const payload = { ok: false, error: 'Repository is not paired with the Runtime Control Plane.' };
            if (options.json)
                console.log(JSON.stringify(payload, null, 2));
            else
                console.error(chalk.red(payload.error));
            process.exitCode = 1;
            return;
        }
        const client = buildClientForConnection(connection);
        if (options.dryRun) {
            const preview = await client.getRuntimeHygienePreview();
            if (options.json) {
                console.log(JSON.stringify(preview, null, 2));
                return;
            }
            console.log(chalk.bold('Runtime hygiene preview'));
            console.log(chalk.dim(`Orphaned approvals: ${preview.preview.orphanedApprovals}`));
            console.log(chalk.dim(`Ghost repos:         ${preview.preview.ghostRepos}`));
            console.log(chalk.dim(`Stale live sessions: ${preview.preview.staleLiveSessions}`));
            return;
        }
        const response = await client.applyRuntimeHygiene({
            dryRun: false,
            reason: options.reason || 'Operator runtime hygiene from CLI',
        });
        if (options.json) {
            console.log(JSON.stringify(response, null, 2));
            return;
        }
        console.log(chalk.bold('Runtime hygiene applied'));
        console.log(chalk.green(`Expired approvals: ${response.result.expiredApprovals}`));
        console.log(chalk.green(`Removed ghost repos: ${response.result.removedGhostRepos.length}`));
        console.log(chalk.green(`Finished stale sessions: ${response.result.finishedStaleSessions.length}`));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json)
            console.log(JSON.stringify({ ok: false, error: message }, null, 2));
        else
            console.error(chalk.red(`Runtime hygiene failed: ${message}`));
        process.exitCode = 1;
    }
}
async function runtimeResetStaleCloudCommand(options = {}) {
    try {
        const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
        const connection = (0, runtime_connection_1.loadRuntimeConnection)(repoRoot);
        if (!connection) {
            const payload = {
                ok: false,
                error: 'Repository is not paired with the Runtime Control Plane.',
                next: 'Run `neurcode activate claude --connect <token>` or connect the repo from the dashboard.',
                privacy: {
                    sourceUploaded: false,
                    commandMode: 'stale_session_cleanup',
                },
            };
            if (options.json) {
                console.log(JSON.stringify(payload, null, 2));
            }
            else {
                console.error(chalk.red(payload.error));
                console.log(chalk.dim(payload.next));
            }
            process.exitCode = 1;
            return;
        }
        const activeSession = (0, governance_runtime_1.loadActiveSession)(repoRoot);
        const client = buildClientForConnection(connection);
        const repoKey = options.repoKey || connection.repo.repoKey;
        const initialSessionId = firstString(options.sessionId) || activeSession?.sessionId || null;
        let sessionId = initialSessionId;
        if (!sessionId) {
            const live = await client.getRuntimeLiveSessions({ repoKey, limit: 50 });
            const stale = live.liveSessions.find((session) => session.lifecycle?.phase === 'stale');
            sessionId = stale?.sessionId || live.liveSessions.find((session) => session.status === 'active')?.sessionId || null;
        }
        if (!sessionId) {
            const payload = {
                ok: false,
                error: 'No local or cloud live session found to reset.',
                privacy: {
                    sourceUploaded: false,
                    commandMode: 'stale_session_cleanup',
                },
            };
            if (options.json)
                console.log(JSON.stringify(payload, null, 2));
            else
                console.error(chalk.yellow(payload.error));
            process.exitCode = 1;
            return;
        }
        const response = await client.finishStaleRuntimeLiveSession(sessionId, {
            repoKey,
            reason: options.reason || 'Operator closed stale runtime session',
            force: options.force === true,
        });
        const payload = {
            ok: true,
            repoRoot,
            repo: connection.repo,
            sessionId,
            force: options.force === true,
            result: response,
            privacy: {
                sourceUploaded: false,
                commandMode: 'stale_session_cleanup',
                uploadedFields: response.privacy.uploadedFields,
            },
        };
        if (options.json) {
            console.log(JSON.stringify(payload, null, 2));
            return;
        }
        console.log(chalk.bold('Runtime stale session cleanup'));
        console.log(chalk.dim(`Repo:       ${connection.repo.name} (${connection.repo.repoKey})`));
        console.log(chalk.dim(`Session:    ${sessionId}`));
        console.log(`Status:     ${response.alreadyFinished ? chalk.green('already finished') : chalk.green('finished')}`);
        console.log(chalk.dim(`Approvals:  revoked ${response.revokedApprovals.length} pending request${response.revokedApprovals.length === 1 ? '' : 's'}`));
        if (typeof response.staleSeconds === 'number') {
            console.log(chalk.dim(`Age:        ${Math.floor(response.staleSeconds / 60)}m stale`));
        }
        console.log(chalk.dim('Privacy: source-free; no code, diff, patch, before/after, or file content uploaded.'));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
            console.log(JSON.stringify({
                ok: false,
                error: message,
                privacy: {
                    sourceUploaded: false,
                    commandMode: 'stale_session_cleanup',
                },
            }, null, 2));
        }
        else {
            console.error(chalk.red(`Runtime stale cleanup failed: ${message}`));
        }
        process.exitCode = 1;
    }
}
function runtimeCommand(program) {
    const runtime = program
        .command('runtime')
        .description('Read-only runtime cloud verification for governed agent sessions');
    (0, runtime_identity_1.registerRuntimeIdentityCommand)(runtime);
    runtime
        .command('cloud-status')
        .description('Read dashboard/runtime cloud state without mutating approvals or sessions')
        .option('--session-id <id>', 'Governance session ID (default: active local session or latest live session)')
        .option('--repo-key <key>', 'Runtime repo key (default: paired repo)')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        await runtimeCloudStatusCommand({
            sessionId: options.sessionId,
            repoKey: options.repoKey,
            dir: options.dir,
            json: options.json === true,
        });
    });
    runtime
        .command('hygiene')
        .description('Expire orphaned approvals, remove ghost repo pairings, and finish stale live sessions')
        .option('--dry-run', 'Preview hygiene counts without mutating cloud state')
        .option('--reason <text>', 'Operator cleanup reason')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        await runtimeHygieneCommand({
            dryRun: options.dryRun === true,
            reason: options.reason,
            json: options.json === true,
        });
    });
    runtime
        .command('reset-stale-cloud')
        .description('Finish a stale dashboard live session and revoke its pending approvals')
        .option('--session-id <id>', 'Governance session ID (default: active local session or latest stale cloud session)')
        .option('--repo-key <key>', 'Runtime repo key (default: paired repo)')
        .option('--reason <text>', 'Operator cleanup reason')
        .option('--force', 'Finish even if the session is not older than the stale threshold')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        await runtimeResetStaleCloudCommand({
            sessionId: options.sessionId,
            repoKey: options.repoKey,
            reason: options.reason,
            force: options.force === true,
            dir: options.dir,
            json: options.json === true,
        });
    });
}
//# sourceMappingURL=runtime.js.map