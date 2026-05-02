"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyUnifiedDiff = applyUnifiedDiff;
exports.applyFirstMatchingPatch = applyFirstMatchingPatch;
exports.generatePatchForSuggestion = generatePatchForSuggestion;
const patterns_1 = require("./patterns");
const generator_1 = require("./generator");
const diff_1 = require("./diff");
// Patterns that must appear in original content for a patch to be considered safe.
const PATCHABLE_PATTERN_RE = /db\.(query|execute|run|find[A-Za-z]*)\b|prisma\.\w+\.\w+\b|new\s+Pool\s*\(|knex\s*\(|TODO|FIXME|\bvalidat/i;
/**
 * A patch is safe when:
 *  - updated content is non-empty
 *  - the diff is non-empty (something actually changed)
 *  - total added + removed lines ≤ 5 (not a full-file rewrite)
 *  - the original file contains at least one recognizable patchable pattern
 */
function isPatchSafe(original, updated) {
    if (!updated || !updated.trim())
        return false;
    const diff = (0, diff_1.generateUnifiedDiff)('', original, updated);
    if (!diff)
        return false;
    let changed = 0;
    for (const line of diff.split('\n')) {
        if (line.startsWith('-') && !line.startsWith('---'))
            changed++;
        if (line.startsWith('+') && !line.startsWith('+++'))
            changed++;
    }
    if (changed > 5)
        return false;
    if (!PATCHABLE_PATTERN_RE.test(original))
        return false;
    return true;
}
function scorePatchConfidence(kind) {
    if (kind === 'db_in_ui')
        return 'high';
    if (kind === 'missing_validation')
        return 'medium';
    return 'low'; // todo_fixme — simple removal, lowest confidence
}
/**
 * Apply a unified diff (as produced by generateUnifiedDiff) to fileContent.
 *
 * Parses the single-hunk diff format, verifies every context and removal line
 * matches the current file, then reconstructs the updated content.
 *
 * Returns null when:
 *  - no hunk header found
 *  - a context or removal line does not match current file content (file changed)
 */
function applyUnifiedDiff(fileContent, diff) {
    if (!diff)
        return null;
    const diffLines = diff.split('\n');
    // Locate the hunk header (skip --- / +++ file headers)
    let hunkIdx = -1;
    for (let i = 0; i < diffLines.length; i++) {
        if (diffLines[i].startsWith('@@')) {
            hunkIdx = i;
            break;
        }
    }
    if (hunkIdx === -1)
        return null;
    // Parse @@ -oldStart[,oldCount] +newStart[,newCount] @@
    const match = diffLines[hunkIdx].match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (!match)
        return null;
    // Diff uses 1-indexed lines; convert to 0-indexed
    const origStart = parseInt(match[1], 10) - 1;
    const origLines = fileContent.split('\n');
    const output = [];
    // Lines before the hunk are copied unchanged
    for (let i = 0; i < origStart; i++) {
        output.push(origLines[i] ?? '');
    }
    let origIdx = origStart;
    for (let i = hunkIdx + 1; i < diffLines.length; i++) {
        const line = diffLines[i];
        // A trailing empty string from split('\n') signals end of diff
        if (line.length === 0 && i === diffLines.length - 1)
            break;
        const prefix = line[0];
        const content = line.slice(1);
        if (prefix === ' ') {
            // Context: must match current file — abort on mismatch (file changed)
            if (origIdx >= origLines.length || origLines[origIdx] !== content)
                return null;
            output.push(content);
            origIdx++;
        }
        else if (prefix === '-') {
            // Removal: must match current file — abort on mismatch
            if (origIdx >= origLines.length || origLines[origIdx] !== content)
                return null;
            origIdx++; // consume original line without adding to output
        }
        else if (prefix === '+') {
            // Addition: inject into output without consuming original
            output.push(content);
        }
        else {
            break; // unexpected prefix — stop hunk processing
        }
    }
    // Copy remaining original lines after the hunk
    while (origIdx < origLines.length) {
        output.push(origLines[origIdx]);
        origIdx++;
    }
    return output.join('\n');
}
/**
 * Detect the first matching patchable pattern in fileContent and return the
 * updated content. Tries patterns in priority order: db_in_ui → missing_validation
 * → todo_fixme. Validates safety before returning.
 *
 * Used by `neurcode patch --file` to apply a patch without needing suggestion metadata.
 */
function applyFirstMatchingPatch(filePath, fileContent) {
    const kinds = ['db_in_ui', 'missing_validation', 'todo_fixme'];
    for (const kind of kinds) {
        const result = (0, generator_1.generatePatch)({
            filePath,
            issue: '',
            policy: '',
            fileContent,
            patternKind: kind,
        });
        if (!result)
            continue;
        const diff = (0, diff_1.generateUnifiedDiff)(filePath, fileContent, result.updatedContent);
        if (!diff)
            continue;
        if (!isPatchSafe(fileContent, result.updatedContent))
            continue;
        return {
            updatedContent: result.updatedContent,
            patternKind: kind,
            patchConfidence: scorePatchConfidence(kind),
        };
    }
    return null;
}
/**
 * Given a fix suggestion and the current content of suggestion.file,
 * attempts to generate a deterministic, safety-validated code patch.
 *
 * Returns null when:
 *  - the violation type has no patchable pattern
 *  - the pattern is not found in the file content
 *  - the generated patch produces no diff
 *  - the patch fails the safety gate (isPatchSafe)
 */
function generatePatchForSuggestion(suggestion, fileContent) {
    const kind = (0, patterns_1.classifyViolation)(suggestion.issue, suggestion.policy);
    if (!kind)
        return null;
    const result = (0, generator_1.generatePatch)({
        filePath: suggestion.file,
        issue: suggestion.issue,
        policy: suggestion.policy,
        fileContent,
        patternKind: kind,
    });
    if (!result)
        return null;
    const diff = (0, diff_1.generateUnifiedDiff)(suggestion.file, fileContent, result.updatedContent);
    if (!diff)
        return null;
    if (!isPatchSafe(fileContent, result.updatedContent))
        return null;
    return {
        file: suggestion.file,
        diff,
        patchConfidence: scorePatchConfidence(kind),
    };
}
//# sourceMappingURL=index.js.map