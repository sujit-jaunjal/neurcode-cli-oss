"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readControlPlaneState = readControlPlaneState;
exports.previewControlPlaneUpdate = previewControlPlaneUpdate;
exports.applyControlPlaneUpdate = applyControlPlaneUpdate;
exports.readControlPlaneSnapshotHistory = readControlPlaneSnapshotHistory;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const policy_governance_1 = require("./policy-governance");
const secret_masking_1 = require("./secret-masking");
const execution_bus_1 = require("./execution-bus");
const runtime_events_1 = require("./runtime-events");
const CONTROL_PLANE_SCHEMA = 'neurcode.control-plane.v1';
const CONTROL_PLANE_SNAPSHOT_SCHEMA = 'neurcode.control-plane.snapshot.v1';
const RUNTIME_SCHEMA = 'neurcode.control-plane.runtime.v1';
const REMEDIATION_SCHEMA = 'neurcode.control-plane.remediation.v1';
const EVIDENCE_SCHEMA = 'neurcode.control-plane.evidence.v1';
const EVENT_RUNTIME_SCHEMA = 'neurcode.control-plane.event-runtime.v1';
const CI_GOVERNANCE_SCHEMA = 'neurcode.control-plane.ci-governance.v1';
const DEFAULT_CONTROL_PLANE_ROOT = '.neurcode/control-plane';
const DEFAULT_SNAPSHOT_RETENTION = 120;
function nowIso() {
    return new Date().toISOString();
}
function clampInt(value, fallback, min, max) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(min, Math.min(max, Math.floor(value)));
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number.parseInt(value.trim(), 10);
        if (Number.isFinite(parsed)) {
            return Math.max(min, Math.min(max, Math.floor(parsed)));
        }
    }
    return fallback;
}
function asBoolean(value, fallback) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1')
            return true;
        if (normalized === 'false' || normalized === '0')
            return false;
    }
    return fallback;
}
function asObject(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }
    return {};
}
function asString(value, fallback) {
    if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
    }
    return fallback;
}
function normalizeRelativePath(value, fallback) {
    const candidate = asString(value, fallback).replace(/\\/g, '/');
    if (candidate.startsWith('/') || /^[A-Za-z]:\//.test(candidate) || candidate.includes('..')) {
        return fallback;
    }
    return candidate;
}
function normalizeList(values) {
    if (!Array.isArray(values))
        return [];
    return Array.from(new Set(values
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean))).sort((left, right) => left.localeCompare(right));
}
function normalizeRuntimeConfig(raw) {
    const source = asObject(raw);
    const execution = asObject(source.execution);
    const verification = asObject(source.verification);
    const retention = asObject(source.retention);
    return {
        schemaVersion: RUNTIME_SCHEMA,
        execution: {
            duplicateSuppression: asBoolean(execution.duplicateSuppression, false),
            dedupeWindowMs: clampInt(execution.dedupeWindowMs, 0, 0, 60_000),
            maxConcurrentExecutions: clampInt(execution.maxConcurrentExecutions, 1, 1, 12),
            replayEnabled: asBoolean(execution.replayEnabled, true),
            lockTimeoutMs: clampInt(execution.lockTimeoutMs, 90_000, 10_000, 300_000),
        },
        verification: {
            autoReverify: asBoolean(verification.autoReverify, true),
            deterministicOnlyInCi: asBoolean(verification.deterministicOnlyInCi, true),
            allowPolicyOnlyFallback: asBoolean(verification.allowPolicyOnlyFallback, true),
            ciEnforcement: verification.ciEnforcement === 'advisory' ? 'advisory' : 'strict',
        },
        retention: {
            executionRecords: clampInt(retention.executionRecords, 250, 25, 5000),
        },
    };
}
function normalizeRemediationConfig(raw) {
    const source = asObject(raw);
    const automation = asObject(source.automation);
    const safety = asObject(source.safety);
    const manualApproval = asString(automation.requireManualApprovalAtRisk, 'high').toLowerCase();
    return {
        schemaVersion: REMEDIATION_SCHEMA,
        automation: {
            autonomousApplySafe: asBoolean(automation.autonomousApplySafe, true),
            maxAutoPatchesPerExecution: clampInt(automation.maxAutoPatchesPerExecution, 5, 1, 200),
            requireManualApprovalAtRisk: manualApproval === 'none' || manualApproval === 'critical' ? manualApproval : 'high',
        },
        safety: {
            rollbackOnRegression: asBoolean(safety.rollbackOnRegression, true),
            requireCleanWorkingTree: asBoolean(safety.requireCleanWorkingTree, true),
        },
    };
}
function normalizeEvidenceConfig(raw) {
    const source = asObject(raw);
    const collection = asObject(source.collection);
    const redaction = asObject(source.redaction);
    return {
        schemaVersion: EVIDENCE_SCHEMA,
        collection: {
            enabledByDefault: asBoolean(collection.enabledByDefault, false),
            directory: normalizeRelativePath(collection.directory, '.neurcode/evidence'),
            retentionMaxArtifacts: clampInt(collection.retentionMaxArtifacts, 50, 10, 2000),
        },
        redaction: {
            maskSecrets: asBoolean(redaction.maskSecrets, true),
            maskSensitivePaths: asBoolean(redaction.maskSensitivePaths, true),
        },
    };
}
function normalizeEventRuntimeConfig(raw) {
    const source = asObject(raw);
    const stream = asObject(source.stream);
    const retention = asObject(source.retention);
    return {
        schemaVersion: EVENT_RUNTIME_SCHEMA,
        stream: {
            enabled: asBoolean(stream.enabled, true),
            transport: 'sse',
            heartbeatMs: clampInt(stream.heartbeatMs, 15_000, 5_000, 120_000),
            replayBatchSize: clampInt(stream.replayBatchSize, 200, 20, 1000),
        },
        retention: {
            maxEvents: clampInt(retention.maxEvents, 5000, 500, 100_000),
        },
    };
}
function normalizeCiGovernanceConfig(raw) {
    const source = asObject(raw);
    const mode = asObject(source.mode);
    const enforcement = asObject(source.enforcement);
    return {
        schemaVersion: CI_GOVERNANCE_SCHEMA,
        mode: {
            verifyCiMode: asBoolean(mode.verifyCiMode, true),
            deterministicOnly: asBoolean(mode.deterministicOnly, true),
            nonInteractiveOnly: asBoolean(mode.nonInteractiveOnly, true),
        },
        enforcement: {
            strictness: enforcement.strictness === 'advisory' ? 'advisory' : 'strict',
            allowMissingIntent: asBoolean(enforcement.allowMissingIntent, true),
            allowMissingLocalRuntimeState: asBoolean(enforcement.allowMissingLocalRuntimeState, true),
            requireDeterministicArtifacts: asBoolean(enforcement.requireDeterministicArtifacts, true),
        },
    };
}
function toPaths(cwd) {
    const rootDir = (0, path_1.resolve)(cwd, DEFAULT_CONTROL_PLANE_ROOT);
    const snapshotsDir = (0, path_1.join)(rootDir, 'snapshots');
    (0, fs_1.mkdirSync)(rootDir, { recursive: true });
    (0, fs_1.mkdirSync)(snapshotsDir, { recursive: true });
    return {
        rootDir,
        runtimePath: (0, path_1.join)(rootDir, 'runtime.json'),
        remediationPath: (0, path_1.join)(rootDir, 'remediation.json'),
        evidencePath: (0, path_1.join)(rootDir, 'evidence.json'),
        eventRuntimePath: (0, path_1.join)(rootDir, 'event-runtime.json'),
        ciGovernancePath: (0, path_1.join)(rootDir, 'ci-governance.json'),
        snapshotsDir,
    };
}
function readJsonFile(pathValue) {
    if (!(0, fs_1.existsSync)(pathValue))
        return {};
    try {
        const parsed = JSON.parse((0, fs_1.readFileSync)(pathValue, 'utf-8'));
        return asObject(parsed);
    }
    catch {
        return {};
    }
}
function hashPayload(value) {
    const normalized = JSON.stringify(sortObject(value));
    return (0, crypto_1.createHash)('sha256').update(normalized, 'utf-8').digest('hex');
}
function sortObject(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => sortObject(entry));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    const source = value;
    const sorted = {};
    for (const key of Object.keys(source).sort((left, right) => left.localeCompare(right))) {
        sorted[key] = sortObject(source[key]);
    }
    return sorted;
}
function flattenKeys(value, prefix = '') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return prefix ? [prefix] : [];
    }
    const source = value;
    const keys = [];
    for (const key of Object.keys(source).sort((left, right) => left.localeCompare(right))) {
        const nextPrefix = prefix ? `${prefix}.${key}` : key;
        const nested = flattenKeys(source[key], nextPrefix);
        if (nested.length === 0) {
            keys.push(nextPrefix);
        }
        else {
            keys.push(...nested);
        }
    }
    return keys;
}
function parseSnapshotRetention() {
    const env = process.env.NEURCODE_CONTROL_PLANE_SNAPSHOT_RETENTION;
    if (!env)
        return DEFAULT_SNAPSHOT_RETENTION;
    const parsed = Number.parseInt(env, 10);
    if (!Number.isFinite(parsed) || parsed < 1)
        return DEFAULT_SNAPSHOT_RETENTION;
    return Math.max(10, Math.min(2000, parsed));
}
function listSnapshots(paths) {
    if (!(0, fs_1.existsSync)(paths.snapshotsDir))
        return [];
    return (0, fs_1.readdirSync)(paths.snapshotsDir)
        .filter((name) => name.startsWith('snapshot-') && name.endsWith('.json'))
        .sort();
}
function pruneSnapshots(paths, keepLatest) {
    const entries = listSnapshots(paths);
    if (entries.length <= keepLatest)
        return;
    const toDelete = entries.slice(0, entries.length - keepLatest);
    for (const fileName of toDelete) {
        (0, fs_1.rmSync)((0, path_1.join)(paths.snapshotsDir, fileName), { force: true });
    }
}
function sanitizeForSnapshot(value) {
    if (value === null || typeof value === 'undefined')
        return value;
    if (typeof value === 'string') {
        const masked = (0, secret_masking_1.maskSecretsInText)(value).masked;
        if (masked.startsWith('/') || /^[A-Za-z]:\//.test(masked)) {
            return '[REDACTED_PATH]';
        }
        return masked;
    }
    if (typeof value === 'number' || typeof value === 'boolean')
        return value;
    if (Array.isArray(value))
        return value.map((entry) => sanitizeForSnapshot(entry));
    if (typeof value === 'object') {
        const source = value;
        const next = {};
        for (const key of Object.keys(source)) {
            if (/(token|secret|password|api[_-]?key|authorization|cookie|private[_-]?key)/i.test(key)) {
                next[key] = '[REDACTED_SECRET]';
                continue;
            }
            next[key] = sanitizeForSnapshot(source[key]);
        }
        return next;
    }
    return String(value);
}
function mergeTopLevel(base, patch) {
    const merged = { ...base };
    for (const [key, value] of Object.entries(patch)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const current = asObject(merged[key]);
            merged[key] = mergeTopLevel(current, value);
        }
        else {
            merged[key] = value;
        }
    }
    return merged;
}
function buildImpact(previous, current, requestedPatch) {
    const items = [];
    const pushImpact = (item) => {
        items.push(item);
    };
    if (previous.runtime.execution.duplicateSuppression !== current.runtime.execution.duplicateSuppression) {
        pushImpact({
            id: 'runtime-duplicate-suppression',
            severity: current.runtime.execution.duplicateSuppression ? 'medium' : 'low',
            title: 'Duplicate suppression behavior changed',
            summary: current.runtime.execution.duplicateSuppression
                ? 'Runtime now suppresses duplicate executions within the configured dedupe window.'
                : 'Runtime now permits repeated executions without suppression.',
            affectedSystems: ['runtime', 'daemon', 'dashboard', 'vscode', 'cli', 'ci'],
        });
    }
    if (previous.runtime.retention.executionRecords !== current.runtime.retention.executionRecords) {
        pushImpact({
            id: 'runtime-execution-retention',
            severity: current.runtime.retention.executionRecords < previous.runtime.retention.executionRecords ? 'medium' : 'low',
            title: 'Execution retention changed',
            summary: `Execution history retention updated from ${previous.runtime.retention.executionRecords} to ${current.runtime.retention.executionRecords}.`,
            affectedSystems: ['runtime', 'dashboard', 'daemon'],
        });
    }
    if (previous.eventRuntime.retention.maxEvents !== current.eventRuntime.retention.maxEvents) {
        pushImpact({
            id: 'event-retention',
            severity: current.eventRuntime.retention.maxEvents < previous.eventRuntime.retention.maxEvents ? 'medium' : 'low',
            title: 'Runtime event retention changed',
            summary: `Event retention updated from ${previous.eventRuntime.retention.maxEvents} to ${current.eventRuntime.retention.maxEvents}.`,
            affectedSystems: ['events', 'dashboard', 'vscode', 'daemon'],
        });
    }
    if (previous.remediation.automation.autonomousApplySafe !== current.remediation.automation.autonomousApplySafe) {
        pushImpact({
            id: 'remediation-autonomy',
            severity: current.remediation.automation.autonomousApplySafe ? 'high' : 'low',
            title: 'Autonomous remediation permission changed',
            summary: current.remediation.automation.autonomousApplySafe
                ? 'Safe patch application can run autonomously when triggered by governance actions.'
                : 'Safe patch application now requires explicit manual action.',
            affectedSystems: ['remediation', 'runtime', 'dashboard', 'vscode', 'ci'],
        });
    }
    if (previous.ciGovernance.enforcement.strictness !== current.ciGovernance.enforcement.strictness) {
        pushImpact({
            id: 'ci-strictness',
            severity: current.ciGovernance.enforcement.strictness === 'strict' ? 'high' : 'medium',
            title: 'CI governance strictness changed',
            summary: current.ciGovernance.enforcement.strictness === 'strict'
                ? 'CI will fail builds on blocking governance findings.'
                : 'CI allows advisory posture where some governance failures become warnings.',
            affectedSystems: ['ci', 'runtime', 'dashboard', 'cli'],
        });
    }
    if (previous.evidence.collection.enabledByDefault !== current.evidence.collection.enabledByDefault) {
        pushImpact({
            id: 'evidence-default',
            severity: current.evidence.collection.enabledByDefault ? 'low' : 'medium',
            title: 'Evidence default behavior changed',
            summary: current.evidence.collection.enabledByDefault
                ? 'Verification evidence artifacts are enabled by default.'
                : 'Verification evidence artifacts now require explicit opt-in.',
            affectedSystems: ['evidence', 'runtime', 'ci', 'dashboard'],
        });
    }
    if (requestedPatch.policyGovernance) {
        pushImpact({
            id: 'policy-governance-update',
            severity: 'medium',
            title: 'Policy governance settings updated',
            summary: 'Exception approvals and policy audit requirements may change verification and remediation behavior.',
            affectedSystems: ['policy', 'runtime', 'dashboard', 'cli', 'ci'],
        });
    }
    const changedSections = Object.keys(requestedPatch).filter((key) => {
        const value = requestedPatch[key];
        return value && typeof value === 'object' && Object.keys(value).length > 0;
    });
    const changedKeys = flattenKeys(requestedPatch);
    const riskLevel = items.some((item) => item.severity === 'high')
        ? 'high'
        : items.some((item) => item.severity === 'medium')
            ? 'medium'
            : 'low';
    return {
        schemaVersion: 'neurcode.control-plane.impact.v1',
        generatedAt: nowIso(),
        riskLevel,
        changedSections,
        changedKeys,
        items,
    };
}
function readState(cwd) {
    const projectRoot = (0, path_1.resolve)(cwd);
    const paths = toPaths(projectRoot);
    const runtime = normalizeRuntimeConfig(readJsonFile(paths.runtimePath));
    const remediation = normalizeRemediationConfig(readJsonFile(paths.remediationPath));
    const evidence = normalizeEvidenceConfig(readJsonFile(paths.evidencePath));
    const eventRuntime = normalizeEventRuntimeConfig(readJsonFile(paths.eventRuntimePath));
    const ciGovernance = normalizeCiGovernanceConfig(readJsonFile(paths.ciGovernancePath));
    const policyGovernance = (0, policy_governance_1.readPolicyGovernanceConfig)(projectRoot);
    const snapshots = listSnapshots(paths);
    const latestSnapshotName = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    let latestSnapshotId = null;
    let latestSnapshotAt = null;
    if (latestSnapshotName) {
        const fullPath = (0, path_1.join)(paths.snapshotsDir, latestSnapshotName);
        const parsed = readJsonFile(fullPath);
        latestSnapshotId = typeof parsed.snapshotId === 'string' ? parsed.snapshotId : null;
        latestSnapshotAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : null;
    }
    return {
        schemaVersion: CONTROL_PLANE_SCHEMA,
        generatedAt: nowIso(),
        rootDir: paths.rootDir,
        runtime,
        remediation,
        evidence,
        eventRuntime,
        ciGovernance,
        policyGovernance,
        metadata: {
            files: {
                runtime: paths.runtimePath,
                remediation: paths.remediationPath,
                evidence: paths.evidencePath,
                eventRuntime: paths.eventRuntimePath,
                ciGovernance: paths.ciGovernancePath,
                policyGovernance: (0, path_1.resolve)(projectRoot, 'neurcode.policy.governance.json'),
            },
            snapshots: {
                directory: paths.snapshotsDir,
                retentionLimit: parseSnapshotRetention(),
                count: snapshots.length,
                latestPath: latestSnapshotName ? (0, path_1.join)(paths.snapshotsDir, latestSnapshotName) : null,
                latestId: latestSnapshotId,
                latestAt: latestSnapshotAt,
            },
        },
    };
}
function writeConfigFile(pathValue, payload) {
    (0, fs_1.writeFileSync)(pathValue, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}
function writeSnapshot(cwd, actor, source, reason, before, after, impact) {
    const paths = toPaths(cwd);
    const createdAt = nowIso();
    const digest = (0, crypto_1.createHash)('sha256')
        .update(JSON.stringify({ createdAt, actor, source, reason, impact }))
        .digest('hex')
        .slice(0, 12);
    const snapshotId = `cps-${digest}`;
    const fileName = `snapshot-${createdAt.replace(/[.:]/g, '-')}-${snapshotId}.json`;
    const snapshotPath = (0, path_1.join)(paths.snapshotsDir, fileName);
    const beforeState = {
        runtime: before.runtime,
        remediation: before.remediation,
        evidence: before.evidence,
        eventRuntime: before.eventRuntime,
        ciGovernance: before.ciGovernance,
        policyGovernance: before.policyGovernance,
    };
    const afterState = {
        runtime: after.runtime,
        remediation: after.remediation,
        evidence: after.evidence,
        eventRuntime: after.eventRuntime,
        ciGovernance: after.ciGovernance,
        policyGovernance: after.policyGovernance,
    };
    const record = {
        schemaVersion: CONTROL_PLANE_SNAPSHOT_SCHEMA,
        snapshotId,
        createdAt,
        actor,
        source,
        reason,
        impact,
        beforeHash: hashPayload(beforeState),
        afterHash: hashPayload(afterState),
        state: sanitizeForSnapshot(afterState),
    };
    (0, fs_1.writeFileSync)(snapshotPath, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
    pruneSnapshots(paths, parseSnapshotRetention());
    return { snapshotPath, snapshotId };
}
function mergePatchIntoState(current, patch) {
    const runtime = patch.runtime
        ? normalizeRuntimeConfig(mergeTopLevel(current.runtime, patch.runtime))
        : current.runtime;
    const remediation = patch.remediation
        ? normalizeRemediationConfig(mergeTopLevel(current.remediation, patch.remediation))
        : current.remediation;
    const evidence = patch.evidence
        ? normalizeEvidenceConfig(mergeTopLevel(current.evidence, patch.evidence))
        : current.evidence;
    const eventRuntime = patch.eventRuntime
        ? normalizeEventRuntimeConfig(mergeTopLevel(current.eventRuntime, patch.eventRuntime))
        : current.eventRuntime;
    const ciGovernance = patch.ciGovernance
        ? normalizeCiGovernanceConfig(mergeTopLevel(current.ciGovernance, patch.ciGovernance))
        : current.ciGovernance;
    let policyGovernance = current.policyGovernance;
    if (patch.policyGovernance) {
        const source = patch.policyGovernance;
        policyGovernance = {
            ...policyGovernance,
            exceptionApprovals: {
                ...policyGovernance.exceptionApprovals,
                ...(typeof source.required === 'boolean' ? { required: source.required } : {}),
                ...(Number.isFinite(source.minApprovals) ? { minApprovals: source.minApprovals } : {}),
                ...(typeof source.disallowSelfApproval === 'boolean' ? { disallowSelfApproval: source.disallowSelfApproval } : {}),
                ...(Array.isArray(source.allowedApprovers) ? { allowedApprovers: normalizeList(source.allowedApprovers) } : {}),
                ...(typeof source.requireReason === 'boolean' ? { requireReason: source.requireReason } : {}),
                ...(Number.isFinite(source.minReasonLength) ? { minReasonLength: source.minReasonLength } : {}),
                ...(Number.isFinite(source.maxExpiryDays) ? { maxExpiryDays: source.maxExpiryDays } : {}),
                ...(Array.isArray(source.criticalRulePatterns)
                    ? { criticalRulePatterns: normalizeList(source.criticalRulePatterns) }
                    : {}),
                ...(Number.isFinite(source.criticalMinApprovals)
                    ? { criticalMinApprovals: source.criticalMinApprovals }
                    : {}),
            },
            audit: {
                ...policyGovernance.audit,
                ...(typeof source.requireAuditIntegrity === 'boolean'
                    ? { requireIntegrity: source.requireAuditIntegrity }
                    : {}),
            },
        };
    }
    return {
        ...current,
        generatedAt: nowIso(),
        runtime,
        remediation,
        evidence,
        eventRuntime,
        ciGovernance,
        policyGovernance,
    };
}
function persistState(cwd, state, patch) {
    const paths = toPaths(cwd);
    if (patch.runtime) {
        writeConfigFile(paths.runtimePath, state.runtime);
    }
    if (patch.remediation) {
        writeConfigFile(paths.remediationPath, state.remediation);
    }
    if (patch.evidence) {
        writeConfigFile(paths.evidencePath, state.evidence);
    }
    if (patch.eventRuntime) {
        writeConfigFile(paths.eventRuntimePath, state.eventRuntime);
    }
    if (patch.ciGovernance) {
        writeConfigFile(paths.ciGovernancePath, state.ciGovernance);
    }
    if (patch.policyGovernance) {
        (0, policy_governance_1.updatePolicyGovernanceConfig)(cwd, patch.policyGovernance);
    }
}
function readControlPlaneState(cwd = process.cwd()) {
    return readState((0, path_1.resolve)(cwd));
}
function previewControlPlaneUpdate(patch, cwd = process.cwd()) {
    const projectRoot = (0, path_1.resolve)(cwd);
    const previous = readState(projectRoot);
    const current = mergePatchIntoState(previous, patch);
    const impact = buildImpact(previous, current, patch);
    return { previous, current, impact };
}
function applyControlPlaneUpdate(patch, options) {
    const projectRoot = (0, path_1.resolve)(options?.cwd || process.cwd());
    const actor = options?.actor && options.actor.trim().length > 0 ? options.actor.trim() : 'control-plane-user';
    const source = options?.source || 'unknown';
    const reason = options?.reason && options.reason.trim().length > 0
        ? (0, secret_masking_1.maskSecretsInText)(options.reason.trim()).masked
        : 'Control plane update';
    const previous = readState(projectRoot);
    const current = mergePatchIntoState(previous, patch);
    const impact = buildImpact(previous, current, patch);
    persistState(projectRoot, current, patch);
    const persisted = readState(projectRoot);
    const snapshot = writeSnapshot(projectRoot, actor, source, reason, previous, persisted, impact);
    const syntheticExecution = (0, execution_bus_1.recordSyntheticExecution)({
        cwd: projectRoot,
        type: 'policy-sync',
        source,
        actor,
        target: null,
        status: 'completed',
        success: true,
        message: reason,
        payload: {
            schemaVersion: CONTROL_PLANE_SCHEMA,
            action: 'control-plane.update',
            changedSections: impact.changedSections,
            changedKeys: impact.changedKeys,
            riskLevel: impact.riskLevel,
            snapshotId: snapshot.snapshotId,
        },
        verification: {
            verdict: impact.riskLevel === 'high' ? 'WARN' : 'PASS',
            counts: {
                blocking: impact.riskLevel === 'high' ? 1 : 0,
                advisory: impact.riskLevel === 'low' ? 0 : impact.items.length,
            },
        },
        evidenceReferences: [snapshot.snapshotPath],
        narrative: {
            status: impact.riskLevel === 'high' ? 'warning' : 'success',
            summary: `Control plane updated (${impact.changedSections.join(', ') || 'no changes detected'})`,
            why: reason,
            riskLevel: impact.riskLevel,
            recommendedAction: impact.riskLevel === 'high'
                ? 'Review governance impact preview and re-run verify in CI mode.'
                : 'Run verify to confirm updated governance posture.',
            expectedImprovement: 'Runtime governance behavior now aligns with the updated control-plane configuration.',
        },
        eventDetails: {
            stage: 'narrating',
            reason,
        },
    });
    try {
        (0, runtime_events_1.emitRuntimeEvent)(projectRoot, {
            type: 'governance.config.updated',
            executionId: syntheticExecution.id,
            source,
            actor,
            severity: impact.riskLevel,
            payload: {
                changedSections: impact.changedSections,
                changedKeys: impact.changedKeys,
                riskLevel: impact.riskLevel,
                snapshotId: snapshot.snapshotId,
                snapshotPath: snapshot.snapshotPath,
            },
        });
    }
    catch {
        // Best-effort runtime event emission only.
    }
    return {
        previous,
        current: persisted,
        impact,
        snapshotPath: snapshot.snapshotPath,
        snapshotId: snapshot.snapshotId,
        executionId: syntheticExecution.id,
    };
}
function readControlPlaneSnapshotHistory(cwd = process.cwd(), limit = 25) {
    const projectRoot = (0, path_1.resolve)(cwd);
    const paths = toPaths(projectRoot);
    const entries = listSnapshots(paths).reverse().slice(0, Math.max(1, Math.min(250, Math.floor(limit))));
    const results = [];
    for (const fileName of entries) {
        const snapshotPath = (0, path_1.join)(paths.snapshotsDir, fileName);
        const payload = readJsonFile(snapshotPath);
        const impact = asObject(payload.impact);
        const sections = Array.isArray(impact.changedSections)
            ? impact.changedSections.filter((entry) => typeof entry === 'string')
            : [];
        const riskLevel = impact.riskLevel === 'high' || impact.riskLevel === 'medium' ? impact.riskLevel : 'low';
        const source = asString(payload.source, 'unknown');
        results.push({
            snapshotId: asString(payload.snapshotId, fileName),
            createdAt: asString(payload.createdAt, nowIso()),
            actor: asString(payload.actor, 'control-plane-user'),
            source,
            riskLevel,
            snapshotPath,
            changedSections: sections,
        });
    }
    return results;
}
//# sourceMappingURL=control-plane.js.map