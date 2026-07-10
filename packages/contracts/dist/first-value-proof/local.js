"use strict";
/**
 * Local-First Aha V1 — source-free local first-value proof artifact.
 *
 * Produced by `neurcode pilot start` before any login: it records the local
 * block → exact-path approval → neighbor containment decision sequence, the
 * honest host enforcement tier, and a replay/proof hash. It must never carry
 * source text, prompts, diffs, secrets, raw args, or absolute paths.
 * Repo-relative paths and reason codes are the only location vocabulary.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCAL_FIRST_VALUE_SCHEMA_VERSION = void 0;
exports.localFirstValueStableHash = localFirstValueStableHash;
exports.localFirstValueContentHash = localFirstValueContentHash;
exports.validateLocalFirstValueSourceFree = validateLocalFirstValueSourceFree;
exports.assertLocalFirstValueArtifact = assertLocalFirstValueArtifact;
exports.LOCAL_FIRST_VALUE_SCHEMA_VERSION = 'neurcode.local-first-value.v1';
const LOCAL_FIRST_VALUE_FORBIDDEN_FIELDS = [
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
    'rawArgs',
    'argv',
    'body',
    'content',
    'databaseUrl',
    'connectionString',
];
const FORBIDDEN_FIELD_SET = new Set(LOCAL_FIRST_VALUE_FORBIDDEN_FIELDS.map((field) => field.toLowerCase()));
const ABSOLUTE_PATH_VALUE = /(?:\/Users\/|\/home\/|\/var\/|\/etc\/|\/private\/|[A-Za-z]:\\)/;
const SECRET_VALUE = /(sk-[a-z0-9]{16,}|nk_[a-z0-9_]{12,}|gh[pousr]_[a-z0-9_]{20,}|AKIA[0-9A-Z]{16})/i;
const DATABASE_URL_VALUE = /\b(?:postgres(?:ql)?:\/\/|mysql:\/\/|mongodb(?:\+srv)?:\/\/|redis:\/\/)/i;
/** Pure-JS stable hash so this module stays usable in browser bundles. */
function localFirstValueStableHash(input) {
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
function localFirstValueContentHash(artifact) {
    return localFirstValueStableHash(JSON.stringify({ ...artifact, contentHash: '' }));
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
/**
 * Source-free scan for the local proof artifact (and any rendering of it).
 * Field names carrying decision paths are allowed; absolute path VALUES are not.
 */
function validateLocalFirstValueSourceFree(input) {
    const errors = [];
    scanValue(input, 'artifact', errors);
    return { ok: errors.length === 0, errors };
}
/** Structural + privacy assertion used by writers before an artifact is persisted. */
function assertLocalFirstValueArtifact(artifact) {
    const errors = [];
    if (artifact.schemaVersion !== exports.LOCAL_FIRST_VALUE_SCHEMA_VERSION) {
        errors.push(`schemaVersion must be ${exports.LOCAL_FIRST_VALUE_SCHEMA_VERSION}`);
    }
    if (!artifact.proofId || !/^lfv_[0-9a-f]{16}$/.test(artifact.proofId)) {
        errors.push('proofId must look like lfv_<16 hex chars>');
    }
    if (Number.isNaN(Date.parse(artifact.generatedAt)))
        errors.push('generatedAt must be an ISO timestamp');
    if (artifact.privacy.sourceUploaded !== false || artifact.privacy.sourceFree !== true) {
        errors.push('privacy flags must record sourceUploaded=false and sourceFree=true');
    }
    if (artifact.blockedPathCount < 0)
        errors.push('blockedPathCount must be >= 0');
    const blockedSteps = artifact.decisions.filter((decision) => decision.verdict === 'block').length;
    if (artifact.blockedPathCount !== blockedSteps) {
        errors.push('blockedPathCount must equal the number of block decisions');
    }
    if (artifact.neighborContainment === 'contained') {
        const neighborBlocked = artifact.decisions.some((decision) => decision.step === 'neighbor_write_blocked' && decision.verdict === 'block');
        if (!neighborBlocked || !artifact.neighborPath) {
            errors.push('neighborContainment=contained requires a blocked neighbor_write_blocked decision and neighborPath');
        }
    }
    for (const decision of artifact.decisions) {
        if (!decision.path || decision.path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(decision.path)) {
            errors.push(`decision path must be repo-relative: ${decision.step}`);
        }
        if (decision.reasonCodes.length === 0)
            errors.push(`decision ${decision.step} must carry reason codes`);
    }
    if (localFirstValueContentHash(artifact) !== artifact.contentHash) {
        errors.push('contentHash does not match artifact content');
    }
    const sourceFree = validateLocalFirstValueSourceFree(artifact);
    errors.push(...sourceFree.errors);
    if (errors.length > 0) {
        throw new Error(`local first-value artifact rejected: ${errors.join('; ')}`);
    }
    return artifact;
}
//# sourceMappingURL=local.js.map