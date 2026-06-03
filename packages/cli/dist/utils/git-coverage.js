"use strict";
/**
 * Runtime Admission — git capture (Phase A, CLI side).
 *
 * Produces RawDeltaInput[] for the pure governance-runtime core. Two modes:
 *
 *   1. captureWorktreeCoverage  — governed-session finish. Post-image object
 *      ids are computed with `git hash-object` (Git-native, applies .gitattributes
 *      clean filters) so they equal the blobs that will later be committed.
 *      We do NOT trust `git diff --raw` new-side ids for unstaged files.
 *
 *   2. captureCommittedDelta    — base..head over committed trees (reliable old
 *      AND new object ids straight from `git diff --raw`). For future Action use.
 *
 * Source-free: only paths, modes, and content-addressed object ids leave git.
 * No file bytes, no diff hunks.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdmissionSupportArtifactPath = isAdmissionSupportArtifactPath;
exports.detectGitObjectFormat = detectGitObjectFormat;
exports.computeWorktreeObject = computeWorktreeObject;
exports.captureWorktreeCoverage = captureWorktreeCoverage;
exports.captureCommittedDelta = captureCommittedDelta;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
/**
 * Local runtime state and public admission records are provenance support
 * artifacts, never governed source effects. Repo-authored policy files such as
 * `.neurcode/governance.json` remain visible to capture; session/profile/cache
 * state does not pollute admission coverage.
 */
function isAdmissionSupportArtifactPath(path) {
    const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
    return normalized.startsWith('.neurcode-admission/')
        || normalized.startsWith('.neurcode/admission/')
        || normalized.startsWith('.neurcode/sessions/')
        || normalized.startsWith('.neurcode/evidence/')
        || normalized.startsWith('.neurcode/executions/')
        || normalized.startsWith('.neurcode/runtime-events/')
        || normalized.startsWith('.neurcode/brain/cache/')
        || normalized === '.neurcode/profile.json'
        || normalized === '.neurcode/active-session.json'
        || normalized === '.neurcode/runtime-connection.json'
        || normalized === '.neurcode/runtime-outbox.json'
        || normalized === '.neurcode/runtime-outbox.lock'
        || normalized === '.neurcode/pilot-validation.latest.json'
        || normalized === '.claude/settings.json'
        || normalized === '.claude/settings.local.json';
}
const NEURCODE_GITIGNORE_HYGIENE_BLOCK = [
    '# Neurcode runtime vs source separation',
    '# Ignore all top-level runtime state by default.',
    '.neurcode/*',
    '# Allow source-controlled policy + template directories.',
    '!.neurcode/policies/',
    '!.neurcode/templates/',
    '# Keep only canonical policy source JSON files.',
    '.neurcode/policies/*',
    '!.neurcode/policies/*.json',
    '# Runtime-only policy activation snapshots are never committed.',
    '.neurcode/policies/*.active.json',
    '# Allow template sources.',
    '.neurcode/templates/*',
    '!.neurcode/templates/**',
    '# Runtime-only files/directories are never committed.',
    '.neurcode/intent-state.json',
    '.neurcode/session.json',
    '.neurcode/cache/',
    '.neurcode/cache/**',
];
function stripNeurcodeGitignoreHygieneBlock(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i <= lines.length - NEURCODE_GITIGNORE_HYGIENE_BLOCK.length; i++) {
        const matches = NEURCODE_GITIGNORE_HYGIENE_BLOCK.every((line, offset) => lines[i + offset]?.trim() === line);
        if (!matches)
            continue;
        const next = lines[i + NEURCODE_GITIGNORE_HYGIENE_BLOCK.length];
        const removeCount = next?.trim() === ''
            ? NEURCODE_GITIGNORE_HYGIENE_BLOCK.length + 1
            : NEURCODE_GITIGNORE_HYGIENE_BLOCK.length;
        lines.splice(i, removeCount);
        break;
    }
    return lines.join('\n').trim();
}
function isNeurcodeOnlyGitignoreHygieneChange(repoRoot, relPath, baseRef) {
    if (relPath !== '.gitignore')
        return false;
    let currentText = '';
    try {
        currentText = (0, fs_1.readFileSync)((0, path_1.join)(repoRoot, relPath), 'utf8');
    }
    catch {
        return false;
    }
    const baseText = baseRef ? gitTry(repoRoot, ['show', `${baseRef}:${relPath}`]) ?? '' : '';
    return stripNeurcodeGitignoreHygieneBlock(currentText) === stripNeurcodeGitignoreHygieneBlock(baseText);
}
function gitText(repoRoot, args, input) {
    return (0, child_process_1.execFileSync)('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        ...(input !== undefined ? { input } : {}),
        maxBuffer: 64 * 1024 * 1024,
    });
}
function gitTry(repoRoot, args, input) {
    try {
        return gitText(repoRoot, args, input);
    }
    catch {
        return null;
    }
}
function detectGitObjectFormat(repoRoot) {
    const value = gitTry(repoRoot, ['rev-parse', '--show-object-format']);
    return value && value.trim() === 'sha256' ? 'sha256' : 'sha1';
}
function headExists(repoRoot) {
    return gitTry(repoRoot, ['rev-parse', '--verify', '--quiet', 'HEAD']) !== null;
}
/**
 * Split `git ... -z` NUL-delimited output into tokens. Trailing empty token from
 * the final NUL is dropped.
 */
