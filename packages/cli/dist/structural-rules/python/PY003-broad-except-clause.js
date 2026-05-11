"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PY003BroadExceptClause = void 0;
// Matches: except Exception: or except Exception as e:
const BROAD_EXCEPT_RE = /^(\s*)except\s+Exception(\s+as\s+\w+)?\s*:/;
// Logging/reporting call patterns
const LOGGING_RE = /\b(?:log|logger|logging|error|warn|warning|report|track|capture|sentry|bugsnag|rollbar|print)\s*[\.(]/i;
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
                // Collect the except block body (lines more indented than the except statement)
                const bodyLines = [];
                let j = i + 1;
                while (j < lines.length) {
                    const bodyLine = lines[j];
                    const bodyTrimmed = bodyLine.trimStart();
                    // Empty line — continue collecting
                    if (bodyTrimmed.length === 0) {
                        j++;
                        continue;
                    }
                    const bodyIndent = bodyLine.length - bodyLine.trimStart().length;
                    // If indent is less than or equal to the except indent, block ended
                    if (bodyIndent <= exceptIndent)
                        break;
                    bodyLines.push(bodyLine);
                    j++;
                }
                if (bodyLines.length === 0)
                    continue;
                const bodyText = bodyLines.join('\n');
                // Check for re-raise
                const hasReraise = /^\s*raise\b/.test(bodyText) || /\braise\b/.test(bodyText);
                if (hasReraise)
                    continue;
                // Check for logging
                if (LOGGING_RE.test(bodyText))
                    continue;
                // Skip if body only contains pass
                const nonEmpty = bodyLines
                    .map(l => l.trim())
                    .filter(l => l.length > 0 && l !== 'pass' && !l.startsWith('#'));
                // If the body is just `pass` or empty meaningful statements, it's swallowing
                // If it has actual work (return something, set variable), still flag it
                const evidence = line.slice(0, 120);
                violations.push({
                    ruleId: this.id,
                    ruleName: this.name,
                    policyRef: this.policyRef,
                    severity: this.severity,
                    filePath,
                    line: i + 1,
                    column: exceptIndent + 1,
                    evidence,
                    operationalRisk: 'Catches ALL exceptions (including SystemExit, KeyboardInterrupt, MemoryError) without ' +
                        'logging or re-raising. Silent failures make debugging impossible and hide operational issues.',
                    remediation: 'Either re-raise after handling: `except Exception as e: logger.error(e); raise` ' +
                        'or narrow the exception type. Avoid bare `except Exception` without at minimum logging.',
                    determinism: 'deterministic-structural',
                    confidence: nonEmpty.length === 0 ? 0.95 : 0.85,
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