"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanProject = scanProject;
const fs_1 = require("fs");
const path_1 = require("path");
const INCLUDE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py']);
const EXCLUDE_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.cache',
    'coverage',
    '.next',
    '.turbo',
]);
function shouldSkipDir(entry) {
    if (EXCLUDE_DIRS.has(entry))
        return true;
    if (entry.startsWith('.') && entry !== '.github')
        return true;
    return false;
}
function walkDir(dir, rootPath, result) {
    let entries;
    try {
        entries = (0, fs_1.readdirSync)(dir);
    }
    catch {
        return;
    }
    for (const entry of entries) {
        if (shouldSkipDir(entry))
            continue;
        const fullPath = (0, path_1.join)(dir, entry);
        let stat;
        try {
            stat = (0, fs_1.statSync)(fullPath);
        }
        catch {
            continue;
        }
        if (stat.isDirectory()) {
            walkDir(fullPath, rootPath, result);
            continue;
        }
        const lastDot = entry.lastIndexOf('.');
        if (lastDot === -1)
            continue;
        const ext = entry.slice(lastDot);
        if (!INCLUDE_EXTENSIONS.has(ext))
            continue;
        // Store relative path from rootPath
        const relativePath = fullPath.slice(rootPath.length).replace(/\\/g, '/').replace(/^\//, '');
        result.files.push(relativePath);
        try {
            result.fileContents[relativePath] = (0, fs_1.readFileSync)(fullPath, 'utf8');
        }
        catch {
            result.fileContents[relativePath] = '';
        }
    }
}
function scanProject(rootPath) {
    const result = { files: [], fileContents: {} };
    walkDir(rootPath, rootPath, result);
    return result;
}
//# sourceMappingURL=scanner.js.map