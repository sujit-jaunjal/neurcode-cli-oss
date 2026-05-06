"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.controlPlaneCommand = controlPlaneCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const control_plane_1 = require("../utils/control-plane");
function parsePatchInput(options) {
    const sanitizePatch = (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('Patch must be a JSON object');
        }
        const source = value;
        const allowed = new Set([
            'runtime',
            'remediation',
            'evidence',
            'eventRuntime',
            'ciGovernance',
            'policyGovernance',
        ]);
        const patch = {};
        for (const [key, entry] of Object.entries(source)) {
            if (!allowed.has(key))
                continue;
            if (!entry || typeof entry !== 'object' || Array.isArray(entry))
                continue;
            patch[key] = entry;
        }
        if (Object.keys(patch).length === 0) {
            throw new Error('Patch did not include any valid section updates.');
        }
        return patch;
    };
    if (options.patchFile) {
        const raw = (0, fs_1.readFileSync)((0, path_1.resolve)(options.patchFile), 'utf-8');
        const parsed = JSON.parse(raw);
        return sanitizePatch(parsed);
    }
    if (options.patch) {
        const parsed = JSON.parse(options.patch);
        return sanitizePatch(parsed);
    }
    throw new Error('Missing patch input. Provide --patch <json> or --patch-file <path>.');
}
function asPrettyJson(value) {
    return JSON.stringify(value, null, 2);
}
function toExecutionSource(input) {
    const normalized = (input || '').trim().toLowerCase();
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
function controlPlaneCommand(program) {
    const root = program
        .command('control-plane')
        .description('Inspect and update deterministic governance control-plane configuration');
    root
        .command('show')
        .description('Show current control-plane state and snapshot metadata')
        .option('--json', 'Output JSON')
        .action((options) => {
        const state = (0, control_plane_1.readControlPlaneState)(process.cwd());
        const snapshots = (0, control_plane_1.readControlPlaneSnapshotHistory)(process.cwd(), 25);
        if (options.json === true) {
            console.log(asPrettyJson({ state, snapshots }));
            return;
        }
        console.log('\nGovernance Control Plane\n');
        console.log(`Schema: ${state.schemaVersion}`);
        console.log(`Generated: ${state.generatedAt}`);
        console.log(`Root: ${state.rootDir}`);
        console.log(`Runtime dedupe: ${state.runtime.execution.duplicateSuppression} (${state.runtime.execution.dedupeWindowMs}ms)`);
        console.log(`Execution retention: ${state.runtime.retention.executionRecords}`);
        console.log(`Event retention: ${state.eventRuntime.retention.maxEvents}`);
        console.log(`CI strictness: ${state.ciGovernance.enforcement.strictness}`);
        console.log(`Evidence default: ${state.evidence.collection.enabledByDefault}`);
        console.log(`Snapshots retained: ${state.metadata.snapshots.retentionLimit}`);
        console.log(`Snapshots available: ${snapshots.length}\n`);
    });
    root
        .command('preview')
        .description('Preview deterministic impact of a control-plane patch')
        .option('--patch <json>', 'Inline JSON patch object')
        .option('--patch-file <path>', 'Path to JSON patch file')
        .option('--json', 'Output JSON')
        .action((options) => {
        try {
            const patch = parsePatchInput(options);
            const preview = (0, control_plane_1.previewControlPlaneUpdate)(patch, process.cwd());
            if (options.json === true) {
                console.log(asPrettyJson(preview));
                return;
            }
            console.log('\nControl-plane impact preview\n');
            console.log(`Risk level: ${preview.impact.riskLevel}`);
            console.log(`Changed sections: ${preview.impact.changedSections.join(', ') || 'none'}`);
            console.log(`Changed keys: ${preview.impact.changedKeys.length}`);
            if (preview.impact.items.length === 0) {
                console.log('No behavior-changing impacts detected.\n');
                return;
            }
            for (const item of preview.impact.items) {
                console.log(`- [${item.severity}] ${item.title}`);
                console.log(`  ${item.summary}`);
                console.log(`  Systems: ${item.affectedSystems.join(', ')}`);
            }
            console.log('');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ ${message}`);
            process.exit(1);
        }
    });
    root
        .command('apply')
        .description('Apply control-plane patch, snapshot changes, and emit governance execution records')
        .option('--patch <json>', 'Inline JSON patch object')
        .option('--patch-file <path>', 'Path to JSON patch file')
        .option('--reason <text>', 'Audit reason for this configuration change')
        .option('--source <source>', 'Execution source attribution (cli|daemon|dashboard|vscode|ci|mcp|cursor|api)', 'cli')
        .option('--actor <actor>', 'Execution actor attribution label')
        .option('--json', 'Output JSON')
        .action((options) => {
        try {
            const patch = parsePatchInput(options);
            const result = (0, control_plane_1.applyControlPlaneUpdate)(patch, {
                cwd: process.cwd(),
                reason: options.reason,
                source: toExecutionSource(options.source),
                actor: options.actor,
            });
            if (options.json === true) {
                console.log(asPrettyJson(result));
                return;
            }
            console.log('\n✅ Control-plane update applied\n');
            console.log(`Snapshot: ${result.snapshotId || 'n/a'}`);
            if (result.snapshotPath)
                console.log(`Snapshot path: ${result.snapshotPath}`);
            if (result.executionId)
                console.log(`Execution: ${result.executionId}`);
            console.log(`Risk level: ${result.impact.riskLevel}`);
            console.log(`Sections: ${result.impact.changedSections.join(', ') || 'none'}`);
            console.log('');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ ${message}`);
            process.exit(1);
        }
    });
}
//# sourceMappingURL=control-plane.js.map