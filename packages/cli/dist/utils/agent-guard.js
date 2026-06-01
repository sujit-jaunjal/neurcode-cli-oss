"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_GUARD_SCHEMA_VERSION = void 0;
exports.captureAgentGuardSnapshot = captureAgentGuardSnapshot;
exports.createAgentGuardArtifact = createAgentGuardArtifact;
exports.defaultAgentGuardPath = defaultAgentGuardPath;
exports.writeAgentGuardArtifact = writeAgentGuardArtifact;
exports.readAgentGuardArtifact = readAgentGuardArtifact;
exports.evaluateAgentGuard = evaluateAgentGuard;
exports.markAgentGuardFinished = markAgentGuardFinished;
const node_crypto_1 = require("node:crypto");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
exports.AGENT_GUARD_SCHEMA_VERSION = 'neurcode.agent-guard.v1';
function normalizeRepoPath(value) {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function sha256Hex(input) {
    return (0, node_crypto_1.createHash)('sha256').update(input).digest('hex');
}
function isInternalPath(path) {
    return path === '.neurcode' || path.startsWith('.neurcode/');
}
function uniqueSorted(values) {
    return [...new Set(values.map(normalizeRepoPath).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));
}
function listRepoFiles(repoRoot) {
    const output = (0, node_child_process_1.execFileSync)('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    return uniqueSorted(output.split('\0')).filter((path) => !isInternalPath(path));
}
function treeHash(files) {
    return sha256Hex(JSON.stringify(files.map((file) => ({
        path: file.path,
        digest: file.digest,
        size: file.size,
    }))));
}
function captureAgentGuardSnapshot(repoRoot) {
    const files = [];
    for (const path of listRepoFiles(repoRoot)) {
        const absolutePath = (0, node_path_1.resolve)(repoRoot, path);
        try {
            const stat = (0, node_fs_1.statSync)(absolutePath);
            if (!stat.isFile())
                continue;
            files.push({
                path,
                digest: sha256Hex((0, node_fs_1.readFileSync)(absolutePath)),
                size: stat.size,
            });
        }
        catch {
            // A file can disappear between git listing and read. The next evaluation
            // will classify it from the stable baseline/current snapshot pair.
        }
    }
    return files.sort((left, right) => left.path.localeCompare(right.path));
}
function createAgentGuardArtifact(input) {
    const startedAt = input.startedAt || new Date().toISOString();
    const files = captureAgentGuardSnapshot(input.repoRoot);
    return {
        schemaVersion: exports.AGENT_GUARD_SCHEMA_VERSION,
        guardId: `agent_guard_${(0, node_crypto_1.randomUUID)()}`,
        sessionId: input.sessionId,
        agent: input.agent,
        adapter: input.adapter,
        repoRoot: input.repoRoot,
        startedAt,
        updatedAt: startedAt,
        finishedAt: null,
        active: true,
        baseline: {
            fileCount: files.length,
            treeHash: treeHash(files),
            files,
        },
        privacy: {
            metadataOnly: true,
            sourceUploaded: false,
            sourceIncluded: false,
            localContentDigestsOnly: true,
        },
    };
}
function defaultAgentGuardPath(repoRoot, sessionId) {
    return (0, node_path_1.resolve)(repoRoot, '.neurcode', 'agent-guard', `${sessionId}.json`);
}
function activePointerPath(repoRoot) {
    return (0, node_path_1.resolve)(repoRoot, '.neurcode', 'agent-guard', 'active.json');
}
function writeAgentGuardArtifact(repoRoot, artifact, artifactPath) {
    const path = artifactPath && artifactPath.trim()
        ? (0, node_path_1.resolve)(repoRoot, artifactPath)
        : defaultAgentGuardPath(repoRoot, artifact.sessionId);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
    (0, node_fs_1.writeFileSync)(path, JSON.stringify(artifact, null, 2) + '\n', 'utf8');
    const pointerPath = activePointerPath(repoRoot);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(pointerPath), { recursive: true });
    (0, node_fs_1.writeFileSync)(pointerPath, JSON.stringify({ sessionId: artifact.sessionId, path }, null, 2) + '\n', 'utf8');
    return path;
}
function readActivePointer(repoRoot) {
    const path = activePointerPath(repoRoot);
    if (!(0, node_fs_1.existsSync)(path))
        return null;
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        if (!parsed || typeof parsed !== 'object')
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function isAgentGuardArtifact(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const record = value;
    const baseline = record.baseline;
    return record.schemaVersion === exports.AGENT_GUARD_SCHEMA_VERSION
        && typeof record.guardId === 'string'
        && typeof record.sessionId === 'string'
        && typeof record.agent === 'string'
        && typeof record.adapter === 'string'
        && typeof record.repoRoot === 'string'
        && typeof record.startedAt === 'string'
        && typeof record.updatedAt === 'string'
        && typeof record.active === 'boolean'
        && !!baseline
        && Array.isArray(baseline.files)
        && typeof baseline.treeHash === 'string';
}
function readAgentGuardArtifact(input) {
    const pointer = readActivePointer(input.repoRoot);
    const path = input.artifactPath && input.artifactPath.trim()
        ? (0, node_path_1.resolve)(input.repoRoot, input.artifactPath)
        : input.sessionId
            ? defaultAgentGuardPath(input.repoRoot, input.sessionId)
            : pointer?.path || '';
    if (!path) {
        return {
            path: defaultAgentGuardPath(input.repoRoot, input.sessionId || '<session-id>'),
            exists: false,
            artifact: null,
            error: 'No active agent guard found. Start one with `neurcode agent guard start`.',
        };
    }
    if (!(0, node_fs_1.existsSync)(path)) {
        return { path, exists: false, artifact: null };
    }
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        if (!isAgentGuardArtifact(parsed)) {
            return { path, exists: true, artifact: null, error: 'Invalid agent guard artifact schema.' };
        }
        return { path, exists: true, artifact: parsed };
    }
    catch (error) {
        return {
            path,
            exists: true,
            artifact: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
function snapshotMap(files) {
    return new Map(files.map((file) => [file.path, file]));
}
function changedFiles(baseline, current) {
    const before = snapshotMap(baseline);
    const now = snapshotMap(current);
    const changes = [];
    for (const [path, previous] of before.entries()) {
        const latest = now.get(path);
        if (!latest) {
            changes.push({ path, changeType: 'deleted' });
        }
        else if (latest.digest !== previous.digest || latest.size !== previous.size) {
            changes.push({ path, changeType: 'modified' });
        }
    }
    for (const path of now.keys()) {
        if (!before.has(path))
            changes.push({ path, changeType: 'created' });
    }
    return changes.sort((left, right) => left.path.localeCompare(right.path));
}
function eventTimestampAtOrAfter(event, startedAt) {
    const eventMs = Date.parse(event.ts);
    const startMs = Date.parse(startedAt);
    if (!Number.isFinite(eventMs) || !Number.isFinite(startMs))
        return true;
    return eventMs >= startMs;
}
function runtimeEventType(event) {
    const detail = event.detail && typeof event.detail === 'object'
        ? event.detail
        : null;
    return typeof detail?.runtimeEventType === 'string' ? detail.runtimeEventType : null;
}
function emptyEvidence() {
    return {
        preWriteCallCount: 0,
        allowedPreWriteCheckCount: 0,
        deniedPreWriteCheckCount: 0,
        postWriteObservationCount: 0,
        latestEventAt: null,
    };
}
function touchLatest(evidence, event) {
    if (!evidence.latestEventAt) {
        evidence.latestEventAt = event.ts;
        return;
    }
    const currentMs = Date.parse(evidence.latestEventAt);
    const nextMs = Date.parse(event.ts);
    if (!Number.isFinite(currentMs) || !Number.isFinite(nextMs) || nextMs >= currentMs) {
        evidence.latestEventAt = event.ts;
    }
}
function evidenceForSession(session, startedAt) {
    const evidence = new Map();
    const forPath = (path) => {
        const normalized = normalizeRepoPath(path);
        const existing = evidence.get(normalized);
        if (existing)
            return existing;
        const next = emptyEvidence();
        evidence.set(normalized, next);
        return next;
    };
    for (const event of session.events) {
        if (!eventTimestampAtOrAfter(event, startedAt))
            continue;
        const path = typeof event.filePath === 'string' ? normalizeRepoPath(event.filePath) : '';
        if (!path)
            continue;
        const item = forPath(path);
        if (event.type === 'agent_runtime_call' && runtimeEventType(event) === 'edit.before') {
            item.preWriteCallCount += 1;
            touchLatest(item, event);
        }
        else if (event.type === 'agent_runtime_call' && runtimeEventType(event) === 'edit.after') {
            item.postWriteObservationCount += 1;
            touchLatest(item, event);
        }
        else if (event.type === 'check_ok' || event.type === 'check_warn') {
            item.allowedPreWriteCheckCount += 1;
            touchLatest(item, event);
        }
        else if (event.type === 'check_block') {
            item.deniedPreWriteCheckCount += 1;
            touchLatest(item, event);
        }
    }
    return evidence;
}
function classify(evidence) {
    if (evidence.allowedPreWriteCheckCount > 0)
        return 'verified_prewrite';
    if (evidence.deniedPreWriteCheckCount > 0)
        return 'denied_but_changed';
    if (evidence.preWriteCallCount > 0)
        return 'prewrite_call_without_verdict';
    if (evidence.postWriteObservationCount > 0)
        return 'observed_after_only';
    return 'unverified_write';
}
function evaluateAgentGuard(repoRoot, artifact, session) {
    const generatedAt = new Date().toISOString();
    const current = captureAgentGuardSnapshot(repoRoot);
    const evidence = evidenceForSession(session, artifact.startedAt);
    const files = changedFiles(artifact.baseline.files, current)
        .map((change) => {
        const item = evidence.get(change.path) || emptyEvidence();
        return {
            ...change,
            classification: classify(item),
            evidence: item,
        };
    });
    const summary = {
        changedFiles: files.length,
        verifiedPrewrite: files.filter((file) => file.classification === 'verified_prewrite').length,
        unverifiedWrites: files.filter((file) => file.classification === 'unverified_write').length,
        deniedButChanged: files.filter((file) => file.classification === 'denied_but_changed').length,
        observedAfterOnly: files.filter((file) => file.classification === 'observed_after_only').length,
        prewriteCallsWithoutVerdict: files.filter((file) => file.classification === 'prewrite_call_without_verdict').length,
    };
    const pass = summary.unverifiedWrites === 0
        && summary.deniedButChanged === 0
        && summary.observedAfterOnly === 0
        && summary.prewriteCallsWithoutVerdict === 0;
    return {
        schemaVersion: exports.AGENT_GUARD_SCHEMA_VERSION,
        ok: true,
        pass,
        status: pass ? 'following_contract' : 'attention_required',
        generatedAt,
        guardId: artifact.guardId,
        sessionId: artifact.sessionId,
        agent: artifact.agent,
        adapter: artifact.adapter,
        repoRoot,
        summary,
        changedFiles: files,
        nextAction: pass
            ? 'Continue; changed files have matching allowed pre-write governance evidence.'
            : 'Review unverified or denied-but-changed paths. Re-run agent checks before edits, or approve exact paths before retrying.',
        privacy: artifact.privacy,
    };
}
function markAgentGuardFinished(artifact, finishedAt = new Date().toISOString()) {
    return {
        ...artifact,
        active: false,
        updatedAt: finishedAt,
        finishedAt,
    };
}
//# sourceMappingURL=agent-guard.js.map