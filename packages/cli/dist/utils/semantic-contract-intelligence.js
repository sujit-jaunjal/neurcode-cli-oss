"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRepositorySemanticModel = buildRepositorySemanticModel;
exports.buildEngineeringInvariantMemory = buildEngineeringInvariantMemory;
exports.recordDriftInInvariantMemory = recordDriftInInvariantMemory;
const fs_1 = require("fs");
const path_1 = require("path");
const intelligence_runtime_common_1 = require("./intelligence-runtime-common");
function dedupeSorted(values) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}
function dedupeSortedPaths(values) {
    return dedupeSorted(values.map(intelligence_runtime_common_1.normalizeRepoPath));
}
function lowerPath(pathValue) {
    return (0, intelligence_runtime_common_1.normalizeRepoPath)(pathValue).toLowerCase();
}
function deriveDomainLabel(pathValue) {
    const normalized = lowerPath(pathValue);
    if (/(^|\/)(auth|identity|iam|rbac|permission)(\/|$)/.test(normalized))
        return 'identity';
    if (/(^|\/)(billing|payment|invoice|refund)(\/|$)/.test(normalized))
        return 'payments';
    if (/(^|\/)(notification|notify|email|sms|alert|webhook)(\/|$)/.test(normalized))
        return 'notifications';
    if (/(^|\/)(queue|event|worker|job|consumer)(\/|$)/.test(normalized))
        return 'event-processing';
    if (/(^|\/)(infra|terraform|helm|k8s|deploy|docker)(\/|$)/.test(normalized))
        return 'delivery';
    if (/(^|\/)(db|database|model|models|migration|prisma)(\/|$)/.test(normalized))
        return 'persistence';
    if (/(^|\/)(api|gateway|route|controller|handler)(\/|$)/.test(normalized))
        return 'api';
    if (/(^|\/)(ui|web|frontend|component|page|view)(\/|$)/.test(normalized))
        return 'presentation';
    if (/(^|\/)(shared|common|lib|libs)(\/|$)/.test(normalized))
        return 'shared-platform';
    const parts = normalized.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'repository';
}
function inferBoundaryProfile(pathValue, category) {
    const normalized = lowerPath(pathValue);
    const cat = (category || '').toLowerCase();
    if (/(^|\/)(auth|identity|iam|rbac|permission|token)(\/|$)/.test(normalized)) {
        return {
            kind: 'auth',
            domain: 'identity',
            responsibilities: ['authentication', 'authorization', 'credential-validation'],
            forbiddenResponsibilities: ['payment-orchestration', 'notification-dispatch', 'deployment-control'],
            criticality: 'critical',
            allowedDependencyKinds: ['auth', 'shared', 'contract', 'data', 'service'],
            forbiddenDependencyKinds: ['payment', 'infra', 'ci', 'deployment', 'ui'],
        };
    }
    if (/(^|\/)(billing|payment|invoice|refund|checkout)(\/|$)/.test(normalized)) {
        return {
            kind: 'payment',
            domain: 'payments',
            responsibilities: ['payment-orchestration', 'billing-state', 'settlement-coordination'],
            forbiddenResponsibilities: ['credential-governance', 'identity-policy', 'deployment-control'],
            criticality: 'critical',
            allowedDependencyKinds: ['payment', 'shared', 'contract', 'data', 'service'],
            forbiddenDependencyKinds: ['auth', 'infra', 'ci', 'deployment', 'ui'],
        };
    }
    if (/(^|\/)(notification|notify|email|sms|alert|webhook)(\/|$)/.test(normalized)) {
        return {
            kind: 'notification',
            domain: 'notifications',
            responsibilities: ['notification-delivery', 'message-formatting', 'event-fanout'],
            forbiddenResponsibilities: ['auth-state-mutation', 'payment-settlement', 'deployment-control'],
            criticality: 'sensitive',
            allowedDependencyKinds: ['notification', 'worker', 'shared', 'contract', 'service'],
            forbiddenDependencyKinds: ['auth', 'payment', 'infra', 'ci', 'deployment', 'data'],
        };
    }
    if (cat === 'infra' || /(^|\/)(infra|terraform|helm|k8s|docker|deploy)(\/|$)/.test(normalized)) {
        return {
            kind: 'infra',
            domain: 'delivery',
            responsibilities: ['deployment-topology', 'infrastructure-configuration', 'runtime-delivery'],
            forbiddenResponsibilities: ['business-orchestration', 'domain-state-mutation', 'request-routing'],
            criticality: 'critical',
            allowedDependencyKinds: ['infra', 'ci', 'deployment', 'shared'],
            forbiddenDependencyKinds: ['auth', 'payment', 'api', 'service', 'worker', 'data', 'ui'],
        };
    }
    if (cat === 'ui' || /(^|\/)(ui|web|frontend|component|page|view)(\/|$)/.test(normalized)) {
        return {
            kind: 'ui',
            domain: 'presentation',
            responsibilities: ['presentation', 'interaction-handling', 'view-composition'],
            forbiddenResponsibilities: ['direct-persistence-mutation', 'credential-authority', 'deployment-control'],
            criticality: 'standard',
            allowedDependencyKinds: ['ui', 'shared', 'contract', 'api'],
            forbiddenDependencyKinds: ['data', 'infra', 'ci', 'deployment'],
        };
    }
    if (cat === 'api' || /(^|\/)(api|gateway|route|controller|handler)(\/|$)/.test(normalized)) {
        return {
            kind: 'api',
            domain: 'api',
            responsibilities: ['request-routing', 'contract-translation', 'boundary-validation'],
            forbiddenResponsibilities: ['direct-persistence-mutation', 'deployment-control', 'payment-orchestration'],
            criticality: 'sensitive',
            allowedDependencyKinds: ['api', 'service', 'shared', 'contract'],
            forbiddenDependencyKinds: ['infra', 'ci', 'deployment', 'ui', 'data'],
        };
    }
    if (cat === 'worker' || /(^|\/)(worker|queue|event|job|consumer)(\/|$)/.test(normalized)) {
        return {
            kind: 'worker',
            domain: 'event-processing',
            responsibilities: ['background-processing', 'event-consumption', 'async-coordination'],
            forbiddenResponsibilities: ['auth-state-mutation', 'deployment-control', 'ui-presentation'],
            criticality: 'sensitive',
            allowedDependencyKinds: ['worker', 'service', 'shared', 'contract', 'notification'],
            forbiddenDependencyKinds: ['ui', 'infra', 'ci', 'deployment'],
        };
    }
    if (cat === 'shared' || /(^|\/)(shared|common|lib|libs)(\/|$)/.test(normalized)) {
        return {
            kind: 'shared',
            domain: 'shared-platform',
            responsibilities: ['shared-utilities', 'cross-cutting-support', 'common-types'],
            forbiddenResponsibilities: ['domain-orchestration', 'credential-authority', 'deployment-control'],
            criticality: 'standard',
            allowedDependencyKinds: ['shared', 'contract'],
            forbiddenDependencyKinds: ['auth', 'payment', 'api', 'service', 'worker', 'infra', 'ci', 'deployment', 'data'],
        };
    }
    if (cat === 'service' && /(^|\/)(db|database|model|models|migration|prisma|sequelize)(\/|$)/.test(normalized)) {
        return {
            kind: 'data',
            domain: 'persistence',
            responsibilities: ['persistence-modeling', 'data-access', 'storage-schema'],
            forbiddenResponsibilities: ['request-routing', 'deployment-control', 'presentation'],
            criticality: 'sensitive',
            allowedDependencyKinds: ['data', 'shared', 'contract'],
            forbiddenDependencyKinds: ['ui', 'infra', 'ci', 'deployment'],
        };
    }
    return {
        kind: 'service',
        domain: deriveDomainLabel(pathValue),
        responsibilities: ['service-domain-logic', 'bounded-business-behavior'],
        forbiddenResponsibilities: ['deployment-control', 'ui-presentation', 'cross-domain-orchestration'],
        criticality: 'standard',
        allowedDependencyKinds: ['service', 'shared', 'contract', 'data'],
        forbiddenDependencyKinds: ['ui', 'infra', 'ci', 'deployment'],
    };
}
function escapeRegex(value) {
    return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}
