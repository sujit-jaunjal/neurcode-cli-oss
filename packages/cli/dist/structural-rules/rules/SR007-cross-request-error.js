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
exports.SR007CrossRequestError = void 0;
const ts = __importStar(require("typescript"));
function getLineAndCol(sf, pos) {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
}
function getEvidenceLines(sourceText, line) {
    const lines = sourceText.split('\n');
    return (lines[line - 1] || '').slice(0, 120);
}
/** Check if the source text of a function scope contains a map.set( call */
function containsMapSetInScope(text) {
    return /\.\s*set\s*\(/.test(text);
}
/** Detect: throw err / throw error / reject(err) inside a .catch() handler */
function findRawRethrowInCatch(catchCall, sf) {
    const results = [];
    if (catchCall.arguments.length === 0)
        return results;
    const callback = catchCall.arguments[0];
    if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))
        return results;
    const params = callback.parameters;
    const errParamNames = new Set(params
        .map(p => (ts.isIdentifier(p.name) ? p.name.text : ''))
        .filter(n => n.length > 0));
    const body = callback.body;
    const visit = (node) => {
        // throw err / throw error (raw re-throw of the caught variable)
        if (ts.isThrowStatement(node) && node.expression) {
            const expr = node.expression;
            if (ts.isIdentifier(expr) && errParamNames.has(expr.text)) {
                results.push(node);
                return;
            }
        }
        // reject(err) where err is the caught param
        if (ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'reject' &&
            node.arguments.length === 1 &&
            ts.isIdentifier(node.arguments[0]) &&
            errParamNames.has(node.arguments[0].text)) {
            results.push(node);
            return;
        }
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(body, visit);
    return results;
}
class SR007CrossRequestError {
    id = 'SR007';
    name = 'Cross-request raw error propagation';
    policyRef = 'P011';
    severity = 'ADVISORY';
    languages = ['typescript', 'javascript'];
    description = 'Raw error re-thrown from a .catch inside a Map-coalesced promise propagates request-scoped data to unrelated waiters.';
    check(filePath, sourceText) {
        try {
            // Fast check: file must have both .set( and .catch(
            if (!containsMapSetInScope(sourceText))
                return [];
            if (!/.catch\s*\(/.test(sourceText))
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
            // Find function bodies that contain map.set(
            // then find .catch( inside those + raw rethrows
            const checkFunction = (funcNode) => {
                const body = funcNode.body;
                if (!body)
                    return;
                const funcText = body.getText(sf);
                if (!containsMapSetInScope(funcText))
                    return;
                // Find all .catch calls in this function body
                const catchCalls = [];
                const findCatches = (node) => {
                    if (ts.isCallExpression(node) &&
                        ts.isPropertyAccessExpression(node.expression) &&
                        node.expression.name.text === 'catch') {
                        catchCalls.push(node);
                    }
                    ts.forEachChild(node, findCatches);
                };
                ts.forEachChild(body, findCatches);
                for (const catchCall of catchCalls) {
                    const rethrows = findRawRethrowInCatch(catchCall, sf);
                    for (const rethrow of rethrows) {
                        const { line, column } = getLineAndCol(sf, rethrow.getStart(sf));
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
                            operationalRisk: 'The raw error object (potentially containing request-scoped data: auth tokens, user IDs, ' +
                                'PII) is passed to all callers waiting on the same Map entry. One request\'s error ' +
                                'becomes another request\'s rejection reason, leaking data across request boundaries.',
                            remediation: 'Wrap the error before re-throwing: `throw new Error(err.message)` or ' +
                                '`throw new SanitizedError(err)`. Strip request-scoped properties before the throw ' +
                                'propagates to other waiters.',
                            determinism: 'heuristic-advisory',
                            confidence: 0.70,
                            language: filePath.match(/\.(js|jsx)$/) ? 'javascript' : 'typescript',
                        });
                    }
                }
            };
            const visit = (node) => {
                if (ts.isFunctionDeclaration(node) ||
                    ts.isFunctionExpression(node) ||
                    ts.isArrowFunction(node) ||
                    ts.isMethodDeclaration(node)) {
                    checkFunction(node);
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
exports.SR007CrossRequestError = SR007CrossRequestError;
//# sourceMappingURL=SR007-cross-request-error.js.map