"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCompatibilityMutationHandlers = createCompatibilityMutationHandlers;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const node_crypto_1 = require("node:crypto");
const node_child_process_1 = require("node:child_process");
const contracts_1 = require("@neurcode-ai/contracts");
const patch_engine_1 = require("../../patch-engine");
const diff_1 = require("../../patch-engine/diff");
const execution_bus_1 = require("../runtime/execution-bus");
const shaping_1 = require("../shaping");
function resolveGitRoot(cwd) {
    const result = (0, node_child_process_1.spawnSync)('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.status !== 0)
        return null;
    const value = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    return value.length > 0 ? value : null;
}
function captureGitDirtyPaths(cwd) {
    const gitRoot = resolveGitRoot(cwd);
    if (!gitRoot)
        return null;
    const statusResult = (0, node_child_process_1.spawnSync)('git', ['-C', cwd, 'status', '--porcelain=1', '-z', '--untracked-files=all'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (statusResult.status !== 0 || typeof statusResult.stdout !== 'string')
        return null;
    const tokens = statusResult.stdout.split('\0').filter((entry) => entry.length > 0);
    const dirty = new Set();
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token.length < 4)
            continue;
        const status = token.slice(0, 2);
        const filePath = token.slice(3).trim();
        if (filePath.length > 0) {
            dirty.add(path.resolve(gitRoot, filePath));
        }
        const renamedOrCopied = status.includes('R') || status.includes('C');
        if (renamedOrCopied && index + 1 < tokens.length) {
            index += 1;
        }
    }
    return dirty;
}
function hashFileForDiff(absPath) {
    try {
        const stat = fs.statSync(absPath);
        if (!stat.isFile())
            return '<non-file>';
        const content = fs.readFileSync(absPath);
        return (0, node_crypto_1.createHash)('sha256').update(content).digest('hex');
    }
    catch {
        return '<missing>';
    }
}
function captureDirtyFileFingerprints(cwd) {
    const dirtyPaths = captureGitDirtyPaths(cwd);
    if (!dirtyPaths)
        return null;
    const map = new Map();
    for (const dirtyPath of dirtyPaths) {
        map.set(dirtyPath, hashFileForDiff(dirtyPath));
    }
    return map;
}
function isAllowedPatchSideEffect(absPath, targetAbsPath, cwd) {
    if (absPath === targetAbsPath)
        return true;
    const rel = path.relative(cwd, absPath);
    if (!rel || rel.startsWith('..'))
        return false;
    if (rel === 'neurcode.policy.compiled.json')
        return true;
    return rel === '.neurcode' || rel.startsWith(`.neurcode${path.sep}`);
}
function collectUnexpectedPatchSideEffects(before, after, targetAbsPath, cwd) {
    if (!before || !after)
        return [];
    return [...after]
        .filter((entry) => !before.has(entry))
        .filter((entry) => !isAllowedPatchSideEffect(entry, targetAbsPath, cwd))
        .map((entry) => path.relative(cwd, entry).replace(/\\/g, '/'))
        .filter((entry) => entry.length > 0)
        .sort();
}
function collectUnexpectedPatchMutations(before, after, targetAbsPath, cwd) {
    if (!before || !after)
        return [];
    const keys = new Set([...before.keys(), ...after.keys()]);
    const unexpected = [];
    for (const key of keys) {
        const beforeHash = before.get(key) ?? '<missing>';
        const afterHash = after.get(key) ?? '<missing>';
        if (beforeHash === afterHash)
            continue;
        if (isAllowedPatchSideEffect(key, targetAbsPath, cwd))
            continue;
        const rel = path.relative(cwd, key).replace(/\\/g, '/');
        if (rel.length > 0 && !rel.startsWith('..')) {
            unexpected.push(rel);
        }
    }
    return unexpected.sort();
}
function patternDescriptor(kind, confidence, manualReviewRequired) {
    const labelByKind = {
        missing_validation: 'API input validation guard',
        missing_timeout_handling: 'Outbound request timeout guard',
        unsafe_fetch_without_retries: 'Outbound request retry guard',
        missing_idempotency_keys: 'Mutation idempotency-key guard',
        unsafe_file_uploads: 'Upload MIME/size validation guard',
        missing_auth_middleware: 'Route authentication middleware',
        missing_rate_limiting: 'Route rate limiting middleware',
        missing_token_expiry: 'JWT expiry enforcement',
        unsafe_inner_html_usage: 'Unsafe DOM sink replacement',
        unsafe_sensitive_logging: 'Sensitive log redaction',
        db_in_ui: 'Service-layer boundary placeholder',
        todo_fixme: 'TODO/FIXME debt marker removal',
    };
    const confidenceModel = confidence === 'high'
        ? 'high'
        : confidence === 'medium'
            ? 'medium'
            : 'low';
    return {
        kind,
        label: labelByKind[kind] || kind,
        deterministic: true,
        confidenceModel,
        advisoryOnly: confidenceModel === 'low',
        manualReviewRequired,
    };
}
function summarizeDiff(diff) {
    let addedLines = 0;
    let removedLines = 0;
    for (const line of diff.split('\n')) {
        if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@'))
            continue;
        if (line.startsWith('+'))
            addedLines += 1;
        if (line.startsWith('-'))
            removedLines += 1;
    }
    const changedLines = addedLines + removedLines;
    return {
        addedLines,
        removedLines,
        changedLines,
        summary: `${changedLines} changed line(s): +${addedLines} / -${removedLines}`,
    };
}
function extractRequestInputUsage(content) {
    const accessMatch = content.match(/\b(req|request)\.(body|params|query)\b/);
    if (!accessMatch)
        return null;
    const receiver = accessMatch[1];
    const field = accessMatch[2];
    const fieldRegex = new RegExp(`\\b${receiver}\\.${field}\\.([A-Za-z_$][\\w$]*)\\b`, 'g');
    const fields = [];
    const seen = new Set();
    let match = fieldRegex.exec(content);
    while (match) {
        const fieldName = match[1];
        if (!seen.has(fieldName)) {
            seen.add(fieldName);
            fields.push(fieldName);
        }
        match = fieldRegex.exec(content);
    }
    return { receiver, field, fields };
}
function buildPatchPreviewReasoning(patternKind, targetPath, beforeContent) {
    if (!patternKind)
        return null;
    if (patternKind === 'missing_validation') {
        const usage = extractRequestInputUsage(beforeContent);
        if (!usage) {
            return {
                summary: 'Adds deterministic API input validation guard.',
                why: 'This file accesses request input without a validation boundary check.',
                risk: 'Malformed input can cause runtime errors or unsafe processing paths.',
                expectedOutcome: 'Invalid requests fail fast and valid requests continue unchanged.',
            };
        }
        const noun = usage.field === 'body' ? 'request body' : usage.field === 'params' ? 'route params' : 'query params';
        const fieldSummary = usage.fields.length > 0 ? usage.fields.join(', ') : 'no explicit property access detected';
        return {
            summary: `Adds deterministic validation before reading ${usage.receiver}.${usage.field}.`,
            why: `${targetPath} reads ${noun} fields (${fieldSummary}) before validation.`,
            risk: `Without boundary validation, malformed ${noun} may propagate into handler logic.`,
            expectedOutcome: `Invalid ${noun} returns HTTP 400 early; valid requests keep existing behavior.`,
            fields: usage.fields,
        };
    }
    if (patternKind === 'db_in_ui') {
        return {
            summary: 'Suggests moving direct DB access behind a service boundary.',
            why: `${targetPath} appears to perform direct data access in a non-service layer.`,
            risk: 'Layering violations increase coupling and make behavior harder to govern.',
            expectedOutcome: 'Patch inserts a deterministic placeholder to redirect to service-layer logic.',
        };
    }
    if (patternKind === 'missing_auth_middleware') {
        return {
            summary: 'Adds deterministic authentication middleware to the route definition.',
            why: `${targetPath} appears to expose a request handler without an auth middleware guard.`,
            risk: 'Unauthenticated routes can expose sensitive behavior to unauthorized clients.',
            expectedOutcome: 'Route execution is gated by requireAuth before handler logic runs.',
        };
    }
    if (patternKind === 'missing_rate_limiting') {
        return {
            summary: 'Adds deterministic rate-limit middleware to the route definition.',
            why: `${targetPath} appears to expose a request handler without rate limiting controls.`,
            risk: 'Unbounded request rates can increase abuse, cost, and availability risks.',
            expectedOutcome: 'Route applies rateLimitGuard before handler execution.',
        };
    }
    if (patternKind === 'missing_timeout_handling') {
        return {
            summary: 'Adds deterministic timeout guard to outbound fetch call.',
            why: `${targetPath} issues a fetch request without timeout protection.`,
            risk: 'Unbounded network calls can hang request execution and degrade reliability under upstream latency.',
            expectedOutcome: 'Fetch call aborts after timeout and fails fast instead of hanging.',
        };
    }
    if (patternKind === 'unsafe_fetch_without_retries') {
        return {
            summary: 'Wraps outbound fetch call in deterministic retry guard.',
            why: `${targetPath} makes outbound network calls without transient failure retry handling.`,
            risk: 'Single transient failures can become user-facing errors and increase instability.',
            expectedOutcome: 'Transient upstream failures retry deterministically before failing.',
        };
    }
    if (patternKind === 'missing_idempotency_keys') {
        return {
            summary: 'Adds deterministic idempotency-key guard for side-effecting requests.',
            why: `${targetPath} appears to process payment/order-like mutations without idempotency key enforcement.`,
            risk: 'Duplicate requests can cause repeated side effects (double charges/orders).',
            expectedOutcome: 'Requests missing idempotency key fail early with explicit error.',
        };
    }
    if (patternKind === 'unsafe_file_uploads') {
        return {
            summary: 'Adds deterministic MIME and size guards for uploaded files.',
            why: `${targetPath} appears to process uploaded files without boundary checks.`,
            risk: 'Unbounded or unsafe uploads increase security and stability risk.',
            expectedOutcome: 'Invalid upload payloads are rejected before processing.',
        };
    }
    if (patternKind === 'missing_token_expiry') {
        return {
            summary: 'Adds deterministic token expiry to JWT signing call.',
            why: `${targetPath} signs JWT tokens without an expiresIn option.`,
            risk: 'Long-lived tokens increase replay and account-compromise blast radius.',
            expectedOutcome: 'Tokens gain explicit expiry to enforce credential rotation windows.',
        };
    }
    if (patternKind === 'unsafe_inner_html_usage') {
        return {
            summary: 'Replaces unsafe innerHTML assignment with textContent.',
            why: `${targetPath} writes HTML content directly into the DOM using innerHTML.`,
            risk: 'innerHTML assignments can expose XSS vectors when input is not trusted.',
            expectedOutcome: 'DOM assignment becomes text-only rendering with reduced injection risk.',
        };
    }
    if (patternKind === 'unsafe_sensitive_logging') {
        return {
            summary: 'Removes deterministic sensitive logging line.',
            why: `${targetPath} appears to log secret-bearing fields (token/authorization/password).`,
            risk: 'Sensitive log content can leak credentials to observability or audit sinks.',
            expectedOutcome: 'Sensitive logging path is replaced with a neutral warning placeholder.',
        };
    }
    if (patternKind === 'todo_fixme') {
        return {
            summary: 'Removes TODO/FIXME marker matched by policy.',
            why: `${targetPath} includes TODO/FIXME comments tracked as governance debt.`,
            risk: 'Unresolved TODO markers can hide missing implementation or review debt.',
            expectedOutcome: 'Patch removes the marker; implementation must still be verified separately.',
        };
    }
    return null;
}
function createCompatibilityMutationHandlers(context) {
    const { readBody, success, failure, toSource, toActor, recordPatchOutcome } = context;
    async function handleFix(req, res) {
        const run = await (0, execution_bus_1.runExecution)({
            type: 'fix',
            source: toSource(req),
            actor: toActor(req),
            cwd: process.cwd(),
            reverify: true,
        });
        if (!run.primaryPayload) {
            failure(res, run.execution.result?.message || 'fix execution produced no payload');
            return;
        }
        const normalizedFixPayload = (0, shaping_1.normalizeFixPayloadForLegacyClients)(run.primaryPayload) ?? run.primaryPayload;
        const normalizedVerifyAfter = (0, shaping_1.normalizeVerifyPayloadForLegacyClients)(run.verificationPayload);
        success(res, {
            ...normalizedFixPayload,
            verifyAfter: normalizedVerifyAfter ?? null,
            _execution: (0, shaping_1.buildExecutionResponseMeta)(run),
        });
    }
    async function handleFixApplySafe(req, res) {
        const run = await (0, execution_bus_1.runExecution)({
            type: 'apply-safe',
            source: toSource(req),
            actor: toActor(req),
            cwd: process.cwd(),
            reverify: true,
        });
        if (!run.primaryPayload) {
            failure(res, run.execution.result?.message || 'fix --apply-safe execution produced no payload');
            return;
        }
        const normalizedFixPayload = (0, shaping_1.normalizeFixPayloadForLegacyClients)(run.primaryPayload) ?? run.primaryPayload;
        const normalizedVerifyAfter = (0, shaping_1.normalizeVerifyPayloadForLegacyClients)(run.verificationPayload);
        success(res, {
            ...normalizedFixPayload,
            verifyAfter: normalizedVerifyAfter ?? null,
            execution: run.execution,
            _execution: (0, shaping_1.buildExecutionResponseMeta)(run),
        });
    }
    async function handlePatch(req, res) {
        let body = {};
        try {
            body = JSON.parse(await readBody(req));
        }
        catch {
            failure(res, 'Invalid JSON body', 400);
            return;
        }
        const file = body.file;
        if (!file || typeof file !== 'string' || file.includes('..')) {
            failure(res, 'Missing or unsafe "file" field', 400);
            return;
        }
        const previewToken = typeof body.previewToken === 'string' && body.previewToken.trim().length > 0
            ? body.previewToken.trim()
            : undefined;
        const cwd = process.cwd();
        const targetPath = file.trim();
        const absPath = path.resolve(cwd, targetPath);
        const beforeDirtyPaths = captureGitDirtyPaths(cwd);
        const beforeDirtyFingerprints = captureDirtyFileFingerprints(cwd);
        let contentBefore = null;
        try {
            contentBefore = fs.readFileSync(absPath, 'utf-8');
        }
        catch { /* file may not exist */ }
        const primaryArgs = ['patch', '--file', targetPath];
        if (previewToken) {
            primaryArgs.push('--preview-token', previewToken);
        }
        const run = await (0, execution_bus_1.runExecution)({
            type: 'patch',
            source: toSource(req),
            actor: toActor(req),
            target: targetPath,
            cwd,
            reverify: true,
            primaryArgs,
        });
        const patchData = run.primaryPayload ?? {
            success: false,
            file: targetPath,
            message: run.execution.result?.message || 'No applicable patch found',
        };
        let changed = false;
        if (patchData.success && contentBefore !== null) {
            try {
                const contentAfter = fs.readFileSync(absPath, 'utf-8');
                changed = contentAfter !== contentBefore;
            }
            catch { /* ignore read error */ }
        }
        const afterDirtyPaths = captureGitDirtyPaths(cwd);
        const afterDirtyFingerprints = captureDirtyFileFingerprints(cwd);
        const sideEffects = collectUnexpectedPatchSideEffects(beforeDirtyPaths, afterDirtyPaths, absPath, cwd);
        const mutatedSideEffects = collectUnexpectedPatchMutations(beforeDirtyFingerprints, afterDirtyFingerprints, absPath, cwd);
        const combinedSideEffects = [...new Set([...sideEffects, ...mutatedSideEffects])].sort();
        const payloadFile = typeof patchData.file === 'string' ? patchData.file : '';
        const payloadTargetMatch = payloadFile.length > 0
            ? path.resolve(cwd, payloadFile) === absPath
            : true;
        const patchSucceeded = patchData.success === true;
        const rawPatchStatus = typeof patchData.status === 'string' ? patchData.status : '';
        const patchStatus = rawPatchStatus === 'filesystem_changed_since_preview'
            ? 'stale_preview'
            : !patchSucceeded
                ? 'rejected'
                : changed && payloadTargetMatch && combinedSideEffects.length === 0
                    ? 'applied'
                    : changed
                        ? 'partial'
                        : 'rejected';
        const patchMessage = (() => {
            if (patchStatus === 'applied') {
                return (typeof patchData.message === 'string' && patchData.message.trim().length > 0)
                    ? patchData.message
                    : `${contracts_1.STATUS_TERMS.safePatchApplied}`;
            }
            if (patchStatus === 'partial') {
                if (!payloadTargetMatch) {
                    return `${contracts_1.STATUS_TERMS.patchRejected}: patch target mismatch detected between requested file and daemon payload file.`;
                }
                if (combinedSideEffects.length > 0) {
                    return `${contracts_1.STATUS_TERMS.patchRejected}: patch introduced side effects in ${combinedSideEffects.length} additional file(s).`;
                }
                return `${contracts_1.STATUS_TERMS.safePatchApplied}. ${contracts_1.STATUS_TERMS.manualReviewRecommended}.`;
            }
            if (patchStatus === 'stale_preview') {
                return `${contracts_1.STATUS_TERMS.filesystemChangedSincePreview}. Regenerate patch preview and retry. ${contracts_1.STATUS_TERMS.retrySafe}.`;
            }
            return (typeof patchData.message === 'string' && patchData.message.trim().length > 0)
                ? patchData.message
                : `${contracts_1.STATUS_TERMS.patchRejected}; no deterministic file-scoped change applied`;
        })();
        const reverifyRequired = patchStatus === 'applied' || patchStatus === 'partial';
        const stateLabel = patchStatus === 'stale_preview'
            ? contracts_1.STATUS_TERMS.filesystemChangedSincePreview.toLowerCase()
            : (0, contracts_1.toPatchStateLabel)(patchStatus).toLowerCase();
        recordPatchOutcome(patchStatus);
        const normalizedVerifyPayload = (0, shaping_1.normalizeVerifyPayloadForLegacyClients)(run.verificationPayload);
        success(res, {
            patch: {
                ...patchData,
                file: payloadFile || targetPath,
                success: patchStatus === 'applied',
                rawSuccess: patchData.success === true,
                changed,
                status: patchStatus,
                targetMatch: payloadTargetMatch,
                sideEffects: combinedSideEffects,
                message: patchMessage,
                reverifyRequired,
                stateLabel,
                previewTokenUsed: previewToken ? true : false,
            },
            verify: normalizedVerifyPayload ?? null,
            execution: run.execution,
            _execution: (0, shaping_1.buildExecutionResponseMeta)(run),
        });
    }
    async function handlePatchRollback(req, res) {
        let body = {};
        try {
            body = JSON.parse(await readBody(req));
        }
        catch {
            failure(res, 'Invalid JSON body', 400);
            return;
        }
        const file = body.file;
        const receiptId = typeof body.receiptId === 'string' ? body.receiptId.trim() : '';
        if (!file || typeof file !== 'string' || file.includes('..')) {
            failure(res, 'Missing or unsafe "file" field', 400);
            return;
        }
        if (!receiptId) {
            failure(res, 'Missing "receiptId" field', 400);
            return;
        }
        const cwd = process.cwd();
        const targetPath = file.trim();
        const absPath = path.resolve(cwd, targetPath);
        const beforeDirtyPaths = captureGitDirtyPaths(cwd);
        const beforeDirtyFingerprints = captureDirtyFileFingerprints(cwd);
        let contentBefore = null;
        try {
            contentBefore = fs.readFileSync(absPath, 'utf-8');
        }
        catch { /* file may not exist */ }
        const run = await (0, execution_bus_1.runExecution)({
            type: 'patch',
            source: toSource(req),
            actor: toActor(req),
            target: targetPath,
            cwd,
            reverify: true,
            primaryArgs: ['patch', '--file', targetPath, '--rollback-receipt', receiptId, '--json'],
        });
        const patchData = run.primaryPayload ?? {
            success: false,
            file: targetPath,
            message: run.execution.result?.message || 'No rollback receipt could be applied',
        };
        let changed = false;
        if (patchData.success && contentBefore !== null) {
            try {
                const contentAfter = fs.readFileSync(absPath, 'utf-8');
                changed = contentAfter !== contentBefore;
            }
            catch {
                // ignore read error
            }
        }
        const afterDirtyPaths = captureGitDirtyPaths(cwd);
        const afterDirtyFingerprints = captureDirtyFileFingerprints(cwd);
        const sideEffects = collectUnexpectedPatchSideEffects(beforeDirtyPaths, afterDirtyPaths, absPath, cwd);
        const mutatedSideEffects = collectUnexpectedPatchMutations(beforeDirtyFingerprints, afterDirtyFingerprints, absPath, cwd);
        const combinedSideEffects = [...new Set([...sideEffects, ...mutatedSideEffects])].sort();
        const payloadFile = typeof patchData.file === 'string' ? patchData.file : '';
        const payloadTargetMatch = payloadFile.length > 0
            ? path.resolve(cwd, payloadFile) === absPath
            : true;
        const rawStatus = typeof patchData.status === 'string' ? patchData.status : '';
        const rollbackStatus = rawStatus === 'rollback_applied'
            ? 'rollback_applied'
            : rawStatus === 'rollback_stale' || rawStatus === 'filesystem_changed_since_patch'
                ? 'rollback_stale'
                : 'rollback_rejected';
        const rollbackSucceeded = patchData.success === true && rollbackStatus === 'rollback_applied' && payloadTargetMatch && combinedSideEffects.length === 0;
        const rollbackMessage = (() => {
            if (rollbackSucceeded) {
                return (typeof patchData.message === 'string' && patchData.message.trim().length > 0)
                    ? patchData.message
                    : contracts_1.STATUS_TERMS.rollbackApplied;
            }
            if (!payloadTargetMatch) {
                return `${contracts_1.STATUS_TERMS.patchRejected}: rollback receipt target mismatch detected.`;
            }
            if (combinedSideEffects.length > 0) {
                return `${contracts_1.STATUS_TERMS.patchRejected}: rollback side effects detected in ${combinedSideEffects.length} additional file(s).`;
            }
            return (typeof patchData.message === 'string' && patchData.message.trim().length > 0)
                ? patchData.message
                : contracts_1.STATUS_TERMS.patchRejected;
        })();
        recordPatchOutcome(rollbackStatus);
        success(res, {
            patch: {
                ...patchData,
                file: payloadFile || targetPath,
                success: rollbackSucceeded,
                rawSuccess: patchData.success === true,
                changed,
                status: rollbackStatus,
                targetMatch: payloadTargetMatch,
                sideEffects: combinedSideEffects,
                message: rollbackMessage,
                reverifyRequired: rollbackSucceeded,
                stateLabel: rollbackSucceeded
                    ? contracts_1.STATUS_TERMS.rollbackApplied.toLowerCase()
                    : rollbackStatus === 'rollback_stale'
                        ? contracts_1.STATUS_TERMS.filesystemChangedSincePreview.toLowerCase()
                        : contracts_1.STATUS_TERMS.patchRejected.toLowerCase(),
                previewTokenUsed: false,
            },
            verify: (0, shaping_1.normalizeVerifyPayloadForLegacyClients)(run.verificationPayload) ?? null,
            execution: run.execution,
            _execution: (0, shaping_1.buildExecutionResponseMeta)(run),
        });
    }
    async function handlePatchPreview(req, res) {
        let body = {};
        try {
            body = JSON.parse(await readBody(req));
        }
        catch {
            failure(res, 'Invalid JSON body', 400);
            return;
        }
        const file = body.file;
        if (!file || typeof file !== 'string' || file.includes('..')) {
            failure(res, 'Missing or unsafe "file" field', 400);
            return;
        }
        const cwd = process.cwd();
        const targetPath = file.trim();
        const absPath = path.resolve(cwd, targetPath);
        let contentBefore = '';
        try {
            contentBefore = fs.readFileSync(absPath, 'utf-8');
        }
        catch {
            failure(res, `File not found: ${targetPath}`, 404);
            return;
        }
        const preview = (0, patch_engine_1.applyFirstMatchingPatch)(targetPath, contentBefore);
        if (!preview) {
            success(res, {
                success: false,
                file: targetPath,
                status: 'rejected',
                message: `No deterministic patch preview available for ${targetPath}`,
                beforeContent: contentBefore,
                afterContent: null,
                diff: null,
                changed: false,
                patternKind: null,
                patchConfidence: null,
                patchHash: null,
                previewToken: null,
                validation: null,
                recipe: null,
                pattern: null,
                whatChanges: null,
                rollbackPreviewDiff: null,
                whySafe: null,
                manualReviewRequired: true,
                supportedDeterministicPattern: false,
                reasoning: null,
            });
            return;
        }
        const reasoning = buildPatchPreviewReasoning(preview.patternKind, targetPath, contentBefore);
        const rollbackPreviewDiff = (0, diff_1.generateUnifiedDiff)(targetPath, preview.updatedContent, contentBefore);
        const changeSummary = summarizeDiff(preview.diff);
        const manualReviewRequired = preview.patchConfidence === 'low'
            || preview.validation.safe !== true
            || preview.recipe.requiresManualReview === true;
        const pattern = patternDescriptor(preview.patternKind, preview.patchConfidence, manualReviewRequired);
        const whySafe = {
            deterministic: true,
            validationPassed: preview.validation.safe === true,
            confidence: preview.patchConfidence,
            checks: preview.validation.checks,
            reasonCodes: preview.validation.reasonCodes,
        };
        if (!preview.validation.safe) {
            success(res, {
                success: false,
                file: targetPath,
                status: 'rejected',
                message: `Patch preview rejected by deterministic safety validation (${preview.validation.reasonCodes.join(', ') || 'unknown'}).`,
                beforeContent: contentBefore,
                afterContent: null,
                diff: preview.diff,
                changed: false,
                patternKind: preview.patternKind,
                patchConfidence: preview.patchConfidence,
                patchHash: preview.patchHash,
                previewToken: preview.previewToken,
                validation: preview.validation,
                recipe: preview.recipe,
                pattern,
                whatChanges: changeSummary,
                rollbackPreviewDiff,
                whySafe,
                manualReviewRequired,
                supportedDeterministicPattern: true,
                reasoning,
            });
            return;
        }
        success(res, {
            success: true,
            file: targetPath,
            status: 'preview',
            message: 'Patch preview generated',
            beforeContent: contentBefore,
            afterContent: preview.updatedContent,
            diff: preview.diff,
            changed: contentBefore !== preview.updatedContent,
            patternKind: preview.patternKind,
            patchConfidence: preview.patchConfidence,
            patchHash: preview.patchHash,
            previewToken: preview.previewToken,
            validation: preview.validation,
            recipe: preview.recipe,
            pattern,
            whatChanges: changeSummary,
            rollbackPreviewDiff,
            whySafe,
            manualReviewRequired,
            supportedDeterministicPattern: true,
            reasoning,
        });
    }
    return {
        handleFix,
        handleFixApplySafe,
        handlePatch,
        handlePatchRollback,
        handlePatchPreview,
    };
}
//# sourceMappingURL=mutation.js.map