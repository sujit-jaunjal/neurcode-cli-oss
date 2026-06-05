"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ARCHITECTURE_OBLIGATION_POLICY = exports.ARCHITECTURE_OBLIGATION_SCHEMA_VERSION = void 0;
exports.normalizeArchitectureObligationPolicy = normalizeArchitectureObligationPolicy;
exports.effectiveArchitectureObligationMode = effectiveArchitectureObligationMode;
exports.isArchitectureObligationWaiverActive = isArchitectureObligationWaiverActive;
exports.activeArchitectureObligationWaivers = activeArchitectureObligationWaivers;
exports.deriveArchitectureObligations = deriveArchitectureObligations;
exports.summarizeArchitectureObligations = summarizeArchitectureObligations;
exports.evaluateArchitectureObligationFeedback = evaluateArchitectureObligationFeedback;
exports.evaluateArchitectureEdit = evaluateArchitectureEdit;
const micromatch_1 = __importDefault(require("micromatch"));
const architecture_graph_1 = require("./architecture-graph");
exports.ARCHITECTURE_OBLIGATION_SCHEMA_VERSION = 1;
exports.DEFAULT_ARCHITECTURE_OBLIGATION_POLICY = Object.freeze({
    mode: 'warn',
    ruleModes: {},
});
function unique(values) {
    return Array.from(new Set(Array.from(values, (value) => String(value ?? '').trim()).filter(Boolean)));
}
function planText(plan) {
    if (!plan)
        return '';
    return [
        plan.summary,
        ...plan.steps,
        ...plan.constraints,
        ...plan.risks,
        ...plan.expectedFiles,
        ...plan.expectedGlobs,
    ].join('\n');
}
function isDemoRehearsalMarkerIntent(text) {
    return (/\bfixtures\/demo-svc\b/i.test(text) &&
        /\b(marker|rehearsal|demo)\b/i.test(text));
}
function isTestPath(filePath) {
    return (/(^|\/)(tests?|specs?)(\/|$)/i.test(filePath) ||
        /(?:^|[._-])(test|spec)\.[a-z0-9]+$/i.test(filePath) ||
        /(?:^|\/)test_[^/]+\.[a-z0-9]+$/i.test(filePath));
}
function matchesPath(filePath, pathOrGlob) {
    const prefix = pathOrGlob.replace('/**', '').replace('/*', '');
    return (filePath === pathOrGlob ||
        filePath === prefix ||
        filePath.startsWith(prefix + '/') ||
        micromatch_1.default.isMatch(filePath, pathOrGlob, { dot: true, matchBase: true }));
}
function allowedTrajectoryPaths(events) {
    return unique(events
        .filter((event) => event.type === 'check_ok' || event.type === 'check_warn')
        .map((event) => event.filePath));
}
function approvalRequiredPaths(events) {
    const paths = [];
    for (const event of events) {
        if (event.type !== 'check_block')
            continue;
        const raw = event.detail?.approvalContext;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            continue;
        const context = raw;
        const candidate = context.suggestedApprovalPath || context.blockedPath || event.filePath;
        if (typeof candidate === 'string' && candidate.trim())
            paths.push(candidate.trim());
    }
    return unique(paths);
}
function evidence(kind, summary, path) {
    return { kind, summary, ...(path ? { path } : {}) };
}
/** True when an active approval path covers (or is inside) the module glob. */
function approvalCoversPath(approvedPaths, moduleGlob) {
    const prefix = moduleGlob.replace('/**', '').replace('/*', '');
    for (const approved of approvedPaths) {
        const approvedPrefix = approved.replace('/**', '').replace('/*', '');
        if (matchesPath(prefix || moduleGlob, approved) ||
            approvedPrefix === prefix ||
            approvedPrefix.startsWith(prefix + '/') ||
            prefix.startsWith(approvedPrefix + '/')) {
            return approved;
        }
    }
    return null;
}
/** Find a guarded test-path edit that lands inside (or names) the module. */
function moduleTestEdit(trajectoryPaths, moduleId, moduleGlob) {
    const lastSegment = moduleId.split('/').filter(Boolean).at(-1) ?? moduleId;
    for (const filePath of trajectoryPaths) {
        if (!isTestPath(filePath))
            continue;
        if (matchesPath(filePath, moduleGlob))
            return filePath;
        if (lastSegment && filePath.toLowerCase().includes(lastSegment.toLowerCase()))
            return filePath;
    }
    return null;
}
/**
 * Collect the source-free paths/globs currently "in play" for graph obligation
 * derivation: declared intent scope, the accepted plan's expected targets, and
 * the guarded change trajectory (including attempted approval-required writes).
 */
