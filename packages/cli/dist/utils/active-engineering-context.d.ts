import type { ContextPack, EngineeringInvariantMemory, IntentPack, RepositoryIntelligenceGraph, SessionContinuityRuntime } from '@neurcode-ai/contracts';
export interface ActiveEngineeringContext {
    source: 'intent-runtime';
    intentPack: IntentPack;
    contextPack: ContextPack;
    repositoryGraph: RepositoryIntelligenceGraph;
    invariantMemory: EngineeringInvariantMemory | null;
    sessionRuntime: SessionContinuityRuntime;
    warnings: string[];
    /**
     * Set to true when the context was synthesised from intent-pack.json alone
     * (no context-pack / repository-graph / session-runtime artefacts on disk).
     * Consumers may use this to label posture as `intent-runtime:synthesized`
     * or to emit reduced-confidence drift narratives.
     */
    synthesized?: boolean;
}
export declare function loadActiveEngineeringContext(projectRoot: string): ActiveEngineeringContext | null;
export declare function synthesizeEngineeringContextFromIntentPack(projectRoot: string, rawIntentPack: IntentPack): ActiveEngineeringContext;
/**
 * Load the active engineering context, or — when only `intent-pack.json` is
 * present — synthesise a deterministic minimum-viable context so the
 * intent-governed runtime activates locally without cloud connectivity.
 *
 * Returns `null` only when no intent-pack is present at all.
 */
export declare function loadOrSynthesizeEngineeringContext(projectRoot: string): ActiveEngineeringContext | null;
//# sourceMappingURL=active-engineering-context.d.ts.map