"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PY010LeakedAiohttpSession = void 0;
// Matches bare assignment: session = aiohttp.ClientSession() or session = ClientSession()
// Captures variable name and whether it's aiohttp-qualified
const SESSION_ASSIGN_RE = /^(\s*)(\w+)\s*=\s*(?:aiohttp\.)?ClientSession\s*\(/;
// Matches correct async with usage
const ASYNC_WITH_SESSION_RE = /^\s*async\s+with\s+(?:aiohttp\.)?ClientSession\s*\(/;
// Matches await <varname>.close() — shutdown hook pattern
const AWAIT_CLOSE_RE = /\bawait\s+\w+\s*\.\s*close\s*\(\)/;
class PY010LeakedAiohttpSession {
    id = 'PY010';
    name = 'aiohttp.ClientSession created without context manager';
    policyRef = 'PY010';
    severity = 'BLOCKING';
    languages = ['python'];
    description = 'aiohttp.ClientSession() assigned to a variable without `async with` leaks TCP connection pools and file descriptors.';
    check(filePath, sourceText) {
        try {
            const violations = [];
            // Normalize line endings
            const normalizedText = sourceText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const lines = normalizedText.split('\n');
            // Pre-scan: does the file contain await <something>.close() anywhere?
            // This handles the module-level singleton pattern with a shutdown hook.
            const fileHasAwaitClose = AWAIT_CLOSE_RE.test(normalizedText);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trimStart();
                // Skip comment lines
                if (trimmed.startsWith('#'))
                    continue;
                // Skip noqa
                if (/\bnoqa\b/.test(line))
                    continue;
                // Skip correct async with usage
                if (ASYNC_WITH_SESSION_RE.test(line))
                    continue;
                const match = SESSION_ASSIGN_RE.exec(line);
                if (!match)
                    continue;
                const varName = match[2];
                // Check if the specific variable has a close() call anywhere in the file
                const varCloseRe = new RegExp(`\\bawait\\s+${varName}\\s*\\.\\s*close\\s*\\(\\)`);
                const varHasClose = varCloseRe.test(normalizedText);
                // If this variable is closed somewhere (shutdown hook) — it's a managed singleton, skip
                if (varHasClose)
                    continue;
                // If the file has generic await <x>.close() and this is likely a module-level singleton
                // Heuristic: if the assignment is at module level (indent == 0) and file has await close → skip
                const assignIndent = match[1].length;
                if (assignIndent === 0 && fileHasAwaitClose)
                    continue;
                violations.push({
                    ruleId: this.id,
                    ruleName: this.name,
                    policyRef: this.policyRef,
                    severity: this.severity,
                    filePath,
                    line: i + 1,
                    column: 1,
                    evidence: line.slice(0, 120),
                    operationalRisk: 'Each unclosed aiohttp session leaks a TCP connection pool and an underlying connector. ' +
                        'In services that create sessions per-request, this exhausts file descriptors within minutes under load.',
                    remediation: 'Use `async with aiohttp.ClientSession() as session:` for request-scoped sessions. ' +
                        'For long-lived sessions, create once at startup and call `await session.close()` in the app shutdown handler.',
                    determinism: 'heuristic-advisory',
                    confidence: 0.85,
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
exports.PY010LeakedAiohttpSession = PY010LeakedAiohttpSession;
//# sourceMappingURL=PY010-leaked-aiohttp-session.js.map