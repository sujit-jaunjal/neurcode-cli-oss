"use strict";
/**
 * Flow Validator — checks whether detected components are correctly connected
 * to each other to form a functioning end-to-end system.
 *
 * This is orthogonal to presence checking (matcher.ts).  A component can be
 * present but disconnected (e.g. middleware defined but never applied to routes).
 *
 * All checks are deterministic.  No LLM calls.  No disk I/O — operates only
 * on data already produced by the indexer and graph builder.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateFlows = validateFlows;
const graph_1 = require("./graph");
// ── Regex constants ───────────────────────────────────────────────────────────
// Token generation
const RE_TOKEN_SIGN = /jwt\.sign\s*\(|signToken\s*\(|signJWT\s*\(/i;
// Token validation (as used in middleware)
const RE_TOKEN_VERIFY = /jwt\.verify\s*\(|verifyToken\s*\(|validateToken\s*\(|verify(JWT|Token|Auth)\s*\(/i;
// Middleware being applied to routes
const RE_MIDDLEWARE_APPLY = /router\.(use|get|post|put|delete|patch)\s*\([^,)]*,\s*(auth|protect|verify|guard|middleware)/i;
const RE_APP_MIDDLEWARE = /app\.(use|get|post|put|delete|patch)\s*\([^,)]*,?\s*(auth|protect|verify|guard|require)/i;
// Auth / crypto in UI
const RE_AUTH_IN_UI = /jwt\.(sign|verify)\s*\(|bcrypt\.(hash|compare)\s*\(/i;
// Webhook handling
const RE_WEBHOOK_HANDLER = /webhook|stripe.*event|paypal.*webhook/i;
const RE_WEBHOOK_VERIFY = /stripe\.webhooks\.constructEvent\s*\(|verifyWebhookSignature\s*\(|createHmac\s*\(/i;
// Payment charge
const RE_PAYMENT_CHARGE = /stripe\.charges\.create\s*\(|stripe\.paymentIntents\.create\s*\(|charge\s*\(/i;
const RE_IDEMPOTENCY = /idempotencyKey\s*:|idempotency.key\s*:|findOrCreate/i;
// File storage
const RE_FILE_STORE = /\.(save|write|upload|put)\s*\(|multer|diskStorage|s3\.(upload|putObject)/i;
const RE_FILE_TYPE_CHECK = /mimetype.*valid|allowedMimeTypes|fileFilter\s*\(|mime\.getType/i;
// DB direct in routes
const RE_DB_DIRECT = /\b(prisma|db|knex|sequelize|pool)\s*\.\s*(query|findMany|findFirst|findUnique|create|update|delete|execute)\b/i;
// Import from service layer
const RE_SERVICE_IMPORT = /import\s+.*from\s+['"][^'"]*\/(service|repository|repo|use[-_]?case)[^'"]*['"]/i;
// ── Domain validators ─────────────────────────────────────────────────────────
function validateAuthFlow(componentMap, graph) {
    const issues = [];
    // A. Token → Middleware: token generated but never verified in the diff
    const tokenGenFiles = componentMap['token-generation'] ?? [];
    const middlewareNodes = (0, graph_1.nodesOfLayer)(graph, 'middleware', 'api');
    if (tokenGenFiles.length > 0) {
        const verificationExists = middlewareNodes.some((n) => RE_TOKEN_VERIFY.test(n.addedContent));
        if (!verificationExists) {
            // Also check all diff nodes — verification may be in a service file
            const anyVerification = (0, graph_1.anyNodeMatches)(graph, RE_TOKEN_VERIFY);
            if (!anyVerification) {
                issues.push({
                    rule: 'flow:token-not-validated-in-middleware',
                    type: 'missing-flow',
                    message: 'Token is generated but not validated in middleware — add jwt.verify() / verifyToken() in an auth middleware',
                    files: tokenGenFiles,
                    severity: 'high',
                });
            }
        }
    }
    // B. Middleware → Routes: middleware defined or found but never applied in route files
    const middlewareProtectionFiles = componentMap['middleware-protection'] ?? [];
    const authMiddlewareFiles = componentMap['auth-middleware'] ?? [];
    const knownMiddlewareFiles = [...new Set([...middlewareProtectionFiles, ...authMiddlewareFiles])];
    if (knownMiddlewareFiles.length > 0) {
        const routeNodes = (0, graph_1.nodesOfLayer)(graph, 'api');
        // Check if any route node applies middleware via router.use/app.use/inline
        const middlewareApplied = routeNodes.some((n) => RE_MIDDLEWARE_APPLY.test(n.addedContent)) ||
            routeNodes.some((n) => RE_APP_MIDDLEWARE.test(n.addedContent)) ||
            // Or imports the middleware file
            routeNodes.some((n) => knownMiddlewareFiles.some((mf) => (0, graph_1.nodeImportsFile)(n, mf)));
        if (!middlewareApplied && routeNodes.length > 0) {
            issues.push({
                rule: 'flow:middleware-not-applied-to-routes',
                type: 'disconnected-flow',
                message: 'Auth middleware is defined but not applied to any routes — wire it into route definitions with router.use(authMiddleware)',
                files: [...routeNodes.map((n) => n.file), ...knownMiddlewareFiles],
                severity: 'high',
            });
        }
    }
    // C. Layer violation: auth logic found in UI components
    const uiNodes = (0, graph_1.nodesOfLayer)(graph, 'ui');
    const uiOffenders = uiNodes.filter((n) => RE_AUTH_IN_UI.test(n.addedContent));
    if (uiOffenders.length > 0) {
        issues.push({
            rule: 'flow:auth-in-ui-layer',
            type: 'misplaced-flow',
            message: 'Auth / crypto logic found in UI layer — JWT signing, verification, and bcrypt calls must live in the API or service layer',
            files: uiOffenders.map((n) => n.file),
            severity: 'medium',
        });
    }
    return issues;
}
function validateApiFlow(componentMap, graph) {
    const issues = [];
    // Route handler calls DB directly without going through a service layer
    const routeNodes = (0, graph_1.nodesOfLayer)(graph, 'api');
    const directDbRoutes = routeNodes.filter((n) => RE_DB_DIRECT.test(n.addedContent) && !RE_SERVICE_IMPORT.test(n.addedContent));
    if (directDbRoutes.length > 0) {
        issues.push({
            rule: 'flow:service-not-separated',
            type: 'misplaced-flow',
            message: 'Route handler(s) access the database directly — extract DB logic into a service or repository module',
            files: directDbRoutes.map((n) => n.file),
            severity: 'medium',
        });
    }
    return issues;
}
function validatePaymentFlow(componentMap, graph) {
    const issues = [];
    // D. Webhook handler without signature verification
    const hasWebhookHandler = (0, graph_1.anyNodeMatches)(graph, RE_WEBHOOK_HANDLER);
    const hasWebhookVerify = (0, graph_1.anyNodeMatches)(graph, RE_WEBHOOK_VERIFY);
    if (hasWebhookHandler && !hasWebhookVerify) {
        const webhookFiles = [...graph.values()]
            .filter((n) => RE_WEBHOOK_HANDLER.test(n.addedContent))
            .map((n) => n.file);
        issues.push({
            rule: 'flow:webhook-handler-without-verification',
            type: 'missing-flow',
            message: 'Webhook handler added but signature is not verified — use stripe.webhooks.constructEvent() or createHmac() to authenticate the payload',
            files: webhookFiles,
            severity: 'high',
        });
    }
    // E. Payment charge without idempotency gate
    const hasPaymentCharge = (0, graph_1.anyNodeMatches)(graph, RE_PAYMENT_CHARGE);
    const hasIdempotency = (0, graph_1.anyNodeMatches)(graph, RE_IDEMPOTENCY);
    if (hasPaymentCharge && !hasIdempotency) {
        const chargeFiles = [...graph.values()]
            .filter((n) => RE_PAYMENT_CHARGE.test(n.addedContent))
            .map((n) => n.file);
        issues.push({
            rule: 'flow:payment-no-idempotency-gate',
            type: 'missing-flow',
            message: 'Payment charge code found without idempotency key handling — add idempotency checks to prevent duplicate charges',
            files: chargeFiles,
            severity: 'high',
        });
    }
    return issues;
}
function validateFileFlow(componentMap, graph) {
    const issues = [];
    const hasFileStore = (0, graph_1.anyNodeMatches)(graph, RE_FILE_STORE);
    const hasTypeCheck = (0, graph_1.anyNodeMatches)(graph, RE_FILE_TYPE_CHECK);
    if (hasFileStore && !hasTypeCheck) {
        const storeFiles = [...graph.values()]
            .filter((n) => RE_FILE_STORE.test(n.addedContent))
            .map((n) => n.file);
        issues.push({
            rule: 'flow:file-stored-without-type-check',
            type: 'missing-flow',
            message: 'File storage code found but MIME type / file-type validation is absent — validate mimetype before accepting uploads',
            files: storeFiles,
            severity: 'high',
        });
    }
    return issues;
}
// ── Domain dispatch ───────────────────────────────────────────────────────────
const DOMAIN_VALIDATORS = {
    auth: validateAuthFlow,
    api: validateApiFlow,
    payment: validatePaymentFlow,
    file: validateFileFlow,
};
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Run all flow validators for the given domains.
 *
 * @param domains       - Domains inferred from plan intent (e.g. ['auth', 'api'])
 * @param componentMap  - Component key → file paths (from matcher.ts)
 * @param graph         - Dependency graph built from indexed diff files
 * @returns Deduplicated list of FlowIssue
 */
function validateFlows(domains, componentMap, graph) {
    if (domains.length === 0 || graph.size === 0)
        return [];
    const issueMap = new Map();
    for (const domain of domains) {
        const validator = DOMAIN_VALIDATORS[domain.toLowerCase()];
        if (!validator)
            continue;
        try {
            const domainIssues = validator(componentMap, graph);
            for (const issue of domainIssues) {
                // Deduplicate by rule — first reporter wins
                if (!issueMap.has(issue.rule)) {
                    issueMap.set(issue.rule, issue);
                }
            }
        }
        catch {
            // Non-fatal: a buggy validator must never break verification
        }
    }
    return [...issueMap.values()];
}
//# sourceMappingURL=flow-validator.js.map