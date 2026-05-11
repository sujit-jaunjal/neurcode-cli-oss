"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeStructuralIntoPolicyViolations = mergeStructuralIntoPolicyViolations;
/**
 * Append structural violations to policy-engine rows so verdicts and JSON violations stay aligned.
 * Dedupes identical structural rule + file + line.
 */
function mergeStructuralIntoPolicyViolations(policyViolations, structuralViolations) {
    const seen = new Set(policyViolations.map((v) => `${v.rule}|${v.file}|${v.line ?? 0}`));
    for (const sv of structuralViolations) {
        const rule = `structural:${sv.ruleId}`;
        const key = `${rule}|${sv.filePath}|${sv.line}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        policyViolations.push({
            file: sv.filePath,
            rule,
            severity: sv.severity === 'BLOCKING' ? 'block' : 'warn',
            message: `[${sv.ruleId}] ${sv.ruleName}: ${sv.operationalRisk}`,
            line: sv.line,
        });
    }
}
//# sourceMappingURL=structural-policy-merge.js.map