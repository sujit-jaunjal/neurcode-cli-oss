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
exports.SR009MissingRetryBackoff = void 0;
const ts = __importStar(require("typescript"));
function getLineAndCol(sf, pos) {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
}
function getEvidenceLines(sourceText, line) {
    const lines = sourceText.split('\n');
    return (lines[line - 1] || '').slice(0, 120);
}
function bodyTextOf(node, sf) {
    return node.getText(sf);
}
function hasBackoffIndicator(text) {
    return (/Math\s*\.\s*pow\s*\(/.test(text) ||
        /Math\s*\.\s*min\s*\(/.test(text) ||
        /\bbackoff\b/i.test(text) ||
        /\bdelay\b/i.test(text) ||
        /\bsleep\b/i.test(text) ||
        /\bjitter\b/i.test(text) ||
        /exponential/i.test(text) ||
        /2\s*\*\*\s*\w+/.test(text) // 2 ** retries pattern
    );
}
function hasAwaitInBody(node) {
    let found = false;
    const visit = (n) => {
        if (found)
            return;
        if (ts.isAwaitExpression(n)) {
            found = true;
            return;
        }
        ts.forEachChild(n, visit);
    };
    ts.forEachChild(node, visit);
    return found;
}
function hasRetryIndicator(text) {
    return (/\bretry\b/i.test(text) ||
        /\battempt\b/i.test(text) ||
        /\bretries\b/i.test(text) ||
        /\bmaxRetry/i.test(text) ||
        /\bMAX_RETRY/i.test(text) ||
        /i\s*<\s*\w*[Rr]etry/.test(text) ||
        /i\s*<\s*\w*[Aa]ttempt/.test(text));
}
function hasRethrowOrContinue(node, sf) {
    const text = bodyTextOf(node, sf);
    return /\bthrow\b/.test(text) || /\bcontinue\b/.test(text) || /i\+\+/.test(text) || /i\s*-=\s*1/.test(text);
}
class SR009MissingRetryBackoff {
    id = 'SR009';
    name = 'Retry loop without exponential backoff';
    policyRef = 'P013';
    severity = 'ADVISORY';
    languages = ['typescript', 'javascript'];
    description = 'Retry loops with await but no backoff calculation hammer downstream services with linear or zero delay.';
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
                const isWhileOrFor = ts.isWhileStatement(node) ||
                    ts.isForStatement(node) ||
                    ts.isDoStatement(node);
                if (isWhileOrFor) {
                    const body = ts.isWhileStatement(node)
                        ? node.statement
                        : ts.isDoStatement(node)
                            ? node.statement
                            : node.statement;
                    const bodyText = bodyTextOf(body, sf);
                    // Must have an await in the loop body
                    if (!hasAwaitInBody(body)) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    // Must look like a retry loop
                    if (!hasRetryIndicator(bodyText) && !hasRetryIndicator(node.getText(sf))) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    // If there's backoff, no violation
                    if (hasBackoffIndicator(bodyText)) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    // Must have a re-throw or loop continuation to confirm it's truly a retry
                    if (!hasRethrowOrContinue(body, sf)) {
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
                        operationalRisk: 'Linear retry without backoff causes a thundering herd: all retry loops fire simultaneously ' +
                            'after a failure, amplifying load on an already-struggling downstream service ' +
                            'and preventing recovery.',
                        remediation: 'Add exponential backoff: `await sleep(Math.min(baseDelay * 2 ** attempt, maxDelay))` ' +
                            'with optional jitter: `+ Math.random() * jitter`. Consider using a library like `p-retry`.',
                        determinism: 'heuristic-advisory',
                        confidence: 0.70,
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
exports.SR009MissingRetryBackoff = SR009MissingRetryBackoff;
//# sourceMappingURL=SR009-missing-retry-backoff.js.map