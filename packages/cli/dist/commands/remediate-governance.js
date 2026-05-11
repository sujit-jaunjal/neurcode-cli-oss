"use strict";
/**
 * Governance-aligned remediation subcommands for the Neurcode CLI.
 *
 * These implement the provider-agnostic remediation architecture:
 *   neurcode remediate export    → export GovernanceRemediationRequest JSON
 *   neurcode remediate validate  → validate a patch against governance rules
 *   neurcode remediate status    → show remediation artifact status
 *
 * These are SEPARATE from the autonomous remediation loop in remediate.ts.
 * Governance remains deterministic throughout.
 * LLMs are optional and advisory — never autonomous.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.remediateExportCommand = remediateExportCommand;
exports.remediateValidateCommand = remediateValidateCommand;
exports.remediateStatusCommand = remediateStatusCommand;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const project_root_1 = require("../utils/project-root");
// Import chalk with fallback
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (s) => s,
        red: (s) => s,
        yellow: (s) => s,
        cyan: (s) => s,
        bold: (s) => s,
        dim: (s) => s,
    };
}
/**
 * neurcode remediate export
 *
 * Reads governance findings from a verify output JSON file and exports a
 * GovernanceRemediationRequest artifact for the selected finding.
 * No provider is invoked. No files are modified.
 */
