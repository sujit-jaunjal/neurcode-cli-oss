"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PY005FastAPIWithoutPydantic = void 0;
// FastAPI route decorator patterns
const ROUTE_DECORATOR_RE = /^\s*@(?:app|router|api_router)\.(get|post|put|patch|delete|head|options|trace)\s*\(/;
// Detect request.body() or request.json() or await request.body() / await request.json()
const RAW_REQUEST_RE = /\b(?:request|req)\s*\.\s*(?:body|json)\s*\(\)/;
// Detect Pydantic model usage in function signature: param: ModelName
// where ModelName starts with uppercase and isn't Request/Response/BackgroundTasks
const PYDANTIC_PARAM_RE = /\w+\s*:\s*([A-Z][A-Za-z0-9]+)(?!\s*=\s*(?:None|True|False|\d))/;
// Common non-Pydantic FastAPI types to exclude
const NON_PYDANTIC_TYPES = new Set([
    'Request',
    'Response',
    'BackgroundTasks',
    'HTTPException',
    'Depends',
    'Optional',
    'List',
    'Dict',
    'Any',
    'str',
    'int',
    'float',
    'bool',
    'bytes',
]);
function extractFunctionSignature(lines, startIdx) {
    // Collect function definition until the colon is found
    let sig = '';
    let depth = 0;
    for (let i = startIdx; i < Math.min(startIdx + 10, lines.length); i++) {
        sig += lines[i] + '\n';
        for (const ch of lines[i]) {
            if (ch === '(')
                depth++;
            else if (ch === ')')
                depth--;
        }
        if (depth <= 0 && sig.includes('('))
            break;
    }
    return sig;
}
function hasPydanticModelParam(sig) {
    // Find all type annotations in the signature
    const paramRegex = /\w+\s*:\s*([A-Z][A-Za-z0-9_]*)/g;
    let match;
    while ((match = paramRegex.exec(sig)) !== null) {
        const typeName = match[1];
        if (!NON_PYDANTIC_TYPES.has(typeName)) {
            return true;
        }
    }
    return false;
}
class PY005FastAPIWithoutPydantic {
    id = 'PY005';
    name = 'FastAPI route handler accessing raw request body without Pydantic';
    policyRef = 'P019';
    severity = 'BLOCKING';
    languages = ['python'];
    description = 'FastAPI route handlers that access request.body() or request.json() without a Pydantic model parameter bypass validation.';
    check(filePath, sourceText) {
        try {
            const violations = [];
            const lines = sourceText.split('\n');
            let i = 0;
            while (i < lines.length) {
                const line = lines[i];
                // Look for route decorator
                if (!ROUTE_DECORATOR_RE.test(line)) {
                    i++;
                    continue;
                }
                const decoratorLine = i;
                // Find the function definition (next def after decorator, skip other decorators)
                let funcDefLine = -1;
                let j = i + 1;
                while (j < Math.min(i + 10, lines.length)) {
                    const l = lines[j].trimStart();
                    if (/^(?:async\s+)?def\s+\w+\s*\(/.test(l)) {
                        funcDefLine = j;
                        break;
                    }
                    if (l.length > 0 && !l.startsWith('@') && !l.startsWith('#'))
                        break;
                    j++;
                }
                if (funcDefLine === -1) {
                    i = j + 1;
                    continue;
                }
                // Extract function signature
                const sig = extractFunctionSignature(lines, funcDefLine);
                // If signature has a Pydantic model param, no violation
                if (hasPydanticModelParam(sig)) {
                    i = funcDefLine + 1;
                    continue;
                }
                // Find function body (collect until next function/class at same or lower indent)
                const funcIndent = lines[funcDefLine].length - lines[funcDefLine].trimStart().length;
                const bodyLines = [];
                let k = funcDefLine + 1;
                while (k < lines.length) {
                    const bl = lines[k];
                    const bt = bl.trimStart();
                    if (bt.length === 0) {
                        k++;
                        continue;
                    }
                    const bi = bl.length - bt.length;
                    if (bi <= funcIndent && bt.length > 0)
                        break;
                    bodyLines.push(bl);
                    k++;
                }
                const bodyText = bodyLines.join('\n');
                // Check if body accesses request.body() or request.json()
                if (!RAW_REQUEST_RE.test(bodyText)) {
                    i = k;
                    continue;
                }
                const evidence = lines[funcDefLine].slice(0, 120);
                violations.push({
                    ruleId: this.id,
                    ruleName: this.name,
                    policyRef: this.policyRef,
                    severity: this.severity,
                    filePath,
                    line: funcDefLine + 1,
                    column: (lines[funcDefLine].match(/^\s*/)?.[0].length ?? 0) + 1,
                    evidence,
                    operationalRisk: 'Raw request body is accessed without Pydantic validation. ' +
                        'Malformed, oversized, or malicious payloads reach business logic directly, ' +
                        'causing runtime errors, type confusion, or injection vulnerabilities.',
                    remediation: 'Add a Pydantic model parameter to the route handler: ' +
                        '`async def handler(data: MyRequestModel)` and let FastAPI validate and parse the body automatically. ' +
                        'Remove the manual `request.body()` / `request.json()` call.',
                    determinism: 'deterministic-structural',
                    confidence: 0.80,
                    language: 'python',
                });
                i = k;
            }
            return violations;
        }
        catch {
            return [];
        }
    }
}
exports.PY005FastAPIWithoutPydantic = PY005FastAPIWithoutPydantic;
//# sourceMappingURL=PY005-fastapi-without-pydantic.js.map