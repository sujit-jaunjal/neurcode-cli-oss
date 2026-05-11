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
exports.SR001SwallowedAsyncRejection = void 0;
const ts = __importStar(require("typescript"));
function containsThrowOrReject(node) {
    if (ts.isThrowStatement(node))
        return true;
    if (ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'reject') {
        return true;
    }
    let found = false;
    ts.forEachChild(node, child => {
        if (!found)
            found = containsThrowOrReject(child);
    });
    return found;
}
function getLineAndCol(sf, pos) {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
}
function getEvidenceLines(sourceText, line, extra = 1) {
    const lines = sourceText.split('\n');
    const start = line - 1;
    const end = Math.min(start + extra, lines.length);
    return lines
        .slice(start, end)
        .map(l => l.slice(0, 120))
        .join('\n');
}
class SR001SwallowedAsyncRejection {
    id = 'SR001';
    name = 'Swallowed async rejection';
    policyRef = 'P005';
    severity = 'BLOCKING';
    languages = ['typescript', 'javascript'];
    description = '.catch() callbacks that do not contain a throw statement or a call to reject() silently absorb errors.';
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
                // Looking for: expr.catch(callback)
                if (ts.isCallExpression(node) &&
                    ts.isPropertyAccessExpression(node.expression) &&
                    node.expression.name.text === 'catch') {
                    const args = node.arguments;
                    if (args.length !== 1) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    const callback = args[0];
                    // Exclude shorthand: .catch(console.error) or .catch(logger.error)
                    if (ts.isPropertyAccessExpression(callback) || ts.isIdentifier(callback)) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    // Must be arrow function or function expression
                    if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    const body = callback.body;
                    // Exclude empty body: .catch(() => {})
                    if (ts.isBlock(body) && body.statements.length === 0) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    // Check if body contains throw or reject
                    if (!containsThrowOrReject(body)) {
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
                            operationalRisk: 'Rejected promises are silently absorbed; errors never surface to callers or monitoring, ' +
                                'leading to invisible failures and stale state in production.',
                            remediation: 'Add `throw err` (or re-wrap: `throw new Error(err.message)`) inside the .catch() body, ' +
                                'or replace with `.catch(err => { logger.error(err); throw err; })`.',
                            determinism: 'deterministic-structural',
                            confidence: 0.92,
                            language: filePath.endsWith('.py') ? 'python' : filePath.match(/\.(js|jsx)$/) ? 'javascript' : 'typescript',
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
exports.SR001SwallowedAsyncRejection = SR001SwallowedAsyncRejection;
//# sourceMappingURL=SR001-swallowed-async-rejection.js.map