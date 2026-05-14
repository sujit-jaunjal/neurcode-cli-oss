"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listWorkspaces = listWorkspaces;
exports.getWorkspaceById = getWorkspaceById;
exports.getActiveWorkspace = getActiveWorkspace;
exports.createWorkspace = createWorkspace;
exports.setActiveWorkspace = setActiveWorkspace;
exports.addWorkspaceRepository = addWorkspaceRepository;
exports.updateWorkspace = updateWorkspace;
exports.getWorkspaceRuntimeSnapshot = getWorkspaceRuntimeSnapshot;
exports.captureWorkspaceReplayAttestation = captureWorkspaceReplayAttestation;
exports.executeWorkspaceAction = executeWorkspaceAction;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const execution_bus_1 = require("./execution-bus");
const execution_actions_1 = require("../../utils/execution-actions");
const control_plane_1 = require("../../utils/control-plane");
const runtime_events_1 = require("../../utils/runtime-events");
const replay_runtime_1 = require("../../utils/replay-runtime");
const artifact_io_1 = require("../../utils/artifact-io");
const WORKSPACE_SCHEMA = 'neurcode.workspace.v1';
const WORKSPACE_INDEX_SCHEMA = 'neurcode.workspaces.index.v1';
const WORKSPACE_RUNTIME_SCHEMA = 'neurcode.workspace-runtime.v1';
const DEFAULT_WORKSPACES_DIR = '.neurcode/workspaces';
const DEFAULT_EVIDENCE_LIMIT = 150;
const DEFAULT_EXECUTION_LIMIT = 200;
const DEFAULT_EVENT_LIMIT = 500;
const repoScanCache = new Map();
function nowIso() {
    return new Date().toISOString();
}
function asObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    return value;
}
function asString(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function asBoolean(value, fallback = false) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'yes')
            return true;
        if (normalized === 'false' || normalized === '0' || normalized === 'no')
            return false;
    }
    return fallback;
}
function asNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return null;
}
function clampInt(value, fallback, min, max) {
    const parsed = asNumber(value);
    if (parsed === null)
        return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
}
function normalizeList(values) {
    if (!Array.isArray(values))
        return [];
    return Array.from(new Set(values
        .map((entry) => asString(entry))
        .filter((entry) => Boolean(entry)))).sort((left, right) => left.localeCompare(right));
}
function slugify(value) {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug.length > 0 ? slug : 'workspace';
}
function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}
function insideRoot(rootDir, target) {
    const normalizedRoot = rootDir.endsWith(path_1.sep) ? rootDir : `${rootDir}${path_1.sep}`;
    return target === rootDir || target.startsWith(normalizedRoot);
}
function resolveRepoRoot(startDir) {
    let current = (0, path_1.resolve)(startDir);
    for (let depth = 0; depth < 8; depth += 1) {
        if ((0, fs_1.existsSync)((0, path_1.join)(current, '.git')) || (0, fs_1.existsSync)((0, path_1.join)(current, 'pnpm-workspace.yaml'))) {
            return current;
        }
        const parent = (0, path_1.dirname)(current);
        if (parent === current)
            break;
        current = parent;
    }
    return (0, path_1.resolve)(startDir);
}
function resolveWorkspaceRoot(cwd) {
    return resolveRepoRoot(cwd);
}
function toWorkspacePaths(rootDir) {
    const workspacesDir = (0, path_1.resolve)(rootDir, DEFAULT_WORKSPACES_DIR);
    const indexFile = (0, path_1.join)(workspacesDir, 'index.json');
    (0, fs_1.mkdirSync)(workspacesDir, { recursive: true });
    (0, fs_1.mkdirSync)((0, path_1.join)(workspacesDir, 'definitions'), { recursive: true });
    return {
        rootDir,
        workspacesDir,
        indexFile,
    };
}
function workspaceDefinitionFile(paths, workspaceId) {
    return (0, path_1.join)(paths.workspacesDir, 'definitions', `${workspaceId}.json`);
}
function defaultWorkspaceIndex() {
    return {
        schemaVersion: WORKSPACE_INDEX_SCHEMA,
        activeWorkspaceId: null,
        updatedAt: nowIso(),
    };
}
function readWorkspaceIndex(paths) {
    if (!(0, fs_1.existsSync)(paths.indexFile)) {
        return defaultWorkspaceIndex();
    }
    try {
        const parsed = JSON.parse((0, fs_1.readFileSync)(paths.indexFile, 'utf-8'));
        const record = asObject(parsed);
        if (!record || record.schemaVersion !== WORKSPACE_INDEX_SCHEMA) {
            return defaultWorkspaceIndex();
        }
        return {
            schemaVersion: WORKSPACE_INDEX_SCHEMA,
            activeWorkspaceId: asString(record.activeWorkspaceId),
            updatedAt: asString(record.updatedAt) || nowIso(),
        };
    }
    catch {
        return defaultWorkspaceIndex();
    }
}
function writeWorkspaceIndex(paths, index) {
    (0, artifact_io_1.atomicWriteJsonFileSync)(paths.indexFile, index);
}
function normalizeRepository(rootDir, raw, fallbackIdSeed) {
    const displayName = asString(raw.name) || (0, path_1.basename)(asString(raw.rootPath) || fallbackIdSeed) || fallbackIdSeed;
    const id = slugify(asString(raw.id) || displayName || fallbackIdSeed);
    const rootInput = asString(raw.rootPath) || '.';
    const resolved = (0, path_1.isAbsolute)(rootInput) ? (0, path_1.resolve)(rootInput) : (0, path_1.resolve)(rootDir, rootInput);
    const safeResolved = insideRoot(rootDir, resolved) ? resolved : rootDir;
    const relativePath = (0, path_1.relative)(rootDir, safeResolved).replace(/\\/g, '/');
    const normalizedPath = relativePath.length > 0 ? relativePath : '.';
    return {
        id,
        name: displayName,
        rootPath: normalizedPath,
        services: normalizeList(raw.services),
        policyDomain: asString(raw.policyDomain),
        tags: normalizeList(raw.tags),
        enabled: asBoolean(raw.enabled, true),
    };
}
function defaultGovernance() {
    return {
        posture: {
            targetRisk: 'medium',
            enforcement: 'strict',
            notes: null,
        },
        controlPlane: {
            inherit: true,
            overrides: {},
        },
        policy: {
            workspacePacks: [],
            repositoryPackOverrides: {},
            precedence: 'workspace-first',
        },
        evidence: {
            retentionMaxArtifacts: 50,
            indexLimit: 200,
        },
        remediation: {
            autonomousApplySafe: true,
            requireManualApprovalAtRisk: 'high',
        },
        runtime: {
            executionRetention: 250,
            eventRetention: 5000,
        },
    };
}
function normalizeGovernance(raw) {
    const defaults = defaultGovernance();
    const record = asObject(raw) || {};
    const posture = asObject(record.posture) || {};
    const controlPlane = asObject(record.controlPlane) || {};
    const policy = asObject(record.policy) || {};
    const evidence = asObject(record.evidence) || {};
    const remediation = asObject(record.remediation) || {};
    const runtime = asObject(record.runtime) || {};
    const targetRisk = asString(posture.targetRisk);
    const enforcement = asString(posture.enforcement);
    const approvalRisk = asString(remediation.requireManualApprovalAtRisk);
    const precedence = asString(policy.precedence);
    const overrides = asObject(controlPlane.overrides) || {};
    const repoOverrides = {};
    const rawRepoOverrides = asObject(policy.repositoryPackOverrides) || {};
    for (const [repoId, packs] of Object.entries(rawRepoOverrides)) {
        repoOverrides[slugify(repoId)] = normalizeList(packs);
    }
    return {
        posture: {
            targetRisk: targetRisk === 'low' || targetRisk === 'high' ? targetRisk : defaults.posture.targetRisk,
            enforcement: enforcement === 'advisory' || enforcement === 'balanced' ? enforcement : defaults.posture.enforcement,
            notes: asString(posture.notes),
        },
        controlPlane: {
            inherit: asBoolean(controlPlane.inherit, defaults.controlPlane.inherit),
            overrides: {
                ...(asObject(overrides.runtime) ? { runtime: asObject(overrides.runtime) || {} } : {}),
                ...(asObject(overrides.remediation) ? { remediation: asObject(overrides.remediation) || {} } : {}),
                ...(asObject(overrides.evidence) ? { evidence: asObject(overrides.evidence) || {} } : {}),
                ...(asObject(overrides.eventRuntime) ? { eventRuntime: asObject(overrides.eventRuntime) || {} } : {}),
                ...(asObject(overrides.ciGovernance) ? { ciGovernance: asObject(overrides.ciGovernance) || {} } : {}),
            },
        },
        policy: {
            workspacePacks: normalizeList(policy.workspacePacks),
            repositoryPackOverrides: repoOverrides,
            precedence: precedence === 'repo-first' ? 'repo-first' : defaults.policy.precedence,
        },
        evidence: {
            retentionMaxArtifacts: clampInt(evidence.retentionMaxArtifacts, defaults.evidence.retentionMaxArtifacts, 10, 2000),
            indexLimit: clampInt(evidence.indexLimit, defaults.evidence.indexLimit, 25, 3000),
        },
        remediation: {
            autonomousApplySafe: asBoolean(remediation.autonomousApplySafe, defaults.remediation.autonomousApplySafe),
            requireManualApprovalAtRisk: approvalRisk === 'none' || approvalRisk === 'critical'
                ? approvalRisk
                : defaults.remediation.requireManualApprovalAtRisk,
        },
        runtime: {
            executionRetention: clampInt(runtime.executionRetention, defaults.runtime.executionRetention, 25, 5000),
            eventRetention: clampInt(runtime.eventRetention, defaults.runtime.eventRetention, 500, 100000),
        },
    };
}
function normalizeAccess(raw) {
    const record = asObject(raw) || {};
    const membersRaw = Array.isArray(record.members) ? record.members : [];
    const members = [];
    const seen = new Set();
    for (const entry of membersRaw) {
        const item = asObject(entry);
        if (!item)
            continue;
        const actor = asString(item.actor);
        const role = asString(item.role);
        if (!actor)
            continue;
        const normalizedRole = role === 'workspace_admin' || role === 'governance_admin' || role === 'engineer' || role === 'auditor'
            ? role
            : 'engineer';
        const key = `${actor.toLowerCase()}::${normalizedRole}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        members.push({ actor, role: normalizedRole });
    }
    members.sort((left, right) => left.actor.localeCompare(right.actor));
    const defaultRoleRaw = asString(record.defaultRole);
    const defaultRole = defaultRoleRaw === 'workspace_admin'
        || defaultRoleRaw === 'governance_admin'
        || defaultRoleRaw === 'engineer'
        || defaultRoleRaw === 'auditor'
        ? defaultRoleRaw
        : 'engineer';
    return {
        defaultRole,
        members,
    };
}
function normalizeWorkspaceDefinition(rootDir, raw, fallbackId) {
    const record = asObject(raw) || {};
    const name = asString(record.name) || 'Workspace';
    const id = slugify(asString(record.id) || fallbackId || name);
    const createdAt = asString(record.createdAt) || nowIso();
    const updatedAt = asString(record.updatedAt) || nowIso();
    const repositoriesRaw = Array.isArray(record.repositories) ? record.repositories : [];
    const repositories = repositoriesRaw
        .map((entry, idx) => normalizeRepository(rootDir, (asObject(entry) || {}), `${id}-repo-${idx + 1}`))
        .reduce((acc, repo) => {
        if (acc.some((existing) => existing.id === repo.id))
            return acc;
        acc.push(repo);
        return acc;
    }, [])
        .sort((left, right) => left.name.localeCompare(right.name));
    return {
        schemaVersion: WORKSPACE_SCHEMA,
        id,
        name,
        description: asString(record.description),
        createdAt,
        updatedAt,
        repositories,
        governance: normalizeGovernance(record.governance),
        access: normalizeAccess(record.access),
    };
}
function writeWorkspaceDefinition(paths, workspace) {
    const filePath = workspaceDefinitionFile(paths, workspace.id);
    (0, artifact_io_1.atomicWriteJsonFileSync)(filePath, workspace);
}
function loadWorkspaceDefinition(paths, fileName) {
    const filePath = (0, path_1.join)(paths.workspacesDir, 'definitions', fileName);
    try {
        const parsed = JSON.parse((0, fs_1.readFileSync)(filePath, 'utf-8'));
        const fallbackId = (0, path_1.basename)(fileName, '.json');
        return normalizeWorkspaceDefinition(paths.rootDir, parsed, fallbackId);
    }
    catch {
        return null;
    }
}
function listWorkspaceDefinitionsInternal(paths) {
    const defsDir = (0, path_1.join)(paths.workspacesDir, 'definitions');
    if (!(0, fs_1.existsSync)(defsDir))
        return [];
    const files = (0, fs_1.readdirSync)(defsDir)
        .filter((name) => name.endsWith('.json'))
        .sort((left, right) => left.localeCompare(right));
    const workspaces = [];
    for (const fileName of files) {
        const workspace = loadWorkspaceDefinition(paths, fileName);
        if (!workspace)
            continue;
        workspaces.push(workspace);
    }
    return workspaces;
}
function emitWorkspaceMutationEvent(rootDir, workspace, source, actor, action, payload) {
    const synthetic = (0, execution_bus_1.recordSyntheticExecution)({
        cwd: rootDir,
        type: 'policy-sync',
        source,
        actor,
        status: 'completed',
        success: true,
        message: `${action} workspace ${workspace.id}`,
        payload: {
            action,
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            ...(payload || {}),
        },
        narrative: {
            status: 'success',
            summary: `Workspace ${workspace.name} ${action}`,
            why: 'Workspace runtime orchestration updated deterministically.',
            riskLevel: 'low',
            recommendedAction: 'Run workspace posture to validate cross-repo governance health.',
            expectedImprovement: 'Workspace-level governance state remains inspectable and replayable.',
        },
    });
    try {
        (0, runtime_events_1.emitRuntimeEvent)(rootDir, {
            type: 'governance.config.updated',
            executionId: synthetic.id,
            source,
            actor,
            severity: 'low',
            payload: {
                action: `workspace.${action}`,
                workspaceId: workspace.id,
                workspaceName: workspace.name,
                ...(payload || {}),
            },
        });
    }
    catch {
        // Best-effort event emission only.
    }
    try {
        const paths = toWorkspacePaths(rootDir);
        const index = readWorkspaceIndex(paths);
        (0, replay_runtime_1.writeWorkspaceReplaySnapshot)({
            cwd: rootDir,
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            workspace: JSON.parse(JSON.stringify(workspace)),
            posture: null,
            source,
            actor,
            action: `workspace.${action}`,
            executionId: synthetic.id,
            activeWorkspaceId: index.activeWorkspaceId,
        });
    }
    catch {
        // Snapshot persistence is best-effort.
    }
    return synthetic.id;
}
function cloneRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return JSON.parse(JSON.stringify(value));
}
function mergeRecords(base, patch) {
    const merged = { ...base };
    for (const [key, value] of Object.entries(patch)) {
        if (Array.isArray(value)) {
            merged[key] = [...value];
            continue;
        }
        if (value && typeof value === 'object') {
            const baseValue = merged[key];
            const nextBase = baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue)
                ? baseValue
                : {};
            merged[key] = mergeRecords(nextBase, value);
            continue;
        }
        merged[key] = value;
    }
    return merged;
}
function resolveEffectiveControlPlane(workspace, rootDir) {
    const controlPlane = (0, control_plane_1.readControlPlaneState)(rootDir);
    const overrides = workspace.governance.controlPlane.overrides;
    const inherited = workspace.governance.controlPlane.inherit;
    const overrideKeys = [];
    if (overrides.runtime && Object.keys(overrides.runtime).length > 0)
        overrideKeys.push('runtime');
    if (overrides.remediation && Object.keys(overrides.remediation).length > 0)
        overrideKeys.push('remediation');
    if (overrides.evidence && Object.keys(overrides.evidence).length > 0)
        overrideKeys.push('evidence');
    if (overrides.eventRuntime && Object.keys(overrides.eventRuntime).length > 0)
        overrideKeys.push('eventRuntime');
    if (overrides.ciGovernance && Object.keys(overrides.ciGovernance).length > 0)
        overrideKeys.push('ciGovernance');
    const baseRuntime = cloneRecord(controlPlane.runtime);
    const baseRemediation = cloneRecord(controlPlane.remediation);
    const baseEvidence = cloneRecord(controlPlane.evidence);
    const baseEventRuntime = cloneRecord(controlPlane.eventRuntime);
    const baseCiGovernance = cloneRecord(controlPlane.ciGovernance);
    return {
        inherited,
        overridesApplied: overrideKeys,
        runtime: inherited
            ? mergeRecords(baseRuntime, cloneRecord(overrides.runtime))
            : mergeRecords(baseRuntime, cloneRecord(overrides.runtime)),
        remediation: inherited
            ? mergeRecords(baseRemediation, cloneRecord(overrides.remediation))
            : mergeRecords(baseRemediation, cloneRecord(overrides.remediation)),
        evidence: inherited
            ? mergeRecords(baseEvidence, cloneRecord(overrides.evidence))
            : mergeRecords(baseEvidence, cloneRecord(overrides.evidence)),
        eventRuntime: inherited
            ? mergeRecords(baseEventRuntime, cloneRecord(overrides.eventRuntime))
            : mergeRecords(baseEventRuntime, cloneRecord(overrides.eventRuntime)),
        ciGovernance: inherited
            ? mergeRecords(baseCiGovernance, cloneRecord(overrides.ciGovernance))
            : mergeRecords(baseCiGovernance, cloneRecord(overrides.ciGovernance)),
    };
}
function pruneFilesByLimit(dirPath, filter, limit) {
    if (!(0, fs_1.existsSync)(dirPath))
        return;
    const max = Math.max(1, Math.floor(limit));
    if (max <= 0)
        return;
    const names = (0, fs_1.readdirSync)(dirPath)
        .filter(filter)
        .sort()
        .reverse();
    if (names.length <= max)
        return;
    for (const name of names.slice(max)) {
        try {
            (0, fs_1.unlinkSync)((0, path_1.join)(dirPath, name));
        }
        catch {
            // best effort cleanup
        }
    }
}
function pruneJsonlByLines(filePath, maxLines) {
    if (!(0, fs_1.existsSync)(filePath))
        return;
    const max = Math.max(100, Math.floor(maxLines));
    try {
        const raw = (0, fs_1.readFileSync)(filePath, 'utf-8');
        const lines = raw
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        if (lines.length <= max)
            return;
        const next = `${lines.slice(lines.length - max).join('\n')}\n`;
        (0, artifact_io_1.atomicWriteUtf8FileSync)(filePath, next, { fsync: false });
    }
    catch {
        // best effort cleanup
    }
}
function enforceWorkspaceRetention(workspace, repoRoot) {
    const evidenceLimit = workspace.governance.evidence.retentionMaxArtifacts;
    const executionLimit = workspace.governance.runtime.executionRetention;
    const eventLimit = workspace.governance.runtime.eventRetention;
    pruneFilesByLimit((0, path_1.join)(repoRoot, '.neurcode/evidence'), (name) => name.startsWith('verification-') && name.endsWith('.json'), evidenceLimit);
    pruneFilesByLimit((0, path_1.join)(repoRoot, '.neurcode/executions/records'), (name) => name.startsWith('execution-') && name.endsWith('.json'), executionLimit);
    pruneJsonlByLines((0, path_1.join)(repoRoot, '.neurcode/runtime-events/events.jsonl'), eventLimit);
}
function readLatestJsonLines(pathValue, limit) {
    if (!(0, fs_1.existsSync)(pathValue))
        return [];
    try {
        const raw = (0, fs_1.readFileSync)(pathValue, 'utf-8');
        const lines = raw
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        const slice = lines.slice(Math.max(0, lines.length - limit));
        const parsed = [];
        for (const line of slice) {
            try {
                const value = JSON.parse(line);
                const record = asObject(value);
                if (record)
                    parsed.push(record);
            }
            catch {
                // ignore invalid line
            }
        }
        return parsed;
    }
    catch {
        return [];
    }
}
function evidenceFiles(repoRoot) {
    const dir = (0, path_1.join)(repoRoot, '.neurcode/evidence');
    if (!(0, fs_1.existsSync)(dir))
        return [];
    return (0, fs_1.readdirSync)(dir)
        .filter((name) => name.startsWith('verification-') && name.endsWith('.json'))
        .sort()
        .reverse();
}
function executionFiles(repoRoot) {
    const dir = (0, path_1.join)(repoRoot, '.neurcode/executions/records');
    if (!(0, fs_1.existsSync)(dir))
        return [];
    return (0, fs_1.readdirSync)(dir)
        .filter((name) => name.startsWith('execution-') && name.endsWith('.json'))
        .sort()
        .reverse();
}
function eventFile(repoRoot) {
    return (0, path_1.join)(repoRoot, '.neurcode/runtime-events/events.jsonl');
}
function makeRepoFingerprint(repoRoot, evidenceLimit, executionLimit) {
    const evidenceDir = (0, path_1.join)(repoRoot, '.neurcode/evidence');
    const executionsDir = (0, path_1.join)(repoRoot, '.neurcode/executions/records');
    const eventsPath = eventFile(repoRoot);
    const parts = [repoRoot];
    if ((0, fs_1.existsSync)(evidenceDir)) {
        for (const fileName of evidenceFiles(repoRoot).slice(0, evidenceLimit)) {
            const abs = (0, path_1.join)(evidenceDir, fileName);
            try {
                const stat = (0, fs_1.statSync)(abs);
                parts.push(`e:${fileName}:${stat.size}:${Math.floor(stat.mtimeMs)}`);
            }
            catch {
                // ignore
            }
        }
    }
    if ((0, fs_1.existsSync)(executionsDir)) {
        for (const fileName of executionFiles(repoRoot).slice(0, executionLimit)) {
            const abs = (0, path_1.join)(executionsDir, fileName);
            try {
                const stat = (0, fs_1.statSync)(abs);
                parts.push(`x:${fileName}:${stat.size}:${Math.floor(stat.mtimeMs)}`);
            }
            catch {
                // ignore
            }
        }
    }
    if ((0, fs_1.existsSync)(eventsPath)) {
        try {
            const stat = (0, fs_1.statSync)(eventsPath);
            parts.push(`r:${stat.size}:${Math.floor(stat.mtimeMs)}`);
        }
        catch {
            // ignore
        }
    }
    return (0, crypto_1.createHash)('sha256').update(parts.join('|'), 'utf-8').digest('hex');
}
function computeRiskLevel(score) {
    if (score >= 70)
        return 'high';
    if (score >= 40)
        return 'medium';
    return 'low';
}
function computeRepositoryHealth(workspaceId, repository, workspace, rootDir) {
    const repoRoot = (0, path_1.resolve)(rootDir, repository.rootPath);
    const exists = insideRoot(rootDir, repoRoot) && (0, fs_1.existsSync)(repoRoot);
    const fingerprint = makeRepoFingerprint(repoRoot, workspace.governance.evidence.indexLimit, DEFAULT_EXECUTION_LIMIT);
    const cacheKey = `${workspaceId}:${repository.id}`;
    const cached = repoScanCache.get(cacheKey);
    if (cached && cached.fingerprint === fingerprint) {
        return {
            health: cached.health,
            recentEvents: cached.events,
            eventCounts: cached.eventCounts,
        };
    }
    const policyPacks = new Set(workspace.governance.policy.workspacePacks);
    const overridePacks = workspace.governance.policy.repositoryPackOverrides[repository.id] || [];
    if (workspace.governance.policy.precedence === 'repo-first' && overridePacks.length > 0) {
        for (const pack of overridePacks)
            policyPacks.add(pack);
    }
    let runs = 0;
    let passRuns = 0;
    let failRuns = 0;
    let totalBlocking = 0;
    let totalAdvisory = 0;
    let regressionRuns = 0;
    let coverageAccum = 0;
    let coverageCount = 0;
    let lastRunAt = null;
    const policyCounts = new Map();
    const fileCounts = new Map();
    const directoryCounts = new Map();
    if (exists) {
        const evidenceDir = (0, path_1.join)(repoRoot, '.neurcode/evidence');
        const evidenceNames = evidenceFiles(repoRoot).slice(0, workspace.governance.evidence.indexLimit);
        for (const fileName of evidenceNames) {
            const pathValue = (0, path_1.join)(evidenceDir, fileName);
            try {
                const parsed = JSON.parse((0, fs_1.readFileSync)(pathValue, 'utf-8'));
                const record = asObject(parsed);
                if (!record)
                    continue;
                const timestamp = asString(record.timestamp);
                if (timestamp && (!lastRunAt || Date.parse(timestamp) > Date.parse(lastRunAt))) {
                    lastRunAt = timestamp;
                }
                runs += 1;
                const verdict = (asString(record.verdict) || '').toUpperCase();
                if (verdict === 'PASS') {
                    passRuns += 1;
                }
                else if (verdict === 'FAIL') {
                    failRuns += 1;
                }
                const blocking = clampInt(record.blockingCount, 0, 0, 100000);
                const advisory = clampInt(record.advisoryCount, 0, 0, 100000);
                totalBlocking += blocking;
                totalAdvisory += advisory;
                const regressions = Array.isArray(record.regressions) ? record.regressions : [];
                if (regressions.length > 0)
                    regressionRuns += 1;
                const canonical = asObject(record.canonicalVerifyOutput) || {};
                const coverage = asNumber(canonical.driftScore) ?? asNumber(canonical.score);
                if (coverage !== null) {
                    coverageAccum += Math.max(0, Math.min(100, coverage));
                    coverageCount += 1;
                }
                const policySources = asObject(canonical.policySources);
                const policyMode = asString(policySources?.mode);
                if (policyMode && policyMode !== 'local' && policyMode !== 'merged' && policyMode !== 'org_only') {
                    policyCounts.set(`policy_source:${policyMode}`, (policyCounts.get(`policy_source:${policyMode}`) || 0) + 1);
                }
                const entries = [];
                if (Array.isArray(canonical.violations))
                    entries.push(...canonical.violations);
                if (Array.isArray(canonical.warnings))
                    entries.push(...canonical.warnings);
                if (Array.isArray(canonical.blockingItems))
                    entries.push(...canonical.blockingItems);
                if (Array.isArray(canonical.advisoryItems))
                    entries.push(...canonical.advisoryItems);
                for (const entry of entries) {
                    const item = asObject(entry);
                    if (!item)
                        continue;
                    const policy = asString(item.policy) || asString(item.rule) || 'unknown_policy';
                    const file = asString(item.file) || 'unknown';
                    const normalizedFile = file.replace(/\\/g, '/').replace(/^\/+/, '');
                    const directory = (0, path_1.dirname)(normalizedFile) === '.' ? '/' : (0, path_1.dirname)(normalizedFile);
                    policyCounts.set(policy, (policyCounts.get(policy) || 0) + 1);
                    fileCounts.set(normalizedFile, (fileCounts.get(normalizedFile) || 0) + 1);
                    directoryCounts.set(directory, (directoryCounts.get(directory) || 0) + 1);
                }
            }
            catch {
                // ignore malformed evidence artifact
            }
        }
        if (runs === 0) {
            const recordsDir = (0, path_1.join)(repoRoot, '.neurcode/executions/records');
            const recordNames = executionFiles(repoRoot).slice(0, DEFAULT_EXECUTION_LIMIT);
            for (const fileName of recordNames) {
                const pathValue = (0, path_1.join)(recordsDir, fileName);
                try {
                    const parsed = JSON.parse((0, fs_1.readFileSync)(pathValue, 'utf-8'));
                    const record = asObject(parsed);
                    if (!record)
                        continue;
                    runs += 1;
                    const completedAt = asString(record.completedAt) || asString(record.createdAt);
                    if (completedAt && (!lastRunAt || Date.parse(completedAt) > Date.parse(lastRunAt))) {
                        lastRunAt = completedAt;
                    }
                    const result = asObject(record.result);
                    const success = asBoolean(result?.success, false);
                    if (success)
                        passRuns += 1;
                    else
                        failRuns += 1;
                    const verification = asObject(record.verification);
                    const diff = asObject(verification?.diff);
                    const after = asObject(diff?.after);
                    totalBlocking += clampInt(after?.blocking, 0, 0, 100000);
                    totalAdvisory += clampInt(after?.advisory, 0, 0, 100000);
                    const trend = asString(diff?.trend);
                    if (trend === 'regressed')
                        regressionRuns += 1;
                }
                catch {
                    // ignore malformed execution
                }
            }
        }
    }
    const passRate = runs > 0 ? clampPercent((passRuns / runs) * 100) : 0;
    const blockRate = runs > 0 ? clampPercent((failRuns / runs) * 100) : 0;
    const averageBlocking = runs > 0 ? clampPercent(totalBlocking / runs) : 0;
    const averageAdvisory = runs > 0 ? clampPercent(totalAdvisory / runs) : 0;
    const regressionRate = runs > 0 ? clampPercent((regressionRuns / runs) * 100) : 0;
    const coverageScore = coverageCount > 0 ? clampPercent(coverageAccum / coverageCount) : null;
    const policyDrift = workspace.governance.policy.workspacePacks.length > 0
        && overridePacks.length > 0
        && !overridePacks.every((pack) => workspace.governance.policy.workspacePacks.includes(pack));
    let riskScore = (blockRate * 0.55)
        + (regressionRate * 0.5)
        + (averageBlocking * 4.8)
        + (averageAdvisory * 1.3)
        + (runs < 3 ? 8 : 0)
        + (policyDrift ? 10 : 0);
    if (workspace.governance.posture.enforcement === 'advisory') {
        riskScore *= 0.9;
    }
    else if (workspace.governance.posture.enforcement === 'strict') {
        riskScore *= 1.05;
    }
    const boundedRisk = clampPercent(Math.max(0, Math.min(100, riskScore)));
    const riskLevel = computeRiskLevel(boundedRisk);
    const status = !exists
        ? 'unknown'
        : riskLevel === 'high'
            ? 'critical'
            : riskLevel === 'medium'
                ? 'degraded'
                : 'healthy';
    const topPolicies = [...policyCounts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5)
        .map(([policy, occurrences]) => ({ policy, occurrences }));
    const topFiles = [...fileCounts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5)
        .map(([file, occurrences]) => ({ file, occurrences }));
    const health = {
        workspaceId,
        repositoryId: repository.id,
        repositoryName: repository.name,
        rootPath: repository.rootPath,
        exists,
        status,
        riskLevel,
        riskScore: boundedRisk,
        runs,
        passRate,
        blockRate,
        averageBlocking,
        averageAdvisory,
        regressionRate,
        coverageScore,
        lastRunAt,
        policyDrift,
        topPolicies,
        topFiles,
        services: repository.services,
        policyDomain: repository.policyDomain,
    };
    const eventCounts = {};
    const recentEvents = [];
    if (exists) {
        const events = readLatestJsonLines(eventFile(repoRoot), DEFAULT_EVENT_LIMIT);
        for (const event of events) {
            const type = asString(event.type) || 'unknown';
            eventCounts[type] = (eventCounts[type] || 0) + 1;
            const timestamp = asString(event.timestamp) || nowIso();
            const cursor = asString(event.cursor) || `${Date.parse(timestamp) || Date.now()}:${asString(event.id) || ''}`;
            recentEvents.push({
                cursor,
                type,
                timestamp,
                source: asString(event.source) || 'unknown',
                actor: asString(event.actor) || 'unknown',
                severity: asString(event.severity) || 'low',
                executionId: asString(event.executionId) || 'unknown',
                repositoryId: repository.id,
                repositoryName: repository.name,
            });
        }
        recentEvents.sort((left, right) => {
            const leftMs = Date.parse(left.timestamp);
            const rightMs = Date.parse(right.timestamp);
            return rightMs - leftMs;
        });
    }
    repoScanCache.set(cacheKey, {
        fingerprint,
        health,
        events: recentEvents,
        eventCounts,
    });
    return { health, recentEvents, eventCounts };
}
function aggregateHotspots(rows) {
    const fileMap = new Map();
    const policyMap = new Map();
    const dirMap = new Map();
    for (const row of rows) {
        for (const item of row.topFiles) {
            const current = fileMap.get(item.file) || { occurrences: 0, repositories: new Set(), score: 0 };
            current.occurrences += item.occurrences;
            current.repositories.add(row.repositoryId);
            current.score += item.occurrences * (row.riskScore / 100);
            fileMap.set(item.file, current);
            const directory = (0, path_1.dirname)(item.file) === '.' ? '/' : (0, path_1.dirname)(item.file);
            const dirCurrent = dirMap.get(directory) || { occurrences: 0, repositories: new Set(), score: 0 };
            dirCurrent.occurrences += item.occurrences;
            dirCurrent.repositories.add(row.repositoryId);
            dirCurrent.score += item.occurrences * (row.riskScore / 100);
            dirMap.set(directory, dirCurrent);
        }
        for (const item of row.topPolicies) {
            const current = policyMap.get(item.policy) || { occurrences: 0, repositories: new Set(), score: 0 };
            current.occurrences += item.occurrences;
            current.repositories.add(row.repositoryId);
            current.score += item.occurrences * (row.riskScore / 100);
            policyMap.set(item.policy, current);
        }
    }
    const toHotspots = (source, kind) => {
        return [...source.entries()]
            .map(([key, value]) => ({
            key,
            kind,
            score: clampPercent(value.score),
            occurrences: value.occurrences,
            repositoryCount: value.repositories.size,
        }))
            .sort((left, right) => right.score - left.score)
            .slice(0, 15);
    };
    return {
        files: toHotspots(fileMap, 'file'),
        policies: toHotspots(policyMap, 'policy'),
        directories: toHotspots(dirMap, 'directory'),
    };
}
function summarizePosture(workspace, rows) {
    const repositoryCount = rows.length;
    const healthyRepositories = rows.filter((row) => row.status === 'healthy').length;
    const degradedRepositories = rows.filter((row) => row.status === 'degraded').length;
    const criticalRepositories = rows.filter((row) => row.status === 'critical').length;
    const combinedRuns = rows.reduce((sum, row) => sum + row.runs, 0);
    const passRate = repositoryCount > 0
        ? clampPercent(rows.reduce((sum, row) => sum + row.passRate, 0) / repositoryCount)
        : 0;
    const blockRate = repositoryCount > 0
        ? clampPercent(rows.reduce((sum, row) => sum + row.blockRate, 0) / repositoryCount)
        : 0;
    const overallRiskScore = repositoryCount > 0
        ? clampPercent(rows.reduce((sum, row) => sum + row.riskScore, 0) / repositoryCount)
        : 0;
    const overallRiskLevel = computeRiskLevel(overallRiskScore);
    const coverageRows = rows.filter((row) => typeof row.coverageScore === 'number');
    const averageCoverageScore = coverageRows.length > 0
        ? clampPercent(coverageRows.reduce((sum, row) => sum + (row.coverageScore || 0), 0) / coverageRows.length)
        : null;
    const regressionConcentration = [...rows]
        .sort((left, right) => right.regressionRate - left.regressionRate)
        .slice(0, 5)
        .map((row) => ({
        repositoryId: row.repositoryId,
        repositoryName: row.repositoryName,
        regressionRate: row.regressionRate,
    }));
    const serviceScores = new Map();
    for (const row of rows) {
        for (const service of row.services) {
            serviceScores.set(service, (serviceScores.get(service) || 0) + row.riskScore);
        }
    }
    const unstableServices = [...serviceScores.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8)
        .map(([service]) => service);
    return {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        repositoryCount,
        healthyRepositories,
        degradedRepositories,
        criticalRepositories,
        overallRiskLevel,
        overallRiskScore,
        passRate,
        blockRate,
        averageCoverageScore,
        regressionConcentration,
        policyDriftRepositories: rows.filter((row) => row.policyDrift).length,
        unstableServices,
    };
}
function resolveActiveWorkspaceInternal(paths, workspaces) {
    const index = readWorkspaceIndex(paths);
    if (index.activeWorkspaceId) {
        const found = workspaces.find((workspace) => workspace.id === index.activeWorkspaceId);
        if (found)
            return found;
    }
    if (workspaces.length > 0) {
        return workspaces[0];
    }
    return null;
}
function actorRoleForWorkspace(workspace, actor) {
    if (!workspace)
        return 'workspace_admin';
    if (!actor)
        return workspace.access.defaultRole;
    const found = workspace.access.members.find((member) => member.actor.toLowerCase() === actor.toLowerCase());
    return found ? found.role : workspace.access.defaultRole;
}
function listWorkspaces(cwd = process.cwd()) {
    const rootDir = resolveWorkspaceRoot(cwd);
    const paths = toWorkspacePaths(rootDir);
    const workspaces = listWorkspaceDefinitionsInternal(paths);
    return workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        updatedAt: workspace.updatedAt,
        repositoryCount: workspace.repositories.length,
        enabledRepositoryCount: workspace.repositories.filter((repo) => repo.enabled).length,
        posture: workspace.governance.posture,
    }));
}
function getWorkspaceById(workspaceId, cwd = process.cwd()) {
    const rootDir = resolveWorkspaceRoot(cwd);
    const paths = toWorkspacePaths(rootDir);
    const workspaces = listWorkspaceDefinitionsInternal(paths);
    return workspaces.find((workspace) => workspace.id === workspaceId) || null;
}
function getActiveWorkspace(cwd = process.cwd()) {
    const rootDir = resolveWorkspaceRoot(cwd);
    const paths = toWorkspacePaths(rootDir);
    const workspaces = listWorkspaceDefinitionsInternal(paths);
    return resolveActiveWorkspaceInternal(paths, workspaces);
}
function createWorkspace(input, options) {
    const rootDir = resolveWorkspaceRoot(options?.cwd || process.cwd());
    const paths = toWorkspacePaths(rootDir);
    const existing = listWorkspaceDefinitionsInternal(paths);
    const requestedId = asString(input.id) || `${slugify(input.name)}-${(0, crypto_1.createHash)('sha256').update(`${input.name}:${Date.now()}`).digest('hex').slice(0, 6)}`;
    const workspaceId = slugify(requestedId);
    if (existing.some((workspace) => workspace.id === workspaceId)) {
        throw new Error(`Workspace already exists: ${workspaceId}`);
    }
    const repositories = Array.isArray(input.repositories) && input.repositories.length > 0
        ? input.repositories.map((repo) => ({ ...repo }))
        : [
            {
                name: (0, path_1.basename)(rootDir),
                rootPath: '.',
                enabled: true,
            },
        ];
    const seed = {
        schemaVersion: WORKSPACE_SCHEMA,
        id: workspaceId,
        name: input.name,
        description: input.description || null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        repositories,
        governance: input.governance || defaultGovernance(),
        access: input.access || { defaultRole: 'workspace_admin', members: [] },
    };
    const workspace = normalizeWorkspaceDefinition(rootDir, seed, workspaceId);
    writeWorkspaceDefinition(paths, workspace);
    const setActive = options?.setActive !== false;
    if (setActive) {
        writeWorkspaceIndex(paths, {
            schemaVersion: WORKSPACE_INDEX_SCHEMA,
            activeWorkspaceId: workspace.id,
            updatedAt: nowIso(),
        });
    }
    const source = options?.source || 'cli';
    const actor = options?.actor || 'workspace-admin';
    const executionId = emitWorkspaceMutationEvent(rootDir, workspace, source, actor, 'created', {
        setActive,
    });
    return { workspace, executionId };
}
function setActiveWorkspace(workspaceId, options) {
    const rootDir = resolveWorkspaceRoot(options?.cwd || process.cwd());
    const paths = toWorkspacePaths(rootDir);
    const workspaces = listWorkspaceDefinitionsInternal(paths);
    const workspace = workspaces.find((item) => item.id === workspaceId);
    if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
    }
    writeWorkspaceIndex(paths, {
        schemaVersion: WORKSPACE_INDEX_SCHEMA,
        activeWorkspaceId: workspace.id,
        updatedAt: nowIso(),
    });
    const source = options?.source || 'cli';
    const actor = options?.actor || 'workspace-admin';
    const executionId = emitWorkspaceMutationEvent(rootDir, workspace, source, actor, 'activated');
    return { workspace, executionId };
}
function addWorkspaceRepository(workspaceId, input, options) {
    const rootDir = resolveWorkspaceRoot(options?.cwd || process.cwd());
    const paths = toWorkspacePaths(rootDir);
    const workspaces = listWorkspaceDefinitionsInternal(paths);
    const target = workspaces.find((item) => item.id === workspaceId);
    if (!target) {
        throw new Error(`Workspace not found: ${workspaceId}`);
    }
    const repo = normalizeRepository(rootDir, {
        id: input.id,
        name: input.name,
        rootPath: input.rootPath,
        services: input.services,
        policyDomain: input.policyDomain,
        tags: input.tags,
        enabled: input.enabled,
    }, `${workspaceId}-repo-${target.repositories.length + 1}`);
    if (target.repositories.some((existing) => existing.id === repo.id)) {
        throw new Error(`Repository already exists in workspace: ${repo.id}`);
    }
    target.repositories = [...target.repositories, repo].sort((left, right) => left.name.localeCompare(right.name));
    target.updatedAt = nowIso();
    writeWorkspaceDefinition(paths, normalizeWorkspaceDefinition(rootDir, target, target.id));
    const source = options?.source || 'cli';
    const actor = options?.actor || 'workspace-admin';
    const executionId = emitWorkspaceMutationEvent(rootDir, target, source, actor, 'repository-added', {
        repositoryId: repo.id,
        repositoryName: repo.name,
        repositoryPath: repo.rootPath,
    });
    return {
        workspace: target,
        executionId,
    };
}
function updateWorkspace(workspaceId, patch, options) {
    const rootDir = resolveWorkspaceRoot(options?.cwd || process.cwd());
    const paths = toWorkspacePaths(rootDir);
    const workspaces = listWorkspaceDefinitionsInternal(paths);
    const target = workspaces.find((item) => item.id === workspaceId);
    if (!target) {
        throw new Error(`Workspace not found: ${workspaceId}`);
    }
    const merged = {
        ...target,
        ...(patch.name ? { name: patch.name } : {}),
        ...(typeof patch.description !== 'undefined' ? { description: patch.description } : {}),
        ...(patch.repositories ? { repositories: patch.repositories } : {}),
        ...(patch.governance ? { governance: patch.governance } : {}),
        ...(patch.access ? { access: patch.access } : {}),
        updatedAt: nowIso(),
    };
    const workspace = normalizeWorkspaceDefinition(rootDir, merged, workspaceId);
    writeWorkspaceDefinition(paths, workspace);
    const source = options?.source || 'cli';
    const actor = options?.actor || 'workspace-admin';
    const executionId = emitWorkspaceMutationEvent(rootDir, workspace, source, actor, 'updated');
    return {
        workspace,
        executionId,
    };
}
function getWorkspaceRuntimeSnapshot(options) {
    const rootDir = resolveWorkspaceRoot(options?.cwd || process.cwd());
    const paths = toWorkspacePaths(rootDir);
    const workspaces = listWorkspaceDefinitionsInternal(paths);
    const requested = options?.workspaceId ? workspaces.find((workspace) => workspace.id === options.workspaceId) || null : null;
    const active = requested || resolveActiveWorkspaceInternal(paths, workspaces);
    const role = actorRoleForWorkspace(active, options?.actor || null);
    const summaries = workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        updatedAt: workspace.updatedAt,
        repositoryCount: workspace.repositories.length,
        enabledRepositoryCount: workspace.repositories.filter((repo) => repo.enabled).length,
        posture: workspace.governance.posture,
    }));
    if (!active) {
        return {
            schemaVersion: WORKSPACE_RUNTIME_SCHEMA,
            generatedAt: nowIso(),
            rootDir,
            activeWorkspaceId: null,
            activeWorkspaceRole: role,
            workspaces: summaries,
            workspace: null,
            effectiveControlPlane: null,
            repositoryHealthMatrix: [],
            hotspots: {
                files: [],
                policies: [],
                directories: [],
            },
            runtimeActivity: {
                eventCounts: {},
                recentEvents: [],
            },
            posture: null,
        };
    }
    const rows = [];
    const allEvents = [];
    const eventCounts = {};
    const repositories = active.repositories
        .filter((repo) => repo.enabled)
        .sort((left, right) => left.name.localeCompare(right.name));
    for (const repository of repositories) {
        const repoRoot = (0, path_1.resolve)(rootDir, repository.rootPath);
        if (insideRoot(rootDir, repoRoot) && (0, fs_1.existsSync)(repoRoot)) {
            enforceWorkspaceRetention(active, repoRoot);
        }
        const scan = computeRepositoryHealth(active.id, repository, active, rootDir);
        rows.push(scan.health);
        allEvents.push(...scan.recentEvents.slice(0, 40));
        for (const [eventType, count] of Object.entries(scan.eventCounts)) {
            eventCounts[eventType] = (eventCounts[eventType] || 0) + count;
        }
    }
    allEvents.sort((left, right) => {
        const leftMs = Date.parse(left.timestamp);
        const rightMs = Date.parse(right.timestamp);
        return rightMs - leftMs;
    });
    const hotspots = aggregateHotspots(rows);
    const posture = summarizePosture(active, rows);
    return {
        schemaVersion: WORKSPACE_RUNTIME_SCHEMA,
        generatedAt: nowIso(),
        rootDir,
        activeWorkspaceId: active.id,
        activeWorkspaceRole: role,
        workspaces: summaries,
        workspace: active,
        effectiveControlPlane: resolveEffectiveControlPlane(active, rootDir),
        repositoryHealthMatrix: rows,
        hotspots,
        runtimeActivity: {
            eventCounts,
            recentEvents: allEvents.slice(0, 60),
        },
        posture,
    };
}
function captureWorkspaceReplayAttestation(options) {
    const rootDir = resolveWorkspaceRoot(options?.cwd || process.cwd());
    const active = getActiveWorkspace(rootDir);
    if (!active) {
        return {
            required: false,
            snapshotId: null,
            snapshotPath: null,
            workspaceId: null,
        };
    }
    const snapshot = getWorkspaceRuntimeSnapshot({
        cwd: rootDir,
        workspaceId: active.id,
        actor: options?.actor || null,
    });
    const written = (0, replay_runtime_1.writeWorkspaceReplaySnapshot)({
        cwd: rootDir,
        workspaceId: active.id,
        workspaceName: active.name,
        workspace: JSON.parse(JSON.stringify(active)),
        posture: snapshot.posture ? JSON.parse(JSON.stringify(snapshot.posture)) : null,
        source: options?.source || 'unknown',
        actor: options?.actor || 'workspace-attestor',
        action: options?.action || 'verify.attestation',
        executionId: options?.executionId || null,
        activeWorkspaceId: snapshot.activeWorkspaceId,
    });
    return {
        required: true,
        snapshotId: written.snapshotId,
        snapshotPath: written.snapshotPath,
        workspaceId: active.id,
    };
}
function selectWorkspaceRepositories(workspace, repositoryIds) {
    const enabled = workspace.repositories.filter((repo) => repo.enabled);
    if (!repositoryIds || repositoryIds.length === 0) {
        return [...enabled].sort((left, right) => left.name.localeCompare(right.name));
    }
    const target = new Set(repositoryIds.map((id) => slugify(id)));
    return enabled
        .filter((repo) => target.has(repo.id))
        .sort((left, right) => left.name.localeCompare(right.name));
}
async function executeWorkspaceAction(request, options) {
    const rootDir = resolveWorkspaceRoot(options?.cwd || process.cwd());
    const paths = toWorkspacePaths(rootDir);
    const workspaces = listWorkspaceDefinitionsInternal(paths);
    const active = request.workspaceId
        ? workspaces.find((workspace) => workspace.id === request.workspaceId) || null
        : resolveActiveWorkspaceInternal(paths, workspaces);
    if (!active) {
        throw new Error('No active workspace configured. Create or activate a workspace first.');
    }
    const repositories = selectWorkspaceRepositories(active, request.repositoryIds);
    const source = request.source || 'cli';
    const actor = request.actor || 'workspace-admin';
    const startedAt = nowIso();
    const effectiveControlPlane = resolveEffectiveControlPlane(active, rootDir);
    const executionClass = (0, execution_actions_1.getExecutionActionClass)(request.type);
    const runtimeConfig = asObject(effectiveControlPlane?.runtime) || {};
    const evidenceConfig = asObject(effectiveControlPlane?.evidence) || {};
    const executionConfig = asObject(runtimeConfig.execution) || {};
    const verificationConfig = asObject(runtimeConfig.verification) || {};
    const evidenceCollection = asObject(evidenceConfig.collection) || {};
    const workspaceDedupeWindow = asNumber(executionConfig.dedupeWindowMs);
    const workspaceCiMode = asBoolean(verificationConfig.deterministicOnlyInCi, true);
    const workspaceEvidenceDir = asString(evidenceCollection.directory);
    const compatibilityMutationAllowed = active.governance.remediation.autonomousApplySafe === true;
    const items = [];
    let succeeded = 0;
    let failed = 0;
    for (const repository of repositories) {
        if ((0, execution_actions_1.isCompatibilityExecutionActionType)(request.type) && !compatibilityMutationAllowed) {
            failed += 1;
            items.push({
                repositoryId: repository.id,
                repositoryName: repository.name,
                rootPath: repository.rootPath,
                ok: false,
                execution: null,
                primaryPayload: null,
                verificationPayload: null,
                error: `Workspace remediation policy blocks compatibility mutation action "${request.type}". Use the canonical verify/remediate-export flow or enable governance.remediation.autonomousApplySafe explicitly.`,
            });
            continue;
        }
        const repoRoot = (0, path_1.resolve)(rootDir, repository.rootPath);
        if (!insideRoot(rootDir, repoRoot) || !(0, fs_1.existsSync)(repoRoot)) {
            failed += 1;
            items.push({
                repositoryId: repository.id,
                repositoryName: repository.name,
                rootPath: repository.rootPath,
                ok: false,
                execution: null,
                primaryPayload: null,
                verificationPayload: null,
                error: 'Repository path missing or outside workspace root',
            });
            continue;
        }
        enforceWorkspaceRetention(active, repoRoot);
        try {
            const run = await (0, execution_bus_1.runExecution)({
                type: request.type,
                source,
                actor,
                target: request.target || null,
                intentText: request.intentText || null,
                reverify: request.reverify,
                ciMode: typeof request.ciMode === 'boolean' ? request.ciMode : workspaceCiMode,
                evidenceDir: request.evidenceDir || workspaceEvidenceDir || undefined,
                dedupeWindowMs: typeof request.dedupeWindowMs === 'number' ? request.dedupeWindowMs : workspaceDedupeWindow ?? undefined,
                cwd: repoRoot,
            });
            const ok = run.execution.result?.success === true;
            if (ok)
                succeeded += 1;
            else
                failed += 1;
            items.push({
                repositoryId: repository.id,
                repositoryName: repository.name,
                rootPath: repository.rootPath,
                ok,
                execution: run.execution,
                primaryPayload: run.primaryPayload,
                verificationPayload: run.verificationPayload,
                error: ok ? null : run.execution.result?.message || 'Workspace execution failed',
            });
        }
        catch (error) {
            failed += 1;
            const message = error instanceof Error ? error.message : String(error);
            items.push({
                repositoryId: repository.id,
                repositoryName: repository.name,
                rootPath: repository.rootPath,
                ok: false,
                execution: null,
                primaryPayload: null,
                verificationPayload: null,
                error: message,
            });
        }
        finally {
            enforceWorkspaceRetention(active, repoRoot);
        }
    }
    const completedAt = nowIso();
    const synthetic = (0, execution_bus_1.recordSyntheticExecution)({
        cwd: rootDir,
        type: request.type,
        source,
        actor,
        status: failed > 0 ? 'failed' : 'completed',
        success: failed === 0,
        message: `Workspace action ${request.type} across ${repositories.length} repos`,
        payload: {
            action: 'workspace.execute',
            workspaceId: active.id,
            workspaceName: active.name,
            executionType: request.type,
            executionClass,
            compatibilityMutationAllowed,
            totals: {
                repositories: repositories.length,
                attempted: items.length,
                succeeded,
                failed,
            },
            repositories: items.map((item) => ({
                repositoryId: item.repositoryId,
                repositoryName: item.repositoryName,
                ok: item.ok,
                executionId: item.execution?.id || null,
                error: item.error,
            })),
        },
        verification: {
            verdict: failed > 0 ? 'WARN' : 'PASS',
            counts: {
                blocking: failed,
                advisory: Math.max(0, items.length - succeeded),
            },
        },
        narrative: {
            status: failed > 0 ? 'warning' : 'success',
            summary: `Workspace execution ${request.type} ${failed > 0 ? 'completed with failures' : 'completed successfully'}`,
            why: `Applied deterministic ${request.type} orchestration across ${repositories.length} repositories.`,
            riskLevel: failed > 0 ? 'high' : executionClass === 'compatibility-mutation' ? 'medium' : 'low',
            recommendedAction: failed > 0
                ? 'Review failed repositories in workspace execution output and rerun targeted remediation.'
                : 'Review workspace posture to confirm cross-repo risk reduction.',
            expectedImprovement: 'Workspace execution history now includes cross-repo governance runs with provenance.',
        },
    });
    try {
        (0, runtime_events_1.emitRuntimeEvent)(rootDir, {
            type: failed > 0 ? 'execution.failed' : 'execution.completed',
            executionId: synthetic.id,
            source,
            actor,
            severity: failed > 0 ? 'high' : 'low',
            payload: {
                action: 'workspace.execute',
                workspaceId: active.id,
                workspaceName: active.name,
                executionType: request.type,
                executionClass,
                repositories: repositories.length,
                succeeded,
                failed,
            },
        });
    }
    catch {
        // best-effort
    }
    try {
        const paths = toWorkspacePaths(rootDir);
        const index = readWorkspaceIndex(paths);
        (0, replay_runtime_1.writeWorkspaceReplaySnapshot)({
            cwd: rootDir,
            workspaceId: active.id,
            workspaceName: active.name,
            workspace: JSON.parse(JSON.stringify(active)),
            posture: {
                totals: {
                    repositories: repositories.length,
                    attempted: items.length,
                    succeeded,
                    failed,
                },
                executionType: request.type,
                executionClass,
                startedAt,
                completedAt,
            },
            source,
            actor,
            action: 'workspace.execute',
            executionId: synthetic.id,
            activeWorkspaceId: index.activeWorkspaceId,
        });
    }
    catch {
        // Snapshot persistence is best-effort.
    }
    return {
        workspaceId: active.id,
        workspaceName: active.name,
        executionId: synthetic.id,
        source,
        actor,
        type: request.type,
        startedAt,
        completedAt,
        totals: {
            repositories: repositories.length,
            attempted: items.length,
            succeeded,
            failed,
        },
        items,
    };
}
//# sourceMappingURL=workspace-runtime.js.map