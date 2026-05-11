"use strict";
/**
 * Local governance pilot report (VP-readable). No network.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pilotReportCommand = pilotReportCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const telemetry_1 = require("@neurcode-ai/telemetry");
const pilot_metrics_1 = require("../utils/pilot-metrics");
const governance_provenance_1 = require("../utils/governance-provenance");
const project_root_1 = require("../utils/project-root");
const METRICS_REL = (0, path_1.join)('.neurcode', 'pilot-metrics.json');
function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
}
function cutoffIsoDate(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
}
function loadPilotMetricsEntries(repoRoot) {
    const path = (0, path_1.join)(repoRoot, METRICS_REL);
    try {
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
function entriesInReportWindow(repoRoot, days) {
    const cutoff = cutoffIsoDate(days);
    return loadPilotMetricsEntries(repoRoot).filter(e => e.date >= cutoff);
}
function filterTelemetryByWindow(events, fromDate, toDate) {
    return events.filter(ev => {
        const d = ev.emittedAt.slice(0, 10);
        return d >= fromDate && d <= toDate;
    });
}
function filterProvenanceRecordsInWindow(records, fromDate, toDate) {
    return records.filter(r => {
        const d = r.runAt.slice(0, 10);
        return d >= fromDate && d <= toDate;
    }).length;
}
function aggregateDeterministicFromTelemetry(events) {
    let sumDeterministic = 0;
    let sumFindings = 0;
    for (const ev of events) {
        if (ev.eventType !== 'governance.verify.completed') {
            continue;
        }
        const p = ev.payload;
        if (typeof p !== 'object' || p === null || !('determinismHistogram' in p)) {
            continue;
        }
        const hist = p.determinismHistogram;
        const count = p.governanceFindingCount;
        if (!hist || typeof count !== 'number') {
            continue;
        }
        sumFindings += count;
        sumDeterministic += hist['deterministic-structural'] ?? 0;
    }
    const deterministicPct = sumFindings > 0 ? sumDeterministic / sumFindings : 0;
    return { deterministicPct, sumDeterministic, sumFindings };
}
function governanceTrustFromPct(deterministicPct) {
    if (deterministicPct >= 0.7) {
        return 'HIGH';
    }
    if (deterministicPct >= 0.4) {
        return 'MEDIUM';
    }
    return 'LOW';
}
function padLabel(label, width) {
    return label.padEnd(width);
}
function pilotReportCommand(options = {}) {
    const daysRaw = options.days ?? 7;
    const days = daysRaw === 30 ? 30 : 7;
    const jsonMode = options.json === true;
    const { projectRoot } = (0, project_root_1.resolveNeurcodeProjectRootWithTrace)(process.cwd());
    const metricsPath = (0, path_1.join)(projectRoot, METRICS_REL);
    if (!(0, fs_1.existsSync)(metricsPath)) {
        if (!jsonMode) {
            console.log('No governance data recorded yet. Run `neurcode verify` to start collecting metrics.');
        }
        process.exitCode = 0;
        return;
    }
    const summary = (0, pilot_metrics_1.generatePilotSummary)(projectRoot, days);
    const windowEntries = entriesInReportWindow(projectRoot, days);
    const periodFrom = cutoffIsoDate(days);
    const periodTo = todayIsoDate();
    const totalPass = windowEntries.reduce((s, e) => s + e.passCount, 0);
    const totalFail = windowEntries.reduce((s, e) => s + e.failCount, 0);
    const totalVerdicts = totalPass + totalFail;
    const advisoryCaught = windowEntries.reduce((s, e) => s + e.advisoryCaught, 0);
    const allTelemetry = (0, telemetry_1.readGovernanceTelemetryEvents)(projectRoot);
    const telemetryWindow = filterTelemetryByWindow(allTelemetry, periodFrom, periodTo);
    const rollup = (0, telemetry_1.rollupRulePrecisionFromEvents)(telemetryWindow);
    const topRulesSorted = [...(0, telemetry_1.highTrustRuleLeaderboard)(rollup, 5)].sort((a, b) => b.triggerCount - a.triggerCount);
    const provIndex = (0, governance_provenance_1.loadProvenanceIndex)(projectRoot);
    const fingerprintedInWindow = filterProvenanceRecordsInWindow(provIndex.records, periodFrom, periodTo);
    const verifyRuns = summary.totalVerifyRuns;
    const provenanceTotal = verifyRuns;
    const { deterministicPct } = aggregateDeterministicFromTelemetry(telemetryWindow);
    const governanceTrust = governanceTrustFromPct(deterministicPct);
    if (jsonMode) {
        const payload = {
            period: { from: periodFrom, to: periodTo, days },
            verifyRuns,
            passRate: summary.averagePassRate,
            blockingCaught: summary.totalBlockingCaught,
            astVerifiedCount: summary.totalStructuralCaught,
            advisoryCaught,
            suppressionRate: summary.suppressionRate,
            topRules: topRulesSorted.map(r => ({ ruleId: r.ruleId, triggerCount: r.triggerCount })),
            provenanceChain: { fingerprinted: fingerprintedInWindow, total: provenanceTotal },
            governanceTrust,
            deterministicPct,
        };
        console.log(JSON.stringify(payload));
        process.exitCode = 0;
        return;
    }
    const passPct = Math.round(summary.averagePassRate * 100);
    const passPart = totalVerdicts > 0 ? `${totalPass}/${totalVerdicts}` : '0/0';
    const astPct = summary.totalBlockingCaught > 0
        ? Math.round((summary.totalStructuralCaught / summary.totalBlockingCaught) * 100)
        : 0;
    const suppressionPct = Math.round(summary.suppressionRate * 100);
    const detPctRounded = Math.round(deterministicPct * 100);
    const LW = 28;
    const lines = [];
    lines.push('  ━━━ Neurcode Governance Pilot Report ━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`  ${padLabel('Period:', LW)}${periodFrom} – ${periodTo}  (${days} days)`);
    lines.push('  ──────────────────────────────────────────────────────────────');
    lines.push(`  ${padLabel('Verify runs:', LW)}${verifyRuns}`);
    lines.push(`  ${padLabel('Pass rate:', LW)}${passPct}%  (${passPart})`);
    lines.push(`  ${padLabel('Blocking caught:', LW)}${summary.totalBlockingCaught}` +
        `    of which AST-verified: ${summary.totalStructuralCaught} (${astPct}%)`);
    lines.push(`  ${padLabel('Advisory caught:', LW)}${advisoryCaught}`);
    lines.push(`  ${padLabel('Suppression rate:', LW)}${suppressionPct}%  (proxy for false-positive estimate)`);
    lines.push('  ──────────────────────────────────────────────────────────────');
    lines.push('  Top triggered rules:');
    if (topRulesSorted.length === 0) {
        lines.push('    (no qualifying rules in telemetry window)');
    }
    else {
        for (const r of topRulesSorted) {
            const idCol = r.ruleId.padEnd(10);
            lines.push(`    ${idCol}· ${r.triggerCount} trigger${r.triggerCount !== 1 ? 's' : ''}`);
        }
    }
    lines.push('  ──────────────────────────────────────────────────────────────');
    lines.push(`  ${padLabel('Provenance chain:', LW)}${fingerprintedInWindow}/${provenanceTotal} runs fingerprinted`);
    lines.push(`  ${padLabel('Governance trust:', LW)}${governanceTrust}  (${detPctRounded}% deterministic-structural signals)`);
    lines.push('  ──────────────────────────────────────────────────────────────');
    lines.push('  Run `neurcode pilot-report --days 30` for monthly view.');
    lines.push('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(lines.join('\n'));
    process.exitCode = 0;
}
//# sourceMappingURL=pilot-report.js.map