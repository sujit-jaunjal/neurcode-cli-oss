"use strict";
/**
 * Self-contained HTML replay report generator.
 *
 * Renders deterministic replay state into a single audit-grade HTML file.
 * No JavaScript, no external assets, no remote requests — every byte of the
 * output is derived from canonical replay artifacts.
 *
 * The output is intended to be opened directly in a browser, attached to
 * audit reports, or stored alongside `.neurcode/evidence/` artifacts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderReplayHtmlReport = renderReplayHtmlReport;
const STYLES = `
:root {
  --bg: #0f172a;
  --bg-soft: #111827;
  --panel: #1e293b;
  --border: #334155;
  --text: #e2e8f0;
  --muted: #94a3b8;
  --accent: #38bdf8;
  --good: #4ade80;
  --warn: #facc15;
  --bad: #f87171;
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 32px;
  background: var(--bg); color: var(--text);
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "SF Mono", monospace;
}
main { max-width: 1100px; margin: 0 auto; }
h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: 0.2px; }
h2 { font-size: 16px; margin: 24px 0 8px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.9px; }
.subtitle { color: var(--muted); margin: 0 0 24px; font-size: 13px; }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; }
.kv { display: grid; grid-template-columns: 220px 1fr; row-gap: 6px; column-gap: 16px; }
.kv dt { color: var(--muted); }
.kv dd { margin: 0; word-break: break-all; }
.badge { display: inline-block; padding: 1px 8px; border-radius: 4px; font-size: 11px; margin-right: 4px; font-weight: 600; letter-spacing: 0.4px; }
.badge.good { background: rgba(74, 222, 128, 0.18); color: var(--good); }
.badge.warn { background: rgba(250, 204, 21, 0.18); color: var(--warn); }
.badge.bad  { background: rgba(248, 113, 113, 0.18); color: var(--bad); }
.badge.muted { background: rgba(148, 163, 184, 0.18); color: var(--muted); }
.checksum { font-family: "SF Mono", "Menlo", monospace; font-size: 12px; word-break: break-all; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); vertical-align: top; font-size: 13px; }
th { color: var(--muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.6px; font-size: 11px; }
tr:last-child td { border-bottom: 0; }
.muted { color: var(--muted); }
.code { font-family: "SF Mono", "Menlo", monospace; }
.row { display: flex; gap: 12px; flex-wrap: wrap; }
.row .panel { flex: 1; min-width: 280px; }
footer { color: var(--muted); font-size: 12px; margin-top: 32px; border-top: 1px solid var(--border); padding-top: 12px; }
`;
function escapeHtml(text) {
    if (text === null || text === undefined)
        return '—';
    const s = typeof text === 'string' ? text : String(text);
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function badge(value, kind) {
    return `<span class="badge ${kind}">${escapeHtml(value)}</span>`;
}
function statusBadge(value, positive, warning = []) {
    if (!value)
        return badge('unknown', 'muted');
    if (positive.includes(value))
        return badge(value, 'good');
    if (warning.includes(value))
        return badge(value, 'warn');
    return badge(value, 'bad');
}
function row(label, value) {
    return `<dt>${escapeHtml(label)}</dt><dd>${value}</dd>`;
}
function renderRuntimeCapabilities(verify) {
    const rc = (verify?.runtimeCapabilities ?? null);
    if (!rc) {
        return `<section class="panel">
  <h2>Runtime Capabilities</h2>
  <p class="muted">No <code>runtimeCapabilities</code> envelope was attached to the input. This typically means the run pre-dates the 0.11.0 intent-runtime activation, or no <code>verify</code> output was supplied with <code>--verify</code>.</p>
</section>`;
    }
    const tag = (v) => statusBadge(typeof v === 'string' ? v : null, ['active', 'enforced', 'pattern-deterministic', 'active-authored', 'active-synthesized', 'offline', 'full-bundle', 'intent-pack-only'], ['inactive', 'unenforced']);
    return `<section class="panel">
  <h2>Runtime Capabilities</h2>
  <p class="muted">What actually executed in this run. Schema: <code>${escapeHtml(rc.schemaVersion ?? 'neurcode.runtime-capabilities.v1')}</code></p>
  <dl class="kv">
    ${row('intent-runtime', tag(rc.intentRuntime))}
    ${row('intent-contract-source', tag(rc.intentContractSource))}
    ${row('intent-runtime-required', rc.intentRuntimeRequired === true ? badge('required', 'good') : badge('not required', 'muted'))}
    ${row('requirement-satisfied', rc.intentRuntimeRequirementSatisfied === false ? badge('NOT SATISFIED', 'bad') : badge('satisfied', 'good'))}
    ${row('scope-guard', tag(rc.scopeGuard))}
    ${row('forbidden-boundary-enforcement', tag(rc.forbiddenBoundaryEnforcement))}
    ${row('import-edge-governance', tag(rc.importEdgeGovernance))}
    ${row('generated-code-governance', tag(rc.generatedCodeGovernance))}
    ${row('drift-intelligence', tag(rc.driftIntelligence))}
    ${row('structural-rules', tag(rc.structuralRules))}
    ${row('replay-determinism', tag(rc.replayDeterminism))}
    ${row('api-contract-status', tag(rc.apiContractStatus))}
    ${row('execution-path', escapeHtml(rc.executionPath ?? '—'))}
  </dl>
  ${rc.importEdgesAnalyzed !== undefined ? `
  <h3 style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin-top:14px;">Import-edge observability</h3>
  <dl class="kv">
    ${row('edges-analyzed', escapeHtml(rc.importEdgesAnalyzed))}
    ${row('blocking-findings', escapeHtml(rc.importEdgeBlockingFindings ?? 0))}
    ${row('advisory-findings', escapeHtml(rc.importEdgeAdvisoryFindings ?? 0))}
    ${row('observed-boundary-types', escapeHtml(Array.isArray(rc.observedImportEdgeBoundaryTypes) ? rc.observedImportEdgeBoundaryTypes.join(', ') : '—'))}
  </dl>` : ''}
</section>`;
}
function renderPosture(verify) {
    const ig = (verify?.intentGovernance ?? null);
    if (!ig || (!ig.governanceGate && !ig.rolloutTrust)) {
        return '';
    }
    return `<section class="panel">
  <h2>Governance Posture</h2>
  <p class="muted">Categorical rollup synthesised by the drift-intelligence engine from the canonical finding set.</p>
  <dl class="kv">
    ${row('governance-gate', escapeHtml(ig.governanceGate ?? '—'))}
    ${row('rollout-trust', escapeHtml(ig.rolloutTrust ?? '—'))}
    ${row('rollout-risk', escapeHtml(ig.rolloutRisk ?? '—'))}
    ${row('canonical-finding-count', escapeHtml(ig.canonicalFindingCount ?? 0))}
    ${row('blocking-finding-count', escapeHtml(ig.blockingFindingCount ?? 0))}
    ${row('advisory-finding-count', escapeHtml(ig.advisoryFindingCount ?? 0))}
    ${ig.unexpectedFiles && Array.isArray(ig.unexpectedFiles) && ig.unexpectedFiles.length > 0
        ? row('unexpected-files', `<code>${ig.unexpectedFiles.map(escapeHtml).join('</code><br><code>')}</code>`)
        : ''}
  </dl>
</section>`;
}
function renderScopeIssues(verify) {
    const issues = (verify?.scopeIssues ?? []);
    if (!Array.isArray(issues) || issues.length === 0) {
        return `<section class="panel">
  <h2>Scope Issues</h2>
  <p class="muted">No scope issues recorded for this replay state.</p>
</section>`;
    }
    const pathTouch = issues.filter((i) => !i.importEdge);
    const importEdges = issues.filter((i) => !!i.importEdge);
    const rows = (subset, type) => subset.map((issue) => {
        const edge = (issue.importEdge ?? null);
        const policyBadge = issue.policy === 'forbidden' ? badge('forbidden', 'bad')
            : issue.policy === 'review-required' ? badge('review-required', 'warn')
                : issue.policy === 'generated-code' ? badge('generated-code', 'warn')
                    : badge(issue.policy ?? 'out-of-scope', 'muted');
        const boundaryBadge = issue.boundaryType ? badge(issue.boundaryType, 'muted') : '';
        if (type === 'edge' && edge) {
            return `<tr>
  <td class="code">${escapeHtml(edge.sourceFile)}:${escapeHtml(edge.sourceLine)}</td>
  <td>${policyBadge}${boundaryBadge}<span class="badge muted">${escapeHtml(edge.edgeKind)}</span></td>
  <td><span class="code">${escapeHtml(edge.importTarget)}</span><br><span class="muted">→ ${escapeHtml(edge.resolvedTargetPath)}</span><br><span class="muted">boundary: ${escapeHtml(edge.resolvedBoundary)}</span></td>
</tr>`;
        }
        return `<tr>
  <td class="code">${escapeHtml(issue.file)}</td>
  <td>${policyBadge}${boundaryBadge}</td>
  <td>${escapeHtml(issue.message)}</td>
</tr>`;
    }).join('');
    const sections = [];
    if (importEdges.length > 0) {
        sections.push(`<section class="panel">
  <h2>Import-Edge Drift (${importEdges.length})</h2>
  <p class="muted">Cross-boundary <code>import</code> statements inside otherwise in-scope files. Deterministic, replay-stable.</p>
  <table>
    <thead><tr><th>Source · line</th><th>Classification</th><th>Edge</th></tr></thead>
    <tbody>${rows(importEdges, 'edge')}</tbody>
  </table>
</section>`);
    }
    if (pathTouch.length > 0) {
        sections.push(`<section class="panel">
  <h2>Path-touch Scope Drift (${pathTouch.length})</h2>
  <p class="muted">Files modified outside the declared scope or inside an explicit forbidden boundary.</p>
  <table>
    <thead><tr><th>File</th><th>Classification</th><th>Message</th></tr></thead>
    <tbody>${rows(pathTouch, 'path')}</tbody>
  </table>
</section>`);
    }
    return sections.join('\n');
}
function renderReplayState(state, verify) {
    const reconstruction = state.reconstruction;
    const statusBadgeForRecon = reconstruction.reconstructionStatus === 'exact'
        ? badge('exact', 'good')
        : badge(reconstruction.reconstructionStatus, 'warn');
    const verifyChecksum = (verify?.replayChecksum ?? null);
    const verdict = (verify?.verdict ?? null);
    return `<section class="panel">
  <h2>Replay State</h2>
  <dl class="kv">
    ${row('as-of', escapeHtml(state.asOf))}
    ${row('artifact-hash', `<span class="checksum">${escapeHtml(state.determinism.artifactHash)}</span>`)}
    ${verifyChecksum ? row('canonical-replay-checksum', `<span class="checksum">${escapeHtml(verifyChecksum)}</span>`) : ''}
    ${verdict ? row('latest-verdict', verdict === 'PASS' ? badge('PASS', 'good') : badge(verdict, 'bad')) : ''}
    ${row('reconstruction-status', statusBadgeForRecon)}
    ${row('reconstruction-confidence', `${reconstruction.confidence.overall}/100`)}
    ${row('snapshot · control-plane', state.controlPlane.snapshotId ? escapeHtml(state.controlPlane.snapshotId) : badge('none', 'muted'))}
    ${row('snapshot · workspace', state.workspace.snapshotId ? escapeHtml(state.workspace.snapshotId) : badge('none', 'muted'))}
  </dl>
  <div class="row" style="margin-top:14px;">
    <div class="panel" style="margin-bottom:0;">
      <h3 style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin:0 0 8px;">Posture</h3>
      <dl class="kv">
        ${row('runs', escapeHtml(state.posture.runCount))}
        ${row('pass-rate', `${escapeHtml(state.posture.passRate)}%`)}
        ${row('block-rate', `${escapeHtml(state.posture.blockRate)}%`)}
        ${row('regression-rate', `${escapeHtml(state.posture.regressionRate)}%`)}
      </dl>
    </div>
    <div class="panel" style="margin-bottom:0;">
      <h3 style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin:0 0 8px;">Reconstruction confidence (deterministic subscores)</h3>
      <dl class="kv">
        ${row('provenance', `${reconstruction.confidence.provenance.score}/100`)}
        ${row('graph', `${reconstruction.confidence.graph.score}/100`)}
        ${row('semantic', `${reconstruction.confidence.semantic.score}/100`)}
        ${row('federation', `${reconstruction.confidence.federation.score}/100`)}
        ${row('artifacts', `${reconstruction.confidence.artifacts.score}/100`)}
      </dl>
    </div>
  </div>
</section>`;
}
function renderBlockedExecutions(state) {
    if (state.blockedExecutions.length === 0)
        return '';
    const rows = state.blockedExecutions.slice(0, 30).map((exec) => `<tr>
  <td class="code">${escapeHtml(exec.executionId.slice(0, 12))}</td>
  <td>${escapeHtml(exec.type)}</td>
  <td>${escapeHtml(exec.source)}</td>
  <td>${escapeHtml(exec.createdAt)}</td>
  <td>${escapeHtml(exec.blocking)}</td>
  <td>${escapeHtml(exec.advisory)}</td>
</tr>`).join('');
    return `<section class="panel">
  <h2>Blocked Executions (${state.blockedExecutions.length})</h2>
  <table>
    <thead><tr><th>Execution</th><th>Type</th><th>Source</th><th>Created</th><th>Blocking</th><th>Advisory</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}
function renderRecoveryGuidance(state) {
    const guidance = state.reconstruction.recoveryGuidance ?? [];
    if (guidance.length === 0)
        return '';
    const items = guidance.slice(0, 20).map((g) => `<li>${escapeHtml(g)}</li>`).join('');
    return `<section class="panel">
  <h2>Operational Recovery Guidance</h2>
  <p class="muted">Bounded, deterministic remediation hints derived from observed snapshot completeness.</p>
  <ul>${items}</ul>
</section>`;
}
/**
 * Render a self-contained HTML report. The returned string is ready to be
 * written to disk and opened in any browser. No external assets fetched.
 */
