"use strict";
/**
 * `neurcode eval demo` — the one-command local enterprise demo runner.
 *
 * Drives a complete, safe, deterministic governance loop against a throwaway
 * fixture repository and produces a source-free enterprise report + dashboard
 * summary. A first-time engineering manager or senior engineer can run a single
 * command, watch the runtime allow a safe edit, block a protected boundary,
 * contain an exact-path approval, keep a neighbor blocked, and export a
 * source-free AI Change Record — without founder handholding, GitHub Actions, or
 * cloud authentication.
 *
 * The loop is driven by self-spawning the *real* built CLI against the fixture,
 * so what an evaluator sees is the actual product enforcing — not a re-implemented
 * mock. Every expected assertion is checked; any critical failure fails the run
 * loudly and the report records exactly which checkpoint did not hold.
 *
 * Hard rules (shared with utils/guided-eval.ts):
 *   - Source-free: only paths, owners, symbol names, counts, verdicts, hashes,
 *     and tier labels are read or emitted. {@link assertEnterpriseEvalSourceFree}
 *     is the backstop before anything is written.
 *   - Honest trust posture: self-attested local record unless a backend signing
 *     key is configured and a receipt actually verifies. Never claims public-key
 *     cryptographic signing for an HMAC backend receipt.
 *   - The only writers are the fixture scaffold and the `.neurcode/eval/`
 *     report/summary artifacts (gitignored). User source is never touched.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVAL_DEMO_RUN_SCHEMA_VERSION = void 0;
exports.resolveCliEntry = resolveCliEntry;
exports.buildEvalDemoPreflight = buildEvalDemoPreflight;
exports.runEvalDemo = runEvalDemo;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const runtime_state_1 = require("./runtime-state");
const repo_brain_impact_1 = require("./repo-brain-impact");
const guided_eval_1 = require("./guided-eval");
const enterprise_eval_report_1 = require("./enterprise-eval-report");
exports.EVAL_DEMO_RUN_SCHEMA_VERSION = 'neurcode.eval-demo-run.v1';
const SIGNING_SECRET_ENV = 'NEURCODE_AI_CHANGE_RECORD_SIGNING_SECRET';
// Fixture paths (mirror utils/guided-eval.ts scaffoldEvalFixture).
// The safe fixture path is TypeScript so Graph V2 can build a complete,
// checker-backed semantic slice before the governed session starts. Python is
// intentionally regex-degraded today; using it here would make the V1.5
// authority ceiling correctly fail closed instead of proving a safe allow.
const SAFE_PATH = 'src/tasks/export_task.ts';
const BOUNDARY_PATH = 'src/billing/charge.py';
const NEIGHBOR_PATH = 'src/billing/refund.py';
// ── CLI self-spawn plumbing ───────────────────────────────────────────────────
/**
 * Resolve the entry of the *running* CLI so the demo drives the real product.
 * Works under a global install, `npx`, and local development. Prefers the
 * compiled layout (dist/commands/eval-demo.js → ../index.js), then argv[1].
 */
function resolveCliEntry() {
    const candidates = [];
    // Compiled layout: this module lives at dist/utils/eval-demo.js.
    candidates.push((0, node_path_1.resolve)(__dirname, '..', 'index.js'));
    // Some bundlers flatten to dist/eval-demo.js.
    candidates.push((0, node_path_1.resolve)(__dirname, 'index.js'));
    // The script node was invoked with (bin shim or dist/index.js).
    if (process.argv[1])
        candidates.push((0, node_path_1.resolve)(process.argv[1]));
    for (const candidate of candidates) {
        if ((0, node_fs_1.existsSync)(candidate))
            return candidate;
    }
    // Last resort: argv[1] as-is (may be a symlink node can still run).
    return process.argv[1] || candidates[0];
}
function runCli(cliEntry, args, cwd, input) {
    const r = (0, node_child_process_1.spawnSync)(process.execPath, [cliEntry, ...args], {
        cwd,
        encoding: 'utf8',
        input: input !== undefined ? `${JSON.stringify(input)}\n` : undefined,
        env: { ...process.env, NEURCODE_NONINTERACTIVE: '1' },
        maxBuffer: 1024 * 1024 * 64,
        timeout: 120_000,
    });
    return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
/** Extract the JSON object from CLI stdout (warnings may precede it on stderr). */
function parseCliJson(stdout) {
    const first = stdout.indexOf('{');
    const last = stdout.lastIndexOf('}');
    if (first === -1 || last <= first)
        return null;
    try {
        return JSON.parse(stdout.slice(first, last + 1));
    }
    catch {
        return null;
    }
}
function npmVersion() {
    try {
        const r = (0, node_child_process_1.spawnSync)('npm', ['--version'], { encoding: 'utf8', timeout: 10_000 });
        const v = (r.stdout || '').trim();
        return v || null;
    }
    catch {
        return null;
    }
}
function cliVersion() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pkg = require('../../package.json');
        return typeof pkg?.version === 'string' ? pkg.version : null;
    }
    catch {
        return null;
    }
}
function detectMultipleInstallations() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { checkDeploymentConsistency } = require('@neurcode-ai/cli-runtime');
        const bundledCliDir = (0, node_path_1.resolve)(__dirname, '..');
        const report = checkDeploymentConsistency({ bundledCliDir, strict: false });
        const installs = report?.installations ?? [];
        const distinct = new Set(installs.map((i) => i.buildFingerprint)).size;
        return { count: installs.length, distinctBuilds: distinct };
    }
    catch {
        return { count: 1, distinctBuilds: 1 };
    }
}
/**
 * Buyer-friendly preflight: Node/npm, CLI version + multiple-install recovery,
 * repo + fixture state, GitHub Actions (explicitly not required), and whether
 * evidence will be backend-signed or self-attested. Short and honest.
 */
