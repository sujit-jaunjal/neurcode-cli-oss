"use strict";
/**
 * Self-Serve Pilot OS CLI commands — funnel status and milestone recording.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPilotCommands = registerPilotCommands;
const chalk_1 = __importDefault(require("chalk"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const v0_governance_1 = require("../utils/v0-governance");
const brain_lifecycle_1 = require("../utils/brain-lifecycle");
const contracts_1 = require("@neurcode-ai/contracts");
const pilot_setup_contract_1 = require("../utils/pilot-setup-contract");
const agent_adapter_setup_1 = require("../utils/agent-adapter-setup");
const runtime_connection_1 = require("../utils/runtime-connection");
const eval_demo_command_1 = require("../utils/eval-demo-command");
const activation_telemetry_1 = require("../utils/activation-telemetry");
const local_first_value_1 = require("../utils/local-first-value");
const first_value_proof_1 = require("../utils/first-value-proof");
const pilot_evidence_io_1 = require("../utils/pilot-evidence-io");
const pilot_evidence_pack_1 = require("../utils/pilot-evidence-pack");
function emitJson(value) {
    console.log(JSON.stringify(value, null, 2));
}
function registerPilotCommands(program) {
    const pilot = program.command('pilot').description('Self-Serve Pilot Operating System utilities');
    // ── start (headline front door) ──────────────────────────────────────────────
    // Local-First Aha V1: the canonical first command. It runs a complete local
    // first-value proof in the user's own repository BEFORE any login — detect
    // boundaries, block a protected write, approve one exact path, show the
    // neighbor stays blocked, and write a source-free proof artifact. Login and
    // dashboard sync are offered only after the proof exists. The fixture
    // sandbox stays available behind `--fixture` (same engine as `eval demo`).
    pilot
        .command('start')
        .description('Run a local, login-free first-value proof in this repo (block → exact approval → neighbor containment)')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--agent <id>', 'Agent posture: claude | codex | cursor | vscode | copilot')
        .option('--fixture', 'Run the safe throwaway fixture demo instead of the real-repo proof')
        .option('--preflight', 'Only run the buyer-friendly fixture preflight checks, then stop')
        .option('--yes', 'Approve the demonstrated exact path without prompting')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        if (options.fixture || options.preflight) {
            (0, eval_demo_command_1.runEvalDemoCommandAction)(options);
            return;
        }
        try {
            const result = await (0, local_first_value_1.runLocalFirstValue)({
                dir: options.dir,
                agent: options.agent,
                assumeYes: options.yes === true,
                nonInteractive: options.json === true,
            });
            if (options.json) {
                emitJson({
                    schemaVersion: result.artifact.schemaVersion,
                    ok: result.ok,
                    outcome: result.outcome,
                    artifact: result.artifact,
                    artifactFiles: result.artifactFiles,
                });
            }
            else {
                console.log(result.text);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (options.json)
                emitJson({ ok: false, error: message });
            else {
                console.error(`Local first-value proof failed: ${message}`);
                console.error('Try the safe sandbox instead: neurcode pilot start --fixture');
            }
            process.exitCode = 1;
        }
    });
    pilot
        .command('first-value')
        .description('Alias for the guided source-free first-value proof workflow')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--agent <id>', 'Agent posture: claude | codex | cursor | vscode | copilot', 'codex')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        (0, activation_telemetry_1.trackActivationEvent)({
            eventType: 'onboarding_step_completed',
            commandFamily: 'pilot_first_value',
            reasonCode: 'first_value.started',
            flush: false,
        });
        const state = await (0, first_value_proof_1.buildFirstValueCliState)({ dir: options.dir, agent: options.agent });
        if (options.json)
            emitJson(state);
        else
            console.log((0, first_value_proof_1.renderFirstValueStart)(state));
    });
    pilot
        .command('report')
        .description('Generate source-free pilot reports')
        .option('--first-value', 'Summarize first-value proof progress')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--agent <id>', 'Agent posture: claude | codex | cursor | vscode | copilot', 'codex')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        if (!options.firstValue) {
            console.log('Only `neurcode pilot report --first-value` is supported in this pilot report command.');
            process.exitCode = 0;
            return;
        }
        const state = await (0, first_value_proof_1.buildFirstValueCliState)({ dir: options.dir, agent: options.agent });
        if (options.json)
            emitJson(state);
        else
            console.log((0, first_value_proof_1.renderFirstValueReport)(state));
    });
    pilot
        .command('funnel-status')
        .description('Print source-free pilot funnel status for the current repository')
        .option('--json', 'Emit machine-readable JSON')
        .option('--dir <path>', 'Repository root')
        .action(async (options) => {
        const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
        const brain = await (0, brain_lifecycle_1.inspectBrainLifecycle)(repoRoot);
        const brainState = (0, contracts_1.mapBrainLifecycleToPilotState)({
            lifecycleState: brain.state,
            progressPhase: brain.progress.phase,
        });
        const connection = (0, runtime_connection_1.loadRuntimeConnection)(repoRoot);
        const completed = [
            connection ? 'repository_connected' : null,
            connection?.keyPrefix ? 'cli_authenticated' : null,
            brainState === 'ready' ? 'brain_ready' : brainState === 'partial' ? 'brain_partial' : null,
            brainState === 'failed' ? 'brain_failed' : null,
        ].filter(Boolean);
        const payload = {
            schemaVersion: contracts_1.PILOT_FUNNEL_SCHEMA_VERSION,
            repoRoot,
            brain: {
                state: brainState,
                milestone: (0, contracts_1.brainStateToMilestone)(brainState),
                filesIndexed: brain.progress.filesIndexed,
                filesScanned: brain.progress.filesScanned,
                percent: brain.progress.percent,
                elapsedMs: brain.elapsedMs,
                reasonCodes: brain.reasonCodes,
                recoveryCommands: brain.recoveryCommands,
            },
            pairing: connection
                ? { status: 'connected', repoName: connection.repo.name }
                : { status: 'local_only' },
            inferredMilestones: completed,
            generatedAt: new Date().toISOString(),
        };
        if (options.json) {
            emitJson(payload);
            return;
        }
        console.log(chalk_1.default.bold('Self-Serve Pilot funnel status'));
        console.log(`Brain:   ${brainState} (${brain.progress.filesIndexed}/${brain.progress.filesScanned ?? '?'} files)`);
        console.log(`Pairing: ${connection ? `connected (${connection.repo.name})` : 'local-only'}`);
        if (brain.reasonCodes.length)
            console.log(`Reasons: ${brain.reasonCodes.join(', ')}`);
        console.log(`Recovery: ${brain.recoveryCommands.recover}`);
    });
    pilot
        .command('setup-contract')
        .description('Print the shared typed setup contract (CLI/dashboard)')
        .argument('[agent]', 'Agent target (claude, cursor, codex, …)')
        .option('--json', 'Emit machine-readable JSON', true)
        .option('--dir <path>', 'Repository root')
        .action((agent, options) => {
        const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
        const target = (0, agent_adapter_setup_1.normalizeAgentSetupTarget)(agent);
        const contract = (0, pilot_setup_contract_1.buildPilotSetupContract)({ repoRoot, agent: target });
        if (options.json !== false)
            emitJson(contract);
        else {
            console.log(chalk_1.default.bold(`Pilot setup contract — ${target}`));
            for (const step of contract.steps) {
                console.log(`- ${step.label}: ${step.command}`);
            }
            console.log(`Recovery: ${contract.recoveryCommand}`);
        }
    });
    // ── export (Iteration 10 — Pilot Evidence Pack) ──────────────────────────────
    // After a pilot, generate a source-free executive packet (summary + sessions +
    // blocked risk families + approvals + plan drift + dependency changes +
    // evidence hashes + what-stayed-local + limitations) that can be shared with
    // an engineering manager, principal engineer, security reviewer, or
    // procurement/IT without a live founder walkthrough. Repo-local only.
    pilot
        .command('export')
        .description('Generate a source-free executive pilot evidence pack (JSON manifest + markdown/HTML)')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--out <dir>', 'Output directory (default: .neurcode/pilot-evidence)')
        .option('--format <format>', 'Human-readable format: markdown | html | both', 'both')
        .option('--days <n>', 'Metrics window in days (default: 7)')
        .option('--json', 'Print the pack JSON to stdout instead of writing files')
        .action(async (options) => {
        const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
        // Optional, best-effort, read-only repository brain readiness.
        let brainReadiness = null;
        try {
            const brain = await (0, brain_lifecycle_1.inspectBrainLifecycle)(repoRoot);
            brainReadiness = {
                state: brain.state ?? null,
                filesIndexed: brain.progress?.filesIndexed ?? null,
                filesScanned: brain.progress?.filesScanned ?? null,
                percent: brain.progress?.percent ?? null,
            };
        }
        catch {
            brainReadiness = null;
        }
        const parsedDays = Number.parseInt(options.days ?? '', 10);
        const days = Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 7;
        const inputs = (0, pilot_evidence_io_1.gatherPilotEvidenceInputs)(repoRoot, {
            generatedAt: new Date().toISOString(),
            days,
            brainReadiness,
        });
        const pack = (0, pilot_evidence_pack_1.buildPilotEvidencePack)(inputs);
        const markdown = (0, pilot_evidence_pack_1.renderPilotEvidencePackMarkdown)(pack);
        const html = (0, pilot_evidence_pack_1.renderPilotEvidencePackHtml)(pack);
        // Source-free backstop before anything is written or printed.
        (0, pilot_evidence_pack_1.assertPilotEvidencePackSourceFree)(pack, 'pilot evidence pack (json)');
        (0, pilot_evidence_pack_1.assertPilotEvidencePackSourceFree)(markdown, 'pilot evidence pack (markdown)');
        (0, pilot_evidence_pack_1.assertPilotEvidencePackSourceFree)(html, 'pilot evidence pack (html)');
        if (options.json) {
            emitJson(pack);
            return;
        }
        const outDir = options.out ? (0, node_path_1.resolve)(repoRoot, options.out) : (0, node_path_1.join)(repoRoot, '.neurcode', 'pilot-evidence');
        if (!(0, node_fs_1.existsSync)(outDir))
            (0, node_fs_1.mkdirSync)(outDir, { recursive: true });
        const jsonPath = (0, node_path_1.join)(outDir, 'pilot-evidence-pack.json');
        (0, node_fs_1.writeFileSync)(jsonPath, JSON.stringify(pack, null, 2) + '\n', 'utf8');
        const written = [jsonPath];
        const fmt = (options.format || 'both').toLowerCase();
        if (fmt === 'markdown' || fmt === 'md' || fmt === 'both') {
            const mdPath = (0, node_path_1.join)(outDir, 'pilot-evidence-pack.md');
            (0, node_fs_1.writeFileSync)(mdPath, markdown, 'utf8');
            written.push(mdPath);
        }
        if (fmt === 'html' || fmt === 'both') {
            const htmlPath = (0, node_path_1.join)(outDir, 'pilot-evidence-pack.html');
            (0, node_fs_1.writeFileSync)(htmlPath, html, 'utf8');
            written.push(htmlPath);
        }
        console.log('');
        console.log(chalk_1.default.green(`Pilot evidence pack written (source-free · ${pack.completeness.status}).`));
        for (const p of written)
            console.log(`  ${chalk_1.default.cyan(p)}`);
        console.log(chalk_1.default.dim(`  ${pack.summary.headline}`));
        console.log(chalk_1.default.dim(`  Content hash: ${pack.contentHash}`));
        if (pack.completeness.status !== 'complete') {
            console.log(chalk_1.default.yellow(`  Incomplete pilot: missing ${pack.completeness.missingArtifacts.join('; ') || 'n/a'}`));
        }
        console.log(chalk_1.default.dim('  Contains paths, owners, counts, verdicts, and hashes only — no source, diffs, or prompts.'));
        console.log('');
    });
}
//# sourceMappingURL=pilot.js.map