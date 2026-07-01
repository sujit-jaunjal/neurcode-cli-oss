/**
 * Enterprise Repo Dogfood report — pure, source-free builder (Iteration 14).
 *
 * Iterations 6-13 proved the runtime against fixtures, sandbox payloads, and
 * `neurcode verify --ci` timing on real checkouts. Iteration 14 closes the loop
 * the roadmap actually asks for: drive a *governed cross-file session* on a real,
 * pinned third-party repository and record — honestly and source-free — whether
 * the product was useful.
 *
 * This module is the deterministic, I/O-free core. It takes a single
 * already-source-free facts object ({@link DogfoodReportInput}) gathered by the
 * operator harness (`scripts/enterprise-repo-dogfood-v1.mjs`) and turns it into:
 *
 *   1. {@link buildEnterpriseDogfoodReport} — a machine-readable manifest
 *      (`neurcode.enterprise-dogfood-report.v1`) carrying repo facts, brain index
 *      metrics, the honest per-tool enforcement posture, structured session
 *      observations, source-free evidence pointers, and a seven-dimension score.
 *   2. {@link renderEnterpriseDogfoodReportMarkdown} — the human-readable report.
 *
 * Hard rules (shared with utils/enterprise-eval-report.ts + utils/pilot-evidence-pack.ts):
 *   - Source-free. Only slugs, public OSS identities, paths, owners, counts,
 *     hashes, verdicts, and durations are read or emitted. We NEVER carry source,
 *     diffs, patch bodies, raw prompts, secrets, or natural-language intent /
 *     task / session prose. {@link assertEnterpriseDogfoodSourceFree} is the
 *     backstop and mirrors the CI leak gate (scripts/source-free-leak-scan.mjs).
 *   - Honest enforcement. The Enforcement dimension reports the real
 *     `integrations doctor` posture — a cooperative adapter (e.g. Cursor) is
 *     advisory, never claimed to be the Claude hook's hard pre-write deny.
 *   - Honest scope. Scores are operator judgments, each REQUIRING a source-free
 *     evidence pointer (artifact path + count / hash / duration). A score without
 *     evidence is rejected at build time.
 */
