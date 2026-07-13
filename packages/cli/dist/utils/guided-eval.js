"use strict";
/**
 * Guided Evaluation Runner — shared state engine.
 *
 * One source-free model that turns the Enterprise Evaluation from a static
 * checklist into a progress-aware guided flow. The CLI `neurcode eval`
 * command group, the `demo:guided-enterprise-eval` harness, and (by mirror)
 * the dashboard all key off the same step ids and truth tiers defined here.
 *
 * Hard rules:
 *   - Source-free. We only ever read/emit paths, owners, symbol names, counts,
 *     verdicts, hashes, and truth-tier labels. Never source, diffs, prompts,
 *     secrets, or private file contents. {@link assertGuidedEvalSourceFree}
 *     is the backstop run before any report is written.
 *   - Honest. Every step carries exactly one truth tier. A step we cannot
 *     measure is `not_evaluated`, never silently "done".
 *   - Read-only against the user's repo. Nothing here mutates user source.
 *     The only writer is {@link scaffoldEvalFixture}, used solely for the
 *     explicit `--fixture` safe-demo mode.
 *
 * Keep the step ids / labels / tiers in lockstep with the dashboard mirror at
 * `web/dashboard/src/lib/guidedEval.ts` and the truth taxonomy at
 * `scripts/lib/truth-taxonomy.mjs` + `web/dashboard/src/lib/truthTaxonomy.ts`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GUIDED_EVAL_REPORT_SCHEMA_VERSION = exports.GUIDED_EVAL_STEPS = exports.GUIDED_EVAL_AGENTS = exports.GUIDED_EVAL_TRUTH_TIERS = exports.GUIDED_EVAL_SCHEMA_VERSION = void 0;
exports.normalizeGuidedEvalAgent = normalizeGuidedEvalAgent;
exports.enforcementForAgent = enforcementForAgent;
exports.enforcementLabel = enforcementLabel;
exports.hashRepoIdentity = hashRepoIdentity;
exports.gatherGuidedEvalContext = gatherGuidedEvalContext;
exports.stepCommand = stepCommand;
exports.buildGuidedEvalState = buildGuidedEvalState;
exports.findSourceLeaks = findSourceLeaks;
exports.assertGuidedEvalSourceFree = assertGuidedEvalSourceFree;
exports.buildGuidedEvalReport = buildGuidedEvalReport;
exports.renderGuidedEvalReportMarkdown = renderGuidedEvalReportMarkdown;
exports.scaffoldEvalFixture = scaffoldEvalFixture;
exports.cleanFixtureRuntimeState = cleanFixtureRuntimeState;
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const cli_runtime_1 = require("@neurcode-ai/cli-runtime");
const cli_entry_1 = require("./cli-entry");
const runtime_state_1 = require("./runtime-state");
const brain_cache_1 = require("./brain-cache");
const local_repo_brain_1 = require("./local-repo-brain");
const runtime_connection_1 = require("./runtime-connection");
const runtime_evidence_1 = require("./runtime-evidence");
const admission_artifact_1 = require("./admission-artifact");
exports.GUIDED_EVAL_SCHEMA_VERSION = 'neurcode.guided-eval.v1';
exports.GUIDED_EVAL_TRUTH_TIERS = {
    deterministic: {
        label: 'Deterministic fact',
        proves: 'Proves the stated structural fact. Does not prove the change is correct or safe.',
    },
    backend_signed: {
        label: 'Backend-signed evidence',
        proves: 'Verifies the record was issued under the configured Neurcode signing key and was not altered. Does not prove source correctness or vulnerability absence.',
    },
    advisory: {
        label: 'Advisory inference',
        proves: 'Surfaces a likely signal worth a human look. Not a deterministic guarantee; can be a false positive.',
    },
    not_evaluated: {
        label: 'Not evaluated / unknown',
        proves: 'Proves nothing. Stated explicitly so a gap is never mistaken for a clean result.',
    },
};
exports.GUIDED_EVAL_AGENTS = [
    'claude',
    'codex',
    'cursor',
    'vscode',
    'copilot',
    'action',
];
function normalizeGuidedEvalAgent(value) {
    if (typeof value === 'string' && exports.GUIDED_EVAL_AGENTS.includes(value)) {
        return value;
    }
    return 'claude';
}
function enforcementForAgent(agent) {
    if (agent === 'claude')
        return 'hard_hook';
    if (agent === 'action')
        return 'post_pr';
    return 'supervised';
}
function enforcementLabel(enforcement) {
    switch (enforcement) {
        case 'hard_hook':
            return 'Hard pre-write deny (Claude hooks where installed and healthy)';
        case 'supervised':
            return 'Cooperative guard + source-free supervisor evidence';
        case 'post_pr':
            return 'Post-PR advisory routing (no live pre-write enforcement)';
    }
}
/**
 * The canonical eleven evaluation checkpoints, in lifecycle order. The dashboard
 * renders the same ids; the harness asserts parity.
 */
