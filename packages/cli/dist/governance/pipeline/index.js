"use strict";
/**
 * Canonical Governance Pipeline — public surface.
 *
 * The pipeline transforms the verify orchestrator from a monolithic script
 * into a staged, replayable, explainable runtime. Each stage:
 *   - has a stable identifier from `GovernanceStageId`
 *   - declares its determinism classification and boundary policy
 *   - emits a replay-ready receipt (fingerprints, timings, dependencies)
 *   - participates in computation-graph lineage via `producedByStage`
 *
 * Wire-level types live in `@neurcode-ai/contracts`. CLI-internal types
 * (context, stage definitions) live alongside this module.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildVerifyCanonicalPayload = exports.buildPolicyOnlyCanonicalPayload = exports.renderComputationTrace = exports.buildComputationTrace = exports.stageReceiptOrCompute = exports.stageDegradedOrFailed = exports.runStageWithReceipt = exports.runStageOrFallback = exports.runStageOrAsyncFallback = exports.enumerateNonSuccessStages = exports.stampFindingLineage = exports.groupFindingsByStage = exports.stableStringify = exports.fingerprintStageSignal = exports.buildPipelineSummary = exports.runStage = exports.runPipeline = exports.GovernanceStageAbortedError = exports.getStageResult = exports.createPipelineContext = exports.STRICT_REQUIRED_BOUNDARY = exports.OBSERVABILITY_BOUNDARY = void 0;
var types_1 = require("./types");
Object.defineProperty(exports, "OBSERVABILITY_BOUNDARY", { enumerable: true, get: function () { return types_1.OBSERVABILITY_BOUNDARY; } });
Object.defineProperty(exports, "STRICT_REQUIRED_BOUNDARY", { enumerable: true, get: function () { return types_1.STRICT_REQUIRED_BOUNDARY; } });
var runtime_1 = require("./runtime");
Object.defineProperty(exports, "createPipelineContext", { enumerable: true, get: function () { return runtime_1.createPipelineContext; } });
Object.defineProperty(exports, "getStageResult", { enumerable: true, get: function () { return runtime_1.getStageResult; } });
Object.defineProperty(exports, "GovernanceStageAbortedError", { enumerable: true, get: function () { return runtime_1.GovernanceStageAbortedError; } });
Object.defineProperty(exports, "runPipeline", { enumerable: true, get: function () { return runtime_1.runPipeline; } });
Object.defineProperty(exports, "runStage", { enumerable: true, get: function () { return runtime_1.runStage; } });
var summary_1 = require("./summary");
Object.defineProperty(exports, "buildPipelineSummary", { enumerable: true, get: function () { return summary_1.buildPipelineSummary; } });
var fingerprint_1 = require("./fingerprint");
Object.defineProperty(exports, "fingerprintStageSignal", { enumerable: true, get: function () { return fingerprint_1.fingerprintStageSignal; } });
Object.defineProperty(exports, "stableStringify", { enumerable: true, get: function () { return fingerprint_1.stableStringify; } });
var lineage_1 = require("./lineage");
Object.defineProperty(exports, "groupFindingsByStage", { enumerable: true, get: function () { return lineage_1.groupFindingsByStage; } });
Object.defineProperty(exports, "stampFindingLineage", { enumerable: true, get: function () { return lineage_1.stampFindingLineage; } });
var helpers_1 = require("./helpers");
Object.defineProperty(exports, "enumerateNonSuccessStages", { enumerable: true, get: function () { return helpers_1.enumerateNonSuccessStages; } });
Object.defineProperty(exports, "runStageOrAsyncFallback", { enumerable: true, get: function () { return helpers_1.runStageOrAsyncFallback; } });
Object.defineProperty(exports, "runStageOrFallback", { enumerable: true, get: function () { return helpers_1.runStageOrFallback; } });
Object.defineProperty(exports, "runStageWithReceipt", { enumerable: true, get: function () { return helpers_1.runStageWithReceipt; } });
Object.defineProperty(exports, "stageDegradedOrFailed", { enumerable: true, get: function () { return helpers_1.stageDegradedOrFailed; } });
Object.defineProperty(exports, "stageReceiptOrCompute", { enumerable: true, get: function () { return helpers_1.stageReceiptOrCompute; } });
var computation_trace_1 = require("./computation-trace");
Object.defineProperty(exports, "buildComputationTrace", { enumerable: true, get: function () { return computation_trace_1.buildComputationTrace; } });
Object.defineProperty(exports, "renderComputationTrace", { enumerable: true, get: function () { return computation_trace_1.renderComputationTrace; } });
var envelope_assembly_1 = require("./envelope-assembly");
Object.defineProperty(exports, "buildPolicyOnlyCanonicalPayload", { enumerable: true, get: function () { return envelope_assembly_1.buildPolicyOnlyCanonicalPayload; } });
Object.defineProperty(exports, "buildVerifyCanonicalPayload", { enumerable: true, get: function () { return envelope_assembly_1.buildVerifyCanonicalPayload; } });
__exportStar(require("./orchestration"), exports);
__exportStar(require("./stages"), exports);
//# sourceMappingURL=index.js.map