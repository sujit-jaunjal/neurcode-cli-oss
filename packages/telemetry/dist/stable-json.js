"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stableStringify = stableStringify;
/**
 * Deterministic JSON serialization: sorted object keys at every depth.
 * Used so identical logical events stringify identically across Node versions.
 */
function stableStringify(value) {
    return JSON.stringify(sortKeysDeep(value));
}
function sortKeysDeep(value) {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(sortKeysDeep);
    }
    const obj = value;
    const out = {};
    for (const key of Object.keys(obj).sort()) {
        out[key] = sortKeysDeep(obj[key]);
    }
    return out;
}