function buildEvalDemoPreflight(repoRoot, options = {}) {
    const agent = options.agent ?? 'claude';
    const generatedAt = options.generatedAt ?? new Date().toISOString();
    const checks = [];
    // Node version (>= 20 required, with a known npm install caveat).
    const nodeMajor = Number.parseInt((process.versions.node.split('.')[0] || '0'), 10);
    checks.push(nodeMajor >= 20
        ? { id: 'node', label: 'Node.js', status: 'ok', detail: `Node ${process.versions.node} (>= 20 required).` }
        : {
            id: 'node',
            label: 'Node.js',
            status: 'warn',
            detail: `Node ${process.versions.node} detected; Neurcode requires Node >= 20.`,
            recovery: 'Install Node 20 (nvm install 20 && nvm use 20), then re-run.',
        });
    // npm version + the documented npm install caveat.
    const npm = npmVersion();
    checks.push({
        id: 'npm',
        label: 'npm',
        status: 'info',
        detail: npm ? `npm ${npm}.` : 'npm not detected on PATH (optional for npx usage).',
        recovery: 'If `npm install -g @neurcode-ai/cli` fails on older npm, use Node 20 / npm 10.8+ or `npx -y @neurcode-ai/cli@latest`.',
    });
    // CLI version + multiple-installation detection with clear recovery.
    const version = cliVersion();
    const installs = detectMultipleInstallations();
    if (installs.distinctBuilds > 1) {
        checks.push({
            id: 'cli',
            label: 'CLI version',
            status: 'warn',
            detail: `Neurcode CLI ${version ?? 'unknown'} running, but ${installs.count} installations (${installs.distinctBuilds} distinct builds) are visible on PATH.`,
            recovery: 'Pin one build: `npm uninstall -g @neurcode-ai/cli` everywhere, then `npm install -g @neurcode-ai/cli@latest` — or always use `npx -y @neurcode-ai/cli@latest`.',
        });
    }
    else {
        checks.push({
            id: 'cli',
            label: 'CLI version',
            status: 'ok',
            detail: `Neurcode CLI ${version ?? 'unknown'} (single build on PATH).`,
        });
    }
    // Repo state.
    const rt = (0, runtime_state_1.detectRuntimeState)(repoRoot);
    if (rt.isGitRepo && rt.hasHeadCommit) {
        checks.push({ id: 'repo', label: 'Repository', status: 'ok', detail: 'Git repository with a HEAD commit detected.' });
    }
    else if (rt.isGitRepo) {
        checks.push({
            id: 'repo',
            label: 'Repository',
            status: 'warn',
            detail: 'Git repo found but no HEAD commit.',
            recovery: 'The demo uses its own fixture repo, so this is fine; commit a baseline before evaluating your real repo.',
        });
    }
    else {
        checks.push({
            id: 'repo',
            label: 'Repository',
            status: 'info',
            detail: 'No git repository here — the demo scaffolds its own throwaway fixture repo, so this is OK.',
        });
    }
    // Fixture state.
    const fixtureDir = (0, node_path_1.join)(repoRoot, '.neurcode', 'eval', 'fixture');
    checks.push((0, node_fs_1.existsSync)((0, node_path_1.join)(fixtureDir, 'CODEOWNERS'))
        ? { id: 'fixture', label: 'Fixture', status: 'ok', detail: 'A previous demo fixture exists; it will be reused (idempotent).' }
        : { id: 'fixture', label: 'Fixture', status: 'info', detail: 'No fixture yet; the demo will scaffold one under .neurcode/eval/fixture (gitignored).' });
    // GitHub Actions — explicitly not required for this evaluation.
    checks.push({
        id: 'github_actions',
        label: 'GitHub Actions',
        status: 'info',
        detail: 'Not required. This evaluation is fully local — the post-PR Action is optional and never gates the demo.',
    });
    // Backend signing vs self-attested.
    const backendSigningConfigured = Boolean(process.env[SIGNING_SECRET_ENV]);
    checks.push(backendSigningConfigured
        ? {
            id: 'backend_signing',
            label: 'Evidence trust',
            status: 'ok',
            detail: 'Backend signing key detected — the runner will attempt a signed-receipt verification.',
        }
        : {
            id: 'backend_signing',
            label: 'Evidence trust',
            status: 'info',
            detail: 'No backend signing key configured — evidence will be a self-attested local record (clearly labeled). This is expected for a first evaluation.',
        });
    const ok = checks.every((c) => c.status !== 'warn' || c.id !== 'node');
    return {
        schemaVersion: 'neurcode.eval-preflight.v1',
        generatedAt,
        agent,
        ok,
        checks,
        backendSigningConfigured,
    };
}
function decisionFromCheck(payload) {
    const raw = typeof payload?.decision === 'string' ? payload.decision : 'allow';
    const decision = raw === 'deny' ? 'deny' : raw === 'warn' ? 'warn' : 'allow';
    const block = payload?.payload?.hookSpecificOutput?.blockContext ?? null;
    return {
        decision,
        blockPath: block?.filePath ?? null,
        owners: Array.isArray(block?.owners) ? block.owners : [],
        blockType: block?.blockType ?? null,
    };
}
function enforcementMethodFor(agent, enforcement) {
    if (enforcement === 'hard_hook') {
        return 'Driven through the governed-session check primitive (the same boundary decision a live Claude Code pre-write hook enforces as a hard deny).';
    }
    if (enforcement === 'post_pr') {
        return 'Driven through the governed-session check primitive; in production this agent routes advisory evidence post-PR via the Action.';
    }
    return 'Driven through the cooperative supervised-guard check primitive (the same path Codex/Cursor/Copilot use for source-free supervisor evidence).';
}
/** Ensure eval artifacts never pollute the host repo's git status. */
function ensureEvalGitignore(repoRoot) {
    const dir = (0, node_path_1.join)(repoRoot, '.neurcode', 'eval');
    (0, node_fs_1.mkdirSync)(dir, { recursive: true });
    const ignore = (0, node_path_1.join)(dir, '.gitignore');
    if (!(0, node_fs_1.existsSync)(ignore))
        (0, node_fs_1.writeFileSync)(ignore, '*\n', 'utf8');
}
/**
 * Run the complete one-command enterprise demo. Returns a structured result; the
 * command layer renders it and sets the exit code. Throws only on a programming
 * error — expected governance failures are recorded as failed checkpoints with
 * `ok: false`, so the report still explains exactly what did not hold.
 */
