"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtimeSyncCommand = runtimeSyncCommand;
exports.syncCommand = syncCommand;
const crypto_1 = require("crypto");
const child_process_1 = require("child_process");
const path_1 = require("path");
const fs_1 = require("fs");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const api_client_1 = require("../api-client");
const config_1 = require("../config");
const runtime_evidence_1 = require("../utils/runtime-evidence");
const v0_governance_1 = require("../utils/v0-governance");
const runtime_connection_1 = require("../utils/runtime-connection");
const runtime_live_1 = require("../utils/runtime-live");
const runtime_outbox_1 = require("../utils/runtime-outbox");
const runtime_outbox_2 = require("../utils/runtime-outbox");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (s) => s,
        yellow: (s) => s,
        red: (s) => s,
        dim: (s) => s,
        bold: (s) => s,
    };
}
const SOURCE_LIKE_KEYS = new Set([
    'content',
    'fileContent',
    'file_content',
    'sourceText',
    'source_text',
    'diff',
    'diffText',
    'diff_text',
    'patch',
    'before',
    'after',
]);
function sha256(input) {
    return (0, crypto_1.createHash)('sha256').update(input).digest('hex').slice(0, 32);
}
function readJsonFile(path) {
    try {
        if (!(0, fs_1.existsSync)(path))
            return null;
        return JSON.parse((0, fs_1.readFileSync)(path, 'utf8'));
    }
    catch {
        return null;
    }
}
function gitValue(repoRoot, args) {
    try {
        const value = (0, child_process_1.execFileSync)('git', args, {
            cwd: repoRoot,
            stdio: ['ignore', 'pipe', 'ignore'],
            encoding: 'utf8',
        }).trim();
        return value || null;
    }
    catch {
        return null;
    }
}
function sanitizeForUpload(value, path = 'session') {
    if (Array.isArray(value)) {
        return value.map((item, index) => sanitizeForUpload(item, `${path}[${index}]`));
    }
    if (!value || typeof value !== 'object')
        return value;
    const out = {};
    for (const [key, child] of Object.entries(value)) {
        if (SOURCE_LIKE_KEYS.has(key)) {
            continue;
        }
        out[key] = sanitizeForUpload(child, `${path}.${key}`);
    }
    return out;
}
function assertPayloadHasNoSourceKeys(value, path = 'payload') {
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertPayloadHasNoSourceKeys(item, `${path}[${index}]`));
        return;
    }
    if (!value || typeof value !== 'object')
        return;
    for (const [key, child] of Object.entries(value)) {
        if (SOURCE_LIKE_KEYS.has(key)) {
            throw new Error(`runtime sync payload still contains source-like key ${path}.${key}`);
        }
        assertPayloadHasNoSourceKeys(child, `${path}.${key}`);
    }
}
function replayStatus(session) {
    if (!session.replayHash)
        return 'missing';
    return (0, governance_runtime_1.replaySession)(session).matchesOriginal ? 'verified' : 'mismatch';
}
function buildUploadPayload(repoRoot, records) {
    const profile = readJsonFile((0, path_1.join)(repoRoot, '.neurcode', 'profile.json'));
    const freshness = (0, v0_governance_1.buildProfileFreshnessSignal)((0, v0_governance_1.getProfileStaleness)(repoRoot));
    const remote = gitValue(repoRoot, ['config', '--get', 'remote.origin.url']);
    const head = gitValue(repoRoot, ['rev-parse', '--short=12', 'HEAD']);
    const repoName = typeof profile?.repo?.name === 'string' && profile.repo.name.trim()
        ? profile.repo.name.trim()
        : (0, path_1.basename)(repoRoot);
    const payload = {
        repo: {
            name: repoName,
            rootHash: sha256(repoRoot),
            remoteHash: remote ? sha256(remote) : undefined,
            profileHash: typeof profile?.profileHash === 'string' ? profile.profileHash : undefined,
            topologyHash: typeof profile?.topology?.hash === 'string' ? profile.topology.hash : undefined,
            profileFreshness: {
                ...freshness,
                profilePath: '.neurcode/profile.json',
            },
            source: 'local',
        },
        generatedAt: new Date().toISOString(),
        sessions: records.map((record) => {
            const sanitized = sanitizeForUpload(record.session);
            sanitized.uploadMetadata = {
                recordPath: record.path.replace(repoRoot, '').replace(/^\/+/, ''),
                replayStatus: replayStatus(record.session),
                gitHead: head,
            };
            return sanitized;
        }),
    };
    assertPayloadHasNoSourceKeys(payload);
    return payload;
}
async function runtimeSyncCommand(options = {}) {
    let repoRootForStatus = null;
    if (options.runtime !== true) {
        const message = 'Only runtime sync is supported in V0.3. Run `neurcode sync --runtime`.';
        if (options.json) {
            console.log(JSON.stringify({ ok: false, error: message }, null, 2));
        }
        else {
            console.error(chalk.yellow(message));
        }
        process.exitCode = 2;
        return;
    }
    try {
        if (options.since) {
            (0, runtime_evidence_1.parseSinceDuration)(options.since);
        }
        const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
        repoRootForStatus = repoRoot;
        const requeuedDeadLetters = options.retryDeadLetters
            ? (0, runtime_outbox_2.retryRuntimeDeadLetters)(repoRoot)
            : 0;
        const allRecords = (0, runtime_evidence_1.listRuntimeSessions)(repoRoot, { since: options.since });
        const finishedRecords = options.includeActive
            ? allRecords
            : allRecords.filter((record) => record.session.status === 'finished');
        const validRecords = [];
        const skipped = [];
        for (const record of finishedRecords) {
            const status = replayStatus(record.session);
            if (status === 'mismatch') {
                skipped.push({ sessionId: record.session.sessionId, reason: 'replayHash mismatch' });
                continue;
            }
            validRecords.push(record);
        }
        const payload = buildUploadPayload(repoRoot, validRecords);
        if (options.dryRun) {
            const liveTransport = (0, runtime_outbox_1.inspectRuntimeOutbox)(repoRoot);
            const result = {
                ok: true,
                dryRun: true,
                repoRoot,
                endpoint: '/api/v1/runtime/evidence',
                selected: validRecords.length,
                skipped: skipped.length + (allRecords.length - finishedRecords.length),
                skippedDetails: [
                    ...skipped,
                    ...allRecords
                        .filter((record) => record.session.status !== 'finished' && !options.includeActive)
                        .map((record) => ({ sessionId: record.session.sessionId, reason: 'active session not uploaded by default' })),
                ],
                privacy: {
                    sourceUploaded: false,
                    uploadedFields: ['file paths', 'owners', 'verdicts', 'timestamps', 'contracts', 'replay hashes'],
                },
                payload,
                liveTransport,
                requeuedDeadLetters,
            };
            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                console.log('');
                console.log(chalk.bold('Runtime evidence sync dry run'));
                console.log(chalk.dim('-'.repeat(72)));
                console.log(`Repo:     ${repoRoot}`);
                console.log(`Endpoint: /api/v1/runtime/evidence`);
                console.log(`Selected: ${validRecords.length}`);
                console.log(`Skipped:  ${result.skipped}`);
                console.log(chalk.dim('Privacy: source code is not uploaded; session evidence only.'));
                console.log('');
            }
            return;
        }
        const liveTransport = await (0, runtime_live_1.flushRuntimeLiveOutbox)(repoRoot, {
            maxEvents: 100,
            timeoutMs: 1_500,
            force: true,
        });
        if (validRecords.length === 0) {
            (0, runtime_connection_1.updateRuntimeConnection)(repoRoot, (connection) => ({
                ...connection,
                autoSync: {
                    ...connection.autoSync,
                    lastAttemptAt: new Date().toISOString(),
                    lastStatus: 'skipped',
                    lastUploaded: 0,
                    lastSkipped: skipped.length + (allRecords.length - finishedRecords.length),
                    lastFailed: 0,
                    lastError: undefined,
                },
            }));
            if (options.json) {
                console.log(JSON.stringify({
                    ok: true,
                    uploaded: 0,
                    skipped: skipped.length,
                    failed: 0,
                    liveTransport,
                    requeuedDeadLetters,
                    message: 'No finished runtime sessions to upload.',
                }, null, 2));
            }
            else {
                console.log(chalk.yellow('No finished runtime sessions to upload.'));
                console.log(chalk.dim(`Live transport: ${liveTransport.delivered} delivered, ${liveTransport.pending} queued.`));
                if (skipped.length > 0) {
                    for (const item of skipped)
                        console.log(chalk.dim(`  skipped ${item.sessionId}: ${item.reason}`));
                }
            }
            return;
        }
        const config = (0, config_1.loadConfig)();
        if (!config.apiKey) {
            config.apiKey = (0, config_1.requireApiKey)(config.orgId);
        }
        const client = new api_client_1.ApiClient(config);
        const response = await client.uploadRuntimeEvidence(payload);
        (0, runtime_connection_1.updateRuntimeConnection)(repoRoot, (connection) => ({
            ...connection,
            autoSync: {
                ...connection.autoSync,
                lastAttemptAt: new Date().toISOString(),
                lastSyncedAt: response.failed > 0 ? connection.autoSync.lastSyncedAt : new Date().toISOString(),
                lastStatus: response.failed > 0 ? 'failed' : 'ok',
                lastUploaded: response.uploaded,
                lastSkipped: response.skipped + skipped.length,
                lastFailed: response.failed,
                lastError: response.failed > 0 ? `${response.failed} runtime session upload failed` : undefined,
            },
        }));
        if (options.json) {
            console.log(JSON.stringify({
                ...response,
                endpoint: `${config.apiUrl?.replace(/\/$/, '')}/api/v1/runtime/evidence`,
                localSkipped: skipped,
                liveTransport,
                requeuedDeadLetters,
            }, null, 2));
            return;
        }
        console.log('');
        console.log(chalk.bold('Runtime evidence synced'));
        console.log(chalk.dim('-'.repeat(72)));
        console.log(`Endpoint: ${config.apiUrl?.replace(/\/$/, '')}/api/v1/runtime/evidence`);
        console.log(`Repo:     ${response.repo.name}`);
        console.log(`Uploaded: ${chalk.green(String(response.uploaded))}`);
        console.log(`Skipped:  ${chalk.yellow(String(response.skipped + skipped.length))}`);
        console.log(`Failed:   ${response.failed > 0 ? chalk.red(String(response.failed)) : '0'}`);
        console.log(`Live:     ${liveTransport.delivered} delivered · ${liveTransport.pending} queued`);
        if (requeuedDeadLetters > 0) {
            console.log(`DLQ:      ${chalk.yellow(String(requeuedDeadLetters))} event${requeuedDeadLetters === 1 ? '' : 's'} requeued`);
        }
        console.log(chalk.dim('Privacy: no source code, diffs, or file contents were uploaded.'));
        console.log('');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (repoRootForStatus) {
            (0, runtime_connection_1.updateRuntimeConnection)(repoRootForStatus, (connection) => ({
                ...connection,
                autoSync: {
                    ...connection.autoSync,
                    lastAttemptAt: new Date().toISOString(),
                    lastStatus: 'failed',
                    lastError: message,
                },
            }));
        }
        if (options.json) {
            console.log(JSON.stringify({ ok: false, error: message }, null, 2));
        }
        else {
            console.error(chalk.red(`Runtime evidence sync failed: ${message}`));
        }
        process.exitCode = 1;
    }
}
function syncCommand(program) {
    program
        .command('sync')
        .description('Sync local runtime governance evidence to Neurcode')
        .option('--runtime', 'Sync local in-flow governance session records')
        .option('--dry-run', 'Build and validate the upload payload without sending it')
        .option('--since <duration>', 'Limit to sessions with events in the window, e.g. 24h, 7d, 2w')
        .option('--include-active', 'Include active sessions; by default only finished sessions upload')
        .option('--retry-dead-letters', 'Requeue bounded live-transport dead letters before syncing')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => runtimeSyncCommand({
        runtime: options.runtime === true,
        dryRun: options.dryRun === true,
        since: options.since,
        includeActive: options.includeActive === true,
        retryDeadLetters: options.retryDeadLetters === true,
        dir: options.dir,
        json: options.json === true,
    }));
}
//# sourceMappingURL=runtime-sync.js.map