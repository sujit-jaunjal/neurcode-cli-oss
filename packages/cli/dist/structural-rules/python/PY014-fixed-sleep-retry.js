"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PY014FixedSleepRetry = void 0;
/**
 * PY014 — Fixed-Sleep Retry Without Exponential Backoff
 *
 * Retry loops that use a constant time.sleep() delay cause thundering herd
 * against downstream services when many workers fail simultaneously.
 *
 * Detection: for/while loop + except clause + time.sleep(constant literal)
 * with no exponential calculation visible nearby.
 *
 * BLOCKING: fixed retry sleep = synchronized retry storms on partial outage.
 */
const LOOP_START_RE = /^(\s*)(?:for\s+\w+|while\s+)/;
const EXCEPT_RE = /^\s*except\b/;
const FIXED_SLEEP_RE = /\btime\.sleep\s*\(\s*(\d+(?:\.\d+)?)\s*\)/;
const EXPONENTIAL_MARKERS = [
    /\*\*\s*\d/,
    /\*=\s*2/,
    /\bmin\s*\(/,
    /\brandom\.uniform/,
    /\bjitter\b/,
    /\bbackoff\b/,
    /\bexponential\b/,
    /sleep\s*\*\s*\d/,
    /\battempt\s*\*/,
    /\* attempt/,
];
function hasExponentialNearby(lines, center, radius = 12) {
    const start = Math.max(0, center - radius);
    const end = Math.min(lines.length - 1, center + radius);
    for (let i = start; i <= end; i++) {
        for (const re of EXPONENTIAL_MARKERS) {
            if (re.test(lines[i]))
                return true;
        }
    }
    return false;
}
function getIndent(line) {
    return line.length - line.trimStart().length;
}
class PY014FixedSleepRetry {
    id = 'PY014';
    name = 'Fixed-sleep retry without exponential backoff';
    policyRef = 'PY014';
    severity = 'BLOCKING';
    languages = ['python'];
    description = 'time.sleep() with a constant value inside a retry loop creates thundering herd. ' +
        'Use exponential backoff with jitter.';
    check(filePath, sourceText) {
        try {
            const violations = [];
            const lines = sourceText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            const loopScopes = [];
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trimStart();
                // Track loop starts
                const loopMatch = LOOP_START_RE.exec(line);
                if (loopMatch) {
                    loopScopes.push({ startLine: i, indent: loopMatch[1].length, hasExcept: false });
                }
                // Pop exited scopes
                if (loopScopes.length > 0 && trimmed.length > 0 && !trimmed.startsWith('#')) {
                    const currentIndent = getIndent(line);
                    while (loopScopes.length > 0 &&
                        currentIndent < loopScopes[loopScopes.length - 1].indent &&
                        i > loopScopes[loopScopes.length - 1].startLine) {
                        loopScopes.pop();
                    }
                }
                // Mark loop scope as containing an except
                if (EXCEPT_RE.test(line) && loopScopes.length > 0) {
                    loopScopes[loopScopes.length - 1].hasExcept = true;
                }
                // Detect fixed sleep inside retry loop
                const sleepMatch = FIXED_SLEEP_RE.exec(line);
                if (sleepMatch && loopScopes.length > 0) {
                    const scope = loopScopes[loopScopes.length - 1];
                    if (scope.hasExcept && !hasExponentialNearby(lines, i)) {
                        const sleepVal = sleepMatch[1];
                        violations.push({
                            ruleId: this.id,
                            ruleName: this.name,
                            policyRef: this.policyRef,
                            severity: this.severity,
                            filePath,
                            line: i + 1,
                            column: line.indexOf('time.sleep') + 1,
                            evidence: line.trim(),
                            operationalRisk: `Fixed retry sleep time.sleep(${sleepVal}) inside retry loop (loop at line ${scope.startLine + 1}). ` +
                                'Under partial outage, all workers retry simultaneously after the same delay, ' +
                                'creating a thundering herd that overwhelms the recovering service.',
                            remediation: `Replace with exponential backoff:\n` +
                                `  import random\n` +
                                `  sleep_time = min(${sleepVal} * (2 ** attempt) + random.uniform(0, 1), max_sleep)\n` +
                                `  time.sleep(sleep_time)`,
                            determinism: 'deterministic-structural',
                            confidence: 0.82,
                            language: 'python',
                        });
                    }
                }
            }
            return violations;
        }
        catch {
            return [];
        }
    }
}
exports.PY014FixedSleepRetry = PY014FixedSleepRetry;
//# sourceMappingURL=PY014-fixed-sleep-retry.js.map