"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findLatestLocalAdmissionSessionId = findLatestLocalAdmissionSessionId;
exports.buildAdmissionDoctorSummary = buildAdmissionDoctorSummary;
exports.exportAdmissionRecordForCli = exportAdmissionRecordForCli;
exports.admissionCommand = admissionCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const admission_artifact_1 = require("../utils/admission-artifact");
const v0_governance_1 = require("../utils/v0-governance");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
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
const ADMISSION_CONTAINS = [
    'session id, capture mode, schema version, and source-free disclaimer',
    'changed path identities, classifications, counts, delta hash, and coverage set hash',
    'runtime context: agent host, status, guarded path counts, owners, approvals, denials, replay hash, and receipt summary',
];
const ADMISSION_EXCLUDES = [
    'source code, raw file contents, diff hunks, patch bodies, and shell command bodies',
    'secrets, raw private prompts, raw private chat content, and raw tool transcripts',
    'backend receipt body, signatures, and session summaries; only bounded receipt metadata is exported',
];
const ACTION_CONSUMPTION = [
    'commit .neurcode-admission/<sessionId>.json with the pull request',
    'the Action discovers committed admission records from the PR head tree',
    'the Action renders admission trust level, session count, blocked/approved/denied counts, and receipt posture without reading source contents',
];
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
        trustLevel: record.runtimeContext?.trustLevel ?? 'self_attested',
        receipt: {
            present: record.runtimeContext?.integrity.receipt.present ?? false,
            ...(record.runtimeContext?.integrity.receipt.receiptId ? { receiptId: record.runtimeContext.integrity.receipt.receiptId } : {}),
            ...(record.runtimeContext?.integrity.receipt.keyId !== undefined ? { keyId: record.runtimeContext.integrity.receipt.keyId } : {}),
            ...(record.runtimeContext?.integrity.receipt.signatureStatus !== undefined ? { signatureStatus: record.runtimeContext.integrity.receipt.signatureStatus } : {}),
            ...(record.runtimeContext?.integrity.receipt.verificationStatus !== undefined ? { verificationStatus: record.runtimeContext.integrity.receipt.verificationStatus } : {}),
            ...(record.runtimeContext?.integrity.receipt.verifier !== undefined ? { verifier: record.runtimeContext.integrity.receipt.verifier } : {}),
        },
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
        contains: ADMISSION_CONTAINS,
        excludes: ADMISSION_EXCLUDES,
        actionConsumption: ACTION_CONSUMPTION,
        nextSteps: [
            `git add ${publicRelativePath}`,
            'commit the admission artifact with the governed PR',
            'Neurcode Runtime Admission Advisory will activate Layer 2 automatically',
        ],
    };
}
function buildAdmissionDoctorSummary(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const latestLocalSessionId = findLatestLocalAdmissionSessionId(repoRoot);
    const activeSession = (0, governance_runtime_1.loadActiveSession)(repoRoot);
    const publicDir = '.neurcode-admission/';
    const checks = [
        {
            id: 'repo',
            status: 'pass',
            message: `repository root resolved: ${repoRoot}`,
        },
        {
            id: 'local-admission',
            status: latestLocalSessionId ? 'pass' : 'warn',
            message: latestLocalSessionId
                ? `latest local admission record: ${latestLocalSessionId}`
                : 'no local admission artifact found yet',
        },
        {
            id: 'active-session',
            status: activeSession ? 'pass' : latestLocalSessionId ? 'pass' : 'warn',
            message: activeSession
                ? `active governed session can be exported: ${activeSession.sessionId}`
                : latestLocalSessionId
                    ? 'no active session needed because a local admission artifact exists'
                    : 'start or finish a governed session before exporting admission',
        },
        {
            id: 'public-artifact-dir',
            status: 'pass',
            message: `${publicDir} will be created during export and should be committed with the PR`,
        },
        {
            id: 'receipt',
            status: 'warn',
            message: 'backend receipt metadata is optional; pass --receipt <json> only when you have source-free receipt/control-plane JSON',
        },
    ];
    const exportable = Boolean(latestLocalSessionId || activeSession);
    return {
        ok: exportable,
        repoRoot,
        latestLocalSessionId,
        activeSessionId: activeSession?.sessionId ?? null,
        exportable,
        publicDir,
        checks,
        nextSteps: exportable
            ? ['neurcode admission export --explain', 'git add .neurcode-admission/*.json', 'open a PR with the Neurcode Action installed']
            : ['start a governed session', 'finish or keep the session active', 'rerun neurcode admission doctor'],
    };
}
function ensureLocalAdmissionRecord(repoRoot, sessionId) {
    if (sessionId) {
        if ((0, fs_1.existsSync)((0, admission_artifact_1.admissionRecordPath)(repoRoot, sessionId)))
            return sessionId;
        const session = (0, governance_runtime_1.loadSession)(repoRoot, sessionId);
        if (!session)
            return null;
        (0, admission_artifact_1.emitSelfAttestedAdmissionRecord)({ repoRoot, session });
        return session.sessionId;
    }
    const latest = findLatestLocalAdmissionSessionId(repoRoot);
    if (latest)
        return latest;
    const active = (0, governance_runtime_1.loadActiveSession)(repoRoot);
    if (!active)
        return null;
    (0, admission_artifact_1.emitSelfAttestedAdmissionRecord)({ repoRoot, session: active });
    return active.sessionId;
}
function exportAdmissionRecordForCli(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const sessionId = ensureLocalAdmissionRecord(repoRoot, options.sessionId);
    if (!sessionId) {
        throw new Error('No local admission record or governed session found. Finish or start a governed session first, or run `neurcode admission export <session-id>`.');
    }
    const result = (0, admission_artifact_1.exportSelfAttestedAdmissionRecord)(repoRoot, sessionId, { receiptPath: options.receiptPath });
    return summarizeAdmissionExport(repoRoot, result);
}
function printAdmissionExportSummary(summary) {
    console.log(chalk.green('Admission record exported'));
    console.log(`  Session:        ${chalk.bold(summary.sessionId)}`);
    console.log(`  Local record:   ${chalk.dim(summary.localRelativePath)}`);
    console.log(`  PR artifact:    ${chalk.cyan(summary.publicRelativePath)}`);
    console.log(`  Trust:          ${summary.trustLevel}`);
    if (summary.receipt.present) {
        console.log(`  Receipt:        ${summary.receipt.receiptId || 'attached'} (${summary.receipt.verificationStatus || 'unknown'})`);
    }
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
function printAdmissionExplanation(summary) {
    console.log('');
    console.log(chalk.bold('What was written:'));
    console.log(`  - ${summary.publicRelativePath}`);
    console.log('');
    console.log(chalk.bold('What it contains:'));
    for (const item of summary.contains)
        console.log(`  - ${item}`);
    console.log('');
    console.log(chalk.bold('What it intentionally excludes:'));
    for (const item of summary.excludes)
        console.log(`  - ${item}`);
    console.log('');
    console.log(chalk.bold('How the GitHub Action consumes it:'));
    for (const item of summary.actionConsumption)
        console.log(`  - ${item}`);
}
function printAdmissionDoctor(summary) {
    console.log(summary.exportable ? chalk.green('Admission export readiness: ready') : chalk.yellow('Admission export readiness: not ready'));
    console.log(`  Repo: ${chalk.dim(summary.repoRoot)}`);
    console.log('');
    for (const check of summary.checks) {
        const label = check.status === 'pass' ? chalk.green('PASS') : check.status === 'fail' ? chalk.red('FAIL') : chalk.yellow('WARN');
        console.log(`  ${label} ${check.id}: ${check.message}`);
    }
    console.log('');
    console.log(chalk.bold('Next:'));
    for (const step of summary.nextSteps)
        console.log(`  - ${step}`);
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
        .option('--receipt <path>', 'Attach source-free backend receipt summary from a receipt/control-plane JSON file')
        .option('--explain', 'Explain what the record contains, excludes, and how the GitHub Action consumes it')
        .option('--json', 'Output machine-readable JSON')
        .action((sessionId, options) => {
        try {
            const summary = exportAdmissionRecordForCli({
                dir: options.dir,
                sessionId,
                receiptPath: options.receipt,
                explain: options.explain === true,
                json: options.json === true,
            });
            if (options.json) {
                console.log(JSON.stringify(summary, null, 2));
            }
            else {
                printAdmissionExportSummary(summary);
                if (options.explain)
                    printAdmissionExplanation(summary);
            }
        }
        catch (error) {
            printAdmissionError(error, options.json === true);
        }
    });
    admission
        .command('doctor')
        .description('Check whether runtime admission export is ready for this repository')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        try {
            const summary = buildAdmissionDoctorSummary({ dir: options.dir });
            if (options.json) {
                console.log(JSON.stringify(summary, null, 2));
            }
            else {
                printAdmissionDoctor(summary);
            }
            if (!summary.exportable)
                process.exitCode = 1;
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