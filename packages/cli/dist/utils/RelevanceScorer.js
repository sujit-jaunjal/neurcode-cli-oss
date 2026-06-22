"use strict";
/**
 * RelevanceScorer
 *
 * High-performance BM25-inspired keyword matching algorithm for filtering
 * exported tools based on user intent. Runs in milliseconds without requiring
 * vector databases or embeddings.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTopKTools = getTopKTools;
// Common stop words to filter from intent
const STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'the', 'this', 'but', 'they', 'have',
    'had', 'what', 'said', 'each', 'which', 'their', 'time', 'if',
    'up', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her',
    'would', 'make', 'like', 'into', 'him', 'has', 'two', 'more', 'very',
    'after', 'words', 'long', 'than', 'first', 'been', 'call', 'who',
    'oil', 'sit', 'now', 'find', 'down', 'day', 'did', 'get', 'come',
    'made', 'may', 'part'
]);
/**
 * Clean and tokenize intent text
 */
function tokenizeIntent(intent) {
    return intent
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Remove punctuation
        .split(/\s+/)
        .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}
/**
 * Extract folder names from file path
 * e.g., "src/services/auth/validator.ts" -> ["src", "services", "auth"]
 */
function extractFolderNames(filePath) {
    const parts = filePath.split('/');
    return parts.slice(0, -1); // Remove filename, keep folders
}
/**
 * Check if a word appears in export name (case-insensitive)
 */
function fuzzyMatch(word, exportName) {
    const lowerExport = exportName.toLowerCase();
    const lowerWord = word.toLowerCase();
    // Direct substring match
    if (lowerExport.includes(lowerWord))
        return true;
    // CamelCase split match (e.g., "validateAuth" matches "auth")
    const camelCaseParts = exportName.split(/(?=[A-Z])/).map(p => p.toLowerCase());
    return camelCaseParts.some(part => part.includes(lowerWord));
}
/**
 * Calculate relevance score for an export item with context-weighted scoring
 */
function calculateScore(exportItem, intentTokens, intent = '' // Full intent string for context-aware checks
) {
    let score = 0;
    const exportName = exportItem.name.toLowerCase();
    const filePath = exportItem.filePath.toLowerCase();
    const lowerIntent = intent.toLowerCase();
    // Filename Precision: Exact partial matches in filename get +30 point boost
    const fileName = exportItem.filePath.split('/').pop()?.toLowerCase() || '';
    const fileNameWithoutExt = fileName.replace(/\.(ts|tsx|js|jsx)$/, '');
    for (const token of intentTokens) {
        // Check if token matches filename (exact partial match)
        if (fileNameWithoutExt === token ||
            fileNameWithoutExt.startsWith(token) ||
            fileNameWithoutExt.endsWith(token)) {
            score += 30; // +30 point boost for filename precision match
            break;
        }
    }
    // Direct Match: +10 if export name appears exactly in intent
    for (const token of intentTokens) {
        if (exportName === token) {
            score += 10;
            break; // Only count once
        }
    }
    // Fuzzy Match: +5 if a word in intent matches part of export name
    for (const token of intentTokens) {
        if (fuzzyMatch(token, exportItem.name)) {
            score += 5;
            break; // Only count once per token
        }
    }
    // Path Match: +3 if folder name matches intent
    const folderNames = extractFolderNames(exportItem.filePath);
    for (const folder of folderNames) {
        const lowerFolder = folder.toLowerCase();
        for (const token of intentTokens) {
            if (lowerFolder.includes(token) || token.includes(lowerFolder)) {
                score += 3;
                break; // Only count once per folder
            }
        }
    }
    // Type Weighting: Functions > Classes > Interfaces/Types
    switch (exportItem.type) {
        case 'function':
            score += 2; // Functions are most actionable
            break;
        case 'class':
            score += 1; // Classes are actionable
            break;
        case 'interface':
        case 'type':
            score += 0; // Interfaces/types are less actionable
            break;
        case 'const':
        case 'variable':
            score += 0.5; // Constants can be useful
            break;
        default:
            score += 0;
    }
    // Directory Weighting: Apply additive bonuses/penalties based on project structure
    // Backend/API boost: +50 points if path contains services/api, backend, or server
    const isBackendApi = filePath.includes('services/api') ||
        filePath.includes('backend') ||
        filePath.includes('server');
    const backendIntent = lowerIntent.includes('api')
        || lowerIntent.includes('backend')
        || lowerIntent.includes('server');
    const lexicalMatch = intentTokens.some((token) => fuzzyMatch(token, exportItem.name)
        || fileNameWithoutExt.includes(token)
        || extractFolderNames(exportItem.filePath).some((folder) => folder.toLowerCase().includes(token)));
    if (isBackendApi && (backendIntent || lexicalMatch)) {
        score += 50; // Strong additive boost for backend files
    }
    // CLI/Tools penalty: -50 points if path contains packages/cli or scripts (unless CLI is explicitly mentioned)
    const isCliScript = (filePath.includes('packages/cli') ||
        filePath.includes('scripts')) &&
        !lowerIntent.includes('cli') &&
        !lowerIntent.includes('command');
    if (isCliScript) {
        score -= 50; // Strong additive penalty for CLI files on non-CLI intents
    }
    // Test files reduction: -30 points if path contains test/spec/mock (unless test is explicitly mentioned)
    const isTestFile = (filePath.includes('test') ||
        filePath.includes('spec') ||
        filePath.includes('mock') ||
        filePath.includes('__tests__') ||
        filePath.includes('.test.') ||
        filePath.includes('.spec.')) &&
        !lowerIntent.includes('test') &&
        !lowerIntent.includes('spec') &&
        !lowerIntent.includes('testing');
    if (isTestFile) {
        score -= 30; // Additive penalty for test files on non-test intents
    }
    // Project Knowledge: React/Next.js detection for UI intents
    // Check if intent mentions UI/component/view and file is .tsx/.jsx
    const isUIIntent = lowerIntent.includes('ui') ||
        lowerIntent.includes('component') ||
        lowerIntent.includes('view') ||
        lowerIntent.includes('page') ||
        lowerIntent.includes('render');
    const isReactFile = fileName.endsWith('.tsx') || fileName.endsWith('.jsx');
    if (isUIIntent && isReactFile) {
        score += 20; // Additive boost for React files on UI intents
    }
    // Ensure score doesn't go negative (clamp at 0)
    score = Math.max(0, score);
    return score;
}
/**
 * Core Guard: Always include these essential tools regardless of relevance
 */
