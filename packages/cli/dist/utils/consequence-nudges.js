"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.consequenceNudgesEnabled = consequenceNudgesEnabled;
exports.selectInFlowConsequenceNudges = selectInFlowConsequenceNudges;
exports.isHighTrustInFlowFinding = isHighTrustInFlowFinding;
exports.isHighTrustInFlowImpact = isHighTrustInFlowImpact;
exports.formatInFlowImpactNudge = formatInFlowImpactNudge;
exports.formatInFlowConsequenceNudge = formatInFlowConsequenceNudge;
exports.impactNudgeKey = impactNudgeKey;
exports.nudgeKey = nudgeKey;
const node_crypto_1 = require("node:crypto");
function consequenceNudgesEnabled(env = process.env) {
    const hardDisable = env.NEURCODE_DISABLE_CONSEQUENCE_NUDGES;
    if (hardDisable && isEnabledValue(hardDisable))
        return false;
    const flag = env.NEURCODE_CONSEQUENCE_NUDGES;
    if (!flag)
        return true;
    return !isDisabledValue(flag);
}
function isEnabledValue(value) {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
function isDisabledValue(value) {
    const normalized = value.trim().toLowerCase();
    return normalized === 'off' ||
        normalized === 'disabled' ||
        normalized === '0' ||
        normalized === 'false';
}
function selectInFlowConsequenceNudges(artifact, options = {}) {
    const max = Number.isFinite(options.max) && options.max > 0 ? Math.floor(options.max) : 3;
    const consequence = artifact.consequenceUnderstanding;
    if (!consequence?.analyzed)
        return [];
    const selectedImpacts = consequence.topImpacts
        .filter(isHighTrustInFlowImpact)
        .slice(0, max);
    if (selectedImpacts.length > 0) {
        const nudges = [];
        for (const impact of selectedImpacts) {
            const supportingFindings = consequence.topFindings
                .filter((finding) => impact.findingRanks.includes(finding.rank))
                .slice(0, 8);
            const finding = supportingFindings[0] ?? consequence.topFindings
                .find((candidate) => candidate.file === impact.file && candidate.symbol === impact.symbol);
            if (!finding)
                continue;
            nudges.push({
                nudgeVersion: 'v2',
                nudgeKey: impactNudgeKey(artifact.artifactHash, impact),
                severity: impactNudgeSeverity(impact),
                headline: formatInFlowImpactNudge(impact),
                impact,
                finding,
                surfacedImpacts: selectedImpacts,
                surfacedFindings: supportingFindings.length > 0 ? supportingFindings : [finding],
                artifactHash: artifact.artifactHash,
                provenance: 'deterministic-static',
            });
        }
        return nudges;
    }
    const selected = consequence.topFindings
        .filter(isHighTrustInFlowFinding)
        .slice(0, max);
    return selected
        .map((finding) => ({
        nudgeVersion: 'v1',
        nudgeKey: nudgeKey(artifact.artifactHash, finding),
        severity: finding.findingType === 'effect-delta' ? 'high' : 'medium',
        headline: formatInFlowConsequenceNudge(finding),
        impact: null,
        finding,
        surfacedImpacts: [],
        surfacedFindings: selected,
        artifactHash: artifact.artifactHash,
        provenance: 'deterministic-static',
    }));
}
function isHighTrustInFlowFinding(finding) {
    if (finding.externalConsumerCount <= 0)
        return false;
    if (!finding.reasonCodes.includes('external_consumers'))
        return false;
    if (finding.findingType === 'effect-delta') {
        return finding.reasonCodes.includes('effect_added') || finding.reasonCodes.includes('effect_removed');
    }
    if (finding.findingType === 'contract-delta') {
        return finding.reasonCodes.includes('breaking_contract_shape');
    }
    return false;
}
function isHighTrustInFlowImpact(impact) {
    if (impact.externalProductionConsumerCount <= 0 && impact.reachableProductionConsumerCount <= 0)
        return false;
    if (!impact.reasonCodes.includes('external_consumers') &&
        !impact.reasonCodes.includes('reachable_production_consumers'))
        return false;
    const isRuntimeEffect = impact.findingTypes.includes('effect-delta') &&
        (impact.reasonCodes.includes('effect_added') || impact.reasonCodes.includes('effect_removed'));
    const isBreakingContract = impact.findingTypes.includes('contract-delta') &&
        impact.reasonCodes.includes('breaking_contract_shape');
    if (!isRuntimeEffect && !isBreakingContract)
        return false;
    return (impact.externalProductionConsumerCount > 0 ||
        impact.runtimeGovernanceConsumerCount > 0 ||
        impact.approvalRequiredConsumerCount > 0 ||
        impact.sensitiveConsumerCount > 0 ||
        impact.highFanout ||
        impact.architectureRelevant ||
        impact.reachableProductionConsumerCount >= 2);
}
function formatInFlowImpactNudge(impact) {
    const production = impact.productionFiles.slice(0, 3).join(', ');
    const hidden = impact.productionFiles.length > 3
        ? `, +${impact.productionFiles.length - 3} more`
        : '';
    const kinds = impact.findingTypes.includes('effect-delta') && impact.findingTypes.includes('contract-delta')
        ? 'runtime effect and externally consumed contract'
        : impact.findingTypes.includes('effect-delta')
            ? 'runtime effect'
            : 'externally consumed contract';
    const reachText = impact.externalProductionConsumerCount > 0
        ? `${impact.externalProductionConsumerCount} external production consumer file${impact.externalProductionConsumerCount === 1 ? '' : 's'}`
        : `${impact.reachableProductionConsumerCount} production consumer file${impact.reachableProductionConsumerCount === 1 ? '' : 's'} inside this change`;
    const changed = impact.changedProductionConsumerCount > 0
        ? ` ${impact.changedProductionConsumerCount} consumer file${impact.changedProductionConsumerCount === 1 ? '' : 's'} also changed.`
        : '';
    const tests = ` tests: ${impact.testConsumerCount}`;
    const sensitive = impact.sensitiveConsumerCount > 0 ||
        impact.runtimeGovernanceConsumerCount > 0 ||
        impact.approvalRequiredConsumerCount > 0
        ? ` sensitive/runtime/approval consumers: ${impact.sensitiveConsumerCount}/${impact.runtimeGovernanceConsumerCount}/${impact.approvalRequiredConsumerCount}.`
        : '';
    const architecture = impact.highFanout
        ? ' High-fanout.'
        : impact.architectureRelevant
            ? ' Architecture-relevant.'
            : '';
    return (`Neurcode impact: ${impact.file}#${impact.symbol} changed a ${kinds} ` +
        `and reaches ${reachText}: ${production}${hidden}.${changed}${tests}.${sensitive}${architecture}`);
}
function formatInFlowConsequenceNudge(finding) {
    const summary = finding.consumerSummary;
    const production = (summary?.productionFiles ?? finding.externalConsumerFiles).slice(0, 3).join(', ');
    const hidden = (summary?.productionFiles ?? finding.externalConsumerFiles).length > 3
        ? `, +${(summary?.productionFiles ?? finding.externalConsumerFiles).length - 3} more`
        : '';
    const tests = summary?.testConsumerCount
        ? ` tests: ${summary.testConsumerCount}`
        : ' tests: 0';
    const sensitive = summary && (summary.sensitiveConsumerCount > 0 || summary.approvalRequiredConsumerCount > 0 || summary.runtimeGovernanceConsumerCount > 0)
        ? ` sensitive/runtime/approval consumers: ${summary.sensitiveConsumerCount}/${summary.runtimeGovernanceConsumerCount}/${summary.approvalRequiredConsumerCount}.`
        : '';
    const architecture = summary?.highFanout
        ? ' High-fanout.'
        : summary?.architectureRelevant
            ? ' Architecture-relevant.'
            : '';
    const kind = finding.findingType === 'effect-delta'
        ? 'runtime effect'
        : 'externally consumed contract';
    return (`Neurcode consequence: ${finding.file}#${finding.symbol} changed a ${kind} ` +
        `and reaches ${finding.externalConsumerCount} external non-test caller` +
        `${finding.externalConsumerCount === 1 ? '' : 's'}: ${production}${hidden}.${tests}.${sensitive}${architecture}`);
}
function impactNudgeSeverity(impact) {
    if (impact.findingTypes.includes('effect-delta') ||
        impact.approvalRequiredConsumerCount > 0 ||
        impact.runtimeGovernanceConsumerCount > 0 ||
        impact.sensitiveConsumerCount > 0 ||
        impact.highFanout) {
        return 'high';
    }
    return 'medium';
}
function impactNudgeKey(artifactHash, impact) {
    const payload = JSON.stringify({
        artifactHash,
        file: impact.file,
        symbol: impact.symbol,
        summary: impact.summary,
        findingTypes: impact.findingTypes,
        findingRanks: impact.findingRanks,
        productionFiles: impact.productionFiles,
        reasonCodes: impact.reasonCodes,
    });
    return (0, node_crypto_1.createHash)('sha256').update(payload).digest('hex').slice(0, 24);
}
function nudgeKey(artifactHash, finding) {
    const payload = JSON.stringify({
        artifactHash,
        findingType: finding.findingType,
        file: finding.file,
        symbol: finding.symbol,
        summary: finding.summary,
        externalConsumerFiles: finding.externalConsumerFiles,
        reasonCodes: finding.reasonCodes,
    });
    return (0, node_crypto_1.createHash)('sha256').update(payload).digest('hex').slice(0, 24);
}
//# sourceMappingURL=consequence-nudges.js.map