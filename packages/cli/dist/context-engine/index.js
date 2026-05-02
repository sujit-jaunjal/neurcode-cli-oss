"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreFiles = exports.buildDependencyGraph = exports.scanProject = void 0;
exports.analyzeContext = analyzeContext;
const scanner_1 = require("./scanner");
const graph_1 = require("./graph");
const scorer_1 = require("./scorer");
const suggestions_1 = require("./suggestions");
var scanner_2 = require("./scanner");
Object.defineProperty(exports, "scanProject", { enumerable: true, get: function () { return scanner_2.scanProject; } });
var graph_2 = require("./graph");
Object.defineProperty(exports, "buildDependencyGraph", { enumerable: true, get: function () { return graph_2.buildDependencyGraph; } });
var scorer_2 = require("./scorer");
Object.defineProperty(exports, "scoreFiles", { enumerable: true, get: function () { return scorer_2.scoreFiles; } });
function analyzeContext(rootPath, intent) {
    const scan = (0, scanner_1.scanProject)(rootPath);
    const graph = (0, graph_1.buildDependencyGraph)(scan);
    const scored = (0, scorer_1.scoreFiles)(intent, graph);
    const result = (0, suggestions_1.getSuggestedFiles)(scored, 5);
    return {
        suggestedFiles: result.suggestions.map((s) => s.file),
        confidence: result.confidence,
        details: result.suggestions,
    };
}
//# sourceMappingURL=index.js.map