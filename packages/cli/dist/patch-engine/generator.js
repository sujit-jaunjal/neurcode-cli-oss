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
function detectResponseReceiver(lines, lineIndex) {
    const start = Math.max(0, lineIndex - 40);
    for (let idx = lineIndex; idx >= start; idx -= 1) {
        const line = lines[idx];
        const match = line.match(/\(\s*(?:req|request)\s*,\s*(res|response|reply)\b/);
        if (match) {
            return match[1];
        }
    }
    return null;
}
function extractAccessedFields(lines, lineIndex, access) {
    const stopIndex = Math.min(lines.length - 1, lineIndex + 60);
    const fieldRegex = new RegExp(`\\b${access.receiver}\\.${access.field}\\.([A-Za-z_$][\\w$]*)\\b`, 'g');
    const seen = new Set();
    const out = [];
    for (let idx = lineIndex; idx <= stopIndex; idx += 1) {
        const line = lines[idx];
        if (/\bcatch\s*\(/.test(line))
            break;
        fieldRegex.lastIndex = 0;
        let match = fieldRegex.exec(line);
        while (match) {
            const fieldName = match[1];
            if (!seen.has(fieldName)) {
                seen.add(fieldName);
                out.push(fieldName);
            }
            match = fieldRegex.exec(line);
        }
    }
    return out;
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
    const responseReceiver = detectResponseReceiver(lines, lineIndex);
    const requiredFields = extractAccessedFields(lines, lineIndex, { receiver, field });
    const accessExpr = `${receiver}.${field}`;
    const invalidErrorCode = field === 'body'
        ? 'invalid_request_body'
        : field === 'params'
            ? 'invalid_request_params'
            : 'invalid_request_query';
    const missingErrorCode = field === 'body'
        ? 'missing_required_body_fields'
        : field === 'params'
            ? 'missing_required_params_fields'
            : 'missing_required_query_fields';
    const guardLines = [
        `${indent}if (!${accessExpr} || typeof ${accessExpr} !== 'object' || Array.isArray(${accessExpr})) {`,
    ];
    if (responseReceiver) {
        guardLines.push(`${indent}  return ${responseReceiver}.status(400).json({ error: '${invalidErrorCode}' });`);
    }
    else {
        guardLines.push(`${indent}  throw new Error('${invalidErrorCode}');`);
    }
    guardLines.push(`${indent}}`);
    if (requiredFields.length > 0) {
        const requiredFieldLiteral = `[${requiredFields.map((fieldName) => `'${fieldName}'`).join(', ')}]`;
        guardLines.push(`${indent}const missingFields = ${requiredFieldLiteral}.filter((field) => ${accessExpr}[field] == null);`, `${indent}if (missingFields.length > 0) {`);
        if (responseReceiver) {
            guardLines.push(`${indent}  return ${responseReceiver}.status(400).json({ error: '${missingErrorCode}', fields: missingFields });`);
        }
        else {
            guardLines.push(`${indent}  throw new Error('${missingErrorCode}');`);
        }
        guardLines.push(`${indent}}`);
    }
    const updated = [...lines];
    updated.splice(lineIndex, 0, ...guardLines);
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