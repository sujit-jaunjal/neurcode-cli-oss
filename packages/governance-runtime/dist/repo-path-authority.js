"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCanonicalRepoRoot = resolveCanonicalRepoRoot;
exports.validateRepoGlob = validateRepoGlob;
exports.validateRepoFilePath = validateRepoFilePath;
exports.assertRepoFilePath = assertRepoFilePath;
exports.assertRepoGlob = assertRepoGlob;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const intent_privacy_1 = require("./intent-privacy");
function uniqueSorted(values) {
    return [...new Set(values)].sort();
}
function safeRealpath(pathValue) {
    try {
        return (0, node_fs_1.realpathSync)(pathValue);
    }
    catch {
        return null;
    }
}
function resolveThroughExistingAncestor(pathValue) {
    const absolute = (0, node_path_1.resolve)(pathValue);
    let current = absolute;
    while (true) {
        const real = safeRealpath(current);
        if (real)
            return real;
        const parent = (0, node_path_1.resolve)(current, '..');
        if (parent === current)
            return absolute;
        current = parent;
    }
}
function resolveCanonicalRepoRoot(repoRoot) {
    const resolved = (0, node_path_1.resolve)(repoRoot);
    return safeRealpath(resolved) || resolved;
}
function assertInsideRepository(repoRoot, concreteRelative) {
    const reasons = [];
    const physicalRepo = resolveCanonicalRepoRoot(repoRoot);
    const physicalCandidate = resolveThroughExistingAncestor((0, node_path_1.join)(repoRoot, concreteRelative || '.'));
    const physicalRelative = (0, node_path_1.relative)(physicalRepo, physicalCandidate);
    if (physicalRelative === '..' || physicalRelative.startsWith(`..${node_path_1.sep}`) || (0, node_path_1.isAbsolute)(physicalRelative)) {
        reasons.push('symlink_escape');
    }
    const repoRelative = (0, node_path_1.relative)(physicalRepo, physicalCandidate).replace(/\\/g, '/');
    if (repoRelative === '..' || repoRelative.startsWith('../')) {
        reasons.push('outside_repository');
    }
    return reasons;
}
function normalizeIngressPath(rawPath) {
    return rawPath.trim().replace(/\\/g, '/');
}
function isWindowsDrivePath(pathValue) {
    return /^[A-Za-z]:/.test(pathValue);
}
function isUncPath(pathValue) {
    return pathValue.startsWith('//');
}
function isForeignAbsolutePath(pathValue) {
    return isWindowsDrivePath(pathValue) || isUncPath(pathValue);
}
function rejectForeignAbsoluteOnHost(pathValue, kind) {
    if (process.platform === 'win32')
        return null;
    if (isWindowsDrivePath(pathValue)) {
        return {
            ok: false,
            path: null,
            kind,
            reasonCodes: ['windows_absolute_path_rejected'],
        };
    }
    if (isUncPath(pathValue)) {
        return {
            ok: false,
            path: null,
            kind,
            reasonCodes: ['unc_path_rejected'],
        };
    }
    return null;
}
function validateRepoRelativeFilePath(repoRoot, repoRelative, options = {}) {
    const sanitized = (0, intent_privacy_1.sanitizeRepoRelativePath)(repoRelative, { allowGlobs: false });
    if (!sanitized.path) {
        return {
            ok: false,
            path: null,
            kind: 'file',
            reasonCodes: uniqueSorted(sanitized.reasonCodes),
        };
    }
    const escapeReasons = assertInsideRepository(repoRoot, sanitized.path);
    if (escapeReasons.length > 0) {
        return { ok: false, path: null, kind: 'file', reasonCodes: escapeReasons };
    }
    if (!options.allowPlannedMissing) {
        const absolute = (0, node_path_1.join)(repoRoot, sanitized.path);
        if (!(0, node_fs_1.existsSync)(absolute)) {
            // Planned paths are allowed when explicitly requested.
        }
    }
    return { ok: true, path: sanitized.path, kind: 'file', reasonCodes: [] };
}
function canonicalizeAbsoluteInsideRepo(repoRoot, absolutePath, options = {}) {
    const normalized = normalizeIngressPath(absolutePath);
    const foreign = rejectForeignAbsoluteOnHost(normalized, 'file');
    if (foreign)
        return foreign;
    if ((0, intent_privacy_1.detectCredentialText)(normalized, 10_000).detected) {
        return { ok: false, path: null, kind: null, reasonCodes: ['credential_shaped_path'] };
    }
    let absRepo;
    try {
        absRepo = (0, node_fs_1.realpathSync)(repoRoot);
    }
    catch {
        absRepo = (0, node_path_1.resolve)(repoRoot);
    }
    const isGlob = normalized.includes('*') || normalized.includes('?');
    if (isGlob) {
        const firstWildcard = normalized.search(/[*?]/);
        const concretePrefix = normalized.slice(0, firstWildcard).replace(/\/$/, '');
        let absPrefix;
        if (process.platform === 'win32' && isWindowsDrivePath(concretePrefix)) {
            try {
                absPrefix = concretePrefix ? (0, node_fs_1.realpathSync)(concretePrefix) : absRepo;
            }
            catch {
                absPrefix = node_path_1.win32.resolve(concretePrefix || repoRoot);
            }
        }
        else {
            try {
                absPrefix = concretePrefix ? (0, node_fs_1.realpathSync)(concretePrefix) : absRepo;
            }
            catch {
                absPrefix = (0, node_path_1.resolve)(concretePrefix || repoRoot);
            }
        }
        if (!absPrefix.startsWith(absRepo + node_path_1.sep) && absPrefix !== absRepo) {
            return { ok: false, path: null, kind: 'glob', reasonCodes: ['outside_repository', 'glob_absolute_rejected'] };
        }
        const suffix = normalized.slice(firstWildcard);
        const repoRelative = (0, node_path_1.relative)(absRepo, absPrefix).replace(/\\/g, '/');
        const globPath = repoRelative === '' || repoRelative === '.'
            ? suffix.replace(/^\//, '')
            : `${repoRelative}/${suffix}`.replace(/\/+/g, '/');
        return validateRepoGlob(repoRoot, globPath);
    }
    let absTarget;
    if (process.platform === 'win32' && isWindowsDrivePath(normalized)) {
        try {
            absTarget = (0, node_fs_1.existsSync)(normalized) ? (0, node_fs_1.realpathSync)(normalized) : node_path_1.win32.resolve(normalized);
        }
        catch {
            absTarget = node_path_1.win32.resolve(normalized);
        }
    }
    else {
        try {
            absTarget = (0, node_fs_1.existsSync)(normalized) ? (0, node_fs_1.realpathSync)(normalized) : (0, node_path_1.resolve)(normalized);
        }
        catch {
            absTarget = (0, node_path_1.resolve)(normalized);
        }
    }
    if (!absTarget.startsWith(absRepo + node_path_1.sep) && absTarget !== absRepo) {
        return { ok: false, path: null, kind: 'file', reasonCodes: ['outside_repository'] };
    }
    const repoRelative = (0, node_path_1.relative)(absRepo, absTarget).replace(/\\/g, '/');
    return validateRepoRelativeFilePath(repoRoot, repoRelative, options);
}
function validateRepoGlob(repoRoot, rawGlob) {
    const trimmed = normalizeIngressPath(rawGlob);
    if (!trimmed) {
        return { ok: false, path: null, kind: null, reasonCodes: ['unsafe_path'] };
    }
    const foreign = rejectForeignAbsoluteOnHost(trimmed, 'glob');
    if (foreign)
        return foreign;
    if (trimmed.startsWith('!')) {
        return { ok: false, path: null, kind: 'glob', reasonCodes: ['glob_negation_unsupported'] };
    }
    if ((0, node_path_1.isAbsolute)(trimmed) || isForeignAbsolutePath(trimmed)) {
        return canonicalizeAbsoluteInsideRepo(repoRoot, trimmed);
    }
    const sanitized = (0, intent_privacy_1.sanitizeRepoRelativePath)(trimmed, { allowGlobs: true, requireGlob: false });
    if (!sanitized.path) {
        return {
            ok: false,
            path: null,
            kind: 'glob',
            reasonCodes: uniqueSorted(sanitized.reasonCodes),
        };
    }
    const hasGlobMeta = /[*?]/.test(sanitized.path);
    if (!hasGlobMeta) {
        return validateRepoFilePath(repoRoot, sanitized.path, { allowPlannedMissing: true });
    }
    const firstWildcard = sanitized.path.search(/[*?]/);
    const concreteRelative = sanitized.path.slice(0, firstWildcard).replace(/\/$/, '');
    const escapeReasons = assertInsideRepository(repoRoot, concreteRelative || '.');
    if (escapeReasons.length > 0) {
        return { ok: false, path: null, kind: 'glob', reasonCodes: escapeReasons };
    }
    return { ok: true, path: sanitized.path, kind: 'glob', reasonCodes: [] };
}
function validateRepoFilePath(repoRoot, rawPath, options = {}) {
    const trimmed = normalizeIngressPath(rawPath);
    if (!trimmed) {
        return { ok: false, path: null, kind: null, reasonCodes: ['unsafe_path'] };
    }
    const foreign = rejectForeignAbsoluteOnHost(trimmed, 'file');
    if (foreign)
        return foreign;
    if ((0, node_path_1.isAbsolute)(trimmed) || isForeignAbsolutePath(trimmed)) {
        return canonicalizeAbsoluteInsideRepo(repoRoot, trimmed, options);
    }
    const allowGlobs = options.allowGlobs === true;
    if (!allowGlobs && (trimmed.includes('*') || trimmed.includes('?'))) {
        return { ok: false, path: null, kind: 'file', reasonCodes: ['unsafe_path'] };
    }
    if (allowGlobs && (trimmed.includes('*') || trimmed.includes('?'))) {
        return validateRepoGlob(repoRoot, trimmed);
    }
    const sanitized = (0, intent_privacy_1.sanitizeRepoRelativePath)(trimmed, { allowGlobs: false });
    if (!sanitized.path) {
        return {
            ok: false,
            path: null,
            kind: 'file',
            reasonCodes: uniqueSorted(sanitized.reasonCodes),
        };
    }
    return validateRepoRelativeFilePath(repoRoot, sanitized.path, options);
}
function assertRepoFilePath(repoRoot, rawPath, options) {
    const result = validateRepoFilePath(repoRoot, rawPath, options);
    if (!result.ok || !result.path) {
        const reason = result.reasonCodes[0] || 'unsafe_path';
        throw new Error(`Path rejected (${reason}).`);
    }
    return result.path;
}
function assertRepoGlob(repoRoot, rawGlob) {
    const result = validateRepoGlob(repoRoot, rawGlob);
    if (!result.ok || !result.path) {
        const reason = result.reasonCodes[0] || 'unsafe_path';
        throw new Error(`Glob rejected (${reason}).`);
    }
    return result.path;
}
//# sourceMappingURL=repo-path-authority.js.map