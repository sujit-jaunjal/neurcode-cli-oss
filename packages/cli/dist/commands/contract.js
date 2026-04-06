"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contractCommand = contractCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const readline_1 = require("readline");
const api_client_1 = require("../api-client");
const config_1 = require("../config");
const project_root_1 = require("../utils/project-root");
const state_1 = require("../utils/state");
const policy_packs_1 = require("../utils/policy-packs");
const policy_compiler_1 = require("../utils/policy-compiler");
const change_contract_1 = require("../utils/change-contract");
const artifact_signature_1 = require("../utils/artifact-signature");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (value) => value,
        yellow: (value) => value,
        red: (value) => value,
        bold: (value) => value,
        dim: (value) => value,
        cyan: (value) => value,
    };
}
function emitJson(payload) {
    console.log(JSON.stringify(payload, null, 2));
}
function hasPersistedPlanId(planId) {
    return typeof planId === 'string' && planId.trim().length > 0 && planId !== 'unknown';
}
async function readStdinText() {
    return new Promise((resolvePromise, reject) => {
        const chunks = [];
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk) => {
            chunks.push(String(chunk));
        });
        process.stdin.on('error', reject);
        process.stdin.on('end', () => {
            resolvePromise(chunks.join(''));
        });
        process.stdin.resume();
    });
}
function parseAsJsonIfPossible(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    try {
        return JSON.parse(trimmed);
    }
    catch {
        return null;
    }
}
function normalizeProvider(provider) {
    return String(provider || 'generic').trim().toLowerCase();
}
function normalizeCandidateLimit(value) {
    if (!Number.isFinite(value))
        return 8;
    const rounded = Math.trunc(value);
    if (rounded < 1)
        return 1;
    if (rounded > 30)
        return 30;
    return rounded;
}
function isInteractiveTerminal() {
    return process.stdin.isTTY && process.stdout.isTTY && process.env.CI !== 'true';
}
function listFilesRecursively(dirPath, maxDepth = 4, maxFiles = 240) {
    const files = [];
    const walk = (current, depth) => {
        if (depth > maxDepth || files.length >= maxFiles) {
            return;
        }
        let entries;
        try {
            entries = (0, fs_1.readdirSync)(current, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (files.length >= maxFiles)
                return;
            if (entry.name === '.git' || entry.name === 'node_modules') {
                continue;
            }
            const absolutePath = (0, path_1.resolve)(current, entry.name);
            if (entry.isDirectory()) {
                walk(absolutePath, depth + 1);
            }
            else if (entry.isFile()) {
                files.push(absolutePath);
            }
        }
    };
    walk(dirPath, 0);
    return files;
}
function isCandidatePlanFile(filePath) {
    const extension = (0, path_1.extname)(filePath).toLowerCase();
    if (!['.md', '.markdown', '.txt', '.json'].includes(extension)) {
        return false;
    }
    const normalized = filePath.toLowerCase();
    return (normalized.includes('plan')
        || normalized.includes('architect')
        || normalized.includes('implementation')
        || normalized.includes('contract')
        || normalized.includes('prompt'));
}
function resolveAutoDetectRoots(projectRoot, options) {
    const provider = normalizeProvider(options.provider);
    const explicitPath = options.agentPath?.trim();
    const explicitRoots = explicitPath ? [(0, path_1.resolve)(projectRoot, explicitPath)] : [];
    const providerRoots = {
        claude: ['.claude', '.claude/plans', '.claude/tasks', '.neurcode/import'],
        cursor: ['.cursor', '.cursor/plans', '.neurcode/import'],
        codex: ['.codex', '.codex/plans', '.neurcode/import'],
        chatgpt: ['.chatgpt', '.openai', '.neurcode/import'],
        generic: ['.neurcode/import', '.claude/plans', '.cursor/plans', '.codex/plans'],
    };
    if (explicitRoots.length > 0 && !(0, fs_1.existsSync)(explicitRoots[0])) {
        throw new Error(`--agent-path does not exist: ${explicitRoots[0]}`);
    }
    const defaultRoots = providerRoots[provider] || providerRoots.generic;
    return explicitRoots.length > 0
        ? explicitRoots
        : defaultRoots.map((entry) => (0, path_1.resolve)(projectRoot, entry));
}
function discoverAgentPlanCandidates(projectRoot, options) {
    const roots = resolveAutoDetectRoots(projectRoot, options);
    const candidates = [];
    const dedupe = new Set();
    for (const root of roots) {
        if (!(0, fs_1.existsSync)(root)) {
            continue;
        }
        try {
            const stat = (0, fs_1.statSync)(root);
            if (stat.isFile()) {
                if (isCandidatePlanFile(root) && !dedupe.has(root)) {
                    dedupe.add(root);
                    candidates.push({
                        path: root,
                        mtimeMs: stat.mtimeMs || 0,
                        sizeBytes: stat.size || 0,
                    });
                }
                continue;
            }
            const discovered = listFilesRecursively(root);
            for (const file of discovered) {
                if (!isCandidatePlanFile(file) || dedupe.has(file)) {
                    continue;
                }
                dedupe.add(file);
                const fileStat = (0, fs_1.statSync)(file);
                candidates.push({
                    path: file,
                    mtimeMs: fileStat.mtimeMs || 0,
                    sizeBytes: fileStat.size || 0,
                });
            }
        }
        catch {
            // Continue scanning remaining roots.
        }
    }
    candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
    return candidates;
}
function formatAutoDetectCandidates(projectRoot, candidates) {
    return candidates.map((candidate) => ({
        path: candidate.path,
        relativePath: (0, path_1.relative)(projectRoot, candidate.path) || candidate.path,
        modifiedAt: new Date(candidate.mtimeMs).toISOString(),
        sizeBytes: candidate.sizeBytes,
    }));
}
function askQuestion(question) {
    return new Promise((resolvePromise) => {
        const rl = (0, readline_1.createInterface)({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question(question, (answer) => {
            rl.close();
            resolvePromise(String(answer || '').trim());
        });
    });
}
async function confirmAutoDetectedCandidate(projectRoot, candidates) {
    if (candidates.length === 0) {
        throw new Error('No plan candidates available for confirmation.');
    }
    console.log(chalk.bold.cyan('\n🧭 Auto-detected plan candidates'));
    candidates.forEach((candidate, idx) => {
        const rel = (0, path_1.relative)(projectRoot, candidate.path) || candidate.path;
        const modified = new Date(candidate.mtimeMs).toLocaleString();
        console.log(chalk.dim(`  ${idx + 1}. ${rel} (${modified}, ${candidate.sizeBytes} bytes)`));
    });
    console.log('');
    const selectionAnswer = await askQuestion(`Select candidate [1-${candidates.length}] (default: 1, q to cancel): `);
    if (/^q(?:uit)?$/i.test(selectionAnswer)) {
        throw new Error('Auto-detect selection cancelled by user.');
    }
    let selectedRank = 1;
    if (selectionAnswer) {
        const parsed = Number.parseInt(selectionAnswer, 10);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > candidates.length) {
            throw new Error(`Invalid selection "${selectionAnswer}". Expected a value between 1 and ${candidates.length}.`);
        }
        selectedRank = parsed;
    }
    const selected = candidates[selectedRank - 1];
    const selectedRel = (0, path_1.relative)(projectRoot, selected.path) || selected.path;
    const confirmAnswer = await askQuestion(`Use "${selectedRel}" for contract import? [Y/n]: `);
    if (confirmAnswer && !/^y(?:es)?$/i.test(confirmAnswer)) {
        throw new Error('Auto-detect confirmation denied by user.');
    }
    return {
        selected,
        selectedRank,
        confirmed: true,
    };
}
async function resolveImportPayload(projectRoot, options) {
    if (options.text && options.text.trim()) {
        return {
            source: 'inline',
            planText: options.text.trim(),
        };
    }
    if (options.input && options.input.trim()) {
        const inputPath = (0, path_1.resolve)(projectRoot, options.input.trim());
        if (!(0, fs_1.existsSync)(inputPath)) {
            throw new Error(`Input file not found: ${inputPath}`);
        }
        const raw = (0, fs_1.readFileSync)(inputPath, 'utf-8');
        const parsed = parseAsJsonIfPossible(raw);
        if (parsed !== null) {
            return {
                source: 'file',
                planJson: parsed,
                sourcePath: inputPath,
            };
        }
        return {
            source: 'file',
            planText: raw,
            sourcePath: inputPath,
        };
    }
    if (options.autoDetect || (options.agentPath && options.agentPath.trim())) {
        const candidateLimit = normalizeCandidateLimit(options.maxCandidates);
        const discovered = discoverAgentPlanCandidates(projectRoot, options);
        if (discovered.length > 0) {
            const topCandidates = discovered.slice(0, candidateLimit);
            const shouldConfirm = options.confirm !== false && !options.json && isInteractiveTerminal();
            let selected = topCandidates[0];
            let selectedRank = 1;
            let confirmed = !shouldConfirm;
            if (shouldConfirm) {
                const confirmation = await confirmAutoDetectedCandidate(projectRoot, topCandidates);
                selected = confirmation.selected;
                selectedRank = confirmation.selectedRank;
                confirmed = confirmation.confirmed;
            }
            const raw = (0, fs_1.readFileSync)(selected.path, 'utf-8');
            const autoDetectMetadata = {
                provider: normalizeProvider(options.provider),
                candidateCount: discovered.length,
                selectedPath: selected.path,
                selectedRank,
                confirmRequired: shouldConfirm,
                confirmed,
                candidates: formatAutoDetectCandidates(projectRoot, topCandidates),
            };
            const parsed = parseAsJsonIfPossible(raw);
            if (parsed !== null) {
                return {
                    source: 'agent_auto',
                    planJson: parsed,
                    sourcePath: selected.path,
                    autoDetect: autoDetectMetadata,
                };
            }
            return {
                source: 'agent_auto',
                planText: raw,
                sourcePath: selected.path,
                autoDetect: autoDetectMetadata,
            };
        }
        if (options.autoDetect || (options.agentPath && options.agentPath.trim())) {
            throw new Error('No agent plan artifact found for auto-detect. Use --input <path> or provide --text.');
        }
    }
    const shouldReadStdin = options.stdin === true || !process.stdin.isTTY;
    if (shouldReadStdin) {
        const raw = await readStdinText();
        if (!raw.trim()) {
            throw new Error('Stdin was empty. Provide plan text or JSON via stdin.');
        }
        const parsed = parseAsJsonIfPossible(raw);
        if (parsed !== null) {
            return {
                source: 'stdin',
                planJson: parsed,
            };
        }
        return {
            source: 'stdin',
            planText: raw,
        };
    }
    throw new Error('Provide one of --text, --input <path>, --auto-detect, or --stdin to import an external plan.');
}
function contractCommand(program) {
    const contract = program
        .command('contract')
        .description('Manage imported intent/change contracts from external AI planners');
    contract
        .command('import')
        .description('Import an external AI-generated implementation plan and bind it to Neurcode verify flow')
        .option('--provider <provider>', 'Plan source provider (claude | cursor | codex | chatgpt | generic)', 'generic')
        .option('--project-id <id>', 'Project ID override')
        .option('--intent <text>', 'Intent override for imported plan')
        .option('--title <text>', 'Title override for imported plan')
        .option('--input <path>', 'Read plan payload from file (JSON or markdown/text)')
        .option('--text <payload>', 'Inline plan payload (JSON or plain text)')
        .option('--stdin', 'Read plan payload from stdin')
        .option('--auto-detect', 'Auto-detect latest plan artifact from local AI assistant directories')
        .option('--agent-path <path>', 'Optional file/dir override when using --auto-detect')
        .option('--no-confirm', 'Skip interactive confirmation for auto-detected plan selection')
        .option('--list-candidates', 'List auto-detected candidate plan files and exit without importing')
        .option('--max-candidates <n>', 'Max auto-detect candidates to inspect/report (default: 8)', (value) => parseInt(value, 10))
        .option('--no-write-change-contract', 'Skip writing .neurcode/change-contract.json')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const startedAt = Date.now();
        try {
            if (options.listCandidates) {
                const candidateLimit = normalizeCandidateLimit(options.maxCandidates);
                const discovered = discoverAgentPlanCandidates(projectRoot, options);
                const candidates = formatAutoDetectCandidates(projectRoot, discovered.slice(0, candidateLimit));
                const payload = {
                    success: true,
                    mode: 'candidate_list',
                    provider: normalizeProvider(options.provider),
                    candidateCount: discovered.length,
                    candidates,
                    message: discovered.length > 0
                        ? 'Auto-detect candidates resolved.'
                        : 'No auto-detect candidates found. Provide --input or use --agent-path.',
                    timestamp: new Date().toISOString(),
                };
                if (options.json) {
                    console.log(JSON.stringify(payload, null, 2));
                }
                else if (candidates.length === 0) {
                    console.log(chalk.yellow('\n⚠️  No auto-detect plan candidates found.\n'));
                }
                else {
                    console.log(chalk.bold.cyan('\n🧭 Auto-detect plan candidates\n'));
                    candidates.forEach((candidate, idx) => {
                        console.log(chalk.dim(`  ${idx + 1}. ${candidate.relativePath}`));
                        console.log(chalk.dim(`     modified: ${candidate.modifiedAt} | size: ${candidate.sizeBytes} bytes`));
                    });
                    console.log('');
                }
                return;
            }
            const config = (0, config_1.loadConfig)();
            if (!config.apiKey) {
                config.apiKey = (0, config_1.requireApiKey)();
            }
            const client = new api_client_1.ApiClient(config);
            const payload = await resolveImportPayload(projectRoot, options);
            const response = await client.importExternalPlan({
                provider: options.provider,
                projectId: options.projectId,
                intent: options.intent,
                title: options.title,
                planText: payload.planText,
                planJson: payload.planJson,
            });
            let changeContractPayload = null;
            if (options.writeChangeContract !== false && hasPersistedPlanId(response.planId)) {
                const expectedFiles = response.plan.files
                    .filter((file) => file.action !== 'BLOCK')
                    .map((file) => file.path);
                const policyLock = (0, policy_packs_1.readPolicyLockFile)(projectRoot);
                const compiledPolicy = (0, policy_compiler_1.readCompiledPolicyArtifact)(projectRoot);
                const unsignedContract = (0, change_contract_1.createChangeContract)({
                    planId: response.planId,
                    sessionId: response.sessionId || null,
                    projectId: options.projectId || null,
                    intent: options.intent || response.plan.summary || 'imported-plan',
                    expectedFiles,
                    policyLockFingerprint: policyLock.lock?.effective.fingerprint || null,
                    compiledPolicyFingerprint: compiledPolicy.artifact?.fingerprint || null,
                });
                const signedContract = (0, artifact_signature_1.signGovernanceArtifact)(unsignedContract, (0, artifact_signature_1.resolveGovernanceArtifactSigningConfigFromEnv)());
                const contractPath = (0, change_contract_1.writeChangeContract)(projectRoot, signedContract);
                changeContractPayload = {
                    id: signedContract.contractId,
                    path: contractPath,
                };
            }
            if (hasPersistedPlanId(response.planId)) {
                (0, state_1.setActivePlanId)(response.planId);
                (0, state_1.setLastPlanGeneratedAt)(new Date().toISOString());
            }
            if (response.sessionId && typeof response.sessionId === 'string') {
                (0, state_1.setSessionId)(response.sessionId);
            }
            if (options.json) {
                emitJson({
                    success: true,
                    provider: response.provider,
                    planId: response.planId,
                    sessionId: response.sessionId || null,
                    projectId: options.projectId || null,
                    parseMode: response.parseMode,
                    importedFiles: response.importedFiles,
                    sourcePath: payload.sourcePath || null,
                    autoDetect: payload.autoDetect || null,
                    warnings: response.warnings || [],
                    changeContract: changeContractPayload,
                    message: response.message,
                    timestamp: response.timestamp,
                    plan: response.plan,
                });
                return;
            }
            console.log(chalk.bold.cyan('\n📥 Neurcode Contract Import\n'));
            if (payload.source === 'agent_auto') {
                console.log(chalk.dim('Import source: auto-detected agent artifact'));
                if (payload.sourcePath) {
                    console.log(chalk.dim(`Detected file: ${payload.sourcePath}`));
                }
                if (payload.autoDetect) {
                    console.log(chalk.dim(`Candidates scanned: ${payload.autoDetect.candidateCount} ` +
                        `(showing top ${payload.autoDetect.candidates.length})`));
                    if (payload.autoDetect.confirmRequired) {
                        console.log(chalk.dim(`Selection confirmed: ${payload.autoDetect.confirmed ? 'yes' : 'no'}`));
                    }
                }
            }
            else if (payload.source === 'file' && payload.sourcePath) {
                console.log(chalk.dim(`Import source file: ${payload.sourcePath}`));
            }
            console.log(chalk.dim(`Provider: ${response.provider}`));
            console.log(chalk.dim(`Parse mode: ${response.parseMode}`));
            console.log(chalk.dim(`Imported files: ${response.importedFiles}`));
            if (response.planId) {
                console.log(chalk.green(`Plan ID: ${response.planId}`));
            }
            if (response.sessionId) {
                console.log(chalk.dim(`Session ID: ${response.sessionId}`));
            }
            if (changeContractPayload) {
                console.log(chalk.dim(`Change contract: ${changeContractPayload.path}`));
            }
            if ((response.warnings || []).length > 0) {
                console.log(chalk.yellow('\nWarnings:'));
                for (const warning of response.warnings) {
                    console.log(chalk.yellow(`  • ${warning}`));
                }
            }
            console.log(chalk.green(`\n✅ ${response.message}`));
            console.log(chalk.dim(`Completed in ${Date.now() - startedAt}ms\n`));
            console.log(chalk.dim('Next: run `neurcode verify --record --enforce-change-contract`'));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (options.json) {
                emitJson({
                    success: false,
                    provider: options.provider || null,
                    planId: null,
                    sessionId: null,
                    projectId: options.projectId || null,
                    parseMode: null,
                    importedFiles: 0,
                    sourcePath: null,
                    autoDetect: null,
                    warnings: [],
                    changeContract: null,
                    message,
                    timestamp: new Date().toISOString(),
                });
                process.exit(1);
            }
            console.error(chalk.red(`\n❌ Contract import failed: ${message}\n`));
            console.log(chalk.dim('Provide one of: --text, --input <path>, --auto-detect, or --stdin'));
            console.log(chalk.dim('Examples:'));
            console.log(chalk.dim('  neurcode contract import --provider claude --input ./plan.md'));
            console.log(chalk.dim('  neurcode contract import --provider claude --auto-detect'));
            console.log(chalk.dim('  neurcode contract import --provider codex --auto-detect --list-candidates'));
            console.log(chalk.dim('  neurcode contract import --provider codex --auto-detect --no-confirm'));
            console.log(chalk.dim('  cat plan.json | neurcode contract import --provider cursor --stdin\n'));
            process.exit(1);
        }
    });
}
//# sourceMappingURL=contract.js.map