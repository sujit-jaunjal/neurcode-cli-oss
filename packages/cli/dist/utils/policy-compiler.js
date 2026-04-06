"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCompiledPolicyArtifact = buildCompiledPolicyArtifact;
exports.resolveCompiledPolicyPath = resolveCompiledPolicyPath;
exports.writeCompiledPolicyArtifact = writeCompiledPolicyArtifact;
exports.readCompiledPolicyArtifact = readCompiledPolicyArtifact;
exports.hydrateCompiledPolicyRules = hydrateCompiledPolicyRules;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
function normalizeForHash(value) {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => normalizeForHash(item));
    }
    const record = value;
    const out = {};
    for (const key of Object.keys(record).sort()) {
        out[key] = normalizeForHash(record[key]);
    }
    return out;
}
function sha256Hex(input) {
    return (0, crypto_1.createHash)('sha256').update(input, 'utf-8').digest('hex');
}
function fingerprintCompiledPolicy(value) {
    return sha256Hex(JSON.stringify(normalizeForHash(value)));
}
function serializeDeterministicRule(rule) {
    return {
        id: rule.id,
        source: rule.source,
        statement: rule.statement,
        displayName: rule.displayName,
        matchToken: rule.matchToken,
        pattern: {
            source: rule.pattern.source,
            flags: rule.pattern.flags,
        },
        ...(Array.isArray(rule.pathIncludePatterns) && rule.pathIncludePatterns.length > 0
            ? { pathIncludePatterns: [...rule.pathIncludePatterns] }
            : {}),
        ...(Array.isArray(rule.pathExcludePatterns) && rule.pathExcludePatterns.length > 0
            ? { pathExcludePatterns: [...rule.pathExcludePatterns] }
            : {}),
        ...(typeof rule.maxMatchesPerFile === 'number' && Number.isFinite(rule.maxMatchesPerFile)
            ? { maxMatchesPerFile: rule.maxMatchesPerFile }
            : {}),
        ...(typeof rule.minMatchesPerFile === 'number' && Number.isFinite(rule.minMatchesPerFile)
            ? { minMatchesPerFile: rule.minMatchesPerFile }
            : {}),
        ...(rule.evaluationMode ? { evaluationMode: rule.evaluationMode } : {}),
        ...(rule.evaluationScope ? { evaluationScope: rule.evaluationScope } : {}),
    };
}
function compilePathPatterns(patterns) {
    if (!Array.isArray(patterns) || patterns.length === 0) {
        return undefined;
    }
    const next = [];
    for (const pattern of patterns) {
        try {
            const escaped = pattern
                .split('*')
                .map((segment) => segment.replace(/[.+^${}()|[\]\\]/g, '\\$&'))
                .join('.*');
            next.push(new RegExp(`^${escaped}$`, 'i'));
        }
        catch {
            // Ignore invalid scope pattern.
        }
    }
    return next.length > 0 ? next : undefined;
}
function hydrateDeterministicRule(record) {
    try {
        const pathIncludes = compilePathPatterns(record.pathIncludePatterns);
        const pathExcludes = compilePathPatterns(record.pathExcludePatterns);
        return {
            id: record.id,
            source: record.source,
            statement: record.statement,
            displayName: record.displayName,
            matchToken: record.matchToken,
            pattern: new RegExp(record.pattern.source, record.pattern.flags),
            ...(Array.isArray(record.pathIncludePatterns) && record.pathIncludePatterns.length > 0
                ? { pathIncludePatterns: [...record.pathIncludePatterns] }
                : {}),
            ...(Array.isArray(record.pathExcludePatterns) && record.pathExcludePatterns.length > 0
                ? { pathExcludePatterns: [...record.pathExcludePatterns] }
                : {}),
            ...(pathIncludes ? { pathIncludes } : {}),
            ...(pathExcludes ? { pathExcludes } : {}),
            ...(typeof record.maxMatchesPerFile === 'number' && Number.isFinite(record.maxMatchesPerFile)
                ? { maxMatchesPerFile: record.maxMatchesPerFile }
                : {}),
            ...(typeof record.minMatchesPerFile === 'number' && Number.isFinite(record.minMatchesPerFile)
                ? { minMatchesPerFile: record.minMatchesPerFile }
                : {}),
            ...(record.evaluationMode ? { evaluationMode: record.evaluationMode } : {}),
            ...(record.evaluationScope ? { evaluationScope: record.evaluationScope } : {}),
        };
    }
    catch {
        return null;
    }
}
function isCompiledPolicyArtifact(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const record = value;
    if (record.schemaVersion !== 1) {
        return false;
    }
    if (typeof record.generatedAt !== 'string' || typeof record.fingerprint !== 'string') {
        return false;
    }
    if (!record.source || typeof record.source !== 'object' || Array.isArray(record.source)) {
        return false;
    }
    if (!record.statements || typeof record.statements !== 'object' || Array.isArray(record.statements)) {
        return false;
    }
    if (!record.compilation || typeof record.compilation !== 'object' || Array.isArray(record.compilation)) {
        return false;
    }
    if (record.signature !== undefined) {
        if (!record.signature || typeof record.signature !== 'object' || Array.isArray(record.signature)) {
            return false;
        }
        const signature = record.signature;
        if (signature.algorithm !== 'hmac-sha256' ||
            typeof signature.signedAt !== 'string' ||
            typeof signature.payloadHash !== 'string' ||
            typeof signature.value !== 'string') {
            return false;
        }
        if (signature.keyId !== null && signature.keyId !== undefined && typeof signature.keyId !== 'string') {
            return false;
        }
    }
    return true;
}
function buildCompiledPolicyArtifact(input) {
    const compiled = (0, governance_runtime_1.compileDeterministicConstraints)({
        intentConstraints: input.intentConstraints,
        policyRules: input.policyRules,
    });
    const deterministicRules = compiled.rules.map(serializeDeterministicRule);
    const artifactWithoutFingerprint = {
        schemaVersion: 1,
        generatedAt: input.generatedAt || new Date().toISOString(),
        source: {
            includeDashboardPolicies: input.includeDashboardPolicies,
            policyLockPath: input.policyLockPath,
            policyLockFingerprint: input.policyLockFingerprint,
            policyPack: input.policyPack,
            defaultRuleCount: input.defaultRuleCount,
            policyPackRuleCount: input.policyPackRuleCount,
            customRuleCount: input.customRuleCount,
            effectiveRuleCount: input.effectiveRuleCount,
        },
        statements: {
            intentConstraints: input.intentConstraints?.trim() ? input.intentConstraints.trim() : null,
            policyRules: [...input.policyRules],
        },
        compilation: {
            deterministicRuleCount: deterministicRules.length,
            unmatchedStatements: [...compiled.unmatchedStatements],
            deterministicRules,
        },
    };
    return {
        ...artifactWithoutFingerprint,
        fingerprint: fingerprintCompiledPolicy(artifactWithoutFingerprint),
    };
}
function resolveCompiledPolicyPath(projectRoot, outputPath) {
    const target = outputPath && outputPath.trim().length > 0 ? outputPath.trim() : 'neurcode.policy.compiled.json';
    return (0, path_1.resolve)(projectRoot, target);
}
function writeCompiledPolicyArtifact(projectRoot, artifact, outputPath) {
    const path = resolveCompiledPolicyPath(projectRoot, outputPath);
    const dir = (0, path_1.dirname)(path);
    if (!(0, fs_1.existsSync)(dir)) {
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    }
    (0, fs_1.writeFileSync)(path, `${JSON.stringify(artifact, null, 2)}\n`, 'utf-8');
    return path;
}
function readCompiledPolicyArtifact(projectRoot, inputPath) {
    const path = resolveCompiledPolicyPath(projectRoot, inputPath);
    if (!(0, fs_1.existsSync)(path)) {
        return { path, exists: false, artifact: null };
    }
    try {
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!isCompiledPolicyArtifact(parsed)) {
            return {
                path,
                exists: true,
                artifact: null,
                error: 'Invalid compiled policy schema',
            };
        }
        return {
            path,
            exists: true,
            artifact: parsed,
        };
    }
    catch (error) {
        return {
            path,
            exists: true,
            artifact: null,
            error: error instanceof Error ? error.message : 'Failed to parse compiled policy artifact',
        };
    }
}
function hydrateCompiledPolicyRules(artifact) {
    const hydrated = [];
    for (const record of artifact.compilation.deterministicRules) {
        const rule = hydrateDeterministicRule(record);
        if (rule) {
            hydrated.push(rule);
        }
    }
    return hydrated;
}
//# sourceMappingURL=policy-compiler.js.map