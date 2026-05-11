"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PY003BroadExceptClause = void 0;
exports.stripCommentsAndStrings = stripCommentsAndStrings;
exports.classifyExceptionFlow = classifyExceptionFlow;
// Matches: except Exception: or except Exception as e:
const BROAD_EXCEPT_RE = /^(\s*)except\s+Exception(\s+as\s+\w+)?\s*:/;
// Logging/reporting call patterns — only checked AFTER stripping comments
const LOGGING_RE = /\b(?:log|logger|logging|error|warn|warning|report|track|capture|sentry|bugsnag|rollbar|print)\s*[\.(]/i;
/**
 * Strip Python comment lines and string literal regions from source lines.
 *
 * Algorithm (deterministic state machine):
 *   - Track whether we are inside a triple-quoted string (""" or ''')
 *   - Track whether we are inside a single-quoted string (" or ')
 *   - If a line starts with # (after stripping indent) → replace with empty string
 *   - Content inside string regions is neutralized (replaced with spaces of same length)
 *
 * This is NOT a full Python tokenizer — it handles the common cases that enable
 * bypass of governance checks while remaining O(n) and dependency-free.
 */
function stripCommentsAndStrings(lines) {
    const result = [];
    let inTripleDouble = false; // inside """..."""
    let inTripleSingle = false; // inside '''...'''
    for (const line of lines) {
        const trimmed = line.trimStart();
        // If we are inside a triple-quoted block, look for the closing delimiter
        if (inTripleDouble) {
            const closeIdx = line.indexOf('"""');
            if (closeIdx !== -1) {
                inTripleDouble = false;
                // Neutralize up to and including the closing delimiter
                result.push(' '.repeat(line.length));
            }
            else {
                result.push(' '.repeat(line.length));
            }
            continue;
        }
        if (inTripleSingle) {
            const closeIdx = line.indexOf("'''");
            if (closeIdx !== -1) {
                inTripleSingle = false;
                result.push(' '.repeat(line.length));
            }
            else {
                result.push(' '.repeat(line.length));
            }
            continue;
        }
        // Full-line comment — blank it entirely
        if (trimmed.startsWith('#')) {
            result.push('');
            continue;
        }
        // Scan for string/comment delimiters character by character
        let out = '';
        let i = 0;
        let inSingleQ = false;
        let inDoubleQ = false;
        while (i < line.length) {
            const ch = line[i];
            const remaining = line.slice(i);
            if (!inSingleQ && !inDoubleQ) {
                // Check for triple-quote opening
                if (remaining.startsWith('"""')) {
                    const rest = line.slice(i + 3);
                    const closeInSameLine = rest.indexOf('"""');
                    if (closeInSameLine !== -1) {
                        // Triple-quote opens and closes on same line — neutralize it
                        out += ' '.repeat(3 + closeInSameLine + 3);
                        i += 3 + closeInSameLine + 3;
                        continue;
                    }
                    else {
                        inTripleDouble = true;
                        // Neutralize rest of line
                        out += ' '.repeat(line.length - i);
                        break;
                    }
                }
                if (remaining.startsWith("'''")) {
                    const rest = line.slice(i + 3);
                    const closeInSameLine = rest.indexOf("'''");
                    if (closeInSameLine !== -1) {
                        out += ' '.repeat(3 + closeInSameLine + 3);
                        i += 3 + closeInSameLine + 3;
                        continue;
                    }
                    else {
                        inTripleSingle = true;
                        out += ' '.repeat(line.length - i);
                        break;
                    }
                }
                // Start of single-line string
                if (ch === '"') {
                    inDoubleQ = true;
                    out += ' ';
                    i++;
                    continue;
                }
                if (ch === "'") {
                    inSingleQ = true;
                    out += ' ';
                    i++;
                    continue;
                }
                // Inline comment
                if (ch === '#') {
                    // Rest of line is comment — stop
                    break;
                }
                out += ch;
            }
            else if (inDoubleQ) {
                if (ch === '\\') {
                    out += '  ';
                    i += 2;
                    continue;
                } // escape
                if (ch === '"') {
                    inDoubleQ = false;
                }
                out += ' ';
            }
            else if (inSingleQ) {
                if (ch === '\\') {
                    out += '  ';
                    i += 2;
                    continue;
                }
                if (ch === "'") {
                    inSingleQ = false;
                }
                out += ' ';
            }
            i++;
        }
        result.push(out);
    }
    return result;
}
/**
 * Classify the exception-handling flow of an except block body.
 *
 * Input: stripped lines (comments and strings already neutralized).
 * Returns the strictest applicable classification.
 */
function classifyExceptionFlow(strippedBodyLines, exceptIndent) {
    // Only consider lines that are within the except block's indentation scope
    const blockLines = strippedBodyLines.filter(l => {
        const t = l.trimStart();
        if (t.length === 0)
            return false;
        const indent = l.length - t.length;
        return indent > exceptIndent;
    });
    if (blockLines.length === 0)
        return 'swallow';
    const bodyText = blockLines.join('\n');
    // Detect raise statements — only real Python raise keywords at statement level
    // (not inside strings or comments, already stripped above)
    const RAISE_STMT_RE = /^\s*raise\b/m;
    const hasRaise = RAISE_STMT_RE.test(bodyText);
    // Detect "raise X from e" or "raise NewException(" — transformed rethrow
    const TRANSFORM_RAISE_RE = /^\s*raise\s+\w+\s*(?:\(|from)/m;
    const hasTransformRaise = TRANSFORM_RAISE_RE.test(bodyText);
    // Detect bare "raise" (re-raises current exception)
    const BARE_RAISE_RE = /^\s*raise\s*$/m;
    const hasBareRaise = BARE_RAISE_RE.test(bodyText);
    // Detect conditional raise (raise inside if block at deeper indent)
    const CONDITIONAL_RAISE_RE = /^\s+raise\b/m;
    const hasConditionalRaise = !hasBareRaise && !hasTransformRaise && CONDITIONAL_RAISE_RE.test(bodyText);
    const hasLogging = LOGGING_RE.test(bodyText);
    if (hasBareRaise) {
        // Clean re-raise — not a violation
        return 'partial-rethrow'; // partial because could be log+reraise
    }
    if (hasTransformRaise)
        return 'transformed-rethrow';
    if (hasConditionalRaise)
        return 'partial-rethrow';
    if (!hasRaise && hasLogging)
        return 'log-only';
    if (!hasRaise && !hasLogging)
        return 'swallow';
    // raise present but not bare/transform/conditional — treat as partial
    return 'partial-rethrow';
}
class PY003BroadExceptClause {
    id = 'PY003';
    name = 'Broad except clause swallowing errors';
    policyRef = 'P017';
    severity = 'BLOCKING';
    languages = ['python'];
    description = 'except Exception: blocks that neither re-raise nor log silently swallow all exceptions including system errors.';
    check(filePath, sourceText) {
        try {
            const violations = [];
            const lines = sourceText.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const match = BROAD_EXCEPT_RE.exec(line);
                if (!match)
                    continue;
                const exceptIndent = match[1].length;
                // Collect the raw except block body lines (indented deeper than the except)
                const rawBodyLines = [];
                let j = i + 1;
                while (j < lines.length) {
                    const bodyLine = lines[j];
                    const bodyTrimmed = bodyLine.trimStart();
                    // Empty line — continue collecting
                    if (bodyTrimmed.length === 0) {
                        rawBodyLines.push(bodyLine);
                        j++;
                        continue;
                    }
                    const bodyIndent = bodyLine.length - bodyTrimmed.length;
                    // If indent is less than or equal to the except indent, block ended
                    if (bodyIndent <= exceptIndent)
                        break;
                    rawBodyLines.push(bodyLine);
                    j++;
                }
                if (rawBodyLines.length === 0)
                    continue;
                // ── AST-level analysis: strip comments and strings before checking ──
                const strippedLines = stripCommentsAndStrings(rawBodyLines);
                const flowClass = classifyExceptionFlow(strippedLines, exceptIndent);
                // Only violations: swallow and log-only (log without re-raise)
                // transformed-rethrow and partial-rethrow are handled by the engineer
                if (flowClass === 'partial-rethrow' || flowClass === 'transformed-rethrow') {
                    continue;
                }
                // Bare re-raise check: if bare raise exists in RAW lines (before stripping)
                // this is not a swallow — the stripCommentsAndStrings already handles
                // comment stripping, so we just trust classifyExceptionFlow here.
                if (flowClass !== 'swallow' && flowClass !== 'log-only')
                    continue;
                const nonEmptyNonPass = strippedLines
                    .map(l => l.trim())
                    .filter(l => l.length > 0 && l !== 'pass');
                const confidence = flowClass === 'swallow'
                    ? (nonEmptyNonPass.length === 0 ? 0.97 : 0.88)
                    : 0.82; // log-only
                const evidence = line.slice(0, 120);
                violations.push({
                    ruleId: this.id,
                    ruleName: this.name,
                    policyRef: this.policyRef,
                    severity: this.severity,
                    filePath,
                    line: i + 1,
                    column: exceptIndent + 1,
                    evidence: `${evidence} [flow:${flowClass}]`,
                    operationalRisk: `except Exception: block classified as '${flowClass}'. ` +
                        'Catches ALL exceptions (including SystemExit, KeyboardInterrupt, MemoryError) without ' +
                        're-raising. Silent failures make debugging impossible and hide operational issues.',
                    remediation: 'Either re-raise after handling: `except Exception as e: logger.error(e); raise` ' +
                        'or narrow the exception type. Avoid bare `except Exception` without at minimum logging.',
                    determinism: 'deterministic-structural',
                    confidence,
                    language: 'python',
                });
            }
            return violations;
        }
        catch {
            return [];
        }
    }
}
exports.PY003BroadExceptClause = PY003BroadExceptClause;
//# sourceMappingURL=PY003-broad-except-clause.js.map