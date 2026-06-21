"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeProposedChange = analyzeProposedChange;
const node_crypto_1 = require("node:crypto");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const contracts_1 = require("@neurcode-ai/contracts");
const brain_1 = require("@neurcode-ai/brain");
const local_repo_brain_1 = require("./local-repo-brain");
function hash(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
}
function shortHash(value) {
    return hash(value).slice(0, 24);
}
function normalizePath(value) {
    return (0, node_path_1.normalize)(value).replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+/g, '/');
}
function gitValue(repoRoot, args) {
    try {
        const value = (0, node_child_process_1.execFileSync)('git', args, {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return value || null;
    }
    catch {
        return null;
    }
}
function contractLanguage(language) {
    const supported = [
        'typescript', 'javascript', 'python', 'go', 'java', 'ruby', 'rust',
        'markdown', 'yaml', 'json', 'shell', 'sql', 'other',
    ];
    return supported.includes(language)
        ? language
        : 'other';
}
function sourceFreeSymbol(symbol) {
    return {
        id: `symbol:${shortHash(`${symbol.file}:${symbol.language}:${symbol.kind}:${symbol.name}:${symbol.line}`)}`,
        name: symbol.name,
        kind: symbol.kind,
        language: contractLanguage(symbol.language),
        filePath: symbol.file,
        line: symbol.line,
        exported: symbol.exported,
        local: symbol.local,
        arity: symbol.arity,
        signatureHash: symbol.normalizedSignatureHash ?? symbol.signatureHash,
        structuralFingerprint: symbol.tokenFingerprintHash,
        parserDepth: 'regex_degraded',
    };
}
function localSymbol(symbol) {
    return {
        name: symbol.name,
        kind: symbol.kind === 'unknown' || symbol.kind === 'module' ? 'const' : symbol.kind,
        file: symbol.filePath,
        line: symbol.line ?? 1,
        exported: symbol.exported,
        local: symbol.local,
        normalizedSignature: null,
        normalizedSignatureHash: symbol.signatureHash,
        signatureHash: symbol.signatureHash ?? shortHash(`${symbol.language}:${symbol.kind}:${symbol.name}`),
        tokenFingerprintHash: symbol.structuralFingerprint,
        arity: symbol.arity,
        language: contractLanguage(symbol.language),
    };
}
function boundaryForPath(graph, path) {
    const file = graph?.nodes.find((node) => node.kind === 'file' && node.path === path);
    const packageKey = typeof file?.attributes.package === 'string'
        ? file.attributes.package
        : graph?.nodes
            .filter((node) => node.kind === 'package' && typeof node.path === 'string')
            .filter((node) => path === node.path || path.startsWith(`${node.path}/`))
            .sort((left, right) => (right.path?.length ?? 0) - (left.path?.length ?? 0))[0]?.key
            ?? null;
    const serviceKey = typeof file?.attributes.service === 'string'
        ? file.attributes.service
        : path.match(/^(?:services|apps)\/([^/]+)/)?.[0]
            ?? null;
    return { packageKey, serviceKey };
}
function resolveRepositoryImport(input) {
    const { fact } = input;
    if (fact.kind === 'dynamic' && fact.target === '<dynamic>') {
        return {
            ...fact,
            resolution: 'dynamic',
            resolutionReason: 'dynamic_import_target_not_literal',
        };
    }
    if (!fact.target.startsWith('.') && fact.kind !== 'python_import') {
        return {
            ...fact,
            resolution: 'external_package',
            resolutionReason: null,
        };
    }
    const base = fact.kind === 'python_import' && !fact.target.startsWith('.')
        ? fact.target.replace(/\./g, '/')
        : normalizePath((0, node_path_1.join)((0, node_path_1.dirname)(fact.fromFile), fact.target));
    const candidates = fact.kind === 'python_import'
        ? [`${base}.py`, `${base}/__init__.py`]
        : [
            base,
            ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py'].map((extension) => `${base}${extension}`),
            ...['index.ts', 'index.tsx', 'index.js', 'index.jsx', '__init__.py']
                .map((entry) => normalizePath((0, node_path_1.join)(base, entry))),
        ];
    const graphPaths = new Set(input.graph?.nodes
        .filter((node) => node.kind === 'file' && typeof node.path === 'string')
        .map((node) => node.path)
        ?? []);
    const matches = candidates.filter((candidate) => graphPaths.has(candidate) || (0, node_fs_1.existsSync)((0, node_path_1.join)(input.repoRoot, candidate)));
    if (matches.length !== 1) {
        return {
            ...fact,
            resolution: matches.length > 1 ? 'ambiguous' : 'unresolved',
            resolutionReason: matches.length > 1
                ? 'multiple_repository_import_targets'
                : 'repository_import_target_not_found',
        };
    }
    const resolvedFile = matches[0];
    const sourceBoundary = boundaryForPath(input.graph, fact.fromFile);
    const targetBoundary = boundaryForPath(input.graph, resolvedFile);
    return {
        ...fact,
        resolvedFile,
        resolution: 'resolved_repository',
        resolutionReason: null,
        sourcePackage: sourceBoundary.packageKey,
        targetPackage: targetBoundary.packageKey,
        sourceService: sourceBoundary.serviceKey,
        targetService: targetBoundary.serviceKey,
    };
}
function resolveCalls(input) {
    const calls = input.calls.map((call) => {
        if (call.resolution === 'local_symbol')
            return call;
        if (call.callKind !== 'direct')
            return call;
        const matchingImports = input.imports.filter((fact) => fact.resolution === 'resolved_repository'
            && fact.resolvedFile
            && fact.importedNames.includes(call.calledName));
        const candidates = matchingImports.flatMap((fact) => input.graph?.nodes.filter((node) => node.kind === 'symbol'
            && node.path === fact.resolvedFile
            && node.name === call.calledName) ?? []);
        if (candidates.length === 1) {
            return {
                ...call,
                resolvedSymbolId: candidates[0].id,
                resolvedFile: candidates[0].path,
                resolution: 'imported_symbol',
                resolutionReason: null,
            };
        }
        if (candidates.length > 1 || matchingImports.length > 1) {
            return {
                ...call,
                resolvedSymbolId: null,
                resolvedFile: null,
                resolution: 'ambiguous',
                resolutionReason: 'multiple_imported_call_targets',
            };
        }
        return call;
    });
    return {
        calls,
        references: calls.map((call) => ({
            id: `reference:${shortHash(call.id)}`,
            filePath: call.filePath,
            name: call.calledName,
            line: call.line,
            kind: call.callKind === 'property' ? 'property' : 'call_target',
            resolvedSymbolId: call.resolvedSymbolId,
            resolvedFile: call.resolvedFile,
            resolution: call.resolution,
            resolutionReason: call.resolutionReason,
            parserDepth: call.parserDepth,
        })),
    };
}
function status(fact, value, reasons = []) {
    return { fact, status: value, reasons: [...new Set(reasons)].sort() };
}
const POLICY_FACTS = {
    symbol_uniqueness: ['symbol'],
    import_boundary: ['path', 'import'],
    layering: ['path', 'import', 'call'],
    ownership_approval: ['path', 'ownership'],
    service_dependency: ['path', 'import', 'service'],
    required_test: ['path', 'test'],
    sensitive_surface_approval: ['path', 'surface'],
    review_required_surface: ['path', 'surface'],
    generated_file_restriction: ['path', 'surface'],
    scope_constraint: ['path', 'symbol'],
};
function completeness(input) {
    const unavailableReason = input.operation === 'delete'
        ? 'delete_operation_has_no_proposed_content'
        : 'proposed_content_unavailable';
    const parserReasons = [...input.limitations, ...input.extractionErrors];
    const importIncomplete = input.imports
        .filter((fact) => ['unresolved', 'ambiguous', 'dynamic'].includes(fact.resolution ?? 'unresolved'))
        .map((fact) => fact.resolutionReason ?? `import_${fact.resolution ?? 'unresolved'}`);
    const callIncomplete = input.calls
        .filter((fact) => !['local_symbol', 'imported_symbol', 'repository_symbol'].includes(fact.resolution))
        .map((fact) => fact.resolutionReason ?? `call_${fact.resolution}`);
    const ast = input.parserDepth === 'ast' || input.parserDepth === 'syntax_tree';
    const facts = [
        status('path', 'complete'),
        status('symbol', !input.contentPresent ? 'unavailable' : ast ? 'complete' : 'partial', !input.contentPresent ? [unavailableReason] : ast ? [] : parserReasons),
        status('import', !input.contentPresent ? 'unavailable' : !ast || importIncomplete.length > 0 ? 'partial' : 'complete', !input.contentPresent ? [unavailableReason] : [...(!ast ? parserReasons : []), ...importIncomplete]),
        status('reference', !input.contentPresent ? 'unavailable' : !ast || callIncomplete.length > 0 ? 'partial' : 'complete', !input.contentPresent ? [unavailableReason] : [...(!ast ? parserReasons : []), ...callIncomplete]),
        status('call', !input.contentPresent ? 'unavailable' : !ast || callIncomplete.length > 0 ? 'partial' : 'complete', !input.contentPresent ? [unavailableReason] : [...(!ast ? parserReasons : []), ...callIncomplete]),
        status('package', !input.contentPresent ? 'unavailable' : !ast || importIncomplete.length > 0 ? 'partial' : 'complete', !input.contentPresent ? [unavailableReason] : [...(!ast ? parserReasons : []), ...importIncomplete]),
        status('service', !input.contentPresent ? 'unavailable' : !ast || importIncomplete.length > 0 ? 'partial' : 'complete', !input.contentPresent ? [unavailableReason] : [...(!ast ? parserReasons : []), ...importIncomplete]),
        status('ownership', 'unavailable', ['repository_graph_fact']),
        status('test', 'unavailable', ['repository_graph_fact']),
        status('surface', 'complete'),
    ];
    const byFact = new Map(facts.map((entry) => [entry.fact, entry]));
    const policies = Object.entries(POLICY_FACTS)
        .map(([family, requiredFacts]) => {
        const missing = requiredFacts.filter((fact) => {
            if (['ownership', 'test'].includes(fact))
                return false;
            return byFact.get(fact)?.status !== 'complete';
        });
        const reasons = missing.flatMap((fact) => byFact.get(fact)?.reasons ?? []);
        return {
            family,
            status: missing.length === 0 ? 'complete' : 'partial',
            requiredFacts,
            missingFacts: missing,
            reasons: [...new Set(reasons)].sort(),
        };
    });
    return { facts, policies };
}
function suppliedEnvelope(value, input) {
    if (value === undefined || value === null)
        return null;
    if (![
        'claude-code-hooks', 'copilot-hooks', 'generic-mcp', 'codex-mcp',
        'cursor-mcp', 'vscode-extension', 'github-action', 'neurcode-cli',
    ].includes(input.adapterId)) {
        throw new Error(`Unsupported trusted proposed-change adapter: ${input.adapterId}`);
    }
    const remote = gitValue(input.repoRoot, ['config', '--get', 'remote.origin.url']);
    return (0, contracts_1.validateAndBindProposedChangeEnvelope)(value, {
        adapterId: input.adapterId,
        timing: input.timing,
        targetPath: input.filePath,
        operation: input.operation,
        previousPath: input.previousPath,
        ...(input.proposedSource !== null ? { expectedContentHash: hash(input.proposedSource) } : {}),
        repository: {
            repoId: `repo:${shortHash(input.repoRoot)}`,
            rootHash: hash(input.repoRoot),
            remoteHash: remote ? hash(remote) : null,
            headSha: gitValue(input.repoRoot, ['rev-parse', 'HEAD']),
        },
        session: {
            sessionId: input.sessionId,
            planRevision: input.planRevision,
        },
    });
}
function analyzeProposedChange(input) {
    const operation = input.operation ?? 'update';
    const provided = suppliedEnvelope(input.proposedChange, {
        repoRoot: input.repoRoot,
        filePath: input.filePath,
        proposedSource: input.proposedSource,
        adapterId: input.adapterId,
        timing: input.timing,
        sessionId: input.sessionId,
        planRevision: input.planRevision,
        operation,
        previousPath: input.previousPath ?? null,
    });
    if (provided) {
        return {
            envelope: provided,
            localSymbols: provided.facts.symbols.map(localSymbol),
        };
    }
    const canonical = input.proposedSource
        ? (0, brain_1.analyzeRepositorySource)({
            filePath: input.filePath,
            sourceText: input.proposedSource,
            contentHash: hash(input.proposedSource),
        })
        : null;
    const canonicalFacts = canonical?.supported && canonical.errors.length === 0
        ? canonical
        : null;
    const analyzed = input.proposedSource && !canonicalFacts
        ? (0, local_repo_brain_1.analyzeLocalProposedSource)(input.filePath, input.proposedSource)
        : null;
    const fallbackSymbols = analyzed?.symbols.map(sourceFreeSymbol) ?? [];
    const fallbackImports = (analyzed?.imports ?? []).map((edge) => ({
        id: `import:${shortHash(`${edge.fromFile}:${edge.target}:${edge.line}`)}`,
        fromFile: edge.fromFile,
        target: edge.target,
        resolvedFile: edge.resolvedFile,
        importedNames: [],
        kind: edge.targetKind === 'python_module'
            ? 'python_import'
            : edge.targetKind === 'package' || edge.targetKind === 'relative'
                ? 'static'
                : 'unknown',
        line: edge.line,
        parserDepth: 'regex_degraded',
    }));
    const fallbackExports = fallbackSymbols
        .filter((symbol) => symbol.exported)
        .map((symbol) => ({
        id: `export:${shortHash(`${symbol.filePath}:${symbol.name}:${symbol.line}`)}`,
        filePath: symbol.filePath,
        symbolName: symbol.name,
        target: null,
        kind: symbol.language === 'python' ? 'python_public' : 'named',
        line: symbol.line,
        parserDepth: 'regex_degraded',
    }));
    const fallbackRelationships = fallbackSymbols.map((symbol) => ({
        id: `defines:${shortHash(`${input.filePath}:${symbol.id}`)}`,
        type: 'defines',
        fromId: `file:${shortHash(input.filePath)}`,
        toId: symbol.id,
        confidence: 'exact',
        deterministic: true,
        provenance: 'local-proposed-change-extractor',
    }));
    const symbols = canonicalFacts?.symbols ?? fallbackSymbols;
    const graph = (0, brain_1.readRepositoryGraph)(input.repoRoot);
    const imports = (canonicalFacts?.imports ?? fallbackImports).map((fact) => resolveRepositoryImport({ repoRoot: input.repoRoot, graph, fact }));
    const exports = canonicalFacts?.exports ?? fallbackExports;
    const relationships = canonicalFacts?.relationships ?? fallbackRelationships;
    const contentPresent = Boolean(input.proposedSource);
    if (![
        'claude-code-hooks', 'copilot-hooks', 'generic-mcp', 'codex-mcp',
        'cursor-mcp', 'vscode-extension', 'github-action', 'neurcode-cli',
    ].includes(input.adapterId)) {
        throw new Error(`Unsupported trusted proposed-change adapter: ${input.adapterId}`);
    }
    const effectiveHost = (0, contracts_1.deriveTrustedHostPosture)(input.adapterId, input.timing);
    const capability = effectiveHost.capability;
    const language = canonicalFacts?.language ?? contractLanguage(analyzed?.language ?? 'other');
    const remote = gitValue(input.repoRoot, ['config', '--get', 'remote.origin.url']);
    const extractionErrors = canonical && !canonicalFacts
        ? canonical.supported
            ? [...canonical.errors, 'canonical_analyzer_failed_degraded_fallback']
            : [`canonical_analyzer_unavailable:${canonical.language}`, 'regex_degraded_fallback']
        : [];
    const rawCalls = canonicalFacts?.calls ?? [];
    const resolved = resolveCalls({
        graph,
        symbols,
        imports,
        calls: rawCalls,
    });
    const limitations = canonical?.limitations ?? (analyzed
        ? ['Degraded regex extraction does not provide deterministic call/reference completeness.']
        : ['No supported proposed-content parser was available.']);
    const targetBoundary = boundaryForPath(graph, input.filePath);
    const boundaries = [{
            id: `boundary:${shortHash(input.filePath)}`,
            filePath: input.filePath,
            packageKey: targetBoundary.packageKey,
            serviceKey: targetBoundary.serviceKey,
            parserDepth: canonicalFacts?.parserDepth ?? (analyzed ? 'regex_degraded' : 'unsupported'),
        }];
    const factCompleteness = completeness({
        contentPresent,
        parserDepth: canonicalFacts?.parserDepth ?? (analyzed ? 'regex_degraded' : 'unsupported'),
        imports,
        calls: resolved.calls,
        limitations,
        extractionErrors,
        operation,
    });
    return {
        envelope: {
            schemaVersion: contracts_1.PROPOSED_CHANGE_ENVELOPE_SCHEMA_VERSION,
            repository: {
                repoId: `repo:${shortHash(input.repoRoot)}`,
                rootHash: hash(input.repoRoot),
                remoteHash: remote ? hash(remote) : null,
                headSha: gitValue(input.repoRoot, ['rev-parse', 'HEAD']),
            },
            target: {
                path: input.filePath,
                previousPath: input.previousPath ?? null,
                operation,
                language,
            },
            content: {
                present: contentPresent,
                availabilityReason: contentPresent
                    ? input.sourceKind === 'post_write_disk_read'
                        ? 'post_write_disk_read'
                        : 'host_supplied'
                    : operation === 'delete'
                        ? 'delete_operation'
                        : input.adapterId === 'neurcode-cli'
                            ? 'path_only_contract'
                            : capability === 'not_supported'
                                ? 'unsupported_host'
                                : 'path_only_contract',
                contentHash: input.proposedSource ? hash(input.proposedSource) : null,
                rawRetained: false,
            },
            facts: {
                symbols,
                imports,
                exports,
                relationships,
                references: resolved.references,
                calls: resolved.calls,
                boundaries,
                parserDepth: canonicalFacts?.parserDepth ?? (analyzed ? 'regex_degraded' : 'unsupported'),
                extractionErrors,
                limitations,
                completeness: factCompleteness,
            },
            host: effectiveHost,
            session: {
                sessionId: input.sessionId,
                planRevision: input.planRevision,
            },
            privacy: (0, contracts_1.sourceFreePrivacyContract)(),
        },
        localSymbols: canonicalFacts
            ? canonicalFacts.symbols.map(localSymbol)
            : analyzed?.symbols ?? [],
    };
}
//# sourceMappingURL=proposed-change-analysis.js.map