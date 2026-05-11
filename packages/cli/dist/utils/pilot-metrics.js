"use strict";
/**
 * Pilot observability metrics tracker.
 * Stores a rolling 90-day window of governance events.
 * Stored at: .neurcode/pilot-metrics.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordVerifyRun = recordVerifyRun;
exports.loadPilotMetrics = loadPilotMetrics;
exports.generatePilotSummary = generatePilotSummary;
const fs_1 = require("fs");
const path_1 = require("path");
const ROLLING_DAYS = 90;
const METRICS_FILENAME = 'pilot-metrics.json';
function metricsPath(repoRoot) {
    return (0, path_1.join)(repoRoot, '.neurcode', METRICS_FILENAME);
}
function neurcodeDotDir(repoRoot) {
    return (0, path_1.join)(repoRoot, '.neurcode');
}
function todayIso() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}
function cutoffDate(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
}
function atomicWrite(filePath, content) {
    const tmp = `${filePath}.tmp`;
    (0, fs_1.writeFileSync)(tmp, content, 'utf8');
    (0, fs_1.renameSync)(tmp, filePath);
}
/**
 * Load all stored pilot metrics entries (raw, unfiltered by date window).
 */
function loadRawMetrics(repoRoot) {
    try {
        const path = metricsPath(repoRoot);
        if (!(0, fs_1.existsSync)(path)) {
            return [];
        }
        const raw = (0, fs_1.readFileSync)(path, 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed;
    }
    catch {
        return [];
    }
}
/**
 * Record a verify run into today's metrics entry (upsert).
 */
function recordVerifyRun(repoRoot, entry) {
    try {
        const dir = neurcodeDotDir(repoRoot);
        if (!(0, fs_1.existsSync)(dir)) {
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        }
        const today = todayIso();
        const allEntries = loadRawMetrics(repoRoot);
        const existingIdx = allEntries.findIndex(e => e.date === today);
        if (existingIdx >= 0) {
            const existing = allEntries[existingIdx];
            // Accumulate counts for today
            const merged = {
                date: today,
                planCount: existing.planCount + entry.planCount,
                verifyCount: existing.verifyCount + entry.verifyCount,
                passCount: existing.passCount + entry.passCount,
                failCount: existing.failCount + entry.failCount,
                blockingCaught: existing.blockingCaught + entry.blockingCaught,
                advisoryCaught: existing.advisoryCaught + entry.advisoryCaught,
                suppressions: existing.suppressions + entry.suppressions,
                structuralCaught: existing.structuralCaught + entry.structuralCaught,
                aiDebtDelta: existing.aiDebtDelta + entry.aiDebtDelta,
            };
            // Merge rule counts
            if (entry.ruleCounts || existing.ruleCounts) {
                const combined = { ...(existing.ruleCounts ?? {}) };
                for (const [ruleId, count] of Object.entries(entry.ruleCounts ?? {})) {
                    combined[ruleId] = (combined[ruleId] ?? 0) + count;
                }
                merged.ruleCounts = combined;
            }
            allEntries[existingIdx] = merged;
        }
        else {
            allEntries.push({ date: today, ...entry });
        }
        // Trim to rolling ROLLING_DAYS window
        const cutoff = cutoffDate(ROLLING_DAYS);
        const trimmed = allEntries
            .filter(e => e.date >= cutoff)
            .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        atomicWrite(metricsPath(repoRoot), JSON.stringify(trimmed, null, 2));
    }
    catch {
        // Never throw
    }
}
/**
 * Load last 90 days of pilot metrics entries.
 */
function loadPilotMetrics(repoRoot) {
    try {
        const cutoff = cutoffDate(ROLLING_DAYS);
        return loadRawMetrics(repoRoot).filter(e => e.date >= cutoff);
    }
    catch {
        return [];
    }
}
/**
 * Compute summary stats for the pilot program over a given number of days.
 */
function generatePilotSummary(repoRoot, days = 7) {
    try {
        const cutoff = cutoffDate(days);
        const entries = loadRawMetrics(repoRoot).filter(e => e.date >= cutoff);
        const totalVerifyRuns = entries.reduce((s, e) => s + e.verifyCount, 0);
        const totalBlockingCaught = entries.reduce((s, e) => s + e.blockingCaught, 0);
        const totalStructuralCaught = entries.reduce((s, e) => s + e.structuralCaught, 0);
        const totalPass = entries.reduce((s, e) => s + e.passCount, 0);
        const totalFail = entries.reduce((s, e) => s + e.failCount, 0);
        const totalSuppressions = entries.reduce((s, e) => s + e.suppressions, 0);
        const totalAiDebtDelta = entries.reduce((s, e) => s + e.aiDebtDelta, 0);
        const totalVerdicts = totalPass + totalFail;
        const averagePassRate = totalVerdicts > 0 ? totalPass / totalVerdicts : 1.0;
        const suppressionDenominator = totalBlockingCaught + totalSuppressions;
        const suppressionRate = suppressionDenominator > 0
            ? totalSuppressions / suppressionDenominator
            : 0;
        const estimatedFalsePositiveRate = suppressionRate;
        // Aggregate rule counts across all entries
        const ruleTotals = {};
        for (const entry of entries) {
            for (const [ruleId, count] of Object.entries(entry.ruleCounts ?? {})) {
                ruleTotals[ruleId] = (ruleTotals[ruleId] ?? 0) + count;
            }
        }
        const topViolatedRules = Object.entries(ruleTotals)
            .map(([ruleId, count]) => ({ ruleId, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        // AI debt trend
        let aiDebtTrend;
        if (totalAiDebtDelta < -2) {
            aiDebtTrend = 'improving';
        }
        else if (totalAiDebtDelta > 2) {
            aiDebtTrend = 'degrading';
        }
        else {
            aiDebtTrend = 'stable';
        }
        // Build report lines
        const reportLines = buildReportLines({
            days,
            entries,
            totalVerifyRuns,
            totalBlockingCaught,
            totalStructuralCaught,
            averagePassRate,
            estimatedFalsePositiveRate,
            topViolatedRules,
            aiDebtTrend,
            totalAiDebtDelta,
        });
        return {
            periodDays: days,
            totalVerifyRuns,
            totalBlockingCaught,
            totalStructuralCaught,
            averagePassRate,
            suppressionRate,
            estimatedFalsePositiveRate,
            topViolatedRules,
            aiDebtTrend,
            reportLines,
        };
    }
    catch {
        // Safe fallback
        return {
            periodDays: days,
            totalVerifyRuns: 0,
            totalBlockingCaught: 0,
            totalStructuralCaught: 0,
            averagePassRate: 0,
            suppressionRate: 0,
            estimatedFalsePositiveRate: 0,
            topViolatedRules: [],
            aiDebtTrend: 'stable',
            reportLines: ['No data available for this period.'],
        };
    }
}
function pad(label, width = 28) {
    return label.padEnd(width);
}
function pct(value) {
    return `${Math.round(value * 100)}%`;
}
function buildReportLines(opts) {
    const { days, entries, totalVerifyRuns, totalBlockingCaught, totalStructuralCaught, averagePassRate, estimatedFalsePositiveRate, topViolatedRules, aiDebtTrend, totalAiDebtDelta, } = opts;
    const lines = [];
    // Date range
    const sortedDates = entries.map(e => e.date).sort();
    const from = sortedDates[0] ?? todayIso();
    const to = sortedDates[sortedDates.length - 1] ?? todayIso();
    const periodLabel = from === to ? from : `${from} – ${to}`;
    lines.push(`${days > 7 ? 'Month' : 'Week'} Neurcode Pilot Report — ${periodLabel}`);
    lines.push('─'.repeat(42));
    lines.push(`${pad('Verify runs:')}${totalVerifyRuns}`);
    lines.push(`${pad('Blocking issues caught:')}${totalBlockingCaught}`);
    if (totalBlockingCaught > 0) {
        const astPct = Math.round((totalStructuralCaught / totalBlockingCaught) * 100);
        lines.push(`  ${pad('of which AST-verified:')}${totalStructuralCaught} (${astPct}%)`);
    }
    lines.push(`${pad('Pass rate:')}${pct(averagePassRate)}`);
    lines.push(`${pad('Estimated FP rate:')}${pct(estimatedFalsePositiveRate)}`);
    if (topViolatedRules.length > 0) {
        lines.push('Top violated rules:');
        for (const { ruleId, count } of topViolatedRules) {
            lines.push(`  ${ruleId} · ${count} occurrence${count !== 1 ? 's' : ''}`);
        }
    }
    const trendLabel = aiDebtTrend === 'improving'
        ? `Improving (${totalAiDebtDelta} points this period)`
        : aiDebtTrend === 'degrading'
            ? `Degrading (+${totalAiDebtDelta} points this period)`
            : 'Stable';
    lines.push(`${pad('AI debt trend:')}${trendLabel}`);
    return lines;
}
//# sourceMappingURL=pilot-metrics.js.map