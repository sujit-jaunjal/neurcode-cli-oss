"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replayCommand = replayCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const replay_runtime_1 = require("../utils/replay-runtime");
function asPrettyJson(value) {
    return JSON.stringify(value, null, 2);
}
function asOptionsRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return value;
}
function optionEnabled(localOptions, parentOptions, key) {
    const local = asOptionsRecord(localOptions);
    const parent = asOptionsRecord(parentOptions);
    return local[key] === true || parent[key] === true;
}
function optionString(localOptions, parentOptions, key) {
    const local = asOptionsRecord(localOptions);
    const parent = asOptionsRecord(parentOptions);
    if (typeof local[key] === 'string' && local[key].trim().length > 0) {
        return local[key].trim();
    }
    if (typeof parent[key] === 'string' && parent[key].trim().length > 0) {
        return parent[key].trim();
    }
    return undefined;
}
function ensureIso(value) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid timestamp: ${value}`);
    }
    return new Date(parsed).toISOString();
}
function writeDeterministicExport(filePath, payload) {
    const resolved = (0, path_1.resolve)(filePath);
    (0, fs_1.mkdirSync)((0, path_1.dirname)(resolved), { recursive: true });
    (0, fs_1.writeFileSync)(resolved, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
    return resolved;
}
function printStateSummary(state) {
    console.log('\nReplay State\n');
    console.log(`As of: ${state.asOf}`);
    console.log(`Artifact hash: ${state.determinism.artifactHash}`);
    console.log(`Inputs: executions ${state.determinism.inputs.executionRecords}, evidence ${state.determinism.inputs.evidenceArtifacts}, events ${state.determinism.inputs.runtimeEvents}`);
    console.log(`Control plane snapshot: ${state.controlPlane.snapshotId || 'none'}`);
    console.log(`Workspace snapshot: ${state.workspace.snapshotId || 'none'}`);
    console.log(`Posture: pass ${state.posture.passRate}% · block ${state.posture.blockRate}% · regressions ${state.posture.regressionRate}%`);
    console.log(`Blocked executions: ${state.blockedExecutions.length}`);
    console.log(`Hotspots: ${state.hotspots.length}`);
    if (state.determinism.warnings.length > 0) {
        console.log('\nWarnings:');
        for (const warning of state.determinism.warnings) {
            console.log(`- ${warning}`);
        }
    }
    printReconstructionSummary(state.reconstruction);
    console.log('');
}
function printReconstructionSummary(reconstruction) {
    const statusLabel = reconstruction.reconstructionStatus === 'exact'
        ? 'exact'
        : 'bounded-degradation';
    console.log('\nReconstruction Trust');
    console.log(`Status: ${statusLabel}`);
    console.log(`Confidence: ${reconstruction.confidence.overall}/100`);
    console.log(`Components: provenance ${reconstruction.confidence.provenance.score} · ` +
        `graph ${reconstruction.confidence.graph.score} · semantic ${reconstruction.confidence.semantic.score} · ` +
        `federation ${reconstruction.confidence.federation.score} · artifacts ${reconstruction.confidence.artifacts.score}`);
    const sections = [
        { title: 'Missing artifacts', lines: reconstruction.missingArtifactSummaries },
        { title: 'Semantic degradation', lines: reconstruction.semanticDegradationSummaries },
        { title: 'Federation degradation', lines: reconstruction.federationDegradationSummaries },
        { title: 'Graph mismatches', lines: reconstruction.graphMismatchSummaries },
        { title: 'Provenance mismatches', lines: reconstruction.provenanceMismatchSummaries },
        { title: 'Confidence drift', lines: reconstruction.confidenceDriftSummaries },
    ];
    for (const section of sections) {
        if (section.lines.length === 0)
            continue;
        console.log(`${section.title}:`);
        for (const line of section.lines.slice(0, 4)) {
            console.log(`- ${line}`);
        }
    }
}
function printExecutionSummary(detail) {
    const execution = detail.execution;
    console.log('\nExecution Replay\n');
    console.log(`Execution: ${execution.id}`);
    console.log(`Type: ${execution.type}`);
    console.log(`Source: ${execution.source} (${execution.actor})`);
    console.log(`Status: ${execution.status} · success=${execution.success}`);
    console.log(`Created: ${execution.createdAt}`);
    if (execution.completedAt)
        console.log(`Completed: ${execution.completedAt}`);
    console.log(`Trend: ${execution.trend} · blocking ${execution.blocking} · advisory ${execution.advisory}`);
    console.log(`Artifact hash: ${detail.determinism.artifactHash}`);
    console.log(`Runtime events: ${detail.relatedEvents.length}`);
    console.log(`Evidence artifacts: ${detail.relatedEvidence.length}`);
    if (detail.determinism.warnings.length > 0) {
        console.log('\nWarnings:');
        for (const warning of detail.determinism.warnings) {
            console.log(`- ${warning}`);
        }
    }
    printReconstructionSummary(detail.reconstruction);
    console.log('');
}
function printWorkspaceSummary(detail) {
    console.log('\nWorkspace Replay\n');
    console.log(`As of: ${detail.asOf}`);
    console.log(`Workspace: ${detail.workspaceName || 'none'} (${detail.workspaceId || 'n/a'})`);
    console.log(`Snapshot: ${detail.snapshotId || 'none'} · action ${detail.action || 'n/a'}`);
    console.log(`Execution summary: ${detail.executionSummary.succeeded}/${detail.executionSummary.total} succeeded (${detail.executionSummary.failed} failed)`);
    console.log(`Pass ${detail.executionSummary.passRate}% · Block ${detail.executionSummary.blockRate}%`);
    console.log(`Hotspots: ${detail.hotspotSummary.length}`);
    console.log(`Recent events: ${detail.recentEvents.length}`);
    console.log(`Artifact hash: ${detail.determinism.artifactHash}`);
    if (detail.determinism.warnings.length > 0) {
        console.log('\nWarnings:');
        for (const warning of detail.determinism.warnings) {
            console.log(`- ${warning}`);
        }
    }
    printReconstructionSummary(detail.reconstruction);
    console.log('');
}
function printTimelineSummary(result) {
    console.log('\nReplay Timeline\n');
    console.log(`Range: ${result.from || 'beginning'} -> ${result.to || 'latest'}`);
    console.log(`Workspace: ${result.workspaceId || 'all'}`);
    console.log(`Items: ${result.count}`);
    console.log(`Aggregate: executions ${result.aggregate.executions}, evidence ${result.aggregate.evidence}, events ${result.aggregate.runtimeEvents}, control-plane ${result.aggregate.controlPlane}, workspace ${result.aggregate.workspace}`);
    console.log(`Artifact hash: ${result.determinism.artifactHash}`);
    if (result.items.length > 0) {
        console.log('\nRecent items:');
        for (const item of result.items.slice(0, 15)) {
            console.log(`- ${item.timestamp} · ${item.kind} · ${item.summary}`);
        }
    }
    if (result.determinism.warnings.length > 0) {
        console.log('\nWarnings:');
        for (const warning of result.determinism.warnings) {
            console.log(`- ${warning}`);
        }
    }
    console.log('');
}
function replayCommand(program) {
    const root = program
        .command('replay')
        .description('Deterministic replay and change-history reconstruction');
    root
        .option('--at <timestamp>', 'ISO timestamp to reconstruct governance state')
        .option('--workspace <workspaceId>', 'Workspace scope for replay')
        .option('--events', 'Include runtime events in reconstructed state')
        .option('--event-limit <count>', 'Limit included runtime events', (value) => Number.parseInt(value, 10))
        .option('--json', 'Output JSON')
        .option('--export <path>', 'Write deterministic replay output to file')
        .action((options) => {
        try {
            const rootOptions = root.opts();
            const jsonEnabled = optionEnabled(options, rootOptions, 'json');
            const exportPath = optionString(options, rootOptions, 'export');
            const at = options.at ? ensureIso(options.at) : new Date().toISOString();
            const state = (0, replay_runtime_1.replayGovernanceState)({
                at,
                workspaceId: options.workspace || undefined,
                includeEvents: options.events === true,
                eventLimit: Number.isFinite(options.eventLimit) ? options.eventLimit : undefined,
            }, process.cwd());
            if (exportPath) {
                const outputPath = writeDeterministicExport(exportPath, state);
                if (!jsonEnabled) {
                    console.log(`\nReplay export written: ${outputPath}\n`);
                }
            }
            if (jsonEnabled) {
                console.log(asPrettyJson(state));
                return;
            }
            printStateSummary(state);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ ${message}`);
            process.exit(1);
        }
    });
    root
        .command('execution <executionId>')
        .description('Replay one execution with timeline, evidence, and event lineage')
        .option('--json', 'Output JSON')
        .option('--export <path>', 'Write deterministic replay output to file')
        .action((executionId, options) => {
        try {
            const rootOptions = root.opts();
            const jsonEnabled = optionEnabled(options, rootOptions, 'json');
            const exportPath = optionString(options, rootOptions, 'export');
            const detail = (0, replay_runtime_1.replayExecution)({ executionId }, process.cwd());
            if (exportPath) {
                const outputPath = writeDeterministicExport(exportPath, detail);
                if (!jsonEnabled) {
                    console.log(`\nReplay export written: ${outputPath}\n`);
                }
            }
            if (jsonEnabled) {
                console.log(asPrettyJson(detail));
                return;
            }
            printExecutionSummary(detail);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ ${message}`);
            process.exit(1);
        }
    });
    root
        .command('workspace [workspaceId]')
        .description('Replay deterministic team posture and activity history')
        .option('--at <timestamp>', 'ISO timestamp for workspace reconstruction')
        .option('--json', 'Output JSON')
        .option('--export <path>', 'Write deterministic replay output to file')
        .action((workspaceId, options) => {
        try {
            const rootOptions = root.opts();
            const jsonEnabled = optionEnabled(options, rootOptions, 'json');
            const exportPath = optionString(options, rootOptions, 'export');
            const at = options.at ? ensureIso(options.at) : undefined;
            const detail = (0, replay_runtime_1.replayWorkspace)({
                workspaceId: workspaceId || undefined,
                at,
            }, process.cwd());
            if (exportPath) {
                const outputPath = writeDeterministicExport(exportPath, detail);
                if (!jsonEnabled) {
                    console.log(`\nReplay export written: ${outputPath}\n`);
                }
            }
            if (jsonEnabled) {
                console.log(asPrettyJson(detail));
                return;
            }
            printWorkspaceSummary(detail);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ ${message}`);
            process.exit(1);
        }
    });
    root
        .command('timeline')
        .description('Replay deterministic timeline across activity, events, evidence, and snapshots')
        .option('--workspace <workspaceId>', 'Workspace scope')
        .option('--from <timestamp>', 'ISO start timestamp')
        .option('--to <timestamp>', 'ISO end timestamp')
        .option('--limit <count>', 'Maximum timeline items to return', (value) => Number.parseInt(value, 10))
        .option('--json', 'Output JSON')
        .option('--export <path>', 'Write deterministic replay output to file')
        .action((options) => {
        try {
            const rootOptions = root.opts();
            const jsonEnabled = optionEnabled(options, rootOptions, 'json');
            const exportPath = optionString(options, rootOptions, 'export');
            const request = {
                workspaceId: options.workspace || undefined,
                from: options.from ? ensureIso(options.from) : undefined,
                to: options.to ? ensureIso(options.to) : undefined,
                limit: Number.isFinite(options.limit) ? options.limit : undefined,
            };
            const result = (0, replay_runtime_1.replayTimeline)(request, process.cwd());
            if (exportPath) {
                const outputPath = writeDeterministicExport(exportPath, result);
                if (!jsonEnabled) {
                    console.log(`\nReplay export written: ${outputPath}\n`);
                }
            }
            if (jsonEnabled) {
                console.log(asPrettyJson(result));
                return;
            }
            printTimelineSummary(result);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ ${message}`);
            process.exit(1);
        }
    });
}
//# sourceMappingURL=replay.js.map