function splitZ(output) {
    if (!output)
        return [];
    const parts = output.split('\0');
    if (parts.length && parts[parts.length - 1] === '')
        parts.pop();
    return parts;
}
/**
 * Parse `git diff --raw -z` records. With --no-renames there is exactly one path
 * per record; R/C are still parsed defensively (src + dst).
 */
function parseRawDiff(tokens) {
    const records = [];
    let i = 0;
    while (i < tokens.length) {
        const meta = tokens[i];
        if (!meta.startsWith(':')) {
            i += 1;
            continue;
        }
        // ":<oldmode> <newmode> <oldsha> <newsha> <status>"
        const fields = meta.slice(1).split(' ').filter(Boolean);
        const [oldMode, newMode, oldObjectId, newObjectId, status] = fields;
        const statusLetter = (status || '').charAt(0).toUpperCase();
        if (statusLetter === 'R' || statusLetter === 'C') {
            const oldPath = tokens[i + 1];
            const path = tokens[i + 2];
            records.push({ oldMode, newMode, oldObjectId, newObjectId, status, path, oldPath });
            i += 3;
        }
        else {
            const path = tokens[i + 1];
            records.push({ oldMode, newMode, oldObjectId, newObjectId, status, path });
            i += 2;
        }
    }
    return records;
}
/**
 * Compute the would-be-committed object id + git mode for a worktree path.
 * Returns null if the path no longer exists (handled as a delete elsewhere).
 */
function computeWorktreeObject(repoRoot, relPath) {
    const abs = (0, path_1.join)(repoRoot, relPath);
    let stat;
    try {
        stat = (0, fs_1.lstatSync)(abs);
    }
    catch {
        return null;
    }
    if (stat.isSymbolicLink()) {
        const target = (0, fs_1.readlinkSync)(abs);
        // Git stores a symlink as a blob whose content is the target string (no newline).
        const objectId = gitTry(repoRoot, ['hash-object', '--stdin', '--no-filters'], target);
        if (!objectId)
            return null;
        return { mode: '120000', objectId: objectId.trim() };
    }
    if (stat.isDirectory()) {
        // A directory is only relevant as a submodule (gitlink): it has its own .git.
        if ((0, fs_1.existsSync)((0, path_1.join)(abs, '.git'))) {
            const commit = gitTry(repoRoot, ['-C', relPath, 'rev-parse', 'HEAD']);
            if (!commit)
                return null;
            return { mode: '160000', objectId: commit.trim() };
        }
        return null;
    }
    // Regular file. `git hash-object` applies .gitattributes clean filters, so the
    // id matches what will be committed.
    const objectId = gitTry(repoRoot, ['hash-object', '--', relPath]);
    if (!objectId)
        return null;
    const executable = (stat.mode & 0o111) !== 0;
    return { mode: executable ? '100755' : '100644', objectId: objectId.trim() };
}
/**
 * Capture the worktree effect set at session finish. Old-side ids come from the
 * committed base (reliable); new-side ids are recomputed with git hash-object.
 */
