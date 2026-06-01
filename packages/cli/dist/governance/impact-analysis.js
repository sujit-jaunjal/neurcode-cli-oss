"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeAccurateImpact = computeAccurateImpact;
/**
 * Accurate change-impact analysis via the TypeScript compiler's real symbol
 * resolution — the deterministic replacement for coarse module-adjacency
 * "blast radius" inflation.
 *
 * Why this exists: the legacy impact computation in drift-intelligence.ts marks
 * every module adjacent (upstream OR downstream) to a changed module as
 * "impacted." That over-reports massively — a small change in one package looks
 * like it touches the whole repo. This module instead resolves the *actual*
 * references to the symbols defined in the changed files, so impact reflects
 * real call/import edges, not topological adjacency.
 *
 * Honesty contract:
 *  - It resolves STATIC references only. Dynamic dispatch, DI, reflection, and
 *    runtime wiring are NOT visible to static analysis. Callers must treat the
 *    result as "symbol-resolved impact," not a guarantee of total blast radius.
 *  - It is scoped to the package roots of the changed files for performance, so
 *    cross-package references may be under-counted. This is a deliberate
 *    precision/recall trade for a command that must stay fast.
 *  - It NEVER throws to the caller's hot path: any failure returns
 *    { analyzed: false, reason } so the caller can fall back to legacy behavior.
 *
 * Determinism: same files + same source → same result. No network, no LLM.
 */
const ts = __importStar(require("typescript"));
const fs_1 = require("fs");
const path_1 = require("path");
const TS_LIKE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;
const SKIP_DIR = /^(node_modules|\.git|dist|build|out|coverage|\.next|vendor)$/i;
function toRepoRel(projectRoot, abs) {
    return (0, path_1.relative)(projectRoot, abs).split(path_1.sep).join('/');
}
/** Bound the program to the changed files' package/src roots, not the whole repo. */
function scopeRoots(projectRoot, changedRepoRelFiles) {
    const roots = new Set();
    for (const file of changedRepoRelFiles) {
        const parts = file.split('/');
        const pkgIdx = parts.indexOf('packages');
        const appsIdx = parts.indexOf('apps');
        const srcIdx = parts.indexOf('src');
        let depth;
        if (pkgIdx >= 0 && parts[pkgIdx + 1] !== undefined)
            depth = pkgIdx + 2; // packages/<name>
        else if (appsIdx >= 0 && parts[appsIdx + 1] !== undefined)
            depth = appsIdx + 2; // apps/<name>
        else if (srcIdx >= 0)
            depth = srcIdx + 1; // up to and including src
        else
            depth = Math.max(1, parts.length - 1); // the file's directory
        const rootRel = parts.slice(0, depth).join('/');
        roots.add((0, path_1.join)(projectRoot, rootRel));
    }
    return [...roots].filter((r) => (0, fs_1.existsSync)(r));
}
function gatherTsFiles(dir, out, cap) {
    if (out.length > cap)
        return;
    let names;
    try {
        names = (0, fs_1.readdirSync)(dir);
    }
    catch {
        return;
    }
    for (const name of names) {
        if (out.length > cap)
            return;
        const p = (0, path_1.join)(dir, name);
        let isDir = false;
        try {
            isDir = (0, fs_1.statSync)(p).isDirectory();
        }
        catch {
            continue;
        }
        if (isDir) {
            if (!SKIP_DIR.test(name))
                gatherTsFiles(p, out, cap);
        }
        else if (TS_LIKE.test(name) && !/\.d\.ts$/i.test(name)) {
            out.push(p);
        }
    }
}
function resolveAlias(checker, sym) {
    if (sym && sym.flags & ts.SymbolFlags.Alias) {
        try {
            return checker.getAliasedSymbol(sym);
        }
        catch {
            return sym;
        }
    }
    return sym;
}
/** Top-level declared/exported symbols in a changed source file. */
function declaredSymbols(sf, checker) {
    const out = [];
    const push = (name) => {
        if (name && ts.isIdentifier(name)) {
            const s = checker.getSymbolAtLocation(name);
            if (s)
                out.push(s);
        }
    };
    const visit = (n) => {
        if (ts.isFunctionDeclaration(n))
            push(n.name);
        else if (ts.isClassDeclaration(n))
            push(n.name);
        else if (ts.isInterfaceDeclaration(n))
            push(n.name);
        else if (ts.isTypeAliasDeclaration(n))
            push(n.name);
        else if (ts.isEnumDeclaration(n))
            push(n.name);
        else if (ts.isVariableStatement(n)) {
            for (const d of n.declarationList.declarations)
                push(ts.isIdentifier(d.name) ? d.name : undefined);
        }
        else if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name))
            push(n.name);
        ts.forEachChild(n, visit);
    };
    ts.forEachChild(sf, visit);
    return out;
}
/**
 * Compute accurate impacted modules for a change set.
 * @param deriveModulePath maps a repo-relative file path to its module key
 *        (caller supplies its own so the module set aligns with changedModules).
 */
