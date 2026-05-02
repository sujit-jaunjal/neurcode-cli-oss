"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCommand = generateCommand;
const project_root_1 = require("../utils/project-root");
const plan_sync_1 = require("../utils/plan-sync");
const context_engine_1 = require("../context-engine");
const cli_json_1 = require("../utils/cli-json");
const proximity_1 = require("../mcp/proximity");
const context_injector_1 = require("../mcp/context-injector");
const chalk = (0, cli_json_1.loadChalk)();
function emitGenerateJson(payload) {
    console.log(JSON.stringify(payload, null, 2));
}
function printSection(title, body) {
    console.log(chalk.bold(`\n--- ${title} ---`));
    console.log(body.trim() ? body : '(empty)');
}
function normalizeRepoPath(value) {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function isStrictScopeModeEnabled(userPrompt) {
    if ((process.env.NEURCODE_MCP_STRICT_SCOPE || '').toLowerCase() === 'true') {
        return true;
    }
    return /\bstrict(\s|-)?(scope|mode)\b|\b--strict-scope\b/i.test(userPrompt);
}
function generateCommand(userPrompt, options = {}) {
    const normalizedPrompt = userPrompt.trim();
    if (!normalizedPrompt) {
        const message = 'Prompt is required. Usage: neurcode generate "<your prompt>"';
        if (options.json) {
            emitGenerateJson({
                success: false,
                projectRoot: process.cwd(),
                originalPrompt: '',
                injectedContext: '',
                finalPrompt: '',
                metadata: {
                    planSource: 'none',
                    planId: null,
                    policySource: 'none',
                    projectTreeEntries: 0,
                    projectTreeTruncated: false,
                    planSync: {
                        updated: false,
                        addedFiles: [],
                    },
                },
                message,
            });
            process.exit(1);
            return;
        }
        console.error(chalk.red(`\n❌ ${message}\n`));
        process.exit(1);
        return;
    }
    const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const plan = (0, context_injector_1.buildPlanContext)(projectRoot, options.planId);
    const policies = (0, context_injector_1.buildPolicyContext)(projectRoot);
    const projectContext = (0, context_injector_1.buildProjectContext)(projectRoot);
    const injectedContext = (0, context_injector_1.buildInjectedContext)({
        userPrompt: normalizedPrompt,
        plan,
        policies,
        projectContext,
    });
    const finalPrompt = (0, context_injector_1.buildGovernedPrompt)({
        userPrompt: normalizedPrompt,
        plan,
        policies,
        projectContext,
    });
    const contextAnalysis = (0, context_engine_1.analyzeContext)(projectRoot, normalizedPrompt);
    const contextSuggestedFiles = contextAnalysis.suggestedFiles.filter((f) => !plan.expectedFiles.some((e) => normalizeRepoPath(e).toLowerCase() === normalizeRepoPath(f).toLowerCase()));
    const mergedExpectedFiles = [...plan.expectedFiles, ...contextSuggestedFiles];
    const requestedFiles = (0, proximity_1.extractRequestedFilePathsFromPrompt)(normalizedPrompt, 3);
    const allowedSet = new Set(mergedExpectedFiles.map((file) => normalizeRepoPath(file).toLowerCase()));
    const requestedOutOfScopeFiles = requestedFiles.filter((file) => !allowedSet.has(normalizeRepoPath(file).toLowerCase()));
    const strictScopeMode = isStrictScopeModeEnabled(normalizedPrompt);
    const planSyncUpdate = (!strictScopeMode && requestedOutOfScopeFiles.length > 0)
        ? (0, plan_sync_1.addExpectedFilesToLocalPlan)(projectRoot, requestedOutOfScopeFiles)
        : null;
    const planSyncUpdated = planSyncUpdate !== null;
    const planSyncAddedFiles = planSyncUpdate?.addedFiles || [];
    if (options.json) {
        emitGenerateJson({
            success: true,
            projectRoot,
            originalPrompt: normalizedPrompt,
            injectedContext,
            finalPrompt,
            metadata: {
                planSource: plan.source,
                planId: plan.planId,
                policySource: policies.source,
                projectTreeEntries: projectContext.treeLines.length,
                projectTreeTruncated: projectContext.truncated,
                planSync: {
                    updated: planSyncUpdated,
                    addedFiles: planSyncAddedFiles,
                },
                contextEngine: {
                    suggestedFiles: contextAnalysis.suggestedFiles,
                    confidence: contextAnalysis.confidence,
                },
            },
            message: 'Governed prompt generated (no LLM call executed).',
        });
        return;
    }
    printSection('Original Prompt', normalizedPrompt);
    printSection('Injected Context', injectedContext);
    printSection('Final Prompt', finalPrompt);
    if (planSyncUpdated) {
        if (planSyncAddedFiles.length > 0) {
            console.log(chalk.dim(`\nPlan Sync updated .neurcode/plan.json with: ${planSyncAddedFiles.join(', ')}`));
        }
        else {
            console.log(chalk.dim('\nPlan Sync refreshed .neurcode/plan.json (files already present).'));
        }
    }
    if (contextAnalysis.suggestedFiles.length > 0) {
        console.log(chalk.bold('\nSuggested files based on your codebase:'));
        contextAnalysis.suggestedFiles.forEach((file) => {
            console.log(`  * ${file}`);
        });
        console.log(chalk.dim(`Confidence: ${contextAnalysis.confidence}`));
    }
    console.log(chalk.dim('\nGoverned prompt prepared locally. No LLM call executed.\n'));
}
//# sourceMappingURL=generate.js.map