exports.GUIDED_EVAL_STEPS = [
    {
        id: 'cli_installed',
        title: 'CLI installed',
        truthTier: 'deterministic',
        reportKey: 'cli_installed',
        summary: 'The Neurcode CLI is on PATH and prints a version.',
        appliesTo: ['hard_hook', 'supervised', 'post_pr'],
    },
    {
        id: 'repo_detected',
        title: 'Repo detected',
        truthTier: 'deterministic',
        reportKey: 'repo_detected',
        summary: 'A git repository with a HEAD commit is resolved to govern against.',
        appliesTo: ['hard_hook', 'supervised', 'post_pr'],
    },
    {
        id: 'repo_brain_indexed',
        title: 'Repo brain indexed',
        truthTier: 'deterministic',
        reportKey: 'repo_brain_indexed',
        summary: 'A structural map of files, owners, symbols, and sensitive surfaces exists.',
        appliesTo: ['hard_hook', 'supervised', 'post_pr'],
    },
    {
        id: 'runtime_active',
        title: 'Runtime active',
        truthTier: 'deterministic',
        reportKey: 'runtime_active',
        summary: 'The local runtime is activated for the repo and paired.',
        appliesTo: ['hard_hook', 'supervised'],
    },
    {
        id: 'session_live',
        title: 'Governed session live',
        truthTier: 'deterministic',
        reportKey: 'governed_session',
        summary: 'At least one governed agent session has run (or is live).',
        appliesTo: ['hard_hook', 'supervised'],
    },
    {
        id: 'block_observed',
        title: 'Boundary block observed',
        truthTier: 'deterministic',
        reportKey: 'last_block',
        summary: 'A protected-boundary write was blocked before it landed.',
        appliesTo: ['hard_hook', 'supervised'],
    },
    {
        id: 'exact_approval_observed',
        title: 'Exact-path approval observed',
        truthTier: 'deterministic',
        reportKey: 'exact_approval',
        summary: 'An approval granted exactly one path — scope did not widen.',
        appliesTo: ['hard_hook', 'supervised'],
    },
    {
        id: 'neighbor_contained',
        title: 'Neighbor containment',
        truthTier: 'deterministic',
        reportKey: 'neighbor_contained',
        summary: 'A file adjacent to the approved path stayed blocked.',
        appliesTo: ['hard_hook', 'supervised'],
    },
    {
        id: 'ai_change_record_exported',
        title: 'AI Change Record exported',
        truthTier: 'deterministic',
        reportKey: 'ai_change_record',
        summary: 'A source-free AI Change Record / admission record was exported.',
        appliesTo: ['hard_hook', 'supervised', 'post_pr'],
    },
    {
        id: 'backend_receipt_verified',
        title: 'Backend receipt verified',
        truthTier: 'backend_signed',
        reportKey: 'backend_receipt',
        summary: 'The record verifies against a signed receipt under the configured key.',
        appliesTo: ['hard_hook', 'supervised', 'post_pr'],
        optional: true,
    },
    {
        id: 'action_report_available',
        title: 'Action report available',
        truthTier: 'deterministic',
        reportKey: 'action_report',
        summary: 'The GitHub Action workflow is wired to render the source-free PR report.',
        appliesTo: ['hard_hook', 'supervised', 'post_pr'],
        optional: true,
    },
];
/** Source-free repo identity: a hash of the absolute path, never its contents. */
function hashRepoIdentity(repoRoot) {
    return (0, node_crypto_1.createHash)('sha256').update(repoRoot).digest('hex').slice(0, 16);
}
function safeCliVersion() {
    try {
        // Resolve the CLI's own package version without spawning a subprocess.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pkg = require('../../package.json');
        return typeof pkg?.version === 'string' ? pkg.version : null;
    }
    catch {
        return null;
    }
}
function isActionWorkflowConfigured(repoRoot) {
    const candidates = [
        (0, node_path_1.join)(repoRoot, '.github', 'workflows', 'neurcode.yml'),
        (0, node_path_1.join)(repoRoot, '.github', 'workflows', 'neurcode.yaml'),
    ];
    if (candidates.some((p) => (0, node_fs_1.existsSync)(p)))
        return true;
    // Any workflow that references the Neurcode Action counts.
    const dir = (0, node_path_1.join)(repoRoot, '.github', 'workflows');
    if (!(0, node_fs_1.existsSync)(dir))
        return false;
    try {
        for (const file of (0, node_fs_1.readdirSync)(dir)) {
            if (!/\.ya?ml$/.test(file))
                continue;
            const body = (0, node_fs_1.readFileSync)((0, node_path_1.join)(dir, file), 'utf8');
            if (/neurcode-actions|@neurcode-ai\/action/i.test(body))
                return true;
        }
    }
    catch {
        // best-effort
    }
    return false;
}
function latestAiChangeRecord(repoRoot) {
    const out = {
        sessionId: null,
        trustLevel: null,
        receiptPresent: false,
        receiptVerified: false,
    };
    const dir = (0, node_path_1.join)(repoRoot, '.neurcode-ai-record');
    if (!(0, node_fs_1.existsSync)(dir))
        return out;
    let newestMtime = -1;
    try {
        for (const file of (0, node_fs_1.readdirSync)(dir)) {
            if (!file.endsWith('.json') || file.endsWith('.receipt.json'))
                continue;
            const p = (0, node_path_1.join)(dir, file);
            const mtime = (0, node_fs_1.statSync)(p).mtimeMs;
            if (mtime <= newestMtime)
                continue;
            try {
                const envelope = JSON.parse((0, node_fs_1.readFileSync)(p, 'utf8'));
                const record = envelope?.record ?? envelope;
                const sessionId = record?.session?.sessionId ?? file.replace(/\.json$/, '');
                const trustLevel = typeof envelope?.trustLevel === 'string'
                    ? envelope.trustLevel
                    : record?.integrity?.trustLevel ?? null;
                const receiptPresent = Boolean(envelope?.receipt)
                    || (0, node_fs_1.existsSync)((0, node_path_1.join)(dir, file.replace(/\.json$/, '.receipt.json')));
                const verification = envelope?.verification;
                const receiptVerified = trustLevel === 'backend_signed_verified'
                    || verification?.trustLevel === 'backend_signed_verified';
                out.sessionId = sessionId;
                out.trustLevel = trustLevel;
                out.receiptPresent = receiptPresent;
                out.receiptVerified = Boolean(receiptVerified);
                newestMtime = mtime;
            }
            catch {
                // skip corrupt envelope
            }
        }
    }
    catch {
        // best-effort
    }
    return out;
}
function latestAdmissionSessionId(repoRoot) {
    const dir = (0, admission_artifact_1.admissionDir)(repoRoot);
    if (!(0, node_fs_1.existsSync)(dir))
        return null;
    try {
        const candidates = (0, node_fs_1.readdirSync)(dir)
            .filter((f) => f.endsWith('.json'))
            .map((f) => {
            try {
                return { sessionId: f.replace(/\.json$/, ''), mtime: (0, node_fs_1.statSync)((0, node_path_1.join)(dir, f)).mtimeMs };
            }
            catch {
                return null;
            }
        })
            .filter((c) => c !== null)
            .sort((a, b) => b.mtime - a.mtime);
        return candidates[0]?.sessionId ?? null;
    }
    catch {
        return null;
    }
}
function eventTimeMs(event) {
    const parsed = Date.parse(event.ts);
    return Number.isFinite(parsed) ? parsed : 0;
}
/**
 * Deterministic neighbor-containment signal: a session approved exactly one
 * path yet still blocked a different path. That proves the approval did not
 * silently widen scope. Source-free — only paths and verdicts are read.
 */
