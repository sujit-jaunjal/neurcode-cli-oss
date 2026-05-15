"use strict";
/**
 * CLI-side governance pipeline types.
 *
 * Builds on `@neurcode-ai/contracts` stage contracts with executor-side detail
 * (context, stage definition, ledger). The wire-level types remain in contracts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OBSERVABILITY_BOUNDARY = exports.STRICT_REQUIRED_BOUNDARY = void 0;
/**
 * Default boundary policy: required, strict, no dependencies.
 *
 * Most stages should NOT use this directly — they should declare their actual
 * upstream dependencies so replay can reconstruct the computation graph.
 */
exports.STRICT_REQUIRED_BOUNDARY = {
    isolateFailure: false,
    required: true,
    dependencies: [],
};
/**
 * Boundary policy for optional observability / non-load-bearing stages.
 * Failures here are caught and surfaced but never abort governance.
 */
exports.OBSERVABILITY_BOUNDARY = {
    isolateFailure: true,
    required: false,
    dependencies: [],
};
//# sourceMappingURL=types.js.map