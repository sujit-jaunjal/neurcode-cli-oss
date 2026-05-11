"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PY004SwallowedAsyncException = void 0;
// Detect asyncio.gather( calls
const GATHER_RE = /asyncio\.gather\s*\(/g;
// return_exceptions=True present
const RETURN_EXCEPTIONS_RE = /return_exceptions\s*=\s*True/;
// Detect: await task inside try blocks where except only logs (no re-raise)
const AWAIT_IN_TRY_RE = /\bawait\s+\w+/;
const EXCEPT_RE = /^\s*except\b/;
const RERAISE_RE = /\braise\b/;
const LOGGING_RE = /\b(?:log|logger|logging|error|warn|report|track|capture|print)\s*[\.(]/i;
class PY004SwallowedAsyncException {
    id = 'PY004';
    name = 'Swallowed asyncio exception';
    policyRef = 'P018';
    severity = 'ADVISORY';
    languages = ['python'];
    description = 'asyncio.gather() without return_exceptions=True raises on first failure, silently cancelling other tasks. ' +
        'Also detects try/await blocks where the except only logs without re-raising.';
    check(filePath, sourceText) {
        try {
            const violations = [];
            const lines = sourceText.split('\n');
            // --- Pattern 1: asyncio.gather( without return_exceptions=True ---
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (!line.includes('asyncio.gather('))
                    continue;
                // Collect the full gather call (may span multiple lines)
                let gatherCall = line;
                let j = i + 1;
                // Scan up to 10 lines ahead to find closing )
                while (j < Math.min(i + 10, lines.length) && !gatherCall.includes(')')) {
                    gatherCall += '\n' + lines[j];
                    j++;
                }
                if (RETURN_EXCEPTIONS_RE.test(gatherCall))
                    continue;
                // Check if it's wrapped in a try block (look backwards up to 5 lines)
                let insideTry = false;
                for (let k = Math.max(0, i - 5); k < i; k++) {
                    if (/^\s*try\s*:/.test(lines[k])) {
                        insideTry = true;
                        break;
                    }
                }
                if (insideTry)
                    continue;
                const evidence = line.slice(0, 120);
                violations.push({
                    ruleId: this.id,
                    ruleName: this.name,
                    policyRef: this.policyRef,
                    severity: this.severity,
                    filePath,
                    line: i + 1,
                    column: line.indexOf('asyncio.gather') + 1,
                    evidence,
                    operationalRisk: 'asyncio.gather() without return_exceptions=True raises on the first task failure, ' +
                        'but remaining tasks continue running as orphans. Their results and exceptions are lost, ' +
                        'and resources they hold remain locked.',
                    remediation: 'Use `results = await asyncio.gather(*tasks, return_exceptions=True)` then inspect ' +
                        'results: `errors = [r for r in results if isinstance(r, BaseException)]`.',
                    determinism: 'deterministic-structural',
                    confidence: 0.75,
                    language: 'python',
                });
            }
            // --- Pattern 2: await inside try/except where except only logs, no re-raise ---
            let i = 0;
            while (i < lines.length) {
                const line = lines[i];
                const trimmed = line.trimStart();
                if (!/^\s*try\s*:/.test(line)) {
                    i++;
                    continue;
                }
                const tryIndent = line.length - trimmed.length;
                // Collect try body
                const tryBody = [];
                let j = i + 1;
                while (j < lines.length) {
                    const bl = lines[j];
                    const bt = bl.trimStart();
                    if (bt.length === 0) {
                        j++;
                        continue;
                    }
                    const bi = bl.length - bt.length;
                    if (bi <= tryIndent && bt.length > 0)
                        break;
                    tryBody.push(bl);
                    j++;
                }
                // Does the try body contain an await?
                if (!AWAIT_IN_TRY_RE.test(tryBody.join('\n'))) {
                    i = j;
                    continue;
                }
                // Now look for except block
                while (j < lines.length) {
                    const el = lines[j];
                    const et = el.trimStart();
                    if (et.length === 0) {
                        j++;
                        continue;
                    }
                    const ei = el.length - et.length;
                    if (ei < tryIndent)
                        break;
                    if (!EXCEPT_RE.test(el)) {
                        j++;
                        continue;
                    }
                    // Found an except — collect its body
                    const exceptBody = [];
                    let k = j + 1;
                    while (k < lines.length) {
                        const kb = lines[k];
                        const kt = kb.trimStart();
                        if (kt.length === 0) {
                            k++;
                            continue;
                        }
                        const ki = kb.length - kt.length;
                        if (ki <= ei && kt.length > 0)
                            break;
                        exceptBody.push(kb);
                        k++;
                    }
                    const exceptText = exceptBody.join('\n');
                    if (!RERAISE_RE.test(exceptText) && LOGGING_RE.test(exceptText)) {
                        // Only logs, no re-raise — flag it
                        const evidence = el.slice(0, 120);
                        violations.push({
                            ruleId: this.id,
                            ruleName: this.name,
                            policyRef: this.policyRef,
                            severity: this.severity,
                            filePath,
                            line: j + 1,
                            column: ei + 1,
                            evidence,
                            operationalRisk: 'Exception from an awaited task is caught, logged, but not re-raised. ' +
                                'The caller receives a successful return instead of an error, ' +
                                'causing silent data inconsistency.',
                            remediation: 'Re-raise after logging: `except Exception as e: logger.error(e); raise` ' +
                                'or let the exception propagate to a top-level handler.',
                            determinism: 'heuristic-advisory',
                            confidence: 0.75,
                            language: 'python',
                        });
                    }
                    j = k;
                }
                i = j;
            }
            return violations;
        }
        catch {
            return [];
        }
    }
}
exports.PY004SwallowedAsyncException = PY004SwallowedAsyncException;
//# sourceMappingURL=PY004-swallowed-async-exception.js.map