"use strict";
/**
 * Domain Requirements Map — declares the set of components expected for each
 * implementation domain, their weights, and which ones are security-critical.
 *
 * Keep keys lowercase-kebab.  They are used as-is in user-facing output so
 * they should be readable without further transformation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CRITICAL_COMPONENTS = exports.COMPONENT_WEIGHTS = exports.DOMAIN_REQUIREMENTS = void 0;
exports.weightOf = weightOf;
exports.isCritical = isCritical;
exports.labelForComponent = labelForComponent;
exports.requirementsForDomain = requirementsForDomain;
// ── Domain requirements ───────────────────────────────────────────────────────
exports.DOMAIN_REQUIREMENTS = {
    auth: [
        'input-validation',
        'token-generation',
        'token-expiry',
        'role-check',
        'middleware-protection',
        'password-hashing',
    ],
    api: [
        'input-validation',
        'error-handling',
        'service-layer-separation',
        'auth-middleware',
        'response-schema',
    ],
    payment: [
        'input-validation',
        'idempotency',
        'webhook-verification',
        'error-handling',
        'secure-data-handling',
    ],
    database: [
        'transaction-handling',
        'migration-safety',
        'connection-pooling',
        'input-sanitization',
    ],
    security: [
        'input-sanitization',
        'output-encoding',
        'secret-management',
        'cors-policy',
        'https-enforcement',
    ],
    notification: [
        'recipient-validation',
        'retry-logic',
        'template-validation',
        'rate-limiting',
    ],
    file: [
        'file-type-validation',
        'size-limit-enforcement',
        'filename-sanitization',
        'access-control',
    ],
};
// ── Component weights ─────────────────────────────────────────────────────────
//
// Higher = more important for weighted coverage calculation.
// Components with a weight of 3 are security-critical gates.
// Default weight for any unlisted component is 1.
exports.COMPONENT_WEIGHTS = {
    // auth
    'input-validation': 3,
    'token-generation': 2,
    'token-expiry': 3,
    'role-check': 2,
    'middleware-protection': 2,
    'password-hashing': 3,
    // api
    'error-handling': 2,
    'service-layer-separation': 1,
    'auth-middleware': 2,
    'response-schema': 1,
    // payment
    'idempotency': 2,
    'webhook-verification': 3,
    'secure-data-handling': 3,
    // database
    'transaction-handling': 2,
    'migration-safety': 3,
    'connection-pooling': 1,
    'input-sanitization': 3,
    // security
    'output-encoding': 3,
    'secret-management': 3,
    'cors-policy': 2,
    'https-enforcement': 3,
    // notification
    'recipient-validation': 2,
    'retry-logic': 1,
    'template-validation': 1,
    'rate-limiting': 2,
    // file
    'file-type-validation': 3,
    'size-limit-enforcement': 2,
    'filename-sanitization': 2,
    'access-control': 3,
};
// ── Critical components ───────────────────────────────────────────────────────
//
// If any critical component is absent the system is classified CRITICAL
// regardless of overall coverage percentage.
exports.CRITICAL_COMPONENTS = new Set([
    'input-validation',
    'token-expiry',
    'password-hashing',
    'webhook-verification',
    'migration-safety',
    'input-sanitization',
    'output-encoding',
    'secret-management',
    'https-enforcement',
    'file-type-validation',
    'access-control',
]);
// ── Helpers ───────────────────────────────────────────────────────────────────
function weightOf(key) {
    return exports.COMPONENT_WEIGHTS[key] ?? 1;
}
function isCritical(key) {
    return exports.CRITICAL_COMPONENTS.has(key);
}
/**
 * Human-readable label for a component key, used in CLI output.
 */
function labelForComponent(key) {
    return key
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
/**
 * Returns the requirements list for a domain, or [] if the domain is unknown.
 */
function requirementsForDomain(domain) {
    return exports.DOMAIN_REQUIREMENTS[domain.toLowerCase()] ?? [];
}
//# sourceMappingURL=requirements.js.map