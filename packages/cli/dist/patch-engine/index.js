"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyUnifiedDiff = applyUnifiedDiff;
exports.applyFirstMatchingPatch = applyFirstMatchingPatch;
exports.generatePatchForSuggestion = generatePatchForSuggestion;
const patterns_1 = require("./patterns");
const generator_1 = require("./generator");
const diff_1 = require("./diff");
const transaction_1 = require("./transaction");
const safety_1 = require("./safety");
function scorePatchConfidence(kind) {
    switch (kind) {
        case 'missing_validation':
        case 'missing_timeout_handling':
        case 'unsafe_inner_html_usage':
            return 'high';
        case 'missing_auth_middleware':
        case 'missing_rate_limiting':
        case 'unsafe_fetch_without_retries':
        case 'missing_idempotency_keys':
        case 'unsafe_file_uploads':
        case 'missing_token_expiry':
        case 'unsafe_sensitive_logging':
            return 'medium';
        case 'db_in_ui':
        case 'todo_fixme':
            return 'low';
        default:
            return 'low';
    }
}
function patchPriorityKinds() {
    return [
        'missing_validation',
        'missing_timeout_handling',
        'unsafe_fetch_without_retries',
        'missing_idempotency_keys',
        'unsafe_file_uploads',
        'unsafe_inner_html_usage',
        'missing_token_expiry',
        'missing_auth_middleware',
        'missing_rate_limiting',
        'unsafe_sensitive_logging',
        'db_in_ui',
        'todo_fixme',
    ];
}
function buildPatchTokenPayload(input) {
    return {
        schemaVersion: 'neurcode.patch-preview-token.v1',
        file: input.filePath,
        createdAt: new Date().toISOString(),
        beforeHash: input.beforeHash,
        afterHash: input.afterHash,
        diffHash: input.diffHash,
        patchHash: input.patchHash,
        patternKind: input.patternKind,
        confidence: input.patchConfidence,
    };
}
function buildPatchBundle(input) {
    const generated = (0, generator_1.generatePatch)({
        filePath: input.filePath,
        issue: '',
        policy: '',
        fileContent: input.fileContent,
        patternKind: input.patternKind,
    });
    if (!generated)
        return null;
    const diff = (0, diff_1.generateUnifiedDiff)(input.filePath, input.fileContent, generated.updatedContent);
    if (!diff)
        return null;
    const patchConfidence = scorePatchConfidence(input.patternKind);
    const validation = (0, safety_1.validatePatchCandidate)({
        originalContent: input.fileContent,
        updatedContent: generated.updatedContent,
        diff,
        kind: input.patternKind,
        confidence: patchConfidence,
    });
    const beforeHash = (0, transaction_1.hashPatchValue)(input.fileContent);
    const afterHash = (0, transaction_1.hashPatchValue)(generated.updatedContent);
    const patchHash = (0, transaction_1.buildPatchHash)({
        file: input.filePath,
        beforeHash,
        afterHash,
        diffHash: validation.diffHash,
        patternKind: input.patternKind,
    });
    const previewToken = (0, transaction_1.createPatchPreviewToken)(buildPatchTokenPayload({
        filePath: input.filePath,
        patternKind: input.patternKind,
        patchConfidence,
        beforeHash,
        afterHash,
        diffHash: validation.diffHash,
        patchHash,
    }));
    return {
        updatedContent: generated.updatedContent,
        patternKind: input.patternKind,
        patchConfidence,
        diff,
        validation,
        previewToken,
        patchHash,
        recipe: generated.metadata,
        beforeHash,
        afterHash,
    };
}
/**
 * Apply a unified diff (as produced by generateUnifiedDiff) to fileContent.
 *
 * Parses a single-hunk diff format, verifies every context/removal line matches
 * the current file, then reconstructs updated content.
 */
function applyUnifiedDiff(fileContent, diff) {
    if (!diff)
        return null;
    const diffLines = diff.split('\n');
    let hunkIdx = -1;
    for (let i = 0; i < diffLines.length; i += 1) {
        if (diffLines[i].startsWith('@@')) {
            hunkIdx = i;
            break;
        }
    }
    if (hunkIdx === -1)
        return null;
    const match = diffLines[hunkIdx].match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (!match)
        return null;
    const origStart = parseInt(match[1], 10) - 1;
    const origLines = fileContent.split('\n');
    const output = [];
    for (let i = 0; i < origStart; i += 1) {
        output.push(origLines[i] ?? '');
    }
    let origIdx = origStart;
    for (let i = hunkIdx + 1; i < diffLines.length; i += 1) {
        const line = diffLines[i];
        if (line.length === 0 && i === diffLines.length - 1)
            break;
        const prefix = line[0];
        const content = line.slice(1);
        if (prefix === ' ') {
            if (origIdx >= origLines.length || origLines[origIdx] !== content)
                return null;
            output.push(content);
            origIdx += 1;
        }
        else if (prefix === '-') {
            if (origIdx >= origLines.length || origLines[origIdx] !== content)
                return null;
            origIdx += 1;
        }
        else if (prefix === '+') {
            output.push(content);
        }
        else {
            break;
        }
    }
    while (origIdx < origLines.length) {
        output.push(origLines[origIdx]);
        origIdx += 1;
    }
    return output.join('\n');
}
/**
 * Deterministically build a patch bundle for the first matching remediation kind.
 *
 * Returns null when no deterministic recipe matches the target file.
 */
function applyFirstMatchingPatch(filePath, fileContent) {
    for (const kind of patchPriorityKinds()) {
        const bundle = buildPatchBundle({
            filePath,
            fileContent,
            patternKind: kind,
        });
        if (!bundle)
            continue;
        return bundle;
    }
    return null;
}
/**
 * Generate a deterministic patch for a specific verify/fix suggestion.
 */
function generatePatchForSuggestion(suggestion, fileContent) {
    const kind = (0, patterns_1.classifyViolation)(suggestion.issue, suggestion.policy);
    if (!kind)
        return null;
    const generated = (0, generator_1.generatePatch)({
        filePath: suggestion.file,
        issue: suggestion.issue,
        policy: suggestion.policy,
        fileContent,
        patternKind: kind,
    });
    if (!generated)
        return null;
    const diff = (0, diff_1.generateUnifiedDiff)(suggestion.file, fileContent, generated.updatedContent);
    if (!diff)
        return null;
    const patchConfidence = scorePatchConfidence(kind);
    const validation = (0, safety_1.validatePatchCandidate)({
        originalContent: fileContent,
        updatedContent: generated.updatedContent,
        diff,
        kind,
        confidence: patchConfidence,
    });
    // Keep low-confidence / unsafe transforms out of auto-fix suggestions.
    if (!validation.safe)
        return null;
    return {
        file: suggestion.file,
        diff,
        patchConfidence,
        patternKind: kind,
        validation,
        recipe: generated.metadata,
    };
}
//# sourceMappingURL=index.js.map