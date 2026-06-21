"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_CHANGE_RECORD_SIGNING_VERSION = exports.AI_CHANGE_RECORD_RECEIPT_SCHEMA_VERSION = exports.AI_CHANGE_RECORD_TYPE = exports.AI_CHANGE_RECORD_SCHEMA_VERSION = void 0;
exports.stableStringify = stableStringify;
exports.stableHash = stableHash;
exports.assertSourceFreeAIChangeRecordPayload = assertSourceFreeAIChangeRecordPayload;
exports.canonicalAIChangeRecordHash = canonicalAIChangeRecordHash;
exports.buildAIChangeRecordReceipt = buildAIChangeRecordReceipt;
exports.verifyAIChangeRecordReceipt = verifyAIChangeRecordReceipt;
exports.aiChangeRecordPath = aiChangeRecordPath;
exports.buildAIChangeRecord = buildAIChangeRecord;
exports.writeAIChangeRecord = writeAIChangeRecord;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const contracts_1 = require("@neurcode-ai/contracts");
const architecture_obligations_1 = require("./architecture-obligations");
const intent_privacy_1 = require("./intent-privacy");
exports.AI_CHANGE_RECORD_SCHEMA_VERSION = 'neurcode.governed-session-record.v1';
exports.AI_CHANGE_RECORD_TYPE = 'ai-change-accountability-record';
exports.AI_CHANGE_RECORD_RECEIPT_SCHEMA_VERSION = 'neurcode.ai-change-record-receipt.v1';
exports.AI_CHANGE_RECORD_SIGNING_VERSION = 'neurcode.ai-change-record-signing.v1';
const SOURCE_LIKE_KEYS = new Set([
    'content',
    'filecontent',
    'file_content',
    'sourcetext',
    'source_text',
    'sourcecode',
    'source_code',
    'diff',
    'difftext',
    'diff_text',
    'hunk',
    'hunks',
    'patch',
    'patchbody',
    'patch_body',
    'before',
    'after',
    'rawprompt',
    'raw_prompt',
    'promptwithsource',
    'prompt_with_source',
    'rawcontent',
    'raw_content',
    'privatecontent',
    'private_content',
    'commandbody',
    'command_body',
    'shellcommand',
    'shell_command',
    'shellcommandbody',
    'shell_command_body',
    'terminaloutput',
    'terminal_output',
    'secret',
    'secrets',
]);
function stableStringify(value) {
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        const entries = Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b));
        return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