function graphCandidatePaths(input, events) {
    const candidates = new Set();
    const add = (value) => {
        const trimmed = String(value ?? '').trim();
        if (trimmed)
            candidates.add(trimmed);
    };
    const target = input.intentContract?.target;
    (target?.expectedPathGlobs ?? []).forEach(add);
    (target?.pathTokens ?? []).forEach(add);
    if (input.agentPlan) {
        input.agentPlan.expectedFiles.forEach(add);
        input.agentPlan.expectedGlobs.forEach(add);
    }
    for (const event of events) {
        if (event.type === 'check_ok' || event.type === 'check_warn' || event.type === 'check_block') {
            add(event.filePath);
        }
    }
    for (const requiredPath of approvalRequiredPaths(events))
        add(requiredPath);
    return Array.from(candidates);
}
/** Build obligation drafts from the architecture graph for the modules in play. */
function deriveGraphDrafts(input, events, approvedPaths, acceptedPlanText) {
    if (!input.graph)
        return [];
    const candidatePaths = graphCandidatePaths(input, events);
    const seeds = (0, architecture_graph_1.deriveGraphObligationSeeds)({ graph: input.graph, candidatePaths });
    const trajectoryPaths = allowedTrajectoryPaths(events);
    return seeds.map((seed) => {
        const observedEvidence = [];
        if (seed.satisfy.approval) {
            const approved = approvalCoversPath(approvedPaths, seed.requiredPath);
            if (approved) {
                observedEvidence.push(evidence('exact-approval', `Active approval covers ${seed.module}: ${approved}`, approved));
            }
        }
        if (seed.satisfy.planPattern) {
            const pattern = new RegExp(seed.satisfy.planPattern, 'i');
            if (pattern.test(acceptedPlanText)) {
                observedEvidence.push(evidence('accepted-plan', `Accepted plan addresses ${seed.surface} obligation for ${seed.module}.`));
            }
        }
        if (seed.satisfy.moduleTest) {
            const testPath = moduleTestEdit(trajectoryPaths, seed.module, seed.requiredPath);
            if (testPath) {
                observedEvidence.push(evidence('change-trajectory', `Guarded test edit covers ${seed.module}: ${testPath}`, testPath));
            }
        }
        return {
            id: seed.id,
            category: seed.category,
            title: seed.title,
            description: seed.description,
            severity: seed.severity,
            triggeredBy: seed.triggeredBy,
            requiredEvidence: seed.requiredEvidence,
            observedEvidence,
            requiredPath: seed.requiredPath,
        };
    });
}
function normalizePolicyMode(value) {
    return value === 'off' || value === 'warn' || value === 'block' ? value : null;
}
function normalizeArchitectureObligationPolicy(value) {
    const mode = normalizePolicyMode(value?.mode) || exports.DEFAULT_ARCHITECTURE_OBLIGATION_POLICY.mode;
    const ruleModes = {};
    const rawRuleModes = value?.ruleModes;
    if (rawRuleModes && typeof rawRuleModes === 'object' && !Array.isArray(rawRuleModes)) {
        for (const [rawId, rawMode] of Object.entries(rawRuleModes)) {
            const id = rawId.trim();
            const ruleMode = normalizePolicyMode(rawMode);
            if (id && ruleMode)
                ruleModes[id] = ruleMode;
        }
    }
    return { mode, ruleModes };
}
function effectiveArchitectureObligationMode(obligation, policy) {
    const normalized = normalizeArchitectureObligationPolicy(policy);
    return normalized.ruleModes[obligation.id] || normalized.mode;
}
function isArchitectureObligationWaiverActive(waiver, checkedAt = new Date().toISOString()) {
    if (!waiver.obligationId || waiver.revokedAt)
        return false;
    if (!waiver.expiresAt)
        return true;
    const expiresAtMs = Date.parse(waiver.expiresAt);
    const checkedAtMs = Date.parse(checkedAt);
    if (!Number.isFinite(expiresAtMs) || !Number.isFinite(checkedAtMs))
        return false;
    return expiresAtMs > checkedAtMs;
}
function activeArchitectureObligationWaivers(waivers = [], checkedAt = new Date().toISOString()) {
    return waivers.filter((waiver) => isArchitectureObligationWaiverActive(waiver, checkedAt));
}
function finalize(drafts, previous, now, policy, waivers) {
    const previousById = new Map(previous.map((item) => [item.id, item]));
    const activeWaivers = activeArchitectureObligationWaivers(waivers, now);
    const obligations = [];
    for (const draft of drafts) {
        const prior = previousById.get(draft.id);
        const observedEvidence = unique(draft.observedEvidence.map((item) => JSON.stringify(item)))
            .map((item) => JSON.parse(item));
        const effectiveMode = effectiveArchitectureObligationMode(draft, policy);
        if (effectiveMode === 'off')
            continue;
        const activeWaiver = activeWaivers.find((waiver) => waiver.obligationId === draft.id);
        const baseStatus = observedEvidence.length > 0 ? 'satisfied' : 'pending';
        const status = baseStatus === 'pending' && activeWaiver ? 'waived' : baseStatus;
        const waiverEvidence = activeWaiver
            ? {
                eventId: activeWaiver.eventId,
                reason: activeWaiver.reason,
                waivedAt: activeWaiver.waivedAt,
                expiresAt: activeWaiver.expiresAt,
                waivedBy: activeWaiver.waivedBy ?? null,
                source: activeWaiver.source,
            }
            : undefined;
        const finalEvidence = waiverEvidence && baseStatus === 'pending'
            ? [
                ...observedEvidence,
                evidence('waiver', `Waived by ${waiverEvidence.waivedBy || waiverEvidence.source}: ${waiverEvidence.reason}`),
            ]
            : observedEvidence;
        const materiallyChanged = !prior ||
            prior.status !== status ||
            prior.effectiveMode !== effectiveMode ||
            JSON.stringify(prior.observedEvidence) !== JSON.stringify(finalEvidence) ||
            JSON.stringify(prior.waiver ?? null) !== JSON.stringify(waiverEvidence ?? null);
        obligations.push({
            schemaVersion: exports.ARCHITECTURE_OBLIGATION_SCHEMA_VERSION,
            ...draft,
            status,
            observedEvidence: finalEvidence,
            firstSeenAt: prior?.firstSeenAt || now,
            updatedAt: materiallyChanged ? now : prior.updatedAt,
            effectiveMode,
            ...(waiverEvidence && status === 'waived' ? { waiver: waiverEvidence } : {}),
        });
    }
    return obligations;
}
/**
 * Derive the live architecture-obligation ledger from source-free metadata.
 *
 * The first rule set is intentionally conservative. Every obligation is
 * explainable from user intent, the accepted agent plan, guarded path attempts,
 * or exact approval state. Source, diffs, and file contents are never inputs.
 */
