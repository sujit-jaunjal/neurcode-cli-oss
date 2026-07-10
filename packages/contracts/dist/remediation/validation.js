"use strict";
/**
 * RemediationValidationResult — output of the deterministic patch validation pipeline.
 *
 * The validation pipeline is always deterministic:
 *   - syntax validation uses the TypeScript/Python parser
 *   - scope validation checks file paths and line counts
 *   - governance validation re-runs the original structural rule
 *   - postcondition validation checks regex patterns
 *
 * LLM output is NEVER trusted without passing this pipeline.
 * A failed validation does not modify any files.
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=validation.js.map