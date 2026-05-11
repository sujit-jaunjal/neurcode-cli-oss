"use strict";
/**
 * Remediation Boundary Enforcement (Phase 4)
 *
 * Validates that a remediation suggestion respects strict boundaries:
 *   - Same language as the finding
 *   - Same package/subsystem boundary (inferred from file path)
 *   - No cross-frontend/backend boundary crossings
 *
 * If no safe remediation can be proposed within these constraints, returns
 * the sentinel string "No safe remediation suggestion available." which is
 * preferable to misleading cross-boundary guidance.
 *
 * This is a deterministic, pure-function module — no I/O, no LLM.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NO_SAFE_REMEDIATION = void 0;
exports.validateRemediationBoundary = validateRemediationBoundary;
exports.boundedRemediation = boundedRemediation;
const FRONTEND_PATH_RE = /(?:^|\/)(?:web|frontend|client|ui|dashboard|pages?|components?|views?|screens?|app\/(?:page|layout))[/\\]/i;
const BACKEND_PATH_RE = /(?:^|\/)(?:api|services?|server|backend|controllers?|handlers?|routes?|domain)[/\\]/i;
const INFRA_PATH_RE = /(?:^|\/)(?:infra|k8s|terraform|docker|deploy|charts?)[/\\]/i;
const TEST_PATH_RE = /(?:^|\/)(?:__tests?__|tests?|spec|e2e)[/\\]|\.(?:test|spec)\.\w+$/i;
function classifySubsystem(filePath) {
    const p = filePath.replace(/\\/g, '/');
    if (TEST_PATH_RE.test(p))
        return 'test';
    if (INFRA_PATH_RE.test(p))
        return 'infra';
    if (FRONTEND_PATH_RE.test(p))
        return 'frontend';
    if (BACKEND_PATH_RE.test(p))
        return 'backend';
    return 'unknown';
}
// ── Language inference from file extension ────────────────────────────────────
function inferLanguageFromPath(filePath) {
    if (/\.(ts|tsx)$/.test(filePath))
        return 'typescript';
    if (/\.(js|jsx|mjs|cjs)$/.test(filePath))
        return 'javascript';
    if (/\.py$/.test(filePath))
        return 'python';
    return 'unknown';
}
// ── Boundary validation ───────────────────────────────────────────────────────
/**
 * Validate whether a remediation suggestion crosses acceptable boundaries.
 *
 * Enforcement rules (in priority order):
 * 1. Language boundary: finding language must match target language
 *    Exception: typescript ↔ javascript is allowed (same ecosystem)
 * 2. Frontend/backend boundary: must not cross unless explicitly linked
 * 3. Infrastructure boundary: infra files cannot be remediation targets for
 *    application-layer findings
 */
function validateRemediationBoundary(input) {
    const { findingFilePath, findingLanguage, targetFilePath, targetLanguage: explicitTargetLang, } = input;
    const effectiveTargetLang = explicitTargetLang ?? inferLanguageFromPath(targetFilePath);
    const findingSubsystem = classifySubsystem(findingFilePath);
    const targetSubsystem = classifySubsystem(targetFilePath);
    // ── Rule 1: Language boundary ──────────────────────────────────────────────
    if (effectiveTargetLang !== 'unknown' &&
        findingLanguage !== effectiveTargetLang) {
        // Allow typescript ↔ javascript (same ecosystem, transpiled)
        const tsJsCompat = (findingLanguage === 'typescript' && effectiveTargetLang === 'javascript') ||
            (findingLanguage === 'javascript' && effectiveTargetLang === 'typescript');
        if (!tsJsCompat) {
            return {
                allowed: false,
                safeRemediationUnavailable: true,
                reason: `Language boundary violation: finding is in '${findingLanguage}' but remediation ` +
                    `targets '${effectiveTargetLang}' file '${targetFilePath}'. ` +
                    'Cross-language remediation is not safe.',
            };
        }
    }
    // ── Rule 2: Frontend/backend boundary ─────────────────────────────────────
    if ((findingSubsystem === 'frontend' && targetSubsystem === 'backend') ||
        (findingSubsystem === 'backend' && targetSubsystem === 'frontend')) {
        return {
            allowed: false,
            safeRemediationUnavailable: true,
            reason: `Subsystem boundary violation: finding is in '${findingSubsystem}' ` +
                `but remediation targets '${targetSubsystem}' file '${targetFilePath}'. ` +
                'Cross-boundary remediation requires explicit architectural approval.',
        };
    }
    // ── Rule 3: Infra boundary ─────────────────────────────────────────────────
    if (targetSubsystem === 'infra' && findingSubsystem !== 'infra') {
        return {
            allowed: false,
            safeRemediationUnavailable: true,
            reason: `Infrastructure boundary violation: application-layer finding in '${findingFilePath}' ` +
                `cannot be remediated by modifying infrastructure file '${targetFilePath}'.`,
        };
    }
    return {
        allowed: true,
        reason: 'Remediation is within safe boundaries.',
    };
}
/**
 * The sentinel string returned when no safe remediation is available.
 * Consumers MUST check for this exact string and suppress remediation output.
 */
exports.NO_SAFE_REMEDIATION = 'No safe remediation suggestion available.';
/**
 * Wrap a remediation string with boundary validation.
 *
 * Returns the original remediation if the boundary is safe, or the
 * NO_SAFE_REMEDIATION sentinel if the boundary is violated.
 */
function boundedRemediation(input, remediation) {
    const result = validateRemediationBoundary(input);
    if (!result.allowed)
        return exports.NO_SAFE_REMEDIATION;
    return remediation;
}
//# sourceMappingURL=remediation-boundary.js.map