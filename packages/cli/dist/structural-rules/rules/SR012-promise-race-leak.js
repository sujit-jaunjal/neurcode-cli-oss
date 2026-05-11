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
exports.SR012PromiseRaceLeak = void 0;
const ts = __importStar(require("typescript"));
function getLineAndCol(sf, pos) {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
}
function getEvidenceLines(sourceText, line, extra = 1) {
    const lines = sourceText.split('\n');
    return lines.slice(line - 1, Math.min(line - 1 + extra, lines.length)).map(l => l.slice(0, 120)).join('\n');
}
/**
 * Check if an expression looks like a timeout promise:
 * - `new Promise(resolve => setTimeout(...))`
 * - an identifier whose name contains 'timeout' or 'Timeout'
 */
function looksLikeTimeout(node) {
    // new Promise(resolve => setTimeout(...))
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Promise') {
        const args = node.arguments;
        if (args && args.length > 0) {
            const executor = args[0];
            if (ts.isArrowFunction(executor) || ts.isFunctionExpression(executor)) {
                let hasSetTimeout = false;
                const scanForSetTimeout = (n) => {
                    if (ts.isCallExpression(n) &&
                        ts.isIdentifier(n.expression) &&
                        n.expression.text === 'setTimeout') {
                        hasSetTimeout = true;
                    }
                    if (!hasSetTimeout)
                        ts.forEachChild(n, scanForSetTimeout);
                };
                scanForSetTimeout(executor);
                if (hasSetTimeout)
                    return true;
            }
        }
    }
    // identifier or property access with 'timeout' or 'Timeout' in the name
    if (ts.isIdentifier(node)) {
        const lower = node.text.toLowerCase();
        if (lower.includes('timeout'))
            return true;
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
        const lower = node.name.text.toLowerCase();
        if (lower.includes('timeout'))
            return true;
    }
    return false;
}
/** Check if text of a node or its subtree contains AbortController / .abort() / cleanup references. */
function containsAbortOrCleanup(node, sf) {
    const text = node.getText(sf);
    return (text.includes('AbortController') ||
        text.includes('.abort()') ||
        text.includes('.abort(') ||
        text.includes('cleanup') ||
        text.includes('cancel'));
}
class SR012PromiseRaceLeak {
    id = 'SR012';
    name = 'Promise.race timeout leak (no abort/cleanup)';
    policyRef = 'SR012';
    severity = 'ADVISORY';
    languages = ['typescript', 'javascript'];
    description = 'Promise.race() with a timeout branch but no AbortController/.abort()/cleanup — ' +
        'when the timeout wins, the losing promise(s) continue running, leaking connections and CPU.';
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
                // Looking for: Promise.race([...])
                if (ts.isCallExpression(node) &&
                    ts.isPropertyAccessExpression(node.expression) &&
                    ts.isIdentifier(node.expression.expression) &&
                    node.expression.expression.text === 'Promise' &&
                    node.expression.name.text === 'race') {
                    const args = node.arguments;
                    if (args.length !== 1) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    const arrayArg = args[0];
                    if (!ts.isArrayLiteralExpression(arrayArg)) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    // Check if one element is clearly a timeout
                    const hasTimeout = arrayArg.elements.some(el => looksLikeTimeout(el));
                    if (!hasTimeout) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    // Check if any array element references AbortController or cleanup
                    const hasCleanup = arrayArg.elements.some(el => containsAbortOrCleanup(el, sf));
                    // Also check a .finally() chained on the race call
                    let hasFinallyAbort = false;
                    const parent = node.parent;
                    if (ts.isPropertyAccessExpression(parent) && parent.name.text === 'finally') {
                        const grandParent = parent.parent;
                        if (ts.isCallExpression(grandParent)) {
                            hasFinallyAbort = containsAbortOrCleanup(grandParent, sf);
                        }
                    }
                    // Also look in the enclosing statement for abort references
                    let enclosingStatement = node;
                    while (enclosingStatement.parent && !ts.isBlock(enclosingStatement.parent)) {
                        enclosingStatement = enclosingStatement.parent;
                    }
                    const statementText = enclosingStatement.getText(sf);
                    const nearbyHasAbort = statementText.includes('.abort(') ||
                        statementText.includes('AbortController');
                    if (!hasCleanup && !hasFinallyAbort && !nearbyHasAbort) {
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
                            operationalRisk: 'When the timeout wins the race, the original operations continue running in the background, ' +
                                'consuming connections, CPU, and memory. In high-traffic systems this creates phantom load ' +
                                'that grows until process restart.',
                            remediation: 'Use AbortController: `const ac = new AbortController(); ' +
                                'Promise.race([fetchWithSignal(ac.signal), timeout]).finally(() => ac.abort())`.',
                            determinism: 'heuristic-advisory',
                            confidence: 0.80,
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
exports.SR012PromiseRaceLeak = SR012PromiseRaceLeak;
//# sourceMappingURL=SR012-promise-race-leak.js.map