async function remediateExportCommand(options = {}) {
    const projectRoot = options.projectRoot
        ? (0, path_1.resolve)(options.projectRoot)
        : (0, project_root_1.resolveNeurcodeProjectRoot)();
    const verifyOutputPath = options.verifyOutputFile
        ?? (0, path_1.join)(projectRoot, '.neurcode', 'last-verify-output.json');
    if (!(0, fs_1.existsSync)(verifyOutputPath)) {
        if (options.json) {
            console.log(JSON.stringify({ error: 'verify_output_not_found', path: verifyOutputPath }));
        }
        else {
            console.error(chalk.red(`❌ No verify output found at: ${verifyOutputPath}`));
            console.error(chalk.dim(`   Run: neurcode verify --json > .neurcode/last-verify-output.json`));
            console.error(chalk.dim(`   Or pass --verify-output-file <path>`));
        }
        process.exit(1);
    }
    let verifyOutput;
    try {
        verifyOutput = JSON.parse((0, fs_1.readFileSync)(verifyOutputPath, 'utf-8'));
    }
    catch {
        if (options.json) {
            console.log(JSON.stringify({ error: 'invalid_verify_output', path: verifyOutputPath }));
        }
        else {
            console.error(chalk.red(`❌ Failed to parse verify output at: ${verifyOutputPath}`));
        }
        process.exit(1);
    }
    const findings = verifyOutput.governanceFindings ?? [];
    if (findings.length === 0) {
        if (options.json) {
            console.log(JSON.stringify({ mode: 'export', findingsCount: 0, message: 'No governance findings to remediate.' }));
        }
        else {
            console.log(chalk.green('✅ No governance findings to remediate.'));
        }
        return;
    }
    // Select finding
    let selectedFinding;
    if (options.findingId) {
        selectedFinding = findings.find((f) => f.id === options.findingId);
        if (!selectedFinding) {
            if (options.json) {
                console.log(JSON.stringify({ error: 'finding_not_found', findingId: options.findingId }));
            }
            else {
                console.error(chalk.red(`❌ Finding "${options.findingId}" not found.`));
                findings.forEach((f) => console.error(chalk.dim(`     ${f.id}  (${f.title})`)));
            }
            process.exit(1);
        }
    }
    else if (options.findingIndex !== undefined) {
        selectedFinding = findings[options.findingIndex];
        if (!selectedFinding) {
            if (options.json) {
                console.log(JSON.stringify({ error: 'finding_index_out_of_range', index: options.findingIndex, total: findings.length }));
            }
            else {
                console.error(chalk.red(`❌ Finding index ${options.findingIndex} out of range (0–${findings.length - 1}).`));
            }
            process.exit(1);
        }
    }
    else {
        selectedFinding = findings.find((f) => f.severity === 'BLOCKING') ?? findings[0];
    }
    const provenanceRunId = verifyOutput.runId ??
        `verify_${(0, crypto_1.createHash)('sha256').update(verifyOutputPath).digest('hex').slice(0, 16)}`;
    // Build request
    let buildRequest;
    try {
        buildRequest = require('@neurcode-ai/remediation').buildRemediationRequest;
    }
    catch {
        if (options.json) {
            console.log(JSON.stringify({ error: 'remediation_package_not_built', hint: 'Run: pnpm --filter @neurcode-ai/remediation build' }));
        }
        else {
            console.error(chalk.red('❌ @neurcode-ai/remediation not built. Run: pnpm --filter @neurcode-ai/remediation build'));
        }
        process.exit(1);
    }
    const request = buildRequest(selectedFinding, provenanceRunId, { projectRoot });
    const artifactDir = (0, path_1.join)(projectRoot, '.neurcode', 'remediation');
    (0, fs_1.mkdirSync)(artifactDir, { recursive: true });
    const outputFile = options.outputFile
        ?? (0, path_1.join)(artifactDir, `request-${request.requestId}.json`);
    (0, fs_1.writeFileSync)(outputFile, JSON.stringify(request, null, 2), 'utf-8');
    if (options.json) {
        console.log(JSON.stringify({
            mode: 'export',
            requestId: request.requestId,
            findingId: selectedFinding.id,
            ruleId: selectedFinding.structuralMetadata?.ruleId ?? 'unknown',
            severity: selectedFinding.severity,
            filePath: selectedFinding.evidence.filePath,
            line: selectedFinding.evidence.line,
            artifactPath: outputFile,
            message: 'Remediation request exported. Feed to your preferred coding assistant.',
        }));
        return;
    }
    console.log(chalk.green('\n✅ Remediation request exported'));
    console.log(chalk.bold(`\nFinding: ${selectedFinding.title}`));
    console.log(chalk.dim(`Rule:     ${selectedFinding.structuralMetadata?.ruleId ?? '—'}`));
    console.log(chalk.dim(`Severity: ${selectedFinding.severity}`));
    console.log(chalk.dim(`File:     ${selectedFinding.evidence.filePath}:${selectedFinding.evidence.line ?? ''}`));
    console.log(chalk.cyan(`\nArtifact: ${outputFile}`));
    console.log('');
    console.log(chalk.bold('Next steps:'));
    console.log(chalk.dim('  1. Open the artifact in Cursor / Claude / Codex'));
    console.log(chalk.dim('  2. The "context.surroundingContext" field contains the exact violation'));
    console.log(chalk.dim('  3. Ask your assistant to generate a unified diff fixing the violation'));
    console.log(chalk.dim('  4. Save the diff and run:'));
    console.log(chalk.cyan(`       neurcode remediate validate --request-file "${outputFile}" --response-file <diff.patch>`));
    console.log(chalk.dim('  5. Then run: neurcode verify  (to confirm finding is resolved)'));
    console.log('');
}
/**
 * neurcode remediate validate
 *
 * Validates an LLM-generated (or manually written) patch against the
 * deterministic governance validation pipeline.
 * Never modifies files. Output is a validation receipt (append-only).
 */
