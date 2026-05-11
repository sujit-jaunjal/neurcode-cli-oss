"use strict";
/**
 * Repository Classifier (Phase 3 — Repository-Aware Intent Bounding)
 *
 * Deterministic classification of a repository's primary language, framework
 * ecosystem, and dependency archetype from the diff file list alone.
 * No disk I/O, no LLM, no heuristics beyond file path and extension patterns.
 *
 * Used to bound semantic reasoning in the intent matcher so that:
 *   - Python repos NEVER emit Express/Zod/React-specific findings
 *   - Java repos NEVER emit Node.js-specific findings
 *   - TypeScript repos NEVER emit FastAPI/Django-specific findings
 *
 * Output confidence < UNSUPPORTED_THRESHOLD triggers an explicit
 * 'unsupported-reasoning-domain' state rather than guessing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyRepo = classifyRepo;
exports.isSignalCompatible = isSignalCompatible;
// ── Thresholds ────────────────────────────────────────────────────────────────
/** Below this confidence, emit unsupportedReasoningDomain */
const UNSUPPORTED_THRESHOLD = 0.4;
// ── Language detection patterns ───────────────────────────────────────────────
const LANG_PATTERNS = [
    { language: 'typescript', pattern: /\.(ts|tsx)$/, weight: 2 },
    { language: 'javascript', pattern: /\.(js|jsx|mjs|cjs)$/, weight: 1 },
    { language: 'python', pattern: /\.py$/, weight: 2 },
    { language: 'java', pattern: /\.java$/, weight: 2 },
    { language: 'go', pattern: /\.go$/, weight: 2 },
    { language: 'rust', pattern: /\.rs$/, weight: 2 },
];
// ── Dependency archetype detection ────────────────────────────────────────────
const DEPENDENCY_PATTERNS = [
    { archetype: 'nodejs', pattern: /(?:^|\/)package\.json$/ },
    { archetype: 'python', pattern: /(?:^|\/)(?:requirements(?:[-_]\w+)?\.txt|pyproject\.toml|setup\.py|setup\.cfg|Pipfile)$/ },
    { archetype: 'java', pattern: /(?:^|\/)(?:pom\.xml|build\.gradle(?:\.kts)?)$/ },
    { archetype: 'go', pattern: /(?:^|\/)go\.mod$/ },
    { archetype: 'rust', pattern: /(?:^|\/)Cargo\.toml$/ },
];
// ── Framework ecosystem detection ─────────────────────────────────────────────
// Keyed by path/filename patterns found in the diff
const FRAMEWORK_PATTERNS = [
    { ecosystem: 'airflow', pattern: /(?:airflow|dags?\/|operators?\/)/ },
    { ecosystem: 'celery', pattern: /(?:celery|tasks?\.py$|worker\.py$)/ },
    { ecosystem: 'fastapi', pattern: /(?:fastapi|routers?\/.*\.py$)/ },
    { ecosystem: 'django', pattern: /(?:django|settings\.py$|urls\.py$|views\.py$|models\.py$)/ },
    { ecosystem: 'flask', pattern: /(?:flask|app\.py$|blueprints?\/)/ },
    { ecosystem: 'spring', pattern: /(?:springframework|@SpringBootApplication|Controller\.java$)/ },
    { ecosystem: 'nextjs', pattern: /(?:pages\/|app\/.*page\.tsx$|next\.config\.)/ },
    { ecosystem: 'react', pattern: /(?:\.tsx$|components?\/|hooks?\/)/ },
    { ecosystem: 'express', pattern: /(?:express|router\.(ts|js)$|middleware\.(ts|js)$)/ },
];
// ── Domain bounding by language ───────────────────────────────────────────────
// Maps primaryLanguage → list of intent domains safe to evaluate on that language.
// '*' means all domains are safe (no bounding applied).
const LANGUAGE_DOMAIN_BOUNDS = {
    python: ['concurrency', 'observability', 'resilience', 'data-access', 'messaging',
        'orchestration', 'caching', 'ml-inference', 'infrastructure', 'security', 'auth'],
    java: ['concurrency', 'observability', 'resilience', 'data-access', 'messaging',
        'orchestration', 'caching', 'infrastructure', 'security', 'auth', 'api'],
    go: ['concurrency', 'observability', 'resilience', 'data-access', 'messaging',
        'caching', 'infrastructure', 'security', 'auth', 'api'],
    rust: ['concurrency', 'observability', 'resilience', 'caching', 'infrastructure'],
    typescript: [], // all domains allowed
    javascript: [], // all domains allowed
    mixed: [], // all domains allowed (conservative — don't bound a mixed repo)
    unknown: [], // all domains allowed (safe default — don't suppress on uncertainty)
};
// ── Classifier ────────────────────────────────────────────────────────────────
/**
 * Classify a repository from the diff file paths.
 *
 * Deterministic algorithm:
 * 1. Count file extensions → determine primaryLanguage by weighted vote
 * 2. Scan manifest file names → determine dependencyArchetype
 * 3. Scan file paths for framework markers → determine frameworkEcosystem
 * 4. Compute confidence from vote margin
 * 5. Bound semantic domains by primaryLanguage
 */
