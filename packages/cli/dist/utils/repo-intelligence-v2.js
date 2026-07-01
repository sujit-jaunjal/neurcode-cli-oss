"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_STRUCTURAL_POLICY_V2_PATH = void 0;
exports.evaluateLocalRepoIntelligenceV2 = evaluateLocalRepoIntelligenceV2;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const contracts_1 = require("@neurcode-ai/contracts");
const brain_1 = require("@neurcode-ai/brain");
const policy_engine_1 = require("@neurcode-ai/policy-engine");
exports.DEFAULT_STRUCTURAL_POLICY_V2_PATH = '.neurcode/structural-policy-v2.json';
function sha256(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
}
function missingFreshness(reasonCode) {
    return {
        state: 'missing',
        indexedAt: null,
        gitHead: null,
        workingTreeHash: null,
        staleFileCount: 0,
        unsupportedFileCount: 0,
        reasonCodes: [reasonCode],
    };
}
function notEvaluated(freshness, ruleIds = []) {
    return {
        schemaVersion: 'neurcode.policy-evaluation.v2',
        verdict: 'not_evaluated',
        truth: 'not_evaluated',
        evaluatedRuleIds: [],
        notEvaluatedRuleIds: [...ruleIds].sort(),
        findings: [],
        graphFreshness: freshness,
    };
}
function readPolicyArtifact(repoRoot, inputPath) {
    const selected = inputPath?.trim() || exports.DEFAULT_STRUCTURAL_POLICY_V2_PATH;
    const path = (0, node_path_1.isAbsolute)(selected) ? selected : (0, node_path_1.join)(repoRoot, selected);
    if (!(0, node_fs_1.existsSync)(path))
        return { path, artifact: null };
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        return { path, artifact: (0, policy_engine_1.isStructuralPolicyArtifact)(parsed) ? parsed : null };
    }
    catch {
        return { path, artifact: null };
    }
}
function activeApprovals(input) {
    const nowMs = Date.parse(input.now);
    const grants = (input.approvalGrants ?? []).filter((grant) => {
        if (grant.revokedAt)
            return false;
        if (!grant.expiresAt)
            return true;
        const expiresAt = Date.parse(grant.expiresAt);
        return Number.isFinite(expiresAt) && expiresAt > nowMs;
    });
    if (grants.length > 0) {
        return grants.map((grant) => ({
            path: grant.path,
            owners: grant.approvedBy ? [grant.approvedBy] : [],
            approvedBy: grant.approvedBy || 'session-approval',
        }));
    }
    return (input.approvedPaths ?? []).map((path) => ({
        path,
        owners: [],
        approvedBy: 'session-approval',
    }));
}
async function evaluateLocalRepoIntelligenceV2(input) {
    const generatedAt = input.generatedAt ?? new Date().toISOString();
    const policy = readPolicyArtifact(input.repoRoot, input.policyPath);
    let graph = (0, brain_1.readRepositoryGraph)(input.repoRoot);
    const freshness = graph
        ? await (0, brain_1.repositoryGraphStatus)(input.repoRoot)
        : missingFreshness('graph_missing');
    if (graph)
        graph = { ...graph, freshness };
    const evaluation = policy.artifact
        ? (0, policy_engine_1.evaluateStructuralPolicies)({
            graph,
            change: input.change,
            rules: policy.artifact.compilation.compiled,
            approvals: input.approvals ?? activeApprovals({
                approvedPaths: input.approvedPaths,
                approvalGrants: input.approvalGrants,
                now: generatedAt,
            }),
        })
        : notEvaluated(freshness, []);
    const advisory = input.includeAdvisory !== false && graph && graph.freshness.state === 'fresh'
        ? (await (0, brain_1.runSemanticAdvisory)({
            repoRoot: input.repoRoot,
            graph,
            change: input.change,
        })).findings
        : [];
    const classification = evaluation.truth === 'deterministic'
        ? 'deterministic'
        : advisory.length > 0
            ? 'advisory'
            : 'not_evaluated';
    const evidenceSeed = JSON.stringify({
        repository: input.change.repository.repoId,
        target: input.change.target,
        contentHash: input.change.content.contentHash,
        graphId: graph?.graphId ?? null,
        graphGeneration: graph?.generation ?? null,
        evaluatedRuleIds: evaluation.evaluatedRuleIds,
        notEvaluatedRuleIds: evaluation.notEvaluatedRuleIds,
        findingIds: evaluation.findings.map((finding) => finding.findingId),
        advisoryIds: advisory.map((finding) => finding.findingId),
        host: input.change.host,
    });
    const completeGraph = Boolean(graph
        && evaluation.graphFreshness.state === 'fresh'
        && evaluation.graphFreshness.posture === 'complete');
    const deterministicEvidenceEligible = completeGraph
        && evaluation.truth === 'deterministic'
        && evaluation.notEvaluatedRuleIds.length === 0;
    const enforcementCapable = ['hard_prewrite', 'cooperative_prewrite', 'supervised_write', 'ci_only']
        .includes(input.change.host.capability);
    const deterministicEnforcementEligible = deterministicEvidenceEligible && enforcementCapable;
    const enforcementIneligibilityReasons = [
        ...(!graph ? ['graph_missing'] : []),
        ...(graph && !completeGraph ? ['graph_not_complete'] : []),
        ...(evaluation.truth !== 'deterministic' ? ['policy_not_deterministically_evaluated'] : []),
        ...(evaluation.notEvaluatedRuleIds.length > 0 ? ['policy_rules_not_evaluated'] : []),
        ...(!enforcementCapable ? ['host_not_enforcement_capable'] : []),
    ];
    const evidence = {
        schemaVersion: contracts_1.REPO_INTELLIGENCE_EVIDENCE_SCHEMA_VERSION,
        evidenceId: `rie:${sha256(evidenceSeed).slice(0, 32)}`,
        generatedAt,
        classification,
        verdict: evaluation.verdict,
        enforcement: input.change.host,
        graph: {
            graphId: graph?.graphId ?? null,
            schemaVersion: graph?.schemaVersion ?? null,
            canonicalModel: 'repository_graph_v2',
            storageSchemaVersion: graph?.storage.schemaVersion ?? null,
            freshness: evaluation.graphFreshness,
            lastSuccessfulIndexAt: graph?.updatedAt ?? null,
            lastAttemptedIndexAt: graph?.updatedAt ?? null,
            unsupportedPercent: graph?.coverage.unsupportedPercent ?? null,
            coverage: graph ? {
                filesSeen: graph.coverage.filesSeen,
                filesIndexed: graph.coverage.filesIndexed,
                filesAnalyzed: graph.coverage.filesAnalyzed ?? 0,
                filesSkipped: graph.coverage.filesSkipped ?? 0,
                filesUnsupported: graph.coverage.filesUnsupported,
                filesDegraded: graph.coverage.filesDegraded ?? 0,
                filesFailed: graph.coverage.filesFailed ?? 0,
            } : null,
            deterministicEvidenceEligible,
            deterministicEnforcementEligible,
            enforcementIneligibilityReasons: Array.from(new Set(enforcementIneligibilityReasons)).sort(),
            recoveryCommand: evaluation.graphFreshness.state === 'corrupt'
                ? 'neurcode brain repo-recover'
                : 'neurcode brain repo-index',
            runtimeCompatibility: {
                contractId: contracts_1.RUNTIME_COMPATIBILITY_CONTRACT_ID,
                runtimeContractVersion: contracts_1.RUNTIME_COMPATIBILITY_CONTRACT_VERSION,
                manifestVersion: contracts_1.RUNTIME_COMPATIBILITY_MANIFEST_VERSION,
                component: 'cli',
            },
            summary: graph ? {
                languages: graph.coverage.languages.map((item) => ({
                    language: item.language,
                    depth: item.depth,
                    filesSeen: item.filesSeen,
                    filesAnalyzed: item.filesAnalyzed,
                    filesUnsupported: item.filesUnsupported,
                })),
                packages: graph.nodes
                    .filter((node) => node.kind === 'package')
                    .map((node) => node.name ?? node.key)
                    .filter((value, index, values) => values.indexOf(value) === index)
                    .sort()
                    .slice(0, 100),
                services: graph.nodes
                    .filter((node) => node.kind === 'service')
                    .map((node) => node.name ?? node.key)
                    .filter((value, index, values) => values.indexOf(value) === index)
                    .sort()
                    .slice(0, 100),
                ownershipZoneCount: graph.nodes.filter((node) => node.kind === 'ownership_zone').length,
                sensitiveSurfaceCount: graph.nodes.filter((node) => node.kind === 'sensitive_surface').length,
            } : undefined,
            coverageAuthority: graph?.coverageAuthority ?? null,
            relationshipAuthority: graph?.coverageAuthority ? {
                impactAuthority: graph.coverageAuthority.impactAuthority,
                reasonCodes: [...graph.coverageAuthority.reasonCodes].sort(),
            } : undefined,
        },
        policy: {
            evaluatedRuleIds: evaluation.evaluatedRuleIds,
            notEvaluatedRuleIds: evaluation.notEvaluatedRuleIds,
            findings: evaluation.findings,
        },
        advisory,
        signature: {
            trust: 'self_attested',
            receiptId: null,
            recordHash: null,
        },
        privacy: (0, contracts_1.sourceFreePrivacyContract)(),
    };
    return {
        evidence,
        policyConfigured: Boolean(policy.artifact),
        policyPath: policy.path,
        evaluation,
    };
}
//# sourceMappingURL=repo-intelligence-v2.js.map