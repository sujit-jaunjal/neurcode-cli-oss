"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeVerificationEvidence = writeVerificationEvidence;
const crypto_1 = require("crypto");
const os_1 = require("os");
const fs_1 = require("fs");
const path_1 = require("path");
const secret_masking_1 = require("./secret-masking");
const artifact_io_1 = require("./artifact-io");
const EVIDENCE_SCHEMA_VERSION = 'neurcode.verify.evidence.v1';
const EVIDENCE_FILENAME_PREFIX = 'verification-';
const EVIDENCE_FILENAME_SUFFIX = '.json';
const DEFAULT_EVIDENCE_DIR = '.neurcode/evidence';
const DEFAULT_EVIDENCE_RETENTION = 50;
const REDACTED_VALUE = '[REDACTED_BY_NEURCODE]';
const SENSITIVE_KEY_PATTERN = /(token|secret|password|api[_-]?key|authorization|cookie|private[_-]?key|client[_-]?secret)/i;
const CREDENTIAL_URL_PATTERN = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'`]+/gi;
const POSIX_ABSOLUTE_PATH_SEGMENT_PATTERN = /(^|[\s'"(])((?:\/)(?:Users|home|private|var|tmp|opt|Volumes|etc|srv|mnt)\/[^\s'"`)]+)/g;
const WINDOWS_ABSOLUTE_PATH_SEGMENT_PATTERN = /(^|[\s'"(])([A-Za-z]:\\[^\s'"`)]+)/g;
function sha256Hex(input) {
    return (0, crypto_1.createHash)('sha256').update(input, 'utf-8').digest('hex');
}
function normalizeForHash(value) {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => normalizeForHash(item));
    }
    const record = value;
    const normalized = {};
    for (const key of Object.keys(record).sort()) {
        const current = record[key];
        if (typeof current === 'undefined')
            continue;
        normalized[key] = normalizeForHash(current);
    }
    return normalized;
}
function toIsoTimestampWithoutMs(dateValue) {
    return dateValue.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
function toEvidenceFilenameTimestamp(dateValue) {
    return dateValue.toISOString().replace(/[:.]/g, '-');
}
function toPathHash(pathValue) {
    return sha256Hex(pathValue).slice(0, 12);
}
function redactPath(pathValue) {
    return `[REDACTED_PATH:${toPathHash(pathValue)}]`;
}
function sanitizeCredentialUrls(value) {
    return value.replace(CREDENTIAL_URL_PATTERN, REDACTED_VALUE);
}
function sanitizeAbsolutePaths(value, resolvedHome) {
    let sanitized = value;
    if (resolvedHome && sanitized.includes(resolvedHome)) {
        sanitized = sanitized.split(resolvedHome).join(redactPath(resolvedHome));
    }
    if ((0, path_1.isAbsolute)(sanitized) || /^[A-Za-z]:\\/.test(sanitized)) {
        return redactPath(sanitized);
    }
    sanitized = sanitized.replace(POSIX_ABSOLUTE_PATH_SEGMENT_PATTERN, (_full, prefix, pathSegment) => `${prefix}${redactPath(pathSegment)}`);
    sanitized = sanitized.replace(WINDOWS_ABSOLUTE_PATH_SEGMENT_PATTERN, (_full, prefix, pathSegment) => `${prefix}${redactPath(pathSegment)}`);
    return sanitized;
}
function sanitizeString(value, resolvedHome) {
    const maskedSecret = (0, secret_masking_1.maskSecretsInText)(value).masked;
    const maskedCredentials = sanitizeCredentialUrls(maskedSecret);
    return sanitizeAbsolutePaths(maskedCredentials, resolvedHome);
}
function sanitizeValue(value, resolvedHome) {
    if (value === null || typeof value === 'undefined') {
        return value;
    }
    if (typeof value === 'string') {
        return sanitizeString(value, resolvedHome);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((entry) => sanitizeValue(entry, resolvedHome));
    }
    if (typeof value === 'object') {
        const record = value;
        const sanitized = {};
        for (const key of Object.keys(record).sort()) {
            const current = record[key];
            if (typeof current === 'undefined')
                continue;
            if (SENSITIVE_KEY_PATTERN.test(key)) {
                sanitized[key] = REDACTED_VALUE;
                continue;
            }
            sanitized[key] = sanitizeValue(current, resolvedHome);
        }
        return sanitized;
    }
    return sanitizeString(String(value), resolvedHome);
}
function asRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value;
}
function asNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function asVerdict(value) {
    if (typeof value !== 'string')
        return 'UNKNOWN';
    const upper = value.trim().toUpperCase();
    if (upper === 'PASS' || upper === 'WARN' || upper === 'FAIL') {
        return upper;
    }
    return 'UNKNOWN';
}
function resolveRetentionLimit(explicit) {
    if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit >= 1) {
        return Math.floor(explicit);
    }
    const envValue = process.env.NEURCODE_VERIFY_EVIDENCE_MAX_ARTIFACTS;
    if (!envValue)
        return DEFAULT_EVIDENCE_RETENTION;
    const parsed = Number.parseInt(envValue, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return DEFAULT_EVIDENCE_RETENTION;
    }
    return Math.floor(parsed);
}
function resolveEvidenceDirectory(projectRoot, configuredDir) {
    if (configuredDir && configuredDir.trim().length > 0) {
        return (0, path_1.resolve)(projectRoot, configuredDir.trim());
    }
    return (0, path_1.resolve)(projectRoot, DEFAULT_EVIDENCE_DIR);
}
function pruneEvidenceArtifacts(directoryPath, keepLatest) {
    if (!(0, fs_1.existsSync)(directoryPath))
        return;
    const entries = (0, fs_1.readdirSync)(directoryPath)
        .filter((name) => name.startsWith(EVIDENCE_FILENAME_PREFIX) && name.endsWith(EVIDENCE_FILENAME_SUFFIX))
        .sort();
    if (entries.length <= keepLatest)
        return;
    const toDelete = entries.slice(0, entries.length - keepLatest);
    for (const name of toDelete) {
        (0, fs_1.rmSync)((0, path_1.join)(directoryPath, name), { force: true });
    }
}
function buildDeterministicVerificationHash(input) {
    const payload = {
        canonicalVerifyOutput: input.canonicalOutput,
        policiesUsed: input.policiesUsed ?? null,
        intentSummary: input.intentSummary ?? null,
    };
    return sha256Hex(JSON.stringify(normalizeForHash(payload)));
}
function writeVerificationEvidence(input) {
    if (!input.enabled) {
        return null;
    }
    const finishedAtMs = Date.now();
    const startedAtMs = Number.isFinite(input.startedAtMs) ? input.startedAtMs : finishedAtMs;
    const durationMs = Math.max(0, finishedAtMs - startedAtMs);
    const timestamp = toIsoTimestampWithoutMs(new Date(finishedAtMs));
    const fileTimestamp = toEvidenceFilenameTimestamp(new Date(finishedAtMs));
    const evidenceDir = resolveEvidenceDirectory(input.projectRoot, input.evidenceDir);
    const retentionLimit = resolveRetentionLimit(input.retentionMax);
    const homeDirResolved = (0, path_1.resolve)((0, os_1.homedir)());
    const fallbackOutput = input.fallbackOutput || {};
    const canonicalOutput = (input.canonicalOutput || fallbackOutput);
    const sanitizedCanonicalOutput = sanitizeValue(canonicalOutput, homeDirResolved);
    const canonicalRecord = asRecord(canonicalOutput) || {};
    const policySources = canonicalRecord.policySources ?? canonicalRecord.policyPack ?? null;
    const intentSummary = canonicalRecord.intentSummary ?? null;
    const violations = Array.isArray(canonicalRecord.violations) ? canonicalRecord.violations : [];
    const flowIssues = Array.isArray(canonicalRecord.flowIssues) ? canonicalRecord.flowIssues : [];
    const regressions = Array.isArray(canonicalRecord.regressions) ? canonicalRecord.regressions : [];
    const intentGovernance = canonicalRecord.intentGovernance ?? null;
    const blockingCount = asNumber(canonicalRecord.blockingCount)
        ?? (Array.isArray(canonicalRecord.blockingItems) ? canonicalRecord.blockingItems.length : null)
        ?? 0;
    const advisoryCount = asNumber(canonicalRecord.advisoryCount)
        ?? (Array.isArray(canonicalRecord.advisoryItems) ? canonicalRecord.advisoryItems.length : null)
        ?? 0;
    const verdictFromPayload = asVerdict(canonicalRecord.verdict);
    const verdict = verdictFromPayload !== 'UNKNOWN'
        ? verdictFromPayload
        : input.exitCode === 0
            ? 'PASS'
            : input.exitCode === 1
                ? 'WARN'
                : 'FAIL';
    const deterministicVerificationHash = buildDeterministicVerificationHash({
        canonicalOutput: sanitizedCanonicalOutput,
        policiesUsed: sanitizeValue(policySources, homeDirResolved),
        intentSummary: sanitizeValue(intentSummary, homeDirResolved),
    });
    const runtimeMetadataInput = input.runtimeMetadata || {};
    const runtimeMetadata = sanitizeValue({
        ...runtimeMetadataInput,
        projectRootHash: toPathHash((0, path_1.resolve)(input.projectRoot)),
    }, homeDirResolved);
    const artifact = {
        schemaVersion: EVIDENCE_SCHEMA_VERSION,
        artifactType: 'verification_evidence',
        timestamp,
        verificationDurationMs: durationMs,
        exitCode: input.exitCode,
        verdict,
        pass: verdict === 'PASS',
        ciMode: input.ciMode,
        deterministicMode: input.deterministicMode,
        deterministicVerificationHash,
        git: sanitizeValue(input.ciContext || {}, homeDirResolved),
        policiesUsed: sanitizeValue(policySources, homeDirResolved),
        intentSummary: sanitizeValue(intentSummary, homeDirResolved),
        intentGovernance: sanitizeValue(intentGovernance, homeDirResolved),
        violations: sanitizeValue(violations, homeDirResolved),
        flowIssues: sanitizeValue(flowIssues, homeDirResolved),
        regressions: sanitizeValue(regressions, homeDirResolved),
        blockingCount,
        advisoryCount,
        summary: sanitizeValue(canonicalRecord.summary ?? null, homeDirResolved),
        runtimeMetadata,
        canonicalVerifyOutput: sanitizedCanonicalOutput,
    };
    (0, fs_1.mkdirSync)(evidenceDir, { recursive: true });
    const filePath = (0, path_1.join)(evidenceDir, `${EVIDENCE_FILENAME_PREFIX}${fileTimestamp}.json`);
    (0, artifact_io_1.atomicWriteJsonFileSync)(filePath, artifact);
    pruneEvidenceArtifacts(evidenceDir, retentionLimit);
    return filePath;
}
//# sourceMappingURL=verification-evidence.js.map