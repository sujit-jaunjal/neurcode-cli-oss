"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PY008CeleryTaskWithoutRetry = void 0;
// Matches Celery task decorators
const CELERY_DECORATOR_RE = /^\s*@(?:\w+\.)?(?:app\.task|celery\.task|shared_task)\s*[\(\n]/;
const CELERY_DECORATOR_INLINE_RE = /^\s*@(?:\w+\.)?(?:app\.task|celery\.task|shared_task)\s*\(/;
// Retry configuration keywords inside the decorator
const RETRY_CONFIG_RE = /(?:max_retries|retry_backoff|autoretry_for|bind\s*=\s*True)/;
// ignore_result=True — fire-and-forget, valid without retry
const IGNORE_RESULT_RE = /ignore_result\s*=\s*True/;
// A raise statement inside the function body
const RAISE_RE = /\braise\b/;
// self.retry( call — manual retry in bind=True task
const SELF_RETRY_RE = /\bself\.retry\s*\(/;
function getIndent(line) {
    return line.length - line.trimStart().length;
}
/**
 * Collect the decorator text (potentially multi-line) starting at decoratorLine.
 * Returns the full decorator string and the line index where the decorator ends.
 */
function collectDecorator(lines, decoratorLine) {
    let text = lines[decoratorLine];
    let depth = 0;
    for (const ch of lines[decoratorLine]) {
        if (ch === '(')
            depth++;
        else if (ch === ')')
            depth--;
    }
    let j = decoratorLine + 1;
    while (depth > 0 && j < lines.length) {
        text += '\n' + lines[j];
        for (const ch of lines[j]) {
            if (ch === '(')
                depth++;
            else if (ch === ')')
                depth--;
        }
        j++;
    }
    return { text, endLine: j - 1 };
}
class PY008CeleryTaskWithoutRetry {
    id = 'PY008';
    name = 'Celery task without retry configuration';
    policyRef = 'PY008';
    severity = 'ADVISORY';
    languages = ['python'];
    description = 'Celery task functions that can raise exceptions but have no retry configuration silently drop jobs on transient failures.';
    check(filePath, sourceText) {
        try {
            const violations = [];
            // Normalize line endings
            const lines = sourceText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            let i = 0;
            while (i < lines.length) {
                const line = lines[i];
                // Detect Celery decorator
                const isDecorator = CELERY_DECORATOR_RE.test(line) || CELERY_DECORATOR_INLINE_RE.test(line);
                if (!isDecorator) {
                    i++;
                    continue;
                }
                const decoratorStartLine = i;
                // Collect full decorator text (handles multi-line)
                const { text: decoratorText, endLine: decoratorEnd } = collectDecorator(lines, i);
                // Check for retry config
                const hasRetryConfig = RETRY_CONFIG_RE.test(decoratorText);
                const hasIgnoreResult = IGNORE_RESULT_RE.test(decoratorText);
                // Find the function definition line after decorator
                let funcDefLine = -1;
                let j = decoratorEnd + 1;
                while (j < Math.min(decoratorEnd + 6, lines.length)) {
                    const l = lines[j].trimStart();
                    if (/^(?:async\s+)?def\s+\w+\s*\(/.test(l)) {
                        funcDefLine = j;
                        break;
                    }
                    if (l.length > 0 && !l.startsWith('@') && !l.startsWith('#'))
                        break;
                    j++;
                }
                if (funcDefLine === -1) {
                    i = j;
                    continue;
                }
                if (hasRetryConfig) {
                    // Already has retry config — no violation
                    i = funcDefLine + 1;
                    continue;
                }
                // Collect function body
                const funcIndent = getIndent(lines[funcDefLine]);
                let bodyHasRaise = false;
                let bodyHasSelfRetry = false;
                let k = funcDefLine + 1;
                while (k < lines.length) {
                    const bl = lines[k];
                    const bt = bl.trimStart();
                    if (bt.length === 0) {
                        k++;
                        continue;
                    }
                    const bi = getIndent(bl);
                    if (bi <= funcIndent)
                        break;
                    if (RAISE_RE.test(bl))
                        bodyHasRaise = true;
                    if (SELF_RETRY_RE.test(bl))
                        bodyHasSelfRetry = true;
                    k++;
                }
                // If fire-and-forget (ignore_result=True) and no raise → no violation
                if (hasIgnoreResult && !bodyHasRaise) {
                    i = k;
                    continue;
                }
                // If uses self.retry() manually → no violation
                if (bodyHasSelfRetry) {
                    i = k;
                    continue;
                }
                // If function has potential raises and no retry config → flag it
                if (bodyHasRaise) {
                    violations.push({
                        ruleId: this.id,
                        ruleName: this.name,
                        policyRef: this.policyRef,
                        severity: this.severity,
                        filePath,
                        line: decoratorStartLine + 1,
                        column: 1,
                        evidence: lines[decoratorStartLine].slice(0, 120),
                        operationalRisk: 'A transient failure (network timeout, DB connection error) in a Celery task without retry configuration ' +
                            'permanently drops the job. The message is lost without processing, causing data loss or inconsistent state.',
                        remediation: 'Add `autoretry_for=(Exception,), max_retries=3, retry_backoff=True` to the decorator, ' +
                            'or use `self.retry(exc=exc, countdown=2**self.request.retries)` in the exception handler.',
                        determinism: 'heuristic-advisory',
                        confidence: 0.75,
                        language: 'python',
                    });
                }
                i = k;
            }
            return violations;
        }
        catch {
            return [];
        }
    }
}
exports.PY008CeleryTaskWithoutRetry = PY008CeleryTaskWithoutRetry;
//# sourceMappingURL=PY008-celery-task-without-retry.js.map