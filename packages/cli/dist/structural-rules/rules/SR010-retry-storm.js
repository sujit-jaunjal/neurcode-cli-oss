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
exports.SR010RetryStorm = void 0;
const ts = __importStar(require("typescript"));
function getLineAndCol(sf, pos) {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
}
function getEvidenceLines(sourceText, line) {
    const lines = sourceText.split('\n');
    return (lines[line - 1] || '').slice(0, 120);
}
function hasRateLimitOrCircuitBreaker(sourceText) {
    return (/\bcircuitBreaker\b/i.test(sourceText) ||
        /\brateLimit\b/i.test(sourceText) ||
        /\brate_limit\b/i.test(sourceText) ||
        /\bthrottle\b/i.test(sourceText) ||
        /\bTokenBucket\b/.test(sourceText) ||
        /\bLeakyBucket\b/.test(sourceText) ||
        /\bBulkhead\b/.test(sourceText) ||
        /\bp-limit\b/.test(sourceText) ||
        /pLimit/.test(sourceText));
}
class SR010RetryStorm {
    id = 'SR010';
    name = 'Multiple independent retriers without rate limiting';
    policyRef = 'P014';
    severity = 'ADVISORY';
    languages = ['typescript', 'javascript'];
    description = 'Three or more independent retry patterns in one file without shared rate limiting create multiplicative retry storms.';
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
            // If there's already a shared rate limiter or circuit breaker, don't flag
            if (hasRateLimitOrCircuitBreaker(sourceText))
                return [];
            const retryPatterns = [];
            const visit = (node) => {
                // Pattern 1: while/for loop with retry variable and await
                const isLoop = ts.isWhileStatement(node) ||
                    ts.isForStatement(node) ||
                    ts.isDoStatement(node);
                if (isLoop) {
                    const nodeText = node.getText(sf);
                    if (/\b(retry|retries|attempt|maxRetry|MAX_RETRY)\b/i.test(nodeText) &&
                        /\bawait\b/.test(nodeText)) {
                        const { line, column } = getLineAndCol(sf, node.getStart(sf));
                        retryPatterns.push({
                            line,
                            column,
                            evidence: getEvidenceLines(sourceText, line),
                            kind: 'retry loop',
                        });
                    }
                }
                // Pattern 2: function named with 'retry' or 'withRetry' or 'retryable'
                if (ts.isFunctionDeclaration(node) ||
                    ts.isFunctionExpression(node) ||
                    ts.isMethodDeclaration(node) ||
                    ts.isArrowFunction(node)) {
                    let funcName = '';
                    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
                        node.name &&
                        ts.isIdentifier(node.name)) {
                        funcName = node.name.text;
                    }
                    if (/retry|withRetry|retryable|retriable/i.test(funcName)) {
                        const { line, column } = getLineAndCol(sf, node.getStart(sf));
                        retryPatterns.push({
                            line,
                            column,
                            evidence: getEvidenceLines(sourceText, line),
                            kind: 'retry function',
                        });
                    }
                }
                // Pattern 3: catch-and-retry: recursive call inside catch
                if (ts.isCallExpression(node) &&
                    ts.isPropertyAccessExpression(node.expression) &&
                    node.expression.name.text === 'catch') {
                    const bodyText = node.getText(sf);
                    // catch body calls the parent function recursively (retry pattern)
                    if (/\bretry\b/i.test(bodyText) || /\battempt\b/i.test(bodyText)) {
                        const { line, column } = getLineAndCol(sf, node.getStart(sf));
                        retryPatterns.push({
                            line,
                            column,
                            evidence: getEvidenceLines(sourceText, line),
                            kind: 'catch-and-retry',
                        });
                    }
                }
                ts.forEachChild(node, visit);
            };
            ts.forEachChild(sf, visit);
            // Only flag when 3+ retry patterns found
            if (retryPatterns.length < 3)
                return [];
            // Deduplicate by line
            const seen = new Set();
            const unique = retryPatterns.filter(p => {
                if (seen.has(p.line))
                    return false;
                seen.add(p.line);
                return true;
            });
            if (unique.length < 3)
                return [];
            // Report on the first pattern, with evidence listing all found locations
            const allLocations = unique
                .map(p => `  line ${p.line}: ${p.evidence.trim()} [${p.kind}]`)
                .join('\n');
            violations.push({
                ruleId: this.id,
                ruleName: this.name,
                policyRef: this.policyRef,
                severity: this.severity,
                filePath,
                line: unique[0].line,
                column: unique[0].column,
                evidence: `${unique.length} retry patterns found:\n${allLocations}`.slice(0, 600),
                operationalRisk: `${unique.length} independent retry patterns exist in this file without shared rate limiting. ` +
                    'Under a single downstream failure, each retrier fires independently, creating up to ' +
                    `${unique.length}x the expected load on the failing service, delaying its recovery.`,
                remediation: 'Introduce a shared circuit breaker or rate limiter (e.g. `p-limit`, `opossum`) that all ' +
                    'retry patterns respect. Alternatively, consolidate retries into a single shared utility ' +
                    'function with a centrally-configured retry policy.',
                determinism: 'heuristic-advisory',
                confidence: 0.60,
                language: filePath.match(/\.(js|jsx)$/) ? 'javascript' : 'typescript',
            });
            return violations;
        }
        catch {
            return [];
        }
    }
}
exports.SR010RetryStorm = SR010RetryStorm;
//# sourceMappingURL=SR010-retry-storm.js.map