"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRepositoryRelativePath = normalizeRepositoryRelativePath;
exports.deriveTrustedHostPosture = deriveTrustedHostPosture;
exports.validateProposedChangeEnvelope = validateProposedChangeEnvelope;
exports.validateAndBindProposedChangeEnvelope = validateAndBindProposedChangeEnvelope;
const repo_intelligence_v2_1 = require("./repo-intelligence-v2");
const MAX_SERIALIZED_BYTES = 1_000_000;
const MAX_DEPTH = 14;
const MAX_CONTAINER_ENTRIES = 12_000;
const MAX_FACTS_PER_FAMILY = 4_096;
const MAX_PATH_LENGTH = 1_024;
const MAX_ID_LENGTH = 512;
const MAX_NAME_LENGTH = 256;
const MAX_METADATA_LENGTH = 1_000;
const ADAPTERS = [
    'claude-code-hooks',
    'copilot-hooks',
    'generic-mcp',
    'codex-hooks',
    'codex-mcp',
    'cursor-mcp',
    'vscode-extension',
    'github-action',
    'neurcode-cli',
];
const LANGUAGES = [
    'typescript', 'javascript', 'python', 'go', 'java', 'ruby', 'rust',
    'markdown', 'yaml', 'json', 'shell', 'sql', 'other',
];
const PARSER_DEPTHS = ['ast', 'syntax_tree', 'regex_degraded', 'metadata_only', 'unsupported'];
const FACT_FAMILIES = [
    'path', 'symbol', 'import', 'reference', 'call', 'package', 'service',
    'ownership', 'test', 'surface',
];
const POLICY_FAMILIES = [
    'symbol_uniqueness', 'import_boundary', 'layering', 'ownership_approval',
    'service_dependency', 'required_test', 'sensitive_surface_approval',
    'review_required_surface', 'generated_file_restriction', 'scope_constraint',
];
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]*$/;
const NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$-]*$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const GIT_SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const SOURCE_LIKE_METADATA = /(?:[\r\n\0]|=>|\b(?:export|import|function|class)\s+[A-Za-z_$]|\b(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=|\bdef\s+[A-Za-z_]\w*\s*\(|\breturn\s+[^.]{0,100}[();]|[{}\x60])/;
const IMPORT_TARGET_PATTERN = /^[A-Za-z0-9@._/#:+~<>=-]+$/;
function fail(path, message) {
    throw new Error(`Invalid ProposedChangeEnvelope at ${path}: ${message}`);
}
function assertPayloadBudget(value) {
    const seen = new WeakSet();
    let entries = 0;
    let stringBytes = 0;
    const stack = [
        { value, path: 'envelope', depth: 0 },
    ];
    while (stack.length > 0) {
        const current = stack.pop();
        if (current.depth > MAX_DEPTH)
            fail(current.path, `nesting exceeds ${MAX_DEPTH}`);
        if (typeof current.value === 'string') {
            stringBytes += Buffer.byteLength(current.value, 'utf8');
            if (stringBytes > MAX_SERIALIZED_BYTES)
                fail(current.path, 'string budget exceeded');
            continue;
        }
        if (current.value === null || typeof current.value !== 'object')
            continue;
        if (seen.has(current.value))
            fail(current.path, 'cyclic values are not allowed');
        seen.add(current.value);
        if (Array.isArray(current.value)) {
            entries += current.value.length;
            if (entries > MAX_CONTAINER_ENTRIES)
                fail(current.path, 'container entry budget exceeded');
            current.value.forEach((child, index) => stack.push({
                value: child,
                path: `${current.path}[${index}]`,
                depth: current.depth + 1,
            }));
            continue;
        }
        const prototype = Object.getPrototypeOf(current.value);
        if (prototype !== Object.prototype && prototype !== null) {
            fail(current.path, 'only plain JSON objects are allowed');
        }
        const descriptors = Object.getOwnPropertyDescriptors(current.value);
        for (const [key, descriptor] of Object.entries(descriptors)) {
            if (DANGEROUS_KEYS.has(key))
                fail(`${current.path}.${key}`, 'prototype-pollution key is forbidden');
            if (descriptor.get || descriptor.set)
                fail(`${current.path}.${key}`, 'accessor properties are forbidden');
            entries += 1;
            if (entries > MAX_CONTAINER_ENTRIES)
                fail(current.path, 'container entry budget exceeded');
            stack.push({ value: descriptor.value, path: `${current.path}.${key}`, depth: current.depth + 1 });
        }
    }
    if (stringBytes > MAX_SERIALIZED_BYTES)
        fail('envelope', 'payload exceeds byte budget');
}
function record(value, path, allowed, required = allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        fail(path, 'must be an object');
    const result = value;
    const allowedKeys = new Set(allowed);
    for (const key of Object.keys(result)) {
        if (!allowedKeys.has(key))
            fail(`${path}.${key}`, 'unknown field');
    }
    for (const key of required) {
        if (!Object.prototype.hasOwnProperty.call(result, key))
            fail(`${path}.${key}`, 'required field is missing');
    }
    return result;
}
function array(value, path, max = MAX_FACTS_PER_FAMILY) {
    if (!Array.isArray(value))
        fail(path, 'must be an array');
    if (value.length > max)
        fail(path, `array exceeds ${max} items`);
    return value;
}
function string(value, path, max, pattern) {
    if (typeof value !== 'string' || value.length === 0)
        fail(path, 'must be a non-empty string');
    if (Buffer.byteLength(value, 'utf8') > max)
        fail(path, `string exceeds ${max} bytes`);
    if (pattern && !pattern.test(value))
        fail(path, 'has an invalid format');
    return value;
}
function nullableString(value, path, max, pattern) {
    return value === null ? null : string(value, path, max, pattern);
}
function enumeration(value, path, values) {
    if (typeof value !== 'string' || !values.includes(value)) {
        fail(path, `must be one of: ${values.join(', ')}`);
    }
    return value;
}
function boolean(value, path) {
    if (typeof value !== 'boolean')
        fail(path, 'must be a boolean');
    return value;
}
function integer(value, path, min = 0, max = 10_000_000) {
    if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
        fail(path, `must be an integer between ${min} and ${max}`);
    }
    return Number(value);
}
function nullableInteger(value, path, min = 0, max = 10_000_000) {
    return value === null ? null : integer(value, path, min, max);
}
function sourceFreeMetadata(value, path, max = MAX_METADATA_LENGTH) {
    const result = string(value, path, max);
    if (SOURCE_LIKE_METADATA.test(result))
        fail(path, 'contains source-like text');
    return result;
}
function nullableMetadata(value, path, max = MAX_METADATA_LENGTH) {
    return value === null ? null : sourceFreeMetadata(value, path, max);
}
function id(value, path) {
    return string(value, path, MAX_ID_LENGTH, ID_PATTERN);
}
function name(value, path) {
    return string(value, path, MAX_NAME_LENGTH, NAME_PATTERN);
}
function hash(value, path) {
    return string(value, path, 64, HASH_PATTERN);
}
function nullableHash(value, path) {
    return value === null ? null : hash(value, path);
}
function normalizeRepositoryRelativePath(value, path) {
    const candidate = string(value, path, MAX_PATH_LENGTH);
    if (candidate.includes('\\') || candidate.includes('\0') || candidate.startsWith('/') || /^[A-Za-z]:/.test(candidate)) {
        fail(path, 'must be a repository-relative POSIX path');
    }
    const segments = candidate.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        fail(path, 'contains an empty or traversal segment');
    }
    if (SOURCE_LIKE_METADATA.test(candidate))
        fail(path, 'contains source-like text');
    return candidate;
}
function importTarget(value, path) {
    const target = string(value, path, MAX_PATH_LENGTH);
    if (!IMPORT_TARGET_PATTERN.test(target) || target.includes('\0') || /[\r\n{};`]/.test(target)) {
        fail(path, 'contains source-like text');
    }
    if (target.startsWith('/') || /^[A-Za-z]:/.test(target) || target.split('/').includes('..') && !target.startsWith('../')) {
        fail(path, 'has an invalid import target');
    }
    return target;
}
function nullablePath(value, path) {
    return value === null ? null : normalizeRepositoryRelativePath(value, path);
}
function line(value, path) {
    return nullableInteger(value, path, 1, 100_000_000);
}
function validateStringArray(value, path, validator, max = 256) {
    array(value, path, max).forEach((item, index) => validator(item, `${path}[${index}]`));
}
function validateSymbol(value, path, targetPath) {
    const item = record(value, path, [
        'id', 'name', 'kind', 'language', 'filePath', 'line', 'exported', 'local',
        'arity', 'signatureHash', 'structuralFingerprint', 'parserDepth',
    ]);
    id(item.id, `${path}.id`);
    name(item.name, `${path}.name`);
    enumeration(item.kind, `${path}.kind`, ['function', 'class', 'interface', 'type', 'const', 'method', 'module', 'unknown']);
    enumeration(item.language, `${path}.language`, LANGUAGES);
    if (normalizeRepositoryRelativePath(item.filePath, `${path}.filePath`) !== targetPath) {
        fail(`${path}.filePath`, 'must match target.path');
    }
    line(item.line, `${path}.line`);
    boolean(item.exported, `${path}.exported`);
    boolean(item.local, `${path}.local`);
    nullableInteger(item.arity, `${path}.arity`, 0, 10_000);
    nullableHash(item.signatureHash, `${path}.signatureHash`);
    nullableHash(item.structuralFingerprint, `${path}.structuralFingerprint`);
    enumeration(item.parserDepth, `${path}.parserDepth`, PARSER_DEPTHS);
}
function validateImport(value, path, targetPath) {
    const item = record(value, path, [
        'id', 'fromFile', 'target', 'resolvedFile', 'resolution', 'resolutionReason',
        'sourcePackage', 'targetPackage', 'sourceService', 'targetService',
        'importedNames', 'kind', 'line', 'parserDepth',
    ], ['id', 'fromFile', 'target', 'resolvedFile', 'importedNames', 'kind', 'line', 'parserDepth']);
    id(item.id, `${path}.id`);
    if (normalizeRepositoryRelativePath(item.fromFile, `${path}.fromFile`) !== targetPath) {
        fail(`${path}.fromFile`, 'must match target.path');
    }
    importTarget(item.target, `${path}.target`);
    const resolvedFile = nullablePath(item.resolvedFile, `${path}.resolvedFile`);
    const resolution = item.resolution === undefined
        ? null
        : enumeration(item.resolution, `${path}.resolution`, [
            'resolved_repository', 'external_package', 'unresolved', 'ambiguous', 'dynamic',
        ]);
    if (resolution === 'resolved_repository' && !resolvedFile)
        fail(`${path}.resolvedFile`, 'is required for resolved_repository');
    if (resolution && resolution !== 'resolved_repository' && resolvedFile) {
        fail(`${path}.resolvedFile`, `must be null for ${resolution}`);
    }
    if (item.resolutionReason !== undefined)
        nullableMetadata(item.resolutionReason, `${path}.resolutionReason`);
    for (const key of ['sourcePackage', 'targetPackage', 'sourceService', 'targetService']) {
        if (item[key] !== undefined && item[key] !== null)
            importTarget(item[key], `${path}.${key}`);
    }
    validateStringArray(item.importedNames, `${path}.importedNames`, name);
    enumeration(item.kind, `${path}.kind`, ['static', 'dynamic', 'require', 'python_import', 'unknown']);
    line(item.line, `${path}.line`);
    enumeration(item.parserDepth, `${path}.parserDepth`, PARSER_DEPTHS);
}
function validateExport(value, path, targetPath) {
    const item = record(value, path, ['id', 'filePath', 'symbolName', 'target', 'kind', 'line', 'parserDepth']);
    id(item.id, `${path}.id`);
    if (normalizeRepositoryRelativePath(item.filePath, `${path}.filePath`) !== targetPath) {
        fail(`${path}.filePath`, 'must match target.path');
    }
    name(item.symbolName, `${path}.symbolName`);
    if (item.target !== null)
        importTarget(item.target, `${path}.target`);
    enumeration(item.kind, `${path}.kind`, ['named', 'default', 're_export', 'python_public', 'unknown']);
    line(item.line, `${path}.line`);
    enumeration(item.parserDepth, `${path}.parserDepth`, PARSER_DEPTHS);
}
function validateRelationship(value, path) {
    const item = record(value, path, [
        'id', 'type', 'fromId', 'toId', 'confidence', 'deterministic', 'provenance',
        'computationRepeatable', 'semanticCertainty', 'evidenceTier', 'enforcementEligible',
    ], ['id', 'type', 'fromId', 'toId', 'confidence', 'deterministic', 'provenance']);
    id(item.id, `${path}.id`);
    enumeration(item.type, `${path}.type`, [
        'defines', 'references', 'imports', 'exports', 'calls', 'owns',
        'belongs_to_package', 'belongs_to_service', 'tests', 'depends_on',
        'structurally_resembles', 'crosses_boundary',
    ]);
    id(item.fromId, `${path}.fromId`);
    id(item.toId, `${path}.toId`);
    enumeration(item.confidence, `${path}.confidence`, ['exact', 'high', 'medium', 'low']);
    boolean(item.deterministic, `${path}.deterministic`);
    if (item.computationRepeatable !== undefined)
        boolean(item.computationRepeatable, `${path}.computationRepeatable`);
    if (item.semanticCertainty !== undefined) {
        enumeration(item.semanticCertainty, `${path}.semanticCertainty`, ['exact', 'high', 'medium', 'low', 'unknown']);
    }
    if (item.evidenceTier !== undefined) {
        enumeration(item.evidenceTier, `${path}.evidenceTier`, ['deterministic', 'advisory', 'degraded']);
    }
    if (item.enforcementEligible !== undefined)
        boolean(item.enforcementEligible, `${path}.enforcementEligible`);
    if (item.type === 'structurally_resembles' && item.enforcementEligible === true) {
        fail(`${path}.enforcementEligible`, 'structural resemblance is advisory and cannot be enforcement eligible');
    }
    sourceFreeMetadata(item.provenance, `${path}.provenance`, 256);
}
function validateReference(value, path, targetPath) {
    const item = record(value, path, [
        'id', 'filePath', 'name', 'line', 'kind', 'resolvedSymbolId', 'resolvedFile',
        'resolution', 'resolutionReason', 'parserDepth',
    ]);
    id(item.id, `${path}.id`);
    if (normalizeRepositoryRelativePath(item.filePath, `${path}.filePath`) !== targetPath) {
        fail(`${path}.filePath`, 'must match target.path');
    }
    name(item.name, `${path}.name`);
    line(item.line, `${path}.line`);
    enumeration(item.kind, `${path}.kind`, ['call_target', 'identifier', 'property', 'unknown']);
    validateResolutionFields(item, path);
    enumeration(item.parserDepth, `${path}.parserDepth`, PARSER_DEPTHS);
}
function validateCall(value, path, targetPath) {
    const item = record(value, path, [
        'id', 'filePath', 'calledName', 'line', 'callerSymbolId', 'callKind',
        'resolvedSymbolId', 'resolvedFile', 'resolution', 'resolutionReason', 'parserDepth',
    ]);
    id(item.id, `${path}.id`);
    if (normalizeRepositoryRelativePath(item.filePath, `${path}.filePath`) !== targetPath) {
        fail(`${path}.filePath`, 'must match target.path');
    }
    name(item.calledName, `${path}.calledName`);
    line(item.line, `${path}.line`);
    if (item.callerSymbolId !== null)
        id(item.callerSymbolId, `${path}.callerSymbolId`);
    enumeration(item.callKind, `${path}.callKind`, ['direct', 'property', 'constructor', 'unknown']);
    validateResolutionFields(item, path);
    enumeration(item.parserDepth, `${path}.parserDepth`, PARSER_DEPTHS);
}
function validateResolutionFields(item, path) {
    const resolution = enumeration(item.resolution, `${path}.resolution`, [
        'local_symbol', 'imported_symbol', 'repository_symbol', 'ambiguous', 'unresolved',
    ]);
    const resolvedSymbolId = item.resolvedSymbolId === null
        ? null
        : id(item.resolvedSymbolId, `${path}.resolvedSymbolId`);
    const resolvedFile = nullablePath(item.resolvedFile, `${path}.resolvedFile`);
    const resolved = ['local_symbol', 'imported_symbol', 'repository_symbol'].includes(resolution);
    if (resolved && (!resolvedSymbolId || !resolvedFile)) {
        fail(path, 'resolved facts require resolvedSymbolId and resolvedFile');
    }
    if (!resolved && (resolvedSymbolId || resolvedFile)) {
        fail(path, 'ambiguous or unresolved facts cannot claim resolved targets');
    }
    nullableMetadata(item.resolutionReason, `${path}.resolutionReason`);
}
function validateBoundary(value, path, targetPath) {
    const item = record(value, path, ['id', 'filePath', 'packageKey', 'serviceKey', 'parserDepth']);
    id(item.id, `${path}.id`);
    if (normalizeRepositoryRelativePath(item.filePath, `${path}.filePath`) !== targetPath) {
        fail(`${path}.filePath`, 'must match target.path');
    }
    if (item.packageKey !== null)
        importTarget(item.packageKey, `${path}.packageKey`);
    if (item.serviceKey !== null)
        importTarget(item.serviceKey, `${path}.serviceKey`);
    enumeration(item.parserDepth, `${path}.parserDepth`, PARSER_DEPTHS);
}
function validateCompleteness(value, path) {
    const completeness = record(value, path, ['facts', 'policies']);
    const seenFacts = new Set();
    const factStatuses = new Map();
    array(completeness.facts, `${path}.facts`, FACT_FAMILIES.length).forEach((value, index) => {
        const itemPath = `${path}.facts[${index}]`;
        const item = record(value, itemPath, ['fact', 'status', 'reasons']);
        const fact = enumeration(item.fact, `${itemPath}.fact`, FACT_FAMILIES);
        if (seenFacts.has(fact))
            fail(`${itemPath}.fact`, 'duplicate fact family');
        seenFacts.add(fact);
        const status = enumeration(item.status, `${itemPath}.status`, ['complete', 'partial', 'unavailable']);
        factStatuses.set(fact, status);
        validateStringArray(item.reasons, `${itemPath}.reasons`, sourceFreeMetadata, 64);
    });
    const seenPolicies = new Set();
    array(completeness.policies, `${path}.policies`, POLICY_FAMILIES.length).forEach((value, index) => {
        const itemPath = `${path}.policies[${index}]`;
        const item = record(value, itemPath, ['family', 'status', 'requiredFacts', 'missingFacts', 'reasons']);
        const family = enumeration(item.family, `${itemPath}.family`, POLICY_FAMILIES);
        if (seenPolicies.has(family))
            fail(`${itemPath}.family`, 'duplicate policy family');
        seenPolicies.add(family);
        enumeration(item.status, `${itemPath}.status`, ['complete', 'partial', 'unavailable']);
        validateStringArray(item.requiredFacts, `${itemPath}.requiredFacts`, (entry, entryPath) => enumeration(entry, entryPath, FACT_FAMILIES), FACT_FAMILIES.length);
        validateStringArray(item.missingFacts, `${itemPath}.missingFacts`, (entry, entryPath) => enumeration(entry, entryPath, FACT_FAMILIES), FACT_FAMILIES.length);
        validateStringArray(item.reasons, `${itemPath}.reasons`, sourceFreeMetadata, 64);
    });
    return factStatuses;
}
function deriveTrustedHostPosture(adapterId, timing) {
    const timingAllowed = adapterId === 'github-action'
        ? timing === 'ci'
        : adapterId === 'vscode-extension'
            ? timing === 'after_write'
            : adapterId === 'claude-code-hooks' || adapterId === 'copilot-hooks' || adapterId === 'codex-hooks'
                ? timing === 'before_write'
                : adapterId === 'neurcode-cli'
                    ? timing === 'before_write' || timing === 'after_write'
                    : timing !== 'ci';
    if (!timingAllowed) {
        throw new Error(`Invalid trusted host timing: ${adapterId} cannot claim ${timing}`);
    }
    let capability;
    if (timing === 'after_write')
        capability = 'post_write';
    else if (timing === 'ci' || adapterId === 'github-action')
        capability = 'ci_only';
    else if (adapterId === 'claude-code-hooks' || adapterId === 'copilot-hooks' || adapterId === 'codex-hooks')
        capability = 'hard_prewrite';
    else if (adapterId === 'cursor-mcp')
        capability = 'supervised_write';
    else if (adapterId === 'codex-mcp' || adapterId === 'generic-mcp')
        capability = 'cooperative_prewrite';
    else if (adapterId === 'vscode-extension')
        capability = 'post_write';
    else if (adapterId === 'neurcode-cli')
        capability = 'not_supported';
    else
        capability = 'not_supported';
    const decisionBinding = capability === 'hard_prewrite'
        ? 'host_enforced'
        : capability === 'cooperative_prewrite' || capability === 'supervised_write'
            ? 'cooperative'
            : 'observed';
    return { adapterId, capability, timing, decisionBinding };
}
function validateEnvelope(value) {
    assertPayloadBudget(value);
    const envelope = record(value, 'envelope', [
        'schemaVersion', 'repository', 'target', 'content', 'facts', 'host', 'session', 'privacy',
    ]);
    if (envelope.schemaVersion !== repo_intelligence_v2_1.PROPOSED_CHANGE_ENVELOPE_SCHEMA_VERSION) {
        fail('envelope.schemaVersion', `unsupported schema ${String(envelope.schemaVersion)}`);
    }
    const repository = record(envelope.repository, 'envelope.repository', ['repoId', 'rootHash', 'remoteHash', 'headSha']);
    id(repository.repoId, 'envelope.repository.repoId');
    hash(repository.rootHash, 'envelope.repository.rootHash');
    nullableHash(repository.remoteHash, 'envelope.repository.remoteHash');
    if (repository.headSha !== null)
        string(repository.headSha, 'envelope.repository.headSha', 64, GIT_SHA_PATTERN);
    const target = record(envelope.target, 'envelope.target', ['path', 'previousPath', 'operation', 'language']);
    const targetPath = normalizeRepositoryRelativePath(target.path, 'envelope.target.path');
    const previousPath = nullablePath(target.previousPath, 'envelope.target.previousPath');
    const operation = enumeration(target.operation, 'envelope.target.operation', ['create', 'update', 'delete', 'rename']);
    enumeration(target.language, 'envelope.target.language', LANGUAGES);
    if (operation === 'rename' && (!previousPath || previousPath === targetPath)) {
        fail('envelope.target.previousPath', 'rename requires a distinct previousPath');
    }
    if (operation !== 'rename' && previousPath !== null) {
        fail('envelope.target.previousPath', 'is only valid for rename operations');
    }
    const content = record(envelope.content, 'envelope.content', [
        'present', 'availabilityReason', 'contentHash', 'rawRetained',
    ]);
    const contentPresent = boolean(content.present, 'envelope.content.present');
    const availabilityReason = enumeration(content.availabilityReason, 'envelope.content.availabilityReason', [
        'host_supplied', 'path_only_contract', 'post_write_disk_read', 'delete_operation', 'unsupported_host',
    ]);
    const contentHash = nullableHash(content.contentHash, 'envelope.content.contentHash');
    if (content.rawRetained !== false)
        fail('envelope.content.rawRetained', 'must be false');
    if (contentPresent !== Boolean(contentHash)) {
        fail('envelope.content.contentHash', 'must be present exactly when content.present is true');
    }
    if (contentPresent && !['host_supplied', 'post_write_disk_read'].includes(availabilityReason)) {
        fail('envelope.content.availabilityReason', 'is inconsistent with present content');
    }
    if (!contentPresent && ['host_supplied', 'post_write_disk_read'].includes(availabilityReason)) {
        fail('envelope.content.availabilityReason', 'is inconsistent with absent content');
    }
    if (operation === 'delete' && (contentPresent || availabilityReason !== 'delete_operation')) {
        fail('envelope.content', 'delete operations cannot claim proposed content');
    }
    const facts = record(envelope.facts, 'envelope.facts', [
        'symbols', 'imports', 'exports', 'relationships', 'references', 'calls', 'boundaries',
        'parserDepth', 'extractionErrors', 'limitations', 'completeness',
    ], ['symbols', 'imports', 'exports', 'relationships', 'parserDepth', 'extractionErrors']);
    const factArrays = {
        symbols: array(facts.symbols, 'envelope.facts.symbols'),
        imports: array(facts.imports, 'envelope.facts.imports'),
        exports: array(facts.exports, 'envelope.facts.exports'),
        relationships: array(facts.relationships, 'envelope.facts.relationships'),
        references: facts.references === undefined ? [] : array(facts.references, 'envelope.facts.references'),
        calls: facts.calls === undefined ? [] : array(facts.calls, 'envelope.facts.calls'),
        boundaries: facts.boundaries === undefined ? [] : array(facts.boundaries, 'envelope.facts.boundaries'),
    };
    factArrays.symbols.forEach((item, index) => validateSymbol(item, `envelope.facts.symbols[${index}]`, targetPath));
    factArrays.imports.forEach((item, index) => validateImport(item, `envelope.facts.imports[${index}]`, targetPath));
    factArrays.exports.forEach((item, index) => validateExport(item, `envelope.facts.exports[${index}]`, targetPath));
    factArrays.relationships.forEach((item, index) => validateRelationship(item, `envelope.facts.relationships[${index}]`));
    factArrays.references.forEach((item, index) => validateReference(item, `envelope.facts.references[${index}]`, targetPath));
    factArrays.calls.forEach((item, index) => validateCall(item, `envelope.facts.calls[${index}]`, targetPath));
    factArrays.boundaries.forEach((item, index) => validateBoundary(item, `envelope.facts.boundaries[${index}]`, targetPath));
    enumeration(facts.parserDepth, 'envelope.facts.parserDepth', PARSER_DEPTHS);
    validateStringArray(facts.extractionErrors, 'envelope.facts.extractionErrors', sourceFreeMetadata, 64);
    if (facts.limitations !== undefined) {
        validateStringArray(facts.limitations, 'envelope.facts.limitations', sourceFreeMetadata, 64);
    }
    const factStatuses = facts.completeness === undefined
        ? null
        : validateCompleteness(facts.completeness, 'envelope.facts.completeness');
    if (!contentPresent && Object.values(factArrays).some((items) => items.length > 0)) {
        fail('envelope.facts', 'absent proposed content cannot carry proposed source facts');
    }
    if (factStatuses) {
        const complete = (family) => factStatuses.get(family) === 'complete';
        const ast = facts.parserDepth === 'ast' || facts.parserDepth === 'syntax_tree';
        const extractionErrors = facts.extractionErrors;
        for (const family of ['symbol', 'import', 'reference', 'call', 'package', 'service']) {
            if (complete(family) && (!contentPresent || !ast || extractionErrors.length > 0)) {
                fail(`envelope.facts.completeness.${family}`, 'cannot be complete for absent, degraded, or failed extraction');
            }
        }
        if (complete('import')) {
            if (facts.imports === undefined || factArrays.imports.some((item) => {
                const resolution = item.resolution;
                return !['resolved_repository', 'external_package'].includes(String(resolution));
            })) {
                fail('envelope.facts.completeness.import', 'cannot be complete with unresolved proposed imports');
            }
        }
        if (complete('call')) {
            if (facts.calls === undefined || factArrays.calls.some((item) => !['local_symbol', 'imported_symbol', 'repository_symbol'].includes(String(item.resolution)))) {
                fail('envelope.facts.completeness.call', 'cannot be complete with unresolved proposed calls');
            }
        }
        if (complete('reference')) {
            if (facts.references === undefined || factArrays.references.some((item) => !['local_symbol', 'imported_symbol', 'repository_symbol'].includes(String(item.resolution)))) {
                fail('envelope.facts.completeness.reference', 'cannot be complete with unresolved proposed references');
            }
        }
    }
    const host = record(envelope.host, 'envelope.host', ['adapterId', 'capability', 'timing', 'decisionBinding']);
    enumeration(host.adapterId, 'envelope.host.adapterId', ADAPTERS);
    enumeration(host.capability, 'envelope.host.capability', [
        'hard_prewrite', 'cooperative_prewrite', 'supervised_write', 'post_write', 'ci_only', 'not_supported',
    ]);
    enumeration(host.timing, 'envelope.host.timing', ['before_write', 'during_write', 'after_write', 'ci']);
    enumeration(host.decisionBinding, 'envelope.host.decisionBinding', ['host_enforced', 'cooperative', 'observed']);
    const session = record(envelope.session, 'envelope.session', ['sessionId', 'planRevision']);
    if (session.sessionId !== null)
        id(session.sessionId, 'envelope.session.sessionId');
    nullableInteger(session.planRevision, 'envelope.session.planRevision', 0, 10_000_000);
    const privacy = record(envelope.privacy, 'envelope.privacy', [
        'sourceUploaded', 'sourceStored', 'diffUploaded', 'promptUploaded', 'chatUploaded', 'rawContentRetained',
    ]);
    for (const key of Object.keys(privacy)) {
        if (privacy[key] !== false)
            fail(`envelope.privacy.${key}`, 'must be false');
    }
    return JSON.parse(JSON.stringify(value));
}
function validateProposedChangeEnvelope(value) {
    const envelope = validateEnvelope(value);
    const expected = deriveTrustedHostPosture(envelope.host.adapterId, envelope.host.timing);
    if (expected.capability !== envelope.host.capability
        || expected.decisionBinding !== envelope.host.decisionBinding) {
        fail('envelope.host', 'capability, timing, and decisionBinding are inconsistent');
    }
    return envelope;
}
function validateAndBindProposedChangeEnvelope(value, context) {
    const envelope = validateEnvelope(value);
    const trustedPath = normalizeRepositoryRelativePath(context.targetPath, 'trustedContext.targetPath');
    if (envelope.target.path !== trustedPath)
        fail('envelope.target.path', 'does not match trusted event path');
    if (context.operation !== undefined && envelope.target.operation !== context.operation) {
        fail('envelope.target.operation', 'does not match trusted operation');
    }
    if (Object.prototype.hasOwnProperty.call(context, 'previousPath')
        && envelope.target.previousPath !== context.previousPath) {
        fail('envelope.target.previousPath', 'does not match trusted previous path');
    }
    const effectiveHost = deriveTrustedHostPosture(context.adapterId, context.timing);
    if (envelope.host.adapterId !== effectiveHost.adapterId
        || envelope.host.capability !== effectiveHost.capability
        || envelope.host.timing !== effectiveHost.timing
        || envelope.host.decisionBinding !== effectiveHost.decisionBinding) {
        fail('envelope.host', 'caller host posture conflicts with trusted ingress');
    }
    if (Object.prototype.hasOwnProperty.call(context, 'expectedContentHash')
        && envelope.content.contentHash !== context.expectedContentHash) {
        fail('envelope.content.contentHash', 'does not match trusted proposed content');
    }
    for (const [key, expected] of Object.entries(context.repository ?? {})) {
        if (expected !== undefined && envelope.repository[key] !== expected) {
            fail(`envelope.repository.${key}`, 'does not match trusted repository context');
        }
    }
    for (const [key, expected] of Object.entries(context.session ?? {})) {
        if (expected !== undefined && envelope.session[key] !== expected) {
            fail(`envelope.session.${key}`, 'does not match trusted session context');
        }
    }
    return { ...envelope, host: effectiveHost };
}
//# sourceMappingURL=proposed-change-validation.js.map