function globToRegex(pattern) {
    const normalized = (0, intelligence_runtime_common_1.normalizeRepoPath)(pattern.replace(/^\/+/, ''));
    const escaped = escapeRegex(normalized)
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*');
    if (normalized.endsWith('/')) {
        return new RegExp(`^${escaped}`);
    }
    if (!normalized.includes('*')) {
        return new RegExp(`^${escaped}(?:$|/)`);
    }
    return new RegExp(`^${escaped}$`);
}
function loadCodeOwners(projectRoot) {
    const candidates = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS'];
    const rules = [];
    let order = 0;
    for (const candidate of candidates) {
        const fullPath = (0, path_1.join)(projectRoot, candidate);
        if (!(0, fs_1.existsSync)(fullPath)) {
            continue;
        }
        const content = (0, fs_1.readFileSync)(fullPath, 'utf-8');
        for (const rawLine of content.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) {
                continue;
            }
            const [pattern, ...owners] = line.split(/\s+/);
            if (!pattern || owners.length === 0) {
                continue;
            }
            rules.push({
                regex: globToRegex(pattern),
                owners: owners.map((owner) => owner.trim()).filter(Boolean),
                order: order += 1,
            });
        }
    }
    return rules;
}
function matchCodeOwners(rules, pathValue) {
    const normalized = (0, intelligence_runtime_common_1.normalizeRepoPath)(pathValue);
    let matched = [];
    let matchedOrder = -1;
    for (const rule of rules) {
        if (rule.order < matchedOrder) {
            continue;
        }
        if (rule.regex.test(normalized)) {
            matched = rule.owners;
            matchedOrder = rule.order;
        }
    }
    return matched;
}
function buildOwnershipBoundary(moduleNode, codeOwnerRules) {
    const modulePath = (0, intelligence_runtime_common_1.normalizeRepoPath)(moduleNode.path || moduleNode.label);
    const profile = inferBoundaryProfile(modulePath, moduleNode.category);
    const codeOwners = matchCodeOwners(codeOwnerRules, modulePath);
    const stewardship = {
        primaryOwner: codeOwners[0] || profile.domain,
        codeOwners,
    };
    const fingerprintPayload = {
        modulePath,
        kind: profile.kind,
        domain: profile.domain,
        primaryOwner: stewardship.primaryOwner,
        responsibilities: profile.responsibilities,
        forbiddenResponsibilities: profile.forbiddenResponsibilities,
    };
    return {
        id: `owner-${(0, intelligence_runtime_common_1.fingerprintValue)(fingerprintPayload).slice(0, 16)}`,
        name: modulePath,
        path: modulePath,
        kind: profile.kind,
        domain: profile.domain,
        stewardship,
        responsibilities: profile.responsibilities,
        forbiddenResponsibilities: profile.forbiddenResponsibilities,
        criticality: profile.criticality,
        confidence: codeOwners.length > 0 ? 'high' : profile.criticality === 'critical' ? 'medium' : 'low',
    };
}
function buildContractsForBoundary(boundary) {
    const profile = inferBoundaryProfile(boundary.path, boundary.kind);
    const serviceContract = {
        id: `contract-${(0, intelligence_runtime_common_1.fingerprintValue)(['service', boundary.id, ...boundary.responsibilities]).slice(0, 16)}`,
        name: `${boundary.name} service contract`,
        kind: 'service-contract',
        boundaryId: boundary.id,
        boundaryName: boundary.name,
        subjectPath: boundary.path,
        expectedResponsibilities: boundary.responsibilities,
        forbiddenResponsibilities: boundary.forbiddenResponsibilities,
        allowedDependencyKinds: profile.allowedDependencyKinds,
        forbiddenDependencyKinds: profile.forbiddenDependencyKinds,
        rationale: `${boundary.name} should remain focused on ${boundary.responsibilities.join(', ')} and avoid ${boundary.forbiddenResponsibilities.join(', ')}.`,
        evidence: [boundary.path, boundary.kind, boundary.domain],
        confidence: boundary.confidence,
    };
    const layeringContract = {
        id: `contract-${(0, intelligence_runtime_common_1.fingerprintValue)(['layering', boundary.id, ...profile.forbiddenDependencyKinds]).slice(0, 16)}`,
        name: `${boundary.name} layering contract`,
        kind: boundary.kind === 'infra' || boundary.kind === 'deployment' || boundary.kind === 'ci'
            ? 'deployment-boundary'
            : 'layering',
        boundaryId: boundary.id,
        boundaryName: boundary.name,
        subjectPath: boundary.path,
        expectedResponsibilities: boundary.responsibilities,
        forbiddenResponsibilities: boundary.forbiddenResponsibilities,
        allowedDependencyKinds: profile.allowedDependencyKinds,
        forbiddenDependencyKinds: profile.forbiddenDependencyKinds,
        rationale: `${boundary.name} should depend only on ${profile.allowedDependencyKinds.join(', ')} surfaces and avoid ${profile.forbiddenDependencyKinds.join(', ')} coupling.`,
        evidence: [boundary.path, ...profile.allowedDependencyKinds.slice(0, 4)],
        confidence: boundary.confidence === 'low' ? 'medium' : boundary.confidence,
    };
    return [serviceContract, layeringContract];
}
function buildInvariantsForBoundary(boundary, contracts) {
    const serviceContract = contracts.find((contract) => contract.kind === 'service-contract') || null;
    const layeringContract = contracts.find((contract) => contract.kind !== 'service-contract') || null;
    const invariants = [];
    if (serviceContract) {
        invariants.push({
            id: `invariant-${(0, intelligence_runtime_common_1.fingerprintValue)(['responsibility', boundary.id, serviceContract.id]).slice(0, 16)}`,
            name: `${boundary.name} responsibility invariant`,
            category: 'service-responsibility',
            scope: 'module',
            subjectPath: boundary.path,
            boundaryId: boundary.id,
            boundaryName: boundary.name,
            expectation: `${boundary.name} should remain responsible for ${boundary.responsibilities.join(', ')} and avoid ${boundary.forbiddenResponsibilities.join(', ')}.`,
            impact: boundary.criticality === 'critical' ? 'critical' : boundary.criticality === 'sensitive' ? 'high' : 'medium',
            rationale: serviceContract.rationale,
            relatedContractIds: [serviceContract.id],
            evidence: [boundary.path, ...boundary.responsibilities],
            confidence: serviceContract.confidence,
        });
    }
    if (layeringContract) {
        invariants.push({
            id: `invariant-${(0, intelligence_runtime_common_1.fingerprintValue)(['layer', boundary.id, layeringContract.id]).slice(0, 16)}`,
            name: `${boundary.name} layering invariant`,
            category: boundary.kind === 'infra' || boundary.kind === 'deployment' || boundary.kind === 'ci'
                ? 'deployment'
                : 'layering',
            scope: 'module',
            subjectPath: boundary.path,
            boundaryId: boundary.id,
            boundaryName: boundary.name,
            expectation: `${boundary.name} should not directly couple to ${layeringContract.forbiddenDependencyKinds.join(', ')} layers.`,
            impact: boundary.criticality === 'critical' ? 'critical' : 'high',
            rationale: layeringContract.rationale,
            relatedContractIds: [layeringContract.id],
            evidence: [boundary.path, ...layeringContract.forbiddenDependencyKinds.slice(0, 6)],
            confidence: layeringContract.confidence,
        });
    }
    return invariants;
}
function buildRepositoryLevelInvariants(ownershipBoundaries) {
    const domains = new Map();
    for (const boundary of ownershipBoundaries) {
        const list = domains.get(boundary.domain) || [];
        list.push(boundary);
        domains.set(boundary.domain, list);
    }
    const invariants = [];
    const authBoundaries = ownershipBoundaries.filter((boundary) => boundary.kind === 'auth');
    const paymentBoundaries = ownershipBoundaries.filter((boundary) => boundary.kind === 'payment');
    if (authBoundaries.length > 0 && paymentBoundaries.length > 0) {
        invariants.push({
            id: `invariant-${(0, intelligence_runtime_common_1.fingerprintValue)(['auth-payment-separation', authBoundaries[0].id, paymentBoundaries[0].id]).slice(0, 16)}`,
            name: 'Identity and payment boundaries stay separated',
            category: 'ownership',
            scope: 'repository',
            subjectPath: '.',
            boundaryId: null,
            boundaryName: null,
            expectation: 'Auth and payment boundaries should remain isolated so credential authority does not accumulate payment orchestration responsibilities.',
            impact: 'critical',
            rationale: 'Senior platform teams expect identity and payment control planes to remain independent in AI-assisted changes.',
            relatedContractIds: [],
            evidence: [...authBoundaries.map((item) => item.path), ...paymentBoundaries.map((item) => item.path)],
            confidence: 'medium',
        });
    }
    for (const [domain, boundaries] of domains.entries()) {
        if (boundaries.length < 2) {
            continue;
        }
        invariants.push({
            id: `invariant-${(0, intelligence_runtime_common_1.fingerprintValue)(['domain-consistency', domain, ...boundaries.map((item) => item.id)]).slice(0, 16)}`,
            name: `${domain} ownership remains coherent`,
            category: 'ownership',
            scope: 'service',
            subjectPath: boundaries[0]?.path || '.',
            boundaryId: null,
            boundaryName: domain,
            expectation: `${domain} responsibilities should remain coherent across ${boundaries.length} related boundary path(s) without leaking into unrelated domains.`,
            impact: boundaries.some((item) => item.criticality !== 'standard') ? 'high' : 'medium',
            rationale: 'Boundary coherence makes AI-generated cross-service edits easier to review and less likely to accumulate accidental ownership drift.',
            relatedContractIds: [],
            evidence: boundaries.map((item) => item.path),
            confidence: 'low',
        });
    }
    return invariants;
}
const MAX_RUNTIME_FILES_PER_BOUNDARY = 14;
const MAX_RUNTIME_BYTES_PER_BOUNDARY = 64_000;
const RUNTIME_BEHAVIOR_PATTERNS = [
    {
        kind: 'api-provider',
        patterns: [
            /\b(app|get|post|put|patch|delete)\s*\(/i,
            /\brouter\.(get|post|put|patch|delete)\b/i,
            /\b(FastAPI|APIRouter|Blueprint|ServeHTTP|grpc\.Server)\b/i,
        ],
    },
    {
        kind: 'api-consumer',
        patterns: [
            /\b(fetch|axios|httpx|requests\.(get|post|put|patch|delete)|grpc\.Dial|new\s+URL)\b/i,
            /https?:\/\//i,
        ],
    },
    {
        kind: 'event-producer',
        patterns: [
            /\b(publish|emit|enqueue|sendMessage|send_task|kafka\.producer|sns\.publish|sqs\.send)\b/i,
        ],
    },
    {
        kind: 'event-consumer',
        patterns: [
            /\b(consume|consumer|subscribe|on_message|process_job|celery\.task|queue\.process)\b/i,
        ],
    },
    {
        kind: 'state-owner',
        patterns: [
            /\b(prisma|sequelize|typeorm|knex|redis|postgres|mysql|mongo|migration|entity|model)\b/i,
        ],
    },
    {
        kind: 'state-mutator',
        patterns: [
            /\b(insert|update|delete|save|commit|transaction|createMany|updateMany|upsert)\b/i,
        ],
    },
    {
        kind: 'workflow-orchestrator',
        patterns: [
            /\b(orchestrate|workflow|coordinator|pipeline|saga|dispatch|fanout|step function)\b/i,
        ],
    },
    {
        kind: 'external-side-effect',
        patterns: [
            /\b(webhook|email|sms|slack|twilio|ses|publish|notify|httpx|axios|fetch)\b/i,
        ],
    },
    {
        kind: 'deployment-aware',
        patterns: [
            /\b(terraform|helm|k8s|deployment|serviceaccount|docker-compose|workflow_dispatch)\b/i,
        ],
    },
    {
        kind: 'runtime-config-consumer',
        patterns: [
            /\b(process\.env|os\.environ|getenv|ConfigMap|Secret|dotenv)\b/i,
        ],
    },
];
const SIDE_EFFECT_PATTERNS = [
    { label: 'http', patterns: [/\b(fetch|axios|httpx|requests\.)\b/i, /https?:\/\//i] },
    { label: 'webhook', patterns: [/\bwebhook\b/i] },
    { label: 'email', patterns: [/\b(email|ses|smtp|sendgrid)\b/i] },
    { label: 'sms', patterns: [/\b(sms|twilio)\b/i] },
    { label: 'queue', patterns: [/\b(kafka|sns|sqs|rabbit|pubsub|bullmq|celery)\b/i] },
    { label: 'config', patterns: [/\b(process\.env|getenv|ConfigMap|Secret|dotenv)\b/i] },
];
const STATE_SURFACE_PATTERNS = [
    { label: 'sql', patterns: [/\b(prisma|sequelize|typeorm|knex|postgres|mysql|sqlalchemy)\b/i] },
    { label: 'cache', patterns: [/\b(redis|memcache)\b/i] },
    { label: 'document-store', patterns: [/\b(mongo|dynamo)\b/i] },
    { label: 'migration', patterns: [/\b(migration|ddl|schema)\b/i] },
];
const RUNTIME_ENV_PATTERNS = [
    { label: 'production', patterns: [/\b(prod|production)\b/i] },
    { label: 'staging', patterns: [/\b(stage|staging)\b/i] },
    { label: 'development', patterns: [/\b(dev|development|local)\b/i] },
];
function safeReadFile(projectRoot, filePath, maxBytes = 16_000) {
    const fullPath = (0, path_1.join)(projectRoot, (0, intelligence_runtime_common_1.normalizeRepoPath)(filePath));
    if (!(0, fs_1.existsSync)(fullPath)) {
        return null;
    }
    try {
        return (0, fs_1.readFileSync)(fullPath, 'utf-8').slice(0, maxBytes);
    }
    catch {
        return null;
    }
}
function collectModuleFiles(sourceFiles) {
    const result = new Map();
    for (const file of sourceFiles) {
        const normalized = (0, intelligence_runtime_common_1.normalizeRepoPath)(file);
        const parts = normalized.split('/').filter(Boolean);
        const modulePath = parts.length <= 1
            ? parts[0] || normalized
            : ['src', 'app', 'apps', 'services', 'packages', 'libs', 'lib', 'web'].includes(parts[0]) && parts.length >= 2
                ? `${parts[0]}/${parts[1]}`
                : parts[0];
        const list = result.get(modulePath) || [];
        list.push(normalized);
        result.set(modulePath, list);
    }
    return result;
}
function extractTokenSet(content, patterns) {
    return dedupeSorted(patterns
        .filter((entry) => entry.patterns.some((pattern) => pattern.test(content)))
        .map((entry) => entry.label));
}
function buildBehaviorProfile(projectRoot, boundary, files) {
    const selectedFiles = files.slice(0, MAX_RUNTIME_FILES_PER_BOUNDARY);
    let remainingBudget = MAX_RUNTIME_BYTES_PER_BOUNDARY;
    const contentParts = [];
    for (const file of selectedFiles) {
        if (remainingBudget <= 0) {
            break;
        }
        const content = safeReadFile(projectRoot, file, Math.min(16_000, remainingBudget));
        if (!content) {
            continue;
        }
        remainingBudget -= content.length;
        contentParts.push(content);
    }
    const combined = contentParts.join('\n');
    const behaviorKinds = dedupeSorted(RUNTIME_BEHAVIOR_PATTERNS
        .filter((entry) => entry.patterns.some((pattern) => pattern.test(combined) || selectedFiles.some((file) => pattern.test(file))))
        .map((entry) => entry.kind));
    const sideEffectKinds = extractTokenSet(combined, SIDE_EFFECT_PATTERNS);
    const stateSurfaces = extractTokenSet(combined, STATE_SURFACE_PATTERNS);
    const runtimeEnvironments = extractTokenSet(combined, RUNTIME_ENV_PATTERNS);
    const rolloutUnits = dedupeSorted(selectedFiles
        .filter((file) => /(deployment|service|worker|api|web|queue|job)/i.test(file))
        .map((file) => file.split('/').slice(-2).join('/'))).slice(0, 8);
    const externalDependencies = dedupeSorted([
        ...sideEffectKinds,
        ...runtimeEnvironments.map((env) => `env:${env}`),
        ...stateSurfaces.map((surface) => `state:${surface}`),
    ]).slice(0, 12);
    const criticalFlows = dedupeSorted([
        behaviorKinds.includes('api-provider') && behaviorKinds.includes('state-mutator')
            ? `${boundary.name} handles request -> state mutation`
            : '',
        behaviorKinds.includes('workflow-orchestrator') && behaviorKinds.includes('event-producer')
            ? `${boundary.name} orchestrates workflow fanout`
            : '',
        behaviorKinds.includes('deployment-aware')
            ? `${boundary.name} is deployment-aware`
            : '',
    ]);
    return {
        boundaryId: boundary.id,
        boundaryName: boundary.name,
        domain: boundary.domain,
        behaviorKinds,
        sideEffectKinds,
        externalDependencies,
        stateSurfaces,
        rolloutUnits,
        runtimeEnvironments,
        criticalFlows,
        confidence: behaviorKinds.length >= 3
            ? 'high'
            : behaviorKinds.length >= 1 || sideEffectKinds.length > 0 || stateSurfaces.length > 0
                ? 'medium'
                : 'low',
    };
}
function detectDeploymentBoundaryType(pathValue) {
    const normalized = lowerPath(pathValue);
    if (normalized.startsWith('helm/') || normalized.includes('/charts/'))
        return 'helm';
    if (normalized.startsWith('terraform/') || normalized.endsWith('.tf'))
        return 'terraform';
    if (normalized.startsWith('k8s/') || normalized.includes('/manifests/'))
        return 'kubernetes';
    if (normalized.startsWith('.github/workflows/') || normalized.includes('/ci/'))
        return 'ci';
    if (normalized.includes('docker') || normalized.endsWith('docker-compose.yml') || normalized.endsWith('docker-compose.yaml'))
        return 'docker';
    return 'manifest';
}
function buildDeploymentBoundaries(projectRoot, ownershipBoundaries, boundaryPaths) {
    const boundaries = ownershipBoundaries.map((boundary) => ({
        id: boundary.id,
        name: boundary.name,
        searchTokens: dedupeSorted([
            boundary.name,
            boundary.name.split('/').slice(-1)[0] || '',
            boundary.domain,
        ]).filter((token) => token.length >= 2),
    }));
    const deploymentBoundaries = [];
    for (const boundaryPath of boundaryPaths) {
        const content = safeReadFile(projectRoot, boundaryPath, 24_000) || '';
        const dependentBoundaries = boundaries.filter((boundary) => boundary.searchTokens.some((token) => token && new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(content)));
        const rolloutUnits = dedupeSorted(dependentBoundaries.map((boundary) => boundary.name).concat(/(rollout|deployment|daemonset|statefulset|cronjob|job)/i.test(content)
            ? [(0, intelligence_runtime_common_1.normalizeRepoPath)(boundaryPath)]
            : [])).slice(0, 12);
        const runtimeEnvironments = extractTokenSet(content, RUNTIME_ENV_PATTERNS);
        const payload = {
            path: boundaryPath,
            rolloutUnits,
            runtimeEnvironments,
            dependents: dependentBoundaries.map((boundary) => boundary.id),
        };
        deploymentBoundaries.push({
            id: `deploy-${(0, intelligence_runtime_common_1.fingerprintValue)(payload).slice(0, 16)}`,
            name: (0, intelligence_runtime_common_1.normalizeRepoPath)(boundaryPath),
            path: (0, intelligence_runtime_common_1.normalizeRepoPath)(boundaryPath),
            type: detectDeploymentBoundaryType(boundaryPath),
            rolloutUnits,
            runtimeEnvironments,
            dependentBoundaryIds: dependentBoundaries.map((boundary) => boundary.id),
            dependentBoundaryNames: dependentBoundaries.map((boundary) => boundary.name),
            confidence: dependentBoundaries.length > 0 ? 'high' : content.length > 0 ? 'medium' : 'low',
        });
    }
    return deploymentBoundaries.sort((left, right) => left.name.localeCompare(right.name));
}
function buildRuntimeInteractions(ownershipBoundaries, behaviorProfiles, deploymentBoundaries, edges) {
    const boundaryByPath = new Map(ownershipBoundaries.map((boundary) => [boundary.path, boundary]));
    const behaviorById = new Map(behaviorProfiles.map((profile) => [profile.boundaryId, profile]));
    const interactions = [];
    const seen = new Set();
    for (const edge of edges) {
        if (edge.type !== 'imports' || !edge.from.startsWith('module:') || !edge.to.startsWith('module:')) {
            continue;
        }
        const fromBoundary = boundaryByPath.get(edge.from.slice('module:'.length));
        const toBoundary = boundaryByPath.get(edge.to.slice('module:'.length));
        if (!fromBoundary || !toBoundary || fromBoundary.id === toBoundary.id) {
            continue;
        }
        const fromBehavior = behaviorById.get(fromBoundary.id);
        const toBehavior = behaviorById.get(toBoundary.id);
        let kind = null;
        let subject = edge.evidence || `${fromBoundary.name}->${toBoundary.name}`;
        let rationale = 'Module import topology indicates runtime adjacency between these ownership boundaries.';
        if (fromBehavior?.behaviorKinds.includes('api-consumer') && toBehavior?.behaviorKinds.includes('api-provider')) {
            kind = 'api-call';
            rationale = 'The source consumes API-like behavior and the target exposes provider-like behavior.';
        }
        else if (fromBehavior?.behaviorKinds.includes('event-producer') && toBehavior?.behaviorKinds.includes('event-consumer')) {
            kind = 'event-flow';
            rationale = 'The source produces event-like side effects and the target consumes queue or event semantics.';
        }
        else if (fromBehavior?.behaviorKinds.includes('state-mutator') && toBehavior?.behaviorKinds.includes('state-owner')) {
            kind = 'state-mutation';
            rationale = 'The source mutates state while the target owns persistence-like surfaces.';
        }
        else if (fromBehavior?.behaviorKinds.includes('workflow-orchestrator') || toBehavior?.behaviorKinds.includes('workflow-orchestrator')) {
            kind = 'operational-coupling';
            rationale = 'Workflow or coordinator behavior amplifies runtime dependence across boundaries.';
        }
        else if (fromBehavior?.behaviorKinds.includes('state-owner') || toBehavior?.behaviorKinds.includes('state-owner')) {
            kind = 'state-access';
            rationale = 'Imports now connect a boundary with persistence/state ownership semantics.';
        }
        if (!kind) {
            continue;
        }
        const key = `${kind}:${fromBoundary.id}:${toBoundary.id}:${subject}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        interactions.push({
            id: `rtx-${(0, intelligence_runtime_common_1.fingerprintValue)(key).slice(0, 16)}`,
            kind,
            fromBoundaryId: fromBoundary.id,
            fromBoundaryName: fromBoundary.name,
            toBoundaryId: toBoundary.id,
            toBoundaryName: toBoundary.name,
            subject,
            rationale,
            confidence: fromBehavior?.confidence === 'high' && toBehavior?.confidence === 'high' ? 'high' : 'medium',
        });
    }
    for (const deploymentBoundary of deploymentBoundaries) {
        for (const dependentId of deploymentBoundary.dependentBoundaryIds) {
            const dependentBoundary = ownershipBoundaries.find((boundary) => boundary.id === dependentId);
            if (!dependentBoundary) {
                continue;
            }
            const key = `deployment:${deploymentBoundary.id}:${dependentId}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            interactions.push({
                id: `rtx-${(0, intelligence_runtime_common_1.fingerprintValue)(key).slice(0, 16)}`,
                kind: 'deployment-dependency',
                fromBoundaryId: dependentBoundary.id,
                fromBoundaryName: dependentBoundary.name,
                toBoundaryId: null,
                toBoundaryName: deploymentBoundary.name,
                subject: deploymentBoundary.path,
                rationale: 'Deployment or CI manifests reference this ownership boundary, so rollout semantics propagate into production delivery.',
                confidence: deploymentBoundary.confidence,
            });
        }
    }
    return interactions.sort((left, right) => left.id.localeCompare(right.id));
}
function buildRepositorySemanticModel(input) {
    const codeOwnerRules = loadCodeOwners(input.projectRoot);
    const moduleFiles = collectModuleFiles(input.sourceFiles);
    const moduleNodes = input.nodes
        .filter((node) => (node.type === 'module' || node.type === 'service') && typeof node.path === 'string' && node.path.trim().length > 0)
        .sort((left, right) => left.id.localeCompare(right.id));
    const ownershipBoundaries = moduleNodes.map((node) => buildOwnershipBoundary(node, codeOwnerRules));
    const contracts = ownershipBoundaries.flatMap((boundary) => buildContractsForBoundary(boundary));
    const invariants = ownershipBoundaries.flatMap((boundary) => buildInvariantsForBoundary(boundary, contracts.filter((contract) => contract.boundaryId === boundary.id)));
    const repositoryLevelInvariants = buildRepositoryLevelInvariants(ownershipBoundaries);
    const criticalDomains = ownershipBoundaries
        .filter((boundary) => boundary.criticality !== 'standard')
        .map((boundary) => boundary.domain);
    const behaviorProfiles = ownershipBoundaries.map((boundary) => buildBehaviorProfile(input.projectRoot, boundary, moduleFiles.get(boundary.path) || []));
    const deploymentBoundaries = buildDeploymentBoundaries(input.projectRoot, ownershipBoundaries, dedupeSortedPaths([...input.boundaries.infraPaths, ...input.boundaries.ciPaths]));
    const runtimeInteractions = buildRuntimeInteractions(ownershipBoundaries, behaviorProfiles, deploymentBoundaries, input.edges);
    const criticalFlows = dedupeSorted([
        ...behaviorProfiles.flatMap((profile) => profile.criticalFlows),
        ...runtimeInteractions
            .filter((interaction) => interaction.kind === 'deployment-dependency'
            || interaction.kind === 'state-mutation'
            || interaction.kind === 'operational-coupling')
            .map((interaction) => `${interaction.fromBoundaryName} -> ${interaction.toBoundaryName || interaction.subject}`),
    ]);
    return {
        ownershipBoundaries: ownershipBoundaries.sort((left, right) => left.name.localeCompare(right.name)),
        contracts: contracts.sort((left, right) => left.id.localeCompare(right.id)),
        invariants: [...invariants, ...repositoryLevelInvariants].sort((left, right) => left.id.localeCompare(right.id)),
        criticalDomains: dedupeSorted(criticalDomains),
        runtime: {
            behaviorProfiles: behaviorProfiles.sort((left, right) => left.boundaryName.localeCompare(right.boundaryName)),
            interactions: runtimeInteractions,
            deploymentBoundaries,
            criticalFlows,
            blindSpots: dedupeSorted([
                'Dynamic service discovery and runtime-only traffic policies remain advisory blind spots.',
                'Network policies, feature flags, and external SaaS callbacks are inferred structurally, not observed live.',
            ]),
        },
    };
}
function buildEngineeringInvariantMemory(input) {
    const generatedAt = (0, intelligence_runtime_common_1.nowIso)();
    const payloadWithoutFingerprint = {
        schemaVersion: intelligence_runtime_common_1.LOCAL_INTELLIGENCE_SCHEMA_VERSION,
        generatedAt,
        updatedAt: generatedAt,
        sessionId: input.sessionRuntime.sessionId,
        intentPackId: input.intentPack.intentPackId,
        repositoryGraphId: input.repositoryGraph.graphId,
        branchName: input.sessionRuntime.branchName,
        headSha: input.sessionRuntime.headSha,
        ownershipBoundaries: input.repositoryGraph.semantic?.ownershipBoundaries || [],
        contracts: input.repositoryGraph.semantic?.contracts || [],
        invariants: input.repositoryGraph.semantic?.invariants || [],
        runtimeBehaviorProfiles: input.repositoryGraph.semantic?.runtime.behaviorProfiles || [],
        runtimeInteractions: input.repositoryGraph.semantic?.runtime.interactions || [],
        deploymentBoundaries: input.repositoryGraph.semantic?.runtime.deploymentBoundaries || [],
        acceptedBoundaries: {
            approvedModules: [...input.intentPack.approvedScope.modules],
            approvedServices: [...input.intentPack.approvedScope.services],
            forbiddenBoundaries: input.intentPack.forbiddenBoundaries.map((item) => `${item.type}:${item.path}`),
        },
        lineage: {
            previousSessionId: input.sessionRuntime.continuity.previousSessionId,
            sessionLineage: [...input.sessionRuntime.continuity.lineage],
            previousInvariantMemoryId: input.previousMemory?.invariantMemoryId || null,
        },
        historicalDriftPatterns: input.previousMemory?.historicalDriftPatterns || [],
        recentObservationHashes: input.previousMemory?.recentObservationHashes || [],
    };
    const fingerprint = (0, intelligence_runtime_common_1.fingerprintValue)(payloadWithoutFingerprint);
    return {
        ...payloadWithoutFingerprint,
        invariantMemoryId: `invariants-${fingerprint.slice(0, 16)}`,
        fingerprint,
    };
}
function recordDriftInInvariantMemory(projectRoot, sessionRuntime, invariantMemory, drift) {
    if (!invariantMemory || !drift || (!drift.narratives.length && !drift.findings.length)) {
        return invariantMemory;
    }
    const now = (0, intelligence_runtime_common_1.nowIso)();
    const observationHash = (0, intelligence_runtime_common_1.fingerprintValue)({
        sessionId: sessionRuntime.sessionId,
        source: drift.source,
        changedFiles: drift.changedFiles,
        changedModules: drift.changedModules,
        narrativeCategories: drift.narratives.map((entry) => entry.category),
        findingCategories: drift.findings.map((entry) => entry.category),
        summary: drift.riskSynthesis.summary,
    });
    if ((invariantMemory.recentObservationHashes || []).includes(observationHash)) {
        return invariantMemory;
    }
    const nextPatterns = new Map((invariantMemory.historicalDriftPatterns || []).map((entry) => [entry.id, { ...entry }]));
    const signals = drift.narratives.length > 0
        ? drift.narratives.map((entry) => ({
            category: entry.category,
            summary: entry.summary,
            severity: entry.severity,
        }))
        : drift.findings.map((entry) => ({
            category: entry.category,
            summary: entry.message,
            severity: entry.severity,
        }));
    for (const signal of signals) {
        const id = `pattern-${signal.category}`;
        const current = nextPatterns.get(id);
        nextPatterns.set(id, {
            id,
            category: signal.category,
            count: (current?.count || 0) + 1,
            lastObservedAt: now,
            latestSummary: signal.summary,
            latestSeverity: signal.severity,
        });
    }
    const payloadWithoutFingerprint = {
        ...invariantMemory,
        updatedAt: now,
        historicalDriftPatterns: Array.from(nextPatterns.values()).sort((left, right) => left.category.localeCompare(right.category)),
        recentObservationHashes: [
            ...(invariantMemory.recentObservationHashes || []),
            observationHash,
        ].slice(-24),
    };
    const next = {
        ...payloadWithoutFingerprint,
        fingerprint: (0, intelligence_runtime_common_1.fingerprintValue)({
            ...payloadWithoutFingerprint,
            fingerprint: undefined,
        }),
    };
    const activePath = sessionRuntime.artifactPaths.invariantMemory
        || (0, path_1.join)(projectRoot, '.neurcode', intelligence_runtime_common_1.ACTIVE_INVARIANT_MEMORY_FILENAME);
    (0, intelligence_runtime_common_1.writeJsonFile)(activePath, next);
    const sessionSnapshotPath = (0, path_1.join)((0, intelligence_runtime_common_1.ensureSessionsDir)(projectRoot), sessionRuntime.sessionId, intelligence_runtime_common_1.ACTIVE_INVARIANT_MEMORY_FILENAME);
    (0, intelligence_runtime_common_1.writeJsonFile)(sessionSnapshotPath, next);
    return next;
}
//# sourceMappingURL=semantic-contract-intelligence.js.map