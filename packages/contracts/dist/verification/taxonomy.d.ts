/**
 * Canonical determinism taxonomy — every governance finding MUST map to exactly one.
 * Do not blur or infer across these buckets in consumer UIs.
 */
export type DeterminismClassification = 'deterministic-structural' | 'deterministic-semantic' | 'heuristic-advisory' | 'llm-assisted-planning';
export type GovernanceFindingCategory = 'structural' | 'semantic-advisory' | 'policy-engine' | 'governance-constraint' | 'intent-conditioned' | 'flow-connectivity' | 'regression' | 'scope' | 'replay' | 'ci' | 'pilot-metric' | 'workspace-federation';
export type GovernanceSourceSystem = 'structural-rules' | 'policy-engine' | 'governance-runtime' | 'intent-engine' | 'semantic-index' | 'workspace-federation' | 'replay-runtime' | 'ci-adapter' | 'pilot-metrics';
export declare const GOVERNANCE_FINDINGS_SCHEMA_VERSION: "2026-05-11.1";
export declare function isDeterminismClassification(value: string): value is DeterminismClassification;
//# sourceMappingURL=taxonomy.d.ts.map