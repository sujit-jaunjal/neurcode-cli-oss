"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTokens = extractTokens;
exports.scoreFiles = scoreFiles;
const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'add', 'create', 'make', 'update', 'change', 'implement', 'fix', 'get',
    'set', 'use', 'new', 'my', 'your', 'our', 'this', 'that', 'it',
]);
const SIGNAL_DIRS = [
    'auth', 'api', 'middleware', 'service', 'services', 'payment', 'payments',
    'analytics', 'dashboard', 'user', 'users', 'core', 'lib', 'utils', 'hooks',
    'store', 'redux', 'context', 'database', 'db', 'models', 'routes', 'router',
    'controllers', 'handlers', 'components', 'pages', 'views',
];
function extractTokens(intent) {
    return intent
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}
function filenameParts(filePath) {
    const parts = filePath.replace(/\\/g, '/').split('/');
    const filename = parts[parts.length - 1] ?? '';
    // Strip extension and split on separators
    return filename.replace(/\.[^.]+$/, '').toLowerCase().split(/[-_.]/);
}
function dirParts(filePath) {
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts.slice(0, -1).map((p) => p.toLowerCase());
}
function scoreFiles(intent, graph) {
    const tokens = extractTokens(intent);
    const files = Object.keys(graph.imports);
    const rawScores = {};
    const rawReasons = {};
    for (const file of files) {
        let score = 0;
        const reasons = [];
        const fnParts = filenameParts(file);
        const dParts = dirParts(file);
        // Heuristic 1: filename match (+3 per keyword match)
        for (const token of tokens) {
            if (fnParts.some((p) => p.includes(token))) {
                score += 3;
                reasons.push(`filename matches "${token}"`);
            }
        }
        // Heuristic 2: directory match (+2 per signal dir match)
        for (const dir of dParts) {
            if (SIGNAL_DIRS.includes(dir)) {
                for (const token of tokens) {
                    if (dir.includes(token)) {
                        score += 2;
                        reasons.push(`directory "${dir}" matches "${token}"`);
                        break;
                    }
                }
                // Also reward being in a recognized signal dir even without token match
                if (tokens.some((t) => dir.includes(t)))
                    continue;
                // Check if any token partially matches a signal-dir keyword
                for (const token of tokens) {
                    if (SIGNAL_DIRS.some((sd) => sd.includes(token) && dir === sd)) {
                        score += 2;
                        reasons.push(`located in signal directory "${dir}"`);
                    }
                }
            }
        }
        // Heuristic 3: token match in content (+1 per unique token match)
        // We don't have content here, so we rely on the file path
        const fullPathLower = file.toLowerCase();
        for (const token of tokens) {
            if (fullPathLower.includes(token)) {
                score += 1;
                reasons.push(`path contains "${token}"`);
            }
        }
        rawScores[file] = score;
        rawReasons[file] = reasons;
    }
    // Heuristic 4: import proximity (+2 if a file imports a high-scoring file)
    // First pass: collect files with score > 0
    const threshold = 3;
    const highScoreFiles = new Set(Object.entries(rawScores)
        .filter(([, s]) => s >= threshold)
        .map(([f]) => f));
    for (const file of files) {
        const deps = graph.imports[file] ?? [];
        for (const dep of deps) {
            if (highScoreFiles.has(dep)) {
                rawScores[file] = (rawScores[file] ?? 0) + 2;
                rawReasons[file] = [...(rawReasons[file] ?? []), `imports high-relevance file "${dep}"`];
                break; // only apply once per file
            }
        }
    }
    return files
        .map((file) => ({
        file,
        score: rawScores[file] ?? 0,
        reasons: rawReasons[file] ?? [],
    }))
        .filter((f) => f.score > 0)
        .sort((a, b) => b.score - a.score);
}
//# sourceMappingURL=scorer.js.map