"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startIntentCommand = startIntentCommand;
const cli_json_1 = require("../utils/cli-json");
const config_1 = require("../config");
const project_root_1 = require("../utils/project-root");
const plan_sync_1 = require("../utils/plan-sync");
const session_continuity_1 = require("../utils/session-continuity");
const context_engine_1 = require("../context-engine");
const intent_contract_diagnostics_1 = require("../utils/intent-contract-diagnostics");
const chalk = (0, cli_json_1.loadChalk)();
function startIntentCommand(intentInput, options = {}) {
    const intent = intentInput.trim();
    if (!intent) {
        const message = 'Intent is required. Usage: neurcode start "<intent>"';
        if (options.json) {
            console.log(JSON.stringify({
                success: false,
                message,
            }, null, 2));
            process.exit(1);
            return;
        }
        console.error(chalk.red(`\n❌ ${message}\n`));
        process.exit(1);
        return;
    }
    const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const initialized = (0, plan_sync_1.initializeLocalPlanFromIntent)(projectRoot, intent);
    const config = (0, config_1.loadConfig)();
    const contextAnalysis = (0, context_engine_1.analyzeContext)(projectRoot, intent);
    const contextFiles = contextAnalysis.suggestedFiles.filter((f) => !initialized.expectedFiles.includes(f));
    const shouldReplaceGenericFallback = initialized.detectedSignals.length === 0
        && contextAnalysis.suggestedFiles.length > 0
        && initialized.expectedFiles.length === 1
        && initialized.expectedFiles[0] === 'src/core/index.ts';
    const syncedPlan = shouldReplaceGenericFallback
        ? (0, plan_sync_1.replaceExpectedFilesInLocalPlan)(projectRoot, contextAnalysis.suggestedFiles)
        : contextFiles.length > 0
            ? (0, plan_sync_1.addExpectedFilesToLocalPlan)(projectRoot, contextFiles)
            : initialized;
    const allExpectedFiles = syncedPlan.expectedFiles;
    const sessionArtifacts = (0, session_continuity_1.createLocalIntentSession)({
        projectRoot,
        orgId: config.orgId || null,
        projectId: config.projectId || null,
        intent,
        detectedSignals: initialized.detectedSignals,
        expectedFiles: allExpectedFiles,
        constraints: initialized.constraints,
        contextAnalysis,
    });
    const contractDiagnostics = (0, intent_contract_diagnostics_1.evaluateIntentContractDiagnostics)({
        projectRoot,
        intentPack: sessionArtifacts.intentPack,
        contextPack: sessionArtifacts.contextPack,
        repositoryGraph: sessionArtifacts.repositoryGraph,
    });
    if (options.json) {
        const nextSteps = [
            'Run `neurcode verify --evidence` after making scoped changes',
            'Inspect replay or findings if the governance verdict fails',
            'Use `neurcode remediate-export --finding-index 0` to hand off bounded remediation context',
        ];
        console.log(JSON.stringify({
            success: true,
            intent: initialized.intent,
            detectedSignals: initialized.detectedSignals,
            expectedFiles: allExpectedFiles,
            constraints: initialized.constraints,
            planPath: syncedPlan.path,
            intentPackId: sessionArtifacts.intentPack.intentPackId,
            contextPackId: sessionArtifacts.contextPack.contextPackId,
            repositoryGraphId: sessionArtifacts.repositoryGraph.graphId,
            localSessionId: sessionArtifacts.sessionRuntime.sessionId,
            artifactPaths: sessionArtifacts.activePaths,
            sessionSnapshotPath: sessionArtifacts.sessionDir,
            contractDiagnostics,
            createdAt: syncedPlan.createdAt,
            lastUpdated: syncedPlan.lastUpdated,
            contextEngine: {
                suggestedFiles: contextAnalysis.suggestedFiles,
                confidence: contextAnalysis.confidence,
            },
            nextSteps,
            message: 'Neurcode intent-based plan initialized.',
        }, null, 2));
        return;
    }
    console.log(chalk.bold('\nNeurcode Plan Initialization'));
    console.log(`Detected intent: ${initialized.intent}`);
    if (initialized.detectedSignals.length > 0) {
        console.log(`Detected areas: ${initialized.detectedSignals.join(', ')}`);
    }
    else {
        console.log('Detected areas: general');
    }
    console.log(chalk.bold('\nInitial expected files:'));
    allExpectedFiles.forEach((file) => {
        console.log(`  - ${file}`);
    });
    if (contextAnalysis.suggestedFiles.length > 0) {
        console.log(chalk.bold('\nSuggested files based on your codebase:'));
        contextAnalysis.suggestedFiles.forEach((file) => {
            console.log(`  * ${file}`);
        });
        console.log(chalk.dim(`Confidence: ${contextAnalysis.confidence}`));
    }
    console.log(chalk.dim(`\nPlan saved: ${syncedPlan.path}`));
    console.log(chalk.dim(`Intent pack: ${sessionArtifacts.activePaths.intentPack}`));
    console.log(chalk.dim(`Context pack: ${sessionArtifacts.activePaths.contextPack}`));
    console.log(chalk.dim(`Repo graph: ${sessionArtifacts.activePaths.repositoryGraph}`));
    console.log(chalk.dim(`Invariant memory: ${sessionArtifacts.activePaths.invariantMemory}`));
    console.log(chalk.dim(`Local session: ${sessionArtifacts.sessionRuntime.sessionId}`));
    if (contractDiagnostics.length > 0) {
        console.log(chalk.bold('\nIntent contract diagnostics:'));
        contractDiagnostics.slice(0, 5).forEach((warning) => {
            console.log(chalk.yellow(`  - ${warning}`));
        });
        if (contractDiagnostics.length > 5) {
            console.log(chalk.yellow(`  - ${contractDiagnostics.length - 5} additional diagnostic(s) omitted from console output.`));
        }
    }
    console.log(chalk.green('✅ Plan initialized. Plan Sync will keep expected files updated.'));
    console.log(chalk.bold('\nNext steps:'));
    console.log('1. Make the bounded code changes for this intent');
    console.log('2. Run `neurcode verify --evidence`');
    console.log('3. If findings remain, use `neurcode remediate-export --finding-index 0`\n');
}
//# sourceMappingURL=start-intent.js.map