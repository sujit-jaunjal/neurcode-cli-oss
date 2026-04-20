"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapPlanSymbolsForChangeContract = mapPlanSymbolsForChangeContract;
function normalizeRepoPath(value) {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function normalizeSymbolName(value) {
    return String(value || '')
        .trim()
        .replace(/^['"`]+|['"`]+$/g, '')
        .replace(/\(\)\s*$/, '');
}
function normalizeSymbolType(value) {
    if (!value)
        return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'function'
        || normalized === 'class'
        || normalized === 'interface'
        || normalized === 'type'
        || normalized === 'method'
        || normalized === 'const'
        || normalized === 'unknown') {
        return normalized;
    }
    if (normalized === 'fn')
        return 'function';
    if (normalized === 'var' || normalized === 'variable')
        return 'const';
    return undefined;
}
function normalizeSymbolAction(value, fallback) {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'CREATE' || normalized === 'MODIFY' || normalized === 'BLOCK') {
        return normalized;
    }
    return fallback;
}
function extractSymbolMentionsFromText(text) {
    if (!text || !text.trim())
        return [];
    const entries = [];
    const seen = new Set();
    const push = (name, type) => {
        const normalizedName = normalizeSymbolName(name);
        if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(normalizedName))
            return;
        if (normalizedName.length > 80)
            return;
        const key = `${type || 'unknown'}::${normalizedName}`;
        if (seen.has(key))
            return;
        seen.add(key);
        entries.push({
            name: normalizedName,
            ...(type ? { type } : {}),
        });
    };
    for (const match of text.matchAll(/`([A-Za-z_$][A-Za-z0-9_$]*)`/g)) {
        if (match[1]) {
            push(match[1]);
        }
    }
    for (const match of text.matchAll(/\b(function|class|interface|type|method|handler)\s+`?([A-Za-z_$][A-Za-z0-9_$]*)`?/gi)) {
        const keyword = String(match[1] || '').toLowerCase();
        const candidate = match[2];
        if (!candidate)
            continue;
        const type = keyword === 'class'
            ? 'class'
            : keyword === 'interface'
                ? 'interface'
                : keyword === 'type'
                    ? 'type'
                    : keyword === 'method' || keyword === 'handler'
                        ? 'method'
                        : 'function';
        push(candidate, type);
    }
    return entries;
}
function parseExplicitSymbols(rawSymbols) {
    if (!Array.isArray(rawSymbols))
        return [];
    const parsed = [];
    for (const entry of rawSymbols) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            continue;
        const symbol = entry;
        const name = normalizeSymbolName(String(symbol.name || ''));
        if (!name)
            continue;
        const action = normalizeSymbolAction(typeof symbol.action === 'string' ? symbol.action : undefined, 'MODIFY');
        const type = normalizeSymbolType(typeof symbol.type === 'string' ? symbol.type : undefined);
        const file = typeof symbol.file === 'string' && symbol.file.trim()
            ? normalizeRepoPath(symbol.file)
            : undefined;
        const reason = typeof symbol.reason === 'string' && symbol.reason.trim()
            ? symbol.reason.trim().slice(0, 240)
            : undefined;
        parsed.push({
            name,
            action,
            ...(type ? { type } : {}),
            ...(file ? { file } : {}),
            ...(reason ? { reason } : {}),
        });
    }
    return parsed;
}
function mergeExpectedSymbols(items) {
    const precedence = {
        MODIFY: 1,
        CREATE: 2,
        BLOCK: 3,
    };
    const merged = new Map();
    for (const item of items) {
        const name = normalizeSymbolName(item.name);
        if (!name)
            continue;
        const type = normalizeSymbolType(item.type);
        const file = item.file ? normalizeRepoPath(item.file) : undefined;
        const key = `${file || '*'}::${type || 'unknown'}::${name}`;
        const reason = item.reason ? item.reason.trim().slice(0, 240) : undefined;
        const candidate = {
            name,
            action: item.action,
            ...(type ? { type } : {}),
            ...(file ? { file } : {}),
            ...(reason ? { reason } : {}),
        };
        const existing = merged.get(key);
        if (!existing) {
            merged.set(key, candidate);
            continue;
        }
        if (precedence[candidate.action] > precedence[existing.action]) {
            merged.set(key, candidate);
            continue;
        }
        if (!existing.reason && candidate.reason) {
            merged.set(key, {
                ...existing,
                reason: candidate.reason,
            });
        }
    }
    return [...merged.values()].sort((a, b) => {
        const fileA = a.file || '';
        const fileB = b.file || '';
        if (fileA !== fileB)
            return fileA.localeCompare(fileB);
        if (a.name !== b.name)
            return a.name.localeCompare(b.name);
        return (a.type || '').localeCompare(b.type || '');
    });
}
function mapPlanSymbolsForChangeContract(plan) {
    const result = [];
    const files = Array.isArray(plan.files) ? plan.files : [];
    result.push(...parseExplicitSymbols(plan.symbols));
    for (const file of files) {
        const filePath = normalizeRepoPath(String(file.path || ''));
        if (!filePath)
            continue;
        const action = normalizeSymbolAction(file.action, 'MODIFY');
        const textSources = [file.reason, file.suggestion, file.rationale];
        for (const source of textSources) {
            if (!source || !source.trim())
                continue;
            for (const symbol of extractSymbolMentionsFromText(source)) {
                result.push({
                    name: symbol.name,
                    action,
                    file: filePath,
                    ...(symbol.type ? { type: symbol.type } : {}),
                    reason: `Derived from plan note for ${filePath}`,
                });
            }
        }
    }
    if (typeof plan.summary === 'string' && plan.summary.trim()) {
        for (const symbol of extractSymbolMentionsFromText(plan.summary)) {
            result.push({
                name: symbol.name,
                action: 'MODIFY',
                ...(symbol.type ? { type: symbol.type } : {}),
                reason: 'Derived from plan summary',
            });
        }
    }
    if (Array.isArray(plan.recommendations)) {
        for (const recommendation of plan.recommendations) {
            if (!recommendation || !recommendation.trim())
                continue;
            for (const symbol of extractSymbolMentionsFromText(recommendation)) {
                result.push({
                    name: symbol.name,
                    action: 'MODIFY',
                    ...(symbol.type ? { type: symbol.type } : {}),
                    reason: 'Derived from plan recommendations',
                });
            }
        }
    }
    return mergeExpectedSymbols(result);
}
//# sourceMappingURL=plan-symbols.js.map