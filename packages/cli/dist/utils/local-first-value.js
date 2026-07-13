"use strict";
/**
 * Local-First Aha V1 — the default `neurcode pilot start` engine.
 *
 * Runs a complete first-value proof in the user's own repository BEFORE any
 * login: detect boundaries from the existing governance profile, run a real
 * (non-activated) governed session through the same decision kernel the hooks
 * use, demonstrate block → exact-path approval → neighbor containment, and
 * write a source-free local proof artifact. Login/sync is offered only after
 * the proof exists.
 *
 * Safety properties:
 *  - never modifies user source (write attempts are decisions, not writes)
 *  - never requires cloud auth, never opens a browser
 *  - never touches the active session pointer (activate: false throughout)
 *  - never requires a healthy runtime manifest; stale identity only downgrades
 *    the reported host tier and prints the recovery command (no wedge)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCAL_FIRST_VALUE_LOGIN_PROMPT = exports.LOCAL_FIRST_VALUE_MARKDOWN_PATH = exports.LOCAL_FIRST_VALUE_JSON_PATH = void 0;
exports.pickProtectedPair = pickProtectedPair;
exports.probeHookBinary = probeHookBinary;
exports.renderLocalFirstValueMarkdown = renderLocalFirstValueMarkdown;
exports.renderLocalFirstValueText = renderLocalFirstValueText;
exports.runLocalFirstValue = runLocalFirstValue;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const promises_1 = require("node:readline/promises");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const cli_runtime_1 = require("@neurcode-ai/cli-runtime");
const contracts_1 = require("@neurcode-ai/contracts");
const v0_governance_1 = require("./v0-governance");
const runtime_authority_1 = require("./runtime-authority");
const cli_entry_1 = require("./cli-entry");
const agent_adapter_setup_1 = require("./agent-adapter-setup");
const onboard_1 = require("../commands/onboard");
const activation_telemetry_1 = require("./activation-telemetry");
exports.LOCAL_FIRST_VALUE_JSON_PATH = '.neurcode/eval/local-first-value.json';
exports.LOCAL_FIRST_VALUE_MARKDOWN_PATH = '.neurcode/eval/local-first-value.md';
exports.LOCAL_FIRST_VALUE_LOGIN_PROMPT = 'Want this in the dashboard or to share with your team? Run `neurcode login`.';
const PROOF_GOAL = 'Local first-value proof: attempt one protected write, approve one exact path, verify the neighbor stays blocked';
const SYNTHETIC_WRITE_CONTENT = '// neurcode local first-value probe — synthetic content, no user source\n';
const MAX_CANDIDATE_FILES = 20_000;
const MAX_BLOCKED_CANDIDATES = 400;
// ── Repo + file detection ─────────────────────────────────────────────────────
function isGitRepo(repoRoot) {
    try {
        return (0, node_child_process_1.execFileSync)('git', ['-C', repoRoot, 'rev-parse', '--is-inside-work-tree'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim() === 'true';
    }
    catch {
        return false;
    }
}
function listTrackedFiles(repoRoot) {
    try {
        return (0, node_child_process_1.execFileSync)('git', ['-C', repoRoot, 'ls-files'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            maxBuffer: 32 * 1024 * 1024,
        })
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, MAX_CANDIDATE_FILES);
    }
    catch {
        return [];
    }
}
const WALK_SKIP = new Set(['.git', '.neurcode', 'node_modules', 'dist', 'build', 'coverage', '.next', 'vendor']);
function walkFiles(repoRoot, dir = '', depth = 0, out = []) {
    if (depth > 6 || out.length >= 5_000)
        return out;
    let entries = [];
    try {
        entries = (0, node_fs_1.readdirSync)((0, node_path_1.join)(repoRoot, dir));
    }
    catch {
        return out;
    }
    for (const entry of entries.sort()) {
        if (out.length >= 5_000)
            break;
        if (WALK_SKIP.has(entry))
            continue;
        const rel = dir ? `${dir}/${entry}` : entry;
        try {
            const stats = (0, node_fs_1.statSync)((0, node_path_1.join)(repoRoot, rel));
            if (stats.isDirectory())
                walkFiles(repoRoot, rel, depth + 1, out);
            else if (stats.isFile())
                out.push(rel);
        }
        catch {
            // Unreadable entries are skipped; detection stays best-effort.
        }
    }
    return out;
}
function candidateFiles(repoRoot, gitDetected) {
    const files = gitDetected ? listTrackedFiles(repoRoot) : [];
    const chosen = files.length > 0 ? files : walkFiles(repoRoot);
    return chosen.filter((file) => !file.startsWith('.neurcode/') && !file.startsWith('.git/'));
}
// ── Host posture ──────────────────────────────────────────────────────────────
function normalizeAgentOption(agent, detected) {
    const value = (agent || '').trim().toLowerCase();
    if (['claude', 'cursor', 'codex', 'copilot', 'vscode'].includes(value))
        return value;
    return detected;
}
function detectHostPosture(repoRoot, agentOption) {
    const environment = (0, onboard_1.detectOnboardEnvironment)(repoRoot);
    const agent = normalizeAgentOption(agentOption, environment.target);
    let hooksInstalled = false;
    try {
        const claude = (0, v0_governance_1.inspectClaudeActivation)(repoRoot);
        hooksInstalled = claude.hooks.installed;
    }
    catch {
        hooksInstalled = false;
    }
    if (hooksInstalled) {
        let identityHealthy = null;
        let recoveryCommand = null;
        let hookEntrypoint = null;
        try {
            const manifest = (0, cli_runtime_1.readActivatedRuntimeManifest)(repoRoot);
            const wired = manifest?.integrations.find((integration) => integration.adapter === 'claude-code-hooks');
            if (wired?.absoluteEntrypoint && (0, node_fs_1.existsSync)(wired.absoluteEntrypoint)) {
                hookEntrypoint = wired.absoluteEntrypoint;
            }
            const authority = (0, runtime_authority_1.inspectRuntimeAuthority)(repoRoot, 'claude-code-hooks', true);
            identityHealthy = authority.ok;
            if (!authority.ok)
                recoveryCommand = authority.repairCommand;
        }
        catch {
            identityHealthy = false;
            recoveryCommand = 'neurcode runtime repair';
        }
        if (identityHealthy) {
            return {
                agent: agent === 'terminal' ? 'claude' : agent,
                tier: 'hard_hook',
                note: 'Claude Code hooks are wired here: a protected write is blocked before it lands.',
                identityHealthy,
                recoveryCommand: null,
                hookEntrypoint: hookEntrypoint || (0, cli_entry_1.getActiveCliEntry)(),
            };
        }
        return {
            agent: agent === 'terminal' ? 'claude' : agent,
            tier: 'hard_hook_degraded',
            note: 'Claude Code hooks are wired but the runtime identity is stale; hard blocking resumes after repair.',
            identityHealthy: false,
            recoveryCommand: recoveryCommand || 'neurcode runtime repair',
            hookEntrypoint: null,
        };
    }
    for (const target of ['cursor', 'codex']) {
        try {
            if ((0, agent_adapter_setup_1.inspectAgentSetup)({ target, repoRoot, global: target === 'codex' }).configured) {
                return {
                    agent,
                    tier: 'cooperative',
                    note: `A ${target} integration is configured: the agent is asked to check before writing, but a non-cooperating agent can skip it.`,
                    identityHealthy: null,
                    recoveryCommand: null,
                    hookEntrypoint: null,
                };
            }
        }
        catch {
            // Detection is best-effort.
        }
    }
    try {
        if ((0, agent_adapter_setup_1.inspectAgentSetup)({ target: 'vscode', repoRoot }).configured) {
            return {
                agent,
                tier: 'observe_only',
                note: 'The VS Code integration observes and records; it cannot block a write by itself.',
                identityHealthy: null,
                recoveryCommand: null,
                hookEntrypoint: null,
            };
        }
    }
    catch {
        // Detection is best-effort.
    }
    return {
        agent,
        tier: 'not_wired',
        note: 'No agent integration is wired in this repo yet, so this proof simulated the decisions with the same engine the hooks use.',
        identityHealthy: null,
        recoveryCommand: null,
        hookEntrypoint: null,
    };
}
function boundaryFor(contract, filePath, approvedPaths) {
    return (0, governance_runtime_1.checkFileBoundary)({
        filePath,
        allowedGlobs: contract.allowedGlobs,
        ownershipRules: contract.ownershipRules,
        sensitiveGlobs: contract.sensitiveGlobs,
        approvalRequiredGlobs: contract.approvalRequiredGlobs,
        approvedPaths,
        approvalGrants: [],
        scopeMode: contract.scopeMode,
        localMode: 'strict',
    });
}
function rankCandidate(file, result) {
    let score = 0;
    if (result.isSensitive)
        score += 4;
    if (result.owners.length > 0)
        score += 2;
    if (file.includes('/'))
        score += 3; // exact approval of a nested path can never basename-match a neighbor
    const base = file.split('/').pop() || file;
    if (base === 'package.json' || base.endsWith('.lock') || base === 'pnpm-lock.yaml')
        score -= 3;
    return score;
}
function pickProtectedPair(files, contract) {
    const blocked = [];
    const detection = { ...contract, allowedGlobs: [], scopeMode: 'explicit' };
    for (const file of files) {
        const result = boundaryFor(detection, file, []);
        if (result.verdict !== 'block')
            continue;
        blocked.push({ file, result, score: rankCandidate(file, result) });
        if (blocked.length >= MAX_BLOCKED_CANDIDATES)
            break;
    }
    if (blocked.length === 0)
        return null;
    blocked.sort((left, right) => right.score - left.score || left.file.length - right.file.length || left.file.localeCompare(right.file));
    for (const primary of blocked.slice(0, 25)) {
        const dir = primary.file.split('/').slice(0, -1).join('/');
        const neighbors = blocked
            .filter((candidate) => candidate.file !== primary.file)
            .sort((left, right) => {
            const leftSame = left.file.split('/').slice(0, -1).join('/') === dir ? 1 : 0;
            const rightSame = right.file.split('/').slice(0, -1).join('/') === dir ? 1 : 0;
            return rightSame - leftSame || right.score - left.score || left.file.localeCompare(right.file);
        });
        for (const neighbor of neighbors.slice(0, 12)) {
            // Self-verify with the same engine: approving exactly `primary` must
            // unblock only `primary` and keep `neighbor` blocked.
            const approvedPrimary = boundaryFor(detection, primary.file, [primary.file]);
            const containedNeighbor = boundaryFor(detection, neighbor.file, [primary.file]);
            if (approvedPrimary.verdict !== 'block' && containedNeighbor.verdict === 'block') {
                return {
                    target: primary.file,
                    neighbor: neighbor.file,
                    targetResult: primary.result,
                    neighborResult: neighbor.result,
                };
            }
        }
    }
    // No pair with provable containment; still demonstrate the block honestly.
    const primary = blocked[0];
    const approvedPrimary = boundaryFor(detection, primary.file, [primary.file]);
    if (approvedPrimary.verdict === 'block')
        return null;
    return { target: primary.file, neighbor: null, targetResult: primary.result, neighborResult: null };
}
function probeHookBinary(input) {
    try {
        const stdout = (0, node_child_process_1.execFileSync)(process.execPath, [input.entrypoint, 'session-hook', 'check', '--trusted-adapter', 'claude-code-hooks', '--trusted-timing', 'before_write'], {
            cwd: input.repoRoot,
            input: JSON.stringify({
                tool_name: 'Write',
                tool_input: { file_path: (0, node_path_1.join)(input.repoRoot, input.filePath), content: SYNTHETIC_WRITE_CONTENT },
                cwd: input.repoRoot,
                session_id: input.sessionId,
            }),
            encoding: 'utf8',
            timeout: 30_000,
            maxBuffer: 8 * 1024 * 1024,
            env: { ...process.env, NEURCODE_DISABLE_CONSEQUENCE_NUDGES: '1' },
        });
        for (const line of stdout.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('{'))
                continue;
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed.hookSpecificOutput?.permissionDecision === 'deny') {
                    return { decision: 'block', reason: parsed.hookSpecificOutput.permissionDecisionReason || null };
                }
            }
            catch {
                // Non-JSON diagnostics are expected on stdout-adjacent lines.
            }
        }
        return { decision: 'allow', reason: null };
    }
    catch {
        return null;
    }
}
// ── Interactive approval ──────────────────────────────────────────────────────
async function confirmApproval(path, interactive) {
    if (!interactive || !process.stdin.isTTY || !process.stdout.isTTY) {
        return { approved: true, approvedBy: 'pilot_start_auto' };
    }
    const rl = (0, promises_1.createInterface)({ input: process.stdin, output: process.stdout });
    try {
        const answer = (await rl.question(`Approve this exact path for the proof session — ${path}? [Y/n] `)).trim().toLowerCase();
        return { approved: answer === '' || answer === 'y' || answer === 'yes', approvedBy: 'local_operator' };
    }
    finally {
        rl.close();
    }
}
// ── Artifact + rendering ──────────────────────────────────────────────────────
function baseLimitations(host) {
    const limitations = [];
    if (host.tier === 'hard_hook') {
        limitations.push('Hard pre-write blocking is proven for hook-based agents; cooperative agents are checked only when they ask.');
    }
    else if (host.tier === 'hard_hook_degraded') {
        limitations.push('Hard hooks are wired but currently degraded; decisions here came from the same kernel as a local simulation.');
    }
    else if (host.tier === 'cooperative') {
        limitations.push('This host is cooperative: a non-cooperating agent could write without asking. Hard blocking needs the hook integration.');
    }
    else if (host.tier === 'observe_only') {
        limitations.push('This host can observe and record but cannot block a write by itself.');
    }
    else {
        limitations.push('No agent is wired yet, so no live agent write was intercepted; decisions were simulated with the production decision engine.');
    }
    limitations.push('This proof ran locally and is self-attested until synced; no source was uploaded.');
    return limitations;
}
function proofIdFor(repoHash, generatedAt) {
    return `lfv_${(0, contracts_1.localFirstValueStableHash)(`${repoHash ?? 'no-repo'}:${generatedAt}`)}`;
}
function renderLocalFirstValueMarkdown(artifact) {
    const lines = [];
    const blocked = artifact.decisions.find((decision) => decision.step === 'protected_write_blocked');
    const allowed = artifact.decisions.find((decision) => decision.step === 'approved_write_allowed');
    const neighbor = artifact.decisions.find((decision) => decision.step === 'neighbor_write_blocked');
    lines.push('# Neurcode local first-value proof');
    lines.push('');
    lines.push(`Generated ${artifact.generatedAt} · proof \`${artifact.proofId}\` · schema \`${artifact.schemaVersion}\``);
    lines.push('');
    lines.push('## What happened');
    lines.push('');
    if (blocked) {
        lines.push(`1. **An agent-style write to a protected file was blocked before it landed.** Path: \`${blocked.path}\` (${blocked.reasonCodes.join(', ')}).`);
    }
    else {
        lines.push('1. **No protected write was demonstrated.** See limitations below.');
    }
    if (artifact.approvedExactPath) {
        lines.push(`2. **A human approved exactly one path.** Only \`${artifact.approvedExactPath}\` was approved, for this session only.`);
        lines.push(`3. **The approved write became allowed.** ${allowed ? `Verdict: ${allowed.verdict}.` : 'Not re-checked.'}`);
    }
    else {
        lines.push('2. **No path was approved.**');
    }
    if (neighbor) {
        lines.push(`4. **The file next door stayed blocked.** \`${neighbor.path}\` was still denied after the approval (${neighbor.reasonCodes.join(', ')}).`);
    }
    else if (artifact.neighborContainment === 'not_evaluated') {
        lines.push('4. **Neighbor containment was not evaluated** — no second protected file with provable containment was found.');
    }
    lines.push('');
    lines.push('## What Neurcode detected in this repo');
    lines.push('');
    lines.push(`- Files scanned: ${artifact.detection.trackedFileCount ?? 'unknown'}`);
    lines.push(`- Sensitive boundaries: ${artifact.detection.sensitiveBoundaryCount}`);
    lines.push(`- Approval-required rules: ${artifact.detection.approvalRequiredGlobCount}`);
    lines.push(`- CODEOWNERS detected: ${artifact.detection.codeownersDetected ? 'yes' : 'no'}`);
    lines.push('');
    lines.push('## Host enforcement');
    lines.push('');
    lines.push(`- Tier: \`${artifact.host.enforcementTier}\` (agent: ${artifact.host.agent})`);
    lines.push(`- ${artifact.host.enforcementNote}`);
    if (artifact.host.recoveryCommand) {
        lines.push(`- Recovery: \`${artifact.host.recoveryCommand}\``);
    }
    lines.push('');
    lines.push('## What stayed local');
    lines.push('');
    lines.push('- Source code, prompts, diffs, and absolute paths never left this machine.');
    lines.push('- This file records repo-relative paths, verdicts, reason codes, counts, and hashes only.');
    lines.push('');
    lines.push('## Evidence');
    lines.push('');
    lines.push(`- Session: \`${artifact.sessionId ?? 'none'}\` · replay hash: \`${artifact.replayHash ?? 'none'}\``);
    lines.push(`- Decisions: ${artifact.decisions.length} · blocked: ${artifact.blockedPathCount} · containment: ${artifact.neighborContainment}`);
    lines.push(`- Content hash: \`${artifact.contentHash}\``);
    lines.push('');
    lines.push('## Limitations');
    lines.push('');
    for (const limitation of artifact.limitations)
        lines.push(`- ${limitation}`);
    lines.push('');
    lines.push(`Next: ${artifact.nextActions.local}`);
    lines.push('');
    lines.push(exports.LOCAL_FIRST_VALUE_LOGIN_PROMPT);
    lines.push('');
    return lines.join('\n');
}
function renderLocalFirstValueText(result) {
    const { artifact } = result;
    const lines = [];
    const blocked = artifact.decisions.find((decision) => decision.step === 'protected_write_blocked');
    const allowed = artifact.decisions.find((decision) => decision.step === 'approved_write_allowed');
    const neighbor = artifact.decisions.find((decision) => decision.step === 'neighbor_write_blocked');
    lines.push('');
    lines.push('Neurcode — first value, before any login');
    lines.push('');
    lines.push(`Repo: ${artifact.repo.label ?? 'unknown'} · git: ${artifact.repo.gitDetected ? 'yes' : 'no'} · files scanned: ${artifact.detection.trackedFileCount ?? 'unknown'}`);
    lines.push(`Protected boundaries: ${artifact.detection.sensitiveBoundaryCount} sensitive · ${artifact.detection.approvalRequiredGlobCount} approval-required · CODEOWNERS: ${artifact.detection.codeownersDetected ? 'yes' : 'no'}`);
    lines.push('');
    if (blocked) {
        lines.push('1. Neurcode blocked a protected write before it landed');
        lines.push(`   ✗ ${blocked.path}${blocked.reasonCodes.includes('codeowners_owned') ? ' (CODEOWNERS-owned)' : ''}`);
        if (artifact.approvalCommand) {
            lines.push(`   Approve only this path with: ${artifact.approvalCommand}`);
        }
        if (artifact.approvedExactPath) {
            lines.push('2. One exact path was approved — nothing broader');
            lines.push(`   ✓ ${artifact.approvedExactPath} (this session only)`);
            lines.push('3. The approved write is now allowed');
            lines.push(`   ✓ ${allowed ? `${allowed.path} (${allowed.verdict})` : 'not re-checked'}`);
        }
        else {
            lines.push('2. No path was approved (declined)');
        }
        if (neighbor) {
            lines.push('4. The neighbor stayed blocked');
            lines.push(`   ✗ ${neighbor.path}`);
        }
        else if (artifact.neighborContainment === 'not_evaluated') {
            lines.push('4. Neighbor containment: not evaluated (no provable second protected file found)');
        }
    }
    else {
        lines.push('No protected write could be demonstrated in this repo yet.');
        for (const limitation of artifact.limitations.slice(0, 1))
            lines.push(`   ${limitation}`);
    }
    lines.push('');
    lines.push(`Host enforcement: ${artifact.host.enforcementTier} — ${artifact.host.enforcementNote}`);
    if (artifact.host.recoveryCommand)
        lines.push(`Recover hard enforcement with: ${artifact.host.recoveryCommand}`);
    lines.push('No source left your machine. Proof written to:');
    lines.push(`  ${result.artifactFiles.json}`);
    lines.push(`  ${result.artifactFiles.markdown}`);
    if (artifact.replayHash)
        lines.push(`Replay hash: ${artifact.replayHash}`);
    lines.push('');
    lines.push(`Next: ${artifact.nextActions.local}`);
    lines.push(exports.LOCAL_FIRST_VALUE_LOGIN_PROMPT);
    lines.push('');
    return lines.join('\n');
}
// ── Main flow ─────────────────────────────────────────────────────────────────
function decisionReasonCodes(result, extra = []) {
    const codes = new Set(extra);
    if (result.blockType)
        codes.add(result.blockType);
    else if (result.isApprovalRequired)
        codes.add('approval_required_boundary');
    if (result.isSensitive)
        codes.add('sensitive_boundary');
    if (result.owners.length > 0)
        codes.add('codeowners_owned');
    if (codes.size === 0)
        codes.add(result.verdict === 'block' ? 'blocked' : 'allowed');
    return [...codes];
}
function writeArtifacts(repoRoot, artifact) {
    const evalDir = (0, node_path_1.join)(repoRoot, '.neurcode', 'eval');
    (0, node_fs_1.mkdirSync)(evalDir, { recursive: true });
    const markdown = renderLocalFirstValueMarkdown(artifact);
    const markdownScan = (0, contracts_1.validateLocalFirstValueSourceFree)({ markdown });
    if (!markdownScan.ok) {
        throw new Error(`local first-value markdown failed the source-free scan: ${markdownScan.errors.join('; ')}`);
    }
    const jsonPath = (0, node_path_1.join)(repoRoot, exports.LOCAL_FIRST_VALUE_JSON_PATH);
    const markdownPath = (0, node_path_1.join)(repoRoot, exports.LOCAL_FIRST_VALUE_MARKDOWN_PATH);
    (0, node_fs_1.writeFileSync)(jsonPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');
    (0, node_fs_1.writeFileSync)(markdownPath, markdown, 'utf8');
    return { json: (0, node_path_1.relative)(repoRoot, jsonPath), markdown: (0, node_path_1.relative)(repoRoot, markdownPath) };
}
function finalizeArtifact(unsigned) {
    const artifact = {
        ...unsigned,
        contentHash: (0, contracts_1.localFirstValueContentHash)(unsigned),
    };
    return (0, contracts_1.assertLocalFirstValueArtifact)(artifact);
}
async function runLocalFirstValue(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const generatedAt = new Date().toISOString();
    const gitDetected = isGitRepo(repoRoot);
    const repoLabel = repoRoot.split('/').filter(Boolean).pop() ?? null;
    const repoHash = (0, contracts_1.localFirstValueStableHash)(repoRoot);
    const interactive = options.nonInteractive !== true && options.assumeYes !== true;
    (0, activation_telemetry_1.trackActivationEvent)({
        eventType: 'onboarding_step_completed',
        commandFamily: 'pilot_start',
        reasonCode: 'local_first_value.started',
        flush: false,
    });
    const host = detectHostPosture(repoRoot, options.agent);
    const emptyDetection = {
        trackedFileCount: null,
        sensitiveBoundaryCount: 0,
        approvalRequiredGlobCount: 0,
        ownershipRuleCount: 0,
        codeownersDetected: false,
    };
    const degraded = (outcome, detection, limitations, localNext) => {
        const artifact = finalizeArtifact({
            schemaVersion: contracts_1.LOCAL_FIRST_VALUE_SCHEMA_VERSION,
            proofId: proofIdFor(repoHash, generatedAt),
            generatedAt,
            repo: { label: repoLabel, hash: repoHash, gitDetected },
            detection,
            host: {
                agent: host.agent,
                enforcementTier: host.tier,
                enforcementNote: host.note,
                identityHealthy: host.identityHealthy,
                recoveryCommand: host.recoveryCommand,
            },
            sessionId: null,
            replayHash: null,
            decisions: [],
            blockedPathCount: 0,
            approvedExactPath: null,
            neighborPath: null,
            neighborContainment: 'not_evaluated',
            approvalCommand: null,
            nextActions: { local: localNext, login: 'neurcode login' },
            limitations: [...limitations, ...baseLimitations(host)],
            privacy: {
                sourceUploaded: false,
                promptsUploaded: false,
                diffsUploaded: false,
                absolutePathsStored: false,
                sourceFree: true,
            },
        });
        const artifactFiles = writeArtifacts(repoRoot, artifact);
        return {
            ok: false,
            outcome,
            artifact,
            artifactFiles,
            text: renderLocalFirstValueText({ artifact, outcome, artifactFiles }),
        };
    };
    // 1. Detect boundaries from the existing governance profile machinery.
    let profile;
    try {
        profile = (0, v0_governance_1.ensureFreshGovernanceProfile)(repoRoot).profile;
    }
    catch {
        return degraded('setup_required', emptyDetection, [
            gitDetected
                ? 'The repository governance profile could not be built, so boundaries were not detected.'
                : 'This directory is not a git repository, so repository boundaries were not detected.',
        ], gitDetected ? 'neurcode doctor' : 'git init && neurcode pilot start (or try the sandbox: neurcode pilot start --fixture)');
    }
    const detection = {
        trackedFileCount: profile.topology.trackedFileCount ?? null,
        sensitiveBoundaryCount: profile.sensitiveBoundaries.length,
        approvalRequiredGlobCount: profile.approvalRequiredPaths.length,
        ownershipRuleCount: profile.ownershipBoundaries.length,
        codeownersDetected: profile.ownershipBoundaries.length > 0 || Boolean(profile.topology.codeownersHash),
    };
    // 2. Pick a protected pair, self-verified with the production decision engine.
    const files = candidateFiles(repoRoot, gitDetected);
    const pair = pickProtectedPair(files, {
        allowedGlobs: [],
        ownershipRules: profile.ownershipBoundaries,
        sensitiveGlobs: profile.sensitiveBoundaries.map((boundary) => boundary.glob),
        approvalRequiredGlobs: profile.approvalRequiredPaths,
        scopeMode: 'explicit',
    });
    if (!pair) {
        return degraded('setup_required', detection, ['No approval-required boundary matched a repository file, so a real protected write could not be demonstrated.'], 'neurcode pilot start --fixture (safe sandbox demo) — or add approvalRequiredGlobs to .neurcode/governance.json');
    }
    // 3. Run the proof as a real (non-activated) governed session.
    const session = (0, governance_runtime_1.createSession)(repoRoot, profile, PROOF_GOAL, { activate: false });
    const sessionId = session.sessionId;
    const decisions = [];
    const limitations = [];
    const useHookBinary = host.tier === 'hard_hook' && host.hookEntrypoint !== null;
    let hookProbeDegraded = false;
    const decide = (filePath) => {
        const contract = ((0, governance_runtime_1.loadSession)(repoRoot, sessionId) ?? session).contract;
        const kernel = (0, governance_runtime_1.checkFileBoundary)({
            filePath,
            allowedGlobs: [],
            ownershipRules: contract.ownershipRules,
            sensitiveGlobs: contract.sensitiveGlobs,
            approvalRequiredGlobs: contract.approvalRequiredGlobs,
            approvedPaths: contract.approvedPaths,
            approvalGrants: contract.approvalGrants ?? [],
            sessionId,
            profileHash: ((0, governance_runtime_1.loadSession)(repoRoot, sessionId) ?? session).profileHash,
            planRevision: contract.agentPlanRevision ?? (contract.agentPlan ? 1 : null),
            brainGeneration: contract.brainGeneration?.generation ?? null,
            scopeMode: 'explicit',
            localMode: 'strict',
        });
        if (useHookBinary && !hookProbeDegraded && host.hookEntrypoint) {
            const probe = probeHookBinary({ repoRoot, entrypoint: host.hookEntrypoint, sessionId, filePath });
            if (probe && ((probe.decision === 'block') === (kernel.verdict === 'block'))) {
                return { verdict: kernel, source: 'host_hook_binary', hookReason: probe.reason };
            }
            hookProbeDegraded = true;
            limitations.push('The installed hook binary probe did not complete, so decisions were recorded from the decision kernel directly.');
        }
        return { verdict: kernel, source: 'kernel_library', hookReason: null };
    };
    const recordKernelEvent = (filePath, result, source, step) => {
        if (source === 'host_hook_binary')
            return; // the hook binary already recorded real events
        try {
            (0, governance_runtime_1.appendEvent)(repoRoot, sessionId, {
                type: result.verdict === 'block' ? 'check_block' : result.verdict === 'warn' ? 'check_warn' : 'check_ok',
                ts: new Date().toISOString(),
                filePath,
                verdict: result.verdict,
                message: result.message,
                detail: {
                    localFirstValueStep: step,
                    ...(result.approvalContext ? { approvalContext: result.approvalContext } : {}),
                },
            });
        }
        catch {
            // Evidence recording is best-effort; the decision itself already happened.
        }
    };
    // Step 1 — the protected write is blocked before it lands.
    const blockDecision = decide(pair.target);
    const approvalCommand = `neurcode session approve --path ${pair.target} --session-id ${sessionId}`;
    recordKernelEvent(pair.target, blockDecision.verdict, blockDecision.source, 'protected_write_blocked');
    decisions.push({
        step: 'protected_write_blocked',
        path: pair.target,
        verdict: blockDecision.verdict.verdict,
        reasonCodes: decisionReasonCodes(blockDecision.verdict),
        decisionSource: blockDecision.source,
    });
    (0, activation_telemetry_1.trackActivationEvent)({
        eventType: 'first_block_observed',
        commandFamily: 'pilot_start',
        reasonCode: 'local_first_value.block_demonstrated',
        flush: false,
    });
    // Step 2 — the human approves exactly one path.
    const approval = await confirmApproval(pair.target, interactive);
    let approvedExactPath = null;
    let neighborContainment = 'not_evaluated';
    const neighborPath = pair.neighbor;
    let approvedWriteAllowed = false;
    if (approval.approved) {
        // sessionId must travel inside the options object: approveSession ignores
        // its positional sessionId parameter when options are passed as an object,
        // and would otherwise grant against the repo's active session.
        (0, governance_runtime_1.approveSession)(repoRoot, pair.target, {
            reason: 'local first-value proof exact-path approval',
            approvedBy: approval.approvedBy,
            sessionId,
        });
        approvedExactPath = pair.target;
        decisions.push({
            step: 'exact_path_approved',
            path: pair.target,
            verdict: 'approved',
            reasonCodes: ['exact_path_approval_granted'],
            decisionSource: 'kernel_library',
        });
        (0, activation_telemetry_1.trackActivationEvent)({
            eventType: 'first_approval_observed',
            commandFamily: 'pilot_start',
            reasonCode: 'local_first_value.exact_approval',
            flush: false,
        });
        // Step 3 — the approved write is allowed now.
        const allowedDecision = decide(pair.target);
        approvedWriteAllowed = allowedDecision.verdict.verdict !== 'block';
        recordKernelEvent(pair.target, allowedDecision.verdict, allowedDecision.source, 'approved_write_allowed');
        decisions.push({
            step: 'approved_write_allowed',
            path: pair.target,
            verdict: allowedDecision.verdict.verdict,
            reasonCodes: approvedWriteAllowed
                ? decisionReasonCodes(allowedDecision.verdict, ['approved_exact_path'])
                : decisionReasonCodes(allowedDecision.verdict),
            decisionSource: allowedDecision.source,
        });
        if (!approvedWriteAllowed) {
            limitations.push('The approved path was still blocked on re-check; treat this proof as degraded and report it.');
        }
        // Step 4 — the neighbor stays blocked.
        if (pair.neighbor) {
            const neighborDecision = decide(pair.neighbor);
            recordKernelEvent(pair.neighbor, neighborDecision.verdict, neighborDecision.source, 'neighbor_write_blocked');
            const contained = neighborDecision.verdict.verdict === 'block';
            decisions.push({
                step: 'neighbor_write_blocked',
                path: pair.neighbor,
                verdict: neighborDecision.verdict.verdict,
                reasonCodes: contained
                    ? decisionReasonCodes(neighborDecision.verdict, ['neighbor_not_approved'])
                    : decisionReasonCodes(neighborDecision.verdict),
                decisionSource: neighborDecision.source,
            });
            neighborContainment = contained ? 'contained' : 'not_contained';
            if (!contained) {
                limitations.push('Neighbor containment did not hold for the selected pair; treat this proof as degraded and report it.');
            }
        }
        else {
            limitations.push('Only one provable protected file was found, so neighbor containment was not evaluated.');
        }
    }
    else {
        limitations.push('The operator declined the exact-path approval, so the approval and containment steps were not demonstrated.');
    }
    // Finish the proof session so the evidence carries a replay hash.
    let replayHash = null;
    try {
        const finished = (0, governance_runtime_1.finishSession)(repoRoot, sessionId, {
            reason: 'local first-value proof finished',
            completionStatus: approval.approved ? 'completed' : 'attention_required',
        });
        replayHash = finished?.replayHash ?? null;
    }
    catch {
        limitations.push('The proof session could not be finalized; decisions above are still recorded in the session log.');
    }
    const nextLocal = host.tier === 'hard_hook'
        ? `Ask your agent to edit ${pair.target} — the write is blocked before it lands.`
        : host.tier === 'hard_hook_degraded'
            ? `${host.recoveryCommand ?? 'neurcode runtime repair'}  # restore hard enforcement, then re-run neurcode pilot start`
            : (0, onboard_1.agentSetupCommandFor)((['claude', 'cursor', 'codex', 'copilot', 'vscode'].includes(host.agent) ? host.agent : 'terminal'));
    const contained = neighborContainment === 'contained';
    const blockDemonstrated = decisions.some((decision) => decision.step === 'protected_write_blocked' && decision.verdict === 'block');
    const outcome = blockDemonstrated && approval.approved && approvedWriteAllowed && contained
        ? 'proof_complete'
        : 'proof_degraded';
    const artifact = finalizeArtifact({
        schemaVersion: contracts_1.LOCAL_FIRST_VALUE_SCHEMA_VERSION,
        proofId: proofIdFor(repoHash, generatedAt),
        generatedAt,
        repo: { label: repoLabel, hash: repoHash, gitDetected },
        detection,
        host: {
            agent: host.agent,
            enforcementTier: host.tier,
            enforcementNote: host.note,
            identityHealthy: host.identityHealthy,
            recoveryCommand: host.recoveryCommand,
        },
        sessionId,
        replayHash,
        decisions,
        blockedPathCount: decisions.filter((decision) => decision.verdict === 'block').length,
        approvedExactPath,
        neighborPath,
        neighborContainment,
        approvalCommand,
        nextActions: { local: nextLocal, login: 'neurcode login' },
        limitations: [...limitations, ...baseLimitations(host)],
        privacy: {
            sourceUploaded: false,
            promptsUploaded: false,
            diffsUploaded: false,
            absolutePathsStored: false,
            sourceFree: true,
        },
    });
    const artifactFiles = writeArtifacts(repoRoot, artifact);
    (0, activation_telemetry_1.trackActivationEvent)({
        eventType: 'onboarding_step_completed',
        commandFamily: 'pilot_start',
        reasonCode: outcome === 'proof_complete' ? 'local_first_value.completed' : 'local_first_value.degraded',
        flush: true,
    });
    return {
        ok: outcome === 'proof_complete',
        outcome,
        artifact,
        artifactFiles,
        text: renderLocalFirstValueText({ artifact, outcome, artifactFiles }),
    };
}
//# sourceMappingURL=local-first-value.js.map