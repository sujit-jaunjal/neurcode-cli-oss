"use strict";
/**
 * Runtime Admission — local artifact emission (Phase A, CLI orchestration).
 *
 * Builds and writes `.neurcode/admission/<sessionId>.json`, a SELF-ATTESTED,
 * source-free record. It is a claim that a governed session produced these
 * effects — NOT cryptographic proof that governance ran (see disclaimer).
 *
 * This module keeps governance-runtime's finishSession pure: the admission
 * artifact is a separate file, emitted from the CLI finish paths and wrapped in
 * try/catch by callers so it can never break session finish. No source content,
 * diff hunks, patch text, excerpts, or secrets are ever written.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.admissionDir = admissionDir;
exports.admissionRecordPath = admissionRecordPath;
exports.publicAdmissionDir = publicAdmissionDir;
exports.publicAdmissionRecordPath = publicAdmissionRecordPath;
exports.buildGovernanceClassificationMap = buildGovernanceClassificationMap;
exports.emitSelfAttestedAdmissionRecord = emitSelfAttestedAdmissionRecord;
exports.exportSelfAttestedAdmissionRecord = exportSelfAttestedAdmissionRecord;
exports.tryEmitSelfAttestedAdmissionRecord = tryEmitSelfAttestedAdmissionRecord;
const fs_1 = require("fs");
const path_1 = require("path");
const contracts_1 = require("@neurcode-ai/contracts");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const git_coverage_1 = require("./git-coverage");
const runtime_connection_1 = require("./runtime-connection");
const PUBLIC_ADMISSION_DIR = '.neurcode-admission';
function artifactFileName(sessionId) {
    if (!/^[A-Za-z0-9._-]+$/.test(sessionId)) {
        throw new Error('admission: session id is not safe for an artifact filename');
    }
    return `${sessionId}.json`;
}
function admissionDir(repoRoot) {
    return (0, path_1.join)(repoRoot, '.neurcode', 'admission');
}
function admissionRecordPath(repoRoot, sessionId) {
    return (0, path_1.join)(admissionDir(repoRoot), artifactFileName(sessionId));
}
/** Tracked, explicit export seam for the future OSS advisory Action. */
function publicAdmissionDir(repoRoot) {
    return (0, path_1.join)(repoRoot, PUBLIC_ADMISSION_DIR);
}
function publicAdmissionRecordPath(repoRoot, sessionId) {
    return (0, path_1.join)(publicAdmissionDir(repoRoot), artifactFileName(sessionId));
}
function mapGuardClassification(classification, changeType) {
    const deleted = changeType === 'deleted';
    switch (classification) {
        case 'verified_prewrite':
            return deleted ? 'governed_delete' : 'governed_prewrite';
        case 'observed_after_only':
            return 'observed_postwrite';
        case 'denied_but_changed':
        case 'unverified_write':
        case 'prewrite_call_without_verdict':
        default:
            return 'ungoverned';
    }
}
/**
 * Derive a path → governance classification map from the session's source-free
 * agent-guard posture. Files with no guard evidence default to 'ungoverned'.
 */
