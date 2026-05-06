"use strict";
/**
 * Gitignore Updater Utility
 *
 * Ensures .neurcode runtime artifacts are ignored in .gitignore.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureNeurcodeInGitignore = ensureNeurcodeInGitignore;
const fs_1 = require("fs");
const path_1 = require("path");
const GITIGNORE_FILE = '.gitignore';
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
/**
 * Ensure .neurcode runtime hygiene is represented in .gitignore
 */
function ensureNeurcodeInGitignore(cwd = process.cwd()) {
    const gitignorePath = (0, path_1.join)(cwd, GITIGNORE_FILE);
    // If .gitignore doesn't exist, create it
    if (!(0, fs_1.existsSync)(gitignorePath)) {
        const block = [...NEURCODE_HYGIENE_BLOCK, ''].join('\n');
        (0, fs_1.writeFileSync)(gitignorePath, block, 'utf-8');
        return;
    }
    // Read existing .gitignore
    const content = (0, fs_1.readFileSync)(gitignorePath, 'utf-8');
    const lines = content.split('\n').map(line => line.trim());
    const hasNeurcodeRule = lines.some((line) => line.startsWith('.neurcode') || line.startsWith('!.neurcode'));
    if (hasNeurcodeRule) {
        return;
    }
    const block = NEURCODE_HYGIENE_BLOCK.join('\n');
    const newContent = content.trimEnd() + (content.endsWith('\n') ? '' : '\n') + block + '\n';
    (0, fs_1.writeFileSync)(gitignorePath, newContent, 'utf-8');
}
//# sourceMappingURL=gitignore.js.map