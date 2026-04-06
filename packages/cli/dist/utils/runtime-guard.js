"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRuntimeGuardPath = resolveRuntimeGuardPath;
exports.createRuntimeGuardArtifact = createRuntimeGuardArtifact;
exports.writeRuntimeGuardArtifact = writeRuntimeGuardArtifact;
exports.readRuntimeGuardArtifact = readRuntimeGuardArtifact;
exports.evaluateRuntimeGuardArtifact = evaluateRuntimeGuardArtifact;
exports.withRuntimeGuardCheckStats = withRuntimeGuardCheckStats;
exports.markRuntimeGuardStopped = markRuntimeGuardStopped;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
function normalizeRepoPath(value) {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function uniqueSorted(values) {
    const set = new Set();
    for (const value of values) {
        const normalized = normalizeRepoPath(value);
        if (normalized) {
            set.add(normalized);
        }
    }
    return [...set].sort((left, right) => left.localeCompare(right));
}
function sha256Hex(input) {
    return (0, crypto_1.createHash)('sha256').update(input, 'utf-8').digest('hex');
}
function expectedFilesFingerprint(files) {
    return sha256Hex(JSON.stringify(uniqueSorted(files)));
}
function serializeRule(rule) {
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
            // Ignore malformed scope pattern.
        }
    }
    return next.length > 0 ? next : undefined;
}
function hydrateRule(rule) {
    try {
        const pathIncludes = compilePathPatterns(rule.pathIncludePatterns);
        const pathExcludes = compilePathPatterns(rule.pathExcludePatterns);
        return {
            id: rule.id,
            source: rule.source,
            statement: rule.statement,
            displayName: rule.displayName,
            matchToken: rule.matchToken,
            pattern: new RegExp(rule.pattern.source, rule.pattern.flags),
            ...(Array.isArray(rule.pathIncludePatterns) && rule.pathIncludePatterns.length > 0
                ? { pathIncludePatterns: [...rule.pathIncludePatterns] }
                : {}),
            ...(Array.isArray(rule.pathExcludePatterns) && rule.pathExcludePatterns.length > 0
                ? { pathExcludePatterns: [...rule.pathExcludePatterns] }
                : {}),
            ...(pathIncludes ? { pathIncludes } : {}),
            ...(pathExcludes ? { pathExcludes } : {}),
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
    catch {
        return null;
    }
}
function asObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value;
}
function isRuntimeGuardArtifact(value) {
    const record = asObject(value);
    if (!record)
        return false;
    if (record.schemaVersion !== 1)
        return false;
    if (typeof record.guardId !== 'string' || !record.guardId.trim())
        return false;
    if (typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string')
        return false;
    if (record.archivedAt !== null && record.archivedAt !== undefined && typeof record.archivedAt !== 'string') {
        return false;
    }
    if (typeof record.active !== 'boolean')
        return false;
    if (record.mode !== 'strict' && record.mode !== 'advisory')
        return false;
    if (!Array.isArray(record.expectedFiles) || typeof record.expectedFilesFingerprint !== 'string')
        return false;
    if (!asObject(record.source))
        return false;
    if (!asObject(record.deterministic))
        return false;
    if (!asObject(record.stats))
        return false;
    return true;
}
function mapDiffFilesToPlanFiles(diffFiles) {
    return diffFiles.map((file) => ({
        path: file.path,
        oldPath: file.oldPath,
        changeType: file.changeType,
        added: file.addedLines,
        removed: file.removedLines,
        hunks: file.hunks.map((hunk) => ({
            oldStart: hunk.oldStart,
            oldLines: hunk.oldLines,
            newStart: hunk.newStart,
            newLines: hunk.newLines,
            lines: hunk.lines.map((line) => ({
                type: line.type,
                content: line.content,
                lineNumber: line.lineNumber,
            })),
        })),
    }));
}
function resolveRuntimeGuardPath(projectRoot, inputPath) {
    const target = inputPath && inputPath.trim() ? inputPath.trim() : '.neurcode/runtime-guard.json';
    return (0, path_1.resolve)(projectRoot, target);
}
function createRuntimeGuardArtifact(input) {
    const generatedAt = new Date().toISOString();
    const normalizedExpectedFiles = uniqueSorted(input.expectedFiles);
    const deterministicRules = input.deterministicRules.map((rule) => serializeRule(rule));
    const guardId = sha256Hex(JSON.stringify({
        random: (0, crypto_1.randomUUID)(),
        generatedAt,
        mode: input.mode,
        planId: input.planId || null,
        expectedFilesFingerprint: expectedFilesFingerprint(normalizedExpectedFiles),
        compiledPolicyFingerprint: input.compiledPolicyFingerprint || null,
    }));
    return {
        schemaVersion: 1,
        guardId,
        createdAt: generatedAt,
        updatedAt: generatedAt,
        archivedAt: null,
        active: true,
        mode: input.mode,
        source: {
            planId: input.planId || null,
            sessionId: input.sessionId || null,
            projectId: input.projectId || null,
            changeContractPath: input.changeContractPath || null,
            changeContractId: input.changeContractId || null,
            changeContractExpectedFilesFingerprint: input.changeContractExpectedFilesFingerprint || null,
            compiledPolicyPath: input.compiledPolicyPath || null,
            compiledPolicyFingerprint: input.compiledPolicyFingerprint || null,
        },
        expectedFiles: normalizedExpectedFiles,
        expectedFilesFingerprint: expectedFilesFingerprint(normalizedExpectedFiles),
        deterministic: {
            ruleCount: deterministicRules.length,
            unmatchedStatements: uniqueSorted((input.unmatchedStatements || []).filter(Boolean)),
            rules: deterministicRules,
        },
        stats: {
            checksRun: 0,
            blockedChecks: 0,
            lastCheckedAt: null,
        },
    };
}
function writeRuntimeGuardArtifact(projectRoot, artifact, outputPath) {
    const path = resolveRuntimeGuardPath(projectRoot, outputPath);
    const dir = (0, path_1.dirname)(path);
    if (!(0, fs_1.existsSync)(dir)) {
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    }
    (0, fs_1.writeFileSync)(path, `${JSON.stringify(artifact, null, 2)}\n`, 'utf-8');
    return path;
}
function readRuntimeGuardArtifact(projectRoot, inputPath) {
    const path = resolveRuntimeGuardPath(projectRoot, inputPath);
    if (!(0, fs_1.existsSync)(path)) {
        return {
            path,
            exists: false,
            artifact: null,
        };
    }
    try {
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!isRuntimeGuardArtifact(parsed)) {
            return {
                path,
                exists: true,
                artifact: null,
                error: 'Invalid runtime guard schema',
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
            error: error instanceof Error ? error.message : 'Failed to parse runtime guard artifact',
        };
    }
}
function evaluateRuntimeGuardArtifact(artifact, diffFiles, fileContents) {
    const changedFiles = uniqueSorted(diffFiles.map((file) => file.path));
    if (!artifact.active) {
        const message = 'Runtime guard is inactive. Run `neurcode guard start` before generation.';
        return {
            pass: false,
            changedFiles,
            outOfScopeFiles: [],
            constraintViolations: [],
            adherenceScore: 0,
            plannedFilesModified: 0,
            totalPlannedFiles: artifact.expectedFiles.length,
            violations: [
                {
                    code: 'RUNTIME_GUARD_INACTIVE',
                    message,
                },
            ],
        };
    }
    const deterministicRules = [];
    for (const rule of artifact.deterministic.rules) {
        const hydrated = hydrateRule(rule);
        if (hydrated) {
            deterministicRules.push(hydrated);
        }
    }
    const evaluation = (0, governance_runtime_1.evaluatePlanVerification)({
        planFiles: artifact.expectedFiles.map((path) => ({ path, action: 'MODIFY' })),
        changedFiles: mapDiffFilesToPlanFiles(diffFiles),
        extraConstraintRules: deterministicRules,
        fileContents,
    });
    const violations = [];
    for (const file of evaluation.bloatFiles) {
        violations.push({
            code: 'RUNTIME_GUARD_UNEXPECTED_FILE',
            file,
            message: `File changed outside runtime guard scope: ${file}`,
        });
    }
    for (const message of evaluation.constraintViolations) {
        violations.push({
            code: 'RUNTIME_GUARD_CONSTRAINT_VIOLATION',
            message,
        });
    }
    return {
        pass: violations.length === 0,
        changedFiles,
        outOfScopeFiles: [...evaluation.bloatFiles],
        constraintViolations: [...evaluation.constraintViolations],
        adherenceScore: evaluation.adherenceScore,
        plannedFilesModified: evaluation.plannedFilesModified,
        totalPlannedFiles: evaluation.totalPlannedFiles,
        violations,
    };
}
function withRuntimeGuardCheckStats(artifact, input) {
    return {
        ...artifact,
        updatedAt: input.checkedAt || new Date().toISOString(),
        stats: {
            checksRun: Math.max(0, Math.floor(artifact.stats.checksRun || 0)) + 1,
            blockedChecks: Math.max(0, Math.floor(artifact.stats.blockedChecks || 0)) + (input.blocked ? 1 : 0),
            lastCheckedAt: input.checkedAt || new Date().toISOString(),
        },
    };
}
function markRuntimeGuardStopped(artifact, stoppedAt) {
    const timestamp = stoppedAt || new Date().toISOString();
    return {
        ...artifact,
        active: false,
        archivedAt: timestamp,
        updatedAt: timestamp,
    };
}
//# sourceMappingURL=runtime-guard.js.map