"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePatch = generatePatch;
const patterns_1 = require("./patterns");
function leadingWhitespace(line) {
    return line.match(/^(\s*)/)?.[1] ?? '';
}
// Replace the matched DB call line with a service-layer redirect comment.
function applyDbAccessFix(lines, lineIndex) {
    const indent = leadingWhitespace(lines[lineIndex]);
    const updated = [...lines];
    updated[lineIndex] = `${indent}// [NEURCODE] Move to service layer — replace direct DB call with a service method`;
    return updated;
}
// Insert a validation reminder line immediately before the req.body/params/query access.
function applyValidationFix(lines, lineIndex) {
    const indent = leadingWhitespace(lines[lineIndex]);
    const comment = `${indent}// [NEURCODE] Add validation — e.g. const { error } = schema.validate(req.body); ` +
        `if (error) return res.status(400).json({ error: error.message });`;
    const updated = [...lines];
    updated.splice(lineIndex, 0, comment);
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