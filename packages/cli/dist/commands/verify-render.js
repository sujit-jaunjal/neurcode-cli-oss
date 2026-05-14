"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.displayGovernanceInsights = displayGovernanceInsights;
exports.displayChangeContractDrift = displayChangeContractDrift;
exports.displayVerifyResults = displayVerifyResults;
const change_contract_1 = require("../utils/change-contract");
const explainability_1 = require("../explainability");
const verify_output_1 = require("./verify-output");
const verify_guidance_1 = require("./verify-guidance");
function displayGovernanceInsights(chalk, governance, options = {}) {
    const maxUnexpectedFiles = options.maxUnexpectedFiles ?? 20;
    const decision = governance.governanceDecision;
    console.log(chalk.bold.white('\nBlast Radius:'));
    console.log(chalk.dim(`   Files touched: ${governance.blastRadius.filesChanged}`));
    console.log(chalk.dim(`   Functions impacted: ${governance.blastRadius.functionsAffected}`));
    console.log(chalk.dim(`   Modules impacted: ${governance.blastRadius.modulesAffected.join(', ') || 'none'}`));
    if (governance.blastRadius.dependenciesAdded.length > 0) {
        console.log(chalk.dim(`   Dependencies added: ${governance.blastRadius.dependenciesAdded.join(', ')}`));
    }
    console.log(chalk.dim(`   Risk level: ${governance.blastRadius.riskScore.toUpperCase()}`));
    console.log(chalk.dim(`   Governance decision: ${decision.decision.toUpperCase().replace('_', ' ')} | Avg relevance: ${decision.averageRelevanceScore}`));
    console.log(chalk.dim(`   Policy source: ${governance.policySources.mode}${governance.policySources.orgPolicy ? ' (org + local)' : ' (local)'}`));
    console.log(governance.aiChangeLogIntegrity.valid
        ? chalk.dim(`   AI change-log integrity: valid (${governance.aiChangeLogIntegrity.signed ? 'signed' : 'unsigned'})`)
        : chalk.red(`   AI change-log integrity: invalid (${governance.aiChangeLogIntegrity.issues.join('; ') || 'unknown'})`));
    if (governance.aiChangeLogIntegrity.signed) {
        const keyId = typeof governance.aiChangeLogIntegrity.keyId === 'string'
            ? governance.aiChangeLogIntegrity.keyId
            : null;
        const verifiedWithKeyId = typeof governance.aiChangeLogIntegrity.verifiedWithKeyId === 'string'
            ? governance.aiChangeLogIntegrity.verifiedWithKeyId
            : null;
        if (keyId || verifiedWithKeyId) {
            console.log(chalk.dim(`   Signing key: ${keyId || 'n/a'}${verifiedWithKeyId ? ` (verified via ${verifiedWithKeyId})` : ''}`));
        }
    }
    const engineeringContext = governance.engineeringContext;
    console.log(chalk.bold.white('\nEngineering Context:'));
    console.log(chalk.dim(`   Source: ${engineeringContext.source}${engineeringContext.sessionId ? ` | Session: ${engineeringContext.sessionId}` : ''}`));
    if (engineeringContext.intentSummary) {
        console.log(chalk.dim(`   Intent: ${engineeringContext.intentSummary}`));
    }
    console.log(chalk.dim(`   Approved scope: ${engineeringContext.approvedScope.files.length} file(s), ${engineeringContext.approvedScope.modules.length} module(s), ${engineeringContext.approvedScope.services.length} service(s)`));
    if (engineeringContext.contextFiles.length > 0) {
        const topContextFiles = engineeringContext.contextFiles
            .slice(0, 6)
            .map((item) => item.path)
            .join(', ');
        console.log(chalk.dim(`   Context pack: ${topContextFiles}${engineeringContext.contextFiles.length > 6 ? ` +${engineeringContext.contextFiles.length - 6} more` : ''}`));
    }
    if (engineeringContext.forbiddenBoundaries.length > 0) {
        const boundarySummary = engineeringContext.forbiddenBoundaries
            .slice(0, 4)
            .map((item) => `${item.type}:${item.path}`)
            .join(', ');
        console.log(chalk.dim(`   Forbidden boundaries: ${boundarySummary}${engineeringContext.forbiddenBoundaries.length > 4 ? ` +${engineeringContext.forbiddenBoundaries.length - 4} more` : ''}`));
    }
    if (engineeringContext.semanticExpectations.expectedResponsibilities.length > 0) {
        console.log(chalk.dim(`   Expected responsibilities: ${engineeringContext.semanticExpectations.expectedResponsibilities.slice(0, 6).join(', ')}${engineeringContext.semanticExpectations.expectedResponsibilities.length > 6 ? ` +${engineeringContext.semanticExpectations.expectedResponsibilities.length - 6} more` : ''}`));
    }
    if (engineeringContext.semanticExpectations.expectedBehaviorKinds.length > 0) {
        console.log(chalk.dim(`   Expected runtime behaviors: ${engineeringContext.semanticExpectations.expectedBehaviorKinds.slice(0, 6).join(', ')}${engineeringContext.semanticExpectations.expectedBehaviorKinds.length > 6 ? ` +${engineeringContext.semanticExpectations.expectedBehaviorKinds.length - 6} more` : ''}`));
    }
    if (engineeringContext.semanticExpectations.expectedRolloutUnits.length > 0) {
        console.log(chalk.dim(`   Expected rollout units: ${engineeringContext.semanticExpectations.expectedRolloutUnits.slice(0, 6).join(', ')}${engineeringContext.semanticExpectations.expectedRolloutUnits.length > 6 ? ` +${engineeringContext.semanticExpectations.expectedRolloutUnits.length - 6} more` : ''}`));
    }
    if (engineeringContext.runtimeBehaviors.length > 0) {
        const runtimeSummary = engineeringContext.runtimeBehaviors
            .slice(0, 4)
            .map((item) => `${item.boundaryName}:${item.behaviorKinds.slice(0, 3).join('/') || 'unknown'}`)
            .join(', ');
        console.log(chalk.dim(`   Runtime behaviors: ${runtimeSummary}${engineeringContext.runtimeBehaviors.length > 4 ? ` +${engineeringContext.runtimeBehaviors.length - 4} more` : ''}`));
    }
    if (engineeringContext.deploymentBoundaries.length > 0) {
        const deploymentSummary = engineeringContext.deploymentBoundaries
            .slice(0, 4)
            .map((item) => `${item.name}:${item.type}`)
            .join(', ');
        console.log(chalk.dim(`   Deployment boundaries: ${deploymentSummary}${engineeringContext.deploymentBoundaries.length > 4 ? ` +${engineeringContext.deploymentBoundaries.length - 4} more` : ''}`));
    }
    if (engineeringContext.ownershipBoundaries.length > 0) {
        const ownershipSummary = engineeringContext.ownershipBoundaries
            .slice(0, 4)
            .map((item) => `${item.name} (${item.primaryOwner})`)
            .join(', ');
        console.log(chalk.dim(`   Ownership boundaries: ${ownershipSummary}${engineeringContext.ownershipBoundaries.length > 4 ? ` +${engineeringContext.ownershipBoundaries.length - 4} more` : ''}`));
    }
    if (engineeringContext.warnings.length > 0) {
        engineeringContext.warnings.slice(0, 3).forEach((warning) => {
            console.log(chalk.yellow(`   Warning: ${warning}`));
        });
    }
    if (governance.suspiciousChange.flagged) {
        console.log(chalk.red('\nSuspicious Change Detected'));
        console.log(chalk.red(`   Plan expected files: ${governance.suspiciousChange.expectedFiles} | AI modified files: ${governance.suspiciousChange.actualFiles}`));
        governance.suspiciousChange.unexpectedFiles.slice(0, maxUnexpectedFiles).forEach((filePath) => {
            console.log(chalk.red(`   • ${filePath}`));
        });
        console.log(chalk.red(`   Confidence: ${governance.suspiciousChange.confidence}`));
    }
    if (governance.driftIntelligence.findings.length > 0) {
        console.log(chalk.bold.white('\nDrift Intelligence:'));
        console.log(chalk.dim(`   Rollout risk: ${governance.driftIntelligence.rolloutRisk.toUpperCase()} | Confidence: ${governance.driftIntelligence.confidence.toUpperCase()} | Raw signals: ${governance.driftIntelligence.findings.length} | Narratives: ${governance.driftIntelligence.narratives.length}`));
        console.log(chalk.dim(`   Risk synthesis: ${governance.driftIntelligence.riskSynthesis.overallRisk.toUpperCase()} — ${governance.driftIntelligence.riskSynthesis.summary}`));
        if (governance.driftIntelligence.impactedServices.length > 0) {
            console.log(chalk.dim(`   Impacted services: ${governance.driftIntelligence.impactedServices.join(', ')}`));
        }
        if (governance.driftIntelligence.impactedRuntimeFlows.length > 0) {
            console.log(chalk.dim(`   Runtime flows: ${governance.driftIntelligence.impactedRuntimeFlows.slice(0, 8).join(', ')}${governance.driftIntelligence.impactedRuntimeFlows.length > 8 ? ` +${governance.driftIntelligence.impactedRuntimeFlows.length - 8} more` : ''}`));
        }
        if (governance.driftIntelligence.affectedRolloutUnits.length > 0) {
            console.log(chalk.dim(`   Rollout units: ${governance.driftIntelligence.affectedRolloutUnits.slice(0, 8).join(', ')}${governance.driftIntelligence.affectedRolloutUnits.length > 8 ? ` +${governance.driftIntelligence.affectedRolloutUnits.length - 8} more` : ''}`));
        }
        if (governance.driftIntelligence.impactedModules.length > 0) {
            console.log(chalk.dim(`   Impacted modules: ${governance.driftIntelligence.impactedModules.slice(0, 8).join(', ')}${governance.driftIntelligence.impactedModules.length > 8 ? ` +${governance.driftIntelligence.impactedModules.length - 8} more` : ''}`));
        }
        if (governance.driftIntelligence.riskSynthesis.cascadingRisk) {
            console.log(chalk.dim(`   Cascading risk: ${governance.driftIntelligence.riskSynthesis.cascadingRisk.toUpperCase()}${governance.driftIntelligence.riskSynthesis.runtimeFlowExposure ? ' | runtime-flow exposure' : ''}${governance.driftIntelligence.riskSynthesis.stateOwnershipExposure ? ' | state-ownership exposure' : ''}${governance.driftIntelligence.riskSynthesis.externalSideEffectExposure ? ' | external side effects' : ''}`));
        }
        if (governance.driftIntelligence.governancePosture) {
            const posture = governance.driftIntelligence.governancePosture;
            console.log(chalk.dim(`   Governance posture: ${(posture.governanceGate || 'advisory').toUpperCase()} | ${(posture.rolloutTrust || 'rollout-safe').toUpperCase()} — ${posture.summary}`));
            if (posture.priorityCounts) {
                console.log(chalk.dim(`   Priorities: P0=${posture.priorityCounts.p0RolloutBlockers} P1=${posture.priorityCounts.p1ArchitectureBlockers} P2=${posture.priorityCounts.p2ReviewRequired} P3=${posture.priorityCounts.p3Advisory}`));
            }
        }
        if (governance.driftIntelligence.governanceDecisions?.decisionsApplied > 0) {
            const decisions = governance.driftIntelligence.governanceDecisions;
            console.log(chalk.dim(`   Governance decisions: ${decisions.activeOverrides} active, ${decisions.expiredOverrides} expired/invalid, ${decisions.findingsChanged} posture change(s)`));
        }
        if (governance.driftIntelligence.narratives.length > 0) {
            governance.driftIntelligence.narratives.slice(0, 4).forEach((narrative) => {
                console.log(chalk.red(`   • [${narrative.severity.toUpperCase()}] ${narrative.summary}`));
                console.log(chalk.dim(`     Root cause: ${narrative.rootCause}`));
                console.log(chalk.dim(`     Risk: ${narrative.operationalRisk}`));
                console.log(chalk.dim(`     Remediation boundary: ${narrative.remediationBoundary}`));
            });
        }
        else {
            governance.driftIntelligence.findings.slice(0, 5).forEach((finding) => {
                console.log(chalk.red(`   • [${finding.severity.toUpperCase()}] ${finding.message}`));
            });
        }
    }
    if (decision.lowRelevanceFiles.length > 0) {
        console.log(chalk.yellow('\nLow Relevance Files'));
        decision.lowRelevanceFiles.slice(0, 10).forEach((item) => {
            console.log(chalk.yellow(`   • ${item.file} (score ${item.relevanceScore}, ${item.planLink.replace('_', ' ')})`));
        });
    }
    if (options.explain) {
        console.log(chalk.bold.white('\nAI Change Justification:'));
        console.log(chalk.dim(`   Task: ${governance.changeJustification.task}`));
        governance.changeJustification.changes.forEach((item) => {
            const relevance = typeof item.relevanceScore === 'number' ? ` [score ${item.relevanceScore}]` : '';
            console.log(chalk.dim(`   • ${item.file} — ${item.reason}${relevance}`));
        });
    }
}
function displayChangeContractDrift(chalk, summary, options = { advisory: false }) {
    const groups = (0, change_contract_1.groupChangeContractViolations)(summary.violations.map((item) => ({
        code: item.code,
        message: item.message,
        ...(item.file ? { file: item.file } : {}),
        ...(item.symbol ? { symbol: item.symbol } : {}),
        ...(item.symbolType ? { symbolType: item.symbolType } : {}),
        ...(item.expected ? { expected: item.expected } : {}),
        ...(item.actual ? { actual: item.actual } : {}),
    })));
    if (groups.length === 0)
        return;
    const maxItemsPerGroup = options.maxItemsPerGroup ?? 12;
    const header = options.advisory
        ? chalk.yellow('\nWARN ⚠️  Change contract drift detected')
        : chalk.red('\nFAIL ❌  Change contract enforcement failed');
    console.log(header);
    for (const group of groups) {
        console.log(chalk.white(`\n${group.title}:`));
        group.items.slice(0, maxItemsPerGroup).forEach((entry) => {
            console.log(`  - ${entry}`);
        });
        if (group.items.length > maxItemsPerGroup) {
            console.log(chalk.dim(`  - ... ${group.items.length - maxItemsPerGroup} more`));
        }
        console.log(chalk.dim(`  Why it matters: ${group.impact}`));
    }
    console.log(chalk.dim('\nSummary:'));
    console.log(chalk.dim('Implementation deviates from intended contract.'));
    console.log(chalk.dim(`Contract path: ${summary.path}`));
}
function displayVerifyResults(chalk, result, policyViolations = [], expediteModeUsed = false, intentIssuesForDisplay = [], intentSummaryForDisplay = null, flowIssuesForDisplay = [], regressionsForDisplay = [], structuralViolationsForDisplay = []) {
    const headerLabel = result.verdict === 'PASS'
        ? chalk.bold.green('\n✅ VERIFICATION PASSED')
        : result.verdict === 'WARN'
            ? chalk.bold.yellow('\n⚠️  VERIFICATION PASSED WITH WARNINGS')
            : chalk.bold.red('\n❌ VERIFICATION FAILED');
    console.log(headerLabel);
    if (intentSummaryForDisplay) {
        const summary = intentSummaryForDisplay;
        const domainLabel = summary.domain.charAt(0).toUpperCase() + summary.domain.slice(1);
        const confColor = summary.confidence === 'HIGH'
            ? chalk.green
            : summary.confidence === 'MEDIUM'
                ? chalk.yellow
                : chalk.red;
        const weightedCoverage = summary.weightedCoverage != null
            ? Math.round(summary.weightedCoverage * 100)
            : summary.coveragePct;
        const barWidth = 20;
        const filled = Math.round((weightedCoverage / 100) * barWidth);
        const bar = chalk.cyan('█'.repeat(filled)) + chalk.dim('░'.repeat(barWidth - filled));
        const status = summary.status;
        const statusLabel = status === 'CRITICAL'
            ? chalk.bold.red('[CRITICAL]')
            : status === 'AT RISK'
                ? chalk.bold.yellow('[AT RISK]')
                : chalk.bold.green('[SECURE]');
        console.log(chalk.bold('\n━━━ INTENT STATUS ━━━━━━━━━━━━━━━━━━━━━━'));
        console.log(`  ${statusLabel} ${chalk.bold(`${domainLabel} Implementation:`)} ${bar} ${chalk.bold(`${weightedCoverage}%`)} (weighted)`);
        console.log(`  Confidence: ${confColor(summary.confidence)}`);
        if (summary.foundList.length > 0) {
            const foundLabels = summary.foundList
                .map((key) => key.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '))
                .slice(0, 4);
            console.log(`  Found:   ${chalk.green(foundLabels.join(', '))}${summary.foundList.length > 4 ? chalk.dim(` +${summary.foundList.length - 4} more`) : ''}`);
        }
        const criticalMissing = (summary.criticalMissing) ?? [];
        const otherMissing = summary.missing.filter((key) => !criticalMissing.includes(key));
        if (criticalMissing.length > 0) {
            console.log(`  ${chalk.bold.red('Critical missing:')}`);
            criticalMissing.forEach((key) => {
                const label = key.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
                console.log(chalk.red(`    ✗ ${label}`));
            });
        }
        if (otherMissing.length > 0) {
            console.log(`  ${chalk.bold.yellow('Missing:')}`);
            otherMissing.forEach((key) => {
                const label = key.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
                console.log(chalk.yellow(`    • ${label}`));
            });
        }
        if (criticalMissing.length === 0 && otherMissing.length === 0) {
            console.log(`  Missing: ${chalk.green('none — all components detected')}`);
        }
        console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    }
    const maxBlockingItems = 20;
    const maxAdvisoryItems = 8;
    const maxExpediteItems = 12;
    const isBlockingSeverity = (severityRaw) => {
        const normalized = String(severityRaw || '').toLowerCase();
        return normalized === 'block' || normalized === 'critical' || normalized === 'high';
    };
    const scopeItems = result.bloatFiles.map((file) => ({
        file,
        message: 'File modified outside intended scope',
        policy: 'scope_guard',
    }));
    const policyTriageItems = policyViolations.map((item) => ({
        file: item.file,
        message: item.message || item.rule,
        policy: item.rule || 'policy_violation',
        severity: item.severity,
    }));
    const structuralBlocking = structuralViolationsForDisplay
        .filter((violation) => violation.severity === 'BLOCKING')
        .map((violation) => ({
        file: violation.filePath,
        message: `${violation.ruleId} · ${violation.ruleName} (line ${violation.line}) — ${violation.operationalRisk}`,
    }));
    const structuralAdvisory = structuralViolationsForDisplay
        .filter((violation) => violation.severity === 'ADVISORY')
        .map((violation) => ({
        file: violation.filePath,
        message: `${violation.ruleId} · ${violation.ruleName} (line ${violation.line}) — ${violation.operationalRisk}`,
    }));
    let blockingItems = [
        ...scopeItems.map((item) => ({
            file: item.file,
            message: item.message,
        })),
        ...policyTriageItems
            .filter((item) => isBlockingSeverity(item.severity))
            .map((item) => ({
            file: item.file,
            message: item.message,
        })),
        ...structuralBlocking,
    ];
    let advisoryItems = [
        ...policyTriageItems
            .filter((item) => !isBlockingSeverity(item.severity))
            .map((item) => ({
            file: item.file,
            message: item.message,
        })),
        ...structuralAdvisory,
    ];
    let expediteItems = [];
    if (expediteModeUsed) {
        blockingItems = [
            ...scopeItems
                .filter((item) => (0, verify_output_1.isCriticalScopeBreach)(item.file, item.message))
                .map((item) => ({ file: item.file, message: item.message })),
            ...policyTriageItems
                .filter((item) => (0, verify_output_1.isSecurityOrAuthViolation)(item.file, item.policy, item.message))
                .map((item) => ({ file: item.file, message: item.message })),
        ];
        expediteItems = [
            ...scopeItems
                .filter((item) => !(0, verify_output_1.isCriticalScopeBreach)(item.file, item.message))
                .map((item) => ({ file: item.file, message: item.message })),
            ...policyTriageItems
                .filter((item) => !(0, verify_output_1.isSecurityOrAuthViolation)(item.file, item.policy, item.message))
                .map((item) => ({ file: item.file, message: item.message })),
        ];
        advisoryItems = [];
    }
    console.log(blockingItems.length > 0
        ? chalk.red(`Blocking Issues: ${blockingItems.length}`)
        : chalk.dim('Blocking Issues: 0'));
    if (expediteModeUsed) {
        console.log(chalk.yellow(`Expedite Issues: ${expediteItems.length}`));
    }
    else {
        console.log(advisoryItems.length > 0
            ? chalk.yellow(`Advisory Issues: ${advisoryItems.length}`)
            : chalk.dim('Advisory Issues: 0'));
    }
    console.log(chalk.dim(`Plan adherence: ${result.plannedFilesModified}/${result.totalPlannedFiles} files (${result.adherenceScore}%)`));
    const topIssues = [
        ...blockingItems,
        ...(expediteModeUsed ? expediteItems : advisoryItems),
    ].slice(0, 2);
    if (topIssues.length > 0) {
        console.log(chalk.bold('\nTop Issues:'));
        topIssues.forEach((item, index) => {
            console.log(`  ${index + 1}. ${item.message} → ${chalk.cyan(item.file)}`);
        });
    }
    if (blockingItems.length > 0) {
        console.log(chalk.red(`\nBLOCKING (${blockingItems.length})`));
        blockingItems.slice(0, maxBlockingItems).forEach((item) => {
            console.log(`  - ${item.file}: ${item.message}`);
        });
        if (blockingItems.length > maxBlockingItems) {
            console.log(chalk.dim(`  - ... ${blockingItems.length - maxBlockingItems} more`));
        }
    }
    if (advisoryItems.length > 0) {
        console.log(chalk.yellow(`\nADVISORY (${advisoryItems.length})`));
        advisoryItems.slice(0, maxAdvisoryItems).forEach((item) => {
            console.log(`  - ${item.file}: ${item.message}`);
        });
        if (advisoryItems.length > maxAdvisoryItems) {
            console.log(chalk.dim(`  - ... ${advisoryItems.length - maxAdvisoryItems} more (summarized)`));
        }
    }
    if (expediteModeUsed && expediteItems.length > 0) {
        console.log(chalk.yellow(`\nEXPEDITE (requires follow-up) (${expediteItems.length})`));
        expediteItems.slice(0, maxExpediteItems).forEach((item) => {
            console.log(`  - ${item.file}: ${item.message}`);
        });
        if (expediteItems.length > maxExpediteItems) {
            console.log(chalk.dim(`  - ... ${expediteItems.length - maxExpediteItems} more (summarized)`));
        }
        console.log(chalk.dim('  Follow-up checklist:'));
        verify_output_1.EXPEDITE_FOLLOW_UP_CHECKLIST.forEach((checkItem) => {
            console.log(chalk.dim(`  - ${checkItem}`));
        });
        console.log(chalk.dim('  Note: Expedite Mode used'));
    }
    if (intentIssuesForDisplay.length > 0) {
        console.log(chalk.magenta(`\nINTENT ISSUES (${intentIssuesForDisplay.length})`));
        intentIssuesForDisplay.forEach((issue) => {
            const label = issue.severity === 'high' ? chalk.red('[HIGH]') : chalk.yellow('[MEDIUM]');
            const typeLabel = issue.type === 'missing' ? 'Missing' : issue.type === 'misplaced' ? 'Misplaced' : 'Partial';
            console.log(`  ${label} ${typeLabel}: ${issue.message}`);
        });
    }
    if (flowIssuesForDisplay.length > 0) {
        console.log(chalk.bold('\n━━━ FLOW VALIDATION ━━━━━━━━━━━━━━━━━━━━━'));
        flowIssuesForDisplay.forEach((issue) => {
            const label = issue.severity === 'high' ? chalk.red('[HIGH]') : chalk.yellow('[MEDIUM]');
            const typeIcon = issue.type === 'missing-flow' ? '⛓' : issue.type === 'misplaced-flow' ? '⚠' : '⊘';
            console.log(`  ${label} ${typeIcon} ${issue.message}`);
            if (issue.files && issue.files.length > 0) {
                const display = issue.files.slice(0, 3);
                console.log(chalk.dim(`      → ${display.join(', ')}${issue.files.length > 3 ? ` +${issue.files.length - 3} more` : ''}`));
            }
        });
        console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    }
    if (regressionsForDisplay.length > 0) {
        console.log(chalk.bold.red('\n━━━ REGRESSION ANALYSIS ━━━━━━━━━━━━━━━━━'));
        regressionsForDisplay.forEach((regression) => {
            const icon = regression.type === 'coverage-regression' ? '📉' :
                regression.type === 'critical-regression' ? '🔴' :
                    regression.type === 'flow-regression' ? '⛓' : '⚠';
            console.log(`  ${chalk.red('[REGRESSION]')} ${icon} ${regression.message}`);
        });
        console.log(chalk.bold.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    }
    if (structuralViolationsForDisplay.length > 0) {
        try {
            const report = (0, explainability_1.buildViolationReport)(structuralViolationsForDisplay, '');
            const blocking = report.blocking;
            const advisory = report.advisory;
            if (blocking.length > 0 || advisory.length > 0) {
                console.log(chalk.bold('\n━━━ STRUCTURAL ANALYSIS ━━━━━━━━━━━━━━━━━'));
                blocking.slice(0, 5).forEach((violation) => {
                    const determinismLabel = violation.determinism === 'deterministic-structural'
                        ? chalk.cyan('⚙ AST-verified')
                        : chalk.yellow('⚡ heuristic');
                    console.log(chalk.red(`\n  ● ${violation.ruleId} [BLOCKING] ${determinismLabel} · confidence ${Math.round(violation.confidence * 100)}%`));
                    console.log(chalk.bold(`    ${violation.filePath}:${violation.line}`));
                    console.log(chalk.dim(`    Pattern: ${violation.evidence.matchReason}`));
                    if (violation.evidence.codeSnippet) {
                        console.log(chalk.dim(`    Code:    ${violation.evidence.codeSnippet.slice(0, 100)}`));
                    }
                    console.log(chalk.yellow(`    Risk:    ${violation.operationalRisk}`));
                    console.log(chalk.green(`    Fix:     ${violation.remediation}`));
                });
                if (blocking.length > 5) {
                    console.log(chalk.dim(`\n  ... ${blocking.length - 5} more blocking structural violations`));
                }
                advisory.slice(0, 3).forEach((violation) => {
                    console.log(chalk.yellow(`\n  ○ ${violation.ruleId} [ADVISORY] ⚡ heuristic · confidence ${Math.round(violation.confidence * 100)}%`));
                    console.log(chalk.dim(`    ${violation.filePath}:${violation.line} — ${violation.operationalRisk}`));
                });
                if (advisory.length > 3) {
                    console.log(chalk.dim(`  ... ${advisory.length - 3} more advisory structural violations`));
                }
                const deterministicCount = report.deterministicCount;
                const heuristicCount = report.heuristicCount;
                console.log(chalk.dim(`\n  Determinism: ${deterministicCount} AST-verified · ${heuristicCount} heuristic`));
                console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
            }
        }
        catch {
            // Explainability rendering must never break deterministic verification.
        }
    }
    const hasAnyIssue = blockingItems.length > 0 ||
        advisoryItems.length > 0 ||
        expediteItems.length > 0 ||
        intentIssuesForDisplay.length > 0 ||
        flowIssuesForDisplay.length > 0 ||
        regressionsForDisplay.length > 0;
    if (!hasAnyIssue) {
        console.log(chalk.green('\nNo issues detected.'));
    }
    (0, verify_guidance_1.printVerifyNextStep)(chalk, hasAnyIssue);
    console.log(chalk.dim(`\nDetails: ${result.message}\n`));
}
//# sourceMappingURL=verify-render.js.map