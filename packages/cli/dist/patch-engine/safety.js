"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePatchCandidate = validatePatchCandidate;
const node_crypto_1 = require("node:crypto");
const SECRET_LIKE_PATTERN = /(api[_-]?key|secret|password|token)\s*[:=]\s*['"`][^'"`]+['"`]/i;
function countChangedLines(diff) {
    let changed = 0;
    for (const line of diff.split('\n')) {
        if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@'))
            continue;
        if (line.startsWith('+') || line.startsWith('-'))
            changed += 1;
    }
    return changed;
}
function hasBalancedDelimiters(content) {
    let parens = 0;
    let braces = 0;
    let brackets = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let escaped = false;
    for (const ch of content) {
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        if (!inDouble && !inTemplate && ch === '\'') {
            inSingle = !inSingle;
            continue;
        }
        if (!inSingle && !inTemplate && ch === '"') {
            inDouble = !inDouble;
            continue;
        }
        if (!inSingle && !inDouble && ch === '`') {
            inTemplate = !inTemplate;
            continue;
        }
        if (inSingle || inDouble || inTemplate)
            continue;
        if (ch === '(')
            parens += 1;
        else if (ch === ')')
            parens -= 1;
        else if (ch === '{')
            braces += 1;
        else if (ch === '}')
            braces -= 1;
        else if (ch === '[')
            brackets += 1;
        else if (ch === ']')
            brackets -= 1;
        if (parens < 0 || braces < 0 || brackets < 0)
            return false;
    }
    return parens === 0 && braces === 0 && brackets === 0 && !inSingle && !inDouble && !inTemplate;
}
function changedLineBudget(kind) {
    switch (kind) {
        case 'missing_validation':
            return 26;
        case 'unsafe_fetch_without_retries':
            return 34;
        case 'unsafe_file_uploads':
            return 24;
        case 'missing_auth_middleware':
        case 'missing_rate_limiting':
        case 'missing_token_expiry':
        case 'missing_timeout_handling':
        case 'missing_idempotency_keys':
        case 'unsafe_inner_html_usage':
            return 10;
        case 'todo_fixme':
            return 4;
        default:
            return 8;
    }
}
function validatePatchCandidate(input) {
    const reasonCodes = [];
    const changedLines = countChangedLines(input.diff);
    const maxChangedLines = changedLineBudget(input.kind);
    const checks = {
        nonEmptyOutput: input.updatedContent.trim().length > 0,
        diffExists: input.diff.trim().length > 0,
        changedLinesWithinLimit: changedLines > 0 && changedLines <= maxChangedLines,
        syntaxLikelyValid: hasBalancedDelimiters(input.updatedContent),
        noSecretLikeTokensAdded: !SECRET_LIKE_PATTERN.test(input.updatedContent),
        confidenceThresholdMet: input.confidence === 'high' || input.confidence === 'medium',
    };
    if (!checks.nonEmptyOutput)
        reasonCodes.push('empty_patch_output');
    if (!checks.diffExists)
        reasonCodes.push('empty_diff');
    if (!checks.changedLinesWithinLimit)
        reasonCodes.push('changed_lines_out_of_bounds');
    if (!checks.syntaxLikelyValid)
        reasonCodes.push('syntax_guard_failed');
    if (!checks.noSecretLikeTokensAdded)
        reasonCodes.push('potential_secret_introduced');
    if (!checks.confidenceThresholdMet)
        reasonCodes.push('confidence_below_threshold');
    const safe = Object.values(checks).every((value) => value === true);
    return {
        schemaVersion: 'neurcode.patch-validation.v1',
        safe,
        deterministic: true,
        confidence: input.confidence,
        changedLines,
        maxChangedLines,
        checks,
        reasonCodes,
        diffHash: (0, node_crypto_1.createHash)('sha256').update(input.diff).digest('hex'),
    };
}
//# sourceMappingURL=safety.js.map