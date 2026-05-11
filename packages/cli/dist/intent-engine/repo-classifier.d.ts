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
export type PrimaryLanguage = 'typescript' | 'javascript' | 'python' | 'java' | 'go' | 'rust' | 'mixed' | 'unknown';
export type FrameworkEcosystem = 'express' | 'nextjs' | 'react' | 'fastapi' | 'django' | 'flask' | 'spring' | 'airflow' | 'celery' | 'unknown';
export type DependencyArchetype = 'nodejs' | 'python' | 'java' | 'go' | 'rust' | 'mixed' | 'unknown';
export interface RepoClassification {
    primaryLanguage: PrimaryLanguage;
    frameworkEcosystem: FrameworkEcosystem;
    dependencyArchetype: DependencyArchetype;
    /**
     * 0.0–1.0. Below UNSUPPORTED_THRESHOLD the classification is unreliable
     * and semantic reasoning should be suppressed.
     */
    confidence: number;
    /**
     * Explicit list of semantic reasoning domains that are VALID for this repo.
     * Intent matching should only use signals from these domains.
     * Empty = all domains allowed (unknown repo, safe default).
     */
    boundedDomains: string[];
    /**
     * When true, the repo classification was too uncertain to run bounded
     * semantic reasoning. Intent matching should emit a single advisory finding
     * rather than domain-specific findings.
     */
    unsupportedReasoningDomain: boolean;
}
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
export declare function classifyRepo(diffFiles: Array<{
    path: string;
}>): RepoClassification;
/**
 * Returns true if a component signal key is valid for the given repo classification.
 *
 * Component signals that are TypeScript/JavaScript-specific (zod, express, jwt.sign,
 * bcrypt, etc.) must be suppressed when the primary language is Python, Java, Go, etc.
 *
 * @param signalLanguages  Languages this signal applies to (empty = applies to all)
 * @param repo             The classified repository
 */
export declare function isSignalCompatible(signalLanguages: PrimaryLanguage[], repo: RepoClassification): boolean;
//# sourceMappingURL=repo-classifier.d.ts.map