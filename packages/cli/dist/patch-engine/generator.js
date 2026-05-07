"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePatch = generatePatch;
const patterns_1 = require("./patterns");
function leadingWhitespace(line) {
    return line.match(/^(\s*)/)?.[1] ?? '';
}
function extractRequestAccess(line) {
    const match = line.match(/\b(req|request)\.(body|params|query)\b/);
    if (!match)
        return null;
    return {
        receiver: match[1],
        field: match[2],
    };
}
// Replace the matched DB call line with a service-layer redirect comment.
function applyDbAccessFix(lines, lineIndex) {
    const indent = leadingWhitespace(lines[lineIndex]);
    const updated = [...lines];
    updated[lineIndex] = `${indent}// [NEURCODE] Move to service layer — replace direct DB call with a service method`;
    return updated;
}
// Insert a deterministic runtime validation guard before req.body/params/query access.
function applyValidationFix(lines, lineIndex) {
    const indent = leadingWhitespace(lines[lineIndex]);
    const access = extractRequestAccess(lines[lineIndex]);
    const receiver = access?.receiver ?? 'req';
    const field = access?.field ?? 'body';
    const accessExpr = `${receiver}.${field}`;
    const invalidMessage = field === 'body'
        ? 'Invalid request body'
        : field === 'params'
            ? 'Invalid request params'
            : 'Invalid request query';
    const updated = [...lines];
    updated.splice(lineIndex, 0, `${indent}if (!${accessExpr} || typeof ${accessExpr} !== 'object' || Array.isArray(${accessExpr})) {`, `${indent}  throw new Error('${invalidMessage}');`, `${indent}}`);
    return updated;
}
// Remove the TODO/FIXME comment line entirely.
function applyTodoRemoval(lines, lineIndex) {
    const updated = [...lines];
    updated.splice(lineIndex, 1);
    return updated;
}
function generatePatch(input) {
    const lines = input.fileContent.split('\n');
    const lineIndex = (0, patterns_1.detectPattern)(input.fileContent, input.patternKind);
    if (lineIndex === null)
        return null;
    let updatedLines;
    switch (input.patternKind) {
        case 'db_in_ui':
            updatedLines = applyDbAccessFix(lines, lineIndex);
            break;
        case 'missing_validation':
            updatedLines = applyValidationFix(lines, lineIndex);
            break;
        case 'todo_fixme':
            updatedLines = applyTodoRemoval(lines, lineIndex);
            break;
        default:
            return null;
    }
    return { updatedContent: updatedLines.join('\n') };
}
//# sourceMappingURL=generator.js.map