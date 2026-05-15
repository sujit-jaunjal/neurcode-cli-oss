"use strict";
/**
 * Intent-Aware Governance — public surface.
 *
 * Phase 1 capabilities:
 *   - Declarative intent contract (`.neurcode/intent.json`) → typed IntentGraph
 *   - Deterministic import-graph extraction from a diff
 *   - Deterministic architectural drift detection (layer rules)
 *   - Explicit intelligence-boundary classification
 *
 * What this module is NOT:
 *   - A graph database
 *   - An AI-driven architecture inferrer
 *   - A replacement for change-contract or the intent-engine (NL coverage)
 *
 * See individual modules for the principles each surface adheres to.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PHASE_1_SURFACES = exports.hasNonDeterministicSurface = exports.getIntelligenceClassificationMap = exports.activeIntelligenceClasses = exports.runDriftDetection = exports.intentGraphIsEnforceable = exports.groupImportEdgesByFile = exports.extractImportEdgesFromDiff = exports.normalizePathForGlob = exports.matchesGlob = exports.matchesAnyGlob = exports.firstMatchingGlob = exports.compileGlob = exports.resolveIntentContractPath = exports.loadIntentContract = exports.buildIntentGraphFromRaw = exports.INTENT_CONTRACT_RELATIVE_PATH = exports.INTENT_CONTRACT_FILENAME = exports.intentGraphHasEnforcement = exports.isEmptyIntentGraph = exports.INTENT_GRAPH_SCHEMA_VERSION = exports.EMPTY_INTENT_GRAPH = void 0;
var intent_graph_1 = require("./intent-graph");
Object.defineProperty(exports, "EMPTY_INTENT_GRAPH", { enumerable: true, get: function () { return intent_graph_1.EMPTY_INTENT_GRAPH; } });
Object.defineProperty(exports, "INTENT_GRAPH_SCHEMA_VERSION", { enumerable: true, get: function () { return intent_graph_1.INTENT_GRAPH_SCHEMA_VERSION; } });
Object.defineProperty(exports, "isEmptyIntentGraph", { enumerable: true, get: function () { return intent_graph_1.isEmptyIntentGraph; } });
Object.defineProperty(exports, "intentGraphHasEnforcement", { enumerable: true, get: function () { return intent_graph_1.intentGraphHasEnforcement; } });
var intent_contract_1 = require("./intent-contract");
Object.defineProperty(exports, "INTENT_CONTRACT_FILENAME", { enumerable: true, get: function () { return intent_contract_1.INTENT_CONTRACT_FILENAME; } });
Object.defineProperty(exports, "INTENT_CONTRACT_RELATIVE_PATH", { enumerable: true, get: function () { return intent_contract_1.INTENT_CONTRACT_RELATIVE_PATH; } });
Object.defineProperty(exports, "buildIntentGraphFromRaw", { enumerable: true, get: function () { return intent_contract_1.buildIntentGraphFromRaw; } });
Object.defineProperty(exports, "loadIntentContract", { enumerable: true, get: function () { return intent_contract_1.loadIntentContract; } });
Object.defineProperty(exports, "resolveIntentContractPath", { enumerable: true, get: function () { return intent_contract_1.resolveIntentContractPath; } });
var glob_match_1 = require("./glob-match");
Object.defineProperty(exports, "compileGlob", { enumerable: true, get: function () { return glob_match_1.compileGlob; } });
Object.defineProperty(exports, "firstMatchingGlob", { enumerable: true, get: function () { return glob_match_1.firstMatchingGlob; } });
Object.defineProperty(exports, "matchesAnyGlob", { enumerable: true, get: function () { return glob_match_1.matchesAnyGlob; } });
Object.defineProperty(exports, "matchesGlob", { enumerable: true, get: function () { return glob_match_1.matchesGlob; } });
Object.defineProperty(exports, "normalizePathForGlob", { enumerable: true, get: function () { return glob_match_1.normalizePathForGlob; } });
var import_graph_1 = require("./import-graph");
Object.defineProperty(exports, "extractImportEdgesFromDiff", { enumerable: true, get: function () { return import_graph_1.extractImportEdgesFromDiff; } });
Object.defineProperty(exports, "groupImportEdgesByFile", { enumerable: true, get: function () { return import_graph_1.groupImportEdgesByFile; } });
var drift_detector_1 = require("./drift-detector");
Object.defineProperty(exports, "intentGraphIsEnforceable", { enumerable: true, get: function () { return drift_detector_1.intentGraphIsEnforceable; } });
Object.defineProperty(exports, "runDriftDetection", { enumerable: true, get: function () { return drift_detector_1.runDriftDetection; } });
var intelligence_boundaries_1 = require("./intelligence-boundaries");
Object.defineProperty(exports, "activeIntelligenceClasses", { enumerable: true, get: function () { return intelligence_boundaries_1.activeIntelligenceClasses; } });
Object.defineProperty(exports, "getIntelligenceClassificationMap", { enumerable: true, get: function () { return intelligence_boundaries_1.getIntelligenceClassificationMap; } });
Object.defineProperty(exports, "hasNonDeterministicSurface", { enumerable: true, get: function () { return intelligence_boundaries_1.hasNonDeterministicSurface; } });
Object.defineProperty(exports, "PHASE_1_SURFACES", { enumerable: true, get: function () { return intelligence_boundaries_1.PHASE_1_SURFACES; } });
//# sourceMappingURL=index.js.map