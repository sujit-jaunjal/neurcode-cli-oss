"use strict";
/**
 * Inline suppression annotations for structural rules.
 *
 * Supported formats:
 *   // neurcode-ignore: SR003
 *   // neurcode-ignore: SR003, SR007
 *   // neurcode-ignore-next-line: SR003
 *   // neurcode-ignore-file: SR003
 *   // neurcode-ignore-file: SR003 — reason: timer is cleaned up in test teardown
 *
 * Every suppression is preserved in the audit trail as a SuppressedViolation.
 * Suppressions never silently drop findings — they reclassify them as suppressed.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSuppressionDirectives = parseSuppressionDirectives;
exports.applySuppressions = applySuppressions;
// Matches: // neurcode-ignore[-next-line|-file][: SR001, SR002] [— reason: ...]
// Group 1: variant suffix ('-next-line', '-file', or empty)
// Group 2: rule list (may be absent)
// Group 3: reason text (may be absent)
const DIRECTIVE_RE = /\/\/\s*neurcode-ignore(-next-line|-file)?(?:\s*:\s*([^—\n]+?))?(?:\s*[—–-]\s*reason:\s*(.+?))?[\s]*$/;
/**
 * Parse all neurcode-ignore directives from source text.
 * Returns directives sorted by line number.
 */
function parseSuppressionDirectives(sourceText) {
    const lines = sourceText.split('\n');
    const directives = [];
    for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        const lineNumber = i + 1; // 1-based
        // Quick bail — must contain the marker
        if (!lineText.includes('neurcode-ignore'))
            continue;
        const match = DIRECTIVE_RE.exec(lineText);
        if (!match)
            continue;
        const variantSuffix = match[1] ?? ''; // '-next-line', '-file', or ''
        const ruleListRaw = match[2] ?? '';
        const reasonRaw = match[3] ?? '';
        let type;
        if (variantSuffix === '-next-line') {
            type = 'next-line';
        }
        else if (variantSuffix === '-file') {
            type = 'file';
        }
        else {
            type = 'line';
        }
        // Parse comma-separated rule IDs, stripping whitespace
        const ruleIds = ruleListRaw
            .split(',')
            .map(r => r.trim())
            .filter(r => r.length > 0);
        const reason = reasonRaw.trim() || null;
        // Capture the original comment text (trimmed)
        const raw = lineText.replace(/^.*?\/\//, '//').trim();
        directives.push({ type, ruleIds, line: lineNumber, reason, raw });
    }
    // Stable sort by line number (already in order, but be explicit)
    directives.sort((a, b) => a.line - b.line);
    return directives;
}
/**
 * Return true if the directive covers the given ruleId.
 * An empty ruleIds list means "suppress everything".
 */
function directiveMatchesRule(directive, ruleId) {
    return directive.ruleIds.length === 0 || directive.ruleIds.includes(ruleId);
}
/**
 * Apply suppression directives to a set of violations.
 *
 * Returns:
 *  - active: violations NOT suppressed (to be reported normally)
 *  - suppressed: violations that matched a directive (audit trail)
 */
function applySuppressions(violations, directives, _filePath) {
    const active = [];
    const suppressed = [];
    const now = new Date().toISOString();
    for (const violation of violations) {
        let matchedDirective = null;
        for (const directive of directives) {
            if (!directiveMatchesRule(directive, violation.ruleId))
                continue;
            if (directive.type === 'file') {
                matchedDirective = directive;
                break;
            }
            if (directive.type === 'line' && directive.line === violation.line) {
                matchedDirective = directive;
                break;
            }
            if (directive.type === 'next-line' && directive.line + 1 === violation.line) {
                matchedDirective = directive;
                break;
            }
        }
        if (matchedDirective) {
            suppressed.push({
                violation,
                directive: matchedDirective,
                suppressedAt: now,
            });
        }
        else {
            active.push(violation);
        }
    }
    return { active, suppressed };
}
//# sourceMappingURL=suppressions.js.map