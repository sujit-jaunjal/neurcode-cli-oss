export declare const LOCAL_REPO_BRAIN_SCHEMA_VERSION: "neurcode.local-repo-brain.v1";
export type LocalRepoBrainLanguage = 'typescript' | 'javascript' | 'python' | 'go' | 'java' | 'ruby' | 'rust' | 'markdown' | 'yaml' | 'json' | 'shell' | 'other';
export type LocalRepoBrainSymbolKind = 'function' | 'class' | 'interface' | 'type' | 'const' | 'method';
export type LocalRepoBrainSensitiveKind = 'auth' | 'billing' | 'database' | 'workflow' | 'secret' | 'migration' | 'dependency' | 'configuration' | 'runtime_governance';
export interface LocalRepoBrainFileFact {
    path: string;
    module: string;
    language: LocalRepoBrainLanguage;
    bytes: number;
    lineCount: number;
    fileHash: string;
    mtimeMs: number;
    indexedAt: string;
    symbolCount: number;
    importCount: number;
    sensitiveKinds: LocalRepoBrainSensitiveKind[];
    generated: boolean;
}
export interface LocalRepoBrainSymbolFact {
    name: string;
    kind: LocalRepoBrainSymbolKind;
    file: string;
    line: number;
    exported: boolean;
    local: boolean;
    normalizedSignature: string | null;
    normalizedSignatureHash: string | null;
    signatureHash: string;
    tokenFingerprintHash: string | null;
    arity: number | null;
    language: LocalRepoBrainLanguage;
}
export interface LocalRepoBrainFreshness {
    generatedAt: string;
    gitHead: string | null;
    gitDirty: boolean | null;
    workingTreeStatus: 'clean' | 'dirty' | 'unknown';
    freshnessBasis: 'git-head-and-working-tree' | 'filesystem-scan';
}
export interface LocalRepoBrainImportEdge {
    fromFile: string;
    target: string;
    targetKind: 'relative' | 'package' | 'python_module' | 'unknown';
    resolvedFile: string | null;
    line: number;
    language: LocalRepoBrainLanguage;
}
export interface LocalRepoBrainModuleFact {
    name: string;
    fileCount: number;
    symbolCount: number;
    importCount: number;
    sensitiveKinds: LocalRepoBrainSensitiveKind[];
}
export interface LocalRepoBrainOwnerBoundary {
    pattern: string;
    owners: string[];
    source: 'CODEOWNERS';
}
export interface LocalRepoBrainReuseFinding {
    kind: 'symbol_name_reuse' | 'fingerprint_reuse';
    severity: 'info' | 'warn';
    confidence: 'low' | 'medium' | 'high';
    symbolName: string | null;
    files: string[];
    symbolCount: number;
    reasonCodes: string[];
    evidenceHash: string;
}
export interface LocalRepoBrainHotspot {
    file: string;
    score: number;
    reasons: string[];
    importFanIn: number;
    importFanOut: number;
    symbolCount: number;
    sensitiveKinds: LocalRepoBrainSensitiveKind[];
}
export interface LocalRepoBrainArtifact {
    schemaVersion: typeof LOCAL_REPO_BRAIN_SCHEMA_VERSION;
    generatedAt: string;
    repoRootHash: string;
    artifactHash: string;
    freshness: LocalRepoBrainFreshness;
    privacy: {
        sourceUploaded: false;
        sourceStored: false;
        diffStored: false;
        promptStored: false;
        modelUsed: false;
        storedFields: string[];
    };
    summary: {
        filesIndexed: number;
        filesSkipped: number;
        bytesIndexed: number;
        symbolsIndexed: number;
        importEdges: number;
        modules: number;
        sensitiveFiles: number;
        ownerBoundaries: number;
        ownerBoundaryStatus: 'found' | 'not_found';
        reuseFindings: number;
        generatedFilesSkipped: number;
    };
    files: LocalRepoBrainFileFact[];
    symbols: LocalRepoBrainSymbolFact[];
    imports: LocalRepoBrainImportEdge[];
    modules: LocalRepoBrainModuleFact[];
    ownerBoundaries: LocalRepoBrainOwnerBoundary[];
    reuseFindings: LocalRepoBrainReuseFinding[];
    hotspots: LocalRepoBrainHotspot[];
    limitations: string[];
}
export interface BuildLocalRepoBrainOptions {
    generatedAt?: string;
    maxFiles?: number;
    maxBytesPerFile?: number;
    experimentalFingerprintReuse?: boolean;
}
export interface LocalRepoBrainSearchResult {
    kind: 'file' | 'symbol' | 'module' | 'reuse' | 'hotspot';
    score: number;
    title: string;
    file: string | null;
    detail: string;
}
export type RepoSymbolDuplicateMode = 'off' | 'warn' | 'block';
export type RepoSymbolPolicyVerdict = 'ok' | 'warn' | 'block' | 'not_evaluated';
export interface RepoSymbolPolicySymbolRef {
    file: string;
    name: string;
    kind: LocalRepoBrainSymbolKind;
    language: LocalRepoBrainLanguage;
    exported: boolean;
    local: boolean;
    line: number;
    normalizedSignature: string | null;
    normalizedSignatureHash: string | null;
    signatureHash: string;
}
export interface RepoSymbolDuplicateFinding {
    schemaVersion: 'neurcode.repo-symbol-duplicate.v1';
    classification: 'deterministic_symbol_duplicate';
    policyMode: RepoSymbolDuplicateMode;
    verdict: 'warn' | 'block';
    strength: 'exported_symbol' | 'same_function_name' | 'same_local_symbol_name';
    changed: RepoSymbolPolicySymbolRef;
    existing: RepoSymbolPolicySymbolRef[];
    evidence: {
        sourceFree: true;
        repoBrainArtifactHash: string;
        repoBrainGeneratedAt: string;
        repoBrainGitHead: string | null;
        repoBrainWorkingTreeStatus: LocalRepoBrainFreshness['workingTreeStatus'];
        matchingFiles: string[];
        existingSymbolCount: number;
        reasonCodes: string[];
    };
    message: string;
    provenance: 'repo-brain-index';
}
export interface RepoSymbolPolicyEvaluation {
    schemaVersion: 'neurcode.repo-symbol-policy.v1';
    evaluated: boolean;
    verdict: RepoSymbolPolicyVerdict;
    policyMode: RepoSymbolDuplicateMode;
    classification: 'deterministic_symbol_duplicate' | 'not_evaluated' | 'clean';
    reason: string;
    artifactHash: string | null;
    generatedAt: string | null;
    freshness: LocalRepoBrainFreshness | null;
    findings: RepoSymbolDuplicateFinding[];
    advisorySimilarity: {
        classification: 'advisory_similarity';
        evaluated: false;
        reason: string;
    };
    privacy: {
        sourceUploaded: false;
        sourceStored: false;
        diffStored: false;
        promptStored: false;
        evaluatedInMemoryOnly: true;
    };
}
export declare function localRepoBrainLanguageFor(filePath: string): LocalRepoBrainLanguage;
export declare function sensitiveKindsFor(filePath: string): LocalRepoBrainSensitiveKind[];
export declare function analyzeLocalProposedSource(filePath: string, source: string): {
    language: LocalRepoBrainLanguage;
    symbols: LocalRepoBrainSymbolFact[];
    imports: LocalRepoBrainImportEdge[];
};
export declare function localRepoBrainPath(projectRoot: string): string;
export declare function localRepoBrainMarkdownPath(projectRoot: string): string;
export declare function buildLocalRepoBrain(projectRoot: string, options?: BuildLocalRepoBrainOptions): LocalRepoBrainArtifact;
export declare function writeLocalRepoBrain(projectRoot: string, artifact: LocalRepoBrainArtifact): {
    jsonPath: string;
    markdownPath: string;
};
export declare function readLocalRepoBrain(projectRoot: string): LocalRepoBrainArtifact | null;
export declare function renderLocalRepoBrainMarkdown(artifact: LocalRepoBrainArtifact): string;
export declare function evaluateRepoSymbolDuplicatePolicy(input: {
    projectRoot: string;
    filePath: string;
    proposedSource: string | null;
    proposedSymbols?: LocalRepoBrainSymbolFact[];
    policyMode?: RepoSymbolDuplicateMode;
}): RepoSymbolPolicyEvaluation;
export interface RepoBrainFileFacts {
    filePath: string;
    sensitiveKinds: string[];
    module: string | null;
    hotspot: {
        score: number;
        fanIn: number;
        fanOut: number;
        reasons: string[];
    } | null;
    ownerBoundary: {
        pattern: string;
        owners: string[];
    } | null;
    reuseAdvisories: Array<{
        kind: string;
        symbolName: string | null;
        confidence: string;
        reasonCodes: string[];
    }>;
}
export interface RepoBrainContext {
    status: 'found' | 'missing';
    artifactHash: string | null;
    generatedAt: string | null;
    declarationsIndexed: number | null;
    sensitiveFilesCount: number | null;
    ownerBoundaryStatus: 'found' | 'not_found' | null;
    recoveryCommand: string;
    files: RepoBrainFileFacts[];
}
export declare function getRepoBrainContext(projectRoot: string, filePaths: string[]): RepoBrainContext;
export declare function formatRepoBrainFactsForMessage(facts: RepoBrainFileFacts): string;
export declare function searchLocalRepoBrain(artifact: LocalRepoBrainArtifact, query: string, limit?: number): LocalRepoBrainSearchResult[];
//# sourceMappingURL=local-repo-brain.d.ts.map