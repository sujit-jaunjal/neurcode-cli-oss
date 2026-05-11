/**
 * Governance Provenance Chain
 *
 * Every neurcode verify run persists a signed fingerprint record.
 * The record proves exactly why a governance decision happened:
 * which rules ran, what they found, what was suppressed, and why.
 *
 * Stored at: .neurcode/provenance/{runId}.json
 * Index:     .neurcode/provenance/index.json
 *
 * @process-local Provenance records are per-workstation/CI runner.
 * For org-wide auditability, upload records to your SIEM or audit log system.
 */
export interface ProvenanceRecord {
    runId: string;
    runAt: string;
    schemaVersion: 1;
    repoRoot: string;
    filesAnalyzed: number;
    diffContext: string;
    planId: string | null;
    intentHash: string | null;
    policyHash: string | null;
    ruleIds: string[];
    blockingCount: number;
    advisoryCount: number;
    suppressedCount: number;
    structuralBlockingCount: number;
    structuralAdvisoryCount: number;
    deterministicSignals: number;
    heuristicSignals: number;
    overallTrustScore: number;
    verdict: 'PASS' | 'FAIL' | 'WARN';
    governanceDecision: string;
    fingerprint: string;
    signature: string | null;
    signingKeyId: string | null;
}
export interface ProvenanceIndex {
    schemaVersion: 1;
    records: Array<{
        runId: string;
        runAt: string;
        verdict: string;
        planId: string | null;
        fingerprint: string;
    }>;
}
/**
 * Build a provenance record from verify run results.
 * The fingerprint is SHA-256 of: runId + runAt + ruleIds.sort().join(',') + blockingCount + verdict
 */
export declare function buildProvenanceRecord(input: {
    repoRoot: string;
    filesAnalyzed: number;
    diffContext: string;
    planId: string | null;
    intentHash: string | null;
    policyHash: string | null;
    ruleIds: string[];
    blockingCount: number;
    advisoryCount: number;
    suppressedCount: number;
    structuralBlockingCount: number;
    structuralAdvisoryCount: number;
    deterministicSignals: number;
    heuristicSignals: number;
    overallTrustScore: number;
    verdict: 'PASS' | 'FAIL' | 'WARN';
    governanceDecision: string;
}): ProvenanceRecord;
/**
 * Persist a provenance record to .neurcode/provenance/.
 * Updates the index file atomically.
 * Index retains last 1000 records (trims oldest first).
 */
export declare function saveProvenanceRecord(repoRoot: string, record: ProvenanceRecord): void;
/**
 * Load the provenance index.
 */
export declare function loadProvenanceIndex(repoRoot: string): ProvenanceIndex;
/**
 * Load a specific provenance record by runId.
 */
export declare function loadProvenanceRecord(repoRoot: string, runId: string): ProvenanceRecord | null;
/**
 * Get the last N provenance records (most recent first).
 */
export declare function getRecentProvenance(repoRoot: string, limit?: number): ProvenanceRecord[];
/**
 * Verify the integrity fingerprint of a stored record.
 * Returns true if fingerprint matches recomputed value.
 */
export declare function verifyProvenanceIntegrity(record: ProvenanceRecord): boolean;
//# sourceMappingURL=governance-provenance.d.ts.map