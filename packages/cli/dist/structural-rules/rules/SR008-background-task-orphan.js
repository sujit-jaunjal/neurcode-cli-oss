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
exports.SR008BackgroundTaskOrphan = void 0;
const ts = __importStar(require("typescript"));
function getLineAndCol(sf, pos) {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
}
function getEvidenceLines(sourceText, line) {
    const lines = sourceText.split('\n');
    return (lines[line - 1] || '').slice(0, 120);
}
const ASYNC_PREFIXES = [
    'fetch',
    'send',
    'process',
    'handle',
    'dispatch',
    'emit',
    'publish',
    'save',
    'write',
    'update',
    'delete',
    'remove',
    'create',
    'insert',
    'upload',
    'download',
    'notify',
    'broadcast',
    'flush',
    'sync',
];
function looksAsync(callExpr) {
    const expr = callExpr.expression;
    let calleeName = '';
    if (ts.isIdentifier(expr)) {
        calleeName = expr.text;
    }
    else if (ts.isPropertyAccessExpression(expr)) {
        calleeName = expr.name.text;
    }
    if (!calleeName)
        return false;
    const lower = calleeName.toLowerCase();
    return ASYNC_PREFIXES.some(prefix => lower.startsWith(prefix));
}
/** Check if a call expression has a .catch() chained on it (as parent call chain) */
function hasCatchChained(node) {
    let current = node;
    // Walk up the parent chain to see if this call is followed by .catch(
    while (current.parent) {
        const p = current.parent;
        // If parent is a property access for .catch
        if (ts.isPropertyAccessExpression(p) &&
            p.name.text === 'catch' &&
            p.expression === current) {
            return true;
        }
        // If parent is a property access for something else, keep walking
        if (ts.isPropertyAccessExpression(p) && p.expression === current) {
            current = p;
            continue;
        }
        break;
    }
    return false;
}
/** Check if the call is wrapped in `void ` */
function isVoidWrapped(node) {
    const parent = node.parent;
    return (ts.isVoidExpression(parent) ||
        // Also check: void somePromise
        (ts.isExpressionStatement(parent) &&
            ts.isVoidExpression(parent.expression)));
}
class SR008BackgroundTaskOrphan {
    id = 'SR008';
    name = 'Background task orphan (unhandled floating promise)';
    policyRef = 'P012';
    severity = 'ADVISORY';
    languages = ['typescript', 'javascript'];
    description = 'Async function calls whose result is not awaited, stored, or catch-handled create unhandled promise rejections.';
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
                // Must be an ExpressionStatement (bare call, result unused)
                if (ts.isExpressionStatement(node)) {
                    const expr = node.expression;
                    // Skip: void someCall()
                    if (ts.isVoidExpression(expr)) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    // Direct call: someAsync()
                    if (ts.isCallExpression(expr)) {
                        if (looksAsync(expr) && !hasCatchChained(expr)) {
                            const { line, column } = getLineAndCol(sf, expr.getStart(sf));
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
                                operationalRisk: 'Unhandled promise rejection crashes the Node.js process in Node 15+ ' +
                                    'or causes silent failure in older versions. Background task errors go unmonitored.',
                                remediation: 'Either await the call (inside an async function), attach `.catch(err => logger.error(err))`, ' +
                                    'or use `void someAsync()` if the orphan is intentional and errors are handled inside the function.',
                                determinism: 'heuristic-advisory',
                                confidence: 0.65,
                                language: filePath.match(/\.(js|jsx)$/) ? 'javascript' : 'typescript',
                            });
                        }
                    }
                    // Method call chain ending in no .catch: obj.someAsync()
                    // (already handled by looksAsync checking the method name)
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
exports.SR008BackgroundTaskOrphan = SR008BackgroundTaskOrphan;
//# sourceMappingURL=SR008-background-task-orphan.js.map