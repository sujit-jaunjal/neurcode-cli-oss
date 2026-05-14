"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOVERNANCE_DECISIONS_SCHEMA_VERSION = void 0;
exports.getGovernanceDecisionsPath = getGovernanceDecisionsPath;
exports.isGovernanceDecisionState = isGovernanceDecisionState;
exports.isDriftIntelligenceCategory = isDriftIntelligenceCategory;
exports.listDriftIntelligenceCategories = listDriftIntelligenceCategories;
exports.isGovernanceDecisionExpired = isGovernanceDecisionExpired;
exports.isGovernanceDecisionOverride = isGovernanceDecisionOverride;
exports.readGovernanceDecisionRegistry = readGovernanceDecisionRegistry;
exports.writeGovernanceDecisionRegistry = writeGovernanceDecisionRegistry;
exports.resolveGovernanceActor = resolveGovernanceActor;
exports.resolveGovernanceDecisionExpiry = resolveGovernanceDecisionExpiry;
exports.buildGovernanceDecision = buildGovernanceDecision;
exports.addGovernanceDecision = addGovernanceDecision;
exports.summarizeGovernanceDecisionHygiene = summarizeGovernanceDecisionHygiene;
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const intelligence_runtime_common_1 = require("./intelligence-runtime-common");
exports.GOVERNANCE_DECISIONS_SCHEMA_VERSION = 'neurcode.governance-decisions.v1';
const DRIFT_CATEGORIES = new Set([
    'scope-expansion',
    'cross-service',
    'dependency-spread',
    'infra-leakage',
    'sensitive-boundary',
    'blast-radius',
    'rollout-risk',
    'runtime-coupling',
    'architectural-leakage',
    'layer-violation',
    'contract-misuse',
    'ownership-inversion',
    'responsibility-drift',
    'invariant-violation',
    'behavioral-drift',
    'deployment-coupling',
    'state-ownership-risk',
]);
const KNOWN_DECISION_FIELDS = new Set([
    'id',
    'state',
    'findingId',
    'category',
    'file',
    'module',
    'service',
    'reason',
    'actor',
    'decidedAt',
    'expiresAt',
    'temporary',
]);
function getGovernanceDecisionsPath(projectRoot) {
    return (0, path_1.join)(projectRoot, '.neurcode', 'governance-decisions.json');
}
function isGovernanceDecisionState(value) {
    return value === 'acknowledged'
        || value === 'review-required'
        || value === 'accepted-risk'
        || value === 'rollout-approved'
        || value === 'rollout-blocked'
        || value === 'advisory-dismissed'
        || value === 'temporary-exception';
}
function isDriftIntelligenceCategory(value) {
    return typeof value === 'string' && DRIFT_CATEGORIES.has(value);
}
function listDriftIntelligenceCategories() {
    return [...DRIFT_CATEGORIES].sort((left, right) => left.localeCompare(right));
}
function isGovernanceDecisionExpired(decision, now = Date.now()) {
    if (!decision.expiresAt)
        return false;
    const ts = Date.parse(decision.expiresAt);
    return !Number.isFinite(ts) || ts <= now;
}
function isGovernanceDecisionOverride(state) {
    return state === 'accepted-risk'
        || state === 'rollout-approved'
        || state === 'advisory-dismissed'
        || state === 'temporary-exception';
}
function asDecisionString(value, fallback) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}
function asNullableDecisionString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
function normalizeNullablePath(value) {
    const raw = asNullableDecisionString(value);
    return raw ? (0, intelligence_runtime_common_1.normalizeRepoPath)(raw) : null;
}
function decisionHash(parts) {
    return (0, crypto_1.createHash)('sha256').update(parts.join('|')).digest('hex').slice(0, 14);
}
function diagnoseUnsupportedFields(record, decisionId) {
    return Object.keys(record)
        .filter((key) => !KNOWN_DECISION_FIELDS.has(key))
        .sort((left, right) => left.localeCompare(right))
        .map((field) => ({
        severity: 'warning',
        code: 'unsupported-field',
        decisionId,
        message: `Decision contains unsupported field '${field}'.`,
        remediation: 'Remove unsupported fields so governance artifacts stay portable and deterministic.',
    }));
}
function readGovernanceDecisionRegistry(projectRoot) {
    const sourcePath = getGovernanceDecisionsPath(projectRoot);
    if (!(0, fs_1.existsSync)(sourcePath)) {
        return { sourcePath, decisions: [], invalidEntries: 0, rawDecisionCount: 0, diagnostics: [] };
    }
    let parsed;
    try {
        parsed = JSON.parse((0, fs_1.readFileSync)(sourcePath, 'utf-8'));
    }
    catch {
        return {
            sourcePath,
            decisions: [],
            invalidEntries: 1,
            rawDecisionCount: 0,
            diagnostics: [{
                    severity: 'error',
                    code: 'invalid-json',
                    decisionId: null,
                    message: 'Governance decisions artifact is not valid JSON.',
                    remediation: 'Repair .neurcode/governance-decisions.json or regenerate decisions with neurcode governance commands.',
                }],
        };
    }
    const records = Array.isArray(parsed.decisions)
        ? parsed.decisions
        : [];
    let invalidEntries = 0;
    const decisions = [];
    const diagnostics = [];
    if (!Array.isArray(parsed.decisions)) {
        diagnostics.push({
            severity: 'error',
            code: 'missing-decisions-array',
            decisionId: null,
            message: 'Governance decisions artifact must contain a decisions array.',
            remediation: 'Use neurcode governance accept-risk, temporary-exception, or review to author decisions.',
        });
    }
    records.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            invalidEntries += 1;
            diagnostics.push({
                severity: 'error',
                code: 'invalid-entry',
                decisionId: null,
                message: `Decision entry ${index + 1} is not an object.`,
            });
            return;
        }
        const record = entry;
        const id = asDecisionString(record.id, `decision-${index + 1}`);
        diagnostics.push(...diagnoseUnsupportedFields(record, id));
        if (!isGovernanceDecisionState(record.state)) {
            invalidEntries += 1;
            diagnostics.push({
                severity: 'error',
                code: 'invalid-state',
                decisionId: id,
                message: `Decision ${id} has an unsupported governance state.`,
            });
            return;
        }
        const reason = asDecisionString(record.reason, '');
        if (reason.length < 8) {
            invalidEntries += 1;
            diagnostics.push({
                severity: 'error',
                code: 'missing-justification',
                decisionId: id,
                message: `Decision ${id} must include a justification of at least 8 characters.`,
            });
            return;
        }
        const category = asNullableDecisionString(record.category);
        if (category && !isDriftIntelligenceCategory(category)) {
            diagnostics.push({
                severity: 'warning',
                code: 'unknown-category',
                decisionId: id,
                message: `Decision ${id} references unknown drift category '${category}'.`,
                remediation: 'Use neurcode governance decisions --json to inspect known category values before authoring category-scoped decisions.',
            });
        }
        const decidedAt = asDecisionString(record.decidedAt, new Date(0).toISOString());
        if (!Number.isFinite(Date.parse(decidedAt))) {
            diagnostics.push({
                severity: 'warning',
                code: 'invalid-decided-at',
                decisionId: id,
                message: `Decision ${id} has a non-ISO decidedAt value.`,
            });
        }
        const expiresAt = asNullableDecisionString(record.expiresAt);
        if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) {
            diagnostics.push({
                severity: 'warning',
                code: 'invalid-expiry',
                decisionId: id,
                message: `Decision ${id} has a non-ISO expiresAt value and will be treated as expired.`,
            });
        }
        decisions.push({
            id,
            state: record.state,
            findingId: asNullableDecisionString(record.findingId),
            category: isDriftIntelligenceCategory(category) ? category : null,
            file: normalizeNullablePath(record.file),
            module: normalizeNullablePath(record.module),
            service: asNullableDecisionString(record.service),
            reason,
            actor: asDecisionString(record.actor, 'unknown'),
            decidedAt,
            expiresAt,
            temporary: record.temporary === true || record.state === 'temporary-exception',
        });
    });
    return { sourcePath, decisions, invalidEntries, rawDecisionCount: records.length, diagnostics };
}
function writeGovernanceDecisionRegistry(projectRoot, decisions) {
    const sourcePath = getGovernanceDecisionsPath(projectRoot);
    (0, fs_1.mkdirSync)((0, path_1.dirname)(sourcePath), { recursive: true });
    const payload = {
        schemaVersion: exports.GOVERNANCE_DECISIONS_SCHEMA_VERSION,
        decisions,
    };
    (0, fs_1.writeFileSync)(sourcePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
    return sourcePath;
}
function resolveGovernanceActor(projectRoot, explicit) {
    if (explicit && explicit.trim())
        return explicit.trim();
    if (process.env.NEURCODE_GOVERNANCE_ACTOR && process.env.NEURCODE_GOVERNANCE_ACTOR.trim()) {
        return process.env.NEURCODE_GOVERNANCE_ACTOR.trim();
    }
    if (process.env.GITHUB_ACTOR && process.env.GITHUB_ACTOR.trim()) {
        return process.env.GITHUB_ACTOR.trim();
    }
    try {
        const gitEmail = (0, child_process_1.execFileSync)('git', ['config', 'user.email'], {
            cwd: projectRoot,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (gitEmail)
            return gitEmail;
    }
    catch {
        // Fall back below.
    }
    try {
        const gitName = (0, child_process_1.execFileSync)('git', ['config', 'user.name'], {
            cwd: projectRoot,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (gitName)
            return gitName;
    }
    catch {
        // Fall back below.
    }
    return process.env.USER || 'unknown';
}
function resolveGovernanceDecisionExpiry(input) {
    if (input.expiresAt && input.expiresAt.trim()) {
        const parsed = Date.parse(input.expiresAt.trim());
        if (!Number.isFinite(parsed)) {
            throw new Error('expiresAt must be a valid ISO timestamp');
        }
        return new Date(parsed).toISOString();
    }
    if (input.expiresInDays !== undefined) {
        const days = Number(input.expiresInDays);
        if (!Number.isFinite(days) || days <= 0) {
            throw new Error('days must be a positive number');
        }
        return new Date(Date.now() + Math.floor(days) * 24 * 60 * 60 * 1000).toISOString();
    }
    if (input.required) {
        throw new Error('temporary exceptions require --expires <iso> or --days <n>');
    }
    return null;
}
function buildGovernanceDecision(input) {
    const decidedAt = input.decidedAt || new Date().toISOString();
    const file = input.file ? (0, intelligence_runtime_common_1.normalizeRepoPath)(input.file) : null;
    const module = input.module ? (0, intelligence_runtime_common_1.normalizeRepoPath)(input.module) : null;
    const service = input.service && input.service.trim() ? input.service.trim() : null;
    const findingId = input.findingId && input.findingId.trim() ? input.findingId.trim() : null;
    const reason = input.reason.trim();
    if (reason.length < 8) {
        throw new Error('decision reason must be at least 8 characters');
    }
    if (!findingId && !input.category) {
        throw new Error('decision must target either --finding <id> or --category <category>');
    }
    if (input.category && !isDriftIntelligenceCategory(input.category)) {
        throw new Error(`unsupported drift category '${input.category}'`);
    }
    const id = `gov-dec-${decisionHash([
        input.state,
        findingId || '',
        input.category || '',
        file || '',
        module || '',
        service || '',
        reason,
        input.actor,
        decidedAt,
    ])}`;
    return {
        id,
        state: input.state,
        findingId,
        category: input.category || null,
        file,
        module,
        service,
        reason,
        actor: input.actor,
        decidedAt,
        expiresAt: input.expiresAt || null,
        temporary: input.temporary === true || input.state === 'temporary-exception',
    };
}
function addGovernanceDecision(projectRoot, decision) {
    const registry = readGovernanceDecisionRegistry(projectRoot);
    const blockingDiagnostics = registry.diagnostics.filter((item) => item.severity === 'error');
    if (registry.invalidEntries > 0 || blockingDiagnostics.length > 0) {
        throw new Error('governance decisions artifact has invalid entries; run `neurcode governance hygiene` and repair it before authoring new decisions');
    }
    const next = [
        ...registry.decisions.filter((item) => item.id !== decision.id),
        decision,
    ];
    const sourcePath = writeGovernanceDecisionRegistry(projectRoot, next);
    return { decision, sourcePath, totalDecisions: next.length };
}
function summarizeGovernanceDecisionHygiene(registry) {
    const issues = [...registry.diagnostics];
    const now = Date.now();
    let activeDecisions = 0;
    let expiredDecisions = 0;
    for (const decision of registry.decisions) {
        const expired = isGovernanceDecisionExpired(decision, now);
        if (expired) {
            expiredDecisions += 1;
            issues.push({
                severity: 'warning',
                code: 'expired-decision',
                decisionId: decision.id,
                message: `Decision ${decision.id} is expired and no longer changes rollout posture.`,
                remediation: 'Remove expired decisions or author a fresh temporary exception with current justification.',
            });
        }
        else {
            activeDecisions += 1;
        }
        if (isGovernanceDecisionOverride(decision.state) && !decision.expiresAt && decision.state === 'temporary-exception') {
            issues.push({
                severity: 'error',
                code: 'unbounded-temporary-exception',
                decisionId: decision.id,
                message: `Temporary exception ${decision.id} has no expiry.`,
                remediation: 'Add expiresAt or recreate it with neurcode governance temporary-exception --days <n>.',
            });
        }
        if (!decision.findingId && !decision.category) {
            issues.push({
                severity: 'error',
                code: 'unmatched-decision-target',
                decisionId: decision.id,
                message: `Decision ${decision.id} cannot match findings because it has neither findingId nor category.`,
                remediation: 'Target a specific finding or drift category.',
            });
        }
        if (!decision.findingId && decision.category && !decision.file && !decision.module && !decision.service) {
            issues.push({
                severity: 'warning',
                code: 'broad-scope',
                decisionId: decision.id,
                message: `Decision ${decision.id} applies broadly to category '${decision.category}'.`,
                remediation: 'Prefer adding --file, --module, or --service when accepting risk for a bounded scope.',
            });
        }
    }
    const errorCount = issues.filter((item) => item.severity === 'error').length;
    const warningCount = issues.filter((item) => item.severity === 'warning').length;
    return {
        sourcePath: registry.sourcePath,
        totalDecisions: registry.decisions.length,
        activeDecisions,
        expiredDecisions,
        invalidEntries: registry.invalidEntries,
        issueCount: issues.length,
        errorCount,
        warningCount,
        issues,
    };
}
//# sourceMappingURL=governance-decisions.js.map