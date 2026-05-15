"use strict";
/**
 * Diff Normalization Stage
 * ------------------------
 * Canonical stage that resolves the diff context, parses tracked/staged diff,
 * merges untracked files, and applies the project-wide exclusion filter.
 *
 * SEMANTIC PRESERVATION:
 *   This stage is a structural wrapper around the pre-existing diff loading
 *   logic in `verify.ts`. The order of operations, the helper functions
 *   invoked, and the returned `diffFiles` set are byte-identical to the
 *   inline implementation. The stage adds nothing but lineage and metrics.
 *
 *   Specifically, this stage MUST produce the same DiffFile[] that
 *   `verify.ts` line ~3580 produces — every downstream pipeline step
 *   depends on that identity.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.diffNormalizationStage = void 0;
exports.computeDiffNormalization = computeDiffNormalization;
const child_process_1 = require("child_process");
const diff_parser_1 = require("@neurcode-ai/diff-parser");
const git_1 = require("../../../utils/git");
const fingerprint_1 = require("../fingerprint");
const types_1 = require("../types");
const GIT_DIFF_MAX_BUFFER = 1024 * 1024 * 1024;
/**
 * Stage definition. Use with `runStage(diffNormalizationStage, input, ctx)`.
 */
exports.diffNormalizationStage = {
    id: 'diff-normalization',
    determinism: 'deterministic-structural',
    boundary: types_1.STRICT_REQUIRED_BOUNDARY,
    description: 'Resolve diff context, parse tracked/staged diff, merge untracked files, apply exclusion filter.',
    execute(input) {
        return computeDiffNormalization(input);
    },
    fingerprintInput(input) {
        return (0, fingerprint_1.fingerprintStageSignal)({
            mode: input.mode,
            baseRef: input.baseRef ?? null,
            // projectRoot is intentionally excluded: identical diffs on different
            // checkout paths must produce the same fingerprint.
        });
    },
    fingerprintOutput(output) {
        // Fingerprint is the set of analyzed file paths. Diff content fingerprinting
        // belongs in a downstream content-hash stage; here we only commit to the shape.
        return (0, fingerprint_1.fingerprintStageSignal)({
            diffContextLabel: output.diffContextLabel,
            files: output.diffFiles.map(f => ({
                path: f.path,
                oldPath: f.oldPath ?? null,
                changeType: f.changeType,
                addedLines: f.addedLines ?? 0,
                removedLines: f.removedLines ?? 0,
            })).sort((a, b) => (a.path < b.path ? -1 : 1)),
            emptyDiff: output.emptyDiff,
        });
    },
    inputItemCount(input) {
        // Stable input "item count": untracked-diff resolver is the only enumerable.
        return input.getUntrackedDiffFiles(input.projectRoot).length;
    },
    outputItemCount(output) {
        return output.diffFiles.length;
    },
};
/**
 * Pure helper for direct invocation (used both by the stage and by tests).
 * Mirrors the semantics of the verify.ts inline implementation.
 */
function computeDiffNormalization(input) {
    const { projectRoot, mode, baseRef, getUntrackedDiffFiles, isExcludedFile } = input;
    let diffText;
    let diffContextLabel = '';
    if (mode === 'staged') {
        diffText = (0, child_process_1.execSync)('git diff --cached', {
            maxBuffer: GIT_DIFF_MAX_BUFFER,
            encoding: 'utf-8',
        });
        diffContextLabel = 'staged changes';
    }
    else if (mode === 'base' && baseRef) {
        diffText = (0, git_1.getDiffFromBase)(baseRef);
        diffContextLabel = `working tree vs ${baseRef}`;
    }
    else if (mode === 'head') {
        diffText = (0, child_process_1.execSync)('git diff HEAD', {
            maxBuffer: GIT_DIFF_MAX_BUFFER,
            encoding: 'utf-8',
        });
        diffContextLabel = 'working tree vs HEAD';
    }
    else {
        // 'auto'
        const defaultContext = (0, git_1.resolveDefaultDiffContext)(projectRoot);
        if (defaultContext.mode === 'base' && defaultContext.baseRef) {
            diffText = (0, git_1.getDiffFromBase)(defaultContext.baseRef);
            diffContextLabel = defaultContext.currentBranch
                ? `${defaultContext.currentBranch} vs ${defaultContext.baseRef}`
                : `working tree vs ${defaultContext.baseRef}`;
        }
        else {
            diffText = (0, child_process_1.execSync)('git diff --cached', {
                maxBuffer: GIT_DIFF_MAX_BUFFER,
                encoding: 'utf-8',
            });
            diffContextLabel = 'staged changes (fallback)';
        }
    }
    const untrackedDiffFiles = getUntrackedDiffFiles(projectRoot);
    const parsedDiffFiles = diffText.trim() ? (0, diff_parser_1.parseDiff)(diffText) : [];
    const allDiffFiles = [...parsedDiffFiles];
    if (untrackedDiffFiles.length > 0) {
        const existing = new Set(allDiffFiles.map(f => f.path));
        for (const file of untrackedDiffFiles) {
            if (!existing.has(file.path)) {
                allDiffFiles.push(file);
            }
        }
    }
    // Filter out internal/system files before analysis.
    const diffFiles = allDiffFiles.filter(file => {
        const excludePath = isExcludedFile(file.path);
        const excludeOldPath = file.oldPath ? isExcludedFile(file.oldPath) : false;
        return !excludePath && !excludeOldPath;
    });
    const emptyDiff = !diffText.trim() && untrackedDiffFiles.length === 0;
    const excludedFileCount = allDiffFiles.length - diffFiles.length;
    return {
        diffText,
        diffContextLabel,
        allDiffFiles,
        diffFiles,
        emptyDiff,
        excludedFileCount,
    };
}
//# sourceMappingURL=diff-normalization-stage.js.map