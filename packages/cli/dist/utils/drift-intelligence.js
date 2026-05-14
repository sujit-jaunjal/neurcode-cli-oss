"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDriftIntelligence = buildDriftIntelligence;
exports.buildContextAwareBlastRadius = buildContextAwareBlastRadius;
const crypto_1 = require("crypto");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const intelligence_runtime_common_1 = require("./intelligence-runtime-common");
const governance_decisions_1 = require("./governance-decisions");
function hashId(parts) {
    return (0, crypto_1.createHash)('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}
function governanceLineageHash(parts) {
    return (0, crypto_1.createHash)('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
}
function emptyDecisionSummary(sourcePath = null, expiredOverrides = 0) {
    return {
        sourcePath,
        decisionsApplied: 0,
        activeOverrides: 0,
        expiredOverrides,
        findingsChanged: 0,
        lineage: [],
    };
}
function deriveModulePath(filePath) {
    const normalized = (0, intelligence_runtime_common_1.normalizeRepoPath)(filePath);
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length <= 1)
        return parts[0] || normalized;
    if (['src', 'app', 'apps', 'services', 'packages', 'libs', 'lib', 'web'].includes(parts[0]) && parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
    }
    return parts[0];
}
function classifyArchitectureLayer(pathValue) {
    const normalized = (0, intelligence_runtime_common_1.normalizeRepoPath)(pathValue).toLowerCase();
    if (normalized.startsWith('.github/') || normalized.includes('/ci/'))
        return 'ci';
    if (normalized.startsWith('infra/')
        || normalized.startsWith('terraform/')
        || normalized.startsWith('helm/')
        || normalized.startsWith('k8s/')
        || normalized.includes('/deploy/')
        || normalized.includes('/docker/')) {
        return 'infra';
    }
    if (normalized.includes('/migrations/')
        || normalized.includes('/db/')
        || normalized.includes('/database/')
        || normalized.includes('/models/')
        || normalized.includes('/model/')
        || normalized.includes('prisma')
        || normalized.includes('typeorm')
        || normalized.includes('sequelize')) {
        return 'data';
    }
    if (normalized.includes('openapi')
        || normalized.includes('graphql')
        || normalized.includes('schema')
        || normalized.includes('contract')
        || normalized.includes('/dto/')
        || normalized.endsWith('.proto')) {
        return 'contract';
    }
    if (normalized.includes('/routes/')
        || normalized.includes('/route/')
        || normalized.includes('/controllers/')
        || normalized.includes('/controller/')
        || normalized.includes('/handlers/')
        || normalized.includes('/handler/')
        || normalized.includes('/api/')) {
        return 'api';
    }
    if (normalized.includes('/ui/')
        || normalized.includes('/web/')
        || normalized.includes('/frontend/')
        || normalized.includes('/components/')
        || normalized.includes('/pages/')
        || normalized.includes('/views/')) {
        return 'ui';
    }
    if (normalized.includes('/worker/')
        || normalized.includes('/workers/')
        || normalized.includes('/queue/')
        || normalized.includes('/queues/')
        || normalized.includes('/events/')
        || normalized.includes('/jobs/')
        || normalized.includes('/job/')) {
        return 'worker';
    }
    if (normalized.includes('/shared/')
        || normalized.includes('/common/')
        || normalized.includes('/lib/')
        || normalized.includes('/libs/')) {
        return 'shared';
    }
    if (normalized.startsWith('docs/') || normalized.endsWith('.md')) {
        return 'docs';
    }
    if (normalized.endsWith('.rst')
        || normalized.endsWith('.adoc')
        || normalized === 'readme'
        || normalized.startsWith('readme.')
        || normalized === 'changelog'
        || normalized.startsWith('changelog.')
        || normalized === 'changes'
        || normalized.startsWith('changes.')) {
        return 'docs';
    }
    if (normalized.includes('/test/')
        || normalized.includes('/tests/')
        || normalized.includes('/__tests__/')
        || normalized.endsWith('.spec.ts')
        || normalized.endsWith('.test.ts')
        || normalized.endsWith('.spec.tsx')
        || normalized.endsWith('.test.tsx')
        || normalized.endsWith('.spec.js')
        || normalized.endsWith('.test.js')
        || normalized.endsWith('.spec.py')
        || normalized.endsWith('.test.py')) {
        return 'test';
    }
    return 'service';
}
function isSupportOnlyPath(pathValue) {
    const layer = classifyArchitectureLayer(pathValue);
    return layer === 'docs' || layer === 'test';
}
function matchServiceBoundary(boundaries, fileOrModulePath) {
    const normalized = (0, intelligence_runtime_common_1.normalizeRepoPath)(fileOrModulePath);
    let best = null;
    let bestLength = -1;
    for (const boundary of boundaries) {
        const pathValue = (0, intelligence_runtime_common_1.normalizeRepoPath)(boundary.path);
        if (normalized === pathValue
            || normalized.startsWith(`${pathValue}/`)
            || pathValue.startsWith(`${normalized}/`)) {
            if (pathValue.length > bestLength) {
                best = boundary.name;
                bestLength = pathValue.length;
            }
        }
    }
    return best;
}
function matchOwnershipBoundary(boundaries, fileOrModulePath) {
    const normalized = (0, intelligence_runtime_common_1.normalizeRepoPath)(fileOrModulePath);
    let best = null;
    let bestLength = -1;
    for (const boundary of boundaries) {
        const pathValue = (0, intelligence_runtime_common_1.normalizeRepoPath)(boundary.path);
        if (normalized === pathValue
            || normalized.startsWith(`${pathValue}/`)
            || pathValue.startsWith(`${normalized}/`)) {
            if (pathValue.length > bestLength) {
                best = boundary;
                bestLength = pathValue.length;
            }
        }
    }
    return best;
}
const RESPONSIBILITY_PATTERNS = {
    authentication: [/\b(auth|oauth|rbac|permission|jwt|session|identity|token)\b/i],
    authorization: [/\b(authz|authorize|permission|access control|rbac|acl)\b/i],
    'credential-validation': [/\b(secret|credential|password|token|api[_-]?key|process\.env)\b/i],
    'payment-orchestration': [/\b(payment|billing|invoice|refund|charge|settlement|checkout)\b/i],
    'billing-state': [/\b(invoice|ledger|refund|charge|billing)\b/i],
    'settlement-coordination': [/\b(settle|reconcile|payout|refund)\b/i],
    'notification-delivery': [/\b(notification|notify|email|sms|alert|webhook)\b/i],
    'message-formatting': [/\b(template|render|subject|body|payload)\b/i],
    'event-fanout': [/\b(publish|subscribe|fanout|topic|event bus|kafka|sqs|sns)\b/i],
    'request-routing': [/\b(route|router|controller|handler|gateway|graphql|rest)\b/i],
    'contract-translation': [/\b(schema|dto|openapi|proto|graphql|contract|serialize|deserialize)\b/i],
    'boundary-validation': [/\b(validate|validator|schema|guard)\b/i],
    'background-processing': [/\b(worker|job|queue|consumer|cron|schedule)\b/i],
    'event-consumption': [/\b(consume|consumer|listen|listener|handler|event)\b/i],
    'async-coordination': [/\b(async|await|queue|retry|backoff|schedule)\b/i],
    'shared-utilities': [/\b(util|helper|common|shared|format|parse)\b/i],
    'cross-cutting-support': [/\b(logging|metrics|telemetry|tracing|feature flag)\b/i],
    'common-types': [/\b(type|interface|schema|contract)\b/i],
    'persistence-modeling': [/\b(model|entity|schema|migration|prisma|sequelize|typeorm)\b/i],
    'data-access': [/\b(select|insert|update|delete|query|transaction|redis|postgres|mysql|mongo)\b/i],
    'storage-schema': [/\b(migration|ddl|table|column|index|constraint)\b/i],
    'presentation': [/\b(component|view|page|template|render|jsx|tsx)\b/i],
    'interaction-handling': [/\b(click|submit|form|input|event handler|useState)\b/i],
    'view-composition': [/\b(layout|section|component|view model)\b/i],
    'service-domain-logic': [/\b(rule|policy|eligibility|orchestrate|business|workflow)\b/i],
    'bounded-business-behavior': [/\b(domain|service|policy|workflow|orchestrate)\b/i],
    'direct-persistence-mutation': [/\b(prisma|sequelize|typeorm|knex|insert|update|delete|redis|postgres|mysql|mongo)\b/i],
    'credential-authority': [/\b(secret|credential|password|api[_-]?key|process\.env|oauth|jwt)\b/i],
    'deployment-control': [/\b(terraform|helm|k8s|deploy|deployment|docker|rollout|release)\b/i],
    'auth-state-mutation': [/\b(auth|identity|session|permission|rbac|token)\b/i],
    'payment-settlement': [/\b(payment|billing|invoice|refund|charge|settlement)\b/i],
    'business-orchestration': [/\b(orchestrate|workflow|coordinator|saga|pipeline)\b/i],
    'domain-orchestration': [/\b(orchestrate|workflow|coordinator|eligibility|settlement|checkout)\b/i],
    'cross-domain-orchestration': [/\b(orchestrate|workflow|coordinator|saga|fanout)\b/i],
    'ui-presentation': [/\b(component|view|page|template|render|css|jsx|tsx)\b/i],
};
const EVIDENCE_PATTERNS = {
    stateMutation: /(prisma|typeorm|sequelize|knex|select\s+|insert\s+|update\s+|delete\s+|redis|postgres|mysql|mongo|session\.commit|transaction)/i,
    externalSideEffect: /(webhook|httpx|requests\.|fetch\(|axios|kafka|sqs|sns|publish|subscribe|send_email|smtp|external)/i,
    deploymentSemantic: /(rollout|deploy|deployment|helm|kubernetes|docker|terraform)/i,
    sensitiveRuntime: /(process\.env|secret|token|jwt|credential|password|api[_-]?key)/i,
    contractSurface: /(graphql|openapi|proto|dto|schema|contract)/i,
};
function detectResponsibilitySignals(content) {
    const matches = Object.entries(RESPONSIBILITY_PATTERNS)
        .filter(([, patterns]) => patterns.some((pattern) => pattern.test(content)))
        .map(([responsibility]) => responsibility);
    return (0, intelligence_runtime_common_1.dedupeSorted)(matches);
}
function criticalityToSeverity(criticality, defaultSeverity) {
    if (criticality === 'critical') {
        return defaultSeverity === 'medium' || defaultSeverity === 'low' ? 'high' : 'critical';
    }
    if (criticality === 'sensitive' && defaultSeverity === 'medium') {
        return 'high';
    }
    return defaultSeverity;
}
function buildModuleAdjacency(graph) {
    const outgoing = new Map();
    const incoming = new Map();
    for (const edge of graph.edges) {
        if (edge.type !== 'imports')
            continue;
        if (!edge.from.startsWith('module:') || !edge.to.startsWith('module:'))
            continue;
        const from = edge.from.slice('module:'.length);
        const to = edge.to.slice('module:'.length);
        if (!outgoing.has(from))
            outgoing.set(from, new Set());
        if (!incoming.has(to))
            incoming.set(to, new Set());
        outgoing.get(from)?.add(to);
        incoming.get(to)?.add(from);
    }
    return { outgoing, incoming };
}
function severityRank(severity) {
    switch (severity) {
        case 'critical':
            return 5;
        case 'high':
            return 4;
        case 'medium':
            return 3;
        case 'low':
            return 2;
        default:
            return 1;
    }
}
function narrativeSeverityRank(severity) {
    return severityRank(severity);
}
function maxRisk(left, right) {
    const rank = (value) => (value === 'high' ? 3 : value === 'medium' ? 2 : 1);
    return rank(left) >= rank(right) ? left : right;
}
function severityToRisk(severity) {
    if (severity === 'critical')
        return 'critical';
    if (severity === 'high')
        return 'high';
    if (severity === 'medium')
        return 'medium';
    return 'low';
}
function maxSeverity(left, right) {
    return severityRank(left) >= severityRank(right) ? left : right;
}
function findBoundaryPolicy(boundaries, filePath) {
    const normalized = (0, intelligence_runtime_common_1.normalizeRepoPath)(filePath);
    let best = null;
    let bestLength = -1;
    for (const boundary of boundaries) {
        const pathValue = (0, intelligence_runtime_common_1.normalizeRepoPath)(boundary.path);
        if (normalized === pathValue
            || normalized.startsWith(`${pathValue}/`)
            || pathValue.startsWith(`${normalized}/`)) {
            if (pathValue.length > bestLength) {
                best = boundary;
                bestLength = pathValue.length;
            }
        }
    }
    return best;
}
function containsCriticalDomain(value) {
    if (!value)
        return false;
    return /(auth|token|secret|credential|permission|billing|payment|deploy|infra|migration|database|db)/i.test(value);
}
function summarizeValues(values, maxItems = 3) {
    const unique = (0, intelligence_runtime_common_1.dedupeSorted)(values).filter(Boolean);
    if (unique.length === 0)
        return 'none';
    const head = unique.slice(0, maxItems);
    return `${head.join(', ')}${unique.length > maxItems ? ` +${unique.length - maxItems} more` : ''}`;
}
function safeReadRepoFile(projectRoot, filePath) {
    const fullPath = (0, path_1.join)(projectRoot, (0, intelligence_runtime_common_1.normalizeRepoPath)(filePath));
    if (!(0, fs_1.existsSync)(fullPath)) {
        return null;
    }
    try {
        const content = (0, fs_1.readFileSync)(fullPath, 'utf-8');
        return content.slice(0, 24_000);
    }
    catch {
        return null;
    }
}
function collectGitAddedLines(projectRoot, changedFiles) {
    const eligibleFiles = changedFiles
        .map(intelligence_runtime_common_1.normalizeRepoPath)
        .filter((filePath) => filePath && !isSupportOnlyPath(filePath))
        .slice(0, 96);
    if (eligibleFiles.length === 0) {
        return new Map();
    }
    let diffOutput = '';
    try {
        diffOutput = (0, child_process_1.execFileSync)('git', ['diff', '--no-ext-diff', '--unified=0', '--', ...eligibleFiles], { cwd: projectRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    }
    catch {
        return new Map();
    }
    const addedLinesByFile = new Map();
    let currentFile = null;
    let currentLine = 0;
    for (const rawLine of diffOutput.split(/\r?\n/)) {
        if (rawLine.startsWith('+++ b/')) {
            currentFile = (0, intelligence_runtime_common_1.normalizeRepoPath)(rawLine.slice('+++ b/'.length));
            if (!addedLinesByFile.has(currentFile)) {
                addedLinesByFile.set(currentFile, []);
            }
            continue;
        }
        const hunk = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (hunk) {
            currentLine = Number(hunk[1]);
            continue;
        }
        if (!currentFile || rawLine.length === 0) {
            continue;
        }
        if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
            const text = rawLine.slice(1);
            addedLinesByFile.get(currentFile)?.push({
                file: currentFile,
                line: currentLine,
                text: text.length > 220 ? `${text.slice(0, 217)}...` : text,
            });
            currentLine += 1;
            continue;
        }
        if (!rawLine.startsWith('-')) {
            currentLine += 1;
        }
    }
    return addedLinesByFile;
}
function selectLineEvidence(addedLinesByFile, filePath, pattern) {
    return (addedLinesByFile.get((0, intelligence_runtime_common_1.normalizeRepoPath)(filePath)) || [])
        .filter((line) => pattern.test(line.text))
        .slice(0, 6);
}
function collectChangedFileEvidence(projectRoot, changedFiles) {
    const stateMutationFiles = [];
    const externalSideEffectFiles = [];
    const deploymentSemanticFiles = [];
    const sensitiveRuntimeFiles = [];
    const contractSurfaceFiles = [];
    const stateMutationLines = [];
    const externalSideEffectLines = [];
    const deploymentSemanticLines = [];
    const sensitiveRuntimeLines = [];
    const contractSurfaceLines = [];
    const addedLinesByFile = collectGitAddedLines(projectRoot, changedFiles);
    for (const filePath of changedFiles.slice(0, 32)) {
        if (isSupportOnlyPath(filePath))
            continue;
        const content = safeReadRepoFile(projectRoot, filePath);
        if (!content)
            continue;
        const stateLines = selectLineEvidence(addedLinesByFile, filePath, EVIDENCE_PATTERNS.stateMutation);
        const sideEffectLines = selectLineEvidence(addedLinesByFile, filePath, EVIDENCE_PATTERNS.externalSideEffect);
        const deploymentLines = selectLineEvidence(addedLinesByFile, filePath, EVIDENCE_PATTERNS.deploymentSemantic);
        const sensitiveLines = selectLineEvidence(addedLinesByFile, filePath, EVIDENCE_PATTERNS.sensitiveRuntime);
        const contractLines = selectLineEvidence(addedLinesByFile, filePath, EVIDENCE_PATTERNS.contractSurface);
        stateMutationLines.push(...stateLines);
        externalSideEffectLines.push(...sideEffectLines);
        deploymentSemanticLines.push(...deploymentLines);
        sensitiveRuntimeLines.push(...sensitiveLines);
        contractSurfaceLines.push(...contractLines);
        if (EVIDENCE_PATTERNS.stateMutation.test(content)) {
            stateMutationFiles.push(filePath);
        }
        if (EVIDENCE_PATTERNS.externalSideEffect.test(content)) {
            externalSideEffectFiles.push(filePath);
        }
        if (EVIDENCE_PATTERNS.deploymentSemantic.test(content)) {
            deploymentSemanticFiles.push(filePath);
        }
        if (EVIDENCE_PATTERNS.sensitiveRuntime.test(content)) {
            sensitiveRuntimeFiles.push(filePath);
        }
        if (EVIDENCE_PATTERNS.contractSurface.test(content)) {
            contractSurfaceFiles.push(filePath);
        }
    }
    return {
        stateMutationFiles: (0, intelligence_runtime_common_1.dedupeSortedPaths)(stateMutationFiles),
        externalSideEffectFiles: (0, intelligence_runtime_common_1.dedupeSortedPaths)(externalSideEffectFiles),
        deploymentSemanticFiles: (0, intelligence_runtime_common_1.dedupeSortedPaths)(deploymentSemanticFiles),
        sensitiveRuntimeFiles: (0, intelligence_runtime_common_1.dedupeSortedPaths)(sensitiveRuntimeFiles),
        contractSurfaceFiles: (0, intelligence_runtime_common_1.dedupeSortedPaths)(contractSurfaceFiles),
        stateMutationLines,
        externalSideEffectLines,
        deploymentSemanticLines,
        sensitiveRuntimeLines,
        contractSurfaceLines,
        addedLinesByFile,
    };
}
function linesForFile(lines, filePath) {
    if (!filePath)
        return [];
    const normalized = (0, intelligence_runtime_common_1.normalizeRepoPath)(filePath);
    return lines.filter((line) => (0, intelligence_runtime_common_1.normalizeRepoPath)(line.file) === normalized).slice(0, 6);
}
function categoryLineEvidence(category, filePath, changedFileEvidence) {
    switch (category) {
        case 'state-ownership-risk':
        case 'layer-violation':
            return linesForFile(changedFileEvidence.stateMutationLines, filePath);
        case 'deployment-coupling':
        case 'rollout-risk':
        case 'infra-leakage':
            return linesForFile(changedFileEvidence.deploymentSemanticLines, filePath);
        case 'sensitive-boundary':
            return linesForFile(changedFileEvidence.sensitiveRuntimeLines, filePath);
        case 'contract-misuse':
            return linesForFile(changedFileEvidence.contractSurfaceLines, filePath);
        case 'behavioral-drift':
        case 'runtime-coupling':
            return linesForFile(changedFileEvidence.externalSideEffectLines, filePath);
        default:
            return filePath ? (changedFileEvidence.addedLinesByFile.get((0, intelligence_runtime_common_1.normalizeRepoPath)(filePath)) || []).slice(0, 3) : [];
    }
}
function defaultEvidenceTier(finding, changedFileEvidence) {
    if (finding.file && categoryLineEvidence(finding.category, finding.file, changedFileEvidence).length > 0) {
        return 'direct-diff';
    }
    if (finding.file) {
        return 'direct-file';
    }
    if (finding.category === 'blast-radius' || finding.category === 'rollout-risk' || finding.category === 'runtime-coupling') {
        return 'topology-only';
    }
    return 'bounded-inference';
}
function defaultActionability(category, severity, evidenceTier) {
    if (evidenceTier === 'direct-diff') {
        return 'directly-actionable';
    }
    if (evidenceTier === 'topology-only' && (severity === 'info' || severity === 'low')) {
        return 'informational';
    }
    if (category === 'blast-radius' || category === 'rollout-risk') {
        return 'review-required';
    }
    return 'review-required';
}
function isBoundaryViolationCategory(category) {
    return [
        'scope-expansion',
        'cross-service',
        'dependency-spread',
        'infra-leakage',
        'sensitive-boundary',
        'ownership-inversion',
        'layer-violation',
        'contract-misuse',
        'responsibility-drift',
        'invariant-violation',
        'deployment-coupling',
        'state-ownership-risk',
    ].includes(category);
}
function isDeploymentRelevantCategory(category) {
    return category === 'deployment-coupling'
        || category === 'infra-leakage'
        || category === 'rollout-risk'
        || category === 'dependency-spread';
}
function deriveGovernancePriority(finding) {
    const evidenceTier = finding.evidenceTier || 'bounded-inference';
    const actionability = finding.actionability || defaultActionability(finding.category, finding.severity, evidenceTier);
    if (isDeploymentRelevantCategory(finding.category)
        && actionability === 'directly-actionable'
        && (finding.severity === 'critical' || finding.severity === 'high')) {
        return 'p0-rollout-blocker';
    }
    if (isBoundaryViolationCategory(finding.category)
        && evidenceTier !== 'topology-only'
        && (finding.severity === 'critical' || finding.severity === 'high')) {
        return 'p1-architecture-blocker';
    }
    if (actionability === 'review-required' || finding.severity === 'medium') {
        return 'p2-review-required';
    }
    return 'p3-advisory';
}
function deriveGovernanceGate(priority, category) {
    if (category === 'sensitive-boundary' && priority === 'p1-architecture-blocker') {
        return 'policy-blocker';
    }
    if (priority === 'p0-rollout-blocker')
        return 'rollout-blocker';
    if (priority === 'p1-architecture-blocker')
        return 'architecture-blocker';
    if (priority === 'p2-review-required')
        return 'review-blocker';
    return 'advisory';
}
function deriveRolloutTrust(finding, priority) {
    if (priority === 'p0-rollout-blocker')
        return 'deployment-sensitive';
    if (priority === 'p1-architecture-blocker') {
        return finding.category === 'cross-service'
            || finding.category === 'scope-expansion'
            || finding.category === 'ownership-inversion'
            ? 'boundary-violating'
            : 'architecture-risk';
    }
    if (finding.evidenceTier === 'topology-only')
        return 'topology-advisory';
    if (priority === 'p2-review-required')
        return 'review-required';
    return 'rollout-safe';
}
function defaultMinimalCorrection(finding) {
    switch (finding.category) {
        case 'dependency-spread':
            return 'Remove the undeclared dependency or update the intent contract only if the dependency expansion is intentionally approved.';
        case 'infra-leakage':
            return 'Move infra/CI changes out of this remediation path, or explicitly declare the infrastructure boundary before re-verifying.';
        case 'sensitive-boundary':
            return 'Keep credential, token, and secret-handling logic inside the approved owner boundary; remove incidental sensitive handling from this change.';
        case 'cross-service':
        case 'scope-expansion':
        case 'ownership-inversion':
            return 'Pull the edit back into the approved service/module boundary, or intentionally expand the intent contract through review.';
        case 'layer-violation':
            return 'Move persistence/runtime behavior back behind the proper service or data layer rather than handling it in the changed presentation/API layer.';
        case 'contract-misuse':
            return 'Keep contract/schema changes within the approved API boundary, or split the contract change into an explicitly declared intent.';
        case 'state-ownership-risk':
            return 'Confirm the intended state owner, then remove undeclared mutation paths or route the change through the approved state-owning service.';
        case 'deployment-coupling':
            return 'Separate deployment/rollout changes from implementation edits unless the rollout unit is explicitly declared in the intent.';
        case 'behavioral-drift':
        case 'runtime-coupling':
            return 'Keep runtime behavior within the declared behavior envelope; remove incidental orchestration, eventing, or side-effect expansion.';
        case 'responsibility-drift':
        case 'invariant-violation':
        case 'architectural-leakage':
            return 'Restore the module to its declared responsibility boundary, or update the semantic contract through explicit review.';
        case 'blast-radius':
        case 'rollout-risk':
            return 'Review the impacted topology and either narrow the dependency/service spread or declare the broader rollout scope before re-verification.';
        default:
            return 'Narrow the change to the declared intent boundary, then re-run deterministic verification.';
    }
}
function uncertaintyForTier(evidenceTier) {
    if (evidenceTier === 'direct-diff') {
        return ['The triggering evidence appears in added lines for this working-tree diff.'];
    }
    if (evidenceTier === 'direct-file') {
        return ['The pattern exists in a changed file, but git hunk evidence did not prove it was newly introduced. Review for pre-existing code before remediation.'];
    }
    if (evidenceTier === 'topology-only') {
        return ['This is inferred from repository topology only; confirm the service/module impact before treating it as a direct defect.'];
    }
    return ['This is bounded deterministic inference; verify the architectural intent before making code changes.'];
}
function defaultEvidenceExplanation(evidenceTier) {
    if (evidenceTier === 'direct-diff')
        return 'Matched evidence appears in added diff lines.';
    if (evidenceTier === 'direct-file')
        return 'Matched evidence appears in a changed file, but not in added-line provenance.';
    if (evidenceTier === 'topology-only')
        return 'Evidence is derived from import/service topology rather than changed-line content.';
    return 'Evidence is derived from bounded deterministic inference over runtime and ownership context.';
}
function dedupeFindings(findings) {
    const seen = new Set();
    const deduped = [];
    for (const finding of findings) {
        const key = [
            finding.category,
            finding.severity,
            finding.file || '',
            finding.module || '',
            finding.service || '',
            finding.message,
        ].join('|');
        if (seen.has(key))
            continue;
        seen.add(key);
        deduped.push(finding);
    }
    return deduped;
}
function computeCouplingSeverity(sourceLayer, targetLayer, targetValues, evidenceLevel = 'direct') {
    const targetIsCriticalLayer = targetLayer === 'infra' || targetLayer === 'ci' || targetLayer === 'data';
    if (evidenceLevel === 'topology-only') {
        return targetIsCriticalLayer || targetValues.some((value) => containsCriticalDomain(value))
            ? 'medium'
            : 'low';
    }
    if (evidenceLevel === 'bounded-inference') {
        return targetIsCriticalLayer || targetValues.some((value) => containsCriticalDomain(value))
            ? 'high'
            : 'medium';
    }
    if (targetIsCriticalLayer
        || targetValues.some((value) => containsCriticalDomain(value))) {
        return 'critical';
    }
    if ((sourceLayer === 'ui' || sourceLayer === 'api') &&
        targetIsCriticalLayer) {
        return 'critical';
    }
    if (sourceLayer !== targetLayer && targetLayer !== 'shared') {
        return 'high';
    }
    return 'medium';
}
function buildNarrative(category, primaryCategory, findings, options) {
    const affectedFiles = (0, intelligence_runtime_common_1.dedupeSortedPaths)(findings.map((item) => item.file || '').filter(Boolean));
    const affectedModules = (0, intelligence_runtime_common_1.dedupeSorted)(findings.map((item) => item.module || '').filter(Boolean));
    const affectedServices = (0, intelligence_runtime_common_1.dedupeSorted)(findings.map((item) => item.service || '').filter(Boolean));
    const severity = findings.reduce((current, finding) => maxSeverity(current, finding.severity), 'low');
    const confidence = findings.some((item) => item.severity === 'critical' || item.severity === 'high')
        ? 'high'
        : findings.length > 1
            ? 'medium'
            : 'low';
    return {
        id: `${category}-${hashId([category, options.summary, affectedFiles[0] || '', affectedModules[0] || ''])}`,
        category,
        severity,
        confidence,
        primaryCategory,
        rootCause: options.rootCause,
        summary: options.summary,
        operationalRisk: options.operationalRisk,
        remediationBoundary: options.remediationBoundary,
        causalChain: options.causalChain,
        affectedFiles,
        affectedModules,
        affectedServices,
        evidenceFindingIds: findings.map((item) => item.id),
    };
}
function buildDriftNarratives(input) {
    const findings = input.findings;
    const boundaryFindings = findings.filter((item) => item.category === 'infra-leakage' || item.category === 'sensitive-boundary');
    const dependencyFindings = findings.filter((item) => item.category === 'dependency-spread');
    const serviceFindings = findings.filter((item) => item.category === 'cross-service' || item.category === 'scope-expansion');
    const ownershipFindings = findings.filter((item) => item.category === 'ownership-inversion' || item.category === 'responsibility-drift');
    const behaviorFindings = findings.filter((item) => item.category === 'behavioral-drift');
    const deploymentFindings = findings.filter((item) => item.category === 'deployment-coupling');
    const stateFindings = findings.filter((item) => item.category === 'state-ownership-risk');
    const semanticFindings = findings.filter((item) => item.category === 'runtime-coupling'
        || item.category === 'architectural-leakage'
        || item.category === 'layer-violation'
        || item.category === 'contract-misuse'
        || item.category === 'invariant-violation');
    const blastFindings = findings.filter((item) => item.category === 'blast-radius' || item.category === 'rollout-risk');
    const narratives = [];
    const consumed = new Set();
    if (serviceFindings.length > 0 || input.unexpectedServices.length > 0 || input.unexpectedModules.length > 0) {
        const evidence = dedupeFindings([
            ...serviceFindings,
            ...dependencyFindings,
            ...blastFindings.filter((item) => item.category === 'rollout-risk'),
        ]);
        if (evidence.length > 0) {
            const spreadTarget = input.unexpectedServices.length > 0
                ? summarizeValues(input.unexpectedServices, 3)
                : summarizeValues(input.unexpectedModules, 3);
            const summary = `Implementation escaped the approved ${input.approvedBoundaryLabel} boundary` +
                `${spreadTarget !== 'none' ? ` and spread into ${spreadTarget}` : ''}` +
                `${dependencyFindings.length > 0 ? ' via dependency surface expansion' : ''}.`;
            narratives.push(buildNarrative('service-boundary-escape', 'cross-service', evidence, {
                summary,
                rootCause: 'Unexpected files and direct topology expansion moved the change outside the intended service or module envelope.',
                operationalRisk: 'Cross-service drift weakens ownership assumptions, widens rollout coordination, and makes AI-generated changes harder to review safely.',
                remediationBoundary: 'Constrain remediation to the approved modules or explicitly expand the intent pack before re-verifying.',
                causalChain: [
                    `The approved intent envelope was ${input.approvedBoundaryLabel}.`,
                    dependencyFindings.length > 0
                        ? 'Dependency or manifest changes widened the reachable engineering surface.'
                        : 'Unexpected edits appeared outside the approved service or module scope.',
                    input.impactedServices.length > 1
                        ? `Repository topology propagated impact into ${summarizeValues(input.impactedServices, 4)}.`
                        : `Repository topology propagated impact into ${summarizeValues(input.impactedModules, 4)}.`,
                ],
            }));
            evidence.forEach((item) => consumed.add(item.id));
        }
    }
    if (ownershipFindings.length > 0) {
        const ownershipTargets = (0, intelligence_runtime_common_1.dedupeSorted)(ownershipFindings.map((item) => item.service || item.module || item.file || 'unknown').filter(Boolean));
        narratives.push(buildNarrative('ownership-boundary-breach', ownershipFindings[0]?.category || 'ownership-inversion', ownershipFindings, {
            summary: `Implementation crossed ownership boundaries and mixed responsibilities across ${summarizeValues(ownershipTargets, 4)}.`,
            rootCause: 'The change set now spans ownership domains or introduces responsibilities that do not belong to the touched service boundary.',
            operationalRisk: 'Ownership mixing is a strong signal of AI implementation overreach because review, rollout, and on-call boundaries stop matching the code that changed.',
            remediationBoundary: 'Constrain remediation to the original owner boundary or explicitly expand the intent pack and review scope before continuing.',
            causalChain: [
                'Changed files or modules no longer stay inside the originally approved ownership envelope.',
                ownershipTargets.length > 1
                    ? `Responsibilities now span ${summarizeValues(ownershipTargets, 4)}.`
                    : 'Responsibility drift introduced a new owner concern inside the touched boundary.',
                input.rolloutRisk === 'high'
                    ? 'That ownership spread also increases rollout coordination and approval load.'
                    : 'This breaks the assumption that one bounded owner can safely review the change.',
            ],
        }));
        ownershipFindings.forEach((item) => consumed.add(item.id));
    }
    if (behaviorFindings.length > 0) {
        narratives.push(buildNarrative('runtime-behavior-shift', 'behavioral-drift', behaviorFindings, {
            summary: `Runtime behavior shifted beyond the declared implementation role${input.impactedServices.length > 0 ? ` across ${summarizeValues(input.impactedServices, 4)}` : ''}.`,
            rootCause: 'The changed boundaries now behave as orchestrators, state mutators, event participants, or side-effect surfaces that were not declared in the active intent runtime.',
            operationalRisk: 'Behavioral drift is more dangerous than raw file spread because the production role of the service changes even if the diff looks bounded.',
            remediationBoundary: 'Remove undeclared runtime responsibilities or explicitly expand the intent pack to include the new operational role before re-verifying.',
            causalChain: [
                'Changed boundaries acquired runtime roles that were not part of the declared session contract.',
                input.rolloutRisk === 'high'
                    ? 'The resulting runtime behavior also expands rollout coordination and production review scope.'
                    : 'The resulting behavior changes how the service participates in production flows.',
            ],
        }));
        behaviorFindings.forEach((item) => consumed.add(item.id));
    }
    if (deploymentFindings.length > 0) {
        narratives.push(buildNarrative('deployment-semantics-breach', 'deployment-coupling', deploymentFindings, {
            summary: `Deployment semantics expanded beyond the approved rollout envelope${input.impactedModules.length > 0 ? ` into ${summarizeValues(input.impactedModules, 4)}` : ''}.`,
            rootCause: 'CI, infra, or rollout units now depend on changed boundaries that were supposed to remain outside this implementation session.',
            operationalRisk: 'Undeclared deployment coupling increases rollout blast radius, merge risk, and the chance of hidden environment-specific regressions.',
            remediationBoundary: 'Keep remediation inside the approved rollout units or update the intent pack to declare the deployment expansion before continuing.',
            causalChain: [
                'Deployment or infrastructure manifests now reference the changed boundary set.',
                'That turns a bounded code change into a broader production rollout concern.',
            ],
        }));
        deploymentFindings.forEach((item) => consumed.add(item.id));
    }
    if (stateFindings.length > 0) {
        narratives.push(buildNarrative('state-ownership-erosion', 'state-ownership-risk', stateFindings, {
            summary: 'Changed state-owning boundary needs explicit rollback and coordination review.',
            rootCause: 'Changed files touch state-related semantics inside or near a state-owning boundary.',
            operationalRisk: 'State-related edits can affect rollback and data consistency, but this finding remains bounded unless multiple owners or direct persistence changes are shown.',
            remediationBoundary: 'Keep state mutation inside the declared owner boundary or explicitly expand the intent pack before re-verifying.',
            causalChain: [
                'A state-owning runtime boundary is involved in the changed scope.',
                'Review should confirm whether the actual change mutates persistence or only touches adjacent request/config behavior.',
            ],
        }));
        stateFindings.forEach((item) => consumed.add(item.id));
    }
    if (boundaryFindings.length > 0) {
        const boundaryTargets = boundaryFindings.map((item) => item.file || item.module || item.service || 'unknown');
        const summary = `Implementation crossed forbidden engineering boundaries` +
            `${boundaryTargets.length > 0 ? ` at ${summarizeValues(boundaryTargets, 3)}` : ''}.`;
        narratives.push(buildNarrative('forbidden-boundary-breach', boundaryFindings[0]?.category || 'infra-leakage', boundaryFindings, {
            summary,
            rootCause: 'The active intent pack marked these paths as forbidden, but the change still expanded into them.',
            operationalRisk: 'Forbidden CI, infra, secret, auth, or sensitive boundary edits create rollout and compliance risk that cannot be treated as incidental drift.',
            remediationBoundary: 'Remove the forbidden edits or explicitly re-authorize the boundary in the intent pack before remediation continues.',
            causalChain: [
                `The intent pack explicitly disallowed ${summarizeValues(boundaryTargets, 3)}.`,
                input.dependencyManifestTouched
                    ? 'Dependency expansion and topology spread increased the chance of boundary escape.'
                    : 'Unexpected architectural spread carried the change into a forbidden path.',
                input.deploymentTouched || input.infraTouched
                    ? 'Deployment or infrastructure surfaces are now coupled to the remediation path.'
                    : 'The resulting change set now crosses a protected trust boundary.',
            ],
        }));
        boundaryFindings.forEach((item) => consumed.add(item.id));
    }
    if (semanticFindings.length > 0) {
        const semanticIsBounded = semanticFindings.every((item) => item.severity === 'medium' || item.severity === 'low' || item.severity === 'info');
        const summary = (semanticIsBounded
            ? 'Semantic contract checks found bounded responsibility concerns'
            : 'Semantic coupling crossed architecture-layer expectations') +
            `${input.impactedServices.length > 0 ? `, affecting ${summarizeValues(input.impactedServices, 4)}` : ''}.`;
        narratives.push(buildNarrative(semanticFindings.some((item) => item.category === 'invariant-violation')
            ? 'architectural-invariant-erosion'
            : 'semantic-coupling', semanticFindings[0]?.category || 'runtime-coupling', semanticFindings, {
            summary,
            rootCause: semanticIsBounded
                ? 'Changed files or direct import topology overlap responsibilities that the inferred contract normally keeps separate.'
                : 'Direct imports, layer violations, or contract-surface edits introduced runtime responsibilities outside the approved design boundary.',
            operationalRisk: semanticIsBounded
                ? 'This is an architecture-review signal, not confirmed production danger; reviewers should verify whether the responsibility overlap is intentional.'
                : 'Semantic coupling is harder to spot than raw file drift and can create latent production behavior changes or ownership confusion.',
            remediationBoundary: 'Keep remediation inside the intended layer or explicitly update the intent contract before re-running verify.',
            causalChain: [
                semanticIsBounded
                    ? 'Changed modules have bounded semantic overlap with responsibilities outside the approved intent envelope.'
                    : 'Changed modules now depend on responsibilities outside their intended architectural layer.',
                input.authTouched
                    ? 'Sensitive auth or credential handling is now closer to the changed runtime surface.'
                    : semanticIsBounded
                        ? 'No direct forbidden boundary was confirmed by this narrative.'
                        : 'The change set mixes architectural responsibilities that should remain isolated.',
                input.rolloutRisk === 'high'
                    ? 'This coupling also increases rollout coordination and hidden regression risk.'
                    : semanticIsBounded
                        ? 'Impact remains bounded unless additional direct runtime or deployment evidence appears.'
                        : 'Even localized changes now carry non-local semantic impact.',
            ],
        }));
        semanticFindings.forEach((item) => consumed.add(item.id));
    }
    const unconsumedDependency = dependencyFindings.filter((item) => !consumed.has(item.id));
    if (unconsumedDependency.length > 0) {
        narratives.push(buildNarrative('dependency-expansion', 'dependency-spread', unconsumedDependency, {
            summary: `Dependency surface expanded beyond the declared intent envelope${input.impactedServices.length > 0 ? ` and now reaches ${summarizeValues(input.impactedServices, 4)}` : ''}.`,
            rootCause: 'Manifest or direct dependency additions introduced new operational surface that was not declared in the intent pack.',
            operationalRisk: 'Unexpected dependency changes widen blast radius, review scope, and downstream rollout obligations.',
            remediationBoundary: 'Either remove the undeclared dependency changes or explicitly declare them in intent before re-verifying.',
            causalChain: [
                'A dependency manifest or package change occurred outside the approved scope.',
                input.impactedModules.length > input.unexpectedModules.length
                    ? `Transitive graph impact reached ${summarizeValues(input.impactedModules, 4)}.`
                    : 'The dependency change widened the reachable change surface.',
            ],
        }));
        unconsumedDependency.forEach((item) => consumed.add(item.id));
    }
    const unconsumedBlast = blastFindings.filter((item) => !consumed.has(item.id));
    if (unconsumedBlast.length > 0) {
        const blastIsTopologyOnly = unconsumedBlast.every((item) => item.rationale.toLowerCase().includes('topology only')
            || item.rationale.toLowerCase().includes('inferred from import topology')
            || item.severity === 'medium'
            || item.severity === 'low');
        narratives.push(buildNarrative('blast-radius-expansion', 'blast-radius', unconsumedBlast, {
            summary: blastIsTopologyOnly
                ? `Repository topology suggests possible adjacent impact outside approved scope in ${summarizeValues(input.impactedModules, 4)}.`
                : `Graph-aware blast radius expanded beyond the approved scope into ${summarizeValues(input.impactedModules, 4)}.`,
            rootCause: blastIsTopologyOnly
                ? 'Import topology indicates adjacency beyond the approved scope, but direct changed-file evidence did not confirm systemic expansion.'
                : 'Repository topology indicates the changed modules now influence adjacent modules or services outside the original plan.',
            operationalRisk: blastIsTopologyOnly
                ? 'Treat this as a bounded review hint. It should not be interpreted as confirmed rollout or production impact without direct evidence.'
                : 'Expanded blast radius increases regression surface and rollout coordination even if the raw diff looked locally bounded.',
            remediationBoundary: blastIsTopologyOnly
                ? 'Confirm whether adjacent modules are intentionally affected; if not, keep remediation within the approved module scope.'
                : 'Pull the change back to the approved scope or extend intent to cover the expanded impact set before remediation proceeds.',
            causalChain: [
                blastIsTopologyOnly
                    ? 'Changed modules have import-graph adjacency outside the approved intent envelope.'
                    : 'Changed modules have direct or transitive topology edges outside the approved intent envelope.',
                input.impactedServices.length > 1
                    ? `Service impact now spans ${summarizeValues(input.impactedServices, 4)}.`
                    : `Module impact now spans ${summarizeValues(input.impactedModules, 4)}.`,
            ],
        }));
        unconsumedBlast.forEach((item) => consumed.add(item.id));
    }
    const leftovers = findings.filter((item) => !consumed.has(item.id));
    if (leftovers.length > 0) {
        narratives.push(buildNarrative('localized-scope-drift', leftovers[0]?.category || 'scope-expansion', leftovers, {
            summary: `Implementation drift remained localized but still exceeded the approved ${input.approvedBoundaryLabel} boundary.`,
            rootCause: 'Unexpected files or modules were touched even though the larger service topology did not explode.',
            operationalRisk: 'Even localized drift weakens trust in bounded AI-assisted implementation and should be reconciled before rollout.',
            remediationBoundary: 'Remove the localized scope spillover or revise the intent pack to make the expansion explicit.',
            causalChain: [
                'Unexpected files were changed outside the approved intent envelope.',
                'The overall topology remained comparatively contained, but the bounded contract was still violated.',
            ],
        }));
    }
    return narratives.sort((left, right) => narrativeSeverityRank(right.severity) - narrativeSeverityRank(left.severity));
}
function emptyPriorityCounts() {
    return {
        p0RolloutBlockers: 0,
        p1ArchitectureBlockers: 0,
        p2ReviewRequired: 0,
        p3Advisory: 0,
    };
}
function computePriorityCounts(findings) {
    const counts = emptyPriorityCounts();
    findings.forEach((finding) => {
        switch (finding.priority) {
            case 'p0-rollout-blocker':
                counts.p0RolloutBlockers += 1;
                break;
            case 'p1-architecture-blocker':
                counts.p1ArchitectureBlockers += 1;
                break;
            case 'p2-review-required':
                counts.p2ReviewRequired += 1;
                break;
            default:
                counts.p3Advisory += 1;
                break;
        }
    });
    return counts;
}
function gateRank(gate) {
    switch (gate) {
        case 'policy-blocker':
            return 5;
        case 'rollout-blocker':
            return 4;
        case 'architecture-blocker':
            return 3;
        case 'review-blocker':
            return 2;
        default:
            return 1;
    }
}
function rolloutTrustRank(posture) {
    switch (posture) {
        case 'deployment-sensitive':
            return 6;
        case 'boundary-violating':
            return 5;
        case 'architecture-risk':
            return 4;
        case 'review-required':
            return 3;
        case 'topology-advisory':
            return 2;
        default:
            return 1;
    }
}
function highestGate(findings) {
    return findings.reduce((current, finding) => gateRank(finding.governanceGate || 'advisory') > gateRank(current)
        ? finding.governanceGate || 'advisory'
        : current, 'advisory');
}
function highestRolloutTrust(findings) {
    return findings.reduce((current, finding) => rolloutTrustRank(finding.rolloutTrust || 'rollout-safe') > rolloutTrustRank(current)
        ? finding.rolloutTrust || 'rollout-safe'
        : current, 'rollout-safe');
}
function remediationPriorityRank(finding) {
    const priorityRank = finding.priority === 'p0-rollout-blocker'
        ? 400
        : finding.priority === 'p1-architecture-blocker'
            ? 300
            : finding.priority === 'p2-review-required'
                ? 200
                : 100;
    const evidenceRank = finding.evidenceTier === 'direct-diff'
        ? 40
        : finding.evidenceTier === 'direct-file'
            ? 30
            : finding.evidenceTier === 'bounded-inference'
                ? 20
                : 10;
    return priorityRank + evidenceRank + severityRank(finding.severity);
}
function buildRemediationOrder(findings) {
    return findings
        .slice()
        .sort((left, right) => remediationPriorityRank(right) - remediationPriorityRank(left))
        .map((finding) => finding.id)
        .slice(0, 12);
}
function attachFindingRelationships(findings) {
    const directParents = findings.filter((finding) => finding.actionability === 'directly-actionable'
        && finding.evidenceTier !== 'topology-only'
        && finding.priority !== 'p3-advisory');
    if (directParents.length === 0) {
        return findings;
    }
    return findings.map((finding) => {
        if (finding.relationships && finding.relationships.length > 0) {
            return finding;
        }
        if (finding.evidenceTier !== 'topology-only' && finding.category !== 'blast-radius' && finding.category !== 'rollout-risk') {
            return finding;
        }
        const parent = directParents.find((candidate) => candidate.id !== finding.id
            && ((candidate.module && finding.module && candidate.module === finding.module)
                || (candidate.service && finding.service && candidate.service === finding.service)
                || (candidate.file && finding.evidence?.dependencyEdges.some((edge) => edge.includes(candidate.module || candidate.file || ''))))) || directParents[0];
        return {
            ...finding,
            relationships: [
                {
                    type: finding.category === 'rollout-risk' ? 'deployment-derived' : 'topology-derived',
                    targetFindingId: parent.id,
                    rationale: 'This finding is a rollout/topology consequence of a higher-priority direct governance finding; remediate the direct finding first.',
                },
            ],
        };
    });
}
function buildGovernancePostureSummary(findings) {
    const priorityCounts = computePriorityCounts(findings);
    const governanceGate = highestGate(findings);
    const rolloutTrust = highestRolloutTrust(findings);
    const reasons = (0, intelligence_runtime_common_1.dedupeSorted)(findings
        .slice()
        .sort((left, right) => remediationPriorityRank(right) - remediationPriorityRank(left))
        .slice(0, 4)
        .map((finding) => `${finding.priority || 'p3-advisory'}: ${finding.message}`));
    const summary = findings.length === 0
        ? 'Architectural integrity preserved; no direct runtime-boundary or rollout-trust violations were detected.'
        : governanceGate === 'policy-blocker'
            ? 'Policy-sensitive boundary drift requires remediation before rollout.'
            : governanceGate === 'rollout-blocker'
                ? 'Deployment-relevant drift blocks rollout until the affected boundary is corrected or explicitly approved.'
                : governanceGate === 'architecture-blocker'
                    ? 'Direct architectural boundary drift requires correction or explicit review before rollout.'
                    : governanceGate === 'review-blocker'
                        ? 'Review is required before rollout; no deterministic rollout blocker was established.'
                        : 'Only advisory or topology-derived drift was detected; rollout posture remains bounded.';
    return {
        rolloutTrust,
        governanceGate,
        summary,
        reasons,
        priorityCounts,
        remediationOrder: buildRemediationOrder(findings),
    };
}
function decisionMatchesFinding(decision, finding) {
    if (decision.findingId && decision.findingId === finding.id) {
        return true;
    }
    if (decision.category && decision.category !== finding.category) {
        return false;
    }
    const fileMatches = !decision.file || (0, intelligence_runtime_common_1.normalizeRepoPath)(decision.file) === (0, intelligence_runtime_common_1.normalizeRepoPath)(finding.file || '');
    const moduleMatches = !decision.module || (0, intelligence_runtime_common_1.normalizeRepoPath)(decision.module) === (0, intelligence_runtime_common_1.normalizeRepoPath)(finding.module || '');
    const serviceMatches = !decision.service || decision.service === finding.service;
    return Boolean(decision.category) && fileMatches && moduleMatches && serviceMatches;
}
function applyDecisionToFinding(finding, decision, sourcePath) {
    const expired = (0, governance_decisions_1.isGovernanceDecisionExpired)(decision);
    const previousGate = finding.governanceGate || null;
    const previousRolloutTrust = finding.rolloutTrust || null;
    let governanceGate = finding.governanceGate || 'advisory';
    let rolloutTrust = finding.rolloutTrust || 'rollout-safe';
    let priority = finding.priority || 'p3-advisory';
    let actionability = finding.actionability || 'review-required';
    if (!expired) {
        if (decision.state === 'accepted-risk' || decision.state === 'rollout-approved' || decision.state === 'temporary-exception') {
            governanceGate = governanceGate === 'policy-blocker' ? 'review-blocker' : 'advisory';
            rolloutTrust = decision.state === 'rollout-approved' ? 'review-required' : 'topology-advisory';
            priority = 'p3-advisory';
            actionability = 'informational';
        }
        else if (decision.state === 'advisory-dismissed' && governanceGate === 'advisory') {
            rolloutTrust = 'rollout-safe';
            priority = 'p3-advisory';
            actionability = 'informational';
        }
        else if (decision.state === 'review-required' || decision.state === 'acknowledged') {
            governanceGate = governanceGate === 'advisory' ? 'review-blocker' : governanceGate;
            rolloutTrust = rolloutTrust === 'rollout-safe' ? 'review-required' : rolloutTrust;
            priority = priority === 'p3-advisory' ? 'p2-review-required' : priority;
        }
        else if (decision.state === 'rollout-blocked') {
            governanceGate = 'rollout-blocker';
            rolloutTrust = 'deployment-sensitive';
            priority = 'p0-rollout-blocker';
        }
    }
    const resultingGate = expired ? previousGate : governanceGate;
    const resultingRolloutTrust = expired ? previousRolloutTrust : rolloutTrust;
    const lineage = {
        decisionId: decision.id,
        state: decision.state,
        findingId: finding.id,
        category: finding.category,
        reason: decision.reason,
        actor: decision.actor,
        decidedAt: decision.decidedAt,
        expiresAt: decision.expiresAt,
        temporary: decision.temporary,
        expired,
        previousGate,
        resultingGate,
        previousRolloutTrust,
        resultingRolloutTrust,
        sourcePath,
        lineageHash: governanceLineageHash([
            decision.id,
            decision.state,
            finding.id,
            decision.reason,
            decision.actor,
            decision.decidedAt,
            decision.expiresAt || '',
            previousGate || '',
            resultingGate || '',
            previousRolloutTrust || '',
            resultingRolloutTrust || '',
        ]),
    };
    if (expired) {
        return {
            ...finding,
            governanceDecision: lineage,
        };
    }
    return {
        ...finding,
        actionability,
        priority,
        governanceGate,
        rolloutTrust,
        governanceDecision: lineage,
        remediationGuidance: finding.remediationGuidance
            ? {
                ...finding.remediationGuidance,
                actionability,
                uncertainty: (0, intelligence_runtime_common_1.dedupeSorted)([
                    ...finding.remediationGuidance.uncertainty,
                    `Governance decision ${decision.id} (${decision.state}) is active and audit-visible; reason: ${decision.reason}`,
                ]),
            }
            : finding.remediationGuidance,
    };
}
function applyGovernanceDecisions(findings, registry) {
    if (registry.decisions.length === 0) {
        return {
            findings,
            summary: emptyDecisionSummary(registry.sourcePath, registry.invalidEntries),
        };
    }
    let activeOverrides = 0;
    let expiredOverrides = registry.invalidEntries;
    let findingsChanged = 0;
    const lineage = [];
    const nextFindings = findings.map((finding) => {
        const decision = registry.decisions.find((candidate) => decisionMatchesFinding(candidate, finding));
        if (!decision)
            return finding;
        const next = applyDecisionToFinding(finding, decision, registry.sourcePath);
        if (next.governanceDecision) {
            lineage.push(next.governanceDecision);
            if (next.governanceDecision.expired) {
                expiredOverrides += 1;
            }
            else {
                activeOverrides += 1;
                if (next.governanceGate !== finding.governanceGate
                    || next.rolloutTrust !== finding.rolloutTrust
                    || next.priority !== finding.priority) {
                    findingsChanged += 1;
                }
            }
        }
        return next;
    });
    return {
        findings: nextFindings,
        summary: {
            sourcePath: registry.sourcePath,
            decisionsApplied: lineage.length,
            activeOverrides,
            expiredOverrides,
            findingsChanged,
            lineage,
        },
    };
}
function buildRiskSynthesis(input) {
    const highestNarrativeSeverity = input.narratives.reduce((current, item) => maxSeverity(current, item.severity), 'low');
    let overallRisk = severityToRisk(highestNarrativeSeverity);
    if ((input.authTouched || input.infraTouched || input.deploymentTouched)
        && (overallRisk === 'high' || overallRisk === 'critical')) {
        overallRisk = 'critical';
    }
    if (input.dependencyManifestTouched && overallRisk === 'medium') {
        overallRisk = 'high';
    }
    const primaryNarratives = input.narratives.slice(0, 3).map((item) => item.summary);
    const contributingCategories = (0, intelligence_runtime_common_1.dedupeSorted)(input.findings.map((item) => item.category));
    const posture = buildGovernancePostureSummary(input.findings);
    const summary = primaryNarratives.length > 0
        ? primaryNarratives.slice(0, 2).join(' ')
        : 'No compressed drift narratives were required; no high-confidence engineering drift was detected.';
    let cascadingRisk = overallRisk;
    if (input.directDeploymentEvidence
        && (input.deploymentTouched
            || input.infraTouched
            || input.affectedRolloutUnits.length >= 2)) {
        cascadingRisk = overallRisk === 'critical' || input.authTouched ? 'critical' : 'high';
    }
    else if (!input.topologyOnlyPropagation
        && (input.externalSideEffectExposure || input.stateOwnershipExposure)) {
        cascadingRisk = overallRisk === 'low' ? 'medium' : overallRisk;
    }
    else if (input.topologyOnlyPropagation && (cascadingRisk === 'high' || cascadingRisk === 'critical')) {
        cascadingRisk = 'medium';
    }
    return {
        overallRisk,
        summary,
        primaryNarratives,
        contributingCategories,
        rawFindingCount: input.findings.length,
        compressedNarrativeCount: input.narratives.length,
        authExposure: input.authTouched,
        infraExposure: input.infraTouched,
        deploymentExposure: input.deploymentTouched,
        dependencyExposure: input.dependencyManifestTouched,
        transitiveImpactCount: input.transitiveImpactCount,
        runtimeFlowExposure: input.impactedRuntimeFlows.length > 0,
        externalSideEffectExposure: input.externalSideEffectExposure,
        stateOwnershipExposure: input.stateOwnershipExposure,
        affectedRolloutUnits: input.affectedRolloutUnits,
        cascadingRisk,
        rolloutTrust: posture.rolloutTrust,
        governanceGate: posture.governanceGate,
        postureSummary: posture.summary,
        priorityCounts: posture.priorityCounts,
        remediationOrder: posture.remediationOrder,
    };
}
function buildDriftIntelligence(changeSet, runtime) {
    const changedFiles = (0, intelligence_runtime_common_1.dedupeSortedPaths)(changeSet.changedFiles);
    const governanceChangedFiles = changedFiles.filter((filePath) => !isSupportOnlyPath(filePath));
    const evaluatedChangedFiles = governanceChangedFiles.length > 0 ? governanceChangedFiles : changedFiles;
    const changedModules = (0, intelligence_runtime_common_1.dedupeSorted)(evaluatedChangedFiles.map(deriveModulePath));
    const authTouched = evaluatedChangedFiles.some((filePath) => /(auth|token|secret|permission|billing|payment)/i.test(filePath));
    const deploymentTouched = evaluatedChangedFiles.some((filePath) => /(\.github\/workflows|deploy|terraform|helm|k8s|docker-compose)/i.test(filePath));
    const infraTouched = evaluatedChangedFiles.some((filePath) => {
        const flags = (0, intelligence_runtime_common_1.classifyBoundaryPath)(filePath);
        return flags.infra || flags.ci;
    });
    const dependencyManifestTouched = evaluatedChangedFiles.some((filePath) => (0, intelligence_runtime_common_1.classifyBoundaryPath)(filePath).dependencyManifest);
    if (!runtime) {
        const emptyNarratives = [];
        const governancePosture = buildGovernancePostureSummary([]);
        const governanceDecisions = emptyDecisionSummary(null);
        return {
            schemaVersion: 1,
            source: 'fallback-plan',
            flagged: false,
            confidence: 'low',
            changedFiles,
            changedModules,
            changedServices: [],
            impactedModules: changedModules,
            impactedServices: [],
            impactedRuntimeFlows: [],
            affectedRolloutUnits: [],
            unexpectedFiles: [],
            unexpectedModules: [],
            unexpectedServices: [],
            rolloutRisk: 'low',
            findings: [],
            narratives: emptyNarratives,
            riskSynthesis: {
                overallRisk: 'low',
                summary: 'Intent runtime unavailable; drift synthesis fell back to legacy plan-derived scope reasoning.',
                primaryNarratives: [],
                contributingCategories: [],
                rawFindingCount: 0,
                compressedNarrativeCount: 0,
                authExposure: authTouched,
                infraExposure: infraTouched,
                deploymentExposure: deploymentTouched,
                dependencyExposure: dependencyManifestTouched,
                transitiveImpactCount: 0,
                runtimeFlowExposure: false,
                externalSideEffectExposure: false,
                stateOwnershipExposure: false,
                affectedRolloutUnits: [],
                cascadingRisk: 'low',
                rolloutTrust: governancePosture.rolloutTrust,
                governanceGate: governancePosture.governanceGate,
                postureSummary: governancePosture.summary,
                priorityCounts: governancePosture.priorityCounts,
                remediationOrder: governancePosture.remediationOrder,
            },
            governancePosture,
            governanceDecisions,
            explanation: ['Intent runtime unavailable; drift intelligence fell back to legacy plan-based scope reasoning.'],
        };
    }
    const approvedFiles = new Set(runtime.intentPack.approvedScope.files.map(intelligence_runtime_common_1.normalizeRepoPath));
    const approvedModules = new Set(runtime.intentPack.approvedScope.modules.map(intelligence_runtime_common_1.normalizeRepoPath));
    const approvedServices = new Set(runtime.intentPack.approvedScope.services.map(intelligence_runtime_common_1.normalizeRepoPath));
    const approvedBoundaryLabel = runtime.intentPack.approvedScope.services.length > 0
        ? summarizeValues(runtime.intentPack.approvedScope.services, 2)
        : runtime.intentPack.approvedScope.modules.length > 0
            ? summarizeValues(runtime.intentPack.approvedScope.modules, 2)
            : 'intent scope';
    const approvedLayers = new Set([
        ...runtime.intentPack.approvedScope.files.map(classifyArchitectureLayer),
        ...runtime.intentPack.approvedScope.modules.map(classifyArchitectureLayer),
    ]);
    const dependencyManifestSet = new Set(runtime.repositoryGraph.boundaries.dependencyManifests.map(intelligence_runtime_common_1.normalizeRepoPath));
    const ownershipBoundaries = runtime.repositoryGraph.semantic?.ownershipBoundaries || [];
    const semanticContracts = runtime.repositoryGraph.semantic?.contracts || [];
    const knownInvariants = runtime.invariantMemory?.invariants || runtime.repositoryGraph.semantic?.invariants || [];
    const serviceBoundaries = runtime.contextPack.serviceBoundaries.map((boundary) => ({
        name: boundary.name,
        path: (0, intelligence_runtime_common_1.normalizeRepoPath)(boundary.path),
    }));
    const projectRoot = runtime.sessionRuntime.repoRoot || runtime.intentPack.governanceContext.projectRoot;
    const governanceDecisionRegistry = (0, governance_decisions_1.readGovernanceDecisionRegistry)(projectRoot);
    const changedFileEvidence = collectChangedFileEvidence(projectRoot, evaluatedChangedFiles);
    const directDeploymentEvidence = infraTouched
        || deploymentTouched
        || dependencyManifestTouched
        || changedFileEvidence.deploymentSemanticFiles.length > 0;
    const directRuntimeEvidence = changedFileEvidence.stateMutationFiles.length > 0
        || changedFileEvidence.externalSideEffectFiles.length > 0
        || changedFileEvidence.sensitiveRuntimeFiles.length > 0
        || changedFileEvidence.contractSurfaceFiles.length > 0;
    const changedServices = (0, intelligence_runtime_common_1.dedupeSorted)(evaluatedChangedFiles
        .map((filePath) => matchServiceBoundary(serviceBoundaries, filePath) || matchServiceBoundary(serviceBoundaries, deriveModulePath(filePath)))
        .filter((value) => Boolean(value)));
    const { outgoing, incoming } = buildModuleAdjacency(runtime.repositoryGraph);
    const impactedModulesSet = new Set(changedModules);
    for (const moduleName of changedModules) {
        for (const downstream of outgoing.get(moduleName) || []) {
            impactedModulesSet.add(downstream);
        }
        for (const upstream of incoming.get(moduleName) || []) {
            impactedModulesSet.add(upstream);
        }
    }
    const impactedModules = (0, intelligence_runtime_common_1.dedupeSorted)([...impactedModulesSet]);
    const impactedServices = (0, intelligence_runtime_common_1.dedupeSorted)(impactedModules
        .map((moduleName) => matchServiceBoundary(serviceBoundaries, moduleName))
        .filter((value) => Boolean(value)));
    const unexpectedFiles = evaluatedChangedFiles.filter((filePath) => !approvedFiles.has(filePath));
    const unexpectedModules = (0, intelligence_runtime_common_1.dedupeSorted)(changedModules.filter((moduleName) => !approvedModules.has(moduleName)));
    const unexpectedServices = approvedServices.size > 0
        ? (0, intelligence_runtime_common_1.dedupeSorted)(changedServices.filter((serviceName) => !approvedServices.has(serviceName)))
        : [];
    const approvedOwnershipBoundaryNames = new Set((0, intelligence_runtime_common_1.dedupeSorted)([...runtime.intentPack.approvedScope.modules, ...runtime.intentPack.approvedScope.services]
        .map((pathValue) => matchOwnershipBoundary(ownershipBoundaries, pathValue)?.name || '')
        .filter(Boolean)));
    const approvedOwnershipDomains = new Set(Array.from(approvedOwnershipBoundaryNames)
        .map((name) => ownershipBoundaries.find((boundary) => boundary.name === name)?.domain || '')
        .filter(Boolean));
    const runtimeModel = runtime.repositoryGraph.semantic?.runtime;
    const behaviorProfiles = runtimeModel?.behaviorProfiles || [];
    const runtimeInteractions = runtimeModel?.interactions || [];
    const deploymentBoundaries = runtimeModel?.deploymentBoundaries || [];
    const changedBoundaryIds = new Set((0, intelligence_runtime_common_1.dedupeSorted)(changedFiles
        .filter((filePath) => !isSupportOnlyPath(filePath))
        .map((filePath) => {
        const boundary = matchOwnershipBoundary(ownershipBoundaries, filePath)
            || matchOwnershipBoundary(ownershipBoundaries, deriveModulePath(filePath));
        return boundary?.id || '';
    })
        .filter(Boolean)));
    const changedBehaviorProfiles = behaviorProfiles.filter((profile) => changedBoundaryIds.has(profile.boundaryId));
    const impactedRuntimeFlows = (0, intelligence_runtime_common_1.dedupeSorted)([
        ...changedBehaviorProfiles.flatMap((profile) => profile.criticalFlows),
        ...runtimeInteractions
            .filter((interaction) => changedBoundaryIds.has(interaction.fromBoundaryId)
            || (interaction.toBoundaryId ? changedBoundaryIds.has(interaction.toBoundaryId) : false))
            .map((interaction) => `${interaction.kind}:${interaction.fromBoundaryName}->${interaction.toBoundaryName || interaction.subject}`),
    ]).slice(0, 24);
    const affectedRolloutUnits = (0, intelligence_runtime_common_1.dedupeSorted)([
        ...changedBehaviorProfiles.flatMap((profile) => profile.rolloutUnits),
        ...deploymentBoundaries
            .filter((boundary) => boundary.dependentBoundaryIds.some((id) => changedBoundaryIds.has(id)))
            .flatMap((boundary) => boundary.rolloutUnits),
    ]).slice(0, 20);
    const profileSideEffectExposure = changedBehaviorProfiles.some((profile) => profile.sideEffectKinds.length > 0);
    const profileStateOwnershipExposure = changedBehaviorProfiles.some((profile) => profile.behaviorKinds.includes('state-owner') || profile.behaviorKinds.includes('state-mutator'));
    const externalSideEffectExposure = profileSideEffectExposure && changedFileEvidence.externalSideEffectFiles.length > 0;
    const stateOwnershipExposure = profileStateOwnershipExposure && changedFileEvidence.stateMutationFiles.length > 0;
    const findings = [];
    const pushFinding = (finding) => {
        const evidenceTier = finding.evidenceTier || defaultEvidenceTier(finding, changedFileEvidence);
        const actionability = finding.actionability || defaultActionability(finding.category, finding.severity, evidenceTier);
        const findingForPriority = { ...finding, evidenceTier, actionability };
        const priority = finding.priority || deriveGovernancePriority(findingForPriority);
        const governanceGate = finding.governanceGate || deriveGovernanceGate(priority, finding.category);
        const rolloutTrust = finding.rolloutTrust || deriveRolloutTrust(findingForPriority, priority);
        const changedLines = finding.evidence?.changedLines
            || categoryLineEvidence(finding.category, finding.file, changedFileEvidence);
        const changedFilesForFinding = finding.evidence?.changedFiles
            || (0, intelligence_runtime_common_1.dedupeSortedPaths)([finding.file || '', ...changedLines.map((line) => line.file)].filter(Boolean));
        const evidence = finding.evidence || {
            tier: evidenceTier,
            changedFiles: changedFilesForFinding,
            changedLines,
            dependencyEdges: [],
            boundary: finding.service || finding.module || null,
            explanation: defaultEvidenceExplanation(evidenceTier),
        };
        const remediationGuidance = finding.remediationGuidance || {
            actionability,
            evidenceTier,
            minimalCorrection: defaultMinimalCorrection(finding),
            boundaryToPreserve: approvedBoundaryLabel,
            verifyAfterRemediation: 'Run `neurcode verify --evidence` after narrowing the change to confirm deterministic governance and replay lineage.',
            uncertainty: uncertaintyForTier(evidenceTier),
        };
        findings.push({
            id: `${finding.category}-${hashId([
                finding.category,
                finding.severity,
                finding.file || '',
                finding.module || '',
                finding.service || '',
                finding.message,
            ])}`,
            ...finding,
            evidenceTier,
            actionability,
            priority,
            governanceGate,
            rolloutTrust,
            relationships: finding.relationships || [],
            evidence,
            remediationGuidance,
        });
    };
    if (approvedOwnershipBoundaryNames.size > 0) {
        const changedOwnershipBoundaries = (0, intelligence_runtime_common_1.dedupeSorted)(changedFiles
            .map((filePath) => {
            const matched = matchOwnershipBoundary(ownershipBoundaries, filePath)
                || matchOwnershipBoundary(ownershipBoundaries, deriveModulePath(filePath));
            return matched?.name || '';
        })
            .filter(Boolean)).map((name) => ownershipBoundaries.find((boundary) => boundary.name === name))
            .filter((value) => Boolean(value));
        const unexpectedOwnershipBoundaries = changedOwnershipBoundaries.filter((boundary) => !approvedOwnershipBoundaryNames.has(boundary.name));
        if (unexpectedOwnershipBoundaries.length > 0) {
            pushFinding({
                category: 'ownership-inversion',
                severity: unexpectedOwnershipBoundaries.some((boundary) => boundary.criticality === 'critical')
                    || unexpectedOwnershipBoundaries.some((boundary) => !approvedOwnershipDomains.has(boundary.domain))
                    ? 'critical'
                    : unexpectedOwnershipBoundaries.some((boundary) => boundary.criticality === 'sensitive')
                        ? 'high'
                        : 'medium',
                module: unexpectedOwnershipBoundaries[0]?.path || null,
                service: unexpectedOwnershipBoundaries[0]?.name || null,
                message: `Implementation crossed ownership boundary into ${summarizeValues(unexpectedOwnershipBoundaries.map((item) => item.name), 4)}.`,
                rationale: 'The active intent pack approved one bounded owner envelope, but the change now spans additional domain responsibilities.',
                expected: Array.from(approvedOwnershipBoundaryNames).join(', '),
                actual: unexpectedOwnershipBoundaries.map((item) => item.name).join(', '),
            });
        }
    }
    const unexpectedBehaviorKinds = (0, intelligence_runtime_common_1.dedupeSorted)(changedBehaviorProfiles
        .flatMap((profile) => profile.behaviorKinds)
        .filter((kind) => !runtime.intentPack.semanticExpectations.expectedBehaviorKinds.includes(kind)));
    if (unexpectedBehaviorKinds.length > 0) {
        const strongBehaviorEvidence = directRuntimeEvidence
            || unexpectedBehaviorKinds.includes('workflow-orchestrator')
            || unexpectedBehaviorKinds.includes('event-producer');
        pushFinding({
            category: 'behavioral-drift',
            severity: strongBehaviorEvidence
                ? authTouched || infraTouched ? 'critical' : 'high'
                : 'medium',
            module: changedModules[0] || null,
            service: changedServices[0] || null,
            message: `Runtime behavior expanded into undeclared ${summarizeValues(unexpectedBehaviorKinds, 4)} role(s).`,
            rationale: strongBehaviorEvidence
                ? 'The active intent runtime did not declare these runtime behaviors, and changed-file evidence supports a runtime role change.'
                : 'Repository topology suggests an undeclared runtime role, but no direct changed-file runtime signal was found; treat this as bounded inference.',
            expected: runtime.intentPack.semanticExpectations.expectedBehaviorKinds.join(', '),
            actual: unexpectedBehaviorKinds.join(', '),
            evidenceTier: strongBehaviorEvidence
                ? [
                    ...changedFileEvidence.stateMutationLines,
                    ...changedFileEvidence.externalSideEffectLines,
                    ...changedFileEvidence.sensitiveRuntimeLines,
                    ...changedFileEvidence.contractSurfaceLines,
                ].length > 0 ? 'direct-diff' : 'direct-file'
                : 'bounded-inference',
            evidence: {
                tier: strongBehaviorEvidence
                    ? [
                        ...changedFileEvidence.stateMutationLines,
                        ...changedFileEvidence.externalSideEffectLines,
                        ...changedFileEvidence.sensitiveRuntimeLines,
                        ...changedFileEvidence.contractSurfaceLines,
                    ].length > 0 ? 'direct-diff' : 'direct-file'
                    : 'bounded-inference',
                changedFiles: (0, intelligence_runtime_common_1.dedupeSortedPaths)([
                    ...changedFileEvidence.stateMutationFiles,
                    ...changedFileEvidence.externalSideEffectFiles,
                    ...changedFileEvidence.sensitiveRuntimeFiles,
                    ...changedFileEvidence.contractSurfaceFiles,
                ]).slice(0, 8),
                changedLines: [
                    ...changedFileEvidence.stateMutationLines,
                    ...changedFileEvidence.externalSideEffectLines,
                    ...changedFileEvidence.sensitiveRuntimeLines,
                    ...changedFileEvidence.contractSurfaceLines,
                ].slice(0, 8),
                dependencyEdges: [],
                boundary: changedServices[0] || changedModules[0] || null,
                explanation: strongBehaviorEvidence
                    ? 'Runtime behavior evidence appears in changed files.'
                    : 'Runtime behavior evidence is inferred from repository behavior profiles.',
            },
        });
    }
    if (affectedRolloutUnits.length > 0 && !runtime.intentPack.semanticExpectations.expectedRolloutUnits.some((entry) => affectedRolloutUnits.includes(entry))) {
        const hasExplicitBoundarySpread = unexpectedServices.length > 0 || unexpectedModules.length > 1;
        if (directDeploymentEvidence || hasExplicitBoundarySpread) {
            pushFinding({
                category: 'deployment-coupling',
                severity: directDeploymentEvidence && (infraTouched || deploymentTouched || affectedRolloutUnits.length > 1) ? 'high' : 'medium',
                module: changedModules[0] || null,
                service: changedServices[0] || null,
                message: directDeploymentEvidence
                    ? `Change has direct deployment evidence and reaches rollout unit(s) ${summarizeValues(affectedRolloutUnits, 4)} outside the declared envelope.`
                    : `Repository topology suggests rollout unit(s) ${summarizeValues(affectedRolloutUnits, 4)} may be adjacent to this boundary change.`,
                rationale: directDeploymentEvidence
                    ? 'Changed files include deployment, CI, dependency, or rollout semantics that make deployment propagation directly relevant.'
                    : 'No deployment file changed; this is bounded topology inference from service/module spread, so severity stays conservative.',
                expected: runtime.intentPack.semanticExpectations.expectedRolloutUnits.join(', '),
                actual: affectedRolloutUnits.join(', '),
                evidenceTier: directDeploymentEvidence
                    ? changedFileEvidence.deploymentSemanticLines.length > 0 ? 'direct-diff' : 'direct-file'
                    : 'bounded-inference',
                evidence: {
                    tier: directDeploymentEvidence
                        ? changedFileEvidence.deploymentSemanticLines.length > 0 ? 'direct-diff' : 'direct-file'
                        : 'bounded-inference',
                    changedFiles: changedFileEvidence.deploymentSemanticFiles.slice(0, 8),
                    changedLines: changedFileEvidence.deploymentSemanticLines.slice(0, 8),
                    dependencyEdges: [],
                    boundary: changedServices[0] || changedModules[0] || null,
                    explanation: directDeploymentEvidence
                        ? 'Deployment evidence appears in changed files or deployment-class paths.'
                        : 'Deployment impact is inferred from service/module topology.',
                },
            });
        }
    }
    if (profileStateOwnershipExposure && (stateOwnershipExposure || unexpectedServices.length > 0)) {
        const stateDomains = (0, intelligence_runtime_common_1.dedupeSorted)(changedBehaviorProfiles
            .filter((profile) => profile.behaviorKinds.includes('state-owner') || profile.behaviorKinds.includes('state-mutator'))
            .map((profile) => profile.domain));
        if (stateOwnershipExposure || stateDomains.length > 1 || unexpectedServices.length > 0) {
            pushFinding({
                category: 'state-ownership-risk',
                severity: stateOwnershipExposure && (stateDomains.length > 1 || authTouched || changedBehaviorProfiles.some((profile) => profile.sideEffectKinds.includes('queue')))
                    ? 'high'
                    : 'medium',
                module: changedModules[0] || null,
                service: changedServices[0] || null,
                message: stateOwnershipExposure
                    ? `Changed-file evidence touches state mutation in ${summarizeValues(changedFileEvidence.stateMutationFiles, 3)} while state-owning boundary ${summarizeValues(stateDomains, 4)} is in scope.`
                    : `State-owning boundary ${summarizeValues(stateDomains, 4)} is adjacent to the change, but direct mutation evidence was not observed.`,
                rationale: stateOwnershipExposure
                    ? 'State mutation appears directly in changed files, so rollback and coordination risk are concrete.'
                    : 'This is topology-derived state exposure only; treat it as an architectural review prompt rather than confirmed corruption risk.',
                expected: Array.from(approvedOwnershipDomains).join(', '),
                actual: stateDomains.join(', '),
                evidenceTier: stateOwnershipExposure
                    ? changedFileEvidence.stateMutationLines.length > 0 ? 'direct-diff' : 'direct-file'
                    : 'topology-only',
                evidence: {
                    tier: stateOwnershipExposure
                        ? changedFileEvidence.stateMutationLines.length > 0 ? 'direct-diff' : 'direct-file'
                        : 'topology-only',
                    changedFiles: changedFileEvidence.stateMutationFiles.slice(0, 8),
                    changedLines: changedFileEvidence.stateMutationLines.slice(0, 8),
                    dependencyEdges: [],
                    boundary: changedServices[0] || changedModules[0] || null,
                    explanation: stateOwnershipExposure
                        ? 'State mutation evidence appears in changed files.'
                        : 'State exposure is inferred from ownership topology without direct mutation evidence.',
                },
            });
        }
    }
    for (const filePath of unexpectedFiles) {
        const boundary = findBoundaryPolicy(runtime.intentPack.forbiddenBoundaries, filePath);
        const moduleName = deriveModulePath(filePath);
        const serviceName = matchServiceBoundary(serviceBoundaries, filePath) || matchServiceBoundary(serviceBoundaries, moduleName);
        const flags = (0, intelligence_runtime_common_1.classifyBoundaryPath)(filePath);
        if (boundary?.policy === 'forbidden') {
            pushFinding({
                category: boundary.type === 'infra' || boundary.type === 'ci'
                    ? 'infra-leakage'
                    : boundary.type === 'dependency-manifest'
                        ? 'dependency-spread'
                        : 'sensitive-boundary',
                severity: boundary.type === 'sensitive' || containsCriticalDomain(boundary.path) ? 'critical' : 'high',
                file: filePath,
                module: moduleName,
                service: serviceName,
                message: `Intent drift crossed a forbidden ${boundary.type} boundary at ${filePath}.`,
                rationale: boundary.reason,
                expected: runtime.intentPack.approvedScope.files.join(', '),
                actual: filePath,
                evidenceTier: 'direct-file',
                actionability: 'directly-actionable',
            });
            continue;
        }
        if (flags.dependencyManifest || dependencyManifestSet.has(filePath)) {
            pushFinding({
                category: 'dependency-spread',
                severity: containsCriticalDomain(filePath) ? 'critical' : 'high',
                file: filePath,
                module: moduleName,
                service: serviceName,
                message: `Dependency surface expanded outside approved scope via ${filePath}.`,
                rationale: 'Manifest or dependency changes widen blast radius and should be explicitly declared in the intent pack.',
                expected: runtime.intentPack.expectedDependencies.join(', '),
                actual: filePath,
                evidenceTier: 'direct-file',
                actionability: 'directly-actionable',
            });
            continue;
        }
        if (flags.infra || flags.ci) {
            pushFinding({
                category: 'infra-leakage',
                severity: deploymentTouched ? 'critical' : 'high',
                file: filePath,
                module: moduleName,
                service: serviceName,
                message: `Infrastructure or delivery path drift detected at ${filePath}.`,
                rationale: 'Infra and CI changes materially increase rollout risk and should not appear as incidental AI edits.',
                expected: runtime.intentPack.expectedInfrastructure.join(', '),
                actual: filePath,
                evidenceTier: 'direct-file',
                actionability: 'directly-actionable',
            });
            continue;
        }
        if (unexpectedModules.includes(moduleName) || (serviceName && unexpectedServices.includes(serviceName))) {
            pushFinding({
                category: serviceName ? 'cross-service' : 'scope-expansion',
                severity: serviceName && (containsCriticalDomain(serviceName) || authTouched) ? 'critical' : serviceName ? 'high' : 'medium',
                file: filePath,
                module: moduleName,
                service: serviceName,
                message: serviceName
                    ? `Implementation drift spread into unapproved service boundary ${serviceName}.`
                    : `Implementation drift spread into unapproved module ${moduleName}.`,
                rationale: 'Neurcode expected work to remain within the declared service and module envelope for this intent.',
                expected: runtime.intentPack.approvedScope.modules.join(', '),
                actual: moduleName,
                evidenceTier: 'direct-file',
                actionability: 'directly-actionable',
            });
        }
    }
    for (const moduleName of changedModules) {
        const sourceLayer = classifyArchitectureLayer(moduleName);
        const unexpectedTargets = [...(outgoing.get(moduleName) || [])].filter((target) => !approvedModules.has(target));
        if (unexpectedTargets.length === 0) {
            continue;
        }
        const sourceOwnershipBoundary = matchOwnershipBoundary(ownershipBoundaries, moduleName);
        const sourceContracts = sourceOwnershipBoundary
            ? semanticContracts.filter((contract) => contract.boundaryId === sourceOwnershipBoundary.id)
            : [];
        const targetOwnershipKinds = (0, intelligence_runtime_common_1.dedupeSorted)(unexpectedTargets.map((target) => matchOwnershipBoundary(ownershipBoundaries, target)?.kind || classifyArchitectureLayer(target)));
        const forbiddenDependencyKinds = (0, intelligence_runtime_common_1.dedupeSorted)(sourceContracts.flatMap((contract) => contract.forbiddenDependencyKinds));
        const violatedDependencyKinds = targetOwnershipKinds.filter((kind) => forbiddenDependencyKinds.includes(kind));
        const targetLayer = classifyArchitectureLayer(unexpectedTargets[0] || moduleName);
        const targetServices = (0, intelligence_runtime_common_1.dedupeSorted)(unexpectedTargets
            .map((target) => matchServiceBoundary(serviceBoundaries, target))
            .filter((value) => Boolean(value)));
        const evidenceLevel = violatedDependencyKinds.length > 0 || targetServices.length > 0
            ? 'bounded-inference'
            : 'topology-only';
        const baseSeverity = computeCouplingSeverity(sourceLayer, targetLayer, [...unexpectedTargets, ...targetServices], evidenceLevel);
        const severity = sourceOwnershipBoundary && violatedDependencyKinds.length > 0
            ? criticalityToSeverity(sourceOwnershipBoundary.criticality, baseSeverity)
            : baseSeverity;
        const targetIsShared = targetLayer === 'shared';
        const targetIsCriticalLayer = targetLayer === 'data' || targetLayer === 'infra' || targetLayer === 'ci';
        const category = violatedDependencyKinds.length > 0
            ? 'invariant-violation'
            : sourceLayer === 'shared'
                || targetIsShared
                || ((sourceLayer === 'ui' || sourceLayer === 'api') && targetIsCriticalLayer)
                ? 'layer-violation'
                : targetLayer === 'contract'
                    ? 'contract-misuse'
                    : targetLayer !== sourceLayer && !targetIsShared
                        ? 'architectural-leakage'
                        : 'runtime-coupling';
        pushFinding({
            category,
            severity,
            module: moduleName,
            service: matchServiceBoundary(serviceBoundaries, moduleName),
            message: violatedDependencyKinds.length > 0
                ? `${moduleName} now depends on forbidden ${summarizeValues(violatedDependencyKinds, 3)} surface(s) via ${summarizeValues(unexpectedTargets, 3)}.`
                : `Direct runtime coupling from ${moduleName} now reaches unapproved module(s) ${summarizeValues(unexpectedTargets, 3)}.`,
            rationale: violatedDependencyKinds.length > 0
                ? sourceContracts[0]?.rationale || 'The inferred service contract forbids this dependency direction because it weakens architectural invariants.'
                : evidenceLevel === 'topology-only'
                    ? 'Repository import topology suggests adjacent module impact, but no explicit service or forbidden dependency boundary was crossed.'
                    : 'Repository import topology shows direct dependency movement outside the approved engineering boundary.',
            expected: runtime.intentPack.approvedScope.modules.join(', '),
            actual: violatedDependencyKinds.length > 0 ? violatedDependencyKinds.join(', ') : unexpectedTargets.join(', '),
            evidenceTier: evidenceLevel === 'topology-only' ? 'topology-only' : 'bounded-inference',
            evidence: {
                tier: evidenceLevel === 'topology-only' ? 'topology-only' : 'bounded-inference',
                changedFiles: [],
                changedLines: [],
                dependencyEdges: unexpectedTargets.map((target) => `${moduleName}->${target}`).slice(0, 8),
                boundary: matchServiceBoundary(serviceBoundaries, moduleName) || moduleName,
                explanation: evidenceLevel === 'topology-only'
                    ? 'Dependency evidence comes from repository import topology only.'
                    : 'Dependency evidence comes from import topology plus service/contract boundary context.',
            },
        });
    }
    for (const filePath of evaluatedChangedFiles.slice(0, 24)) {
        const layer = classifyArchitectureLayer(filePath);
        if (layer === 'docs' || layer === 'test') {
            continue;
        }
        const content = safeReadRepoFile(projectRoot, filePath);
        if (!content) {
            continue;
        }
        const lower = content.toLowerCase();
        const moduleName = deriveModulePath(filePath);
        const serviceName = matchServiceBoundary(serviceBoundaries, filePath) || matchServiceBoundary(serviceBoundaries, moduleName);
        const ownershipBoundary = matchOwnershipBoundary(ownershipBoundaries, filePath)
            || matchOwnershipBoundary(ownershipBoundaries, moduleName);
        const serviceContract = ownershipBoundary
            ? semanticContracts.find((contract) => contract.boundaryId === ownershipBoundary.id && contract.kind === 'service-contract') || null
            : null;
        const knownInvariant = ownershipBoundary
            ? knownInvariants.find((invariant) => invariant.boundaryId === ownershipBoundary.id) || null
            : null;
        const addedLineText = (changedFileEvidence.addedLinesByFile.get((0, intelligence_runtime_common_1.normalizeRepoPath)(filePath)) || [])
            .map((line) => line.text)
            .join('\n');
        const observedResponsibilitiesFromDiff = addedLineText
            ? detectResponsibilitySignals(addedLineText)
            : [];
        const observedResponsibilities = observedResponsibilitiesFromDiff.length > 0
            ? observedResponsibilitiesFromDiff
            : detectResponsibilitySignals(content);
        const semanticEvidenceTier = observedResponsibilitiesFromDiff.length > 0 ? 'direct-diff' : 'direct-file';
        if (ownershipBoundary && serviceContract) {
            const violatedResponsibilities = (0, intelligence_runtime_common_1.dedupeSorted)(serviceContract.forbiddenResponsibilities.filter((responsibility) => observedResponsibilities.includes(responsibility)));
            if (violatedResponsibilities.length > 0) {
                const baseSeverity = criticalityToSeverity(ownershipBoundary.criticality, violatedResponsibilities.length > 1 ? 'high' : 'medium');
                pushFinding({
                    category: ownershipBoundary.kind === 'infra'
                        || ownershipBoundary.kind === 'shared'
                        || ownershipBoundary.kind === 'api'
                        ? 'invariant-violation'
                        : 'responsibility-drift',
                    severity: semanticEvidenceTier === 'direct-file' && baseSeverity === 'critical'
                        ? 'high'
                        : semanticEvidenceTier === 'direct-file' && baseSeverity === 'high'
                            ? 'medium'
                            : baseSeverity,
                    file: filePath,
                    module: moduleName,
                    service: serviceName || ownershipBoundary.name,
                    message: `${filePath} carries ${summarizeValues(violatedResponsibilities, 3)} semantics that violate the ${ownershipBoundary.name} contract.`,
                    rationale: semanticEvidenceTier === 'direct-diff'
                        ? knownInvariant?.rationale || serviceContract.rationale
                        : `${knownInvariant?.rationale || serviceContract.rationale} The signal is present in a changed file but was not proven to be introduced by added lines, so remediation should verify whether it is pre-existing.`,
                    expected: serviceContract.expectedResponsibilities.join(', '),
                    actual: violatedResponsibilities.join(', '),
                    evidenceTier: semanticEvidenceTier,
                });
            }
        }
        const persistenceLines = linesForFile(changedFileEvidence.stateMutationLines, filePath);
        const sensitiveLines = linesForFile(changedFileEvidence.sensitiveRuntimeLines, filePath);
        const contractLines = linesForFile(changedFileEvidence.contractSurfaceLines, filePath);
        const touchesPersistence = persistenceLines.length > 0 || EVIDENCE_PATTERNS.stateMutation.test(content);
        const touchesSensitiveRuntime = sensitiveLines.length > 0 || EVIDENCE_PATTERNS.sensitiveRuntime.test(content);
        const touchesContractSurface = contractLines.length > 0 || EVIDENCE_PATTERNS.contractSurface.test(content);
        const outsideApprovedFileOrModule = !approvedFiles.has(filePath) || !approvedModules.has(moduleName);
        if ((layer === 'ui' || layer === 'api') && touchesPersistence && persistenceLines.length > 0) {
            pushFinding({
                category: 'layer-violation',
                severity: layer === 'ui' ? 'critical' : 'high',
                file: filePath,
                module: moduleName,
                service: serviceName,
                message: `${filePath} now mixes ${layer.toUpperCase()} logic with persistence-layer behavior.`,
                rationale: 'Cross-layer persistence access is a semantic architectural shortcut that expands hidden runtime coupling.',
                expected: Array.from(approvedLayers).join(', '),
                actual: 'data-layer behavior in unexpected runtime layer',
                evidenceTier: 'direct-diff',
            });
            continue;
        }
        if ((layer === 'ui' || layer === 'shared' || layer === 'api') && touchesSensitiveRuntime && outsideApprovedFileOrModule && sensitiveLines.length > 0) {
            pushFinding({
                category: containsCriticalDomain(filePath) || authTouched ? 'sensitive-boundary' : 'architectural-leakage',
                severity: authTouched || containsCriticalDomain(filePath) ? 'critical' : 'high',
                file: filePath,
                module: moduleName,
                service: serviceName,
                message: `${filePath} now carries sensitive runtime or credential-handling semantics outside the expected boundary.`,
                rationale: 'Credential, secret, or token handling outside the intended runtime layer creates hidden security and ownership risk.',
                expected: runtime.intentPack.approvedScope.files.join(', '),
                actual: lower.includes('process.env') ? 'process.env or secret handling introduced' : 'sensitive runtime handling introduced',
                evidenceTier: 'direct-diff',
            });
            continue;
        }
        if (touchesContractSurface && (unexpectedServices.length > 0 || impactedServices.length > 1)) {
            const contractEvidenceTier = contractLines.length > 0 ? 'direct-diff' : 'direct-file';
            pushFinding({
                category: 'contract-misuse',
                severity: contractEvidenceTier === 'direct-diff' && impactedServices.length > 1 ? 'high' : 'medium',
                file: filePath,
                module: moduleName,
                service: serviceName,
                message: `${filePath} carries contract-surface semantics outside the approved service boundary.`,
                rationale: contractEvidenceTier === 'direct-diff'
                    ? 'API, schema, or contract edits in a broadened change set indicate interface drift rather than a bounded implementation.'
                    : 'Contract-surface semantics are present in a changed file, but added-line evidence did not prove the contract change was newly introduced.',
                expected: runtime.intentPack.approvedScope.modules.join(', '),
                actual: 'contract or schema surface drift',
                evidenceTier: contractEvidenceTier,
            });
        }
    }
    for (const dependency of changeSet.dependencyChanges) {
        if (dependency.kind === 'added' && !runtime.intentPack.expectedDependencies.includes(dependency.name)) {
            pushFinding({
                category: 'dependency-spread',
                severity: containsCriticalDomain(dependency.name) ? 'critical' : 'high',
                file: dependency.file,
                module: deriveModulePath(dependency.file),
                message: `Unexpected dependency addition detected: ${dependency.name}.`,
                rationale: 'New dependencies expand operational and rollout risk and should be declared up front in intent runtime.',
                expected: runtime.intentPack.expectedDependencies.join(', '),
                actual: dependency.name,
                evidenceTier: 'direct-file',
                actionability: 'directly-actionable',
            });
        }
    }
    const impactedOutsideApproved = impactedModules.filter((moduleName) => !approvedModules.has(moduleName));
    if (impactedOutsideApproved.length > 0) {
        const directServiceSpread = unexpectedServices.length > 0 || changedServices.length > 1;
        pushFinding({
            category: 'blast-radius',
            severity: directServiceSpread || authTouched || infraTouched || dependencyManifestTouched
                ? 'high'
                : impactedOutsideApproved.length >= 4
                    ? 'medium'
                    : 'low',
            module: impactedOutsideApproved[0] || null,
            message: directServiceSpread
                ? `Graph-aware blast radius crosses explicit service/module boundaries (${impactedOutsideApproved.length} impacted module(s) outside scope).`
                : `Repository topology suggests adjacent module impact outside approved scope (${impactedOutsideApproved.length} module(s)).`,
            rationale: directServiceSpread
                ? 'Changed files crossed an explicit service or sensitive boundary, so blast-radius escalation is evidence-backed.'
                : 'This is inferred from import topology only; severity is bounded unless direct boundary or runtime evidence appears.',
            expected: runtime.intentPack.approvedScope.modules.join(', '),
            actual: impactedOutsideApproved.join(', '),
        });
    }
    if (impactedServices.length > 1 || unexpectedServices.length > 0) {
        const directServiceSpread = unexpectedServices.length > 0 || changedServices.length > 1;
        pushFinding({
            category: 'rollout-risk',
            severity: directServiceSpread || deploymentTouched || infraTouched
                ? 'high'
                : 'medium',
            service: impactedServices[0] || null,
            message: directServiceSpread
                ? `Rollout review scope includes ${impactedServices.length} service boundary/boundaries with direct changed-service evidence.`
                : `Repository topology suggests rollout adjacency across ${impactedServices.length} service boundary/boundaries.`,
            rationale: directServiceSpread
                ? 'Direct changed files crossed service boundaries, so coordination risk should be reviewed.'
                : 'Service spread is inferred from topology only; use this as a review hint, not a confirmed rollout expansion.',
            expected: runtime.intentPack.approvedScope.services.join(', '),
            actual: impactedServices.join(', '),
        });
    }
    const decisionResult = applyGovernanceDecisions(attachFindingRelationships(dedupeFindings(findings)), governanceDecisionRegistry);
    const dedupedFindings = decisionResult.findings.sort((left, right) => remediationPriorityRank(right) - remediationPriorityRank(left));
    const governanceDecisions = decisionResult.summary;
    const rolloutRisk = dedupedFindings.reduce((current, finding) => {
        if (finding.severity === 'critical' || finding.severity === 'high')
            return 'high';
        if (finding.severity === 'medium')
            return maxRisk(current, 'medium');
        return current;
    }, changedFiles.length > 8 ? 'medium' : 'low');
    const narratives = buildDriftNarratives({
        findings: dedupedFindings,
        approvedBoundaryLabel,
        unexpectedModules,
        unexpectedServices,
        impactedModules,
        impactedServices,
        rolloutRisk,
        authTouched,
        infraTouched,
        deploymentTouched,
        dependencyManifestTouched,
    });
    const riskSynthesis = buildRiskSynthesis({
        findings: dedupedFindings,
        narratives,
        authTouched,
        infraTouched,
        deploymentTouched,
        dependencyManifestTouched,
        transitiveImpactCount: Math.max(0, impactedModules.length - changedModules.length),
        impactedRuntimeFlows,
        affectedRolloutUnits,
        externalSideEffectExposure,
        stateOwnershipExposure,
        directPropagationEvidence: directRuntimeEvidence
            || directDeploymentEvidence
            || unexpectedServices.length > 0
            || dependencyManifestTouched,
        directDeploymentEvidence,
        topologyOnlyPropagation: !directRuntimeEvidence
            && !directDeploymentEvidence
            && unexpectedServices.length === 0
            && dependencyManifestTouched === false
            && (impactedRuntimeFlows.length > 0 || affectedRolloutUnits.length > 0 || impactedModules.length > changedModules.length),
    });
    const governancePosture = buildGovernancePostureSummary(dedupedFindings);
    const confidence = dedupedFindings.some((finding) => (finding.severity === 'critical' || finding.severity === 'high')
        && Boolean(finding.file)
        && finding.category !== 'blast-radius'
        && finding.category !== 'rollout-risk'
        && finding.category !== 'deployment-coupling')
        ? 'high'
        : dedupedFindings.length > 0
            ? 'medium'
            : 'low';
    const historicalPatternNotes = (0, intelligence_runtime_common_1.dedupeSorted)(dedupedFindings
        .map((finding) => {
        const pattern = runtime.invariantMemory?.historicalDriftPatterns.find((entry) => entry.category === finding.category);
        if (!pattern || pattern.count < 1) {
            return '';
        }
        return `${finding.category} has appeared ${pattern.count} time(s) in invariant memory lineage.`;
    })
        .filter(Boolean));
    return {
        schemaVersion: 1,
        source: 'intent-runtime',
        flagged: dedupedFindings.length > 0,
        confidence,
        changedFiles,
        changedModules,
        changedServices,
        impactedModules,
        impactedServices,
        impactedRuntimeFlows,
        affectedRolloutUnits,
        unexpectedFiles,
        unexpectedModules,
        unexpectedServices,
        rolloutRisk,
        findings: dedupedFindings,
        narratives,
        riskSynthesis,
        governancePosture,
        governanceDecisions,
        explanation: [
            `Changed files: ${changedFiles.length}, changed modules: ${changedModules.length}, impacted modules: ${impactedModules.length}.`,
            impactedRuntimeFlows.length > 0
                ? `Runtime flows impacted: ${summarizeValues(impactedRuntimeFlows, 4)}.`
                : '',
            affectedRolloutUnits.length > 0
                ? directDeploymentEvidence
                    ? `Rollout units affected with direct deployment evidence: ${summarizeValues(affectedRolloutUnits, 4)}.`
                    : `Rollout units inferred from topology only: ${summarizeValues(affectedRolloutUnits, 4)}.`
                : '',
            directRuntimeEvidence || directDeploymentEvidence
                ? `Direct propagation evidence: ${summarizeValues([
                    ...changedFileEvidence.stateMutationFiles,
                    ...changedFileEvidence.externalSideEffectFiles,
                    ...changedFileEvidence.deploymentSemanticFiles,
                    ...changedFileEvidence.sensitiveRuntimeFiles,
                    ...changedFileEvidence.contractSurfaceFiles,
                ], 4)}.`
                : impactedRuntimeFlows.length > 0 || affectedRolloutUnits.length > 0
                    ? 'Propagation is topology-only; severity is intentionally bounded without changed-file runtime or deployment evidence.'
                    : '',
            `Approved scope: ${runtime.intentPack.approvedScope.files.length} file(s), ${runtime.intentPack.approvedScope.modules.length} module(s), ${runtime.intentPack.approvedScope.services.length} service(s).`,
            `Governance posture: ${governancePosture.summary}`,
            governanceDecisions.decisionsApplied > 0
                ? `Governance decisions applied: ${governanceDecisions.activeOverrides} active, ${governanceDecisions.expiredOverrides} expired/invalid.`
                : governanceDecisions.expiredOverrides > 0
                    ? `Governance decision file contained ${governanceDecisions.expiredOverrides} expired/invalid entr${governanceDecisions.expiredOverrides === 1 ? 'y' : 'ies'}.`
                    : '',
            `Compressed ${dedupedFindings.length} raw drift signal(s) into ${narratives.length} operator narrative(s).`,
            historicalPatternNotes[0] || '',
            narratives.length > 0
                ? riskSynthesis.summary
                : 'No high-signal architectural drift was detected against the active intent runtime.',
        ].filter(Boolean),
    };
}
function buildContextAwareBlastRadius(changeSet, runtime, baseline, drift) {
    const flags = changeSet.changedFiles.map(intelligence_runtime_common_1.classifyBoundaryPath);
    const infraTouched = flags.some((item) => item.infra || item.ci);
    const dependencyManifestTouched = flags.some((item) => item.dependencyManifest);
    const authTouched = changeSet.changedFiles.some((filePath) => /(auth|token|secret|permission|billing|payment)/i.test(filePath));
    const apiTouched = changeSet.changedFiles.some((filePath) => /(api|route|controller|handler|graphql|rest)/i.test(filePath));
    const deploymentTouched = changeSet.changedFiles.some((filePath) => /(\.github\/workflows|deploy|terraform|helm|k8s|docker-compose)/i.test(filePath));
    let riskScore = baseline.riskScore;
    if (drift.riskSynthesis.overallRisk === 'critical'
        || drift.rolloutRisk === 'high'
        || drift.findings.some((item) => item.severity === 'critical')) {
        riskScore = 'high';
    }
    else if (drift.riskSynthesis.overallRisk === 'high'
        || (drift.rolloutRisk === 'medium' && riskScore === 'low')) {
        riskScore = 'medium';
    }
    const rationale = (0, intelligence_runtime_common_1.dedupeSorted)([
        ...baseline.rationale,
        infraTouched ? 'Infrastructure or CI surfaces were touched.' : '',
        dependencyManifestTouched ? 'Dependency manifests changed, widening blast radius.' : '',
        drift.impactedModules.length > baseline.modulesAffected.length
            ? `Repository graph expands module impact to ${drift.impactedModules.length} module(s).`
            : '',
        drift.impactedRuntimeFlows.length > 0
            ? `Runtime flow exposure now reaches ${summarizeValues(drift.impactedRuntimeFlows, 4)}.`
            : '',
        drift.affectedRolloutUnits.length > 0
            ? `Deployment spread reaches rollout unit(s) ${summarizeValues(drift.affectedRolloutUnits, 4)}.`
            : '',
        drift.riskSynthesis.externalSideEffectExposure
            ? 'External side effects are part of the changed runtime path.'
            : '',
        drift.riskSynthesis.stateOwnershipExposure
            ? 'State ownership or mutation now spans multiple runtime boundaries.'
            : '',
        drift.unexpectedServices.length > 0
            ? `Unexpected services impacted: ${drift.unexpectedServices.join(', ')}.`
            : '',
        drift.riskSynthesis.summary,
    ]);
    return {
        ...baseline,
        modulesAffected: (0, intelligence_runtime_common_1.dedupeSorted)([...baseline.modulesAffected, ...drift.impactedModules]),
        riskScore,
        rationale,
        affectedServices: drift.changedServices,
        impactedModules: drift.impactedModules,
        impactedServices: drift.impactedServices,
        infraTouched,
        authTouched,
        apiTouched,
        deploymentTouched,
        dependencyManifestTouched,
        rolloutComplexity: drift.rolloutRisk,
        transitiveImpactCount: Math.max(0, drift.impactedModules.length - drift.changedModules.length),
        affectedRuntimeFlows: drift.impactedRuntimeFlows,
        affectedRolloutUnits: drift.affectedRolloutUnits,
        cascadingRisk: drift.riskSynthesis.cascadingRisk,
        stateOwnershipExposure: drift.riskSynthesis.stateOwnershipExposure,
        externalSideEffectExposure: drift.riskSynthesis.externalSideEffectExposure,
        contextSource: drift.source,
    };
}
//# sourceMappingURL=drift-intelligence.js.map