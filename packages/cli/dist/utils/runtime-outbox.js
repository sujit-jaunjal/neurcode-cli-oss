"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_RUNTIME_DELIVERY_ATTEMPTS = exports.MAX_RUNTIME_DEAD_LETTER_EVENTS = exports.MAX_RUNTIME_OUTBOX_EVENTS = exports.RUNTIME_PRIVACY_AUDIT_SCHEMA_VERSION = exports.RUNTIME_DELIVERY_SCHEMA_VERSION = exports.LEGACY_RUNTIME_OUTBOX_SCHEMA_VERSION = exports.RUNTIME_OUTBOX_SCHEMA_VERSION = void 0;
exports.runtimeOutboxPath = runtimeOutboxPath;
exports.enqueueRuntimeSessionSnapshot = enqueueRuntimeSessionSnapshot;
exports.enqueueRuntimeApprovalAck = enqueueRuntimeApprovalAck;
exports.enqueueRuntimeScopeAmendmentAck = enqueueRuntimeScopeAmendmentAck;
exports.runtimeDeliveryEnvelope = runtimeDeliveryEnvelope;
exports.pendingRuntimeOutboxEvents = pendingRuntimeOutboxEvents;
exports.markRuntimeOutboxDelivered = markRuntimeOutboxDelivered;
exports.markRuntimeOutboxFailed = markRuntimeOutboxFailed;
exports.retryRuntimeDeadLetters = retryRuntimeDeadLetters;
exports.inspectRuntimeOutbox = inspectRuntimeOutbox;
exports.auditRuntimePrivacy = auditRuntimePrivacy;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const gitignore_1 = require("./gitignore");
const runtime_privacy_1 = require("./runtime-privacy");
exports.RUNTIME_OUTBOX_SCHEMA_VERSION = 'neurcode.runtime-outbox.v2';
exports.LEGACY_RUNTIME_OUTBOX_SCHEMA_VERSION = 'neurcode.runtime-outbox.v1';
exports.RUNTIME_DELIVERY_SCHEMA_VERSION = 'neurcode.runtime-delivery.v1';
exports.RUNTIME_PRIVACY_AUDIT_SCHEMA_VERSION = 'neurcode.runtime-privacy-audit.v1';
const OUTBOX_FILE = 'runtime-outbox.json';
const OUTBOX_LOCK = 'runtime-outbox.lock';
const OUTBOX_QUARANTINE_FILE = 'runtime-outbox-quarantine.json';
const OUTBOX_BACKUP_DIR = 'runtime-outbox-backups';
exports.MAX_RUNTIME_OUTBOX_EVENTS = 1_000;
exports.MAX_RUNTIME_DEAD_LETTER_EVENTS = 100;
exports.MAX_RUNTIME_DELIVERY_ATTEMPTS = 5;
const LOCK_STALE_MS = 10_000;
const SOURCE_LIKE_KEYS = new Set([
    'content',
    'fileContent',
    'file_content',
    'sourceText',
    'source_text',
    'diff',
    'diffText',
    'diff_text',
    'patch',
    'before',
    'after',
]);
function emptyOutbox() {
    return {
        schemaVersion: exports.RUNTIME_OUTBOX_SCHEMA_VERSION,
        nextSequenceBySession: {},
        events: [],
        deadLetters: [],
        quarantined: [],
        state: {
            lastEnqueuedAt: null,
            lastAttemptAt: null,
            lastDeliveredAt: null,
            lastDeliveredEventId: null,
            lastError: null,
            lastDeadLetteredAt: null,
            lastDeadLetteredEventId: null,
            lastDeadLetterError: null,
            lastRecoveredAt: null,
            lastPrivacyScanAt: null,
            lastPrivacyMigrationAt: null,
            lastPrivacyQuarantineAt: null,
        },
    };
}
function runtimeOutboxPath(repoRoot) {
    return (0, path_1.join)(repoRoot, '.neurcode', OUTBOX_FILE);
}
function outboxLockPath(repoRoot) {
    return (0, path_1.join)(repoRoot, '.neurcode', OUTBOX_LOCK);
}
function sleepSync(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        // Outbox mutations are tiny. A bounded synchronous wait avoids adding an
        // async lock protocol to hook call sites while still handling overlap.
    }
}
function withOutboxLock(repoRoot, action) {
    const lockPath = outboxLockPath(repoRoot);
    (0, fs_1.mkdirSync)((0, path_1.dirname)(lockPath), { recursive: true });
    let acquired = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
            (0, fs_1.mkdirSync)(lockPath);
            acquired = true;
            break;
        }
        catch {
            try {
                if (Date.now() - (0, fs_1.statSync)(lockPath).mtimeMs > LOCK_STALE_MS) {
                    (0, fs_1.rmSync)(lockPath, { recursive: true, force: true });
                    continue;
                }
            }
            catch {
                // Another process may have released the lock between the failed mkdir
                // and stat. Retry normally.
            }
            sleepSync(5);
        }
    }
    if (!acquired)
        throw new Error('runtime outbox is busy; retry the operation');
    try {
        return action();
    }
    finally {
        (0, fs_1.rmSync)(lockPath, { recursive: true, force: true });
    }
}
function stablePayloadHash(payload) {
    const stable = (value) => {
        if (Array.isArray(value))
            return `[${value.map(stable).join(',')}]`;
        if (value && typeof value === 'object') {
            return `{${Object.entries(value)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
                .join(',')}}`;
        }
        return JSON.stringify(value);
    };
    return (0, crypto_1.createHash)('sha256').update(stable(payload)).digest('hex').slice(0, 32);
}
function assertSourceFree(value, path = 'payload') {
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertSourceFree(item, `${path}[${index}]`));
        return;
    }
    if (!value || typeof value !== 'object')
        return;
    for (const [key, child] of Object.entries(value)) {
        if (SOURCE_LIKE_KEYS.has(key)) {
            throw new Error(`runtime outbox rejected source-like key ${path}.${key}`);
        }
        assertSourceFree(child, `${path}.${key}`);
    }
}
function isRuntimeOutboxEvent(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event))
        return false;
    const candidate = event;
    return candidate.schemaVersion === exports.RUNTIME_DELIVERY_SCHEMA_VERSION
        && typeof candidate.eventId === 'string'
        && typeof candidate.sessionId === 'string'
        && Number.isFinite(candidate.sequence)
        && (candidate.eventType === 'session_snapshot' || candidate.eventType === 'approval_ack' || candidate.eventType === 'scope_amendment_ack')
        && Boolean(candidate.payload)
        && typeof candidate.payload === 'object'
        && !Array.isArray(candidate.payload);
}
function isRuntimeDeadLetterEvent(event) {
    return isRuntimeOutboxEvent(event)
        && typeof event.deadLetteredAt === 'string'
        && typeof event.deadLetterReason === 'string';
}
function normalizeOutbox(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return emptyOutbox();
    const input = value;
    if (input.schemaVersion !== exports.RUNTIME_OUTBOX_SCHEMA_VERSION
        && input.schemaVersion !== exports.LEGACY_RUNTIME_OUTBOX_SCHEMA_VERSION)
        return emptyOutbox();
    return {
        schemaVersion: exports.RUNTIME_OUTBOX_SCHEMA_VERSION,
        nextSequenceBySession: input.nextSequenceBySession && typeof input.nextSequenceBySession === 'object'
            ? { ...input.nextSequenceBySession }
            : {},
        events: Array.isArray(input.events) ? input.events.filter(isRuntimeOutboxEvent) : [],
        deadLetters: Array.isArray(input.deadLetters) ? input.deadLetters.filter(isRuntimeDeadLetterEvent) : [],
        quarantined: Array.isArray(input.quarantined)
            ? input.quarantined.filter((entry) => Boolean(entry)
                && typeof entry === 'object'
                && typeof entry.eventId === 'string'
                && typeof entry.sessionId === 'string'
                && typeof entry.quarantinedAt === 'string')
            : [],
        state: {
            lastEnqueuedAt: input.state?.lastEnqueuedAt || null,
            lastAttemptAt: input.state?.lastAttemptAt || null,
            lastDeliveredAt: input.state?.lastDeliveredAt || null,
            lastDeliveredEventId: input.state?.lastDeliveredEventId || null,
            lastError: input.state?.lastError || null,
            lastDeadLetteredAt: input.state?.lastDeadLetteredAt || null,
            lastDeadLetteredEventId: input.state?.lastDeadLetteredEventId || null,
            lastDeadLetterError: input.state?.lastDeadLetterError || null,
            lastRecoveredAt: input.state?.lastRecoveredAt || null,
            lastPrivacyScanAt: input.state?.lastPrivacyScanAt || null,
            lastPrivacyMigrationAt: input.state?.lastPrivacyMigrationAt || null,
            lastPrivacyQuarantineAt: input.state?.lastPrivacyQuarantineAt || null,
        },
    };
}
function readOutbox(repoRoot) {
    const path = runtimeOutboxPath(repoRoot);
    try {
        if (!(0, fs_1.existsSync)(path))
            return emptyOutbox();
        return normalizeOutbox(JSON.parse((0, fs_1.readFileSync)(path, 'utf8')));
    }
    catch {
        return emptyOutbox();
    }
}
function writeOutbox(repoRoot, outbox) {
    const path = runtimeOutboxPath(repoRoot);
    (0, fs_1.mkdirSync)((0, path_1.dirname)(path), { recursive: true });
    (0, gitignore_1.ensureNeurcodeInGitignore)(repoRoot);
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    (0, fs_1.writeFileSync)(tmp, JSON.stringify(outbox, null, 2) + '\n', 'utf8');
    (0, fs_1.renameSync)(tmp, path);
}
function quarantinePath(repoRoot) {
    return (0, path_1.join)(repoRoot, '.neurcode', OUTBOX_QUARANTINE_FILE);
}
function readQuarantine(repoRoot) {
    try {
        const path = quarantinePath(repoRoot);
        if (!(0, fs_1.existsSync)(path)) {
            return {
                schemaVersion: 'neurcode.runtime-outbox-quarantine.v1',
                classification: 'local_private',
                entries: [],
            };
        }
        const parsed = JSON.parse((0, fs_1.readFileSync)(path, 'utf8'));
        return {
            schemaVersion: 'neurcode.runtime-outbox-quarantine.v1',
            classification: 'local_private',
            entries: Array.isArray(parsed.entries) ? parsed.entries.slice(-exports.MAX_RUNTIME_DEAD_LETTER_EVENTS) : [],
        };
    }
    catch {
        return {
            schemaVersion: 'neurcode.runtime-outbox-quarantine.v1',
            classification: 'local_private',
            entries: [],
        };
    }
}
function writeRestrictedJson(path, value) {
    (0, fs_1.mkdirSync)((0, path_1.dirname)(path), { recursive: true, mode: 0o700 });
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    (0, fs_1.writeFileSync)(tmp, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    (0, fs_1.chmodSync)(tmp, 0o600);
    (0, fs_1.renameSync)(tmp, path);
    (0, fs_1.chmodSync)(path, 0o600);
}
function writeQuarantine(repoRoot, entries) {
    const current = readQuarantine(repoRoot);
    const byEventId = new Map(current.entries.map((entry) => [entry.event.eventId, entry]));
    entries.forEach((entry) => byEventId.set(entry.event.eventId, entry));
    writeRestrictedJson(quarantinePath(repoRoot), {
        schemaVersion: 'neurcode.runtime-outbox-quarantine.v1',
        classification: 'local_private',
        entries: Array.from(byEventId.values())
            .sort((left, right) => left.quarantinedAt.localeCompare(right.quarantinedAt))
            .slice(-exports.MAX_RUNTIME_DEAD_LETTER_EVENTS),
    });
}
function createRestrictedBackup(repoRoot, outbox) {
    if (outbox.events.length === 0 && outbox.deadLetters.length === 0)
        return false;
    const backupPath = (0, path_1.join)(repoRoot, '.neurcode', OUTBOX_BACKUP_DIR, `runtime-outbox.${Date.now()}.json`);
    writeRestrictedJson(backupPath, {
        classification: 'local_private',
        reason: 'intent_privacy_migration_backup',
        outbox,
    });
    return true;
}
function preparePayload(eventType, payload) {
    assertSourceFree(payload);
    const rawValidation = (0, governance_runtime_1.validatePrivacySafeCloudPayload)(payload);
    const trustedTopologyRootMarkers = new Set();
    const rawSession = recordValue(payload.session);
    const rawContract = recordValue(rawSession?.contract);
    const rawTopology = recordValue(rawContract?.repositoryTopology);
    if (Array.isArray(rawTopology?.facts)) {
        rawTopology.facts.forEach((fact, index) => {
            if (recordValue(fact)?.path === '.') {
                trustedTopologyRootMarkers.add(`payload.session.contract.repositoryTopology.facts[${index}].path`);
            }
        });
    }
    const semanticPathIssues = rawValidation.issues.filter((issue) => /\.(?:path|filePath|paths|pathTokens|expectedFiles|expectedGlobs|allowedGlobs|sensitiveGlobs|approvalRequiredGlobs|approvedPaths|safeSupportGlobs|ignoredGlobs|expectedPathGlobs|supportPathGlobs|outOfScopeGlobs|addedFiles|addedGlobs|blockedPath|suggestedApprovalPath|requiredPath|appliedPath)(?:\[|\.|$)/i
        .test(issue.fieldPath)
        && !trustedTopologyRootMarkers.has(issue.fieldPath));
    if (semanticPathIssues.length > 0) {
        const description = semanticPathIssues
            .slice(0, 12)
            .map((issue) => `${issue.fieldPath}:${issue.reasonCode}`)
            .join(', ');
        throw new Error(`intent privacy validation failed (${description})`);
    }
    const projected = eventType === 'session_snapshot'
        ? (0, runtime_privacy_1.projectRuntimePayloadForCloud)(payload)
        : payload;
    assertRuntimeCloudPayloadShape(eventType, projected);
    assertSourceFree(projected);
    (0, governance_runtime_1.assertPrivacySafeCloudPayload)(projected);
    return projected;
}
function recordValue(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function assertAllowedKeys(value, allowed, path) {
    const record = recordValue(value);
    if (!record)
        throw new Error(`intent privacy validation failed (${path}:invalid_schema)`);
    const allowedKeys = new Set(allowed);
    const unknown = Object.keys(record).find((key) => !allowedKeys.has(key));
    if (unknown) {
        throw new Error(`intent privacy validation failed (${path}.${unknown}:forbidden_field)`);
    }
    return record;
}
function assertRuntimeSessionShape(value) {
    const session = assertAllowedKeys(value, [
        'schemaVersion',
        'cloudSchemaVersion',
        'runtimeLiveSchemaVersion',
        'sessionId',
        'repoName',
        'profileHash',
        'status',
        'completionStatus',
        'startedAt',
        'finishedAt',
        'replayHash',
        'intentSummary',
        'contract',
        'events',
        'livePayload',
        'privacy',
    ], 'payload.session');
    const summary = assertAllowedKeys(session.intentSummary, [
        'schemaVersion',
        'policyVersion',
        'intentHash',
        'categories',
        'domains',
        'paths',
        'planRevision',
        'scopeMode',
        'ruleIds',
        'counts',
        'actorType',
        'createdAt',
        'updatedAt',
        'redaction',
        'provenance',
        'contentAvailable',
    ], 'payload.session.intentSummary');
    assertAllowedKeys(summary.counts, [
        'characters',
        'lines',
        'paths',
        'planSteps',
        'events',
    ], 'payload.session.intentSummary.counts');
    assertAllowedKeys(summary.redaction, [
        'status',
        'reasonCodes',
    ], 'payload.session.intentSummary.redaction');
    assertAllowedKeys(summary.provenance, [
        'classification',
        'source',
    ], 'payload.session.intentSummary.provenance');
    assertAllowedKeys(session.contract, [
        'scopeMode',
        'allowedGlobs',
        'sensitiveGlobs',
        'approvalRequiredGlobs',
        'approvedPaths',
        'planRevision',
        'planVersionCount',
        'pendingPlanAmendmentCount',
        'architecture',
        'scopeAuthority',
        'ruleIds',
    ], 'payload.session.contract');
    const contract = recordValue(session.contract);
    assertAllowedKeys(contract?.architecture, [
        'total',
        'pending',
        'satisfied',
        'waived',
        'criticalPending',
    ], 'payload.session.contract.architecture');
    if (contract?.scopeAuthority !== undefined) {
        const scopeAuthority = assertAllowedKeys(contract.scopeAuthority, [
            'confidence',
            'expectedFiles',
            'expectedGlobs',
            'expectedSymbols',
            'likelyTests',
            'affectedPackages',
            'affectedModules',
            'prohibitedBoundaries',
            'selections',
            'unsupportedAreas',
            'brain',
        ], 'payload.session.contract.scopeAuthority');
        if (Array.isArray(scopeAuthority.selections)) {
            scopeAuthority.selections.forEach((selection, index) => {
                assertAllowedKeys(selection, [
                    'target', 'targetType', 'source', 'confidence', 'authority', 'evidenceType', 'factId', 'reason',
                ], `payload.session.contract.scopeAuthority.selections[${index}]`);
            });
        }
        assertAllowedKeys(scopeAuthority.brain, [
            'evaluated', 'freshness', 'reason',
        ], 'payload.session.contract.scopeAuthority.brain');
    }
    if (!Array.isArray(session.events)) {
        throw new Error('intent privacy validation failed (payload.session.events:invalid_schema)');
    }
    session.events.forEach((event, index) => {
        const eventRecord = assertAllowedKeys(event, [
            'type',
            'ts',
            'filePath',
            'verdict',
            'decision',
            'reasonCodes',
            'detail',
        ], `payload.session.events[${index}]`);
        if (eventRecord.detail !== undefined) {
            assertAllowedKeys(eventRecord.detail, [
                'boundaryVerdict',
                'blockType',
                'filePath',
                'operatorActionKind',
                'suggestedApprovalPath',
                'blockedPath',
                'owners',
                'planRevision',
                'planAmendmentStatus',
                'architectureStatus',
                'obligationId',
            ], `payload.session.events[${index}].detail`);
        }
    });
    assertAllowedKeys(session.livePayload, [
        'schemaVersion',
        'compacted',
        'originalEventCount',
        'includedEventCount',
        'rawIntentIncluded',
        'rawPlanIncluded',
        'rawChatIncluded',
        'localStateClassification',
    ], 'payload.session.livePayload');
    assertAllowedKeys(session.privacy, [
        'policyVersion',
        'classification',
        'sourceIncluded',
        'diffIncluded',
        'promptIncluded',
        'chatIncluded',
        'planProseIncluded',
        'contentUnavailableByDesign',
    ], 'payload.session.privacy');
}
function assertRuntimeCloudPayloadShape(eventType, payload) {
    if (eventType === 'approval_ack') {
        const ack = assertAllowedKeys(payload, ['approvalId', 'body'], 'payload');
        assertAllowedKeys(ack.body, [
            'status',
            'appliedPath',
            'expiresAt',
            'reasonCode',
        ], 'payload.body');
        return;
    }
    if (eventType === 'scope_amendment_ack') {
        const ack = assertAllowedKeys(payload, ['amendmentId', 'body'], 'payload');
        assertAllowedKeys(ack.body, [
            'status',
            'appliedRevision',
            'reasonCode',
        ], 'payload.body');
        return;
    }
    const envelope = assertAllowedKeys(payload, [
        'repo',
        'generatedAt',
        'session',
        'migration',
    ], 'payload');
    if (envelope.repo !== undefined) {
        const repo = assertAllowedKeys(envelope.repo, [
            'name',
            'repoKey',
            'rootHash',
            'remoteHash',
            'profileHash',
            'topologyHash',
            'profileFreshness',
            'runtimeAuthority',
            'topology',
            'brain',
            'pairing',
            'runtimeState',
            'source',
        ], 'payload.repo');
        if (repo.profileFreshness !== undefined) {
            assertAllowedKeys(repo.profileFreshness, [
                'status',
                'refreshed',
                'action',
                'sessionCompatibility',
                'checkedAt',
                'profilePath',
                'reasons',
                'cachedProfileHash',
                'cachedTopologyHash',
                'sessionProfileHash',
                'currentProfileHash',
                'currentTopologyHash',
                'trackedFileCount',
                'recoveryReason',
                'recoveryCommand',
                'unresolvedHumanDecisions',
            ], 'payload.repo.profileFreshness');
        }
        if (repo.runtimeAuthority !== undefined) {
            assertAllowedKeys(repo.runtimeAuthority, [
                'status',
                'manifestHash',
                'cliVersion',
                'packageOrBuildHash',
                'installationSource',
                'activatedAt',
                'integrationCount',
                'repairCommand',
            ], 'payload.repo.runtimeAuthority');
        }
        if (repo.topology !== undefined) {
            assertAllowedKeys(repo.topology, [
                'schemaVersion',
                'artifactHash',
                'trackedFileCount',
                'deterministicFacts',
                'advisoryFacts',
                'brainParticipated',
                'brainFreshness',
            ], 'payload.repo.topology');
        }
        if (repo.brain !== undefined) {
            assertAllowedKeys(repo.brain, [
                'state',
                'updatedAt',
                'filesScanned',
                'filesIndexed',
                'totalFiles',
                'percent',
                'reasonCodes',
                'unsupportedFacts',
                'retryCommand',
                'cancelCommand',
                'recoverCommand',
            ], 'payload.repo.brain');
        }
        if (repo.pairing !== undefined) {
            assertAllowedKeys(repo.pairing, [
                'repositoryOwnershipBound',
                'machineAuthenticated',
                'agentIntegrationActive',
                'cloudTransportConnected',
                'repoBrainReady',
                'governedSessionActive',
                'evidenceSynchronized',
            ], 'payload.repo.pairing');
        }
        if (repo.runtimeState !== undefined) {
            const runtimeState = assertAllowedKeys(repo.runtimeState, [
                'schemaVersion',
                'state',
                'governanceExpected',
                'protectedPathsFailClosed',
                'recoveryCommand',
                'evidence',
            ], 'payload.repo.runtimeState');
            if (runtimeState.evidence !== undefined) {
                const evidence = assertAllowedKeys(runtimeState.evidence, [
                    'metadataOnly',
                    'hooksOrAdapterInstalled',
                    'runtimeManifestPresent',
                    'profilePresent',
                    'profileReadable',
                    'activePointerPresent',
                    'activeSessionPresent',
                    'sessionProfileCompatible',
                    'trackedFileCount',
                    'ownershipBoundaryCount',
                    'approvalBoundaryCount',
                    'sensitiveBoundaryCounts',
                    'configuredBoundaryCount',
                    'reasonCodes',
                ], 'payload.repo.runtimeState.evidence');
                if (evidence.sensitiveBoundaryCounts !== undefined) {
                    assertAllowedKeys(evidence.sensitiveBoundaryCounts, [
                        'auth',
                        'crypto',
                        'secrets',
                        'payments',
                        'migrations',
                        'security',
                        'custom',
                    ], 'payload.repo.runtimeState.evidence.sensitiveBoundaryCounts');
                }
            }
        }
    }
    assertRuntimeSessionShape(envelope.session);
    if (envelope.migration !== undefined) {
        assertAllowedKeys(envelope.migration, [
            'from',
            'to',
            'reasonCodes',
        ], 'payload.migration');
    }
}
function payloadChanged(left, right) {
    return stablePayloadHash(left) !== stablePayloadHash(right);
}
function incrementReasonCounts(counts, reasons) {
    for (const reason of reasons)
        counts[reason] = (counts[reason] || 0) + 1;
}
function prepareRuntimeOutboxForDelivery(repoRoot, options = {}) {
    return withOutboxLock(repoRoot, () => {
        const outbox = readOutbox(repoRoot);
        const now = new Date().toISOString();
        const retained = [];
        const retainedDeadLetters = [];
        const quarantineEntries = [];
        const quarantineMetadata = [...outbox.quarantined];
        const reasonCodeCounts = {};
        let migrated = 0;
        let quarantined = 0;
        let backupCreated = false;
        const processEvent = (event, target, resetRetryState) => {
            try {
                const prepared = preparePayload(event.eventType, event.payload);
                if (payloadChanged(prepared, event.payload)) {
                    migrated += 1;
                    target.push({
                        ...event,
                        payload: prepared,
                        payloadHash: stablePayloadHash(prepared),
                        ...(resetRetryState ? { lastError: null, nextAttemptAt: null } : {}),
                    });
                }
                else {
                    target.push(event);
                }
            }
            catch (error) {
                const reasons = (0, runtime_privacy_1.privacyReasonCodesFromError)(error);
                incrementReasonCounts(reasonCodeCounts, reasons);
                quarantined += 1;
                quarantineEntries.push({ event, quarantinedAt: now, reasonCodes: reasons });
                quarantineMetadata.push({
                    eventId: event.eventId,
                    sessionId: event.sessionId,
                    eventType: event.eventType,
                    quarantinedAt: now,
                    reasonCodes: reasons,
                });
            }
        };
        for (const event of outbox.events) {
            processEvent(event, retained, true);
        }
        for (const event of outbox.deadLetters) {
            processEvent(event, retainedDeadLetters, false);
        }
        if (migrated > 0 || quarantined > 0) {
            if (options.createBackup !== false)
                backupCreated = createRestrictedBackup(repoRoot, outbox);
            if (quarantineEntries.length > 0)
                writeQuarantine(repoRoot, quarantineEntries);
            outbox.events = retained;
            outbox.deadLetters = trimDeadLetters(retainedDeadLetters);
            outbox.quarantined = Array.from(new Map(quarantineMetadata.map((entry) => [entry.eventId, entry])).values())
                .sort((left, right) => left.quarantinedAt.localeCompare(right.quarantinedAt))
                .slice(-exports.MAX_RUNTIME_DEAD_LETTER_EVENTS);
            outbox.state.lastPrivacyMigrationAt = migrated > 0 ? now : outbox.state.lastPrivacyMigrationAt;
            outbox.state.lastPrivacyQuarantineAt = quarantined > 0 ? now : outbox.state.lastPrivacyQuarantineAt;
        }
        outbox.state.lastPrivacyScanAt = now;
        writeOutbox(repoRoot, outbox);
        return { migrated, quarantined, backupCreated, reasonCodeCounts };
    });
}
function nextSequence(outbox, sessionId) {
    const sequence = Math.max(0, Number(outbox.nextSequenceBySession[sessionId] || 0)) + 1;
    outbox.nextSequenceBySession[sessionId] = sequence;
    return sequence;
}
function trimOutbox(events) {
    if (events.length <= exports.MAX_RUNTIME_OUTBOX_EVENTS)
        return events;
    const sorted = [...events].sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
    const actionAcks = sorted.filter((event) => event.eventType === 'approval_ack' || event.eventType === 'scope_amendment_ack');
    if (actionAcks.length >= exports.MAX_RUNTIME_OUTBOX_EVENTS) {
        return actionAcks.slice(-exports.MAX_RUNTIME_OUTBOX_EVENTS);
    }
    const snapshots = sorted.filter((event) => event.eventType === 'session_snapshot');
    const snapshotBudget = exports.MAX_RUNTIME_OUTBOX_EVENTS - actionAcks.length;
    const retainedSnapshots = snapshotBudget > 0 ? snapshots.slice(-snapshotBudget) : [];
    return [...actionAcks, ...retainedSnapshots]
        .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
}
function trimDeadLetters(events) {
    return [...events]
        .sort((left, right) => left.deadLetteredAt.localeCompare(right.deadLetteredAt))
        .slice(-exports.MAX_RUNTIME_DEAD_LETTER_EVENTS);
}
function enqueue(repoRoot, sessionId, eventType, payload) {
    const preparedPayload = preparePayload(eventType, payload);
    return withOutboxLock(repoRoot, () => {
        const outbox = readOutbox(repoRoot);
        const actionId = (eventType === 'approval_ack' || eventType === 'scope_amendment_ack')
            && (typeof preparedPayload.approvalId === 'string' || typeof preparedPayload.amendmentId === 'string')
            ? String(preparedPayload.approvalId || preparedPayload.amendmentId)
            : null;
        const actionStatus = (eventType === 'approval_ack' || eventType === 'scope_amendment_ack')
            && typeof preparedPayload.body === 'object'
            && preparedPayload.body !== null
            && typeof preparedPayload.body.status === 'string'
            ? preparedPayload.body.status
            : null;
        if (actionId) {
            const existing = outbox.events.find((event) => event.eventType === eventType
                && event.sessionId === sessionId
                && (event.payload.approvalId === actionId || event.payload.amendmentId === actionId)
                && (actionStatus === null
                    || (typeof event.payload.body === 'object'
                        && event.payload.body !== null
                        && event.payload.body.status === actionStatus)));
            if (existing)
                return existing;
        }
        const generatedAt = new Date().toISOString();
        const event = {
            schemaVersion: exports.RUNTIME_DELIVERY_SCHEMA_VERSION,
            eventId: `rt_${(0, crypto_1.randomUUID)()}`,
            sessionId,
            sequence: nextSequence(outbox, sessionId),
            eventType,
            generatedAt,
            payloadHash: stablePayloadHash(preparedPayload),
            payload: preparedPayload,
            attemptCount: 0,
            nextAttemptAt: null,
            lastAttemptAt: null,
            lastError: null,
        };
        const retained = eventType === 'session_snapshot'
            ? outbox.events.filter((candidate) => candidate.eventType !== 'session_snapshot' || candidate.sessionId !== sessionId)
            : outbox.events;
        outbox.events = trimOutbox([...retained, event]);
        outbox.state.lastEnqueuedAt = generatedAt;
        writeOutbox(repoRoot, outbox);
        return event;
    });
}
function enqueueRuntimeSessionSnapshot(repoRoot, sessionId, payload) {
    return enqueue(repoRoot, sessionId, 'session_snapshot', payload);
}
function enqueueRuntimeApprovalAck(repoRoot, sessionId, payload) {
    return enqueue(repoRoot, sessionId, 'approval_ack', payload);
}
function enqueueRuntimeScopeAmendmentAck(repoRoot, sessionId, payload) {
    return enqueue(repoRoot, sessionId, 'scope_amendment_ack', payload);
}
function runtimeDeliveryEnvelope(event) {
    return {
        schemaVersion: exports.RUNTIME_DELIVERY_SCHEMA_VERSION,
        eventId: event.eventId,
        sessionId: event.sessionId,
        sequence: event.sequence,
        eventType: event.eventType,
        generatedAt: event.generatedAt,
        payloadHash: event.payloadHash,
    };
}
function pendingRuntimeOutboxEvents(repoRoot, options = {}) {
    prepareRuntimeOutboxForDelivery(repoRoot);
    const nowMs = options.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(options.limit ?? 10, 100));
    return readOutbox(repoRoot).events
        .filter((event) => options.force === true
        || !event.nextAttemptAt
        || Date.parse(event.nextAttemptAt) <= nowMs)
        .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt))
        .slice(0, limit);
}
function markRuntimeOutboxDelivered(repoRoot, eventId) {
    withOutboxLock(repoRoot, () => {
        const outbox = readOutbox(repoRoot);
        const deliveredAt = new Date().toISOString();
        outbox.events = outbox.events.filter((event) => event.eventId !== eventId);
        outbox.state.lastAttemptAt = deliveredAt;
        outbox.state.lastDeliveredAt = deliveredAt;
        outbox.state.lastDeliveredEventId = eventId;
        if (!outbox.events.some((event) => event.lastError)) {
            if (outbox.state.lastError)
                outbox.state.lastRecoveredAt = deliveredAt;
            outbox.state.lastError = null;
        }
        writeOutbox(repoRoot, outbox);
    });
}
function markRuntimeOutboxFailed(repoRoot, eventId, error) {
    return withOutboxLock(repoRoot, () => {
        const outbox = readOutbox(repoRoot);
        const current = outbox.events.find((event) => event.eventId === eventId);
        if (!current)
            return { deadLettered: false, attemptCount: 0 };
        const attemptedAt = new Date().toISOString();
        const attemptCount = current.attemptCount + 1;
        if (attemptCount >= exports.MAX_RUNTIME_DELIVERY_ATTEMPTS) {
            const deadLetter = {
                ...current,
                attemptCount,
                lastAttemptAt: attemptedAt,
                nextAttemptAt: null,
                lastError: error,
                deadLetteredAt: attemptedAt,
                deadLetterReason: error,
            };
            outbox.events = outbox.events.filter((event) => event.eventId !== eventId);
            outbox.deadLetters = trimDeadLetters([...outbox.deadLetters, deadLetter]);
            outbox.state.lastDeadLetteredAt = attemptedAt;
            outbox.state.lastDeadLetteredEventId = eventId;
            outbox.state.lastDeadLetterError = error;
        }
        else {
            const retryDelayMs = Math.min(60_000, 1_000 * 2 ** Math.min(attemptCount - 1, 6));
            outbox.events = outbox.events.map((event) => event.eventId === eventId
                ? {
                    ...event,
                    attemptCount,
                    lastAttemptAt: attemptedAt,
                    nextAttemptAt: new Date(Date.now() + retryDelayMs).toISOString(),
                    lastError: error,
                }
                : event);
        }
        outbox.state.lastAttemptAt = attemptedAt;
        outbox.state.lastError = error;
        writeOutbox(repoRoot, outbox);
        return {
            deadLettered: attemptCount >= exports.MAX_RUNTIME_DELIVERY_ATTEMPTS,
            attemptCount,
        };
    });
}
function retryRuntimeDeadLetters(repoRoot, options = {}) {
    return withOutboxLock(repoRoot, () => {
        const outbox = readOutbox(repoRoot);
        const limit = Math.max(1, Math.min(options.limit ?? 100, 100));
        const selected = outbox.deadLetters
            .filter((event) => !options.eventId || event.eventId === options.eventId)
            .slice(0, limit);
        if (selected.length === 0)
            return 0;
        const requeued = selected.map(({ deadLetteredAt: _deadLetteredAt, deadLetterReason: _deadLetterReason, ...event }) => ({
            ...event,
            attemptCount: 0,
            nextAttemptAt: null,
            lastAttemptAt: null,
            lastError: null,
        }));
        outbox.events = trimOutbox([
            ...outbox.events,
            ...requeued,
        ]);
        const retainedIds = new Set(outbox.events.map((event) => event.eventId));
        const requeuedIds = new Set(requeued.filter((event) => retainedIds.has(event.eventId)).map((event) => event.eventId));
        outbox.deadLetters = outbox.deadLetters.filter((event) => !requeuedIds.has(event.eventId));
        if (!outbox.events.some((event) => event.lastError))
            outbox.state.lastError = null;
        writeOutbox(repoRoot, outbox);
        return requeuedIds.size;
    });
}
function inspectRuntimeOutbox(repoRoot) {
    const outbox = readOutbox(repoRoot);
    const sorted = [...outbox.events].sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
    const deadLetters = [...outbox.deadLetters].sort((left, right) => left.deadLetteredAt.localeCompare(right.deadLetteredAt));
    const retryingEvents = sorted.filter((event) => event.attemptCount > 0);
    const retries = sorted
        .map((event) => event.nextAttemptAt)
        .filter((value) => Boolean(value))
        .sort();
    return {
        schemaVersion: exports.RUNTIME_OUTBOX_SCHEMA_VERSION,
        health: deadLetters.length > 0 || outbox.quarantined.length > 0
            ? 'degraded'
            : retryingEvents.length > 0
                ? 'retrying'
                : sorted.length > 0
                    ? 'queued'
                    : 'healthy',
        pendingEvents: sorted.length,
        pendingSessionSnapshots: sorted.filter((event) => event.eventType === 'session_snapshot').length,
        pendingApprovalAcks: sorted.filter((event) => event.eventType === 'approval_ack' || event.eventType === 'scope_amendment_ack').length,
        retryingEvents: retryingEvents.length,
        deadLetterEvents: deadLetters.length,
        quarantinedEvents: outbox.quarantined.length,
        deadLetterSessionSnapshots: deadLetters.filter((event) => event.eventType === 'session_snapshot').length,
        deadLetterApprovalAcks: deadLetters.filter((event) => event.eventType === 'approval_ack' || event.eventType === 'scope_amendment_ack').length,
        oldestPendingAt: sorted[0]?.generatedAt || null,
        nextRetryAt: retries[0] || null,
        lastEnqueuedAt: outbox.state.lastEnqueuedAt,
        lastAttemptAt: outbox.state.lastAttemptAt,
        lastDeliveredAt: outbox.state.lastDeliveredAt,
        lastDeliveredEventId: outbox.state.lastDeliveredEventId,
        lastError: outbox.state.lastError,
        lastDeadLetteredAt: outbox.state.lastDeadLetteredAt,
        lastDeadLetteredEventId: outbox.state.lastDeadLetteredEventId,
        lastDeadLetterError: outbox.state.lastDeadLetterError,
        lastRecoveredAt: outbox.state.lastRecoveredAt,
    };
}
function scanSensitiveStrings(value, reasonCounts) {
    let found = false;
    const visit = (entry) => {
        if (typeof entry === 'string') {
            const sanitized = (0, governance_runtime_1.sanitizeLocalPrivateText)(entry, Math.max(entry.length, 1));
            if (sanitized.redacted) {
                found = true;
                incrementReasonCounts(reasonCounts, sanitized.reasonCodes);
            }
            return;
        }
        if (Array.isArray(entry)) {
            entry.forEach(visit);
            return;
        }
        if (!entry || typeof entry !== 'object')
            return;
        Object.values(entry).forEach(visit);
    };
    visit(value);
    return found;
}
function isPrivacySafeAIChangeRecord(value) {
    const envelopeRecord = value.record && typeof value.record === 'object' && !Array.isArray(value.record)
        ? value.record
        : value;
    const session = envelopeRecord.session && typeof envelopeRecord.session === 'object' && !Array.isArray(envelopeRecord.session)
        ? envelopeRecord.session
        : {};
    const intent = envelopeRecord.intent && typeof envelopeRecord.intent === 'object' && !Array.isArray(envelopeRecord.intent)
        ? envelopeRecord.intent
        : {};
    const summary = intent.summary;
    if (!(0, governance_runtime_1.isIntentSummaryV1)(summary))
        return false;
    const safeIntentLabel = `intent-${summary.intentHash.slice(0, 12)}`;
    if (session.goal !== safeIntentLabel || intent.userGoal !== safeIntentLabel)
        return false;
    const plan = envelopeRecord.plan && typeof envelopeRecord.plan === 'object' && !Array.isArray(envelopeRecord.plan)
        ? envelopeRecord.plan
        : {};
    if (plan.activeSummary !== null && plan.activeSummary !== undefined)
        return false;
    const timeline = Array.isArray(plan.timeline) ? plan.timeline : [];
    if (timeline.some((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            return true;
        const item = entry;
        return (item.summary !== null && item.summary !== undefined)
            || (item.reason !== null && item.reason !== undefined);
    }))
        return false;
    (0, governance_runtime_1.assertSourceFreeAIChangeRecordPayload)(envelopeRecord);
    return true;
}
function auditRuntimePrivacy(repoRoot, options = {}) {
    const repaired = options.repair === true
        ? prepareRuntimeOutboxForDelivery(repoRoot, { createBackup: true })
        : null;
    const outbox = readOutbox(repoRoot);
    const reasonCodeCounts = {};
    let safe = 0;
    let migrated = repaired?.migrated ?? 0;
    let pendingOutboxMigrations = 0;
    let pendingUnsafe = 0;
    let rejected = 0;
    let entriesScanned = outbox.quarantined.length;
    let filesScanned = (0, fs_1.existsSync)(runtimeOutboxPath(repoRoot)) ? 1 : 0;
    if ((0, fs_1.existsSync)(quarantinePath(repoRoot)))
        filesScanned += 1;
    for (const entry of outbox.quarantined) {
        incrementReasonCounts(reasonCodeCounts, entry.reasonCodes);
    }
    for (const event of [...outbox.events, ...outbox.deadLetters]) {
        entriesScanned += 1;
        try {
            const prepared = preparePayload(event.eventType, event.payload);
            if (payloadChanged(prepared, event.payload)) {
                migrated += 1;
                pendingOutboxMigrations += 1;
            }
            else
                safe += 1;
        }
        catch (error) {
            pendingUnsafe += 1;
            incrementReasonCounts(reasonCodeCounts, (0, runtime_privacy_1.privacyReasonCodesFromError)(error));
        }
    }
    const sessionDir = (0, path_1.join)(repoRoot, '.neurcode', 'sessions');
    if ((0, fs_1.existsSync)(sessionDir)) {
        for (const file of (0, fs_1.readdirSync)(sessionDir).filter((name) => name.endsWith('.json')).sort()) {
            filesScanned += 1;
            entriesScanned += 1;
            try {
                const value = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(sessionDir, file), 'utf8'));
                if (file.endsWith('.change-record.json')) {
                    const hasSensitiveText = scanSensitiveStrings(value, reasonCodeCounts);
                    if (hasSensitiveText) {
                        rejected += 1;
                        continue;
                    }
                    try {
                        if (isPrivacySafeAIChangeRecord(value))
                            safe += 1;
                        else {
                            migrated += 1;
                            reasonCodeCounts.legacy_raw_intent = (reasonCodeCounts.legacy_raw_intent || 0) + 1;
                        }
                    }
                    catch {
                        migrated += 1;
                        reasonCodeCounts.legacy_raw_intent = (reasonCodeCounts.legacy_raw_intent || 0) + 1;
                    }
                    continue;
                }
                const privacy = value.privacy && typeof value.privacy === 'object'
                    ? value.privacy
                    : null;
                const hasSensitiveText = scanSensitiveStrings(value, reasonCodeCounts);
                if (hasSensitiveText) {
                    rejected += 1;
                }
                else if (privacy?.classification === 'local_private'
                    && privacy?.policyVersion === 'neurcode.intent-privacy.v1') {
                    safe += 1;
                }
                else {
                    migrated += 1;
                    reasonCodeCounts.legacy_raw_intent = (reasonCodeCounts.legacy_raw_intent || 0) + 1;
                }
            }
            catch {
                rejected += 1;
                reasonCodeCounts.invalid_schema = (reasonCodeCounts.invalid_schema || 0) + 1;
            }
        }
    }
    const quarantinedTotal = outbox.quarantined.length;
    const quarantinedThisRun = repaired?.quarantined ?? 0;
    const quarantined = quarantinedTotal + pendingUnsafe;
    const backupCreated = repaired?.backupCreated ?? false;
    return {
        schemaVersion: exports.RUNTIME_PRIVACY_AUDIT_SCHEMA_VERSION,
        filesScanned,
        entriesScanned,
        safe,
        migrated,
        quarantined,
        quarantinedThisRun,
        quarantinedTotal,
        rejected,
        schemaVersions: Array.from(new Set([
            exports.RUNTIME_OUTBOX_SCHEMA_VERSION,
            exports.RUNTIME_DELIVERY_SCHEMA_VERSION,
            ...(0, runtime_privacy_1.runtimePrivacySchemaVersions)(),
        ])).sort(),
        reasonCodeCounts: Object.fromEntries(Object.entries(reasonCodeCounts).sort(([left], [right]) => left.localeCompare(right))),
        repairApplied: options.repair === true,
        backupCreated,
        nextRecoveryAction: quarantined > 0
            ? 'Keep quarantined entries local; generate a new safe session snapshot before retrying delivery.'
            : rejected > 0
                ? 'Leave finalized legacy evidence unchanged; generate new privacy-safe evidence for cloud synchronization.'
                : pendingOutboxMigrations > 0 && options.repair !== true
                    ? 'Run `neurcode runtime privacy-audit --repair` to rewrite only pending outbox entries with a restricted backup.'
                    : migrated > 0
                        ? 'No pending outbox repair is required; legacy local records remain unchanged and are projected safely when read.'
                        : 'No privacy recovery action is required.',
    };
}
//# sourceMappingURL=runtime-outbox.js.map