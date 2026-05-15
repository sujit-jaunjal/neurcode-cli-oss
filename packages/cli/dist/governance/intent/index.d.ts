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
export { EMPTY_INTENT_GRAPH, INTENT_GRAPH_SCHEMA_VERSION, isEmptyIntentGraph, intentGraphHasEnforcement, type IntentEdge, type IntentGraph, type IntentLayer, type IntentModule, type IntentTrustBoundary, } from './intent-graph';
export { INTENT_CONTRACT_FILENAME, INTENT_CONTRACT_RELATIVE_PATH, buildIntentGraphFromRaw, loadIntentContract, resolveIntentContractPath, type IntentContractLoadResult, } from './intent-contract';
export { compileGlob, firstMatchingGlob, matchesAnyGlob, matchesGlob, normalizePathForGlob, } from './glob-match';
export { extractImportEdgesFromDiff, groupImportEdgesByFile, type ImportEdge, } from './import-graph';
export { intentGraphIsEnforceable, runDriftDetection, type ClassifiedFile, type DriftDetectorInput, type DriftReport, type DriftViolation, } from './drift-detector';
export { activeIntelligenceClasses, getIntelligenceClassificationMap, hasNonDeterministicSurface, PHASE_1_SURFACES, type IntelligenceClass, type IntelligenceSurface, } from './intelligence-boundaries';
//# sourceMappingURL=index.d.ts.map