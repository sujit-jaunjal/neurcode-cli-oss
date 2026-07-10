/**
 * Runtime Risk Pack Report (Iteration 11 — AppSec-Adjacent Runtime Risk Pack).
 *
 * Neurcode is a runtime control plane for AI coding agents — a seatbelt and
 * flight recorder. It is NOT an AppSec scanner, SAST engine, CVE/vulnerability
 * database, or code-review bot. This report states, in one honest source-free
 * surface, which AppSec-adjacent *runtime* boundaries the agent must obey
 * BEFORE a write lands — and exactly what enforcement each one carries.
 *
 * The enforcement is NOT authored here. The CLI builder
 * (`packages/cli/src/utils/runtime-risk-pack.ts`) derives every category's
 * `family`, `enforcementAction`, `truthTier`, and `reasonIds` by running the
 * canonical Runtime Safety Kernel classifiers (`evaluateRuntimeSafetyCheck`
 * over representative fixture paths) — it never re-implements classify logic and
 * never introduces a second taxonomy. The `family` type is the same
 * {@link ManagerEvidenceRiskFamily} the kernel and manager-evidence dashboard
 * use, so no new RuntimeSafetyFamily can drift in.
 *
 * Source-free by construction: category ids, buyer-facing labels, kernel reason
 * codes, families, enforcement-action strings, truth tiers, counts, and
 * representative *fixture* paths (synthetic, not repository source paths) —
 * never source bodies, diffs, prompts, secrets, or CVE text.
 */
import type { ManagerEvidenceRiskFamily } from './manager-evidence';
export declare const RUNTIME_RISK_PACK_SCHEMA_VERSION: "neurcode.runtime-risk-pack.v1";
/** The eight AppSec-adjacent runtime-risk categories on the Iteration 11 roadmap. */
export declare const RUNTIME_RISK_CATEGORY_IDS: readonly ["dependency_manifest_change", "script_lifecycle_risk", "secret_like_content", "auth_rbac_edit", "crypto_session_edit", "migration_edit", "network_boundary_edit", "ci_cd_edit"];
export type RuntimeRiskCategoryId = (typeof RUNTIME_RISK_CATEGORY_IDS)[number];
export declare function isRuntimeRiskCategoryId(value: unknown): value is RuntimeRiskCategoryId;
/** Enforcement vocabulary — mirrors the kernel `RuntimeSafetyEnforcementAction`. */
export type RuntimeRiskEnforcementAction = 'allow' | 'warn' | 'approval_required' | 'block';
/** Truth tier — mirrors the kernel `RuntimeSafetyTruthTier` (RSK truth tiers). */
export type RuntimeRiskTruthTier = 'deterministic_fact' | 'bounded_inference' | 'advisory';
/**
 * How completely the kernel covers a category today.
 *  - `enforced`        — a deterministic kernel rule governs this surface.
 *  - `enforced_partial`— governed, but with an honest, named coverage gap
 *    (e.g. CI/CD is GitHub-Actions-only; other CI systems are not yet matched).
 */
export type RuntimeRiskCoverage = 'enforced' | 'enforced_partial';
export interface RuntimeRiskCategory {
    id: RuntimeRiskCategoryId;
    /** Buyer-facing label. */
    label: string;
    /** Verbatim roadmap bullet this category answers. */
    roadmapBullet: string;
    /**
     * The existing kernel family this category maps to. No Iteration 11 category
     * introduces a new family — network folds into `infra_deploy_boundary`,
     * crypto/session into `auth_rbac_boundary` / `credential_or_secret`.
     */
    family: ManagerEvidenceRiskFamily;
    /**
     * Optional doctor-only sub-label that gives buyers precision without a new
     * top-level family (e.g. `network_boundary`, `crypto_session`).
     */
    subLabel: string | null;
    /**
     * Default enforcement action under ENTERPRISE_RUNTIME_SAFETY_V1 for a
     * representative surface — copied from the kernel decision, never re-authored.
     */
    enforcementAction: RuntimeRiskEnforcementAction;
    truthTier: RuntimeRiskTruthTier;
    coverage: RuntimeRiskCoverage;
    /** Kernel reason codes that backed the representative classification. */
    reasonIds: string[];
    /** Representative source-free fixture paths showing the classifier fires. */
    sampleSurfaces: string[];
    /** Honest scope notes / known coverage gaps. */
    limitations: string[];
}
/** External AppSec finding sources we may ingest as advisory context later. */
export declare const RUNTIME_RISK_ADVISORY_SOURCES: readonly ["endor", "snyk", "github_advanced_security"];
export type RuntimeRiskAdvisorySource = (typeof RUNTIME_RISK_ADVISORY_SOURCES)[number];
/**
 * Shape a future advisory finding would take once import is wired. Findings are
 * advisory context only — never enforcement, never a CVE claim Neurcode makes.
 */
export interface RuntimeRiskAdvisoryFinding {
    source: RuntimeRiskAdvisorySource;
    /** Repo-relative path the external tool flagged (no source body). */
    path: string;
    /** External tool's own severity label, passed through verbatim. */
    externalSeverity: string;
    /** Mapped kernel family for cross-referencing — advisory only. */
    family: ManagerEvidenceRiskFamily | null;
    truthTier: 'advisory';
}
export type RuntimeRiskAdvisoryStatus = 'not_wired';
export interface RuntimeRiskAdvisoryImport {
    source: RuntimeRiskAdvisorySource;
    status: RuntimeRiskAdvisoryStatus;
    /** Always empty in V1 — ingest is deferred to a later iteration. */
    findings: RuntimeRiskAdvisoryFinding[];
    note: string;
}
/**
 * The pilot evidence pack (`pilot export`) buckets surfaces with its own coarse
 * keyword classifier. That taxonomy is intentionally left unchanged (it has a
 * stable content hash). This map documents how a kernel family is reported there
 * so the two surfaces are legible together — it does NOT re-author either side.
 */
export interface RuntimeRiskTaxonomyMapping {
    kernelFamily: ManagerEvidenceRiskFamily;
    pilotEvidenceFamilies: string[];
    note: string;
}
export interface RuntimeRiskAppSecPositioning {
    /** The Iteration 11 exit-criterion sentence. */
    statement: string;
    /** What the runtime risk pack does. */
    weDo: string[];
    /** What it explicitly does NOT do (no scanner / SAST / CVE / review-bot). */
    weDoNot: string[];
}
export interface RuntimeRiskPackReport {
    schemaVersion: typeof RUNTIME_RISK_PACK_SCHEMA_VERSION;
    generatedAt: string;
    cliVersion: string | null;
    /** The policy profile id whose default actions were resolved. */
    policyId: string;
    /** Plan-control mode the actions were resolved under. */
    planMode: string;
    categories: RuntimeRiskCategory[];
    summary: {
        totalCategories: number;
        enforced: number;
        enforcedPartial: number;
        byAction: Record<RuntimeRiskEnforcementAction, number>;
        /** Distinct kernel families touched (subset of MANAGER_EVIDENCE_RISK_FAMILIES). */
        families: ManagerEvidenceRiskFamily[];
    };
    taxonomyMapping: RuntimeRiskTaxonomyMapping[];
    advisoryImports: RuntimeRiskAdvisoryImport[];
    appSec: RuntimeRiskAppSecPositioning;
    notes: string[];
}
//# sourceMappingURL=runtime-risk-pack-v1.d.ts.map