function deriveNeighborContainment(session) {
    const approvedPaths = session.contract.approvedPaths ?? [];
    if (approvedPaths.length === 0)
        return { contained: false, approvedPath: null, neighborPath: null };
    const approvedSet = new Set(approvedPaths);
    const blocks = session.events
        .filter((e) => e.type === 'check_block' && e.filePath && !approvedSet.has(e.filePath))
        .sort((a, b) => eventTimeMs(a) - eventTimeMs(b));
    const neighbor = blocks[blocks.length - 1]?.filePath ?? null;
    return {
        contained: neighbor !== null,
        approvedPath: approvedPaths[0] ?? null,
        neighborPath: neighbor,
    };
}
function gatherRepoBrain(repoRoot) {
    const empty = {
        status: 'not_evaluated',
        recoveryCommand: 'neurcode brain index',
        filesIndexed: null,
        sensitiveSurfaces: [],
        ownerBoundaries: [],
        reuseAdvisories: [],
        highFanOutSymbols: [],
        reviewFirst: [],
    };
    let artifact;
    try {
        artifact = (0, local_repo_brain_1.readLocalRepoBrain)(repoRoot);
    }
    catch {
        return empty;
    }
    if (!artifact)
        return empty;
    const sensitiveSurfaces = Array.from(new Set((artifact.hotspots || [])
        .filter((h) => (h.sensitiveKinds || []).length > 0)
        .map((h) => h.file))).slice(0, 8);
    const ownerBoundaries = (artifact.ownerBoundaries || [])
        .slice(0, 8)
        .map((b) => ({ pattern: b.pattern, owners: b.owners }));
    const reuseAdvisories = (artifact.reuseFindings || [])
        .slice(0, 8)
        .map((r) => ({
        symbolName: r.symbolName,
        files: r.files.slice(0, 4),
        severity: r.severity,
        confidence: r.confidence,
    }));
    const highFanOutSymbols = [...(artifact.hotspots || [])]
        .sort((a, b) => b.importFanIn - a.importFanIn || b.symbolCount - a.symbolCount)
        .slice(0, 6)
        .map((h) => ({ file: h.file, importFanIn: h.importFanIn, symbolCount: h.symbolCount }));
    const reviewFirst = [...(artifact.hotspots || [])]
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map((h) => h.file);
    return {
        status: 'measured',
        recoveryCommand: 'neurcode brain index',
        filesIndexed: artifact.summary?.filesIndexed ?? null,
        sensitiveSurfaces,
        ownerBoundaries,
        reuseAdvisories,
        highFanOutSymbols,
        reviewFirst,
    };
}
/**
 * Read-only inspection of the repo's local governance state. Every probe is
 * defensive — a missing/corrupt artifact degrades to "not done", never throws.
 */
