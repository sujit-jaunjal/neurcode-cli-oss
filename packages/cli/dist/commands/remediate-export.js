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
 *   neurcode remediate-export --verify-output-file ./verify.json --project-root ./repo
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
    governance_decision_block: 'governance-boundary',
    scope_guard: 'governance-boundary',
    'drift_narrative:service-boundary-escape': 'governance-boundary',
    'drift_narrative:dependency-expansion': 'governance-boundary',
    'drift_narrative:forbidden-boundary-breach': 'governance-boundary',
    'drift_narrative:semantic-coupling': 'governance-boundary',
    'drift_narrative:blast-radius-expansion': 'governance-boundary',
    'drift_narrative:localized-scope-drift': 'governance-boundary',
    'drift_narrative:ownership-boundary-breach': 'governance-boundary',
    'drift_narrative:architectural-invariant-erosion': 'governance-boundary',
    'drift_narrative:runtime-behavior-shift': 'governance-boundary',
    'drift_narrative:deployment-semantics-breach': 'governance-boundary',
    'drift_narrative:state-ownership-erosion': 'governance-boundary',
    'drift_intelligence:cross-service': 'governance-boundary',
    'drift_intelligence:dependency-spread': 'governance-boundary',
    'drift_intelligence:infra-leakage': 'governance-boundary',
    'drift_intelligence:sensitive-boundary': 'governance-boundary',
    'drift_intelligence:blast-radius': 'governance-boundary',
    'drift_intelligence:rollout-risk': 'governance-boundary',
    'drift_intelligence:runtime-coupling': 'governance-boundary',
    'drift_intelligence:architectural-leakage': 'governance-boundary',
    'drift_intelligence:layer-violation': 'governance-boundary',
    'drift_intelligence:contract-misuse': 'governance-boundary',
    'drift_intelligence:ownership-inversion': 'governance-boundary',
    'drift_intelligence:responsibility-drift': 'governance-boundary',
    'drift_intelligence:invariant-violation': 'governance-boundary',
    'drift_intelligence:behavioral-drift': 'governance-boundary',
    'drift_intelligence:deployment-coupling': 'governance-boundary',
    'drift_intelligence:state-ownership-risk': 'governance-boundary',
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
    'governance-boundary': 'The finding identifies engineering drift outside the approved intent envelope. ' +
        'Remediation should pull the change back inside the declared service, dependency, and rollout boundary before re-verification.',
};
async function remediateExportCommand(options) {
    const projectRoot = options.projectRoot ? (0, path_1.resolve)(options.projectRoot) : process.cwd();
    const verifyPath = options.verifyOutputFile
        ? (0, path_1.resolve)(options.verifyOutputFile)
        : (0, path_1.join)(projectRoot, '.neurcode', 'last-verify-output.json');
    if (!(0, fs_1.existsSync)(verifyPath)) {
        console.error(chalk.red('✗ No verify output found.'));
        console.error(chalk.dim(`  Expected: ${verifyPath}`));
        console.error(chalk.dim('  Run: neurcode verify --policy-only --json'));
        console.error(chalk.dim('  Or pass: neurcode remediate-export --verify-output-file <path-to-verify.json>'));
        process.exit(1);
    }
    let verifyOutput;
    try {
        verifyOutput = JSON.parse((0, fs_1.readFileSync)(verifyPath, 'utf-8'));
    }
    catch {
        console.error(chalk.red(`✗ Could not parse verify output: ${verifyPath}`));
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
    const replayChecksum = resolveReplayChecksum(verifyOutput);
    const replayMode = resolveReplayMode(verifyOutput);
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
    const ruleId = resolveFindingRuleId(finding);
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
    const snapshotIds = Array.isArray(finding.replayMetadata?.snapshotIds)
        ? finding.replayMetadata.snapshotIds.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
        : [];
    const controlPlaneSnapshotId = typeof verifyOutput.controlPlaneSnapshotId === 'string'
        ? verifyOutput.controlPlaneSnapshotId
        : snapshotIds.find((entry) => entry.startsWith('cps-')) ?? null;
    const workspaceSnapshotId = typeof verifyOutput.workspaceSnapshotId === 'string'
        ? verifyOutput.workspaceSnapshotId
        : snapshotIds.find((entry) => entry.startsWith('wss-')) ?? null;
    const policyViolations = [];
    if (finding.structuralMetadata?.policyRef)
        policyViolations.push(finding.structuralMetadata.policyRef);
    if (finding.policy)
        policyViolations.push(finding.policy);
    const blastRadiusRisk = typeof verifyOutput.blastRadius === 'object'
        && verifyOutput.blastRadius
        && typeof verifyOutput.blastRadius.riskScore === 'string'
        ? verifyOutput.blastRadius.riskScore
        : null;
    const scopeReason = typeof verifyOutput.suspiciousChange === 'object'
        && verifyOutput.suspiciousChange
        && typeof verifyOutput.suspiciousChange.reason === 'string'
        ? verifyOutput.suspiciousChange.reason
        : null;
    const scopeUnexpectedFiles = typeof verifyOutput.suspiciousChange === 'object'
        && verifyOutput.suspiciousChange
        && Array.isArray(verifyOutput.suspiciousChange.unexpectedFiles)
        ? verifyOutput.suspiciousChange.unexpectedFiles
            .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
            .slice(0, 12)
        : [];
    const contractViolationSummary = typeof verifyOutput.changeContract === 'object'
        && verifyOutput.changeContract
        && Array.isArray(verifyOutput.changeContract.violations)
        ? verifyOutput.changeContract.violations
            .map((entry) => typeof entry.message === 'string' ? entry.message.trim() : '')
            .filter((entry) => entry.length > 0)
            .slice(0, 12)
        : [];
    const engineeringContext = extractEngineeringContext(verifyOutput);
    const intentGovernance = extractIntentGovernance(verifyOutput);
    const driftIntelligence = extractDriftIntelligence(verifyOutput);
    const graphImpact = extractGraphImpact(verifyOutput);
    const relevantNarratives = selectRelevantNarratives(driftIntelligence, filePath, ruleId);
    const semanticInsights = deriveSemanticExportInsights(engineeringContext, driftIntelligence, relevantNarratives, filePath);
    const payload = {
        exportId,
        exportedAt: new Date().toISOString(),
        neurcodeVersion: '0.12.0',
        schemaVersion: '2026-05-14',
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
        blastRadiusRisk,
        scopeReason,
        scopeUnexpectedFiles,
        contractViolationSummary,
        violatedContracts: semanticInsights.violatedContracts,
        ownershipBoundaryCrossed: semanticInsights.ownershipBoundaryCrossed,
        invariantSummaries: semanticInsights.invariantSummaries,
        semanticRiskSummary: semanticInsights.semanticRiskSummary,
        intentGovernance,
        trustBoundaryStatement: TRUST_BOUNDARY_STATEMENT,
        replayChecksum,
        replayMode,
        findingGraphHash,
        provenanceRunId: finding.provenanceMetadata?.runId ?? verifyOutput.provenanceRunId ?? null,
        provenanceAt: finding.provenanceMetadata?.generatedAt ?? verifyOutput.provenanceRunAt ?? null,
        planId: finding.provenanceMetadata?.planId ?? verifyOutput.planId ?? null,
        policyLockFingerprint: finding.provenanceMetadata?.policyLockFingerprint ?? verifyOutput.policyLockFingerprint ?? null,
        compiledPolicyFingerprint: finding.provenanceMetadata?.compiledPolicyFingerprint ?? verifyOutput.compiledPolicyFingerprint ?? null,
        controlPlaneSnapshotId,
        workspaceSnapshotId,
        engineeringContext,
        driftIntelligence,
        graphImpact,
        relevantNarratives,
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
            context: buildMcpContext(surroundingContext, engineeringContext, driftIntelligence, graphImpact, relevantNarratives, semanticInsights, intentGovernance),
            constraint: TRUST_BOUNDARY_STATEMENT,
            promptHint: suggestedPromptHint,
        };
    }
    return payload;
}
function resolveFindingRuleId(finding) {
    const direct = finding.ruleId
        ?? finding.rule
        ?? finding.structuralMetadata?.ruleId
        ?? null;
    if (typeof direct === 'string' && direct.trim().length > 0) {
        return direct.trim();
    }
    const title = typeof finding.title === 'string' ? finding.title.trim() : '';
    const titleMatch = title.match(/·\s*([A-Za-z0-9:_-]+)/);
    if (titleMatch?.[1]) {
        return titleMatch[1];
    }
    return 'UNKNOWN';
}
function asRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value;
}
function asStringArray(value, limit = 12) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
        .slice(0, limit);
}
function extractGovernanceDecisionLineage(value) {
    const record = asRecord(value);
    if (!record)
        return null;
    return {
        decisionId: typeof record.decisionId === 'string' ? record.decisionId : 'unknown',
        state: typeof record.state === 'string' ? record.state : 'acknowledged',
        findingId: typeof record.findingId === 'string' ? record.findingId : null,
        category: typeof record.category === 'string' ? record.category : null,
        reason: typeof record.reason === 'string' ? record.reason : 'Governance decision reason unavailable.',
        actor: typeof record.actor === 'string' ? record.actor : 'unknown',
        decidedAt: typeof record.decidedAt === 'string' ? record.decidedAt : '',
        expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : null,
        temporary: record.temporary === true,
        expired: record.expired === true,
        previousGate: typeof record.previousGate === 'string' ? record.previousGate : null,
        resultingGate: typeof record.resultingGate === 'string' ? record.resultingGate : null,
        previousRolloutTrust: typeof record.previousRolloutTrust === 'string' ? record.previousRolloutTrust : null,
        resultingRolloutTrust: typeof record.resultingRolloutTrust === 'string' ? record.resultingRolloutTrust : null,
        sourcePath: typeof record.sourcePath === 'string' ? record.sourcePath : null,
        lineageHash: typeof record.lineageHash === 'string' ? record.lineageHash : 'unknown',
    };
}
function asBoundaryArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => asRecord(entry))
        .filter((entry) => entry !== null)
        .map((entry) => ({
        type: typeof entry.type === 'string' ? entry.type : 'unknown',
        path: typeof entry.path === 'string' ? entry.path : '',
        policy: typeof entry.policy === 'string' ? entry.policy : 'review-required',
        reason: typeof entry.reason === 'string' ? entry.reason : '',
    }))
        .filter((entry) => entry.path.trim().length > 0)
        .slice(0, 12);
}
function extractEngineeringContext(verifyOutput) {
    const context = asRecord(verifyOutput.engineeringContext);
    if (!context) {
        return null;
    }
    const approvedScope = asRecord(context.approvedScope);
    const semanticExpectations = asRecord(context.semanticExpectations);
    return {
        source: typeof context.source === 'string' ? context.source : null,
        sessionId: typeof context.sessionId === 'string' ? context.sessionId : null,
        intentPackId: typeof context.intentPackId === 'string' ? context.intentPackId : null,
        contextPackId: typeof context.contextPackId === 'string' ? context.contextPackId : null,
        repositoryGraphId: typeof context.repositoryGraphId === 'string' ? context.repositoryGraphId : null,
        intentSummary: typeof context.intentSummary === 'string' ? context.intentSummary : null,
        approvedScope: {
            files: asStringArray(approvedScope?.files, 20),
            modules: asStringArray(approvedScope?.modules, 20),
            services: asStringArray(approvedScope?.services, 20),
        },
        expectedDependencies: asStringArray(context.expectedDependencies, 20),
        expectedInfrastructure: asStringArray(context.expectedInfrastructure, 20),
        rolloutExpectations: asStringArray(context.rolloutExpectations, 12),
        forbiddenBoundaries: asBoundaryArray(context.forbiddenBoundaries),
        semanticExpectations: semanticExpectations
            ? {
                ownershipBoundaries: asStringArray(semanticExpectations.ownershipBoundaries, 16),
                contractIds: asStringArray(semanticExpectations.contractIds, 20),
                invariantIds: asStringArray(semanticExpectations.invariantIds, 20),
                expectedResponsibilities: asStringArray(semanticExpectations.expectedResponsibilities, 20),
                expectedBehaviorKinds: asStringArray(semanticExpectations.expectedBehaviorKinds, 20),
                expectedRuntimeFlows: asStringArray(semanticExpectations.expectedRuntimeFlows, 20),
                expectedRolloutUnits: asStringArray(semanticExpectations.expectedRolloutUnits, 20),
            }
            : null,
        contextFiles: Array.isArray(context.contextFiles)
            ? context.contextFiles
                .map((entry) => asRecord(entry))
                .filter((entry) => entry !== null)
                .map((entry) => (typeof entry.path === 'string' ? entry.path : ''))
                .filter((entry) => entry.length > 0)
                .slice(0, 16)
            : [],
        relatedModules: asStringArray(context.relatedModules, 20),
        serviceBoundaries: Array.isArray(context.serviceBoundaries)
            ? context.serviceBoundaries
                .map((entry) => asRecord(entry))
                .filter((entry) => entry !== null)
                .map((entry) => `${typeof entry.name === 'string' ? entry.name : 'unknown'}:${typeof entry.path === 'string' ? entry.path : ''}`)
                .filter((entry) => !entry.endsWith(':'))
                .slice(0, 16)
            : [],
        ownershipBoundaries: Array.isArray(context.ownershipBoundaries)
            ? context.ownershipBoundaries
                .map((entry) => asRecord(entry))
                .filter((entry) => entry !== null)
                .map((entry) => ({
                name: typeof entry.name === 'string' ? entry.name : 'unknown',
                domain: typeof entry.domain === 'string' ? entry.domain : 'unknown',
                kind: typeof entry.kind === 'string' ? entry.kind : 'unknown',
                primaryOwner: typeof entry.primaryOwner === 'string' ? entry.primaryOwner : 'unknown',
                responsibilities: asStringArray(entry.responsibilities, 12),
                forbiddenResponsibilities: asStringArray(entry.forbiddenResponsibilities, 12),
                criticality: typeof entry.criticality === 'string' ? entry.criticality : 'standard',
            }))
                .slice(0, 16)
            : [],
        invariants: Array.isArray(context.invariants)
            ? context.invariants
                .map((entry) => asRecord(entry))
                .filter((entry) => entry !== null)
                .map((entry) => ({
                id: typeof entry.id === 'string' ? entry.id : 'unknown',
                name: typeof entry.name === 'string' ? entry.name : 'Invariant',
                category: typeof entry.category === 'string' ? entry.category : 'unknown',
                expectation: typeof entry.expectation === 'string' ? entry.expectation : 'Expectation unavailable.',
                impact: typeof entry.impact === 'string' ? entry.impact : 'unknown',
                boundaryName: typeof entry.boundaryName === 'string' ? entry.boundaryName : null,
            }))
                .slice(0, 20)
            : [],
        invariantMemory: (() => {
            const memory = asRecord(context.invariantMemory);
            if (!memory)
                return null;
            return {
                invariantMemoryId: typeof memory.invariantMemoryId === 'string' ? memory.invariantMemoryId : null,
                historicalDriftPatterns: Array.isArray(memory.historicalDriftPatterns)
                    ? memory.historicalDriftPatterns
                        .map((entry) => asRecord(entry))
                        .filter((entry) => entry !== null)
                        .map((entry) => ({
                        category: typeof entry.category === 'string' ? entry.category : 'unknown',
                        count: typeof entry.count === 'number' ? entry.count : 0,
                        latestSummary: typeof entry.latestSummary === 'string' ? entry.latestSummary : '',
                    }))
                        .slice(0, 12)
                    : [],
            };
        })(),
        runtimeBehaviors: Array.isArray(context.runtimeBehaviors)
            ? context.runtimeBehaviors
                .map((entry) => asRecord(entry))
                .filter((entry) => entry !== null)
                .map((entry) => ({
                boundaryName: typeof entry.boundaryName === 'string' ? entry.boundaryName : 'unknown',
                behaviorKinds: asStringArray(entry.behaviorKinds, 12),
                sideEffectKinds: asStringArray(entry.sideEffectKinds, 12),
                stateSurfaces: asStringArray(entry.stateSurfaces, 12),
                rolloutUnits: asStringArray(entry.rolloutUnits, 12),
                runtimeEnvironments: asStringArray(entry.runtimeEnvironments, 8),
                criticalFlows: asStringArray(entry.criticalFlows, 12),
            }))
                .slice(0, 20)
            : [],
        runtimeInteractions: Array.isArray(context.runtimeInteractions)
            ? context.runtimeInteractions
                .map((entry) => asRecord(entry))
                .filter((entry) => entry !== null)
                .map((entry) => ({
                kind: typeof entry.kind === 'string' ? entry.kind : 'unknown',
                fromBoundaryName: typeof entry.fromBoundaryName === 'string' ? entry.fromBoundaryName : 'unknown',
                toBoundaryName: typeof entry.toBoundaryName === 'string' ? entry.toBoundaryName : null,
                subject: typeof entry.subject === 'string' ? entry.subject : 'unknown',
                rationale: typeof entry.rationale === 'string' ? entry.rationale : '',
            }))
                .slice(0, 24)
            : [],
        deploymentBoundaries: Array.isArray(context.deploymentBoundaries)
            ? context.deploymentBoundaries
                .map((entry) => asRecord(entry))
                .filter((entry) => entry !== null)
                .map((entry) => ({
                name: typeof entry.name === 'string' ? entry.name : 'unknown',
                type: typeof entry.type === 'string' ? entry.type : 'unknown',
                rolloutUnits: asStringArray(entry.rolloutUnits, 12),
                runtimeEnvironments: asStringArray(entry.runtimeEnvironments, 8),
                dependentBoundaryNames: asStringArray(entry.dependentBoundaryNames, 12),
            }))
                .slice(0, 16)
            : [],
        sessionLineage: asStringArray(context.sessionLineage, 12),
    };
}
function extractDriftIntelligence(verifyOutput) {
    const drift = asRecord(verifyOutput.driftIntelligence);
    if (!drift) {
        return null;
    }
    const findings = Array.isArray(drift.findings)
        ? drift.findings
            .map((entry) => asRecord(entry))
            .filter((entry) => entry !== null)
            .map((entry) => {
            const evidence = asRecord(entry.evidence);
            const remediationGuidance = asRecord(entry.remediationGuidance);
            return {
                category: typeof entry.category === 'string' ? entry.category : 'unknown',
                severity: typeof entry.severity === 'string' ? entry.severity : 'unknown',
                message: typeof entry.message === 'string' ? entry.message : 'Drift signal detected.',
                rationale: typeof entry.rationale === 'string' ? entry.rationale : null,
                file: typeof entry.file === 'string' ? entry.file : null,
                module: typeof entry.module === 'string' ? entry.module : null,
                service: typeof entry.service === 'string' ? entry.service : null,
                evidenceTier: typeof entry.evidenceTier === 'string' ? entry.evidenceTier : null,
                actionability: typeof entry.actionability === 'string' ? entry.actionability : null,
                priority: typeof entry.priority === 'string' ? entry.priority : null,
                governanceGate: typeof entry.governanceGate === 'string' ? entry.governanceGate : null,
                rolloutTrust: typeof entry.rolloutTrust === 'string' ? entry.rolloutTrust : null,
                relationships: Array.isArray(entry.relationships)
                    ? entry.relationships
                        .map((relationship) => asRecord(relationship))
                        .filter((relationship) => relationship !== null)
                        .map((relationship) => ({
                        type: typeof relationship.type === 'string' ? relationship.type : 'derived-from',
                        targetFindingId: typeof relationship.targetFindingId === 'string'
                            ? relationship.targetFindingId
                            : '',
                        rationale: typeof relationship.rationale === 'string'
                            ? relationship.rationale
                            : 'Finding relationship rationale unavailable.',
                    }))
                        .filter((relationship) => relationship.targetFindingId.length > 0)
                        .slice(0, 4)
                    : [],
                governanceDecision: extractGovernanceDecisionLineage(entry.governanceDecision),
                evidence: evidence
                    ? {
                        tier: typeof evidence.tier === 'string' ? evidence.tier : null,
                        changedFiles: asStringArray(evidence.changedFiles, 8),
                        changedLines: Array.isArray(evidence.changedLines)
                            ? evidence.changedLines
                                .map((line) => asRecord(line))
                                .filter((line) => line !== null)
                                .map((line) => ({
                                file: typeof line.file === 'string' ? line.file : 'unknown',
                                line: typeof line.line === 'number' ? line.line : 0,
                                text: typeof line.text === 'string' ? line.text : '',
                            }))
                                .filter((line) => line.line > 0 || line.text.length > 0)
                                .slice(0, 8)
                            : [],
                        dependencyEdges: asStringArray(evidence.dependencyEdges, 8),
                        boundary: typeof evidence.boundary === 'string' ? evidence.boundary : null,
                        explanation: typeof evidence.explanation === 'string' ? evidence.explanation : null,
                    }
                    : null,
                remediationGuidance: remediationGuidance
                    ? {
                        actionability: typeof remediationGuidance.actionability === 'string'
                            ? remediationGuidance.actionability
                            : null,
                        evidenceTier: typeof remediationGuidance.evidenceTier === 'string'
                            ? remediationGuidance.evidenceTier
                            : null,
                        minimalCorrection: typeof remediationGuidance.minimalCorrection === 'string'
                            ? remediationGuidance.minimalCorrection
                            : null,
                        boundaryToPreserve: typeof remediationGuidance.boundaryToPreserve === 'string'
                            ? remediationGuidance.boundaryToPreserve
                            : null,
                        verifyAfterRemediation: typeof remediationGuidance.verifyAfterRemediation === 'string'
                            ? remediationGuidance.verifyAfterRemediation
                            : null,
                        uncertainty: asStringArray(remediationGuidance.uncertainty, 6),
                    }
                    : null,
            };
        })
            .slice(0, 8)
        : [];
    const narratives = Array.isArray(drift.narratives)
        ? drift.narratives
            .map((entry) => asRecord(entry))
            .filter((entry) => entry !== null)
            .map((entry) => ({
            category: typeof entry.category === 'string' ? entry.category : 'unknown',
            severity: typeof entry.severity === 'string' ? entry.severity : 'unknown',
            summary: typeof entry.summary === 'string' ? entry.summary : 'Compressed governance narrative detected.',
            rootCause: typeof entry.rootCause === 'string' ? entry.rootCause : 'Root cause unavailable.',
            operationalRisk: typeof entry.operationalRisk === 'string' ? entry.operationalRisk : 'Operational risk unavailable.',
            remediationBoundary: typeof entry.remediationBoundary === 'string' ? entry.remediationBoundary : 'Keep remediation inside the approved scope.',
            causalChain: asStringArray(entry.causalChain, 8),
            affectedFiles: asStringArray(entry.affectedFiles, 16),
            affectedModules: asStringArray(entry.affectedModules, 16),
            affectedServices: asStringArray(entry.affectedServices, 16),
        }))
            .slice(0, 6)
        : [];
    const riskSynthesisRecord = asRecord(drift.riskSynthesis);
    const priorityCountsRecord = asRecord(riskSynthesisRecord?.priorityCounts);
    const governancePostureRecord = asRecord(drift.governancePosture);
    const posturePriorityCountsRecord = asRecord(governancePostureRecord?.priorityCounts);
    const governanceDecisionsRecord = asRecord(drift.governanceDecisions);
    return {
        source: typeof drift.source === 'string' ? drift.source : null,
        confidence: typeof drift.confidence === 'string' ? drift.confidence : null,
        rolloutRisk: typeof drift.rolloutRisk === 'string' ? drift.rolloutRisk : null,
        unexpectedFiles: asStringArray(drift.unexpectedFiles, 20),
        unexpectedModules: asStringArray(drift.unexpectedModules, 20),
        unexpectedServices: asStringArray(drift.unexpectedServices, 20),
        impactedModules: asStringArray(drift.impactedModules, 20),
        impactedServices: asStringArray(drift.impactedServices, 20),
        impactedRuntimeFlows: asStringArray(drift.impactedRuntimeFlows, 20),
        affectedRolloutUnits: asStringArray(drift.affectedRolloutUnits, 20),
        findings,
        narratives,
        riskSynthesis: riskSynthesisRecord
            ? {
                overallRisk: typeof riskSynthesisRecord.overallRisk === 'string' ? riskSynthesisRecord.overallRisk : null,
                summary: typeof riskSynthesisRecord.summary === 'string' ? riskSynthesisRecord.summary : null,
                primaryNarratives: asStringArray(riskSynthesisRecord.primaryNarratives, 6),
                rawFindingCount: typeof riskSynthesisRecord.rawFindingCount === 'number' ? riskSynthesisRecord.rawFindingCount : null,
                compressedNarrativeCount: typeof riskSynthesisRecord.compressedNarrativeCount === 'number'
                    ? riskSynthesisRecord.compressedNarrativeCount
                    : null,
                authExposure: riskSynthesisRecord.authExposure === true,
                infraExposure: riskSynthesisRecord.infraExposure === true,
                deploymentExposure: riskSynthesisRecord.deploymentExposure === true,
                dependencyExposure: riskSynthesisRecord.dependencyExposure === true,
                transitiveImpactCount: typeof riskSynthesisRecord.transitiveImpactCount === 'number'
                    ? riskSynthesisRecord.transitiveImpactCount
                    : null,
                runtimeFlowExposure: riskSynthesisRecord.runtimeFlowExposure === true,
                externalSideEffectExposure: riskSynthesisRecord.externalSideEffectExposure === true,
                stateOwnershipExposure: riskSynthesisRecord.stateOwnershipExposure === true,
                affectedRolloutUnits: asStringArray(riskSynthesisRecord.affectedRolloutUnits, 12),
                cascadingRisk: typeof riskSynthesisRecord.cascadingRisk === 'string'
                    ? riskSynthesisRecord.cascadingRisk
                    : null,
                rolloutTrust: typeof riskSynthesisRecord.rolloutTrust === 'string'
                    ? riskSynthesisRecord.rolloutTrust
                    : null,
                governanceGate: typeof riskSynthesisRecord.governanceGate === 'string'
                    ? riskSynthesisRecord.governanceGate
                    : null,
                postureSummary: typeof riskSynthesisRecord.postureSummary === 'string'
                    ? riskSynthesisRecord.postureSummary
                    : null,
                priorityCounts: priorityCountsRecord
                    ? {
                        p0RolloutBlockers: typeof priorityCountsRecord.p0RolloutBlockers === 'number'
                            ? priorityCountsRecord.p0RolloutBlockers
                            : 0,
                        p1ArchitectureBlockers: typeof priorityCountsRecord.p1ArchitectureBlockers === 'number'
                            ? priorityCountsRecord.p1ArchitectureBlockers
                            : 0,
                        p2ReviewRequired: typeof priorityCountsRecord.p2ReviewRequired === 'number'
                            ? priorityCountsRecord.p2ReviewRequired
                            : 0,
                        p3Advisory: typeof priorityCountsRecord.p3Advisory === 'number'
                            ? priorityCountsRecord.p3Advisory
                            : 0,
                    }
                    : null,
                remediationOrder: asStringArray(riskSynthesisRecord.remediationOrder, 12),
            }
            : null,
        governancePosture: governancePostureRecord
            ? {
                rolloutTrust: typeof governancePostureRecord.rolloutTrust === 'string'
                    ? governancePostureRecord.rolloutTrust
                    : null,
                governanceGate: typeof governancePostureRecord.governanceGate === 'string'
                    ? governancePostureRecord.governanceGate
                    : null,
                summary: typeof governancePostureRecord.summary === 'string'
                    ? governancePostureRecord.summary
                    : null,
                reasons: asStringArray(governancePostureRecord.reasons, 6),
                priorityCounts: posturePriorityCountsRecord
                    ? {
                        p0RolloutBlockers: typeof posturePriorityCountsRecord.p0RolloutBlockers === 'number'
                            ? posturePriorityCountsRecord.p0RolloutBlockers
                            : 0,
                        p1ArchitectureBlockers: typeof posturePriorityCountsRecord.p1ArchitectureBlockers === 'number'
                            ? posturePriorityCountsRecord.p1ArchitectureBlockers
                            : 0,
                        p2ReviewRequired: typeof posturePriorityCountsRecord.p2ReviewRequired === 'number'
                            ? posturePriorityCountsRecord.p2ReviewRequired
                            : 0,
                        p3Advisory: typeof posturePriorityCountsRecord.p3Advisory === 'number'
                            ? posturePriorityCountsRecord.p3Advisory
                            : 0,
                    }
                    : null,
                remediationOrder: asStringArray(governancePostureRecord.remediationOrder, 12),
            }
            : null,
        governanceDecisions: governanceDecisionsRecord
            ? {
                sourcePath: typeof governanceDecisionsRecord.sourcePath === 'string'
                    ? governanceDecisionsRecord.sourcePath
                    : null,
                decisionsApplied: typeof governanceDecisionsRecord.decisionsApplied === 'number'
                    ? governanceDecisionsRecord.decisionsApplied
                    : 0,
                activeOverrides: typeof governanceDecisionsRecord.activeOverrides === 'number'
                    ? governanceDecisionsRecord.activeOverrides
                    : 0,
                expiredOverrides: typeof governanceDecisionsRecord.expiredOverrides === 'number'
                    ? governanceDecisionsRecord.expiredOverrides
                    : 0,
                findingsChanged: typeof governanceDecisionsRecord.findingsChanged === 'number'
                    ? governanceDecisionsRecord.findingsChanged
                    : 0,
                lineage: Array.isArray(governanceDecisionsRecord.lineage)
                    ? governanceDecisionsRecord.lineage
                        .map((entry) => extractGovernanceDecisionLineage(entry))
                        .filter((entry) => entry !== null)
                        .slice(0, 12)
                    : [],
            }
            : null,
    };
}
function extractIntentGovernance(verifyOutput) {
    const intentGovernance = asRecord(verifyOutput.intentGovernance);
    if (!intentGovernance) {
        return null;
    }
    return {
        source: typeof intentGovernance.source === 'string' ? intentGovernance.source : null,
        deterministic: intentGovernance.deterministic === true,
        flagged: intentGovernance.flagged === true,
        confidence: typeof intentGovernance.confidence === 'string' ? intentGovernance.confidence : null,
        rolloutRisk: typeof intentGovernance.rolloutRisk === 'string' ? intentGovernance.rolloutRisk : null,
        canonicalFindingCount: typeof intentGovernance.canonicalFindingCount === 'number' ? intentGovernance.canonicalFindingCount : null,
        blockingFindingCount: typeof intentGovernance.blockingFindingCount === 'number' ? intentGovernance.blockingFindingCount : null,
        advisoryFindingCount: typeof intentGovernance.advisoryFindingCount === 'number' ? intentGovernance.advisoryFindingCount : null,
        riskSummary: typeof intentGovernance.riskSummary === 'string' ? intentGovernance.riskSummary : null,
    };
}
function extractGraphImpact(verifyOutput) {
    const blastRadius = asRecord(verifyOutput.blastRadius);
    if (!blastRadius) {
        return null;
    }
    return {
        affectedServices: asStringArray(blastRadius.affectedServices, 20),
        impactedModules: asStringArray(blastRadius.impactedModules, 20),
        impactedServices: asStringArray(blastRadius.impactedServices, 20),
        transitiveImpactCount: typeof blastRadius.transitiveImpactCount === 'number' ? blastRadius.transitiveImpactCount : null,
        rolloutComplexity: typeof blastRadius.rolloutComplexity === 'string' ? blastRadius.rolloutComplexity : null,
        affectedRuntimeFlows: asStringArray(blastRadius.affectedRuntimeFlows, 20),
        affectedRolloutUnits: asStringArray(blastRadius.affectedRolloutUnits, 20),
        cascadingRisk: typeof blastRadius.cascadingRisk === 'string' ? blastRadius.cascadingRisk : null,
        stateOwnershipExposure: blastRadius.stateOwnershipExposure === true,
        externalSideEffectExposure: blastRadius.externalSideEffectExposure === true,
        authTouched: blastRadius.authTouched === true,
        apiTouched: blastRadius.apiTouched === true,
        infraTouched: blastRadius.infraTouched === true,
        deploymentTouched: blastRadius.deploymentTouched === true,
        dependencyManifestTouched: blastRadius.dependencyManifestTouched === true,
    };
}
function deriveModulePathForExport(filePath) {
    const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length <= 1)
        return parts[0] || normalized;
    if (['src', 'app', 'apps', 'services', 'packages', 'libs', 'lib', 'web'].includes(parts[0]) && parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
    }
    return parts[0];
}
function selectRelevantNarratives(driftIntelligence, filePath, ruleId) {
    if (!driftIntelligence || driftIntelligence.narratives.length === 0) {
        return [];
    }
    const moduleName = deriveModulePathForExport(filePath);
    const driftRuleCategory = ruleId.startsWith('drift_') && ruleId.includes(':')
        ? ruleId.split(':').slice(1).join(':')
        : null;
    const matched = driftIntelligence.narratives.filter((entry) => entry.affectedFiles.includes(filePath)
        || entry.affectedModules.includes(moduleName)
        || (driftRuleCategory ? entry.category.includes(driftRuleCategory.replace('drift_intelligence:', '')) : false));
    const selected = matched.length > 0 ? matched : driftIntelligence.narratives.slice(0, 3);
    return selected.slice(0, 3).map((entry) => ({
        category: entry.category,
        severity: entry.severity,
        summary: entry.summary,
        rootCause: entry.rootCause,
        operationalRisk: entry.operationalRisk,
        remediationBoundary: entry.remediationBoundary,
        causalChain: entry.causalChain.slice(0, 5),
    }));
}
function dedupeStrings(values, limit = 12) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}
function deriveSemanticExportInsights(engineeringContext, driftIntelligence, relevantNarratives, filePath) {
    const moduleName = deriveModulePathForExport(filePath);
    const touchedOwnership = engineeringContext?.ownershipBoundaries.filter((boundary) => boundary.name === moduleName
        || driftIntelligence?.unexpectedModules.includes(boundary.name)
        || driftIntelligence?.unexpectedServices.includes(boundary.name)
        || relevantNarratives.some((entry) => entry.summary.includes(boundary.name))) || [];
    const violatedContracts = dedupeStrings([
        ...(engineeringContext?.semanticExpectations?.contractIds || []),
        ...touchedOwnership.flatMap((boundary) => boundary.forbiddenResponsibilities.map((item) => `${boundary.name}:${item}`)),
    ], 16);
    const ownershipBoundaryCrossed = dedupeStrings(touchedOwnership.map((boundary) => `${boundary.name} (${boundary.primaryOwner})`), 12);
    const invariantSummaries = dedupeStrings([
        ...(engineeringContext?.invariants
            .filter((invariant) => !invariant.boundaryName
            || touchedOwnership.some((boundary) => boundary.name === invariant.boundaryName)
            || relevantNarratives.some((entry) => entry.summary.includes(invariant.boundaryName || ''))
            || invariant.expectation.includes(moduleName))
            .map((invariant) => invariant.expectation) || []),
        ...relevantNarratives
            .filter((entry) => entry.category === 'ownership-boundary-breach'
            || entry.category === 'architectural-invariant-erosion'
            || entry.category === 'semantic-coupling')
            .map((entry) => entry.rootCause),
    ], 12);
    const semanticRiskSummary = relevantNarratives[0]?.operationalRisk
        || driftIntelligence?.riskSynthesis?.summary
        || null;
    return {
        violatedContracts,
        ownershipBoundaryCrossed,
        invariantSummaries,
        semanticRiskSummary,
    };
}
function buildMcpContext(surroundingContext, engineeringContext, driftIntelligence, graphImpact, relevantNarratives, semanticInsights, intentGovernance) {
    const lines = [];
    if (engineeringContext?.intentSummary) {
        lines.push(`Intent: ${engineeringContext.intentSummary}`);
    }
    if (engineeringContext) {
        lines.push(`Approved scope: files=${engineeringContext.approvedScope.files.slice(0, 6).join(', ') || 'none'}; modules=${engineeringContext.approvedScope.modules.slice(0, 6).join(', ') || 'none'}; services=${engineeringContext.approvedScope.services.slice(0, 6).join(', ') || 'none'}`);
    }
    if (driftIntelligence?.riskSynthesis?.summary) {
        lines.push(`Risk synthesis: ${driftIntelligence.riskSynthesis.summary}`);
    }
    if (driftIntelligence?.governancePosture?.summary) {
        lines.push(`Governance posture: ${driftIntelligence.governancePosture.governanceGate || 'advisory'} / ${driftIntelligence.governancePosture.rolloutTrust || 'rollout-safe'} — ${driftIntelligence.governancePosture.summary}`);
    }
    if (driftIntelligence?.governanceDecisions && driftIntelligence.governanceDecisions.decisionsApplied > 0) {
        lines.push(`Governance decisions: ${driftIntelligence.governanceDecisions.activeOverrides} active, ${driftIntelligence.governanceDecisions.expiredOverrides} expired/invalid, ${driftIntelligence.governanceDecisions.findingsChanged} changed finding posture.`);
    }
    if (driftIntelligence?.findings.length) {
        driftIntelligence.findings.slice(0, 3).forEach((finding, index) => {
            lines.push(`Drift evidence ${index + 1}: [${finding.priority || 'p2-review-required'} / ${finding.governanceGate || 'review-blocker'} / ${finding.actionability || 'review-required'} / ${finding.evidenceTier || 'unknown-evidence'}] ${finding.message}`);
            if (finding.rolloutTrust) {
                lines.push(`Rollout posture ${index + 1}: ${finding.rolloutTrust}`);
            }
            if (finding.evidence?.explanation) {
                lines.push(`Evidence basis ${index + 1}: ${finding.evidence.explanation}`);
            }
            if (finding.evidence?.changedLines.length) {
                const lineRefs = finding.evidence.changedLines
                    .slice(0, 3)
                    .map((line) => `${line.file}:${line.line}`)
                    .join(', ');
                lines.push(`Changed-line evidence ${index + 1}: ${lineRefs}`);
            }
            if (finding.evidence?.dependencyEdges.length) {
                lines.push(`Dependency edge evidence ${index + 1}: ${finding.evidence.dependencyEdges.slice(0, 4).join(' | ')}`);
            }
            if (finding.relationships.length) {
                lines.push(`Finding relationship ${index + 1}: ${finding.relationships
                    .slice(0, 2)
                    .map((relationship) => `${relationship.type}->${relationship.targetFindingId}`)
                    .join(' | ')}`);
            }
            if (finding.governanceDecision) {
                lines.push(`Governance decision ${index + 1}: ${finding.governanceDecision.state} by ${finding.governanceDecision.actor}; reason=${finding.governanceDecision.reason}; lineage=${finding.governanceDecision.lineageHash}`);
            }
            if (finding.remediationGuidance?.minimalCorrection) {
                lines.push(`Bounded correction ${index + 1}: ${finding.remediationGuidance.minimalCorrection}`);
            }
            if (finding.remediationGuidance?.uncertainty.length) {
                lines.push(`Uncertainty ${index + 1}: ${finding.remediationGuidance.uncertainty.slice(0, 2).join(' | ')}`);
            }
        });
    }
    if (intentGovernance) {
        lines.push(`Intent governance: source=${intentGovernance.source || 'unknown'}; deterministic=${intentGovernance.deterministic ? 'yes' : 'no'}; findings=${intentGovernance.canonicalFindingCount ?? 0}; blocking=${intentGovernance.blockingFindingCount ?? 0}; rollout=${intentGovernance.rolloutRisk || 'unknown'}`);
    }
    if (semanticInsights.ownershipBoundaryCrossed.length > 0) {
        lines.push(`Ownership boundary: ${semanticInsights.ownershipBoundaryCrossed.join(' | ')}`);
    }
    if (semanticInsights.violatedContracts.length > 0) {
        lines.push(`Violated contracts: ${semanticInsights.violatedContracts.slice(0, 6).join(' | ')}`);
    }
    if (semanticInsights.invariantSummaries.length > 0) {
        lines.push(`Invariant expectations: ${semanticInsights.invariantSummaries.slice(0, 3).join(' | ')}`);
    }
    if (semanticInsights.semanticRiskSummary) {
        lines.push(`Semantic risk: ${semanticInsights.semanticRiskSummary}`);
    }
    if (engineeringContext?.semanticExpectations?.expectedBehaviorKinds.length) {
        lines.push(`Expected runtime behaviors: ${engineeringContext.semanticExpectations.expectedBehaviorKinds.slice(0, 6).join(' | ')}`);
    }
    if (engineeringContext?.semanticExpectations?.expectedRuntimeFlows.length) {
        lines.push(`Expected runtime flows: ${engineeringContext.semanticExpectations.expectedRuntimeFlows.slice(0, 6).join(' | ')}`);
    }
    if (engineeringContext?.semanticExpectations?.expectedRolloutUnits.length) {
        lines.push(`Expected rollout units: ${engineeringContext.semanticExpectations.expectedRolloutUnits.slice(0, 6).join(' | ')}`);
    }
    if (engineeringContext?.runtimeBehaviors.length) {
        const summaries = engineeringContext.runtimeBehaviors
            .slice(0, 4)
            .map((entry) => `${entry.boundaryName}:${entry.behaviorKinds.slice(0, 3).join('/') || 'unknown'}`);
        lines.push(`Runtime behaviors: ${summaries.join(' | ')}`);
    }
    if (engineeringContext?.deploymentBoundaries.length) {
        const summaries = engineeringContext.deploymentBoundaries
            .slice(0, 4)
            .map((entry) => `${entry.name}:${entry.type}:${entry.rolloutUnits.slice(0, 2).join('/') || 'default'}`);
        lines.push(`Deployment boundaries: ${summaries.join(' | ')}`);
    }
    if (relevantNarratives.length > 0) {
        relevantNarratives.forEach((narrative, index) => {
            lines.push(`Narrative ${index + 1}: ${narrative.summary}`);
            lines.push(`Root cause ${index + 1}: ${narrative.rootCause}`);
        });
    }
    else if (driftIntelligence?.findings.length) {
        lines.push(`Drift: ${driftIntelligence.findings.slice(0, 3).map((entry) => entry.message).join(' | ')}`);
    }
    if (graphImpact) {
        lines.push(`Graph impact: services=${graphImpact.impactedServices.slice(0, 6).join(', ') || 'none'}; modules=${graphImpact.impactedModules.slice(0, 6).join(', ') || 'none'}; rollout=${graphImpact.rolloutComplexity || 'unknown'}`);
        if (graphImpact.affectedRuntimeFlows.length > 0) {
            lines.push(`Runtime flows impacted: ${graphImpact.affectedRuntimeFlows.slice(0, 6).join(' | ')}`);
        }
        if (graphImpact.affectedRolloutUnits.length > 0) {
            lines.push(`Rollout units impacted: ${graphImpact.affectedRolloutUnits.slice(0, 6).join(' | ')}`);
        }
        if (graphImpact.cascadingRisk) {
            lines.push(`Cascading risk: ${graphImpact.cascadingRisk}`);
        }
        if (graphImpact.stateOwnershipExposure) {
            lines.push('State ownership risk: runtime state mutation spans multiple boundaries.');
        }
        if (graphImpact.externalSideEffectExposure) {
            lines.push('External side effects detected in the affected runtime path.');
        }
    }
    if (surroundingContext.trim().length > 0) {
        lines.push('Code context:');
        lines.push(surroundingContext);
    }
    return lines.join('\n');
}
function resolveReplayChecksum(verifyOutput) {
    const direct = typeof verifyOutput.replayChecksum === 'string' && verifyOutput.replayChecksum.trim().length > 0
        ? verifyOutput.replayChecksum.trim()
        : null;
    if (direct)
        return direct;
    const nested = verifyOutput.governanceVerification?.replayChecksum;
    return typeof nested === 'string' && nested.trim().length > 0 ? nested.trim() : null;
}
function resolveReplayMode(verifyOutput) {
    const direct = typeof verifyOutput.replayMode === 'string' && verifyOutput.replayMode.trim().length > 0
        ? verifyOutput.replayMode.trim()
        : null;
    if (direct)
        return direct;
    const policyOnly = verifyOutput.policyOnly === true;
    const mode = typeof verifyOutput.mode === 'string' ? verifyOutput.mode : '';
    if (policyOnly || mode === 'policy_only') {
        return 'local-structural';
    }
    return null;
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