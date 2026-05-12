"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PY013MutableDefaultArg = void 0;
/**
 * PY013 — Mutable Default Argument
 *
 * Python function default arguments are evaluated ONCE at function definition
 * time. Using mutable objects (dict, list, set) as defaults creates a shared
 * object across all calls. Classic Python gotcha reliably reproduced by LLMs.
 *
 * ADVISORY: correctness bug but not immediately fatal.
 */
const PARAM_MUTABLE_RE = /(?::\s*\w+(?:\[.*?\])?\s*)?=\s*(\{\}|\[\]|set\s*\(\s*\))/;
const DEF_RE = /^(\s*)(?:async\s+)?def\s+\w+\s*\(/;
class PY013MutableDefaultArg {
    id = 'PY013';
    name = 'Mutable default argument in function definition';
    policyRef = 'PY013';
    severity = 'ADVISORY';
    languages = ['python'];
    description = 'Mutable default arguments ({}, [], set()) are shared across all calls. ' +
        'Use None as default and initialize inside the function body.';
    check(filePath, sourceText) {
        try {
            const violations = [];
            const lines = sourceText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (!DEF_RE.test(line))
                    continue;
                // Collect full signature (may span multiple lines)
                let sig = line;
                if (!sig.includes(')')) {
                    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
                        sig += ' ' + lines[j];
                        if (lines[j].includes(')'))
                            break;
                    }
                }
                const mutableMatch = PARAM_MUTABLE_RE.exec(sig);
                if (mutableMatch) {
                    const defaultVal = mutableMatch[1];
                    const label = defaultVal === '{}' ? 'dict {}' :
                        defaultVal === '[]' ? 'list []' :
                            'set()';
                    violations.push({
                        ruleId: this.id,
                        ruleName: this.name,
                        policyRef: this.policyRef,
                        severity: this.severity,
                        filePath,
                        line: i + 1,
                        column: line.indexOf('def') + 1,
                        evidence: line.trim(),
                        operationalRisk: `Mutable default argument (${label}) is shared across all calls to this function. ` +
                            'Mutations in one call persist to subsequent calls, causing unpredictable behavior.',
                        remediation: `Use None as default: def f(x=None):\\n    x = x or ${defaultVal === '[]' ? '[]' : '{}'}\n` +
                            'This ensures each call gets a fresh mutable object.',
                        determinism: 'deterministic-structural',
                        confidence: 0.92,
                        language: 'python',
                    });
                }
            }
            return violations;
        }
        catch {
            return [];
        }
    }
}
exports.PY013MutableDefaultArg = PY013MutableDefaultArg;
//# sourceMappingURL=PY013-mutable-default-arg.js.map