function gatherGuidedEvalContext(repoRoot, options = {}) {
    const agent = options.agent ?? 'claude';
    const enforcement = enforcementForAgent(agent);
    const generatedAt = options.generatedAt ?? new Date().toISOString();
    const runtimeState = (0, runtime_state_1.detectRuntimeState)(repoRoot);
    const brainIndexed = (() => {
        try {
            if ((0, brain_cache_1.loadBrainCacheManifest)(repoRoot))
                return true;
        }
        catch {
            // ignore
        }
        try {
            return (0, local_repo_brain_1.readLocalRepoBrain)(repoRoot) !== null;
        }
        catch {
            return false;
        }
    })();
    const runtimeConnection = (() => {
        try {
            return (0, runtime_connection_1.loadRuntimeConnection)(repoRoot);
        }
        catch {
            return null;
        }
    })();
    const hasLocalActivationMarker = (0, node_fs_1.existsSync)((0, node_path_1.join)(repoRoot, '.neurcode', 'profile.json'))
        || (0, node_fs_1.existsSync)((0, node_path_1.join)(repoRoot, '.neurcode', 'runtime', 'hook-heartbeat.json'));
    const runtimeActive = runtimeState.hasNeurcodeDir && (Boolean(runtimeConnection)
        || runtimeState.hasIntentPack
        || hasLocalActivationMarker);
    const activeSession = (() => {
        try {
            return (0, governance_runtime_1.loadActiveSession)(repoRoot);
        }
        catch {
            return null;
        }
    })();
    const sessions = (() => {
        try {
            return (0, runtime_evidence_1.listRuntimeSessions)(repoRoot);
        }
        catch {
            return [];
        }
    })();
    let blockCount = 0;
    let approvalCount = 0;
    let lastBlockPath = null;
    let lastBlockTime = -1;
    let exactApprovalPath = null;
    let exactApprovalOnly = false;
    let neighborContained = false;
    let neighborBlockedPath = null;
    for (const record of sessions) {
        blockCount += record.blockCount;
        approvalCount += record.approvalCount;
        for (const event of record.session.events) {
            if (event.type === 'check_block' && event.filePath) {
                const t = eventTimeMs(event);
                if (t >= lastBlockTime) {
                    lastBlockTime = t;
                    lastBlockPath = event.filePath;
                }
            }
        }
        const approvedPaths = record.session.contract.approvedPaths ?? [];
        if (approvedPaths.length > 0 && !exactApprovalPath) {
            exactApprovalPath = approvedPaths[0];
            exactApprovalOnly = approvedPaths.length === 1;
        }
        if (!neighborContained) {
            const neighbor = deriveNeighborContainment(record.session);
            if (neighbor.contained) {
                neighborContained = true;
                neighborBlockedPath = neighbor.neighborPath;
            }
        }
    }
    const acr = latestAiChangeRecord(repoRoot);
    const admissionSessionId = latestAdmissionSessionId(repoRoot);
    const facts = {
        cliInstalled: true,
        cliVersion: safeCliVersion(),
        isGitRepo: runtimeState.isGitRepo,
        hasHeadCommit: runtimeState.hasHeadCommit,
        brainIndexed,
        runtimeActive,
        activeSessionId: activeSession?.sessionId ?? null,
        sessionCount: sessions.length,
        blockCount,
        approvalCount,
        lastBlockPath,
        exactApprovalPath,
        exactApprovalOnly,
        neighborContained,
        neighborBlockedPath,
        aiChangeRecordSessionId: acr.sessionId ?? admissionSessionId,
        aiChangeRecordTrustLevel: acr.trustLevel,
        receiptPresent: acr.receiptPresent,
        receiptVerified: acr.receiptVerified,
        actionWorkflowConfigured: isActionWorkflowConfigured(repoRoot),
        repoBrain: gatherRepoBrain(repoRoot),
    };
    return {
        schemaVersion: exports.GUIDED_EVAL_SCHEMA_VERSION,
        generatedAt,
        repoRoot,
        repoRootHash: hashRepoIdentity(repoRoot),
        agent,
        enforcement,
        mode: options.mode ?? 'real',
        facts,
    };
}
// ── Agent-aware next-command recipes ──────────────────────────────────────────
function cliAgentToken(agent) {
    if (agent === 'action')
        return 'claude';
    return agent;
}
function fixtureScopedCommand(command, mode) {
    return mode === 'fixture' ? `${command} --dir .neurcode/eval/fixture` : command;
}
function fixtureAwareRecordCommands(mode) {
    if (mode === 'fixture') {
        return [
            'neurcode session export-record --latest --signed --output .neurcode-ai-record/guided-eval-record.json --dir .neurcode/eval/fixture --json',
            'neurcode session verify-record --record .neurcode/eval/fixture/.neurcode-ai-record/guided-eval-record.json --json',
        ].join('\n');
    }
    return [
        'neurcode session export-record --latest --signed --output .neurcode-ai-record/latest-eval-record.json --json',
        'neurcode session verify-record --record .neurcode-ai-record/latest-eval-record.json --json',
    ].join('\n');
}
/**
 * The single command an evaluator should run to make progress on a step, for
 * the selected agent. Source-free, copy-pasteable, no destructive edits — in
 * real-repo mode the "trigger a block" guidance is described, not auto-run.
 */
