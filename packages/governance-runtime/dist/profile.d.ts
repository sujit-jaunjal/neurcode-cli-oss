/**
 * Repo Governance Profile — V0 composer.
 *
 * Derives a deterministic, metadata-only profile from:
 *   - the repo file tree (paths only, no content)
 *   - CODEOWNERS content (optional)
 *   - manifest content snippets (package.json / pyproject.toml / etc.)
 *
 * No source files are read. No network calls. Same inputs → same profileHash.
 */
import { type ArchitectureObligationPolicy } from './architecture-obligations';
import { type PlanControlMode, type RuntimeSafetyPolicyProfile } from './runtime-safety-kernel';
import { type ModuleImportRecord, type RepoArchitectureGraph } from './architecture-graph';
import { type GeneratedProvenanceEvidence, type RepositoryManifestEvidence, type RepositoryTopologyArtifact, type TopologyBrainFact } from './repository-topology';
export interface SensitiveBoundary {
    glob: string;
    tag: 'auth' | 'crypto' | 'secrets' | 'payments' | 'migrations' | 'security' | 'custom';
}
export interface OwnershipBoundary {
    glob: string;
    owners: string[];
}
export type ReadinessStatus = 'READY' | 'PARTIAL' | 'LOW';
export interface RepoGovernanceProfile {
    schemaVersion: 1;
    repo: {
        name: string;
        source: 'local' | 'github';
    };
    topology: {
        hash: string;
        trackedFileCount: number;
        codeownersHash: string | null;
        manifestHash: string | null;
        governanceConfigHash: string | null;
        /** Present only when a dependency graph was derived (imports supplied). */
        architectureHash?: string | null;
    };
    /** Canonical source-free topology facts used by runtime scope compilation. */
    repositoryTopology?: RepositoryTopologyArtifact;
    /**
     * Content-addressed pointer to the immutable local Brain generation used by
     * this profile. Repository-wide graph rows remain in SQLite.
     */
    brainGeneration?: RepoBrainGenerationReference;
    runtimeConfig: RuntimeGovernanceConfig;
    stack: {
        primaryLanguage: string;
        frameworkEcosystem: string;
        confidence: number;
    };
    sensitiveBoundaries: SensitiveBoundary[];
    ownershipBoundaries: OwnershipBoundary[];
    /** sensitive paths that are also CODEOWNERS-owned — always need approval in V0 */
    approvalRequiredPaths: string[];
    /** percentage of detected module paths with no CODEOWNERS entry */
    unownedPercent: number;
    agentCompatibility: {
        claudeCode: 'supported' | 'best-effort' | 'unsupported';
    };
    /**
     * V2 repository architecture graph (module boundaries + dependency edges +
     * surfaces). Present only when import metadata was supplied to the builder.
     * Source-free: holds module ids, owners, surface tags, and module→module
     * edges — never source, diffs, or file contents.
     */
    architecture?: RepoArchitectureGraph;
    profileHash: string;
    readiness: {
        status: ReadinessStatus;
        score: number;
        reasons: string[];
    };
    generatedAt: string;
}
export interface RepoBrainGenerationReference {
    schemaVersion: 'neurcode.brain-generation-reference.v1';
    graphId: string;
    generation: number;
    repositoryFingerprint: string | null;
    state: 'not_started' | 'discovering' | 'structural_indexing' | 'structural_ready' | 'governance_ready' | 'semantic_slice_pending' | 'semantic_slice_ready' | 'background_enrichment' | 'fully_enriched' | 'partial' | 'stale' | 'unavailable' | 'failed';
    eligibleFiles: number;
    indexedFiles: number;
    structuralCoverage: number;
    semanticCoverage: number;
    relevantPlanCoverage: number | null;
    semanticSliceId: string | null;
    authorityCeiling: string;
    sourceFree: true;
}
export interface ProfileInput {
    /** Result of `git ls-files` split into lines — paths relative to repo root. */
    paths: string[];
    /** Raw CODEOWNERS file content, or null if absent. */
    codeownersContent: string | null;
    /** Raw content of the primary manifest (package.json/pyproject.toml/go.mod), or null. */
    manifestContent: string | null;
    /** Repo name for display. */
    repoName: string;
    source: 'local' | 'github';
    runtimeConfig?: Partial<RuntimeGovernanceConfig> | null;
    /** All tracked package/workspace manifests available to the local compiler. */
    manifests?: RepositoryManifestEvidence[];
    /** Proven generated-output relationships discovered locally. */
    generatedEvidence?: GeneratedProvenanceEvidence[];
    /** Freshness-qualified source-free Repo Brain facts. */
    brain?: {
        freshness: string | null;
        facts: TopologyBrainFact[];
    } | null;
    /** Bounded immutable Brain reference; repository-wide facts remain in SQLite. */
    brainGeneration?: RepoBrainGenerationReference | null;
    /**
     * Per-file import specifiers, read locally by the caller. When supplied, the
     * builder derives the architecture dependency graph. Source-free: only module
     * specifiers are passed; raw source is never transmitted or stored.
     */
    imports?: ModuleImportRecord[] | null;
}
export interface RuntimeGovernanceConfig {
    /** Additional approval-required globs. Additive only; never removes detected/CODEOWNERS boundaries. */
    approvalRequiredGlobs: string[];
    /** Additional sensitive globs. Additive only. */
    sensitiveGlobs: string[];
    /** Additional low-risk support globs that may be included in inferred task scopes. */
    safeSupportGlobs: string[];
    /** Stored for deterministic policy evidence. V0.2 does not use this to weaken enforcement. */
    ignoredGlobs: string[];
    /** How strictly to enforce edits that are not justified by the agent's captured plan. */
    planCoherence?: PlanCoherenceMode;
    /**
     * Planning behavior for runtime safety: observe, advise, or enforce after freeze.
     * Distinct from planCoherence — controls planning-phase blocking posture.
     */
    planMode?: PlanControlMode;
    /** Enterprise runtime safety policy profile (configurable, not hardcoded). */
    runtimeSafetyPolicy?: Partial<RuntimeSafetyPolicyProfile>;
    /** Local in-flow enforcement posture for harmless task expansion. */
    localMode?: RuntimeLocalMode;
    /**
     * How strictly to handle deterministic duplicate symbol-name creation from
     * source-free repo brain facts. Similarity/fingerprint reuse remains advisory.
     */
    repoSymbolDuplicateMode?: RepoSymbolDuplicateMode;
    /** How strictly live architecture obligations are enforced while the agent edits. */
    architectureObligations?: ArchitectureObligationPolicy;
}
export type PlanCoherenceMode = 'off' | 'warn' | 'block';
export declare const DEFAULT_PLAN_COHERENCE_MODE: PlanCoherenceMode;
export type { PlanControlMode } from './runtime-safety-kernel';
export { DEFAULT_PLAN_CONTROL_MODE } from './runtime-safety-kernel';
export type RuntimeLocalMode = 'strict' | 'advisory' | 'paused';
export declare const DEFAULT_RUNTIME_LOCAL_MODE: RuntimeLocalMode;
export type RepoSymbolDuplicateMode = 'off' | 'warn' | 'block';
export declare const DEFAULT_REPO_SYMBOL_DUPLICATE_MODE: RepoSymbolDuplicateMode;
/** Return the owners for a path, applying GitHub CODEOWNERS semantics (last rule wins). */
export declare function ownersForPath(path: string, rules: OwnershipBoundary[]): string[];
export declare function buildRepoGovernanceProfile(input: ProfileInput): RepoGovernanceProfile;
export interface BoundaryCheckInput {
    filePath: string;
    /** Glob patterns the session contract allows. Empty = session is ambiguous (block sensitive). */
    allowedGlobs: string[];
    ownershipRules: OwnershipBoundary[];
    sensitiveGlobs: string[];
    approvalRequiredGlobs: string[];
    /**
     * Paths/globs for which the human has granted explicit approval in this session.
     * Only paths listed here are exempt from the approval-required block.
     * Absent or empty = no approvals on record.
     */
    approvedPaths?: string[];
    /**
     * Structured approval grants. When present, only non-expired grants are
     * considered authoritative; approvedPaths remains for legacy sessions.
     */
    approvalGrants?: {
        path: string;
        expiresAt?: string | null;
        revokedAt?: string | null;
        sessionId?: string;
        profileHash?: string;
        planRevision?: number | null;
        brainGeneration?: number | null;
    }[];
    /** Authority context for exact approval replay containment. */
    sessionId?: string;
    profileHash?: string;
    planRevision?: number | null;
    brainGeneration?: number | null;
    /** Test hook / replay hook for deterministic expiry checks. Defaults to now. */
    checkedAt?: string;
    /**
     * Whether the scope was inferred from the goal (not explicitly declared).
     * When 'ambiguous', any approval-required path blocks even if it would otherwise
     * appear in-scope due to a broad glob.
     */
    scopeMode?: 'explicit' | 'inferred' | 'ambiguous';
    /** Local hard-hook posture. Sessions pass their contract mode; direct callers default strict. */
    localMode?: RuntimeLocalMode;
}
export type BoundaryVerdict = 'ok' | 'warn' | 'block';
export type RuntimeBlockType = 'approval_required_boundary' | 'scope_violation_or_task_expansion' | 'profile_or_runtime_health_block' | 'multi_file_or_tool_shape_block' | 'repo_symbol_duplicate_policy' | 'structural_policy_violation';
export interface BoundaryCheckResult {
    verdict: BoundaryVerdict;
    inScope: boolean;
    isSensitive: boolean;
    isApprovalRequired: boolean;
    owners: string[];
    message: string;
    /** Actions available to the agent/human at this decision point. */
    options: ('continue' | 'narrow' | 'replan')[];
    /** Explicit block/warning category for runtime control-plane UX. */
    blockType?: RuntimeBlockType;
    /**
     * Machine-readable fields populated only when verdict === 'block' due to an
     * approval-required boundary. The agent/hook uses these to surface a
     * structured approval request to the human without parsing the message string.
     */
    approvalContext?: {
        blockedPath: string;
        approvalRequired: true;
        owners: string[];
        /** The exact path/glob the human should approve to unblock this specific file. */
        suggestedApprovalPath: string;
    };
}
export declare function checkFileBoundary(input: BoundaryCheckInput): BoundaryCheckResult;
//# sourceMappingURL=profile.d.ts.map