function classifyRepo(diffFiles) {
    const langCounts = {};
    let dependencyArchetype = 'unknown';
    let frameworkEcosystem = 'unknown';
    for (const file of diffFiles) {
        const p = file.path.replace(/\\/g, '/');
        // Language vote
        for (const { language, pattern, weight } of LANG_PATTERNS) {
            if (pattern.test(p)) {
                langCounts[language] = (langCounts[language] ?? 0) + weight;
            }
        }
        // Dependency archetype (first match wins)
        if (dependencyArchetype === 'unknown') {
            for (const { archetype, pattern } of DEPENDENCY_PATTERNS) {
                if (pattern.test(p)) {
                    dependencyArchetype = archetype;
                    break;
                }
            }
        }
        // Framework ecosystem (first match wins)
        if (frameworkEcosystem === 'unknown') {
            for (const { ecosystem, pattern } of FRAMEWORK_PATTERNS) {
                if (pattern.test(p)) {
                    frameworkEcosystem = ecosystem;
                    break;
                }
            }
        }
    }
    // Determine primary language
    const sorted = Object.entries(langCounts)
        .sort((a, b) => b[1] - a[1]);
    let primaryLanguage = 'unknown';
    let confidence = 0;
    if (sorted.length === 0) {
        primaryLanguage = 'unknown';
        confidence = 0;
    }
    else if (sorted.length === 1) {
        primaryLanguage = sorted[0][0];
        confidence = 0.95;
    }
    else {
        const top = sorted[0][1];
        const second = sorted[1][1];
        const total = sorted.reduce((s, [, v]) => s + v, 0);
        const dominance = top / total;
        if (dominance >= 0.75) {
            primaryLanguage = sorted[0][0];
            confidence = 0.9;
        }
        else if (dominance >= 0.5) {
            primaryLanguage = sorted[0][0];
            confidence = 0.65;
        }
        else {
            primaryLanguage = 'mixed';
            confidence = 0.4;
        }
        // Boost confidence if dependency archetype aligns
        if ((dependencyArchetype === 'python' && primaryLanguage === 'python') ||
            (dependencyArchetype === 'nodejs' && (primaryLanguage === 'typescript' || primaryLanguage === 'javascript')) ||
            (dependencyArchetype === 'java' && primaryLanguage === 'java') ||
            (dependencyArchetype === 'go' && primaryLanguage === 'go')) {
            confidence = Math.min(1.0, confidence + 0.1);
        }
    }
    const boundedDomains = LANGUAGE_DOMAIN_BOUNDS[primaryLanguage] ?? [];
    const unsupportedReasoningDomain = confidence < UNSUPPORTED_THRESHOLD;
    return {
        primaryLanguage,
        frameworkEcosystem,
        dependencyArchetype,
        confidence,
        boundedDomains,
        unsupportedReasoningDomain,
    };
}
/**
 * Returns true if a component signal key is valid for the given repo classification.
 *
 * Component signals that are TypeScript/JavaScript-specific (zod, express, jwt.sign,
 * bcrypt, etc.) must be suppressed when the primary language is Python, Java, Go, etc.
 *
 * @param signalLanguages  Languages this signal applies to (empty = applies to all)
 * @param repo             The classified repository
 */
function isSignalCompatible(signalLanguages, repo) {
    // If the signal has no language restriction, it applies everywhere
    if (signalLanguages.length === 0)
        return true;
    // If the repo is unknown or mixed, allow all signals (safe default)
    if (repo.primaryLanguage === 'unknown' || repo.primaryLanguage === 'mixed')
        return true;
    return signalLanguages.includes(repo.primaryLanguage);
}
//# sourceMappingURL=repo-classifier.js.map