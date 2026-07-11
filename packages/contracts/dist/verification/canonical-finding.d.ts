import type { DeterminismClassification, GovernanceFindingCategory, GovernanceSourceSystem } from './taxonomy';
import { GOVERNANCE_FINDINGS_SCHEMA_VERSION } from './taxonomy';
import type { GovernancePipelineSummary } from './pipeline';
export type GovernanceSeverity = 'BLOCKING' | 'ADVISORY' | 'INFO';
export interface GovernanceEvidence {
    /** Human-readable excerpt (code, diff line, policy excerpt). */
    excerpt: string;
    /** Stable machine hint: AST path, regex id, policy rule type, etc. */
    structuralHint?: string;
    line?: number;
    column?: number;
    filePath?: string;
}
export interface GovernanceReplayMetadata {
    evidenceArtifactRef?: string;
    executionRecordRef?: string;
    snapshotIds?: string[];
    /** True when replay used only immutable artifacts with matching digests. */
    reconstructedExactly?: boolean;
    /** Present when bounded degradation occurred (truncation, missing artifact, etc.). */
    boundedDegradation?: string[];
}
export interface GovernanceProvenanceMetadata {
    runId?: string;
    planId?: string | null;
    verificationSource?: string;
    policyLockFingerprint?: string | null;
    compiledPolicyFingerprint?: string | null;
    generatedAt?: string;
    /**
     * Canonical pipeline stage that emitted this finding. Additive lineage —
     * never participates in the finding identity or the replay checksum, but
     * threads governance computation provenance through to dashboards and audit.
     */
    producedByStage?: string;
}
export interface GovernanceSuppressionMetadata {
    suppressed: boolean;
    directive?: string;
    exceptionId?: string;
    reason?: string;
}
export interface GovernanceGraphMetadata {
    edgeVia?: string;
    fromRepo?: string;
    toRepo?: string;
    confidence?: 'high' | 'medium' | 'low';
    traversalDepth?: number;
    /** Explicit incompleteness — never omit when graph was capped. */
    truncated?: boolean;
    truncationReason?: string;
}
export interface GovernanceSemanticMetadata {
    retrievalMethod?: 'deterministic-graph' | 'deterministic-tfidf' | 'heuristic-expansion';
    matchedTerms?: string[];
    tfidfScore?: number;
    corpusCoverageRatio?: number;
    indexTruncated?: boolean;
    documentsIndexed?: number;
    documentsCap?: number;
}
export interface GovernanceStructuralMetadata {
    ruleId: string;
    ruleName?: string;
    policyRef?: string;
    language?: string;
    astNodeType?: string;
}
/**
 * Canonical normalized finding — single source of truth across CLI, CI, replay, dashboards.
 */
export interface GovernanceFinding {
    /** Deterministic id: sha256-128 of stable fields, or caller-supplied stable id. */
    id: string;
    category: GovernanceFindingCategory;
    sourceSystem: GovernanceSourceSystem;
    determinismClassification: DeterminismClassification;
    severity: GovernanceSeverity;
    /** 0–1; structural deterministic often 0.85–1.0; heuristics lower. */
    confidence: number;
    title: string;
    evidence: GovernanceEvidence;
    operationalImplication: string;
    remediation: string;
    replayMetadata?: GovernanceReplayMetadata;
    provenanceMetadata?: GovernanceProvenanceMetadata;
    suppressionMetadata?: GovernanceSuppressionMetadata;
    graphMetadata?: GovernanceGraphMetadata;
    semanticMetadata?: GovernanceSemanticMetadata;
    structuralMetadata?: GovernanceStructuralMetadata;
    /**
     * When multiple raw signals were merged for reviewer compression.
     * Primary finding keeps merged* fields; sources list contributing ids.
     */
    mergedFrom?: string[];
}
/**
 * Replay reconstruction status.
 *
 * exact              - checksums match, identical governance output
 * bounded-degradation - minor mismatch (e.g. missing artifact) but not a hard failure
 * drift-detected     - HARD FAILURE: same commit + diff + rules produced different output.
 *                      Checksum mismatch. Must be investigated before any governance trust.
 */
export type ReplayReconstructionStatus = 'exact' | 'artifact-complete' | 'bounded-degradation' | 'drift-detected';
/**
 * Phase 2: Typed drift reason taxonomy for replay integrity analysis.
 *
 * Each reason maps to a specific class of replay failure:
 *   finding-order-drift   - findings appear in different canonical order
 *   severity-drift        - a finding changed severity between runs
 *   determinism-drift     - a finding changed determinismClassification
 *   provenance-drift      - provenance metadata differs between runs
 *   suppression-drift     - suppression state changed between runs
 *   checksum-drift        - top-level replayChecksum mismatch (composite signal)
 *   missing-finding       - finding present in baseline but absent in replay
 *   extra-finding         - finding present in replay but absent in baseline
 */
export type ReplayIntegrityDriftReason = 'finding-order-drift' | 'severity-drift' | 'determinism-drift' | 'provenance-drift' | 'suppression-drift' | 'checksum-drift' | 'missing-finding' | 'extra-finding';
export interface GovernanceReplayIntegrity {
    status: ReplayReconstructionStatus;
    missingArtifacts: string[];
    provenanceMismatches: string[];
    graphMismatches: string[];
    semanticTruncationMismatches: string[];
    notes: string[];
    /** Typed drift reasons — empty for exact reconstruction or artifact-only completeness. */
    driftReasons?: ReplayIntegrityDriftReason[];
}
export interface GovernanceVerificationEnvelope {
    schemaVersion: typeof GOVERNANCE_FINDINGS_SCHEMA_VERSION;
    generatedAt: string;
    findings: GovernanceFinding[];
    /** Count of raw findings folded into merged clusters. */
    compressedDuplicateCount: number;
    /**
     * Phase 6: Total count of cross-source-system duplicates absorbed into
     * canonical finding identities. Equals compressedDuplicateCount but named
     * explicitly for telemetry readability.
     */
    deduplicatedFindingCount?: number;
    /**
     * Phase 2: Count of findings demoted from BLOCKING to ADVISORY because they
     * exist on unmodified (historical) lines. Visible for CI reporting.
     */
    legacyDebtFindingCount?: number;
    /**
     * Phase 3: Deterministic replay checksum.
     * SHA-256 over the canonically sorted finding set (id + severity + determinism + file + line).
     * Same commit + same diff + same rules MUST produce the same checksum.
     * A mismatch between two runs with identical inputs indicates replay drift (trust failure).
     */
    replayChecksum?: string;
    replayIntegrity?: GovernanceReplayIntegrity;
    /** Pilot / operational summary lines (high-signal, not verbose). */
    reviewerSummary?: string[];
    /**
     * Canonical governance pipeline summary — stage execution ledger surface.
     *
     * Additive observability. Excluded by design from:
     *   - `replayChecksum` (computed only from finding-set fields)
     *   - finding identity (`GovernanceFinding.id`)
     *   - canonical sort order
     *
     * Present when verify ran with the staged pipeline runtime. Consumers
     * (dashboards, audit replay, SLO gates) read this to explain HOW
     * governance computation occurred. Absent on legacy / older-CLI envelopes.
     */
    pipelineSummary?: GovernancePipelineSummary;
}
//# sourceMappingURL=canonical-finding.d.ts.map