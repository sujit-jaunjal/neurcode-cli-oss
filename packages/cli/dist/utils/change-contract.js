"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChangeContract = createChangeContract;
exports.resolveChangeContractPath = resolveChangeContractPath;
exports.writeChangeContract = writeChangeContract;
exports.readChangeContract = readChangeContract;
exports.evaluateChangeContract = evaluateChangeContract;
exports.groupChangeContractViolations = groupChangeContractViolations;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
function normalizeRepoPath(value) {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function toPathSegments(pathValue) {
    return normalizeRepoPath(pathValue).split('/').filter(Boolean);
}
function isDependencyManifestPath(pathValue) {
    const normalized = normalizeRepoPath(pathValue).toLowerCase();
    return (normalized === 'package.json'
        || normalized === 'package-lock.json'
        || normalized === 'pnpm-lock.yaml'
        || normalized === 'yarn.lock'
        || normalized === 'bun.lockb'
        || normalized === 'requirements.txt'
        || normalized === 'requirements-dev.txt'
        || normalized === 'pyproject.toml'
        || normalized === 'poetry.lock'
        || normalized === 'pipfile'
        || normalized === 'pipfile.lock'
        || normalized === 'go.mod'
        || normalized === 'go.sum'
        || normalized === 'cargo.toml'
        || normalized === 'cargo.lock'
        || normalized === 'pom.xml'
        || normalized.endsWith('/package.json')
        || normalized.endsWith('/pnpm-lock.yaml')
        || normalized.endsWith('/yarn.lock')
        || normalized.endsWith('/requirements.txt')
        || normalized.endsWith('/pyproject.toml')
        || normalized.endsWith('/poetry.lock')
        || normalized.endsWith('/go.mod')
        || normalized.endsWith('/go.sum')
        || normalized.endsWith('/cargo.toml')
        || normalized.endsWith('/cargo.lock')
        || normalized.endsWith('/pom.xml'));
}
function isInfraBoundaryPath(pathValue) {
    const normalized = normalizeRepoPath(pathValue).toLowerCase();
    return (/^(\.github\/workflows|infra\/|terraform\/|k8s\/|kubernetes\/|helm\/|ansible\/|iac\/|cloudformation\/|pulumi\/)/.test(normalized)
        || /(\/|^)(infra|terraform|k8s|kubernetes|helm|ansible|iac|cloudformation|pulumi)(\/|$)/.test(normalized));
}
function classifySensitiveBoundary(pathValue) {
    const normalized = normalizeRepoPath(pathValue).toLowerCase();
    if (/\b(auth|rbac|permission|acl|identity|oauth|session|jwt)\b/.test(normalized)) {
        return 'auth';
    }
    if (/\b(payment|billing|invoice|refund|wallet|checkout|webhook)\b/.test(normalized)) {
        return 'payment';
    }
    if (/\b(db|database|prisma|migration|sql|repository|repositories)\b/.test(normalized)) {
        return 'data';
    }
    if (/\b(queue|worker|consumer|producer|kafka|rabbit|sqs|pubsub|event|events)\b/.test(normalized)) {
        return 'queue';
    }
    if (/\b(route|routes|controller|controllers|handler|handlers|api|openapi|graphql|proto)\b/.test(normalized)) {
        return 'api';
    }
    return null;
}
function deriveScopeAnchor(pathValue) {
    const segments = toPathSegments(pathValue);
    if (segments.length === 0)
        return null;
    const [first, second, third] = segments;
    if ((first === 'services' || first === 'apps' || first === 'packages' || first === 'web') && second) {
        return `${first}:${second}`;
    }
    if (first === 'src' && second) {
        return `src:${second}`;
    }
    if ((first === 'server' || first === 'client') && second) {
        return `${first}:${second}`;
    }
    if ((first === 'api' || first === 'routes' || first === 'controllers') && second) {
        return `${first}:${second}`;
    }
    if (first === '.github' && second === 'workflows') {
        return '.github:workflows';
    }
    if ((first === 'infra' || first === 'terraform' || first === 'k8s' || first === 'kubernetes' || first === 'helm') && second) {
        return `${first}:${second}`;
    }
    if (first === 'auth'
        || first === 'payment'
        || first === 'billing'
        || first === 'db'
        || first === 'database'
        || first === 'queue'
        || first === 'worker'
        || first === 'workers') {
        return first;
    }
    return null;
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
function parseNonNegativeInteger(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return undefined;
    const rounded = Math.floor(parsed);
    if (rounded < 0)
        return undefined;
    return rounded;
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
    if (typeof options.symbolTypeRelaxedMatching === 'boolean') {
        next.symbolTypeRelaxedMatching = options.symbolTypeRelaxedMatching;
    }
    if (typeof options.symbolFileBasenameFallback === 'boolean') {
        next.symbolFileBasenameFallback = options.symbolFileBasenameFallback;
    }
    const maxUnexpectedFiles = parseNonNegativeInteger(options.maxUnexpectedFiles);
    if (maxUnexpectedFiles !== undefined) {
        next.maxUnexpectedFiles = maxUnexpectedFiles;
    }
    const maxMissingExpectedSymbols = parseNonNegativeInteger(options.maxMissingExpectedSymbols);
    if (maxMissingExpectedSymbols !== undefined) {
        next.maxMissingExpectedSymbols = maxMissingExpectedSymbols;
    }
    return Object.keys(next).length > 0 ? next : undefined;
}
function isContractOptions(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const record = value;
    const booleanOrUndefined = (key) => record[key] === undefined || typeof record[key] === 'boolean';
    const nonNegativeIntegerOrUndefined = (key) => record[key] === undefined || parseNonNegativeInteger(record[key]) !== undefined;
    return (booleanOrUndefined('enforceExpectedFiles')
        && booleanOrUndefined('enforceActionMatching')
        && booleanOrUndefined('allowRenameForModify')
        && booleanOrUndefined('enforceExpectedSymbols')
        && booleanOrUndefined('enforceSymbolActionMatching')
        && booleanOrUndefined('symbolTypeRelaxedMatching')
        && booleanOrUndefined('symbolFileBasenameFallback')
        && nonNegativeIntegerOrUndefined('maxUnexpectedFiles')
        && nonNegativeIntegerOrUndefined('maxMissingExpectedSymbols'));
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
function toFileBasename(pathValue) {
    if (!pathValue)
        return null;
    const normalized = normalizeRepoPath(pathValue);
    if (!normalized)
        return null;
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}
function areSymbolTypesCompatible(expectedType, actualType, relaxedMatching) {
    if (!expectedType || expectedType === 'unknown' || actualType === 'unknown') {
        return true;
    }
    if (expectedType === actualType) {
        return true;
    }
    if (!relaxedMatching) {
        return false;
    }
    if (expectedType === 'function') {
        return actualType === 'method' || actualType === 'const';
    }
    if (expectedType === 'method') {
        return actualType === 'function';
    }
    if (expectedType === 'const') {
        return actualType === 'function' || actualType === 'method';
    }
    return false;
}
function doesSymbolFileMatch(expectedFile, actualFile, allowSymbolFileBasenameFallback) {
    if (!expectedFile) {
        return true;
    }
    if (actualFile && actualFile === expectedFile) {
        return true;
    }
    if (!allowSymbolFileBasenameFallback) {
        return false;
    }
    const expectedBasename = toFileBasename(expectedFile);
    const actualBasename = toFileBasename(actualFile);
    if (!expectedBasename || !actualBasename || expectedBasename !== actualBasename) {
        return false;
    }
    return true;
}
function hasLikelyRenameForExpectedSymbol(expectedSymbol, changedSymbols, options) {
    if (expectedSymbol.action !== 'MODIFY')
        return false;
    const deletedMatches = changedSymbols.filter((actualSymbol) => (actualSymbol.action === 'delete'
        && actualSymbol.name === expectedSymbol.name
        && areSymbolTypesCompatible(expectedSymbol.type, actualSymbol.type, options.relaxedSymbolTypeMatching)
        && doesSymbolFileMatch(expectedSymbol.file, actualSymbol.file, options.allowSymbolFileBasenameFallback)));
    if (deletedMatches.length === 0) {
        return false;
    }
    for (const deletedSymbol of deletedMatches) {
        const replacementExists = changedSymbols.some((actualSymbol) => {
            if (actualSymbol.action !== 'add' && actualSymbol.action !== 'modify')
                return false;
            if (actualSymbol.name === expectedSymbol.name)
                return false;
            if (!areSymbolTypesCompatible(expectedSymbol.type, actualSymbol.type, options.relaxedSymbolTypeMatching)) {
                return false;
            }
            // When file is known, prefer a same-file replacement for rename-like edits.
            if (deletedSymbol.file && actualSymbol.file && deletedSymbol.file === actualSymbol.file) {
                return true;
            }
            // Fallback to expected file scope matching.
            return doesSymbolFileMatch(expectedSymbol.file, actualSymbol.file, options.allowSymbolFileBasenameFallback);
        });
        if (replacementExists) {
            return true;
        }
    }
    return false;
}
function evaluateChangeContract(contract, input) {
    let violations = [];
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
    const expectedScopeAnchors = new Set([...expectedSet]
        .map((pathValue) => deriveScopeAnchor(pathValue))
        .filter((value) => typeof value === 'string' && value.length > 0));
    const expectedSensitiveBoundaries = new Set([...expectedSet]
        .map((pathValue) => classifySensitiveBoundary(pathValue))
        .filter((value) => value !== null));
    const expectedTouchesInfra = [...expectedSet].some((pathValue) => isInfraBoundaryPath(pathValue));
    const expectedTouchesDependency = [...expectedSet].some((pathValue) => isDependencyManifestPath(pathValue));
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
    const relaxedSymbolTypeMatching = contract.options?.symbolTypeRelaxedMatching !== false;
    const allowSymbolFileBasenameFallback = contract.options?.symbolFileBasenameFallback === true;
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
            const scopeAnchor = deriveScopeAnchor(path);
            const sensitiveBoundary = classifySensitiveBoundary(path);
            const dependencyManifest = isDependencyManifestPath(path);
            const infraBoundary = isInfraBoundaryPath(path);
            if (dependencyManifest && !expectedTouchesDependency) {
                violations.push({
                    code: 'CHANGE_CONTRACT_DEPENDENCY_BOUNDARY_BREACH',
                    message: `Dependency manifest changed outside change contract boundary: ${path}`,
                    file: path,
                    expected: expectedTouchesDependency ? 'dependency-boundary' : 'no dependency changes approved',
                    actual: 'dependency-manifest',
                });
                continue;
            }
            if (infraBoundary && !expectedTouchesInfra) {
                violations.push({
                    code: 'CHANGE_CONTRACT_INFRA_BOUNDARY_BREACH',
                    message: `Infrastructure or CI boundary changed outside change contract: ${path}`,
                    file: path,
                    expected: expectedTouchesInfra ? 'infra-boundary' : 'no infra or CI changes approved',
                    actual: scopeAnchor || 'infra-boundary',
                });
                continue;
            }
            if (scopeAnchor && expectedScopeAnchors.size > 0 && !expectedScopeAnchors.has(scopeAnchor)) {
                violations.push({
                    code: 'CHANGE_CONTRACT_SERVICE_BOUNDARY_BREACH',
                    message: `Cross-scope architectural drift detected: ${path} is outside approved scope anchors`,
                    file: path,
                    expected: [...expectedScopeAnchors].join(', '),
                    actual: scopeAnchor,
                });
                continue;
            }
            if (sensitiveBoundary
                && expectedSensitiveBoundaries.size > 0
                && !expectedSensitiveBoundaries.has(sensitiveBoundary)) {
                violations.push({
                    code: 'CHANGE_CONTRACT_SENSITIVE_BOUNDARY_BREACH',
                    message: `Sensitive boundary changed outside approved intent scope: ${path}`,
                    file: path,
                    expected: [...expectedSensitiveBoundaries].join(', '),
                    actual: sensitiveBoundary,
                });
                continue;
            }
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
    let symbolRenameMatches = 0;
    if (expectedSymbols.length > 0) {
        for (const expectedSymbol of expectedSymbols) {
            const symbolMatches = changedSymbols.filter((actualSymbol) => {
                if (actualSymbol.name !== expectedSymbol.name)
                    return false;
                if (!areSymbolTypesCompatible(expectedSymbol.type, actualSymbol.type, relaxedSymbolTypeMatching)) {
                    return false;
                }
                return doesSymbolFileMatch(expectedSymbol.file, actualSymbol.file, allowSymbolFileBasenameFallback);
            });
            const likelyRenameMatch = hasLikelyRenameForExpectedSymbol(expectedSymbol, changedSymbols, {
                relaxedSymbolTypeMatching,
                allowSymbolFileBasenameFallback,
            });
            if (likelyRenameMatch) {
                symbolRenameMatches += 1;
            }
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
                ? ['add', 'modify']
                : ['add', 'modify'];
            const hasAllowedAction = symbolMatches.some((match) => allowedActions.includes(match.action));
            if (enforceExpectedSymbols && symbolMatches.length === 0 && !likelyRenameMatch) {
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
            if (enforceSymbolActionMatching && symbolMatches.length > 0 && !hasAllowedAction && !likelyRenameMatch) {
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
    const maxUnexpectedFiles = parseNonNegativeInteger(contract.options?.maxUnexpectedFiles) || 0;
    const unexpectedFileViolations = violations.filter((item) => item.code === 'CHANGE_CONTRACT_UNEXPECTED_FILE');
    let toleratedUnexpectedFiles = 0;
    if (maxUnexpectedFiles > 0 && unexpectedFileViolations.length > 0 && unexpectedFileViolations.length <= maxUnexpectedFiles) {
        toleratedUnexpectedFiles = unexpectedFileViolations.length;
        violations = violations.filter((item) => item.code !== 'CHANGE_CONTRACT_UNEXPECTED_FILE');
    }
    const maxMissingExpectedSymbols = parseNonNegativeInteger(contract.options?.maxMissingExpectedSymbols) || 0;
    const missingExpectedSymbolViolations = violations.filter((item) => item.code === 'CHANGE_CONTRACT_MISSING_EXPECTED_SYMBOL');
    let toleratedMissingExpectedSymbols = 0;
    if (maxMissingExpectedSymbols > 0
        && missingExpectedSymbolViolations.length > 0
        && missingExpectedSymbolViolations.length <= maxMissingExpectedSymbols) {
        toleratedMissingExpectedSymbols = missingExpectedSymbolViolations.length;
        violations = violations.filter((item) => item.code !== 'CHANGE_CONTRACT_MISSING_EXPECTED_SYMBOL');
    }
    const outOfContractFiles = violations.filter((violation) => violation.code === 'CHANGE_CONTRACT_UNEXPECTED_FILE').length;
    const serviceBoundaryBreaches = violations.filter((violation) => violation.code === 'CHANGE_CONTRACT_SERVICE_BOUNDARY_BREACH').length;
    const infraBoundaryBreaches = violations.filter((violation) => violation.code === 'CHANGE_CONTRACT_INFRA_BOUNDARY_BREACH').length;
    const dependencyBoundaryBreaches = violations.filter((violation) => violation.code === 'CHANGE_CONTRACT_DEPENDENCY_BOUNDARY_BREACH').length;
    const sensitiveBoundaryBreaches = violations.filter((violation) => violation.code === 'CHANGE_CONTRACT_SENSITIVE_BOUNDARY_BREACH').length;
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
            serviceBoundaryBreaches,
            infraBoundaryBreaches,
            dependencyBoundaryBreaches,
            sensitiveBoundaryBreaches,
            expectedSymbols: expectedSymbols.length,
            changedSymbols: changedSymbols.length,
            missingExpectedSymbols,
            blockedSymbolsTouched,
            symbolActionMismatches,
            symbolRenameMatches,
            toleratedUnexpectedFiles,
            toleratedMissingExpectedSymbols,
        },
    };
}
function toHumanSymbolLabel(symbol, symbolType) {
    if (!symbol)
        return 'unknown_symbol';
    const base = symbol.endsWith('()') ? symbol : `${symbol}()`;
    if (!symbolType || symbolType === 'unknown') {
        return base;
    }
    return `${symbolType}: ${base}`;
}
function formatViolationItem(violation) {
    switch (violation.code) {
        case 'CHANGE_CONTRACT_UNEXPECTED_FILE':
        case 'CHANGE_CONTRACT_MISSING_EXPECTED_FILE':
        case 'CHANGE_CONTRACT_BLOCKED_FILE_TOUCHED':
            return violation.file || violation.message;
        case 'CHANGE_CONTRACT_SERVICE_BOUNDARY_BREACH':
        case 'CHANGE_CONTRACT_INFRA_BOUNDARY_BREACH':
        case 'CHANGE_CONTRACT_DEPENDENCY_BOUNDARY_BREACH':
        case 'CHANGE_CONTRACT_SENSITIVE_BOUNDARY_BREACH':
            return `${violation.file || 'unknown_file'}${violation.expected || violation.actual ? ` (expected ${violation.expected || 'unknown'}, actual ${violation.actual || 'unknown'})` : ''}`;
        case 'CHANGE_CONTRACT_ACTION_MISMATCH':
            return `${violation.file || 'unknown_file'} (expected ${violation.expected || 'unknown'}, actual ${violation.actual || 'unknown'})`;
        case 'CHANGE_CONTRACT_MISSING_EXPECTED_SYMBOL':
        case 'CHANGE_CONTRACT_BLOCKED_SYMBOL_TOUCHED':
            return `${toHumanSymbolLabel(violation.symbol, violation.symbolType)}${violation.file ? ` (${violation.file})` : ''}`;
        case 'CHANGE_CONTRACT_SYMBOL_ACTION_MISMATCH':
            return `${toHumanSymbolLabel(violation.symbol, violation.symbolType)} (expected ${violation.expected || 'unknown'}, actual ${violation.actual || 'unknown'})${violation.file ? ` (${violation.file})` : ''}`;
        case 'CHANGE_CONTRACT_PLAN_MISMATCH':
            return `plan_id (expected ${violation.expected || 'unknown'}, actual ${violation.actual || 'unknown'})`;
        case 'CHANGE_CONTRACT_POLICY_LOCK_MISMATCH':
            return `policy_lock_fingerprint (expected ${violation.expected || 'unknown'}, actual ${violation.actual || 'unknown'})`;
        case 'CHANGE_CONTRACT_COMPILED_POLICY_MISMATCH':
            return `compiled_policy_fingerprint (expected ${violation.expected || 'unknown'}, actual ${violation.actual || 'unknown'})`;
        default:
            return violation.message;
    }
}
function groupChangeContractViolations(violations) {
    const groups = new Map();
    const ensureGroup = (key, title) => {
        const existing = groups.get(key);
        if (existing)
            return existing;
        const created = {
            key,
            title,
            impact: explainImpactByGroupKey(key),
            items: [],
            count: 0,
        };
        groups.set(key, created);
        return created;
    };
    for (const violation of violations) {
        let key = 'other';
        let title = 'Other Contract Drift';
        switch (violation.code) {
            case 'CHANGE_CONTRACT_UNEXPECTED_FILE':
                key = 'out_of_scope_changes';
                title = 'Out-of-scope changes';
                break;
            case 'CHANGE_CONTRACT_SERVICE_BOUNDARY_BREACH':
            case 'CHANGE_CONTRACT_INFRA_BOUNDARY_BREACH':
            case 'CHANGE_CONTRACT_SENSITIVE_BOUNDARY_BREACH':
                key = 'architectural_boundary_breaches';
                title = 'Architectural boundary breaches';
                break;
            case 'CHANGE_CONTRACT_DEPENDENCY_BOUNDARY_BREACH':
                key = 'dependency_boundary_breaches';
                title = 'Dependency boundary breaches';
                break;
            case 'CHANGE_CONTRACT_MISSING_EXPECTED_FILE':
                key = 'missing_expected_files';
                title = 'Missing expected files';
                break;
            case 'CHANGE_CONTRACT_BLOCKED_FILE_TOUCHED':
                key = 'blocked_files_touched';
                title = 'Blocked files touched';
                break;
            case 'CHANGE_CONTRACT_ACTION_MISMATCH':
                key = 'file_action_mismatches';
                title = 'File action mismatches';
                break;
            case 'CHANGE_CONTRACT_MISSING_EXPECTED_SYMBOL':
                key = 'missing_expected_symbols';
                title = 'Missing expected symbols';
                break;
            case 'CHANGE_CONTRACT_BLOCKED_SYMBOL_TOUCHED':
                key = 'blocked_symbols_touched';
                title = 'Blocked symbols touched';
                break;
            case 'CHANGE_CONTRACT_SYMBOL_ACTION_MISMATCH':
                key = 'symbol_action_mismatches';
                title = 'Symbol action mismatches';
                break;
            case 'CHANGE_CONTRACT_PLAN_MISMATCH':
            case 'CHANGE_CONTRACT_POLICY_LOCK_MISMATCH':
            case 'CHANGE_CONTRACT_COMPILED_POLICY_MISMATCH':
                key = 'contract_metadata_mismatches';
                title = 'Contract metadata mismatches';
                break;
            default:
                key = 'other';
                title = 'Other contract drift';
                break;
        }
        const group = ensureGroup(key, title);
        group.count += 1;
        group.items.push(formatViolationItem(violation));
    }
    const order = [
        'architectural_boundary_breaches',
        'dependency_boundary_breaches',
        'out_of_scope_changes',
        'missing_expected_files',
        'blocked_files_touched',
        'file_action_mismatches',
        'missing_expected_symbols',
        'blocked_symbols_touched',
        'symbol_action_mismatches',
        'contract_metadata_mismatches',
        'other',
    ];
    return order
        .map((key) => groups.get(key))
        .filter((group) => Boolean(group))
        .map((group) => ({
        ...group,
        items: [...new Set(group.items)],
    }));
}
function explainImpactByGroupKey(key) {
    switch (key) {
        case 'architectural_boundary_breaches':
            return 'Changes crossed an architectural boundary that was not part of the approved implementation scope.';
        case 'dependency_boundary_breaches':
            return 'Dependency or package-surface drift was introduced outside approved scope and can widen rollout risk quickly.';
        case 'out_of_scope_changes':
            return 'Changes escaped intended scope and may introduce architectural drift or hidden side effects.';
        case 'missing_expected_files':
            return 'Planned implementation work is incomplete, so intended behavior may be partially delivered.';
        case 'blocked_files_touched':
            return 'A protected file was edited; this can bypass governance boundaries.';
        case 'file_action_mismatches':
            return 'File-level operations differ from plan intent and may invalidate review assumptions.';
        case 'missing_expected_symbols':
            return 'Expected implementation logic is missing and critical behavior may not be enforced.';
        case 'blocked_symbols_touched':
            return 'A blocked symbol changed, which can re-introduce prohibited behavior.';
        case 'symbol_action_mismatches':
            return 'Symbol edits differ from intended action and may alter behavior unexpectedly.';
        case 'contract_metadata_mismatches':
            return 'Plan/policy artifacts are out of sync, reducing confidence in deterministic verification.';
        case 'other':
        default:
            return 'Contract drift detected and manual review is required.';
    }
}
//# sourceMappingURL=change-contract.js.map