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
exports.SR011EventListenerLeak = void 0;
const ts = __importStar(require("typescript"));
function getLineAndCol(sf, pos) {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
}
function getEvidenceLines(sourceText, line, extra = 1) {
    const lines = sourceText.split('\n');
    return lines.slice(line - 1, Math.min(line - 1 + extra, lines.length)).map(l => l.slice(0, 120)).join('\n');
}
/** Walk up AST to find the nearest containing class declaration/expression. */
function getEnclosingClass(node) {
    let current = node.parent;
    while (current) {
        if (ts.isClassDeclaration(current) || ts.isClassExpression(current)) {
            return current;
        }
        current = current.parent;
    }
    return undefined;
}
/** Check if the node is directly inside an arrow function that is NOT a class method. */
function isInsideNonMethodArrowFunction(node) {
    let current = node.parent;
    while (current) {
        if (ts.isArrowFunction(current)) {
            // If the arrow function is a method body, it's OK
            const parent = current.parent;
            if (ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) {
                return false;
            }
            // Arrow function that is NOT a class method
            const enclosingClass = getEnclosingClass(current);
            if (!enclosingClass) {
                return true;
            }
        }
        if (ts.isClassDeclaration(current) || ts.isClassExpression(current)) {
            break;
        }
        current = current.parent;
    }
    return false;
}
/** Extract the event string literal from addEventListener/on call (first arg). */
function extractEventName(args) {
    if (args.length < 2)
        return undefined;
    const firstArg = args[0];
    if (ts.isStringLiteral(firstArg)) {
        return firstArg.text;
    }
    return undefined;
}
/** Check if the third arg is { once: true }. */
function hasOnceOption(args) {
    if (args.length < 3)
        return false;
    const optArg = args[2];
    if (ts.isObjectLiteralExpression(optArg)) {
        for (const prop of optArg.properties) {
            if (ts.isPropertyAssignment(prop) &&
                ts.isIdentifier(prop.name) &&
                prop.name.text === 'once' &&
                prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
                return true;
            }
        }
    }
    return false;
}
/** Collect the text of a class body to search for removal calls. */
function getClassBodyText(classNode) {
    return classNode.members.map(m => m.getText()).join('\n');
}
/** Check if there's a removeEventListener or .off( call in the class body text for the given event. */
function hasRemovalInClass(classNode, eventName) {
    const bodyText = getClassBodyText(classNode);
    const hasRemoveEventListener = bodyText.includes('removeEventListener');
    const hasOff = bodyText.includes('.off(');
    if (!eventName) {
        // Without a known event name, check if any removal exists
        return hasRemoveEventListener || hasOff;
    }
    // Check if the event name is referenced near the removal call
    if (hasRemoveEventListener && bodyText.includes(eventName)) {
        // crude but effective: if both the removal method and the event name appear, accept it
        return true;
    }
    if (hasOff && bodyText.includes(eventName)) {
        return true;
    }
    return false;
}
class SR011EventListenerLeak {
    id = 'SR011';
    name = 'Event listener leak (missing removal)';
    policyRef = 'SR011';
    severity = 'BLOCKING';
    languages = ['typescript', 'javascript'];
    description = 'addEventListener() or .on() calls inside a class with no corresponding removeEventListener()/.off() ' +
        'for the same event — leaked listeners accumulate and prevent GC of the enclosing object.';
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
                if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
                    const methodName = node.expression.name.text;
                    const isAddEventListener = methodName === 'addEventListener';
                    const isOnCall = methodName === 'on';
                    if (isAddEventListener || isOnCall) {
                        // Exclude arrow function bodies that are not class methods
                        if (isInsideNonMethodArrowFunction(node)) {
                            ts.forEachChild(node, visit);
                            return;
                        }
                        // Must be inside a class
                        const enclosingClass = getEnclosingClass(node);
                        if (!enclosingClass) {
                            ts.forEachChild(node, visit);
                            return;
                        }
                        // Exclude { once: true } option
                        if (isAddEventListener && hasOnceOption(node.arguments)) {
                            ts.forEachChild(node, visit);
                            return;
                        }
                        const eventName = extractEventName(node.arguments);
                        // Check if removal exists in the class
                        if (!hasRemovalInClass(enclosingClass, eventName)) {
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
                                operationalRisk: 'Every listener registration without a paired removal leaks memory proportional to ' +
                                    'listener count × retained closure size. Common in WebSocket handlers, Node.js ' +
                                    'EventEmitters, and browser DOM events in long-lived objects.',
                                remediation: 'Store the handler reference and call `emitter.off(event, handler)` in a ' +
                                    'dispose/cleanup method, or use `{ once: true }` for one-shot listeners.',
                                determinism: 'deterministic-structural',
                                confidence: 0.88,
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
exports.SR011EventListenerLeak = SR011EventListenerLeak;
//# sourceMappingURL=SR011-event-listener-leak.js.map