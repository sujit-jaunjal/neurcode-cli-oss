"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PY006BlockingIOInAsync = void 0;
// Matches `async def funcname(`
const ASYNC_DEF_RE = /^(\s*)async\s+def\s+\w+\s*\(/;
// Matches nested sync `def` (not async def)
const SYNC_DEF_RE = /^\s+def\s+\w+\s*\(/;
// Blocking patterns to detect inside async function bodies
const BLOCKING_PATTERNS = [
    { re: /\btime\.sleep\s*\(/, label: 'time.sleep()' },
    { re: /\brequests\.get\s*\(/, label: 'requests.get()' },
    { re: /\brequests\.post\s*\(/, label: 'requests.post()' },
    { re: /\brequests\.request\s*\(/, label: 'requests.request()' },
    { re: /\bsubprocess\.run\s*\(/, label: 'subprocess.run()' },
    { re: /\bsubprocess\.call\s*\(/, label: 'subprocess.call()' },
    // open( not preceded by aiofiles.open or async with
    { re: /(?<!aiofiles\.)(?<!\bwith\s)\bopen\s*\(/, label: 'open()' },
];
function getIndent(line) {
    return line.length - line.trimStart().length;
}
class PY006BlockingIOInAsync {
    id = 'PY006';
    name = 'Blocking I/O call inside async def';
    policyRef = 'PY006';
    severity = 'BLOCKING';
    languages = ['python'];
    description = 'Blocking I/O (time.sleep, requests, open, subprocess) inside an async def function freezes the event loop.';
    check(filePath, sourceText) {
        try {
            const violations = [];
            // Normalize line endings
            const lines = sourceText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            // Does the file import aiofiles?
            const importsAiofiles = /\baiofiles\b/.test(sourceText);
            let i = 0;
            while (i < lines.length) {
                const line = lines[i];
                const asyncMatch = ASYNC_DEF_RE.exec(line);
                if (!asyncMatch) {
                    i++;
                    continue;
                }
                const funcIndent = asyncMatch[1].length;
                const bodyStart = i + 1;
                i++;
                // Collect the function body: lines with indent > funcIndent
                while (i < lines.length) {
                    const bl = lines[i];
                    const trimmed = bl.trimStart();
                    // Blank lines are part of the body
                    if (trimmed.length === 0) {
                        i++;
                        continue;
                    }
                    const lineIndent = getIndent(bl);
                    // If we're back at or before the function's indent, we've left the body
                    if (lineIndent <= funcIndent)
                        break;
                    // Skip comment lines
                    if (trimmed.startsWith('#')) {
                        i++;
                        continue;
                    }
                    // Skip lines with noqa
                    if (/\bnoqa\b/.test(bl)) {
                        i++;
                        continue;
                    }
                    // Skip lines that are inside a nested sync def
                    // (we only care about the top-level async body, not nested sync helpers)
                    if (SYNC_DEF_RE.test(bl)) {
                        // Skip the entire nested sync function body
                        const nestedIndent = lineIndent;
                        i++;
                        while (i < lines.length) {
                            const nb = lines[i];
                            const nt = nb.trimStart();
                            if (nt.length === 0) {
                                i++;
                                continue;
                            }
                            if (getIndent(nb) <= nestedIndent)
                                break;
                            i++;
                        }
                        continue;
                    }
                    // Check blocking patterns
                    for (const { re, label } of BLOCKING_PATTERNS) {
                        // If it's an open() hit and aiofiles is imported, skip
                        if (label === 'open()' && importsAiofiles)
                            continue;
                        if (re.test(bl)) {
                            violations.push({
                                ruleId: this.id,
                                ruleName: this.name,
                                policyRef: this.policyRef,
                                severity: this.severity,
                                filePath,
                                line: i + 1,
                                column: 1,
                                evidence: bl.slice(0, 120),
                                operationalRisk: `\`${label}\` inside an async function blocks the entire event loop thread. ` +
                                    'All other coroutines are frozen for the duration of the call. ' +
                                    'Under load, a single blocking call can cause 100ms+ latency spikes across all concurrent requests.',
                                remediation: 'Replace time.sleep(n) with `await asyncio.sleep(n)`, ' +
                                    'requests.get() with `await aiohttp.ClientSession().get()`, ' +
                                    'open() with `async with aiofiles.open()`, ' +
                                    'subprocess.run() with `await asyncio.create_subprocess_exec()`.',
                                determinism: 'heuristic-advisory',
                                confidence: 0.82,
                                language: 'python',
                            });
                            break; // one violation per line
                        }
                    }
                    i++;
                }
                void bodyStart; // suppress unused warning
            }
            return violations;
        }
        catch {
            return [];
        }
    }
}
exports.PY006BlockingIOInAsync = PY006BlockingIOInAsync;
//# sourceMappingURL=PY006-blocking-io-in-async.js.map