export declare const ENTERPRISE_DOGFOOD_REPORT_SCHEMA_VERSION: "neurcode.enterprise-dogfood-report.v1";
/** The seven roadmap score dimensions, in canonical report order. */
export declare const DOGFOOD_SCORE_DIMENSIONS: readonly ["intelligence", "enforcement", "usability", "scalability", "evidence", "privacy", "enterpriseReadiness"];
export type DogfoodScoreDimension = (typeof DOGFOOD_SCORE_DIMENSIONS)[number];
export type DogfoodScoreVerdict = 'pass' | 'partial' | 'fail';
export declare const DOGFOOD_DIMENSION_LABELS: Record<DogfoodScoreDimension, string>;
export interface DogfoodScore {
    dimension: DogfoodScoreDimension;
    verdict: DogfoodScoreVerdict;
    /**
     * Source-free evidence pointer. MUST be artifact paths, counts, hashes, or
     * durations — never file contents, diffs, prompts, or session prose.
     */
    evidence: string;
}
export type DogfoodCiTier = 'hermetic' | 'operator';
export interface DogfoodRepoFacts {
    /** Manifest slug, e.g. `fastapi-template`. */
    slug: string;
    /** Public OSS identity `owner/name`, e.g. `django/django` — never source. */
    name: string;
    language: string;
    /** 40-char hex commit the dogfood ran against. */
    pinnedCommit: string;
    ref: string | null;
    ciTier: DogfoodCiTier;
    filesTracked: number | null;
    diskBytes: number | null;
}
export interface DogfoodLanguageMatrixEntry {
    language: string;
    files: number;
    coverageTier: string;
}
/** Source-free projection of `brain repo-index` + `brain readiness --json`. */
export interface DogfoodBrainMetrics {
    indexed: boolean;
    filesIndexed: number | null;
    filesScanned: number | null;
    indexDurationMs: number | null;
    readinessDurationMs: number | null;
    /** `scaleStatus` level/label from neurcode.brain-scale-status.v1 (string only). */
    scaleStatus: string | null;
    storageBackend: string | null;
    storageFallback: boolean | null;
    languageMatrix: DogfoodLanguageMatrixEntry[];
}
/** Honest per-tool enforcement posture, sourced from `integrations doctor`. */
export interface DogfoodEnforcementPosture {
    agent: string;
    adapter: string | null;
    /** Verbatim guarantee label from integrations doctor. */
    guaranteeLabel: string;
    /** True only for a hard pre-write deny (e.g. the Claude Code hook). */
    enforceable: boolean;
    /** True for a cooperative adapter that can be bypassed (e.g. Cursor MCP). */
    advisoryOnly: boolean;
    /** Honest description of how enforcement was driven. */
    method: string;
    integrationsDoctorStatus: string | null;
}
export interface DogfoodSessionTask {
    id: string;
    /** Short, pre-authored task title from the manifest. Source-free (no prompts/diffs). */
    title: string;
    crossFile: boolean;
    expectedFiles: number | null;
}
export interface DogfoodLabeledCount {
    label: string;
    count: number;
}
export interface DogfoodFalseBlock {
    label: string;
    count: number;
    /** Path globs that were incorrectly blocked (paths only — never content). */
    pathGlobs: string[];
}
export interface DogfoodFrictionItem {
    label: string;
    severity: 'low' | 'medium' | 'high';
    count: number;
}
export interface DogfoodSessionObservations {
    governed: boolean;
    task: DogfoodSessionTask;
    /** Where the runtime helped — enumerated labels + counts, never prose dumps. */
    helps: DogfoodLabeledCount[];
    /** Incorrect blocks (false positives) — labels, counts, affected path globs. */
    falseBlocks: DogfoodFalseBlock[];
    /** Developer friction — enumerated labels, severity, counts. */
    friction: DogfoodFrictionItem[];
    blocksObserved: number;
    exactApprovals: number;
    neighborContained: boolean | null;
    /** Final guard verdict, e.g. `governed` | `unverified` (verdict string only). */
    finishVerdict: string | null;
}
export interface DogfoodArtifactPointer {
    /** Relative path to a committed source-free artifact (no content inlined). */
    relativePath: string | null;
    contentHash: string | null;
}
export interface DogfoodEvidenceArtifacts {
    pilotEvidencePack: DogfoodArtifactPointer & {
        sessionCount: number | null;
    };
    brainReadiness: DogfoodArtifactPointer;
    runtimeRiskDoctor: DogfoodArtifactPointer & {
        classifiedPaths: number | null;
        verdict: string | null;
    };
    aiChangeRecords: number | null;
}
export interface DogfoodDurations {
    totalMs: number | null;
    cloneMs: number | null;
    indexMs: number | null;
    sessionMs: number | null;
}
export interface EnterpriseDogfoodReport {
    schemaVersion: typeof ENTERPRISE_DOGFOOD_REPORT_SCHEMA_VERSION;
    generatedAt: string;
    cliVersion: string | null;
    /** Optional operator handle/label — metadata only, never PII-bearing prose. */
    operator: string | null;
    repo: DogfoodRepoFacts;
    brain: DogfoodBrainMetrics;
    enforcement: DogfoodEnforcementPosture;
    session: DogfoodSessionObservations;
    artifacts: DogfoodEvidenceArtifacts;
    /** CLI invocations with free-text args redacted (e.g. `--goal <goal>`). */
    commandsRun: string[];
    durations: DogfoodDurations;
    scores: DogfoodScore[];
    scoreSummary: {
        pass: number;
        partial: number;
        fail: number;
        overall: DogfoodScoreVerdict;
    };
    whatThisProves: string[];
    whatThisDoesNotProve: string[];
    limitations: string[];
    privacy: {
        sourceFree: true;
        excludes: string[];
    };
}
export interface DogfoodReportInput {
    generatedAt: string;
    cliVersion?: string | null;
    operator?: string | null;
    repo: DogfoodRepoFacts;
    brain: DogfoodBrainMetrics;
    enforcement: DogfoodEnforcementPosture;
    session: DogfoodSessionObservations;
    artifacts: DogfoodEvidenceArtifacts;
    commandsRun: string[];
    durations: DogfoodDurations;
    scores: DogfoodScore[];
    whatThisProves?: string[];
    whatThisDoesNotProve?: string[];
    limitations?: string[];
}
/** Throw if a would-be dogfood artifact carries source/diff/secret/prose shapes. */
export declare function assertEnterpriseDogfoodSourceFree(value: unknown, label?: string): void;
export declare function rollupDogfoodVerdict(scores: DogfoodScore[]): DogfoodScoreVerdict;
export declare function buildEnterpriseDogfoodReport(input: DogfoodReportInput): EnterpriseDogfoodReport;
export declare function renderEnterpriseDogfoodReportMarkdown(report: EnterpriseDogfoodReport): string;
//# sourceMappingURL=enterprise-dogfood-report.d.ts.map