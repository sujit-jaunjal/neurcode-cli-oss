"use strict";
/**
 * `neurcode home` — operational home surface.
 *
 * Surfaces the current runtime state in a single, scannable view:
 *   - Active intent contract (declared scope, forbidden boundaries)
 *   - Last verify run (verdict, canonical replay checksum, governance posture)
 *   - Runtime capabilities envelope (what actually executed)
 *   - Recent governance decisions (accept-risk, temporary-exception)
 *
 * This command does NOT mutate any runtime state. It is a read-only
 * presentation of canonical artefacts already on disk:
 *   - .neurcode/intent-pack.json
 *   - .neurcode/last-verify-output.json
 *   - .neurcode/governance/*.json
 *
 * Replay-safe: the command's output is human-presentation only. Same
 * canonical artefacts on disk → same `home` output.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.homeCommand = homeCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const chalk_1 = __importDefault(require("chalk"));
function fileMtimeIso(path) {
    try {
        if (!(0, fs_1.existsSync)(path))
            return undefined;
        return (0, fs_1.statSync)(path).mtime.toISOString();
    }
    catch {
        return undefined;
    }
}
function readJsonSafe(path) {
    try {
        if (!(0, fs_1.existsSync)(path))
            return null;
        return JSON.parse((0, fs_1.readFileSync)(path, 'utf-8'));
    }
    catch {
        return null;
    }
}
function fmtVerdict(verdict) {
    if (verdict === 'PASS')
        return chalk_1.default.green('PASS');
    if (verdict === 'FAIL')
        return chalk_1.default.red('FAIL');
    if (verdict === 'WARN')
        return chalk_1.default.yellow('WARN');
    return chalk_1.default.dim(verdict ?? 'unknown');
}
function fmtCapability(value) {
    if (!value)
        return chalk_1.default.dim('—');
    const active = value === 'enforced' || value === 'active' || value === 'pattern-deterministic'
        || value === 'active-authored' || value === 'active-synthesized';
    return active ? chalk_1.default.green(value) : chalk_1.default.dim(value);
}
function fmtGate(gate) {
    if (!gate)
        return chalk_1.default.dim('—');
    if (gate === 'clean')
        return chalk_1.default.green(gate);
    if (gate === 'advisory')
        return chalk_1.default.dim(gate);
    if (gate === 'review-blocker' || gate === 'architecture-blocker')
        return chalk_1.default.yellow(gate);
    return chalk_1.default.red(gate);
}
function relativeTime(iso) {
    if (!iso)
        return chalk_1.default.dim('never');
    const t = Date.parse(iso);
    if (!Number.isFinite(t))
        return chalk_1.default.dim('—');
    const seconds = Math.floor((Date.now() - t) / 1000);
    if (seconds < 60)
        return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)
        return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48)
        return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}
function listGovernanceDecisions(projectRoot) {
    const dir = (0, path_1.resolve)(projectRoot, '.neurcode/governance');
    if (!(0, fs_1.existsSync)(dir))
        return { acceptRisk: 0, tempException: 0, total: 0 };
    try {
        const files = (0, fs_1.readdirSync)(dir).filter((f) => f.endsWith('.json'));
        let acceptRisk = 0;
        let tempException = 0;
        for (const f of files) {
            const path = (0, path_1.join)(dir, f);
            const decision = readJsonSafe(path);
            if (decision?.state === 'accept-risk')
                acceptRisk++;
            else if (decision?.state === 'temporary-exception')
                tempException++;
        }
        return { acceptRisk, tempException, total: files.length };
    }
    catch {
        return { acceptRisk: 0, tempException: 0, total: 0 };
    }
}
function printPanel(title, body) {
    console.log(`  ${chalk_1.default.bold(title)}`);
    for (const line of body) {
        console.log(`    ${line}`);
    }
    console.log('');
}
function row(label, value, labelWidth = 28) {
    return `${chalk_1.default.dim(label.padEnd(labelWidth))} ${value}`;
}
function renderHome(projectRoot, opts) {
    const intent = readJsonSafe((0, path_1.resolve)(projectRoot, '.neurcode/intent-pack.json'));
    const verifyPath = (0, path_1.resolve)(projectRoot, '.neurcode/last-verify-output.json');
    const verify = readJsonSafe(verifyPath);
    const decisions = listGovernanceDecisions(projectRoot);
    const verifyTimestamp = verify?.timestamp
        ?? verify?.provenanceRunAt
        ?? verify?.generatedAt
        ?? fileMtimeIso(verifyPath);
    if (opts.json) {
        console.log(JSON.stringify({
            projectRoot,
            intent: intent ? {
                intentPackId: intent.intentPackId,
                approvedScope: intent.approvedScope,
                forbiddenBoundaryCount: intent.forbiddenBoundaries?.length ?? 0,
            } : null,
            lastVerify: verify ? {
                verdict: verify.verdict,
                replayChecksum: verify.replayChecksum,
                scopeIssueCount: verify.scopeIssues?.length ?? 0,
                governanceGate: verify.intentGovernance?.governanceGate ?? null,
                rolloutTrust: verify.intentGovernance?.rolloutTrust ?? null,
                rolloutRisk: verify.intentGovernance?.rolloutRisk ?? null,
                runtimeCapabilities: verify.runtimeCapabilities ?? null,
                timestamp: verifyTimestamp ?? null,
            } : null,
            governanceDecisions: decisions,
        }, null, 2));
        return;
    }
    // Pretty operational home — Linear/Warp/Terraform Cloud aesthetic.
    // Information-dense, no theatrics, no emojis, no boxes.
    console.log('');
    console.log(`${chalk_1.default.bold('neurcode home')}${chalk_1.default.dim('  ·  ' + projectRoot)}`);
    console.log('');
    // === Active intent ===
    if (intent) {
        const summary = intent.intent?.normalized ?? intent.intent?.raw ?? '(no summary)';
        const truncated = summary.length > 88 ? summary.slice(0, 85) + '…' : summary;
        printPanel('Active intent', [
            row('id', chalk_1.default.cyan(intent.intentPackId ?? 'unknown')),
            row('summary', truncated),
            row('approved files', String(intent.approvedScope?.files?.length ?? 0)),
            row('approved modules', String(intent.approvedScope?.modules?.length ?? 0)),
            row('forbidden boundaries', String(intent.forbiddenBoundaries?.length ?? 0)),
        ]);
    }
    else {
        printPanel('Active intent', [
            chalk_1.default.dim('No intent contract declared yet.'),
            '',
            chalk_1.default.cyan('  neurcode start') + chalk_1.default.dim(' "what you intend to change"'),
        ]);
    }
    // === Last verify ===
    if (verify) {
        const scopeCount = verify.scopeIssues?.length ?? 0;
        const importEdgeCount = (verify.scopeIssues ?? []).filter((s) => s.importEdge).length;
        printPanel('Last verify', [
            row('verdict', fmtVerdict(verify.verdict)),
            row('replay checksum', verify.replayChecksum ? chalk_1.default.cyan(verify.replayChecksum.slice(0, 16) + '…') : chalk_1.default.dim('—')),
            row('scope issues', `${scopeCount}${importEdgeCount > 0 ? chalk_1.default.dim(`  (${importEdgeCount} import-edge)`) : ''}`),
            row('governance gate', fmtGate(verify.intentGovernance?.governanceGate)),
            row('rollout trust', chalk_1.default.dim(verify.intentGovernance?.rolloutTrust ?? '—')),
            row('rollout risk', chalk_1.default.dim(verify.intentGovernance?.rolloutRisk ?? '—')),
            row('when', chalk_1.default.dim(relativeTime(verifyTimestamp))),
        ]);
    }
    else {
        printPanel('Last verify', [
            chalk_1.default.dim('No verify run on record.'),
            '',
            chalk_1.default.cyan('  neurcode verify') + chalk_1.default.dim(' --local-only --head'),
        ]);
    }
    // === Runtime capabilities ===
    const rc = verify?.runtimeCapabilities;
    printPanel('Runtime capabilities', [
        row('intent runtime', fmtCapability(rc?.intentRuntime)),
        row('scope guard', fmtCapability(rc?.scopeGuard)),
        row('forbidden boundary', fmtCapability(rc?.forbiddenBoundaryEnforcement)),
        row('import-edge governance', fmtCapability(rc?.importEdgeGovernance)),
        row('generated-code governance', fmtCapability(rc?.generatedCodeGovernance)),
        row('replay determinism', fmtCapability(rc?.replayDeterminism)),
    ]);
    // === Governance decisions ===
    if (decisions.total > 0) {
        printPanel('Governance decisions', [
            row('accept-risk', String(decisions.acceptRisk)),
            row('temporary-exception', String(decisions.tempException)),
            row('total recorded', chalk_1.default.cyan(String(decisions.total))),
            '',
            chalk_1.default.dim('  Inspect: ') + chalk_1.default.cyan('neurcode governance list'),
        ]);
    }
    // === Next steps ===
    const next = [];
    if (!intent) {
        next.push(chalk_1.default.cyan('  neurcode start') + chalk_1.default.dim(' "what you intend to change"'));
    }
    if (intent && !verify) {
        next.push(chalk_1.default.cyan('  neurcode verify') + chalk_1.default.dim(' --local-only --head --require-intent-runtime'));
    }
    if (verify?.verdict === 'FAIL') {
        next.push(chalk_1.default.cyan('  neurcode remediate-export') + chalk_1.default.dim(' --finding-index 0 --json'));
        next.push(chalk_1.default.cyan('  neurcode replay') + chalk_1.default.dim(' --html /tmp/replay-report.html'));
    }
    if (verify?.verdict === 'PASS') {
        next.push(chalk_1.default.cyan('  neurcode replay') + chalk_1.default.dim(' --html /tmp/replay-report.html  (archive evidence)'));
        next.push(chalk_1.default.cyan('  neurcode timeline') + chalk_1.default.dim(' --limit 15'));
    }
    if (next.length > 0) {
        printPanel('Next steps', next);
    }
    console.log(chalk_1.default.dim('  Same on-disk artefacts → same `home` output. Read-only; no runtime mutation.'));
    console.log('');
}
function homeCommand(program) {
    program
        .command('home')
        .description('Operational home — current runtime state at a glance (intent, last verify, capabilities)')
        .option('--json', 'Emit machine-readable JSON instead of the pretty surface')
        .option('--project-root <dir>', 'Project root (defaults to current working directory)')
        .action((options) => {
        const projectRoot = (0, path_1.resolve)(options.projectRoot ?? process.cwd());
        renderHome(projectRoot, { json: options.json === true });
    });
}
//# sourceMappingURL=home.js.map