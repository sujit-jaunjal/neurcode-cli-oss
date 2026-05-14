"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDependencyGraph = buildDependencyGraph;
const path_1 = require("path");
// Matches: import ... from './foo' or require('./foo')
const JS_IMPORT_RE = /(?:import\s[^'"]*from|require\()\s*['"](\.[^'"]+)['"]/g;
const PY_FROM_RE = /^\s*from\s+([.\w]+)\s+import\s+([\w*,\s]+)/gm;
const PY_IMPORT_RE = /^\s*import\s+([.\w]+)/gm;
function resolveJsImport(fromFile, importPath) {
    const fromDir = (0, path_1.dirname)(fromFile);
    let resolved = (0, path_1.normalize)((0, path_1.join)(fromDir, importPath)).replace(/\\/g, '/');
    // If no extension, try to match against known files by trying common extensions
    if (!/\.[jt]sx?$/.test(resolved)) {
        // Return as-is with a placeholder — callers reconcile against real files
        return resolved;
    }
    return resolved;
}
function reconcileToKnownFile(candidate, fileSet) {
    if (fileSet.has(candidate))
        return candidate;
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py'];
    for (const ext of extensions) {
        const withExt = `${candidate}${ext}`;
        if (fileSet.has(withExt))
            return withExt;
    }
    // Try index files
    for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
        const index = `${candidate}/index${ext}`;
        if (fileSet.has(index))
            return index;
    }
    const pythonPackage = `${candidate}/__init__.py`;
    if (fileSet.has(pythonPackage))
        return pythonPackage;
    return null;
}
function modulePathToCandidate(modulePath) {
    return modulePath.replace(/^\.+/, '').replace(/\./g, '/');
}
function resolvePythonRelativeBase(fromFile, modulePath) {
    const fromDir = (0, path_1.dirname)(fromFile);
    const dotMatch = modulePath.match(/^\.+/);
    const dotCount = dotMatch ? dotMatch[0].length : 0;
    let baseDir = fromDir;
    for (let i = 1; i < dotCount; i += 1) {
        baseDir = (0, path_1.dirname)(baseDir);
    }
    const remainder = modulePath.slice(dotCount);
    return remainder ? (0, path_1.normalize)((0, path_1.join)(baseDir, remainder.replace(/\./g, '/'))).replace(/\\/g, '/') : baseDir;
}
function resolvePythonImports(fromFile, content, fileSet) {
    const resolved = new Set();
    let match;
    PY_FROM_RE.lastIndex = 0;
    while ((match = PY_FROM_RE.exec(content)) !== null) {
        const modulePath = match[1];
        const importedNames = (match[2] || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
            .filter((value) => value !== '*');
        const baseCandidate = modulePath.startsWith('.')
            ? resolvePythonRelativeBase(fromFile, modulePath)
            : modulePathToCandidate(modulePath);
        const knownBase = reconcileToKnownFile(baseCandidate, fileSet);
        if (knownBase && knownBase !== fromFile) {
            resolved.add(knownBase);
        }
        if (modulePath.startsWith('.')) {
            for (const name of importedNames.slice(0, 12)) {
                const knownName = reconcileToKnownFile(`${baseCandidate}/${name}`, fileSet);
                if (knownName && knownName !== fromFile) {
                    resolved.add(knownName);
                }
            }
        }
    }
    PY_IMPORT_RE.lastIndex = 0;
    while ((match = PY_IMPORT_RE.exec(content)) !== null) {
        const modulePath = match[1];
        if (!modulePath || modulePath.startsWith('.'))
            continue;
        const known = reconcileToKnownFile(modulePathToCandidate(modulePath), fileSet);
        if (known && known !== fromFile) {
            resolved.add(known);
        }
    }
    return Array.from(resolved).sort((a, b) => a.localeCompare(b));
}
function buildDependencyGraph(scan) {
    const fileSet = new Set(scan.files);
    const imports = {};
    for (const file of scan.files) {
        imports[file] = [];
        const content = scan.fileContents[file] ?? '';
        let match;
        if (file.endsWith('.py')) {
            imports[file].push(...resolvePythonImports(file, content, fileSet));
            continue;
        }
        JS_IMPORT_RE.lastIndex = 0;
        while ((match = JS_IMPORT_RE.exec(content)) !== null) {
            const importPath = match[1];
            if (!importPath)
                continue;
            const resolved = resolveJsImport(file, importPath);
            const known = reconcileToKnownFile(resolved, fileSet);
            if (known && known !== file) {
                imports[file].push(known);
            }
        }
    }
    return { imports };
}
//# sourceMappingURL=graph.js.map