function buildGovernanceClassificationMap(session, deletedPaths = new Set()) {
    const posture = (0, governance_runtime_1.buildAgentGuardPostureSummary)(session);
    const map = {};
    for (const file of posture.changedFiles) {
        if (!file.path)
            continue;
        const path = normalizeRepoPath(file.path);
        if (!path)
            continue;
        map[path] = {
            classification: mapGuardClassification(String(file.classification), deletedPaths.has(path) ? 'deleted' : String(file.changeType)),
            sessions: [session.sessionId],
        };
    }
    // Claude Code's native PreToolUse hook records deterministic check events
    // without an agent_guard_finished summary. Apply them after posture evidence so
    // the last decisive pre-write verdict wins for every path.
    for (const event of session.events) {
        if (event.type !== 'check_ok' && event.type !== 'check_warn' && event.type !== 'check_block')
            continue;
        const path = normalizeRepoPath(event.filePath ?? '');
        if (!path)
            continue;
        map[path] = {
            classification: event.type === 'check_block'
                ? 'ungoverned'
                : deletedPaths.has(path)
                    ? 'governed_delete'
                    : 'governed_prewrite',
            sessions: [session.sessionId],
        };
    }
    return map;
}
function normalizeRepoPath(path) {
    return path.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
/**
 * Build + write the self-attested admission artifact for a finished session.
 * Throws on capture/serialization failure; finish-path callers wrap in try/catch.
 */
function emitSelfAttestedAdmissionRecord(options) {
    const { repoRoot, session } = options;
    const capture = (0, git_coverage_1.captureWorktreeCoverage)(repoRoot, { baseRef: options.baseRef });
    const repo = (0, runtime_connection_1.collectRuntimeRepoMetadata)(repoRoot);
    const deletedPaths = new Set(capture.raw
        .filter((entry) => entry.newMode === '000000' || entry.newObjectId === null)
        .map((entry) => normalizeRepoPath(entry.path)));
    const governance = buildGovernanceClassificationMap(session, deletedPaths);
    const manifest = (0, governance_runtime_1.buildCoverageManifest)({
        rawDelta: capture.raw,
        governance,
        objectFormat: capture.objectFormat,
    });
    const record = {
        schemaVersion: contracts_1.SELF_ATTESTED_ADMISSION_RECORD_SCHEMA_VERSION,
        attestationKind: 'self-attested',
        admissionContractVersion: contracts_1.ADMISSION_CONTRACT_VERSION,
        disclaimer: contracts_1.SELF_ATTESTED_ADMISSION_DISCLAIMER,
        sessionId: session.sessionId,
        sessionRefs: [
            {
                sessionId: session.sessionId,
                ...(session.replayHash ? { replayHash: session.replayHash } : {}),
                ...(session.profileHash ? { profileHash: session.profileHash } : {}),
            },
        ],
        repo: {
            name: repo.name,
            rootHash: repo.rootHash,
            ...(repo.remoteHash ? { remoteHash: repo.remoteHash } : {}),
        },
        capture: {
            mode: 'worktree',
            capturedAt: new Date().toISOString(),
            ...(capture.baseRef ? { baseRef: capture.baseRef } : {}),
            ...(capture.headRef ? { headRef: capture.headRef } : {}),
        },
        manifest,
    };
    // Hard privacy gate: refuse to write anything that looks like source/secret.
    (0, contracts_1.assertSourceFreeAdmissionValue)(record);
    (0, fs_1.mkdirSync)(admissionDir(repoRoot), { recursive: true });
    const path = admissionRecordPath(repoRoot, session.sessionId);
    (0, fs_1.writeFileSync)(path, JSON.stringify(record, null, 2) + '\n', 'utf8');
    return { path, record };
}
/**
 * Explicitly export one selected local record into a source-controlled support
 * directory. Normal session completion never writes here.
 */
function exportSelfAttestedAdmissionRecord(repoRoot, sessionId) {
    const record = (0, governance_runtime_1.readSelfAttestedAdmissionRecordFromText)((0, fs_1.readFileSync)(admissionRecordPath(repoRoot, sessionId), 'utf8'));
    if (!record) {
        throw new Error('admission: local record failed bounded structural validation');
    }
    (0, contracts_1.assertSourceFreeAdmissionValue)(record);
    (0, fs_1.mkdirSync)(publicAdmissionDir(repoRoot), { recursive: true });
    const path = publicAdmissionRecordPath(repoRoot, sessionId);
    (0, fs_1.writeFileSync)(path, JSON.stringify(record, null, 2) + '\n', 'utf8');
    return { path, record };
}
/**
 * Best-effort wrapper for finish paths: emits the artifact, swallows and returns
 * any error so session finish is never disrupted.
 */
function tryEmitSelfAttestedAdmissionRecord(options) {
    try {
        return { ok: true, result: emitSelfAttestedAdmissionRecord(options) };
    }
    catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}
//# sourceMappingURL=admission-artifact.js.map