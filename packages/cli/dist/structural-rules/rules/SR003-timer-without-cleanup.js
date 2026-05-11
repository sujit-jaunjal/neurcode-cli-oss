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
exports.SR003TimerWithoutCleanup = void 0;
const ts = __importStar(require("typescript"));
function getLineAndCol(sf, pos) {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
}
function getEvidenceLines(sourceText, line) {
    const lines = sourceText.split('\n');
    return (lines[line - 1] || '').slice(0, 120);
}
function isInsideClassDeclaration(node) {
    let current = node.parent;
    while (current) {
        if (ts.isClassDeclaration(current) || ts.isClassExpression(current))
            return true;
        current = current.parent;
    }
    return false;
}
/** Returns true if the call expression is the RHS of a `this.xxx = ...` assignment. */
function isAssignedToThisProperty(callNode) {
    const parent = callNode.parent;
    // Direct: this.x = setInterval(...)
    if (ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        parent.right === callNode &&
        ts.isPropertyAccessExpression(parent.left) &&
        parent.left.expression.kind === ts.SyntaxKind.ThisKeyword) {
        return true;
    }
    // Variable declaration: const timer = setInterval(...), then check if timer is assigned to this.x
    // We accept the simpler form: if stored in any local variable inside the same function body
    // — we only require that it's NOT a bare ExpressionStatement
    if (ts.isVariableDeclaration(parent)) {
        // It's stored in a local variable. We accept this as "handled" to reduce false positives.
        return true;
    }
    // Initializer of a property declaration: this.x = setInterval handled above;
    // also handle PropertyDeclaration initializer
    if (ts.isPropertyDeclaration(parent)) {
        return true;
    }
    return false;
}
class SR003TimerWithoutCleanup {
    id = 'SR003';
    name = 'Timer without cleanup';
    policyRef = 'P007';
    severity = 'BLOCKING';
    languages = ['typescript', 'javascript'];
    description = 'setInterval/setTimeout inside a class method whose return value is not stored prevents cleanup, causing timer leaks.';
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
                if (ts.isCallExpression(node) &&
                    ts.isIdentifier(node.expression) &&
                    (node.expression.text === 'setInterval' || node.expression.text === 'setTimeout')) {
                    // Must be inside a class
                    if (!isInsideClassDeclaration(node)) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    // If the call result is stored or assigned, it's fine
                    if (isAssignedToThisProperty(node)) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    // The parent must be an ExpressionStatement (bare call — result discarded)
                    if (!ts.isExpressionStatement(node.parent)) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    const { line, column } = getLineAndCol(sf, node.getStart(sf));
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
                        operationalRisk: 'Timer handle is not stored, so it cannot be cleared in a destroy/stop method. ' +
                            'Each instance or re-initialization leaks a timer, causing memory leaks and runaway callbacks.',
                        remediation: 'Store the return value: `this.timer = setInterval(...)` and call `clearInterval(this.timer)` ' +
                            'in the class destructor / stop() / dispose() method.',
                        determinism: 'deterministic-structural',
                        confidence: 0.91,
                        language: filePath.match(/\.(js|jsx)$/) ? 'javascript' : 'typescript',
                    });
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
exports.SR003TimerWithoutCleanup = SR003TimerWithoutCleanup;
//# sourceMappingURL=SR003-timer-without-cleanup.js.map