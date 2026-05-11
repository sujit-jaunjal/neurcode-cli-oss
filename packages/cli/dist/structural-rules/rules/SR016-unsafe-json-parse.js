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
exports.SR016UnsafeJSONParse = void 0;
const ts = __importStar(require("typescript"));
function getLineAndCol(sf, pos) {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
}
function getEvidenceLines(sourceText, line, extra = 1) {
    const lines = sourceText.split('\n');
    return lines.slice(line - 1, Math.min(line - 1 + extra, lines.length)).map(l => l.slice(0, 120)).join('\n');
}
function isTestFile(filePath) {
    return filePath.includes('.test.') || filePath.includes('.spec.');
}
/**
 * Walk up the AST from a node to find the nearest try/catch statement.
 * Returns true if a try block is found before reaching the function boundary.
 */
function isWrappedInTryCatch(node) {
    let current = node.parent;
    while (current) {
        // Stop at function boundaries — the try/catch must be within the same function
        if (ts.isFunctionDeclaration(current) ||
            ts.isFunctionExpression(current) ||
            ts.isArrowFunction(current) ||
            ts.isMethodDeclaration(current) ||
            ts.isConstructorDeclaration(current) ||
            ts.isGetAccessorDeclaration(current) ||
            ts.isSetAccessorDeclaration(current)) {
            return false;
        }
        if (ts.isTryStatement(current)) {
            // The node must be inside the try block (not the catch/finally)
            if (isDescendantOf(node, current.tryBlock)) {
                return true;
            }
        }
        current = current.parent;
    }
    return false;
}
/** Returns true if `node` is a descendant of `ancestor`. */
function isDescendantOf(node, ancestor) {
    let current = node.parent;
    while (current) {
        if (current === ancestor)
            return true;
        current = current.parent;
    }
    return false;
}
/**
 * Check if the JSON.parse call is inside a catch block.
 * Error-handling context — acceptable to not double-wrap.
 */
function isInsideCatchClause(node) {
    let current = node.parent;
    while (current) {
        if (ts.isCatchClause(current))
            return true;
        // Stop at function boundaries
        if (ts.isFunctionDeclaration(current) ||
            ts.isFunctionExpression(current) ||
            ts.isArrowFunction(current) ||
            ts.isMethodDeclaration(current)) {
            return false;
        }
        current = current.parent;
    }
    return false;
}
/**
 * Check if the argument to JSON.parse is a string literal (compile-time safe).
 */
function isStringLiteralArg(callNode) {
    if (callNode.arguments.length === 0)
        return false;
    const firstArg = callNode.arguments[0];
    return ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg);
}
class SR016UnsafeJSONParse {
    id = 'SR016';
    name = 'Unsafe JSON.parse (no try/catch)';
    policyRef = 'SR016';
    severity = 'BLOCKING';
    languages = ['typescript', 'javascript'];
    description = 'JSON.parse() calls not wrapped in a try/catch — SyntaxError on malformed input crashes the ' +
        'handler and, in Node.js, kills all in-flight requests sharing the event loop.';
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
                // Looking for: JSON.parse(...)
                if (ts.isCallExpression(node) &&
                    ts.isPropertyAccessExpression(node.expression) &&
                    ts.isIdentifier(node.expression.expression) &&
                    node.expression.expression.text === 'JSON' &&
                    node.expression.name.text === 'parse') {
                    // Exclude: argument is a string literal (compile-time safe)
                    if (isStringLiteralArg(node)) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    // Exclude: inside a catch clause (already error-handling context)
                    if (isInsideCatchClause(node)) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    // Flag if not wrapped in try/catch
                    if (!isWrappedInTryCatch(node)) {
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
                            operationalRisk: 'A single malformed JSON payload in a webhook, event stream, or IPC message crashes the ' +
                                'handler. In a shared event loop (Node.js), this kills all in-flight requests.',
                            remediation: 'Wrap in try/catch: `try { const data = JSON.parse(raw); } catch (e) { ' +
                                "throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid JSON payload' }); }`",
                            determinism: 'deterministic-structural',
                            confidence: 0.90,
                            language: filePath.match(/\.(js|jsx)$/) ? 'javascript' : 'typescript',
                        });
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
exports.SR016UnsafeJSONParse = SR016UnsafeJSONParse;
//# sourceMappingURL=SR016-unsafe-json-parse.js.map