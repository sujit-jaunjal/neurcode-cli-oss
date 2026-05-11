"use strict";
/**
 * PR Review Compression
 *
 * Converts full governance output into a concise, actionable summary
 * that reduces reviewer cognitive load.
 *
 * Target output: 3–7 lines covering the operationally significant changes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCompressedReview = generateCompressedReview;
// Security/auth/payment path keywords that elevate urgency to 'critical'
const CRITICAL_RISK_KEYWORDS = [
    'auth', 'authentication', 'authorization', 'payment', 'security',
    'credential', 'token', 'secret', 'password', 'oauth', 'jwt',
    'permission', 'access', 'billing', 'charge', 'encrypt',
];
function containsCriticalRisk(violations) {
    for (const v of violations) {
        const combined = `${v.filePath} ${v.operationalRisk} ${v.ruleId} ${v.ruleName}`.toLowerCase();
        if (CRITICAL_RISK_KEYWORDS.some(kw => combined.includes(kw))) {
            return true;
        }
    }
    return false;
}
function truncate(str, maxLen) {
    if (str.length <= maxLen)
        return str;
    return str.slice(0, maxLen - 1) + '…';
}
function buildHeadline(input) {
    switch (input.verdict) {
        case 'PASS':
            if (input.advisoryCount === 0) {
                return '✅ Governance clean — no structural issues detected';
            }
            return `✅ Governance PASS · ${input.advisoryCount} advisory finding${input.advisoryCount !== 1 ? 's' : ''} (non-blocking)`;
        case 'FAIL':
            return `❌ Governance FAIL — ${input.blockingCount} blocking structural issue${input.blockingCount !== 1 ? 's' : ''} require attention`;
        case 'WARN':
            return '⚠️ Governance WARN · changes require manual review';
        default:
            return '⚠️ Governance result unknown';
    }
}
function buildBullets(input) {
    const bullets = [];
    // Blocking structural violations (max 3, then "… and N more")
    const blockingStructural = input.structuralViolations.filter(v => v.severity === 'blocking' || v.severity === 'error' || v.severity === 'BLOCKING' || v.severity === 'ERROR');
    const MAX_BLOCKING_BULLETS = 3;
    const shown = blockingStructural.slice(0, MAX_BLOCKING_BULLETS);
    for (const v of shown) {
        const ruleLabel = v.ruleId.startsWith('SR') ? v.ruleId : `SR${v.ruleId}`;
        const fileBase = v.filePath.split('/').pop() ?? v.filePath;
        const riskSnippet = truncate(v.operationalRisk, 60);
        bullets.push(truncate(`🔴 ${ruleLabel} in ${fileBase}:${v.line} — ${riskSnippet}`, 100));
    }
    const remaining = blockingStructural.length - shown.length;
    if (remaining > 0) {
        bullets.push(`… and ${remaining} more blocking violation${remaining !== 1 ? 's' : ''}`);
    }
    // AI debt delta
    if (input.aiDebtDelta > 5) {
        bullets.push(`📈 AI debt increased by ${input.aiDebtDelta} points this PR`);
    }
    else if (input.aiDebtDelta < -5) {
        bullets.push(`📉 AI debt reduced by ${Math.abs(input.aiDebtDelta)} points — good cleanup`);
    }
    // Blast radius
    if (input.blastRadius.riskLevel === 'high') {
        const modules = input.blastRadius.modulesAffected.slice(0, 3).join(', ');
        const modStr = input.blastRadius.modulesAffected.length > 3
            ? `${modules} + ${input.blastRadius.modulesAffected.length - 3} more`
            : modules;
        bullets.push(truncate(`💥 High blast radius: ${input.blastRadius.filesChanged} files across ${modStr}`, 100));
    }
    // Suppressions
    if (input.suppressedCount > 0) {
        bullets.push(`🔕 ${input.suppressedCount} violation${input.suppressedCount !== 1 ? 's' : ''} suppressed via neurcode-ignore (see audit trail)`);
    }
    // Deterministic findings
    const deterministicSignals = input.deterministicSignals ?? 0;
    if (deterministicSignals > 0) {
        bullets.push(`⚙️ ${deterministicSignals} AST-verified finding${deterministicSignals !== 1 ? 's' : ''} — deterministic, no false positives`);
    }
    // Keep max 5 bullets
    return bullets.slice(0, 5);
}
function buildUrgency(input, blockingStructural) {
    if (input.verdict === 'FAIL') {
        if (blockingStructural.length > 0) {
            return containsCriticalRisk(blockingStructural) ? 'critical' : 'high';
        }
        return 'medium';
    }
    if (input.verdict === 'WARN') {
        return 'medium';
    }
    // PASS
    if (input.advisoryCount > 0) {
        return 'low';
    }
    return 'none';
}
function buildTerminal(verdict, headline, bullets) {
    const BOX_WIDTH = 58;
    const border = '─'.repeat(BOX_WIDTH - `┌─ Neurcode · ${verdict} `.length);
    const top = `┌─ Neurcode · ${verdict} ${border}`;
    const bottom = `└${'─'.repeat(BOX_WIDTH)}`;
    const lines = [top, `│  ${headline}`];
    for (const b of bullets) {
        lines.push(`│  • ${b}`);
    }
    lines.push(bottom);
    return lines.join('\n');
}
function buildMarkdown(headline, bullets, provenanceRunId) {
    const parts = [`**${headline}**`];
    for (const b of bullets) {
        parts.push(`- ${b}`);
    }
    if (provenanceRunId) {
        parts.push(`\n_Provenance: \`${provenanceRunId}\`_`);
    }
    // Trim to 500 chars
    let md = parts.join('\n');
    if (md.length > 500) {
        md = md.slice(0, 497) + '…';
    }
    return md;
}
/**
 * Generate a compressed review summary from full governance output.
 */
function generateCompressedReview(input) {
    try {
        const headline = buildHeadline(input);
        const bullets = buildBullets(input);
        const blockingStructural = input.structuralViolations.filter(v => v.severity === 'blocking' || v.severity === 'error' || v.severity === 'BLOCKING' || v.severity === 'ERROR');
        const urgency = buildUrgency(input, blockingStructural);
        const terminal = buildTerminal(input.verdict, headline, bullets);
        const markdown = buildMarkdown(headline, bullets, input.provenanceRunId);
        return { headline, bullets, urgency, terminal, markdown };
    }
    catch {
        // Safe fallback — never throw
        const fallbackHeadline = '⚠️ Governance review compression failed';
        return {
            headline: fallbackHeadline,
            bullets: [],
            urgency: 'medium',
            terminal: `┌─ Neurcode · ERROR ────────────────────────────────\n│  ${fallbackHeadline}\n└──────────────────────────────────────────────────`,
            markdown: `**${fallbackHeadline}**`,
        };
    }
}
//# sourceMappingURL=index.js.map