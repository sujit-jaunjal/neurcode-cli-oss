"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PY001AsyncioTaskWithoutCancel = void 0;
function getLineNumber(lines, index) {
    return index + 1;
}
class PY001AsyncioTaskWithoutCancel {
    id = 'PY001';
    name = 'asyncio.create_task without cancel handle';
    policyRef = 'P015';
    severity = 'ADVISORY';
    languages = ['python'];
    description = 'asyncio.create_task() whose return value is not stored cannot be cancelled, causing orphaned tasks on shutdown.';
    check(filePath, sourceText) {
        try {
            const violations = [];
            const lines = sourceText.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trimStart();
                // Check if line contains asyncio.create_task(
                if (!trimmed.includes('asyncio.create_task('))
                    continue;
                // Skip if the line starts with an assignment: varname = asyncio.create_task(
                // or self.xxx = asyncio.create_task(
                if (/^\s*\w[\w.]*\s*=\s*asyncio\.create_task\s*\(/.test(line))
                    continue;
                // Also skip augmented assignment
                if (/^\s*\w[\w.]*\s*\+=/.test(line))
                    continue;
                // Skip if appended to a list: tasks.append(asyncio.create_task(
                if (/\.append\s*\(\s*asyncio\.create_task\s*\(/.test(line))
                    continue;
                // Skip if stored in list literal context: [asyncio.create_task(...)]
                // (heuristic: line contains = [...asyncio)
                if (/=\s*\[.*asyncio\.create_task/.test(line))
                    continue;
                const evidence = line.slice(0, 120);
                violations.push({
                    ruleId: this.id,
                    ruleName: this.name,
                    policyRef: this.policyRef,
                    severity: this.severity,
                    filePath,
                    line: getLineNumber(lines, i),
                    column: line.indexOf('asyncio.create_task') + 1,
                    evidence,
                    operationalRisk: 'Tasks whose handles are discarded cannot be awaited or cancelled. ' +
                        'On application shutdown, these tasks are abandoned mid-execution, ' +
                        'potentially leaving resources locked or writes incomplete.',
                    remediation: 'Store the task handle: `task = asyncio.create_task(...)` and cancel it on cleanup: ' +
                        '`task.cancel(); await asyncio.gather(task, return_exceptions=True)`.',
                    determinism: 'deterministic-structural',
                    confidence: 0.80,
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
exports.PY001AsyncioTaskWithoutCancel = PY001AsyncioTaskWithoutCancel;
//# sourceMappingURL=PY001-asyncio-task-without-cancel.js.map