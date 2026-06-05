"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_CHANGE_RECORD_TYPE = exports.AI_CHANGE_RECORD_SCHEMA_VERSION = void 0;
exports.aiChangeRecordPath = aiChangeRecordPath;
exports.buildAIChangeRecord = buildAIChangeRecord;
exports.writeAIChangeRecord = writeAIChangeRecord;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const architecture_obligations_1 = require("./architecture-obligations");
exports.AI_CHANGE_RECORD_SCHEMA_VERSION = 'neurcode.governed-session-record.v1';
exports.AI_CHANGE_RECORD_TYPE = 'ai-change-accountability-record';
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
function stableHash(value) {
    return (0, node_crypto_1.createHash)('sha256').update(stableStringify(value)).digest('hex').slice(0, 24);
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
    return {
        owners: arrayOfStrings(context['owners']),
        suggestedApprovalPath: typeof context['suggestedApprovalPath'] === 'string'
            ? context['suggestedApprovalPath']
            : null,
    };
}
function buildTrajectory(events) {
    const byPath = new Map();
    for (const event of events) {
        if (event.type !== 'check_ok' && event.type !== 'check_warn' && event.type !== 'check_block')
            continue;
        if (!event.filePath)
            continue;
        const existing = byPath.get(event.filePath);
        const context = approvalContext(event);
        const verdict = event.verdict || event.type.replace('check_', '');
        if (!existing) {
            byPath.set(event.filePath, {
                filePath: event.filePath,
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
        summary: revision.plan.summary || null,
        capturedAt: revision.capturedAt,
        reason: revision.reason || null,
        expectedFiles: unique(revision.plan.expectedFiles),
        expectedGlobs: unique(revision.plan.expectedGlobs),
        constraints: unique(revision.plan.constraints),
        risks: unique(revision.plan.risks),
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
    return (grants ?? []).map((grant) => ({
        path: grant.path,
        status: approvalStatus(grant, nowIso),
        source: grant.source,
        approvedAt: grant.approvedAt,
        expiresAt: grant.expiresAt ?? null,
        revokedAt: grant.revokedAt ?? null,
        approvedBy: grant.approvedBy ?? null,
        reason: grant.reason,
        requestId: grant.requestId ?? null,
    })).sort((a, b) => {
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
function latestStructuralUnderstanding(events) {
    const event = [...events].reverse().find((candidate) => candidate.type === 'structural_understanding');
    const detail = asRecord(event?.detail);
    if (!detail)
        return null;
    const analysis = asRecord(detail.analysis) ?? {};
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
    const reviewFocus = unique([
        ...unresolvedBlockedPaths,
        ...blockedPaths,
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
            status: escapingImpactCount > 0 || sensitiveImpactCount > 0 ? 'warn' : impacts.length > 0 ? 'pass' : 'pending',
            summary: impacts.length > 0
                ? `${plural(impacts.length, 'ranked structural impact')} found; top impact: ${impacts[0].file}#${impacts[0].symbol}.`
                : 'No ranked structural impacts were attached to this record.',
            facts: impacts.length > 0
                ? impacts.slice(0, 4).map((item) => item.summary)
                : ['structural consequence facts unavailable or empty'],
            reviewFocus: impactFocus,
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
            'replay hash',
        ],
        limitations: [
            'No source code, diff hunks, patch content, or shell command bodies are included.',
            'Intent and plan summaries are advisory; verdict and review focus are deterministic record facts.',
            'Static structural understanding is TypeScript-focused and does not prove runtime behavior.',
        ],
    };
}
function aiChangeRecordPath(projectRoot, sessionId) {
    return (0, node_path_1.join)(projectRoot, '.neurcode', 'sessions', `${sessionId}.change-record.json`);
}
function buildAIChangeRecord(session, options = {}) {
    const generatedAt = options.generatedAt ?? new Date().toISOString();
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
    const coreWithoutReviewBrief = {
        schemaVersion: exports.AI_CHANGE_RECORD_SCHEMA_VERSION,
        recordType: exports.AI_CHANGE_RECORD_TYPE,
        displayName: 'AI Change Record',
        generatedAt,
        privacy: {
            sourceUploaded: false,
            sourceFree: true,
            omittedFields: ['source code', 'diff hunks', 'patch content', 'shell command bodies'],
        },
        session: {
            sessionId: session.sessionId,
            repoName: session.repoName,
            status: session.status,
            goal: session.contract.goal,
            scopeMode: session.contract.scopeMode,
            profileHash: session.profileHash,
            startedAt: sessionStartedAt(session),
            finishedAt: session.finishedAt ?? null,
            counts: checkCounts,
        },
        intent: {
            contract: intentContract,
            expectedPathGlobs: unique(intentContract?.target.expectedPathGlobs ?? session.contract.allowedGlobs),
            riskNotes: unique(intentContract?.riskNotes ?? []),
        },
        plan: {
            activeRevision: session.contract.agentPlanRevision ?? (activePlan ? 1 : null),
            activeSummary: activePlan?.summary ?? null,
            timeline: planTimeline(session.contract.agentPlanRevisions),
            pendingAmendments: (session.contract.planAmendmentProposals ?? [])
                .filter((proposal) => proposal.status === 'pending')
                .map((proposal) => ({
                proposalId: proposal.proposalId,
                previousRevision: proposal.previousRevision,
                riskLevel: proposal.risk.level,
                requiresHumanApproval: proposal.risk.requiresHumanApproval,
                addedFiles: unique(proposal.risk.addedFiles),
                addedGlobs: unique(proposal.risk.addedGlobs),
                reasons: unique(proposal.risk.reasons),
                createdAt: proposal.createdAt,
            })),
        },
        scope: {
            allowedGlobs: unique(session.contract.allowedGlobs),
            approvalRequiredGlobs: unique(session.contract.approvalRequiredGlobs),
            approvedPaths: unique(session.contract.approvedPaths),
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
                relatedPaths: unique([
                    obligation.requiredPath,
                    ...obligation.observedEvidence.map((item) => item.path),
                ]),
            })),
        },
        approvals: approvalEntries(session.contract.approvalGrants, generatedAt),
        understanding: {
            latest: latestStructuralUnderstanding(session.events),
        },
        integrity: {
            replayHash: session.replayHash ?? null,
            replayHashStatus: session.replayHash ? 'present' : 'pending-session-finish',
            deterministicFacts: [
                'session contract',
                'intent contract',
                'agent plan revisions',
                'checked-edit trajectory',
                'approval lifecycle',
                'architecture obligations',
                'local structural understanding',
                'replay hash',
            ],
            advisoryFacts: [
                'intent summary',
                'plan coherence explanations',
                'architecture obligation explanations',
            ],
        },
    };
    const core = {
        ...coreWithoutReviewBrief,
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
    const recordHash = stableHash({
        ...core,
        generatedAt: null,
        integrity: {
            ...core.integrity,
            recordHash: null,
        },
    });
    return {
        ...core,
        integrity: {
            ...core.integrity,
            recordHash,
        },
    };
}
function writeAIChangeRecord(projectRoot, session, options = {}) {
    const path = aiChangeRecordPath(projectRoot, session.sessionId);
    const dir = (0, node_path_1.join)(projectRoot, '.neurcode', 'sessions');
    if (!(0, node_fs_1.existsSync)(dir))
        (0, node_fs_1.mkdirSync)(dir, { recursive: true });
    const record = buildAIChangeRecord(session, options);
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    (0, node_fs_1.writeFileSync)(tmp, JSON.stringify(record, null, 2) + '\n', 'utf8');
    (0, node_fs_1.renameSync)(tmp, path);
    return { record, path };
}
//# sourceMappingURL=ai-change-record.js.map