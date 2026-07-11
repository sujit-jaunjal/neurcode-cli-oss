"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveLocalGovernanceReality = deriveLocalGovernanceReality;
exports.realityCommand = realityCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const contracts_1 = require("@neurcode-ai/contracts");
const v0_governance_1 = require("../utils/v0-governance");
const runtime_companion_1 = require("../utils/runtime-companion");
function ref(authority, observedAt, detail, sessionId = null) {
    const timestamp = observedAt && !Number.isNaN(Date.parse(observedAt)) ? observedAt : null;
    return timestamp ? [{ authority, observedAt: timestamp, detail, sessionId, href: null }] : [];
}
function signal(status, evidence = [], limitations = []) {
    return { status, evidence, limitations };
}
function localSessions(repoRoot) {
    const directory = (0, path_1.join)(repoRoot, '.neurcode', 'sessions');
    if (!(0, fs_1.existsSync)(directory))
        return [];
    return (0, fs_1.readdirSync)(directory)
        .filter((name) => name.endsWith('.json') && !name.endsWith('.change-record.json'))
        .map((name) => {
        const path = (0, path_1.join)(directory, name);
        try {
            const value = JSON.parse((0, fs_1.readFileSync)(path, 'utf8'));
            return { value, modifiedAt: (0, fs_1.statSync)(path).mtimeMs };
        }
        catch {
            return null;
        }
    })
        .filter((item) => Boolean(item))
        .sort((left, right) => right.modifiedAt - left.modifiedAt)
        .map((item) => item.value);
}
function latestTime(session) {
    if (!session)
        return null;
    return session.finishedAt || session.events?.at(-1)?.ts || session.startedAt || null;
}
function eventObservedAt(session, type) {
    const event = [...(session.events || [])].reverse().find((candidate) => candidate.type === type);
    return event?.ts || latestTime(session);
}
function hasLocalChangeRecord(repoRoot) {
    const directory = (0, path_1.join)(repoRoot, '.neurcode', 'sessions');
    return (0, fs_1.existsSync)(directory) && (0, fs_1.readdirSync)(directory).some((name) => name.endsWith('.change-record.json'));
}
function deriveLocalGovernanceReality(repoRoot, snapshot, sessions) {
    const finished = sessions.find((session) => session.status === 'finished' || Boolean(session.finishedAt));
    const latest = sessions[0];
    const allEvents = sessions.flatMap((session) => (session.events || []).map((event, index) => ({ session, event, index })));
    const safe = allEvents.find(({ event }) => event.type === 'check_ok' || event.verdict === 'ok' || event.verdict === 'allow');
    const block = allEvents.find(({ event }) => event.type === 'check_block' || event.verdict === 'block');
    const approval = allEvents.find(({ event }) => event.type === 'approval_decision' && ['approved', 'applied', 'granted'].includes(String(event.decision || '').toLowerCase()));
    const contained = approval ? allEvents.some(({ session, event, index }) => session.sessionId === approval.session.sessionId
        && index > approval.index
        && (event.type === 'check_block' || event.verdict === 'block')
        && event.filePath !== approval.event.filePath) : false;
    const latestSessionId = latest?.sessionId || null;
    const brainState = String(snapshot.brain?.state || 'missing');
    const runtimeStatus = String(snapshot.runtimeAuthority.status || 'missing_runtime');
    const integration = snapshot.pairing.agentIntegrationActive;
    const agent = snapshot.session?.launcher?.agent
        || snapshot.runtimeAuthority.activated?.integrations?.[0]?.adapter
        || null;
    const sessionEvidence = ref('governed_session', latestTime(latest), `${sessions.length} local governed session record(s) observed.`, latestSessionId);
    const localRecord = hasLocalChangeRecord(repoRoot);
    const transportFailed = snapshot.transport.deadLetterEvents > 0 || snapshot.transport.quarantinedEvents > 0;
    const transportSynced = snapshot.pairing.evidenceSynchronized && !transportFailed;
    return (0, contracts_1.buildGovernanceRealityAssessment)({
        workspaceKind: 'local',
        repoLabel: snapshot.session?.repoName || repoRoot.split(/[\\/]/).filter(Boolean).at(-1) || 'local repository',
        agent,
        repositoryContext: snapshot.pairing.repositoryOwnershipBound
            ? signal('proven', ref('repository_ownership', snapshot.generatedAt, 'A local governance profile binds this repository.'))
            : signal('not_evaluated'),
        brainIntelligence: brainState === 'fresh'
            ? signal('proven', ref('repo_brain', snapshot.brain?.updatedAt, 'Fresh local Brain lifecycle observed.'))
            : brainState === 'partial' || brainState === 'stale'
                ? signal('partial', ref('repo_brain', snapshot.brain?.updatedAt, `Local Brain state: ${brainState}.`), ['Coverage or freshness is bounded.'])
                : brainState === 'failed'
                    ? signal('failed', ref('repo_brain', snapshot.brain?.updatedAt, 'Local Brain construction failed.'))
                    : signal('not_evaluated'),
        agentIntegration: integration && snapshot.runtimeAuthority.ok
            ? signal('proven', ref('runtime_manifest', snapshot.runtimeAuthority.activated?.activatedAt || snapshot.generatedAt, `Runtime authority: ${runtimeStatus}.`))
            : /stale|incompatible|unavailable|mismatch/.test(runtimeStatus)
                ? signal('failed', ref('runtime_manifest', snapshot.generatedAt, `Runtime authority: ${runtimeStatus}.`))
                : snapshot.runtimeAuthority.activated
                    ? signal('partial', ref('runtime_manifest', snapshot.runtimeAuthority.activated.activatedAt, `Runtime authority: ${runtimeStatus}.`))
                    : signal('not_evaluated'),
        safeChangeGoverned: safe
            ? signal('proven', ref('governed_session', safe.event.ts || latestTime(safe.session), 'An allowed change received a local governance pass.', safe.session.sessionId || null))
            : sessions.length > 0 ? signal('partial', sessionEvidence) : signal('not_evaluated'),
        protectedBoundaryEnforced: block
            ? signal('proven', ref('boundary_event', block.event.ts || latestTime(block.session), 'A protected boundary produced a block.', block.session.sessionId || null))
            : sessions.length > 0 ? signal('partial', sessionEvidence) : signal('not_evaluated'),
        exactPathContainment: contained && approval
            ? signal('proven', ref('approval_decision', approval.event.ts || latestTime(approval.session), 'One exact path was approved and a neighboring protected path remained blocked.', approval.session.sessionId || null))
            : approval
                ? signal('partial', ref('approval_decision', approval.event.ts || latestTime(approval.session), 'An exact-path approval exists; neighboring containment is not evidenced.', approval.session.sessionId || null))
                : signal('not_evaluated'),
        sessionIntegrity: finished
            ? signal('proven', ref('governed_session', latestTime(finished), 'A local governed session reached a terminal record.', finished.sessionId || null))
            : latest ? signal('partial', sessionEvidence) : signal('not_evaluated'),
        evidenceDelivery: transportFailed
            ? signal('failed', sessionEvidence)
            : transportSynced && localRecord
                ? signal('proven', ref('evidence_record', latestTime(finished || latest), 'Local evidence exists and the runtime outbox is synchronized.', (finished || latest)?.sessionId || null))
                : localRecord
                    ? signal('partial', ref('evidence_record', latestTime(finished || latest), 'A local AI Change Record exists; workspace delivery is not proven.', (finished || latest)?.sessionId || null))
                    : signal('not_evaluated'),
        replayIntegrity: finished?.replayHash
            ? signal('proven', ref('replay_hash', latestTime(finished), 'A stable local replay hash is present.', finished.sessionId || null))
            : finished ? signal('partial', sessionEvidence) : signal('not_evaluated'),
    });
}
function render(assessment) {
    console.log('\nGovernance Reality');
    console.log(`  Repository: ${assessment.scope.repoLabel}`);
    console.log(`  Posture:    ${assessment.posture.replace(/_/g, ' ')}`);
    console.log(`  Proven:     ${assessment.score.proven}/${assessment.score.total} (${assessment.score.percent}%)\n`);
    for (const item of assessment.capabilities) {
        const icon = item.status === 'proven' ? '✓' : item.status === 'failed' ? '!' : item.status === 'partial' ? '~' : '·';
        console.log(`  ${icon} ${item.label.padEnd(28)} ${item.status.replace(/_/g, ' ')}`);
        if (item.status !== 'proven' && item.recovery?.command)
            console.log(`    next: ${item.recovery.command}`);
    }
    console.log(`\n  Next: ${assessment.nextAction.label}`);
    if (assessment.nextAction.command)
        console.log(`        ${assessment.nextAction.command}`);
    console.log('\n  Operational evidence only; not a compliance certification or code-safety guarantee.\n');
}
function realityCommand(program) {
    program
        .command('reality')
        .description('Show which governance capabilities have actually been observed for this repository')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--strict', 'Exit non-zero unless every operational scenario is proven')
        .option('--json', 'Output the canonical machine-readable assessment')
        .action((options) => {
        try {
            const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
            const assessment = deriveLocalGovernanceReality(repoRoot, (0, runtime_companion_1.buildRuntimeCompanionSnapshot)(repoRoot), localSessions(repoRoot));
            if (options.json)
                console.log(JSON.stringify(assessment, null, 2));
            else
                render(assessment);
            if (options.strict && assessment.posture !== 'review_ready')
                process.exitCode = 1;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (options.json)
                console.log(JSON.stringify({ ok: false, error: message }, null, 2));
            else
                console.error(`Governance reality failed: ${message}`);
            process.exitCode = 1;
        }
    });
}
//# sourceMappingURL=reality.js.map