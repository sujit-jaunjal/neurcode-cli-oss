/**
 * Governance computation lineage helpers.
 *
 * Stamps a `producedByStage` lineage marker onto canonical findings without
 * mutating their identity (id, severity, evidence) or replay checksum inputs.
 *
 * Use case: after a stage has emitted a set of findings, call
 * `stampFindingLineage(findings, stageId)` to annotate them. This is purely
 * observability — the canonical pipeline's stripping/sort/dedup logic remains
 * authoritative for what reaches the envelope.
 */
import type { GovernanceFinding, GovernanceStageId } from '@neurcode-ai/contracts';
/**
 * Mutates each finding in place to attach `provenanceMetadata.producedByStage`.
 * If a finding already has a stage stamp from an earlier wrapper, the existing
 * value is preserved (closest stage wins).
 *
 * Returns the same array reference for chaining.
 */
export declare function stampFindingLineage(findings: GovernanceFinding[], stageId: GovernanceStageId): GovernanceFinding[];
/**
 * Read-only view: group findings by the stage that produced them.
 * Findings with no lineage stamp are bucketed under '<unattributed>'.
 */
export declare function groupFindingsByStage(findings: readonly GovernanceFinding[]): Map<string, GovernanceFinding[]>;
//# sourceMappingURL=lineage.d.ts.map