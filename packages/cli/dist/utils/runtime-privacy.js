"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUNTIME_LIVE_SESSION_SCHEMA_VERSION = exports.RUNTIME_CLOUD_SESSION_SCHEMA_VERSION = void 0;
exports.buildRuntimeIntentSummary = buildRuntimeIntentSummary;
exports.projectRepoIntelligenceForCloud = projectRepoIntelligenceForCloud;
exports.buildCloudSafeRuntimeSession = buildCloudSafeRuntimeSession;
exports.projectRuntimePayloadForCloud = projectRuntimePayloadForCloud;
exports.runtimePrivacySchemaVersions = runtimePrivacySchemaVersions;
exports.privacyReasonCodesFromError = privacyReasonCodesFromError;
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const contracts_1 = require("@neurcode-ai/contracts");
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
// Bounds for one session-level cloud repo-intelligence projection. One evidence object per
// session (the latest) is node-cheap, so these caps exist for tidy payloads rather than to
// fit the aggregate node budget.
const MAX_CLOUD_FINDINGS = 25;
const MAX_CLOUD_ADVISORY = 25;
const MAX_CLOUD_RULE_IDS = 64;
const MAX_CLOUD_SUMMARY_ITEMS = 100;
const MAX_EVIDENCE_TEXT = 280;
function boundedStringList(value, maxItems, maxLength = 160) {
    if (!Array.isArray(value))
        return [];
    const out = [];
    for (const item of value) {
        const cleaned = stringValue(item, maxLength);
        if (cleaned)
            out.push(cleaned);
        if (out.length >= maxItems)
            break;
    }
    return out;
}
const ABSOLUTE_PATH_VALUE = /(?:^|[^A-Za-z0-9_-])(?:\/(?:Users|home|private|tmp|var|etc|root|Volumes|opt|usr|workspace|app)\/[^\s"'`)]+|[A-Za-z]:[\\/][^\s"'`)]+|\\\\[A-Za-z0-9._-]+[\\/][^\s"'`)]+)/;
function hasAbsolutePathValue(value) {
    if (typeof value === 'string')
        return ABSOLUTE_PATH_VALUE.test(value.normalize('NFKC'));
    if (Array.isArray(value))
        return value.some((item) => hasAbsolutePathValue(item));
    if (!value || typeof value !== 'object')
        return false;
    return Object.values(value).some((child) => hasAbsolutePathValue(child));
}
/**
 * Project a local `RepoIntelligenceEvidence` object into a source-free, depth-bounded form
 * safe to attach at the SESSION level of a cloud runtime payload. Returns null when the input
 * is not valid evidence or the bounded projection would still fail the cloud privacy gate —
 * in that case the session uploads WITHOUT repo-intelligence rather than failing the whole
 * upload (fail-safe: omit, never leak, never block other evidence).
 *
 * Source-freeness is structural (the producer already emits no source). This projection
 * additionally drops the deep `matchedFacts`/`related` arrays (depth 9+ even at session
 * level, and they carry path/symbol labels) and bounds every array/string. `graph.summary`
 * (languages, package/service names, counts) IS retained — it is depth-safe at session level
 * and powers the dashboard's language-coverage and graph-posture panels.
 */
function projectRepoIntelligenceForCloud(value) {
    if (!(0, contracts_1.isRepoIntelligenceEvidence)(value))
        return null;
    const evidence = value;
    const graph = evidence.graph;
    const freshness = graph.freshness;
    const projected = {
        schemaVersion: evidence.schemaVersion,
        evidenceId: stringValue(evidence.evidenceId, 200) ?? evidence.evidenceId,
        generatedAt: evidence.generatedAt,
        classification: evidence.classification,
        verdict: evidence.verdict,
        enforcement: {
            adapterId: stringValue(evidence.enforcement.adapterId, 120) ?? evidence.enforcement.adapterId,
            capability: evidence.enforcement.capability,
            timing: evidence.enforcement.timing,
            decisionBinding: evidence.enforcement.decisionBinding,
        },
        graph: {
            graphId: graph.graphId,
            schemaVersion: graph.schemaVersion,
            ...(graph.canonicalModel ? { canonicalModel: graph.canonicalModel } : {}),
            storageSchemaVersion: graph.storageSchemaVersion ?? null,
            freshness: {
                state: freshness.state,
                ...(freshness.posture ? { posture: freshness.posture } : {}),
                indexedAt: freshness.indexedAt,
                gitHead: freshness.gitHead,
                workingTreeHash: freshness.workingTreeHash,
                staleFileCount: freshness.staleFileCount,
                unsupportedFileCount: freshness.unsupportedFileCount,
                reasonCodes: boundedStringList(freshness.reasonCodes, 32, 128),
            },
            lastSuccessfulIndexAt: graph.lastSuccessfulIndexAt ?? null,
            lastAttemptedIndexAt: graph.lastAttemptedIndexAt ?? null,
            unsupportedPercent: graph.unsupportedPercent,
            coverage: graph.coverage ?? null,
            ...(graph.deterministicEvidenceEligible !== undefined
                ? { deterministicEvidenceEligible: graph.deterministicEvidenceEligible } : {}),
            ...(graph.deterministicEnforcementEligible !== undefined
                ? { deterministicEnforcementEligible: graph.deterministicEnforcementEligible } : {}),
            enforcementIneligibilityReasons: boundedStringList(graph.enforcementIneligibilityReasons, 64, 128),
            ...(graph.recoveryCommand ? { recoveryCommand: graph.recoveryCommand } : {}),
            ...(graph.runtimeCompatibility ? { runtimeCompatibility: graph.runtimeCompatibility } : {}),
            ...(graph.summary ? {
                summary: {
                    languages: graph.summary.languages.slice(0, 64).map((language) => ({
                        language: language.language,
                        depth: language.depth,
                        filesSeen: language.filesSeen,
                        filesAnalyzed: language.filesAnalyzed,
                        filesUnsupported: language.filesUnsupported,
                    })),
                    packages: boundedStringList(graph.summary.packages, MAX_CLOUD_SUMMARY_ITEMS, 200),
                    services: boundedStringList(graph.summary.services, MAX_CLOUD_SUMMARY_ITEMS, 200),
                    ownershipZoneCount: graph.summary.ownershipZoneCount,
                    sensitiveSurfaceCount: graph.summary.sensitiveSurfaceCount,
                },
            } : {}),
            // DROP graph.coverageAuthority and graph.relationshipAuthority (unbounded nested depth,
            // not read by the cloud API or dashboard).
        },
        policy: {
            evaluatedRuleIds: boundedStringList(evidence.policy.evaluatedRuleIds, MAX_CLOUD_RULE_IDS, 200),
            notEvaluatedRuleIds: boundedStringList(evidence.policy.notEvaluatedRuleIds, MAX_CLOUD_RULE_IDS, 200),
            findings: evidence.policy.findings.slice(0, MAX_CLOUD_FINDINGS).map((finding) => ({
                findingId: stringValue(finding.findingId, 160) ?? finding.findingId,
                ruleId: stringValue(finding.ruleId, 200) ?? finding.ruleId,
                family: finding.family,
                verdict: finding.verdict,
                truth: finding.truth,
                // matchedFacts carry repo-relative path + symbol labels and nest to depth 9 even at
                // session level. Drop the contents; the rule id + explanation/remediation remain.
                matchedFacts: [],
                explanation: stringValue(finding.explanation, MAX_EVIDENCE_TEXT) ?? '',
                remediation: stringValue(finding.remediation, MAX_EVIDENCE_TEXT) ?? '',
            })),
        },
        advisory: evidence.advisory.slice(0, MAX_CLOUD_ADVISORY).map((finding) => ({
            schemaVersion: finding.schemaVersion,
            findingId: stringValue(finding.findingId, 160) ?? finding.findingId,
            providerId: stringValue(finding.providerId, 120) ?? finding.providerId,
            category: finding.category,
            truth: finding.truth,
            confidence: finding.confidence,
            rationaleCategories: boundedStringList(finding.rationaleCategories, 16, 80),
            // related[] carries path/symbol labels + extra depth; drop for the cloud projection.
            related: [],
            limitations: boundedStringList(finding.limitations, 16, 160),
            suppressed: finding.suppressed,
            cacheKey: stringValue(finding.cacheKey, 120) ?? finding.cacheKey,
        })),
        signature: {
            trust: evidence.signature.trust,
            receiptId: evidence.signature.receiptId,
            recordHash: evidence.signature.recordHash,
        },
        privacy: (0, contracts_1.sourceFreePrivacyContract)(),
    };
    // The projection must independently satisfy the shape contract and the cloud privacy gate
    // at the DEEPEST real nesting (`body.sessions[i].repoIntelligence`, the bulk evidence
    // upload). If either fails, omit it so a single oversized evaluation never fail-closes the
    // whole session upload.
    if (!(0, contracts_1.isRepoIntelligenceEvidence)(projected))
        return null;
    const gate = (0, governance_runtime_1.validatePrivacySafeCloudPayload)({ sessions: [{ repoIntelligence: projected }] });
    if (!gate.ok)
        return null;
    if (hasAbsolutePathValue(projected))
        return null;
    return projected;
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
/**
 * The most recent source-free repo-intelligence evidence produced during the session, as a
 * bounded cloud projection. Attached at the SESSION level (not per-event) because the cloud
 * privacy gate's depth budget (MAX_CLOUD_DEPTH) cannot accommodate a structured evidence
 * object nested under `sessions[i].events[j].detail`. The cloud ingestion re-associates this
 * with the latest governed check event so the per-event evidence query still resolves it.
 */
function latestCloudRepoIntelligence(session) {
    for (let index = session.events.length - 1; index >= 0; index -= 1) {
        const candidate = asRecord(asRecord(session.events[index].detail)?.repoIntelligence);
        if (!candidate)
            continue;
        const projected = projectRepoIntelligenceForCloud(candidate);
        if (projected)
            return projected;
    }
    return null;
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
function scopeAuthoritySummary(session) {
    const intent = session.contract.intentContract;
    const authority = intent?.scopeAuthority;
    if (!intent || !authority) {
        return {
            confidence: intent?.confidence ?? 'low',
            expectedFiles: [],
            expectedGlobs: [],
            expectedSymbols: [],
            likelyTests: [],
            affectedPackages: [],
            affectedModules: [],
            prohibitedBoundaries: [],
            selections: [],
            unsupportedAreas: ['scope_authority_unavailable'],
            brain: { evaluated: false, freshness: null, reason: 'Scope authority is unavailable for this session.' },
        };
    }
    return {
        confidence: intent.confidence,
        expectedFiles: safePaths(authority.expectedFiles, 100),
        expectedGlobs: safePaths(authority.expectedGlobs, 100),
        expectedSymbols: stringArray(authority.expectedSymbols, 100),
        likelyTests: safePaths(authority.likelyTests, 100),
        affectedPackages: safePaths(authority.affectedPackages, 100),
        affectedModules: safePaths(authority.affectedModules, 100),
        prohibitedBoundaries: safePaths(authority.prohibitedBoundaries, 100),
        selections: authority.selections.slice(0, 100).flatMap((selection) => {
            const target = safePaths([selection.target], 1)[0];
            if (!target)
                return [];
            return [{
                    target,
                    targetType: selection.targetType,
                    source: selection.source,
                    confidence: selection.confidence,
                    authority: selection.authority,
                    evidenceType: stringValue(selection.evidenceType, 120),
                    factId: stringValue(selection.factId, 200),
                    reason: stringValue(selection.reason, 500),
                }];
        }),
        unsupportedAreas: stringArray(authority.unsupportedAreas, 50),
        brain: {
            evaluated: authority.brain.evaluated,
            freshness: stringValue(authority.brain.freshness, 80),
            reason: stringValue(authority.brain.reason, 500),
        },
    };
}
function buildCloudSafeRuntimeSession(session) {
    const events = session.events.slice(-80).map(cloudSafeEvent);
    const repoIntelligence = latestCloudRepoIntelligence(session);
    const safe = {
        schemaVersion: session.schemaVersion,
        cloudSchemaVersion: exports.RUNTIME_CLOUD_SESSION_SCHEMA_VERSION,
        runtimeLiveSchemaVersion: exports.RUNTIME_LIVE_SESSION_SCHEMA_VERSION,
        sessionId: stringValue(session.sessionId, 200),
        repoName: stringValue(session.repoName, 200),
        profileHash: stringValue(session.profileHash, 200),
        status: session.status,
        completionStatus: session.completionStatus ?? null,
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
            scopeAuthority: scopeAuthoritySummary(session),
            ruleIds: Array.from(new Set(session.contract.architectureObligations?.map((item) => item.id).filter(Boolean) ?? [])).sort().slice(0, 64),
        },
        events,
        // Source-free latest repo-intelligence evidence for this session, if any. Session-level
        // placement keeps it within the cloud privacy depth budget; the cloud ingestion attaches
        // it to the latest governed check event so the per-event evidence query resolves it.
        ...(repoIntelligence ? { repoIntelligence } : {}),
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