async function remediateValidateCommand(options) {
    const projectRoot = options.projectRoot
        ? (0, path_1.resolve)(options.projectRoot)
        : (0, project_root_1.resolveNeurcodeProjectRoot)();
    if (!(0, fs_1.existsSync)(options.requestFile)) {
        if (options.json) {
            console.log(JSON.stringify({ error: 'request_file_not_found', path: options.requestFile }));
        }
        else {
            console.error(chalk.red(`❌ Request file not found: ${options.requestFile}`));
        }
        process.exit(1);
    }
    let request;
    try {
        request = JSON.parse((0, fs_1.readFileSync)(options.requestFile, 'utf-8'));
    }
    catch {
        if (options.json) {
            console.log(JSON.stringify({ error: 'invalid_request_file', path: options.requestFile }));
        }
        else {
            console.error(chalk.red(`❌ Failed to parse request file: ${options.requestFile}`));
        }
        process.exit(1);
    }
    // Resolve patch diff
    let patchDiff = '';
    if (options.responseDiff) {
        patchDiff = options.responseDiff;
    }
    else if (options.responseFile) {
        if (!(0, fs_1.existsSync)(options.responseFile)) {
            if (options.json) {
                console.log(JSON.stringify({ error: 'response_file_not_found', path: options.responseFile }));
            }
            else {
                console.error(chalk.red(`❌ Response file not found: ${options.responseFile}`));
            }
            process.exit(1);
        }
        const raw = (0, fs_1.readFileSync)(options.responseFile, 'utf-8');
        if (options.responseFile.endsWith('.json')) {
            try {
                const parsed = JSON.parse(raw);
                patchDiff = parsed.patchDiff ?? raw;
            }
            catch {
                patchDiff = raw;
            }
        }
        else {
            patchDiff = raw;
        }
    }
    if (!patchDiff.trim()) {
        if (options.json) {
            console.log(JSON.stringify({ error: 'empty_patch_diff', message: 'Provide --response-diff or --response-file with a valid unified diff.' }));
        }
        else {
            console.error(chalk.red('❌ Empty patch diff. Provide --response-diff "<diff>" or --response-file <path>'));
        }
        process.exit(1);
    }
    // Synthetic response
    const response = {
        schemaVersion: '2026-05-11.1',
        responseId: `resp_manual_${(0, crypto_1.createHash)('sha256').update(patchDiff).digest('hex').slice(0, 16)}`,
        requestId: request.requestId ?? '',
        createdAt: new Date().toISOString(),
        provider: { providerId: 'manual', providerName: 'Manual / Engineer-supplied patch' },
        patchDiff,
        status: 'generated',
        explanation: 'Manually supplied patch for governance validation.',
        providerConfidence: 1.0,
        requiresManualReview: true,
        postconditions: [],
    };
    let validateFn;
    try {
        validateFn = require('@neurcode-ai/remediation').validateRemediationResponse;
    }
    catch {
        if (options.json) {
            console.log(JSON.stringify({ error: 'remediation_package_not_built', hint: 'Run: pnpm --filter @neurcode-ai/remediation build' }));
        }
        else {
            console.error(chalk.red('❌ @neurcode-ai/remediation not built. Run: pnpm --filter @neurcode-ai/remediation build'));
        }
        process.exit(1);
    }
    const result = validateFn(request, response, { projectRoot });
    const receipt = result.receipt;
    const artifactDir = (0, path_1.join)(projectRoot, '.neurcode', 'remediation');
    (0, fs_1.mkdirSync)(artifactDir, { recursive: true });
    const receiptPath = (0, path_1.join)(artifactDir, `receipt-${receipt.receiptId}.json`);
    (0, fs_1.writeFileSync)(receiptPath, JSON.stringify(result, null, 2), 'utf-8');
    if (options.json) {
        console.log(JSON.stringify({ ...result, receiptArtifactPath: receiptPath }));
        process.exit(result.valid ? 0 : 2);
    }
    const valid = result.valid;
    const safeToApply = result.safeToApply;
    const findingResolved = result.findingResolved;
    const blockingErrors = result.blockingErrors;
    const warnings = result.warnings;
    const verdict = receipt.verdict;
    console.log(valid
        ? chalk.green('\n✅ Patch validation PASSED')
        : chalk.red('\n❌ Patch validation FAILED'));
    console.log('');
    console.log(chalk.dim(`Original finding resolved: ${findingResolved ? '✅ yes' : '❌ no'}`));
    console.log(chalk.dim(`Safe to apply:             ${safeToApply ? '✅ yes' : '❌ no'}`));
    console.log(chalk.dim(`Verdict:                   ${verdict}`));
    if (blockingErrors.length > 0) {
        console.log(chalk.red('\nBlocking errors:'));
        blockingErrors.forEach((e) => console.log(chalk.red(`  • ${e}`)));
    }
    if (warnings.length > 0) {
        console.log(chalk.yellow('\nWarnings:'));
        warnings.forEach((w) => console.log(chalk.yellow(`  ⚠  ${w}`)));
    }
    console.log(chalk.dim(`\nValidation receipt: ${receiptPath}`));
    if (valid) {
        console.log('');
        console.log(chalk.bold('Patch is valid. Next steps:'));
        console.log(chalk.dim(`  1. Apply the patch: patch -p1 < ${options.responseFile ?? '<diff>'}`));
        console.log(chalk.dim('  2. Review the changes'));
        console.log(chalk.dim('  3. Run: neurcode verify'));
        console.log(chalk.dim('  4. Commit if governance passes'));
    }
    else {
        console.log('');
        console.log(chalk.bold('Patch is invalid. Do not apply.'));
        console.log(chalk.dim('  Fix the issues above, regenerate the patch, and re-validate.'));
    }
    console.log('');
    process.exit(valid ? 0 : 2);
}
/**
 * neurcode remediate status
 *
 * Shows the status of all remediation artifacts in .neurcode/remediation/.
 */
