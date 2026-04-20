"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChangeContract = createChangeContract;
exports.resolveChangeContractPath = resolveChangeContractPath;
exports.writeChangeContract = writeChangeContract;
exports.readChangeContract = readChangeContract;
exports.evaluateChangeContract = evaluateChangeContract;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
function normalizeRepoPath(value) {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function uniqueSorted(values) {
    const set = new Set();
    for (const value of values) {
        const normalized = normalizeRepoPath(value);
        if (!normalized)
            continue;
        set.add(normalized);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
}
function sha256Hex(input) {
    return (0, crypto_1.createHash)('sha256').update(input, 'utf-8').digest('hex');
}
function fingerprintFiles(expectedFiles) {
    return sha256Hex(JSON.stringify(uniqueSorted(expectedFiles)));
}
function normalizePlanAction(value) {
    if (value === 'CREATE' || value === 'MODIFY' || value === 'BLOCK') {
        return value;
    }
    return null;
}
function normalizeSymbolAction(value) {
    if (value === 'CREATE' || value === 'MODIFY' || value === 'BLOCK') {
        return value;
    }
    return null;
}
function normalizeSymbolType(value) {
    if (!value)
        return null;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'function'
        || normalized === 'class'
        || normalized === 'interface'
        || normalized === 'type'
        || normalized === 'method'
        || normalized === 'const'
        || normalized === 'unknown') {
        return normalized;
    }
    return null;
}
function normalizeDiffSymbolAction(value) {
    if (value === 'add' || value === 'delete' || value === 'modify') {
        return value;
    }
    return null;
}
function sanitizePlanFiles(planFiles) {
    if (!Array.isArray(planFiles))
        return [];
    const deduped = new Map();
    for (const item of planFiles) {
        if (!item || typeof item !== 'object')
            continue;
        const path = normalizeRepoPath(item.path || '');
        const action = normalizePlanAction(item.action);
        if (!path || !action)
            continue;
        const existing = deduped.get(path);
        if (!existing) {
            deduped.set(path, {
                path,
                action,
                ...(item.reason ? { reason: String(item.reason).trim().slice(0, 240) } : {}),
            });
            continue;
        }
        // Keep the stricter action when duplicate file entries appear.
        if (existing.action !== 'BLOCK' && action === 'BLOCK') {
            deduped.set(path, {
                path,
                action,
                ...(item.reason ? { reason: String(item.reason).trim().slice(0, 240) } : {}),
            });
            continue;
        }
        if (existing.action === 'MODIFY' && action === 'CREATE') {
            deduped.set(path, {
                path,
                action,
                ...(item.reason ? { reason: String(item.reason).trim().slice(0, 240) } : {}),
            });
            continue;
        }
        if (!existing.reason && item.reason) {
            deduped.set(path, {
                ...existing,
                reason: String(item.reason).trim().slice(0, 240),
            });
        }
    }
    return [...deduped.values()].sort((a, b) => a.path.localeCompare(b.path));
}
function sanitizeExpectedSymbols(expectedSymbols) {
    if (!Array.isArray(expectedSymbols))
        return [];
    const actionPrecedence = {
        MODIFY: 1,
        CREATE: 2,
        BLOCK: 3,
    };
    const deduped = new Map();
    for (const item of expectedSymbols) {
        if (!item || typeof item !== 'object')
            continue;
        const name = String(item.name || '').trim().replace(/^['"`]+|['"`]+$/g, '').replace(/\(\)\s*$/, '');
        const action = normalizeSymbolAction(item.action);
        const normalizedType = normalizeSymbolType(item.type || undefined);
        const file = typeof item.file === 'string' && item.file.trim()
            ? normalizeRepoPath(item.file)
            : undefined;
        if (!name || !action)
            continue;
        const key = `${file || '*'}::${normalizedType || 'unknown'}::${name}`;
        const reason = item.reason ? String(item.reason).trim().slice(0, 240) : undefined;
        const nextEntry = {
            name,
            action,
            ...(normalizedType ? { type: normalizedType } : {}),
            ...(file ? { file } : {}),
            ...(reason ? { reason } : {}),
        };
        const existing = deduped.get(key);
        if (!existing) {
            deduped.set(key, nextEntry);
            continue;
        }
        if (actionPrecedence[nextEntry.action] > actionPrecedence[existing.action]) {
            deduped.set(key, nextEntry);
            continue;
        }
        if (!existing.reason && nextEntry.reason) {
            deduped.set(key, {
                ...existing,
                reason: nextEntry.reason,
            });
        }
    }
    return [...deduped.values()].sort((a, b) => {
        const fileA = a.file || '';
        const fileB = b.file || '';
        if (fileA !== fileB)
            return fileA.localeCompare(fileB);
        if (a.name !== b.name)
            return a.name.localeCompare(b.name);
        return (a.type || '').localeCompare(b.type || '');
    });
}
function sanitizeChangedSymbols(changedSymbols) {
    if (!Array.isArray(changedSymbols))
        return [];
    const deduped = new Map();
    for (const item of changedSymbols) {
        if (!item || typeof item !== 'object')
            continue;
        const name = String(item.name || '').trim().replace(/^['"`]+|['"`]+$/g, '').replace(/\(\)\s*$/, '');
        const action = normalizeDiffSymbolAction(item.action);
        const type = normalizeSymbolType(item.type || undefined) || 'unknown';
        const file = typeof item.file === 'string' && item.file.trim()
            ? normalizeRepoPath(item.file)
            : null;
        if (!name || !action)
            continue;
        const key = `${file || '*'}::${type}::${name}`;
        const existing = deduped.get(key);
        if (!existing) {
            deduped.set(key, { name, action, type, file });
            continue;
        }
        if (existing.action !== 'modify' && action === 'modify') {
            deduped.set(key, { name, action, type, file });
            continue;
        }
        if (existing.action === 'delete' && action === 'add') {
            deduped.set(key, { name, action, type, file });
        }
    }
    return [...deduped.values()].sort((a, b) => {
        const fileA = a.file || '';
        const fileB = b.file || '';
        if (fileA !== fileB)
            return fileA.localeCompare(fileB);
        if (a.name !== b.name)
            return a.name.localeCompare(b.name);
        return a.type.localeCompare(b.type);
    });
}
function sanitizeContractOptions(options) {
    if (!options || typeof options !== 'object')
        return undefined;
    const next = {};
    if (typeof options.enforceExpectedFiles === 'boolean') {
        next.enforceExpectedFiles = options.enforceExpectedFiles;
    }
    if (typeof options.enforceActionMatching === 'boolean') {
        next.enforceActionMatching = options.enforceActionMatching;
    }
    if (typeof options.allowRenameForModify === 'boolean') {
        next.allowRenameForModify = options.allowRenameForModify;
    }
    if (typeof options.enforceExpectedSymbols === 'boolean') {
        next.enforceExpectedSymbols = options.enforceExpectedSymbols;
    }
    if (typeof options.enforceSymbolActionMatching === 'boolean') {
        next.enforceSymbolActionMatching = options.enforceSymbolActionMatching;
    }
    return Object.keys(next).length > 0 ? next : undefined;
}
function isContractOptions(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const record = value;
    const booleanOrUndefined = (key) => record[key] === undefined || typeof record[key] === 'boolean';
    return (booleanOrUndefined('enforceExpectedFiles')
        && booleanOrUndefined('enforceActionMatching')
        && booleanOrUndefined('allowRenameForModify')
        && booleanOrUndefined('enforceExpectedSymbols')
        && booleanOrUndefined('enforceSymbolActionMatching'));
}
function isPlanFileEntry(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const record = value;
    if (typeof record.path !== 'string')
        return false;
    const action = typeof record.action === 'string' ? normalizePlanAction(record.action) : null;
    if (!action)
        return false;
    if (record.reason !== undefined && typeof record.reason !== 'string')
        return false;
    return true;
}
function isExpectedSymbolEntry(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const record = value;
    if (typeof record.name !== 'string')
        return false;
    const action = typeof record.action === 'string' ? normalizeSymbolAction(record.action) : null;
    if (!action)
        return false;
    if (record.type !== undefined) {
        const normalizedType = typeof record.type === 'string' ? normalizeSymbolType(record.type) : null;
        if (!normalizedType)
            return false;
    }
    if (record.file !== undefined && typeof record.file !== 'string')
        return false;
    if (record.reason !== undefined && typeof record.reason !== 'string')
        return false;
    return true;
}
function isChangeContract(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const record = value;
    const basicShape = (record.schemaVersion === 1 &&
        typeof record.generatedAt === 'string' &&
        typeof record.contractId === 'string' &&
        typeof record.planId === 'string' &&
        Array.isArray(record.expectedFiles) &&
        typeof record.expectedFilesFingerprint === 'string');
    if (!basicShape) {
        return false;
    }
    if (record.signature !== undefined) {
        if (!record.signature || typeof record.signature !== 'object' || Array.isArray(record.signature)) {
            return false;
        }
        const signature = record.signature;
        if (signature.algorithm !== 'hmac-sha256' ||
            typeof signature.signedAt !== 'string' ||
            typeof signature.payloadHash !== 'string' ||
            typeof signature.value !== 'string') {
            return false;
        }
        if (signature.keyId !== null && signature.keyId !== undefined && typeof signature.keyId !== 'string') {
            return false;
        }
    }
    if (record.planFiles !== undefined) {
        if (!Array.isArray(record.planFiles)) {
            return false;
        }
        if (!record.planFiles.every((entry) => isPlanFileEntry(entry))) {
            return false;
        }
    }
    if (record.expectedSymbols !== undefined) {
        if (!Array.isArray(record.expectedSymbols)) {
            return false;
        }
        if (!record.expectedSymbols.every((entry) => isExpectedSymbolEntry(entry))) {
            return false;
        }
    }
    if (record.options !== undefined && !isContractOptions(record.options)) {
        return false;
    }
    return true;
}
function createChangeContract(input) {
    const expectedFiles = uniqueSorted(input.expectedFiles);
    const planFiles = sanitizePlanFiles(input.planFiles);
    const expectedSymbols = sanitizeExpectedSymbols(input.expectedSymbols);
    const options = sanitizeContractOptions(input.options);
    const generatedAt = input.generatedAt || new Date().toISOString();
    const intentHash = sha256Hex(input.intent || '');
    const expectedFilesFingerprint = fingerprintFiles(expectedFiles);
    const contractId = sha256Hex(JSON.stringify({
        generatedAt,
        planId: input.planId,
        sessionId: input.sessionId || null,
        projectId: input.projectId || null,
        intentHash,
        expectedFilesFingerprint,
        ...(planFiles.length > 0 ? { planFiles } : {}),
        ...(expectedSymbols.length > 0 ? { expectedSymbols } : {}),
        ...(options ? { options } : {}),
        policyLockFingerprint: input.policyLockFingerprint || null,
        compiledPolicyFingerprint: input.compiledPolicyFingerprint || null,
    }));
    return {
        schemaVersion: 1,
        generatedAt,
        contractId,
        planId: input.planId,
        sessionId: input.sessionId || null,
        projectId: input.projectId || null,
        intentHash,
        expectedFiles,
        expectedFilesFingerprint,
        ...(planFiles.length > 0 ? { planFiles } : {}),
        ...(expectedSymbols.length > 0 ? { expectedSymbols } : {}),
        ...(options ? { options } : {}),
        policyLockFingerprint: input.policyLockFingerprint || null,
        compiledPolicyFingerprint: input.compiledPolicyFingerprint || null,
    };
}
function resolveChangeContractPath(projectRoot, inputPath) {
    const target = inputPath && inputPath.trim().length > 0 ? inputPath.trim() : '.neurcode/change-contract.json';
    return (0, path_1.resolve)(projectRoot, target);
}
function writeChangeContract(projectRoot, contract, outputPath) {
    const path = resolveChangeContractPath(projectRoot, outputPath);
    const dir = (0, path_1.dirname)(path);
    if (!(0, fs_1.existsSync)(dir)) {
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    }
    (0, fs_1.writeFileSync)(path, `${JSON.stringify(contract, null, 2)}\n`, 'utf-8');
    return path;
}
function readChangeContract(projectRoot, inputPath) {
    const path = resolveChangeContractPath(projectRoot, inputPath);
    if (!(0, fs_1.existsSync)(path)) {
        return { path, exists: false, contract: null };
    }
    try {
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!isChangeContract(parsed)) {
            return { path, exists: true, contract: null, error: 'Invalid change contract schema' };
        }
        return { path, exists: true, contract: parsed };
    }
    catch (error) {
        return {
            path,
            exists: true,
            contract: null,
            error: error instanceof Error ? error.message : 'Failed to parse change contract',
        };
    }
}
function evaluateChangeContract(contract, input) {
    const violations = [];
    if (contract.planId !== input.planId) {
        violations.push({
            code: 'CHANGE_CONTRACT_PLAN_MISMATCH',
            message: `Change contract plan mismatch (expected ${contract.planId}, got ${input.planId})`,
            expected: contract.planId,
            actual: input.planId,
        });
    }
    if (contract.policyLockFingerprint &&
        input.policyLockFingerprint &&
        contract.policyLockFingerprint !== input.policyLockFingerprint) {
        violations.push({
            code: 'CHANGE_CONTRACT_POLICY_LOCK_MISMATCH',
            message: 'Policy lock fingerprint does not match change contract',
            expected: contract.policyLockFingerprint,
            actual: input.policyLockFingerprint,
        });
    }
    if (contract.compiledPolicyFingerprint &&
        input.compiledPolicyFingerprint &&
        contract.compiledPolicyFingerprint !== input.compiledPolicyFingerprint) {
        violations.push({
            code: 'CHANGE_CONTRACT_COMPILED_POLICY_MISMATCH',
            message: 'Compiled policy fingerprint does not match change contract',
            expected: contract.compiledPolicyFingerprint,
            actual: input.compiledPolicyFingerprint,
        });
    }
    const expectedSet = new Set(uniqueSorted(contract.expectedFiles));
    const normalizedChanged = uniqueSorted(input.changedFiles);
    const changedSet = new Set(normalizedChanged);
    const normalizedChangedEntries = (input.changedFileEntries || [])
        .map((entry) => ({
        path: normalizeRepoPath(entry.path || ''),
        changeType: entry.changeType,
    }))
        .filter((entry) => (entry.path.length > 0
        && (entry.changeType === 'add' || entry.changeType === 'delete' || entry.changeType === 'modify' || entry.changeType === 'rename')));
    const changedEntryByPath = new Map();
    for (const entry of normalizedChangedEntries) {
        if (!changedEntryByPath.has(entry.path)) {
            changedEntryByPath.set(entry.path, entry.changeType);
        }
    }
    const planFileEntries = sanitizePlanFiles(contract.planFiles);
    const planFileByPath = new Map(planFileEntries.map((item) => [item.path, item]));
    const expectedSymbols = sanitizeExpectedSymbols(contract.expectedSymbols);
    const changedSymbols = sanitizeChangedSymbols(input.changedSymbols);
    for (const path of normalizedChanged) {
        const planEntry = planFileByPath.get(path);
        if (planEntry && planEntry.action === 'BLOCK') {
            violations.push({
                code: 'CHANGE_CONTRACT_BLOCKED_FILE_TOUCHED',
                message: `File changed despite BLOCK action in change contract: ${path}`,
                file: path,
            });
            continue;
        }
        if (!expectedSet.has(path)) {
            violations.push({
                code: 'CHANGE_CONTRACT_UNEXPECTED_FILE',
                message: `File changed outside change contract: ${path}`,
                file: path,
            });
        }
    }
    const enforceExpectedFiles = contract.options?.enforceExpectedFiles === true;
    if (enforceExpectedFiles) {
        for (const path of expectedSet) {
            if (!changedSet.has(path)) {
                violations.push({
                    code: 'CHANGE_CONTRACT_MISSING_EXPECTED_FILE',
                    message: `Expected file was not changed: ${path}`,
                    file: path,
                });
            }
        }
    }
    const enforceActionMatching = contract.options?.enforceActionMatching === true;
    const allowRenameForModify = contract.options?.allowRenameForModify !== false;
    if (enforceActionMatching && changedEntryByPath.size > 0 && planFileByPath.size > 0) {
        for (const [path, actualChangeType] of changedEntryByPath.entries()) {
            const planned = planFileByPath.get(path);
            if (!planned || planned.action === 'BLOCK') {
                continue;
            }
            const allowedForPlan = planned.action === 'CREATE'
                ? ['add']
                : allowRenameForModify
                    ? ['modify', 'rename']
                    : ['modify'];
            if (!allowedForPlan.includes(actualChangeType)) {
                violations.push({
                    code: 'CHANGE_CONTRACT_ACTION_MISMATCH',
                    message: `File action mismatch for ${path}: planned ${planned.action}, got ${actualChangeType}`,
                    file: path,
                    expected: planned.action,
                    actual: actualChangeType,
                });
            }
        }
    }
    const enforceExpectedSymbols = contract.options?.enforceExpectedSymbols === true;
    const enforceSymbolActionMatching = contract.options?.enforceSymbolActionMatching === true;
    if (expectedSymbols.length > 0) {
        for (const expectedSymbol of expectedSymbols) {
            const symbolMatches = changedSymbols.filter((actualSymbol) => {
                if (actualSymbol.name !== expectedSymbol.name)
                    return false;
                if (expectedSymbol.type && expectedSymbol.type !== 'unknown' && actualSymbol.type !== 'unknown') {
                    if (actualSymbol.type !== expectedSymbol.type)
                        return false;
                }
                if (expectedSymbol.file) {
                    if (!actualSymbol.file || actualSymbol.file !== expectedSymbol.file)
                        return false;
                }
                return true;
            });
            if (expectedSymbol.action === 'BLOCK') {
                if (symbolMatches.length > 0) {
                    violations.push({
                        code: 'CHANGE_CONTRACT_BLOCKED_SYMBOL_TOUCHED',
                        message: `Symbol changed despite BLOCK action in change contract: ${expectedSymbol.name}` +
                            `${expectedSymbol.file ? ` (${expectedSymbol.file})` : ''}`,
                        file: expectedSymbol.file || symbolMatches[0]?.file || undefined,
                        symbol: expectedSymbol.name,
                        symbolType: expectedSymbol.type,
                    });
                }
                continue;
            }
            const allowedActions = expectedSymbol.action === 'CREATE'
                ? ['add']
                : ['add', 'modify'];
            const hasAllowedAction = symbolMatches.some((match) => allowedActions.includes(match.action));
            if (enforceExpectedSymbols && symbolMatches.length === 0) {
                violations.push({
                    code: 'CHANGE_CONTRACT_MISSING_EXPECTED_SYMBOL',
                    message: `Expected symbol was not changed: ${expectedSymbol.name}` +
                        `${expectedSymbol.file ? ` (${expectedSymbol.file})` : ''}`,
                    file: expectedSymbol.file,
                    symbol: expectedSymbol.name,
                    symbolType: expectedSymbol.type,
                    expected: expectedSymbol.action,
                });
            }
            if (enforceSymbolActionMatching && symbolMatches.length > 0 && !hasAllowedAction) {
                violations.push({
                    code: 'CHANGE_CONTRACT_SYMBOL_ACTION_MISMATCH',
                    message: `Symbol action mismatch for ${expectedSymbol.name}: planned ${expectedSymbol.action}, got ${symbolMatches
                        .map((item) => item.action)
                        .join(',')}`,
                    file: expectedSymbol.file || symbolMatches[0]?.file || undefined,
                    symbol: expectedSymbol.name,
                    symbolType: expectedSymbol.type,
                    expected: expectedSymbol.action,
                    actual: symbolMatches.map((item) => item.action).join(','),
                });
            }
        }
    }
    const outOfContractFiles = violations.filter((violation) => violation.code === 'CHANGE_CONTRACT_UNEXPECTED_FILE').length;
    const missingExpectedFiles = violations.filter((violation) => violation.code === 'CHANGE_CONTRACT_MISSING_EXPECTED_FILE').length;
    const blockedFilesTouched = violations.filter((violation) => violation.code === 'CHANGE_CONTRACT_BLOCKED_FILE_TOUCHED').length;
    const actionMismatches = violations.filter((violation) => violation.code === 'CHANGE_CONTRACT_ACTION_MISMATCH').length;
    const missingExpectedSymbols = violations.filter((violation) => violation.code === 'CHANGE_CONTRACT_MISSING_EXPECTED_SYMBOL').length;
    const blockedSymbolsTouched = violations.filter((violation) => violation.code === 'CHANGE_CONTRACT_BLOCKED_SYMBOL_TOUCHED').length;
    const symbolActionMismatches = violations.filter((violation) => violation.code === 'CHANGE_CONTRACT_SYMBOL_ACTION_MISMATCH').length;
    return {
        valid: violations.length === 0,
        violations,
        coverage: {
            expectedFiles: expectedSet.size,
            changedFiles: normalizedChanged.length,
            outOfContractFiles,
            missingExpectedFiles,
            blockedFilesTouched,
            actionMismatches,
            expectedSymbols: expectedSymbols.length,
            changedSymbols: changedSymbols.length,
            missingExpectedSymbols,
            blockedSymbolsTouched,
            symbolActionMismatches,
        },
    };
}
//# sourceMappingURL=change-contract.js.map