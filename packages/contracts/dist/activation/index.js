"use strict";
/**
 * Activation telemetry contract.
 *
 * Source-free by design: this contract allows only coarse journey metadata.
 * It rejects unknown fields and common leak shapes before events reach storage.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVATION_EVENT_FORBIDDEN_FIELDS = exports.ACTIVATION_EVENT_ALLOWED_FIELDS = exports.ACTIVATION_PACKAGE_MANAGERS = exports.ACTIVATION_INSTALL_MODES = exports.ACTIVATION_AGENT_TARGETS = exports.ACTIVATION_STAGES = exports.ACTIVATION_EVENT_TYPES = exports.ACTIVATION_TELEMETRY_SCHEMA_VERSION = void 0;
exports.activationStageForEventType = activationStageForEventType;
exports.validateActivationTelemetryEvent = validateActivationTelemetryEvent;
exports.assertActivationTelemetryEvent = assertActivationTelemetryEvent;
exports.ACTIVATION_TELEMETRY_SCHEMA_VERSION = 'neurcode.activation-telemetry.v1';
exports.ACTIVATION_EVENT_TYPES = [
    'cli_invoked',
    'cli_login_started',
    'cli_login_completed',
    'repo_connect_started',
    'repo_connect_completed',
    'brain_index_started',
    'brain_index_completed',
    'agent_setup_started',
    'agent_target_selected',
    'agent_setup_completed',
    'first_governed_check_completed',
    'first_block_observed',
    'first_approval_observed',
    'first_evidence_viewed',
    'first_repo_intelligence_synced',
    'dashboard_onboarding_viewed',
    'onboarding_step_completed',
];
exports.ACTIVATION_STAGES = [
    'install_seen',
    'login_completed',
    'repo_connected',
    'brain_indexed',
    'agent_configured',
    'first_governed_check',
    'first_evidence_synced',
    'first_block_or_approval',
];
exports.ACTIVATION_AGENT_TARGETS = [
    'claude',
    'cursor',
    'codex',
    'copilot',
    'vscode',
    'action',
    'manual',
    'unknown',
];
exports.ACTIVATION_INSTALL_MODES = [
    'npm_global',
    'npx',
    'pnpm',
    'yarn',
    'bun',
    'local_build',
    'unknown',
];
exports.ACTIVATION_PACKAGE_MANAGERS = [
    'npm',
    'pnpm',
    'yarn',
    'bun',
    'unknown',
];
exports.ACTIVATION_EVENT_ALLOWED_FIELDS = [
    'schemaVersion',
    'eventId',
    'eventType',
    'anonymousInstallId',
    'authenticatedUserId',
    'workspaceId',
    'cliVersion',
    'commandFamily',
    'os',
    'arch',
    'nodeVersion',
    'packageManager',
    'installMode',
    'agentTarget',
    'geo',
    'timestamp',
    'stage',
    'reasonCode',
    'success',
];
exports.ACTIVATION_EVENT_FORBIDDEN_FIELDS = [
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
const ALLOWED_FIELD_SET = new Set(exports.ACTIVATION_EVENT_ALLOWED_FIELDS);
const FORBIDDEN_FIELD_SET = new Set(exports.ACTIVATION_EVENT_FORBIDDEN_FIELDS.map((field) => field.toLowerCase()));
function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function isActivationEventType(value) {
    return typeof value === 'string' && exports.ACTIVATION_EVENT_TYPES.includes(value);
}
function isActivationStage(value) {
    return typeof value === 'string' && exports.ACTIVATION_STAGES.includes(value);
}
function isActivationAgentTarget(value) {
    return typeof value === 'string' && exports.ACTIVATION_AGENT_TARGETS.includes(value);
}
function isActivationInstallMode(value) {
    return typeof value === 'string' && exports.ACTIVATION_INSTALL_MODES.includes(value);
}
function isActivationPackageManager(value) {
    return typeof value === 'string' && exports.ACTIVATION_PACKAGE_MANAGERS.includes(value);
}
function isUuidLike(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function isReasonCode(value) {
    return /^[a-z0-9][a-z0-9_.:-]{0,79}$/i.test(value);
}
function looksLikeAbsolutePath(value) {
    return /(?:\/Users\/|\/home\/|\/var\/|\/etc\/|\/private\/|[A-Za-z]:\\)/.test(value);
}
function looksLikeSecret(value) {
    return /(sk-[a-z0-9]{16,}|nk_[a-z0-9_]{12,}|gh[pousr]_[a-z0-9_]{20,}|AKIA[0-9A-Z]{16})/i.test(value);
}
function looksLikeDatabaseUrl(value) {
    return /\b(?:postgres(?:ql)?:\/\/|mysql:\/\/|mongodb(?:\+srv)?:\/\/|redis:\/\/)/i.test(value);
}
function validateStringValue(key, value, errors) {
    if (value.length > 240) {
        errors.push(`${key} exceeds 240 characters`);
    }
    if (looksLikeAbsolutePath(value)) {
        errors.push(`${key} looks like an absolute path`);
    }
    if (looksLikeSecret(value)) {
        errors.push(`${key} looks like a secret or token`);
    }
    if (looksLikeDatabaseUrl(value)) {
        errors.push(`${key} looks like a database URL`);
    }
}
function validateGeo(value, errors) {
    if (value === undefined)
        return undefined;
    if (value === null)
        return null;
    if (!isObject(value)) {
        errors.push('geo must be an object');
        return null;
    }
    for (const key of Object.keys(value)) {
        if (key !== 'country' && key !== 'region')
            errors.push(`geo.${key} is not allowed`);
    }
    const country = typeof value.country === 'string' ? value.country.trim().toUpperCase() : value.country;
    const region = typeof value.region === 'string' ? value.region.trim().slice(0, 80) : value.region;
    if (country !== undefined && country !== null && (typeof country !== 'string' || !/^[A-Z]{2}$/.test(country))) {
        errors.push('geo.country must be a two-letter country code');
    }
    if (region !== undefined && region !== null && typeof region !== 'string') {
        errors.push('geo.region must be a string or null');
    }
    if (typeof region === 'string')
        validateStringValue('geo.region', region, errors);
    return { country: country, region: region };
}
function activationStageForEventType(eventType, success = true) {
    switch (eventType) {
        case 'cli_invoked':
        case 'cli_login_started':
            return 'install_seen';
        case 'cli_login_completed':
            return success === false ? null : 'login_completed';
        case 'repo_connect_completed':
            return success === false ? null : 'repo_connected';
        case 'brain_index_completed':
            return success === false ? null : 'brain_indexed';
        case 'agent_setup_completed':
            return success === false ? null : 'agent_configured';
        case 'first_governed_check_completed':
            return success === false ? null : 'first_governed_check';
        case 'first_repo_intelligence_synced':
            // Milestone 9: a governed session synced source-free repo-intelligence
            // evidence. This is the only event that advances the durable
            // `first_evidence_synced` funnel stage; before this it stayed unreachable.
            return success === false ? null : 'first_evidence_synced';
        case 'first_block_observed':
        case 'first_approval_observed':
            return 'first_block_or_approval';
        case 'first_evidence_viewed':
            // Milestone 8: a human opened the first source-free evidence record in the
            // dashboard. Counted as engagement; it does not by itself prove evidence
            // was synced, so it advances no durable funnel stage.
            return null;
        case 'onboarding_step_completed':
        case 'dashboard_onboarding_viewed':
        case 'repo_connect_started':
        case 'brain_index_started':
        case 'agent_setup_started':
        case 'agent_target_selected':
            return null;
    }
}
function validateActivationTelemetryEvent(input) {
    const errors = [];
    if (!isObject(input)) {
        return { ok: false, errors: ['event must be an object'] };
    }
    for (const key of Object.keys(input)) {
        if (!ALLOWED_FIELD_SET.has(key))
            errors.push(`${key} is not an allowed activation field`);
        if (FORBIDDEN_FIELD_SET.has(key.toLowerCase()))
            errors.push(`${key} is forbidden`);
    }
    const schemaVersion = input.schemaVersion;
    if (schemaVersion !== exports.ACTIVATION_TELEMETRY_SCHEMA_VERSION)
        errors.push('schemaVersion is invalid');
    const eventId = typeof input.eventId === 'string' ? input.eventId.trim() : '';
    if (!eventId || !isUuidLike(eventId))
        errors.push('eventId must be a UUID');
    const eventType = input.eventType;
    if (!isActivationEventType(eventType))
        errors.push('eventType is invalid');
    const anonymousInstallId = typeof input.anonymousInstallId === 'string' ? input.anonymousInstallId.trim() : '';
    if (!anonymousInstallId || !isUuidLike(anonymousInstallId))
        errors.push('anonymousInstallId must be a UUID');
    const timestamp = typeof input.timestamp === 'string' ? input.timestamp.trim() : '';
    if (!timestamp || Number.isNaN(Date.parse(timestamp)))
        errors.push('timestamp must be ISO-8601');
    const event = {
        schemaVersion: exports.ACTIVATION_TELEMETRY_SCHEMA_VERSION,
        eventId,
        eventType: isActivationEventType(eventType) ? eventType : 'cli_invoked',
        anonymousInstallId,
        timestamp,
    };
    const optionalStrings = [
        'authenticatedUserId',
        'workspaceId',
        'cliVersion',
        'commandFamily',
        'os',
        'arch',
        'nodeVersion',
        'reasonCode',
    ];
    for (const key of optionalStrings) {
        const value = input[key];
        if (value === undefined)
            continue;
        if (value === null) {
            event[key] = null;
            continue;
        }
        if (typeof value !== 'string') {
            errors.push(`${key} must be a string or null`);
            continue;
        }
        const trimmed = value.trim();
        validateStringValue(key, trimmed, errors);
        if (key === 'reasonCode' && trimmed && !isReasonCode(trimmed))
            errors.push('reasonCode is invalid');
        event[key] = trimmed || null;
    }
    if (input.packageManager !== undefined && input.packageManager !== null) {
        if (isActivationPackageManager(input.packageManager))
            event.packageManager = input.packageManager;
        else
            errors.push('packageManager is invalid');
    }
    if (input.installMode !== undefined && input.installMode !== null) {
        if (isActivationInstallMode(input.installMode))
            event.installMode = input.installMode;
        else
            errors.push('installMode is invalid');
    }
    if (input.agentTarget !== undefined && input.agentTarget !== null) {
        if (isActivationAgentTarget(input.agentTarget))
            event.agentTarget = input.agentTarget;
        else
            errors.push('agentTarget is invalid');
    }
    if (input.stage !== undefined && input.stage !== null) {
        if (isActivationStage(input.stage))
            event.stage = input.stage;
        else
            errors.push('stage is invalid');
    }
    if (input.success !== undefined && input.success !== null) {
        if (typeof input.success === 'boolean')
            event.success = input.success;
        else
            errors.push('success must be boolean or null');
    }
    const geo = validateGeo(input.geo, errors);
    if (geo !== undefined)
        event.geo = geo;
    return { ok: errors.length === 0, event: errors.length === 0 ? event : undefined, errors };
}
function assertActivationTelemetryEvent(input) {
    const result = validateActivationTelemetryEvent(input);
    if (!result.ok || !result.event) {
        throw new Error(`Invalid activation telemetry event: ${result.errors.join('; ')}`);
    }
    return result.event;
}
//# sourceMappingURL=index.js.map