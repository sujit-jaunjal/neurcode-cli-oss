"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findLatestLocalAdmissionSessionId = findLatestLocalAdmissionSessionId;
exports.exportAdmissionRecordForCli = exportAdmissionRecordForCli;
exports.admissionCommand = admissionCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const admission_artifact_1 = require("../utils/admission-artifact");
const v0_governance_1 = require("../utils/v0-governance");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (str) => str,
        yellow: (str) => str,
        red: (str) => str,
        dim: (str) => str,
        bold: (str) => str,
        cyan: (str) => str,
    };
}
function normalizeSessionIdFromFileName(fileName) {
    if (!fileName.endsWith('.json'))
        return null;
    const sessionId = fileName.slice(0, -'.json'.length);
    return sessionId && /^[A-Za-z0-9._-]+$/.test(sessionId) ? sessionId : null;
}
function findLatestLocalAdmissionSessionId(repoRoot) {
    const dir = (0, admission_artifact_1.admissionDir)(repoRoot);
    if (!(0, fs_1.existsSync)(dir))
        return null;
    const candidates = (0, fs_1.readdirSync)(dir)
        .map((fileName) => {
        const sessionId = normalizeSessionIdFromFileName(fileName);
        if (!sessionId)
            return null;
        const path = (0, admission_artifact_1.admissionRecordPath)(repoRoot, sessionId);
        try {
            const stat = (0, fs_1.statSync)(path);
            return { sessionId, mtimeMs: stat.mtimeMs };
        }
        catch {
            return null;
        }
    })
        .filter((candidate) => candidate !== null)
        .sort((left, right) => right.mtimeMs - left.mtimeMs || right.sessionId.localeCompare(left.sessionId));
    return candidates[0]?.sessionId ?? null;
}
function summarizeAdmissionExport(repoRoot, result) {
    const record = result.record;
    const coverage = record.manifest.coverage;
    const governedCoverageCount = coverage.filter((entry) => entry.classification === 'governed_prewrite' ||
        entry.classification === 'governed_delete' ||
        entry.classification === 'generated').length;
    const ungovernedCoverageCount = coverage.filter((entry) => entry.classification === 'ungoverned').length;
    const localPath = (0, admission_artifact_1.admissionRecordPath)(repoRoot, record.sessionId);
    const publicPath = (0, admission_artifact_1.publicAdmissionRecordPath)(repoRoot, record.sessionId);
    const publicRelativePath = (0, path_1.relative)(repoRoot, publicPath).replace(/\\/g, '/');
    const localRelativePath = (0, path_1.relative)(repoRoot, localPath).replace(/\\/g, '/');
    return {
        ok: true,
        repoRoot,
        sessionId: record.sessionId,
        localPath,
        publicPath,
        localRelativePath,
        publicRelativePath,
        schemaVersion: record.schemaVersion,
        attestationKind: record.attestationKind,
        disclaimer: record.disclaimer,
        capture: {
            mode: record.capture.mode,
            ...(record.capture.baseRef ? { baseRef: record.capture.baseRef } : {}),
            ...(record.capture.headRef ? { headRef: record.capture.headRef } : {}),
        },
        manifest: {
            entryCount: record.manifest.entryCount,
            coverageCount: record.manifest.coverage.length,
            deltaHash: record.manifest.deltaHash,
            coverageSetHash: record.manifest.coverageSetHash,
            governedCoverageCount,
            ungovernedCoverageCount,
        },
        nextSteps: [
            `git add ${publicRelativePath}`,
            'commit the admission artifact with the governed PR',
            'Neurcode Runtime Admission Advisory will activate Layer 2 automatically',
        ],
    };
}
function exportAdmissionRecordForCli(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const sessionId = options.sessionId || findLatestLocalAdmissionSessionId(repoRoot);
    if (!sessionId) {
        throw new Error('No local admission record found. Finish a governed session first, or run `neurcode admission export <session-id>`.');
    }
    const result = (0, admission_artifact_1.exportSelfAttestedAdmissionRecord)(repoRoot, sessionId);
    return summarizeAdmissionExport(repoRoot, result);
}
function printAdmissionExportSummary(summary) {
    console.log(chalk.green('Admission record exported'));
    console.log(`  Session:        ${chalk.bold(summary.sessionId)}`);
    console.log(`  Local record:   ${chalk.dim(summary.localRelativePath)}`);
    console.log(`  PR artifact:    ${chalk.cyan(summary.publicRelativePath)}`);
    console.log(`  Effects:        ${summary.manifest.entryCount}`);
    console.log(`  Coverage:       ${summary.manifest.governedCoverageCount} governed, ${summary.manifest.ungovernedCoverageCount} ungoverned`);
    console.log('');
    console.log(chalk.bold('Next:'));
    for (const step of summary.nextSteps) {
        console.log(`  - ${step}`);
    }
    console.log('');
    console.log(chalk.dim('Self-attested admission is a claim by the diff author, not cryptographic proof.'));
}
function printAdmissionError(error, json) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) {
        console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    }
    else {
        console.error(chalk.red(`Admission export failed: ${message}`));
    }
    process.exitCode = 1;
}
function admissionCommand(program) {
    const admission = program
        .command('admission')
        .description('Export source-free runtime admission records for the GitHub Action');
    admission
        .command('export [sessionId]')
        .description('Export a local governed-session admission record into .neurcode-admission/')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action((sessionId, options) => {
        try {
            const summary = exportAdmissionRecordForCli({
                dir: options.dir,
                sessionId,
                json: options.json === true,
            });
            if (options.json) {
                console.log(JSON.stringify(summary, null, 2));
            }
            else {
                printAdmissionExportSummary(summary);
            }
        }
        catch (error) {
            printAdmissionError(error, options.json === true);
        }
    });
    admission
        .command('latest')
        .description('Show the latest local admission record available for export')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        try {
            const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
            const sessionId = findLatestLocalAdmissionSessionId(repoRoot);
            const payload = {
                ok: true,
                repoRoot,
                sessionId,
                localPath: sessionId ? (0, admission_artifact_1.admissionRecordPath)(repoRoot, sessionId) : null,
                localRelativePath: sessionId
                    ? (0, path_1.relative)(repoRoot, (0, admission_artifact_1.admissionRecordPath)(repoRoot, sessionId)).replace(/\\/g, '/')
                    : null,
            };
            if (options.json) {
                console.log(JSON.stringify(payload, null, 2));
                return;
            }
            if (sessionId) {
                console.log(`Latest admission record: ${chalk.bold(sessionId)} (${chalk.dim((0, path_1.basename)(payload.localRelativePath || ''))})`);
            }
            else {
                console.log(chalk.yellow('No local admission records found.'));
            }
        }
        catch (error) {
            printAdmissionError(error, options.json === true);
        }
    });
}
//# sourceMappingURL=admission.js.map