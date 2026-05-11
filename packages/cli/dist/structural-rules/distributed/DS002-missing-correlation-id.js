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
exports.DS002MissingCorrelationId = void 0;
const ts = __importStar(require("typescript"));
function getLineAndCol(sf, pos) {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
}
function getEvidenceLines(sourceText, line, extra = 1) {
    const lines = sourceText.split('\n');
    return lines.slice(line - 1, Math.min(line - 1 + extra, lines.length)).map(l => l.slice(0, 120)).join('\n');
}
/** Inbound request parameter names commonly used in handlers. */
const INBOUND_REQUEST_PARAMS = new Set(['req', 'request', 'ctx', 'context', 'event', 'evt']);
/** Outbound HTTP call method/function names. */
const OUTBOUND_HTTP_METHODS = new Set(['fetch', 'get', 'post', 'put', 'patch', 'delete', 'head', 'request']);
/** Axios/got object names. */
const HTTP_CLIENT_NAMES = new Set(['axios', 'got', 'http', 'https', 'superagent', 'request', 'needle', 'ky']);
/** Correlation/trace header keywords. */
const CORRELATION_KEYWORDS = [
    'correlation',
    'x-request-id',
    'x-trace-id',
    'traceparent',
    'x-correlation',
    'trace-id',
    'request-id',
    'x-b3-traceid',
    'tracestate',
];
function containsCorrelationHeader(text) {
    const lower = text.toLowerCase();
    return CORRELATION_KEYWORDS.some(kw => lower.includes(kw));
}
/** Check if a function parameter name suggests an inbound request. */
function hasInboundRequestParam(params) {
    for (const param of params) {
        if (ts.isIdentifier(param.name)) {
            const name = param.name.text.toLowerCase();
            if (INBOUND_REQUEST_PARAMS.has(name))
                return true;
            // Also check destructured: { req, res }
        }
        else if (ts.isObjectBindingPattern(param.name)) {
            for (const element of param.name.elements) {
                if (ts.isIdentifier(element.name) && INBOUND_REQUEST_PARAMS.has(element.name.text)) {
                    return true;
                }
            }
        }
    }
    return false;
}
/**
 * Detect outbound HTTP calls in a block.
 * Returns all call expression nodes that appear to be outbound HTTP calls.
 */
function findOutboundHttpCalls(block) {
    const calls = [];
    function visit(node) {
        if (ts.isCallExpression(node)) {
            const expr = node.expression;
            // fetch(...) — top-level call
            if (ts.isIdentifier(expr) && expr.text === 'fetch') {
                calls.push(node);
            }
            // axios.get/post/put/patch/delete/request(...)
            // got.get/post(...), http.get(...), etc.
            if (ts.isPropertyAccessExpression(expr)) {
                const objName = ts.isIdentifier(expr.expression) ? expr.expression.text : '';
                const methodName = expr.name.text;
                if (HTTP_CLIENT_NAMES.has(objName) && OUTBOUND_HTTP_METHODS.has(methodName)) {
                    calls.push(node);
                }
                // Also: axios({...}) — called directly
                if (HTTP_CLIENT_NAMES.has(objName) && !OUTBOUND_HTTP_METHODS.has(methodName)) {
                    // not a recognized method, skip
                }
            }
            // axios({...}) — called as function
            if (ts.isIdentifier(expr) && HTTP_CLIENT_NAMES.has(expr.text)) {
                calls.push(node);
            }
        }
        // Don't recurse into nested function definitions
        if (ts.isFunctionDeclaration(node) ||
            ts.isFunctionExpression(node) ||
            ts.isArrowFunction(node) ||
            ts.isMethodDeclaration(node)) {
            return;
        }
        ts.forEachChild(node, visit);
    }
    ts.forEachChild(block, visit);
    return calls;
}
/**
 * Check if a call expression includes a correlation/trace header.
 * We check the text of the entire call site.
 */
function callIncludesCorrelationHeader(callNode, sf) {
    const callText = callNode.getText(sf);
    return containsCorrelationHeader(callText);
}
class DS002MissingCorrelationId {
    id = 'DS002';
    name = 'Missing correlation ID propagation in outbound HTTP call';
    policyRef = 'DS002';
    severity = 'ADVISORY';
    languages = ['typescript', 'javascript'];
    description = 'HTTP handler functions that make outbound HTTP calls without propagating a correlation/trace ID header — ' +
        'distributed traces are broken, making incident response significantly harder.';
    check(filePath, sourceText) {
        try {
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
                const isFuncLike = ts.isFunctionDeclaration(node) ||
                    ts.isFunctionExpression(node) ||
                    ts.isArrowFunction(node) ||
                    ts.isMethodDeclaration(node);
                if (isFuncLike && ts.isFunctionLike(node) && node.body && ts.isBlock(node.body)) {
                    const funcNode = node;
                    const params = funcNode.parameters;
                    // Must have an inbound request parameter
                    if (!hasInboundRequestParam(params)) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    const block = node.body;
                    const outboundCalls = findOutboundHttpCalls(block);
                    if (outboundCalls.length === 0) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    for (const callNode of outboundCalls) {
                        if (!callIncludesCorrelationHeader(callNode, sf)) {
                            const { line, column } = getLineAndCol(sf, callNode.getStart(sf));
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
                                operationalRisk: 'Distributed trace correlation is lost. A failure in the downstream service cannot be ' +
                                    'linked to the originating request. Incident response time increases 3–5× when traces ' +
                                    'are not propagated.',
                                remediation: 'Forward the correlation header from the inbound request: ' +
                                    '`fetch(url, { headers: { "x-correlation-id": req.headers["x-correlation-id"] } })`. ' +
                                    'Or use an OpenTelemetry propagator to inject tracing context automatically.',
                                determinism: 'heuristic-advisory',
                                confidence: 0.65,
                                language: filePath.match(/\.(js|jsx)$/) ? 'javascript' : 'typescript',
                            });
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
exports.DS002MissingCorrelationId = DS002MissingCorrelationId;
//# sourceMappingURL=DS002-missing-correlation-id.js.map