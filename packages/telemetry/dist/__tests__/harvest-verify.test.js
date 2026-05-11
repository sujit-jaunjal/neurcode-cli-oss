"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Run: npx tsx packages/telemetry/src/__tests__/harvest-verify.test.ts
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const harvest_verify_1 = require("../harvest-verify");
const trust_scoring_1 = require("../trust-scoring");
const leaderboards_1 = require("../precision/leaderboards");
const contracts_1 = require("../contracts");
(0, node_test_1.describe)('harvestGovernanceVerifyCompleted', () => {
    (0, node_test_1.test)('aggregates counts without leaking excerpts', () => {
        const canonical = {
            verdict: 'FAIL',
            ciMode: true,
            policyOnly: false,
            governanceVerification: {
                schemaVersion: 'v1',
                generatedAt: '2026-01-01T00:00:00.000Z',
                compressedDuplicateCount: 2,
                replayIntegrity: { status: 'exact', missingArtifacts: [], provenanceMismatches: [], graphMismatches: [], semanticTruncationMismatches: [], notes: [] },
                findings: [
                    {
                        id: 'a',
                        severity: 'BLOCKING',
                        determinismClassification: 'deterministic-structural',
                        suppressionMetadata: { suppressed: true, directive: 'suppress' },
                        structuralMetadata: { ruleId: 'SR001' },
                    },
                    {
                        id: 'b',
                        severity: 'ADVISORY',
                        determinismClassification: 'heuristic-advisory',
                        structuralMetadata: { ruleId: 'SR002' },
                    },
                ],
            },
        };
        const out = (0, harvest_verify_1.harvestGovernanceVerifyCompleted)(canonical);
        strict_1.default.ok(out);
        strict_1.default.equal(out.payload.governanceFindingCount, 2);
        strict_1.default.equal(out.payload.suppressedFindingCount, 1);
        strict_1.default.equal(out.payload.structuralRuleTriggerHistogram.SR001, 1);
        strict_1.default.equal(out.payload.structuralRuleSuppressionHistogram.SR001, 1);
        strict_1.default.equal(out.payload.replayIntegrityStatus, 'exact');
        strict_1.default.ok(out.findingSetDigest.length === 64);
    });
});
(0, node_test_1.describe)('trust and leaderboards', () => {
    (0, node_test_1.test)('bounded scores', () => {
        const canonical = (0, harvest_verify_1.harvestGovernanceVerifyCompleted)({
            verdict: 'PASS',
            governanceVerification: {
                findings: [
                    {
                        id: 'x',
                        severity: 'BLOCKING',
                        determinismClassification: 'deterministic-structural',
                        suppressionMetadata: { suppressed: false },
                        structuralMetadata: { ruleId: 'SR010' },
                    },
                ],
                compressedDuplicateCount: 0,
                replayIntegrity: { status: 'bounded-degradation', missingArtifacts: ['a'], provenanceMismatches: [], graphMismatches: [], semanticTruncationMismatches: [], notes: [] },
            },
        });
        strict_1.default.ok(canonical);
        const t = (0, trust_scoring_1.trustFromVerifyPayload)(canonical.payload);
        strict_1.default.ok(t.governanceUsefulnessScore >= 0 && t.governanceUsefulnessScore <= 1);
        strict_1.default.equal(t.replayTrustScore, 0.65);
        const ev = {
            schemaVersion: contracts_1.GOVERNANCE_TELEMETRY_SCHEMA_VERSION,
            emittedAt: '2026-01-01T00:00:00.000Z',
            eventType: 'governance.verify.completed',
            findingSetDigest: 'x'.repeat(64),
            payload: canonical.payload,
        };
        const rollup = (0, leaderboards_1.rollupRulePrecisionFromEvents)([ev]);
        const noisy = (0, leaderboards_1.noisyRuleLeaderboard)(rollup);
        strict_1.default.ok(Array.isArray(noisy));
    });
});
