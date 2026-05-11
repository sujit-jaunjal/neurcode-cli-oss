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
exports.SR015DanglingAbortController = void 0;
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
 * Collect `new AbortController()` variable names in a function body block,
 * returning a map from variable name -> VariableDeclaration node.
 */
function collectAbortControllerVars(block) {
    const controllers = new Map();
    function visit(node) {
        if (ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            node.initializer &&
            ts.isNewExpression(node.initializer) &&
            ts.isIdentifier(node.initializer.expression) &&
            node.initializer.expression.text === 'AbortController') {
            controllers.set(node.name.text, node);
        }
        ts.forEachChild(node, visit);
    }
    ts.forEachChild(block, visit);
    return controllers;
}
/**
 * Check if varName.abort() is called anywhere within the given node subtree.
 */
function hasAbortCall(node, varName) {
    let found = false;
    function visit(n) {
        if (found)
            return;
        if (ts.isCallExpression(n) &&
            ts.isPropertyAccessExpression(n.expression) &&
            ts.isIdentifier(n.expression.expression) &&
            n.expression.expression.text === varName &&
            n.expression.name.text === 'abort') {
            found = true;
            return;
        }
        ts.forEachChild(n, visit);
    }
    visit(node);
    return found;
}
/**
 * Check if the controller variable is passed to another function as an argument
 * (meaning the caller manages lifecycle).
 */
function isPassedAsArgument(block, varName) {
    let passed = false;
    function visit(node) {
        if (passed)
            return;
        if (ts.isCallExpression(node)) {
            for (const arg of node.arguments) {
                if (ts.isIdentifier(arg) && arg.text === varName) {
                    passed = true;
                    return;
                }
                // Also covers spread: func(...args) — skip for simplicity
            }
        }
        ts.forEachChild(node, visit);
    }
    ts.forEachChild(block, visit);
    return passed;
}
class SR015DanglingAbortController {
    id = 'SR015';
    name = 'Dangling AbortController (abort() never called)';
    policyRef = 'SR015';
    severity = 'ADVISORY';
    languages = ['typescript', 'javascript'];
    description = '`new AbortController()` created in a function but `.abort()` never called — ' +
        'signal listeners are never released, preventing GC of the associated closure.';
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
                    ts.isMethodDeclaration(node) ||
                    ts.isConstructorDeclaration(node);
                if (isFuncLike && ts.isFunctionLike(node) && node.body && ts.isBlock(node.body)) {
                    const block = node.body;
                    const controllers = collectAbortControllerVars(block);
                    for (const [varName, decl] of controllers) {
                        // Exclude: controller passed as argument to another function (caller manages lifecycle)
                        if (isPassedAsArgument(block, varName)) {
                            continue;
                        }
                        // Check: is .abort() called anywhere in this function body?
                        if (!hasAbortCall(block, varName)) {
                            // Also check the enclosing class for abort calls (dispose/cleanup methods)
                            let foundInClass = false;
                            let classNode = node.parent;
                            while (classNode) {
                                if (ts.isClassDeclaration(classNode) || ts.isClassExpression(classNode)) {
                                    foundInClass = hasAbortCall(classNode, varName);
                                    break;
                                }
                                classNode = classNode.parent;
                            }
                            if (!foundInClass) {
                                const { line, column } = getLineAndCol(sf, decl.getStart(sf));
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
                                    operationalRisk: 'AbortController instances that are never aborted do not release the associated signal ' +
                                        'listeners, which hold references to the operation and its closure — preventing GC.',
                                    remediation: 'Ensure every AbortController has a corresponding `.abort()` call in finally blocks, ' +
                                        'dispose methods, or signal listeners.',
                                    determinism: 'heuristic-advisory',
                                    confidence: 0.75,
                                    language: filePath.match(/\.(js|jsx)$/) ? 'javascript' : 'typescript',
                                });
                            }
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
exports.SR015DanglingAbortController = SR015DanglingAbortController;
//# sourceMappingURL=SR015-dangling-abort-controller.js.map