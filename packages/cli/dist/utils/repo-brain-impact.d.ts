/**
 * Repo Brain Impact Intelligence (V1) — deterministic + advisory change-impact
 * analysis over the source-free local repo brain.
 *
 * Given a changed file (or set of changed files) this module answers the
 * question an engineering manager actually asks about an AI change *before or
 * after* it lands: what does this touch, who owns it, what is sensitive, who
 * imports it, is it a hub, where are the nearby tests/docs, is the helper
 * duplicated elsewhere, and what should a reviewer ask?
 *
 * Hard rules (shared with utils/local-repo-brain.ts and utils/guided-eval.ts):
 *   - Source-free: only relative paths, symbol *names*, counts, owner tokens,
 *     sensitive-kind labels, and hashes are read or emitted. Never source code,
 *     diff hunks, or file bodies.
 *   - Honest labelling: every finding is tagged `deterministic` (a compiled
 *     path / CODEOWNERS / static-import-graph fact) or `advisory` (a heuristic
 *     reuse / proximity / reviewer-question signal). We never present an
 *     advisory signal as a deterministic guarantee.
 *
 * The engine is pure (no I/O) — {@link computeRepoBrainImpact} takes an artifact
 * (or null) and the changed paths. {@link buildRepoBrainImpactForRepo} is the
 * thin I/O wrapper that reads (or builds) the brain and then computes.
 */
import { type LocalRepoBrainArtifact, type LocalRepoBrainSensitiveKind } from './local-repo-brain';
export declare const REPO_BRAIN_IMPACT_SCHEMA_VERSION: "neurcode.repo-brain-impact.v1";
export declare const IMPACT_SUMMARY_SCHEMA_VERSION: "neurcode.impact-summary.v1";
/** Every finding is one of these two truth tiers — never blurred. */
export type ImpactLabel = 'deterministic' | 'advisory';
/** Coarse role of a file, derived deterministically from its path. */
export type ImpactFileRole = 'source' | 'test' | 'docs' | 'config' | 'runtime_governance' | 'generated' | 'data' | 'unknown';
/** A file imported by enough other files to be a structural hub. */
export declare const HIGH_FAN_IN_THRESHOLD = 5;
export interface ImpactChangedFile {
    path: string;
    /** Whether the path is present in the indexed brain (else classified by path only). */
    indexed: boolean;
    role: ImpactFileRole;
    language: string | null;
    module: string | null;
    sensitiveKinds: LocalRepoBrainSensitiveKind[];
    /** Declarations indexed in this file (null when not indexed). */
    symbolCount: number | null;
    /** Outbound import edges from this file (null when not indexed). */
    importCount: number | null;
    generated: boolean;
}
export interface ImpactOwnerMatch {
    /** CODEOWNERS pattern that matched. */
    pattern: string;
    owners: string[];
    /** Which of the changed paths this boundary covers. */
    matchedPaths: string[];
    /** True for the last-match-wins effective owner of at least one changed path. */
    effective: boolean;
}
export interface ImpactSensitiveSurface {
    path: string;
    kinds: LocalRepoBrainSensitiveKind[];
}
export interface ImpactConsumer {
    path: string;
    role: ImpactFileRole;
    /** Number of static import edges from this file into the changed set. */
    edgeCount: number;
    /** Up to a few of the changed paths this consumer imports. */
    imports: string[];
}
export interface ImpactDependency {
    /** The raw import specifier (e.g. "../retry" or "@scope/pkg"). */
    target: string;
    /** Resolved repo-relative file when the import is relative and in-repo. */
    resolvedFile: string | null;
    external: boolean;
}
export interface ImpactHotspot {
    path: string;
    score: number;
    fanIn: number;
    fanOut: number;
    reasons: string[];
    /** fanIn >= HIGH_FAN_IN_THRESHOLD — a structural hub. */
    isHub: boolean;
}
export interface ImpactReuseAdvisory {
    symbolName: string | null;
    kind: string;
    severity: string;
    confidence: string;
    files: string[];
    reasonCodes: string[];
    whyFlagged: string;
    checkNext: string;
    semanticEquivalenceClaimed: false;
}
export type ImpactQuestionCategory = 'owners' | 'sensitive' | 'fanout' | 'reuse' | 'tests' | 'config' | 'general';
export interface ImpactReviewQuestion {
    category: ImpactQuestionCategory;
    question: string;
    rationale: string;
}
export interface ImpactTestsEvaluation {
    status: 'measured' | 'not_evaluated';
    reasonCode: string;
    parserId: string | null;
    parserDepth: string | null;
    coverageStatus: string;
    manualDiscoveryRecommendation: string | null;
}
export interface ImpactRadius {
    riskLevel: 'low' | 'medium' | 'high';
    reasons: string[];
    deterministic: {
        consumerCount: number;
        affectedRoles: ImpactFileRole[];
        reviewerOwners: string[];
        sensitiveKinds: LocalRepoBrainSensitiveKind[];
        configImpact: {
            configuration: string[];
            workflow: string[];
            dependency: string[];
            runtimeGovernance: string[];
        };
    };
    advisory: {
        likelyTests: string[];
        whyThisMatters: string;
        testsEvaluation: ImpactTestsEvaluation;
    };
}
export interface RepoBrainImpactReport {
    schemaVersion: typeof REPO_BRAIN_IMPACT_SCHEMA_VERSION;
    generatedAt: string;
    brain: {
        status: 'found' | 'built' | 'missing';
        artifactHash: string | null;
        generatedAt: string | null;
        filesIndexed: number | null;
        ownerBoundaryStatus: 'found' | 'not_found' | null;
        recoveryCommand: string;
    };
    requestedPaths: string[];
    changedFiles: ImpactChangedFile[];
    owners: {
        label: 'deterministic';
        status: 'found' | 'not_found';
        matches: ImpactOwnerMatch[];
        /** Distinct effective owners across the changed set (last-match-wins). */
        routeTo: string[];
    };
    sensitiveSurfaces: {
        label: 'deterministic';
        surfaces: ImpactSensitiveSurface[];
        kinds: LocalRepoBrainSensitiveKind[];
    };
    consumers: {
        label: 'deterministic';
        direct: ImpactConsumer[];
        total: number;
        truncated: boolean;
        byRole: Record<ImpactFileRole, number>;
    };
    dependencies: {
        label: 'deterministic';
        internal: ImpactDependency[];
        externalPackages: string[];
        truncated: boolean;
    };
    highFanOut: {
        label: 'deterministic';
        hotspots: ImpactHotspot[];
        isHighFanOut: boolean;
    };
    impactRadius: ImpactRadius;
    nearby: {
        label: 'advisory';
        tests: string[];
        docs: string[];
        config: string[];
        runtime: string[];
    };
    reuse: {
        label: 'advisory';
        advisories: ImpactReuseAdvisory[];
    };
    reviewRouting: {
        owners: string[];
        reviewFirst: string[];
    };
    reviewQuestions: ImpactReviewQuestion[];
    labels: {
        deterministic: string[];
        advisory: string[];
    };
    proves: string[];
    doesNotProve: string[];
    limitations: string[];
}
/**
 * Compact, source-free impact digest embedded in AI Change Records, eval-demo
 * reports, and the dashboard import. A trimmed projection of the full report.
 */
