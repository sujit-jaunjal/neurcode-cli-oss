"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StructuralRuleEngine = void 0;
const suppressions_1 = require("./suppressions");
const context_severity_1 = require("./context-severity");
function detectLanguage(filePath) {
    if (/\.(ts|tsx)$/.test(filePath))
        return 'typescript';
    if (/\.(js|jsx)$/.test(filePath))
        return 'javascript';
    if (/\.py$/.test(filePath))
        return 'python';
    return null;
}
class StructuralRuleEngine {
    rules = [];
    suppressionEnabled = true;
    register(rule) {
        this.rules.push(rule);
    }
    registerAll(rules) {
        rules.forEach(r => this.register(r));
    }
    setSuppression(enabled) {
        this.suppressionEnabled = enabled;
    }
    /**
     * Run all registered rules against the provided files.
     * files: array of { filePath, sourceText } — caller provides content, engine doesn't do I/O.
     * Never throws. Failed rules are caught, file is added to skippedFiles.
     */
    analyze(files) {
        return this.analyzeWithFilter(files, new Set(this.rules.map(r => r.id)));
    }
    /** Run only rules whose IDs are in the filter set. */
    analyzeWithFilter(files, ruleIds) {
        const startMs = Date.now();
        const allViolations = [];
        const skippedFiles = [];
        const activeRules = this.rules.filter(r => ruleIds.has(r.id));
        const appliedRuleIds = new Set();
        const allSuppressed = [];
        for (const { filePath, sourceText } of files) {
            const lang = detectLanguage(filePath);
            if (!lang)
                continue;
            const compatibleRules = activeRules.filter(r => r.languages.includes(lang));
            const fileViolations = [];
            for (const rule of compatibleRules) {
                try {
                    const found = rule.check(filePath, sourceText);
                    fileViolations.push(...found);
                    appliedRuleIds.add(rule.id);
                }
                catch {
                    if (!skippedFiles.includes(filePath)) {
                        skippedFiles.push(filePath);
                    }
                }
            }
            if (this.suppressionEnabled) {
                const directives = (0, suppressions_1.parseSuppressionDirectives)(sourceText);
                const { active, suppressed } = (0, suppressions_1.applySuppressions)(fileViolations, directives, filePath);
                allViolations.push(...active);
                allSuppressed.push(...suppressed);
            }
            else {
                allViolations.push(...fileViolations);
            }
        }
        // Apply contextual severity to all active violations
        const { violations: adjustedViolations, adjustments: severityAdjustments } = (0, context_severity_1.applyContextualSeverity)(allViolations);
        return {
            violations: adjustedViolations,
            filesAnalyzed: files.length,
            analysisMs: Date.now() - startMs,
            rulesApplied: Array.from(appliedRuleIds),
            skippedFiles,
            suppressedCount: allSuppressed.length,
            suppressedViolations: allSuppressed,
            severityAdjustments,
        };
    }
    /** Get all registered rule IDs. */
    getRuleIds() {
        return this.rules.map(r => r.id);
    }
}
exports.StructuralRuleEngine = StructuralRuleEngine;
//# sourceMappingURL=engine.js.map