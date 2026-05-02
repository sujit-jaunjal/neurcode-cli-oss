"use strict";
// Detection rules for deterministic patch generation.
// Each function returns the 0-based line index of the first match, or null.
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyViolation = classifyViolation;
exports.detectPattern = detectPattern;
// ---------------------------------------------------------------------------
// Classifiy a fix suggestion into a patchable pattern kind
// ---------------------------------------------------------------------------
function classifyViolation(issue, policy) {
    const combined = `${issue} ${policy}`.toLowerCase();
    if (combined.includes('todo') || combined.includes('fixme'))
        return 'todo_fixme';
    if (combined.includes('db') || combined.includes('database') ||
        combined.includes('query') || combined.includes('data access') ||
        combined.includes('direct access') ||
        policy.includes('layer') || policy.includes('layering') || policy.includes('db')) {
        return 'db_in_ui';
    }
    if (combined.includes('validation') || combined.includes('validate') ||
        combined.includes('input') || policy.includes('validation')) {
        return 'missing_validation';
    }
    return null;
}
// ---------------------------------------------------------------------------
// Pattern detectors (work on pre-split line arrays)
// ---------------------------------------------------------------------------
const DB_ACCESS_PATTERNS = [
    /\bdb\s*\.\s*query\s*\(/,
    /\bdb\s*\.\s*execute\s*\(/,
    /\bdb\s*\.\s*run\s*\(/,
    /\bdb\s*\.\s*find\b/,
    /\bdb\s*\.\s*findOne\s*\(/,
    /\bprisma\s*\.\s*\w+\s*\.\s*find/,
    /\bprisma\s*\.\s*\w+\s*\.\s*create\s*\(/,
    /\bprisma\s*\.\s*\w+\s*\.\s*update\s*\(/,
    /\bprisma\s*\.\s*\w+\s*\.\s*delete\s*\(/,
    /\bnew\s+Pool\s*\(/,
    /\bknex\s*\(/,
];
const VALIDATION_PATTERNS = [
    /\.validate\s*\(/,
    /schema\.parse\s*\(/,
    /\bJoi\s*\./,
    /\byup\s*\./,
    /\bzod\s*\./,
    /\bajv\s*\.\s*compile/,
];
// Matches the request/response parameter pair in a handler signature
const REQ_HANDLER_RE = /\b(?:req|request)\s*,\s*(?:res|response|reply)\b/;
// Matches direct access to incoming data without a prior validation call
const REQ_INPUT_RE = /\b(?:req|request)\.(?:body|params|query)\b/;
const TODO_FIXME_RE = /\/\/\s*(?:TODO|FIXME)\b/;
// ---------------------------------------------------------------------------
function findDbAccessLine(lines) {
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trimStart();
        // Skip lines that are themselves comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*'))
            continue;
        if (DB_ACCESS_PATTERNS.some((re) => re.test(lines[i])))
            return i;
    }
    return null;
}
function findMissingValidationLine(lines) {
    let handlerStartIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (REQ_HANDLER_RE.test(lines[i])) {
            handlerStartIndex = i;
        }
        if (handlerStartIndex !== -1 && REQ_INPUT_RE.test(lines[i])) {
            // Look backward from this line (within the handler) for a validation call
            const searchFrom = Math.max(handlerStartIndex, i - 30);
            const priorLines = lines.slice(searchFrom, i);
            const hasValidation = priorLines.some((l) => VALIDATION_PATTERNS.some((re) => re.test(l)));
            if (!hasValidation)
                return i;
        }
    }
    return null;
}
function findTodoLine(lines) {
    for (let i = 0; i < lines.length; i++) {
        if (TODO_FIXME_RE.test(lines[i]))
            return i;
    }
    return null;
}
function detectPattern(content, kind) {
    const lines = content.split('\n');
    switch (kind) {
        case 'db_in_ui': return findDbAccessLine(lines);
        case 'missing_validation': return findMissingValidationLine(lines);
        case 'todo_fixme': return findTodoLine(lines);
    }
}
//# sourceMappingURL=patterns.js.map