"use strict";
/**
 * Enterprise First-Value Proof V1.
 *
 * A source-free proof object shared by CLI, API, and dashboard. It records only
 * coarse activation/proof state, repository labels or hashes, counts/statuses,
 * and next commands. It must never carry source, prompts, diffs, raw args,
 * absolute paths, secrets, or raw request bodies.
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FIRST_VALUE_FORBIDDEN_FIELDS = exports.MANAGED_HOST_INSTALLATION_SCHEMA_VERSION = exports.FIRST_VALUE_ACTIVATION_PROOF_STAGES = exports.FIRST_VALUE_STEP_IDS = exports.FIRST_VALUE_ACTIVATION_PROOF_SCHEMA_VERSION = exports.FIRST_VALUE_PROOF_SCHEMA_VERSION = void 0;
exports.firstValueNextCommand = firstValueNextCommand;
exports.buildFirstValueProof = buildFirstValueProof;
exports.buildFirstValueState = buildFirstValueState;
exports.validateFirstValueSourceFreeInput = validateFirstValueSourceFreeInput;
exports.validateFirstValueActivationProofPayload = validateFirstValueActivationProofPayload;
exports.assertFirstValueActivationProofPayload = assertFirstValueActivationProofPayload;
exports.FIRST_VALUE_PROOF_SCHEMA_VERSION = 'neurcode.first-value-proof.v1';
exports.FIRST_VALUE_ACTIVATION_PROOF_SCHEMA_VERSION = 'neurcode.first-value-activation-proof.v1';
exports.FIRST_VALUE_STEP_IDS = [
    'login',
    'repo_connect',
    'brain_index',
    'agent_setup',
    'governed_check',
    'evidence_view',
    'repo_intelligence_sync',
];
exports.FIRST_VALUE_ACTIVATION_PROOF_STAGES = [
    'repo_connect',
    'brain_index',
    'agent_setup',
    'governed_check',
    'evidence_view',
    'repo_intelligence_sync',
];
exports.MANAGED_HOST_INSTALLATION_SCHEMA_VERSION = 'neurcode.managed-host-installation.v1';
exports.FIRST_VALUE_FORBIDDEN_FIELDS = [
    'source',
    'sourceCode',
    'code',
    'prompt',
    'prompts',
    'diff',
    'patch',
    'secret',
    'secrets',
    'token',
    'accessToken',
    'authorization',
    'password',
    'absolutePath',
    'path',
    'rawPath',
    'filePath',
    'rawArgs',
    'args',
    'argv',
    'databaseUrl',
    'connectionString',
    'repoContents',
    'rawIp',
    'ip',
    'body',
    'content',
];
const FORBIDDEN_FIELD_SET = new Set(exports.FIRST_VALUE_FORBIDDEN_FIELDS.map((field) => field.toLowerCase()));
const FIRST_VALUE_ACTIVATION_PROOF_ALLOWED_FIELDS = new Set([
    'schemaVersion',
    'eventId',
    'installId',
    'cliVersion',
    'commandFamily',
    'stage',
    'reasonCode',
    'timestamp',
    'success',
    'projectId',
    'repoId',
    'repoKeyHash',
    'repoLabel',
    'agentTarget',
    'localPosture',
]);
const FIRST_VALUE_ACTIVATION_PROOF_LOCAL_POSTURE_FIELDS = new Set([
    'repoConfigPresent',
    'runtimeConfigured',
    'brainIndexed',
    'hostDetected',
    'hostConfigured',
    'hostAuthenticated',
    'automaticPreWriteInterception',
    'evidenceQueued',
    'telemetryQueued',
    'hostInstallation',
]);
const MANAGED_HOST_INSTALLATION_FIELDS = new Set([
    'schemaVersion', 'adapter', 'state', 'distribution', 'manifestVersion',
    'configIntegrity', 'trustState', 'checkedAt', 'fingerprint', 'reasonCodes',
]);
const MANAGED_HOST_INSTALLATION_STATES = new Set(['healthy', 'attention', 'drifted', 'incomplete', 'unsupported']);
const MANAGED_HOST_INSTALLATION_DISTRIBUTIONS = new Set(['managed', 'manual', 'host_managed']);
const MANAGED_HOST_CONFIG_INTEGRITIES = new Set(['verified', 'drifted', 'unverified', 'not_applicable']);
const MANAGED_HOST_TRUST_STATES = new Set(['verified', 'user_action_required', 'not_applicable', 'unknown']);
const MANAGED_HOST_REASON_CODES = new Set([
    'host_not_detected', 'managed_config_missing', 'managed_config_drifted', 'host_auth_unverified',
    'host_trust_required', 'host_invocation_unobserved', 'host_boundary_cooperative',
    'host_boundary_observe_only', 'host_boundary_post_change',
]);
const ABSOLUTE_PATH_VALUE = /(?:\/Users\/|\/home\/|\/var\/|\/etc\/|\/private\/|[A-Za-z]:\\)/;
const SECRET_VALUE = /(sk-[a-z0-9]{16,}|nk_[a-z0-9_]{12,}|gh[pousr]_[a-z0-9_]{20,}|AKIA[0-9A-Z]{16})/i;
const DATABASE_URL_VALUE = /\b(?:postgres(?:ql)?:\/\/|mysql:\/\/|mongodb(?:\+srv)?:\/\/|redis:\/\/)/i;
function stableHash(input) {
    let a = 0x811c9dc5;
    let b = 0x9e3779b9;
    for (let i = 0; i < input.length; i += 1) {
        const code = input.charCodeAt(i);
        a ^= code;
        a = Math.imul(a, 0x01000193) >>> 0;
        b ^= code + i;
        b = Math.imul(b, 0x85ebca6b) >>> 0;
    }
    return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}
function cleanString(value, max = 120) {
    if (!value)
        return null;
    const trimmed = value.trim().replace(/\s+/g, ' ').slice(0, max);
    return trimmed || null;
}
function cleanIsoTimestamp(value) {
    if (!value)
        return null;
    const trimmed = value.trim();
    return trimmed && !Number.isNaN(Date.parse(trimmed)) ? trimmed : null;
}
function runtimeRank(status) {
    switch (status) {
        case 'not_configured': return 0;
        case 'configured': return 1;
        case 'governed_check_seen': return 2;
        case 'block_seen': return 3;
        case 'approval_seen': return 4;
    }
}
function runtimeStatusFromSignals(input) {
    if (input.approvalSeen)
        return 'approval_seen';
    if (input.blockSeen)
        return 'block_seen';
    if (input.governedCheckSeen)
        return 'governed_check_seen';
    if (input.agentConfigured)
        return 'configured';
    return 'not_configured';
}
function evidenceStatusFromSignals(input) {
    if (input.evidenceViewed)
        return 'viewed';
    if (input.evidenceSynced || input.repoIntelligenceSynced || input.governedCheckSeen)
        return 'synced';
    return 'none';
}
function repoIntelligenceStatusFromSignals(input) {
    if (input.repoIntelligenceSynced)
        return 'synced';
    if (input.repoIntelligenceNotEvaluated || input.governedCheckSeen)
        return 'not_evaluated';
    return 'none';
}
function repoConnectionFromSignals(input) {
    if (input.repoConnectionStatus) {
        return {
            status: input.repoConnectionStatus,
            source: input.repoConnectionSource ?? (input.repoConnectionStatus === 'cloud_proof_synced' ? 'activation_proof'
                : input.repoConnectionStatus === 'cloud_project_owned' ? 'project'
                    : input.repoConnectionStatus === 'cloud_runtime_repo_owned' ? 'runtime_repo'
                        : input.repoConnectionStatus === 'local_proof_queued' ? 'local_config'
                            : input.repoConnectionStatus === 'stale_local_config' ? 'local_config'
                                : 'none'),
            connected: input.repoConnectionStatus !== 'missing'
                && input.repoConnectionStatus !== 'stale_local_config',
        };
    }
    if (input.repoProofQueued) {
        return { status: 'local_proof_queued', source: 'local_config', connected: true };
    }
    if (input.repoConnected) {
        return { status: 'cloud_proof_synced', source: input.repoConnectionSource ?? 'activation_proof', connected: true };
    }
    return { status: 'missing', source: 'none', connected: false };
}
function firstValueNextCommand(step) {
    switch (step) {
        case 'login':
            return 'neurcode login';
        case 'repo_connect':
            return 'neurcode repo connect';
        case 'brain_index':
            return 'neurcode brain index';
        case 'agent_setup':
            return 'neurcode agent bootstrap codex';
        case 'governed_check':
            return 'neurcode agent guard start codex --goal "<bounded task>"';
        case 'evidence_view':
            return 'open /w/me/runtime-evidence';
        case 'repo_intelligence_sync':
            return 'neurcode sync --runtime';
    }
}
function firstValueExpectedOutcome(step) {
    switch (step) {
        case 'login':
            return 'This machine is linked to a Neurcode workspace.';
        case 'repo_connect':
            return 'The current repo is paired to a workspace without uploading source.';
        case 'brain_index':
            return 'The local Brain reports a fresh source-free repository graph.';
        case 'agent_setup':
            return 'Your agent can call Neurcode before governed writes.';
        case 'governed_check':
            return 'A governed session or check appears in Runtime Evidence.';
        case 'evidence_view':
            return 'A human has opened the first source-free evidence record.';
        case 'repo_intelligence_sync':
            return 'Repo Intelligence shows synced or honestly not-evaluated evidence.';
    }
}
function firstValueLabel(step) {
    switch (step) {
        case 'login': return 'Login';
        case 'repo_connect': return 'Repo connected';
        case 'brain_index': return 'Brain indexed';
        case 'agent_setup': return 'Agent setup';
        case 'governed_check': return 'Governed check';
        case 'evidence_view': return 'Evidence viewed';
        case 'repo_intelligence_sync': return 'Repo intelligence synced';
    }
}
function buildFirstValueProof(input) {
    const generatedAt = input.generatedAt ?? new Date().toISOString();
    const brainStatus = input.brainStatus ?? 'not_evaluated';
    const runtimeStatus = runtimeStatusFromSignals(input);
    const evidenceStatus = evidenceStatusFromSignals(input);
    const repoIntelligenceStatus = repoIntelligenceStatusFromSignals(input);
    const repoLabel = cleanString(input.repoLabel);
    const repoHash = cleanString(input.repoHash, 80);
    const workspaceId = cleanString(input.workspaceId, 120);
    const projectId = cleanString(input.projectId, 120);
    const repoId = cleanString(input.repoId, 120);
    const repoConnection = repoConnectionFromSignals(input);
    const repoConnected = input.repoConnected === true || repoConnection.connected;
    const completeByStep = {
        login: input.loggedIn === true || Boolean(workspaceId),
        repo_connect: repoConnected,
        brain_index: repoConnected && brainStatus === 'fresh',
        agent_setup: repoConnected && runtimeRank(runtimeStatus) >= runtimeRank('configured'),
        governed_check: repoConnected && runtimeRank(runtimeStatus) >= runtimeRank('governed_check_seen'),
        evidence_view: repoConnected && evidenceStatus === 'viewed',
        repo_intelligence_sync: repoConnected && repoIntelligenceStatus === 'synced',
    };
    const steps = exports.FIRST_VALUE_STEP_IDS.map((id) => ({
        id,
        label: firstValueLabel(id),
        complete: completeByStep[id],
        recommendedCommand: firstValueNextCommand(id),
        expectedOutcome: firstValueExpectedOutcome(id),
    }));
    const missingSteps = steps.filter((step) => !step.complete).map((step) => step.id);
    const nextStep = missingSteps[0] ?? 'repo_intelligence_sync';
    const proofSeed = `${workspaceId ?? 'no-workspace'}:${repoHash ?? repoLabel ?? 'no-repo'}:${generatedAt.slice(0, 10)}`;
    return {
        schemaVersion: exports.FIRST_VALUE_PROOF_SCHEMA_VERSION,
        proofId: `fvp_${stableHash(proofSeed)}`,
        generatedAt,
        workspaceId,
        repo: { label: repoLabel, hash: repoHash },
        repoConnection: {
            status: repoConnection.status,
            source: repoConnection.source,
            cloudProofSyncedAt: cleanIsoTimestamp(input.repoProofSyncedAt),
            proofQueued: input.repoProofQueued === true || repoConnection.status === 'local_proof_queued',
            projectId,
            repoId,
        },
        brainStatus,
        runtimeStatus,
        evidenceStatus,
        repoIntelligenceStatus,
        privacyStatus: 'source_uploaded_false',
        missingSteps,
        nextRecommendedCommand: missingSteps.length > 0 ? firstValueNextCommand(nextStep) : 'open /w/me/first-value',
        steps,
        limitations: [
            'Historical npm downloads cannot be attributed to real activation.',
            'Local Brain can exist before cloud Runtime Evidence or Repo Intelligence is synced.',
            'Repo Intelligence is deterministic only for compiled facts and explicit policies; bounded or advisory signals stay labeled.',
        ],
    };
}
function buildFirstValueState(input) {
    const proof = buildFirstValueProof(input);
    return {
        schemaVersion: exports.FIRST_VALUE_PROOF_SCHEMA_VERSION,
        proof,
        alreadyProven: proof.steps.filter((step) => step.complete).map((step) => step.id),
        generatedAt: proof.generatedAt,
        privacy: {
            sourceUploaded: false,
            commandArgumentsStored: false,
            machinePathsStored: false,
            sourceFree: true,
        },
    };
}
function scanValue(value, path, errors) {
    if (typeof value === 'string') {
        if (ABSOLUTE_PATH_VALUE.test(value))
            errors.push(`${path} looks like an absolute path`);
        if (SECRET_VALUE.test(value))
            errors.push(`${path} looks like a secret or token`);
        if (DATABASE_URL_VALUE.test(value))
            errors.push(`${path} looks like a database URL`);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => scanValue(item, `${path}[${index}]`, errors));
        return;
    }
    if (!value || typeof value !== 'object')
        return;
    for (const [key, child] of Object.entries(value)) {
        if (FORBIDDEN_FIELD_SET.has(key.toLowerCase()))
            errors.push(`${path}.${key} is forbidden`);
        scanValue(child, `${path}.${key}`, errors);
    }
}
function validateFirstValueSourceFreeInput(input) {
    const errors = [];
    scanValue(input, 'input', errors);
    return { ok: errors.length === 0, errors };
}
function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function isUuidLike(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function isActivationProofStage(value) {
    return typeof value === 'string' && exports.FIRST_VALUE_ACTIVATION_PROOF_STAGES.includes(value);
}
function isSafeIdentifier(value, max = 160) {
    return value.length >= 6 && value.length <= max && /^[a-zA-Z0-9][a-zA-Z0-9:_.-]*$/.test(value);
}
function isReasonCode(value) {
    return /^[a-z0-9][a-z0-9_.:-]{0,79}$/i.test(value);
}
function isSafeRepoLabel(value) {
    return value.length <= 80 && !/[\\/]/.test(value);
}
function validateStringLeakFree(key, value, errors) {
    if (value.length > 240)
        errors.push(`${key} exceeds 240 characters`);
    if (ABSOLUTE_PATH_VALUE.test(value))
        errors.push(`${key} looks like an absolute path`);
    if (SECRET_VALUE.test(value))
        errors.push(`${key} looks like a secret or token`);
    if (DATABASE_URL_VALUE.test(value))
        errors.push(`${key} looks like a database URL`);
}
function normalizeOptionalString(input, key, errors, max = 120) {
    const value = input[key];
    if (value === undefined)
        return undefined;
    if (value === null)
        return null;
    if (typeof value !== 'string') {
        errors.push(`${String(key)} must be a string or null`);
        return null;
    }
    const trimmed = value.trim().replace(/\s+/g, ' ').slice(0, max);
    validateStringLeakFree(String(key), trimmed, errors);
    return trimmed || null;
}
function normalizeLocalPosture(value, errors) {
    if (value === undefined)
        return undefined;
    if (value === null)
        return null;
    if (!isObject(value)) {
        errors.push('localPosture must be an object or null');
        return null;
    }
    const posture = {};
    for (const [key, child] of Object.entries(value)) {
        if (!FIRST_VALUE_ACTIVATION_PROOF_LOCAL_POSTURE_FIELDS.has(key)) {
            errors.push(`localPosture.${key} is not allowed`);
            continue;
        }
        if (key === 'hostInstallation') {
            const installation = normalizeManagedHostInstallation(child, errors);
            if (installation)
                posture.hostInstallation = installation;
            continue;
        }
        if (typeof child !== 'boolean') {
            errors.push(`localPosture.${key} must be boolean`);
            continue;
        }
        posture[key] = child;
    }
    return posture;
}
function normalizeManagedHostInstallation(value, errors) {
    if (!isObject(value)) {
        errors.push('localPosture.hostInstallation must be an object');
        return null;
    }
    for (const key of Object.keys(value)) {
        if (!MANAGED_HOST_INSTALLATION_FIELDS.has(key))
            errors.push(`localPosture.hostInstallation.${key} is not allowed`);
    }
    const schemaVersion = value.schemaVersion;
    const adapter = typeof value.adapter === 'string' ? value.adapter.trim() : '';
    const state = value.state;
    const distribution = value.distribution;
    const manifestVersion = typeof value.manifestVersion === 'string' ? value.manifestVersion.trim() : '';
    const configIntegrity = value.configIntegrity;
    const trustState = value.trustState;
    const checkedAt = typeof value.checkedAt === 'string' ? value.checkedAt.trim() : '';
    const fingerprint = value.fingerprint === null ? null : typeof value.fingerprint === 'string' ? value.fingerprint.trim() : '';
    const reasonCodes = Array.isArray(value.reasonCodes) ? value.reasonCodes : [];
    if (schemaVersion !== exports.MANAGED_HOST_INSTALLATION_SCHEMA_VERSION)
        errors.push('localPosture.hostInstallation.schemaVersion is invalid');
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(adapter))
        errors.push('localPosture.hostInstallation.adapter is invalid');
    if (!MANAGED_HOST_INSTALLATION_STATES.has(state))
        errors.push('localPosture.hostInstallation.state is invalid');
    if (!MANAGED_HOST_INSTALLATION_DISTRIBUTIONS.has(distribution))
        errors.push('localPosture.hostInstallation.distribution is invalid');
    if (!/^[a-z0-9][a-z0-9._-]{0,39}$/i.test(manifestVersion))
        errors.push('localPosture.hostInstallation.manifestVersion is invalid');
    if (!MANAGED_HOST_CONFIG_INTEGRITIES.has(configIntegrity))
        errors.push('localPosture.hostInstallation.configIntegrity is invalid');
    if (!MANAGED_HOST_TRUST_STATES.has(trustState))
        errors.push('localPosture.hostInstallation.trustState is invalid');
    if (!checkedAt || Number.isNaN(Date.parse(checkedAt)))
        errors.push('localPosture.hostInstallation.checkedAt must be ISO-8601');
    if (fingerprint !== null && !/^[a-f0-9]{64}$/.test(fingerprint))
        errors.push('localPosture.hostInstallation.fingerprint must be a SHA-256 digest or null');
    if (!Array.isArray(value.reasonCodes) || reasonCodes.length > 12
        || reasonCodes.some((reason) => !MANAGED_HOST_REASON_CODES.has(reason))) {
        errors.push('localPosture.hostInstallation.reasonCodes is invalid');
    }
    if (errors.some((error) => error.startsWith('localPosture.hostInstallation')))
        return null;
    return {
        schemaVersion: exports.MANAGED_HOST_INSTALLATION_SCHEMA_VERSION,
        adapter, state, distribution, manifestVersion, configIntegrity, trustState, checkedAt,
        fingerprint: fingerprint || null,
        reasonCodes: reasonCodes,
    };
}
function validateFirstValueActivationProofPayload(input) {
    const errors = [];
    if (!isObject(input)) {
        return { ok: false, errors: ['proof must be an object'] };
    }
    scanValue(input, 'proof', errors);
    for (const key of Object.keys(input)) {
        if (!FIRST_VALUE_ACTIVATION_PROOF_ALLOWED_FIELDS.has(key)) {
            errors.push(`${key} is not an allowed first-value activation proof field`);
        }
    }
    if (input.schemaVersion !== exports.FIRST_VALUE_ACTIVATION_PROOF_SCHEMA_VERSION) {
        errors.push('schemaVersion is invalid');
    }
    const eventId = typeof input.eventId === 'string' ? input.eventId.trim() : '';
    if (!isSafeIdentifier(eventId))
        errors.push('eventId must be a stable source-free idempotency key');
    const installId = typeof input.installId === 'string' ? input.installId.trim() : '';
    if (!isSafeIdentifier(installId))
        errors.push('installId must be a stable source-free install identifier');
    const stage = input.stage;
    if (!isActivationProofStage(stage))
        errors.push('stage is invalid');
    const timestamp = typeof input.timestamp === 'string' ? input.timestamp.trim() : '';
    if (!timestamp || Number.isNaN(Date.parse(timestamp)))
        errors.push('timestamp must be ISO-8601');
    const success = input.success;
    if (typeof success !== 'boolean')
        errors.push('success must be boolean');
    const cliVersion = normalizeOptionalString(input, 'cliVersion', errors, 80);
    const commandFamily = normalizeOptionalString(input, 'commandFamily', errors, 80);
    const reasonCode = normalizeOptionalString(input, 'reasonCode', errors, 80);
    const projectId = normalizeOptionalString(input, 'projectId', errors, 120);
    const repoId = normalizeOptionalString(input, 'repoId', errors, 120);
    const repoKeyHash = normalizeOptionalString(input, 'repoKeyHash', errors, 160);
    const repoLabel = normalizeOptionalString(input, 'repoLabel', errors, 80);
    const agentTarget = normalizeOptionalString(input, 'agentTarget', errors, 40);
    const localPosture = normalizeLocalPosture(input.localPosture, errors);
    if (reasonCode && !isReasonCode(reasonCode))
        errors.push('reasonCode is invalid');
    if (projectId && !isUuidLike(projectId))
        errors.push('projectId must be a UUID');
    if (repoId && !isUuidLike(repoId))
        errors.push('repoId must be a UUID');
    if (repoKeyHash && !isSafeIdentifier(repoKeyHash, 160))
        errors.push('repoKeyHash is invalid');
    if (repoLabel && !isSafeRepoLabel(repoLabel))
        errors.push('repoLabel must be a source-free label, not a path');
    if (agentTarget && !/^[a-z0-9_-]{2,40}$/i.test(agentTarget))
        errors.push('agentTarget is invalid');
    const proof = {
        schemaVersion: exports.FIRST_VALUE_ACTIVATION_PROOF_SCHEMA_VERSION,
        eventId,
        installId,
        stage: isActivationProofStage(stage) ? stage : 'repo_connect',
        timestamp,
        success: typeof success === 'boolean' ? success : false,
        ...(cliVersion !== undefined ? { cliVersion } : {}),
        ...(commandFamily !== undefined ? { commandFamily } : {}),
        ...(reasonCode !== undefined ? { reasonCode } : {}),
        ...(projectId !== undefined ? { projectId } : {}),
        ...(repoId !== undefined ? { repoId } : {}),
        ...(repoKeyHash !== undefined ? { repoKeyHash } : {}),
        ...(repoLabel !== undefined ? { repoLabel } : {}),
        ...(agentTarget !== undefined ? { agentTarget } : {}),
        ...(localPosture !== undefined ? { localPosture } : {}),
    };
    return { ok: errors.length === 0, proof: errors.length === 0 ? proof : undefined, errors };
}
function assertFirstValueActivationProofPayload(input) {
    const result = validateFirstValueActivationProofPayload(input);
    if (!result.ok || !result.proof) {
        throw new Error(`Invalid first-value activation proof: ${result.errors.join('; ')}`);
    }
    return result.proof;
}
__exportStar(require("./local"), exports);
//# sourceMappingURL=index.js.map