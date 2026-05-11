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
exports.DS001SagaRollbackAbsence = void 0;
const ts = __importStar(require("typescript"));
function getLineAndCol(sf, pos) {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
}
function getEvidenceLines(sourceText, line, extra = 1) {
    const lines = sourceText.split('\n');
    return lines.slice(line - 1, Math.min(line - 1 + extra, lines.length)).map(l => l.slice(0, 120)).join('\n');
}
/** Read-only function name prefixes — excluded from this rule. */
const READ_ONLY_PREFIXES = ['get', 'fetch', 'load', 'read', 'query', 'find', 'list', 'search', 'check', 'count'];
function isReadOnlyFunctionName(name) {
    const lower = name.toLowerCase();
    return READ_ONLY_PREFIXES.some(prefix => lower.startsWith(prefix));
}
/** Keywords indicating compensation/rollback logic in the catch/finally block. */
const COMPENSATION_KEYWORDS = [
    'rollback',
    'revert',
    'compensate',
    'undo',
    'cancel',
    'delete',
    'remove',
    'cleanup',
    'clean_up',
];
/** Count direct `await` expressions in a block (non-recursive into nested functions). */
function countTopLevelAwaits(block) {
    let count = 0;
    function visit(node) {
        if (ts.isAwaitExpression(node)) {
            count++;
        }
        // Don't recurse into nested function bodies
        if (ts.isFunctionDeclaration(node) ||
            ts.isFunctionExpression(node) ||
            ts.isArrowFunction(node) ||
            ts.isMethodDeclaration(node)) {
            return;
        }
        ts.forEachChild(node, visit);
    }
    ts.forEachChild(block, visit);
    return count;
}
/** Check if a block has a try/catch with meaningful compensation logic, or a finally block. */
function hasRollbackOrFinally(block, sf) {
    let found = false;
    function visit(node) {
        if (found)
            return;
        if (ts.isTryStatement(node)) {
            // Check for finally block
            if (node.finallyBlock && node.finallyBlock.statements.length > 0) {
                found = true;
                return;
            }
            // Check catch clause for compensation keywords
            if (node.catchClause) {
                const catchText = node.catchClause.getText(sf).toLowerCase();
                if (COMPENSATION_KEYWORDS.some(kw => catchText.includes(kw))) {
                    found = true;
                    return;
                }
            }
        }
        // Don't recurse into nested function bodies
        if (ts.isFunctionDeclaration(node) ||
            ts.isFunctionExpression(node) ||
            ts.isArrowFunction(node) ||
            ts.isMethodDeclaration(node)) {
            return;
        }
        ts.forEachChild(node, visit);
    }
    ts.forEachChild(block, visit);
    return found;
}
/** Get function name from a function-like node. */
function getFunctionName(node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
        return node.name.text;
    }
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
        return node.name.text;
    }
    if (ts.isFunctionExpression(node) && node.name) {
        return node.name.text;
    }
    // Variable assignment: const foo = async function/arrow
    if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
        node.parent &&
        ts.isVariableDeclaration(node.parent) &&
        ts.isIdentifier(node.parent.name)) {
        return node.parent.name.text;
    }
    return undefined;
}
function isAsyncFunction(node) {
    return !!(node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword));
}
class DS001SagaRollbackAbsence {
    id = 'DS001';
    name = 'Saga rollback absence (multi-step async without compensation)';
    policyRef = 'DS001';
    severity = 'ADVISORY';
    languages = ['typescript', 'javascript'];
    description = 'Async functions with 3+ sequential await statements that modify state but have no ' +
        'rollback, compensation, or finally cleanup — partial execution leaves the system inconsistent.';
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
                    if (!isAsyncFunction(node)) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    const funcName = getFunctionName(node);
                    if (funcName && isReadOnlyFunctionName(funcName)) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    const block = node.body;
                    const awaitCount = countTopLevelAwaits(block);
                    if (awaitCount >= 3) {
                        if (!hasRollbackOrFinally(block, sf)) {
                            const { line, column } = getLineAndCol(sf, node.getStart(sf));
                            const evidence = getEvidenceLines(sourceText, line, 3);
                            violations.push({
                                ruleId: this.id,
                                ruleName: this.name,
                                policyRef: this.policyRef,
                                severity: this.severity,
                                filePath,
                                line,
                                column,
                                evidence,
                                operationalRisk: 'Partial execution in a multi-step operation leaves the system in an inconsistent state. ' +
                                    'Step 1 charges the card; step 2 creates the order; step 2 fails. Without rollback, ' +
                                    'the customer is charged but has no order.',
                                remediation: 'Wrap the sequential operations in a try/catch with explicit compensation calls ' +
                                    '(rollback(), revert(), cancel()) or use a finally block to clean up. ' +
                                    'Consider implementing the Saga pattern with a dedicated compensation registry.',
                                determinism: 'heuristic-advisory',
                                confidence: 0.68,
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
exports.DS001SagaRollbackAbsence = DS001SagaRollbackAbsence;
//# sourceMappingURL=DS001-saga-rollback-absence.js.map