function renderReplayHtmlReport(input) {
    const generatedAt = input.generatedAt ?? new Date().toISOString();
    const projectRoot = input.state.determinism.projectRoot ?? 'unknown';
    const verify = input.verify ?? null;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="generator" content="neurcode replay --html" />
  <title>Neurcode · Replay Report</title>
  <style>${STYLES}</style>
</head>
<body>
<main>
  <h1>Neurcode · Replay Report</h1>
  <p class="subtitle">Deterministic operational governance · audit-grade · same inputs → same report bytes.</p>
  <section class="panel">
    <dl class="kv">
      ${row('generated-at', escapeHtml(generatedAt))}
      ${row('project-root', `<code>${escapeHtml(projectRoot)}</code>`)}
      ${row('replay schema', escapeHtml(input.state.schemaVersion))}
    </dl>
  </section>
  ${renderReplayState(input.state, verify)}
  ${renderRuntimeCapabilities(verify)}
  ${renderPosture(verify)}
  ${renderScopeIssues(verify)}
  ${renderBlockedExecutions(input.state)}
  ${renderRecoveryGuidance(input.state)}
  <footer>
    <p>Replay output is deterministic. Same diff + same intent contract + same rule set → byte-identical <code>replayChecksum</code>.</p>
    <p>Schema: <code>${escapeHtml(input.state.schemaVersion)}</code> · Generator: <code>neurcode replay --html</code> · No JavaScript, no external assets.</p>
  </footer>
</main>
</body>
</html>
`;
}
//# sourceMappingURL=replay-html-report.js.map