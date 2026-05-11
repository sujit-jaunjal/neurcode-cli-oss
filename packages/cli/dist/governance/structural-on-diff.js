"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runStructuralOnDiffFiles = runStructuralOnDiffFiles;
const fs_1 = require("fs");
const path_1 = require("path");
const structural_rules_1 = require("../structural-rules");
/**
 * Run the default structural rule set on files touched by the diff. No I/O beyond reads.
 */
function runStructuralOnDiffFiles(projectRoot, diffFiles) {
    const engine = (0, structural_rules_1.createDefaultStructuralRuleEngine)();
    const filesToAnalyze = [];
    for (const df of diffFiles) {
        const absPath = (0, path_1.join)(projectRoot, df.path);
        if (!(0, fs_1.existsSync)(absPath))
            continue;
        try {
            const sourceText = (0, fs_1.readFileSync)(absPath, 'utf-8');
            filesToAnalyze.push({ filePath: df.path, sourceText });
        }
        catch {
            // skip unreadable
        }
    }
    if (filesToAnalyze.length === 0) {
        return { violations: [], rulesApplied: [], suppressedCount: 0 };
    }
    const result = engine.analyze(filesToAnalyze);
    return {
        violations: result.violations,
        rulesApplied: result.rulesApplied,
        suppressedCount: result.suppressedCount,
    };
}
//# sourceMappingURL=structural-on-diff.js.map