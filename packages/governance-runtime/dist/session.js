"use strict";
/**
 * V0 session store — lightweight JSON-file-backed governance session.
 *
 * One session per .neurcode/sessions/<id>.json.
 * No daemon required; CLI commands and hooks read/write directly.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_OBLIGATION_WAIVER_TTL_MS = exports.DEFAULT_APPROVAL_TTL_MS = void 0;
exports.sessionsDir = sessionsDir;
exports.sessionPath = sessionPath;
exports.createSession = createSession;
exports.loadActiveSession = loadActiveSession;
exports.loadSession = loadSession;
exports.appendEvent = appendEvent;
exports.refreshArchitectureObligations = refreshArchitectureObligations;
exports.activeApprovalPaths = activeApprovalPaths;
exports.expireSessionApprovals = expireSessionApprovals;
exports.expireArchitectureObligationWaivers = expireArchitectureObligationWaivers;
exports.waiveArchitectureObligation = waiveArchitectureObligation;
exports.approveSession = approveSession;
exports.revokeSessionApproval = revokeSessionApproval;
exports.finishSession = finishSession;
exports.replaySession = replaySession;
exports.evaluateIntentCoherence = evaluateIntentCoherence;
exports.attachAgentPlan = attachAgentPlan;
exports.classifyAgentPlanAmendment = classifyAgentPlanAmendment;
exports.captureAgentPlan = captureAgentPlan;
exports.amendAgentPlan = amendAgentPlan;
exports.decideAgentPlanAmendment = decideAgentPlanAmendment;
exports.evaluateSessionPlanCoherence = evaluateSessionPlanCoherence;
exports.evaluatePlanCoherencePolicy = evaluatePlanCoherencePolicy;
exports.activeAgentPlanRevision = activeAgentPlanRevision;
exports.buildPlanTimeline = buildPlanTimeline;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const micromatch_1 = __importDefault(require("micromatch"));
const profile_1 = require("./profile");
const agent_plan_1 = require("./agent-plan");
const architecture_obligations_1 = require("./architecture-obligations");
const ai_change_record_1 = require("./ai-change-record");
const repository_topology_1 = require("./repository-topology");
const intent_privacy_1 = require("./intent-privacy");
exports.DEFAULT_APPROVAL_TTL_MS = 60 * 60 * 1000;
exports.DEFAULT_OBLIGATION_WAIVER_TTL_MS = 60 * 60 * 1000;
// ── Path helpers ──────────────────────────────────────────────────────────────
function sessionsDir(projectRoot) {
    return (0, node_path_1.join)(projectRoot, '.neurcode', 'sessions');
}
function sessionPath(projectRoot, sessionId) {
    return (0, node_path_1.join)(sessionsDir(projectRoot), `${sessionId}.json`);
}
function activePointerPath(projectRoot) {
    return (0, node_path_1.join)(projectRoot, '.neurcode', 'active-session.json');
}
function uniquePrivacyReasons(values) {
    return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}
const MAX_LOCAL_PRIVATE_DEPTH = 12;
const MAX_LOCAL_PRIVATE_ARRAY_ITEMS = 200;
const MAX_LOCAL_PRIVATE_OBJECT_KEYS = 200;
const MAX_LOCAL_PRIVATE_NODES = 20_000;
const LOCAL_PRIVATE_PRIORITY_KEYS = new Set([
    'approvalContext',
    'blockContext',
    'planAmendment',
    'architectureEdit',
    'obligation',
    'continuityContext',
]);
function boundedLocalPrivateEntries(value) {
    const entries = Object.entries(value);
    if (entries.length <= MAX_LOCAL_PRIVATE_OBJECT_KEYS)
        return entries;
    const priority = entries.filter(([key]) => LOCAL_PRIVATE_PRIORITY_KEYS.has(key));
    const remaining = entries.filter(([key]) => !LOCAL_PRIVATE_PRIORITY_KEYS.has(key));
    return [...priority, ...remaining].slice(0, MAX_LOCAL_PRIVATE_OBJECT_KEYS);
}
function sanitizeLocalPrivateValue(value, reasonCodes, depth = 0, state = { nodes: 0 }) {
    state.nodes += 1;
    if (state.nodes > MAX_LOCAL_PRIVATE_NODES) {
        reasonCodes.add('object_truncated');
        return null;
    }
    if (depth > MAX_LOCAL_PRIVATE_DEPTH) {
        reasonCodes.add('depth_exceeded');
        return '[REDACTED:depth_exceeded]';
    }
    if (typeof value === 'string') {
        const sanitized = (0, intent_privacy_1.sanitizeLocalPrivateText)(value);
        sanitized.reasonCodes.forEach((reason) => reasonCodes.add(reason));
        return sanitized.value;
    }
    if (Array.isArray(value)) {
        if (value.length > MAX_LOCAL_PRIVATE_ARRAY_ITEMS)
            reasonCodes.add('array_truncated');
        return value
            .slice(0, MAX_LOCAL_PRIVATE_ARRAY_ITEMS)
            .map((item) => sanitizeLocalPrivateValue(item, reasonCodes, depth + 1, state));
    }
    if (!value || typeof value !== 'object')
        return value;
    const result = {};
    const entries = Object.entries(value);
    if (entries.length > MAX_LOCAL_PRIVATE_OBJECT_KEYS)
        reasonCodes.add('object_truncated');
    for (const [key, child] of boundedLocalPrivateEntries(value)) {
        const sanitizedKey = (0, intent_privacy_1.sanitizeLocalPrivateText)(key, 200);
        sanitizedKey.reasonCodes.forEach((reason) => reasonCodes.add(reason));
        result[sanitizedKey.value || 'redacted_key'] = sanitizeLocalPrivateValue(child, reasonCodes, depth + 1, state);
    }
    return result;
}
function markLocalPrivateSession(session, reasons, updatedAt = new Date().toISOString()) {
    session.privacy = {
        policyVersion: intent_privacy_1.INTENT_PRIVACY_POLICY_VERSION,
        classification: 'local_private',
        bounded: true,
        sensitivePatternRedaction: true,
        reasonCodes: uniquePrivacyReasons([
            ...(session.privacy?.reasonCodes ?? []),
            ...reasons,
        ]),
        updatedAt,
    };
}
function sanitizeAgentPlanForLocalPrivate(plan) {
    const reasons = new Set();
    const localPlan = sanitizeLocalPrivateValue(plan, reasons);
    return {
        plan: {
            ...localPlan,
            expectedFiles: (localPlan.expectedFiles ?? []).flatMap((candidate) => {
                const sanitized = (0, intent_privacy_1.sanitizeRepoRelativePath)(candidate, { allowGlobs: false });
                return sanitized.path ? [sanitized.path] : [];
            }),
            expectedGlobs: (localPlan.expectedGlobs ?? []).flatMap((candidate) => {
                const sanitized = (0, intent_privacy_1.sanitizeRepoRelativePath)(candidate, {
                    allowGlobs: true,
                    requireGlob: true,
                });
                return sanitized.path ? [sanitized.path] : [];
            }),
        },
        reasonCodes: uniquePrivacyReasons(reasons),
    };
}
function sanitizeSessionEventForLocalPrivate(event) {
    const reasons = new Set();
    return {
        event: sanitizeLocalPrivateValue(event, reasons),
        reasonCodes: uniquePrivacyReasons(reasons),
    };
}
const SESSION_EVENT_LOCK_TIMEOUT_MS = 2_000;
const SESSION_EVENT_LOCK_STALE_MS = 30_000;
const SESSION_EVENT_LOCK_WAIT_MS = 10;
const SESSION_EVENT_LOCK_SLEEP = new Int32Array(new SharedArrayBuffer(4));
function withSessionEventLock(projectRoot, sessionId, operation) {
    const lockPath = `${sessionPath(projectRoot, sessionId)}.events.lock`;
    (0, node_fs_1.mkdirSync)(sessionsDir(projectRoot), { recursive: true });
    const deadline = Date.now() + SESSION_EVENT_LOCK_TIMEOUT_MS;
    while (true) {
        try {
            (0, node_fs_1.mkdirSync)(lockPath);
            break;
        }
        catch (error) {
            const code = error && typeof error === 'object' && 'code' in error
                ? String(error.code)
                : '';
            if (code !== 'EEXIST')
                throw error;
            try {
                if (Date.now() - (0, node_fs_1.statSync)(lockPath).mtimeMs > SESSION_EVENT_LOCK_STALE_MS) {
                    (0, node_fs_1.rmSync)(lockPath, { recursive: true, force: true });
                    continue;
                }
            }
            catch {
                continue;
            }
            if (Date.now() >= deadline) {
                throw new Error(`Timed out waiting to mutate session ${sessionId}.`);
            }
            Atomics.wait(SESSION_EVENT_LOCK_SLEEP, 0, 0, SESSION_EVENT_LOCK_WAIT_MS);
        }
    }
    try {
        return operation();
    }
    finally {
        (0, node_fs_1.rmSync)(lockPath, { recursive: true, force: true });
    }
}
// ── CRUD ──────────────────────────────────────────────────────────────────────
function createSession(projectRoot, profile, goal) {
    const sessionId = (0, node_crypto_1.randomBytes)(6).toString('hex');
    const dir = sessionsDir(projectRoot);
    if (!(0, node_fs_1.existsSync)(dir))
        (0, node_fs_1.mkdirSync)(dir, { recursive: true });
    const { allowedGlobs, scopeMode } = deriveAllowedGlobs(goal, profile);
    const intentContract = deriveIntentContract(goal, profile, allowedGlobs, scopeMode);
    const startedAt = new Date().toISOString();
    const architectureObligationPolicy = (0, architecture_obligations_1.normalizeArchitectureObligationPolicy)(profile.runtimeConfig?.architectureObligations);
    const architectureGraph = profile.architecture;
    const architectureObligations = (0, architecture_obligations_1.deriveArchitectureObligations)({
        goal,
        intentContract,
        graph: architectureGraph,
        policy: architectureObligationPolicy,
        approvalRequiredGlobs: profile.approvalRequiredPaths,
        now: startedAt,
        topology: profile.repositoryTopology,
    });
    const localGoal = (0, intent_privacy_1.sanitizeLocalPrivateText)(goal);
    const localReasons = new Set(localGoal.reasonCodes);
    const localIntentContract = sanitizeLocalPrivateValue(intentContract, localReasons);
    const localArchitectureObligations = sanitizeLocalPrivateValue(architectureObligations, localReasons);
    const session = {
        schemaVersion: 1,
        sessionId,
        profileHash: profile.profileHash,
        repoName: profile.repo.name,
        contract: {
            goal: localGoal.value,
            allowedGlobs,
            sensitiveGlobs: profile.sensitiveBoundaries.map((s) => s.glob),
            approvalRequiredGlobs: profile.approvalRequiredPaths,
            ownershipRules: profile.ownershipBoundaries,
            scopeMode,
            safeSupportGlobs: profile.runtimeConfig?.safeSupportGlobs ?? [],
            ignoredGlobs: profile.runtimeConfig?.ignoredGlobs ?? [],
            approvedPaths: [],
            approvalGrants: [],
            intentContract: localIntentContract,
            planCoherenceMode: profile.runtimeConfig?.planCoherence ?? profile_1.DEFAULT_PLAN_COHERENCE_MODE,
            runtimeMode: profile.runtimeConfig?.localMode ?? profile_1.DEFAULT_RUNTIME_LOCAL_MODE,
            repoSymbolDuplicateMode: profile.runtimeConfig?.repoSymbolDuplicateMode ?? 'warn',
            architectureObligations: localArchitectureObligations,
            architectureObligationPolicy,
            architectureObligationWaivers: [],
            ...(architectureGraph ? { architectureGraph } : {}),
            repositoryTopology: profile.repositoryTopology,
        },
        events: [
            {
                type: 'session_start',
                ts: startedAt,
                message: `Goal: ${localGoal.value}`,
                detail: {
                    allowedGlobs,
                    scopeMode,
                    intentContract: localIntentContract,
                    planCoherenceMode: profile.runtimeConfig?.planCoherence ?? profile_1.DEFAULT_PLAN_COHERENCE_MODE,
                    runtimeMode: profile.runtimeConfig?.localMode ?? profile_1.DEFAULT_RUNTIME_LOCAL_MODE,
                    repoSymbolDuplicateMode: profile.runtimeConfig?.repoSymbolDuplicateMode ?? 'warn',
                    architectureObligations: localArchitectureObligations,
                    architectureObligationPolicy,
                },
            },
        ],
        status: 'active',
    };
    markLocalPrivateSession(session, localReasons, startedAt);
    (0, node_fs_1.writeFileSync)(sessionPath(projectRoot, sessionId), JSON.stringify(session, null, 2) + '\n', 'utf8');
    const neurcodeDir = (0, node_path_1.join)(projectRoot, '.neurcode');
    if (!(0, node_fs_1.existsSync)(neurcodeDir))
        (0, node_fs_1.mkdirSync)(neurcodeDir, { recursive: true });
    (0, node_fs_1.writeFileSync)(activePointerPath(projectRoot), JSON.stringify({ sessionId }, null, 2) + '\n', 'utf8');
    return session;
}
function loadActiveSession(projectRoot) {
    const ptr = activePointerPath(projectRoot);
    if (!(0, node_fs_1.existsSync)(ptr))
        return null;
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(ptr, 'utf8'));
        if (!parsed.sessionId)
            return null;
        return loadSession(projectRoot, parsed.sessionId);
    }
    catch {
        return null;
    }
}
function loadSession(projectRoot, sessionId) {
    const p = sessionPath(projectRoot, sessionId);
    if (!(0, node_fs_1.existsSync)(p))
        return null;
    try {
        return JSON.parse((0, node_fs_1.readFileSync)(p, 'utf8'));
    }
    catch {
        return null;
    }
}
function appendEvent(projectRoot, sessionId, event) {
    return withSessionEventLock(projectRoot, sessionId, () => {
        const session = loadSession(projectRoot, sessionId);
        if (!session)
            return null;
        const sanitized = sanitizeSessionEventForLocalPrivate(event);
        session.events.push(sanitized.event);
        markLocalPrivateSession(session, sanitized.reasonCodes, sanitized.event.ts);
        (0, node_fs_1.writeFileSync)(sessionPath(projectRoot, sessionId), JSON.stringify(session, null, 2) + '\n', 'utf8');
        return session;
    });
}
function recomputeArchitectureObligations(session, now = new Date().toISOString()) {
    const previous = session.contract.architectureObligations ?? [];
    const next = (0, architecture_obligations_1.deriveArchitectureObligations)({
        goal: session.contract.goal,
        intentContract: session.contract.intentContract,
        agentPlan: session.contract.agentPlan,
        events: session.events,
        approvedPaths: activeApprovalPaths(session.contract, now),
        approvalRequiredGlobs: session.contract.approvalRequiredGlobs,
        graph: session.contract.architectureGraph,
        topology: session.contract.repositoryTopology,
        policy: session.contract.architectureObligationPolicy,
        waivers: (0, architecture_obligations_1.activeArchitectureObligationWaivers)(session.contract.architectureObligationWaivers ?? [], now),
        previous,
        now,
    });
    session.contract.architectureObligations = next;
    const previousById = new Map(previous.map((item) => [item.id, item]));
    const transitions = next
        .filter((item) => previousById.get(item.id)?.status !== item.status)
        .map((item) => ({
        id: item.id,
        title: item.title,
        severity: item.severity,
        effectiveMode: item.effectiveMode ?? 'warn',
        previousStatus: previousById.get(item.id)?.status ?? null,
        status: item.status,
        observedEvidence: item.observedEvidence,
        waiver: item.waiver ?? null,
    }));
    if (transitions.length > 0) {
        session.events.push({
            type: 'obligation_state_changed',
            ts: now,
            message: `${transitions.length} architecture obligation state change${transitions.length === 1 ? '' : 's'}`,
            detail: {
                transitions,
                architectureObligationSummary: (0, architecture_obligations_1.summarizeArchitectureObligations)(next),
            },
        });
    }
    return next;
}
function refreshArchitectureObligations(projectRoot, sessionId, now = new Date().toISOString()) {
    const session = loadSession(projectRoot, sessionId);
    if (!session)
        return null;
    recomputeArchitectureObligations(session, now);
    (0, node_fs_1.writeFileSync)(sessionPath(projectRoot, session.sessionId), JSON.stringify(session, null, 2) + '\n', 'utf8');
    return session;
}
/**
 * Append an explicit approval for a path/glob to the active (or named) session.
 *
 * Safety invariant: this does NOT expand approval beyond the given path/glob.
 * Approving "src/billing/charge.py" does not approve "src/billing/**".
 * The boundary check in checkFileBoundary enforces this by matching approvedPaths
 * against the exact filePath.
 */