function computeAccurateImpact(projectRoot, changedRepoRelFiles, deriveModulePath, options = {}) {
    const maxFiles = options.maxProgramFiles ?? 2500;
    const timeBudgetMs = options.timeBudgetMs ?? 6000;
    const none = (reason) => ({
        analyzed: false,
        impactedModules: [],
        referenceCount: 0,
        filesAnalyzed: 0,
        confidence: 'none',
        reason,
    });
    try {
        if (!projectRoot || !(0, fs_1.existsSync)(projectRoot))
            return none('project root not found');
        const tsChanged = changedRepoRelFiles.filter((f) => TS_LIKE.test(f) && !/\.d\.ts$/i.test(f));
        if (tsChanged.length === 0)
            return none('no TypeScript/JavaScript files in change set');
        const started = Date.now();
        const roots = scopeRoots(projectRoot, tsChanged);
        if (roots.length === 0)
            return none('no resolvable scope roots');
        const fileSet = new Set();
        for (const root of roots) {
            const acc = [];
            gatherTsFiles(root, acc, maxFiles + 1);
            for (const f of acc)
                fileSet.add(f);
            if (fileSet.size > maxFiles)
                return none(`program too large (>${maxFiles} files) — scoped analysis skipped`);
        }
        // Ensure changed files are present even if outside the scanned roots.
        for (const rel of tsChanged) {
            const abs = (0, path_1.join)(projectRoot, rel);
            if ((0, fs_1.existsSync)(abs) && (0, fs_1.statSync)(abs).isFile())
                fileSet.add(abs);
        }
        const files = [...fileSet];
        if (files.length === 0)
            return none('no source files gathered');
        const program = ts.createProgram(files, {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
            moduleResolution: ts.ModuleResolutionKind.Node10 ?? ts.ModuleResolutionKind.NodeJs ?? 2,
            allowJs: true,
            noEmit: true,
            skipLibCheck: true,
            noResolve: false,
        });
        const checker = program.getTypeChecker();
        if (Date.now() - started > timeBudgetMs)
            return none('time budget exceeded during program build');
        // Collect target symbols from the changed files.
        const targets = new Set();
        const declNodes = new Set();
        for (const rel of tsChanged) {
            const abs = (0, path_1.join)(projectRoot, rel);
            const sf = program.getSourceFile(abs);
            if (!sf)
                continue;
            for (const s of declaredSymbols(sf, checker)) {
                targets.add(s);
                for (const d of s.declarations ?? [])
                    declNodes.add(d);
            }
        }
        if (targets.size === 0)
            return none('no resolvable top-level symbols in changed files');
        const changedAbs = new Set(tsChanged.map((r) => (0, path_1.join)(projectRoot, r)));
        const impactedModules = new Set();
        let referenceCount = 0;
        for (const sf of program.getSourceFiles()) {
            if (sf.isDeclarationFile)
                continue;
            if (sf.fileName.includes('node_modules'))
                continue;
            if (Date.now() - started > timeBudgetMs)
                return none('time budget exceeded during reference scan');
            const inChangedFile = changedAbs.has(sf.fileName);
            const visit = (n) => {
                if (ts.isIdentifier(n) && !declNodes.has(n.parent)) {
                    const sym = checker.getSymbolAtLocation(n);
                    if (sym && (targets.has(sym) || targets.has(resolveAlias(checker, sym)))) {
                        // A reference inside the changed file itself isn't "impact" elsewhere.
                        if (!inChangedFile) {
                            referenceCount += 1;
                            impactedModules.add(deriveModulePath(toRepoRel(projectRoot, sf.fileName)));
                        }
                    }
                }
                ts.forEachChild(n, visit);
            };
            ts.forEachChild(sf, visit);
        }
        return {
            analyzed: true,
            impactedModules: [...impactedModules].sort((a, b) => a.localeCompare(b)),
            referenceCount,
            filesAnalyzed: files.length,
            confidence: 'medium',
        };
    }
    catch (err) {
        return none(`impact analysis error: ${err instanceof Error ? err.message : String(err)}`);
    }
}
//# sourceMappingURL=impact-analysis.js.map