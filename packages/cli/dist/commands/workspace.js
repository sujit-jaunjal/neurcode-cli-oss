"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceCommand = workspaceCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const workspace_runtime_1 = require("../utils/workspace-runtime");
function asPrettyJson(value) {
    return JSON.stringify(value, null, 2);
}
function collectStrings(value, current) {
    return [...current, value];
}
function parseJsonRecord(value, label) {
    let parsed;
    try {
        parsed = JSON.parse(value);
    }
    catch {
        throw new Error(`Invalid JSON for ${label}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Expected JSON object for ${label}`);
    }
    return parsed;
}
function toExecutionSource(value) {
    const normalized = (value || '').trim().toLowerCase();
    if (normalized === 'cli'
        || normalized === 'daemon'
        || normalized === 'dashboard'
        || normalized === 'vscode'
        || normalized === 'ci'
        || normalized === 'mcp'
        || normalized === 'cursor'
        || normalized === 'api') {
        return normalized;
    }
    return 'unknown';
}
const WORKSPACE_ACTION_TYPES = [
    'verify',
    'fix',
    'patch',
    'apply-safe',
    'reverify',
    'policy-sync',
    'intent-update',
];
function isWorkspaceActionType(value) {
    return WORKSPACE_ACTION_TYPES.includes(value);
}
function parseWorkspacePatchInput(options) {
    const parseRecord = (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('Workspace patch must be a JSON object');
        }
        const source = value;
        const patch = {};
        if (typeof source.name === 'string')
            patch.name = source.name;
        if (source.description === null || typeof source.description === 'string')
            patch.description = source.description;
        if (Array.isArray(source.repositories))
            patch.repositories = source.repositories;
        if (source.governance && typeof source.governance === 'object' && !Array.isArray(source.governance)) {
            patch.governance = source.governance;
        }
        if (source.access && typeof source.access === 'object' && !Array.isArray(source.access)) {
            patch.access = source.access;
        }
        if (Object.keys(patch).length === 0) {
            throw new Error('Patch did not include updatable fields (name, description, repositories, governance, access).');
        }
        return patch;
    };
    if (options.patchFile) {
        const raw = (0, fs_1.readFileSync)((0, path_1.resolve)(options.patchFile), 'utf-8');
        return parseRecord(JSON.parse(raw));
    }
    if (options.patch) {
        return parseRecord(JSON.parse(options.patch));
    }
    throw new Error('Missing patch input. Provide --patch <json> or --patch-file <path>.');
}
function parseWorkspaceRepositories(options) {
    const repositories = [];
    for (const entry of options.repo) {
        repositories.push(parseJsonRecord(entry, '--repo'));
    }
    if (options.reposFile) {
        const raw = (0, fs_1.readFileSync)((0, path_1.resolve)(options.reposFile), 'utf-8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            throw new Error('Expected array in --repos-file JSON');
        }
        for (const item of parsed) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                throw new Error('Each repository in --repos-file must be a JSON object');
            }
            repositories.push(item);
        }
    }
    return repositories;
}
function workspaceCommand(program) {
    const root = program
        .command('workspace')
        .description('Deterministic multi-repository workspace governance orchestration');
    root
        .command('list')
        .description('List configured governance workspaces')
        .option('--json', 'Output JSON')
        .action((options) => {
        const items = (0, workspace_runtime_1.listWorkspaces)(process.cwd());
        if (options.json === true) {
            console.log(asPrettyJson({
                schemaVersion: 'neurcode.workspace.list.v1',
                count: items.length,
                items,
            }));
            return;
        }
        if (items.length === 0) {
            console.log('\nNo workspaces configured yet.\n');
            console.log('Create one with:');
            console.log('  neurcode workspace create --name "My Workspace"\n');
            return;
        }
        console.log('\nGovernance Workspaces\n');
        for (const workspace of items) {
            const target = workspace.posture.targetRisk;
            const enforcement = workspace.posture.enforcement;
            console.log(`- ${workspace.name} (${workspace.id}) · repos ${workspace.repositoryCount}/${workspace.enabledRepositoryCount} enabled · target ${target} · ${enforcement}`);
        }
        console.log('');
    });
    root
        .command('show [workspaceId]')
        .description('Show workspace runtime posture, cross-repo health matrix, hotspots, and runtime activity')
        .option('--actor <actor>', 'Actor for role resolution')
        .option('--json', 'Output JSON')
        .action((workspaceId, options) => {
        const snapshot = (0, workspace_runtime_1.getWorkspaceRuntimeSnapshot)({
            cwd: process.cwd(),
            workspaceId: workspaceId || undefined,
            actor: typeof options.actor === 'string' ? options.actor : undefined,
        });
        if (options.json === true) {
            console.log(asPrettyJson(snapshot));
            return;
        }
        if (!snapshot.workspace) {
            console.log('\nNo active workspace found.\n');
            console.log('Create one with:');
            console.log('  neurcode workspace create --name "My Workspace"\n');
            return;
        }
        const posture = snapshot.posture;
        console.log(`\nWorkspace Runtime · ${snapshot.workspace.name} (${snapshot.workspace.id})\n`);
        console.log(`Role: ${snapshot.activeWorkspaceRole}`);
        if (posture) {
            console.log(`Risk: ${posture.overallRiskLevel} (${posture.overallRiskScore})`);
            console.log(`Pass rate: ${posture.passRate}%  |  Block rate: ${posture.blockRate}%`);
            if (typeof posture.averageCoverageScore === 'number') {
                console.log(`Coverage score: ${posture.averageCoverageScore}`);
            }
        }
        console.log(`Repositories: ${snapshot.repositoryHealthMatrix.length}`);
        console.log(`Hotspots: files ${snapshot.hotspots.files.length}, policies ${snapshot.hotspots.policies.length}, directories ${snapshot.hotspots.directories.length}`);
        console.log(`Runtime events tracked: ${snapshot.runtimeActivity.recentEvents.length}`);
        console.log('');
    });
    root
        .command('create')
        .description('Create workspace model with repository topology and governance posture defaults')
        .requiredOption('--name <name>', 'Workspace display name')
        .option('--id <id>', 'Optional workspace id slug')
        .option('--description <text>', 'Optional workspace description')
        .option('--repo <json>', 'Repository JSON object; repeatable', collectStrings, [])
        .option('--repos-file <path>', 'Path to JSON file containing repository object array')
        .option('--set-active', 'Set new workspace as active workspace', true)
        .option('--no-set-active', 'Do not set newly created workspace active')
        .option('--source <source>', 'Execution source attribution', 'cli')
        .option('--actor <actor>', 'Execution actor attribution')
        .option('--json', 'Output JSON')
        .action((options) => {
        try {
            const repositories = parseWorkspaceRepositories({
                repo: options.repo || [],
                reposFile: options.reposFile,
            });
            if (repositories.length === 0) {
                repositories.push({
                    name: (0, path_1.basename)(process.cwd()),
                    rootPath: '.',
                    enabled: true,
                });
            }
            const result = (0, workspace_runtime_1.createWorkspace)({
                id: options.id,
                name: options.name,
                description: options.description || null,
                repositories: repositories,
            }, {
                cwd: process.cwd(),
                source: toExecutionSource(options.source),
                actor: options.actor,
                setActive: options.setActive !== false,
            });
            if (options.json === true) {
                console.log(asPrettyJson({
                    schemaVersion: 'neurcode.workspace.create.v1',
                    executionId: result.executionId,
                    workspace: result.workspace,
                }));
                return;
            }
            console.log(`\n✅ Workspace created: ${result.workspace.name} (${result.workspace.id})`);
            console.log(`Execution: ${result.executionId}`);
            console.log(`Repositories: ${result.workspace.repositories.length}`);
            console.log('');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ ${message}`);
            process.exit(1);
        }
    });
    root
        .command('activate <workspaceId>')
        .description('Set active workspace context for CLI, daemon, and dashboard runtime views')
        .option('--source <source>', 'Execution source attribution', 'cli')
        .option('--actor <actor>', 'Execution actor attribution')
        .option('--json', 'Output JSON')
        .action((workspaceId, options) => {
        try {
            const result = (0, workspace_runtime_1.setActiveWorkspace)(workspaceId, {
                cwd: process.cwd(),
                source: toExecutionSource(options.source),
                actor: options.actor,
            });
            if (options.json === true) {
                console.log(asPrettyJson({
                    schemaVersion: 'neurcode.workspace.activate.v1',
                    executionId: result.executionId,
                    workspace: result.workspace,
                }));
                return;
            }
            console.log(`\n✅ Active workspace: ${result.workspace.name} (${result.workspace.id})`);
            console.log(`Execution: ${result.executionId}\n`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ ${message}`);
            process.exit(1);
        }
    });
    root
        .command('add-repo <workspaceId>')
        .description('Add repository/service node to workspace topology')
        .requiredOption('--name <name>', 'Repository display name')
        .requiredOption('--path <path>', 'Repository root path relative to workspace root')
        .option('--id <id>', 'Optional repository id slug')
        .option('--service <name>', 'Service name (repeatable)', collectStrings, [])
        .option('--policy-domain <domain>', 'Policy domain identifier')
        .option('--tag <tag>', 'Repository tag (repeatable)', collectStrings, [])
        .option('--disabled', 'Add repository in disabled state')
        .option('--source <source>', 'Execution source attribution', 'cli')
        .option('--actor <actor>', 'Execution actor attribution')
        .option('--json', 'Output JSON')
        .action((workspaceId, options) => {
        try {
            const result = (0, workspace_runtime_1.addWorkspaceRepository)(workspaceId, {
                id: options.id,
                name: options.name,
                rootPath: options.path,
                services: options.service,
                policyDomain: options.policyDomain ?? null,
                tags: options.tag,
                enabled: options.disabled ? false : true,
            }, {
                cwd: process.cwd(),
                source: toExecutionSource(options.source),
                actor: options.actor,
            });
            if (options.json === true) {
                console.log(asPrettyJson({
                    schemaVersion: 'neurcode.workspace.add-repo.v1',
                    executionId: result.executionId,
                    workspace: result.workspace,
                }));
                return;
            }
            console.log(`\n✅ Added repository to workspace ${result.workspace.id}`);
            console.log(`Execution: ${result.executionId}`);
            console.log(`Repository count: ${result.workspace.repositories.length}\n`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ ${message}`);
            process.exit(1);
        }
    });
    root
        .command('update <workspaceId>')
        .description('Apply deterministic workspace definition patch')
        .option('--patch <json>', 'Inline JSON patch object')
        .option('--patch-file <path>', 'Path to JSON patch file')
        .option('--source <source>', 'Execution source attribution', 'cli')
        .option('--actor <actor>', 'Execution actor attribution')
        .option('--json', 'Output JSON')
        .action((workspaceId, options) => {
        try {
            const patch = parseWorkspacePatchInput({
                patch: options.patch,
                patchFile: options.patchFile,
            });
            const result = (0, workspace_runtime_1.updateWorkspace)(workspaceId, patch, {
                cwd: process.cwd(),
                source: toExecutionSource(options.source),
                actor: options.actor,
            });
            if (options.json === true) {
                console.log(asPrettyJson({
                    schemaVersion: 'neurcode.workspace.update.v1',
                    executionId: result.executionId,
                    workspace: result.workspace,
                }));
                return;
            }
            console.log(`\n✅ Workspace updated: ${result.workspace.name} (${result.workspace.id})`);
            console.log(`Execution: ${result.executionId}\n`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ ${message}`);
            process.exit(1);
        }
    });
    root
        .command('execute <type>')
        .description('Run deterministic workspace-scoped governance action across one or more repositories')
        .option('--workspace <workspaceId>', 'Workspace id (defaults to active workspace)')
        .option('--repository <repoId>', 'Repository id (repeatable)', collectStrings, [])
        .option('--target <target>', 'Target path for patch / action types requiring a target')
        .option('--intent <text>', 'Intent text for intent-update execution type')
        .option('--source <source>', 'Execution source attribution', 'cli')
        .option('--actor <actor>', 'Execution actor attribution')
        .option('--ci', 'Run in CI-safe deterministic mode')
        .option('--evidence-dir <path>', 'Override evidence artifact directory')
        .option('--dedupe-window-ms <ms>', 'Duplicate suppression window override', (value) => Number.parseInt(value, 10))
        .option('--no-reverify', 'Skip deterministic post-action reverify')
        .option('--json', 'Output JSON')
        .action(async (type, options) => {
        if (!isWorkspaceActionType(type)) {
            console.error(`❌ Unsupported workspace execution type: ${type}`);
            console.error(`   Supported: ${WORKSPACE_ACTION_TYPES.join(', ')}`);
            process.exit(1);
        }
        const request = {
            workspaceId: options.workspace,
            repositoryIds: options.repository,
            type,
            source: toExecutionSource(options.source),
            actor: options.actor,
            target: options.target ?? null,
            intentText: options.intent ?? null,
            reverify: options.reverify !== false,
            ciMode: options.ci === true,
            evidenceDir: options.evidenceDir,
            dedupeWindowMs: Number.isFinite(options.dedupeWindowMs) ? options.dedupeWindowMs : undefined,
        };
        try {
            const result = await (0, workspace_runtime_1.executeWorkspaceAction)(request, {
                cwd: process.cwd(),
            });
            if (options.json === true) {
                console.log(asPrettyJson({
                    schemaVersion: 'neurcode.workspace.execute.v1',
                    ...result,
                }));
                process.exit(result.totals.failed > 0 ? 1 : 0);
            }
            console.log(`\nWorkspace execution ${result.type}`);
            console.log(`Workspace: ${result.workspaceName} (${result.workspaceId})`);
            console.log(`Execution: ${result.executionId}`);
            console.log(`Source: ${result.source} (${result.actor})`);
            console.log(`Results: ${result.totals.succeeded}/${result.totals.attempted} succeeded ` +
                `(${result.totals.failed} failed)`);
            for (const item of result.items) {
                const status = item.ok ? '✅' : '❌';
                const executionId = item.execution?.id ? ` · ${item.execution.id}` : '';
                const error = item.error ? ` · ${item.error}` : '';
                console.log(`  ${status} ${item.repositoryName} (${item.repositoryId})${executionId}${error}`);
            }
            console.log('');
            process.exit(result.totals.failed > 0 ? 1 : 0);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ ${message}`);
            process.exit(1);
        }
    });
}
//# sourceMappingURL=workspace.js.map