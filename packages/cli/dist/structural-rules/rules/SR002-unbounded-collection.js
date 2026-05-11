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
exports.SR002UnboundedCollection = void 0;
const ts = __importStar(require("typescript"));
function getLineAndCol(sf, pos) {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
}
function getEvidenceLines(sourceText, line) {
    const lines = sourceText.split('\n');
    return (lines[line - 1] || '').slice(0, 120);
}
function typeTextIncludesMapOrSet(typeNode) {
    const text = typeNode.getText();
    return /\b(Map|Set)</.test(text);
}
function initializerIsMapOrSet(init) {
    if (ts.isNewExpression(init) &&
        ts.isIdentifier(init.expression)) {
        const name = init.expression.text;
        return name === 'Map' || name === 'Set';
    }
    return false;
}
function hasDeleteCallOnField(classNode, fieldName) {
    let found = false;
    const visitDelete = (node) => {
        if (found)
            return;
        // Look for: this.fieldName.delete( or fieldName.delete(
        if (ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === 'delete') {
            const obj = node.expression.expression;
            // this.fieldName.delete(
            if (ts.isPropertyAccessExpression(obj) &&
                obj.expression.kind === ts.SyntaxKind.ThisKeyword &&
                obj.name.text === fieldName) {
                found = true;
                return;
            }
            // fieldName.delete( (direct reference)
            if (ts.isIdentifier(obj) && obj.text === fieldName) {
                found = true;
                return;
            }
        }
        ts.forEachChild(node, visitDelete);
    };
    ts.forEachChild(classNode, visitDelete);
    return found;
}
function hasLruOrBoundComment(node, sf) {
    const fullText = sf.getFullText();
    const start = node.getFullStart();
    const leadingTrivia = fullText.slice(start, node.getStart(sf));
    const lruPattern = /lru|maxsize|max_size|capacity|bounded|evict|ttl/i;
    return lruPattern.test(leadingTrivia);
}
function keyTypeIncludesString(typeText) {
    // Map<K, V> — check if K contains 'string'
    const inner = typeText.match(/(?:Map|Set)<([^,>]+)/);
    if (!inner)
        return false;
    return /string/i.test(inner[1]);
}
class SR002UnboundedCollection {
    id = 'SR002';
    name = 'Unbounded collection';
    policyRef = 'P006';
    severity = 'BLOCKING';
    languages = ['typescript', 'javascript'];
    description = 'Class-level Map or Set fields with no size bound grow without limit, causing unbounded memory growth.';
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
            const visitClass = (classNode) => {
                for (const member of classNode.members) {
                    if (!ts.isPropertyDeclaration(member))
                        continue;
                    // Skip readonly
                    if (member.modifiers?.some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword)) {
                        continue;
                    }
                    const typeNode = member.type;
                    const initializer = member.initializer;
                    let isMapOrSet = false;
                    let typeText = '';
                    if (typeNode) {
                        typeText = typeNode.getText(sf);
                        // Skip ReadonlyMap/ReadonlySet
                        if (/Readonly(Map|Set)/.test(typeText))
                            continue;
                        if (typeTextIncludesMapOrSet(typeNode))
                            isMapOrSet = true;
                    }
                    if (!isMapOrSet && initializer) {
                        if (initializerIsMapOrSet(initializer)) {
                            isMapOrSet = true;
                            if (ts.isNewExpression(initializer) && ts.isIdentifier(initializer.expression)) {
                                typeText = initializer.expression.text + '<string, unknown>';
                            }
                        }
                    }
                    if (!isMapOrSet)
                        continue;
                    // Only flag when key type contains 'string' (dynamic keys)
                    if (!keyTypeIncludesString(typeText))
                        continue;
                    // Skip if there's a .delete( call on this field anywhere in the class
                    const fieldName = ts.isIdentifier(member.name) ? member.name.text : '';
                    if (!fieldName)
                        continue;
                    if (hasDeleteCallOnField(classNode, fieldName))
                        continue;
                    // Skip if LRU/capacity comment nearby
                    if (hasLruOrBoundComment(member, sf))
                        continue;
                    const { line, column } = getLineAndCol(sf, member.getStart(sf));
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
                        operationalRisk: 'Class-level Map/Set keyed by dynamic strings grows without bound under sustained load, ' +
                            'leading to OOM crashes or gradual memory exhaustion in long-running services.',
                        remediation: 'Replace with an LRU cache (e.g. `lru-cache`), add explicit eviction via `.delete()` calls, ' +
                            'or cap size before each `.set()`. Document the bound with a comment.',
                        determinism: 'deterministic-structural',
                        confidence: 0.88,
                        language: filePath.match(/\.(js|jsx)$/) ? 'javascript' : 'typescript',
                    });
                }
            };
            const visitNode = (node) => {
                if (ts.isClassDeclaration(node)) {
                    visitClass(node);
                }
                ts.forEachChild(node, visitNode);
            };
            ts.forEachChild(sf, visitNode);
            return violations;
        }
        catch {
            return [];
        }
    }
}
exports.SR002UnboundedCollection = SR002UnboundedCollection;
//# sourceMappingURL=SR002-unbounded-collection.js.map