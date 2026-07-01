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
const runtime_receipt_1 = require("./runtime-receipt");
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
function uniqueSorted(values) {
    return Array.from(new Set(values.map(normalizeRepoPath).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}
function ownerValuesFrom(event) {
    const detail = event.detail;
    const raw = detail && typeof detail === 'object'
        ? detail.approvalContext
        : null;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return [];
    const owners = raw.owners;
    return Array.isArray(owners)
        ? owners.filter((owner) => typeof owner === 'string' && owner.trim().length > 0)
        : [];
}
function approvalPathFrom(event, key) {
    const detail = event.detail;
    const raw = detail && typeof detail === 'object'
        ? detail.approvalContext
        : null;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return null;
    const value = raw[key];
    return typeof value === 'string' && value.trim() ? normalizeRepoPath(value) : null;
}
function ownerCounts(events) {
    const counts = new Map();
    for (const event of events) {
        for (const owner of ownerValuesFrom(event)) {
            counts.set(owner, (counts.get(owner) ?? 0) + 1);
        }
    }
    return [...counts.entries()]
        .sort((left, right) => {
        if (right[1] !== left[1])
            return right[1] - left[1];
        return left[0].localeCompare(right[0]);
    })
        .map(([owner, count]) => ({ owner, count }));
}
function sanitizeIntentSummary(value) {
    if (!value || !value.trim())
        return null;
    const original = value;
    const compact = value
        .replace(/[\x00-\x1f\x7f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const sourceLike = original.includes('\n') ||
        /```|@@|\+\+\+|---|[{};]/.test(original) ||
        /\b(function|class|const|let|var|import|export|def|SELECT|INSERT|UPDATE|DELETE)\b/.test(original);
    if (sourceLike)
        return 'Sanitized governed-session intent available locally; raw task text withheld.';
    return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}
function buildReceiptSummary(trustLevel) {
    return {
        present: false,
        trustLevel,
        signatureStatus: null,
        verificationStatus: 'not_present',
        signedAt: null,
        verifier: null,
    };
}
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function optionalString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function receiptVerifier(receipt) {
    const verification = asRecord(receipt.verification);
    const url = optionalString(verification?.verificationUrl);
    return url || 'neurcode replay verify-receipt <receipt-json>';
}
function receiptTrustLevel(receipt, verification) {
    if (receipt.signatureStatus === 'signed' &&
        verification.sourceFree &&
        verification.checks.canonicalHash &&
        verification.checks.receiptHash) {
        return 'backend_signed';
    }
    return 'self_attested';
}
function assertReceiptMatchesAdmissionRecord(record, receipt) {
    if (receipt.sessionId !== record.sessionId) {
        throw new Error(`admission: backend receipt session ${receipt.sessionId} does not match admission session ${record.sessionId}`);
    }
    const admissionReplayHash = record.runtimeContext?.integrity.replayHash || record.sessionRefs[0]?.replayHash || null;
    if (admissionReplayHash && receipt.replayHash && admissionReplayHash !== receipt.replayHash) {
        throw new Error('admission: backend receipt replay hash does not match the admission record');
    }
}
function summarizeBackendReceipt(receipt, verification) {
    const trustLevel = receiptTrustLevel(receipt, verification);
    return {
        present: true,
        trustLevel,
        receiptId: receipt.receiptId,
        keyId: receipt.signingKeyId ?? null,
        replayHash: receipt.replayHash ?? null,
        signatureStatus: receipt.signatureStatus,
        verificationStatus: verification.status,
        signedAt: receipt.issuedAt,
        verifier: receiptVerifier(receipt),
    };
}
function withBackendReceiptSummary(record, receipt) {
    assertReceiptMatchesAdmissionRecord(record, receipt);
    const verification = (0, runtime_receipt_1.verifyRuntimeBackendEvidenceReceipt)(receipt);
    if (!verification.sourceFree || !verification.checks.canonicalHash || !verification.checks.receiptHash) {
        throw new Error(`admission: backend receipt failed source-free/hash validation: ${verification.reasons.join('; ') || verification.status}`);
    }
    if (!record.runtimeContext) {
        throw new Error('admission: runtime context is required before attaching backend receipt metadata');
    }
    const summary = summarizeBackendReceipt(receipt, verification);
    const trustLevel = summary.trustLevel;
    const next = {
        ...record,
        runtimeContext: {
            ...record.runtimeContext,
            trustLevel,
            integrity: {
                ...record.runtimeContext.integrity,
                replayHash: summary.replayHash ?? record.runtimeContext.integrity.replayHash,
                replayHashStatus: summary.replayHash ? 'present' : record.runtimeContext.integrity.replayHashStatus,
                evidenceIntegrityStatus: trustLevel === 'backend_signed'
                    ? 'backend_signed'
                    : record.runtimeContext.integrity.evidenceIntegrityStatus,
                receipt: summary,
            },
        },
    };
    (0, contracts_1.assertSourceFreeAdmissionValue)(next);
    return next;
}
function readBackendReceiptForSession(receiptPath, sessionId) {
    const parsed = JSON.parse((0, fs_1.readFileSync)(receiptPath, 'utf8'));
    const artifacts = (0, runtime_receipt_1.extractRuntimeReceiptArtifacts)(parsed);
    const matching = artifacts.filter((artifact) => artifact.receipt.sessionId === sessionId);
    const selected = matching[0] || artifacts[0];
    if (!selected) {
        throw new Error('admission: no runtime backend evidence receipt found in --receipt JSON');
    }
    return selected.receipt;
}
function buildRuntimeAdmissionContext(input) {
    const { session, manifest, capturedAt } = input;
    const events = Array.isArray(session.events) ? session.events : [];
    const invocation = (0, governance_runtime_1.buildAgentInvocationSummary)(session);
    const guard = (0, governance_runtime_1.buildAgentGuardPostureSummary)(session);
    const blockEvents = events.filter((event) => event.type === 'check_block');
    const approvalEvents = events.filter((event) => event.type === 'approval_decision');
    const approvedEvents = approvalEvents.filter((event) => event.decision === 'approved');
    const deniedEvents = approvalEvents.filter((event) => event.decision === 'denied' || event.decision === 'rejected' || event.decision === 'revoked');
    const changedPaths = uniqueSorted(manifest.coverage.map((entry) => entry.path));
    const blockedPaths = uniqueSorted(blockEvents.map((event) => approvalPathFrom(event, 'blockedPath') || event.filePath || ''));
    const suggestedApproval = uniqueSorted(blockEvents.map((event) => approvalPathFrom(event, 'suggestedApprovalPath') || event.filePath || ''));
    const approvedExact = uniqueSorted([
        ...(0, governance_runtime_1.activeApprovalPaths)(session.contract),
        ...approvedEvents.map((event) => event.filePath || approvalPathFrom(event, 'suggestedApprovalPath') || ''),
    ]);
    const denied = uniqueSorted(deniedEvents.map((event) => event.filePath || approvalPathFrom(event, 'blockedPath') || approvalPathFrom(event, 'suggestedApprovalPath') || ''));
    const approvalRequiredSurfaces = uniqueSorted(session.contract.approvalRequiredGlobs ?? []);
    const owners = ownerCounts(events);
    const replayHash = session.replayHash || null;
    const trustLevel = 'self_attested';
    const assuranceLevels = {};
    for (const grant of session.contract.approvalGrants ?? []) {
        const level = grant.assurance || 'unknown';
        assuranceLevels[level] = (assuranceLevels[level] ?? 0) + 1;
    }
    const dominantAssurance = Object.entries(assuranceLevels).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
        schemaVersion: 'neurcode.runtime-admission-context.v1',
        trustLevel,
        createdAt: capturedAt,
        sessionId: session.sessionId,
        sessionStatus: session.status,
        agentHost: {
            adapter: invocation.adapter,
            enforcementLevel: invocation.enforcementLevel,
            automatic: invocation.automatic,
        },
        intentSummary: sanitizeIntentSummary(session.contract.intentContract?.summary || session.contract.goal),
        scopeMode: session.contract.scopeMode,
        counts: {
            changedPaths: changedPaths.length,
            blockedPaths: blockedPaths.length,
            suggestedApprovalPaths: suggestedApproval.length,
            approvedExactPaths: approvedExact.length,
            deniedPaths: denied.length,
            approvalRequiredSurfaces: approvalRequiredSurfaces.length,
            owners: owners.length,
            preWriteChecks: invocation.preWriteCheckCount,
            allowedChecks: invocation.allowedCheckCount,
            warningChecks: invocation.warningCheckCount,
        },
        paths: {
            changed: changedPaths,
            blocked: blockedPaths,
            suggestedApproval,
            approvedExact,
            denied,
            approvalRequiredSurfaces,
        },
        owners,
        guard: {
            status: guard.status,
            verifiedPrewrite: guard.summary.verifiedPrewrite,
            deniedButChanged: guard.summary.deniedButChanged,
            unverifiedWrites: guard.summary.unverifiedWrites,
            observedAfterOnly: guard.summary.observedAfterOnly,
        },
        integrity: {
            sourceFree: true,
            replayHash,
            replayHashStatus: replayHash ? 'present' : 'missing',
            deltaHash: manifest.deltaHash,
            coverageSetHash: manifest.coverageSetHash,
            evidenceIntegrityStatus: 'local_self_attested',
            receipt: buildReceiptSummary(trustLevel),
        },
        approvalAssurance: {
            dominant: dominantAssurance,
            levels: assuranceLevels,
        },
    };
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
    const capturedAt = new Date().toISOString();
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
            capturedAt,
            ...(capture.baseRef ? { baseRef: capture.baseRef } : {}),
            ...(capture.headRef ? { headRef: capture.headRef } : {}),
        },
        manifest,
        runtimeContext: buildRuntimeAdmissionContext({ session, manifest, capturedAt }),
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
function exportSelfAttestedAdmissionRecord(repoRoot, sessionId, options = {}) {
    let record = (0, governance_runtime_1.readSelfAttestedAdmissionRecordFromText)((0, fs_1.readFileSync)(admissionRecordPath(repoRoot, sessionId), 'utf8'));
    if (!record) {
        throw new Error('admission: local record failed bounded structural validation');
    }
    if (options.receiptPath) {
        record = withBackendReceiptSummary(record, readBackendReceiptForSession(options.receiptPath, sessionId));
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