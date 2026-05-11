"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeterminismClassifier = exports.ViolationFormatter = void 0;
exports.buildViolationReport = buildViolationReport;
var ViolationFormatter_1 = require("./ViolationFormatter");
Object.defineProperty(exports, "ViolationFormatter", { enumerable: true, get: function () { return ViolationFormatter_1.ViolationFormatter; } });
var DeterminismClassifier_1 = require("./DeterminismClassifier");
Object.defineProperty(exports, "DeterminismClassifier", { enumerable: true, get: function () { return DeterminismClassifier_1.DeterminismClassifier; } });
const DeterminismClassifier_2 = require("./DeterminismClassifier");
// ── buildViolationReport ──────────────────────────────────────────────────────
/**
 * Build a ViolationReport from structural rule violations.
 * This is the bridge between the structural rule engine output
 * and the explainability layer.
 *
 * Deterministic violationId: `${ruleId}:${filePath}:${line}:${column}`
 * Same input always produces the same ID.
 */
function buildViolationReport(violations, repoRoot) {
    const generatedAt = new Date().toISOString();
    const explained = violations.map(v => {
        const violationId = `${v.ruleId}:${v.filePath}:${v.line}:${v.column}`;
        // Map DeterminismLevel from structural-rules/types to DeterminismClass.
        // The structural-rules types only define three levels (no llm-assisted-planning),
        // so the cast is safe here.
        const determinism = v.determinism;
        return {
            violationId,
            ruleId: v.ruleId,
            ruleName: v.ruleName,
            policyRef: v.policyRef,
            severity: v.severity,
            filePath: v.filePath,
            line: v.line,
            column: v.column,
            evidence: {
                codeSnippet: v.evidence,
                astNodeType: '', // not available from StructuralViolation; callers may enrich
                matchReason: v.evidence, // use the evidence string as the match reason
            },
            operationalRisk: v.operationalRisk,
            worstCase: '', // not in StructuralViolation; callers may enrich
            remediation: v.remediation,
            determinism,
            confidence: v.confidence,
            language: v.language,
        };
    });
    // Split by severity
    const blocking = explained.filter(v => v.severity === 'BLOCKING');
    const advisory = explained.filter(v => v.severity === 'ADVISORY');
    // byFile aggregate
    const byFile = {};
    for (const v of explained) {
        if (!byFile[v.filePath])
            byFile[v.filePath] = [];
        byFile[v.filePath].push(v);
    }
    // byRule aggregate
    const byRule = {};
    for (const v of explained) {
        if (!byRule[v.ruleId])
            byRule[v.ruleId] = [];
        byRule[v.ruleId].push(v);
    }
    // byDeterminism counts
    const byDeterminism = {
        'deterministic-structural': 0,
        'deterministic-semantic': 0,
        'heuristic-advisory': 0,
        'llm-assisted-planning': 0,
    };
    for (const v of explained) {
        byDeterminism[v.determinism] += 1;
    }
    const deterministicCount = byDeterminism['deterministic-structural'] +
        byDeterminism['deterministic-semantic'];
    const heuristicCount = byDeterminism['heuristic-advisory'];
    const { falsePositiveRisk } = DeterminismClassifier_2.DeterminismClassifier.aggregate(explained);
    return {
        generatedAt,
        repoRoot,
        totalViolations: explained.length,
        blocking,
        advisory,
        byFile,
        byRule,
        byDeterminism,
        deterministicCount,
        heuristicCount,
        falsePositiveRisk,
    };
}
//# sourceMappingURL=index.js.map