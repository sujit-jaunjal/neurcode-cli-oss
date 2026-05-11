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
exports.SR004RequestBoundaryNoValidation = void 0;
const ts = __importStar(require("typescript"));
function getLineAndCol(sf, pos) {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
}
function getEvidenceLines(sourceText, line) {
    const lines = sourceText.split('\n');
    return (lines[line - 1] || '').slice(0, 120);
}
function isTestFile(filePath) {
    return /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(filePath);
}
/** Collect all text in a node (recursive) */
function collectNodeText(node, sf) {
    return node.getText(sf);
}
/** Check if function body text contains validation indicators */
function hasValidation(bodyText) {
    return (/\.parse\s*\(/.test(bodyText) ||
        /\.safeParse\s*\(/.test(bodyText) ||
        /\bz\s*\./.test(bodyText) ||
        /\bschema\s*\./.test(bodyText) ||
        /\bvalidate\s*\(/.test(bodyText) ||
        /\bjoi\b/.test(bodyText) ||
        /\byup\b/.test(bodyText));
}
/** Collect req.body / request.body access nodes inside a function body */
function findReqBodyAccess(node, sf) {
    const results = [];
    const visit = (n) => {
        // req.body / request.body
        if (ts.isPropertyAccessExpression(n) &&
            n.name.text === 'body' &&
            ts.isIdentifier(n.expression) &&
            (n.expression.text === 'req' || n.expression.text === 'request')) {
            results.push(n);
        }
        // ctx.input (tRPC)
        if (ts.isPropertyAccessExpression(n) &&
            n.name.text === 'input' &&
            ts.isIdentifier(n.expression) &&
            n.expression.text === 'ctx') {
            results.push(n);
        }
        ts.forEachChild(n, visit);
    };
    ts.forEachChild(node, visit);
    return results;
}
function getFunctionBodyNode(node) {
    return node.body;
}
class SR004RequestBoundaryNoValidation {
    id = 'SR004';
    name = 'Request boundary without input validation';
    policyRef = 'P008';
    severity = 'BLOCKING';
    languages = ['typescript', 'javascript'];
    description = 'Route handlers accessing req.body or ctx.input without schema validation allow malformed input to reach business logic.';
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
            const checkFunctionBody = (funcNode) => {
                const body = getFunctionBodyNode(funcNode);
                if (!body)
                    return;
                const bodyText = collectNodeText(body, sf);
                // Only flag if body accesses req.body / request.body / ctx.input
                const accesses = findReqBodyAccess(body, sf);
                if (accesses.length === 0)
                    return;
                // If there's validation, skip
                if (hasValidation(bodyText))
                    return;
                // Report on first access
                const firstAccess = accesses[0];
                const { line, column } = getLineAndCol(sf, firstAccess.getStart(sf));
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
                    operationalRisk: 'Unvalidated request input reaches business logic. Attackers can inject unexpected types, ' +
                        'missing fields, or oversized payloads that cause runtime crashes or data corruption.',
                    remediation: 'Parse input with a schema before use: `const data = MySchema.parse(req.body)` ' +
                        '(Zod) or `const { error, value } = schema.validate(req.body)` (Joi). ' +
                        'Use the parsed/validated value, not req.body directly.',
                    determinism: 'deterministic-structural',
                    confidence: 0.85,
                    language: filePath.match(/\.(js|jsx)$/) ? 'javascript' : 'typescript',
                });
            };
            const visit = (node) => {
                if (ts.isFunctionDeclaration(node) ||
                    ts.isFunctionExpression(node) ||
                    ts.isArrowFunction(node) ||
                    ts.isMethodDeclaration(node)) {
                    checkFunctionBody(node);
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
exports.SR004RequestBoundaryNoValidation = SR004RequestBoundaryNoValidation;
//# sourceMappingURL=SR004-request-boundary-no-validation.js.map