function stepCommand(stepId, agent, mode) {
    const token = cliAgentToken(agent);
    const isAction = agent === 'action';
    const activationDir = mode === 'fixture' ? '--dir .neurcode/eval/fixture' : '--dir .';
    const billingPath = 'src/billing/charge.py';
    const neighborPath = 'src/billing/refund.py';
    const sessionGoal = 'Evaluate exact-path runtime governance';
    const sessionPlan = 'Safe path first; request exact approval for billing boundary';
    switch (stepId) {
        case 'cli_installed':
            return 'npx -y @neurcode-ai/cli@latest --version';
        case 'repo_detected':
            return mode === 'fixture'
                ? `neurcode eval start --agent ${token} --fixture`
                : 'git status --short';
        case 'repo_brain_indexed':
            return mode === 'fixture'
                ? 'cd .neurcode/eval/fixture && neurcode brain index'
                : 'neurcode brain index';
        case 'runtime_active':
            return isAction
                ? 'neurcode admission doctor'
                : `neurcode activate ${token} ${activationDir}`;
        case 'session_live':
            return fixtureScopedCommand(`neurcode agent guard start ${token} --goal "${sessionGoal}" --plan "${sessionPlan}" --no-supervise`, mode);
        case 'block_observed':
            return fixtureScopedCommand(`neurcode agent check ${billingPath} --agent ${token}`, mode);
        case 'exact_approval_observed':
            return mode === 'fixture'
                ? `neurcode session approve --path ${billingPath} --reason "guided eval exact-path approval" --dir .neurcode/eval/fixture`
                : `neurcode session approve --path ${billingPath} --reason "guided eval exact-path approval"`;
        case 'neighbor_contained':
            return fixtureScopedCommand(`neurcode agent check ${neighborPath} --agent ${token}`, mode);
        case 'ai_change_record_exported':
            return mode === 'fixture'
                ? 'neurcode session export-admission --dir .neurcode/eval/fixture --explain'
                : 'neurcode session export-admission --explain';
        case 'backend_receipt_verified':
            return fixtureAwareRecordCommands(mode);
        case 'action_report_available':
            return 'gh run list --workflow neurcode.yml --limit 3';
        default:
            return 'neurcode eval status';
    }
}
function deriveStepStatus(def, ctx) {
    const f = ctx.facts;
    const applies = def.appliesTo.includes(ctx.enforcement);
    if (!applies) {
        return {
            status: 'not_applicable',
            fact: ctx.enforcement === 'post_pr'
                ? 'Not applicable for the post-PR Action posture (no live pre-write session).'
                : 'Not applicable for this agent posture.',
        };
    }
    switch (def.id) {
        case 'cli_installed':
            return f.cliInstalled
                ? { status: 'done', fact: `Neurcode CLI ${f.cliVersion ?? ''} resolved.`.trim() }
                : { status: 'pending', fact: 'CLI not detected on PATH.' };
        case 'repo_detected':
            if (f.isGitRepo && f.hasHeadCommit)
                return { status: 'done', fact: 'Git repository with a HEAD commit detected.' };
            if (f.isGitRepo)
                return { status: 'attention', fact: 'Git repo found but no HEAD commit yet — commit a baseline.' };
            return { status: 'pending', fact: 'No git repository detected in this directory.' };
        case 'repo_brain_indexed':
            return f.brainIndexed
                ? {
                    status: 'done',
                    fact: f.repoBrain.filesIndexed != null
                        ? `Repo brain indexed (${f.repoBrain.filesIndexed} files).`
                        : 'Repo brain index present.',
                }
                : { status: 'pending', fact: 'Repo brain not indexed yet.' };
        case 'runtime_active':
            return f.runtimeActive
                ? { status: 'done', fact: 'Local runtime activated and paired for this repo.' }
                : { status: 'pending', fact: 'Runtime not activated for this repo.' };
        case 'session_live':
            if (f.activeSessionId)
                return { status: 'done', fact: `Governed session live: ${f.activeSessionId}.` };
            if (f.sessionCount > 0)
                return { status: 'done', fact: `${f.sessionCount} governed session(s) recorded.` };
            return { status: 'pending', fact: 'No governed session has run yet.' };
        case 'block_observed':
            return f.blockCount > 0
                ? {
                    status: 'done',
                    fact: `Boundary block observed${f.lastBlockPath ? ` on ${f.lastBlockPath}` : ''} (${f.blockCount} total).`,
                }
                : { status: 'pending', fact: 'No boundary block observed yet.' };
        case 'exact_approval_observed':
            if (f.approvalCount > 0 && f.exactApprovalPath) {
                return {
                    status: f.exactApprovalOnly ? 'done' : 'attention',
                    fact: `Approved exactly: ${f.exactApprovalPath}${f.exactApprovalOnly ? '' : ' (more than one path approved — review scope)'}.`,
                };
            }
            return { status: 'pending', fact: 'No exact-path approval observed yet.' };
        case 'neighbor_contained':
            if (f.neighborContained) {
                return {
                    status: 'done',
                    fact: `Neighbor stayed blocked${f.neighborBlockedPath ? `: ${f.neighborBlockedPath}` : ''} after approval.`,
                };
            }
            if (f.approvalCount > 0) {
                return { status: 'pending', fact: 'Approval recorded; try editing an adjacent file to confirm it stays blocked.' };
            }
            return { status: 'pending', fact: 'Run the approval step first, then test a neighbor file.' };
        case 'ai_change_record_exported':
            return f.aiChangeRecordSessionId
                ? { status: 'done', fact: `Source-free record exported for ${f.aiChangeRecordSessionId}.` }
                : { status: 'pending', fact: 'No AI Change Record / admission record exported yet.' };
        case 'backend_receipt_verified':
            if (f.receiptVerified) {
                return { status: 'done', fact: `Receipt verified (trust: ${f.aiChangeRecordTrustLevel ?? 'backend_signed_verified'}).` };
            }
            if (f.receiptPresent)
                return { status: 'attention', fact: 'Receipt present but not verified — run verify-record.' };
            return { status: 'pending', fact: 'No signed receipt yet. Export with --signed against the backend.' };
        case 'action_report_available':
            if (f.actionWorkflowConfigured)
                return { status: 'done', fact: 'Neurcode Action workflow is configured.' };
            if (ctx.enforcement === 'post_pr')
                return { status: 'pending', fact: 'Add the Neurcode Action workflow to render PR reports.' };
            return { status: 'not_applicable', fact: 'Optional: add the Action for post-PR routing (not required for this agent).' };
        default:
            return { status: 'pending', fact: '' };
    }
}
function buildGuidedEvalState(ctx) {
    const steps = exports.GUIDED_EVAL_STEPS.map((def) => {
        const { status, fact } = deriveStepStatus(def, ctx);
        return {
            id: def.id,
            title: def.title,
            truthTier: def.truthTier,
            reportKey: def.reportKey,
            status,
            fact,
            command: stepCommand(def.id, ctx.agent, ctx.mode),
            optional: def.optional === true,
        };
    });
    const applicableSteps = steps.filter((s) => s.status !== 'not_applicable');
    const done = applicableSteps.filter((s) => s.status === 'done').length;
    const pending = applicableSteps.filter((s) => s.status === 'pending').length;
    const attention = applicableSteps.filter((s) => s.status === 'attention').length;
    const notApplicable = steps.length - applicableSteps.length;
    // A step that is optional and pending does not block completion.
    const blocking = applicableSteps.filter((s) => !s.optional && (s.status === 'pending' || s.status === 'attention'));
    const complete = blocking.length === 0 && applicableSteps.length > 0;
    const percent = applicableSteps.length === 0 ? 0 : Math.round((done / applicableSteps.length) * 100);
    const next = steps.find((s) => !s.optional && (s.status === 'pending' || s.status === 'attention'))
        ?? steps.find((s) => s.optional && s.status === 'pending')
        ?? null;
    const nextAction = next
        ? {
            stepId: next.id,
            title: next.title,
            command: next.command,
            why: next.fact,
        }
        : null;
    return {
        schemaVersion: exports.GUIDED_EVAL_SCHEMA_VERSION,
        generatedAt: ctx.generatedAt,
        repoRootHash: ctx.repoRootHash,
        agent: ctx.agent,
        enforcement: ctx.enforcement,
        enforcementLabel: enforcementLabel(ctx.enforcement),
        mode: ctx.mode,
        steps,
        summary: { applicable: applicableSteps.length, done, pending, attention, notApplicable, complete, percent },
        nextAction,
        sourceFree: true,
    };
}
// ── Source-free guarantee ─────────────────────────────────────────────────────
// Anchored patterns only, so markdown tables (`|---|`) never false-positive.
const FORBIDDEN_SOURCE_PATTERNS = [
    'diff --git',
    '@@ -',
    '\n+++ b/',
    '\n--- a/',
    '-----BEGIN',
    'PRIVATE KEY',
    'sk-ant-',
    'sk-proj-',
    /\bghp_[A-Za-z0-9]{16,}\b/,
    /\bgho_[A-Za-z0-9]{16,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
];
function findSourceLeaks(text) {
    const leaks = [];
    for (const pattern of FORBIDDEN_SOURCE_PATTERNS) {
        if (typeof pattern === 'string') {
            if (text.includes(pattern))
                leaks.push(pattern);
        }
        else if (pattern.test(text)) {
            leaks.push(pattern.source);
        }
    }
    return leaks;
}
/** Throw if a would-be artifact contains source/diff/secret shapes. */
function assertGuidedEvalSourceFree(value, label = 'guided-eval artifact') {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    const leaks = findSourceLeaks(text);
    if (leaks.length > 0) {
        throw new Error(`${label} failed source-free scan: ${leaks.join(', ')}`);
    }
}
// ── Shareable evaluation report (P3) ──────────────────────────────────────────
exports.GUIDED_EVAL_REPORT_SCHEMA_VERSION = 'neurcode.guided-eval-report.v1';
const WHAT_THIS_DOES_NOT_PROVE = [
    'It does not prove the source code is correct, secure, or free of vulnerabilities.',
    'A verified receipt confirms issuance under the configured signing key and integrity — not source correctness.',
    'Advisory reuse/architecture findings can be false positives and must be read as advisory.',
    '"Not evaluated" steps were genuinely not measured in this run.',
];
const REPORT_EXCLUDES = ['source code', 'diff hunks', 'patch bodies', 'raw prompts', 'secrets', 'private file contents'];
/**
 * Build the shareable, source-free evaluation report from a derived state +
 * gathered context. The returned object is asserted source-free by the caller
 * before it is written or surfaced.
 */
function buildGuidedEvalReport(state, ctx) {
    const f = ctx.facts;
    return {
        schemaVersion: exports.GUIDED_EVAL_REPORT_SCHEMA_VERSION,
        generatedAt: ctx.generatedAt,
        agent: state.agent,
        enforcement: state.enforcement,
        enforcementLabel: state.enforcementLabel,
        mode: state.mode,
        repo: { rootHash: ctx.repoRootHash },
        result: {
            complete: state.summary.complete,
            percent: state.summary.percent,
            done: state.summary.done,
            applicable: state.summary.applicable,
        },
        steps: state.steps.map((s) => ({
            id: s.id,
            title: s.title,
            reportKey: s.reportKey,
            truthTier: s.truthTier,
            truthTierLabel: exports.GUIDED_EVAL_TRUTH_TIERS[s.truthTier].label,
            status: s.status,
            fact: s.fact,
        })),
        facts: {
            boundary: { lastBlockPath: f.lastBlockPath, blockCount: f.blockCount },
            approval: { exactApprovalPath: f.exactApprovalPath, exactApprovalOnly: f.exactApprovalOnly, approvalCount: f.approvalCount },
            neighbor: { contained: f.neighborContained, neighborBlockedPath: f.neighborBlockedPath },
            aiChangeRecord: { sessionId: f.aiChangeRecordSessionId, trustLevel: f.aiChangeRecordTrustLevel },
            backendReceipt: { present: f.receiptPresent, verified: f.receiptVerified },
            actionReport: { configured: f.actionWorkflowConfigured },
        },
        repoBrain: f.repoBrain,
        truthTaxonomy: Object.fromEntries(Object.keys(exports.GUIDED_EVAL_TRUTH_TIERS).map((k) => [k, exports.GUIDED_EVAL_TRUTH_TIERS[k].label])),
        whatThisDoesNotProve: WHAT_THIS_DOES_NOT_PROVE,
        privacy: { sourceFree: true, excludes: REPORT_EXCLUDES },
    };
}
const STATUS_GLYPH = {
    done: '✓',
    pending: '·',
    attention: '!',
    not_applicable: '–',
};
/** Render the report as a source-free shareable markdown artifact. */
function renderGuidedEvalReportMarkdown(report) {
    const lines = [];
    lines.push('# Guided Enterprise Evaluation — Report');
    lines.push('');
    lines.push(`Generated: ${report.generatedAt}`);
    lines.push(`Agent: ${report.agent} · Enforcement: ${report.enforcementLabel}`);
    lines.push(`Mode: ${report.mode} · Repo identity: ${report.repo.rootHash} (path hash — no source)`);
    lines.push(`Result: ${report.result.done}/${report.result.applicable} applicable steps done (${report.result.percent}%)${report.result.complete ? ' — complete' : ''}`);
    lines.push('');
    lines.push('## Steps');
    lines.push('');
    lines.push('| | Step | Tier | Status | Fact |');
    lines.push('|---|---|---|---|---|');
    for (const s of report.steps) {
        lines.push(`| ${STATUS_GLYPH[s.status]} | ${s.title} | ${s.truthTierLabel} | ${s.status} | ${s.fact} |`);
    }
    lines.push('');
    lines.push('## Boundary, approval, and containment facts');
    lines.push('');
    lines.push(`- Last block: ${report.facts.boundary.lastBlockPath ?? 'none'} (${report.facts.boundary.blockCount} total)`);
    lines.push(`- Exact approval: ${report.facts.approval.exactApprovalPath ?? 'none'} (exact-only: ${report.facts.approval.exactApprovalOnly ? 'yes' : 'no'})`);
    lines.push(`- Neighbor contained: ${report.facts.neighbor.contained ? 'yes' : 'no'}${report.facts.neighbor.neighborBlockedPath ? ` (${report.facts.neighbor.neighborBlockedPath})` : ''}`);
    lines.push(`- AI Change Record: ${report.facts.aiChangeRecord.sessionId ?? 'none'} (trust: ${report.facts.aiChangeRecord.trustLevel ?? 'n/a'})`);
    lines.push(`- Backend receipt: present ${report.facts.backendReceipt.present ? 'yes' : 'no'}, verified ${report.facts.backendReceipt.verified ? 'yes' : 'no'}`);
    lines.push(`- Action report: ${report.facts.actionReport.configured ? 'configured' : 'not configured'}`);
    lines.push('');
    lines.push('## Repo brain findings');
    lines.push('');
    if (report.repoBrain.status === 'measured') {
        lines.push(`- Files indexed: ${report.repoBrain.filesIndexed ?? 'n/a'}`);
        lines.push(`- Sensitive surfaces: ${report.repoBrain.sensitiveSurfaces.join(', ') || 'none'}`);
        lines.push(`- Owner boundaries: ${report.repoBrain.ownerBoundaries.map((b) => `${b.pattern} → ${b.owners.join('/')}`).join('; ') || 'none'}`);
        lines.push(`- High fan-out symbols: ${report.repoBrain.highFanOutSymbols.map((h) => `${h.file} (${h.importFanIn} callers)`).join('; ') || 'none'}`);
        lines.push(`- Reuse advisories: ${report.repoBrain.reuseAdvisories.map((r) => `${r.symbolName ?? 'symbol'} [${r.severity}]`).join('; ') || 'none'}`);
        lines.push(`- What to review first: ${report.repoBrain.reviewFirst.join(', ') || 'none'}`);
    }
    else {
        lines.push(`- Not evaluated in this run — run \`${report.repoBrain.recoveryCommand}\` on the target repo to populate.`);
    }
    lines.push('');
    lines.push('## What this does NOT prove');
    lines.push('');
    for (const item of report.whatThisDoesNotProve)
        lines.push(`- ${item}`);
    lines.push('');
    lines.push(`_Source-free: paths, owners, symbol names, hashes, verdicts, and tiers only. Excludes: ${report.privacy.excludes.join(', ')}._`);
    lines.push('');
    return lines.join('\n');
}
/**
 * Create a controlled, source-free demo fixture under `.neurcode/eval/fixture/`
 * so an evaluator can safely run the "trigger a block / approve / neighbor"
 * steps WITHOUT touching their real source. The fixture is its own git repo
 * (the parent `.neurcode/*` is gitignored), with a CODEOWNERS boundary and
 * placeholder files that carry no secrets and no real logic.
 */
function scaffoldEvalFixture(repoRoot) {
    const dir = (0, node_path_1.join)(repoRoot, '.neurcode', 'eval', 'fixture');
    const alreadyExisted = (0, node_fs_1.existsSync)((0, node_path_1.join)(dir, 'CODEOWNERS'));
    const files = [
        [
            'README.md',
            '# Neurcode evaluation fixture\n\nA safe, throwaway repo for the guided enterprise evaluation.\nEdits here never touch your real source. Run the governed steps against this directory.\n',
        ],
        [
            'CODEOWNERS',
            '# Boundary fixtures for the guided evaluation.\nsrc/billing/ @payments-team\nconfig/secrets/ @security-platform\n',
        ],
        ['src/tasks/export_task.ts', 'export const fixtureTask = true;\n'],
        ['src/billing/charge.py', 'fixture: billing boundary placeholder (owned by @payments-team)\n'],
        ['src/billing/refund.py', 'fixture: neighbor of charge, also a billing boundary\n'],
        // Explicit governance config so session-hook always enforces approval_required_boundary
        // (without this the fixture defaults to advisory mode, which returns
        // profile_or_runtime_health_block instead of the real owner-boundary reason).
        [
            '.neurcode/governance.json',
            JSON.stringify({
                schemaVersion: 'neurcode.governance.v1',
                localMode: 'strict',
                approvalRequiredGlobs: ['src/billing/**', 'config/secrets/**'],
                sensitiveGlobs: ['src/billing/**', 'config/secrets/**'],
            }, null, 2) + '\n',
        ],
        // .gitignore: keep .neurcode/ runtime state out of git status so that
        // profileCacheStateFingerprint stays stable between agent start and check.
        ['.gitignore', '.neurcode/\n'],
    ];
    for (const [rel, content] of files) {
        const p = (0, node_path_1.join)(dir, rel);
        (0, node_fs_1.mkdirSync)((0, node_path_1.join)(p, '..'), { recursive: true });
        // Always overwrite governance.json and .gitignore so stale fixtures self-heal.
        if (!(0, node_fs_1.existsSync)(p) || rel === '.neurcode/governance.json' || rel === '.gitignore') {
            (0, node_fs_1.writeFileSync)(p, content, 'utf8');
        }
    }
    // Migrate fixtures created by older CLI builds. The fixture is disposable
    // and isolated from user source, so remove the retired Python safe-path and
    // commit the canonical fixture files to keep git-backed Brain indexing
    // deterministic across repeat runs.
    (0, node_fs_1.rmSync)((0, node_path_1.join)(dir, 'src', 'tasks', 'export_task.py'), { force: true });
    // Initialise as its own git repo so brain/activate/verify have a HEAD.
    if (!(0, node_fs_1.existsSync)((0, node_path_1.join)(dir, '.git'))) {
        try {
            (0, node_child_process_1.execSync)('git init -q && git add -A && git -c user.email=eval@neurcode.local -c user.name=neurcode-eval commit -q -m "eval fixture baseline"', { cwd: dir, stdio: 'ignore' });
        }
        catch {
            // git may be unavailable; the fixture files still exist for inspection.
        }
    }
    try {
        (0, node_child_process_1.execSync)('git add -A', { cwd: dir, stdio: 'ignore' });
        (0, node_child_process_1.execSync)('git -c user.email=eval@neurcode.local -c user.name=neurcode-eval commit -q -m "refresh eval fixture"', { cwd: dir, stdio: 'ignore' });
    }
    catch {
        // No fixture delta to commit (the normal idempotent repeat-run case), or
        // git is unavailable. The runtime will report either condition honestly.
    }
    // Write a runtime-manifest.json for the fixture so session-hook passes the
    // assertProtectedRuntimeAuthority check.  Without this, the check fails with
    // profile_or_runtime_health_block even before the profile/boundary logic runs.
    // The manifest records the CURRENT CLI identity so the hash check succeeds.
    try {
        const identity = (0, cli_runtime_1.collectCliRuntimeIdentity)({ bundledCliDir: (0, cli_entry_1.bundledCliDir)() });
        const manifest = (0, cli_runtime_1.createActivatedRuntimeManifest)({
            repoRoot: dir,
            identity,
            integrations: [
                {
                    adapter: 'codex-mcp',
                    enforcementLevel: 'cooperative',
                    absoluteEntrypoint: identity.entryRealPath,
                    machinePinned: false,
                },
            ],
        });
        (0, cli_runtime_1.writeActivatedRuntimeManifest)(dir, manifest);
    }
    catch {
        // Non-fatal — demo may fail the authority check but the fixture files exist.
    }
    return {
        dir,
        relativeDir: '.neurcode/eval/fixture',
        created: !alreadyExisted,
        files: files.map(([rel]) => rel),
    };
}
/**
 * Clear only the ephemeral runtime state from the eval fixture directory so
 * consecutive demo runs start from a deterministic baseline.
 *
 * Safe because every item removed is regenerated by the next agent start:
 *   - session files produced by previous demo runs (all are in finished state)
 *   - the active-session pointer (always re-created by agent start)
 *   - the profile cache (rebuilt on first check)
 *
 * Nothing here touches runtime-outbox.json, dead letters, replay artifacts,
 * or any source file.  The fixture is a throwaway repo — its evidence has no
 * production value beyond the current demo loop.
 */
function cleanFixtureRuntimeState(fixtureDir) {
    const neurcodePath = (0, node_path_1.join)(fixtureDir, '.neurcode');
    // Remove finished session records produced by previous demo runs.
    const sessionsPath = (0, node_path_1.join)(neurcodePath, 'sessions');
    if ((0, node_fs_1.existsSync)(sessionsPath)) {
        for (const f of (0, node_fs_1.readdirSync)(sessionsPath)) {
            if (!f.endsWith('.json'))
                continue;
            try {
                const filePath = (0, node_path_1.join)(sessionsPath, f);
                const session = JSON.parse((0, node_fs_1.readFileSync)(filePath, 'utf8'));
                // Only remove sessions that are already in a terminal state.
                if (session.status === 'finished' || session.status === 'failed') {
                    (0, node_fs_1.rmSync)(filePath, { force: true });
                }
            }
            catch { /* best-effort — corrupt file left for manual review */ }
        }
    }
    // Clear the active-session pointer and profile cache; both are ephemeral.
    for (const name of ['active-session.json', 'profile-cache.json']) {
        try {
            (0, node_fs_1.rmSync)((0, node_path_1.join)(neurcodePath, name), { force: true });
        }
        catch { /* ignore */ }
    }
}
//# sourceMappingURL=guided-eval.js.map