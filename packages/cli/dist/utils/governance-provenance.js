"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProvenanceRecord = buildProvenanceRecord;
exports.saveProvenanceRecord = saveProvenanceRecord;
exports.loadProvenanceIndex = loadProvenanceIndex;
exports.loadProvenanceRecord = loadProvenanceRecord;
exports.getRecentProvenance = getRecentProvenance;
exports.verifyProvenanceIntegrity = verifyProvenanceIntegrity;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const MAX_INDEX_RECORDS = 1000;
function provenanceDir(repoRoot) {
    return (0, path_1.join)(repoRoot, '.neurcode', 'provenance');
}
function recordPath(repoRoot, runId) {
    return (0, path_1.join)(provenanceDir(repoRoot), `${runId}.json`);
}
function indexPath(repoRoot) {
    return (0, path_1.join)(provenanceDir(repoRoot), 'index.json');
}
function computeFingerprint(runId, runAt, ruleIds, blockingCount, verdict) {
    const canonical = `${runId}|${runAt}|${ruleIds.slice().sort().join(',')}|${blockingCount}|${verdict}`;
    return (0, crypto_1.createHash)('sha256').update(canonical, 'utf8').digest('hex');
}
function atomicWrite(filePath, content) {
    const tmp = `${filePath}.tmp`;
    (0, fs_1.writeFileSync)(tmp, content, 'utf8');
    (0, fs_1.renameSync)(tmp, filePath);
}
/**
 * Build a provenance record from verify run results.
 * The fingerprint is SHA-256 of: runId + runAt + ruleIds.sort().join(',') + blockingCount + verdict
 */
function buildProvenanceRecord(input) {
    const runId = (0, crypto_1.randomUUID)();
    const runAt = new Date().toISOString();
    const fingerprint = computeFingerprint(runId, runAt, input.ruleIds, input.blockingCount, input.verdict);
    let signature = null;
    let signingKeyId = null;
    const signingKey = process.env['NEURCODE_PROVENANCE_SIGNING_KEY'] ?? null;
    if (signingKey) {
        signature = (0, crypto_1.createHmac)('sha256', signingKey).update(fingerprint, 'utf8').digest('hex');
        signingKeyId = process.env['NEURCODE_PROVENANCE_SIGNING_KEY_ID'] ?? 'env-key';
    }
    return {
        runId,
        runAt,
        schemaVersion: 1,
        repoRoot: input.repoRoot,
        filesAnalyzed: input.filesAnalyzed,
        diffContext: input.diffContext,
        planId: input.planId,
        intentHash: input.intentHash,
        policyHash: input.policyHash,
        ruleIds: input.ruleIds,
        blockingCount: input.blockingCount,
        advisoryCount: input.advisoryCount,
        suppressedCount: input.suppressedCount,
        structuralBlockingCount: input.structuralBlockingCount,
        structuralAdvisoryCount: input.structuralAdvisoryCount,
        deterministicSignals: input.deterministicSignals,
        heuristicSignals: input.heuristicSignals,
        overallTrustScore: input.overallTrustScore,
        verdict: input.verdict,
        governanceDecision: input.governanceDecision,
        fingerprint,
        signature,
        signingKeyId,
    };
}
/**
 * Persist a provenance record to .neurcode/provenance/.
 * Updates the index file atomically.
 * Index retains last 1000 records (trims oldest first).
 */
function saveProvenanceRecord(repoRoot, record) {
    try {
        const dir = provenanceDir(repoRoot);
        if (!(0, fs_1.existsSync)(dir)) {
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        }
        // Write the record file atomically
        atomicWrite(recordPath(repoRoot, record.runId), JSON.stringify(record, null, 2));
        // Update the index atomically
        const idx = loadProvenanceIndex(repoRoot);
        idx.records.push({
            runId: record.runId,
            runAt: record.runAt,
            verdict: record.verdict,
            planId: record.planId,
            fingerprint: record.fingerprint,
        });
        // Sort descending by runAt, keep last MAX_INDEX_RECORDS
        idx.records.sort((a, b) => (a.runAt < b.runAt ? 1 : a.runAt > b.runAt ? -1 : 0));
        if (idx.records.length > MAX_INDEX_RECORDS) {
            idx.records = idx.records.slice(0, MAX_INDEX_RECORDS);
        }
        atomicWrite(indexPath(repoRoot), JSON.stringify(idx, null, 2));
    }
    catch {
        // Never throw — provenance persistence is best-effort
    }
}
/**
 * Load the provenance index.
 */
function loadProvenanceIndex(repoRoot) {
    try {
        const path = indexPath(repoRoot);
        if (!(0, fs_1.existsSync)(path)) {
            return { schemaVersion: 1, records: [] };
        }
        const raw = (0, fs_1.readFileSync)(path, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.records)) {
            return { schemaVersion: 1, records: [] };
        }
        return parsed;
    }
    catch {
        return { schemaVersion: 1, records: [] };
    }
}
/**
 * Load a specific provenance record by runId.
 */
function loadProvenanceRecord(repoRoot, runId) {
    try {
        const path = recordPath(repoRoot, runId);
        if (!(0, fs_1.existsSync)(path)) {
            return null;
        }
        const raw = (0, fs_1.readFileSync)(path, 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
/**
 * Get the last N provenance records (most recent first).
 */
function getRecentProvenance(repoRoot, limit = 10) {
    try {
        const idx = loadProvenanceIndex(repoRoot);
        const entries = idx.records.slice(0, limit);
        const records = [];
        for (const entry of entries) {
            const rec = loadProvenanceRecord(repoRoot, entry.runId);
            if (rec !== null) {
                records.push(rec);
            }
        }
        return records;
    }
    catch {
        return [];
    }
}
/**
 * Verify the integrity fingerprint of a stored record.
 * Returns true if fingerprint matches recomputed value.
 */
function verifyProvenanceIntegrity(record) {
    try {
        const expected = computeFingerprint(record.runId, record.runAt, record.ruleIds, record.blockingCount, record.verdict);
        return expected === record.fingerprint;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=governance-provenance.js.map