"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectImpactSummaryForCloud = projectImpactSummaryForCloud;
exports.buildRuntimeEvidenceUploadBatches = buildRuntimeEvidenceUploadBatches;
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
const activation_telemetry_1 = require("../utils/activation-telemetry");
const activation_proof_1 = require("../utils/activation-proof");
const runtime_outbox_1 = require("../utils/runtime-outbox");
const runtime_outbox_2 = require("../utils/runtime-outbox");
const admission_artifact_1 = require("../utils/admission-artifact");
const local_repo_brain_1 = require("../utils/local-repo-brain");
const repo_brain_impact_1 = require("../utils/repo-brain-impact");
const runtime_privacy_1 = require("../utils/runtime-privacy");
const cli_runtime_1 = require("@neurcode-ai/cli-runtime");
const brain_lifecycle_1 = require("../utils/brain-lifecycle");
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
const BULK_EVIDENCE_OMIT_KEYS = new Set([
    'architectureGraph',
    'dependencyGraph',
    'ownershipGraph',
    'graph',
    'rawGraph',
    'snapshot',
    'rawSnapshot',
    'environment',
]);
const BULK_UPLOAD_MAX_STRING_LENGTH = 2_000;
const BULK_UPLOAD_MAX_ARRAY_ITEMS = 80;
const BULK_UPLOAD_MAX_EVENT_ITEMS = 160;
const BULK_UPLOAD_TARGET_BYTES = 850_000;
const BULK_UPLOAD_MAX_SINGLE_SESSION_BYTES = 650_000;
const BULK_UPLOAD_AGGRESSIVE_MAX_STRING_LENGTH = 500;
const BULK_UPLOAD_AGGRESSIVE_MAX_ARRAY_ITEMS = 20;
const BULK_UPLOAD_AGGRESSIVE_MAX_EVENT_ITEMS = 80;
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
const DEFAULT_BULK_COMPACTION_LIMITS = {
    maxStringLength: BULK_UPLOAD_MAX_STRING_LENGTH,
    maxArrayItems: BULK_UPLOAD_MAX_ARRAY_ITEMS,
    maxEventItems: BULK_UPLOAD_MAX_EVENT_ITEMS,
};
const AGGRESSIVE_BULK_COMPACTION_LIMITS = {
    maxStringLength: BULK_UPLOAD_AGGRESSIVE_MAX_STRING_LENGTH,
    maxArrayItems: BULK_UPLOAD_AGGRESSIVE_MAX_ARRAY_ITEMS,
    maxEventItems: BULK_UPLOAD_AGGRESSIVE_MAX_EVENT_ITEMS,
};
function compactStringForBulk(value, limits) {
    if (value.length <= limits.maxStringLength)
        return value;
    return `${value.slice(0, limits.maxStringLength)}...[truncated ${value.length - limits.maxStringLength} chars]`;
}
function compactForBulkEvidence(value, path = 'session', limits = DEFAULT_BULK_COMPACTION_LIMITS) {
    if (typeof value === 'string')
        return compactStringForBulk(value, limits);
    if (Array.isArray(value)) {
        const maxItems = path.endsWith('.events')
            ? limits.maxEventItems
            : limits.maxArrayItems;
        const items = value.length > maxItems ? value.slice(-maxItems) : value;
        // Cloud session arrays have typed item schemas (paths are strings, events and
        // selections are records). A synthetic truncation marker corrupts those schemas
        // and makes otherwise source-free evidence impossible to upload. Compaction is
        // already declared in uploadMetadata.bulkEvidence, so preserve each array's item
        // type and retain only the bounded tail.
        return items.map((item, index) => compactForBulkEvidence(item, `${path}[${index}]`, limits));
    }
    if (!value || typeof value !== 'object')
        return value;
    const out = {};
    for (const [key, child] of Object.entries(value)) {
        if (SOURCE_LIKE_KEYS.has(key))
            continue;
        if (key === 'repoIntelligence') {
            // The cloud-safe projection (runtime-privacy.projectRepoIntelligenceForCloud) already
            // bounds and source-free-validates this object. Generic compaction would corrupt its
            // contract shape: the `graph` sub-object would be replaced with `graphOmitted: true`
            // (BULK_EVIDENCE_OMIT_KEYS), and array truncation would prepend marker objects to
            // findings/reasonCodes. Pass it through intact.
            out[key] = child;
            continue;
        }
        if (BULK_EVIDENCE_OMIT_KEYS.has(key)) {
            out[`${key}Omitted`] = true;
            continue;
        }
        out[key] = compactForBulkEvidence(child, `${path}.${key}`, limits);
    }
    return out;
}
function byteSize(value) {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
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
function repoRelative(repoRoot, path) {
    return path.replace(repoRoot, '').replace(/^\/+/, '').replace(/\\/g, '/');
}
function buildAdmissionUploadMetadata(repoRoot, session) {
    const localPath = (0, admission_artifact_1.admissionRecordPath)(repoRoot, session.sessionId);
    const publicPath = (0, admission_artifact_1.publicAdmissionRecordPath)(repoRoot, session.sessionId);
    const publicPresent = (0, fs_1.existsSync)(publicPath);
    const base = {
        localRecord: {
            present: false,
            path: repoRelative(repoRoot, localPath),
        },
        prArtifact: {
            present: publicPresent,
            path: repoRelative(repoRoot, publicPath),
        },
    };
    if (!(0, fs_1.existsSync)(localPath))
        return base;
    try {
        const record = (0, governance_runtime_1.readSelfAttestedAdmissionRecordFromText)((0, fs_1.readFileSync)(localPath, 'utf8'));
        if (!record) {
            return {
                ...base,
                localRecord: {
                    ...base.localRecord,
                    present: true,
                    status: 'invalid',
                },
            };
        }
        const governedCoverageCount = record.manifest.coverage.filter((entry) => entry.classification === 'governed_prewrite' ||
            entry.classification === 'governed_delete' ||
            entry.classification === 'generated').length;
        const ungovernedCoverageCount = record.manifest.coverage.filter((entry) => entry.classification === 'ungoverned').length;
        return {
            ...base,
            localRecord: {
                ...base.localRecord,
                present: true,
                status: 'valid',
                schemaVersion: record.schemaVersion,
                attestationKind: record.attestationKind,
                admissionContractVersion: record.admissionContractVersion,
                capture: {
                    mode: record.capture.mode,
                    ...(record.capture.baseRef ? { baseRef: record.capture.baseRef } : {}),
                    ...(record.capture.headRef ? { headRef: record.capture.headRef } : {}),
                },
                manifest: {
                    entryCount: record.manifest.entryCount,
                    coverageCount: record.manifest.coverage.length,
                    governedCoverageCount,
                    ungovernedCoverageCount,
                    deltaHash: record.manifest.deltaHash,
                    coverageSetHash: record.manifest.coverageSetHash,
                },
            },
        };
    }
    catch (error) {
        return {
            ...base,
            localRecord: {
                ...base.localRecord,
                present: true,
                status: 'unreadable',
                error: error instanceof Error ? error.message : String(error),
            },
        };
    }
}
function importantApprovalContext(detail) {
    if (!detail || typeof detail !== 'object')
        return undefined;
    const approvalContext = detail.approvalContext;
    if (!approvalContext || typeof approvalContext !== 'object')
        return undefined;
    const ctx = approvalContext;
    const out = {};
    for (const key of ['blockedPath', 'approvalRequired', 'owners', 'suggestedApprovalPath', 'reason', 'policyId']) {
        if (ctx[key] !== undefined)
            out[key] = compactForBulkEvidence(ctx[key], `event.detail.approvalContext.${key}`, AGGRESSIVE_BULK_COMPACTION_LIMITS);
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
function compactEventForBulkSummary(event) {
    if (!event || typeof event !== 'object')
        return {};
    const src = event;
    const detail = src.detail;
    const approvalContext = importantApprovalContext(detail);
    const out = {};
    for (const key of ['type', 'ts', 'filePath', 'verdict', 'decision', 'message']) {
        if (src[key] !== undefined)
            out[key] = compactForBulkEvidence(src[key], `event.${key}`, AGGRESSIVE_BULK_COMPACTION_LIMITS);
    }
    if (approvalContext)
        out.detail = { approvalContext };
    return out;
}
function summarizeOversizedSessionForBulk(session) {
    const events = Array.isArray(session.events) ? session.events : [];
    const retainedEvents = events.slice(-BULK_UPLOAD_AGGRESSIVE_MAX_EVENT_ITEMS).map(compactEventForBulkSummary);
    return {
        schemaVersion: session.schemaVersion,
        sessionId: session.sessionId,
        profileHash: session.profileHash,
        status: session.status,
        startedAt: session.startedAt,
        finishedAt: session.finishedAt,
        replayHash: session.replayHash,
        contract: compactForBulkEvidence(session.contract || {}, 'session.contract', AGGRESSIVE_BULK_COMPACTION_LIMITS),
        events: retainedEvents,
        uploadMetadata: {
            ...(session.uploadMetadata && typeof session.uploadMetadata === 'object' ? session.uploadMetadata : {}),
            bulkEvidence: {
                ...(session.uploadMetadata?.bulkEvidence || {}),
                compacted: true,
                compactionLevel: 'event_summary',
                maxSingleSessionBytes: BULK_UPLOAD_MAX_SINGLE_SESSION_BYTES,
            },
        },
    };
}
function collectImpactPathsFromSession(session) {
    const paths = new Set();
    for (const event of session.events || []) {
        if (typeof event.filePath === 'string' && event.filePath.trim()) {
            paths.add(event.filePath.replace(/\\/g, '/'));
        }
    }
    const target = session.contract?.intentContract?.target;
    const pathTokens = target && typeof target === 'object' && Array.isArray(target.pathTokens)
        ? target.pathTokens
        : [];
    for (const token of pathTokens) {
        if (typeof token !== 'string')
            continue;
        const normalized = token.trim().replace(/\\/g, '/');
        if (normalized && (normalized.includes('/') || normalized.includes('.')))
            paths.add(normalized);
    }
    return [...paths].filter((path) => path.includes('/') || path.includes('.')).sort();
}
function buildRuntimeSyncImpactSummary(repoRoot, session) {
    try {
        const paths = collectImpactPathsFromSession(session);
        if (paths.length === 0)
            return null;
        return (0, repo_brain_impact_1.summarizeImpact)((0, repo_brain_impact_1.buildRepoBrainImpactForRepo)(repoRoot, paths, { autoBuild: false }));
    }
    catch {
        return null;
    }
}
function projectImpactSummaryForCloud(value) {
    const projected = compactForBulkEvidence(value, 'session.impactSummary', AGGRESSIVE_BULK_COMPACTION_LIMITS);
    return (0, governance_runtime_1.validatePrivacySafeCloudPayload)({
        sessions: [{ impactSummary: projected }],
    }).ok
        ? projected
        : null;
}
function buildCompactUploadSession(repoRoot, record) {
    const sanitized = (0, runtime_privacy_1.buildCloudSafeRuntimeSession)(record.session);
    let compacted = compactForBulkEvidence(sanitized);
    const bytesBefore = byteSize(sanitized);
    compacted.uploadMetadata = {
        recordPath: repoRelative(repoRoot, record.path),
        replayStatus: replayStatus(record.session),
        gitHead: gitValue(repoRoot, ['rev-parse', '--short=12', 'HEAD']),
        admission: buildAdmissionUploadMetadata(repoRoot, record.session),
        bulkEvidence: {
            compacted: true,
            compactionLevel: 'standard',
            bytesBefore,
            bytesAfter: byteSize(compacted),
            maxEventItems: BULK_UPLOAD_MAX_EVENT_ITEMS,
            maxArrayItems: BULK_UPLOAD_MAX_ARRAY_ITEMS,
            maxStringLength: BULK_UPLOAD_MAX_STRING_LENGTH,
            maxSingleSessionBytes: BULK_UPLOAD_MAX_SINGLE_SESSION_BYTES,
        },
    };
    if (byteSize(compacted) > BULK_UPLOAD_MAX_SINGLE_SESSION_BYTES) {
        compacted = compactForBulkEvidence(sanitized, 'session', AGGRESSIVE_BULK_COMPACTION_LIMITS);
        compacted.uploadMetadata = {
            recordPath: repoRelative(repoRoot, record.path),
            replayStatus: replayStatus(record.session),
            gitHead: gitValue(repoRoot, ['rev-parse', '--short=12', 'HEAD']),
            admission: buildAdmissionUploadMetadata(repoRoot, record.session),
            bulkEvidence: {
                compacted: true,
                compactionLevel: 'aggressive',
                bytesBefore,
                bytesAfter: byteSize(compacted),
                maxEventItems: BULK_UPLOAD_AGGRESSIVE_MAX_EVENT_ITEMS,
                maxArrayItems: BULK_UPLOAD_AGGRESSIVE_MAX_ARRAY_ITEMS,
                maxStringLength: BULK_UPLOAD_AGGRESSIVE_MAX_STRING_LENGTH,
                maxSingleSessionBytes: BULK_UPLOAD_MAX_SINGLE_SESSION_BYTES,
            },
        };
    }
    if (byteSize(compacted) > BULK_UPLOAD_MAX_SINGLE_SESSION_BYTES) {
        compacted = summarizeOversizedSessionForBulk(compacted);
    }
    const metadata = compacted.uploadMetadata;
    if (metadata?.bulkEvidence) {
        metadata.bulkEvidence.bytesAfter = byteSize(compacted);
    }
    try {
        const brain = (0, local_repo_brain_1.readLocalRepoBrain)(repoRoot);
        compacted.repoBrain = brain ? {
            status: 'found',
            artifactHash: typeof brain.artifactHash === 'string' ? brain.artifactHash : null,
            generatedAt: typeof brain.generatedAt === 'string' ? brain.generatedAt : null,
            declarationsIndexed: typeof brain.summary?.symbolsIndexed === 'number' ? brain.summary.symbolsIndexed : null,
            sensitiveFilesCount: typeof brain.summary?.sensitiveFiles === 'number' ? brain.summary.sensitiveFiles : null,
            ownerBoundaryStatus: brain.summary?.ownerBoundaryStatus ?? null,
            recoveryCommand: 'neurcode brain index',
        } : {
            status: 'missing',
            artifactHash: null,
            generatedAt: null,
            declarationsIndexed: null,
            sensitiveFilesCount: null,
            ownerBoundaryStatus: null,
            recoveryCommand: 'neurcode brain index',
        };
    }
    catch { /* never break upload path */ }
    const impactSummary = buildRuntimeSyncImpactSummary(repoRoot, record.session);
    const cloudImpactSummary = impactSummary
        ? projectImpactSummaryForCloud(impactSummary)
        : null;
    // Impact intelligence is optional supporting context. If it cannot fit the
    // bounded cloud contract, omit it rather than blocking the core signed record.
    if (cloudImpactSummary)
        compacted.impactSummary = cloudImpactSummary;
    const finalMetadata = compacted.uploadMetadata;
    if (finalMetadata?.bulkEvidence) {
        finalMetadata.bulkEvidence.bytesAfter = byteSize(compacted);
    }
    return compacted;
}
function buildUploadPayloadFromSessions(repoRoot, sessions) {
    const profile = readJsonFile((0, path_1.join)(repoRoot, '.neurcode', 'profile.json'));
    const manifest = (0, cli_runtime_1.readActivatedRuntimeManifest)(repoRoot);
    const lifecycle = (0, brain_lifecycle_1.readBrainLifecycle)(repoRoot);
    const repositoryTopology = profile?.repositoryTopology;
    const topologyFacts = Array.isArray(repositoryTopology?.facts) ? repositoryTopology.facts : [];
    const freshness = (0, v0_governance_1.buildProfileFreshnessSignal)((0, v0_governance_1.getProfileStaleness)(repoRoot));
    const remote = gitValue(repoRoot, ['config', '--get', 'remote.origin.url']);
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
            runtimeAuthority: {
                status: manifest ? 'activated' : 'missing',
                manifestHash: manifest?.manifestHash ?? null,
                cliVersion: manifest?.runtime.cliVersion ?? null,
                packageOrBuildHash: manifest?.runtime.packageOrBuildHash ?? null,
                installationSource: manifest?.runtime.installationSource ?? null,
                activatedAt: manifest?.activatedAt ?? null,
                integrationCount: manifest?.integrations.length ?? 0,
                repairCommand: 'neurcode runtime repair',
            },
            topology: repositoryTopology ? {
                schemaVersion: repositoryTopology.schemaVersion ?? null,
                artifactHash: repositoryTopology.artifactHash ?? null,
                trackedFileCount: repositoryTopology.trackedFileCount ?? null,
                deterministicFacts: topologyFacts.filter((fact) => fact?.evidence?.authority === 'deterministic').length,
                advisoryFacts: topologyFacts.filter((fact) => fact?.evidence?.authority === 'advisory').length,
                brainParticipated: repositoryTopology.brain?.participated === true,
                brainFreshness: repositoryTopology.brain?.freshness ?? null,
            } : {
                schemaVersion: null,
                artifactHash: null,
                trackedFileCount: null,
                deterministicFacts: 0,
                advisoryFacts: 0,
                brainParticipated: false,
                brainFreshness: null,
            },
            brain: {
                state: lifecycle?.state ?? 'missing',
                updatedAt: lifecycle?.updatedAt ?? null,
                filesScanned: lifecycle?.progress.filesScanned ?? 0,
                filesIndexed: lifecycle?.progress.filesIndexed ?? 0,
                totalFiles: lifecycle?.progress.totalFiles ?? null,
                percent: lifecycle?.progress.percent ?? null,
                reasonCodes: lifecycle?.reasonCodes ?? ['graph_missing'],
                unsupportedFacts: lifecycle?.unsupportedFacts ?? [],
                retryCommand: lifecycle?.recoveryCommands.retry ?? 'neurcode brain retry',
                cancelCommand: lifecycle?.recoveryCommands.cancel ?? 'neurcode brain cancel',
                recoverCommand: lifecycle?.recoveryCommands.recover ?? 'neurcode brain repo-recover',
            },
            pairing: {
                repositoryOwnershipBound: Boolean(profile),
                machineAuthenticated: true,
                agentIntegrationActive: Boolean(manifest?.integrations.length),
                cloudTransportConnected: true,
                repoBrainReady: lifecycle?.state === 'fresh' || lifecycle?.state === 'partial',
                governedSessionActive: sessions.some((session) => session.status === 'active'),
                evidenceSynchronized: false,
            },
            source: 'local',
        },
        generatedAt: new Date().toISOString(),
        sessions,
    };
    assertPayloadHasNoSourceKeys(payload);
    (0, governance_runtime_1.assertPrivacySafeCloudPayload)(payload);
    return payload;
}
function buildRuntimeEvidenceUploadBatches(repoRoot, records) {
    const compactSessions = records.map((record) => buildCompactUploadSession(repoRoot, record));
    const batches = [];
    let current = [];
    for (const session of compactSessions) {
        let candidate;
        try {
            candidate = buildUploadPayloadFromSessions(repoRoot, [...current, session]);
        }
        catch (error) {
            // Aggregate privacy limits can be reached before the HTTP byte budget.
            // Prove the incoming session is independently valid, then close the
            // already-valid batch and continue with a fresh one.
            const single = buildUploadPayloadFromSessions(repoRoot, [session]);
            if (current.length === 0)
                throw error;
            batches.push(buildUploadPayloadFromSessions(repoRoot, current));
            current = single.sessions;
            continue;
        }
        if (current.length > 0 && byteSize(candidate) > BULK_UPLOAD_TARGET_BYTES) {
            batches.push(buildUploadPayloadFromSessions(repoRoot, current));
            current = [session];
            continue;
        }
        current = candidate.sessions;
    }
    if (current.length > 0)
        batches.push(buildUploadPayloadFromSessions(repoRoot, current));
    return batches;
}
function summarizeUploadBatches(payloads) {
    return payloads.map((payload, index) => ({
        index: index + 1,
        sessions: payload.sessions.length,
        bytes: byteSize(payload),
    }));
}
function aggregateRuntimeEvidenceResponses(responses) {
    const first = responses[0];
    if (!first) {
        return {
            ok: true,
            batchId: '',
            repo: { id: '', name: '', repoKey: '' },
            uploaded: 0,
            skipped: 0,
            failed: 0,
            sessions: [],
            privacy: {
                sourceUploaded: false,
                uploadedFields: ['intent summaries', 'file paths', 'owners', 'verdicts', 'timestamps', 'structured contracts', 'replay hashes'],
            },
        };
    }
    const uploaded = responses.reduce((sum, response) => sum + response.uploaded, 0);
    const skipped = responses.reduce((sum, response) => sum + response.skipped, 0);
    const failed = responses.reduce((sum, response) => sum + response.failed, 0);
    return {
        ok: responses.every((response) => response.ok),
        batchId: responses.map((response) => response.batchId).filter(Boolean).join(','),
        repo: first.repo,
        uploaded,
        skipped,
        failed,
        sessions: responses.flatMap((response) => response.sessions),
        privacy: first.privacy,
    };
}
async function activationSyncCommand(options) {
    const binding = (0, activation_proof_1.readLocalRepoActivationBinding)();
    const beforeQueue = (0, activation_proof_1.getFirstValueActivationProofQueueStatus)(binding.projectId);
    let synthesized = {
        attempted: false,
        synced: false,
        queued: false,
        reasonCode: 'proof.not_needed',
    };
    if (binding.orgId && binding.projectId && !beforeQueue.matchingProjectQueued) {
        const proof = (0, activation_proof_1.buildRepoConnectActivationProof)({
            projectId: binding.projectId,
            commandFamily: 'repo_connect',
            reasonCode: 'repo_connect.sync_activation',
        });
        const result = await (0, activation_proof_1.submitFirstValueActivationProof)({
            proof,
            orgId: binding.orgId,
        });
        synthesized = {
            attempted: true,
            synced: result.synced,
            queued: result.queued,
            reasonCode: result.reasonCode,
        };
    }
    const proof = await (0, activation_proof_1.flushFirstValueActivationProofQueue)({ orgId: binding.orgId });
    const telemetry = await (0, activation_telemetry_1.flushActivationTelemetry)();
    if (options.json) {
        console.log(JSON.stringify({
            ok: true,
            activation: true,
            localRepoConnected: Boolean(binding.orgId && binding.projectId),
            synthesized,
            proof,
            telemetry,
            privacy: {
                sourceUploaded: false,
                promptsUploaded: false,
                diffsUploaded: false,
                rawArgsUploaded: false,
                absolutePathsUploaded: false,
            },
        }, null, 2));
        return;
    }
    console.log(chalk.bold('Activation proof sync'));
    console.log(chalk.dim('-'.repeat(56)));
    console.log(`Local repo connected: ${binding.orgId && binding.projectId ? chalk.green('yes') : chalk.yellow('no')}`);
    console.log(`Cloud proof synced:   ${proof.synced + (synthesized.synced ? 1 : 0)}`);
    console.log(`Cloud proof queued:   ${proof.remaining + (synthesized.queued ? 1 : 0)}`);
    console.log(`Proof dropped:        ${proof.dropped}`);
    console.log(`Telemetry flushed:    ${telemetry.sent}/${telemetry.attempted}; ${telemetry.remaining} queued`);
    if (proof.reasonCodes.length > 0 || synthesized.reasonCode !== 'proof.not_needed') {
        const reasons = [...new Set([synthesized.reasonCode, ...proof.reasonCodes].filter((reason) => reason !== 'proof.not_needed'))];
        console.log(chalk.dim(`Reason codes:         ${reasons.join(', ') || 'none'}`));
    }
    console.log(chalk.dim('Source-free: no source, prompts, diffs, raw args, secrets, absolute paths, raw IP, or repo contents.'));
}
async function runtimeSyncCommand(options = {}) {
    let repoRootForStatus = null;
    if (options.activation === true) {
        await activationSyncCommand(options);
        return;
    }
    if (options.runtime !== true) {
        const message = 'Choose a sync target: `neurcode sync --activation` or `neurcode sync --runtime`.';
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
        const uploadPayloads = buildRuntimeEvidenceUploadBatches(repoRoot, validRecords);
        const dryRunPayload = uploadPayloads.length <= 1
            ? uploadPayloads[0] || buildUploadPayloadFromSessions(repoRoot, [])
            : {
                ...buildUploadPayloadFromSessions(repoRoot, []),
                sessions: uploadPayloads.flatMap((payload) => payload.sessions),
            };
        assertPayloadHasNoSourceKeys(dryRunPayload);
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
                    promptUploaded: false,
                    chatUploaded: false,
                    uploadedFields: ['intent summaries', 'file paths', 'owners', 'verdicts', 'timestamps', 'structured contracts', 'replay hashes'],
                },
                payload: dryRunPayload,
                uploadBatches: summarizeUploadBatches(uploadPayloads),
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
                console.log(chalk.dim('Privacy: raw source, diffs, prompts, chat, and plan prose are excluded from cloud evidence.'));
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
        const responses = [];
        for (const payload of uploadPayloads) {
            responses.push(await client.uploadRuntimeEvidence(payload));
        }
        const response = aggregateRuntimeEvidenceResponses(responses);
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
        console.log(chalk.dim('Privacy: raw source, diffs, prompts, chat, and plan prose were not uploaded.'));
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
        .description('Sync local source-free activation proof or runtime governance evidence to Neurcode')
        .option('--activation', 'Sync first-value activation proof queue and activation telemetry')
        .option('--runtime', 'Sync local in-flow governance session records')
        .option('--dry-run', 'Build and validate the upload payload without sending it')
        .option('--since <duration>', 'Limit to sessions with events in the window, e.g. 24h, 7d, 2w')
        .option('--include-active', 'Include active sessions; by default only finished sessions upload')
        .option('--retry-dead-letters', 'Requeue bounded live-transport dead letters before syncing')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => runtimeSyncCommand({
        activation: options.activation === true,
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