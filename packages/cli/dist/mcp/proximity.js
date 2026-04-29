"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractRequestedFilePathsFromPrompt = extractRequestedFilePathsFromPrompt;
exports.findClosestAllowedFile = findClosestAllowedFile;
const FILE_PATH_PATTERN = /(?:^|[\s([{"'])((?:[A-Za-z0-9_.-]+\/)+(?:[A-Za-z0-9_.-]+\.(?:tsx|ts|jsx|js|mjs|cjs|json|tf|py|go|java|rs|md)))/g;
const BACKTICK_PATTERN = /`([^`]+)`/g;
const NOISE_TOKENS = new Set([
    'src',
    'app',
    'apps',
    'lib',
    'libs',
    'package',
    'packages',
    'module',
    'modules',
    'index',
    'main',
    'test',
    'tests',
    'spec',
    'ts',
    'tsx',
    'js',
    'jsx',
    'mjs',
    'cjs',
    'json',
    'tf',
    'py',
    'go',
    'java',
    'rs',
    'md',
]);
function normalizePath(value) {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function isLikelyFilePath(value) {
    const normalized = normalizePath(value);
    if (!normalized || !normalized.includes('/'))
        return false;
    return /\.[A-Za-z0-9]+$/.test(normalized);
}
function splitTokens(value) {
    const normalized = value
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[^A-Za-z0-9]+/g, ' ')
        .trim()
        .toLowerCase();
    if (!normalized)
        return [];
    return normalized
        .split(/\s+/)
        .filter((token) => Boolean(token) && !NOISE_TOKENS.has(token));
}
function fileNameFromPath(pathValue) {
    const normalized = normalizePath(pathValue);
    const segments = normalized.split('/');
    const fileName = segments[segments.length - 1] || normalized;
    return fileName.replace(/\.[^.]+$/, '');
}
function directorySegments(pathValue) {
    const normalized = normalizePath(pathValue);
    const segments = normalized.split('/').filter(Boolean);
    return segments.slice(0, -1);
}
function extractRequestedFilePathsFromPrompt(prompt, maxItems = 3) {
    const output = [];
    const seen = new Set();
    const limitedMax = Math.max(1, Math.floor(maxItems));
    const pushCandidate = (candidateRaw) => {
        const candidate = normalizePath(candidateRaw.replace(/[),.;:'"]+$/g, ''));
        if (!isLikelyFilePath(candidate))
            return;
        if (seen.has(candidate))
            return;
        seen.add(candidate);
        output.push(candidate);
    };
    let match;
    while ((match = BACKTICK_PATTERN.exec(prompt)) !== null) {
        if (output.length >= limitedMax)
            break;
        pushCandidate(match[1] || '');
    }
    while ((match = FILE_PATH_PATTERN.exec(prompt)) !== null) {
        if (output.length >= limitedMax)
            break;
        pushCandidate(match[1] || '');
    }
    return output.slice(0, limitedMax);
}
function findClosestAllowedFile(requestedPath, allowedFiles) {
    const normalizedRequested = normalizePath(requestedPath);
    if (!normalizedRequested || !Array.isArray(allowedFiles) || allowedFiles.length === 0) {
        return null;
    }
    const requestedDirs = directorySegments(normalizedRequested);
    const requestedNameTokens = splitTokens(fileNameFromPath(normalizedRequested));
    const requestedAllTokens = splitTokens(normalizedRequested);
    let bestPath = null;
    let bestScore = 0;
    let bestHasSignal = false;
    for (const candidateRaw of allowedFiles) {
        const candidate = normalizePath(candidateRaw);
        if (!candidate)
            continue;
        const candidateDirs = directorySegments(candidate);
        const candidateNameTokens = splitTokens(fileNameFromPath(candidate));
        const candidateAllTokens = splitTokens(candidate);
        let sharedDirPrefix = 0;
        while (sharedDirPrefix < requestedDirs.length &&
            sharedDirPrefix < candidateDirs.length &&
            requestedDirs[sharedDirPrefix] === candidateDirs[sharedDirPrefix]) {
            sharedDirPrefix += 1;
        }
        const requestedNameSet = new Set(requestedNameTokens);
        const requestedAllSet = new Set(requestedAllTokens);
        const nameOverlap = candidateNameTokens.filter((token) => requestedNameSet.has(token)).length;
        const allOverlap = candidateAllTokens.filter((token) => requestedAllSet.has(token)).length;
        const hasSignal = sharedDirPrefix > 0 || nameOverlap > 0 || allOverlap >= 2;
        const score = (sharedDirPrefix * 8) + (nameOverlap * 6) + (allOverlap * 2);
        if (score > bestScore) {
            bestScore = score;
            bestPath = candidate;
            bestHasSignal = hasSignal;
        }
    }
    if (!bestHasSignal || bestScore <= 0) {
        return null;
    }
    return bestPath;
}
//# sourceMappingURL=proximity.js.map