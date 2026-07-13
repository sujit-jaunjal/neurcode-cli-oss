"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPOSITORY_TOPOLOGY_SCHEMA_VERSION = void 0;
exports.compileRepositoryTopology = compileRepositoryTopology;
exports.topologyFacts = topologyFacts;
exports.projectRepositoryTopologyForSession = projectRepositoryTopologyForSession;
exports.topologyHasPath = topologyHasPath;
exports.topologySupportGlobs = topologySupportGlobs;
exports.topologyPackageRootsForPaths = topologyPackageRootsForPaths;
exports.topologyGlobsForIntent = topologyGlobsForIntent;
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const micromatch_1 = __importDefault(require("micromatch"));
exports.REPOSITORY_TOPOLOGY_SCHEMA_VERSION = 'neurcode.repository-topology.v1';
const LANGUAGE_BY_EXTENSION = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.mts': 'TypeScript',
    '.cts': 'TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.mjs': 'JavaScript',
    '.cjs': 'JavaScript',
    '.py': 'Python',
    '.pyi': 'Python',
    '.go': 'Go',
    '.rs': 'Rust',
    '.java': 'Java',
    '.kt': 'Kotlin',
    '.kts': 'Kotlin',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.swift': 'Swift',
    '.cs': 'C#',
    '.c': 'C',
    '.h': 'C/C++',
    '.cc': 'C++',
    '.cpp': 'C++',
    '.hpp': 'C++',
};
const MANIFEST_NAMES = new Set([
    'package.json',
    'pyproject.toml',
    'setup.py',
    'setup.cfg',
    'go.mod',
    'Cargo.toml',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'Gemfile',
    'composer.json',
    'Package.swift',
]);
const WORKSPACE_MANIFEST_NAMES = new Set([
    'pnpm-workspace.yaml',
    'lerna.json',
    'nx.json',
    'turbo.json',
    'rush.json',
    'workspace.json',
]);
const DOCUMENT_EXTENSIONS = new Set(['.md', '.mdx', '.rst', '.adoc', '.asciidoc']);
const API_SCHEMA_EXTENSIONS = new Set(['.proto', '.graphql', '.gql', '.avsc', '.raml', '.wsdl']);
const CONFIG_BASENAMES = new Set([
    'package.json',
    'pyproject.toml',
    'go.mod',
    'Cargo.toml',
    'tsconfig.json',
    'jsconfig.json',
    'eslint.config.js',
    'eslint.config.mjs',
    'vite.config.ts',
    'vitest.config.ts',
    'Dockerfile',
    'docker-compose.yml',
    'docker-compose.yaml',
]);
function normalizePath(value) {
    const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/').trim();
    if (!normalized || normalized === '.')
        return '.';
    return normalized.replace(/\/$/, '');
}
function stableHash(value, length = 24) {
    return (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(value)).digest('hex').slice(0, length);
}
function globForPath(pathValue) {
    if (pathValue === '.')
        return '**';
    return (0, node_path_1.extname)(pathValue) ? pathValue : `${pathValue}/**`;
}
function rootForManifest(pathValue) {
    const root = (0, node_path_1.dirname)(pathValue);
    return root === '.' ? '.' : normalizePath(root);
}
function commonDirectory(paths) {
    if (paths.length === 0)
        return '.';
    const split = paths.map((value) => normalizePath((0, node_path_1.dirname)(value)).split('/').filter(Boolean));
    const first = split[0];
    let length = first.length;
    for (const parts of split.slice(1)) {
        length = Math.min(length, parts.length);
        for (let index = 0; index < length; index += 1) {
            if (parts[index] !== first[index]) {
                length = index;
                break;
            }
        }
    }
    return length === 0 ? '.' : first.slice(0, length).join('/');
}
function packageRootForPath(pathValue, packageRoots) {
    const candidates = packageRoots
        .filter((root) => root === '.' || pathValue === root || pathValue.startsWith(`${root}/`))
        .sort((left, right) => right.length - left.length);
    return candidates[0] ?? '.';
}
function relativeToRoot(pathValue, root) {
    if (root === '.')
        return pathValue;
    return pathValue.startsWith(`${root}/`) ? pathValue.slice(root.length + 1) : pathValue;
}
function sourceRootForFiles(files, packageRoot) {
    const relativeFiles = files.map((file) => relativeToRoot(file, packageRoot));
    const common = commonDirectory(relativeFiles);
    if (common === '.')
        return packageRoot;
    const firstSegment = common.split('/')[0];
    return packageRoot === '.' ? firstSegment : `${packageRoot}/${firstSegment}`;
}
function isDeterministicTestFile(pathValue) {
    const file = (0, node_path_1.basename)(pathValue);
    return /(?:^|[._-])(test|tests|spec|specs)\.[^.]+$/i.test(file)
        || /^test_[^.]+\.[^.]+$/i.test(file)
        || /_test\.[^.]+$/i.test(file);
}
function advisoryTestDirectory(pathValue) {
    const parts = pathValue.split('/');
    const index = parts.findIndex((part) => /^(tests?|specs?|__tests__)$/.test(part.toLowerCase()));
    return index >= 0 ? parts.slice(0, index + 1).join('/') : null;
}
function documentationRoot(pathValue) {
    const directory = (0, node_path_1.dirname)(pathValue);
    return directory === '.' ? pathValue : directory;
}
function parseCodeowners(content) {
    if (!content)
        return [];
    const result = [];
    for (const raw of content.split(/\r?\n/)) {
        const line = raw.replace(/#.*$/, '').trim();
        if (!line)
            continue;
        const [rawGlob, ...rawOwners] = line.split(/\s+/);
        const owners = rawOwners.filter((owner) => owner.startsWith('@') || owner.includes('@'));
        if (!rawGlob || owners.length === 0)
            continue;
        let glob = normalizePath(rawGlob.replace(/^\//, ''));
        if (!glob.includes('*') && !(0, node_path_1.extname)(glob))
            glob = `${glob}/**`;
        result.push({ glob, owners });
    }
    return result;
}
function manifestDeclaresWorkspace(manifest) {
    const name = (0, node_path_1.basename)(manifest.path);
    if (WORKSPACE_MANIFEST_NAMES.has(name))
        return true;
    if (name !== 'package.json' || !manifest.content)
        return false;
    try {
        const parsed = JSON.parse(manifest.content);
        return Array.isArray(parsed.workspaces)
            || Boolean(parsed.workspaces && typeof parsed.workspaces === 'object');
    }
    catch {
        return false;
    }
}
function addFact(facts, input) {
    const pathValue = normalizePath(input.path);
    const glob = input.glob || globForPath(pathValue);
    const sourceHash = stableHash(input.source);
    const key = `${input.kind}|${pathValue}|${glob}|${input.language ?? ''}|${input.packageRoot ?? ''}`;
    const fact = {
        id: `topology_${stableHash(key, 20)}`,
        kind: input.kind,
        path: pathValue,
        glob,
        ...(input.language ? { language: input.language } : {}),
        ...(input.packageRoot ? { packageRoot: input.packageRoot } : {}),
        ...(input.owners ? { owners: [...input.owners].sort() } : {}),
        ...(input.details ? { details: { ...input.details } } : {}),
        evidence: {
            type: input.evidenceType,
            authority: input.authority,
            confidence: input.confidence,
            sourceHash,
            freshness: 'current',
            reason: input.reason,
        },
    };
    const existing = facts.get(key);
    const confidenceRank = { low: 0, medium: 1, high: 2 };
    const inputIsStronger = !existing
        || (existing.evidence.authority === 'advisory' && input.authority === 'deterministic')
        || (existing.evidence.authority === input.authority &&
            confidenceRank[input.confidence] > confidenceRank[existing.evidence.confidence]);
    if (inputIsStronger) {
        if (existing?.details || fact.details) {
            fact.details = { ...(existing?.details ?? {}), ...(fact.details ?? {}) };
        }
        facts.set(key, fact);
    }
    else if (existing && (existing.details || fact.details)) {
        facts.set(key, {
            ...existing,
            details: { ...(fact.details ?? {}), ...(existing.details ?? {}) },
        });
    }
}
function addRelationship(relationships, input) {
    const key = `${input.kind}|${input.from}|${input.to}`;
    relationships.set(key, {
        id: `topology_rel_${stableHash(key, 20)}`,
        kind: input.kind,
        from: input.from,
        to: input.to,
        evidenceType: input.evidenceType,
        confidence: input.confidence,
        sourceHash: stableHash(input.source),
        ...(input.sourceLanguage ? { sourceLanguage: input.sourceLanguage } : {}),
        ...(input.parserId ? { parserId: input.parserId } : {}),
        ...(input.parserDepth ? { parserDepth: input.parserDepth } : {}),
        ...(input.inferredFromNaming != null ? { inferredFromNaming: input.inferredFromNaming } : {}),
        ...(input.directEvidence != null ? { directEvidence: input.directEvidence } : {}),
        ...(input.relationshipProvenance ? { relationshipProvenance: input.relationshipProvenance } : {}),
    });
}
function repositoryLanguageKeyForPath(pathValue) {
    const extension = (0, node_path_1.extname)(pathValue).toLowerCase();
    if (['.py', '.pyi'].includes(extension))
        return 'python';
    if (['.ts', '.tsx', '.mts', '.cts'].includes(extension))
        return 'typescript';
    if (['.js', '.jsx', '.mjs', '.cjs'].includes(extension))
        return 'javascript';
    return 'unknown';
}
function repositoryLanguageForTopologyRoot(paths, root) {
    const prefix = root === '.' ? '' : `${root}/`;
    const sample = paths.find((pathValue) => ((root === '.' || pathValue.startsWith(prefix))
        && (0, node_path_1.extname)(pathValue).length > 0
        && !isDeterministicTestFile(pathValue)));
    return sample ? repositoryLanguageKeyForPath(sample) : 'unknown';
}
function compileRepositoryTopology(input) {
    const compiledAt = input.compiledAt ?? new Date().toISOString();
    const paths = Array.from(new Set(input.paths.map(normalizePath).filter((path) => path !== '.'))).sort();
    const manifests = (input.manifests ?? [])
        .map((manifest) => ({ ...manifest, path: normalizePath(manifest.path) }))
        .filter((manifest) => paths.includes(manifest.path) || MANIFEST_NAMES.has((0, node_path_1.basename)(manifest.path)) || WORKSPACE_MANIFEST_NAMES.has((0, node_path_1.basename)(manifest.path)))
        .sort((left, right) => left.path.localeCompare(right.path));
    const facts = new Map();
    const relationships = new Map();
    const brainParticipated = Boolean(input.brain
        && input.brain.facts.length > 0
        && (input.brain.freshness === 'fresh' || input.brain.freshness === 'partial'));
    addFact(facts, {
        kind: 'repository-root',
        path: '.',
        glob: '**',
        evidenceType: 'tracked-path',
        authority: 'deterministic',
        confidence: 'high',
        reason: 'Repository root is established by the tracked-file inventory supplied by the local runtime.',
        source: { trackedPathHash: stableHash(paths) },
    });
    const packageRoots = new Set(['.']);
    for (const manifest of manifests) {
        const name = (0, node_path_1.basename)(manifest.path);
        const root = rootForManifest(manifest.path);
        if (MANIFEST_NAMES.has(name)) {
            packageRoots.add(root);
            addFact(facts, {
                kind: 'package-root',
                path: root,
                glob: root === '.' ? '**' : `${root}/**`,
                packageRoot: root,
                evidenceType: 'manifest',
                authority: 'deterministic',
                confidence: 'high',
                reason: `Tracked package manifest ${manifest.path} establishes this package root.`,
                source: { path: manifest.path, contentHash: manifest.content ? stableHash(manifest.content) : null },
            });
        }
        if (manifestDeclaresWorkspace(manifest)) {
            addFact(facts, {
                kind: 'workspace-root',
                path: root,
                glob: root === '.' ? '**' : `${root}/**`,
                packageRoot: root,
                evidenceType: 'workspace-manifest',
                authority: 'deterministic',
                confidence: 'high',
                reason: `Tracked workspace manifest ${manifest.path} establishes this workspace root.`,
                source: { path: manifest.path, contentHash: manifest.content ? stableHash(manifest.content) : null },
            });
        }
    }
    const sortedPackageRoots = Array.from(packageRoots).sort((left, right) => left.localeCompare(right));
    const languageFiles = new Map();
    for (const pathValue of paths) {
        const language = LANGUAGE_BY_EXTENSION[(0, node_path_1.extname)(pathValue).toLowerCase()];
        if (!language || isDeterministicTestFile(pathValue))
            continue;
        const packageRoot = packageRootForPath(pathValue, sortedPackageRoots);
        const key = `${packageRoot}|${language}`;
        const bucket = languageFiles.get(key) ?? [];
        bucket.push(pathValue);
        languageFiles.set(key, bucket);
    }
    for (const [key, files] of languageFiles) {
        const [packageRoot, language] = key.split('|');
        const sourceRoot = sourceRootForFiles(files, packageRoot);
        addFact(facts, {
            kind: 'language',
            path: packageRoot,
            glob: packageRoot === '.' ? '**' : `${packageRoot}/**`,
            packageRoot,
            language,
            evidenceType: 'file-classifier',
            authority: 'deterministic',
            confidence: 'high',
            reason: `${files.length} tracked file(s) use a supported ${language} extension in this package.`,
            source: files,
        });
        const leafDirectories = new Map();
        for (const file of files) {
            const directory = (0, node_path_1.dirname)(file);
            const bucket = leafDirectories.get(directory) ?? [];
            bucket.push(file);
            leafDirectories.set(directory, bucket);
        }
        for (const [directory, members] of leafDirectories) {
            if (directory === sourceRoot)
                continue;
            addFact(facts, {
                kind: 'source-root',
                path: directory,
                glob: `${directory}/**`,
                packageRoot,
                language,
                evidenceType: 'tracked-path',
                authority: 'advisory',
                confidence: members.length > 1 ? 'medium' : 'low',
                reason: 'Tracked source files establish this observed leaf area; its directory name is advisory and requires corroborating intent or plan evidence.',
                source: members,
            });
        }
        // A repository-root common directory is not a usable write boundary. It
        // only proves that language files exist in multiple top-level areas; turning
        // that fact into `**` would silently grant the entire repository.
        if (sourceRoot !== '.') {
            addFact(facts, {
                kind: 'source-root',
                path: sourceRoot,
                glob: globForPath(sourceRoot),
                packageRoot,
                language,
                evidenceType: 'tracked-path',
                authority: 'deterministic',
                confidence: files.length > 1 ? 'high' : 'medium',
                reason: 'This source root is the observed common tracked-file root for a language inside an established package.',
                source: files,
            });
        }
        if (sourceRoot !== '.' && sourceRoot !== packageRoot) {
            addRelationship(relationships, {
                kind: 'package-contains',
                from: packageRoot,
                to: sourceRoot,
                evidenceType: 'tracked-path',
                confidence: 'high',
                source: files,
            });
        }
    }
    const deterministicTests = paths.filter(isDeterministicTestFile);
    const advisoryTestRoots = new Set(paths.map(advisoryTestDirectory).filter((value) => Boolean(value)));
    const testRoots = new Map();
    for (const testPath of deterministicTests) {
        const root = advisoryTestDirectory(testPath) ?? (0, node_path_1.dirname)(testPath);
        const entry = testRoots.get(root) ?? { paths: [], deterministic: true };
        entry.paths.push(testPath);
        testRoots.set(root, entry);
    }
    for (const root of advisoryTestRoots) {
        if (!testRoots.has(root)) {
            const members = paths.filter((pathValue) => pathValue.startsWith(`${root}/`));
            testRoots.set(root, { paths: members, deterministic: false });
        }
    }
    for (const [root, evidence] of testRoots) {
        const packageRoot = packageRootForPath(root, sortedPackageRoots);
        addFact(facts, {
            kind: 'test-root',
            path: root,
            glob: `${root}/**`,
            packageRoot,
            evidenceType: 'file-classifier',
            authority: evidence.deterministic ? 'deterministic' : 'advisory',
            confidence: evidence.deterministic ? 'high' : 'medium',
            reason: evidence.deterministic
                ? 'Tracked test/spec filename patterns establish this test root.'
                : 'A conventional test directory exists with tracked files; its name is advisory until corroborated by test filenames or graph facts.',
            source: evidence.paths,
        });
    }
    const sourceFacts = Array.from(facts.values()).filter((fact) => fact.kind === 'source-root');
    for (const testPath of deterministicTests) {
        const testStem = (0, node_path_1.basename)(testPath).replace(/(?:^test_|[._-](?:test|spec))(?=\.)/i, '').replace((0, node_path_1.extname)(testPath), '');
        const candidates = paths.filter((pathValue) => {
            if (!LANGUAGE_BY_EXTENSION[(0, node_path_1.extname)(pathValue).toLowerCase()] || isDeterministicTestFile(pathValue))
                return false;
            return (0, node_path_1.basename)(pathValue, (0, node_path_1.extname)(pathValue)).toLowerCase() === testStem.toLowerCase();
        });
        for (const sourcePath of candidates) {
            const sourceLanguage = repositoryLanguageKeyForPath(sourcePath);
            addRelationship(relationships, {
                kind: 'source-to-test',
                from: sourcePath,
                to: testPath,
                evidenceType: 'test-adjacency',
                confidence: 'high',
                sourceLanguage,
                parserId: 'repository-topology',
                parserDepth: 'metadata_only',
                inferredFromNaming: sourceLanguage === 'python',
                directEvidence: sourceLanguage === 'typescript' || sourceLanguage === 'javascript',
                relationshipProvenance: 'filename-stem-adjacency',
                source: { sourcePath, testPath },
            });
        }
    }
    for (const sourceFact of sourceFacts) {
        const packageTests = Array.from(facts.values()).filter((fact) => fact.kind === 'test-root' && fact.packageRoot === sourceFact.packageRoot);
        for (const testFact of packageTests) {
            addRelationship(relationships, {
                kind: 'source-to-test',
                from: sourceFact.path,
                to: testFact.path,
                evidenceType: 'test-adjacency',
                confidence: testFact.evidence.authority === 'deterministic' ? 'medium' : 'low',
                sourceLanguage: repositoryLanguageForTopologyRoot(paths, sourceFact.path),
                parserId: 'repository-topology',
                parserDepth: 'metadata_only',
                inferredFromNaming: true,
                directEvidence: false,
                relationshipProvenance: 'package-test-root-adjacency',
                source: { sourceRoot: sourceFact.path, testRoot: testFact.path },
            });
        }
    }
    const documentationGroups = new Map();
    for (const pathValue of paths.filter((path) => DOCUMENT_EXTENSIONS.has((0, node_path_1.extname)(path).toLowerCase()))) {
        const root = documentationRoot(pathValue);
        const bucket = documentationGroups.get(root) ?? [];
        bucket.push(pathValue);
        documentationGroups.set(root, bucket);
    }
    for (const [root, files] of documentationGroups) {
        addFact(facts, {
            kind: 'documentation',
            path: root,
            glob: globForPath(root),
            packageRoot: packageRootForPath(root, sortedPackageRoots),
            evidenceType: 'file-classifier',
            authority: 'deterministic',
            confidence: 'high',
            reason: 'Tracked documentation-format files establish this documentation surface.',
            source: files,
        });
    }
    for (const pathValue of paths) {
        const file = (0, node_path_1.basename)(pathValue);
        const extension = (0, node_path_1.extname)(pathValue).toLowerCase();
        if (CONFIG_BASENAMES.has(file) || MANIFEST_NAMES.has(file) || WORKSPACE_MANIFEST_NAMES.has(file)) {
            addFact(facts, {
                kind: 'configuration',
                path: pathValue,
                glob: pathValue,
                packageRoot: packageRootForPath(pathValue, sortedPackageRoots),
                evidenceType: MANIFEST_NAMES.has(file) || WORKSPACE_MANIFEST_NAMES.has(file) ? 'manifest' : 'file-classifier',
                authority: 'deterministic',
                confidence: 'high',
                reason: 'Tracked configuration or manifest filename establishes this exact configuration surface.',
                source: pathValue,
            });
        }
        if (file === 'Dockerfile' || /^Dockerfile\./.test(file) || /\.tf(?:vars)?$/.test(file) || /\.ya?ml$/.test(extension) && pathValue.startsWith('.github/')) {
            addFact(facts, {
                kind: 'infrastructure',
                path: pathValue,
                glob: pathValue,
                packageRoot: packageRootForPath(pathValue, sortedPackageRoots),
                evidenceType: 'file-classifier',
                authority: 'deterministic',
                confidence: 'high',
                reason: 'Tracked infrastructure-format file establishes this exact infrastructure surface.',
                source: pathValue,
            });
        }
        if (API_SCHEMA_EXTENSIONS.has(extension) || /(^|\/)(openapi|swagger)\.(json|ya?ml)$/i.test(pathValue)) {
            const kind = extension === '.proto' || extension === '.graphql' || extension === '.gql'
                ? 'api-contract'
                : 'schema';
            addFact(facts, {
                kind,
                path: pathValue,
                glob: pathValue,
                packageRoot: packageRootForPath(pathValue, sortedPackageRoots),
                evidenceType: 'file-classifier',
                authority: 'deterministic',
                confidence: 'high',
                reason: 'Tracked API/schema format establishes this exact contract surface.',
                source: pathValue,
            });
        }
        if (extension === '.sql' || /(^|\/)(migrations?|alembic|flyway)(\/|$)/i.test(pathValue)) {
            addFact(facts, {
                kind: 'migration',
                path: pathValue,
                glob: pathValue,
                packageRoot: packageRootForPath(pathValue, sortedPackageRoots),
                evidenceType: 'file-classifier',
                authority: extension === '.sql' && /(?:^|\/)\d{3,}[_-]/.test(pathValue) ? 'deterministic' : 'advisory',
                confidence: extension === '.sql' ? 'medium' : 'low',
                reason: extension === '.sql'
                    ? 'Tracked SQL file is migration-relevant; numbered SQL is deterministic migration evidence and other SQL remains advisory.'
                    : 'A migration-like conventional path exists; the directory name alone is advisory.',
                source: pathValue,
            });
        }
        if (/(^|\/)(node_modules|vendor|\.venv|venv|__pycache__|\.cache|dist|build|coverage|\.next|\.turbo)(\/|$)/.test(pathValue)) {
            const parts = pathValue.split('/');
            const index = parts.findIndex((part) => /^(node_modules|vendor|\.venv|venv|__pycache__|\.cache|dist|build|coverage|\.next|\.turbo)$/.test(part));
            const root = parts.slice(0, index + 1).join('/');
            addFact(facts, {
                kind: 'ignored-output',
                path: root,
                glob: `${root}/**`,
                packageRoot: packageRootForPath(root, sortedPackageRoots),
                evidenceType: 'file-classifier',
                authority: 'advisory',
                confidence: 'medium',
                reason: 'Tracked paths exist below a generic vendor/cache/output classifier; the conventional name is advisory.',
                source: pathValue,
            });
        }
    }
    for (const rule of parseCodeowners(input.codeownersContent)) {
        addFact(facts, {
            kind: 'owner-boundary',
            path: rule.glob.replace(/\/\*\*$/, ''),
            glob: rule.glob,
            owners: rule.owners,
            evidenceType: 'codeowners',
            authority: 'deterministic',
            confidence: 'high',
            reason: 'CODEOWNERS explicitly assigns review authority for this boundary.',
            source: rule,
        });
    }
    for (const glob of input.protectedGlobs ?? []) {
        const normalized = normalizePath(glob.replace(/\/\*\*$/, ''));
        addFact(facts, {
            kind: 'protected-boundary',
            path: normalized,
            glob: normalizePath(glob),
            evidenceType: 'repository-config',
            authority: 'deterministic',
            confidence: 'high',
            reason: 'Active repository governance configuration explicitly marks this boundary as protected.',
            source: glob,
        });
    }
    for (const generated of input.generatedEvidence ?? []) {
        const outputPath = normalizePath(generated.outputPath);
        addFact(facts, {
            kind: 'generated-output',
            path: outputPath,
            glob: globForPath(outputPath),
            packageRoot: packageRootForPath(outputPath, sortedPackageRoots),
            evidenceType: 'generated-provenance',
            authority: 'deterministic',
            confidence: generated.sourcePath ? 'high' : 'medium',
            reason: `Generated provenance was established by ${generated.evidenceType}.`,
            source: generated,
            details: {
                ...(generated.sourcePath ? { sourceOfTruth: normalizePath(generated.sourcePath) } : {}),
                ...(generated.command ? { regenerationCommand: generated.command } : {}),
                directEdit: generated.sourcePath ? 'block' : 'warn',
                checksumExpected: generated.evidenceType === 'checksum',
                reviewerRequired: true,
            },
        });
        if (generated.sourcePath) {
            addRelationship(relationships, {
                kind: 'generated-from',
                from: outputPath,
                to: normalizePath(generated.sourcePath),
                evidenceType: 'generated-provenance',
                confidence: 'high',
                source: generated,
            });
        }
    }
    for (const brainFact of brainParticipated ? input.brain?.facts ?? [] : []) {
        if (!brainFact.relatedPath)
            continue;
        addRelationship(relationships, {
            kind: brainFact.kind === 'test' ? 'source-to-test' : 'brain-related',
            from: normalizePath(brainFact.path),
            to: normalizePath(brainFact.relatedPath),
            evidenceType: 'brain-graph',
            confidence: brainFact.authority === 'deterministic_exact' ? 'high' : input.brain?.freshness === 'fresh' ? 'high' : 'medium',
            sourceLanguage: repositoryLanguageKeyForPath(brainFact.path),
            parserId: brainFact.parserId ?? 'repository-graph-v2',
            parserDepth: brainFact.parserDepth ?? 'metadata_only',
            inferredFromNaming: brainFact.authority === 'advisory_heuristic' || brainFact.authority === 'bounded_inference',
            directEvidence: brainFact.enforcementEligible === true,
            relationshipProvenance: brainFact.parserId ?? 'repository-graph-v2',
            source: brainFact,
        });
    }
    const sortedFacts = Array.from(facts.values()).sort((left, right) => left.kind.localeCompare(right.kind) || left.path.localeCompare(right.path) || left.glob.localeCompare(right.glob));
    const sortedRelationships = Array.from(relationships.values()).sort((left, right) => left.kind.localeCompare(right.kind) || left.from.localeCompare(right.from) || left.to.localeCompare(right.to));
    const manifestSummary = manifests.map((manifest) => ({
        path: manifest.path,
        root: rootForManifest(manifest.path),
        contentHash: manifest.content ? stableHash(manifest.content) : null,
    }));
    const brainFacts = (input.brain?.facts ?? [])
        .map((fact) => ({
        ...fact,
        path: normalizePath(fact.path),
        ...(fact.relatedPath ? { relatedPath: normalizePath(fact.relatedPath) } : {}),
    }))
        .sort((left, right) => left.kind.localeCompare(right.kind)
        || left.path.localeCompare(right.path)
        || String(left.name ?? '').localeCompare(String(right.name ?? '')));
    const canonical = {
        schemaVersion: exports.REPOSITORY_TOPOLOGY_SCHEMA_VERSION,
        trackedFileCount: paths.length,
        trackedPathHash: stableHash(paths),
        facts: sortedFacts,
        relationships: sortedRelationships,
        manifests: manifestSummary,
        brain: {
            participated: brainParticipated,
            freshness: input.brain?.freshness ?? null,
            factCount: brainFacts.length,
            facts: brainFacts,
        },
    };
    return {
        schemaVersion: exports.REPOSITORY_TOPOLOGY_SCHEMA_VERSION,
        artifactHash: stableHash(canonical),
        trackedFileCount: paths.length,
        trackedPathHash: canonical.trackedPathHash,
        compiledAt,
        facts: sortedFacts,
        relationships: sortedRelationships,
        manifests: manifestSummary,
        brain: {
            ...canonical.brain,
            reason: canonical.brain.participated
                ? 'Freshness-qualified local Repo Brain facts participated in topology relationships.'
                : input.brain?.facts.length
                    ? `Repo Brain facts were present but did not participate because freshness was ${input.brain.freshness ?? 'unknown'}.`
                    : 'Repo Brain facts were not available; topology was compiled from tracked paths, manifests, ownership, and repository configuration.',
        },
        limitations: [
            'Conventional directory names are advisory discovery signals and never independently grant write authority.',
            'Generated provenance is deterministic only when an explicit header, attribute, manifest, checksum, script, or generator relationship is supplied.',
            'Natural-language intent remains bounded by explicit paths, accepted plans, and observed topology facts.',
        ],
        privacy: {
            sourceIncluded: false,
            sourceUploaded: false,
            promptIncluded: false,
            pathsIncluded: true,
        },
    };
}
function topologyFacts(topology, kinds, options = {}) {
    if (!topology)
        return [];
    const kindSet = new Set(kinds);
    return topology.facts.filter((fact) => kindSet.has(fact.kind)
        && (!options.deterministicOnly || fact.evidence.authority === 'deterministic'));
}
/**
 * Materialize only session-relevant topology facts. The complete authority stays
 * in the immutable Brain/profile generation identified by sourceArtifactHash.
 * Projection limits never change repository coverage denominators.
 */
function projectRepositoryTopologyForSession(topology, relevantGlobs, limits = {}) {
    if (!topology)
        return undefined;
    const factLimit = Math.max(32, Math.min(1_000, limits.facts ?? 512));
    const relationshipLimit = Math.max(16, Math.min(1_000, limits.relationships ?? 512));
    const brainFactLimit = Math.max(0, Math.min(500, limits.brainFacts ?? 200));
    const matchers = relevantGlobs.map((glob) => {
        const prefix = glob.replace(/\/\*\*$/, '').replace(/\/\*$/, '');
        const matcher = /[*?]/.test(glob) ? micromatch_1.default.matcher(glob, { dot: true }) : null;
        return (pathValue) => pathValue === prefix || pathValue.startsWith(`${prefix}/`) || matcher?.(pathValue) === true;
    });
    const relevant = (pathValue) => matchers.some((matcher) => matcher(pathValue));
    const priorityKinds = new Set([
        'repository-root', 'workspace-root', 'package-root', 'protected-boundary',
        'owner-boundary', 'migration', 'generated-output', 'schema', 'api-contract',
    ]);
    const facts = topology.facts
        .map((fact) => {
        const isRelevant = relevant(fact.path);
        return {
            fact,
            isRelevant,
            score: (isRelevant ? 4 : 0) + (priorityKinds.has(fact.kind) ? 2 : 0) + (fact.evidence.authority === 'deterministic' ? 1 : 0),
        };
    })
        .filter(({ fact, isRelevant }) => isRelevant || priorityKinds.has(fact.kind))
        .sort((left, right) => right.score - left.score || left.fact.path.localeCompare(right.fact.path))
        .slice(0, factLimit)
        .map(({ fact }) => fact)
        .sort((left, right) => left.kind.localeCompare(right.kind) || left.path.localeCompare(right.path));
    const selectedPaths = new Set(facts.map((fact) => fact.path));
    const relationships = topology.relationships
        .filter((relationship) => relevant(relationship.from) || relevant(relationship.to) || selectedPaths.has(relationship.from) || selectedPaths.has(relationship.to))
        .slice(0, relationshipLimit);
    const brainFacts = topology.brain.facts
        .filter((fact) => relevant(fact.path) || (fact.relatedPath ? relevant(fact.relatedPath) : false))
        .slice(0, brainFactLimit);
    const projection = {
        bounded: true,
        sourceArtifactHash: topology.artifactHash,
        selectedFacts: facts.length,
        totalFacts: topology.facts.length,
        selectedRelationships: relationships.length,
        totalRelationships: topology.relationships.length,
        reason: 'session_relevant_projection',
    };
    return {
        ...topology,
        artifactHash: stableHash({ sourceArtifactHash: topology.artifactHash, facts, relationships, brainFacts, projection }),
        facts,
        relationships,
        brain: { ...topology.brain, factCount: brainFacts.length, facts: brainFacts },
        limitations: [...new Set([
                ...topology.limitations,
                'Session topology is a bounded relevant projection; complete authority remains in the referenced immutable profile and Brain generation.',
            ])],
        projection,
    };
}
function topologyHasPath(topology, pathOrGlob) {
    if (!topology)
        return false;
    const normalized = normalizePath(pathOrGlob);
    if (normalized === '.' || normalized === '**')
        return false;
    const observedFacts = topology.facts.filter((fact) => fact.path !== '.'
        && fact.glob !== '**'
        && fact.kind !== 'repository-root'
        && fact.kind !== 'workspace-root'
        && fact.kind !== 'package-root'
        && fact.kind !== 'language');
    const recursivePrefix = normalized.endsWith('/**')
        ? normalized.slice(0, -3).replace(/\/$/, '')
        : null;
    return observedFacts.some((fact) => fact.path === normalized
        || fact.glob === normalized
        || (recursivePrefix !== null
            ? fact.path === recursivePrefix || fact.path.startsWith(`${recursivePrefix}/`)
            : micromatch_1.default.isMatch(fact.path, normalized, { dot: true })));
}
function topologySupportGlobs(topology, packageRoots = [], kinds = ['test-root']) {
    const rootSet = new Set(packageRoots);
    return topologyFacts(topology, kinds)
        .filter((fact) => rootSet.size === 0 || rootSet.has(fact.packageRoot ?? '.'))
        .filter((fact) => fact.evidence.authority === 'deterministic')
        .map((fact) => fact.glob)
        .filter((glob, index, all) => all.indexOf(glob) === index)
        .sort();
}
function topologyPackageRootsForPaths(topology, paths) {
    if (!topology)
        return [];
    const packageRoots = topologyFacts(topology, ['package-root'])
        .map((fact) => fact.path)
        .sort((left, right) => right.length - left.length);
    const selected = new Set();
    for (const pathValue of paths.map(normalizePath)) {
        const root = packageRoots.find((candidate) => candidate === '.' || pathValue === candidate || pathValue.startsWith(`${candidate}/`));
        if (root)
            selected.add(root);
    }
    return Array.from(selected).sort();
}
function topologyGlobsForIntent(topology, input) {
    if (!topology)
        return [];
    const terms = input.terms.map((term) => term.toLowerCase()).filter(Boolean);
    const explicitPaths = (input.explicitPaths ?? []).map(normalizePath);
    const result = new Map();
    const categoryKinds = new Set();
    if (terms.some((term) => /^(doc|docs|documentation|readme|guide)$/.test(term)))
        categoryKinds.add('documentation');
    if (terms.some((term) => /^(test|tests|spec|specs|coverage)$/.test(term)))
        categoryKinds.add('test-root');
    if (terms.some((term) => /^(migration|migrations|schema|database|db)$/.test(term))) {
        categoryKinds.add('migration');
        categoryKinds.add('schema');
    }
    if (terms.some((term) => /^(api|contract|openapi|graphql|proto|route|routes|handler|handlers|controller|controllers)$/.test(term))) {
        categoryKinds.add('api-contract');
    }
    if (terms.some((term) => /^(config|configuration|settings)$/.test(term)))
        categoryKinds.add('configuration');
    if (terms.some((term) => /^(infra|infrastructure|deployment|docker|terraform|workflow|ci)$/.test(term)))
        categoryKinds.add('infrastructure');
    if (terms.some((term) => /^(generated|generator|codegen)$/.test(term)))
        categoryKinds.add('generated-output');
    const semanticStopTerms = new Set([
        'add', 'build', 'change', 'create', 'edit', 'fix', 'implement', 'modify', 'refactor', 'remove', 'update',
        'code', 'file', 'files', 'module', 'package', 'provider', 'service', 'source',
        'and', 'for', 'from', 'into', 'only', 'the', 'this', 'with',
        'test', 'tests', 'spec', 'specs', 'coverage',
        'doc', 'docs', 'documentation', 'readme', 'guide',
        'config', 'configuration', 'settings',
    ]);
    const distinctiveTerms = terms.filter((term) => !semanticStopTerms.has(term));
    const sourceCandidates = topology.facts
        .filter((fact) => fact.kind === 'source-root' || fact.kind === 'package-root')
        .map((fact) => {
        const segments = fact.path.toLowerCase().split('/');
        return {
            fact,
            score: distinctiveTerms.filter((term) => segments.includes(term)).length,
        };
    });
    const maxSourceScore = Math.max(0, ...sourceCandidates.map((candidate) => candidate.score));
    const groundedPackageRoots = new Set(sourceCandidates
        .filter((candidate) => candidate.score > 0 && candidate.score === maxSourceScore)
        .map((candidate) => candidate.fact.packageRoot ?? candidate.fact.path));
    for (const explicitPath of explicitPaths) {
        for (const root of topologyPackageRootsForPaths(topology, [explicitPath]))
            groundedPackageRoots.add(root);
    }
    for (const fact of topology.facts) {
        // Root facts describe repository/package existence. They are never valid
        // write-scope selections, even when an explicit path happens to match `**`.
        if (fact.path === '.' || fact.glob === '**')
            continue;
        const explicitMatch = explicitPaths.some((pathValue) => pathValue === fact.path
            || pathValue.startsWith(`${fact.path}/`)
            || micromatch_1.default.isMatch(pathValue, fact.glob, { dot: true }));
        const categoryMatch = categoryKinds.has(fact.kind)
            && (groundedPackageRoots.size === 0 || groundedPackageRoots.has(fact.packageRoot ?? '.'));
        const segmentMatch = terms.some((term) => fact.path.toLowerCase().split('/').includes(term)
            || (0, node_path_1.basename)(fact.path).toLowerCase().replace((0, node_path_1.extname)(fact.path).toLowerCase(), '') === term);
        const scopedSegmentMatch = (fact.kind === 'source-root' || fact.kind === 'package-root') && groundedPackageRoots.size > 0
            ? segmentMatch && groundedPackageRoots.has(fact.packageRoot ?? fact.path)
            : segmentMatch;
        const advisoryCorroborated = fact.evidence.authority === 'advisory' && (explicitMatch || segmentMatch);
        if (!explicitMatch && !categoryMatch && !scopedSegmentMatch)
            continue;
        if (fact.evidence.authority === 'advisory' && !advisoryCorroborated)
            continue;
        if (!['source-root', 'test-root', 'documentation', 'configuration', 'infrastructure', 'migration', 'generated-output', 'api-contract', 'schema'].includes(fact.kind))
            continue;
        result.set(fact.glob, {
            glob: fact.glob,
            factId: fact.id,
            confidence: fact.evidence.confidence,
            authority: fact.evidence.authority,
            reason: fact.evidence.reason,
        });
    }
    for (const fact of topology.brain.participated ? topology.brain.facts ?? [] : []) {
        const name = fact.name?.toLowerCase() ?? '';
        if (!name || !terms.some((term) => term === name || name.includes(term)))
            continue;
        const confidence = fact.authority === 'deterministic_exact'
            ? 'high'
            : topology.brain.freshness === 'fresh' ? 'high' : 'medium';
        const deterministic = fact.enforcementEligible === true
            && (fact.authority === 'deterministic_exact' || fact.authority === 'deterministic_structural');
        result.set(fact.path, {
            glob: fact.path,
            factId: `brain_${stableHash(fact, 20)}`,
            confidence,
            authority: deterministic ? 'deterministic' : 'advisory',
            reason: `Repository Graph V2 ${fact.kind} fact matched symbol ${fact.name}; authority is ${fact.authority ?? 'not_evaluated'}.`,
        });
        if (fact.relatedPath) {
            result.set(fact.relatedPath, {
                glob: fact.relatedPath,
                factId: `brain_related_${stableHash(fact, 20)}`,
                confidence,
                authority: deterministic ? 'deterministic' : 'advisory',
                reason: `Repository Graph V2 relationship connects ${fact.path} to ${fact.relatedPath}; authority is ${fact.authority ?? 'not_evaluated'}.`,
            });
        }
    }
    if (input.includeSupport && explicitPaths.length > 0) {
        const roots = topologyPackageRootsForPaths(topology, explicitPaths);
        for (const glob of topologySupportGlobs(topology, roots)) {
            const fact = topology.facts.find((candidate) => candidate.glob === glob);
            if (!fact)
                continue;
            result.set(glob, {
                glob,
                factId: fact.id,
                confidence: fact.evidence.confidence,
                authority: fact.evidence.authority,
                reason: `Observed support surface in the same package: ${fact.evidence.reason}`,
            });
        }
    }
    return Array.from(result.values()).sort((left, right) => left.glob.localeCompare(right.glob));
}
//# sourceMappingURL=repository-topology.js.map