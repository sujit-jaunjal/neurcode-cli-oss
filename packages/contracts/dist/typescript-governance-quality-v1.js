"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOVERNANCE_RECONSTRUCTION_SCHEMA_VERSION = exports.GOVERNANCE_QUALITY_SCHEMA_VERSION = exports.REPOSITORY_CONTEXT_PACKAGE_SCHEMA_VERSION = void 0;
exports.calculateGovernanceQualityRates = calculateGovernanceQualityRates;
exports.hostRunCountsAsRealEvidence = hostRunCountsAsRealEvidence;
exports.evaluateGovernanceReconstruction = evaluateGovernanceReconstruction;
exports.REPOSITORY_CONTEXT_PACKAGE_SCHEMA_VERSION = 'neurcode.repository-context-package.v1';
exports.GOVERNANCE_QUALITY_SCHEMA_VERSION = 'neurcode.governance-quality.v1';
exports.GOVERNANCE_RECONSTRUCTION_SCHEMA_VERSION = 'neurcode.governance-reconstruction.v1';
function safeRate(numerator, denominator) {
    return denominator > 0 ? numerator / denominator : null;
}
function calculateGovernanceQualityRates(matrix, notEvaluated = 0) {
    const evaluated = matrix.tp + matrix.fp + matrix.fn + matrix.tn;
    return {
        precision: safeRate(matrix.tp, matrix.tp + matrix.fp),
        recall: safeRate(matrix.tp, matrix.tp + matrix.fn),
        specificity: safeRate(matrix.tn, matrix.tn + matrix.fp),
        falsePositiveRate: safeRate(matrix.fp, matrix.fp + matrix.tn),
        notEvaluatedRate: safeRate(notEvaluated, evaluated + notEvaluated),
        zeroData: evaluated + notEvaluated === 0,
    };
}
function hostRunCountsAsRealEvidence(run) {
    return run.includeInRealHostMetrics === true && run.status !== 'shimmed' && run.status !== 'unavailable';
}
function evaluateGovernanceReconstruction(input) {
    const required = ['engineVersion', 'graphHash', 'policyHash', 'planContextHash', 'inputDiffHash', 'reconstructedFindingsHash', 'decisionChecksum'];
    const missing = required.filter((key) => !input.expected[key]);
    const actual = input.actual ?? {
        engineVersion: null, graphHash: null, policyHash: null, planContextHash: null,
        inputDiffHash: null, reconstructedFindingsHash: null, decisionChecksum: null,
    };
    const drift = input.reconstructionAttempted
        ? required.filter((key) => input.expected[key] !== actual[key])
        : [];
    const artifactComplete = missing.length === 0;
    const status = !artifactComplete
        ? 'artifact_incomplete'
        : !input.reconstructionAttempted
            ? 'artifact_complete_not_reconstructed'
            : drift.length > 0
                ? 'reconstruction_mismatch'
                : 'exact_reconstruction';
    return {
        schemaVersion: exports.GOVERNANCE_RECONSTRUCTION_SCHEMA_VERSION,
        status,
        artifactComplete,
        reconstructionAttempted: input.reconstructionAttempted,
        hashes: actual,
        expectedDecisionChecksum: input.expected.decisionChecksum,
        reasonCodes: [
            ...missing.map((key) => `missing_${key}`),
            ...drift.map((key) => `${key}_drift`),
            ...(!input.reconstructionAttempted && artifactComplete ? ['reconstruction_not_attempted'] : []),
        ].sort(),
    };
}
//# sourceMappingURL=typescript-governance-quality-v1.js.map