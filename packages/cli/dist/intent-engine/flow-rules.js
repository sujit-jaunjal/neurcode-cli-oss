"use strict";
/**
 * Flow Rules — per-domain rules that describe how components must be
 * connected to each other to form a correct end-to-end implementation.
 *
 * These rules are evaluated by flow-validator.ts against the dependency
 * graph built from indexed diff files.  They describe connectivity
 * requirements, NOT presence requirements (presence is handled by matcher.ts).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FLOW_RULES = void 0;
exports.flowRulesForDomain = flowRulesForDomain;
exports.FLOW_RULES = {
    auth: [
        {
            id: 'flow:token-not-validated-in-middleware',
            description: 'Token must be validated in middleware before reaching route handlers',
            type: 'missing-flow',
            severity: 'high',
            domain: 'auth',
        },
        {
            id: 'flow:middleware-not-applied-to-routes',
            description: 'Auth middleware must be applied to protected route definitions',
            type: 'disconnected-flow',
            severity: 'high',
            domain: 'auth',
        },
        {
            id: 'flow:auth-in-ui-layer',
            description: 'Auth / crypto logic should not be implemented in UI layer components',
            type: 'misplaced-flow',
            severity: 'medium',
            domain: 'auth',
        },
    ],
    api: [
        {
            id: 'flow:validation-before-handler',
            description: 'Input validation middleware must run before route handler business logic',
            type: 'missing-flow',
            severity: 'high',
            domain: 'api',
        },
        {
            id: 'flow:service-not-separated',
            description: 'Route handlers should delegate to a service layer rather than calling DB directly',
            type: 'misplaced-flow',
            severity: 'medium',
            domain: 'api',
        },
    ],
    payment: [
        {
            id: 'flow:webhook-handler-without-verification',
            description: 'Webhook payload must be verified before processing payment events',
            type: 'missing-flow',
            severity: 'high',
            domain: 'payment',
        },
        {
            id: 'flow:payment-no-idempotency-gate',
            description: 'Idempotency key must be checked before executing a charge or mutation',
            type: 'missing-flow',
            severity: 'high',
            domain: 'payment',
        },
    ],
    file: [
        {
            id: 'flow:file-stored-without-type-check',
            description: 'File type and MIME type must be validated before storage or further processing',
            type: 'missing-flow',
            severity: 'high',
            domain: 'file',
        },
    ],
};
/** Returns all flow rules for a given domain, or [] if the domain is unknown. */
function flowRulesForDomain(domain) {
    return exports.FLOW_RULES[domain.toLowerCase()] ?? [];
}
//# sourceMappingURL=flow-rules.js.map