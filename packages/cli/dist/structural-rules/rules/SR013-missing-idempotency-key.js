"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SR013MissingIdempotencyKey = void 0;
const ts = __importStar(require("typescript"));
function getLineAndCol(sf, pos) {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
}
function getEvidenceLines(sourceText, line, extra = 1) {
    const lines = sourceText.split('\n');
    return lines.slice(line - 1, Math.min(line - 1 + extra, lines.length)).map(l => l.slice(0, 120)).join('\n');
}
/** Payment/charge-related function name patterns. */
const PAYMENT_FUNCTION_PATTERNS = [
    'createcharge',
    'processpayment',
    'chargecustomer',
    'createorder',
    'placeorder',
    'submitpayment',
    'makepayment',
    'initiatecharge',
    'processcheckout',
    'createsubscription',
];
/** Express-style route path patterns for payment routes. */
const PAYMENT_ROUTE_PATTERNS = ['payment', 'charge', 'order', 'subscribe', 'checkout', 'billing'];
/** HTTP mutation method names to detect router.post/put/patch calls. */
const HTTP_MUTATION_METHODS = ['post', 'put', 'patch'];
function isMutationRouteName(name) {
    return HTTP_MUTATION_METHODS.includes(name.toLowerCase());
}
function isPaymentFunctionName(name) {
    const lower = name.toLowerCase();
    return PAYMENT_FUNCTION_PATTERNS.some(p => lower.includes(p));
}
function isPaymentRoutePath(pathText) {
    const lower = pathText.toLowerCase();
    return PAYMENT_ROUTE_PATTERNS.some(p => lower.includes(p));
}
function containsIdempotencyRef(bodyText) {
    const lower = bodyText.toLowerCase();
    return lower.includes('idempotency') || lower.includes('idempotent');
}
function isTestFile(filePath) {
    return filePath.includes('.test.') || filePath.includes('.spec.');
}
/** Get the text of a function-like node body. */
function getFunctionBodyText(node, sf) {
    if (node.body) {
        return node.body.getText(sf);
    }
    return '';
}
/** Extract string literal value from an expression, if it is one. */
function tryGetStringLiteral(node) {
    if (ts.isStringLiteral(node))
        return node.text;
    if (ts.isNoSubstitutionTemplateLiteral(node))
        return node.text;
    return undefined;
}
class SR013MissingIdempotencyKey {
    id = 'SR013';
    name = 'Missing idempotency key in payment handler';
    policyRef = 'SR013';
    severity = 'ADVISORY';
    languages = ['typescript', 'javascript'];
    description = 'HTTP mutation handlers for payment/charge/order operations that do not reference an idempotency key ' +
        'risk duplicate charges on retry or double-submission.';
    check(filePath, sourceText) {
        try {
            if (isTestFile(filePath))
                return [];
            const violations = [];
            const ext = filePath.endsWith('.tsx')
                ? ts.ScriptKind.TSX
                : filePath.endsWith('.jsx')
                    ? ts.ScriptKind.JSX
                    : filePath.endsWith('.js')
                        ? ts.ScriptKind.JS
                        : ts.ScriptKind.TS;
            const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ext);
            const visit = (node) => {
                // Pattern 1: Named function declarations/expressions with payment-related names
                if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) &&
                    ts.isFunctionLike(node)) {
                    let funcName;
                    if (ts.isFunctionDeclaration(node) && node.name) {
                        funcName = node.name.text;
                    }
                    else if (ts.isFunctionExpression(node) && node.name) {
                        funcName = node.name.text;
                    }
                    else {
                        // Try to get name from variable declaration parent
                        const parent = node.parent;
                        if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
                            funcName = parent.name.text;
                        }
                        else if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
                            funcName = parent.name.text;
                        }
                        else if (ts.isMethodDeclaration(parent) && ts.isIdentifier(parent.name)) {
                            funcName = parent.name.text;
                        }
                    }
                    if (funcName && isPaymentFunctionName(funcName)) {
                        const bodyText = getFunctionBodyText(node, sf);
                        if (bodyText && !containsIdempotencyRef(bodyText)) {
                            const { line, column } = getLineAndCol(sf, node.getStart(sf));
                            const evidence = getEvidenceLines(sourceText, line, 2);
                            violations.push({
                                ruleId: this.id,
                                ruleName: this.name,
                                policyRef: this.policyRef,
                                severity: this.severity,
                                filePath,
                                line,
                                column,
                                evidence,
                                operationalRisk: 'Duplicate network requests (retries, double-clicks, load balancer replays) trigger ' +
                                    'duplicate charges. Without idempotency keys, a payment processor receives two identical ' +
                                    'requests and processes both.',
                                remediation: 'Generate and pass an idempotency key per operation. For Stripe: ' +
                                    '`stripe.charges.create(params, { idempotencyKey: uuidv4() })`. ' +
                                    'Store used keys to detect and short-circuit duplicates.',
                                determinism: 'heuristic-advisory',
                                confidence: 0.72,
                                language: filePath.match(/\.(js|jsx)$/) ? 'javascript' : 'typescript',
                            });
                        }
                    }
                }
                // Pattern 2: Express-style route handlers: router.post('/payment', handler)
                if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
                    const methodName = node.expression.name.text;
                    if (isMutationRouteName(methodName) && node.arguments.length >= 2) {
                        const pathArg = node.arguments[0];
                        const pathStr = tryGetStringLiteral(pathArg);
                        if (pathStr && isPaymentRoutePath(pathStr)) {
                            // Get the last argument as the handler
                            const handlerArg = node.arguments[node.arguments.length - 1];
                            if (ts.isFunctionLike(handlerArg) ||
                                ts.isArrowFunction(handlerArg) ||
                                ts.isFunctionExpression(handlerArg)) {
                                const bodyText = getFunctionBodyText(handlerArg, sf);
                                if (bodyText && !containsIdempotencyRef(bodyText)) {
                                    const { line, column } = getLineAndCol(sf, node.expression.name.getStart(sf));
                                    const evidence = getEvidenceLines(sourceText, line, 2);
                                    violations.push({
                                        ruleId: this.id,
                                        ruleName: this.name,
                                        policyRef: this.policyRef,
                                        severity: this.severity,
                                        filePath,
                                        line,
                                        column,
                                        evidence,
                                        operationalRisk: 'Duplicate network requests (retries, double-clicks, load balancer replays) trigger ' +
                                            'duplicate charges. Without idempotency keys, a payment processor receives two identical ' +
                                            'requests and processes both.',
                                        remediation: 'Generate and pass an idempotency key per operation. For Stripe: ' +
                                            '`stripe.charges.create(params, { idempotencyKey: uuidv4() })`. ' +
                                            'Store used keys to detect and short-circuit duplicates.',
                                        determinism: 'heuristic-advisory',
                                        confidence: 0.72,
                                        language: filePath.match(/\.(js|jsx)$/) ? 'javascript' : 'typescript',
                                    });
                                }
                            }
                        }
                    }
                }
                ts.forEachChild(node, visit);
            };
            ts.forEachChild(sf, visit);
            return violations;
        }
        catch {
            return [];
        }
    }
}
exports.SR013MissingIdempotencyKey = SR013MissingIdempotencyKey;
//# sourceMappingURL=SR013-missing-idempotency-key.js.map