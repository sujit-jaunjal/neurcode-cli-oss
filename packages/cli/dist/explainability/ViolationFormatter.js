"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViolationFormatter = void 0;
const DeterminismClassifier_1 = require("./DeterminismClassifier");
// ── Terminal box-drawing helpers ──────────────────────────────────────────────
const HR = '─'.repeat(77);
function pad(s, width) {
    return s.length >= width ? s : s + ' '.repeat(width - s.length);
}
function truncate(s, maxLen) {
    if (s.length <= maxLen)
        return s;
    return s.slice(0, maxLen - 3) + '...';
}
// ── ViolationFormatter ────────────────────────────────────────────────────────
class ViolationFormatter {
    /**
     * Format a single violation into a concise, actionable terminal string.
     *
     * Example:
     * ┌─ SR001 · BLOCKING · deterministic-structural (confidence: 97%)
     * │  File:    packages/server/src/middleware/requestCoalescer.ts:43
     * │  Pattern: .catch() callback contains no throw/reject path
     * │  Code:    .catch((err) => { this.pending.delete(key); console.error(err); })
     * │  Risk:    All coalesced waiters receive undefined instead of rejection
     * │  Fix:     Add `throw err;` before the closing brace of the .catch callback
     * └─────────────────────────────────────────────────────────────────────────────
     */
    formatSingle(v) {
        const pct = Math.round(v.confidence * 100);
        const icon = DeterminismClassifier_1.DeterminismClassifier.icon(v.determinism);
        const lines = [];
        lines.push(`┌─ ${v.ruleId} · ${v.severity} · ${v.determinism} (confidence: ${pct}%)`);
        lines.push(`│  File:    ${v.filePath}:${v.line}`);
        lines.push(`│  Pattern: ${truncate(v.evidence.matchReason, 72)}`);
        const snippet = v.evidence.codeSnippet.replace(/\n/g, ' ').trim();
        lines.push(`│  Code:    ${truncate(snippet, 72)}`);
        lines.push(`│  Risk:    ${truncate(v.operationalRisk, 72)}`);
        lines.push(`│  Fix:     ${truncate(v.remediation, 72)}`);
        if (v.remediationCode) {
            const codeLines = v.remediationCode.split('\n');
            lines.push(`│  Suggested code:`);
            for (const cl of codeLines) {
                lines.push(`│    ${cl}`);
            }
        }
        lines.push(`│  Trust:   ${icon} ${DeterminismClassifier_1.DeterminismClassifier.label(v.determinism)}`);
        lines.push(`└${HR}`);
        return lines.join('\n');
    }
    /**
     * Format a ViolationReport into a full terminal report.
     * Sections: Summary header, Blocking violations (grouped by file),
     * Advisory violations (grouped by file), Determinism breakdown.
     */
    formatReport(report) {
        const lines = [];
        const ts = report.generatedAt;
        lines.push('');
        lines.push('╔══════════════════════════════════════════════════════════════════════════╗');
        lines.push('║                     NEURCODE GOVERNANCE REPORT                          ║');
        lines.push('╚══════════════════════════════════════════════════════════════════════════╝');
        lines.push(`  Generated: ${ts}`);
        lines.push(`  Repo:      ${report.repoRoot}`);
        lines.push('');
        // Summary
        const blockingCount = report.blocking.length;
        const advisoryCount = report.advisory.length;
        const status = blockingCount === 0 ? 'PASS' : 'FAIL';
        lines.push(`  Status:    ${status}`);
        lines.push(`  Blocking:  ${blockingCount}`);
        lines.push(`  Advisory:  ${advisoryCount}`);
        lines.push(`  Total:     ${report.totalViolations}`);
        lines.push(`  Deterministic findings: ${report.deterministicCount}`);
        lines.push(`  Heuristic findings:     ${report.heuristicCount}`);
        lines.push(`  False-positive risk:    ${report.falsePositiveRisk}`);
        lines.push('');
        // Blocking violations grouped by file
        if (blockingCount > 0) {
            lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            lines.push('  BLOCKING VIOLATIONS');
            lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            lines.push('');
            for (const [filePath, violations] of Object.entries(report.byFile)) {
                const blockingInFile = violations.filter(v => v.severity === 'BLOCKING');
                if (blockingInFile.length === 0)
                    continue;
                lines.push(`  ${filePath}`);
                for (const v of blockingInFile) {
                    lines.push(this.formatSingle(v).split('\n').map(l => '  ' + l).join('\n'));
                }
                lines.push('');
            }
        }
        // Advisory violations grouped by file
        if (advisoryCount > 0) {
            lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            lines.push('  ADVISORY VIOLATIONS');
            lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            lines.push('');
            for (const [filePath, violations] of Object.entries(report.byFile)) {
                const advisoryInFile = violations.filter(v => v.severity === 'ADVISORY');
                if (advisoryInFile.length === 0)
                    continue;
                lines.push(`  ${filePath}`);
                for (const v of advisoryInFile) {
                    lines.push(this.formatSingle(v).split('\n').map(l => '  ' + l).join('\n'));
                }
                lines.push('');
            }
        }
        // Determinism breakdown
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('  DETERMINISM BREAKDOWN');
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('');
        const classes = [
            'deterministic-structural',
            'deterministic-semantic',
            'heuristic-advisory',
            'llm-assisted-planning',
        ];
        for (const cls of classes) {
            const count = report.byDeterminism[cls] ?? 0;
            const icon = DeterminismClassifier_1.DeterminismClassifier.icon(cls);
            const label = DeterminismClassifier_1.DeterminismClassifier.label(cls);
            lines.push(`  ${icon}  ${pad(label, 42)}  ${count}`);
        }
        lines.push('');
        return lines.join('\n');
    }
    /**
     * Format as GitHub PR comment markdown.
     * Uses GitHub markdown: collapsible sections, code blocks, tables.
     */
    formatGitHubPRComment(report, planId) {
        const blockingCount = report.blocking.length;
        const advisoryCount = report.advisory.length;
        const ts = report.generatedAt;
        const planRef = planId ? ` · Plan ID: ${planId}` : '';
        const parts = [];
        // Header
        if (blockingCount === 0) {
            parts.push('## ✅ Governance: PASS\n');
            parts.push(`No blocking violations found. ${advisoryCount} advisory finding${advisoryCount !== 1 ? 's' : ''}.\n`);
        }
        else {
            parts.push('## 🔍 Neurcode Governance Report\n');
        }
        // Summary table
        const aggResult = DeterminismClassifier_1.DeterminismClassifier.aggregate([
            ...report.blocking,
            ...report.advisory,
        ]);
        parts.push('### Summary\n');
        parts.push('| Category | Count |');
        parts.push('|---|---|');
        parts.push(`| 🚫 Blocking | ${blockingCount} |`);
        parts.push(`| ⚠️ Advisory | ${advisoryCount} |`);
        parts.push(`| ⚙️ Deterministic | ${report.deterministicCount} |`);
        parts.push(`| ⚡ Heuristic | ${report.heuristicCount} |`);
        parts.push(`| Trust score | ${aggResult.trustScore}/100 |`);
        parts.push(`| False-positive risk | ${report.falsePositiveRisk} |`);
        parts.push('');
        // Blocking violations
        if (blockingCount > 0) {
            parts.push('### 🚫 Blocking Violations\n');
            parts.push('These must be resolved before merging.\n');
            for (const v of report.blocking) {
                const pct = Math.round(v.confidence * 100);
                const icon = DeterminismClassifier_1.DeterminismClassifier.icon(v.determinism);
                const label = DeterminismClassifier_1.DeterminismClassifier.label(v.determinism);
                parts.push(`<details>`);
                parts.push(`<summary><strong>${v.ruleId}</strong> — ${v.ruleName} · <code>${v.filePath}:${v.line}</code></summary>\n`);
                parts.push(`**Policy:** \`${v.policyRef}\`  `);
                parts.push(`**Severity:** \`BLOCKING\`  `);
                parts.push(`**Trust:** ${icon} ${label} (${pct}% confidence)\n`);
                parts.push(`**Location:** \`${v.filePath}\` line ${v.line}, col ${v.column}\n`);
                parts.push(`**Pattern matched:** ${v.evidence.matchReason}  `);
                parts.push(`**AST node:** \`${v.evidence.astNodeType}\`\n`);
                parts.push(`\`\`\`${v.language}`);
                parts.push(v.evidence.codeSnippet);
                parts.push('```\n');
                parts.push(`**Operational risk:** ${v.operationalRisk}\n`);
                parts.push(`**Worst case:** ${v.worstCase}\n`);
                parts.push(`**Remediation:** ${v.remediation}\n`);
                if (v.remediationCode) {
                    parts.push(`**Suggested fix:**`);
                    parts.push(`\`\`\`${v.language}`);
                    parts.push(v.remediationCode);
                    parts.push('```\n');
                }
                parts.push('</details>\n');
            }
        }
        // Advisory violations (collapsed by default)
        if (advisoryCount > 0) {
            parts.push('### ⚠️ Advisory Violations\n');
            parts.push('These are non-blocking findings. Review and address where feasible.\n');
            for (const v of report.advisory) {
                const pct = Math.round(v.confidence * 100);
                const icon = DeterminismClassifier_1.DeterminismClassifier.icon(v.determinism);
                parts.push(`<details>`);
                parts.push(`<summary>${v.ruleId} — ${v.ruleName} · <code>${v.filePath}:${v.line}</code> · ${icon} ${pct}%</summary>\n`);
                parts.push(`**Policy:** \`${v.policyRef}\`  `);
                parts.push(`**Trust:** ${DeterminismClassifier_1.DeterminismClassifier.label(v.determinism)}\n`);
                parts.push(`\`\`\`${v.language}`);
                parts.push(v.evidence.codeSnippet);
                parts.push('```\n');
                parts.push(`**Risk:** ${v.operationalRisk}  `);
                parts.push(`**Fix:** ${v.remediation}\n`);
                parts.push('</details>\n');
            }
        }
        // Determinism breakdown
        parts.push('<details>');
        parts.push('<summary>Determinism breakdown</summary>\n');
        parts.push('| Class | Label | Count |');
        parts.push('|---|---|---|');
        const classes = [
            'deterministic-structural',
            'deterministic-semantic',
            'heuristic-advisory',
            'llm-assisted-planning',
        ];
        for (const cls of classes) {
            const count = report.byDeterminism[cls] ?? 0;
            const icon = DeterminismClassifier_1.DeterminismClassifier.icon(cls);
            parts.push(`| ${icon} \`${cls}\` | ${DeterminismClassifier_1.DeterminismClassifier.label(cls)} | ${count} |`);
        }
        parts.push('');
        parts.push('</details>\n');
        // Footer
        parts.push(`---`);
        parts.push(`*Generated by Neurcode${planRef} · ${ts}*`);
        const result = parts.join('\n');
        // Enforce GitHub PR comment character limit (65,536)
        if (result.length > 65000) {
            const truncationNotice = '\n\n> **Note:** Report truncated to fit GitHub PR comment limit. See CI logs for full output.';
            return result.slice(0, 65000 - truncationNotice.length) + truncationNotice;
        }
        return result;
    }
    /**
     * Format as compact JSON for CI/CD pipeline consumption.
     */
    formatJSON(report) {
        return JSON.stringify(report, null, 2);
    }
}
exports.ViolationFormatter = ViolationFormatter;
//# sourceMappingURL=ViolationFormatter.js.map