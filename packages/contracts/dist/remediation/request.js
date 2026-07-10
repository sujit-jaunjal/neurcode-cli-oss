"use strict";
/**
 * GovernanceRemediationRequest — deterministic input to probabilistic remediation.
 *
 * This contract is:
 *   - replayable: stable serialization, content-hashed
 *   - auditable: provenance + plan linkage required
 *   - bounded: allowed modification scope is explicit
 *   - provider-agnostic: no provider SDK references
 *
 * IMPORTANT: This contract is governance infrastructure, not AI infrastructure.
 * The finding it encodes is deterministic. The remediation it requests is optional and advisory.
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=request.js.map