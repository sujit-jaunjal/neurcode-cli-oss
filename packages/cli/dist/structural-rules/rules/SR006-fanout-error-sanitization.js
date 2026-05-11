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
exports.SR006FanoutErrorSanitization = void 0;
const ts = __importStar(require("typescript"));
function getLineAndCol(sf, pos) {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
}
function getEvidenceLines(sourceText, line) {
    const lines = sourceText.split('\n');
    return (lines[line - 1] || '').slice(0, 120);
}
/** Check if a node is a map.set(key, promise) call */
function isMapSetCall(node, sf) {
    if (!ts.isPropertyAccessExpression(node.expression))
        return false;
    if (node.expression.name.text !== 'set')
        return false;
    if (node.arguments.length < 2)
        return false;
    return true;
}
/**
 * Walk a node tree and find all .catch( call nodes.
 */
function findCatchCallsInNode(node) {
    const results = [];
    const visit = (n) => {
        if (ts.isCallExpression(n) &&
            ts.isPropertyAccessExpression(n.expression) &&
            n.expression.name.text === 'catch') {
            results.push(n);
        }
        ts.forEachChild(n, visit);
    };
    ts.forEachChild(node, visit);
    return results;
}
/**
 * Returns true if the catch callback:
 * - Has a non-empty body
 * - Does NOT contain a throw statement
 * - Does NOT wrap in new Error() or TRPCError()
 * - Does NOT call reject()
 */
function catchSwallowsError(catchCall, sf) {
    if (catchCall.arguments.length === 0)
        return false;
    const callback = catchCall.arguments[0];
    if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))
        return false;
    const body = callback.body;
    // Empty body — explicit suppression, different pattern
    if (ts.isBlock(body) && body.statements.length === 0)
        return false;
    const bodyText = body.getText(sf);
    // If it throws or rejects, it's fine
    if (/\bthrow\b/.test(bodyText))
        return false;
    if (/\breject\s*\(/.test(bodyText))
        return false;
    // If it wraps in a new Error or TRPCError, it's fine
    if (/new\s+(Error|TRPCError)\s*\(/.test(bodyText))
        return false;
    return true;
}
class SR006FanoutErrorSanitization {
    id = 'SR006';
    name = 'Fanout promise error not sanitized';
    policyRef = 'P010';
    severity = 'BLOCKING';
    languages = ['typescript', 'javascript'];
    description = 'Promise stored in a coalescing Map with a .catch that returns a default value without re-throwing leaks failures silently.';
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
            // Find all map.set(key, ...) calls
            const visit = (node) => {
                if (ts.isCallExpression(node) && isMapSetCall(node, sf)) {
                    // The second argument is the value being stored — look for .catch on it
                    const valueArg = node.arguments[1];
                    const catchCalls = findCatchCallsInNode(valueArg);
                    for (const catchCall of catchCalls) {
                        if (catchSwallowsError(catchCall, sf)) {
                            const { line, column } = getLineAndCol(sf, catchCall.getStart(sf));
                            const evidence = getEvidenceLines(sourceText, line);
                            violations.push({
                                ruleId: this.id,
                                ruleName: this.name,
                                policyRef: this.policyRef,
                                severity: this.severity,
                                filePath,
                                line,
                                column,
                                evidence,
                                operationalRisk: 'When a promise stored in a coalescing Map resolves to a default/null value instead of ' +
                                    'rejecting, all waiting callers receive a silent success. The original error is lost, ' +
                                    'and callers proceed with invalid/empty data, causing silent data corruption.',
                                remediation: 'In the .catch handler, either re-throw the error (`throw err`) or wrap it: ' +
                                    '`throw new Error(`fanout failure: ${err.message}`)`. ' +
                                    'Callers should handle rejection, not receive a disguised success.',
                                determinism: 'deterministic-structural',
                                confidence: 0.87,
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
exports.SR006FanoutErrorSanitization = SR006FanoutErrorSanitization;
//# sourceMappingURL=SR006-fanout-error-sanitization.js.map