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
function buildMetadata(input) {
    return {
        recipeId: input.recipeId,
        summary: input.summary,
        expectedOutcome: input.expectedOutcome,
        riskLevel: input.riskLevel,
        deterministic: true,
        requiresManualReview: input.requiresManualReview === true,
    };
}
function applyDbAccessFix(lines, lineIndex) {
    const indent = leadingWhitespace(lines[lineIndex]);
    const updated = [...lines];
    updated[lineIndex] = `${indent}// [NEURCODE] Move to service layer — replace direct DB call with a service method`;
    return {
        updatedContent: updated.join('\n'),
        metadata: buildMetadata({
            recipeId: 'db-service-boundary-placeholder.v1',
            summary: 'Replaces direct DB access with deterministic service-boundary placeholder.',
            expectedOutcome: 'Direct DB call is blocked until service-layer refactor is completed.',
            riskLevel: 'medium',
            requiresManualReview: true,
        }),
    };
}
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
    return {
        updatedContent: updated.join('\n'),
        metadata: buildMetadata({
            recipeId: 'api-validation-guard.v2',
            summary: 'Adds deterministic API boundary validation before request input usage.',
            expectedOutcome: 'Invalid request input returns HTTP 400 before business logic runs.',
            riskLevel: 'low',
        }),
    };
}
function applyTodoRemoval(lines, lineIndex) {
    const updated = [...lines];
    updated.splice(lineIndex, 1);
    return {
        updatedContent: updated.join('\n'),
        metadata: buildMetadata({
            recipeId: 'todo-removal.v1',
            summary: 'Removes TODO/FIXME marker flagged by governance policy.',
            expectedOutcome: 'Marker debt signal is removed; implementation still requires review.',
            riskLevel: 'medium',
            requiresManualReview: true,
        }),
    };
}
function applyAuthMiddlewareFix(lines, lineIndex) {
    const updated = [...lines];
    const line = updated[lineIndex];
    if (/requireAuth|authMiddleware|authenticate|withAuth/.test(line))
        return null;
    const routeMatch = line.match(/^(\s*(?:app|router)\.(?:get|post|put|patch|delete)\s*\(\s*[^,]+\s*,\s*)(.*)$/i);
    if (!routeMatch)
        return null;
    updated[lineIndex] = `${routeMatch[1]}requireAuth, ${routeMatch[2]}`;
    return {
        updatedContent: updated.join('\n'),
        metadata: buildMetadata({
            recipeId: 'route-auth-middleware.v1',
            summary: 'Injects authentication middleware into route definition.',
            expectedOutcome: 'Route requires authentication before handler execution.',
            riskLevel: 'medium',
            requiresManualReview: true,
        }),
    };
}
function applyRateLimitingFix(lines, lineIndex) {
    const updated = [...lines];
    const line = updated[lineIndex];
    if (/rateLimit|rateLimiter|throttle/.test(line))
        return null;
    const routeMatch = line.match(/^(\s*(?:app|router)\.(?:get|post|put|patch|delete)\s*\(\s*[^,]+\s*,\s*)(.*)$/i);
    if (!routeMatch)
        return null;
    updated[lineIndex] = `${routeMatch[1]}rateLimitGuard, ${routeMatch[2]}`;
    return {
        updatedContent: updated.join('\n'),
        metadata: buildMetadata({
            recipeId: 'route-rate-limit-middleware.v1',
            summary: 'Injects deterministic rate-limiting middleware into route definition.',
            expectedOutcome: 'Route is guarded from uncontrolled request bursts.',
            riskLevel: 'medium',
            requiresManualReview: true,
        }),
    };
}
function applyTokenExpiryFix(lines, lineIndex) {
    const updated = [...lines];
    const line = updated[lineIndex];
    if (!/\bjwt\.sign\s*\(/i.test(line))
        return null;
    if (/expiresIn\s*:/i.test(line))
        return null;
    const replaced = line.replace(/\)\s*;?\s*$/, ", { expiresIn: '1h' });");
    if (replaced === line)
        return null;
    updated[lineIndex] = replaced;
    return {
        updatedContent: updated.join('\n'),
        metadata: buildMetadata({
            recipeId: 'jwt-expiry-enforcement.v1',
            summary: 'Adds deterministic default token expiry to jwt.sign usage.',
            expectedOutcome: 'Issued tokens expire automatically instead of lasting indefinitely.',
            riskLevel: 'medium',
            requiresManualReview: true,
        }),
    };
}
function applyUnsafeInnerHtmlFix(lines, lineIndex) {
    const updated = [...lines];
    updated[lineIndex] = updated[lineIndex].replace(/\.innerHTML\s*=/, '.textContent =');
    return {
        updatedContent: updated.join('\n'),
        metadata: buildMetadata({
            recipeId: 'dom-innerhtml-to-textcontent.v1',
            summary: 'Replaces unsafe innerHTML assignment with textContent assignment.',
            expectedOutcome: 'DOM write becomes non-HTML rendering, reducing injection risk.',
            riskLevel: 'low',
        }),
    };
}
function applyUnsafeSensitiveLoggingFix(lines, lineIndex) {
    const updated = [...lines];
    const indent = leadingWhitespace(updated[lineIndex]);
    updated[lineIndex] = `${indent}console.warn('[NEURCODE] sensitive logging removed');`;
    return {
        updatedContent: updated.join('\n'),
        metadata: buildMetadata({
            recipeId: 'sensitive-log-redaction-placeholder.v1',
            summary: 'Replaces sensitive logging line with deterministic redaction marker.',
            expectedOutcome: 'Potential secret/token logging path is removed.',
            riskLevel: 'medium',
            requiresManualReview: true,
        }),
    };
}
function applyTimeoutHandlingFix(lines, lineIndex) {
    const updated = [...lines];
    const line = updated[lineIndex];
    if (!/\bfetch\s*\(/.test(line))
        return null;
    if (/AbortSignal\.timeout|signal\s*:/.test(line))
        return null;
    let replaced = line;
    const singleArgMatch = line.match(/\bfetch\s*\(\s*([^,()]+?)\s*\)/);
    if (singleArgMatch) {
        replaced = line.replace(/\bfetch\s*\(\s*([^,()]+?)\s*\)/, 'fetch($1, { signal: AbortSignal.timeout(10000) })');
    }
    else {
        const twoArgMatch = line.match(/\bfetch\s*\(\s*([^,]+?)\s*,\s*([^)]+)\)/);
        if (!twoArgMatch)
            return null;
        const urlArg = twoArgMatch[1].trim();
        const optionsArg = twoArgMatch[2].trim();
        replaced = line.replace(/\bfetch\s*\(\s*([^,]+?)\s*,\s*([^)]+)\)/, `fetch(${urlArg}, { ...(${optionsArg}), signal: (${optionsArg})?.signal ?? AbortSignal.timeout(10000) })`);
    }
    if (replaced === line)
        return null;
    updated[lineIndex] = replaced;
    return {
        updatedContent: updated.join('\n'),
        metadata: buildMetadata({
            recipeId: 'fetch-timeout-guard.v1',
            summary: 'Adds deterministic timeout guard to fetch call.',
            expectedOutcome: 'Outbound request aborts after timeout instead of hanging indefinitely.',
            riskLevel: 'medium',
            requiresManualReview: true,
        }),
    };
}
function applyRetryGuardFix(lines, lineIndex) {
    const updated = [...lines];
    const line = updated[lineIndex];
    if (!/\bfetch\s*\(/.test(line))
        return null;
    if (/\bneurcodeFetchWithRetry\s*\(/.test(line))
        return null;
    const helperName = 'neurcodeFetchWithRetry';
    const helperExists = updated.some((entry) => new RegExp(`\\b${helperName}\\b`).test(entry));
    if (!helperExists) {
        const helperLines = [
            `const ${helperName} = async (operation, retries = 2) => {`,
            `  let lastError = null;`,
            `  for (let attempt = 0; attempt <= retries; attempt += 1) {`,
            `    try {`,
            `      return await operation();`,
            `    } catch (error) {`,
            `      lastError = error;`,
            `      if (attempt === retries) break;`,
            `    }`,
            `  }`,
            `  throw lastError instanceof Error ? lastError : new Error('retry_failed');`,
            `};`,
            ``,
        ];
        let insertionIndex = 0;
        while (insertionIndex < updated.length && /^\s*import\s+/.test(updated[insertionIndex])) {
            insertionIndex += 1;
        }
        updated.splice(insertionIndex, 0, ...helperLines);
    }
    const fetchCallMatch = line.match(/fetch\s*\((.*)\)\s*;?\s*$/);
    if (!fetchCallMatch)
        return null;
    const hasSemicolon = /;\s*$/.test(line);
    const replaced = line.replace(/fetch\s*\((.*)\)\s*;?\s*$/, `${helperName}(() => fetch($1), 2)${hasSemicolon ? ';' : ''}`);
    if (replaced === line)
        return null;
    updated[lineIndex] = replaced;
    return {
        updatedContent: updated.join('\n'),
        metadata: buildMetadata({
            recipeId: 'fetch-retry-guard.v1',
            summary: 'Wraps fetch call with deterministic retry guard.',
            expectedOutcome: 'Transient network failures retry before failing the request path.',
            riskLevel: 'medium',
            requiresManualReview: true,
        }),
    };
}
function applyIdempotencyKeyFix(lines, lineIndex) {
    const updated = [...lines];
    const line = updated[lineIndex];
    const indent = leadingWhitespace(line);
    if (!/\b(?:charge|payment|checkout|order|transaction)\b/i.test(line))
        return null;
    if (updated.some((entry) => /idempotency[_-]?key/i.test(entry)))
        return null;
    const responseReceiver = detectResponseReceiver(lines, lineIndex);
    const guardLines = [
        `${indent}const neurcodeIdempotencyKey = req.headers?.['idempotency-key'] || req.headers?.['x-idempotency-key'];`,
        `${indent}if (!neurcodeIdempotencyKey) {`,
        responseReceiver
            ? `${indent}  return ${responseReceiver}.status(400).json({ error: 'missing_idempotency_key' });`
            : `${indent}  throw new Error('missing_idempotency_key');`,
        `${indent}}`,
    ];
    updated.splice(lineIndex, 0, ...guardLines);
    return {
        updatedContent: updated.join('\n'),
        metadata: buildMetadata({
            recipeId: 'api-idempotency-key-guard.v1',
            summary: 'Adds deterministic idempotency-key guard before payment/order side effects.',
            expectedOutcome: 'Duplicate mutation requests without idempotency key are rejected.',
            riskLevel: 'medium',
            requiresManualReview: true,
        }),
    };
}
function applyUnsafeFileUploadFix(lines, lineIndex) {
    const updated = [...lines];
    const line = updated[lineIndex];
    if (!/\b(?:req\.files|req\.file|upload|multer)\b/i.test(line))
        return null;
    if (updated.some((entry) => /invalid_upload_payload|allowedMimeTypes|maxUploadBytes/.test(entry)))
        return null;
    const indent = leadingWhitespace(line);
    const responseReceiver = detectResponseReceiver(lines, lineIndex);
    const guardLines = [
        `${indent}const uploadedFiles = Array.isArray(req.files) ? req.files : (req.file ? [req.file] : []);`,
        `${indent}const allowedMimeTypes = ['image/png', 'image/jpeg', 'application/pdf'];`,
        `${indent}const maxUploadBytes = 5 * 1024 * 1024;`,
        `${indent}const invalidUpload = uploadedFiles.find((file) => !allowedMimeTypes.includes(file?.mimetype) || Number(file?.size || 0) > maxUploadBytes);`,
        `${indent}if (invalidUpload) {`,
        responseReceiver
            ? `${indent}  return ${responseReceiver}.status(400).json({ error: 'invalid_upload_payload' });`
            : `${indent}  throw new Error('invalid_upload_payload');`,
        `${indent}}`,
    ];
    updated.splice(lineIndex, 0, ...guardLines);
    return {
        updatedContent: updated.join('\n'),
        metadata: buildMetadata({
            recipeId: 'upload-mime-size-guard.v1',
            summary: 'Adds deterministic upload MIME/size validation guard.',
            expectedOutcome: 'Unsafe uploads are rejected before file handling logic executes.',
            riskLevel: 'medium',
            requiresManualReview: true,
        }),
    };
}
function generatePatch(input) {
    const lines = input.fileContent.split('\n');
    const lineIndex = (0, patterns_1.detectPattern)(input.fileContent, input.patternKind);
    if (lineIndex === null)
        return null;
    switch (input.patternKind) {
        case 'db_in_ui':
            return applyDbAccessFix(lines, lineIndex);
        case 'missing_validation':
            return applyValidationFix(lines, lineIndex);
        case 'todo_fixme':
            return applyTodoRemoval(lines, lineIndex);
        case 'missing_auth_middleware':
            return applyAuthMiddlewareFix(lines, lineIndex);
        case 'missing_rate_limiting':
            return applyRateLimitingFix(lines, lineIndex);
        case 'missing_token_expiry':
            return applyTokenExpiryFix(lines, lineIndex);
        case 'unsafe_inner_html_usage':
            return applyUnsafeInnerHtmlFix(lines, lineIndex);
        case 'unsafe_sensitive_logging':
            return applyUnsafeSensitiveLoggingFix(lines, lineIndex);
        case 'missing_timeout_handling':
            return applyTimeoutHandlingFix(lines, lineIndex);
        case 'unsafe_fetch_without_retries':
            return applyRetryGuardFix(lines, lineIndex);
        case 'missing_idempotency_keys':
            return applyIdempotencyKeyFix(lines, lineIndex);
        case 'unsafe_file_uploads':
            return applyUnsafeFileUploadFix(lines, lineIndex);
        default:
            return null;
    }
}
//# sourceMappingURL=generator.js.map