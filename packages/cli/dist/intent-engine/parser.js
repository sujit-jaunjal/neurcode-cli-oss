"use strict";
/**
 * Intent Parser — keyword-heuristic only, no LLM calls.
 * Converts a free-text intent string into structured domains, expected code
 * patterns, and critical rules that the matcher uses to audit the diff.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseIntent = parseIntent;
// ── Domain keyword map ────────────────────────────────────────────────────────
const DOMAIN_KEYWORDS = {
    auth: ['auth', 'login', 'logout', 'jwt', 'token', 'session', 'password',
        'credential', 'oauth', 'sso', 'rbac', 'role', 'permission', 'signup',
        'register', 'authenticate', 'authorize', 'bearer'],
    api: ['api', 'endpoint', 'route', 'handler', 'controller', 'rest',
        'graphql', 'middleware', 'request', 'response', 'webhook', 'http'],
    ui: ['ui', 'component', 'view', 'page', 'screen', 'form', 'button',
        'modal', 'layout', 'frontend', 'react', 'vue', 'angular', 'tsx', 'jsx'],
    database: ['database', 'db', 'sql', 'query', 'migration', 'schema', 'model',
        'repository', 'prisma', 'orm', 'table', 'postgres', 'mysql', 'mongo'],
    payment: ['payment', 'billing', 'stripe', 'invoice', 'charge',
        'subscription', 'checkout', 'price', 'wallet', 'refund'],
    security: ['security', 'encrypt', 'hash', 'salt', 'tls', 'ssl', 'xss',
        'csrf', 'injection', 'sanitize', 'validate', 'vulnerability'],
    notification: ['notification', 'email', 'sms', 'push', 'alert', 'message'],
    file: ['file', 'upload', 'download', 'storage', 's3', 'blob', 'attachment', 'media'],
    testing: ['test', 'spec', 'mock', 'unit', 'integration', 'e2e', 'coverage'],
};
// ── Domain → expected patterns ────────────────────────────────────────────────
const DOMAIN_PATTERNS = {
    auth: ['token validation', 'role checks', 'middleware auth', 'session handling',
        'password hashing', 'token expiry'],
    api: ['input validation', 'error handling', 'auth middleware', 'rate limiting',
        'response schema'],
    database: ['migration safety', 'transaction handling', 'index coverage',
        'connection pooling'],
    payment: ['payment validation', 'idempotency', 'webhook verification',
        'error recovery', 'PCI compliance'],
    security: ['input sanitization', 'output encoding', 'secret management',
        'CORS policy', 'CSP headers'],
    ui: ['prop validation', 'error boundaries', 'loading states', 'accessibility'],
    notification: ['retry logic', 'delivery confirmation', 'template validation'],
    file: ['file type validation', 'size limits', 'virus scanning', 'access control'],
    testing: ['coverage thresholds', 'mock boundaries', 'assertion completeness'],
};
// ── Domain → critical rules ───────────────────────────────────────────────────
const DOMAIN_RULES = {
    auth: ['no-auth-bypass', 'validate-input', 'secure-token', 'role-enforcement',
        'no-plaintext-password'],
    api: ['validate-input', 'handle-errors', 'require-auth', 'no-uncaught-promise'],
    database: ['no-destructive-migration', 'use-transactions', 'validate-schema',
        'no-raw-sql-interpolation'],
    payment: ['secure-payment-data', 'idempotent-operations', 'validate-webhooks',
        'no-log-card-data'],
    security: ['sanitize-inputs', 'no-secrets-in-code', 'enforce-tls',
        'no-eval', 'no-innerHTML'],
    ui: ['no-direct-db-in-ui', 'validate-props', 'handle-loading'],
    notification: ['validate-recipients', 'rate-limit-sends'],
    file: ['validate-file-type', 'enforce-size-limit', 'sanitize-filename'],
    testing: ['no-test-skips', 'no-only-blocks'],
};
// ── Public API ────────────────────────────────────────────────────────────────
function parseIntent(intent) {
    if (!intent || !intent.trim()) {
        return { domains: [], expectedPatterns: [], criticalRules: [] };
    }
    const lower = intent.toLowerCase();
    const words = lower.split(/\W+/).filter(Boolean);
    const wordSet = new Set(words);
    const matchedDomains = new Set();
    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
        for (const keyword of keywords) {
            if (lower.includes(keyword) || wordSet.has(keyword)) {
                matchedDomains.add(domain);
                break;
            }
        }
    }
    const domains = [...matchedDomains];
    const expectedPatterns = [];
    const criticalRules = [];
    for (const domain of domains) {
        for (const pattern of (DOMAIN_PATTERNS[domain] ?? [])) {
            if (!expectedPatterns.includes(pattern))
                expectedPatterns.push(pattern);
        }
        for (const rule of (DOMAIN_RULES[domain] ?? [])) {
            if (!criticalRules.includes(rule))
                criticalRules.push(rule);
        }
    }
    return { domains, expectedPatterns, criticalRules };
}
//# sourceMappingURL=parser.js.map