export interface ImpactSummary {
    schemaVersion: typeof IMPACT_SUMMARY_SCHEMA_VERSION;
    generatedAt: string;
    brainStatus: 'found' | 'built' | 'missing';
    artifactHash: string | null;
    counts: {
        changedFiles: number;
        indexedChangedFiles: number;
        directConsumers: number;
        changedSymbols: number;
        sensitiveSurfaces: number;
        internalDependencies: number;
        externalPackages: number;
        owners: number;
    };
    changedFiles: Array<{
        path: string;
        role: ImpactFileRole;
        module: string | null;
        sensitiveKinds: LocalRepoBrainSensitiveKind[];
    }>;
    owners: string[];
    sensitiveSurfaces: ImpactSensitiveSurface[];
    deterministic: {
        directConsumers: Array<{
            path: string;
            role: ImpactFileRole;
            edgeCount: number;
        }>;
        highFanOut: Array<{
            path: string;
            fanIn: number;
        }>;
        isHighFanOut: boolean;
    };
    advisory: {
        reuse: Array<{
            symbolName: string | null;
            confidence: string;
            files: string[];
            whyFlagged: string;
            checkNext: string;
            semanticEquivalenceClaimed: false;
        }>;
        nearbyTests: string[];
        testsEvaluation: ImpactTestsEvaluation;
    };
    impactRadius: ImpactRadius;
    reviewRouting: {
        owners: string[];
        reviewFirst: string[];
    };
    reviewQuestions: string[];
    proves: string[];
    doesNotProve: string[];
}
export interface ComputeRepoBrainImpactOptions {
    generatedAt?: string;
    brainStatus?: 'found' | 'built' | 'missing';
    /** Max direct consumers / dependencies retained before truncation. */
    maxConsumers?: number;
    maxDependencies?: number;
    maxReviewQuestions?: number;
}
export declare function normalizeImpactPath(value: string, projectRoot?: string): string;
/**
 * Deterministically classify a file's role from its path + sensitive kinds.
 * Order matters: test > runtime_governance > config > docs > generated > data.
 */
export declare function classifyImpactFileRole(path: string, opts?: {
    generated?: boolean;
    sensitiveKinds?: LocalRepoBrainSensitiveKind[];
}): ImpactFileRole;
/**
 * Faithful subset of gitignore/CODEOWNERS glob semantics, sufficient for the
 * common enterprise patterns: `src/billing/`, `*.py`, `/.github/workflows/`,
 * `packages/cli/`, `docs/*`, `apps/web/**`, and exact file paths.
 */
export declare function matchesCodeownersPattern(filePath: string, pattern: string): boolean;
export declare function computeRepoBrainImpact(artifact: LocalRepoBrainArtifact | null, requestedPaths: string[], options?: ComputeRepoBrainImpactOptions): RepoBrainImpactReport;
export declare function summarizeImpact(report: RepoBrainImpactReport, graphProjection?: import('./repo-graph-impact').GraphImpactProjection | null): ImpactSummary;
export interface BuildRepoBrainImpactOptions extends ComputeRepoBrainImpactOptions {
    /** Build the brain when no artifact exists yet (default true). */
    autoBuild?: boolean;
}
/**
 * Read the local repo brain (building it once when missing if autoBuild) and
 * compute the impact report for the given changed paths.
 */
export declare function buildRepoBrainImpactForRepo(projectRoot: string, requestedPaths: string[], options?: BuildRepoBrainImpactOptions): RepoBrainImpactReport;
export declare function renderRepoBrainImpactText(report: RepoBrainImpactReport): string;
//# sourceMappingURL=repo-brain-impact.d.ts.map