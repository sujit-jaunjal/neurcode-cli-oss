/**
 * Repository Architecture Graph — V2.
 *
 * Turns the path/owner profile into an architecture-aware model that can reason
 * about module boundaries, ownership, dependency direction, and sensitive
 * surfaces during agentic development.
 *
 * Source-free guarantees:
 *   - Import *specifiers* (module strings) may be read locally to infer edges,
 *     but raw source, diffs, and file contents are NEVER stored on the graph.
 *     The graph holds only module ids, owners, surface tags, and module→module
 *     dependency edges — architecture metadata, not code.
 *   - Deterministic: same inputs → same `architectureHash`.
 *
 * The extractor + resolver are pure functions so the CLI can read local files,
 * derive specifiers, build edges, and discard the content immediately.
 */
import { type OwnershipBoundary, type SensitiveBoundary } from './profile';
import type { ArchitectureObligationCategory, ArchitectureObligationSeverity } from './architecture-obligations';
export declare const ARCHITECTURE_GRAPH_SCHEMA_VERSION: 2;
/** Architectural surface kinds a module can expose. */
export type ArchitectureSurfaceKind = 'auth' | 'security' | 'secrets' | 'crypto' | 'payments' | 'database' | 'migration' | 'public-api';
export interface ArchitectureModule {
    /** Collapsed module id, e.g. "src/billing" or "packages/cli". */
    id: string;
    /** Glob matching the module's files, e.g. "src/billing/**". */
    glob: string;
    fileCount: number;
    /** CODEOWNERS owners for the module (GitHub last-rule-wins semantics). */
    owners: string[];
    /** Sensitive tags inherited from the profile's sensitive boundaries. */
    sensitiveTags: SensitiveBoundary['tag'][];
    /** Architectural surfaces this module exposes. */
    surfaces: ArchitectureSurfaceKind[];
    /** True when the module is inside an approval-required boundary. */
    approvalRequired: boolean;
    /** Dominant language of the module's files. */
    language: string;
}
/** A directed dependency edge: `from` imports `to` (so `to` is upstream). */
export interface ArchitectureDependencyEdge {
    /** Consumer module id (the importer / downstream module). */
    from: string;
    /** Provider module id (the imported / upstream module). */
    to: string;
    /** Number of resolved import references contributing to this edge. */
    weight: number;
}
export interface ArchitectureGraphStats {
    moduleCount: number;
    edgeCount: number;
    analyzedFiles: number;
    resolvedImports: number;
    languages: string[];
}
export interface RepoArchitectureGraph {
    schemaVersion: typeof ARCHITECTURE_GRAPH_SCHEMA_VERSION;
    generatedAt: string;
    moduleDepth: number;
    modules: ArchitectureModule[];
    edges: ArchitectureDependencyEdge[];
    stats: ArchitectureGraphStats;
    /** Deterministic fingerprint of modules + edges (source-free). */
    architectureHash: string;
}
/** Source-free representation of one file's imports (specifiers only). */
export interface ModuleImportRecord {
    filePath: string;
    specifiers: string[];
}
export interface BuildArchitectureGraphInput {
    /** Repo-relative paths (e.g. from `git ls-files`). */
    paths: string[];
    ownershipBoundaries?: OwnershipBoundary[];
    sensitiveBoundaries?: SensitiveBoundary[];
    approvalRequiredGlobs?: string[];
    /** Per-file import specifiers (read locally, never stored). */
    imports?: ModuleImportRecord[];
    /** Directory depth used to collapse files into modules (default 2). */
    moduleDepth?: number;
    now?: string;
}
/**
 * Collapse a file path to a module id using the first `depth` directory
 * segments. Root-level files map to the synthetic module ".".
 *
 * When a repository contains an embedded service/app fixture, preserve the
 * prefix up to a recognizable app root (`src`, `packages`, `services`, etc.)
 * and then apply depth from there. Without this, paths such as
 * `fixtures/demo-svc/src/billing/charge.py` collapse to `fixtures/demo-svc`,
 * mixing billing/auth/migration ownership into one misleading module.
 */
export declare function moduleIdForPath(filePath: string, depth?: number): string;
/**
 * Extract import specifiers (module strings) from a single file's content.
 *
 * Returns only the quoted/dotted module specifiers — never source text. The
 * caller reads file content locally and discards it after calling this.
 */
export declare function extractImportSpecifiers(filePath: string, content: string): string[];
/**
 * Resolve an import specifier to a repo-relative source file, if it points to a
 * known in-repo module. External packages (e.g. "fastapi", "react") resolve to
 * null and are intentionally excluded from the internal dependency graph.
 */
export declare function resolveImportSpecifier(fromFile: string, specifier: string, knownPaths: Set<string>): string | null;
/**
 * Build the deterministic repository architecture graph. Pure and source-free:
 * the only edge inputs are import *specifiers*, and only module→module edges
 * are retained.
 */
export declare function buildArchitectureGraph(input: BuildArchitectureGraphInput): RepoArchitectureGraph;
export declare function findModuleForPath(graph: RepoArchitectureGraph, filePath: string): ArchitectureModule | null;
/** Modules that import the given module (its downstream consumers). */
export declare function dependentsOf(graph: RepoArchitectureGraph, moduleId: string): string[];
/** Modules the given module imports (its upstream providers / dependencies). */
export declare function dependenciesOf(graph: RepoArchitectureGraph, moduleId: string): string[];
export interface GraphObligationSeed {
    id: string;
    category: ArchitectureObligationCategory;
    title: string;
    description: string;
    severity: ArchitectureObligationSeverity;
    /** Module id this obligation guards. */
    module: string;
    /** Glob used for path-scoped feedback + approval matching. */
    requiredPath: string;
    triggeredBy: string[];
    requiredEvidence: string[];
    surface: ArchitectureSurfaceKind | 'dependency';
    /** How the obligation can be satisfied (source-free). */
    satisfy: {
        /** An active approval covering the module satisfies it. */
        approval: boolean;
        /** Accepted-plan text matching this (case-insensitive) regex satisfies it. */
        planPattern?: string;
        /** A guarded test-path edit within the module satisfies it. */
        moduleTest?: boolean;
    };
}
/** Modules considered "in play" for a set of candidate paths/globs. */
export declare function modulesInPlay(graph: RepoArchitectureGraph, candidatePaths: string[]): ArchitectureModule[];
/**
 * Derive graph obligation seeds for the modules currently in play. Deterministic
 * and ordered by id.
 */
export declare function deriveGraphObligationSeeds(args: {
    graph: RepoArchitectureGraph;
    candidatePaths: string[];
}): GraphObligationSeed[];
/** True when a graph obligation can be satisfied by editing the module's tests. */
export declare function isModuleTestSatisfiable(obligationId: string): boolean;
//# sourceMappingURL=architecture-graph.d.ts.map