function deriveArchitectureObligations(input) {
    const now = input.now || new Date().toISOString();
    const policy = normalizeArchitectureObligationPolicy(input.policy);
    const events = input.events ?? [];
    const trajectoryPaths = allowedTrajectoryPaths(events);
    const acceptedPlanText = planText(input.agentPlan);
    const combinedText = `${input.goal}\n${acceptedPlanText}`.toLowerCase();
    const intentIds = new Set((input.intentContract?.obligations ?? []).map((item) => item.id).filter(Boolean));
    const domains = new Set(input.intentContract?.target?.domainKeywords ?? []);
    const drafts = [];
    const reliabilityTriggered = !isDemoRehearsalMarkerIntent(combinedText) && (/\b(retry|retries|backoff|timeout|idempoten|duplicate side effect)\b/i.test(combinedText) ||
        domains.has('reliability') ||
        intentIds.has('preserve-idempotency') ||
        intentIds.has('cover-retry-path'));
    if (reliabilityTriggered) {
        const retryTest = trajectoryPaths.find(isTestPath);
        drafts.push({
            id: 'reliability:retry-path-coverage',
            category: 'reliability',
            title: 'Exercise the retry path',
            description: 'Retry, backoff, and timeout work should include a guarded test-path change before the session finishes.',
            severity: 'warn',
            triggeredBy: ['intent or accepted plan references retry, backoff, timeout, or reliability'],
            requiredEvidence: ['Edit a test or spec path during this governed session.'],
            observedEvidence: retryTest
                ? [evidence('change-trajectory', `Guarded test-path edit observed: ${retryTest}`, retryTest)]
                : [],
        });
        const idempotencyCommitment = /\b(idempoten\w*|duplicate side effects?|at[- ]most[- ]once)\b/i.test(acceptedPlanText);
        drafts.push({
            id: 'reliability:idempotency-reasoning',
            category: 'reliability',
            title: 'State the idempotency strategy',
            description: 'Retry work needs an accepted-plan commitment explaining how duplicate side effects are avoided.',
            severity: 'critical',
            triggeredBy: ['intent or accepted plan references retry, backoff, timeout, or reliability'],
            requiredEvidence: ['Add an idempotency or duplicate-side-effect commitment to the accepted agent plan.'],
            observedEvidence: idempotencyCommitment
                ? [evidence('accepted-plan', 'Accepted plan states an idempotency or duplicate-side-effect strategy.')]
                : [],
        });
    }
    const migrationTriggered = /\b(migration|migrate|schema change|database migration|backfill)\b/i.test(combinedText) ||
        input.agentPlan?.expectedFiles.some((filePath) => /(^|\/)(migrations?|schema)(\/|$)/i.test(filePath));
    if (migrationTriggered) {
        const rollbackCommitment = /\b(rollback|reversible|down migration|backfill safety|restore strategy)\b/i.test(acceptedPlanText);
        drafts.push({
            id: 'data-model:migration-rollback-plan',
            category: 'data-model',
            title: 'State the migration rollback strategy',
            description: 'Schema and migration work needs an accepted-plan commitment for rollback or reversibility.',
            severity: 'critical',
            triggeredBy: ['intent or accepted plan references migration, schema change, or backfill'],
            requiredEvidence: ['Add a rollback, reversible migration, or restore-strategy commitment to the accepted agent plan.'],
            observedEvidence: rollbackCommitment
                ? [evidence('accepted-plan', 'Accepted plan states a rollback or reversibility strategy.')]
                : [],
        });
    }
    const refactorTriggered = input.intentContract?.primaryAction === 'refactor' ||
        /\b(refactor|restructure|cleanup)\b/i.test(input.goal);
    if (refactorTriggered) {
        const behaviorCommitment = /\b(preserve (?:existing )?behavio[u]?r|backward compat|no behavio[u]?r change|regression tests?)\b/i.test(acceptedPlanText);
        drafts.push({
            id: 'behavior:refactor-preservation-plan',
            category: 'behavior',
            title: 'State the behavior-preservation strategy',
            description: 'Refactors should name how existing behavior remains stable before implementation expands.',
            severity: 'warn',
            triggeredBy: ['user intent declares a refactor or restructure'],
            requiredEvidence: ['Add a behavior-preservation, compatibility, or regression-test commitment to the accepted agent plan.'],
            observedEvidence: behaviorCommitment
                ? [evidence('accepted-plan', 'Accepted plan states a behavior-preservation or regression strategy.')]
                : [],
        });
    }
    const approvedPaths = input.approvedPaths ?? [];
    for (const requiredPath of approvalRequiredPaths(events)) {
        const approved = approvedPaths.find((approvedPath) => matchesPath(requiredPath, approvedPath));
        drafts.push({
            id: `ownership:exact-approval:${requiredPath}`,
            category: 'ownership',
            title: `Approve sensitive path ${requiredPath}`,
            description: 'A guarded sensitive or team-owned path must have an explicit session-scoped approval before the write lands.',
            severity: 'critical',
            triggeredBy: [`guarded write attempted: ${requiredPath}`],
            requiredEvidence: [`Approve exactly ${requiredPath} or an explicitly chosen broader glob.`],
            observedEvidence: approved
                ? [evidence('exact-approval', `Active session approval recorded: ${approved}`, approved)]
                : [],
            requiredPath,
        });
    }
    // V2: architecture-graph-derived structural obligations (auth/payments/
    // public-api/migration/downstream-impact) for the modules currently in play.
    if (!isDemoRehearsalMarkerIntent(combinedText)) {
        drafts.push(...deriveGraphDrafts(input, events, approvedPaths, acceptedPlanText));
    }
    return finalize(drafts, input.previous ?? [], now, policy, input.waivers ?? []);
}
function summarizeArchitectureObligations(obligations = []) {
    return {
        total: obligations.length,
        pending: obligations.filter((item) => item.status === 'pending').length,
        satisfied: obligations.filter((item) => item.status === 'satisfied').length,
        waived: obligations.filter((item) => item.status === 'waived').length,
        criticalPending: obligations.filter((item) => item.status === 'pending' && item.severity === 'critical').length,
        blockingPending: obligations.filter((item) => item.status === 'pending' && (item.effectiveMode ?? 'warn') === 'block').length,
    };
}
/**
 * Whether an obligation applies to a given edit path, independent of its status.
 *  - `ownership` + path-scoped graph obligations apply only when the edit lands
 *    in (or names) their module.
 *  - test-satisfiable graph obligations and retry-coverage do not nag the
 *    satisfying test edit itself.
 *  - global intent/plan obligations apply to every guarded edit.
 */
