/**
 * Integrations Compatibility Report (Iteration 8 — AI Tool Compatibility Layer).
 *
 * A single, honest, source-free statement of which AI coding tools Neurcode
 * integrates with and exactly what enforcement guarantee each host supports.
 *
 * The enforcement labels are NOT authored here as marketing copy. The CLI
 * builder (`packages/cli/src/utils/integrations-doctor.ts`) grounds every
 * tool's enforcement (`level` / `controlLevel` / `mode` / `enforceable` /
 * `advisoryOnly`) in the canonical Agent Runtime Adapter capability registry
 * (`listAgentRuntimeAdapterCapabilities` in governance-runtime). This contract
 * only pins the *shape* and the honest vocabulary so the CLI, a future
 * dashboard, and the Action can read the same JSON.
 *
 * Source-free by construction: tool identifiers, adapter identifiers,
 * enforcement-mode strings, version strings, statuses, reason codes, static
 * `neurcode` command strings, and static limitation strings — never
 * paths-to-source, diffs, prompts, or source bodies.
 */
export declare const INTEGRATIONS_COMPATIBILITY_SCHEMA_VERSION: "neurcode.integrations-compatibility.v1";
/** The five host tools on the Iteration 8 roadmap. */
export type IntegrationToolId = 'claude-code' | 'cursor' | 'codex' | 'vscode' | 'github-action';
/**
 * Enforcement-mode vocabulary. Mirrors the governance-runtime
 * `AgentRuntimeCompatibilityMode` union; the CLI builder maps each adapter's
 * canonical mode onto this contract and the authority gate cross-checks that
 * the two stay aligned (no drift, no second source of truth).
 */
export type IntegrationEnforcementMode = 'hard_pre_write_enforcement' | 'cooperative_check' | 'supervisor_diff_watch' | 'evidence_only';
/** Honest control-level vocabulary, mirroring `AgentRuntimeControlLevel`. */
export type IntegrationControlLevel = 'hard_block_capable' | 'supervised_advisory_capable' | 'evidence_only_capable' | 'unsupported_unknown';
/** Honest enforcement-level vocabulary, mirroring `AgentRuntimeEnforcementLevel`. */
export type IntegrationEnforcementLevel = 'hard_deny' | 'cooperative' | 'observe_only' | 'post_change_backstop';
export type IntegrationStatus = 'ready' | 'needs_attention' | 'not_ready' | 'not_evaluated';
export type IntegrationVersionStatus = 'ok' | 'behind_floor' | 'ahead_of_validated' | 'mismatch' | 'unknown';
/** A single source-free version comparison for a tool. */
export interface IntegrationVersionCheck {
    /** Component id, e.g. 'cli', 'github-action', 'vscode-extension', 'vscode-vsix'. */
    component: string;
    /** Live-read version from a repo manifest, or null when not locally determinable. */
    observed: string | null;
    /** Expected/pinned version (validated triplet or minimum floor), or null. */
    expected: string | null;
    status: IntegrationVersionStatus;
    /** Honest, source-free explanation of the comparison. */
    detail: string;
}
/**
 * The four setup commands every tool surfaces (even when "not applicable").
 * Report-only (D3a): these point at existing flows; no new installers and no
 * `integrations repair` wrapper. A `null` slot means "no distinct command for
 * this phase on this host" (with the reason carried in `knownWedges`).
 */
export interface IntegrationSetupCommands {
    install: string | null;
    activate: string | null;
    /** The "test block" — a smoke/readiness sub-check that proves governance. */
    test: string | null;
    repair: string | null;
}
export interface IntegrationEnforcementSummary {
    level: IntegrationEnforcementLevel;
    controlLevel: IntegrationControlLevel;
    mode: IntegrationEnforcementMode;
    /** True when the host applies governance automatically; false when cooperative. */
    automatic: boolean;
    /** Short, honest one-line guarantee, derived from the canonical registry. */
    guarantee: string;
    /** What the host can actually enforce (verbatim from the canonical registry). */
    enforceable: string[];
    /** What is advisory-only for this host (verbatim from the canonical registry). */
    advisoryOnly: string[];
}
export interface IntegrationToolReport {
    tool: IntegrationToolId;
    /** Canonical Agent Runtime Adapter id this tool maps to. */
    adapter: string;
    displayName: string;
    enforcement: IntegrationEnforcementSummary;
    status: IntegrationStatus;
    /** Source-free reason codes explaining `status`. */
    reasonCodes: string[];
    setup: IntegrationSetupCommands;
    versions: IntegrationVersionCheck[];
    /** Honest, static limitation / wedge statements. Source-free. */
    knownWedges: string[];
}
export interface IntegrationsCompatibilityReport {
    schemaVersion: typeof INTEGRATIONS_COMPATIBILITY_SCHEMA_VERSION;
    generatedAt: string;
    /** Live CLI version (the local enforcement engine). */
    cliVersion: string;
    /** Runtime compatibility manifest version that pinned the validated triplet. */
    manifestVersion: string;
    /** Runtime compatibility contract version. */
    compatibilityContractVersion: string;
    /**
     * Worst-case roll-up across tools. Never claims more than the weakest honest
     * signal: `ready` only when every evaluated tool is `ready`.
     */
    overallStatus: IntegrationStatus;
    tools: IntegrationToolReport[];
    /** Global, source-free notes (honest caveats that apply across tools). */
    notes: string[];
}
//# sourceMappingURL=integrations-compatibility-v1.d.ts.map