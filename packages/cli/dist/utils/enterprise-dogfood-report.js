"use strict";
/**
 * Enterprise Repo Dogfood report — pure, source-free builder (Iteration 14).
 *
 * Iterations 6-13 proved the runtime against fixtures, sandbox payloads, and
 * `neurcode verify --ci` timing on real checkouts. Iteration 14 closes the loop
 * the roadmap actually asks for: drive a *governed cross-file session* on a real,
 * pinned third-party repository and record — honestly and source-free — whether
 * the product was useful.
 *
 * This module is the deterministic, I/O-free core. It takes a single
 * already-source-free facts object ({@link DogfoodReportInput}) gathered by the
 * operator harness (`scripts/enterprise-repo-dogfood-v1.mjs`) and turns it into:
 *
 *   1. {@link buildEnterpriseDogfoodReport} — a machine-readable manifest
 *      (`neurcode.enterprise-dogfood-report.v1`) carrying repo facts, brain index
 *      metrics, the honest per-tool enforcement posture, structured session
 *      observations, source-free evidence pointers, and a seven-dimension score.
 *   2. {@link renderEnterpriseDogfoodReportMarkdown} — the human-readable report.
 *
 * Hard rules (shared with utils/enterprise-eval-report.ts + utils/pilot-evidence-pack.ts):
 *   - Source-free. Only slugs, public OSS identities, paths, owners, counts,
 *     hashes, verdicts, and durations are read or emitted. We NEVER carry source,
 *     diffs, patch bodies, raw prompts, secrets, or natural-language intent /
 *     task / session prose. {@link assertEnterpriseDogfoodSourceFree} is the
 *     backstop and mirrors the CI leak gate (scripts/source-free-leak-scan.mjs).
 *   - Honest enforcement. The Enforcement dimension reports the real
 *     `integrations doctor` posture — a cooperative adapter (e.g. Cursor) is
 *     advisory, never claimed to be the Claude hook's hard pre-write deny.
 *   - Honest scope. Scores are operator judgments, each REQUIRING a source-free
 *     evidence pointer (artifact path + count / hash / duration). A score without
 *     evidence is rejected at build time.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOGFOOD_DIMENSION_LABELS = exports.DOGFOOD_SCORE_DIMENSIONS = exports.ENTERPRISE_DOGFOOD_REPORT_SCHEMA_VERSION = void 0;
exports.assertEnterpriseDogfoodSourceFree = assertEnterpriseDogfoodSourceFree;
exports.rollupDogfoodVerdict = rollupDogfoodVerdict;
exports.buildEnterpriseDogfoodReport = buildEnterpriseDogfoodReport;
exports.renderEnterpriseDogfoodReportMarkdown = renderEnterpriseDogfoodReportMarkdown;
const enterprise_eval_report_1 = require("./enterprise-eval-report");
const pilot_evidence_pack_1 = require("./pilot-evidence-pack");
exports.ENTERPRISE_DOGFOOD_REPORT_SCHEMA_VERSION = 'neurcode.enterprise-dogfood-report.v1';
// ── Scoring rubric (P0-locked: pass | partial | fail per dimension) ───────────
/** The seven roadmap score dimensions, in canonical report order. */
exports.DOGFOOD_SCORE_DIMENSIONS = [
    'intelligence',
    'enforcement',
    'usability',
    'scalability',
    'evidence',
    'privacy',
    'enterpriseReadiness',
];
exports.DOGFOOD_DIMENSION_LABELS = {
    intelligence: 'Intelligence',
    enforcement: 'Enforcement',
    usability: 'Usability',
    scalability: 'Scalability',
    evidence: 'Evidence',
    privacy: 'Privacy',
    enterpriseReadiness: 'Enterprise readiness',
};
const DOGFOOD_REPORT_EXCLUDES = [
    'source code',
    'diff hunks',
    'patch bodies',
    'raw prompts',
    'raw chat',
    'natural-language intent / task text',
    'session prose',
    'secrets',
    'private file contents',
];
const DEFAULT_WHAT_THIS_PROVES = [
    'The Neurcode brain indexed a real, pinned third-party repository and produced a source-free scale / coverage projection.',
    'A governed cross-file session ran against real code: boundary blocks, exact-path approvals, and neighbor containment were observed (counts only).',
    'Source-free evidence (pilot evidence pack, AI Change Records, runtime risk classification) was exported with stable content hashes.',
];
const DEFAULT_WHAT_THIS_DOES_NOT_PROVE = [
    'It does not prove the third-party source is correct, secure, or free of vulnerabilities.',
    'It does not prove the agent "semantically understands" the repository — brain reuse / architecture signals are advisory and can be false positives.',
    'Enforcement strength depends on the agent: a cooperative adapter (e.g. Cursor) is advisory and can be bypassed — it is NOT the Claude hook\'s hard pre-write deny.',
    'Scores are operator judgments backed by source-free evidence pointers, not an automated benchmark.',
];
const DEFAULT_LIMITATIONS = [
    'Single operator run on one pinned commit — not a statistical sample.',
    'Large repositories (e.g. microsoft/TypeScript, apache/airflow) run in the operator / pre-release tier, never in hermetic CI.',
];
/**
 * Source-like / prose key names that must never appear in a shareable dogfood
 * artifact. Mirrors `SOURCE_LIKE_KEYS` in scripts/source-free-leak-scan.mjs and
 * `FORBIDDEN_PROSE_KEYS` in utils/pilot-evidence-pack.ts so the builder rejects
 * exactly what the CI leak gate (`scanJsonPayload`) would flag.
 */