function runEvalDemo(options) {
    const repoRoot = options.repoRoot;
    const agent = (0, guided_eval_1.normalizeGuidedEvalAgent)(options.agent);
    const enforcement = (0, guided_eval_1.enforcementForAgent)(agent);
    const generatedAt = options.generatedAt ?? new Date().toISOString();
    const startedAt = Date.now();
    const step = (line) => options.onStep?.(line);
    const preflight = buildEvalDemoPreflight(repoRoot, { agent, generatedAt });
    const cliEntry = options.cliEntry ?? resolveCliEntry();
    const fixtureDir = (0, node_path_1.join)(repoRoot, '.neurcode', 'eval', 'fixture');
    const commandsRun = [];
    const timeline = [];
    const checkpoints = [];
    const add = (c) => {
        checkpoints.push(c);
        step(`${c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : '·'} ${c.title}: ${c.observed}`);
    };
    // Facts accumulator (filled as the loop runs).
    let sessionId = null;
    let adapter = null;
    let compatibilityMode = null;
    let safeEditAllowed = false;
    let boundaryBlockPath = null;
    let boundaryOwners = [];
    let boundaryBlockType = null;
    let exactApprovalPath = null;
    let exactApprovalOnly = false;
    let approvedPathAllowedAfter = false;
    let neighborPath = null;
    let neighborContained = false;
    let aiChangeRecordSessionId = null;
    let aiChangeRecordRelativePath = null;
    let admissionBlockedCount = null;
    let demoApprovedBy = null;
    let demoAssurance = null;
    let admissionApprovedCount = null;
    let runtimeSafety = { ...enterprise_eval_report_1.EMPTY_RUNTIME_SAFETY };
    let repoBrain = {
        status: 'not_evaluated',
        recoveryCommand: 'neurcode brain index',
        filesIndexed: null,
        sensitiveSurfaces: [],
        ownerBoundaries: [],
        reuseAdvisories: [],
        highFanOutSymbols: [],
        reviewFirst: [],
    };
    const backendReceipt = {
        configured: preflight.backendSigningConfigured,
        attempted: false,
        verified: false,
        trustLevel: null,
        provenance: preflight.backendSigningConfigured ? 'configured signing key' : 'self-attested local record (no backend signing key configured)',
    };
    // 1) Fixture scaffold — clear stale runtime state first so consecutive runs
    //    start deterministically (profile cache, finished sessions, active pointer).
    ensureEvalGitignore(repoRoot);
    const fixtureRootForClean = (0, node_path_1.join)(repoRoot, '.neurcode', 'eval', 'fixture');
    (0, guided_eval_1.cleanFixtureRuntimeState)(fixtureRootForClean);
    const fixture = (0, guided_eval_1.scaffoldEvalFixture)(repoRoot);
    add({
        id: 'fixture_scaffolded',
        title: 'Fixture scaffolded',
        truthTier: 'deterministic',
        status: (0, node_fs_1.existsSync)((0, node_path_1.join)(fixtureDir, 'CODEOWNERS')) ? 'pass' : 'fail',
        expected: 'A throwaway fixture repo with a CODEOWNERS boundary.',
        observed: `Fixture at ${fixture.relativeDir} (${fixture.created ? 'created' : 'reused'}).`,
        critical: true,
    });
    // Only proceed with the live loop if the fixture exists.
    const fixtureReady = (0, node_fs_1.existsSync)((0, node_path_1.join)(fixtureDir, 'CODEOWNERS'));
    // 2) Repo brain index + exact plan semantic slice. A safe allow must be
    // backed by the same complete plan-scoped semantic authority required by the
    // production pre-write path; the demo never bypasses or relaxes that gate.
    if (fixtureReady) {
        commandsRun.push('cd .neurcode/eval/fixture && neurcode brain index --json');
        const brain = runCli(cliEntry, ['brain', 'index', '--json'], fixtureDir);
        const brainPayload = parseCliJson(brain.stdout);
        const filesIndexed = brainPayload?.canonicalGraph?.coverage?.filesIndexed ?? null;
        let slicePayload = null;
        if (brain.status === 0 && typeof filesIndexed === 'number') {
            commandsRun.push(`cd .neurcode/eval/fixture && neurcode brain semantic-slice --file ${SAFE_PATH} --json`);
            const slice = runCli(cliEntry, ['brain', 'semantic-slice', '--file', SAFE_PATH, '--json'], fixtureDir);
            slicePayload = parseCliJson(slice.stdout);
        }
        const planCoverage = slicePayload?.coverage?.relevantPlanCoverage ?? null;
        const sliceReady = slicePayload?.ok === true && planCoverage === 1;
        add({
            id: 'repo_brain_indexed',
            title: 'Repo brain indexed',
            truthTier: 'advisory',
            status: sliceReady ? 'advisory' : 'skipped',
            expected: 'A structural map plus a complete semantic slice for the exact safe-path plan.',
            observed: sliceReady
                ? `Indexed ${filesIndexed} files; exact plan semantic coverage ${(planCoverage * 100).toFixed(0)}%.`
                : `Plan semantic authority unavailable (indexed ${filesIndexed ?? 'n/a'} files, coverage ${planCoverage ?? 'n/a'}); safe writes will fail closed.`,
            critical: false,
        });
    }
    // 3) Start a governed session.
    if (fixtureReady) {
        const goal = `Modify only ${SAFE_PATH}. Billing requires exact approval.`;
        commandsRun.push(`neurcode agent start ${agent} --goal "${goal}" --dir .neurcode/eval/fixture --no-activate --json`);
        const start = runCli(cliEntry, ['agent', 'start', agent, '--goal', goal, '--dir', fixtureDir, '--no-activate', '--json'], fixtureDir);
        const startPayload = parseCliJson(start.stdout);
        sessionId = startPayload?.session?.sessionId ?? startPayload?.sessionId ?? null;
        adapter = startPayload?.agent?.adapter ?? null;
        compatibilityMode = startPayload?.agent?.compatibilityMode ?? null;
        add({
            id: 'session_started',
            title: 'Governed session live',
            truthTier: 'deterministic',
            status: startPayload?.ok === true && sessionId ? 'pass' : 'fail',
            expected: 'A governed session is created for the selected agent posture.',
            observed: sessionId ? `Session ${sessionId} live (adapter ${adapter ?? 'n/a'}, ${compatibilityMode ?? 'n/a'}).` : `Session did not start (exit ${start.status}).`,
            critical: true,
        });
    }
    const canCheck = fixtureReady && Boolean(sessionId);
    const check = (path, toolName) => {
        commandsRun.push(`neurcode agent check ${path} --agent ${agent} --tool-name ${toolName} --session-id ${sessionId} --dir .neurcode/eval/fixture --json`);
        const r = runCli(cliEntry, ['agent', 'check', path, '--agent', agent, '--tool-name', toolName, '--session-id', sessionId, '--dir', fixtureDir, '--json'], fixtureDir);
        const payload = parseCliJson(r.stdout) ?? {};
        return {
            ...decisionFromCheck(payload),
            message: typeof payload?.message === 'string' ? payload.message : null,
            reasonCodes: Array.isArray(payload?.payload?.hookSpecificOutput?.boundedPreWrite?.reasonCodes)
                ? payload.payload.hookSpecificOutput.boundedPreWrite.reasonCodes.filter((value) => typeof value === 'string')
                : [],
        };
    };
    // 4) Safe edit allowed.
    if (canCheck) {
        const r = check(SAFE_PATH, 'Edit');
        safeEditAllowed = r.decision !== 'deny';
        timeline.push({ order: 1, phase: 'safe_edit', path: SAFE_PATH, toolName: 'Edit', decision: r.decision, blockType: r.blockType, owners: r.owners });
        add({
            id: 'safe_edit_allowed',
            title: 'Safe edit allowed',
            truthTier: 'deterministic',
            status: safeEditAllowed ? 'pass' : 'fail',
            expected: `In-scope ${SAFE_PATH} is allowed (no false positive).`,
            observed: r.decision === 'deny'
                ? `Decision: deny${r.reasonCodes.length ? ` (${r.reasonCodes.join(', ')})` : ''}${r.message ? ` — ${r.message}` : ''}.`
                : `Decision: ${r.decision}.`,
            critical: true,
        });
    }
    // 5) Protected boundary block.
    if (canCheck) {
        const r = check(BOUNDARY_PATH, 'Edit');
        boundaryBlockPath = r.blockPath ?? (r.decision === 'deny' ? BOUNDARY_PATH : null);
        boundaryOwners = r.owners;
        boundaryBlockType = r.blockType;
        timeline.push({ order: 2, phase: 'boundary_block', path: BOUNDARY_PATH, toolName: 'Edit', decision: r.decision, blockType: r.blockType, owners: r.owners });
        add({
            id: 'boundary_block',
            title: 'Protected boundary blocked',
            truthTier: 'deterministic',
            // Require approval_required_boundary specifically — rejects profile_or_runtime_health_block
            // false positives that fire when the fixture lacks governance.json or an active session.
            status: (r.decision === 'deny' && r.blockType === 'approval_required_boundary' && r.owners.length > 0) ? 'pass' : 'fail',
            expected: `${BOUNDARY_PATH} is denied with blockType=approval_required_boundary and owners populated.`,
            observed: r.decision === 'deny' ? `Blocked ${boundaryBlockPath} (owner ${boundaryOwners.join(', ') || 'n/a'}, ${boundaryBlockType ?? 'boundary'}).` : `Decision: ${r.decision} (expected deny).`,
            critical: true,
        });
    }
    // 6) Exact-path approval. Uses the adapter-agnostic session-level approval so
    // it works for every posture (the cooperative `agent approve` event is not
    // supported by the claude-code-hooks / copilot adapters — those approve at the
    // session/operator level).
    if (canCheck) {
        commandsRun.push(`neurcode session approve --path ${BOUNDARY_PATH} --reason "guided eval exact-path approval" --session-id ${sessionId} --dir .neurcode/eval/fixture --json`);
        const r = runCli(cliEntry, ['session', 'approve', '--path', BOUNDARY_PATH, '--reason', 'guided eval exact-path approval', '--session-id', sessionId, '--dir', fixtureDir, '--json'], fixtureDir);
        const payload = parseCliJson(r.stdout);
        const approvedPath = payload?.approvedPath ?? payload?.payload?.approvedPath ?? null;
        const approvedPaths = payload?.approvedPaths ?? payload?.payload?.approvedPaths ?? (approvedPath ? [approvedPath] : []);
        exactApprovalPath = approvedPath;
        exactApprovalOnly = approvedPaths.length === 1 && approvedPath === BOUNDARY_PATH;
        // Capture identity from the grant for P2 gate assertions.
        const grant = payload?.approvalGrant ?? payload?.payload?.approvalGrant ?? null;
        demoApprovedBy = grant?.approvedBy ?? null;
        demoAssurance = grant?.assurance ?? null;
        add({
            id: 'exact_approval',
            title: 'Exact-path approval',
            truthTier: 'deterministic',
            status: payload?.ok === true && approvedPath === BOUNDARY_PATH && exactApprovalOnly ? 'pass' : 'fail',
            expected: `Approval grants exactly ${BOUNDARY_PATH} — and nothing else.`,
            observed: approvedPath ? `Approved ${approvedPath} (exact-only: ${exactApprovalOnly ? 'yes' : 'no'}, ${approvedPaths.length} path(s)).` : `Approval not applied (exit ${r.status}).`,
            critical: true,
        });
    }
    // 7) Approved path allowed after approval.
    if (canCheck) {
        const r = check(BOUNDARY_PATH, 'Edit');
        approvedPathAllowedAfter = r.decision !== 'deny';
        timeline.push({ order: 3, phase: 'post_approval_allow', path: BOUNDARY_PATH, toolName: 'Edit', decision: r.decision, blockType: r.blockType, owners: r.owners });
        add({
            id: 'approved_path_allowed',
            title: 'Approved path allowed',
            truthTier: 'deterministic',
            status: approvedPathAllowedAfter ? 'pass' : 'fail',
            expected: `${BOUNDARY_PATH} is allowed after its exact approval.`,
            observed: `Decision: ${r.decision}.`,
            critical: true,
        });
    }
    // 8) Neighbor containment.
    if (canCheck) {
        const r = check(NEIGHBOR_PATH, 'Edit');
        neighborPath = r.blockPath ?? NEIGHBOR_PATH;
        neighborContained = r.decision === 'deny';
        timeline.push({ order: 4, phase: 'neighbor_block', path: NEIGHBOR_PATH, toolName: 'Edit', decision: r.decision, blockType: r.blockType, owners: r.owners });
        add({
            id: 'neighbor_contained',
            title: 'Neighbor containment',
            truthTier: 'deterministic',
            status: neighborContained ? 'pass' : 'fail',
            expected: `${NEIGHBOR_PATH} stays blocked — the approval did not widen scope.`,
            observed: neighborContained ? `Neighbor ${neighborPath} stayed blocked.` : `Decision: ${r.decision} (expected deny).`,
            critical: true,
        });
    }
    // 9) Finish the session.
    if (canCheck) {
        commandsRun.push(`neurcode agent finish --session-id ${sessionId} --dir .neurcode/eval/fixture --json`);
        runCli(cliEntry, ['agent', 'finish', '--session-id', sessionId, '--dir', fixtureDir, '--json'], fixtureDir);
    }
    // 10) Export AI Change Record / admission record.
    if (canCheck) {
        commandsRun.push('neurcode session export-admission --dir .neurcode/eval/fixture --json');
        const r = runCli(cliEntry, ['session', 'export-admission', '--dir', fixtureDir, '--json'], fixtureDir);
        const payload = parseCliJson(r.stdout);
        aiChangeRecordRelativePath = payload?.publicRelativePath ?? null;
        if (aiChangeRecordRelativePath) {
            try {
                const admission = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(fixtureDir, aiChangeRecordRelativePath), 'utf8'));
                aiChangeRecordSessionId = admission?.sessionId ?? sessionId;
                admissionBlockedCount = admission?.runtimeContext?.counts?.blockedPaths ?? null;
                admissionApprovedCount = admission?.runtimeContext?.counts?.approvedExactPaths ?? null;
            }
            catch {
                aiChangeRecordSessionId = sessionId;
            }
        }
        add({
            id: 'ai_change_record',
            title: 'AI Change Record exported',
            truthTier: 'deterministic',
            status: aiChangeRecordRelativePath ? 'pass' : 'fail',
            expected: 'A source-free admission record / AI Change Record is exported.',
            observed: aiChangeRecordRelativePath ? `Exported ${aiChangeRecordRelativePath} (${admissionBlockedCount ?? '?'} blocked, ${admissionApprovedCount ?? '?'} approved).` : `Export failed (exit ${r.status}).`,
            critical: true,
        });
    }
    // 10b) Surface Runtime Safety Kernel evidence from the AI Change Record.
    //      Surface-only (RSK V1): export the full self-attested record and read its
    //      `runtimeSafety` block (plan posture, sensitive surfaces, blocked/approved
    //      paths, plan-drift) so the evidence output carries the post-RSK fields
    //      without adding a new plan-drift checkpoint. Source-free: paths/counts only.
    if (canCheck) {
        commandsRun.push(`neurcode session export-record ${sessionId} --dir .neurcode/eval/fixture --json`);
        const expRs = runCli(cliEntry, ['session', 'export-record', sessionId, '--dir', fixtureDir, '--json'], fixtureDir);
        const expRsPayload = parseCliJson(expRs.stdout);
        const recordRel = expRsPayload?.publicRelativePath ?? null;
        if (recordRel) {
            const recordPath = (0, node_path_1.join)(fixtureDir, recordRel);
            try {
                const envelope = JSON.parse((0, node_fs_1.readFileSync)(recordPath, 'utf8'));
                const rs = envelope?.record?.runtimeSafety;
                if (rs && typeof rs === 'object') {
                    const strArr = (v) => Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
                    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
                    runtimeSafety = {
                        present: true,
                        schemaVersion: typeof rs.schemaVersion === 'string' ? rs.schemaVersion : null,
                        policyId: typeof rs.policyId === 'string' ? rs.policyId : null,
                        planMode: typeof rs.planMode === 'string' ? rs.planMode : null,
                        sourceUploaded: false,
                        sensitiveSurfacesAttempted: strArr(rs.sensitiveSurfacesAttempted),
                        pathsBlocked: strArr(rs.pathsBlocked),
                        pathsApproved: strArr(rs.pathsApproved),
                        planDriftDetected: rs.planDriftDetected === true,
                        credentialBlocksLocal: num(rs.credentialBlocksLocal),
                        dependencyChangesGoverned: num(rs.dependencyChangesGoverned),
                        verificationGapNoted: rs.verificationGapNoted === true,
                    };
                }
            }
            catch {
                // keep EMPTY_RUNTIME_SAFETY default — surfacing is best-effort, never fatal.
            }
            finally {
                // This full self-attested record is transient scaffolding read only to
                // surface the `runtimeSafety` block — the durable "AI Change Record
                // exported" artifact is the admission record from step 10. Remove it so it
                // never persists inside the fixture's scanned tree (the full record echoes
                // product caveat text the source-free leak scan treats as fixture source).
                try {
                    (0, node_fs_1.rmSync)(recordPath, { force: true });
                }
                catch {
                    // best-effort cleanup — a leftover transient record is non-fatal.
                }
            }
        }
    }
    // Surface-only (RSK V1): no new checkpoint is added. The runtimeSafety fields are
    // threaded into facts → summary → report (and the dashboard mirror), so the
    // checkpoint count stays stable while the post-RSK evidence is visible.
    // 11) Backend receipt (optional — only when a signing key is configured).
    if (canCheck && backendReceipt.configured) {
        backendReceipt.attempted = true;
        commandsRun.push(`neurcode session export-record ${sessionId} --dir .neurcode/eval/fixture --json`);
        const exp = runCli(cliEntry, ['session', 'export-record', sessionId, '--dir', fixtureDir, '--json'], fixtureDir);
        const expPayload = parseCliJson(exp.stdout);
        const recordRel = expPayload?.publicRelativePath ?? null;
        if (recordRel) {
            commandsRun.push(`neurcode session verify-record --record .neurcode/eval/fixture/${recordRel} --json`);
            const ver = runCli(cliEntry, ['session', 'verify-record', '--record', (0, node_path_1.join)(fixtureDir, recordRel), '--json'], fixtureDir);
            const verPayload = parseCliJson(ver.stdout);
            backendReceipt.trustLevel = verPayload?.trustLevel ?? null;
            backendReceipt.verified = verPayload?.trustLevel === 'backend_signed_verified';
            backendReceipt.provenance = backendReceipt.verified ? 'verified against the configured signing key (HMAC backend receipt)' : 'signing key configured; receipt did not verify in this run';
        }
    }
    add({
        id: 'backend_receipt',
        title: 'Backend receipt verified',
        truthTier: 'backend_signed',
        status: backendReceipt.verified ? 'pass' : backendReceipt.configured ? 'advisory' : 'skipped',
        expected: 'A signed receipt verifies under the configured key (issuance + integrity, not source correctness).',
        observed: backendReceipt.verified
            ? `Verified (${backendReceipt.trustLevel}).`
            : backendReceipt.configured
                ? 'Signing key configured but no verified receipt — treated as self-attested.'
                : 'No signing key configured — evidence is a self-attested local record (honest default).',
        critical: false,
    });
    // 12) Repo-brain advisory facts (read whatever was indexed, source-free).
    if (fixtureReady) {
        try {
            const ctx = (0, guided_eval_1.gatherGuidedEvalContext)(fixtureDir, { agent, mode: 'fixture', generatedAt });
            repoBrain = ctx.facts.repoBrain;
        }
        catch {
            // keep not_evaluated default
        }
    }
    // 13) Impact intelligence over the fixture's changed set (advisory; source-free).
    // "What would this change affect and who should review it" — owners, sensitive
    // surfaces, consumers, and reviewer questions for the safe/boundary/neighbor paths.
    let impactIntelligence = null;
    if (fixtureReady) {
        try {
            impactIntelligence = (0, repo_brain_impact_1.summarizeImpact)((0, repo_brain_impact_1.buildRepoBrainImpactForRepo)(fixtureDir, [SAFE_PATH, BOUNDARY_PATH, NEIGHBOR_PATH], { autoBuild: false }));
        }
        catch {
            impactIntelligence = null;
        }
    }
    add({
        id: 'impact_intelligence',
        title: 'Impact intelligence mapped',
        truthTier: 'advisory',
        status: impactIntelligence ? 'advisory' : 'skipped',
        expected: 'A source-free map of what the change would affect and who should review it.',
        observed: impactIntelligence
            ? `Routed ${impactIntelligence.reviewRouting.owners.length} owner(s); ${impactIntelligence.counts.sensitiveSurfaces} sensitive surface(s); ${impactIntelligence.counts.directConsumers} consumer(s); ${impactIntelligence.reviewQuestions.length} reviewer question(s).`
            : 'Impact intelligence unavailable in this run (non-blocking).',
        critical: false,
    });
    // Assemble facts.
    const facts = {
        agent,
        enforcement,
        enforcementLabel: (0, guided_eval_1.enforcementLabel)(enforcement),
        enforcementMethod: enforcementMethodFor(agent, enforcement),
        mode: 'fixture',
        generatedAt,
        durationMs: Date.now() - startedAt,
        sessionId,
        repoRootHash: (0, guided_eval_1.hashRepoIdentity)(repoRoot),
        fixtureRelativeDir: fixture.relativeDir,
        adapter,
        compatibilityMode,
        cliVersion: cliVersion(),
        safeEditAllowed,
        boundaryBlockPath,
        boundaryOwners,
        boundaryBlockType,
        exactApprovalPath,
        exactApprovalOnly,
        approvedPathAllowedAfter,
        neighborPath,
        neighborContained,
        aiChangeRecordSessionId,
        aiChangeRecordRelativePath,
        admissionBlockedCount,
        admissionApprovedCount,
        backendReceipt,
        runtimeSafety,
        repoBrain,
        impactIntelligence,
        approvedBy: demoApprovedBy,
        assurance: demoAssurance,
        boundaryTimeline: timeline,
        commandsRun,
    };
    // 13) Source-free leak scan over the live observations before building artifacts.
    const report = (0, enterprise_eval_report_1.buildEnterpriseEvalReport)(facts, checkpoints);
    const summary = (0, enterprise_eval_report_1.buildEvalDemoSummary)(facts, checkpoints);
    const reportMarkdown = (0, enterprise_eval_report_1.renderEnterpriseEvalReportMarkdown)(report);
    // Cross-check guided-eval state so the dashboard mirror stays consistent.
    let guidedReportMarkdown = '';
    try {
        const ctx = (0, guided_eval_1.gatherGuidedEvalContext)(fixtureDir, { agent, mode: 'fixture', generatedAt });
        const guidedState = (0, guided_eval_1.buildGuidedEvalState)(ctx);
        const guidedReport = (0, guided_eval_1.buildGuidedEvalReport)(guidedState, ctx);
        guidedReportMarkdown = (0, guided_eval_1.renderGuidedEvalReportMarkdown)(guidedReport);
    }
    catch {
        guidedReportMarkdown = '# Guided eval report unavailable for this run\n';
    }
    let sourceFreeOk = true;
    let leakDetail = '';
    for (const [label, value] of [
        ['enterprise report json', report],
        ['enterprise report markdown', reportMarkdown],
        ['eval summary json', summary],
        ['guided report markdown', guidedReportMarkdown],
    ]) {
        try {
            (0, enterprise_eval_report_1.assertEnterpriseEvalSourceFree)(value, label);
        }
        catch (error) {
            sourceFreeOk = false;
            leakDetail = error instanceof Error ? error.message : String(error);
        }
    }
    add({
        id: 'source_free_scan',
        title: 'Source-free scan',
        truthTier: 'deterministic',
        status: sourceFreeOk ? 'pass' : 'fail',
        expected: 'No source, diffs, prompts, or secrets appear in any generated artifact.',
        observed: sourceFreeOk ? 'Clean across report, summary, and guided artifacts.' : `Leak detected: ${leakDetail}`,
        critical: true,
    });
    // Rebuild the report/summary now that the source-free checkpoint is recorded.
    const finalReport = (0, enterprise_eval_report_1.buildEnterpriseEvalReport)(facts, checkpoints);
    const finalSummary = (0, enterprise_eval_report_1.buildEvalDemoSummary)(facts, checkpoints);
    const finalReportMarkdown = (0, enterprise_eval_report_1.renderEnterpriseEvalReportMarkdown)(finalReport);
    // 14) Write artifacts under .neurcode/eval/ (gitignored).
    const evalDir = (0, node_path_1.join)(repoRoot, '.neurcode', 'eval');
    (0, node_fs_1.mkdirSync)(evalDir, { recursive: true });
    const artifacts = {
        reportMarkdownPath: (0, node_path_1.join)(evalDir, 'enterprise-eval-report.md'),
        reportJsonPath: (0, node_path_1.join)(evalDir, 'enterprise-eval-report.json'),
        summaryJsonPath: (0, node_path_1.join)(evalDir, 'eval-demo-summary.json'),
        guidedReportMarkdownPath: (0, node_path_1.join)(evalDir, 'guided-eval-report.md'),
    };
    (0, node_fs_1.writeFileSync)(artifacts.reportMarkdownPath, finalReportMarkdown, 'utf8');
    (0, node_fs_1.writeFileSync)(artifacts.reportJsonPath, JSON.stringify(finalReport, null, 2) + '\n', 'utf8');
    (0, node_fs_1.writeFileSync)(artifacts.summaryJsonPath, JSON.stringify(finalSummary, null, 2) + '\n', 'utf8');
    if (guidedReportMarkdown)
        (0, node_fs_1.writeFileSync)(artifacts.guidedReportMarkdownPath, guidedReportMarkdown, 'utf8');
    const ok = checkpoints.every((c) => !c.critical || c.status !== 'fail');
    return {
        schemaVersion: exports.EVAL_DEMO_RUN_SCHEMA_VERSION,
        ok,
        agent,
        enforcement,
        preflight,
        checkpoints,
        facts,
        report: finalReport,
        summary: finalSummary,
        artifacts,
    };
}
//# sourceMappingURL=eval-demo.js.map