function stableHash(value, length = 64) {
    return (0, node_crypto_1.createHash)('sha256').update(stableStringify(value)).digest('hex').slice(0, length);
}
function assertSourceFreeAIChangeRecordPayload(value, path = 'record') {
    if (Array.isArray(value)) {
        value.forEach((entry, index) => assertSourceFreeAIChangeRecordPayload(entry, `${path}[${index}]`));
        return;
    }
    if (!value || typeof value !== 'object')
        return;
    for (const [key, child] of Object.entries(value)) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
        const compactKey = normalizedKey.replace(/_/g, '');
        if (SOURCE_LIKE_KEYS.has(normalizedKey) || SOURCE_LIKE_KEYS.has(compactKey)) {
            throw new Error(`source-like AI Change Record key is not allowed: ${path}.${key}`);
        }
        assertSourceFreeAIChangeRecordPayload(child, `${path}.${key}`);
    }
}
function recordSigningPayload(record) {
    const { generatedAt: _generatedAt, integrity: _integrity, ...payload } = record;
    return payload;
}
function canonicalAIChangeRecordHash(record) {
    const payload = recordSigningPayload(record);
    assertSourceFreeAIChangeRecordPayload(payload);
    return stableHash(payload, 64);
}
function aiReceiptSignedPayload(receipt) {
    return {
        schemaVersion: receipt.schemaVersion,
        receiptId: receipt.receiptId,
        issuer: receipt.issuer,
        issuedAt: receipt.issuedAt,
        organizationId: receipt.organizationId,
        repoId: receipt.repoId,
        repoKey: receipt.repoKey,
        sessionId: receipt.sessionId,
        recordHash: receipt.recordHash,
        recordSchemaVersion: receipt.recordSchemaVersion,
        recordGeneratedAt: receipt.recordGeneratedAt,
        sourceFree: receipt.sourceFree,
        signingVersion: receipt.signingVersion,
        signingKeyId: receipt.signingKeyId,
        signatureAlgorithm: receipt.signatureAlgorithm,
    };
}
function aiReceiptHashPayload(receipt) {
    return {
        ...aiReceiptSignedPayload(receipt),
        canonicalHash: receipt.canonicalHash,
        signatureStatus: receipt.signatureStatus,
        signingKeyId: receipt.signingKeyId,
        signatureAlgorithm: receipt.signatureAlgorithm,
        signature: receipt.signature,
    };
}
function hmacSha256(secret, payload) {
    return (0, node_crypto_1.createHmac)('sha256', secret).update(payload).digest('hex');
}
function safeEqualHex(left, right) {
    if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right))
        return false;
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return leftBuffer.length === rightBuffer.length && (0, node_crypto_1.timingSafeEqual)(leftBuffer, rightBuffer);
}
function buildAIChangeRecordReceipt(input) {
    const issuedAt = input.issuedAt || new Date().toISOString();
    const receiptId = input.receiptId || `acr_${stableHash({
        organizationId: input.organizationId,
        repoId: input.repoId,
        repoKey: input.repoKey,
        sessionId: input.sessionId,
        recordHash: input.recordHash,
    }, 24)}`;
    const unsigned = {
        schemaVersion: exports.AI_CHANGE_RECORD_RECEIPT_SCHEMA_VERSION,
        receiptId,
        issuer: 'neurcode-api',
        issuedAt,
        organizationId: input.organizationId,
        repoId: input.repoId,
        repoKey: input.repoKey,
        sessionId: input.sessionId,
        recordHash: input.recordHash,
        recordSchemaVersion: input.recordSchemaVersion || exports.AI_CHANGE_RECORD_SCHEMA_VERSION,
        recordGeneratedAt: input.recordGeneratedAt || null,
        sourceFree: true,
        signingVersion: exports.AI_CHANGE_RECORD_SIGNING_VERSION,
    };
    assertSourceFreeAIChangeRecordPayload(unsigned, 'receipt');
    const secret = (input.signingSecret || '').trim();
    const explicitSigningKeyId = (input.signingKeyId || '').trim();
    if (secret && !explicitSigningKeyId) {
        throw new Error('signingKeyId is required when signing AI Change Record receipts');
    }
    const signedPayload = {
        ...unsigned,
        signingKeyId: secret ? explicitSigningKeyId : null,
        signatureAlgorithm: 'hmac-sha256',
    };
    const canonical = stableStringify(signedPayload);
    const signature = secret ? hmacSha256(secret, canonical) : null;
    const receipt = {
        ...unsigned,
        canonicalHash: stableHash(signedPayload, 64),
        signatureStatus: signature ? 'signed' : 'unsigned_missing_secret',
        signingKeyId: signedPayload.signingKeyId,
        signatureAlgorithm: 'hmac-sha256',
        signature,
        receiptHash: '',
        verification: {
            algorithm: 'hmac-sha256',
            signedFields: [
                'schemaVersion',
                'receiptId',
                'issuer',
                'issuedAt',
                'organizationId',
                'repoId',
                'repoKey',
                'sessionId',
                'recordHash',
                'recordSchemaVersion',
                'recordGeneratedAt',
                'sourceFree',
                'signingVersion',
                'signingKeyId',
                'signatureAlgorithm',
            ],
            sourceFree: true,
        },
    };
    receipt.receiptHash = stableHash(aiReceiptHashPayload(receipt), 64);
    assertSourceFreeAIChangeRecordPayload(receipt, 'receipt');
    return receipt;
}
function verifyAIChangeRecordReceipt(input) {
    const receipt = asRecord(input.receipt);
    const reasons = [];
    if (!receipt) {
        return {
            valid: false,
            trustLevel: 'backend_signed_invalid',
            status: 'tampered',
            receiptId: null,
            recordHash: null,
            signingKeyId: null,
            sourceFree: false,
            checks: { recordHash: false, canonicalHash: false, receiptHash: false, signature: false, sourceFree: false },
            reasons: ['receipt must be an object'],
        };
    }
    let sourceFree = true;
    try {
        assertSourceFreeAIChangeRecordPayload(receipt, 'receipt');
    }
    catch (error) {
        sourceFree = false;
        reasons.push(error instanceof Error ? error.message : String(error));
    }
    const candidate = aiReceiptSignedPayload({
        schemaVersion: receipt.schemaVersion,
        receiptId: String(receipt.receiptId ?? ''),
        issuer: receipt.issuer,
        issuedAt: String(receipt.issuedAt ?? ''),
        organizationId: String(receipt.organizationId ?? ''),
        repoId: receipt.repoId ?? null,
        repoKey: receipt.repoKey ?? null,
        sessionId: String(receipt.sessionId ?? ''),
        recordHash: String(receipt.recordHash ?? ''),
        recordSchemaVersion: String(receipt.recordSchemaVersion ?? ''),
        recordGeneratedAt: receipt.recordGeneratedAt ?? null,
        sourceFree: receipt.sourceFree,
        signingVersion: receipt.signingVersion,
        signingKeyId: typeof receipt.signingKeyId === 'string' ? receipt.signingKeyId : null,
        signatureAlgorithm: receipt.signatureAlgorithm,
    });
    if (receipt.schemaVersion !== exports.AI_CHANGE_RECORD_RECEIPT_SCHEMA_VERSION)
        reasons.push('receipt schema version mismatch');
    if (receipt.issuer !== 'neurcode-api')
        reasons.push('receipt issuer mismatch');
    if (receipt.signingVersion !== exports.AI_CHANGE_RECORD_SIGNING_VERSION)
        reasons.push('receipt signing version mismatch');
    if (receipt.signatureAlgorithm !== 'hmac-sha256')
        reasons.push('signature algorithm mismatch');
    if (receipt.sourceFree !== true)
        reasons.push('receipt is not marked source-free');
    const expectedSigningKeyId = (input.expectedSigningKeyId || '').trim();
    const signingKeyIdValid = !expectedSigningKeyId || receipt.signingKeyId === expectedSigningKeyId;
    if (!signingKeyIdValid)
        reasons.push('signing key id mismatch');
    const expectedCanonicalHash = stableHash(candidate, 64);
    const canonicalHashValid = receipt.canonicalHash === expectedCanonicalHash;
    if (!canonicalHashValid)
        reasons.push('canonical hash mismatch');
    const expectedReceiptHash = stableHash({
        ...candidate,
        canonicalHash: receipt.canonicalHash,
        signatureStatus: receipt.signatureStatus,
        signingKeyId: receipt.signingKeyId ?? null,
        signatureAlgorithm: receipt.signatureAlgorithm,
        signature: receipt.signature ?? null,
    }, 64);
    const receiptHashValid = receipt.receiptHash === expectedReceiptHash;
    if (!receiptHashValid)
        reasons.push('receipt hash mismatch');
    const expectedRecordHash = input.recordHash || null;
    const recordHashValid = !expectedRecordHash || receipt.recordHash === expectedRecordHash;
    if (!recordHashValid)
        reasons.push('record hash mismatch');
    let signatureValid = false;
    const secret = (input.signingSecret || '').trim();
    if (receipt.signatureStatus !== 'signed' || !receipt.signature) {
        reasons.push('receipt is unsigned');
    }
    else if (!secret) {
        reasons.push('signing secret is not configured for local verification');
    }
    else {
        const expectedSignature = hmacSha256(secret, stableStringify(candidate));
        signatureValid = safeEqualHex(receipt.signature, expectedSignature);
        if (!signatureValid)
            reasons.push('signature mismatch');
    }
    const requiredMetadataValid = receipt.schemaVersion === exports.AI_CHANGE_RECORD_RECEIPT_SCHEMA_VERSION
        && receipt.issuer === 'neurcode-api'
        && receipt.signingVersion === exports.AI_CHANGE_RECORD_SIGNING_VERSION
        && receipt.signatureAlgorithm === 'hmac-sha256'
        && receipt.sourceFree === true
        && signingKeyIdValid;
    const valid = sourceFree && requiredMetadataValid && canonicalHashValid && receiptHashValid && recordHashValid && signatureValid;
    const status = valid
        ? 'valid'
        : receipt.signatureStatus !== 'signed'
            ? 'unsigned'
            : !secret && sourceFree && canonicalHashValid && receiptHashValid && recordHashValid
                ? 'unverifiable'
                : 'tampered';
    const trustLevel = valid
        ? 'backend_signed_verified'
        : status === 'unverifiable'
            ? 'backend_signed_unverified'
            : 'backend_signed_invalid';
    return {
        valid,
        trustLevel,
        status,
        receiptId: typeof receipt.receiptId === 'string' ? receipt.receiptId : null,
        recordHash: typeof receipt.recordHash === 'string' ? receipt.recordHash : null,
        signingKeyId: typeof receipt.signingKeyId === 'string' ? receipt.signingKeyId : null,
        sourceFree,
        checks: {
            recordHash: recordHashValid,
            canonicalHash: canonicalHashValid,
            receiptHash: receiptHashValid,
            signature: signatureValid,
            sourceFree,
        },
        reasons,
    };
}
function eventTime(event) {
    const parsed = Date.parse(event.ts);
    return Number.isFinite(parsed) ? parsed : 0;
}
function sessionStartedAt(session) {
    return session.events.find((event) => event.type === 'session_start')?.ts ?? null;
}
function unique(values) {
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
function safeRepoTargets(values, kind) {
    return unique(Array.from(values).flatMap((value) => {
        const sanitized = (0, intent_privacy_1.sanitizeRepoRelativePath)(value, {
            allowGlobs: kind !== 'exact',
            requireGlob: kind === 'glob',
        });
        return sanitized.path ? [sanitized.path] : [];
    }));
}
function arrayOfStrings(value) {
    return Array.isArray(value) ? unique(value.filter((item) => typeof item === 'string')) : [];
}
function approvalContext(event) {
    const detail = event.detail && typeof event.detail === 'object' ? event.detail : {};
    const raw = detail['approvalContext'];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { owners: [], suggestedApprovalPath: null };
    }
    const context = raw;
    const suggestedApprovalPath = (0, intent_privacy_1.sanitizeRepoRelativePath)(context['suggestedApprovalPath'], {
        allowGlobs: false,
    }).path;
    return {
        owners: arrayOfStrings(context['owners']),
        suggestedApprovalPath,
    };
}
function buildTrajectory(events) {
    const byPath = new Map();
    for (const event of events) {
        if (event.type !== 'check_ok' && event.type !== 'check_warn' && event.type !== 'check_block')
            continue;
        if (!event.filePath)
            continue;
        const filePath = (0, intent_privacy_1.sanitizeRepoRelativePath)(event.filePath, { allowGlobs: false }).path;
        if (!filePath)
            continue;
        const existing = byPath.get(filePath);
        const context = approvalContext(event);
        const verdict = event.verdict || event.type.replace('check_', '');
        if (!existing) {
            byPath.set(filePath, {
                filePath,
                verdicts: [verdict],
                checks: 1,
                firstSeenAt: event.ts,
                lastSeenAt: event.ts,
                owners: context.owners,
                suggestedApprovalPath: context.suggestedApprovalPath,
            });
            continue;
        }
        existing.verdicts = unique([...existing.verdicts, verdict]);
        existing.checks += 1;
        existing.lastSeenAt = event.ts;
        existing.owners = unique([...existing.owners, ...context.owners]);
        existing.suggestedApprovalPath ||= context.suggestedApprovalPath;
    }
    return Array.from(byPath.values()).sort((a, b) => {
        const aTime = a.firstSeenAt ? Date.parse(a.firstSeenAt) : 0;
        const bTime = b.firstSeenAt ? Date.parse(b.firstSeenAt) : 0;
        return aTime - bTime || a.filePath.localeCompare(b.filePath);
    });
}
function planTimeline(revisions) {
    return (revisions ?? []).map((revision) => ({
        revision: revision.revision,
        kind: revision.kind,
        summary: null,
        capturedAt: revision.capturedAt,
        reason: null,
        expectedFiles: safeRepoTargets(revision.plan.expectedFiles, 'exact'),
        expectedGlobs: safeRepoTargets(revision.plan.expectedGlobs, 'glob'),
        constraints: [],
        risks: [],
    }));
}
function approvalStatus(grant, nowIso) {
    if (grant.revokedAt)
        return 'revoked';
    if (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.parse(nowIso))
        return 'expired';
    return 'active';
}
function approvalEntries(grants, nowIso) {
    return (grants ?? []).flatMap((grant) => {
        const path = (0, intent_privacy_1.sanitizeRepoRelativePath)(grant.path).path;
        if (!path)
            return [];
        return [{
                path,
                status: approvalStatus(grant, nowIso),
                source: grant.source,
                approvedAt: grant.approvedAt,
                expiresAt: grant.expiresAt ?? null,
                revokedAt: grant.revokedAt ?? null,
                approvedBy: grant.approvedBy ?? null,
                reason: 'approval_recorded',
                requestId: grant.requestId ?? null,
            }];
    }).sort((a, b) => {
        const aTime = Date.parse(a.approvedAt);
        const bTime = Date.parse(b.approvedAt);
        return aTime - bTime || a.path.localeCompare(b.path);
    });
}
function plural(count, singular, pluralText = `${singular}s`) {
    return `${count} ${count === 1 ? singular : pluralText}`;
}
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function asString(value) {
    return typeof value === 'string' ? value : null;
}
function asNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function asBoolean(value) {
    return value === true;
}
function asStringArray(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}
function agentPlanContinuitySnapshot(plan, activePlanRevision) {
    if (!plan || activePlanRevision === null)
        return null;
    return {
        activePlanRevision,
        summary: null,
        expectedFiles: unique(plan.expectedFiles),
        expectedGlobs: unique(plan.expectedGlobs),
        constraints: [],
        risks: [],
        source: plan.source || null,
    };
}
function latestIntentContinuityContext(events) {
    const event = [...events].reverse().find((candidate) => {
        const detail = asRecord(candidate.detail);
        return Boolean(asRecord(detail?.continuityContext));
    });
    const detail = asRecord(event?.detail);
    const context = asRecord(detail?.continuityContext);
    if (!context)
        return null;
    const clarification = asRecord(context.latestUserClarification);
    const accepted = asRecord(context.acceptedAgentProposal);
    const pending = asRecord(context.pendingPlanAmendment);
    const revision = asNumber(accepted?.activePlanRevision);
    return {
        latestUserClarification: clarification
            ? {
                summary: 'unavailable_by_design',
                promptLength: asNumber(clarification.promptLength),
                promptHash: asString(clarification.promptHash),
                recordedAt: asString(clarification.recordedAt),
                source: asString(clarification.source),
            }
            : null,
        acceptedAgentProposal: accepted && revision > 0
            ? {
                activePlanRevision: revision,
                summary: null,
                expectedFiles: asStringArray(accepted.expectedFiles),
                expectedGlobs: asStringArray(accepted.expectedGlobs),
                constraints: [],
                risks: [],
                source: asString(accepted.source),
            }
            : null,
        pendingPlanAmendment: pending
            ? {
                proposalId: asString(pending.proposalId) ?? 'unknown',
                previousRevision: asNumber(pending.previousRevision),
                proposedBy: asString(pending.proposedBy),
                reason: null,
                riskLevel: asString(pending.riskLevel),
                addedFiles: asStringArray(pending.addedFiles),
                addedGlobs: asStringArray(pending.addedGlobs),
                status: asString(pending.status),
            }
            : null,
        privacy: {
            sourceIncluded: false,
            rawPromptStored: false,
            summaryOnly: true,
        },
    };
}
function latestStructuralUnderstanding(events) {
    const event = [...events].reverse().find((candidate) => candidate.type === 'structural_understanding');
    const detail = asRecord(event?.detail);
    if (!detail)
        return null;
    const analysis = asRecord(detail.analysis) ?? {};
    const repoSymbolIndexRaw = asRecord(detail.repoSymbolIndex);
    const repoSymbolIndex = repoSymbolIndexRaw
        ? {
            schemaVersion: asString(repoSymbolIndexRaw.schemaVersion) ?? 'unknown',
            language: asString(repoSymbolIndexRaw.language) ?? 'typescript/javascript',
            indexedFileCount: asNumber(repoSymbolIndexRaw.indexedFileCount),
            indexedSymbolCount: asNumber(repoSymbolIndexRaw.indexedSymbolCount),
            exportedSymbolCount: asNumber(repoSymbolIndexRaw.exportedSymbolCount),
            localFunctionCount: asNumber(repoSymbolIndexRaw.localFunctionCount),
            changedCandidateCount: asNumber(repoSymbolIndexRaw.changedCandidateCount),
            indexHash: asString(repoSymbolIndexRaw.indexHash) ?? 'unknown',
            modelUsed: false,
            sourceStored: false,
        }
        : null;
    const changedSymbols = Array.isArray(detail.changedSymbols)
        ? detail.changedSymbols.flatMap((item) => {
            const row = asRecord(item);
            if (!row)
                return [];
            const file = asString(row.file);
            const name = asString(row.name);
            const kind = asString(row.kind);
            const action = asString(row.action);
            return file && name && kind && action ? [{ file, name, kind, action }] : [];
        })
        : [];
    const reuseFindings = Array.isArray(detail.reuseFindings)
        ? detail.reuseFindings.flatMap((item) => {
            const row = asRecord(item);
            const changed = asRecord(row?.changed);
            const existing = asRecord(row?.existing);
            const evidence = asRecord(row?.evidence);
            if (!row || !changed || !existing || !evidence)
                return [];
            const changedFile = asString(changed.file);
            const changedName = asString(changed.name);
            const changedKind = asString(changed.kind);
            const existingFile = asString(existing.file);
            const existingName = asString(existing.name);
            const existingKind = asString(existing.kind);
            if (!changedFile || !changedName || !changedKind || !existingFile || !existingName || !existingKind)
                return [];
            return [{
                    schemaVersion: asString(row.schemaVersion) ?? 'neurcode.reuse-finding.v1',
                    severity: asString(row.severity) ?? 'warn',
                    advisory: true,
                    hardBlock: false,
                    changed: {
                        file: changedFile,
                        name: changedName,
                        kind: changedKind,
                        exported: asBoolean(changed.exported),
                        signatureHash: asString(changed.signatureHash) ?? 'unknown',
                        tokenFingerprintHash: asString(changed.tokenFingerprintHash),
                    },
                    existing: {
                        file: existingFile,
                        name: existingName,
                        kind: existingKind,
                        exported: asBoolean(existing.exported),
                        signatureHash: asString(existing.signatureHash) ?? 'unknown',
                        tokenFingerprintHash: asString(existing.tokenFingerprintHash),
                    },
                    matchType: asString(row.matchType) ?? 'unknown',
                    confidence: asString(row.confidence) ?? 'medium',
                    reasonCodes: asStringArray(row.reasonCodes),
                    evidence: {
                        signatureHash: asString(evidence.signatureHash),
                        tokenFingerprintHash: asString(evidence.tokenFingerprintHash),
                        tokenShingleSetHash: asString(evidence.tokenShingleSetHash),
                        tokenOverlap: typeof evidence.tokenOverlap === 'number' ? evidence.tokenOverlap : null,
                        changedNormalizedTokenCount: asNumber(evidence.changedNormalizedTokenCount),
                        existingNormalizedTokenCount: asNumber(evidence.existingNormalizedTokenCount),
                    },
                    action: asString(row.action) ?? 'review_existing_helper_before_merging',
                    message: asString(row.message) ?? `${changedFile}#${changedName} resembles ${existingFile}#${existingName}`,
                    provenance: asString(row.provenance) ?? 'repo-symbol-index',
                }];
        }).slice(0, 20)
        : [];
    const topReferences = Array.isArray(detail.topReferences)
        ? detail.topReferences.flatMap((item) => {
            const row = asRecord(item);
            if (!row)
                return [];
            const targetFile = asString(row.targetFile);
            const targetSymbol = asString(row.targetSymbol);
            const referencingFile = asString(row.referencingFile);
            const line = asNumber(row.line);
            return targetFile && targetSymbol && referencingFile && line > 0
                ? [{
                        targetFile,
                        targetSymbol,
                        referencingFile,
                        referencingSymbol: asString(row.referencingSymbol),
                        line,
                        isTestFile: asBoolean(row.isTestFile),
                    }]
                : [];
        })
        : [];
    const suppressedArtifacts = Array.isArray(detail.suppressedArtifacts)
        ? detail.suppressedArtifacts.flatMap((item) => {
            const row = asRecord(item);
            if (!row)
                return [];
            const path = asString(row.path);
            const reasonCode = asString(row.reasonCode);
            return path && reasonCode ? [{ path, reasonCode }] : [];
        })
        : [];
    const digest = asRecord(detail.digest);
    const digestSummary = digest ? asRecord(digest.summary) : null;
    const digestHidden = digest ? asRecord(digest.hidden) : null;
    return {
        schemaVersion: asString(detail.schemaVersion) ?? 'unknown',
        artifactHash: asString(detail.artifactHash),
        artifactPath: asString(detail.artifactPath),
        analyzed: asBoolean(analysis.analyzed),
        reason: asString(analysis.reason),
        changedFileCount: asNumber(analysis.changedFileCount),
        changedSymbolCount: asNumber(analysis.changedSymbolCount),
        referenceCount: asNumber(analysis.referenceCount),
        testReferenceCount: asNumber(analysis.testReferenceCount),
        changedSymbols,
        repoSymbolIndex,
        reuseFindings,
        topReferences,
        suppressedArtifacts,
        consequenceUnderstanding: detail.consequenceUnderstanding ?? null,
        digest: digest
            ? {
                summary: digestSummary,
                hidden: digestHidden,
                topSymbols: Array.isArray(digest.topSymbols) ? digest.topSymbols : [],
                topConsequences: Array.isArray(digest.topConsequences) ? digest.topConsequences : [],
                topReferences: Array.isArray(digest.topReferences) ? digest.topReferences : [],
                limitations: asStringArray(digest.limitations),
            }
            : null,
        planAlignment: detail.planAlignment ?? null,
        boundaryImpact: Array.isArray(detail.boundaryImpact) ? detail.boundaryImpact : [],
    };
}
function latestRepoSymbolPolicy(events) {
    const event = [...events].reverse().find((candidate) => candidate.type === 'check_ok' || candidate.type === 'check_warn' || candidate.type === 'check_block');
    const detail = asRecord(event?.detail);
    const policy = asRecord(detail?.repoSymbolPolicy);
    if (!policy)
        return null;
    const freshness = asRecord(policy.freshness);
    const proposedChange = asRecord(detail?.proposedChange);
    const proposedHost = asRecord(proposedChange?.host);
    const proposedContent = asRecord(proposedChange?.content);
    const findings = Array.isArray(policy.findings) ? policy.findings.flatMap((item) => {
        const row = asRecord(item);
        const changed = asRecord(row?.changed);
        const evidence = asRecord(row?.evidence);
        if (!row || !changed || !evidence)
            return [];
        const changedFile = asString(changed.file);
        const changedName = asString(changed.name);
        const changedKind = asString(changed.kind);
        const changedLanguage = asString(changed.language);
        if (!changedFile || !changedName || !changedKind || !changedLanguage)
            return [];
        const existing = Array.isArray(row.existing)
            ? row.existing.flatMap((candidate) => {
                const itemRecord = asRecord(candidate);
                if (!itemRecord)
                    return [];
                const file = asString(itemRecord.file);
                const name = asString(itemRecord.name);
                const kind = asString(itemRecord.kind);
                const language = asString(itemRecord.language);
                if (!file || !name || !kind || !language)
                    return [];
                return [{
                        file,
                        name,
                        kind,
                        language,
                        exported: asBoolean(itemRecord.exported),
                        normalizedSignatureHash: asString(itemRecord.normalizedSignatureHash),
                        signatureHash: asString(itemRecord.signatureHash) ?? 'unknown',
                    }];
            })
            : [];
        return [{
                classification: asString(row.classification) ?? 'deterministic_symbol_duplicate',
                verdict: asString(row.verdict) ?? 'warn',
                strength: asString(row.strength) ?? 'same_function_name',
                changed: {
                    file: changedFile,
                    name: changedName,
                    kind: changedKind,
                    language: changedLanguage,
                    exported: asBoolean(changed.exported),
                    normalizedSignatureHash: asString(changed.normalizedSignatureHash),
                    signatureHash: asString(changed.signatureHash) ?? 'unknown',
                },
                existing,
                evidence: {
                    matchingFiles: asStringArray(evidence.matchingFiles),
                    existingSymbolCount: asNumber(evidence.existingSymbolCount),
                    reasonCodes: asStringArray(evidence.reasonCodes),
                    sourceFree: true,
                },
                message: asString(row.message) ?? `${changedFile}#${changedName} duplicates an existing symbol name`,
                provenance: asString(row.provenance) ?? 'repo-brain-index',
            }];
    }).slice(0, 20) : [];
    const advisoryRaw = asRecord(policy.advisorySimilarity);
    const advisorySimilarity = advisoryRaw
        ? {
            classification: 'advisory_similarity',
            evaluated: false,
            reason: asString(advisoryRaw.reason) ?? 'Semantic similarity was not used for deterministic enforcement.',
        }
        : null;
    return {
        schemaVersion: asString(policy.schemaVersion) ?? 'neurcode.repo-symbol-policy.v1',
        evaluated: asBoolean(policy.evaluated),
        verdict: asString(policy.verdict) ?? 'not_evaluated',
        policyMode: asString(policy.policyMode) ?? 'warn',
        classification: asString(policy.classification) ?? 'not_evaluated',
        reason: asString(policy.reason) ?? 'Repo symbol duplicate policy was not evaluated.',
        artifactHash: asString(policy.artifactHash),
        generatedAt: asString(policy.generatedAt),
        freshness: freshness
            ? {
                gitHead: asString(freshness.gitHead),
                workingTreeStatus: asString(freshness.workingTreeStatus),
            }
            : null,
        enforcement: proposedHost
            ? {
                adapterId: asString(proposedHost.adapterId) ?? 'unknown',
                capability: asString(proposedHost.capability) ?? 'not_supported',
                timing: asString(proposedHost.timing) ?? 'before_write',
                decisionBinding: asString(proposedHost.decisionBinding) ?? 'observed',
            }
            : null,
        contentAvailability: proposedContent
            ? {
                present: asBoolean(proposedContent.present),
                reason: asString(proposedContent.availabilityReason) ?? 'path_only_contract',
                contentHash: asString(proposedContent.contentHash),
                rawRetained: false,
            }
            : null,
        findings,
        advisorySimilarity,
        privacy: {
            sourceUploaded: false,
            sourceStored: false,
            diffStored: false,
            promptStored: false,
            evaluatedInMemoryOnly: true,
        },
    };
}
function latestRepoIntelligence(events) {
    const event = [...events].reverse().find((candidate) => candidate.type === 'check_ok' || candidate.type === 'check_warn' || candidate.type === 'check_block');
    const detail = asRecord(event?.detail);
    const evidence = asRecord(detail?.repoIntelligence);
    if (evidence?.schemaVersion !== contracts_1.REPO_INTELLIGENCE_EVIDENCE_SCHEMA_VERSION)
        return null;
    try {
        (0, contracts_1.assertSourceFreeRepoIntelligence)(evidence);
    }
    catch {
        return null;
    }
    const privacy = asRecord(evidence.privacy);
    if (privacy?.sourceUploaded !== false ||
        privacy?.sourceStored !== false ||
        privacy?.diffUploaded !== false ||
        privacy?.promptUploaded !== false ||
        privacy?.chatUploaded !== false ||
        privacy?.rawContentRetained !== false)
        return null;
    return JSON.parse(JSON.stringify(evidence));
}
function structuralImpactRows(understanding) {
    const consequence = asRecord(understanding?.consequenceUnderstanding);
    const rows = Array.isArray(consequence?.topImpacts) ? consequence.topImpacts : [];
    return rows.flatMap((item) => {
        const row = asRecord(item);
        if (!row)
            return [];
        const file = asString(row.file);
        const symbol = asString(row.symbol);
        const summary = asString(row.summary);
        if (!file || !symbol || !summary)
            return [];
        return [{
                file,
                symbol,
                summary,
                productionFiles: asStringArray(row.productionFiles).slice(0, 8),
                externalProductionConsumerCount: asNumber(row.externalProductionConsumerCount),
                changedProductionConsumerCount: asNumber(row.changedProductionConsumerCount),
                sensitiveConsumerCount: asNumber(row.sensitiveConsumerCount),
                approvalRequiredConsumerCount: asNumber(row.approvalRequiredConsumerCount),
                runtimeGovernanceConsumerCount: asNumber(row.runtimeGovernanceConsumerCount),
                highFanout: asBoolean(row.highFanout),
                architectureRelevant: asBoolean(row.architectureRelevant),
            }];
    }).slice(0, 5);
}
function reviewBriefSection(input) {
    return {
        ...input,
        facts: unique(input.facts).slice(0, 8),
        reviewFocus: unique(input.reviewFocus).slice(0, 8),
    };
}
function buildReviewBrief(input) {
    const impacts = structuralImpactRows(input.understanding.latest);
    const reuseFindings = input.understanding.latest?.reuseFindings ?? [];
    const checkedPaths = input.trajectory.map((item) => item.filePath);
    const blockedPathRows = input.trajectory
        .filter((item) => item.verdicts.includes('block'))
        .map((item) => ({
        filePath: item.filePath,
        approvalPath: item.suggestedApprovalPath || item.filePath,
        verdicts: item.verdicts,
    }));
    const blockedPaths = unique(blockedPathRows.map((item) => item.approvalPath));
    const approvedPaths = input.approvals
        .filter((item) => item.status === 'active')
        .map((item) => item.path);
    const containedBlockedPaths = input.session.status === 'finished'
        ? unique(blockedPathRows
            .filter((item) => !approvedPaths.includes(item.approvalPath) &&
            !item.verdicts.some((verdict) => verdict === 'ok' || verdict === 'warn'))
            .map((item) => item.approvalPath))
        : [];
    const unresolvedBlockedPaths = blockedPaths.filter((path) => !approvedPaths.includes(path) &&
        !containedBlockedPaths.includes(path));
    const blockingObligations = input.architecture.obligations
        .filter((item) => item.status === 'pending' && item.effectiveMode === 'block');
    const sensitiveImpactCount = impacts.filter((item) => item.sensitiveConsumerCount > 0 ||
        item.approvalRequiredConsumerCount > 0 ||
        item.runtimeGovernanceConsumerCount > 0 ||
        item.highFanout ||
        item.architectureRelevant).length;
    const escapingImpactCount = impacts.filter((item) => item.externalProductionConsumerCount > 0).length;
    const impactFocus = unique(impacts.flatMap((item) => [
        ...item.productionFiles,
        item.file,
    ]));
    const reuseFocus = unique(reuseFindings.flatMap((item) => [
        item.changed.file,
        item.existing.file,
    ]));
    const reviewFocus = unique([
        ...unresolvedBlockedPaths,
        ...blockedPaths,
        ...reuseFocus,
        ...impactFocus,
        ...input.trajectory.filter((item) => item.verdicts.includes('warn')).map((item) => item.filePath),
    ]).slice(0, 10);
    let verdict = 'ready_to_review';
    if (!input.replayHash) {
        verdict = 'evidence_incomplete';
    }
    else if (unresolvedBlockedPaths.length > 0 || blockingObligations.length > 0) {
        verdict = 'blocked_unresolved';
    }
    else if (input.session.counts.warn > 0 ||
        input.session.counts.block > 0 ||
        reuseFindings.length > 0 ||
        sensitiveImpactCount > 0 ||
        escapingImpactCount > 0 ||
        input.plan.pendingAmendments.length > 0) {
        verdict = 'needs_human_inspection';
    }
    const riskLabels = unique([
        verdict,
        input.session.counts.block > 0 ? 'boundary_block_observed' : null,
        input.session.counts.warn > 0 ? 'warning_observed' : null,
        containedBlockedPaths.length > 0 ? 'contained_boundary_denial' : null,
        escapingImpactCount > 0 ? 'outside_diff_consumers' : null,
        sensitiveImpactCount > 0 ? 'sensitive_or_runtime_consumers' : null,
        reuseFindings.length > 0 ? 'repo_reuse_advisory' : null,
        input.plan.pendingAmendments.length > 0 ? 'pending_replan' : null,
        blockingObligations.length > 0 ? 'blocking_architecture_obligation' : null,
    ]);
    const headline = verdict === 'ready_to_review'
        ? 'Ready for senior review'
        : verdict === 'needs_human_inspection'
            ? 'Human inspection recommended before accepting'
            : verdict === 'blocked_unresolved'
                ? 'Blocked items remain unresolved'
                : 'Evidence is incomplete until the session finishes';
    const sections = [
        reviewBriefSection({
            id: 'change_thesis',
            title: 'Change thesis',
            status: input.intent.contract || input.plan.activeSummary ? 'pass' : 'pending',
            summary: input.intent.contract?.summary || input.plan.activeSummary || input.session.goal || 'No intent or accepted plan summary was captured.',
            facts: [
                input.intent.contract?.primaryAction ? `intent action: ${input.intent.contract.primaryAction}` : 'intent action: unknown',
                `scope mode: ${input.session.scopeMode}`,
                input.plan.activeRevision ? `plan revision: ${input.plan.activeRevision}` : 'plan revision: none',
                input.plan.pendingAmendments.length > 0 ? `${plural(input.plan.pendingAmendments.length, 'pending amendment')}` : 'no pending amendments',
            ],
            reviewFocus: input.intent.expectedPathGlobs,
            provenance: input.intent.contract ? 'advisory' : 'deterministic',
        }),
        reviewBriefSection({
            id: 'what_changed',
            title: 'What changed',
            status: input.session.counts.block > 0 || input.session.counts.warn > 0 ? 'warn' : 'pass',
            summary: `${plural(input.trajectory.length, 'checked path')} across ${plural(input.session.counts.ok + input.session.counts.warn + input.session.counts.block, 'governed edit check')}.`,
            facts: [
                `${plural(input.session.counts.ok, 'ok verdict')}`,
                `${plural(input.session.counts.warn, 'warning')}`,
                `${plural(input.session.counts.block, 'block')}`,
                input.understanding.latest
                    ? `${plural(input.understanding.latest.changedSymbolCount, 'changed symbol')}, ${plural(input.understanding.latest.referenceCount, 'reference')}`
                    : 'no structural understanding artifact attached',
            ],
            reviewFocus: checkedPaths,
            provenance: 'deterministic',
        }),
        reviewBriefSection({
            id: 'what_could_break',
            title: 'What could break',
            status: escapingImpactCount > 0 || sensitiveImpactCount > 0 || reuseFindings.length > 0 ? 'warn' : impacts.length > 0 ? 'pass' : 'pending',
            summary: impacts.length > 0
                ? `${plural(impacts.length, 'ranked structural impact')} found; top impact: ${impacts[0].file}#${impacts[0].symbol}.`
                : reuseFindings.length > 0
                    ? `${plural(reuseFindings.length, 'repo-wide reuse advisory', 'repo-wide reuse advisories')} found; top match: ${reuseFindings[0].changed.file}#${reuseFindings[0].changed.name} -> ${reuseFindings[0].existing.file}#${reuseFindings[0].existing.name}.`
                    : 'No ranked structural impacts or reuse advisories were attached to this record.',
            facts: impacts.length > 0
                ? [
                    ...impacts.slice(0, 4).map((item) => item.summary),
                    ...reuseFindings.slice(0, 2).map((item) => item.message),
                ]
                : reuseFindings.length > 0
                    ? reuseFindings.slice(0, 4).map((item) => item.message)
                    : ['structural consequence and reuse facts unavailable or empty'],
            reviewFocus: unique([...reuseFocus, ...impactFocus]),
            provenance: 'deterministic',
        }),
        reviewBriefSection({
            id: 'governance_events',
            title: 'Governance events',
            status: unresolvedBlockedPaths.length > 0 ? 'block' : input.approvals.length > 0 || input.session.counts.block > 0 ? 'warn' : 'pass',
            summary: `${plural(input.session.counts.block, 'blocked write')} and ${plural(input.approvals.length, 'approval lifecycle entry', 'approval lifecycle entries')} are recorded.`,
            facts: [
                unresolvedBlockedPaths.length > 0
                    ? `${plural(unresolvedBlockedPaths.length, 'blocked path')} without active approval`
                    : 'no unresolved blocked paths',
                containedBlockedPaths.length > 0
                    ? `${plural(containedBlockedPaths.length, 'contained boundary denial')}`
                    : 'no contained boundary denials',
                `${plural(input.approvals.filter((item) => item.status === 'active').length, 'active approval')}`,
                `${plural(input.approvals.filter((item) => item.status === 'revoked').length, 'revoked approval')}`,
                `${plural(blockingObligations.length, 'blocking architecture obligation')}`,
            ],
            reviewFocus: unique([...blockedPaths, ...approvedPaths]),
            provenance: 'deterministic',
        }),
        reviewBriefSection({
            id: 'final_verdict',
            title: 'Final verdict',
            status: verdict === 'ready_to_review' ? 'pass' : verdict === 'blocked_unresolved' ? 'block' : 'warn',
            summary: headline,
            facts: riskLabels,
            reviewFocus,
            provenance: 'deterministic',
        }),
    ];
    return {
        schemaVersion: 'neurcode.review-brief.v1',
        verdict,
        headline,
        summary: `${headline}. Review focus: ${reviewFocus.length > 0 ? reviewFocus.slice(0, 4).join(', ') : 'none'}.`,
        riskLabels,
        reviewFocus,
        sections,
        generatedFrom: [
            'session contract',
            'checked-edit trajectory',
            'approval lifecycle',
            'architecture obligations',
            'local structural understanding',
            'repo-wide reuse advisories',
            'replay hash',
        ],
        limitations: [
            'No source code, diff hunks, patch content, or shell command bodies are included.',
            'Intent and plan summaries are advisory; verdict and review focus are deterministic record facts.',
            'Static structural understanding is TypeScript-focused and does not prove runtime behavior.',
            'Repo-wide reuse advisories are deterministic TypeScript/JavaScript fingerprints and signatures; they do not prove semantic equivalence and do not cover every language.',
        ],
    };
}
function pathDir(path) {
    const index = path.lastIndexOf('/');
    return index >= 0 ? path.slice(0, index + 1) : '';
}
function exactPathOnly(paths) {
    return paths.every((path) => !/[*!?\[\]{}]/.test(path) && !path.endsWith('/'));
}
function buildAccountabilitySummary(input) {
    const allowedPaths = unique(input.trajectory
        .filter((item) => item.verdicts.some((verdict) => verdict === 'ok'))
        .map((item) => item.filePath));
    const warnedPaths = unique(input.trajectory
        .filter((item) => item.verdicts.some((verdict) => verdict === 'warn'))
        .map((item) => item.filePath));
    const blockedRows = input.trajectory.filter((item) => item.verdicts.some((verdict) => verdict === 'block'));
    const blockedBoundaries = unique(blockedRows.map((item) => item.suggestedApprovalPath || item.filePath));
    const approvedExactPaths = unique(input.approvals
        .filter((item) => item.status === 'active')
        .map((item) => item.path));
    const boundaryOwners = unique(blockedRows.flatMap((item) => item.owners));
    const reuseAdvisoryReviewPaths = unique(input.reuseFindings.flatMap((item) => [
        item.changed.file,
        item.existing.file,
    ])).slice(0, 12);
    const neighboringSensitiveFilesBlocked = approvedExactPaths.some((approvedPath) => {
        const approvedDir = pathDir(approvedPath);
        if (!approvedDir)
            return false;
        return blockedRows.some((item) => {
            const blockedPath = item.suggestedApprovalPath || item.filePath;
            return blockedPath !== approvedPath && pathDir(blockedPath) === approvedDir;
        });
    });
    const assumptions = unique([
        input.session.goal ? null : 'No human-readable agent goal was recorded.',
        boundaryOwners.length === 0 && blockedBoundaries.length > 0
            ? 'Boundary ownership was not available from CODEOWNERS/runtime metadata for at least one blocked path.'
            : null,
        input.replayHash
            ? null
            : 'The record was generated before session finish; replay integrity is pending.',
        'Intent and plan summaries are advisory text captured from the session, separate from deterministic path and approval facts.',
    ]);
    return {
        schemaVersion: 'neurcode.change-accountability.v1',
        facts: {
            agentGoal: input.session.goal || 'No goal recorded',
            scopeMode: input.session.scopeMode,
            intendedScope: unique(input.scope.allowedGlobs),
            touchedPaths: unique(input.trajectory.map((item) => item.filePath)),
            allowedPaths,
            warnedPaths,
            blockedBoundaries,
            boundaryOwners,
            approvalRequired: blockedBoundaries.length > 0 || input.scope.approvalRequiredGlobs.length > 0,
            exactPathApprovalOnly: approvedExactPaths.length > 0 && exactPathOnly(approvedExactPaths),
            approvedExactPaths,
            neighboringSensitiveFilesBlocked,
            reuseAdvisoryCount: input.reuseFindings.length,
            reuseAdvisoryReviewPaths,
            evidenceReceipt: input.replayHash ? 'self_attested' : 'replay-pending',
            sourceExcluded: true,
        },
        assumptions,
        limitations: [
            'This local AI Change Record is self-attested unless a backend-signed receipt is attached and verified elsewhere.',
            'Paths, owners, verdicts, approvals, and hashes are included; source code, diff hunks, patch bodies, prompts, and secrets are excluded.',
            'Neighbor containment means a sibling blocked path remained denied after an exact approval; it is not a claim about runtime behavior.',
            'Repo-wide reuse advisories are deterministic TS/JS structural matches, not proof of semantic equivalence or intent.',
        ],
    };
}
function aiChangeRecordPath(projectRoot, sessionId) {
    return (0, node_path_1.join)(projectRoot, '.neurcode', 'sessions', `${sessionId}.change-record.json`);
}
const LOCAL_REPO_BRAIN_PATH = '.neurcode/repo-brain/index.json';
const LOCAL_REPO_BRAIN_SCHEMA = 'neurcode.local-repo-brain.v1';
function tryLoadRepoBrainRecord(projectRoot) {
    const path = (0, node_path_1.join)(projectRoot, LOCAL_REPO_BRAIN_PATH);
    try {
        if (!(0, node_fs_1.existsSync)(path)) {
            return { status: 'missing', artifactHash: null, generatedAt: null, declarationsIndexed: null, sensitiveFilesCount: null, ownerBoundaryStatus: null, recoveryCommand: 'neurcode brain index' };
        }
        const raw = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        if (!raw || typeof raw !== 'object' || raw.schemaVersion !== LOCAL_REPO_BRAIN_SCHEMA) {
            return { status: 'missing', artifactHash: null, generatedAt: null, declarationsIndexed: null, sensitiveFilesCount: null, ownerBoundaryStatus: null, recoveryCommand: 'neurcode brain index' };
        }
        const s = raw.summary ?? {};
        return {
            status: 'found',
            artifactHash: typeof raw.artifactHash === 'string' ? raw.artifactHash : null,
            generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : null,
            declarationsIndexed: typeof s.symbolsIndexed === 'number' ? s.symbolsIndexed : null,
            sensitiveFilesCount: typeof s.sensitiveFiles === 'number' ? s.sensitiveFiles : null,
            ownerBoundaryStatus: s.ownerBoundaryStatus === 'found' || s.ownerBoundaryStatus === 'not_found' ? s.ownerBoundaryStatus : null,
            recoveryCommand: 'neurcode brain index',
        };
    }
    catch {
        return { status: 'missing', artifactHash: null, generatedAt: null, declarationsIndexed: null, sensitiveFilesCount: null, ownerBoundaryStatus: null, recoveryCommand: 'neurcode brain index' };
    }
}
function buildAIChangeRecord(session, options = {}) {
    const generatedAt = options.generatedAt ?? new Date().toISOString();
    const repoBrain = options.projectRoot ? tryLoadRepoBrainRecord(options.projectRoot) : null;
    const checkCounts = {
        ok: session.events.filter((event) => event.type === 'check_ok').length,
        warn: session.events.filter((event) => event.type === 'check_warn').length,
        block: session.events.filter((event) => event.type === 'check_block').length,
        approval: session.events.filter((event) => event.type === 'approval_decision').length,
        planEvents: session.events.filter((event) => event.type === 'plan_captured' ||
            event.type === 'plan_amended' ||
            event.type === 'plan_amendment_proposed' ||
            event.type === 'plan_amendment_decision').length,
        events: session.events.length,
    };
    const obligations = session.contract.architectureObligations ?? [];
    const intentContract = session.contract.intentContract ?? null;
    const activePlan = session.contract.agentPlan ?? null;
    const activePlanRevision = session.contract.agentPlanRevision ?? (activePlan ? 1 : null);
    const continuityContext = latestIntentContinuityContext(session.events);
    const intentSummary = (0, intent_privacy_1.buildIntentSummary)({
        content: [
            session.contract.goal,
            intentContract?.summary,
            activePlan?.summary,
            ...(activePlan?.steps ?? []),
        ].filter((value) => Boolean(value)).join('\n'),
        categories: [intentContract?.primaryAction ?? 'unknown', 'governance'],
        domains: intentContract?.target.domainKeywords ?? [],
        paths: [
            ...session.contract.allowedGlobs,
            ...session.contract.approvalRequiredGlobs,
            ...session.contract.approvedPaths,
            ...(intentContract?.target.pathTokens ?? []),
            ...(activePlan?.expectedFiles ?? []),
            ...(activePlan?.expectedGlobs ?? []),
            ...session.events.flatMap((event) => event.filePath ? [event.filePath] : []),
        ],
        planRevision: activePlanRevision,
        scopeMode: session.contract.scopeMode,
        ruleIds: obligations.map((obligation) => obligation.id),
        planSteps: activePlan?.steps.length ?? 0,
        events: session.events.length,
        actorType: 'human',
        createdAt: sessionStartedAt(session),
        updatedAt: session.finishedAt ?? session.events.at(-1)?.ts,
        redactionReasonCodes: session.privacy?.reasonCodes ?? [],
        provenanceClassification: 'shareable',
        provenanceSource: activePlanRevision && activePlanRevision > 1
            ? 'plan_amendment'
            : activePlan
                ? 'agent_plan'
                : 'session_start',
    });
    const safeIntentLabel = `intent-${intentSummary.intentHash.slice(0, 12)}`;
    const coreWithoutReviewBrief = {
        schemaVersion: exports.AI_CHANGE_RECORD_SCHEMA_VERSION,
        recordType: exports.AI_CHANGE_RECORD_TYPE,
        displayName: 'AI Change Record',
        generatedAt,
        privacy: {
            sourceUploaded: false,
            sourceFree: true,
            omittedFields: ['source code', 'diff hunks', 'patch content', 'raw prompts', 'raw chat', 'plan prose', 'shell command bodies'],
        },
        session: {
            sessionId: session.sessionId,
            repoName: session.repoName,
            status: session.status,
            goal: safeIntentLabel,
            scopeMode: session.contract.scopeMode,
            profileHash: session.profileHash,
            startedAt: sessionStartedAt(session),
            finishedAt: session.finishedAt ?? null,
            counts: checkCounts,
        },
        intent: {
            summary: intentSummary,
            userGoal: safeIntentLabel,
            contract: null,
            expectedPathGlobs: intentSummary.paths,
            riskNotes: [],
            latestUserClarification: continuityContext?.latestUserClarification ?? null,
            acceptedAgentProposal: continuityContext?.acceptedAgentProposal
                ?? agentPlanContinuitySnapshot(activePlan, activePlanRevision),
            continuityContext,
        },
        plan: {
            activeRevision: activePlanRevision,
            activeSummary: null,
            timeline: planTimeline(session.contract.agentPlanRevisions),
            pendingAmendments: (session.contract.planAmendmentProposals ?? [])
                .filter((proposal) => proposal.status === 'pending')
                .map((proposal) => ({
                proposalId: proposal.proposalId,
                previousRevision: proposal.previousRevision,
                riskLevel: proposal.risk.level,
                requiresHumanApproval: proposal.risk.requiresHumanApproval,
                addedFiles: safeRepoTargets(proposal.risk.addedFiles, 'exact'),
                addedGlobs: safeRepoTargets(proposal.risk.addedGlobs, 'mixed'),
                reasons: [],
                createdAt: proposal.createdAt,
            })),
        },
        scope: {
            allowedGlobs: safeRepoTargets(session.contract.allowedGlobs, 'mixed'),
            approvalRequiredGlobs: safeRepoTargets(session.contract.approvalRequiredGlobs, 'mixed'),
            approvedPaths: safeRepoTargets(session.contract.approvedPaths, 'mixed'),
        },
        trajectory: buildTrajectory(session.events),
        architecture: {
            summary: (0, architecture_obligations_1.summarizeArchitectureObligations)(obligations),
            obligations: obligations.map((obligation) => ({
                id: obligation.id,
                title: obligation.title,
                severity: obligation.severity,
                status: obligation.status,
                effectiveMode: obligation.effectiveMode ?? 'warn',
                relatedPaths: safeRepoTargets([
                    obligation.requiredPath,
                    ...obligation.observedEvidence.map((item) => item.path),
                ], 'mixed'),
            })),
        },
        approvals: approvalEntries(session.contract.approvalGrants, generatedAt),
        understanding: {
            latest: latestStructuralUnderstanding(session.events),
        },
        repoBrain,
        repoSymbolPolicy: {
            latest: latestRepoSymbolPolicy(session.events),
        },
        repoIntelligence: {
            latest: latestRepoIntelligence(session.events),
        },
        integrity: {
            replayHash: session.replayHash ?? null,
            replayHashStatus: session.replayHash ? 'present' : 'pending-session-finish',
            trustLevel: 'self_attested',
            receipt: {
                present: false,
                receiptId: null,
                keyId: null,
                signatureAlgorithm: null,
                signingVersion: null,
                signedAt: null,
                verificationStatus: 'self_attested',
            },
            deterministicFacts: [
                'session contract',
                'intent contract',
                'agent plan revisions',
                'checked-edit trajectory',
                'approval lifecycle',
                'architecture obligations',
                'local structural understanding',
                'repo symbol duplicate policy evaluation',
                ...(latestRepoIntelligence(session.events)?.classification === 'deterministic'
                    ? ['repository intelligence v2 deterministic policy evaluation']
                    : []),
                'repo-wide TS/JS reuse advisories',
                'replay hash',
                ...(repoBrain?.status === 'found' ? [`local repo brain (artifactHash: ${repoBrain.artifactHash})`] : []),
            ],
            advisoryFacts: [
                'intent summary',
                'plan coherence explanations',
                'architecture obligation explanations',
                ...(latestRepoIntelligence(session.events)?.advisory.length
                    ? ['repository intelligence v2 advisory findings']
                    : []),
            ],
        },
    };
    const core = {
        ...coreWithoutReviewBrief,
        accountability: buildAccountabilitySummary({
            session: coreWithoutReviewBrief.session,
            scope: coreWithoutReviewBrief.scope,
            trajectory: coreWithoutReviewBrief.trajectory,
            approvals: coreWithoutReviewBrief.approvals,
            reuseFindings: coreWithoutReviewBrief.understanding.latest?.reuseFindings ?? [],
            replayHash: coreWithoutReviewBrief.integrity.replayHash,
        }),
        reviewBrief: buildReviewBrief({
            session: coreWithoutReviewBrief.session,
            intent: coreWithoutReviewBrief.intent,
            plan: coreWithoutReviewBrief.plan,
            trajectory: coreWithoutReviewBrief.trajectory,
            architecture: coreWithoutReviewBrief.architecture,
            approvals: coreWithoutReviewBrief.approvals,
            understanding: coreWithoutReviewBrief.understanding,
            replayHash: coreWithoutReviewBrief.integrity.replayHash,
        }),
    };
    const record = {
        ...core,
        integrity: {
            ...core.integrity,
            recordHash: canonicalAIChangeRecordHash(core),
        },
    };
    assertSourceFreeAIChangeRecordPayload(record);
    return record;
}
function writeAIChangeRecord(projectRoot, session, options = {}) {
    const path = aiChangeRecordPath(projectRoot, session.sessionId);
    const dir = (0, node_path_1.join)(projectRoot, '.neurcode', 'sessions');
    if (!(0, node_fs_1.existsSync)(dir))
        (0, node_fs_1.mkdirSync)(dir, { recursive: true });
    const record = buildAIChangeRecord(session, { ...options, projectRoot });
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    (0, node_fs_1.writeFileSync)(tmp, JSON.stringify(record, null, 2) + '\n', 'utf8');
    (0, node_fs_1.renameSync)(tmp, path);
    return { record, path };
}
//# sourceMappingURL=ai-change-record.js.map