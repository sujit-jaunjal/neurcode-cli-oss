"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replayGovernanceState = replayGovernanceState;
exports.replayExecution = replayExecution;
exports.replayWorkspace = replayWorkspace;
exports.replayTimeline = replayTimeline;
exports.getWorkspaceSnapshotHistory = getWorkspaceSnapshotHistory;
exports.writeWorkspaceReplaySnapshot = writeWorkspaceReplaySnapshot;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const execution_bus_1 = require("./execution-bus");
const canonical_pipeline_1 = require("../governance/canonical-pipeline");
const REPLAY_STATE_SCHEMA = 'neurcode.replay.state.v1';
const REPLAY_EXECUTION_SCHEMA = 'neurcode.replay.execution.v1';
const REPLAY_WORKSPACE_SCHEMA = 'neurcode.replay.workspace.v1';
const REPLAY_TIMELINE_SCHEMA = 'neurcode.replay.timeline.v1';
const REPLAY_CACHE_SCHEMA = 'neurcode.replay.cache.v1';
const WORKSPACE_SNAPSHOT_SCHEMA = 'neurcode.workspace.snapshot.v1';
const CONTROL_PLANE_SNAPSHOT_SCHEMA = 'neurcode.control-plane.snapshot.v1';
const VERIFY_EVIDENCE_SCHEMA = 'neurcode.verify.evidence.v1';
const RUNTIME_EVENT_SCHEMA = 'neurcode.runtime-event.v1';
const DEFAULT_TIMELINE_LIMIT = 200;
const DEFAULT_EVENT_LIMIT = 400;
const MAX_TIMELINE_LIMIT = 5000;
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
function asNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function asBoolean(value) {
    if (typeof value === 'boolean')
        return value;
    return null;
}
function toMs(value) {
    if (!value)
        return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function stableNormalize(value) {
    if (value === null || typeof value !== 'object')
        return value;
    if (Array.isArray(value))
        return value.map((entry) => stableNormalize(entry));
    const record = value;
    const normalized = {};
    for (const key of Object.keys(record).sort()) {
        const current = record[key];
        if (typeof current === 'undefined')
            continue;
        normalized[key] = stableNormalize(current);
    }
    return normalized;
}
function stableHash(value) {
    return (0, crypto_1.createHash)('sha256').update(JSON.stringify(stableNormalize(value)), 'utf-8').digest('hex');
}
function withinRoot(root, target) {
    const normalizedRoot = root.endsWith(path_1.sep) ? root : `${root}${path_1.sep}`;
    return target === root || target.startsWith(normalizedRoot);
}
function toRelativeSafe(root, filePath) {
    const resolvedRoot = (0, path_1.resolve)(root);
    const resolvedTarget = (0, path_1.resolve)(filePath);
    if (!withinRoot(resolvedRoot, resolvedTarget))
        return (0, path_1.basename)(resolvedTarget);
    const rel = (0, path_1.relative)(resolvedRoot, resolvedTarget).replace(/\\/g, '/');
    return rel.length > 0 ? rel : '.';
}
function toReplayPaths(cwd) {
    const projectRoot = (0, path_1.resolve)(cwd);
    const replayDir = (0, path_1.resolve)(projectRoot, '.neurcode/replay');
    const cacheDir = (0, path_1.join)(replayDir, 'cache');
    (0, fs_1.mkdirSync)(cacheDir, { recursive: true });
    return {
        projectRoot,
        replayDir,
        cacheFile: (0, path_1.join)(cacheDir, 'index.json'),
        executionRecordsDir: (0, path_1.resolve)(projectRoot, '.neurcode/executions/records'),
        evidenceDir: (0, path_1.resolve)(projectRoot, '.neurcode/evidence'),
        runtimeEventsFile: (0, path_1.resolve)(projectRoot, '.neurcode/runtime-events/events.jsonl'),
        controlPlaneSnapshotsDir: (0, path_1.resolve)(projectRoot, '.neurcode/control-plane/snapshots'),
        workspaceSnapshotsDir: (0, path_1.resolve)(projectRoot, '.neurcode/workspaces/snapshots'),
    };
}
function readJsonFile(filePath) {
    try {
        const raw = (0, fs_1.readFileSync)(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return asObject(parsed);
    }
    catch {
        return null;
    }
}
function fingerprint(filePath) {
    try {
        const stat = (0, fs_1.statSync)(filePath);
        return {
            size: stat.size,
            mtimeMs: Math.floor(stat.mtimeMs),
        };
    }
    catch {
        return null;
    }
}
function hasFingerprintChanged(key, next, cache) {
    if (!next)
        return true;
    const prev = cache.files[key];
    if (!prev)
        return true;
    return prev.size !== next.size || prev.mtimeMs !== next.mtimeMs;
}
function parseExecutionDigest(root, filePath) {
    const parsed = readJsonFile(filePath);
    if (!parsed || parsed.schemaVersion !== 'neurcode.execution.v1')
        return null;
    const result = asObject(parsed.result);
    const verification = asObject(parsed.verification);
    const diff = asObject(verification?.diff);
    const afterCounts = asObject(diff?.after);
    const beforeCounts = asObject(diff?.before);
    const narrative = asObject(parsed.narrative);
    const evidence = asObject(parsed.evidence);
    const references = Array.isArray(evidence?.references)
        ? evidence.references.filter((entry) => typeof entry === 'string')
        : [];
    const blocking = asNumber(afterCounts?.blocking) ?? asNumber(beforeCounts?.blocking) ?? 0;
    const advisory = asNumber(afterCounts?.advisory) ?? asNumber(beforeCounts?.advisory) ?? 0;
    const trendRaw = asString(diff?.trend);
    const trend = trendRaw === 'improved'
        || trendRaw === 'regressed'
        || trendRaw === 'unchanged'
        || trendRaw === 'baseline'
        ? trendRaw
        : 'baseline';
    const riskRaw = asString(narrative?.riskLevel);
    const riskLevel = riskRaw === 'high' || riskRaw === 'medium' ? riskRaw : 'low';
    return {
        file: toRelativeSafe(root, filePath),
        id: asString(parsed.id) || (0, path_1.basename)(filePath),
        type: asString(parsed.type) || 'unknown',
        source: asString(parsed.source) || 'unknown',
        actor: asString(parsed.actor) || 'unknown',
        target: asString(parsed.target),
        status: asString(parsed.status) || 'unknown',
        createdAt: asString(parsed.createdAt) || nowIso(),
        startedAt: asString(parsed.startedAt),
        completedAt: asString(parsed.completedAt),
        durationMs: asNumber(parsed.durationMs),
        success: asBoolean(result?.success) === true,
        exitCode: asNumber(result?.exitCode),
        message: asString(result?.message),
        trend,
        blocking: clamp(Math.floor(blocking), 0, 100000),
        advisory: clamp(Math.floor(advisory), 0, 100000),
        evidenceRefs: references.map((entry) => toRelativeSafe(root, entry)),
        narrative: narrative
            ? {
                summary: asString(narrative.summary) || '',
                why: asString(narrative.why) || '',
                riskLevel,
                recommendedAction: asString(narrative.recommendedAction) || '',
                expectedImprovement: asString(narrative.expectedImprovement) || '',
            }
            : null,
    };
}
function parseEvidenceDigest(root, filePath) {
    const parsed = readJsonFile(filePath);
    if (!parsed || parsed.schemaVersion !== VERIFY_EVIDENCE_SCHEMA)
        return null;
    const canonical = asObject(parsed.canonicalVerifyOutput) || {};
    const git = asObject(parsed.git) || {};
    const regressions = Array.isArray(parsed.regressions) ? parsed.regressions : [];
    const flowIssues = Array.isArray(parsed.flowIssues) ? parsed.flowIssues : [];
    const coverage = asNumber(canonical.driftScore) ?? asNumber(canonical.score);
    const governanceVerification = asObject(canonical.governanceVerification);
    const governanceFindingsRaw = Array.isArray(canonical.governanceFindings)
        ? canonical.governanceFindings
        : (Array.isArray(governanceVerification?.findings) ? governanceVerification?.findings : []);
    const governanceFindings = governanceFindingsRaw.filter((entry) => {
        const record = asObject(entry);
        return Boolean(record);
    });
    const determinismCounts = {};
    let semanticTruncationCount = 0;
    let federationTruncationCount = 0;
    let graphTruncationCount = 0;
    let provenanceMissingCount = 0;
    for (const finding of governanceFindings) {
        const determinism = asString(finding.determinismClassification) || 'unknown';
        determinismCounts[determinism] = (determinismCounts[determinism] ?? 0) + 1;
        const semanticMetadata = asObject(finding.semanticMetadata);
        const graphMetadata = asObject(finding.graphMetadata);
        const provenanceMetadata = asObject(finding.provenanceMetadata);
        if (asBoolean(semanticMetadata?.indexTruncated) === true)
            semanticTruncationCount += 1;
        if (asBoolean(graphMetadata?.truncated) === true) {
            graphTruncationCount += 1;
            const fromRepo = asString(graphMetadata?.fromRepo);
            const toRepo = asString(graphMetadata?.toRepo);
            if (fromRepo || toRepo) {
                federationTruncationCount += 1;
            }
        }
        if (!provenanceMetadata)
            provenanceMissingCount += 1;
    }
    return {
        file: toRelativeSafe(root, filePath),
        timestamp: asString(parsed.timestamp) || nowIso(),
        verdict: asString(parsed.verdict) || 'UNKNOWN',
        pass: asBoolean(parsed.pass) === true,
        ciMode: asBoolean(parsed.ciMode) === true,
        deterministicMode: asBoolean(parsed.deterministicMode) === true,
        deterministicVerificationHash: asString(parsed.deterministicVerificationHash) || '',
        blockingCount: clamp(Math.floor(asNumber(parsed.blockingCount) ?? 0), 0, 100000),
        advisoryCount: clamp(Math.floor(asNumber(parsed.advisoryCount) ?? 0), 0, 100000),
        regressionCount: regressions.length,
        flowIssueCount: flowIssues.length,
        coverageScore: coverage === null ? null : clamp(Math.round(coverage * 100) / 100, 0, 100),
        branch: asString(git.branch),
        commitSha: asString(git.commitSha),
        governanceFindingsCount: governanceFindings.length,
        governanceDeterminismCounts: determinismCounts,
        semanticTruncationCount,
        federationTruncationCount,
        graphTruncationCount,
        provenanceMissingCount,
        governanceEnvelopePresent: Boolean(governanceVerification),
        canonicalVerifyOutput: asObject(parsed.canonicalVerifyOutput),
    };
}
function parseControlPlaneSnapshotDigest(root, filePath) {
    const parsed = readJsonFile(filePath);
    if (!parsed || parsed.schemaVersion !== CONTROL_PLANE_SNAPSHOT_SCHEMA)
        return null;
    const impact = asObject(parsed.impact) || {};
    const changedSections = Array.isArray(impact.changedSections)
        ? impact.changedSections.filter((entry) => typeof entry === 'string').sort((left, right) => left.localeCompare(right))
        : [];
    const riskRaw = asString(impact.riskLevel);
    const state = asObject(parsed.state);
    const stateRecord = state
        ? {
            runtime: asObject(state.runtime) || {},
            remediation: asObject(state.remediation) || {},
            evidence: asObject(state.evidence) || {},
            eventRuntime: asObject(state.eventRuntime) || {},
            ciGovernance: asObject(state.ciGovernance) || {},
            policyGovernance: asObject(state.policyGovernance) || {},
        }
        : null;
    return {
        file: toRelativeSafe(root, filePath),
        snapshotId: asString(parsed.snapshotId) || (0, path_1.basename)(filePath),
        createdAt: asString(parsed.createdAt) || nowIso(),
        source: asString(parsed.source) || 'unknown',
        actor: asString(parsed.actor) || 'unknown',
        changedSections,
        riskLevel: riskRaw === 'high' || riskRaw === 'medium' ? riskRaw : 'low',
        state: stateRecord,
    };
}
function parseWorkspaceSnapshotDigest(root, filePath) {
    const parsed = readJsonFile(filePath);
    if (!parsed || parsed.schemaVersion !== WORKSPACE_SNAPSHOT_SCHEMA)
        return null;
    const workspace = asObject(parsed.workspace) || {};
    const posture = asObject(parsed.posture);
    return {
        file: toRelativeSafe(root, filePath),
        snapshotId: asString(parsed.snapshotId) || (0, path_1.basename)(filePath),
        workspaceId: asString(parsed.workspaceId) || 'unknown',
        workspaceName: asString(parsed.workspaceName) || 'Workspace',
        createdAt: asString(parsed.createdAt) || nowIso(),
        source: asString(parsed.source) || 'unknown',
        actor: asString(parsed.actor) || 'unknown',
        action: asString(parsed.action) || 'snapshot',
        executionId: asString(parsed.executionId),
        activeWorkspaceId: asString(parsed.activeWorkspaceId),
        workspace,
        posture,
    };
}
function parseRuntimeEvents(filePath) {
    if (!(0, fs_1.existsSync)(filePath))
        return [];
    try {
        const lines = (0, fs_1.readFileSync)(filePath, 'utf-8')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        const events = [];
        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                const record = asObject(parsed);
                if (!record || record.schemaVersion !== RUNTIME_EVENT_SCHEMA)
                    continue;
                const severityRaw = asString(record.severity);
                const severity = severityRaw === 'high' || severityRaw === 'medium' ? severityRaw : 'low';
                events.push({
                    id: asString(record.id) || (0, crypto_1.createHash)('sha256').update(line, 'utf-8').digest('hex').slice(0, 16),
                    cursor: asString(record.cursor) || '',
                    type: asString(record.type) || 'unknown',
                    timestamp: asString(record.timestamp) || nowIso(),
                    executionId: asString(record.executionId) || 'unknown',
                    source: asString(record.source) || 'unknown',
                    actor: asString(record.actor) || 'unknown',
                    severity,
                    payload: asObject(record.payload) || {},
                });
            }
            catch {
                // Ignore malformed lines.
            }
        }
        return events.sort((left, right) => {
            const leftMs = toMs(left.timestamp) ?? 0;
            const rightMs = toMs(right.timestamp) ?? 0;
            if (leftMs !== rightMs)
                return leftMs - rightMs;
            return left.id.localeCompare(right.id);
        });
    }
    catch {
        return [];
    }
}
function loadCache(paths) {
    if (!(0, fs_1.existsSync)(paths.cacheFile)) {
        return {
            schemaVersion: REPLAY_CACHE_SCHEMA,
            generatedAt: nowIso(),
            files: {},
            executions: {},
            evidences: {},
            controlPlaneSnapshots: {},
            workspaceSnapshots: {},
            runtimeEvents: [],
            runtimeEventsFile: null,
        };
    }
    try {
        const parsed = JSON.parse((0, fs_1.readFileSync)(paths.cacheFile, 'utf-8'));
        const record = asObject(parsed);
        if (!record || record.schemaVersion !== REPLAY_CACHE_SCHEMA) {
            throw new Error('invalid replay cache schema');
        }
        return {
            schemaVersion: REPLAY_CACHE_SCHEMA,
            generatedAt: asString(record.generatedAt) || nowIso(),
            files: asObject(record.files) || {},
            executions: asObject(record.executions) || {},
            evidences: asObject(record.evidences) || {},
            controlPlaneSnapshots: asObject(record.controlPlaneSnapshots) || {},
            workspaceSnapshots: asObject(record.workspaceSnapshots) || {},
            runtimeEvents: Array.isArray(record.runtimeEvents)
                ? record.runtimeEvents.filter((entry) => {
                    const asRecord = asObject(entry);
                    return Boolean(asRecord && typeof asRecord.id === 'string' && typeof asRecord.timestamp === 'string');
                })
                : [],
            runtimeEventsFile: asString(record.runtimeEventsFile),
        };
    }
    catch {
        return {
            schemaVersion: REPLAY_CACHE_SCHEMA,
            generatedAt: nowIso(),
            files: {},
            executions: {},
            evidences: {},
            controlPlaneSnapshots: {},
            workspaceSnapshots: {},
            runtimeEvents: [],
            runtimeEventsFile: null,
        };
    }
}
function saveCache(paths, cache) {
    cache.generatedAt = nowIso();
    (0, fs_1.writeFileSync)(paths.cacheFile, `${JSON.stringify(cache, null, 2)}\n`, 'utf-8');
}
function listFiles(dirPath, filter) {
    if (!(0, fs_1.existsSync)(dirPath))
        return [];
    return (0, fs_1.readdirSync)(dirPath)
        .filter(filter)
        .map((name) => (0, path_1.join)(dirPath, name))
        .sort((left, right) => left.localeCompare(right));
}
function updateDigestMap(root, cache, files, existing, parseDigest) {
    const keep = new Set();
    for (const filePath of files) {
        const key = toRelativeSafe(root, filePath);
        const nextFingerprint = fingerprint(filePath);
        if (!hasFingerprintChanged(key, nextFingerprint, cache) && existing[key]) {
            keep.add(key);
            continue;
        }
        const parsed = parseDigest(root, filePath);
        if (!parsed)
            continue;
        existing[key] = parsed;
        keep.add(key);
        if (nextFingerprint)
            cache.files[key] = nextFingerprint;
    }
    for (const key of Object.keys(existing)) {
        if (!keep.has(key)) {
            delete existing[key];
            delete cache.files[key];
        }
    }
    return existing;
}
function buildReplayIndex(cwd = process.cwd()) {
    const paths = toReplayPaths(cwd);
    const cache = loadCache(paths);
    const executionFiles = listFiles(paths.executionRecordsDir, (name) => name.startsWith('execution-') && name.endsWith('.json'));
    const evidenceFiles = listFiles(paths.evidenceDir, (name) => name.startsWith('verification-') && name.endsWith('.json'));
    const controlPlaneSnapshotFiles = listFiles(paths.controlPlaneSnapshotsDir, (name) => name.startsWith('snapshot-') && name.endsWith('.json'));
    const workspaceSnapshotFiles = listFiles(paths.workspaceSnapshotsDir, (name) => name.startsWith('workspace-snapshot-') && name.endsWith('.json'));
    cache.executions = updateDigestMap(paths.projectRoot, cache, executionFiles, cache.executions, parseExecutionDigest);
    cache.evidences = updateDigestMap(paths.projectRoot, cache, evidenceFiles, cache.evidences, parseEvidenceDigest);
    cache.controlPlaneSnapshots = updateDigestMap(paths.projectRoot, cache, controlPlaneSnapshotFiles, cache.controlPlaneSnapshots, parseControlPlaneSnapshotDigest);
    cache.workspaceSnapshots = updateDigestMap(paths.projectRoot, cache, workspaceSnapshotFiles, cache.workspaceSnapshots, parseWorkspaceSnapshotDigest);
    const runtimeFingerprint = fingerprint(paths.runtimeEventsFile);
    const runtimeKey = toRelativeSafe(paths.projectRoot, paths.runtimeEventsFile);
    const runtimeChanged = hasFingerprintChanged(runtimeKey, runtimeFingerprint, cache) || cache.runtimeEventsFile !== runtimeKey;
    if (runtimeChanged) {
        cache.runtimeEvents = parseRuntimeEvents(paths.runtimeEventsFile);
        cache.runtimeEventsFile = runtimeKey;
        if (runtimeFingerprint)
            cache.files[runtimeKey] = runtimeFingerprint;
    }
    saveCache(paths, cache);
    const executions = Object.values(cache.executions).sort((left, right) => {
        const leftMs = toMs(left.createdAt) ?? 0;
        const rightMs = toMs(right.createdAt) ?? 0;
        if (leftMs !== rightMs)
            return leftMs - rightMs;
        return left.id.localeCompare(right.id);
    });
    const evidences = Object.values(cache.evidences).sort((left, right) => {
        const leftMs = toMs(left.timestamp) ?? 0;
        const rightMs = toMs(right.timestamp) ?? 0;
        if (leftMs !== rightMs)
            return leftMs - rightMs;
        return left.file.localeCompare(right.file);
    });
    const controlPlaneSnapshots = Object.values(cache.controlPlaneSnapshots).sort((left, right) => {
        const leftMs = toMs(left.createdAt) ?? 0;
        const rightMs = toMs(right.createdAt) ?? 0;
        if (leftMs !== rightMs)
            return leftMs - rightMs;
        return left.snapshotId.localeCompare(right.snapshotId);
    });
    const workspaceSnapshots = Object.values(cache.workspaceSnapshots).sort((left, right) => {
        const leftMs = toMs(left.createdAt) ?? 0;
        const rightMs = toMs(right.createdAt) ?? 0;
        if (leftMs !== rightMs)
            return leftMs - rightMs;
        return left.snapshotId.localeCompare(right.snapshotId);
    });
    return {
        executions,
        evidences,
        controlPlaneSnapshots,
        workspaceSnapshots,
        runtimeEvents: cache.runtimeEvents,
    };
}
function parseRequiredTimestamp(input) {
    const parsed = Date.parse(input);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid timestamp: ${input}`);
    }
    return new Date(parsed).toISOString();
}
function selectLatestAt(items, toTimestamp, atMs) {
    let selected = null;
    let selectedMs = Number.NEGATIVE_INFINITY;
    for (const item of items) {
        const itemMs = toMs(toTimestamp(item));
        if (itemMs === null || itemMs > atMs)
            continue;
        if (itemMs >= selectedMs) {
            selected = item;
            selectedMs = itemMs;
        }
    }
    return selected;
}
function riskFromCounts(blocking, advisory) {
    if (blocking > 0)
        return 'high';
    if (advisory > 0)
        return 'medium';
    return 'low';
}
function buildHotspots(executions) {
    const buckets = new Map();
    for (const execution of executions) {
        for (const ref of execution.evidenceRefs) {
            const current = buckets.get(ref) || { occurrences: 0, score: 0 };
            current.occurrences += 1;
            current.score += execution.blocking * 2 + execution.advisory * 0.5 + (execution.trend === 'regressed' ? 2 : 0);
            buckets.set(ref, current);
        }
    }
    return [...buckets.entries()]
        .map(([key, value]) => ({
        key,
        occurrences: value.occurrences,
        score: Math.round((value.score / Math.max(1, value.occurrences)) * 100) / 100,
    }))
        .sort((left, right) => right.score - left.score || right.occurrences - left.occurrences)
        .slice(0, 20);
}
function computePosture(executions, evidences) {
    const runCount = executions.length > 0 ? executions.length : evidences.length;
    let passCount = 0;
    let blocked = 0;
    let regressions = 0;
    let latestVerdict = null;
    let latestCoverageScore = null;
    let latestMs = Number.NEGATIVE_INFINITY;
    for (const execution of executions) {
        if (execution.success)
            passCount += 1;
        if (execution.blocking > 0 || execution.status === 'failed')
            blocked += 1;
        if (execution.trend === 'regressed')
            regressions += 1;
    }
    for (const evidence of evidences) {
        const eventMs = toMs(evidence.timestamp) ?? Number.NEGATIVE_INFINITY;
        if (eventMs >= latestMs) {
            latestMs = eventMs;
            latestVerdict = evidence.verdict;
            latestCoverageScore = evidence.coverageScore;
        }
    }
    const passRate = runCount > 0 ? Math.round((passCount / runCount) * 10000) / 100 : 0;
    const blockRate = runCount > 0 ? Math.round((blocked / runCount) * 10000) / 100 : 0;
    const regressionRate = runCount > 0 ? Math.round((regressions / runCount) * 10000) / 100 : 0;
    return {
        runCount,
        passRate,
        blockRate,
        regressionRate,
        latestVerdict,
        latestCoverageScore,
    };
}
function normalizeTimelineLimit(limit) {
    if (typeof limit === 'number' && Number.isFinite(limit) && limit >= 1) {
        return Math.min(MAX_TIMELINE_LIMIT, Math.floor(limit));
    }
    return DEFAULT_TIMELINE_LIMIT;
}
function buildDeterminismWarnings(index, controlPlane, workspace) {
    const warnings = [];
    if (controlPlane === null) {
        warnings.push('No immutable control-plane snapshot existed at this timestamp.');
    }
    if (workspace === null) {
        warnings.push('No immutable workspace snapshot existed at this timestamp.');
    }
    if (index.executions.length === 0) {
        warnings.push('No execution records available in replay index.');
    }
    if (index.evidences.length === 0) {
        warnings.push('No evidence artifacts available in replay index.');
    }
    return warnings;
}
function clampScore(value) {
    return clamp(Math.round(value), 0, 100);
}
function summarizeReplayGovernanceReport(input) {
    const { warnings, evidences, controlPlane, workspace } = input;
    const latestEvidence = evidences[evidences.length - 1] || null;
    const missingArtifactSummaries = [];
    const semanticDegradationSummaries = [];
    const federationDegradationSummaries = [];
    const graphMismatchSummaries = [];
    const provenanceMismatchSummaries = [];
    const confidenceDriftSummaries = [];
    if (!controlPlane) {
        missingArtifactSummaries.push('Missing control-plane snapshot at replay timestamp.');
    }
    if (!workspace) {
        missingArtifactSummaries.push('Missing workspace snapshot at replay timestamp.');
    }
    if (!latestEvidence) {
        missingArtifactSummaries.push('No verification evidence artifact available at replay timestamp.');
    }
    if (warnings.length > 0) {
        missingArtifactSummaries.push(...warnings);
    }
    if (latestEvidence) {
        if (!latestEvidence.governanceEnvelopePresent) {
            provenanceMismatchSummaries.push('Canonical governance envelope missing from latest evidence artifact.');
        }
        if (latestEvidence.semanticTruncationCount > 0) {
            semanticDegradationSummaries.push(`${latestEvidence.semanticTruncationCount} finding(s) flagged semantic index truncation.`);
        }
        if (latestEvidence.federationTruncationCount > 0) {
            federationDegradationSummaries.push(`${latestEvidence.federationTruncationCount} finding(s) indicate bounded federation truncation.`);
        }
        if (latestEvidence.graphTruncationCount > 0) {
            graphMismatchSummaries.push(`${latestEvidence.graphTruncationCount} graph-linked finding(s) marked traversal truncation.`);
        }
        if (latestEvidence.provenanceMissingCount > 0) {
            provenanceMismatchSummaries.push(`${latestEvidence.provenanceMissingCount} finding(s) missing provenance metadata.`);
        }
        if (latestEvidence.canonicalVerifyOutput) {
            const integrity = (0, canonical_pipeline_1.evaluateGovernanceReplayIntegrity)({
                evidencePayload: latestEvidence.canonicalVerifyOutput,
            });
            if (integrity.missingArtifacts.length > 0) {
                missingArtifactSummaries.push(...integrity.missingArtifacts);
            }
            if (integrity.provenanceMismatches.length > 0) {
                provenanceMismatchSummaries.push(...integrity.provenanceMismatches);
            }
            if (integrity.graphMismatches.length > 0) {
                graphMismatchSummaries.push(...integrity.graphMismatches);
            }
            if (integrity.semanticTruncationMismatches.length > 0) {
                semanticDegradationSummaries.push(...integrity.semanticTruncationMismatches);
            }
        }
    }
    const provenanceScore = latestEvidence
        ? clampScore(100
            - (latestEvidence.provenanceMissingCount * 6)
            - (latestEvidence.governanceEnvelopePresent ? 0 : 35))
        : 10;
    const semanticScore = latestEvidence
        ? clampScore(100 - (latestEvidence.semanticTruncationCount * 8))
        : 20;
    const federationScore = latestEvidence
        ? clampScore(100 - (latestEvidence.federationTruncationCount * 8))
        : 30;
    const graphScore = latestEvidence
        ? clampScore(100 - (latestEvidence.graphTruncationCount * 8))
        : 30;
    const artifactsScore = clampScore(100
        - (missingArtifactSummaries.length * 10)
        - (latestEvidence ? 0 : 30));
    const overall = clampScore((provenanceScore * 0.25)
        + (graphScore * 0.2)
        + (semanticScore * 0.2)
        + (federationScore * 0.15)
        + (artifactsScore * 0.2));
    if (overall < 95) {
        confidenceDriftSummaries.push(`Replay confidence reduced to ${overall}/100 due to bounded degradation signals.`);
    }
    if (evidences.length > 1) {
        const previousEvidence = evidences[evidences.length - 2];
        if (latestEvidence
            && previousEvidence
            && latestEvidence.deterministicVerificationHash
            && previousEvidence.deterministicVerificationHash
            && latestEvidence.deterministicVerificationHash !== previousEvidence.deterministicVerificationHash) {
            confidenceDriftSummaries.push('Deterministic verification hash changed since previous evidence artifact (semantic scope drift or code drift).');
        }
        if (latestEvidence
            && previousEvidence
            && latestEvidence.coverageScore !== null
            && previousEvidence.coverageScore !== null
            && Math.abs(latestEvidence.coverageScore - previousEvidence.coverageScore) >= 8) {
            confidenceDriftSummaries.push(`Coverage/confidence drift detected (${previousEvidence.coverageScore} -> ${latestEvidence.coverageScore}).`);
        }
    }
    if (semanticScore < 100) {
        confidenceDriftSummaries.push(`Semantic completeness reduced (${semanticScore}/100).`);
    }
    if (federationScore < 100) {
        confidenceDriftSummaries.push(`Federation completeness reduced (${federationScore}/100).`);
    }
    const reconstructionStatus = missingArtifactSummaries.length === 0
        && semanticDegradationSummaries.length === 0
        && federationDegradationSummaries.length === 0
        && graphMismatchSummaries.length === 0
        && provenanceMismatchSummaries.length === 0
        ? 'exact'
        : 'bounded-degradation';
    return {
        reconstructionStatus,
        canReconstructExactly: reconstructionStatus === 'exact',
        missingArtifactSummaries: [...new Set(missingArtifactSummaries)],
        semanticDegradationSummaries: [...new Set(semanticDegradationSummaries)],
        federationDegradationSummaries: [...new Set(federationDegradationSummaries)],
        graphMismatchSummaries: [...new Set(graphMismatchSummaries)],
        provenanceMismatchSummaries: [...new Set(provenanceMismatchSummaries)],
        confidenceDriftSummaries: [...new Set(confidenceDriftSummaries)],
        confidence: {
            overall,
            provenance: {
                score: provenanceScore,
                note: latestEvidence?.governanceEnvelopePresent
                    ? 'Canonical provenance envelope present.'
                    : 'Canonical provenance envelope missing.',
            },
            graph: {
                score: graphScore,
                note: latestEvidence?.graphTruncationCount
                    ? 'Graph traversal truncation detected.'
                    : 'No graph truncation detected.',
            },
            semantic: {
                score: semanticScore,
                note: latestEvidence?.semanticTruncationCount
                    ? 'Semantic truncation detected.'
                    : 'Semantic retrieval completeness intact for observed findings.',
            },
            federation: {
                score: federationScore,
                note: latestEvidence?.federationTruncationCount
                    ? 'Federated context truncation detected.'
                    : 'No federated truncation detected.',
            },
            artifacts: {
                score: artifactsScore,
                note: missingArtifactSummaries.length > 0
                    ? `${missingArtifactSummaries.length} artifact warning(s) present.`
                    : 'No missing artifact warnings.',
            },
        },
    };
}
function replayGovernanceState(request, cwd = process.cwd()) {
    const paths = toReplayPaths(cwd);
    const asOf = parseRequiredTimestamp(request.at);
    const asOfMs = Date.parse(asOf);
    const index = buildReplayIndex(paths.projectRoot);
    const limitEvents = typeof request.eventLimit === 'number' && Number.isFinite(request.eventLimit)
        ? Math.max(1, Math.min(2000, Math.floor(request.eventLimit)))
        : DEFAULT_EVENT_LIMIT;
    const executions = index.executions.filter((entry) => {
        const ts = toMs(entry.createdAt);
        if (ts === null || ts > asOfMs)
            return false;
        if (!request.workspaceId)
            return true;
        return entry.target === null || entry.target.includes(request.workspaceId);
    });
    const evidences = index.evidences.filter((entry) => {
        const ts = toMs(entry.timestamp);
        return ts !== null && ts <= asOfMs;
    });
    const controlPlane = selectLatestAt(index.controlPlaneSnapshots, (item) => item.createdAt, asOfMs);
    const workspace = request.workspaceId
        ? selectLatestAt(index.workspaceSnapshots.filter((item) => item.workspaceId === request.workspaceId), (item) => item.createdAt, asOfMs)
        : selectLatestAt(index.workspaceSnapshots, (item) => item.createdAt, asOfMs);
    const regressions = executions
        .filter((entry) => entry.trend === 'regressed')
        .sort((left, right) => (toMs(right.createdAt) ?? 0) - (toMs(left.createdAt) ?? 0))
        .slice(0, 50)
        .map((entry) => ({
        executionId: entry.id,
        createdAt: entry.createdAt,
        source: entry.source,
        actor: entry.actor,
        blockingDelta: entry.trend === 'regressed' ? entry.blocking : null,
        advisoryDelta: entry.trend === 'regressed' ? entry.advisory : null,
        trend: entry.trend,
    }));
    const blockedExecutions = executions
        .filter((entry) => entry.blocking > 0 || entry.status === 'failed')
        .sort((left, right) => (toMs(right.createdAt) ?? 0) - (toMs(left.createdAt) ?? 0))
        .slice(0, 50)
        .map((entry) => ({
        executionId: entry.id,
        createdAt: entry.createdAt,
        type: entry.type,
        source: entry.source,
        actor: entry.actor,
        blocking: entry.blocking,
        advisory: entry.advisory,
        message: entry.message,
    }));
    const timelineItems = [];
    for (const execution of executions) {
        timelineItems.push({
            timestamp: execution.createdAt,
            kind: 'execution',
            id: execution.id,
            summary: `${execution.type} ${execution.success ? 'succeeded' : 'failed'} (${execution.trend})`,
            severity: riskFromCounts(execution.blocking, execution.advisory),
            source: execution.source,
        });
    }
    for (const evidence of evidences) {
        timelineItems.push({
            timestamp: evidence.timestamp,
            kind: 'evidence',
            id: evidence.file,
            summary: `verify ${evidence.verdict} (blocking ${evidence.blockingCount}, advisory ${evidence.advisoryCount})`,
            severity: riskFromCounts(evidence.blockingCount, evidence.advisoryCount),
            source: evidence.ciMode ? 'ci' : 'cli',
        });
    }
    if (controlPlane) {
        timelineItems.push({
            timestamp: controlPlane.createdAt,
            kind: 'control-plane',
            id: controlPlane.snapshotId,
            summary: `control-plane snapshot (${controlPlane.changedSections.join(', ') || 'no section changes'})`,
            severity: controlPlane.riskLevel,
            source: controlPlane.source,
        });
    }
    if (workspace) {
        timelineItems.push({
            timestamp: workspace.createdAt,
            kind: 'workspace',
            id: workspace.snapshotId,
            summary: `workspace ${workspace.workspaceName} ${workspace.action}`,
            severity: 'low',
            source: workspace.source,
        });
    }
    const events = index.runtimeEvents
        .filter((event) => {
        const ts = toMs(event.timestamp);
        if (ts === null || ts > asOfMs)
            return false;
        if (!request.workspaceId)
            return true;
        const workspaceIdFromPayload = asString(event.payload.workspaceId);
        return workspaceIdFromPayload ? workspaceIdFromPayload === request.workspaceId : true;
    })
        .slice(-limitEvents);
    if (request.includeEvents) {
        for (const event of events) {
            timelineItems.push({
                timestamp: event.timestamp,
                kind: 'event',
                id: event.id,
                summary: event.type,
                severity: event.severity,
                source: event.source,
            });
        }
    }
    timelineItems.sort((left, right) => {
        const leftMs = toMs(left.timestamp) ?? 0;
        const rightMs = toMs(right.timestamp) ?? 0;
        if (leftMs !== rightMs)
            return rightMs - leftMs;
        return left.id.localeCompare(right.id);
    });
    const posture = computePosture(executions, evidences);
    const hotspots = buildHotspots(executions);
    const warnings = buildDeterminismWarnings(index, controlPlane, workspace);
    const reconstruction = summarizeReplayGovernanceReport({
        warnings,
        evidences,
        controlPlane,
        workspace,
    });
    const determinismPayload = {
        asOf,
        controlPlaneSnapshotId: controlPlane?.snapshotId || null,
        workspaceSnapshotId: workspace?.snapshotId || null,
        executions,
        evidences,
        events: request.includeEvents ? events : [],
        regressions,
        blockedExecutions,
        posture,
        hotspots,
    };
    return {
        schemaVersion: REPLAY_STATE_SCHEMA,
        generatedAt: nowIso(),
        asOf,
        rootDir: paths.projectRoot,
        determinism: {
            immutableOnly: true,
            artifactHash: stableHash(determinismPayload),
            warnings,
            inputs: {
                executionRecords: executions.length,
                evidenceArtifacts: evidences.length,
                runtimeEvents: events.length,
                controlPlaneSnapshots: index.controlPlaneSnapshots.length,
                workspaceSnapshots: index.workspaceSnapshots.length,
            },
        },
        reconstruction,
        controlPlane: {
            snapshotId: controlPlane?.snapshotId || null,
            createdAt: controlPlane?.createdAt || null,
            source: controlPlane?.source || null,
            actor: controlPlane?.actor || null,
            changedSections: controlPlane?.changedSections || [],
            state: controlPlane?.state || null,
        },
        workspace: {
            workspaceId: workspace?.workspaceId || null,
            workspaceName: workspace?.workspaceName || null,
            snapshotId: workspace?.snapshotId || null,
            action: workspace?.action || null,
            activeWorkspaceId: workspace?.activeWorkspaceId || null,
            posture: workspace?.posture || null,
            definition: workspace?.workspace || null,
        },
        posture,
        regressions,
        hotspots,
        blockedExecutions,
        timeline: timelineItems.slice(0, MAX_TIMELINE_LIMIT),
        events,
    };
}
function executionTimeline(record) {
    const events = Array.isArray(record.events) ? record.events : [];
    return events
        .map((event) => {
        const row = asObject(event);
        return {
            stage: asString(row?.stage) || 'unknown',
            timestamp: asString(row?.timestamp) || nowIso(),
            message: asString(row?.message) || 'event',
            details: asObject(row?.details),
        };
    })
        .sort((left, right) => (toMs(left.timestamp) ?? 0) - (toMs(right.timestamp) ?? 0));
}
function digestFromExecutionRecord(root, record) {
    const after = record.verification.diff.after || record.verification.diff.before || { blocking: 0, advisory: 0 };
    const narrative = record.narrative
        ? {
            summary: record.narrative.summary,
            why: record.narrative.why,
            riskLevel: record.narrative.riskLevel,
            recommendedAction: record.narrative.recommendedAction,
            expectedImprovement: record.narrative.expectedImprovement,
        }
        : null;
    return {
        file: `execution-${record.id}`,
        id: record.id,
        type: record.type,
        source: record.source,
        actor: record.actor,
        target: record.target,
        status: record.status,
        createdAt: record.createdAt,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
        durationMs: record.durationMs,
        success: record.result?.success === true,
        exitCode: typeof record.result?.exitCode === 'number' ? record.result.exitCode : null,
        message: record.result?.message || null,
        trend: record.verification.diff.trend,
        blocking: Math.max(0, Math.floor(after?.blocking || 0)),
        advisory: Math.max(0, Math.floor(after?.advisory || 0)),
        evidenceRefs: (record.evidence.references || []).map((entry) => toRelativeSafe(root, entry)),
        narrative,
    };
}
function replayExecution(request, cwd = process.cwd()) {
    const paths = toReplayPaths(cwd);
    const record = (0, execution_bus_1.getExecutionById)(request.executionId, paths.projectRoot);
    if (!record) {
        throw new Error(`Execution not found: ${request.executionId}`);
    }
    const digest = digestFromExecutionRecord(paths.projectRoot, record);
    const createdMs = toMs(digest.createdAt) ?? Date.now();
    const stateAtExecution = replayGovernanceState({
        at: new Date(createdMs).toISOString(),
        includeEvents: true,
        eventLimit: 200,
    }, paths.projectRoot);
    const relatedEvents = stateAtExecution.events.filter((event) => event.executionId === digest.id);
    const relatedEvidence = buildReplayIndex(paths.projectRoot).evidences
        .filter((evidence) => digest.evidenceRefs.includes(evidence.file))
        .sort((left, right) => (toMs(left.timestamp) ?? 0) - (toMs(right.timestamp) ?? 0));
    const warnings = [...stateAtExecution.determinism.warnings];
    const artifactHash = stableHash({
        execution: digest,
        timeline: executionTimeline(record),
        relatedEvents,
        relatedEvidence,
        posture: stateAtExecution.posture,
    });
    return {
        schemaVersion: REPLAY_EXECUTION_SCHEMA,
        generatedAt: nowIso(),
        executionId: digest.id,
        rootDir: paths.projectRoot,
        determinism: {
            immutableOnly: true,
            artifactHash,
            warnings,
        },
        execution: digest,
        timeline: executionTimeline(record),
        relatedEvents,
        relatedEvidence,
        predictedVsActual: {
            predictedRisk: digest.narrative?.riskLevel || null,
            expectedImprovement: digest.narrative?.expectedImprovement || null,
            actualSuccess: digest.success,
            actualTrend: digest.trend,
            blocking: digest.blocking,
            advisory: digest.advisory,
        },
        resultingPosture: {
            runCount: stateAtExecution.posture.runCount,
            passRate: stateAtExecution.posture.passRate,
            blockRate: stateAtExecution.posture.blockRate,
            regressionRate: stateAtExecution.posture.regressionRate,
            latestVerdict: stateAtExecution.posture.latestVerdict,
        },
        reconstruction: stateAtExecution.reconstruction,
    };
}
function replayWorkspace(request, cwd = process.cwd()) {
    const at = request.at ? parseRequiredTimestamp(request.at) : nowIso();
    const state = replayGovernanceState({
        at,
        workspaceId: request.workspaceId,
        includeEvents: true,
        eventLimit: 300,
    }, cwd);
    const executionsForWorkspace = state.timeline.filter((entry) => entry.kind === 'execution');
    const failed = state.blockedExecutions.length;
    const total = executionsForWorkspace.length;
    const succeeded = Math.max(0, total - failed);
    const blockRate = total > 0 ? Math.round((failed / total) * 10000) / 100 : 0;
    const passRate = total > 0 ? Math.round((succeeded / total) * 10000) / 100 : 0;
    const warnings = [...state.determinism.warnings];
    return {
        schemaVersion: REPLAY_WORKSPACE_SCHEMA,
        generatedAt: nowIso(),
        asOf: at,
        rootDir: state.rootDir,
        workspaceId: state.workspace.workspaceId,
        workspaceName: state.workspace.workspaceName,
        activeWorkspaceId: state.workspace.activeWorkspaceId,
        snapshotId: state.workspace.snapshotId,
        action: state.workspace.action,
        posture: state.workspace.posture,
        definition: state.workspace.definition,
        executionSummary: {
            total,
            succeeded,
            failed,
            passRate,
            blockRate,
        },
        hotspotSummary: state.hotspots.slice(0, 20),
        recentEvents: state.events.slice(-50),
        determinism: {
            immutableOnly: true,
            artifactHash: stableHash({
                asOf: at,
                workspaceId: state.workspace.workspaceId,
                executionSummary: {
                    total,
                    succeeded,
                    failed,
                    passRate,
                    blockRate,
                },
                hotspots: state.hotspots,
                events: state.events,
            }),
            warnings,
        },
        reconstruction: state.reconstruction,
    };
}
function replayTimeline(request = {}, cwd = process.cwd()) {
    const paths = toReplayPaths(cwd);
    const index = buildReplayIndex(paths.projectRoot);
    const from = request.from ? parseRequiredTimestamp(request.from) : null;
    const to = request.to ? parseRequiredTimestamp(request.to) : null;
    const fromMs = from ? Date.parse(from) : null;
    const toMsValue = to ? Date.parse(to) : null;
    const limit = normalizeTimelineLimit(request.limit);
    const items = [];
    for (const execution of index.executions) {
        const ts = toMs(execution.createdAt);
        if (ts === null)
            continue;
        if (fromMs !== null && ts < fromMs)
            continue;
        if (toMsValue !== null && ts > toMsValue)
            continue;
        items.push({
            timestamp: execution.createdAt,
            kind: 'execution',
            id: execution.id,
            source: execution.source,
            severity: riskFromCounts(execution.blocking, execution.advisory),
            summary: `${execution.type} ${execution.success ? 'success' : 'failure'} (${execution.trend})`,
            executionId: execution.id,
            workspaceId: request.workspaceId || null,
        });
    }
    for (const evidence of index.evidences) {
        const ts = toMs(evidence.timestamp);
        if (ts === null)
            continue;
        if (fromMs !== null && ts < fromMs)
            continue;
        if (toMsValue !== null && ts > toMsValue)
            continue;
        items.push({
            timestamp: evidence.timestamp,
            kind: 'evidence',
            id: evidence.file,
            source: evidence.ciMode ? 'ci' : 'cli',
            severity: riskFromCounts(evidence.blockingCount, evidence.advisoryCount),
            summary: `verification ${evidence.verdict}`,
            executionId: null,
            workspaceId: request.workspaceId || null,
        });
    }
    for (const event of index.runtimeEvents) {
        const ts = toMs(event.timestamp);
        if (ts === null)
            continue;
        if (fromMs !== null && ts < fromMs)
            continue;
        if (toMsValue !== null && ts > toMsValue)
            continue;
        if (request.workspaceId) {
            const workspaceId = asString(event.payload.workspaceId);
            if (workspaceId && workspaceId !== request.workspaceId)
                continue;
        }
        items.push({
            timestamp: event.timestamp,
            kind: 'event',
            id: event.id,
            source: event.source,
            severity: event.severity,
            summary: event.type,
            executionId: event.executionId,
            workspaceId: asString(event.payload.workspaceId),
        });
    }
    for (const snapshot of index.controlPlaneSnapshots) {
        const ts = toMs(snapshot.createdAt);
        if (ts === null)
            continue;
        if (fromMs !== null && ts < fromMs)
            continue;
        if (toMsValue !== null && ts > toMsValue)
            continue;
        items.push({
            timestamp: snapshot.createdAt,
            kind: 'control-plane',
            id: snapshot.snapshotId,
            source: snapshot.source,
            severity: snapshot.riskLevel,
            summary: `control-plane update (${snapshot.changedSections.join(', ') || 'no section changes'})`,
            executionId: null,
            workspaceId: null,
        });
    }
    for (const snapshot of index.workspaceSnapshots) {
        const ts = toMs(snapshot.createdAt);
        if (ts === null)
            continue;
        if (fromMs !== null && ts < fromMs)
            continue;
        if (toMsValue !== null && ts > toMsValue)
            continue;
        if (request.workspaceId && snapshot.workspaceId !== request.workspaceId)
            continue;
        items.push({
            timestamp: snapshot.createdAt,
            kind: 'workspace',
            id: snapshot.snapshotId,
            source: snapshot.source,
            severity: 'low',
            summary: `${snapshot.workspaceName} ${snapshot.action}`,
            executionId: snapshot.executionId,
            workspaceId: snapshot.workspaceId,
        });
    }
    items.sort((left, right) => {
        const leftMs = toMs(left.timestamp) ?? 0;
        const rightMs = toMs(right.timestamp) ?? 0;
        if (leftMs !== rightMs)
            return rightMs - leftMs;
        return left.id.localeCompare(right.id);
    });
    const trimmed = items.slice(0, limit);
    const warnings = buildDeterminismWarnings(index, index.controlPlaneSnapshots[index.controlPlaneSnapshots.length - 1] || null, index.workspaceSnapshots[index.workspaceSnapshots.length - 1] || null);
    return {
        schemaVersion: REPLAY_TIMELINE_SCHEMA,
        generatedAt: nowIso(),
        rootDir: paths.projectRoot,
        from,
        to,
        workspaceId: request.workspaceId || null,
        count: trimmed.length,
        items: trimmed,
        aggregate: {
            executions: trimmed.filter((entry) => entry.kind === 'execution').length,
            evidence: trimmed.filter((entry) => entry.kind === 'evidence').length,
            runtimeEvents: trimmed.filter((entry) => entry.kind === 'event').length,
            controlPlane: trimmed.filter((entry) => entry.kind === 'control-plane').length,
            workspace: trimmed.filter((entry) => entry.kind === 'workspace').length,
        },
        determinism: {
            immutableOnly: true,
            artifactHash: stableHash({
                from,
                to,
                workspaceId: request.workspaceId || null,
                items: trimmed,
            }),
            warnings,
        },
    };
}
function getWorkspaceSnapshotHistory(cwd = process.cwd(), limit = 50) {
    const paths = toReplayPaths(cwd);
    const index = buildReplayIndex(paths.projectRoot);
    return [...index.workspaceSnapshots]
        .sort((left, right) => (toMs(right.createdAt) ?? 0) - (toMs(left.createdAt) ?? 0))
        .slice(0, Math.max(1, Math.min(500, Math.floor(limit))));
}
function writeWorkspaceReplaySnapshot(input) {
    const paths = toReplayPaths(input.cwd || process.cwd());
    const snapshotsDir = paths.workspaceSnapshotsDir;
    (0, fs_1.mkdirSync)(snapshotsDir, { recursive: true });
    const createdAt = nowIso();
    const seed = {
        workspaceId: input.workspaceId,
        workspaceName: input.workspaceName,
        action: input.action,
        source: input.source,
        actor: input.actor,
        createdAt,
        executionId: input.executionId || null,
        activeWorkspaceId: input.activeWorkspaceId || null,
        workspace: input.workspace,
        posture: input.posture || null,
    };
    const snapshotId = `wss-${stableHash(seed).slice(0, 12)}`;
    const fileName = `workspace-snapshot-${createdAt.replace(/[.:]/g, '-')}-${snapshotId}.json`;
    const snapshotPath = (0, path_1.join)(snapshotsDir, fileName);
    const payload = {
        schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA,
        snapshotId,
        ...seed,
    };
    (0, fs_1.writeFileSync)(snapshotPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
    return { snapshotId, snapshotPath };
}
//# sourceMappingURL=replay-runtime.js.map