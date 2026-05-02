"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUnifiedDiff = generateUnifiedDiff;
const CONTEXT_LINES = 3;
/**
 * Generate a minimal unified diff for a single-hunk change.
 *
 * Handles three cases without external libraries:
 *  - 1→1  replacement  (db_in_ui)
 *  - 0→1  insertion    (missing_validation: comment inserted before a line)
 *  - 1→0  deletion     (todo_fixme: comment line removed)
 *
 * Returns an empty string when original === updated.
 */
function generateUnifiedDiff(filePath, original, updated) {
    if (original === updated)
        return '';
    const origLines = original.split('\n');
    const newLines = updated.split('\n');
    // ── Forward scan: find first line that differs ──────────────────────────
    let firstDiff = 0;
    while (firstDiff < origLines.length &&
        firstDiff < newLines.length &&
        origLines[firstDiff] === newLines[firstDiff]) {
        firstDiff++;
    }
    // ── Backward scan: find last differing line in each file ─────────────────
    // Use `>=` so the scan can match lines at exactly firstDiff:
    //  - Deletion: lastDiffNew drops to firstDiff-1 (no added lines)
    //  - Insertion: lastDiffOrig drops to firstDiff-1 (no removed lines)
    //  - Replacement: both stop at firstDiff (the differing line)
    // Safety: at firstDiff the forward scan guaranteed origLines[firstDiff] != newLines[firstDiff],
    // so the equality check naturally stops the loop before both go below firstDiff.
    let lastDiffOrig = origLines.length - 1;
    let lastDiffNew = newLines.length - 1;
    while (lastDiffOrig >= firstDiff &&
        lastDiffNew >= firstDiff &&
        origLines[lastDiffOrig] === newLines[lastDiffNew]) {
        lastDiffOrig--;
        lastDiffNew--;
    }
    // ── Context window ───────────────────────────────────────────────────────
    const contextStart = Math.max(0, firstDiff - CONTEXT_LINES);
    const contextEndOrig = Math.min(origLines.length - 1, lastDiffOrig + CONTEXT_LINES);
    const contextEndNew = Math.min(newLines.length - 1, lastDiffNew + CONTEXT_LINES);
    // Hunk header line counts (unified diff convention: 1-indexed, inclusive)
    const oldStartLine = contextStart + 1;
    const oldCount = contextEndOrig - contextStart + 1;
    const newStartLine = contextStart + 1;
    const newCount = contextEndNew - contextStart + 1;
    const out = [
        `--- a/${filePath}`,
        `+++ b/${filePath}`,
        `@@ -${oldStartLine},${oldCount} +${newStartLine},${newCount} @@`,
    ];
    // Context lines before the change
    for (let i = contextStart; i < firstDiff; i++) {
        out.push(` ${origLines[i]}`);
    }
    // Removed lines (empty range when lastDiffOrig < firstDiff = pure insertion)
    for (let i = firstDiff; i <= lastDiffOrig; i++) {
        out.push(`-${origLines[i]}`);
    }
    // Added lines (empty range when lastDiffNew < firstDiff = pure deletion)
    for (let i = firstDiff; i <= lastDiffNew; i++) {
        out.push(`+${newLines[i]}`);
    }
    // Context lines after the change (taken from orig; content is identical in new)
    for (let i = lastDiffOrig + 1; i <= contextEndOrig; i++) {
        out.push(` ${origLines[i]}`);
    }
    return out.join('\n');
}
//# sourceMappingURL=diff.js.map