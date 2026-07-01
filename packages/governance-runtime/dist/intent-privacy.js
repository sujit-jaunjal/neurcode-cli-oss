"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTENT_PRIVACY_POLICY_VERSION = exports.INTENT_SUMMARY_SCHEMA_VERSION = void 0;
exports.detectCredentialText = detectCredentialText;
exports.normalizeIntentContent = normalizeIntentContent;
exports.canonicalIntentHash = canonicalIntentHash;
exports.sanitizeRepoRelativePath = sanitizeRepoRelativePath;
exports.sanitizeLocalPrivateText = sanitizeLocalPrivateText;
exports.buildIntentSummary = buildIntentSummary;
exports.isIntentSummaryV1 = isIntentSummaryV1;
exports.validatePrivacySafeCloudPayload = validatePrivacySafeCloudPayload;
exports.assertPrivacySafeCloudPayload = assertPrivacySafeCloudPayload;
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const node_util_1 = require("node:util");
exports.INTENT_SUMMARY_SCHEMA_VERSION = 'neurcode.intent-summary.v1';
exports.INTENT_PRIVACY_POLICY_VERSION = 'neurcode.intent-privacy.v1';
const MAX_SUMMARY_LABELS = 16;
const MAX_SUMMARY_PATHS = 100;
const MAX_SUMMARY_RULE_IDS = 64;
const MAX_LABEL_LENGTH = 80;
const MAX_PATH_LENGTH = 240;
const MAX_RULE_ID_LENGTH = 160;
const MAX_CLOUD_STRING = 1_000;
const MAX_CLOUD_ARRAY = 100;
const MAX_CLOUD_KEYS = 100;
const MAX_CLOUD_DEPTH = 8;
const MAX_CLOUD_NODES = 10_000;
const MAX_PATH_DEPTH = 40;
const MAX_PATH_SEGMENT_LENGTH = 100;
const MAX_CREDENTIAL_SCAN_LENGTH = 100_000;
const MAX_JWT_HEADER_SEGMENT_LENGTH = 514;
const MAX_JWT_BODY_SEGMENT_LENGTH = 2_048;
const MAX_JWT_HEADER_KEYS = 32;
const MAX_JWT_HEADER_STRING_LENGTH = 512;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const CONTROL_CHARACTERS_GLOBAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const MARKDOWN_INJECTION = /```|~~~|<!--|-->|<\s*\/?\s*script\b|&lt;\s*\/?\s*script\b|&lt;!--|--&gt;|%3c\s*\/?\s*script\b|%3c!--|--%3e/i;
const MARKDOWN_INJECTION_GLOBAL = /```|~~~|<!--|-->|<\s*\/?\s*script\b|&lt;\s*\/?\s*script\b|&lt;!--|--&gt;|%3c\s*\/?\s*script\b|%3c!--|--%3e/gi;
const ABSOLUTE_PATH = /(?:^|[\s"'(])(?:\/(?:Users|home|root|tmp|private|var|opt|etc)\/|[A-Za-z]:[\\/])/;
const SHELL_BODY = /(?:^|\n)\s*(?:sudo\s+|curl\s+|wget\s+|ssh\s+|npm\s+publish\b|pnpm\s+publish\b|git\s+push\b)/i;
const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const PATH_ALLOWED_CHARACTERS = /^[\p{L}\p{N}._@+*/?{},[\]-]+$/u;
const PATH_SEGMENT = /^[\p{L}\p{N}._@+-]+$/u;
const GLOB_BRACE = /\{[\p{L}\p{N}._@+-]+(?:,[\p{L}\p{N}._@+-]+)+\}/gu;
const GLOB_CLASS = /\[[\p{L}\p{N}._@+\-]+\]/gu;
const GLOB_META = /[*?[\]{}]/;
const ROUTE_PARAMETER_SEGMENT = /^\[(?:\.\.\.)?[\p{L}\p{N}_-]+\]$/u;
const JWT_ALGORITHM = /^[A-Za-z0-9][A-Za-z0-9+._-]{0,63}$/;
const JWT_HEADER_TEXT = /^[^\u0000-\u001F\u007F]{1,512}$/;
const UTF8_DECODER = new node_util_1.TextDecoder('utf-8', { fatal: true });
const CREDENTIAL_PATTERNS = [
    {
        code: 'private_key_marker',
        source: String.raw `-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]{0,100000}?(?:-----END(?: [A-Z0-9]+)? PRIVATE KEY-----|$)`,
        flags: 'i',
        replacement: '[REDACTED:private_key_marker]',
    },
    {
        code: 'private_key_marker',
        source: String.raw `-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----`,
        flags: 'i',
        replacement: '[REDACTED:private_key_marker]',
    },
    {
        code: 'authorization_header',
        source: String.raw `\b(?:authorization|proxy-authorization)\s*:\s*(?:bearer|basic)\s+[^\s,;]{1,4096}`,
        flags: 'i',
        replacement: '[REDACTED:authorization_header]',
    },
    {
        code: 'authorization_header',
        source: String.raw `^(?:bearer|basic)\s+[A-Za-z0-9+/_=-]{8,4096}$`,
        flags: 'i',
        replacement: '[REDACTED:authorization_header]',
    },
    {
        code: 'api_token',
        source: String.raw `(?<![A-Za-z0-9_-])(?:github_pat_[A-Za-z0-9_]{12,255}|gh[pousr]_[A-Za-z0-9]{16,255}|npm_[A-Za-z0-9]{16,255}|sk-(?:proj-|svcacct-|ant-)?(?=[A-Za-z0-9_-]{20,512}(?![A-Za-z0-9_-]))(?=[A-Za-z0-9_-]{0,511}[0-9A-Z])[A-Za-z0-9_-]{20,512}|(?:rk|pk)_(?:live|test)_[A-Za-z0-9]{16,255}|xox[abprs]-[A-Za-z0-9-]{8,512}|(?:AKIA|ASIA)[A-Z0-9]{16})(?![A-Za-z0-9_-])`,
        flags: 'i',
        replacement: '[REDACTED:api_token]',
    },
    {
        code: 'api_token',
        source: String.raw `(?<![A-Za-z0-9_-])sk_(?=[A-Za-z0-9_-]{16,255}(?![A-Za-z0-9_-]))(?=[A-Za-z0-9_-]{0,254}[0-9])[A-Za-z0-9_-]{16,255}`,
        flags: 'i',
        replacement: '[REDACTED:api_token]',
    },
    {
        code: 'password_assignment',
        source: String.raw `\b[A-Za-z][A-Za-z0-9+.-]{1,20}:\/\/[^/\s:@]{1,128}:[^/\s@]{1,256}@`,
        flags: 'i',
        replacement: '[REDACTED:password_assignment]',
    },
    {
        code: 'password_assignment',
        source: String.raw `\b(?:password|passwd|pwd|secret|token|api[_-]?key)\s*(?:=|:)\s*(?:"[^"\r\n]{4,512}"|'[^'\r\n]{4,512}'|[^\s,;]{4,512})`,
        flags: 'i',
        replacement: '[REDACTED:password_assignment]',
    },
];
const RAW_FIELD_NAMES = new Set([
    'goal',
    'usergoal',
    'prompt',
    'rawprompt',
    'prompttext',
    'chat',
    'chathistory',
    'transcript',
    'agentmessage',
    'agentmessages',
    'message',
    'messages',
    'summary',
    'text',
    'plan',
    'agentplan',
    'steps',
    'constraints',
    'risks',
    'intentcontract',
    'clarification',
    'plantext',
    'rawplan',
    'shellcommand',
    'commandbody',
    'terminaloutput',
]);
function uniqueSorted(values) {
    return Array.from(new Set(Array.from(values).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}
function credentialPattern(definition, global = false) {
    const flags = `${definition.flags.replace(/g/g, '')}${global ? 'g' : ''}`;
    return new RegExp(definition.source, flags);
}
function boundedCredentialInput(value, maxLength) {
    const input = typeof value === 'string' ? value.normalize('NFKC') : '';
    const boundedLength = Math.max(0, Math.min(Number.isFinite(maxLength) ? Math.floor(maxLength) : MAX_CREDENTIAL_SCAN_LENGTH, MAX_CREDENTIAL_SCAN_LENGTH));
    return {
        normalized: input.slice(0, boundedLength),
        truncated: input.length > boundedLength,
    };
}
function isBase64UrlCharacter(code) {
    return (code >= 48 && code <= 57)
        || (code >= 65 && code <= 90)
        || (code >= 97 && code <= 122)
        || code === 45
        || code === 95;
}
function base64UrlRuns(value) {
    const runs = [];
    let index = 0;
    while (index < value.length) {
        while (index < value.length && !isBase64UrlCharacter(value.charCodeAt(index)))
            index += 1;
        if (index >= value.length)
            break;
        const start = index;
        while (index < value.length && isBase64UrlCharacter(value.charCodeAt(index)))
            index += 1;
        runs.push({ start, end: index });
    }
    return runs;
}
function decodeCanonicalBase64Url(segment, maxLength) {
    if (segment.length < 2
        || segment.length > maxLength
        || segment.length % 4 === 1
        || !/^[A-Za-z0-9_-]+$/.test(segment)) {
        return null;
    }
    const decoded = Buffer.from(segment, 'base64url');
    if (decoded.length === 0 || decoded.toString('base64url') !== segment)
        return null;
    return decoded;
}
function validOptionalHeaderText(value) {
    return value === undefined
        || (typeof value === 'string'
            && value.length <= MAX_JWT_HEADER_STRING_LENGTH
            && JWT_HEADER_TEXT.test(value));
}
function hasStructurallyValidJwsHeader(segment) {
    const decoded = decodeCanonicalBase64Url(segment, MAX_JWT_HEADER_SEGMENT_LENGTH);
    if (!decoded)
        return false;
    let header;
    try {
        header = JSON.parse(UTF8_DECODER.decode(decoded));
    }
    catch {
        return false;
    }
    if (!header || typeof header !== 'object' || Array.isArray(header))
        return false;
    const record = header;
    const keys = Object.keys(record);
    if (keys.length === 0 || keys.length > MAX_JWT_HEADER_KEYS)
        return false;
    if (typeof record.alg !== 'string' || !JWT_ALGORITHM.test(record.alg))
        return false;
    if (!validOptionalHeaderText(record.typ) || !validOptionalHeaderText(record.cty))
        return false;
    if (!validOptionalHeaderText(record.kid) || !validOptionalHeaderText(record.jku))
        return false;
    if (!validOptionalHeaderText(record.x5u) || !validOptionalHeaderText(record.x5t))
        return false;
    if (!validOptionalHeaderText(record['x5t#S256']))
        return false;
    if (record.b64 !== undefined && typeof record.b64 !== 'boolean')
        return false;
    if (record.jwk !== undefined && (!record.jwk || typeof record.jwk !== 'object' || Array.isArray(record.jwk)))
        return false;
    if (record.x5c !== undefined && (!Array.isArray(record.x5c)
        || record.x5c.length === 0
        || record.x5c.length > MAX_JWT_HEADER_KEYS
        || record.x5c.some((value) => !validOptionalHeaderText(value))))
        return false;
    if (record.crit !== undefined) {
        if (!Array.isArray(record.crit)
            || record.crit.length === 0
            || record.crit.length > MAX_JWT_HEADER_KEYS
            || record.crit.some((value) => !validOptionalHeaderText(value))
            || new Set(record.crit).size !== record.crit.length
            || record.crit.some((value) => !Object.prototype.hasOwnProperty.call(record, value))) {
            return false;
        }
    }
    return true;
}
function structuralJwtMatches(value) {
    const matches = [];
    const runs = base64UrlRuns(value);
    for (let index = 0; index + 2 < runs.length; index += 1) {
        const headerRun = runs[index];
        const payloadRun = runs[index + 1];
        const signatureRun = runs[index + 2];
        if (headerRun.end + 1 !== payloadRun.start
            || payloadRun.end + 1 !== signatureRun.start
            || value[headerRun.end] !== '.'
            || value[payloadRun.end] !== '.') {
            continue;
        }
        const header = value.slice(headerRun.start, headerRun.end);
        const payload = value.slice(payloadRun.start, payloadRun.end);
        const signature = value.slice(signatureRun.start, signatureRun.end);
        if (!hasStructurallyValidJwsHeader(header)
            || !decodeCanonicalBase64Url(payload, MAX_JWT_BODY_SEGMENT_LENGTH)
            || !decodeCanonicalBase64Url(signature, MAX_JWT_BODY_SEGMENT_LENGTH)) {
            continue;
        }
        const candidate = { start: headerRun.start, end: signatureRun.end };
        const previous = matches.at(-1);
        if (previous && candidate.start <= previous.end) {
            previous.end = Math.max(previous.end, candidate.end);
        }
        else {
            matches.push(candidate);
        }
    }
    return matches;
}
function redactStructuralJwts(value, matches) {
    if (matches.length === 0)
        return value;
    let cursor = 0;
    let output = '';
    for (const match of matches) {
        output += `${value.slice(cursor, match.start)}[REDACTED:api_token]`;
        cursor = match.end;
    }
    return output + value.slice(cursor);
}
function detectCredentialText(value, maxLength = MAX_CREDENTIAL_SCAN_LENGTH) {
    const bounded = boundedCredentialInput(value, maxLength);
    const reasons = new Set();
    if (structuralJwtMatches(bounded.normalized).length > 0)
        reasons.add('api_token');
    for (const definition of CREDENTIAL_PATTERNS) {
        if (credentialPattern(definition).test(bounded.normalized)) {
            reasons.add(definition.code);
        }
    }
    const reasonCodes = uniqueSorted(reasons);
    return {
        detected: reasonCodes.length > 0,
        reasonCodes,
        scannedCharacters: bounded.normalized.length,
        truncated: bounded.truncated,
    };
}
function redactCredentialText(value, maxLength) {
    const bounded = boundedCredentialInput(value, maxLength);
    const reasons = new Set();
    const jwtMatches = structuralJwtMatches(bounded.normalized);
    if (jwtMatches.length > 0)
        reasons.add('api_token');
    let output = redactStructuralJwts(bounded.normalized, jwtMatches);
    for (const definition of CREDENTIAL_PATTERNS) {
        if (credentialPattern(definition).test(bounded.normalized))
            reasons.add(definition.code);
    }
    for (const definition of CREDENTIAL_PATTERNS) {
        output = output.replace(credentialPattern(definition, true), definition.replacement);
    }
    return {
        value: output,
        reasonCodes: uniqueSorted(reasons),
    };
}
function cleanBoundedLabel(value) {
    if (typeof value !== 'string')
        return null;
    const cleaned = value
        .normalize('NFKC')
        .replace(CONTROL_CHARACTERS_GLOBAL, '')
        .replace(MARKDOWN_INJECTION_GLOBAL, ' ')
        .replace(/[^\p{L}\p{N}._:@/-]+/gu, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, MAX_LABEL_LENGTH);
    return cleaned || null;
}
function cleanRuleId(value) {
    const cleaned = cleanBoundedLabel(value);
    return cleaned ? cleaned.slice(0, MAX_RULE_ID_LENGTH) : null;
}
function normalizeIntentContent(value) {
    if (typeof value !== 'string')
        return '';
    return value
        .normalize('NFKC')
        .replace(/\r\n?/g, '\n')
        .replace(CONTROL_CHARACTERS_GLOBAL, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
function canonicalIntentHash(value) {
    return (0, node_crypto_1.createHash)('sha256')
        .update(normalizeIntentContent(value), 'utf8')
        .digest('hex');
}
function sanitizeRepoRelativePath(value, options = {}) {
    if (typeof value !== 'string')
        return { path: null, reasonCodes: ['unsafe_path'] };
    const reasons = [];
    const original = value.normalize('NFKC');
    const allowGlobs = options.allowGlobs !== false;
    if (!original || original.length > MAX_PATH_LENGTH)
        reasons.push('unsafe_path');
    if (CONTROL_CHARACTERS.test(original))
        reasons.push('control_character');
    if (MARKDOWN_INJECTION.test(original))
        reasons.push('unsafe_path');
    if ((0, node_path_1.isAbsolute)(original) || /^[A-Za-z]:[\\/]/.test(original))
        reasons.push('absolute_path');
    if (URI_SCHEME.test(original))
        reasons.push('unsafe_path');
    const credentialReasons = new Set();
    const completeCredentialDetection = detectCredentialText(original, MAX_PATH_LENGTH);
    completeCredentialDetection.reasonCodes.forEach((reason) => credentialReasons.add(reason));
    if (/[\s\\'"`$;&|<>()=:#%]/u.test(original)
        || /(?:\$\{|\$\(|`)/.test(original)) {
        reasons.push('unsafe_path');
    }
    if (!PATH_ALLOWED_CHARACTERS.test(original.replace(/^\.\//, '')))
        reasons.push('unsafe_path');
    const withoutDot = original.replace(/^\.\//, '');
    const normalized = node_path_1.posix.normalize(withoutDot);
    if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
        reasons.push('path_traversal');
    }
    if (normalized.startsWith('/') ||
        normalized === '.' ||
        normalized.includes('\0') ||
        /[\r\n]/.test(normalized) ||
        normalized.includes('//')) {
        reasons.push('unsafe_path');
    }
    const segments = normalized.split('/');
    if (segments.length > MAX_PATH_DEPTH)
        reasons.push('unsafe_path');
    const hasGlob = segments.some((segment) => GLOB_META.test(segment) && !ROUTE_PARAMETER_SEGMENT.test(segment));
    if (hasGlob && !allowGlobs)
        reasons.push('unsafe_path');
    if (options.requireGlob === true && !hasGlob)
        reasons.push('unsafe_path');
    for (const segment of segments) {
        const segmentCredentialDetection = detectCredentialText(segment, MAX_PATH_SEGMENT_LENGTH);
        segmentCredentialDetection.reasonCodes.forEach((reason) => credentialReasons.add(reason));
        if (!segment
            || segment === '.'
            || segment === '..'
            || segment.length > MAX_PATH_SEGMENT_LENGTH
            || segment.startsWith('!')
            || /\*{3,}/.test(segment)) {
            reasons.push('unsafe_path');
            continue;
        }
        if (ROUTE_PARAMETER_SEGMENT.test(segment))
            continue;
        if (!GLOB_META.test(segment)) {
            if (!PATH_SEGMENT.test(segment))
                reasons.push('unsafe_path');
            continue;
        }
        let remainder = segment
            .replace(GLOB_BRACE, '')
            .replace(GLOB_CLASS, '')
            .replace(/\*\*|\*|\?/g, '');
        const literalCredentialDetection = detectCredentialText(remainder, MAX_PATH_SEGMENT_LENGTH);
        literalCredentialDetection.reasonCodes.forEach((reason) => credentialReasons.add(reason));
        if (GLOB_META.test(remainder) || (remainder && !PATH_SEGMENT.test(remainder))) {
            reasons.push('unsafe_path');
        }
    }
    if (credentialReasons.size > 0) {
        reasons.push(...credentialReasons, 'credential_shaped_path');
    }
    return {
        path: reasons.length === 0 ? normalized : null,
        reasonCodes: uniqueSorted(reasons),
    };
}
function sanitizeLocalPrivateText(value, maxLength = 12_000) {
    const input = typeof value === 'string' ? value.normalize('NFKC').replace(/\r\n?/g, '\n') : '';
    const reasons = new Set();
    let output = input.replace(CONTROL_CHARACTERS_GLOBAL, () => {
        reasons.add('control_character');
        return '';
    });
    const boundedLength = Math.max(0, Math.min(maxLength, 100_000));
    const truncated = output.length > boundedLength;
    if (truncated) {
        reasons.add('string_truncated');
        output = output.slice(0, boundedLength);
    }
    const credentialRedaction = redactCredentialText(output, boundedLength);
    credentialRedaction.reasonCodes.forEach((reason) => reasons.add(reason));
    output = credentialRedaction.value;
    return {
        value: output,
        redacted: Array.from(reasons).some((reason) => reason !== 'string_truncated' && reason !== 'array_truncated' && reason !== 'object_truncated'),
        truncated,
        reasonCodes: uniqueSorted(reasons),
        originalLength: input.length,
    };
}
function buildIntentSummary(input) {
    const content = normalizeIntentContent(input.content);
    const pathReasons = [];
    const paths = uniqueSorted((input.paths ?? []).flatMap((candidate) => {
        const sanitized = sanitizeRepoRelativePath(candidate);
        pathReasons.push(...sanitized.reasonCodes);
        return sanitized.path ? [sanitized.path] : [];
    })).slice(0, MAX_SUMMARY_PATHS);
    const categories = uniqueSorted((input.categories ?? []).map(cleanBoundedLabel).filter((value) => Boolean(value))).slice(0, MAX_SUMMARY_LABELS);
    const domains = uniqueSorted((input.domains ?? []).map(cleanBoundedLabel).filter((value) => Boolean(value))).slice(0, MAX_SUMMARY_LABELS);
    const ruleIds = uniqueSorted((input.ruleIds ?? []).map(cleanRuleId).filter((value) => Boolean(value))).slice(0, MAX_SUMMARY_RULE_IDS);
    const redactionReasons = uniqueSorted([
        ...(input.redactionReasonCodes ?? []),
        ...pathReasons,
        ...((input.paths?.length ?? 0) > MAX_SUMMARY_PATHS ? ['array_truncated'] : []),
        ...((input.categories?.length ?? 0) > MAX_SUMMARY_LABELS ? ['array_truncated'] : []),
        ...((input.domains?.length ?? 0) > MAX_SUMMARY_LABELS ? ['array_truncated'] : []),
        ...((input.ruleIds?.length ?? 0) > MAX_SUMMARY_RULE_IDS ? ['array_truncated'] : []),
    ]);
    const hasRedaction = redactionReasons.some((reason) => reason !== 'string_truncated' && reason !== 'array_truncated' && reason !== 'object_truncated');
    const hasTruncation = redactionReasons.some((reason) => reason === 'string_truncated' || reason === 'array_truncated' || reason === 'object_truncated');
    const scopeMode = input.scopeMode === 'explicit'
        || input.scopeMode === 'inferred'
        || input.scopeMode === 'ambiguous'
        ? input.scopeMode
        : 'unknown';
    const actorType = input.actorType === 'human'
        || input.actorType === 'agent'
        || input.actorType === 'system'
        ? input.actorType
        : 'unknown';
    const planRevision = Number(input.planRevision);
    const createdAt = typeof input.createdAt === 'string' && Number.isFinite(Date.parse(input.createdAt))
        ? new Date(input.createdAt).toISOString()
        : null;
    const updatedAt = typeof input.updatedAt === 'string' && Number.isFinite(Date.parse(input.updatedAt))
        ? new Date(input.updatedAt).toISOString()
        : null;
    return {
        schemaVersion: exports.INTENT_SUMMARY_SCHEMA_VERSION,
        policyVersion: exports.INTENT_PRIVACY_POLICY_VERSION,
        intentHash: canonicalIntentHash(content),
        categories,
        domains,
        paths,
        planRevision: Number.isFinite(planRevision) && planRevision >= 0 ? Math.floor(planRevision) : null,
        scopeMode,
        ruleIds,
        counts: {
            characters: content.length,
            lines: content ? content.split('\n').length : 0,
            paths: paths.length,
            planSteps: Math.max(0, Math.min(Number(input.planSteps) || 0, 10_000)),
            events: Math.max(0, Math.min(Number(input.events) || 0, 1_000_000)),
        },
        actorType,
        createdAt,
        updatedAt,
        redaction: {
            status: hasRedaction && hasTruncation
                ? 'redacted_and_truncated'
                : hasRedaction
                    ? 'redacted'
                    : hasTruncation
                        ? 'truncated'
                        : content
                            ? 'none'
                            : 'unavailable',
            reasonCodes: redactionReasons,
        },
        provenance: {
            classification: input.provenanceClassification ?? 'cloud_safe',
            source: input.provenanceSource ?? 'unknown',
        },
        contentAvailable: false,
    };
}
function isIntentSummaryV1(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const candidate = value;
    return candidate.schemaVersion === exports.INTENT_SUMMARY_SCHEMA_VERSION
        && candidate.policyVersion === exports.INTENT_PRIVACY_POLICY_VERSION
        && typeof candidate.intentHash === 'string'
        && /^[a-f0-9]{64}$/.test(candidate.intentHash)
        && Array.isArray(candidate.categories)
        && Array.isArray(candidate.domains)
        && Array.isArray(candidate.paths)
        && candidate.paths.every((pathValue) => {
            const sanitized = sanitizeRepoRelativePath(pathValue);
            return sanitized.path === pathValue;
        })
        && candidate.contentAvailable === false;
}
function normalizedKey(value) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
function stringReason(value, key) {
    const normalized = value.normalize('NFKC');
    if (normalized.length > MAX_CLOUD_STRING)
        return 'unbounded_string';
    if (CONTROL_CHARACTERS.test(normalized) || MARKDOWN_INJECTION.test(normalized))
        return 'control_character';
    const credentialDetection = detectCredentialText(normalized, MAX_CLOUD_STRING);
    if (credentialDetection.detected)
        return credentialDetection.reasonCodes[0] ?? 'api_token';
    if (ABSOLUTE_PATH.test(normalized) && /(?:path|file|root|cwd|repo)/i.test(key))
        return 'absolute_path';
    if (SHELL_BODY.test(normalized) && /(?:command|message|summary|reason|text|body)/i.test(key))
        return 'forbidden_field';
    return null;
}
const PATH_FIELD_KINDS = new Map([
    ['path', 'exact'],
    ['filepath', 'exact'],
    ['blockedpath', 'exact'],
    ['suggestedapprovalpath', 'exact'],
    ['requiredpath', 'exact'],
    ['appliedpath', 'exact'],
    ['recordpath', 'exact'],
    ['profilepath', 'exact'],
    ['expectedfiles', 'exact'],
    ['approvedpaths', 'exact'],
    ['addedfiles', 'exact'],
    // `likelyTests` / `nearbyTests` are AUTOMATICALLY INFERRED test surfaces and are
    // legitimately glob-shaped (e.g. `tests/**`). The runtime producer
    // (session deriveIntentContract → scopeAuthority.likelyTests = supportPathGlobs) and
    // the cloud-safe projection (cli runtime-privacy safePaths, which allows globs) both
    // emit globs here. Classifying these as `exact` made the validator reject the
    // runtime's own inferred test globs as `unsafe_path`, fail-closing the entire session
    // (Apache Airflow dogfood P0-B). They are path PATTERNS, strictly less specific than
    // an exact path, so `mixed` is privacy-equivalent and internally consistent.
    ['nearbytests', 'mixed'],
    ['targetpaths', 'exact'],
    ['reviewfirst', 'exact'],
    ['likelytests', 'mixed'],
    ['matchedpaths', 'exact'],
    ['requestedpaths', 'exact'],
    ['paths', 'mixed'],
    ['pathtokens', 'mixed'],
    ['relatedpaths', 'mixed'],
    ['expectedglobs', 'glob'],
    ['allowedglobs', 'mixed'],
    ['sensitiveglobs', 'mixed'],
    ['approvalrequiredglobs', 'mixed'],
    ['safesupportglobs', 'mixed'],
    ['ignoredglobs', 'mixed'],
    ['expectedpathglobs', 'mixed'],
    ['supportpathglobs', 'mixed'],
    ['outofscopeglobs', 'mixed'],
    ['addedglobs', 'mixed'],
]);
function validatePathFieldValue(entry, path, kind, issues) {
    if (entry === null || entry === undefined)
        return true;
    const values = Array.isArray(entry) ? entry : [entry];
    if (values.some((item) => typeof item !== 'string')) {
        issues.push({ fieldPath: path, reasonCode: 'invalid_schema' });
        return false;
    }
    for (let index = 0; index < values.length; index += 1) {
        const fieldPath = Array.isArray(entry) ? `${path}[${index}]` : path;
        const candidate = values[index];
        const sanitized = sanitizeRepoRelativePath(candidate, {
            allowGlobs: kind !== 'exact',
            requireGlob: kind === 'glob',
        });
        if (sanitized.path !== candidate) {
            const reasons = sanitized.reasonCodes.length > 0
                ? sanitized.reasonCodes
                : ['unsafe_path'];
            reasons.forEach((reasonCode) => issues.push({ fieldPath, reasonCode }));
        }
    }
    return true;
}
function validatePrivacySafeCloudPayload(value) {
    const issues = [];
    let nodes = 0;
    const visit = (entry, path, key, depth) => {
        nodes += 1;
        if (nodes > MAX_CLOUD_NODES) {
            issues.push({ fieldPath: path, reasonCode: 'unbounded_object' });
            return;
        }
        if (depth > MAX_CLOUD_DEPTH) {
            issues.push({ fieldPath: path, reasonCode: 'depth_exceeded' });
            return;
        }
        if (typeof entry === 'string') {
            const reason = stringReason(entry, key);
            if (reason)
                issues.push({ fieldPath: path, reasonCode: reason });
            return;
        }
        if (Array.isArray(entry)) {
            if (entry.length > MAX_CLOUD_ARRAY) {
                issues.push({ fieldPath: path, reasonCode: 'unbounded_array' });
            }
            entry.slice(0, MAX_CLOUD_ARRAY + 1).forEach((item, index) => visit(item, `${path}[${index}]`, key, depth + 1));
            return;
        }
        if (!entry || typeof entry !== 'object')
            return;
        const objectEntries = Object.entries(entry);
        if (objectEntries.length > MAX_CLOUD_KEYS) {
            issues.push({ fieldPath: path, reasonCode: 'unbounded_object' });
        }
        for (const [childKey, child] of objectEntries.slice(0, MAX_CLOUD_KEYS + 1)) {
            const compact = normalizedKey(childKey);
            const pathFieldKind = PATH_FIELD_KINDS.get(compact);
            if (pathFieldKind
                && !(compact === 'paths' && typeof child === 'number')) {
                validatePathFieldValue(child, `${path}.${childKey}`, pathFieldKind, issues);
            }
            if (RAW_FIELD_NAMES.has(compact)) {
                const structuredContainer = (compact === 'summary'
                    || compact === 'plan'
                    || compact === 'agentplan'
                    || compact === 'intentcontract') && Boolean(child) && typeof child === 'object' && !Array.isArray(child);
                if (!structuredContainer) {
                    issues.push({ fieldPath: `${path}.${childKey}`, reasonCode: 'forbidden_field' });
                    continue;
                }
            }
            visit(child, `${path}.${childKey}`, childKey, depth + 1);
        }
    };
    visit(value, 'payload', '', 0);
    const deduped = Array.from(new Map(issues.map((issue) => [`${issue.fieldPath}:${issue.reasonCode}`, issue])).values()).sort((left, right) => left.fieldPath.localeCompare(right.fieldPath) || left.reasonCode.localeCompare(right.reasonCode));
    return { ok: deduped.length === 0, issues: deduped };
}
function assertPrivacySafeCloudPayload(value) {
    const validation = validatePrivacySafeCloudPayload(value);
    if (validation.ok)
        return;
    const description = validation.issues
        .slice(0, 12)
        .map((issue) => `${issue.fieldPath}:${issue.reasonCode}`)
        .join(', ');
    throw new Error(`intent privacy validation failed (${description})`);
}
//# sourceMappingURL=intent-privacy.js.map