"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectRegressions = exports.buildCurrentState = exports.saveCurrentState = exports.loadPreviousState = exports.validateFlows = exports.buildFlowGraph = exports.labelForComponent = exports.requirementsForDomain = exports.formatComponentLabel = exports.formatCoverageBar = exports.computeIntentSummary = exports.computeCoverage = exports.matchIntentToCode = exports.indexDiffFiles = exports.parseIntent = void 0;
exports.runIntentEngine = runIntentEngine;
var parser_1 = require("./parser");
Object.defineProperty(exports, "parseIntent", { enumerable: true, get: function () { return parser_1.parseIntent; } });
var indexer_1 = require("./indexer");
Object.defineProperty(exports, "indexDiffFiles", { enumerable: true, get: function () { return indexer_1.indexDiffFiles; } });
var matcher_1 = require("./matcher");
Object.defineProperty(exports, "matchIntentToCode", { enumerable: true, get: function () { return matcher_1.matchIntentToCode; } });
var coverage_1 = require("./coverage");
Object.defineProperty(exports, "computeCoverage", { enumerable: true, get: function () { return coverage_1.computeCoverage; } });
Object.defineProperty(exports, "computeIntentSummary", { enumerable: true, get: function () { return coverage_1.computeIntentSummary; } });
Object.defineProperty(exports, "formatCoverageBar", { enumerable: true, get: function () { return coverage_1.formatCoverageBar; } });
Object.defineProperty(exports, "formatComponentLabel", { enumerable: true, get: function () { return coverage_1.formatComponentLabel; } });
var requirements_1 = require("./requirements");
Object.defineProperty(exports, "requirementsForDomain", { enumerable: true, get: function () { return requirements_1.requirementsForDomain; } });
Object.defineProperty(exports, "labelForComponent", { enumerable: true, get: function () { return requirements_1.labelForComponent; } });
var graph_1 = require("./graph");
Object.defineProperty(exports, "buildFlowGraph", { enumerable: true, get: function () { return graph_1.buildFlowGraph; } });
var flow_validator_1 = require("./flow-validator");
Object.defineProperty(exports, "validateFlows", { enumerable: true, get: function () { return flow_validator_1.validateFlows; } });
var state_1 = require("./state");
Object.defineProperty(exports, "loadPreviousState", { enumerable: true, get: function () { return state_1.loadPreviousState; } });
Object.defineProperty(exports, "saveCurrentState", { enumerable: true, get: function () { return state_1.saveCurrentState; } });
Object.defineProperty(exports, "buildCurrentState", { enumerable: true, get: function () { return state_1.buildCurrentState; } });
var regression_1 = require("./regression");
Object.defineProperty(exports, "detectRegressions", { enumerable: true, get: function () { return regression_1.detectRegressions; } });
const parser_2 = require("./parser");
const indexer_2 = require("./indexer");
const matcher_2 = require("./matcher");
const coverage_2 = require("./coverage");
const graph_2 = require("./graph");
const flow_validator_2 = require("./flow-validator");
const state_2 = require("./state");
const regression_2 = require("./regression");
const EMPTY_RESULT = {
    intentIssues: [],
    checkedDomains: [],
    foundComponents: {},
    componentMap: {},
    componentQuality: {},
    intentSummary: null,
    flowIssues: [],
    regressions: [],
};
/**
 * Single entry point: parse intent → index → match → coverage → flow → regression.
 * Returns empty result if intent is blank or diff is empty.
 * Never throws — errors are caught and return a safe empty result.
 */
function runIntentEngine(intentText, diffFiles, projectRoot) {
    try {
        const parsed = (0, parser_2.parseIntent)(intentText);
        if (parsed.domains.length === 0) {
            return { ...EMPTY_RESULT, intentText };
        }
        const index = (0, indexer_2.indexDiffFiles)(diffFiles);
        const { intentIssues, checkedDomains, foundComponents, componentMap, componentQuality } = (0, matcher_2.matchIntentToCode)(parsed, index);
        const intentSummary = (0, coverage_2.computeIntentSummary)(checkedDomains, foundComponents, componentMap, componentQuality);
        // V5: build dependency graph and run flow validation
        const graph = (0, graph_2.buildFlowGraph)(index);
        const flowIssues = (0, flow_validator_2.validateFlows)(checkedDomains, componentMap, graph);
        // V6: regression detection
        let regressions = [];
        if (projectRoot) {
            try {
                const previousState = (0, state_2.loadPreviousState)(projectRoot);
                regressions = (0, regression_2.detectRegressions)(previousState, intentSummary, flowIssues, componentMap, intentText);
                // Persist current state for the next run
                const flowIssueIds = flowIssues.map((fi) => fi.rule);
                (0, state_2.saveCurrentState)(projectRoot, (0, state_2.buildCurrentState)(intentText, intentSummary, flowIssueIds, componentMap));
            }
            catch {
                // Non-fatal: regression errors must never break verification
            }
        }
        return {
            intentIssues,
            checkedDomains,
            foundComponents,
            componentMap,
            componentQuality,
            intentSummary,
            flowIssues,
            regressions,
            intentText,
        };
    }
    catch {
        return { ...EMPTY_RESULT, intentText };
    }
}
//# sourceMappingURL=index.js.map