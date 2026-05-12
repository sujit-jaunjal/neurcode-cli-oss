"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PY012AsyncioRunMisuse = void 0;
/**
 * PY012 — asyncio.run() Misuse Inside Async Context
 *
 * asyncio.run() creates a new event loop and runs until the coroutine completes.
 * Calling it inside an already-running event loop raises RuntimeError.
 *
 * BLOCKING: causes RuntimeError at startup in FastAPI, Airflow, Jupyter, and
 * any other async runtime environment.
 */
const ASYNC_DEF_RE = /^(\s*)async\s+def\s+\w+\s*\(/;
const ASYNCIO_RUN_RE = /\basyncio\.run\s*\(/;
function getIndent(line) {
    return line.length - line.trimStart().length;
}
class PY012AsyncioRunMisuse {
    id = 'PY012';
    name = 'asyncio.run() called inside async def';
    policyRef = 'PY012';
    severity = 'BLOCKING';
    languages = ['python'];
    description = 'asyncio.run() inside an async def raises RuntimeError: "This event loop is already running." ' +
        'Use await coroutine() or asyncio.create_task() instead.';
    check(filePath, sourceText) {
        try {
            const violations = [];
            const lines = sourceText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            const asyncScopes = [];
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trimStart();
                // Track async def entries
                const asyncMatch = ASYNC_DEF_RE.exec(line);
                if (asyncMatch) {
                    asyncScopes.push({ startLine: i, indent: asyncMatch[1].length });
                }
                // Pop scopes that have ended
                if (asyncScopes.length > 0 && trimmed.length > 0 && !trimmed.startsWith('#')) {
                    const currentIndent = getIndent(line);
                    while (asyncScopes.length > 0 &&
                        currentIndent <= asyncScopes[asyncScopes.length - 1].indent &&
                        i > asyncScopes[asyncScopes.length - 1].startLine) {
                        if (/^(def |async def |class |@|if |for |while |with |try:|except|finally:|else:|elif )/.test(trimmed)) {
                            asyncScopes.pop();
                        }
                        else {
                            break;
                        }
                    }
                }
                // Detect asyncio.run() inside an async scope
                if (asyncScopes.length > 0 && ASYNCIO_RUN_RE.test(line)) {
                    const scope = asyncScopes[asyncScopes.length - 1];
                    violations.push({
                        ruleId: this.id,
                        ruleName: this.name,
                        policyRef: this.policyRef,
                        severity: this.severity,
                        filePath,
                        line: i + 1,
                        column: line.indexOf('asyncio.run') + 1,
                        evidence: line.trim(),
                        operationalRisk: `asyncio.run() called inside async def (started at line ${scope.startLine + 1}). ` +
                            'Raises RuntimeError: "This event loop is already running" in FastAPI, Airflow, and Jupyter.',
                        remediation: 'Replace asyncio.run(coro()) with: await coro()\n' +
                            'Or if called from module-level code, restructure to avoid calling from inside an async function.',
                        determinism: 'deterministic-structural',
                        confidence: 0.85,
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
exports.PY012AsyncioRunMisuse = PY012AsyncioRunMisuse;
//# sourceMappingURL=PY012-asyncio-run-misuse.js.map