/**
 * Normalise an approval path to be repo-relative.
 *
 * Rules (in order):
 *  1. Absolute globs under projectRoot — strip the repo prefix, keep the glob suffix.
 *  2. Absolute globs NOT under projectRoot — rejected.
 *  3. Relative globs — used as-is (strip leading / or ./).
 *  4. Absolute exact paths under projectRoot — make repo-relative via path.relative().
 *  5. Absolute exact paths NOT under projectRoot — rejected.
 *  6. Relative exact paths — used as-is.
 */
function normaliseApprovalPath(projectRoot, raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        throw new Error('approvedPath must not be empty.');
    if ((0, intent_privacy_1.detectCredentialText)(trimmed, 10_000).detected) {
        throw new Error('approvedPath rejected (credential_shaped_path).');
    }
    const safeApprovalPath = (candidate) => {
        const normalized = candidate.replace(/\\/g, '/');
        const sanitized = (0, intent_privacy_1.sanitizeRepoRelativePath)(normalized, { allowGlobs: true });
        if (!sanitized.path) {
            const reason = sanitized.reasonCodes[0] || 'unsafe_path';
            throw new Error(`approvedPath rejected (${reason}).`);
        }
        return sanitized.path;
    };
    const isGlob = trimmed.includes('*') || trimmed.includes('?');
    if (isGlob) {
        if (!(0, node_path_1.isAbsolute)(trimmed)) {
            // Relative glob — strip a leading ./ if present, nothing else
            return safeApprovalPath(trimmed.replace(/^\.\//, ''));
        }
        // Absolute glob — resolve the repo root (symlinks), then check prefix.
        // Globs cannot be passed to realpathSync (file doesn't exist), so we
        // split at the first wildcard, realpath the concrete prefix, then
        // reattach the glob suffix.
        let absRepo;
        try {
            absRepo = (0, node_fs_1.realpathSync)(projectRoot);
        }
        catch {
            absRepo = (0, node_path_1.resolve)(projectRoot);
        }
        // Extract the non-glob prefix (everything before the first * or ?)
        const firstWild = trimmed.search(/[*?]/);
        const concretePart = trimmed.slice(0, firstWild); // e.g. "/repo/src/billing/"
        const globSuffix = trimmed.slice(firstWild); // e.g. "**"
        // Resolve the concrete prefix, following symlinks where possible.
        // realpathSync may fail if the directory doesn't exist; in that case
        // fall back to plain resolve() and re-resolve the repo the same way.
        let resolvedConcrete;
        try {
            resolvedConcrete = (0, node_fs_1.realpathSync)(concretePart.replace(/\/$/, '') || '/');
        }
        catch {
            resolvedConcrete = (0, node_path_1.resolve)(concretePart);
            absRepo = (0, node_path_1.resolve)(projectRoot);
        }
        if (!resolvedConcrete.startsWith(absRepo + '/') && resolvedConcrete !== absRepo) {
            throw new Error(`Approval path "${trimmed}" is outside the repo root "${projectRoot}". ` +
                `Only paths within the repo may be approved.`);
        }
        const relConcrete = (0, node_path_1.relative)(absRepo, resolvedConcrete); // e.g. "src/billing"
        // Reattach the glob suffix; the concretePart may end with "/" which becomes
        // part of relConcrete already, so normalise double-slashes.
        const joined = relConcrete ? relConcrete + '/' + globSuffix : globSuffix;
        return safeApprovalPath(joined.replace(/\/\//g, '/'));
    }
    // ── Exact (non-glob) path ─────────────────────────────────────────────────
    if ((0, node_path_1.isAbsolute)(trimmed)) {
        // Use realpathSync to resolve symlinks (e.g. /tmp → /private/tmp on macOS)
        // so that the comparison is reliable on all platforms.
        let absRepo;
        let absPath;
        try {
            absRepo = (0, node_fs_1.realpathSync)(projectRoot);
        }
        catch {
            absRepo = (0, node_path_1.resolve)(projectRoot);
        }
        try {
            absPath = (0, node_fs_1.realpathSync)(trimmed);
        }
        catch {
            // File may not exist yet — fall back to syntactic resolution
            absPath = (0, node_path_1.resolve)(trimmed);
            absRepo = (0, node_path_1.resolve)(projectRoot);
        }
        if (!absPath.startsWith(absRepo + '/') && absPath !== absRepo) {
            throw new Error(`Approval path "${trimmed}" is outside the repo root "${projectRoot}". ` +
                `Only paths within the repo may be approved.`);
        }
        const rel = (0, node_path_1.relative)(absRepo, absPath);
        if (!rel || rel.startsWith('..')) {
            throw new Error(`Could not make "${trimmed}" relative to repo root "${projectRoot}".`);
        }
        return safeApprovalPath(rel);
    }
    // Already relative — remove a leading ./ if present
    return safeApprovalPath(trimmed.replace(/^\.\//, ''));
}
function normaliseApprovalArgs(reasonOrOptions, sessionId) {
    if (reasonOrOptions && typeof reasonOrOptions === 'object') {
        return { ...reasonOrOptions };
    }
    return {
        reason: reasonOrOptions,
        sessionId,
    };
}
function resolveApprovalExpiry(options, approvedAt) {
    if (options.expiresAt === null || options.ttlMs === null)
        return null;
    if (typeof options.expiresAt === 'string' && options.expiresAt.trim()) {
        const parsed = Date.parse(options.expiresAt);
        if (!Number.isFinite(parsed))
            throw new Error(`Invalid approval expiry "${options.expiresAt}".`);
        return new Date(parsed).toISOString();
    }
    const ttlMs = typeof options.ttlMs === 'number' && Number.isFinite(options.ttlMs)
        ? Math.max(0, Math.floor(options.ttlMs))
        : exports.DEFAULT_APPROVAL_TTL_MS;
    if (ttlMs === 0)
        return new Date(Date.parse(approvedAt)).toISOString();
    return new Date(Date.parse(approvedAt) + ttlMs).toISOString();
}
function approvalGrants(contract) {
    return Array.isArray(contract.approvalGrants) ? contract.approvalGrants : [];
}
function isApprovalGrantActive(grant, checkedAt = new Date().toISOString()) {
    if (!grant.path || grant.revokedAt)
        return false;
    if (!grant.expiresAt)
        return true;
    const expiresAtMs = Date.parse(grant.expiresAt);
    const checkedAtMs = Date.parse(checkedAt);
    if (!Number.isFinite(expiresAtMs) || !Number.isFinite(checkedAtMs))
        return false;
    return expiresAtMs > checkedAtMs;
}
function activeApprovalPaths(contract, checkedAt = new Date().toISOString()) {
    const grants = approvalGrants(contract);
    if (grants.length === 0)
        return [...(contract.approvedPaths ?? [])];
    return Array.from(new Set(grants
        .filter((grant) => isApprovalGrantActive(grant, checkedAt))
        .map((grant) => grant.path)));
}
function expireSessionApprovals(projectRoot, sessionId, checkedAt = new Date().toISOString()) {
    const session = loadSession(projectRoot, sessionId);
    if (!session)
        return null;
    const grants = approvalGrants(session.contract);
    if (grants.length === 0)
        return session;
    const checkedAtMs = Date.parse(checkedAt);
    const expired = grants.filter((grant) => {
        if (!grant.expiresAt || grant.revokedAt)
            return false;
        const expiresAtMs = Date.parse(grant.expiresAt);
        if (!Number.isFinite(expiresAtMs) || !Number.isFinite(checkedAtMs))
            return false;
        return expiresAtMs <= checkedAtMs;
    });
    if (expired.length === 0) {
        const activePaths = activeApprovalPaths(session.contract, checkedAt);
        if (JSON.stringify(activePaths) !==
            JSON.stringify(session.contract.approvedPaths ?? [])) {
            session.contract.approvedPaths = activePaths;
            recomputeArchitectureObligations(session, checkedAt);
            (0, node_fs_1.writeFileSync)(sessionPath(projectRoot, session.sessionId), JSON.stringify(session, null, 2) + '\n', 'utf8');
        }
        return session;
    }
    const alreadyRecorded = new Set(session.events
        .filter((event) => event.type === 'approval_decision' && event.decision === 'expired')
        .map((event) => String(event.detail?.approvalEventId || '')));
    for (const grant of expired) {
        if (alreadyRecorded.has(grant.eventId))
            continue;
        session.events.push({
            type: 'approval_decision',
            ts: checkedAt,
            filePath: grant.path,
            decision: 'expired',
            detail: {
                reason: 'approval expired',
                approvalEventId: grant.eventId,
                expiresAt: grant.expiresAt,
            },
        });
    }
    session.contract.approvedPaths = activeApprovalPaths(session.contract, checkedAt);
    recomputeArchitectureObligations(session, checkedAt);
    (0, node_fs_1.writeFileSync)(sessionPath(projectRoot, session.sessionId), JSON.stringify(session, null, 2) + '\n', 'utf8');
    return session;
}
function resolveDecisionExpiry(expiresAt, ttlMs, decidedAt, defaultTtlMs, label) {
    if (expiresAt === null || ttlMs === null)
        return null;
    if (typeof expiresAt === 'string' && expiresAt.trim()) {
        const parsed = Date.parse(expiresAt);
        if (!Number.isFinite(parsed))
            throw new Error(`Invalid ${label} expiry "${expiresAt}".`);
        return new Date(parsed).toISOString();
    }
    const ttl = typeof ttlMs === 'number' && Number.isFinite(ttlMs)
        ? Math.max(0, Math.floor(ttlMs))
        : defaultTtlMs;
    if (ttl === 0)
        return new Date(Date.parse(decidedAt)).toISOString();
    return new Date(Date.parse(decidedAt) + ttl).toISOString();
}
function expireArchitectureObligationWaivers(projectRoot, sessionId, checkedAt = new Date().toISOString()) {
    const session = loadSession(projectRoot, sessionId);
    if (!session)
        return null;
    const waivers = Array.isArray(session.contract.architectureObligationWaivers)
        ? session.contract.architectureObligationWaivers
        : [];
    if (waivers.length === 0)
        return session;
    const checkedAtMs = Date.parse(checkedAt);
    const expired = waivers.filter((waiver) => {
        if (!waiver.expiresAt || waiver.revokedAt)
            return false;
        const expiresAtMs = Date.parse(waiver.expiresAt);
        if (!Number.isFinite(expiresAtMs) || !Number.isFinite(checkedAtMs))
            return false;
        return expiresAtMs <= checkedAtMs;
    });
    const alreadyRecorded = new Set(session.events
        .filter((event) => event.type === 'obligation_waiver_decision' && event.decision === 'expired')
        .map((event) => String(event.detail?.waiverEventId || '')));
    let recorded = false;
    for (const waiver of expired) {
        if (alreadyRecorded.has(waiver.eventId))
            continue;
        recorded = true;
        session.events.push({
            type: 'obligation_waiver_decision',
            ts: checkedAt,
            decision: 'expired',
            detail: {
                obligationId: waiver.obligationId,
                reason: 'obligation waiver expired',
                waiverEventId: waiver.eventId,
                expiresAt: waiver.expiresAt,
            },
        });
    }
    recomputeArchitectureObligations(session, checkedAt);
    if (recorded || expired.length > 0) {
        (0, node_fs_1.writeFileSync)(sessionPath(projectRoot, session.sessionId), JSON.stringify(session, null, 2) + '\n', 'utf8');
    }
    return session;
}
function waiveArchitectureObligation(projectRoot, obligationId, options = {}) {
    const id = obligationId.trim();
    if (!id)
        throw new Error('obligationId must not be empty.');
    const session = options.sessionId
        ? loadSession(projectRoot, options.sessionId)
        : loadActiveSession(projectRoot);
    if (!session)
        throw new Error('No active session found. Run a task first.');
    if (session.status !== 'active')
        throw new Error(`Session ${session.sessionId} is already finished.`);
    recomputeArchitectureObligations(session, options.waivedAt || new Date().toISOString());
    const target = session.contract.architectureObligations?.find((item) => item.id === id);
    if (!target)
        throw new Error(`Architecture obligation not found: ${id}`);
    if (target.status === 'satisfied')
        throw new Error(`Architecture obligation is already satisfied: ${id}`);
    const waivedAt = options.waivedAt || new Date().toISOString();
    const expiresAt = resolveDecisionExpiry(options.expiresAt, options.ttlMs, waivedAt, exports.DEFAULT_OBLIGATION_WAIVER_TTL_MS, 'obligation waiver');
    const eventId = `obligation_waiver_${Date.now()}_${(0, node_crypto_1.randomBytes)(3).toString('hex')}`;
    const localReason = (0, intent_privacy_1.sanitizeLocalPrivateText)(options.reason?.trim() || 'human accepted obligation risk in session', 2_000);
    const localWaivedBy = (0, intent_privacy_1.sanitizeLocalPrivateText)(options.waivedBy || '', 200);
    const waiver = {
        obligationId: id,
        reason: localReason.value,
        waivedAt,
        expiresAt,
        source: options.source || 'local_cli',
        eventId,
        waivedBy: localWaivedBy.value || null,
    };
    const existingWaivers = Array.isArray(session.contract.architectureObligationWaivers)
        ? session.contract.architectureObligationWaivers
        : [];
    session.contract.architectureObligationWaivers = [
        ...existingWaivers.filter((existing) => existing.obligationId !== id || existing.revokedAt),
        waiver,
    ];
    session.events.push({
        type: 'obligation_waiver_decision',
        ts: waivedAt,
        decision: 'waived',
        detail: {
            obligationId: id,
            reason: waiver.reason,
            eventId,
            expiresAt,
            source: waiver.source,
            waivedBy: waiver.waivedBy,
        },
    });
    markLocalPrivateSession(session, [
        ...localReason.reasonCodes,
        ...localWaivedBy.reasonCodes,
    ], waivedAt);
    const architectureObligations = recomputeArchitectureObligations(session, waivedAt);
    (0, node_fs_1.writeFileSync)(sessionPath(projectRoot, session.sessionId), JSON.stringify(session, null, 2) + '\n', 'utf8');
    return {
        sessionId: session.sessionId,
        obligationId: id,
        waiver,
        expiresAt,
        eventId,
        architectureObligations,
    };
}
function approveSession(projectRoot, approvedPath, reason, sessionId) {
    const options = normaliseApprovalArgs(reason, sessionId);
    const initialSession = options.sessionId
        ? loadSession(projectRoot, options.sessionId)
        : loadActiveSession(projectRoot);
    if (!initialSession)
        throw new Error('No active session found. Run a task first.');
    return withSessionEventLock(projectRoot, initialSession.sessionId, () => {
        const session = loadSession(projectRoot, initialSession.sessionId);
        if (!session)
            throw new Error(`Session ${initialSession.sessionId} not found.`);
        if (session.status !== 'active')
            throw new Error(`Session ${session.sessionId} is already finished.`);
        const normalised = normaliseApprovalPath(projectRoot, approvedPath);
        if (!normalised)
            throw new Error('approvedPath must not be empty.');
        const approvedAt = options.approvedAt || new Date().toISOString();
        const expiresAt = resolveApprovalExpiry(options, approvedAt);
        const eventId = `approval_${Date.now()}_${(0, node_crypto_1.randomBytes)(3).toString('hex')}`;
        const localReason = (0, intent_privacy_1.sanitizeLocalPrivateText)(options.reason?.trim() || 'human approved in session', 2_000);
        const localApprovedBy = (0, intent_privacy_1.sanitizeLocalPrivateText)(options.approvedBy || '', 200);
        const localRequestId = (0, intent_privacy_1.sanitizeLocalPrivateText)(options.requestId || '', 200);
        const grant = {
            path: normalised,
            reason: localReason.value,
            approvedAt,
            expiresAt,
            source: options.source || 'local_cli',
            eventId,
            approvedBy: localApprovedBy.value || null,
            requestId: localRequestId.value || null,
        };
        const grants = approvalGrants(session.contract).filter((existing) => existing.path !== normalised);
        grants.push(grant);
        session.contract.approvalGrants = grants;
        // Backward-compatible active path list. Structured grants are authoritative
        // when present; this list remains for old clients and simple UI counters.
        if (!session.contract.approvedPaths.includes(normalised)) {
            session.contract.approvedPaths.push(normalised);
        }
        session.contract.approvedPaths = activeApprovalPaths(session.contract, approvedAt);
        session.events.push({
            type: 'approval_decision',
            ts: approvedAt,
            filePath: normalised,
            decision: 'approved',
            detail: {
                reason: grant.reason,
                eventId,
                expiresAt,
                source: grant.source,
                approvedBy: grant.approvedBy,
                requestId: grant.requestId,
            },
        });
        markLocalPrivateSession(session, [
            ...localReason.reasonCodes,
            ...localApprovedBy.reasonCodes,
            ...localRequestId.reasonCodes,
        ], approvedAt);
        recomputeArchitectureObligations(session, approvedAt);
        (0, node_fs_1.writeFileSync)(sessionPath(projectRoot, session.sessionId), JSON.stringify(session, null, 2) + '\n', 'utf8');
        return {
            sessionId: session.sessionId,
            approvedPath: normalised,
            approvedPaths: session.contract.approvedPaths,
            approvalGrant: grant,
            expiresAt,
            eventId,
        };
    });
}
/**
 * Revoke one exact session grant and recompute the backward-compatible active
 * path list. Dashboard revocations prefer requestId so the same path can be
 * approved again later without revoking the wrong historical grant.
 */
function revokeSessionApproval(projectRoot, approvedPath, options = {}) {
    const initialSession = options.sessionId
        ? loadSession(projectRoot, options.sessionId)
        : loadActiveSession(projectRoot);
    if (!initialSession)
        throw new Error('No active session found. Run a task first.');
    return withSessionEventLock(projectRoot, initialSession.sessionId, () => {
        const session = loadSession(projectRoot, initialSession.sessionId);
        if (!session)
            throw new Error(`Session ${initialSession.sessionId} not found.`);
        if (session.status !== 'active')
            throw new Error(`Session ${session.sessionId} is already finished.`);
        const normalised = normaliseApprovalPath(projectRoot, approvedPath);
        if (!normalised)
            throw new Error('approvedPath must not be empty.');
        const grants = approvalGrants(session.contract);
        const targetIndex = grants.findIndex((grant) => options.requestId
            ? grant.requestId === options.requestId
            : grant.path === normalised && !grant.revokedAt);
        if (targetIndex < 0)
            throw new Error(`Approval grant not found for ${normalised}.`);
        const revokedAt = options.revokedAt || new Date().toISOString();
        const target = grants[targetIndex];
        if (!target.revokedAt) {
            const localReason = (0, intent_privacy_1.sanitizeLocalPrivateText)(options.reason?.trim() || 'human revoked approval in session', 2_000);
            const localRevokedBy = (0, intent_privacy_1.sanitizeLocalPrivateText)(options.revokedBy || '', 200);
            target.revokedAt = revokedAt;
            target.revokedBy = localRevokedBy.value || null;
            target.revocationReason = localReason.value;
            session.events.push({
                type: 'approval_decision',
                ts: revokedAt,
                filePath: target.path,
                decision: 'revoked',
                detail: {
                    reason: target.revocationReason,
                    approvalEventId: target.eventId,
                    requestId: target.requestId,
                    source: options.source || 'local_cli',
                    revokedBy: target.revokedBy,
                },
            });
            markLocalPrivateSession(session, [
                ...localReason.reasonCodes,
                ...localRevokedBy.reasonCodes,
            ], revokedAt);
        }
        session.contract.approvalGrants = grants;
        session.contract.approvedPaths = activeApprovalPaths(session.contract, revokedAt);
        recomputeArchitectureObligations(session, revokedAt);
        (0, node_fs_1.writeFileSync)(sessionPath(projectRoot, session.sessionId), JSON.stringify(session, null, 2) + '\n', 'utf8');
        return {
            sessionId: session.sessionId,
            revokedPath: target.path,
            approvedPaths: session.contract.approvedPaths,
            approvalGrant: target,
            revokedAt: target.revokedAt || revokedAt,
        };
    });
}
function finishSession(projectRoot, sessionId, options = {}) {
    return withSessionEventLock(projectRoot, sessionId, () => {
        const session = loadSession(projectRoot, sessionId);
        if (!session)
            return null;
        session.status = 'finished';
        session.finishedAt = new Date().toISOString();
        const finishReasons = new Set();
        const localFinishReason = options.reason
            ? (0, intent_privacy_1.sanitizeLocalPrivateText)(options.reason, 2_000)
            : null;
        localFinishReason?.reasonCodes.forEach((reason) => finishReasons.add(reason));
        const unresolvedApprovalBlocks = options.unresolvedApprovalBlocks?.length
            ? sanitizeLocalPrivateValue(options.unresolvedApprovalBlocks, finishReasons)
            : undefined;
        const unresolvedActionableBlocks = options.unresolvedActionableBlocks?.length
            ? sanitizeLocalPrivateValue(options.unresolvedActionableBlocks, finishReasons)
            : undefined;
        session.completionStatus = options.completionStatus
            ?? (unresolvedApprovalBlocks || unresolvedActionableBlocks ? 'attention_required' : 'completed');
        recomputeArchitectureObligations(session, session.finishedAt);
        const canonical = JSON.stringify({
            sessionId: session.sessionId,
            profileHash: session.profileHash,
            contract: session.contract,
            events: session.events.map((e) => ({
                type: e.type,
                filePath: e.filePath,
                verdict: e.verdict,
                decision: e.decision,
            })),
        });
        session.replayHash = (0, node_crypto_1.createHash)('sha256').update(canonical).digest('hex').slice(0, 24);
        session.events.push({
            type: 'session_finish',
            ts: session.finishedAt,
            detail: {
                replayHash: session.replayHash,
                completionStatus: session.completionStatus,
                ...(localFinishReason ? { reason: localFinishReason.value } : {}),
                ...(unresolvedApprovalBlocks
                    ? { unresolvedApprovalBlocks }
                    : {}),
                ...(unresolvedActionableBlocks
                    ? { unresolvedActionableBlocks }
                    : {}),
            },
        });
        markLocalPrivateSession(session, finishReasons, session.finishedAt);
        (0, node_fs_1.writeFileSync)(sessionPath(projectRoot, sessionId), JSON.stringify(session, null, 2) + '\n', 'utf8');
        (0, ai_change_record_1.writeAIChangeRecord)(projectRoot, session);
        const ptr = activePointerPath(projectRoot);
        if ((0, node_fs_1.existsSync)(ptr)) {
            (0, node_fs_1.writeFileSync)(ptr, JSON.stringify({ sessionId: null }, null, 2) + '\n', 'utf8');
        }
        return session;
    });
}
function replaySession(session) {
    const canonical = JSON.stringify({
        sessionId: session.sessionId,
        profileHash: session.profileHash,
        contract: session.contract,
        events: session.events
            .filter((e) => e.type !== 'session_finish')
            .map((e) => ({
            type: e.type,
            filePath: e.filePath,
            verdict: e.verdict,
            decision: e.decision,
        })),
    });
    const replayHash = (0, node_crypto_1.createHash)('sha256').update(canonical).digest('hex').slice(0, 24);
    return {
        replayHash,
        matchesOriginal: replayHash === session.replayHash,
        originalHash: session.replayHash,
    };
}
// ── Intent contract and coherence ────────────────────────────────────────────
function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
}
function uniqueTrimmed(values) {
    const out = [];
    const seen = new Set();
    for (const raw of values) {
        const value = String(raw ?? '').trim();
        if (!value || seen.has(value))
            continue;
        seen.add(value);
        out.push(value);
    }
    return out;
}
function removeTrimmed(existing, removals) {
    const removeSet = new Set(removals.map((value) => value.trim()).filter(Boolean));
    if (removeSet.size === 0)
        return uniqueTrimmed(existing);
    return uniqueTrimmed(existing.filter((value) => !removeSet.has(value.trim())));
}
function normalizePlanPath(pathValue) {
    return pathValue.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '').trim();
}
function normalizePlanPaths(values) {
    return uniqueTrimmed(Array.from(values).flatMap((value) => {
        const normalized = normalizePlanPath(String(value ?? ''));
        const sanitized = (0, intent_privacy_1.sanitizeRepoRelativePath)(normalized, { allowGlobs: true });
        return sanitized.path ? [sanitized.path] : [];
    }));
}
function normalizeGoal(goal) {
    return goal.replace(/\s+/g, ' ').trim().slice(0, 280);
}
function cleanScopePathToken(raw) {
    return raw
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/^\//, '')
        .replace(/^[("'`<\[]+/, '')
        .replace(/[)"'`>\].,;:]+$/, '')
        .trim();
}
function deriveScopePathRoots(profile) {
    const roots = new Set();
    if (!profile)
        return roots;
    for (const fact of profile.repositoryTopology?.facts ?? []) {
        const first = fact.path.replace(/^\//, '').replace(/\\/g, '/').split('/').filter(Boolean)[0];
        if (first && !first.includes('*') && !/^[A-Z][A-Za-z]+$/.test(first)) {
            roots.add(first);
        }
    }
    return roots;
}
function isLikelyRepoScopePath(token, profile) {
    if (!token || token.length > 240 || token.includes('://'))
        return false;
    if (!token.includes('/'))
        return false;
    if (/\s/.test(token))
        return false;
    const segments = token.split('/').filter(Boolean);
    if (segments.length < 2)
        return false;
    const first = segments[0];
    const lastSeg = segments.at(-1) ?? '';
    if (!lastSeg || lastSeg === '*' || lastSeg === '**')
        return false;
    if (/^[A-Z][A-Za-z]+$/.test(first))
        return false;
    const observedRoot = deriveScopePathRoots(profile).has(first);
    const explicitFile = lastSeg.includes('.');
    return observedRoot || explicitFile;
}
function extractPathTokens(goal, profile) {
    return unique((goal.match(/[a-z0-9_./-]+\/[a-z0-9_./-]+/gi) ?? [])
        .map(cleanScopePathToken)
        .flatMap((token) => {
        const sanitized = (0, intent_privacy_1.sanitizeRepoRelativePath)(token.replace(/\/+$/, ''), { allowGlobs: false });
        return sanitized.path ? [sanitized.path] : [];
    })
        .filter((token) => isLikelyRepoScopePath(token, profile)));
}
function deriveExcludedScopePrefixes(goal) {
    const lowerGoal = goal.toLowerCase();
    const excluded = [];
    if (/\b(?:do not touch|don't touch|without touching|no changes to|avoid)\s+providers\b/.test(lowerGoal)) {
        excluded.push('providers/');
    }
    if (/\b(?:do not touch|don't touch|without touching|no changes to|avoid)\s+(?:ci|\.github|github workflows?)\b/.test(lowerGoal)) {
        excluded.push('.github/');
    }
    const explicit = /(?:do not touch|don't touch|without touching|no changes to|avoid|exclude)\s+([a-z0-9_.@+-]+(?:\/[a-z0-9_./@+*?-]+)+)/gi;
    let match;
    while ((match = explicit.exec(goal)) !== null) {
        const sanitized = (0, intent_privacy_1.sanitizeRepoRelativePath)(cleanScopePathToken(match[1]), { allowGlobs: true });
        if (!sanitized.path)
            continue;
        const pathValue = sanitized.path.replace(/\/\*\*$/, '').replace(/\/$/, '');
        excluded.push(isFileScopeToken(pathValue) ? pathValue : `${pathValue}/`);
    }
    return unique(excluded);
}
function filterExcludedScopePrefixes(globs, excludedPrefixes) {
    if (excludedPrefixes.length === 0)
        return globs;
    return globs.filter((glob) => !excludedPrefixes.some((prefix) => glob.startsWith(prefix)));
}
function primaryActionForGoal(lower) {
    if (/\b(add|create|implement|build|introduce)\b/.test(lower))
        return 'add';
    if (/\b(fix|bug|hotfix|repair|resolve)\b/.test(lower))
        return 'fix';
    if (/\b(refactor|cleanup|simplify|restructure)\b/.test(lower))
        return 'refactor';
    if (/\b(test|spec|coverage)\b/.test(lower))
        return 'test';
    if (/\b(doc|docs|document|readme)\b/.test(lower))
        return 'document';
    if (/\b(remove|delete|drop)\b/.test(lower))
        return 'remove';
    if (/\b(migration|migrate|schema)\b/.test(lower))
        return 'migrate';
    if (/\b(modify|update|change|edit)\b/.test(lower))
        return 'modify';
    return 'unknown';
}
function domainKeywordsForGoal(lower) {
    const domains = [
        [/\b(tasks?|exports?|jobs?|workers?)\b/, 'tasks'],
        [/\bservices?\b/, 'services'],
        [/\b(routes?|api|handlers?|controllers?)\b/, 'api'],
        [/\bcomponents?|pages?|ui\b/, 'frontend'],
        [/\bmodels?|schemas?\b/, 'data-model'],
        [/\btests?|specs?|coverage\b/, 'tests'],
        [/\bauth|oauth|sso|jwt|session\b/, 'auth'],
        [/\bbilling|payments?|checkout|stripe|invoice\b/, 'payments'],
        [/\bmigrations?|schema|database|db\b/, 'database'],
        [/\bretry|backoff|timeout|idempotent|idempotency\b/, 'reliability'],
        [/\bsecurity|secret|credential|encryption|crypto\b/, 'security'],
        [/\bdocs?|readme|guide\b/, 'docs'],
        [/\bconfig|settings|env\b/, 'config'],
    ];
    return domains.filter(([re]) => re.test(lower)).map(([, domain]) => domain);
}
function supportGlobsForIntent(goal, profile) {
    const lower = goal.toLowerCase();
    const pathTokens = extractPathTokens(goal, profile);
    if (hasExclusiveScopeCue(lower) && pathTokens.length > 0) {
        return [];
    }
    const packageRoots = (0, repository_topology_1.topologyPackageRootsForPaths)(profile.repositoryTopology, pathTokens);
    const configured = (profile.runtimeConfig?.safeSupportGlobs ?? [])
        .filter((glob) => (0, repository_topology_1.topologyHasPath)(profile.repositoryTopology, glob));
    const observed = packageRoots.length > 0
        ? (0, repository_topology_1.topologySupportGlobs)(profile.repositoryTopology, packageRoots)
        : [];
    const selected = (0, repository_topology_1.topologyGlobsForIntent)(profile.repositoryTopology, {
        terms: domainKeywordsForGoal(lower),
        explicitPaths: pathTokens,
        includeSupport: pathTokens.length > 0,
    })
        .filter((entry) => {
        const fact = profile.repositoryTopology?.facts.find((candidate) => candidate.id === entry.factId);
        return !fact || fact.kind !== 'source-root';
    })
        .map((entry) => entry.glob);
    return unique([...configured, ...observed, ...selected]);
}
function hasExclusiveScopeCue(lowerGoal) {
    return /\bonly\b/.test(lowerGoal)
        || /\bexact(?:ly)?\b/.test(lowerGoal)
        || /\bsingle[- ]file\b/.test(lowerGoal)
        || /\bno other files?\b/.test(lowerGoal);
}
function isFileScopeToken(token) {
    const lastSeg = token.replace(/^\//, '').split('/').at(-1) ?? '';
    return lastSeg.includes('.');
}
function intentObligations(goal, action, domains, scopeMode) {
    const lower = goal.toLowerCase();
    const obligations = [
        {
            id: 'stay-within-intent-scope',
            title: 'Stay within the declared task intent',
            description: 'Changes should remain tied to the target paths, domains, or support files implied by the user prompt.',
            severity: scopeMode === 'ambiguous' ? 'warn' : 'info',
        },
    ];
    if (scopeMode === 'ambiguous') {
        obligations.push({
            id: 'narrow-ambiguous-intent',
            title: 'Narrow ambiguous intent before broad edits',
            description: 'The user prompt did not identify a clear module or path, so unrelated edits should be treated as drift.',
            severity: 'warn',
        });
    }
    if (action === 'refactor') {
        obligations.push({
            id: 'preserve-behavior',
            title: 'Preserve existing behavior',
            description: 'Refactors should avoid public API, data model, or cross-boundary behavior changes unless explicitly requested.',
            severity: 'critical',
        });
    }
    if (action === 'fix') {
        obligations.push({
            id: 'minimize-fix-blast-radius',
            title: 'Keep fix blast radius small',
            description: 'Bug fixes should prefer the smallest coherent change and avoid unrelated cleanup.',
            severity: 'warn',
        });
    }
    if (/\bretry|backoff|timeout\b/.test(lower) || domains.includes('reliability')) {
        obligations.push({
            id: 'preserve-idempotency',
            title: 'Preserve idempotency around retries',
            description: 'Retry/backoff work must avoid duplicate side effects in billing, auth, and external calls.',
            severity: 'critical',
        }, {
            id: 'cover-retry-path',
            title: 'Cover retry behavior',
            description: 'A retry/backoff task should normally include or preserve tests for failure and retry paths.',
            severity: 'warn',
        });
    }
    if (domains.some((domain) => domain === 'auth' || domain === 'payments' || domain === 'security' || domain === 'database')) {
        obligations.push({
            id: 'respect-owned-sensitive-boundaries',
            title: 'Respect owned sensitive boundaries',
            description: 'Sensitive owned paths require exact approval before writes and should not be expanded silently.',
            severity: 'critical',
        });
    }
    return obligations;
}
function pathMatchesAny(filePath, globs) {
    return globs.filter((glob) => {
        const prefix = glob.replace('/**', '').replace('/*', '');
        return (filePath === prefix ||
            filePath.startsWith(prefix + '/') ||
            micromatch_1.default.isMatch(filePath, glob, { dot: true, matchBase: true }));
    });
}
function deriveIntentContract(goal, profile, allowedGlobs, scopeMode) {
    const lower = goal.toLowerCase();
    const excludedPrefixes = deriveExcludedScopePrefixes(goal);
    const pathTokens = extractPathTokens(goal, profile)
        .filter((token) => !excludedPrefixes.some((prefix) => token === prefix.replace(/\/$/, '') || token.startsWith(prefix)));
    const primaryAction = primaryActionForGoal(lower);
    const domainKeywords = domainKeywordsForGoal(lower);
    const supportPathGlobs = supportGlobsForIntent(goal, profile);
    const supportSet = new Set(supportPathGlobs);
    const expectedPathGlobs = unique(allowedGlobs).filter((glob) => !supportSet.has(glob));
    const confidence = scopeMode === 'explicit' ? 'high' : scopeMode === 'inferred' ? 'medium' : 'low';
    const outOfScopeGlobs = unique([
        ...profile.approvalRequiredPaths,
        ...profile.sensitiveBoundaries.map((boundary) => boundary.glob),
        ...profile.ownershipBoundaries.map((boundary) => boundary.glob.endsWith('/') ? `${boundary.glob}**` : boundary.glob),
        ...excludedPrefixes.map((prefix) => isFileScopeToken(prefix) ? prefix : `${prefix.replace(/\/$/, '')}/**`),
    ]).filter((glob) => pathMatchesAny(glob.replace('/**', ''), expectedPathGlobs).length === 0);
    const riskNotes = [];
    if (scopeMode === 'ambiguous') {
        riskNotes.push('Prompt did not name a clear file, module, or domain; coherence checks should be treated as low-confidence.');
    }
    if (profile.approvalRequiredPaths.length > 0) {
        riskNotes.push(`${profile.approvalRequiredPaths.length} approval-required boundaries excluded from normal scope.`);
    }
    if (profile.unownedPercent > 25) {
        riskNotes.push(`${profile.unownedPercent}% of source paths are not covered by CODEOWNERS.`);
    }
    const intentTerms = unique([
        ...domainKeywords,
        ...(lower.match(/[a-z][a-z0-9_-]{2,}/g) ?? []),
    ]);
    const topologySelections = (0, repository_topology_1.topologyGlobsForIntent)(profile.repositoryTopology, {
        terms: intentTerms,
        explicitPaths: pathTokens,
        includeSupport: true,
    }).filter((selection) => allowedGlobs.includes(selection.glob));
    const selectionByTarget = new Map();
    for (const pathValue of pathTokens.filter((pathValue) => allowedGlobs.some((glob) => pathValue === glob || micromatch_1.default.isMatch(pathValue, glob, { dot: true })))) {
        const fileTarget = isFileScopeToken(pathValue);
        const target = fileTarget ? pathValue : `${pathValue.replace(/\/$/, '')}/**`;
        selectionByTarget.set(target, {
            target,
            targetType: fileTarget ? 'file' : 'glob',
            source: 'explicit_user_path',
            confidence: 'high',
            authority: 'deterministic',
            evidenceType: 'explicit-user-path',
            reason: 'The user explicitly named this repository path.',
        });
    }
    for (const selection of topologySelections) {
        const fact = profile.repositoryTopology?.facts.find((candidate) => candidate.id === selection.factId);
        const source = selection.factId.startsWith('brain_') ? 'repo_brain' : 'repository_topology';
        if (selectionByTarget.has(selection.glob))
            continue;
        selectionByTarget.set(selection.glob, {
            target: selection.glob,
            targetType: isFileScopeToken(selection.glob) ? 'file' : 'glob',
            source,
            confidence: selection.confidence,
            authority: selection.authority,
            evidenceType: fact?.evidence.type ?? (source === 'repo_brain' ? 'brain-graph' : 'topology-fact'),
            factId: selection.factId,
            reason: selection.reason,
        });
    }
    for (const supportGlob of supportPathGlobs.filter((glob) => allowedGlobs.includes(glob))) {
        if (selectionByTarget.has(supportGlob))
            continue;
        const fact = profile.repositoryTopology?.facts.find((candidate) => candidate.glob === supportGlob);
        selectionByTarget.set(supportGlob, {
            target: supportGlob,
            targetType: isFileScopeToken(supportGlob) ? 'file' : 'glob',
            source: 'support_surface',
            confidence: fact?.evidence.confidence ?? 'medium',
            authority: fact?.evidence.authority ?? 'deterministic',
            evidenceType: fact?.evidence.type ?? 'repository-config',
            ...(fact ? { factId: fact.id } : {}),
            reason: fact?.evidence.reason ?? 'Repository configuration identifies this observed support surface.',
        });
    }
    const expectedFiles = expectedPathGlobs.filter((target) => !target.includes('*') && isFileScopeToken(target));
    const expectedGlobs = unique(expectedPathGlobs
        .filter((target) => target.includes('*') || !isFileScopeToken(target))
        .map((target) => target.includes('*') ? target : `${target.replace(/\/$/, '')}/**`));
    const brainFacts = profile.repositoryTopology?.brain.participated
        ? profile.repositoryTopology.brain.facts
        : [];
    const expectedSymbols = unique(brainFacts
        .filter((fact) => fact.name && intentTerms.some((term) => fact.name.toLowerCase() === term || fact.name.toLowerCase().includes(term)))
        .map((fact) => fact.name)).sort();
    const affectedPackages = (0, repository_topology_1.topologyPackageRootsForPaths)(profile.repositoryTopology, unique([...pathTokens, ...expectedFiles, ...expectedGlobs]));
    const targetPrefixes = unique([...expectedFiles, ...expectedGlobs])
        .map((target) => target.replace(/\/\*\*$/, '').replace(/\/\*$/, '').replace(/\/$/, ''));
    const affectedModules = (profile.architecture?.modules ?? [])
        .filter((module) => {
        const modulePrefix = module.glob.replace(/\/\*\*$/, '').replace(/\/\*$/, '').replace(/\/$/, '');
        return targetPrefixes.some((target) => target === modulePrefix || target.startsWith(`${modulePrefix}/`) || modulePrefix.startsWith(`${target}/`));
    })
        .map((module) => module.id)
        .sort();
    const unsupportedAreas = unique([
        ...(scopeMode === 'ambiguous' ? ['ambiguous_intent_requires_accepted_plan_or_clarification'] : []),
        ...(!profile.repositoryTopology ? ['repository_topology_missing'] : []),
        ...(profile.repositoryTopology && !profile.repositoryTopology.brain.participated
            ? [`repo_brain_not_evaluated:${profile.repositoryTopology.brain.freshness ?? 'missing'}`]
            : []),
        ...(profile.repositoryTopology?.brain.freshness === 'partial' ? ['repo_brain_partial_coverage'] : []),
    ]);
    return {
        schemaVersion: 1,
        summary: normalizeGoal(goal),
        primaryAction,
        confidence,
        target: {
            pathTokens,
            domainKeywords,
            expectedPathGlobs,
            supportPathGlobs,
        },
        scopeAuthority: {
            expectedFiles,
            expectedGlobs,
            expectedSymbols,
            likelyTests: supportPathGlobs,
            affectedPackages,
            affectedModules,
            prohibitedBoundaries: outOfScopeGlobs,
            selections: Array.from(selectionByTarget.values()).sort((left, right) => left.target.localeCompare(right.target)),
            unsupportedAreas,
            brain: {
                evaluated: profile.repositoryTopology?.brain.participated === true,
                freshness: profile.repositoryTopology?.brain.freshness ?? null,
                reason: profile.repositoryTopology?.brain.reason ?? 'Repository topology is unavailable.',
            },
        },
        obligations: intentObligations(goal, primaryAction, domainKeywords, scopeMode),
        outOfScopeGlobs,
        riskNotes,
        createdAt: new Date().toISOString(),
    };
}
function evaluateIntentCoherence(contract, filePath) {
    const intent = contract.intentContract;
    if (!intent) {
        return {
            verdict: 'unknown',
            score: 50,
            filePath,
            matchedGlobs: [],
            reasons: ['No intent contract is present on this session.'],
            obligations: [],
        };
    }
    const expectedMatches = pathMatchesAny(filePath, intent.target.expectedPathGlobs);
    if (expectedMatches.length > 0) {
        return {
            verdict: 'aligned',
            score: intent.confidence === 'high' ? 96 : 88,
            filePath,
            matchedGlobs: expectedMatches,
            reasons: [`File matches expected intent scope: ${expectedMatches.join(', ')}`],
            obligations: intent.obligations,
        };
    }
    const supportMatches = pathMatchesAny(filePath, intent.target.supportPathGlobs);
    if (supportMatches.length > 0) {
        return {
            verdict: 'supporting',
            score: 74,
            filePath,
            matchedGlobs: supportMatches,
            reasons: [`File is a plausible support/test/helper path for the task: ${supportMatches.join(', ')}`],
            obligations: intent.obligations,
        };
    }
    const outOfScopeMatches = pathMatchesAny(filePath, intent.outOfScopeGlobs);
    if (outOfScopeMatches.length > 0) {
        return {
            verdict: 'drift',
            score: 25,
            filePath,
            matchedGlobs: outOfScopeMatches,
            reasons: [`File is in a sensitive or approval-required boundary outside the intent contract: ${outOfScopeMatches.join(', ')}`],
            obligations: intent.obligations,
        };
    }
    const domainMatch = intent.target.domainKeywords.find((domain) => filePath.toLowerCase().includes(domain));
    if (domainMatch) {
        return {
            verdict: 'supporting',
            score: 68,
            filePath,
            matchedGlobs: [],
            reasons: [`File path loosely matches the task domain keyword "${domainMatch}".`],
            obligations: intent.obligations,
        };
    }
    return {
        verdict: 'drift',
        score: intent.confidence === 'low' ? 45 : 38,
        filePath,
        matchedGlobs: [],
        reasons: ['File does not match expected intent scope, support paths, or task domain keywords.'],
        obligations: intent.obligations,
    };
}
// ── Agent plan capture and plan coherence ─────────────────────────────────────
function currentAgentPlanRevision(contract) {
    if (typeof contract.agentPlanRevision === 'number' && contract.agentPlanRevision > 0) {
        return Math.floor(contract.agentPlanRevision);
    }
    const revisions = Array.isArray(contract.agentPlanRevisions)
        ? contract.agentPlanRevisions
        : [];
    const latest = revisions.reduce((max, revision) => {
        const value = typeof revision.revision === 'number' ? revision.revision : 0;
        return Math.max(max, value);
    }, 0);
    if (latest > 0)
        return latest;
    return contract.agentPlan ? 1 : 0;
}
function planRevisionLedger(contract) {
    const revisions = Array.isArray(contract.agentPlanRevisions)
        ? contract.agentPlanRevisions.filter((revision) => revision?.plan)
        : [];
    if (revisions.length > 0) {
        return [...revisions];
    }
    if (!contract.agentPlan) {
        return [];
    }
    const revision = currentAgentPlanRevision(contract) || 1;
    return [
        {
            revision,
            kind: 'captured',
            plan: contract.agentPlan,
            reason: 'legacy active plan snapshot',
            source: contract.agentPlan.source || 'unknown',
            capturedAt: contract.agentPlan.capturedAt || new Date().toISOString(),
            eventId: `plan_legacy_${revision}`,
        },
    ];
}
function makePlanEventId(prefix = 'plan') {
    return `${prefix}_${Date.now()}_${(0, node_crypto_1.randomBytes)(3).toString('hex')}`;
}
function recordAgentPlanRevision(args) {
    const localPlan = sanitizeAgentPlanForLocalPrivate(args.plan);
    const localReason = (0, intent_privacy_1.sanitizeLocalPrivateText)(args.reason, 2_000);
    const amendmentReasons = new Set();
    const localAmendment = args.amendment
        ? sanitizeLocalPrivateValue(args.amendment, amendmentReasons)
        : undefined;
    const previousRevision = currentAgentPlanRevision(args.session.contract);
    const revision = previousRevision === 0 ? 1 : previousRevision + 1;
    const eventId = makePlanEventId(args.kind);
    const capturedAt = localPlan.plan.capturedAt || new Date().toISOString();
    const ledger = planRevisionLedger(args.session.contract).filter((entry) => entry.revision < revision);
    args.session.contract.agentPlan = localPlan.plan;
    args.session.contract.agentPlanRevision = revision;
    args.session.contract.agentPlanRevisions = [
        ...ledger,
        {
            revision,
            kind: args.kind,
            plan: localPlan.plan,
            reason: localReason.value,
            source: args.source,
            capturedAt,
            eventId,
        },
    ];
    args.session.events.push({
        type: args.eventType,
        ts: capturedAt,
        message: args.kind === 'captured'
            ? `Agent plan captured as revision ${revision} (${args.source}, confidence ${localPlan.plan.confidence}, ${localPlan.plan.steps.length} step${localPlan.plan.steps.length === 1 ? '' : 's'})`
            : `Agent plan amended to revision ${revision} (${args.source})`,
        detail: {
            eventId,
            previousRevision,
            revision,
            agentPlan: localPlan.plan,
            ...(localAmendment
                ? {
                    planAmendment: {
                        previousRevision,
                        revision,
                        amendedAt: capturedAt,
                        activePlan: localPlan.plan,
                        ...localAmendment,
                    },
                }
                : {}),
        },
    });
    markLocalPrivateSession(args.session, [
        ...localPlan.reasonCodes,
        ...localReason.reasonCodes,
        ...amendmentReasons,
    ], capturedAt);
    recomputeArchitectureObligations(args.session, capturedAt);
    expandSessionScope(args.session, {
        text: [
            localPlan.plan.summary,
            ...localPlan.plan.steps,
        ].join('\n'),
        expectedFiles: localPlan.plan.expectedFiles,
        expectedGlobs: localPlan.plan.expectedGlobs,
    });
    (0, node_fs_1.writeFileSync)(sessionPath(args.projectRoot, args.session.sessionId), JSON.stringify(args.session, null, 2) + '\n', 'utf8');
    return args.session;
}
/**
 * Attach (or replace) the agent's captured plan on a session contract and record
 * a `plan_captured` event. Source-free: only the AgentPlan metadata is stored.
 * Returns null when the session cannot be loaded; never throws on a missing plan.
 */
function attachAgentPlan(projectRoot, sessionId, plan) {
    const session = loadSession(projectRoot, sessionId);
    if (!session)
        return null;
    const hasExistingPlan = Boolean(session.contract.agentPlan);
    return recordAgentPlanRevision({
        projectRoot,
        session,
        plan,
        kind: hasExistingPlan ? 'amended' : 'captured',
        reason: hasExistingPlan ? 'agent published an updated plan' : 'initial agent plan captured',
        source: plan.source || 'unknown',
        eventType: hasExistingPlan ? 'plan_amended' : 'plan_captured',
        amendment: hasExistingPlan
            ? {
                action: 'replace',
                reason: 'agent published an updated plan',
                source: plan.source || 'unknown',
                activePlan: plan,
            }
            : undefined,
    });
}
function emptyAgentPlan(now, source) {
    return {
        schemaVersion: 1,
        summary: 'Agent plan',
        steps: [],
        expectedFiles: [],
        expectedGlobs: [],
        constraints: [],
        risks: [],
        capturedAt: now,
        source,
        confidence: 'low',
    };
}
function hasPatchChanges(input) {
    return Boolean(input.summary?.trim() ||
        input.planText?.trim() ||
        (input.addSteps?.length ?? 0) > 0 ||
        (input.removeSteps?.length ?? 0) > 0 ||
        (input.addExpectedFiles?.length ?? 0) > 0 ||
        (input.removeExpectedFiles?.length ?? 0) > 0 ||
        (input.addExpectedGlobs?.length ?? 0) > 0 ||
        (input.removeExpectedGlobs?.length ?? 0) > 0 ||
        (input.addConstraints?.length ?? 0) > 0 ||
        (input.removeConstraints?.length ?? 0) > 0 ||
        (input.addRisks?.length ?? 0) > 0 ||
        (input.removeRisks?.length ?? 0) > 0);
}
function confidenceForPlan(plan) {
    if ((plan.expectedFiles.length + plan.expectedGlobs.length > 0) && plan.steps.length >= 1) {
        return 'high';
    }
    if (plan.steps.length > 0 || plan.expectedFiles.length + plan.expectedGlobs.length > 0) {
        return 'medium';
    }
    return 'low';
}
function planMateriallyChanged(existing, next) {
    if (!existing)
        return true;
    const stable = (values) => JSON.stringify(values);
    return (existing.summary !== next.summary ||
        stable(existing.steps) !== stable(next.steps) ||
        stable(existing.expectedFiles) !== stable(next.expectedFiles) ||
        stable(existing.expectedGlobs) !== stable(next.expectedGlobs) ||
        stable(existing.constraints) !== stable(next.constraints) ||
        stable(existing.risks) !== stable(next.risks));
}
function addedValues(existing, next) {
    const before = new Set((existing ?? []).map((value) => value.trim()).filter(Boolean));
    return uniqueTrimmed((next ?? []).filter((value) => !before.has(value.trim())));
}
function removedValues(existing, next) {
    const after = new Set((next ?? []).map((value) => value.trim()).filter(Boolean));
    return uniqueTrimmed((existing ?? []).filter((value) => !after.has(value.trim())));
}
function fileMatchesAny(filePath, globs) {
    return pathMatchesAny(filePath, globs).length > 0;
}
/**
 * Deterministically classify a proposed plan change. The risk model is
 * intentionally conservative around permission-envelope expansion:
 *  - broad globs require human review;
 *  - newly named sensitive / approval-required / owned files require review;
 *  - files outside the original intent envelope require review;
 *  - removing a stated constraint requires review.
 *
 * Adding a concrete file already inside the declared task intent stays fluid,
 * which preserves normal iterative implementation work.
 */
function classifyAgentPlanAmendment(contract, proposedPlan) {
    const existing = contract.agentPlan;
    const addedFiles = addedValues(existing?.expectedFiles, proposedPlan.expectedFiles)
        .map(normalizePlanPath);
    const addedGlobs = addedValues(existing?.expectedGlobs, proposedPlan.expectedGlobs)
        .map(normalizePlanPath);
    const removedConstraints = removedValues(existing?.constraints, proposedPlan.constraints);
    const reasons = [];
    let level = 'low';
    const escalate = (next, reason) => {
        const order = { low: 0, medium: 1, high: 2 };
        if (order[next] > order[level])
            level = next;
        reasons.push(reason);
    };
    if (addedGlobs.length > 0) {
        escalate('high', `Plan adds broad target glob${addedGlobs.length === 1 ? '' : 's'}: ${addedGlobs.join(', ')}`);
    }
    if (removedConstraints.length > 0) {
        escalate('high', `Plan removes stated constraint${removedConstraints.length === 1 ? '' : 's'}: ${removedConstraints.join(', ')}`);
    }
    if (addedFiles.length > 5) {
        escalate('high', `Plan expands to ${addedFiles.length} additional files in one amendment.`);
    }
    const intentGlobs = unique([
        ...(contract.intentContract?.target.expectedPathGlobs ?? []),
        ...(contract.intentContract?.target.supportPathGlobs ?? []),
    ]);
    const ownedGlobs = contract.ownershipRules.map((rule) => rule.glob);
    for (const filePath of addedFiles) {
        if (fileMatchesAny(filePath, contract.approvalRequiredGlobs)) {
            escalate('high', `Added file requires explicit boundary approval: ${filePath}`);
            continue;
        }
        if (fileMatchesAny(filePath, contract.sensitiveGlobs)) {
            escalate('high', `Added file crosses a sensitive boundary: ${filePath}`);
            continue;
        }
        if (fileMatchesAny(filePath, ownedGlobs)) {
            escalate('high', `Added file crosses a team-owned boundary: ${filePath}`);
            continue;
        }
        if (intentGlobs.length > 0 && !fileMatchesAny(filePath, intentGlobs)) {
            escalate('high', `Added file is outside the original intent envelope: ${filePath}`);
            continue;
        }
        escalate('medium', `Plan adds an in-intent implementation file: ${filePath}`);
    }
    if (reasons.length === 0 && planMateriallyChanged(existing, proposedPlan)) {
        reasons.push('Plan refines existing steps without expanding governed target scope.');
    }
    const effectiveLevel = level;
    return {
        level: effectiveLevel,
        requiresHumanApproval: effectiveLevel === 'high',
        reasons,
        addedFiles,
        addedGlobs,
        removedConstraints,
    };
}
function deriveAmendedPlan(existing, input) {
    const source = input.source || 'manual';
    const amendedAt = input.amendedAt || new Date().toISOString();
    const reason = input.reason?.trim() || 'plan updated during session';
    if (!hasPatchChanges(input)) {
        throw new Error('No plan changes supplied. Provide --plan, --add-step, --remove-step, --add-file, or --remove-file.');
    }
    if (input.planText?.trim()) {
        const plan = (0, agent_plan_1.extractAgentPlan)({ plan: input.planText }, { now: new Date(amendedAt), source });
        if (!plan) {
            throw new Error('Could not parse replacement plan text.');
        }
        return {
            action: 'replace',
            plan: {
                ...plan,
                summary: input.summary?.trim() || plan.summary,
                capturedAt: amendedAt,
                source,
            },
            amendment: {
                action: 'replace',
                reason,
                source,
            },
        };
    }
    const base = existing
        ? { ...existing }
        : emptyAgentPlan(amendedAt, source);
    const addSteps = uniqueTrimmed(input.addSteps ?? []);
    const removeSteps = uniqueTrimmed(input.removeSteps ?? []);
    const addConstraints = uniqueTrimmed(input.addConstraints ?? []);
    const removeConstraints = uniqueTrimmed(input.removeConstraints ?? []);
    const addRisks = uniqueTrimmed(input.addRisks ?? []);
    const removeRisks = uniqueTrimmed(input.removeRisks ?? []);
    const inferredAdded = (0, agent_plan_1.extractExpectedTargetsFromText)([
        input.summary || '',
        ...addSteps,
        ...addConstraints,
    ].join('\n'));
    const inferredRemoved = (0, agent_plan_1.extractExpectedTargetsFromText)(removeSteps.join('\n'));
    const filesToAdd = normalizePlanPaths([
        ...(input.addExpectedFiles ?? []),
        ...inferredAdded.expectedFiles,
    ]);
    const filesToRemove = normalizePlanPaths([
        ...(input.removeExpectedFiles ?? []),
        ...inferredRemoved.expectedFiles,
    ]);
    const globsToAdd = normalizePlanPaths([
        ...(input.addExpectedGlobs ?? []),
        ...inferredAdded.expectedGlobs,
    ]);
    const globsToRemove = normalizePlanPaths([
        ...(input.removeExpectedGlobs ?? []),
        ...inferredRemoved.expectedGlobs,
    ]);
    const plan = {
        ...base,
        summary: input.summary?.trim() || base.summary || 'Agent plan',
        steps: removeTrimmed([...(base.steps ?? []), ...addSteps], removeSteps),
        expectedFiles: removeTrimmed(normalizePlanPaths([...(base.expectedFiles ?? []), ...filesToAdd]), filesToRemove),
        expectedGlobs: removeTrimmed(normalizePlanPaths([...(base.expectedGlobs ?? []), ...globsToAdd]), globsToRemove),
        constraints: removeTrimmed([...(base.constraints ?? []), ...addConstraints], removeConstraints),
        risks: removeTrimmed([...(base.risks ?? []), ...addRisks], removeRisks),
        capturedAt: amendedAt,
        source,
        confidence: 'low',
    };
    plan.confidence = confidenceForPlan(plan);
    return {
        action: 'patch',
        plan,
        amendment: {
            action: 'patch',
            reason,
            source,
            added: {
                steps: addSteps,
                expectedFiles: filesToAdd,
                expectedGlobs: globsToAdd,
                constraints: addConstraints,
                risks: addRisks,
            },
            removed: {
                steps: removeSteps,
                expectedFiles: filesToRemove,
                expectedGlobs: globsToRemove,
                constraints: removeConstraints,
                risks: removeRisks,
            },
        },
    };
}
function proposalLedger(contract) {
    return Array.isArray(contract.planAmendmentProposals)
        ? contract.planAmendmentProposals
        : [];
}
function persistSession(projectRoot, session) {
    (0, node_fs_1.writeFileSync)(sessionPath(projectRoot, session.sessionId), JSON.stringify(session, null, 2) + '\n', 'utf8');
}
function createPendingPlanProposal(args) {
    const localPlan = sanitizeAgentPlanForLocalPrivate(args.proposedPlan);
    const localReason = (0, intent_privacy_1.sanitizeLocalPrivateText)(args.reason, 2_000);
    const existingPending = proposalLedger(args.session.contract).find((proposal) => proposal.status === 'pending' &&
        proposal.previousRevision === currentAgentPlanRevision(args.session.contract) &&
        !planMateriallyChanged(proposal.proposedPlan, localPlan.plan));
    if (existingPending)
        return existingPending;
    const proposal = {
        proposalId: makePlanEventId('replan_proposal'),
        sessionId: args.session.sessionId,
        previousRevision: currentAgentPlanRevision(args.session.contract),
        action: args.action,
        proposedBy: args.proposedBy,
        source: args.source,
        reason: localReason.value,
        proposedPlan: localPlan.plan,
        risk: args.risk,
        status: 'pending',
        createdAt: args.createdAt,
    };
    args.session.contract.planAmendmentProposals = [
        ...proposalLedger(args.session.contract),
        proposal,
    ];
    args.session.events.push({
        type: 'plan_amendment_proposed',
        ts: args.createdAt,
        message: `Agent plan amendment proposed (${proposal.risk.level} risk, human decision required)`,
        detail: { planAmendmentProposal: proposal },
    });
    markLocalPrivateSession(args.session, [
        ...localPlan.reasonCodes,
        ...localReason.reasonCodes,
    ], args.createdAt);
    persistSession(args.projectRoot, args.session);
    return proposal;
}
function applyOrProposeAgentPlan(args) {
    const previousRevision = currentAgentPlanRevision(args.session.contract);
    const risk = classifyAgentPlanAmendment(args.session.contract, args.plan);
    if (args.proposedBy === 'agent' && risk.requiresHumanApproval) {
        const proposal = createPendingPlanProposal({
            projectRoot: args.projectRoot,
            session: args.session,
            action: args.action,
            proposedPlan: args.plan,
            reason: args.reason,
            source: args.source,
            proposedBy: args.proposedBy,
            risk,
            createdAt: args.amendedAt,
        });
        return {
            sessionId: args.session.sessionId,
            previousRevision,
            revision: null,
            action: args.action,
            reason: args.reason,
            eventId: proposal.proposalId,
            status: 'pending',
            risk,
            activePlan: args.session.contract.agentPlan ?? null,
            proposal,
        };
    }
    const updated = recordAgentPlanRevision({
        projectRoot: args.projectRoot,
        session: args.session,
        plan: args.plan,
        kind: 'amended',
        reason: args.reason,
        source: args.source,
        eventType: 'plan_amended',
        amendment: {
            ...args.amendment,
            proposedBy: args.proposedBy,
            decidedBy: args.decidedBy || (args.proposedBy === 'human' ? 'local-human' : null),
            risk,
        },
    });
    const revision = currentAgentPlanRevision(updated.contract);
    const event = updated.events[updated.events.length - 1];
    return {
        sessionId: updated.sessionId,
        previousRevision,
        revision,
        action: args.action,
        reason: args.reason,
        eventId: String(event.detail?.eventId || ''),
        status: 'applied',
        risk,
        activePlan: updated.contract.agentPlan,
    };
}
/**
 * Capture an agent-emitted plan from the live hook path. The initial plan is
 * accepted as revision 1. Later safe refinements apply automatically, while
 * risky agent-authored expansions remain pending until a human decides.
 */
function captureAgentPlan(projectRoot, sessionId, plan) {
    const session = loadSession(projectRoot, sessionId);
    if (!session)
        return null;
    if (!session.contract.agentPlan) {
        const updated = attachAgentPlan(projectRoot, sessionId, plan);
        return updated ? { session: updated, status: 'captured' } : null;
    }
    if (!planMateriallyChanged(session.contract.agentPlan, plan)) {
        return { session, status: 'unchanged' };
    }
    const result = applyOrProposeAgentPlan({
        projectRoot,
        session,
        action: 'replace',
        plan,
        reason: 'agent published an updated plan',
        source: plan.source || 'unknown',
        proposedBy: 'agent',
        amendedAt: plan.capturedAt || new Date().toISOString(),
        amendment: {
            action: 'replace',
            reason: 'agent published an updated plan',
            source: plan.source || 'unknown',
        },
    });
    const updated = loadSession(projectRoot, sessionId) || session;
    return {
        session: updated,
        status: result.status,
        proposal: result.proposal,
    };
}
/**
 * Amend the active agent plan for a live session. This is the user/agent
 * re-plan path: it updates `contract.agentPlan` immediately, appends a
 * source-free revision, and records a `plan_amended` event for replay.
 */
function amendAgentPlan(projectRoot, input) {
    const session = input.sessionId
        ? loadSession(projectRoot, input.sessionId)
        : loadActiveSession(projectRoot);
    if (!session)
        throw new Error('No active session found. Start a governed task first.');
    if (session.status !== 'active')
        throw new Error(`Session ${session.sessionId} is already finished.`);
    const reason = input.reason?.trim() || 'plan updated during session';
    const { action, plan, amendment } = deriveAmendedPlan(session.contract.agentPlan, input);
    const source = input.source || 'manual';
    const proposedBy = input.proposedBy || 'human';
    const amendedAt = input.amendedAt || plan.capturedAt || new Date().toISOString();
    return applyOrProposeAgentPlan({
        projectRoot,
        session,
        action,
        plan: {
            ...plan,
            capturedAt: amendedAt,
            source,
        },
        reason,
        source,
        proposedBy,
        amendedAt,
        decidedBy: input.decidedBy,
        amendment: {
            ...amendment,
            reason,
            amendedAt,
            activePlan: {
                ...plan,
                capturedAt: amendedAt,
                source,
            },
        },
    });
}
function decideAgentPlanAmendment(projectRoot, input) {
    const session = input.sessionId
        ? loadSession(projectRoot, input.sessionId)
        : loadActiveSession(projectRoot);
    if (!session)
        throw new Error('No active session found. Start a governed task first.');
    if (session.status !== 'active')
        throw new Error(`Session ${session.sessionId} is already finished.`);
    const proposals = proposalLedger(session.contract);
    const proposal = proposals.find((entry) => entry.proposalId === input.proposalId);
    if (!proposal)
        throw new Error(`Plan amendment proposal ${input.proposalId} was not found.`);
    if (proposal.status !== 'pending') {
        throw new Error(`Plan amendment proposal ${input.proposalId} is already ${proposal.status}.`);
    }
    const decidedAt = input.decidedAt || new Date().toISOString();
    const localDecidedBy = (0, intent_privacy_1.sanitizeLocalPrivateText)(input.decidedBy?.trim() || 'human', 200);
    const localReason = (0, intent_privacy_1.sanitizeLocalPrivateText)(input.reason?.trim() || `human ${input.decision}ed plan amendment`, 2_000);
    const decidedBy = localDecidedBy.value || 'human';
    const reason = localReason.value;
    proposal.status = input.decision === 'accept' ? 'accepted' : 'rejected';
    proposal.decidedAt = decidedAt;
    proposal.decidedBy = decidedBy;
    proposal.decisionReason = reason;
    if (input.decision === 'reject') {
        session.events.push({
            type: 'plan_amendment_decision',
            ts: decidedAt,
            decision: 'rejected',
            message: `Plan amendment ${proposal.proposalId} rejected by ${decidedBy}`,
            detail: { planAmendmentProposal: proposal },
        });
        markLocalPrivateSession(session, [
            ...localDecidedBy.reasonCodes,
            ...localReason.reasonCodes,
        ], decidedAt);
        persistSession(projectRoot, session);
        return {
            sessionId: session.sessionId,
            proposalId: proposal.proposalId,
            decision: input.decision,
            status: proposal.status,
            previousRevision: currentAgentPlanRevision(session.contract),
            revision: null,
            activePlan: session.contract.agentPlan ?? null,
        };
    }
    const previousRevision = currentAgentPlanRevision(session.contract);
    const updated = recordAgentPlanRevision({
        projectRoot,
        session,
        plan: {
            ...proposal.proposedPlan,
            capturedAt: decidedAt,
            source: input.source || proposal.source,
        },
        kind: 'amended',
        reason,
        source: input.source || proposal.source,
        eventType: 'plan_amended',
        amendment: {
            action: proposal.action,
            proposalId: proposal.proposalId,
            proposedBy: proposal.proposedBy,
            decidedBy,
            decisionReason: reason,
            risk: proposal.risk,
        },
    });
    const revision = currentAgentPlanRevision(updated.contract);
    proposal.appliedRevision = revision;
    updated.events.push({
        type: 'plan_amendment_decision',
        ts: decidedAt,
        decision: 'accepted',
        message: `Plan amendment ${proposal.proposalId} accepted by ${decidedBy}`,
        detail: { planAmendmentProposal: proposal, appliedRevision: revision },
    });
    markLocalPrivateSession(updated, [
        ...localDecidedBy.reasonCodes,
        ...localReason.reasonCodes,
    ], decidedAt);
    persistSession(projectRoot, updated);
    return {
        sessionId: updated.sessionId,
        proposalId: proposal.proposalId,
        decision: input.decision,
        status: proposal.status,
        previousRevision,
        revision,
        activePlan: updated.contract.agentPlan ?? null,
    };
}
/**
 * Plan/edit coherence for a session: does this edit follow the agent's own plan?
 *
 * Maps the session's intent-support scope into the deterministic plan-coherence
 * evaluator. Boundary/approval blocks always override this advisory verdict at
 * the call site; an `unplanned` verdict must not block on its own in V1.
 */
function evaluateSessionPlanCoherence(contract, filePath) {
    return (0, agent_plan_1.evaluatePlanCoherence)({
        agentPlan: contract.agentPlan ?? null,
        filePath,
        intentSupportGlobs: contract.intentContract?.target.supportPathGlobs ?? [],
    });
}
function evaluatePlanCoherencePolicy(mode, planCoherence) {
    const effectiveMode = mode ?? profile_1.DEFAULT_PLAN_COHERENCE_MODE;
    if (effectiveMode === 'off') {
        return {
            mode: effectiveMode,
            action: 'none',
            reason: 'Plan coherence enforcement is disabled for this session.',
        };
    }
    if (planCoherence.verdict !== 'unplanned') {
        return {
            mode: effectiveMode,
            action: 'none',
            reason: `Plan coherence verdict is ${planCoherence.verdict}; no policy action required.`,
        };
    }
    return {
        mode: effectiveMode,
        action: effectiveMode,
        reason: planCoherence.reasons[0] || 'Path is not justified by the captured agent plan.',
    };
}
/**
 * Latest non-reverted agent-plan revision for a contract. `0` means no agent
 * plan has been captured yet. Public wrapper around the internal resolver so
 * callers (hooks, evidence, dashboard) can record which plan version was active.
 */
function activeAgentPlanRevision(contract) {
    return currentAgentPlanRevision(contract);
}
function timelineKindRank(kind) {
    switch (kind) {
        case 'intent':
            return 0;
        case 'plan_captured':
        case 'plan_amended':
            return 1;
        case 'amendment_proposed':
            return 2;
        case 'amendment_accepted':
        case 'amendment_rejected':
            return 3;
        default:
            return 4;
    }
}
function activeRevisionAt(ledger, ts) {
    let active = 0;
    for (const entry of ledger) {
        const capturedAt = entry.capturedAt || '';
        if (capturedAt && capturedAt <= ts && entry.revision > active) {
            active = entry.revision;
        }
    }
    return active;
}
function shortLabel(value, max = 120) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (text.length <= max)
        return text;
    return `${text.slice(0, max - 1)}…`;
}
/**
 * Build a source-free plan timeline from a governance session.
 *
 * Derived purely from data already persisted on the session (goal, intent
 * contract, plan revision ledger, amendment proposals, and boundary-check
 * events). No source, diffs, or file contents are read or emitted — only the
 * summaries, paths, and revision numbers that already live in the record.
 *
 * The timeline reads: Intent → Plan v1 → Amendment v2 → Block / Warning /
 * Approval, with every milestone tagged with the plan revision that was active
 * when it occurred.
 */
function buildPlanTimeline(session) {
    const contract = session.contract;
    const ledger = planRevisionLedger(contract);
    const proposals = proposalLedger(contract);
    const events = Array.isArray(session.events) ? session.events : [];
    const startEvent = events.find((event) => event.type === 'session_start');
    const intentTs = startEvent?.ts || contract.intentContract?.createdAt || ledger[0]?.capturedAt || '';
    const intentSummary = shortLabel(contract.intentContract?.summary || contract.goal || 'No intent captured');
    const entries = [];
    // 1. Initial intent record.
    entries.push({
        kind: 'intent',
        ts: intentTs,
        activePlanRevision: 0,
        label: intentSummary,
        source: contract.intentContract ? 'intent' : 'goal',
    });
    // 2. Every plan version (never overwritten; older revisions are preserved).
    for (const entry of ledger) {
        entries.push({
            kind: entry.kind === 'amended' ? 'plan_amended' : 'plan_captured',
            ts: entry.capturedAt || intentTs,
            activePlanRevision: entry.revision,
            revision: entry.revision,
            label: shortLabel(entry.plan?.summary || entry.reason || `plan revision ${entry.revision}`),
            source: entry.source,
        });
    }
    // 3. Amendment proposals + their human decisions.
    for (const proposal of proposals) {
        const proposedAt = proposal.createdAt || intentTs;
        entries.push({
            kind: 'amendment_proposed',
            ts: proposedAt,
            activePlanRevision: activeRevisionAt(ledger, proposedAt),
            label: shortLabel(`${proposal.risk?.level || 'unknown'} risk: ${proposal.reason || 'plan amendment proposed'}`),
            source: proposal.source,
        });
        if (proposal.status !== 'pending' && proposal.decidedAt) {
            entries.push({
                kind: proposal.status === 'accepted' ? 'amendment_accepted' : 'amendment_rejected',
                ts: proposal.decidedAt,
                activePlanRevision: activeRevisionAt(ledger, proposal.decidedAt),
                revision: proposal.appliedRevision ?? undefined,
                label: shortLabel(proposal.decisionReason || `amendment ${proposal.status} by ${proposal.decidedBy || 'human'}`),
                source: proposal.source,
            });
        }
    }
    // 4. Boundary check outcomes that matter for review: blocks, drift warnings,
    //    approvals, and obligation waivers — each tagged with the active plan.
    for (const event of events) {
        const ts = event.ts || intentTs;
        const activePlanRevision = activeRevisionAt(ledger, ts);
        if (event.type === 'check_block') {
            entries.push({
                kind: 'boundary_block',
                ts,
                activePlanRevision,
                label: shortLabel(event.message || event.filePath || 'edit blocked'),
                filePath: event.filePath,
                verdict: event.verdict,
            });
        }
        else if (event.type === 'check_warn') {
            entries.push({
                kind: 'drift_warning',
                ts,
                activePlanRevision,
                label: shortLabel(event.message || event.filePath || 'edit warning'),
                filePath: event.filePath,
                verdict: event.verdict,
            });
        }
        else if (event.type === 'approval_decision') {
            entries.push({
                kind: 'approval',
                ts,
                activePlanRevision,
                label: shortLabel(event.message || event.filePath || 'approval recorded'),
                filePath: event.filePath,
                verdict: event.decision,
            });
        }
        else if (event.type === 'obligation_waiver_decision') {
            entries.push({
                kind: 'obligation_waiver',
                ts,
                activePlanRevision,
                label: shortLabel(event.message || 'architecture obligation waived'),
            });
        }
    }
    entries.sort((a, b) => {
        if (a.ts !== b.ts)
            return a.ts < b.ts ? -1 : 1;
        return timelineKindRank(a.kind) - timelineKindRank(b.kind);
    });
    return {
        sessionId: session.sessionId,
        intentSummary,
        activePlanRevision: currentAgentPlanRevision(contract),
        planVersions: ledger.length,
        amendmentCount: ledger.filter((entry) => entry.kind === 'amended').length,
        pendingAmendmentCount: proposals.filter((proposal) => proposal.status === 'pending').length,
        driftWarningCount: events.filter((event) => event.type === 'check_warn').length,
        blockedBoundaryCount: events.filter((event) => event.type === 'check_block').length,
        approvalCount: events.filter((event) => event.type === 'approval_decision').length,
        entries,
    };
}
function deriveAllowedGlobs(goal, profile) {
    const lower = goal.toLowerCase();
    const approvalPrefixes = profile.approvalRequiredPaths.map((g) => g.replace('/**', '').replace('/*', ''));
    const configuredSupportGlobs = (profile.runtimeConfig?.safeSupportGlobs ?? [])
        .filter((glob) => (0, repository_topology_1.topologyHasPath)(profile.repositoryTopology, glob));
    // Helper: remove any glob that overlaps with an approval-required prefix.
    // A glob like "src/billing/**" overlaps "src/billing"; "src/**" does NOT start
    // with "src/billing" so it passes — but "src/**" would contain billing inside it.
    // We therefore do a two-way check: glob-prefix starts with ap-prefix OR ap-prefix
    // starts with glob-prefix (the latter catches broad globs that contain sensitive dirs).
    function excludeApprovalRequired(globs) {
        return globs.filter((g) => {
            const gPrefix = g.replace('/**', '').replace('/*', '');
            return !approvalPrefixes.some((ap) => gPrefix.startsWith(ap) || ap.startsWith(gPrefix + '/'));
        });
    }
    // ── Explicit path tokens in the goal (highest confidence) ───────────────────
    // Two cases:
    //   file path  "modify src/tasks/export_task.py"  → allow exactly "src/tasks/export_task.py"
    //   dir  path  "refactor src/tasks"               → allow "src/tasks/**"
    //
    // A token is a file path when the last segment contains a '.' (i.e. has an extension).
    // We must NOT strip the extension and append /**, which was the bug that turned
    // "src/tasks/export_task.py" into "src/tasks/export_task/**" and then blocked
    // the exact file the user named.
    const excludedPrefixes = deriveExcludedScopePrefixes(goal);
    const pathTokens = extractPathTokens(goal, profile)
        .filter((token) => !excludedPrefixes.some((prefix) => token === prefix.replace(/\/$/, '') || token.startsWith(prefix)));
    if (pathTokens.length > 0) {
        const exclusiveExplicitScope = hasExclusiveScopeCue(lower);
        const expanded = pathTokens.map((t) => {
            const normalised = t.replace(/^\//, '');
            return isFileScopeToken(normalised) ? normalised : `${normalised.replace(/\/$/, '')}/**`;
        });
        const packageRoots = (0, repository_topology_1.topologyPackageRootsForPaths)(profile.repositoryTopology, pathTokens);
        const observedSupport = exclusiveExplicitScope
            ? []
            : (0, repository_topology_1.topologySupportGlobs)(profile.repositoryTopology, packageRoots);
        const globs = filterExcludedScopePrefixes(excludeApprovalRequired([
            ...expanded,
            ...observedSupport,
            ...(exclusiveExplicitScope ? [] : configuredSupportGlobs),
        ]), excludedPrefixes);
        if (globs.length > 0)
            return { allowedGlobs: globs, scopeMode: 'explicit' };
    }
    // ── Topology-aware intent inference ─────────────────────────────────────────
    // Generic language classifiers and semantic terms may select an observed
    // topology fact. A conventional directory name never creates a glob by
    // itself: advisory facts require the user term to corroborate an existing
    // path, and deterministic facts come from manifests/file formats/graph facts.
    const terms = unique([
        ...domainKeywordsForGoal(lower),
        ...(lower.match(/[a-z][a-z0-9_-]{2,}/g) ?? []),
    ]);
    const selections = (0, repository_topology_1.topologyGlobsForIntent)(profile.repositoryTopology, {
        terms,
        explicitPaths: pathTokens,
        includeSupport: true,
    });
    if (selections.length > 0) {
        const matched = new Set(selections.map((selection) => selection.glob));
        for (const support of configuredSupportGlobs)
            matched.add(support);
        const globs = filterExcludedScopePrefixes(excludeApprovalRequired(Array.from(matched)), excludedPrefixes);
        if (globs.length > 0)
            return { allowedGlobs: globs, scopeMode: 'inferred' };
    }
    // ── Ambiguous fallback ───────────────────────────────────────────────────────
    // No broad write scope is invented. Only repository-configured support globs
    // that resolve to observed topology facts survive, and protected boundaries
    // continue to fail closed independently.
    return {
        allowedGlobs: filterExcludedScopePrefixes(excludeApprovalRequired(configuredSupportGlobs), excludedPrefixes),
        scopeMode: 'ambiguous',
    };
}
function scopeEntriesFromPaths(paths) {
    return normalizePlanPaths(paths).map((token) => (isFileScopeToken(token) ? token : `${token.replace(/\/$/, '')}/**`));
}
function expandSessionScope(session, input) {
    const fromText = input.text?.trim()
        ? (0, agent_plan_1.extractExpectedTargetsFromText)(input.text)
        : { expectedFiles: [], expectedGlobs: [] };
    const additions = unique([
        ...scopeEntriesFromPaths([
            ...(input.expectedFiles ?? []),
            ...fromText.expectedFiles,
        ]),
        ...normalizePlanPaths([
            ...(input.expectedGlobs ?? []),
            ...fromText.expectedGlobs,
        ]),
    ]);
    if (additions.length === 0)
        return;
    session.contract.allowedGlobs = unique([
        ...session.contract.allowedGlobs,
        ...additions,
    ]);
    if (session.contract.scopeMode === 'ambiguous') {
        session.contract.scopeMode = 'explicit';
    }
    const intent = session.contract.intentContract;
    if (!intent)
        return;
    const planFiles = normalizePlanPaths([
        ...(input.expectedFiles ?? []),
        ...fromText.expectedFiles,
    ]);
    const proposedPlanGlobs = unique([
        ...normalizePlanPaths(input.expectedGlobs ?? []),
        ...scopeEntriesFromPaths(fromText.expectedGlobs),
    ]);
    const topology = session.contract.repositoryTopology;
    const groundedPlanGlobs = proposedPlanGlobs.filter((glob) => topology?.facts.some((fact) => pathMatchesAny(fact.path, [glob]).length > 0));
    const ungroundedPlanGlobs = proposedPlanGlobs.filter((glob) => !groundedPlanGlobs.includes(glob));
    const retainedSelections = intent.scopeAuthority.selections
        .filter((selection) => selection.source !== 'active_agent_plan');
    const planSelections = [
        ...planFiles.map((target) => ({
            target,
            targetType: 'file',
            source: 'active_agent_plan',
            confidence: 'high',
            authority: 'deterministic',
            evidenceType: 'accepted-agent-plan',
            reason: 'The active governed agent plan names this exact repository-relative file.',
        })),
        ...groundedPlanGlobs.map((target) => ({
            target,
            targetType: 'glob',
            source: 'active_agent_plan',
            confidence: 'high',
            authority: 'deterministic',
            evidenceType: 'accepted-agent-plan+repository-topology',
            reason: 'The active governed agent plan names this scope and current topology proves that it exists.',
        })),
    ];
    const selections = [...retainedSelections, ...planSelections]
        .sort((left, right) => left.target.localeCompare(right.target));
    const selectedTargets = selections.map((selection) => selection.target);
    const selectedTopologyFacts = topology?.facts.filter((fact) => selectedTargets.some((target) => pathMatchesAny(fact.path, [target]).length > 0
        || pathMatchesAny(target.replace(/\/\*\*$/, ''), [fact.glob]).length > 0)) ?? [];
    const relatedTests = topology?.relationships
        .filter((relationship) => relationship.kind === 'source-to-test'
        && planFiles.includes(relationship.from))
        .map((relationship) => relationship.to) ?? [];
    intent.target.expectedPathGlobs = unique(selectedTargets);
    intent.scopeAuthority = {
        ...intent.scopeAuthority,
        expectedFiles: unique(selections
            .filter((selection) => selection.targetType === 'file')
            .map((selection) => selection.target)),
        expectedGlobs: unique(selections
            .filter((selection) => selection.targetType === 'glob')
            .map((selection) => selection.target)),
        likelyTests: unique([...intent.scopeAuthority.likelyTests, ...relatedTests]),
        affectedPackages: (0, repository_topology_1.topologyPackageRootsForPaths)(topology, selectedTargets),
        affectedModules: unique([
            ...intent.scopeAuthority.affectedModules,
            ...selectedTopologyFacts.flatMap((fact) => {
                if (fact.kind === 'package-root' && fact.path !== '.')
                    return [fact.path];
                if (fact.packageRoot && fact.packageRoot !== '.')
                    return [fact.packageRoot];
                if (fact.kind === 'source-root' || fact.kind === 'test-root')
                    return [fact.path];
                return [];
            }),
        ]),
        selections,
        unsupportedAreas: unique([
            ...intent.scopeAuthority.unsupportedAreas
                .filter((area) => area !== 'ambiguous_intent_requires_accepted_plan_or_clarification'
                && !area.startsWith('agent_plan_glob_not_grounded:')),
            ...ungroundedPlanGlobs.map((glob) => `agent_plan_glob_not_grounded:${glob}`),
        ]),
    };
}
//# sourceMappingURL=session.js.map