function obligationScopeMatches(item, filePath) {
    if (item.id === 'reliability:retry-path-coverage' && isTestPath(filePath))
        return false;
    if (item.category === 'ownership')
        return item.requiredPath ? matchesPath(filePath, item.requiredPath) : false;
    if (item.requiredPath) {
        if ((0, architecture_graph_1.isModuleTestSatisfiable)(item.id) && isTestPath(filePath))
            return false;
        return matchesPath(filePath, item.requiredPath);
    }
    return true;
}
function evaluateArchitectureObligationFeedback(obligations = [], filePath) {
    const pending = obligations.filter((item) => {
        if (item.status !== 'pending')
            return false;
        if ((item.effectiveMode ?? 'warn') === 'off')
            return false;
        return obligationScopeMatches(item, filePath);
    });
    const blocking = pending.filter((item) => (item.effectiveMode ?? 'warn') === 'block');
    return {
        action: blocking.length > 0 ? 'block' : pending.length > 0 ? 'warn' : 'none',
        filePath,
        pending,
        blocking,
        reasons: pending.map((item) => `${item.title}: ${item.requiredEvidence[0]}`),
    };
}
const SEVERITY_RANK = { critical: 0, warn: 1 };
function pickPrimary(obligations) {
    if (obligations.length === 0)
        return null;
    return [...obligations].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])[0];
}
/**
 * Evaluate one edit against the architecture graph + live obligation ledger and
 * return a single structured verdict:
 *   pass · warn · block · obligation_pending · obligation_waived
 *
 * Boundary blocks always win. Block-mode pending obligations also block. Open
 * warn-mode obligations surface as `obligation_pending` (the edit is allowed but
 * carries an open obligation). When the only applicable obligations are waived,
 * the status is `obligation_waived`.
 */
