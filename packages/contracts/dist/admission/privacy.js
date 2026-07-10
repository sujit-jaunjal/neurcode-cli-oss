"use strict";
/**
 * Runtime Admission — source-free privacy guard (Phase A).
 *
 * The admission artifact may contain only: paths, object ids, modes, hashes,
 * classifications, timestamps, session ids, and version strings. It must never
 * contain file content, diff hunks, patch text, excerpts, or secrets.
 *
 * This guard is a denylist on key names (mirrors the runtime-sync upload guard)
 * plus a value-shape check. It is intentionally conservative: any source-like
 * key anywhere in the structure throws.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdmissionSourceLeakError = exports.ADMISSION_SOURCE_LIKE_KEYS = void 0;
exports.assertSourceFreeAdmissionValue = assertSourceFreeAdmissionValue;
/** Keys that would indicate source content / diffs / secrets leaked into the artifact. */
exports.ADMISSION_SOURCE_LIKE_KEYS = new Set([
    'content',
    'fileContent',
    'file_content',
    'sourceText',
    'source_text',
    'sourceCode',
    'source_code',
    'source',
    'body',
    'text',
    'diff',
    'diffText',
    'diff_text',
    'diffHunk',
    'diffHunks',
    'patch',
    'patchText',
    'patchBody',
    'patch_body',
    'hunk',
    'hunks',
    'excerpt',
    'snippet',
    'before',
    'after',
    'blobContent',
    'contents',
    'prompt',
    'rawPrompt',
    'raw_prompt',
    'promptWithSource',
    'prompt_with_source',
    'commandBody',
    'command_body',
    'shellCommand',
    'shell_command',
    'secret',
    'secrets',
    'token',
    'password',
]);
class AdmissionSourceLeakError extends Error {
    keyPath;
    constructor(keyPath) {
        super(`admission artifact contains source-like key: ${keyPath}`);
        this.keyPath = keyPath;
        this.name = 'AdmissionSourceLeakError';
    }
}
exports.AdmissionSourceLeakError = AdmissionSourceLeakError;
function isSourceLikeAdmissionKey(key) {
    if (exports.ADMISSION_SOURCE_LIKE_KEYS.has(key))
        return true;
    const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const compact = normalized.replace(/_/g, '');
    for (const blocked of exports.ADMISSION_SOURCE_LIKE_KEYS) {
        const blockedNormalized = blocked.toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (normalized === blockedNormalized || compact === blockedNormalized.replace(/_/g, '')) {
            return true;
        }
    }
    return false;
}
/**
 * Walk a value and throw AdmissionSourceLeakError if any object key is a
 * source-like key. Arrays and nested objects are walked recursively.
 */
function assertSourceFreeAdmissionValue(value, path = 'admission') {
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertSourceFreeAdmissionValue(item, `${path}[${index}]`));
        return;
    }
    if (!value || typeof value !== 'object')
        return;
    for (const [key, child] of Object.entries(value)) {
        if (isSourceLikeAdmissionKey(key)) {
            throw new AdmissionSourceLeakError(`${path}.${key}`);
        }
        assertSourceFreeAdmissionValue(child, `${path}.${key}`);
    }
}
//# sourceMappingURL=privacy.js.map