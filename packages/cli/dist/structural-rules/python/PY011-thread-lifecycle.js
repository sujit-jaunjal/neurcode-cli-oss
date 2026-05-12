"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PY011ThreadLifecycle = void 0;
/**
 * PY011 — Thread Lifecycle Governance
 *
 * Detects threading.Thread() usage without daemon=True and/or without
 * a stored reference for later join/stop. In long-running services (e.g.,
 * Airflow scheduler, API workers), non-daemon threads prevent graceful
 * shutdown under SIGTERM. Detached thread references cannot be joined,
 * making stop() semantically unreliable.
 *
 * BLOCKING: non-daemon threads in service code cause zombie accumulation
 * across pod restarts in Kubernetes environments.
 */
const THREAD_CREATE_RE = /\bthreading\.Thread\s*\(/;
const DAEMON_TRUE_RE = /\bdaemon\s*=\s*True\b/;
const THREAD_INLINE_START_RE = /\bthreading\.Thread\s*\(.*\)\s*\.start\s*\(\)/;
class PY011ThreadLifecycle {
    id = 'PY011';
    name = 'Thread created without daemon=True or without stored reference';
    policyRef = 'PY011';
    severity = 'BLOCKING';
    languages = ['python'];
    description = 'threading.Thread() without daemon=True prevents graceful shutdown under SIGTERM. ' +
        'Threads created without storing the reference cannot be joined or stopped.';
    check(filePath, sourceText) {
        try {
            const violations = [];
            const lines = sourceText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (!THREAD_CREATE_RE.test(line))
                    continue;
                // Inline .start() — reference immediately lost
                if (THREAD_INLINE_START_RE.test(line)) {
                    violations.push({
                        ruleId: this.id,
                        ruleName: this.name,
                        policyRef: this.policyRef,
                        severity: this.severity,
                        filePath,
                        line: i + 1,
                        column: line.indexOf('threading.Thread') + 1,
                        evidence: line.trim(),
                        operationalRisk: 'Thread started inline without storing reference: cannot be joined or stopped. ' +
                            'Under K8s SIGTERM, this thread becomes a zombie blocking clean shutdown.',
                        remediation: 'Store the thread reference: self._thread = threading.Thread(..., daemon=True)\n' +
                            'Then call self._thread.join(timeout=5) in your stop/cleanup method.',
                        determinism: 'deterministic-structural',
                        confidence: 0.88,
                        language: 'python',
                    });
                    continue;
                }
                // Check if daemon=True appears within the next 8 lines
                const searchAhead = Math.min(i + 8, lines.length);
                let hasDaemon = DAEMON_TRUE_RE.test(line);
                if (!hasDaemon) {
                    for (let j = i + 1; j < searchAhead; j++) {
                        if (DAEMON_TRUE_RE.test(lines[j])) {
                            hasDaemon = true;
                            break;
                        }
                        if (/\)\s*$/.test(lines[j].trimEnd()))
                            break;
                    }
                }
                if (!hasDaemon) {
                    violations.push({
                        ruleId: this.id,
                        ruleName: this.name,
                        policyRef: this.policyRef,
                        severity: this.severity,
                        filePath,
                        line: i + 1,
                        column: line.indexOf('threading.Thread') + 1,
                        evidence: line.trim(),
                        operationalRisk: 'Non-daemon thread blocks process exit under SIGTERM. ' +
                            'In Kubernetes, pods will hang at termination until the thread finishes naturally.',
                        remediation: 'Add daemon=True: threading.Thread(target=..., daemon=True)\n' +
                            'Store the reference and call .join(timeout=5) in stop/cleanup.',
                        determinism: 'deterministic-structural',
                        confidence: 0.88,
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
exports.PY011ThreadLifecycle = PY011ThreadLifecycle;
//# sourceMappingURL=PY011-thread-lifecycle.js.map