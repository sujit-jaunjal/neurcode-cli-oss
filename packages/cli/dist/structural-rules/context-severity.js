"use strict";
/**
 * Context-aware severity adjustment.
 *
 * The same structural violation has different operational risk depending
 * on where it appears in the codebase:
 *   - SR001 in src/auth/middleware.ts → BLOCKING (auth path is critical)
 *   - SR001 in test/helpers.ts → ADVISORY (tests are not production code)
 *   - SR004 in src/api/routes.ts → BLOCKING (request boundary)
 *   - SR004 in scripts/seed.ts → ADVISORY (internal tooling)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyFileContext = classifyFileContext;
exports.adjustViolationSeverity = adjustViolationSeverity;
exports.applyContextualSeverity = applyContextualSeverity;
// Rule IDs that get promoted to BLOCKING when in a critical path
const CRITICAL_PATH_PROMOTABLE_RULES = new Set([
    'SR001', 'SR004', 'SR006', 'SR007', 'SR016',
]);
/**
 * Classify a file path into a severity context.
 */
function classifyFileContext(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    const fileName = normalized.split('/').pop() ?? '';
    const isTestFile = /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(fileName) ||
        /\/__tests__\//.test(normalized) ||
        /(?:^|\/)tests?\//.test(normalized);
    const isAuthPath = /\/auth\//.test(normalized) ||
        /\/authentication\//.test(normalized) ||
        /\/authorization\//.test(normalized) ||
        /\/login\//.test(normalized) ||
        /\/session\//.test(normalized);
    const isPaymentPath = /\/payment\//.test(normalized) ||
        /\/billing\//.test(normalized) ||
        /\/stripe\//.test(normalized) ||
        /\/checkout\//.test(normalized);
    const isSecurityPath = /\/security\//.test(normalized) ||
        /\/crypto\//.test(normalized) ||
        /\/encrypt\//.test(normalized) ||
        /\/vault\//.test(normalized);
    const isScriptOrTooling = /\/scripts\//.test(normalized) ||
        /\/tools\//.test(normalized) ||
        /\/seed\//.test(normalized) ||
        /\/fixtures\//.test(normalized) ||
        /\/migrate\//.test(normalized) ||
        /\bseed\./.test(fileName) ||
        /\bfixture\./.test(fileName) ||
        /\bmigration\./.test(fileName);
    const isInfraPath = /\/infra\//.test(normalized) ||
        /\/k8s\//.test(normalized) ||
        /\/terraform\//.test(normalized) ||
        /\/docker\//.test(normalized) ||
        /\/deploy\//.test(normalized);
    return {
        isTestFile,
        isAuthPath,
        isPaymentPath,
        isSecurityPath,
        isScriptOrTooling,
        isInfraPath,
    };
}
/**
 * Adjust a violation's severity based on file path context.
 * Returns the adjusted violation (new object, original unmodified).
 */
function adjustViolationSeverity(violation, context) {
    const originalSeverity = violation.severity;
    let adjustedSeverity = originalSeverity;
    let reason = 'No adjustment — context is neutral';
    // Rule 1: Test files → always downgrade to ADVISORY
    if (context.isTestFile) {
        adjustedSeverity = 'ADVISORY';
        reason = 'Test file — violations are advisory only';
    }
    // Rule 2: Scripts / tooling → downgrade to ADVISORY
    else if (context.isScriptOrTooling) {
        adjustedSeverity = 'ADVISORY';
        reason = 'Tooling/script — not production request path';
    }
    // Rule 3: Critical path (auth/payment/security) → upgrade eligible ADVISORY to BLOCKING
    else if ((context.isAuthPath || context.isPaymentPath || context.isSecurityPath) &&
        originalSeverity === 'ADVISORY' &&
        CRITICAL_PATH_PROMOTABLE_RULES.has(violation.ruleId)) {
        adjustedSeverity = 'BLOCKING';
        reason = 'Critical path (auth/payment/security) — elevated severity';
    }
    const adjustment = {
        originalSeverity,
        adjustedSeverity,
        reason,
        contextFlags: context,
    };
    const adjustedViolation = adjustedSeverity === originalSeverity
        ? violation
        : { ...violation, severity: adjustedSeverity };
    return { violation: adjustedViolation, adjustment };
}
/**
 * Apply context-aware severity to an array of violations.
 * Returns adjusted violations with a summary of what changed.
 */
function applyContextualSeverity(violations) {
    const adjustedViolations = [];
    const adjustments = [];
    for (const violation of violations) {
        const context = classifyFileContext(violation.filePath);
        const { violation: adjusted, adjustment } = adjustViolationSeverity(violation, context);
        adjustedViolations.push(adjusted);
        adjustments.push(adjustment);
    }
    return { violations: adjustedViolations, adjustments };
}
//# sourceMappingURL=context-severity.js.map