async function remediateStatusCommand(options = {}) {
    const projectRoot = options.projectRoot
        ? (0, path_1.resolve)(options.projectRoot)
        : (0, project_root_1.resolveNeurcodeProjectRoot)();
    const artifactDir = (0, path_1.join)(projectRoot, '.neurcode', 'remediation');
    let requestCount = 0;
    let receiptCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    if ((0, fs_1.existsSync)(artifactDir)) {
        const { readdirSync } = require('fs');
        const files = readdirSync(artifactDir);
        requestCount = files.filter((f) => f.startsWith('request-')).length;
        receiptCount = files.filter((f) => f.startsWith('receipt-')).length;
        for (const f of files.filter((fn) => fn.startsWith('receipt-'))) {
            try {
                const r = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(artifactDir, f), 'utf-8'));
                const v = r.receipt?.verdict ?? r.verdict;
                if (v === 'approved')
                    approvedCount++;
                else if (v === 'rejected')
                    rejectedCount++;
            }
            catch { /* skip */ }
        }
    }
    const status = {
        artifactDir,
        requestCount,
        receiptCount,
        approvedCount,
        rejectedCount,
        message: requestCount === 0
            ? 'No remediation requests yet. Run: neurcode remediate export'
            : `${requestCount} request(s), ${receiptCount} validation receipt(s) — ${approvedCount} approved, ${rejectedCount} rejected.`,
    };
    if (options.json) {
        console.log(JSON.stringify(status));
        return;
    }
    console.log(chalk.bold('\nNeurcode Remediation Status'));
    console.log(chalk.dim(`Artifact dir: ${artifactDir}`));
    console.log('');
    console.log(chalk.dim(`Requests:  ${requestCount}`));
    console.log(chalk.dim(`Receipts:  ${receiptCount}  (${approvedCount} approved, ${rejectedCount} rejected)`));
    console.log('');
    console.log(chalk.dim(status.message));
    console.log('');
    if (requestCount === 0) {
        console.log(chalk.bold('Governance-aligned remediation workflow:'));
        console.log(chalk.dim('  1. neurcode verify --json > .neurcode/last-verify-output.json'));
        console.log(chalk.dim('  2. neurcode remediate export'));
        console.log(chalk.dim('  3. Feed the exported request to Cursor / Claude / Codex'));
        console.log(chalk.dim('  4. neurcode remediate validate --request-file <req> --response-file <diff>'));
        console.log(chalk.dim('  5. neurcode verify  (confirm fix resolves finding)'));
        console.log('');
    }
}
//# sourceMappingURL=remediate-governance.js.map