const CORE_TOOLS = new Set([
    'plan',
    'verify',
    'apply',
    'check',
    'generate',
    'create',
    'update',
    'delete',
    'save',
    'load',
    'init',
    'config',
    'help'
]);
/**
 * Check if an export is a core tool that should always be included
 */
function isCoreTool(exportItem) {
    const name = exportItem.name.toLowerCase();
    // Check exact match
    if (CORE_TOOLS.has(name))
        return true;
    // Command wrappers are also core. Avoid substring matching: names such as
    // initPostgresDatabase are not governance commands merely because they
    // contain "init".
    if (name.endsWith('command') && CORE_TOOLS.has(name.slice(0, -'command'.length)))
        return true;
    return false;
}
/**
 * Get Top-K most relevant tools based on user intent
 *
 * @param intent - User's intent/query
 * @param exports - All available exports
 * @param k - Number of top results to return (default: 20)
 * @returns Filtered and sorted array of ExportItems
 */
function getTopKTools(intent, exports, k = 20) {
    if (!intent || intent.trim().length === 0) {
        // If no intent, return top K by type priority (functions first)
        return exports
            .sort((a, b) => {
            const typePriority = {
                'function': 3,
                'class': 2,
                'const': 1,
                'interface': 0,
                'type': 0,
                'variable': 0,
                'enum': 0,
                'namespace': 0,
                'default': 0,
                'unknown': 0
            };
            return (typePriority[b.type] || 0) - (typePriority[a.type] || 0);
        })
            .slice(0, k);
    }
    // Tokenize intent
    const intentTokens = tokenizeIntent(intent);
    if (intentTokens.length === 0) {
        // If intent has no meaningful tokens, return top K by type
        return exports
            .sort((a, b) => {
            const typePriority = {
                'function': 3,
                'class': 2,
                'const': 1,
                'interface': 0,
                'type': 0
            };
            return (typePriority[b.type] || 0) - (typePriority[a.type] || 0);
        })
            .slice(0, k);
    }
    // Score all exports with full intent context for weighted scoring
    const scoredExports = exports.map(exp => ({
        export: exp,
        score: calculateScore(exp, intentTokens, intent),
        isCore: isCoreTool(exp)
    }));
    // Separate core tools and regular exports
    const coreTools = scoredExports.filter(item => item.isCore);
    const regularExports = scoredExports.filter(item => !item.isCore);
    // Sort regular exports by score (descending)
    regularExports.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        // Tie-breaker: prefer functions
        const typePriority = {
            'function': 3,
            'class': 2,
            'const': 1,
            'interface': 0,
            'type': 0
        };
        return (typePriority[b.export.type] || 0) - (typePriority[a.export.type] || 0);
    });
    // Keep the relevance-ranked results first while reserving room for every
    // exact core command. Core presence is a safety invariant, not a claim that
    // those commands are more relevant than repository symbols for this intent.
    const coreToolItems = coreTools.map(item => item.export);
    const topRegularExports = regularExports
        .slice(0, Math.max(0, k - coreToolItems.length))
        .map(item => item.export);
    // Remove duplicates (in case a core tool also scored high)
    const seen = new Set();
    const result = [];
    for (const exp of [...topRegularExports, ...coreToolItems]) {
        const key = `${exp.filePath}:${exp.name}`;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(exp);
        }
    }
    // If we still need more items, fill with highest-scoring remaining
    if (result.length < k) {
        const remaining = regularExports
            .filter(item => {
            const key = `${item.export.filePath}:${item.export.name}`;
            return !seen.has(key);
        })
            .slice(0, k - result.length)
            .map(item => item.export);
        result.push(...remaining);
    }
    return result.slice(0, k);
}
//# sourceMappingURL=RelevanceScorer.js.map