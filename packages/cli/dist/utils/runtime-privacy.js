"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUNTIME_LIVE_SESSION_SCHEMA_VERSION = exports.RUNTIME_CLOUD_SESSION_SCHEMA_VERSION = void 0;
exports.buildRuntimeIntentSummary = buildRuntimeIntentSummary;
exports.buildCloudSafeRuntimeSession = buildCloudSafeRuntimeSession;
exports.projectRuntimePayloadForCloud = projectRuntimePayloadForCloud;
exports.runtimePrivacySchemaVersions = runtimePrivacySchemaVersions;
exports.privacyReasonCodesFromError = privacyReasonCodesFromError;
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
exports.RUNTIME_CLOUD_SESSION_SCHEMA_VERSION = 'neurcode.runtime-cloud-session.v1';
exports.RUNTIME_LIVE_SESSION_SCHEMA_VERSION = 'neurcode.runtime-live-session.v3';
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function stringValue(value, max = 240) {
    if (typeof value !== 'string')
        return null;
    const cleaned = value.normalize('NFKC').replace(/[\u0000-\u001F\u007F]/g, '').trim();
    return cleaned ? cleaned.slice(0, max) : null;
}
function stringArray(value, maxItems = 100) {
    if (!Array.isArray(value))
        return [];
    return Array.from(new Set(value
        .flatMap((item) => {
        const cleaned = stringValue(item);
        return cleaned ? [cleaned] : [];
    }))).slice(0, maxItems);
}
function safePaths(value, maxItems = 100) {
    const values = Array.isArray(value) ? value : [];
    return Array.from(new Set(values.flatMap((item) => {
        const sanitized = (0, governance_runtime_1.sanitizeRepoRelativePath)(item);
        return sanitized.path ? [sanitized.path] : [];
    }))).sort((left, right) => left.localeCompare(right)).slice(0, maxItems);
}
function timestamp(value) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
        return null;
    return new Date(value).toISOString();
}
function numberValue(value, max = 1_000_000) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(Math.floor(parsed), max)) : 0;
}
function sessionStartedAt(session) {
    return timestamp(session.events.find((event) => event.type === 'session_start')?.ts);
}
function latestEventAt(session) {
    return session.events
        .map((event) => timestamp(event.ts))
        .filter((value) => Boolean(value))
        .sort()
        .at(-1) ?? null;
}
function intentContent(session) {
    const plan = session.contract.agentPlan;
    const clarifications = session.events.flatMap((event) => {
        const detail = asRecord(event.detail);
        const continuity = asRecord(detail?.continuityContext);
        const clarification = asRecord(continuity?.latestUserClarification);
        const summary = stringValue(clarification?.summary, 12_000);
        return summary ? [summary] : [];
    });
    return [
        session.contract.goal,
        session.contract.intentContract?.summary,
        plan?.summary,
        ...(plan?.steps ?? []),
        ...clarifications,
    ].filter((value) => Boolean(value)).join('\n');
}
function intentPaths(session) {
    const contract = session.contract;
    return [
        ...contract.allowedGlobs,
        ...contract.approvalRequiredGlobs,
        ...contract.approvedPaths,
        ...(contract.intentContract?.target.pathTokens ?? []),
        ...(contract.intentContract?.target.expectedPathGlobs ?? []),
        ...(contract.agentPlan?.expectedFiles ?? []),
        ...(contract.agentPlan?.expectedGlobs ?? []),
        ...session.events.flatMap((event) => event.filePath ? [event.filePath] : []),
    ];
}
function provenanceSource(session) {
    if (session.events.some((event) => event.type === 'user_decision'))
        return 'user_decision';
    if ((session.contract.agentPlanRevision ?? 0) > 1)
        return 'plan_amendment';
    if (session.contract.agentPlan)
        return 'agent_plan';
    if (session.events.some((event) => event.type === 'agent_handshake'))
        return 'launcher_handshake';
    return 'session_start';
}
function buildRuntimeIntentSummary(session, classification = 'cloud_safe') {
    return (0, governance_runtime_1.buildIntentSummary)({
        content: intentContent(session),
        categories: [
            session.contract.intentContract?.primaryAction ?? 'unknown',
            'governance',
        ],
        domains: session.contract.intentContract?.target.domainKeywords ?? [],
        paths: intentPaths(session),
        planRevision: session.contract.agentPlanRevision ?? (session.contract.agentPlan ? 1 : 0),
        scopeMode: session.contract.scopeMode,
        ruleIds: session.contract.architectureObligations?.map((obligation) => obligation.id) ?? [],
        planSteps: session.contract.agentPlan?.steps.length ?? 0,
        events: session.events.length,
        actorType: 'human',
        createdAt: sessionStartedAt(session),
        updatedAt: latestEventAt(session),
        redactionReasonCodes: session.privacy?.reasonCodes ?? [],
        provenanceClassification: classification,
        provenanceSource: provenanceSource(session),
    });
}
function eventReasonCodes(event) {
    const reasons = new Set();
    if (event.type === 'check_block')
        reasons.add('boundary_block');
    if (event.type === 'check_warn')
        reasons.add('boundary_warning');
    if (event.type === 'approval_decision')
        reasons.add('approval_decision');
    if (event.type === 'plan_amendment_decision')
        reasons.add('plan_amendment_decision');
    const detail = asRecord(event.detail);
    const blockType = stringValue(detail?.blockType ?? asRecord(detail?.approvalContext)?.blockType, 120);
    if (blockType)
        reasons.add(blockType);
    return Array.from(reasons).sort((left, right) => left.localeCompare(right)).slice(0, 12);
}
function cloudSafeEvent(event) {
    const detail = asRecord(event.detail);
    const approvalContext = asRecord(detail?.approvalContext);
    const planAmendment = asRecord(detail?.planAmendment);
    const architectureEdit = asRecord(detail?.architectureEdit);
    const obligation = asRecord(detail?.obligation);
    const eventPath = (0, governance_runtime_1.sanitizeRepoRelativePath)(event.filePath).path;
    const suggestedPath = (0, governance_runtime_1.sanitizeRepoRelativePath)(approvalContext?.suggestedApprovalPath).path;
    const blockedPath = (0, governance_runtime_1.sanitizeRepoRelativePath)(approvalContext?.blockedPath).path;
    const result = {
        type: stringValue(event.type, 80) ?? 'unknown',
        ts: timestamp(event.ts),
        filePath: eventPath,
        verdict: stringValue(event.verdict, 80),
        decision: stringValue(event.decision, 80),
        reasonCodes: eventReasonCodes(event),
    };
    const safeDetail = {
        boundaryVerdict: stringValue(detail?.boundaryVerdict, 80),
        blockType: stringValue(detail?.blockType ?? approvalContext?.blockType, 120),
        filePath: eventPath,
        operatorActionKind: stringValue(approvalContext?.operatorActionKind, 80),
        suggestedApprovalPath: suggestedPath,
        blockedPath,
        owners: stringArray(approvalContext?.owners, 20),
        planRevision: numberValue(detail?.planRevision ?? planAmendment?.revision ?? planAmendment?.previousRevision, 100_000),
        planAmendmentStatus: stringValue(planAmendment?.status, 80),
        architectureStatus: stringValue(architectureEdit?.status, 80),
        obligationId: stringValue(obligation?.id ?? detail?.obligationId, 160),
    };
    const compactDetail = Object.fromEntries(Object.entries(safeDetail).filter(([, value]) => value !== null && value !== undefined && (!(Array.isArray(value)) || value.length > 0)));
    if (Object.keys(compactDetail).length > 0)
        result.detail = compactDetail;
    return result;
}
function architectureSummary(session) {
    const obligations = session.contract.architectureObligations ?? [];
    return {
        total: obligations.length,
        pending: obligations.filter((item) => item.status === 'pending').length,
        satisfied: obligations.filter((item) => item.status === 'satisfied').length,
        waived: obligations.filter((item) => item.status === 'waived').length,
        criticalPending: obligations.filter((item) => item.status === 'pending' && item.severity === 'critical').length,
    };
}
function buildCloudSafeRuntimeSession(session) {
    const events = session.events.slice(-80).map(cloudSafeEvent);
    const safe = {
        schemaVersion: session.schemaVersion,
        cloudSchemaVersion: exports.RUNTIME_CLOUD_SESSION_SCHEMA_VERSION,
        runtimeLiveSchemaVersion: exports.RUNTIME_LIVE_SESSION_SCHEMA_VERSION,
        sessionId: stringValue(session.sessionId, 200),
        repoName: stringValue(session.repoName, 200),
        profileHash: stringValue(session.profileHash, 200),
        status: session.status,
        startedAt: sessionStartedAt(session),
        finishedAt: timestamp(session.finishedAt),
        replayHash: stringValue(session.replayHash, 200),
        intentSummary: buildRuntimeIntentSummary(session),
        contract: {
            scopeMode: session.contract.scopeMode,
            allowedGlobs: safePaths(session.contract.allowedGlobs),
            sensitiveGlobs: safePaths(session.contract.sensitiveGlobs),
            approvalRequiredGlobs: safePaths(session.contract.approvalRequiredGlobs),
            approvedPaths: safePaths(session.contract.approvedPaths),
            planRevision: numberValue(session.contract.agentPlanRevision ?? (session.contract.agentPlan ? 1 : 0), 100_000),
            planVersionCount: session.contract.agentPlanRevisions?.length ?? (session.contract.agentPlan ? 1 : 0),
            pendingPlanAmendmentCount: session.contract.planAmendmentProposals?.filter((item) => item.status === 'pending').length ?? 0,
            architecture: architectureSummary(session),
            ruleIds: Array.from(new Set(session.contract.architectureObligations?.map((item) => item.id).filter(Boolean) ?? [])).sort().slice(0, 64),
        },
        events,
        livePayload: {
            schemaVersion: exports.RUNTIME_LIVE_SESSION_SCHEMA_VERSION,
            compacted: true,
            originalEventCount: session.events.length,
            includedEventCount: events.length,
            rawIntentIncluded: false,
            rawPlanIncluded: false,
            rawChatIncluded: false,
            localStateClassification: session.privacy?.classification ?? 'local_private',
        },
        privacy: {
            policyVersion: governance_runtime_1.INTENT_PRIVACY_POLICY_VERSION,
            classification: 'cloud_safe',
            sourceIncluded: false,
            diffIncluded: false,
            promptIncluded: false,
            chatIncluded: false,
            planProseIncluded: false,
            contentUnavailableByDesign: true,
        },
    };
    (0, governance_runtime_1.assertPrivacySafeCloudPayload)(safe);
    return safe;
}
function legacySessionFromRecord(value) {
    const contract = asRecord(value.contract);
    const sessionId = stringValue(value.sessionId, 200);
    if (!contract || !sessionId)
        return null;
    const events = Array.isArray(value.events)
        ? value.events.filter((entry) => Boolean(asRecord(entry)))
        : [];
    return {
        schemaVersion: 1,
        sessionId,
        profileHash: stringValue(value.profileHash, 200) ?? '',
        repoName: stringValue(value.repoName, 200) ?? 'repository',
        contract: contract,
        events,
        replayHash: stringValue(value.replayHash, 200) ?? undefined,
        finishedAt: timestamp(value.finishedAt) ?? undefined,
        status: value.status === 'finished' ? 'finished' : 'active',
        privacy: {
            policyVersion: governance_runtime_1.INTENT_PRIVACY_POLICY_VERSION,
            classification: 'local_private',
            bounded: true,
            sensitivePatternRedaction: true,
            reasonCodes: ['legacy_raw_intent', 'legacy_raw_plan', 'legacy_raw_message'],
            updatedAt: timestamp(value.finishedAt) ?? new Date(0).toISOString(),
        },
    };
}
function projectRuntimePayloadForCloud(payload) {
    const sessionRecord = asRecord(payload.session);
    if (!sessionRecord)
        throw new Error('runtime privacy projection failed (payload.session:invalid_schema)');
    if (sessionRecord.cloudSchemaVersion === exports.RUNTIME_CLOUD_SESSION_SCHEMA_VERSION
        && (0, governance_runtime_1.isIntentSummaryV1)(sessionRecord.intentSummary)) {
        (0, governance_runtime_1.assertPrivacySafeCloudPayload)(payload);
        return payload;
    }
    const legacySession = legacySessionFromRecord(sessionRecord);
    if (!legacySession)
        throw new Error('runtime privacy projection failed (payload.session:invalid_schema)');
    const projected = {
        repo: asRecord(payload.repo) ?? {},
        generatedAt: timestamp(payload.generatedAt),
        session: buildCloudSafeRuntimeSession(legacySession),
        migration: {
            from: stringValue(sessionRecord.runtimeLiveSchemaVersion, 120) ?? 'legacy',
            to: exports.RUNTIME_LIVE_SESSION_SCHEMA_VERSION,
            reasonCodes: ['legacy_raw_intent', 'legacy_raw_plan', 'legacy_raw_message'],
        },
    };
    (0, governance_runtime_1.assertPrivacySafeCloudPayload)(projected);
    return projected;
}
function runtimePrivacySchemaVersions() {
    return [
        governance_runtime_1.INTENT_SUMMARY_SCHEMA_VERSION,
        governance_runtime_1.INTENT_PRIVACY_POLICY_VERSION,
        exports.RUNTIME_CLOUD_SESSION_SCHEMA_VERSION,
        exports.RUNTIME_LIVE_SESSION_SCHEMA_VERSION,
    ];
}
function privacyReasonCodesFromError(error) {
    const message = error instanceof Error ? error.message : String(error);
    const known = [
        'authorization_header',
        'api_token',
        'password_assignment',
        'private_key_marker',
        'credential_shaped_path',
        'control_character',
        'absolute_path',
        'path_traversal',
        'unsafe_path',
        'string_truncated',
        'array_truncated',
        'object_truncated',
        'depth_exceeded',
        'legacy_raw_intent',
        'legacy_raw_plan',
        'legacy_raw_message',
        'forbidden_field',
        'unbounded_string',
        'unbounded_array',
        'unbounded_object',
        'invalid_schema',
    ];
    const matched = known.filter((code) => message.includes(code));
    return matched.length > 0 ? matched : ['invalid_schema'];
}
//# sourceMappingURL=runtime-privacy.js.map