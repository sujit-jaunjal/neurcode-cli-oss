export type DaemonRouteMethod = 'GET' | 'POST' | 'PUT';
export type DaemonRouteSubsystem = 'canonical-governance' | 'compatibility-mutation' | 'runtime-execution' | 'workspace-orchestration' | 'replay-evidence' | 'operational-status' | 'docs-transport' | 'unknown';
export interface DaemonRouteDescription {
    method: DaemonRouteMethod;
    path: string;
    summary: string;
}
export declare const CANONICAL_GOVERNANCE_ROUTE_DESCRIPTIONS: DaemonRouteDescription[];
export declare const COMPATIBILITY_MUTATION_ROUTE_DESCRIPTIONS: DaemonRouteDescription[];
export declare const RUNTIME_EXECUTION_ROUTE_DESCRIPTIONS: DaemonRouteDescription[];
export declare const WORKSPACE_ORCHESTRATION_ROUTE_DESCRIPTIONS: DaemonRouteDescription[];
export declare const REPLAY_EVIDENCE_ROUTE_DESCRIPTIONS: DaemonRouteDescription[];
export declare const OPERATIONAL_STATUS_ROUTE_DESCRIPTIONS: DaemonRouteDescription[];
export declare const DOCS_TRANSPORT_ROUTE_DESCRIPTIONS: DaemonRouteDescription[];
export declare const DAEMON_ROUTE_GROUPS: Record<Exclude<DaemonRouteSubsystem, 'unknown'>, DaemonRouteDescription[]>;
export declare function normalizeRoutePath(url: string): string;
export declare function classifyDaemonRoute(method: string, url: string): DaemonRouteSubsystem;
export declare function logDaemonRouteGroup(title: string, routes: DaemonRouteDescription[]): void;
//# sourceMappingURL=routes.d.ts.map