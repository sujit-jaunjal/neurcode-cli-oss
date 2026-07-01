"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUNTIME_COMPANION_SCHEMA_VERSION = void 0;
exports.invalidateRuntimeCompanionFreshness = invalidateRuntimeCompanionFreshness;
exports.buildRuntimeCompanionSnapshot = buildRuntimeCompanionSnapshot;
exports.approveRuntimeCompanionPath = approveRuntimeCompanionPath;
exports.refreshRuntimeCompanionProfile = refreshRuntimeCompanionProfile;
exports.runtimeCompanionSession = runtimeCompanionSession;
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const v0_governance_1 = require("./v0-governance");
const agent_session_launcher_1 = require("./agent-session-launcher");
const runtime_outbox_1 = require("./runtime-outbox");
const runtime_connection_1 = require("./runtime-connection");
const brain_lifecycle_1 = require("./brain-lifecycle");
const runtime_authority_1 = require("./runtime-authority");
const v0_governance_2 = require("./v0-governance");
const runtime_state_1 = require("./runtime-state");
const operator_identity_1 = require("./operator-identity");
exports.RUNTIME_COMPANION_SCHEMA_VERSION = 'neurcode.runtime-companion.v1';
const PROFILE_FRESHNESS_CACHE_MS = 5_000;
const freshnessCache = new Map();
function pendingAmendments(session) {
    return (session.contract.planAmendmentProposals ?? [])
        .filter((proposal) => proposal.status === 'pending')
        .map((proposal) => ({
        proposalId: proposal.proposalId,
        action: proposal.action,
        proposedBy: proposal.proposedBy,
        reason: proposal.reason,
        riskLevel: proposal.risk.level,
        addedFiles: [...proposal.risk.addedFiles],
        addedGlobs: [...proposal.risk.addedGlobs],
        removedConstraints: [...proposal.risk.removedConstraints],
        createdAt: proposal.createdAt,
    }));
}
function shapePlan(session) {
    const plan = session.contract.agentPlan;
    if (!plan)
        return null;
    return {
        revision: session.contract.agentPlanRevision ?? 1,
        summary: plan.summary,
        steps: [...plan.steps],
        expectedFiles: [...plan.expectedFiles],
        expectedGlobs: [...plan.expectedGlobs],
        constraints: [...plan.constraints],
        risks: [...plan.risks],
        capturedAt: plan.capturedAt,
        source: plan.source,
        confidence: plan.confidence,
        pendingAmendments: pendingAmendments(session),
    };
}
function shapeWaivers(waivers) {
    return waivers.map((waiver) => ({
        obligationId: waiver.obligationId,
        reason: waiver.reason,
        waivedAt: waiver.waivedAt,
        expiresAt: waiver.expiresAt,
        waivedBy: waiver.waivedBy,
    }));
}
function shapeObligations(session) {
    const items = session.contract.architectureObligations ?? [];
    const waivers = (0, governance_runtime_1.activeArchitectureObligationWaivers)(session.contract.architectureObligationWaivers ?? []);
    return {
        policy: (0, governance_runtime_1.normalizeArchitectureObligationPolicy)(session.contract.architectureObligationPolicy),
        summary: (0, governance_runtime_1.summarizeArchitectureObligations)(items),
        items: items.map((item) => ({
            id: item.id,
            category: item.category,
            title: item.title,
            description: item.description,
            severity: item.severity,
            status: item.status,
            requiredEvidence: [...item.requiredEvidence],
            observedEvidence: item.observedEvidence.map((evidence) => ({ ...evidence })),
            ...(item.requiredPath ? { requiredPath: item.requiredPath } : {}),
            ...(item.effectiveMode ? { effectiveMode: item.effectiveMode } : {}),
        })),
        activeWaivers: shapeWaivers(waivers),
    };
}
function extractApprovalContext(event) {
    const raw = event.detail?.approvalContext;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {
            owners: [],
            suggestedApprovalPath: event.filePath ?? '',
        };
    }
    const context = raw;
    return {
        owners: Array.isArray(context.owners)
            ? context.owners.filter((owner) => typeof owner === 'string')
            : [],
        suggestedApprovalPath: typeof context.suggestedApprovalPath === 'string'
            ? context.suggestedApprovalPath
            : (typeof context.blockedPath === 'string' ? context.blockedPath : event.filePath ?? ''),
    };
}
function shapeLatestBlock(session) {
    const block = [...session.events].reverse().find((event) => event.type === 'check_block');
    if (!block?.filePath)
        return null;
    const context = extractApprovalContext(block);
    return {
        filePath: block.filePath,
        message: block.message ?? 'Edit is blocked by an approval-required boundary.',
        owners: context.owners,
        suggestedApprovalPath: context.suggestedApprovalPath || block.filePath,
        exactPathApproved: (0, governance_runtime_1.activeApprovalPaths)(session.contract).includes(context.suggestedApprovalPath || block.filePath),
    };
}
function shapeRecentEvents(session) {
    return session.events.slice(-20).map((event) => ({
        type: event.type,
        ts: event.ts,
        ...(event.filePath ? { filePath: event.filePath } : {}),
        ...(event.verdict ? { verdict: event.verdict } : {}),
        ...(event.decision ? { decision: event.decision } : {}),
        ...(event.message ? { message: event.message } : {}),
    }));
}
function shapeLauncher(session) {
    const state = (0, agent_session_launcher_1.latestAgentLauncherState)(session);
    if (!state)
        return null;
    return {
        agent: state.agent.normalized,
        adapter: state.agent.adapter,
        enforcementLevel: state.agent.enforcementLevel,
        automatic: state.agent.automatic,
        hardDeny: state.agent.hardDeny,
        handshakeStatus: state.handshakeStatus,
        ...(state.launchedAt ? { launchedAt: state.launchedAt } : {}),
        ...(state.promptSeenAt ? { promptSeenAt: state.promptSeenAt } : {}),
    };
}
function freshnessFor(repoRoot, session, force) {
    const cached = freshnessCache.get(repoRoot);
    if (!force && cached && cached.expiresAt > Date.now())
        return cached.signal;
    const staleness = (0, v0_governance_1.getProfileStaleness)(repoRoot);
    const action = (0, v0_governance_1.profileFreshnessActionForSession)(staleness, session?.profileHash);
    const signal = (0, v0_governance_1.buildProfileFreshnessSignal)(staleness, action, {
        sessionProfileHash: session?.profileHash,
        ...(action === 'session_restart_required'
            ? {
                recoveryReason: 'active_session_profile_changed',
                recoveryCommand: 'neurcode session reset-stale --force',
            }
            : {}),
    });
    freshnessCache.set(repoRoot, { expiresAt: Date.now() + PROFILE_FRESHNESS_CACHE_MS, signal });
    return signal;
}
function invalidateRuntimeCompanionFreshness(repoRoot) {
    freshnessCache.delete(repoRoot);
}
function buildRuntimeCompanionSnapshot(repoRoot, options = {}) {
    const session = (0, governance_runtime_1.loadActiveSession)(repoRoot);
    const profileFreshness = freshnessFor(repoRoot, session, options.forceFreshness === true);
    const transport = (0, runtime_outbox_1.inspectRuntimeOutbox)(repoRoot);
    const connection = (0, runtime_connection_1.loadRuntimeConnection)(repoRoot);
    const runtimeAuthority = (0, runtime_authority_1.inspectRuntimeAuthority)(repoRoot);
    const runtimeState = (0, runtime_state_1.classifyRuntimeState)(repoRoot);
    const profile = (0, v0_governance_2.readGovernanceProfile)(repoRoot).profile;
    const topology = profile?.repositoryTopology ?? session?.contract.repositoryTopology ?? null;
    const brain = (0, brain_lifecycle_1.readBrainLifecycle)(repoRoot);
    const launcher = session ? shapeLauncher(session) : null;
    const scopeEvidence = (session?.contract.allowedGlobs ?? []).map((glob) => {
        const fact = topology?.facts.find((candidate) => candidate.glob === glob || candidate.path === glob);
        return fact
            ? {
                glob,
                evidenceType: fact.evidence.type,
                authority: fact.evidence.authority,
                confidence: fact.evidence.confidence,
                reason: fact.evidence.reason,
            }
            : {
                glob,
                evidenceType: 'explicit-user-or-plan',
                authority: 'explicit',
                confidence: 'high',
                reason: 'This exact path/glob came from explicit user intent or the accepted agent plan.',
            };
    });
    return {
        schemaVersion: exports.RUNTIME_COMPANION_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        repoRoot,
        privacy: {
            metadataOnly: true,
            sourceIncluded: false,
            sourceUploaded: false,
        },
        enforcement: {
            adapter: 'vscode-extension',
            level: 'observe_only',
            automatic: false,
            hardDenyAvailable: false,
            detail: 'The VS Code companion reflects CLI runtime state. Claude Code hooks provide pre-write hard deny; editor observation does not.',
        },
        runtimeAuthority,
        runtimeState,
        pairing: {
            repositoryOwnershipBound: Boolean(profile),
            machineAuthenticated: Boolean(connection),
            agentIntegrationActive: Boolean(launcher || runtimeAuthority.activated?.integrations.length),
            cloudTransportConnected: Boolean(connection),
            repoBrainReady: brain?.state === 'fresh' || brain?.state === 'partial',
            governedSessionActive: Boolean(session),
            evidenceSynchronized: Boolean(connection)
                && transport.pendingEvents === 0
                && transport.deadLetterEvents === 0
                && transport.quarantinedEvents === 0,
        },
        topology: topology ? {
            artifactHash: topology.artifactHash,
            trackedFileCount: topology.trackedFileCount,
            deterministicFacts: topology.facts.filter((fact) => fact.evidence.authority === 'deterministic').length,
            advisoryFacts: topology.facts.filter((fact) => fact.evidence.authority === 'advisory').length,
            brainParticipated: topology.brain.participated,
            brainFreshness: topology.brain.freshness,
            limitations: [...topology.limitations],
        } : null,
        brain,
        profileFreshness: {
            ...profileFreshness,
            sessionProfileHash: session?.profileHash ?? null,
        },
        transport: {
            ...transport,
            connected: Boolean(connection),
        },
        session: session
            ? {
                sessionId: session.sessionId,
                status: session.status,
                completionStatus: session.completionStatus ?? null,
                repoName: session.repoName,
                goal: session.contract.goal,
                profileHash: session.profileHash,
                scopeMode: session.contract.scopeMode,
                planCoherenceMode: session.contract.planCoherenceMode ?? 'warn',
                allowedGlobs: [...session.contract.allowedGlobs],
                scopeEvidence,
                approvalRequiredGlobs: [...session.contract.approvalRequiredGlobs],
                approvedPaths: (0, governance_runtime_1.activeApprovalPaths)(session.contract),
                launcher,
                plan: shapePlan(session),
                obligations: shapeObligations(session),
                latestBlock: shapeLatestBlock(session),
                recentEvents: shapeRecentEvents(session),
            }
            : null,
    };
}
function approveRuntimeCompanionPath(repoRoot, input) {
    if (!input.path?.trim())
        throw new Error('path is required');
    if (!input.reason?.trim())
        throw new Error('reason is required');
    if (/[*?[\]{}!]/.test(input.path)) {
        throw new Error('VS Code runtime companion approvals must target one exact file path.');
    }
    const localIdentity = (0, operator_identity_1.deriveLocalOperatorIdentity)(repoRoot);
    const explicitActor = input.approvedBy?.trim() || null;
    const approval = (0, governance_runtime_1.approveSession)(repoRoot, input.path.trim(), {
        reason: input.reason.trim(),
        sessionId: input.sessionId,
        source: 'vscode',
        approvedBy: explicitActor ?? localIdentity.approvedBy,
        assurance: explicitActor ? 'local_asserted' : localIdentity.assurance,
        requestId: input.requestId ?? null,
    });
    invalidateRuntimeCompanionFreshness(repoRoot);
    return {
        schemaVersion: exports.RUNTIME_COMPANION_SCHEMA_VERSION,
        sessionId: approval.sessionId,
        approvedPath: approval.approvedPath,
        eventId: approval.eventId,
        expiresAt: approval.expiresAt,
        snapshot: buildRuntimeCompanionSnapshot(repoRoot, { forceFreshness: true }),
    };
}
function refreshRuntimeCompanionProfile(repoRoot) {
    (0, v0_governance_1.ensureFreshGovernanceProfile)(repoRoot, { force: true });
    invalidateRuntimeCompanionFreshness(repoRoot);
    return buildRuntimeCompanionSnapshot(repoRoot, { forceFreshness: true });
}
function runtimeCompanionSession(repoRoot, sessionId) {
    return (0, governance_runtime_1.loadSession)(repoRoot, sessionId);
}
//# sourceMappingURL=runtime-companion.js.map