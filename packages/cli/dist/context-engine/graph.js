"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDependencyGraph = buildDependencyGraph;
const path_1 = require("path");
// Matches: import ... from './foo' or require('./foo')
const IMPORT_RE = /(?:import\s[^'"]*from|require\()\s*['"](\.[^'"]+)['"]/g;
function resolveImport(fromFile, importPath) {
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
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];
    for (const ext of extensions) {
        const withExt = `${candidate}${ext}`;
        if (fileSet.has(withExt))
            return withExt;
    }
    // Try index files
    for (const ext of extensions) {
        const index = `${candidate}/index${ext}`;
        if (fileSet.has(index))
            return index;
    }
    return null;
}
function buildDependencyGraph(scan) {
    const fileSet = new Set(scan.files);
    const imports = {};
    for (const file of scan.files) {
        imports[file] = [];
        const content = scan.fileContents[file] ?? '';
        let match;
        IMPORT_RE.lastIndex = 0;
        while ((match = IMPORT_RE.exec(content)) !== null) {
            const importPath = match[1];
            if (!importPath)
                continue;
            const resolved = resolveImport(file, importPath);
            const known = reconcileToKnownFile(resolved, fileSet);
            if (known && known !== file) {
                imports[file].push(known);
            }
        }
    }
    return { imports };
}
//# sourceMappingURL=graph.js.map