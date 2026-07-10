"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUNTIME_RISK_ADVISORY_SOURCES = exports.RUNTIME_RISK_CATEGORY_IDS = exports.RUNTIME_RISK_PACK_SCHEMA_VERSION = void 0;
exports.isRuntimeRiskCategoryId = isRuntimeRiskCategoryId;
exports.RUNTIME_RISK_PACK_SCHEMA_VERSION = 'neurcode.runtime-risk-pack.v1';
/** The eight AppSec-adjacent runtime-risk categories on the Iteration 11 roadmap. */
exports.RUNTIME_RISK_CATEGORY_IDS = [
    'dependency_manifest_change',
    'script_lifecycle_risk',
    'secret_like_content',
    'auth_rbac_edit',
    'crypto_session_edit',
    'migration_edit',
    'network_boundary_edit',
    'ci_cd_edit',
];
function isRuntimeRiskCategoryId(value) {
    return typeof value === 'string' && exports.RUNTIME_RISK_CATEGORY_IDS.includes(value);
}
/* ── D6: advisory import stub (schema-forward only; no ingest in V1) ────────── */
/** External AppSec finding sources we may ingest as advisory context later. */
exports.RUNTIME_RISK_ADVISORY_SOURCES = ['endor', 'snyk', 'github_advanced_security'];
//# sourceMappingURL=runtime-risk-pack-v1.js.map