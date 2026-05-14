"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePolicyDecisionFromViolations = resolvePolicyDecisionFromViolations;
function resolvePolicyDecisionFromViolations(violations) {
    let hasWarn = false;
    for (const violation of violations) {
        const severity = String(violation.severity || '').toLowerCase();
        if (severity === 'block') {
            return 'block';
        }
        if (severity === 'warn') {
            hasWarn = true;
        }
    }
    return hasWarn ? 'warn' : 'allow';
}
//# sourceMappingURL=policy-decision.js.map