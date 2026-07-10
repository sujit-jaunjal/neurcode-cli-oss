"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTEGRATIONS_COMPATIBILITY_SCHEMA_VERSION = void 0;
exports.INTEGRATIONS_COMPATIBILITY_SCHEMA_VERSION = 'neurcode.integrations-compatibility.v1';
//# sourceMappingURL=integrations-compatibility-v1.js.map