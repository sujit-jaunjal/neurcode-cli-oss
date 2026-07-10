"use strict";
/**
 * Init Command - Multi-Tenancy Project Linker
 *
 * Binds a local folder to a specific Organization + Project on the backend.
 *
 * Flow:
 * 1. Auth check - ensure user is logged in
 * 2. Fetch user's organizations via API
 * 3. Interactive org selection
 * 4. Link to existing project or create new
 * 5. Save .neurcode/config.json with orgId + projectId
 * 6. Success summary
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCommand = initCommand;
const path_1 = require("path");
const config_1 = require("../config");
const api_client_1 = require("../api-client");
const state_1 = require("../utils/state");
const activation_telemetry_1 = require("../utils/activation-telemetry");
const activation_proof_1 = require("../utils/activation-proof");
const readline = __importStar(require("readline"));
const messages_1 = require("../utils/messages");
// Import chalk with fallback
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (str) => str,
        yellow: (str) => str,
        red: (str) => str,
        bold: (str) => str,
        dim: (str) => str,
        cyan: (str) => str,
        white: (str) => str,
        blue: (str) => str,
        magenta: (str) => str,
        gray: (str) => str,
    };
}
/**
 * Get user input from terminal
 */
function promptUser(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
/**
 * Display numbered options and get user selection
 */
async function selectOption(title, options) {
    console.log(chalk.bold.white(`\n${title}\n`));
    options.forEach((opt, index) => {
        console.log(chalk.cyan(`  ${index + 1}.`), chalk.white(opt.label));
    });
    console.log('');
    const answer = await promptUser(chalk.bold(`Select option (1-${options.length}): `));
    const choice = parseInt(answer, 10);
    if (choice >= 1 && choice <= options.length) {
        return options[choice - 1].value;
    }
    // Default to first option
    (0, messages_1.printWarning)('Invalid selection', `Defaulting to option 1: ${options[0].label}`);
    return options[0].value;
}
/**
 * Reset local state for re-linking
 */
function resetLocalState() {
    (0, state_1.saveState)({
        projectId: undefined,
        orgId: undefined,
        orgName: undefined,
        workspaceType: undefined,
        workspaceRole: undefined,
        linkedAt: undefined,
        sessionId: undefined,
        activePlanId: undefined,
        lastPlanId: undefined,
        activeSessionId: undefined,
        lastPlanGeneratedAt: undefined,
    });
}
/**
 * Print a concise operational summary.
 */
function printOperationalSummary(title, lines) {
    console.log('');
    console.log(chalk.bold.white(title));
    console.log(chalk.dim('-'.repeat(Math.max(48, title.length))));
    lines.forEach((line) => console.log(chalk.dim(`  ${line}`)));
    console.log('');
}
function workspaceKind(org) {
    return org.isPersonal ? 'personal' : 'organization';
}
function workspaceLabel(org) {
    return `${org.name} (${org.isPersonal ? 'Personal workspace' : 'Organization workspace'} · ${org.role})`;
}
async function publishRepoConnectProof(input) {
    const proof = (0, activation_proof_1.buildRepoConnectActivationProof)({
        projectId: input.projectId,
        commandFamily: 'repo_connect',
        reasonCode: 'repo_connect.completed',
    });
    if (input.queueOnly) {
        (0, activation_proof_1.queueFirstValueActivationProof)({
            proof,
            orgId: input.orgId,
            apiUrl: input.apiUrl,
            reasonCode: 'proof.queued.no_matching_workspace_credential',
        });
        return 'queued';
    }
    const result = await (0, activation_proof_1.submitFirstValueActivationProof)({
        proof,
        orgId: input.orgId,
        apiUrl: input.apiUrl,
        apiKey: input.apiKey,
    });
    if (result.synced)
        return 'synced';
    if (result.queued)
        return 'queued';
    return 'not_synced';
}
function printRepoProofSyncStatus(status) {
    (0, messages_1.printSuccess)('Repo connected locally', '.neurcode/config.json now records this workspace/project ownership.');
    if (status === 'synced') {
        (0, messages_1.printSuccess)('Cloud proof synced', 'The dashboard First Value page can use authenticated repo-connect proof.');
    }
    else if (status === 'queued') {
        (0, messages_1.printWarning)('Cloud proof queued', 'Run `neurcode sync --activation` when connectivity or workspace login is ready.');
    }
    else {
        (0, messages_1.printWarning)('Cloud proof not synced', 'Run `neurcode sync --activation` or `neurcode repo connect --status` for the next step.');
    }
}
async function initCommand(options) {
    try {
        (0, activation_telemetry_1.trackActivationEvent)({
            eventType: 'repo_connect_started',
            commandFamily: 'init',
            reasonCode: 'repo_connect.started',
        });
        let config = (0, config_1.loadConfig)();
        const requestedOrgId = options?.orgId?.trim();
        const requestedCreateName = options?.create?.trim() || undefined;
        const requestedProjectId = options?.projectId?.trim();
        const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
        const nonInteractiveMode = Boolean(requestedCreateName || requestedProjectId);
        if (requestedCreateName && requestedProjectId) {
            (0, messages_1.printError)('Conflicting options', 'Use either --create <name> or --project-id <id>, not both.');
            process.exit(1);
        }
        if (requestedOrgId && !isUuid(requestedOrgId)) {
            (0, messages_1.printError)('Invalid organization ID', `Expected internal UUID format. Got: ${requestedOrgId}`);
            process.exit(1);
        }
        if (requestedProjectId && !isUuid(requestedProjectId)) {
            (0, messages_1.printError)('Invalid project ID', `Expected internal UUID format. Got: ${requestedProjectId}`);
            process.exit(1);
        }
        // ─── Step 1: Auth Check ─────────────────────────────────────
        config.apiKey = process.env.NEURCODE_API_KEY || config.apiKey;
        const apiUrl = (config.apiUrl || config_1.DEFAULT_API_URL).replace(/\/$/, '');
        if (!config.apiKey) {
            config.apiKey = process.env.NEURCODE_API_KEY || (0, config_1.getAnyPersistedApiKey)() || undefined;
        }
        if (!config.apiKey) {
            if (process.stdout.isTTY && !process.env.CI) {
                (0, messages_1.printError)('Authentication Required', undefined, [
                    'Please log in before connecting this repository:',
                    '   neurcode login',
                    'Then rerun:',
                    '   neurcode repo connect',
                ]);
                process.exit(1);
            }
            else {
                config.apiKey = (0, config_1.requireApiKey)();
            }
        }
        config.apiUrl = apiUrl;
        // Workspace Discovery must not be pinned to the repo's existing binding:
        // a stale .neurcode/config.json from another account would send its org as
        // x-org-id and turn the membership listing into a guaranteed 403, making
        // relink impossible. Listing the authenticated user's workspaces is
        // inherently cross-org, so this client explicitly disables project-local
        // org-header fallback.
        const client = new api_client_1.ApiClient({ ...config, orgId: undefined, disableOrgHeaderFallback: true });
        const cwd = process.cwd();
        const dirName = (0, path_1.basename)(cwd);
        // Check if already linked
        const existingOrgId = (0, state_1.getOrgId)();
        const existingProjectId = (0, state_1.getProjectId)();
        if (existingOrgId && existingProjectId) {
            const existingOrgName = (0, state_1.getOrgName)() || existingOrgId;
            (0, messages_1.printInfo)('Already Linked', `This directory is linked to organization "${existingOrgName}".`);
            if (nonInteractiveMode && !options?.bindingAction) {
                (0, messages_1.printInfo)('Re-linking', 'Non-interactive init requested. Re-linking to requested project scope.');
                resetLocalState();
            }
            else {
                const strictExistingKey = (0, config_1.getApiKey)(existingOrgId) || undefined;
                const hasOtherCredential = !strictExistingKey && Boolean((0, config_1.getAnyPersistedApiKey)());
                if (hasOtherCredential) {
                    (0, messages_1.printWarning)('Workspace binding may be stale', [
                        `This repo is linked to workspace ${existingOrgName}.`,
                        'The available machine credential is not scoped to that workspace.',
                        'Choose whether to relink to the current authenticated workspace, keep the existing binding, or cancel.',
                    ].join('\n   '));
                }
                const action = options?.bindingAction ?? await selectOption('Repository ownership is already configured. What should happen next?', [
                    { label: 'Re-link to the current workspace/project', value: 'relink' },
                    { label: 'Keep existing local workspace/project', value: 'keep' },
                    { label: 'Cancel without changes', value: 'cancel' },
                ]);
                if (action === 'keep') {
                    printOperationalSummary('Current repo ownership', [
                        `Workspace:  ${existingOrgName}`,
                        `Workspace ID: ${existingOrgId}`,
                        `Project ID:   ${existingProjectId}`,
                    ]);
                    const proofStatus = await publishRepoConnectProof({
                        orgId: existingOrgId,
                        projectId: existingProjectId,
                        apiUrl,
                        apiKey: strictExistingKey || null,
                        queueOnly: !strictExistingKey,
                    });
                    printRepoProofSyncStatus(proofStatus);
                    return;
                }
                else if (action === 'cancel') {
                    (0, messages_1.printInfo)('No Changes', 'Project link unchanged.');
                    return;
                }
                // Re-link: reset state
                resetLocalState();
            }
        }
        // ─── Step 2: Fetch Organizations ────────────────────────────
        (0, messages_1.printSection)('Workspace Discovery');
        (0, messages_1.printInfo)('Fetching', 'Retrieving workspaces available to your authenticated user...');
        let organizations;
        try {
            organizations = await client.getUserOrganizations();
        }
        catch (error) {
            (0, messages_1.printError)('Could Not Fetch Organizations', error, [
                'Check your internet connection',
                'Verify authentication: neurcode doctor',
                'Try running: neurcode login',
            ]);
            process.exit(1);
            return; // TypeScript flow analysis
        }
        if (organizations.length === 0) {
            (0, messages_1.printError)('No Workspaces Found', undefined, [
                'Create a workspace in the Neurcode dashboard',
                'Or ask an administrator to add you to the organization workspace',
            ]);
            process.exit(1);
        }
        // ─── Step 3: Organization Selection ─────────────────────────
        let selectedOrg;
        if (requestedOrgId) {
            const matchedOrg = organizations.find((org) => org.id === requestedOrgId);
            if (!matchedOrg) {
                (0, messages_1.printError)('Organization not available', undefined, [
                    `The provided --org ID is not in your memberships: ${requestedOrgId}`,
                    'Run "neurcode init" without --org to choose interactively',
                    'Or run "neurcode whoami" to verify your current scope',
                ]);
                process.exit(1);
            }
            selectedOrg = matchedOrg;
            (0, messages_1.printSuccess)('Workspace Selected', `${workspaceLabel(selectedOrg)} (from --org)`);
        }
        else if (organizations.length === 1) {
            selectedOrg = organizations[0];
            (0, messages_1.printSuccess)('Workspace Selected', `Auto-selected: ${workspaceLabel(selectedOrg)}`);
        }
        else {
            if (nonInteractiveMode) {
                (0, messages_1.printError)('Organization selection required', undefined, [
                    'Multiple organizations are available.',
                    'Provide --org <id> when using non-interactive init flags.',
                ]);
                process.exit(1);
            }
            const orgOptions = organizations.map(org => ({
                label: workspaceLabel(org),
                value: org,
            }));
            selectedOrg = await selectOption('Select the governance workspace that owns this repository', orgOptions);
        }
        // Ensure we use a credential scoped to the selected workspace before any project operations.
        // This avoids linking a folder to org B while creating/fetching projects in org A.
        const envApiKey = process.env.NEURCODE_API_KEY || undefined;
        const strictOrgApiKey = (0, config_1.getApiKey)(selectedOrg.id) || undefined;
        const fallbackApiKey = config.apiKey || (0, config_1.getAnyPersistedApiKey)() || undefined;
        let shouldBackfillSelectedOrgKey = false;
        let selectedOrgApiKey = envApiKey || strictOrgApiKey || undefined;
        if (!selectedOrgApiKey && fallbackApiKey) {
            selectedOrgApiKey = fallbackApiKey;
            shouldBackfillSelectedOrgKey = true;
        }
        if (!selectedOrgApiKey) {
            (0, messages_1.printError)('Missing workspace runtime connection', undefined, [
                'Your machine is logged in, but no usable runtime credential was found for this workspace.',
                `Run: neurcode login --org ${selectedOrg.id}`,
                'Then rerun: neurcode repo connect',
            ]);
            process.exit(1);
        }
        const scopedClient = new api_client_1.ApiClient({
            ...config,
            apiKey: selectedOrgApiKey,
            orgId: selectedOrg.id,
        });
        // ─── Step 4: Project Setup ──────────────────────────────────
        (0, messages_1.printSection)('Repo Ownership');
        let project = null;
        let projectAction = null;
        if (requestedProjectId) {
            projectAction = 'existing';
        }
        else if (requestedCreateName) {
            projectAction = 'new';
        }
        else {
            projectAction = await selectOption('Attach this repository to an ownership record', [
                { label: 'Link to an existing project in this workspace', value: 'existing' },
                { label: 'Create a new project ownership record', value: 'new' },
            ]);
        }
        if (projectAction === 'existing' && requestedProjectId) {
            (0, messages_1.printInfo)('Fetching Projects', `Looking up project ${requestedProjectId}...`);
            try {
                const projects = await scopedClient.getProjects();
                const matched = projects.find((p) => p.id === requestedProjectId);
                if (!matched) {
                    (0, messages_1.printError)('Project not available', undefined, [
                        `Project ID not found in "${selectedOrg.name}": ${requestedProjectId}`,
                        'Run "neurcode init" without --project-id to choose interactively.',
                    ]);
                    process.exit(1);
                }
                project = matched;
                (0, messages_1.printSuccess)('Project Selected', `${project.name} (from --project-id)`);
            }
            catch (error) {
                (0, messages_1.printError)('Could Not Fetch Projects', error, [
                    'Check your internet connection',
                    'Verify authentication: neurcode doctor',
                ]);
                process.exit(1);
            }
        }
        else if (projectAction === 'existing') {
            // Fetch existing projects
            (0, messages_1.printInfo)('Fetching Projects', 'Looking for existing projects...');
            try {
                const projects = await scopedClient.getProjects();
                if (projects.length === 0) {
                    (0, messages_1.printWarning)('No Projects Found', 'Creating a new project instead.');
                }
                else {
                    const projectOptions = projects.map(p => ({
                        label: `${p.name} ${p.git_url ? chalk.dim(`(${p.git_url})`) : ''}`,
                        value: p,
                    }));
                    project = await selectOption('Select a project:', projectOptions);
                }
            }
            catch (error) {
                (0, messages_1.printWarning)('Could Not Fetch Projects', 'Creating a new project instead.');
            }
        }
        if (!project) {
            // Create new project
            let name = requestedCreateName || '';
            if (!name) {
                const projectName = await promptUser(chalk.bold(`\n   Project name (default: ${dirName}): `));
                name = projectName || dirName;
            }
            (0, messages_1.printInfo)('Creating Project', `Setting up "${name}"...`);
            try {
                const newProject = await scopedClient.ensureProject('', name);
                project = {
                    id: newProject.id,
                    name: newProject.name,
                    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    git_url: null,
                };
            }
            catch (error) {
                (0, messages_1.printError)('Failed to Create Project', error, [
                    'Check your internet connection',
                    'Try again: neurcode init',
                ]);
                process.exit(1);
            }
        }
        // ─── Step 5: Save Local Config ──────────────────────────────
        (0, state_1.setWorkspaceContext)({
            orgId: selectedOrg.id,
            orgName: selectedOrg.name,
            workspaceType: workspaceKind(selectedOrg),
            workspaceRole: selectedOrg.role,
            projectId: project.id,
        });
        if (shouldBackfillSelectedOrgKey && selectedOrgApiKey) {
            (0, config_1.saveGlobalAuth)(selectedOrgApiKey, apiUrl, selectedOrg.id);
        }
        const proofStatus = await publishRepoConnectProof({
            orgId: selectedOrg.id,
            projectId: project.id,
            apiUrl,
            apiKey: selectedOrgApiKey,
        });
        // ─── Step 6: Success Summary ────────────────────────────────
        printOperationalSummary('Governance ownership activated', [
            `Workspace:    ${selectedOrg.name}`,
            `Type:         ${selectedOrg.isPersonal ? 'Personal workspace' : 'Organization workspace'}`,
            `Role:         ${selectedOrg.role}`,
            `Workspace ID: ${selectedOrg.id}`,
            `Project:      ${project.name}`,
            `Project ID:   ${project.id}`,
            `State file:   .neurcode/config.json`,
            '',
            `Commands in this directory now resolve this repo`,
            `to the selected workspace governance boundary.`,
        ]);
        printRepoProofSyncStatus(proofStatus);
        (0, messages_1.printInfo)('Next steps', [
            'Confirm runtime state: neurcode whoami',
            'Declare change intent: neurcode start "<what you intend to change>"',
            'Run governed verification: neurcode verify --evidence',
            'Inspect continuity: neurcode home',
        ].join('\n   '));
        await (0, activation_telemetry_1.trackActivationEventAndFlush)({
            eventType: 'repo_connect_completed',
            commandFamily: 'init',
            reasonCode: 'repo_connect.completed',
        });
    }
    catch (error) {
        await (0, activation_telemetry_1.trackActivationEventAndFlush)({
            eventType: 'repo_connect_completed',
            commandFamily: 'init',
            reasonCode: 'repo_connect.failed',
            success: false,
        });
        if (error instanceof Error) {
            if (error.message.includes('Authentication') || error.message.includes('401') || error.message.includes('403')) {
                await (0, messages_1.printAuthError)(error);
            }
            else {
                (0, messages_1.printError)('Initialization Failed', error, [
                    'Check your internet connection',
                    'Verify authentication: neurcode doctor',
                    'Try again: neurcode init',
                ]);
            }
        }
        else {
            (0, messages_1.printError)('Initialization Failed', String(error));
        }
        process.exit(1);
    }
}
//# sourceMappingURL=init.js.map