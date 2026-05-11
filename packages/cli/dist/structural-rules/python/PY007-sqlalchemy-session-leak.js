"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PY007SQLAlchemySessionLeak = void 0;
// Matches bare session assignment: session = Session() / session = SessionLocal() etc.
// Captures the variable name and the constructor call
const SESSION_ASSIGN_RE = /^(\s*)(\w+)\s*=\s*(Session|SessionLocal|AsyncSession|get_session|ScopedSession|sessionmaker\(\))\s*\(/;
// Matches a `with` or `async with` block opening with Session
const WITH_SESSION_RE = /^\s*(?:async\s+)?with\s+.*Session/;
// Matches session.close() in a finally block vicinity
const SESSION_CLOSE_RE = /\bsession\s*\.\s*close\s*\(\)/;
// Matches a `finally:` block
const FINALLY_RE = /^\s*finally\s*:/;
function getIndent(line) {
    return line.length - line.trimStart().length;
}
class PY007SQLAlchemySessionLeak {
    id = 'PY007';
    name = 'SQLAlchemy session created outside context manager';
    policyRef = 'PY007';
    severity = 'BLOCKING';
    languages = ['python'];
    description = 'SQLAlchemy session assigned without a context manager or try/finally close() risks connection pool exhaustion.';
    check(filePath, sourceText) {
        try {
            const violations = [];
            // Normalize line endings
            const lines = sourceText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Skip if this line is a `with Session()` — safe usage
                if (WITH_SESSION_RE.test(line))
                    continue;
                const match = SESSION_ASSIGN_RE.exec(line);
                if (!match)
                    continue;
                const varName = match[2];
                const assignIndent = match[1].length;
                // Look ahead: find if there is a try/finally with session.close()
                // Search up to 60 lines ahead within the same or deeper indentation scope
                let hasFinallyClose = false;
                let inFinally = false;
                for (let j = i + 1; j < Math.min(i + 60, lines.length); j++) {
                    const jl = lines[j];
                    const jt = jl.trimStart();
                    if (jt.length === 0)
                        continue;
                    const jIndent = getIndent(jl);
                    // If we've gone back to a shallower indent than the assignment, stop
                    if (jIndent < assignIndent)
                        break;
                    if (FINALLY_RE.test(jl)) {
                        inFinally = true;
                        continue;
                    }
                    if (inFinally) {
                        // Check for varName.close() or generic session.close()
                        const closeRe = new RegExp(`\\b${varName}\\s*\\.\\s*close\\s*\\(\\)`);
                        if (closeRe.test(jl) || SESSION_CLOSE_RE.test(jl)) {
                            hasFinallyClose = true;
                            break;
                        }
                    }
                }
                if (!hasFinallyClose) {
                    violations.push({
                        ruleId: this.id,
                        ruleName: this.name,
                        policyRef: this.policyRef,
                        severity: this.severity,
                        filePath,
                        line: i + 1,
                        column: 1,
                        evidence: line.slice(0, 120),
                        operationalRisk: 'Unclosed SQLAlchemy sessions hold database connections open indefinitely. ' +
                            'Connection pools exhaust under load, causing `TimeoutError: QueuePool limit of size X overflow Y reached` ' +
                            'in production within hours of deployment.',
                        remediation: 'Use `with Session() as session:` or `async with AsyncSession() as session:` for automatic cleanup. ' +
                            'Never use bare `session = Session()` without a corresponding `finally: session.close()`.',
                        determinism: 'heuristic-advisory',
                        confidence: 0.78,
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
exports.PY007SQLAlchemySessionLeak = PY007SQLAlchemySessionLeak;
//# sourceMappingURL=PY007-sqlalchemy-session-leak.js.map