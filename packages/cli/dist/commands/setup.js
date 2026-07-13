"use strict";
/**
 * Canonical first-run/resume surface.
 *
 * `neurcode setup` owns only the deterministic activation sequence. Existing
 * commands remain available as compatibility/advanced surfaces, but users no
 * longer need to guess whether login, init, onboard, or activate comes first.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSetupPlan = buildSetupPlan;
exports.resolveSetupRepositoryContext = resolveSetupRepositoryContext;
exports.normalizeProfileAgent = normalizeProfileAgent;
exports.validateSetupAuthentication = validateSetupAuthentication;
exports.collectSetupPlan = collectSetupPlan;
exports.setupCommand = setupCommand;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const promises_1 = require("readline/promises");
const brain_1 = require("@neurcode-ai/brain");
const cli_runtime_1 = require("@neurcode-ai/cli-runtime");
const contracts_1 = require("@neurcode-ai/contracts");
const config_1 = require("../config");
const state_1 = require("../utils/state");
const project_root_1 = require("../utils/project-root");
const activation_telemetry_1 = require("../utils/activation-telemetry");
const init_1 = require("./init");
const login_1 = require("./login");
const activation_proof_1 = require("../utils/activation-proof");
const agent_adapter_setup_1 = require("../utils/agent-adapter-setup");
const runtime_connection_1 = require("../utils/runtime-connection");
const onboard_1 = require("./onboard");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        bold: (value) => value,
        dim: (value) => value,
        green: (value) => value,
        yellow: (value) => value,
        cyan: (value) => value,
        red: (value) => value,
    };
}
const AGENT_ADAPTERS = {
    claude: new Set(['claude-code-hooks']),
    cursor: new Set(['cursor-mcp']),
    codex: new Set(['codex-hooks']),
    copilot: new Set(['copilot-hooks']),
    vscode: new Set(['copilot-hooks', 'vscode-extension']),
    action: new Set(['github-action']),
};
function enforcementPostureFor(agent) {
    if (!agent) {
        return 'No coding environment has been selected; no enforcement capability is assumed.';
    }
    switch (agent) {
        case 'claude':
            return 'Hard pre-write denial only when Claude hooks are installed and healthy.';
        case 'copilot':
        case 'vscode':
            return 'Hook-backed enforcement only where the host integration is installed and healthy.';
        case 'action':
            return 'Post-change CI advisory/admission evidence; not live host-level pre-write enforcement.';
        case 'cursor':
            return 'Cooperative runtime checks and supervisor evidence; no host-level hard pre-write denial is claimed.';
        case 'codex':
            return 'Automatic pre-write denial for trusted, intercepted apply_patch, simple Bash, and MCP calls; Codex documents hooks as an incomplete guardrail.';
    }
}
/** Pure planner used by the CLI and focused next-step tests. */
function buildSetupPlan(input) {
    const repositoryContext = input.repositoryContext || {
        status: input.snapshot.repositoryContextReady ? 'ready' : 'required',
        kind: input.snapshot.repositoryContextReady ? 'git_repository' : 'none',
        repoRoot: null,
        label: null,
        explicit: false,
        reason: input.snapshot.repositoryContextReady
            ? 'Repository context is available.'
            : 'No Git repository is active in this terminal.',
    };
    const brainComplete = [
        'governance_ready', 'semantic_slice_ready', 'background_enrichment', 'fully_enriched',
    ].includes(input.snapshot.brainState);
    const warnings = brainComplete && input.snapshot.brainState !== 'fully_enriched'
        ? ['Structural governance is ready. Full semantic enrichment is not implied; plan-driven semantic coverage is reported separately.']
        : input.snapshot.brainState === 'partial'
            ? ['Structural indexing is partial and cannot prove absence outside its coverage.']
            : [];
    const stages = [
        { id: 'install', label: 'CLI available', complete: input.snapshot.installed },
        { id: 'login', label: 'Workspace credential', complete: input.snapshot.authState === 'authenticated' },
        { id: 'repository_context', label: 'Repository selected', complete: input.snapshot.repositoryContextReady },
        { id: 'repository', label: 'Repository ownership', complete: input.snapshot.repositoryConnected },
        { id: 'brain', label: 'Structural governance readiness', complete: brainComplete },
        { id: 'agent', label: input.agent ? `${input.environment.label} integration` : 'Coding environment selected', complete: input.snapshot.agentConfigured },
    ];
    const firstIncomplete = stages.find((stage) => !stage.complete);
    let nextAction;
    switch (firstIncomplete?.id) {
        case 'install':
            nextAction = {
                stage: 'install',
                label: 'Use the current CLI release',
                command: 'npx -y @neurcode-ai/cli@latest setup',
                reason: 'Run setup through the current published CLI.',
            };
            break;
        case 'login':
            nextAction = input.snapshot.authState === 'unknown'
                ? {
                    stage: 'login',
                    label: 'Diagnose credential reachability',
                    command: 'neurcode doctor',
                    reason: 'A saved credential exists, but the API could not be reached to validate it. Setup will not claim authentication while offline.',
                }
                : {
                    stage: 'login',
                    label: input.snapshot.authState === 'invalid' ? 'Replace the invalid credential' : 'Connect a workspace',
                    command: 'neurcode login',
                    reason: 'Browser approval requires an explicit personal or organization workspace.',
                };
            break;
        case 'repository_context':
            nextAction = {
                stage: 'repository_context',
                label: 'Choose the repository to activate',
                command: `neurcode setup --repo <repository-path>${input.agent ? ` --agent ${input.agent}` : ''}`,
                reason: 'Login is machine-wide, but Brain and runtime setup must be bound to an explicit repository. Neurcode will not initialize your home directory.',
            };
            break;
        case 'repository':
            nextAction = {
                stage: 'repository',
                label: 'Bind this repository',
                command: 'neurcode repo connect',
                reason: 'Repository evidence needs an explicit workspace and project owner.',
            };
            break;
        case 'brain':
            nextAction = {
                stage: 'brain',
                label: 'Build repository intelligence',
                command: 'neurcode brain index',
                reason: input.snapshot.brainState === 'stale'
                    ? 'The repository graph is stale and must be refreshed before agent setup.'
                    : 'Create the source-free local repository graph used by governance checks.',
            };
            break;
        case 'agent':
            nextAction = input.agent
                ? {
                    stage: 'agent',
                    label: `Configure ${input.environment.label}`,
                    command: (0, onboard_1.agentSetupCommandFor)(input.agent),
                    reason: enforcementPostureFor(input.agent),
                }
                : {
                    stage: 'agent_selection',
                    label: 'Choose your coding environment',
                    command: 'neurcode setup --agent <claude|cursor|codex|vscode|copilot|action>',
                    reason: 'Neurcode will not guess an agent or apply the wrong integration posture.',
                };
            break;
        default:
            if (!input.agent) {
                nextAction = {
                    stage: 'agent_selection',
                    label: 'Choose your coding environment',
                    command: 'neurcode setup --agent <claude|cursor|codex|vscode|copilot|action>',
                    reason: 'Neurcode will not guess an agent or apply the wrong integration posture.',
                };
                break;
            }
            nextAction = {
                stage: 'first_governed_session',
                label: input.agent === 'action'
                    ? 'Choose a local agent for the governed session'
                    : 'Start one bounded governed task',
                command: (0, contracts_1.activationSessionCommand)(input.agent),
                reason: input.agent === 'action'
                    ? 'GitHub Action is the post-change CI backstop. A local coding agent is required for the first in-flow governed session.'
                    : 'Setup is ready. Start a real user-owned session in this repository; finish it after the bounded task and sync its source-free evidence.',
            };
    }
    return {
        complete: stages.every((stage) => stage.complete) && Boolean(input.agent),
        agent: input.agent,
        environment: input.environment,
        enforcementPosture: enforcementPostureFor(input.agent),
        warnings,
        repositoryContext,
        stages,
        nextAction,
    };
}
function canonicalPath(value) {
    try {
        return (0, fs_1.realpathSync)(value);
    }
    catch {
        return (0, path_1.resolve)(value);
    }
}
function gitRootFor(directory) {
    try {
        const root = (0, child_process_1.execFileSync)('git', ['rev-parse', '--show-toplevel'], {
            cwd: directory,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return root ? canonicalPath(root) : null;
    }
    catch {
        return null;
    }
}
/** Resolve a safe repository boundary without ever creating local state. */
function resolveSetupRepositoryContext(input = {}) {
    const cwd = canonicalPath(input.cwd || process.cwd());
    const explicitValue = input.repositoryPath?.trim();
    const candidate = explicitValue ? canonicalPath((0, path_1.resolve)(cwd, explicitValue)) : cwd;
    if (!(0, fs_1.existsSync)(candidate)) {
        throw new Error(`Repository path does not exist: ${candidate}`);
    }
    if (!(0, fs_1.statSync)(candidate).isDirectory()) {
        throw new Error(`Repository path is not a directory: ${candidate}`);
    }
    const gitRoot = gitRootFor(candidate);
    if (gitRoot) {
        return {
            status: 'ready',
            kind: 'git_repository',
            repoRoot: gitRoot,
            label: (0, path_1.basename)(gitRoot),
            explicit: Boolean(explicitValue),
            reason: explicitValue
                ? 'Explicit repository path resolved to its Git root.'
                : 'Current terminal is inside a Git repository.',
        };
    }
    if ((0, fs_1.existsSync)((0, path_1.resolve)(candidate, '.neurcode', 'config.json'))) {
        return {
            status: 'ready',
            kind: 'linked_directory',
            repoRoot: candidate,
            label: (0, path_1.basename)(candidate),
            explicit: Boolean(explicitValue),
            reason: 'Existing Neurcode repository ownership was found in this directory.',
        };
    }
    if (explicitValue) {
        throw new Error(`No Git repository was found at ${candidate}. Choose a repository path or initialize Git before activation.`);
    }
    return {
        status: 'required',
        kind: 'none',
        repoRoot: null,
        label: null,
        explicit: false,
        reason: 'This terminal is not inside a Git repository. Login can continue, but repository setup requires --repo <path>.',
    };
}
function selectedAgent(requested, detected, profileAgent) {
    if (requested) {
        const normalized = requested.trim().toLowerCase();
        if (!onboard_1.ONBOARD_AGENTS.includes(normalized)) {
            throw new Error(`Unsupported agent "${requested}". Choose: ${onboard_1.ONBOARD_AGENTS.join(', ')}.`);
        }
        return normalized;
    }
    if (detected.target !== 'terminal')
        return detected.target;
    return profileAgent || null;
}
function selectedEnvironment(agent, detected) {
    if (!agent)
        return detected;
    if (detected.target === agent)
        return detected;
    const label = {
        claude: 'Claude Code',
        cursor: 'Cursor',
        codex: 'Codex',
        copilot: 'GitHub Copilot',
        vscode: 'VS Code',
        action: 'GitHub Action',
    };
    return { target: agent, label: label[agent], source: detected.source };
}
async function readBrainState(repoRoot) {
    const freshness = await (0, brain_1.repositoryGraphStatus)(repoRoot);
    if (freshness.state === 'stale')
        return 'stale';
    if (freshness.state === 'corrupt')
        return 'failed';
    if (freshness.state === 'missing')
        return 'not_started';
    return (0, brain_1.readProgressiveAuthority)(repoRoot).state;
}
function agentIsConfigured(repoRoot, agent) {
    if (!agent)
        return false;
    try {
        const manifest = (0, cli_runtime_1.readActivatedRuntimeManifest)(repoRoot);
        const expected = AGENT_ADAPTERS[agent];
        return Boolean(manifest?.integrations?.some((integration) => expected.has(integration.adapter)));
    }
    catch {
        return false;
    }
}
function normalizeProfileAgent(value) {
    if (typeof value !== 'string')
        return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'claude-code' || normalized === 'claude_code')
        return 'claude';
    if (normalized === 'github-copilot')
        return 'copilot';
    if (normalized === 'vscode_copilot')
        return 'vscode';
    if (normalized === 'github_actions')
        return 'action';
    return onboard_1.ONBOARD_AGENTS.includes(normalized)
        ? normalized
        : null;
}
async function fetchProfileAgent(apiKey, organizationId) {
    const config = (0, config_1.loadConfig)();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    try {
        const headers = {
            accept: 'application/json',
            authorization: `Bearer ${apiKey}`,
        };
        if (organizationId)
            headers['x-org-id'] = organizationId;
        const response = await fetch(`${(config.apiUrl || config_1.DEFAULT_API_URL).replace(/\/$/, '')}/api/v1/account-onboarding/bootstrap`, { headers, signal: controller.signal });
        if (!response.ok)
            return null;
        const body = await response.json();
        return normalizeProfileAgent(body.profile?.primaryAgent);
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timeout);
    }
}
async function validateSetupAuthentication(input) {
    if (!input.apiKey)
        return 'missing';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    try {
        const headers = {
            accept: 'application/json',
            authorization: `Bearer ${input.apiKey}`,
        };
        if (input.organizationId)
            headers['x-org-id'] = input.organizationId;
        const response = await (input.fetchImpl || fetch)(`${input.apiUrl.replace(/\/$/, '')}/api/v1/users/me`, { headers, signal: controller.signal });
        if (response.ok)
            return 'authenticated';
        if (response.status === 401 || response.status === 403)
            return 'invalid';
        return 'unknown';
    }
    catch {
        return 'unknown';
    }
    finally {
        clearTimeout(timeout);
    }
}
async function collectSetupPlan(requestedAgent, repositoryPath) {
    const repositoryContext = resolveSetupRepositoryContext({ repositoryPath });
    const repoRoot = repositoryContext.repoRoot || process.cwd();
    const detected = (0, onboard_1.detectOnboardEnvironment)(repoRoot);
    let config = (0, config_1.loadConfig)();
    const originalCwd = process.cwd();
    let organizationId = null;
    let projectId = null;
    let brainState = 'not_started';
    let configured = false;
    try {
        if (repositoryContext.repoRoot)
            process.chdir(repositoryContext.repoRoot);
        config = (0, config_1.loadConfig)();
        organizationId = (0, state_1.getOrgId)();
        projectId = (0, state_1.getProjectId)();
        brainState = repositoryContext.repoRoot ? await readBrainState((0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd())) : 'not_started';
    }
    finally {
        process.chdir(originalCwd);
    }
    const apiKey = organizationId ? ((0, config_1.getApiKey)(organizationId) || null) : (0, config_1.getAnyPersistedApiKey)();
    const authState = await validateSetupAuthentication({
        apiKey,
        apiUrl: config.apiUrl || config_1.DEFAULT_API_URL,
        organizationId,
    });
    const profileAgent = requestedAgent || detected.target !== 'terminal' || authState !== 'authenticated' || !apiKey
        ? null
        : await fetchProfileAgent(apiKey, organizationId);
    const agent = selectedAgent(requestedAgent, detected, profileAgent);
    const environment = requestedAgent
        ? { ...selectedEnvironment(agent, detected), source: 'explicit' }
        : profileAgent && agent === profileAgent && detected.target === 'terminal'
            ? { ...selectedEnvironment(agent, detected), source: 'profile' }
            : selectedEnvironment(agent, detected);
    try {
        if (repositoryContext.repoRoot)
            process.chdir(repositoryContext.repoRoot);
        configured = repositoryContext.repoRoot ? agentIsConfigured((0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd()), agent) : false;
    }
    finally {
        process.chdir(originalCwd);
    }
    const snapshot = {
        installed: true,
        authState,
        repositoryContextReady: repositoryContext.status === 'ready',
        repositoryConnected: Boolean(organizationId && projectId),
        brainState,
        agentConfigured: configured,
    };
    return buildSetupPlan({ snapshot, agent, environment, repositoryContext });
}
async function promptForRepositoryPath() {
    const terminal = (0, promises_1.createInterface)({ input: process.stdin, output: process.stdout });
    try {
        const answer = await terminal.question('Repository path (leave blank to stop here): ');
        return answer.trim() || null;
    }
    finally {
        terminal.close();
    }
}
function agentSetupArgs(agent) {
    switch (agent) {
        case 'claude': return ['activate', 'claude', '--dir', '.'];
        case 'cursor': return ['cursor', 'onboard', '--strict'];
        case 'codex': return ['agent', 'bootstrap', 'codex'];
        case 'copilot':
        case 'vscode': return ['activate', 'copilot', '--dir', '.'];
        case 'action': return ['activate', 'action', '--dir', '.'];
    }
}
function runCurrentCli(repoRoot, args, label) {
    const entry = process.argv[1];
    if (!entry)
        throw new Error(`Cannot run ${label}: CLI entrypoint is unavailable.`);
    const result = (0, child_process_1.spawnSync)(process.execPath, [entry, ...args], {
        cwd: repoRoot,
        env: { ...process.env, NEURCODE_PROJECT_ROOT: repoRoot },
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}. Fix the reported issue and rerun neurcode setup.`);
    }
}
async function syncCanonicalSetupProofs(repoRoot, agent) {
    const originalCwd = process.cwd();
    try {
        process.chdir(repoRoot);
        const organizationId = (0, state_1.getOrgId)();
        const projectId = (0, state_1.getProjectId)();
        if (!organizationId || !projectId)
            return;
        const runtimeConnection = (0, runtime_connection_1.loadRuntimeConnection)(repoRoot);
        const repoId = runtimeConnection?.organizationId === organizationId
            ? runtimeConnection.repo.id
            : null;
        const brainState = await readBrainState(repoRoot);
        const brainIndexed = ['governance_ready', 'semantic_slice_ready', 'background_enrichment', 'fully_enriched'].includes(brainState);
        if (brainIndexed) {
            await (0, activation_proof_1.submitFirstValueActivationProof)({
                orgId: organizationId,
                proof: (0, activation_proof_1.buildBoundActivationProof)({
                    projectId,
                    repoId,
                    stage: 'brain_index',
                    commandFamily: 'setup',
                    reasonCode: 'setup.brain_proof_synced',
                    localPosture: { repoConfigPresent: true, brainIndexed: true },
                }),
            });
        }
        if (!agent || !agentIsConfigured(repoRoot, agent))
            return;
        const host = agent === 'action'
            ? { detected: false, configured: true, authenticated: false, automaticPreWriteInterception: false }
            : (0, agent_adapter_setup_1.inspectHostRuntimeFacts)({ target: agent, repoRoot });
        await (0, activation_proof_1.submitFirstValueActivationProof)({
            orgId: organizationId,
            proof: (0, activation_proof_1.buildBoundActivationProof)({
                projectId,
                repoId,
                stage: 'agent_setup',
                commandFamily: 'setup',
                reasonCode: 'setup.host_proof_synced',
                agentTarget: agent,
                localPosture: {
                    repoConfigPresent: true,
                    runtimeConfigured: true,
                    brainIndexed,
                    hostDetected: host.detected,
                    hostConfigured: true,
                    hostAuthenticated: host.authenticated,
                    automaticPreWriteInterception: host.automaticPreWriteInterception,
                },
            }),
        });
    }
    finally {
        process.chdir(originalCwd);
    }
}
function renderSetupPlan(plan, readOnly) {
    console.log('');
    console.log(chalk.bold('Neurcode setup'));
    console.log(chalk.dim(`Agent: ${plan.environment.label}`));
    console.log(chalk.dim(`Repository: ${plan.repositoryContext.repoRoot || 'not selected'}`));
    console.log(chalk.dim(`Posture: ${plan.enforcementPosture}`));
    for (const warning of plan.warnings)
        console.log(chalk.yellow(`Warning: ${warning}`));
    console.log('');
    for (const stage of plan.stages) {
        const marker = stage.complete ? chalk.green('complete') : chalk.yellow('pending');
        console.log(`  ${marker.padEnd(12)} ${stage.label}`);
    }
    console.log('');
    console.log(chalk.bold('Next action'));
    console.log(`  ${plan.nextAction.label}`);
    console.log(chalk.dim(`  ${plan.nextAction.reason}`));
    console.log(chalk.cyan(`  ${plan.nextAction.command}`));
    if (readOnly) {
        console.log(chalk.dim('  Status mode made no changes.'));
    }
    console.log('');
}
function setupCommand(program) {
    program
        .command('setup')
        .description('Canonical first-run and resume flow: login, repo, Brain, and agent readiness')
        .option('--agent <agent>', `Target agent: ${onboard_1.ONBOARD_AGENTS.join(' | ')}`)
        .option('--repo <path>', 'Repository path; required when setup starts outside a Git workspace')
        .option('--status', 'Inspect progress without starting interactive login or repository binding')
        .option('--json', 'Output machine-readable progress without making changes')
        .action(async (options) => {
        try {
            let repositoryPath = options.repo;
            let plan = await collectSetupPlan(options.agent, repositoryPath);
            const readOnly = options.status === true || options.json === true;
            const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY && !process.env.CI);
            if (!readOnly && interactive) {
                const loginStage = plan.stages.find((stage) => stage.id === 'login');
                if (!loginStage?.complete && plan.nextAction.command === 'neurcode login') {
                    await (0, login_1.loginCommand)();
                    plan = await collectSetupPlan(options.agent, repositoryPath);
                }
                if (plan.stages.find((stage) => stage.id === 'login')?.complete && !plan.repositoryContext.repoRoot) {
                    const selectedPath = await promptForRepositoryPath();
                    if (selectedPath) {
                        repositoryPath = selectedPath;
                        plan = await collectSetupPlan(options.agent, repositoryPath);
                    }
                }
                const repoStage = plan.stages.find((stage) => stage.id === 'repository');
                if (plan.repositoryContext.repoRoot && plan.stages.find((stage) => stage.id === 'login')?.complete && !repoStage?.complete) {
                    const originalCwd = process.cwd();
                    try {
                        process.chdir(plan.repositoryContext.repoRoot);
                        await (0, init_1.initCommand)();
                    }
                    finally {
                        process.chdir(originalCwd);
                    }
                    plan = await collectSetupPlan(options.agent, repositoryPath || plan.repositoryContext.repoRoot);
                }
                if (plan.repositoryContext.repoRoot && plan.stages.find((stage) => stage.id === 'repository')?.complete) {
                    const repoRoot = plan.repositoryContext.repoRoot;
                    const brainStage = plan.stages.find((stage) => stage.id === 'brain');
                    if (!brainStage?.complete) {
                        runCurrentCli(repoRoot, ['brain', 'index'], 'Repository Brain indexing');
                        plan = await collectSetupPlan(options.agent, repositoryPath || repoRoot);
                    }
                    const agentStage = plan.stages.find((stage) => stage.id === 'agent');
                    if (plan.agent && plan.stages.find((stage) => stage.id === 'brain')?.complete && !agentStage?.complete) {
                        runCurrentCli(repoRoot, agentSetupArgs(plan.agent), `${plan.environment.label} setup`);
                        await (0, activation_telemetry_1.trackActivationEventAndFlush)({
                            eventType: 'agent_target_selected',
                            commandFamily: 'setup',
                            agentTarget: plan.agent,
                            reasonCode: 'setup.agent_selected',
                        });
                        plan = await collectSetupPlan(options.agent, repositoryPath || repoRoot);
                    }
                }
                // login/init completion events were durably queued by their commands;
                // make one bounded delivery attempt before rendering the resumed state.
                if (plan.repositoryContext.repoRoot) {
                    await syncCanonicalSetupProofs(plan.repositoryContext.repoRoot, plan.agent);
                    plan = await collectSetupPlan(options.agent, repositoryPath || plan.repositoryContext.repoRoot);
                }
                await (0, activation_telemetry_1.flushActivationTelemetry)();
            }
            if (options.json) {
                console.log(JSON.stringify({
                    ok: true,
                    mode: 'status',
                    ...plan,
                }, null, 2));
                return;
            }
            renderSetupPlan(plan, readOnly || !interactive);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (options.json) {
                console.log(JSON.stringify({ ok: false, error: message }, null, 2));
            }
            else {
                console.error(chalk.red(`Setup failed: ${message}`));
            }
            process.exitCode = 2;
        }
    });
}
//# sourceMappingURL=setup.js.map