function captureWorktreeCoverage(repoRoot, options = {}) {
    const objectFormat = detectGitObjectFormat(repoRoot);
    const headRef = gitTry(repoRoot, ['rev-parse', '--short=12', 'HEAD'])?.trim() ?? null;
    const raw = [];
    const seen = new Set();
    const hasHead = headExists(repoRoot);
    const baseRef = hasHead ? options.baseRef || 'HEAD' : null;
    if (baseRef) {
        // --abbrev=64 prints full object ids (40 for sha1, 64 for sha256); --raw
        // abbreviates by default and --full-index does not affect --raw output.
        const tokens = splitZ(gitTry(repoRoot, ['diff', '--no-renames', '--raw', '--abbrev=64', '-z', baseRef]));
        for (const rec of parseRawDiff(tokens)) {
            if (isAdmissionSupportArtifactPath(rec.path))
                continue;
            if (isNeurcodeOnlyGitignoreHygieneChange(repoRoot, rec.path, baseRef))
                continue;
            seen.add(rec.path);
            const deleted = rec.status.charAt(0).toUpperCase() === 'D';
            if (deleted) {
                raw.push({
                    path: rec.path,
                    oldMode: rec.oldMode,
                    oldObjectId: rec.oldObjectId,
                    newMode: '000000',
                    newObjectId: null,
                });
                continue;
            }
            const worktreeObject = computeWorktreeObject(repoRoot, rec.path);
            if (!worktreeObject) {
                // Vanished between diff and stat — treat as a delete against base.
                raw.push({ path: rec.path, oldMode: rec.oldMode, oldObjectId: rec.oldObjectId, newMode: '000000', newObjectId: null });
                continue;
            }
            const oldPresent = rec.oldMode && rec.oldMode !== '000000' && !/^0+$/.test(rec.oldObjectId);
            raw.push({
                path: rec.path,
                oldMode: oldPresent ? rec.oldMode : '000000',
                oldObjectId: oldPresent ? rec.oldObjectId : null,
                newMode: worktreeObject.mode,
                newObjectId: worktreeObject.objectId,
            });
        }
    }
    // Untracked (new) files — added.
    for (const path of splitZ(gitTry(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z']))) {
        if (isAdmissionSupportArtifactPath(path))
            continue;
        if (isNeurcodeOnlyGitignoreHygieneChange(repoRoot, path, baseRef))
            continue;
        if (seen.has(path))
            continue;
        seen.add(path);
        const worktreeObject = computeWorktreeObject(repoRoot, path);
        if (!worktreeObject)
            continue;
        raw.push({
            path,
            oldMode: '000000',
            oldObjectId: null,
            newMode: worktreeObject.mode,
            newObjectId: worktreeObject.objectId,
        });
    }
    return { objectFormat, raw, baseRef, headRef };
}
/**
 * Capture a committed tree delta (base..head). Both old and new object ids are
 * read directly from git (reliable for committed trees). --no-renames so renames
 * arrive as delete + add (the pure core also normalizes any R/C defensively).
 */
function captureCommittedDelta(repoRoot, baseRef, headRef) {
    const objectFormat = detectGitObjectFormat(repoRoot);
    const tokens = splitZ(gitTry(repoRoot, ['diff', '--no-renames', '--raw', '--abbrev=64', '-z', baseRef, headRef]));
    const raw = parseRawDiff(tokens)
        .filter((rec) => !isAdmissionSupportArtifactPath(rec.path))
        .map((rec) => ({
        path: rec.path,
        oldMode: rec.oldMode,
        oldObjectId: rec.oldObjectId,
        newMode: rec.newMode,
        newObjectId: rec.newObjectId,
        status: rec.status,
        oldPath: rec.oldPath,
    }));
    return {
        objectFormat,
        raw,
        baseRef,
        headRef: gitTry(repoRoot, ['rev-parse', '--short=12', headRef])?.trim() ?? headRef,
    };
}
//# sourceMappingURL=git-coverage.js.map