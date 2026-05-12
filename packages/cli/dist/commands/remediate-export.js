"use strict";
/**
 * neurcode remediate-export
 *
 * Exports a structured, deterministic remediation payload for a governance finding.
 * The payload is designed to be passed to an external AI coding assistant
 * (Cursor, Claude, Codex, GitHub Copilot) for remediation.
 *
 * TRUST BOUNDARY:
 *   Neurcode detects and exports. Your AI assistant remediates.
 *   This command never modifies any file.
 *
 * Usage:
 *   neurcode remediate-export --finding <id>
 *   neurcode remediate-export --finding-index 0
 *   neurcode remediate-export --all
 *   neurcode remediate-export --finding <id> --format mcp
 *   neurcode remediate-export --finding <id> --out ./payload.json
 *   neurcode remediate-export --finding <id> --copy
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.remediateExportCommand = remediateExportCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const crypto_1 = require("crypto");
const child_process_1 = require("child_process");
const cli_json_1 = require("../utils/cli-json");
const chalk = (0, cli_json_1.loadChalk)();
// ── Trust boundary statement — fixed, never changes ──────────────────────────
const TRUST_BOUNDARY_STATEMENT = 'Neurcode deterministically detects and governs. ' +
    'Your AI coding assistant (Cursor, Claude, Codex, GitHub Copilot) performs remediation. ' +
    'Neurcode never autonomously modifies production code.';
// ── Remediation category map — deterministic, ruleId-keyed ───────────────────
const REMEDIATION_CATEGORY = {
    PY003: 'exception-handling',
    PY005: 'input-validation',
    PY001: 'async-lifecycle',
    PY006: 'async-lifecycle',
    PY007: 'resource-lifecycle',
    PY008: 'retry-resilience',
    PY009: 'security',
    PY010: 'resource-lifecycle',
    PY011: 'thread-lifecycle',
    PY012: 'async-lifecycle',
    PY013: 'correctness',
    PY014: 'retry-resilience',
    SR001: 'exception-handling',
    SR002: 'data-flow',
    SR003: 'resource-lifecycle',
    SR004: 'input-validation',
    SR009: 'retry-resilience',
    SR010: 'retry-resilience',
    DS001: 'distributed-consistency',
    'potential-secret-default': 'security',
    'potential-secret-high': 'security',
};
// ── Suggested prompt hint per category — advisory, never prescriptive ─────────
const PROMPT_HINT = {
    'exception-handling': 'The finding identifies an exception handling pattern that silently swallows errors. ' +
        'Remediation should ensure exceptions are re-raised or converted to structured error responses.',
    'input-validation': 'The finding identifies a missing input validation boundary. ' +
        'Remediation should add schema validation (e.g., Pydantic model) before processing the input.',
    'async-lifecycle': 'The finding identifies an async pattern that may cause silent failures or event loop blocking. ' +
        'Remediation should ensure async tasks are tracked and exceptions are handled.',
    'resource-lifecycle': 'The finding identifies a resource (session, connection, thread) that may not be properly closed. ' +
        'Remediation should use context managers or explicit cleanup in finally blocks.',
    'thread-lifecycle': 'The finding identifies a thread created without daemon=True or without a stored reference. ' +
        'Remediation should set daemon=True and store the thread reference for join() on shutdown.',
    'retry-resilience': 'The finding identifies a retry pattern without exponential backoff or a thundering-herd risk. ' +
        'Remediation should implement exponential backoff with jitter.',
    'security': 'The finding identifies a security-sensitive pattern (hardcoded credential, unsafe deserialization). ' +
        'Remediation must use environment variables, secret managers, or safe alternatives.',
    'correctness': 'The finding identifies a correctness issue (e.g., mutable default argument). ' +
        'Remediation should follow standard Python idioms to avoid shared mutable state.',
    'distributed-consistency': 'The finding identifies a distributed consistency issue. ' +
        'Remediation should add compensating logic, idempotency, or saga rollback.',
    'data-flow': 'The finding identifies a data flow issue (unbounded collection, leaking state). ' +
        'Remediation should add bounds or explicit cleanup.',
};
async function remediateExportCommand(options) {
    const projectRoot = process.cwd();
    const lastVerifyPath = (0, path_1.join)(projectRoot, '.neurcode', 'last-verify-output.json');
    if (!(0, fs_1.existsSync)(lastVerifyPath)) {
        console.error(chalk.red('✗ No verify output found.'));
        console.error(chalk.dim('  Run: neurcode verify --policy-only --json'));
        console.error(chalk.dim('  The last verify output must exist at .neurcode/last-verify-output.json'));
        process.exit(1);
    }
    let verifyOutput;
    try {
        verifyOutput = JSON.parse((0, fs_1.readFileSync)(lastVerifyPath, 'utf-8'));
    }
    catch {
        console.error(chalk.red('✗ Could not parse .neurcode/last-verify-output.json'));
        process.exit(1);
    }
    // Collect findings from verify output
    const findings = collectFindings(verifyOutput);
    if (findings.length === 0) {
        console.log(chalk.green('✅ No findings in last verify run. Nothing to export.'));
        return;
    }
    // Select which findings to export
    let selected = [];
    if (options.all) {
        selected = findings;
    }
    else if (options.findingIndex !== undefined) {
        const idx = parseInt(options.findingIndex, 10);
        if (isNaN(idx) || idx < 0 || idx >= findings.length) {
            console.error(chalk.red(`✗ --finding-index ${options.findingIndex} out of range. ${findings.length} findings available.`));
            process.exit(1);
        }
        selected = [findings[idx]];
    }
    else if (options.finding) {
        const found = findings.filter((f) => (f.id ?? f.findingId ?? '') === options.finding ||
            String(f.findingId ?? f.id ?? '').startsWith(options.finding));
        if (found.length === 0) {
            console.error(chalk.red(`✗ Finding "${options.finding}" not found in last verify output.`));
            console.error(chalk.dim(`  Available IDs:`));
            findings.slice(0, 10).forEach((f) => console.error(chalk.dim(`    ${f.id ?? f.findingId ?? '(no id)'} — ${f.ruleId ?? f.rule ?? '?'} @ ${f.file ?? f.filePath ?? '?'}`)));
            process.exit(1);
        }
        selected = found;
    }
    else {
        // Default: export index 0 with a prompt
        console.log(chalk.dim(`No finding specified. Exporting finding at index 0. Use --finding-index N or --all.\n`));
        selected = [findings[0]];
    }
    const format = options.format ?? 'json';
    const replayChecksum = verifyOutput.replayChecksum ?? null;
    const replayMode = verifyOutput.replayMode ?? null;
    const payloads = selected.map((finding) => buildPayload(finding, verifyOutput, projectRoot, replayChecksum, replayMode, format));
    const output = payloads.length === 1
        ? JSON.stringify(format === 'mcp' ? payloads[0].mcpEnvelope : payloads[0], null, 2)
        : JSON.stringify(format === 'mcp' ? payloads.map(p => p.mcpEnvelope) : payloads, null, 2);
    // Write to file or stdout
    if (options.out) {
        const outPath = (0, path_1.resolve)(projectRoot, options.out);
        (0, fs_1.writeFileSync)(outPath, output, 'utf-8');
        console.log(chalk.green(`✅ Remediation export written to ${outPath}`));
    }
    else {
        console.log(output);
    }
    // Copy to clipboard
    if (options.copy) {
        try {
            (0, child_process_1.execSync)('pbcopy', { input: output });
            console.error(chalk.green('\n✅ Remediation payload copied to clipboard.'));
        }
        catch {
            console.error(chalk.yellow('\n⚠  --copy failed (pbcopy not available on this system).'));
        }
    }
    // Print trust boundary reminder
    if (!options.json) {
        console.error(chalk.dim('\n─────────────────────────────────────────────────────────'));
        console.error(chalk.cyan('  Trust Boundary'));
        console.error(chalk.dim('  Neurcode detects. Your AI assistant remediates.'));
        console.error(chalk.dim('  Pass this payload to Cursor, Claude, Codex, or any provider.'));
        console.error(chalk.dim('  Neurcode will re-verify after remediation.'));
        console.error(chalk.dim('─────────────────────────────────────────────────────────\n'));
    }
}
// ── Builders ──────────────────────────────────────────────────────────────────
function collectFindings(verifyOutput) {
    // Try multiple possible locations in verify output shape
    const govEnvelope = verifyOutput.governanceVerification?.findings ?? [];
    const violations = verifyOutput.violations ?? [];
    const blockingItems = verifyOutput.blockingItems ?? [];
    const advisoryItems = verifyOutput.advisoryItems ?? [];
    if (govEnvelope.length > 0)
        return govEnvelope;
    return [...violations, ...blockingItems, ...advisoryItems];
}
function buildPayload(finding, verifyOutput, projectRoot, replayChecksum, replayMode, format) {
    const ruleId = finding.ruleId ?? finding.rule ?? finding.structuralMetadata?.ruleId ?? 'UNKNOWN';
    const filePath = finding.filePath ?? finding.file ?? finding.evidence?.filePath ?? '';
    const line = finding.line ?? finding.evidence?.line ?? null;
    const column = finding.column ?? finding.evidence?.column ?? null;
    const severity = finding.severity ?? 'BLOCKING';
    const determinismClass = finding.determinismClassification ?? finding.determinism ?? 'deterministic-structural';
    const findingId = finding.id ?? finding.findingId ?? '';
    const ruleName = finding.title ?? finding.ruleName ?? finding.name ?? ruleId;
    const operationalExplanation = finding.operationalImplication ?? finding.message ?? finding.explanation ?? '';
    // Extract code span from file if it exists
    const { codeSpan, surroundingContext } = extractCodeSpan(projectRoot, filePath, line);
    // Deterministic export ID
    const exportId = (0, crypto_1.createHash)('sha256')
        .update(`${findingId}|${filePath}|${line ?? 0}|${ruleId}`)
        .digest('hex')
        .slice(0, 32);
    // Finding graph hash (deterministic over finding identity fields)
    const findingGraphHash = (0, crypto_1.createHash)('sha256')
        .update(`${ruleId}|${filePath}|${line ?? 0}|${severity}|${determinismClass}`)
        .digest('hex')
        .slice(0, 16);
    const remediationCategory = REMEDIATION_CATEGORY[ruleId] ?? 'general';
    const suggestedPromptHint = PROMPT_HINT[remediationCategory] ?? PROMPT_HINT['correctness'];
    const policyViolations = [];
    if (finding.structuralMetadata?.policyRef)
        policyViolations.push(finding.structuralMetadata.policyRef);
    if (finding.policy)
        policyViolations.push(finding.policy);
    const payload = {
        exportId,
        exportedAt: new Date().toISOString(),
        neurcodeVersion: '0.9.66',
        schemaVersion: '2026-05-12',
        findingId,
        ruleId,
        ruleName,
        severity,
        determinismClass,
        filePath,
        line,
        column,
        codeSpan,
        surroundingContext,
        policyViolations,
        operationalExplanation,
        remediationCategory,
        trustBoundaryStatement: TRUST_BOUNDARY_STATEMENT,
        replayChecksum,
        replayMode,
        findingGraphHash,
        provenanceRunId: finding.provenanceMetadata?.planId ?? null,
        provenanceAt: finding.provenanceMetadata?.generatedAt ?? null,
        suggestedPromptHint,
    };
    if (format === 'mcp') {
        payload.mcpEnvelope = {
            type: 'neurcode/remediation-request',
            version: '1.0',
            trust: 'deterministic-governance',
            finding: {
                id: findingId,
                ruleId,
                severity,
                file: filePath,
                line,
                codeSpan,
            },
            context: surroundingContext,
            constraint: TRUST_BOUNDARY_STATEMENT,
            promptHint: suggestedPromptHint,
        };
    }
    return payload;
}
function extractCodeSpan(projectRoot, filePath, line) {
    if (!filePath || line === null) {
        return { codeSpan: '(file or line not available)', surroundingContext: '' };
    }
    const fullPath = (0, path_1.resolve)(projectRoot, filePath);
    if (!(0, fs_1.existsSync)(fullPath)) {
        return { codeSpan: `(file not found: ${filePath})`, surroundingContext: '' };
    }
    try {
        const content = (0, fs_1.readFileSync)(fullPath, 'utf-8');
        const lines = content.split('\n');
        const zeroIdx = line - 1;
        const targetLine = lines[zeroIdx] ?? '';
        const contextStart = Math.max(0, zeroIdx - 5);
        const contextEnd = Math.min(lines.length - 1, zeroIdx + 5);
        const contextLines = [];
        for (let i = contextStart; i <= contextEnd; i++) {
            const prefix = i === zeroIdx ? '→ ' : '  ';
            contextLines.push(`${String(i + 1).padStart(4)} ${prefix}${lines[i]}`);
        }
        return {
            codeSpan: targetLine.trim(),
            surroundingContext: contextLines.join('\n'),
        };
    }
    catch {
        return { codeSpan: '(could not read file)', surroundingContext: '' };
    }
}
//# sourceMappingURL=remediate-export.js.map