function evaluateArchitectureEdit(input) {
    const filePath = input.filePath;
    const boundaryVerdict = input.boundaryVerdict ?? 'ok';
    const obligations = input.obligations ?? [];
    const graph = input.graph ?? null;
    const module = graph ? (0, architecture_graph_1.findModuleForPath)(graph, filePath) : null;
    const surfaces = module?.surfaces ?? [];
    const dependents = graph && module ? (0, architecture_graph_1.dependentsOf)(graph, module.id) : [];
    const applicable = obligations.filter((item) => (item.effectiveMode ?? 'warn') !== 'off' && obligationScopeMatches(item, filePath));
    const pending = applicable.filter((item) => item.status === 'pending');
    const blocking = pending.filter((item) => (item.effectiveMode ?? 'warn') === 'block');
    const waived = applicable.filter((item) => item.status === 'waived');
    const satisfied = applicable.filter((item) => item.status === 'satisfied');
    let status;
    if (boundaryVerdict === 'block' || blocking.length > 0)
        status = 'block';
    else if (pending.length > 0)
        status = 'obligation_pending';
    else if (waived.length > 0)
        status = 'obligation_waived';
    else if (boundaryVerdict === 'warn')
        status = 'warn';
    else
        status = 'pass';
    const reasons = [];
    const primary = pickPrimary(blocking.length > 0 ? blocking : pending.length > 0 ? pending : waived);
    let message = '';
    if (status === 'block') {
        if (blocking.length > 0 && primary) {
            message = `${primary.description} (architecture obligation enforced as block).`;
            reasons.push(...blocking.map((item) => item.description));
        }
        else {
            message = module
                ? `Edit to ${filePath} is blocked by a governance boundary in module ${module.id}.`
                : `Edit to ${filePath} is blocked by a governance boundary.`;
            reasons.push('boundary policy block');
        }
    }
    else if (status === 'obligation_pending' && primary) {
        message = primary.description;
        reasons.push(...pending.map((item) => `${item.title}: ${item.requiredEvidence[0] ?? ''}`.trim()));
    }
    else if (status === 'obligation_waived' && primary) {
        const who = primary.waiver?.waivedBy || primary.waiver?.source || 'a human';
        message = `${primary.description} A waiver is active (${who}); proceeding under accepted risk.`;
        reasons.push(...waived.map((item) => `${item.title} waived`));
    }
    else if (status === 'warn') {
        message = module
            ? `Edit to ${filePath} in module ${module.id} is allowed with an advisory warning.`
            : `Edit to ${filePath} is allowed with an advisory warning.`;
    }
    else {
        message = '';
    }
    let options;
    if (status === 'block') {
        const ownershipDriven = blocking.some((item) => item.category === 'ownership' || item.category === 'payments' || item.category === 'security') ||
            Boolean(module?.approvalRequired);
        options = ownershipDriven ? ['approve', 'waive', 'narrow', 'replan'] : ['waive', 'narrow', 'replan'];
    }
    else if (status === 'obligation_pending') {
        options = ['continue', 'approve', 'waive', 'replan'];
    }
    else {
        options = ['continue'];
    }
    return {
        status,
        filePath,
        module: module?.id ?? null,
        surfaces,
        dependents,
        boundaryVerdict,
        obligations: { blocking, pending, waived, satisfied },
        reasons: reasons.filter(Boolean),
        message,
        options,
    };
}
//# sourceMappingURL=architecture-obligations.js.map