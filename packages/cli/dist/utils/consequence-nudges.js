"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.consequenceNudgesEnabled = consequenceNudgesEnabled;
exports.selectInFlowConsequenceNudges = selectInFlowConsequenceNudges;
exports.isHighTrustInFlowFinding = isHighTrustInFlowFinding;
exports.formatInFlowConsequenceNudge = formatInFlowConsequenceNudge;
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
    const max = Number.isFinite(options.max) && options.max > 0 ? Math.floor(options.max) : 1;
    const consequence = artifact.consequenceUnderstanding;
    if (!consequence?.analyzed)
        return [];
    return consequence.topFindings
        .filter(isHighTrustInFlowFinding)
        .slice(0, max)
        .map((finding) => ({
        nudgeKey: nudgeKey(artifact.artifactHash, finding),
        severity: finding.findingType === 'effect-delta' ? 'high' : 'medium',
        headline: formatInFlowConsequenceNudge(finding),
        finding,
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
function formatInFlowConsequenceNudge(finding) {
    const external = finding.externalConsumerFiles.slice(0, 3).join(', ');
    const hidden = finding.externalConsumerFiles.length > 3
        ? `, +${finding.externalConsumerFiles.length - 3} more`
        : '';
    const kind = finding.findingType === 'effect-delta'
        ? 'runtime effect'
        : 'externally consumed contract';
    return (`⚡ Neurcode consequence: ${finding.file}#${finding.symbol} changed a ${kind} ` +
        `and reaches ${finding.externalConsumerCount} external non-test caller` +
        `${finding.externalConsumerCount === 1 ? '' : 's'}: ${external}${hidden}.`);
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