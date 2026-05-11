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
exports.SR005HalfOpenProbeGate = void 0;
const ts = __importStar(require("typescript"));
function getLineAndCol(sf, pos) {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character + 1 };
}
function getEvidenceLines(sourceText, line) {
    const lines = sourceText.split('\n');
    return (lines[line - 1] || '').slice(0, 120);
}
const PROBE_GATE_PATTERNS = [
    /probeInFlight/,
    /probe_in_flight/,
    /\bprobing\b/,
    /probeSemaphore/,
    /probeToken/,
    /singleProbe/,
    /oneProbe/,
    /maxProbe/,
    /probeCount/,
];
function hasProbingGate(sourceText) {
    return PROBE_GATE_PATTERNS.some(p => p.test(sourceText));
}
/** Find all nodes that reference HALF_OPEN as identifier or string literal */
function findHalfOpenNodes(sf) {
    const results = [];
    const visit = (node) => {
        if (ts.isIdentifier(node) && /HALF.?OPEN/i.test(node.text)) {
            results.push(node);
        }
        if (ts.isStringLiteral(node) && /HALF.?OPEN/i.test(node.text)) {
            results.push(node);
        }
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(sf, visit);
    return results;
}
/** Check if the HALF_OPEN node is inside a conditional expression */
function isInsideConditional(node) {
    let current = node.parent;
    while (current) {
        if (ts.isIfStatement(current) ||
            ts.isSwitchStatement(current) ||
            ts.isCaseClause(current) ||
            ts.isConditionalExpression(current) ||
            ts.isBinaryExpression(current)) {
            return true;
        }
        current = current.parent;
    }
    return false;
}
class SR005HalfOpenProbeGate {
    id = 'SR005';
    name = 'Half-open circuit breaker without probe gate';
    policyRef = 'P009';
    severity = 'ADVISORY';
    languages = ['typescript', 'javascript'];
    description = 'Circuit breaker HALF_OPEN state with no probe-in-flight gate lets multiple concurrent requests probe downstream simultaneously.';
    check(filePath, sourceText) {
        try {
            // Fast path: no HALF_OPEN in file
            if (!/HALF.?OPEN/i.test(sourceText))
                return [];
            // If probe gating is present, no violation
            if (hasProbingGate(sourceText))
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
            const halfOpenNodes = findHalfOpenNodes(sf);
            for (const node of halfOpenNodes) {
                if (!isInsideConditional(node))
                    continue;
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
                    operationalRisk: 'Without a probe-in-flight flag, N concurrent requests in HALF_OPEN all become probes simultaneously. ' +
                        'A slow downstream gets hammered, and a single success can trip the breaker back to CLOSED ' +
                        'while others are still in-flight, masking persistent failures.',
                    remediation: 'Add a boolean `probeInFlight` flag (or a Semaphore(1)). Gate the HALF_OPEN branch: ' +
                        '`if (this.state === HALF_OPEN && !this.probeInFlight) { this.probeInFlight = true; ... }`' +
                        ' and reset it in both success and failure handlers.',
                    determinism: 'heuristic-advisory',
                    confidence: 0.75,
                    language: filePath.match(/\.(js|jsx)$/) ? 'javascript' : 'typescript',
                });
                // Report only the first occurrence per file to avoid noise
                break;
            }
            return violations;
        }
        catch {
            return [];
        }
    }
}
exports.SR005HalfOpenProbeGate = SR005HalfOpenProbeGate;
//# sourceMappingURL=SR005-halfopen-probe-gate.js.map