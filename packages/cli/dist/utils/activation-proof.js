"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.firstValueActivationProofQueuePath = firstValueActivationProofQueuePath;
exports.buildBoundActivationProof = buildBoundActivationProof;
exports.buildRepoConnectActivationProof = buildRepoConnectActivationProof;
exports.queueFirstValueActivationProof = queueFirstValueActivationProof;
exports.submitFirstValueActivationProof = submitFirstValueActivationProof;
exports.flushFirstValueActivationProofQueue = flushFirstValueActivationProofQueue;
exports.getFirstValueActivationProofQueueStatus = getFirstValueActivationProofQueueStatus;
exports.readLocalRepoActivationBinding = readLocalRepoActivationBinding;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const contracts_1 = require("@neurcode-ai/contracts");
const config_1 = require("../config");
const state_1 = require("./state");
const activation_telemetry_1 = require("./activation-telemetry");
const PROOF_DIR = '.neurcode';
const PROOF_FILE = 'activation-proofs.json';
const MAX_QUEUE_SIZE = 100;
const PROOF_FLUSH_TIMEOUT_MS = 1500;
const MAX_PROOF_AGE_MS = 30 * 24 * 60 * 60 * 1000;
function homeDir() {
    return process.env.HOME || process.env.USERPROFILE || process.cwd();
}
function firstValueActivationProofQueuePath() {
    return (0, path_1.join)(homeDir(), PROOF_DIR, PROOF_FILE);
}
function ensureProofDir() {
    const dir = (0, path_1.join)(homeDir(), PROOF_DIR);
    if (!(0, fs_1.existsSync)(dir))
        (0, fs_1.mkdirSync)(dir, { recursive: true });
}
function readStore() {
    const path = firstValueActivationProofQueuePath();
    if (!(0, fs_1.existsSync)(path)) {
        return { version: 1, queue: [], updatedAt: new Date().toISOString() };
    }
    try {
        const parsed = JSON.parse((0, fs_1.readFileSync)(path, 'utf8'));
        const queue = Array.isArray(parsed.queue) ? parsed.queue : [];
        return {
            version: 1,
            queue: queue
                .filter((item) => Boolean(item?.proof))
                .slice(-MAX_QUEUE_SIZE),
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        };
    }
    catch {
        return { version: 1, queue: [], updatedAt: new Date().toISOString() };
    }
}
function writeStore(store) {
    ensureProofDir();
    const next = {
        version: 1,
        queue: store.queue.slice(-MAX_QUEUE_SIZE),
        updatedAt: new Date().toISOString(),
    };
    (0, fs_1.writeFileSync)(firstValueActivationProofQueuePath(), JSON.stringify(next, null, 2) + '\n', 'utf8');
    try {
        (0, fs_1.chmodSync)(firstValueActivationProofQueuePath(), 0o600);
    }
    catch {
        // Best-effort permission hardening.
    }
}
function sha(input) {
    return (0, crypto_1.createHash)('sha256').update(input).digest('hex');
}
function normalizeCommandFamily(value) {
    return value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '_').slice(0, 80) || 'repo_connect';
}
function readCliVersion() {
    try {
        const packageJson = require('../../package.json');
        return typeof packageJson.version === 'string' ? packageJson.version : null;
    }
    catch {
        return null;
    }
}
function buildEventId(input) {
    return `fvp:${input.stage}:${sha(`${input.installId}:${input.projectId}:${input.stage}:${input.agentTarget || 'none'}`).slice(0, 32)}`;
}
function buildBoundActivationProof(input) {
    const installId = (0, activation_telemetry_1.getActivationInstallId)();
    return (0, contracts_1.assertFirstValueActivationProofPayload)({
        schemaVersion: contracts_1.FIRST_VALUE_ACTIVATION_PROOF_SCHEMA_VERSION,
        eventId: buildEventId({
            installId,
            projectId: input.projectId,
            stage: input.stage,
            agentTarget: input.agentTarget,
        }),
        installId,
        cliVersion: readCliVersion(),
        commandFamily: normalizeCommandFamily(input.commandFamily || input.stage),
        stage: input.stage,
        reasonCode: input.reasonCode || `${input.stage}.completed`,
        timestamp: input.timestamp || new Date().toISOString(),
        success: true,
        projectId: input.projectId,
        ...(input.repoId ? { repoId: input.repoId } : {}),
        ...(input.agentTarget ? { agentTarget: input.agentTarget } : {}),
        ...(input.localPosture ? { localPosture: input.localPosture } : {}),
    });
}
function buildRepoConnectActivationProof(input) {
    return buildBoundActivationProof({
        projectId: input.projectId,
        stage: 'repo_connect',
        commandFamily: input.commandFamily || 'repo_connect',
        reasonCode: input.reasonCode || 'repo_connect.completed',
        timestamp: input.timestamp,
        localPosture: {
            repoConfigPresent: true,
        },
    });
}
function queueFirstValueActivationProof(input) {
    const proof = (0, contracts_1.assertFirstValueActivationProofPayload)(input.proof);
    const store = readStore();
    const existing = store.queue.filter((item) => item.proof.eventId !== proof.eventId);
    const queued = {
        proof,
        orgId: input.orgId || null,
        apiUrl: input.apiUrl || null,
        queuedAt: new Date().toISOString(),
        attempts: 0,
        lastReasonCode: input.reasonCode || 'proof.queued',
    };
    writeStore({ ...store, queue: [...existing, queued].slice(-MAX_QUEUE_SIZE) });
}
function classifyResponseStatus(status) {
    if (status === 409)
        return 'duplicate';
    if (status === 200 || status === 201 || status === 202 || status === 204)
        return 'accepted';
    if (status === 400 || status === 403 || status === 404 || status === 422)
        return 'drop';
    return 'retry';
}
async function postProof(input) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs || PROOF_FLUSH_TIMEOUT_MS);
    try {
        const headers = {
            'Content-Type': 'application/json',
            authorization: input.apiKey.startsWith('Bearer ') ? input.apiKey : `Bearer ${input.apiKey}`,
        };
        if (input.orgId)
            headers['x-org-id'] = input.orgId;
        const response = await fetch(`${input.apiUrl.replace(/\/$/, '')}/api/v1/activation/first-value-proofs`, {
            method: 'POST',
            headers,
            body: JSON.stringify(input.proof),
            signal: controller.signal,
        });
        const classification = classifyResponseStatus(response.status);
        return {
            ok: classification === 'accepted' || classification === 'duplicate',
            duplicate: classification === 'duplicate' || (response.ok && response.status === 202
                ? Boolean((await response.clone().json().catch(() => ({}))).duplicate)
                : false),
            status: response.status,
            retryable: classification === 'retry',
            reasonCode: classification === 'accepted'
                ? 'proof.accepted'
                : classification === 'duplicate'
                    ? 'proof.duplicate'
                    : classification === 'drop'
                        ? `proof.drop.http_${response.status}`
                        : `proof.retry.http_${response.status}`,
        };
    }
    catch (error) {
        return {
            ok: false,
            duplicate: false,
            status: 0,
            retryable: true,
            reasonCode: error instanceof Error && error.name === 'AbortError' ? 'proof.retry.timeout' : 'proof.retry.network',
        };
    }
    finally {
        clearTimeout(timeout);
    }
}
function resolveApiUrl(apiUrl) {
    const config = (0, config_1.loadConfig)();
    return (apiUrl || config.apiUrl || config_1.DEFAULT_API_URL).replace(/\/$/, '');
}
function resolveApiKey(orgId) {
    // Strict workspace scoping: a proof intended for one workspace must never
    // be submitted with another workspace's credential (the API can only 403
    // API_KEY_ORG_MISMATCH, which would burn the queued proof). No cross-org
    // fallback — a missing workspace credential keeps the proof queued.
    if (orgId)
        return (0, config_1.getApiKey)(orgId);
    return (0, config_1.getApiKey)();
}
async function submitFirstValueActivationProof(input) {
    const proof = (0, contracts_1.assertFirstValueActivationProofPayload)(input.proof);
    const apiUrl = resolveApiUrl(input.apiUrl);
    const apiKey = input.apiKey === undefined ? resolveApiKey(input.orgId) : input.apiKey;
    if (!apiKey) {
        const reasonCode = input.orgId && input.apiKey === undefined
            ? 'proof.queued.no_matching_workspace_credential'
            : 'proof.queued.no_auth';
        queueFirstValueActivationProof({ proof, orgId: input.orgId, apiUrl, reasonCode });
        return { synced: false, queued: true, duplicate: false, reasonCode };
    }
    const response = await postProof({
        proof,
        apiUrl,
        apiKey,
        orgId: input.orgId,
        timeoutMs: input.timeoutMs,
    });
    if (response.ok) {
        return {
            synced: true,
            queued: false,
            duplicate: response.duplicate,
            status: response.status,
            reasonCode: response.reasonCode,
        };
    }
    if (response.retryable) {
        queueFirstValueActivationProof({ proof, orgId: input.orgId, apiUrl, reasonCode: response.reasonCode });
        return {
            synced: false,
            queued: true,
            duplicate: false,
            status: response.status,
            reasonCode: response.reasonCode,
        };
    }
    return {
        synced: false,
        queued: false,
        duplicate: false,
        status: response.status,
        reasonCode: response.reasonCode,
    };
}
async function flushFirstValueActivationProofQueue(options = {}) {
    const store = readStore();
    const reasonCodes = new Set();
    let synced = 0;
    let duplicates = 0;
    let dropped = 0;
    let retryable = 0;
    const remaining = [];
    for (const item of store.queue) {
        const validation = (0, contracts_1.validateFirstValueActivationProofPayload)(item.proof);
        if (!validation.ok || !validation.proof) {
            dropped += 1;
            reasonCodes.add('proof.drop.invalid');
            continue;
        }
        const queuedAt = Date.parse(item.queuedAt);
        if (Number.isFinite(queuedAt) && Date.now() - queuedAt > MAX_PROOF_AGE_MS) {
            dropped += 1;
            reasonCodes.add('proof.drop.stale');
            continue;
        }
        const orgId = options.orgId || item.orgId || (0, state_1.getOrgId)();
        const apiUrl = resolveApiUrl(options.apiUrl || item.apiUrl);
        const apiKey = resolveApiKey(orgId || undefined);
        if (!apiKey) {
            const reasonCode = orgId
                ? 'proof.retry.no_matching_workspace_credential'
                : 'proof.retry.no_auth';
            retryable += 1;
            reasonCodes.add(reasonCode);
            remaining.push({ ...item, attempts: item.attempts + 1, lastReasonCode: reasonCode });
            continue;
        }
        const response = await postProof({
            proof: validation.proof,
            apiUrl,
            apiKey,
            orgId,
        });
        reasonCodes.add(response.reasonCode);
        if (response.ok) {
            synced += 1;
            if (response.duplicate)
                duplicates += 1;
            continue;
        }
        if (response.retryable) {
            retryable += 1;
            remaining.push({ ...item, attempts: item.attempts + 1, lastReasonCode: response.reasonCode });
            continue;
        }
        dropped += 1;
    }
    writeStore({ ...store, queue: remaining });
    return {
        attempted: store.queue.length,
        synced,
        duplicates,
        dropped,
        retryable,
        remaining: remaining.length,
        reasonCodes: [...reasonCodes].sort(),
    };
}
function getFirstValueActivationProofQueueStatus(projectId) {
    const store = readStore();
    const targetProjectId = projectId || (0, state_1.getProjectId)();
    return {
        queueLength: store.queue.length,
        matchingProjectQueued: targetProjectId
            ? store.queue.some((item) => item.proof.projectId === targetProjectId)
            : store.queue.length > 0,
        path: firstValueActivationProofQueuePath(),
    };
}
function readLocalRepoActivationBinding() {
    const state = (0, state_1.loadState)();
    return {
        orgId: typeof state.orgId === 'string' ? state.orgId : null,
        orgName: typeof state.orgName === 'string' ? state.orgName : null,
        projectId: typeof state.projectId === 'string' ? state.projectId : null,
        linkedAt: typeof state.linkedAt === 'string' ? state.linkedAt : null,
    };
}
//# sourceMappingURL=activation-proof.js.map