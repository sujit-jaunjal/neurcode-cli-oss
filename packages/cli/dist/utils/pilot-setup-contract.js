"use strict";
/**
 * Builds the shared pilot setup contract for CLI JSON output and dashboard mirror.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPilotSetupContract = buildPilotSetupContract;
exports.readPilotSetupContractFromFile = readPilotSetupContractFromFile;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const contracts_1 = require("@neurcode-ai/contracts");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const agent_adapter_setup_1 = require("./agent-adapter-setup");
const v0_governance_1 = require("./v0-governance");
const runtime_connection_1 = require("./runtime-connection");
const pilot_setup_commands_1 = require("./pilot-setup-commands");
function repoScale(trackedFileCount) {
    if (trackedFileCount <= 0)
        return 'unknown';
    if (trackedFileCount < 500)
        return 'small';
    if (trackedFileCount < 5000)
        return 'medium';
    return 'large';
}
function detectPrimaryLanguages(repoRoot) {
    const extCounts = new Map();
    try {
        const output = (0, node_child_process_1.execFileSync)('git', ['-C', repoRoot, 'ls-files'], { encoding: 'utf8' });
        for (const line of output.split('\n')) {
            const match = /\.([a-zA-Z0-9]+)$/.exec(line.trim());
            if (!match)
                continue;
            const ext = match[1].toLowerCase();
            extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
        }
    }
    catch {
        return [];
    }
    const langMap = {
        ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
        py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', rb: 'Ruby',
    };
    return [...extCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([ext]) => langMap[ext] ?? ext)
        .filter((value, index, arr) => arr.indexOf(value) === index);
}
function hasCodeowners(repoRoot) {
    const candidates = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS'];
    return candidates.some((rel) => (0, node_fs_1.existsSync)((0, node_path_1.join)(repoRoot, rel)));
}
function enforcementPostureFor(adapter) {
    const capability = (0, governance_runtime_1.listAgentRuntimeAdapterCapabilities)().find((item) => item.adapter === adapter);
    if (!capability)
        return 'unsupported';
    if (capability.enforcementLevel === 'hard_deny')
        return 'hard_pre_write_deny';
    if (capability.enforcementLevel === 'cooperative')
        return 'cooperative_supervision';
    if (adapter === 'github-action')
        return 'post_pr_advisory';
    return 'unsupported';
}
function buildPilotSetupContract(input) {
    const target = (0, agent_adapter_setup_1.normalizeAgentSetupTarget)(input.agent);
    const snippet = (0, agent_adapter_setup_1.buildAgentSetupSnippet)({ target, repoRoot: input.repoRoot, global: false });
    const inspection = (0, agent_adapter_setup_1.inspectAgentSetup)({ target, repoRoot: input.repoRoot, global: false });
    const profile = (0, v0_governance_1.ensureFreshGovernanceProfile)(input.repoRoot, { force: false });
    const connection = (0, runtime_connection_1.loadRuntimeConnection)(input.repoRoot);
    const commands = (0, pilot_setup_commands_1.buildAgentSetupCommands)(target);
    const capability = (0, governance_runtime_1.listAgentRuntimeAdapterCapabilities)().find((item) => item.adapter === snippet.adapter);
    const steps = [
        { id: 'pair', label: 'Pair repository', command: 'Open Runtime Control Plane → Connect repo, then run the copied activation command.', recovery: !connection },
        { id: 'activate', label: 'Activate agent runtime', command: commands.activate },
        { id: 'brain', label: 'Index repository Brain', command: 'neurcode brain index --json' },
        { id: 'health', label: 'Validate setup', command: commands.health, recovery: true },
        { id: 'start', label: 'Start governed session', command: commands.start },
        { id: 'evidence', label: 'Export AI Change Record', command: commands.evidence },
    ];
    const sensitiveSurfaceCount = profile.profile.approvalRequiredPaths?.length ?? 0;
    return {
        schemaVersion: contracts_1.PILOT_SETUP_CONTRACT_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        agent: target,
        adapter: snippet.adapter,
        privacy: {
            metadataOnly: true,
            sourceUploaded: false,
            sourceIncluded: false,
        },
        repoFacts: {
            trackedFileCount: profile.profile.topology.trackedFileCount,
            primaryLanguages: detectPrimaryLanguages(input.repoRoot),
            hasCodeowners: hasCodeowners(input.repoRoot),
            sensitiveSurfaceCount,
            scale: repoScale(profile.profile.topology.trackedFileCount),
        },
        hostCapability: {
            agent: target,
            adapter: snippet.adapter,
            enforcementPosture: enforcementPostureFor(snippet.adapter),
            automatic: capability?.automatic ?? false,
            description: capability?.description ?? 'Portable MCP runtime adapter.',
        },
        pairing: {
            status: connection ? 'connected' : 'local_only',
            repoName: connection?.repo.name ?? null,
            organizationHandle: null,
        },
        steps,
        recoveryCommand: (0, contracts_1.buildPilotSetupRecoveryCommand)(steps),
        validation: {
            authCheck: 'neurcode whoami --json',
            pairingCheck: connection ? 'neurcode sync --runtime --dry-run' : 'neurcode activate --pair-from-dashboard',
        },
    };
}
function readPilotSetupContractFromFile(path) {
    if (!(0, node_fs_1.existsSync)(path))
        return null;
    try {
        return JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=pilot-setup-contract.js.map