const FORBIDDEN_KEYS = new Set([
    'content',
    'fileContent',
    'file_content',
    'sourceText',
    'source_text',
    'sourceCode',
    'source_code',
    'diff',
    'diffText',
    'diff_text',
    'patch',
    'before',
    'after',
    'raw_prompt',
    'body',
    'hunk',
    'unifiedDiff',
    'unified_diff',
    'command_body',
    ...pilot_evidence_pack_1.FORBIDDEN_PROSE_KEYS,
]);
function findForbiddenKeys(value, path = 'root', out = []) {
    if (Array.isArray(value)) {
        value.forEach((item, index) => findForbiddenKeys(item, `${path}[${index}]`, out));
        return out;
    }
    if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
            if (FORBIDDEN_KEYS.has(key))
                out.push(`${path}.${key}`);
            findForbiddenKeys(child, `${path}.${key}`, out);
        }
    }
    return out;
}
/** Throw if a would-be dogfood artifact carries source/diff/secret/prose shapes. */
function assertEnterpriseDogfoodSourceFree(value, label = 'enterprise-dogfood artifact') {
    // 1. Shared diff / secret / key string patterns (eval + pilot backstop).
    (0, enterprise_eval_report_1.assertEnterpriseEvalSourceFree)(value, label);
    // 2. Source-like / prose key names anywhere in the structure (matches the gate).
    const offending = findForbiddenKeys(value);
    if (offending.length > 0) {
        throw new Error(`${label} contains forbidden source/prose keys: ${offending.join(', ')}`);
    }
}
function rollupDogfoodVerdict(scores) {
    if (scores.some((s) => s.verdict === 'fail'))
        return 'fail';
    if (scores.some((s) => s.verdict === 'partial'))
        return 'partial';
    return 'pass';
}
function validateScores(scores) {
    const byDimension = new Map();
    for (const score of scores) {
        if (!exports.DOGFOOD_SCORE_DIMENSIONS.includes(score.dimension)) {
            throw new Error(`unknown dogfood score dimension: ${String(score.dimension)}`);
        }
        if (byDimension.has(score.dimension)) {
            throw new Error(`duplicate dogfood score dimension: ${score.dimension}`);
        }
        if (score.verdict !== 'pass' && score.verdict !== 'partial' && score.verdict !== 'fail') {
            throw new Error(`dimension ${score.dimension} has an invalid verdict: ${String(score.verdict)}`);
        }
        if (typeof score.evidence !== 'string' || score.evidence.trim().length === 0) {
            throw new Error(`dimension ${score.dimension} is missing a source-free evidence pointer`);
        }
        byDimension.set(score.dimension, score);
    }
    const missing = exports.DOGFOOD_SCORE_DIMENSIONS.filter((d) => !byDimension.has(d));
    if (missing.length > 0) {
        throw new Error(`dogfood report is missing score dimension(s): ${missing.join(', ')}`);
    }
    // Canonical order so the report and markdown are deterministic.
    return exports.DOGFOOD_SCORE_DIMENSIONS.map((d) => byDimension.get(d));
}
function buildEnterpriseDogfoodReport(input) {
    const scores = validateScores(input.scores);
    const scoreSummary = {
        pass: scores.filter((s) => s.verdict === 'pass').length,
        partial: scores.filter((s) => s.verdict === 'partial').length,
        fail: scores.filter((s) => s.verdict === 'fail').length,
        overall: rollupDogfoodVerdict(scores),
    };
    return {
        schemaVersion: exports.ENTERPRISE_DOGFOOD_REPORT_SCHEMA_VERSION,
        generatedAt: input.generatedAt,
        cliVersion: input.cliVersion ?? null,
        operator: input.operator ?? null,
        repo: input.repo,
        brain: input.brain,
        enforcement: input.enforcement,
        session: input.session,
        artifacts: input.artifacts,
        commandsRun: input.commandsRun,
        durations: input.durations,
        scores,
        scoreSummary,
        whatThisProves: input.whatThisProves?.length ? input.whatThisProves : DEFAULT_WHAT_THIS_PROVES,
        whatThisDoesNotProve: input.whatThisDoesNotProve?.length
            ? input.whatThisDoesNotProve
            : DEFAULT_WHAT_THIS_DOES_NOT_PROVE,
        limitations: input.limitations?.length ? input.limitations : DEFAULT_LIMITATIONS,
        privacy: { sourceFree: true, excludes: DOGFOOD_REPORT_EXCLUDES },
    };
}
// ── Markdown renderer (source-free) ───────────────────────────────────────────
const VERDICT_GLYPH = {
    pass: '✓',
    partial: '~',
    fail: '✗',
};
function formatBytes(bytes) {
    if (bytes == null)
        return 'n/a';
    if (bytes < 1024)
        return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(1)} ${units[unit]}`;
}
function formatMs(ms) {
    if (ms == null)
        return 'n/a';
    if (ms < 1000)
        return `${ms} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
}
function renderEnterpriseDogfoodReportMarkdown(report) {
    const lines = [];
    lines.push('# Enterprise Repo Dogfood — Report');
    lines.push('');
    lines.push(`Generated: ${report.generatedAt}`);
    lines.push(`CLI: ${report.cliVersion ?? 'n/a'}${report.operator ? ` · Operator: ${report.operator}` : ''}`);
    lines.push(`Repo: ${report.repo.name} @ ${report.repo.pinnedCommit}${report.repo.ref ? ` (${report.repo.ref})` : ''} · Language: ${report.repo.language} · CI tier: ${report.repo.ciTier}`);
    lines.push(`Scale: ${report.repo.filesTracked ?? 'n/a'} tracked file(s), ${formatBytes(report.repo.diskBytes)} on disk`);
    lines.push(`Score: ${report.scoreSummary.pass} pass · ${report.scoreSummary.partial} partial · ${report.scoreSummary.fail} fail — overall ${report.scoreSummary.overall}`);
    lines.push('');
    lines.push('## Scores (pass / partial / fail with source-free evidence)');
    lines.push('');
    lines.push('| | Dimension | Verdict | Evidence (paths / counts / hashes / durations) |');
    lines.push('|---|---|---|---|');
    for (const score of report.scores) {
        lines.push(`| ${VERDICT_GLYPH[score.verdict]} | ${exports.DOGFOOD_DIMENSION_LABELS[score.dimension]} | ${score.verdict} | ${score.evidence} |`);
    }
    lines.push('');
    lines.push('## Brain index');
    lines.push('');
    if (!report.brain.indexed) {
        lines.push('- Not indexed in this run.');
    }
    else {
        lines.push(`- Files indexed: ${report.brain.filesIndexed ?? 'n/a'} (scanned ${report.brain.filesScanned ?? 'n/a'})`);
        lines.push(`- Index duration: ${formatMs(report.brain.indexDurationMs)} · readiness ${formatMs(report.brain.readinessDurationMs)}`);
        lines.push(`- Scale status: ${report.brain.scaleStatus ?? 'n/a'}`);
        lines.push(`- Storage: ${report.brain.storageBackend ?? 'n/a'}${report.brain.storageFallback ? ' (fallback engaged)' : ''}`);
        if (report.brain.languageMatrix.length > 0) {
            lines.push(`- Language matrix: ${report.brain.languageMatrix
                .map((m) => `${m.language} ${m.files} file(s) [${m.coverageTier}]`)
                .join('; ')}`);
        }
    }
    lines.push('');
    lines.push('## Enforcement posture (from `integrations doctor`)');
    lines.push('');
    lines.push(`- Agent / adapter: ${report.enforcement.agent}${report.enforcement.adapter ? ` / ${report.enforcement.adapter}` : ''}`);
    lines.push(`- Guarantee: ${report.enforcement.guaranteeLabel}`);
    lines.push(`- Enforceable hard deny: ${report.enforcement.enforceable ? 'yes' : 'no'} · Advisory-only (bypassable): ${report.enforcement.advisoryOnly ? 'yes' : 'no'}`);
    lines.push(`- Method: ${report.enforcement.method}`);
    lines.push(`- integrations doctor status: ${report.enforcement.integrationsDoctorStatus ?? 'n/a'}`);
    lines.push('');
    lines.push('## Governed cross-file session');
    lines.push('');
    lines.push(`- Task: ${report.session.task.id} — ${report.session.task.title}`);
    lines.push(`- Cross-file: ${report.session.task.crossFile ? 'yes' : 'no'} · Expected files: ${report.session.task.expectedFiles ?? 'n/a'} · Governed: ${report.session.governed ? 'yes' : 'no'}`);
    lines.push(`- Blocks observed: ${report.session.blocksObserved} · Exact approvals: ${report.session.exactApprovals} · Neighbor contained: ${report.session.neighborContained == null ? 'n/a' : report.session.neighborContained ? 'yes' : 'no'}`);
    lines.push(`- Finish verdict: ${report.session.finishVerdict ?? 'n/a'}`);
    lines.push(`- Where it helped: ${report.session.helps.map((h) => `${h.label} (${h.count})`).join('; ') || 'none recorded'}`);
    lines.push(`- Incorrect blocks (false positives): ${report.session.falseBlocks
        .map((b) => `${b.label} (${b.count}) [${b.pathGlobs.join(', ') || 'no globs'}]`)
        .join('; ') || 'none recorded'}`);
    lines.push(`- Developer friction: ${report.session.friction.map((f) => `${f.label} [${f.severity}] (${f.count})`).join('; ') || 'none recorded'}`);
    lines.push('');
    lines.push('## Evidence artifacts (source-free pointers)');
    lines.push('');
    lines.push(`- Pilot evidence pack: ${report.artifacts.pilotEvidencePack.relativePath ?? 'none'} (hash ${report.artifacts.pilotEvidencePack.contentHash ?? 'n/a'}, ${report.artifacts.pilotEvidencePack.sessionCount ?? 'n/a'} session(s))`);
    lines.push(`- Brain readiness: ${report.artifacts.brainReadiness.relativePath ?? 'none'} (hash ${report.artifacts.brainReadiness.contentHash ?? 'n/a'})`);
    lines.push(`- Runtime risk doctor: ${report.artifacts.runtimeRiskDoctor.relativePath ?? 'none'} (verdict ${report.artifacts.runtimeRiskDoctor.verdict ?? 'n/a'}, ${report.artifacts.runtimeRiskDoctor.classifiedPaths ?? 'n/a'} classified path(s))`);
    lines.push(`- AI Change Records: ${report.artifacts.aiChangeRecords ?? 'n/a'}`);
    lines.push('');
    lines.push('## Durations');
    lines.push('');
    lines.push(`- Total: ${formatMs(report.durations.totalMs)} · Clone: ${formatMs(report.durations.cloneMs)} · Index: ${formatMs(report.durations.indexMs)} · Session: ${formatMs(report.durations.sessionMs)}`);
    lines.push('');
    lines.push('## What this proves');
    lines.push('');
    for (const item of report.whatThisProves)
        lines.push(`- ${item}`);
    lines.push('');
    lines.push('## What this does NOT prove');
    lines.push('');
    for (const item of report.whatThisDoesNotProve)
        lines.push(`- ${item}`);
    lines.push('');
    lines.push('## Limitations');
    lines.push('');
    for (const item of report.limitations)
        lines.push(`- ${item}`);
    lines.push('');
    lines.push('## Commands that were run');
    lines.push('');
    lines.push('```');
    for (const cmd of report.commandsRun)
        lines.push(cmd);
    lines.push('```');
    lines.push('');
    lines.push(`_Source-free: slugs, public OSS identities, paths, owners, counts, hashes, verdicts, and durations only. Excludes: ${report.privacy.excludes.join(', ')}._`);
    lines.push('');
    return lines.join('\n');
}
//# sourceMappingURL=enterprise-dogfood-report.js.map