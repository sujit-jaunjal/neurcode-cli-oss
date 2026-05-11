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
exports.SR014MutableClosureAsync = void 0;
const ts = __importStar(require("typescript"));
function getLineAndCol(sf, pos) {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
}
function getEvidenceLines(sourceText, line, extra = 1) {
    const lines = sourceText.split('\n');
    return lines.slice(line - 1, Math.min(line - 1 + extra, lines.length)).map(l => l.slice(0, 120)).join('\n');
}
/** Variable names to exclude (common single-use sequential patterns). */
const EXCLUDED_VAR_NAMES = new Set(['result', 'error', 'err', 'res', 'response']);
/** Async callback parent method names (promise chaining). */
const ASYNC_CALLBACK_METHODS = new Set(['then', 'catch', 'setTimeout', 'setInterval']);
/** Check if a node is an async arrow function or async function expression. */
function isAsyncFunction(node) {
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        return !!(node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword));
    }
    return false;
}
/**
 * Check if a node is a callback passed to .then(), .catch(), setTimeout(), setInterval().
 */
function isAsyncCallbackArg(node) {
    const parent = node.parent;
    if (!ts.isCallExpression(parent))
        return false;
    const callExpr = parent;
    // Is this node one of the arguments?
    if (!callExpr.arguments.includes(node))
        return false;
    const callExprExpr = callExpr.expression;
    if (ts.isPropertyAccessExpression(callExprExpr)) {
        const methodName = callExprExpr.name.text;
        if (ASYNC_CALLBACK_METHODS.has(methodName))
            return true;
    }
    if (ts.isIdentifier(callExprExpr)) {
        if (ASYNC_CALLBACK_METHODS.has(callExprExpr.text))
            return true;
    }
    return false;
}
/**
 * Collect all `let` variable names declared directly in a function body (top-level of the block).
 */
function collectLetDeclarations(block) {
    const letVars = new Map();
    for (const stmt of block.statements) {
        if (ts.isVariableStatement(stmt)) {
            if (stmt.declarationList.flags & ts.NodeFlags.Let) {
                for (const decl of stmt.declarationList.declarations) {
                    if (ts.isIdentifier(decl.name)) {
                        letVars.set(decl.name.text, decl);
                    }
                }
            }
        }
    }
    return letVars;
}
/**
 * Find all assignments (varName = ...) inside an async callback or .then/.catch callback.
 * Returns the set of variable names mutated inside such callbacks.
 */
function findMutationsInAsyncCallbacks(block, letVarNames) {
    const mutations = new Map();
    function visitForMutation(node, insideAsyncCallback) {
        const enterAsync = insideAsyncCallback ||
            ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
                (isAsyncFunction(node) || isAsyncCallbackArg(node)));
        if (insideAsyncCallback &&
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isIdentifier(node.left) &&
            letVarNames.has(node.left.text)) {
            mutations.set(node.left.text, node);
        }
        // Don't descend into nested function bodies that are NOT async callbacks of our outer function
        if (!insideAsyncCallback &&
            (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node))) {
            return;
        }
        ts.forEachChild(node, child => visitForMutation(child, enterAsync));
    }
    ts.forEachChild(block, child => visitForMutation(child, false));
    return mutations;
}
class SR014MutableClosureAsync {
    id = 'SR014';
    name = 'Mutable closure captured in async callback (race condition)';
    policyRef = 'SR014';
    severity = 'ADVISORY';
    languages = ['typescript', 'javascript'];
    description = '`let` variables declared in function scope and mutated inside async callbacks (.then, .catch, ' +
        'setTimeout, setInterval) create race conditions when the outer function is called concurrently.';
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
                // Only look at function bodies (function declarations, expressions, arrow functions, methods)
                const isFuncLike = ts.isFunctionDeclaration(node) ||
                    ts.isFunctionExpression(node) ||
                    ts.isArrowFunction(node) ||
                    ts.isMethodDeclaration(node) ||
                    ts.isConstructorDeclaration(node);
                if (isFuncLike && ts.isFunctionLike(node) && node.body && ts.isBlock(node.body)) {
                    const block = node.body;
                    const letVars = collectLetDeclarations(block);
                    if (letVars.size === 0) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    // Filter out excluded names
                    const candidateNames = new Set();
                    for (const name of letVars.keys()) {
                        if (!EXCLUDED_VAR_NAMES.has(name)) {
                            candidateNames.add(name);
                        }
                    }
                    if (candidateNames.size === 0) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    const mutations = findMutationsInAsyncCallbacks(block, candidateNames);
                    for (const [varName, mutationNode] of mutations) {
                        const decl = letVars.get(varName);
                        const { line, column } = getLineAndCol(sf, mutationNode.getStart(sf));
                        const evidenceLine = getLineAndCol(sf, decl.getStart(sf)).line;
                        const evidence = getEvidenceLines(sourceText, evidenceLine, 1) +
                            '\n' +
                            getEvidenceLines(sourceText, line, 1);
                        violations.push({
                            ruleId: this.id,
                            ruleName: this.name,
                            policyRef: this.policyRef,
                            severity: this.severity,
                            filePath,
                            line,
                            column,
                            evidence: evidence.slice(0, 240),
                            operationalRisk: 'Two concurrent requests share a captured `let` variable; the second request\'s assignment ' +
                                'overwrites the first\'s value before the first async operation completes, producing wrong ' +
                                'data silently.',
                            remediation: 'Move the variable inside the async callback, or use a const defined before the async ' +
                                'boundary, or use a WeakMap keyed by the request context.',
                            determinism: 'heuristic-advisory',
                            confidence: 0.70,
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
exports.SR014MutableClosureAsync = SR014MutableClosureAsync;
//# sourceMappingURL=SR014-mutable-closure-async.js.map