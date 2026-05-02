"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSuggestedFiles = getSuggestedFiles;
function getSuggestedFiles(scored, limit = 5) {
    if (scored.length === 0) {
        return { suggestions: [], confidence: 0 };
    }
    const topN = scored.slice(0, limit);
    const maxScore = scored[0].score;
    const suggestions = topN.map((item) => ({
        file: item.file,
        confidence: maxScore > 0 ? parseFloat((item.score / maxScore).toFixed(2)) : 0,
        reasons: item.reasons,
    }));
    // Overall confidence: average of top-N normalized scores, capped at 1
    const avgConfidence = suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length;
    return {
        suggestions,
        confidence: parseFloat(Math.min(avgConfidence, 1).toFixed(2)),
    };
}
//# sourceMappingURL=suggestions.js.map