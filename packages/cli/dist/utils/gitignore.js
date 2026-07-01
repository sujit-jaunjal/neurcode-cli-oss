"use strict";
/**
 * Gitignore Updater Utility
 *
 * Ensures .neurcode runtime artifacts are ignored without mutating a tracked
 * .gitignore unless the operator explicitly consents.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureNeurcodeInGitignore = ensureNeurcodeInGitignore;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const GITIGNORE_FILE = '.gitignore';
const INFO_EXCLUDE = (0, node_path_1.join)('.git', 'info', 'exclude');
const NEURCODE_HYGIENE_BLOCK = [
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
function isTrackedGitignore(cwd) {
    const gitignorePath = (0, node_path_1.join)(cwd, GITIGNORE_FILE);
    if (!(0, node_fs_1.existsSync)(gitignorePath))
        return false;
    try {
        (0, node_child_process_1.execSync)(`git -C "${cwd.replace(/"/g, '\\"')}" ls-files --error-unmatch ${GITIGNORE_FILE}`, {
            stdio: 'ignore',
        });
        return true;
    }
    catch {
        return false;
    }
}
function hasNeurcodeHygiene(content) {
    const lines = content.split('\n').map((line) => line.trim());
    return lines.some((line) => line.startsWith('.neurcode') || line.startsWith('!.neurcode'));
}
function appendHygieneBlock(targetPath, existing = '') {
    const block = NEURCODE_HYGIENE_BLOCK.join('\n');
    const trimmed = existing.trimEnd();
    const newContent = `${trimmed}${trimmed.length > 0 ? '\n\n' : ''}${block}\n`;
    (0, node_fs_1.writeFileSync)(targetPath, newContent, 'utf-8');
}
/**
 * Ensure .neurcode runtime hygiene is represented in ignore rules.
 * Tracked `.gitignore` files are never mutated automatically; prefer
 * `.git/info/exclude` unless explicit operator consent is provided.
 */
function ensureNeurcodeInGitignore(cwd = process.cwd(), options = {}) {
    const gitignorePath = (0, node_path_1.join)(cwd, GITIGNORE_FILE);
    const infoExcludePath = (0, node_path_1.join)(cwd, INFO_EXCLUDE);
    if ((0, node_fs_1.existsSync)(gitignorePath)) {
        const content = (0, node_fs_1.readFileSync)(gitignorePath, 'utf-8');
        if (hasNeurcodeHygiene(content)) {
            return { mutated: false, method: 'already_present' };
        }
        if (isTrackedGitignore(cwd) && options.consentMutateTrackedGitignore !== true) {
            if ((0, node_fs_1.existsSync)(infoExcludePath)) {
                const exclude = (0, node_fs_1.readFileSync)(infoExcludePath, 'utf-8');
                if (!hasNeurcodeHygiene(exclude)) {
                    appendHygieneBlock(infoExcludePath, exclude);
                    return { mutated: true, method: 'info_exclude' };
                }
                return { mutated: false, method: 'already_present' };
            }
            (0, node_fs_1.mkdirSync)((0, node_path_1.join)(cwd, '.git', 'info'), { recursive: true });
            (0, node_fs_1.writeFileSync)(infoExcludePath, `${NEURCODE_HYGIENE_BLOCK.join('\n')}\n`, 'utf-8');
            return { mutated: true, method: 'info_exclude' };
        }
        appendHygieneBlock(gitignorePath, content);
        return { mutated: true, method: 'gitignore' };
    }
    const block = [...NEURCODE_HYGIENE_BLOCK, ''].join('\n');
    (0, node_fs_1.writeFileSync)(gitignorePath, block, 'utf-8');
    return { mutated: true, method: 'gitignore' };
}
//# sourceMappingURL=gitignore.js.map