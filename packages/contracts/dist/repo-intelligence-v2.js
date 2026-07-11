"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LANGUAGE_COVERAGE_MATRIX_SCHEMA_VERSION = exports.REPO_INTELLIGENCE_OPERATIONS_SCHEMA_VERSION = exports.REPO_INTELLIGENCE_EVIDENCE_SCHEMA_VERSION = exports.SEMANTIC_ADVISORY_SCHEMA_VERSION = exports.POLICY_EVALUATION_SCHEMA_VERSION = exports.COMPILED_STRUCTURAL_POLICY_SCHEMA_VERSION = exports.PROPOSED_CHANGE_ENVELOPE_SCHEMA_VERSION = exports.REPOSITORY_GRAPH_SCHEMA_VERSION = void 0;
exports.assertSourceFreeRepoIntelligence = assertSourceFreeRepoIntelligence;
exports.isRepoIntelligenceEvidence = isRepoIntelligenceEvidence;
exports.sourceFreePrivacyContract = sourceFreePrivacyContract;
exports.REPOSITORY_GRAPH_SCHEMA_VERSION = 'neurcode.repository-graph.v2.1';
exports.PROPOSED_CHANGE_ENVELOPE_SCHEMA_VERSION = 'neurcode.proposed-change.v2';
exports.COMPILED_STRUCTURAL_POLICY_SCHEMA_VERSION = 'neurcode.compiled-structural-policy.v2';
exports.POLICY_EVALUATION_SCHEMA_VERSION = 'neurcode.policy-evaluation.v2';
exports.SEMANTIC_ADVISORY_SCHEMA_VERSION = 'neurcode.semantic-advisory.v2';
exports.REPO_INTELLIGENCE_EVIDENCE_SCHEMA_VERSION = 'neurcode.repo-intelligence-evidence.v2';
exports.REPO_INTELLIGENCE_OPERATIONS_SCHEMA_VERSION = 'neurcode.repo-intelligence-operations.v1';
exports.LANGUAGE_COVERAGE_MATRIX_SCHEMA_VERSION = 'neurcode.language-coverage-matrix.v1';
const SOURCE_LIKE_KEYS = new Set([
    'content',
    'source',
    'sourcetext',
    'sourcecode',
    'diff',
    'patch',
    'before',
    'after',
    'rawprompt',
    'rawchat',
    'terminaloutput',
    'secret',
]);
function normalizedKey(key) {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}
function assertSourceFreeRepoIntelligence(value, path = 'payload') {
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertSourceFreeRepoIntelligence(item, `${path}[${index}]`));
        return;
    }
    if (!value || typeof value !== 'object')
        return;
    for (const [key, child] of Object.entries(value)) {
        if (SOURCE_LIKE_KEYS.has(normalizedKey(key))) {
            throw new Error(`source-like repository intelligence field is not allowed: ${path}.${key}`);
        }
        assertSourceFreeRepoIntelligence(child, `${path}.${key}`);
    }
}
function isRepoIntelligenceEvidence(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const record = value;
    if (record.schemaVersion !== exports.REPO_INTELLIGENCE_EVIDENCE_SCHEMA_VERSION)
        return false;
    if (typeof record.evidenceId !== 'string' || typeof record.generatedAt !== 'string')
        return false;
    if (!['deterministic', 'backend_signed', 'advisory', 'not_evaluated'].includes(String(record.classification)))
        return false;
    if (!['allow', 'warn', 'block', 'not_evaluated'].includes(String(record.verdict)))
        return false;
    const enforcement = record.enforcement;
    if (!enforcement || ![
        'hard_prewrite', 'cooperative_prewrite', 'supervised_write',
        'post_write', 'ci_only', 'not_supported',
    ].includes(String(enforcement.capability)))
        return false;
    const graph = record.graph;
    const policy = record.policy;
    const privacy = record.privacy;
    if (!graph || !policy || !privacy)
        return false;
    if (graph.canonicalModel !== undefined && graph.canonicalModel !== 'repository_graph_v2')
        return false;
    if (graph.storageSchemaVersion !== undefined && graph.storageSchemaVersion !== null
        && (typeof graph.storageSchemaVersion !== 'number'
            || !Number.isInteger(graph.storageSchemaVersion) || graph.storageSchemaVersion < 0))
        return false;
    for (const key of ['lastSuccessfulIndexAt', 'lastAttemptedIndexAt']) {
        if (graph[key] !== undefined && graph[key] !== null && typeof graph[key] !== 'string')
            return false;
    }
    for (const key of ['deterministicEvidenceEligible', 'deterministicEnforcementEligible']) {
        if (graph[key] !== undefined && typeof graph[key] !== 'boolean')
            return false;
    }
    if (graph.enforcementIneligibilityReasons !== undefined && (!Array.isArray(graph.enforcementIneligibilityReasons)
        || graph.enforcementIneligibilityReasons.length > 64
        || !graph.enforcementIneligibilityReasons.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 128)))
        return false;
    if (graph.recoveryCommand !== undefined
        && !['neurcode brain repo-index', 'neurcode brain repo-recover'].includes(String(graph.recoveryCommand)))
        return false;
    if (graph.coverage !== undefined && graph.coverage !== null) {
        if (typeof graph.coverage !== 'object' || Array.isArray(graph.coverage))
            return false;
        const coverage = graph.coverage;
        for (const key of ['filesSeen', 'filesIndexed', 'filesAnalyzed', 'filesSkipped', 'filesUnsupported', 'filesDegraded', 'filesFailed']) {
            if (typeof coverage[key] !== 'number' || !Number.isInteger(coverage[key]) || Number(coverage[key]) < 0)
                return false;
        }
    }
    if (graph.runtimeCompatibility !== undefined) {
        if (!graph.runtimeCompatibility || typeof graph.runtimeCompatibility !== 'object' || Array.isArray(graph.runtimeCompatibility))
            return false;
        const compatibility = graph.runtimeCompatibility;
        if (compatibility.component !== 'cli')
            return false;
        for (const key of ['contractId', 'runtimeContractVersion', 'manifestVersion']) {
            if (typeof compatibility[key] !== 'string' || compatibility[key].length === 0)
                return false;
        }
    }
    if (!Array.isArray(policy.evaluatedRuleIds) || !Array.isArray(policy.notEvaluatedRuleIds) || !Array.isArray(policy.findings))
        return false;
    if (!Array.isArray(record.advisory))
        return false;
    if (privacy.sourceUploaded !== false || privacy.sourceStored !== false ||
        privacy.diffUploaded !== false || privacy.promptUploaded !== false ||
        privacy.chatUploaded !== false || privacy.rawContentRetained !== false)
        return false;
    try {
        assertSourceFreeRepoIntelligence(value);
    }
    catch {
        return false;
    }
    return true;
}
function sourceFreePrivacyContract() {
    return {
        sourceUploaded: false,
        sourceStored: false,
        diffUploaded: false,
        promptUploaded: false,
        chatUploaded: false,
        rawContentRetained: false,
    };
}
//# sourceMappingURL=repo-intelligence-v2.js.map