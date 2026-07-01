"use strict";
/**
 * Pilot Evidence Pack — pure builders (Iteration 10).
 *
 * After a pilot, a founder needs to hand engineering managers, principal
 * engineers, security reviewers, and procurement/IT a single, shareable packet
 * that explains what the Neurcode runtime control plane actually did — without a
 * live walkthrough and without leaking a single line of source.
 *
 * This module is the source-free, deterministic core. It takes already-parsed,
 * source-free inputs (extracted by the thin `neurcode pilot export` command from
 * `.neurcode/sessions/*.change-record.json`, `.neurcode/admission/*.json`, and
 * `.neurcode/pilot-metrics.json`) and turns them into:
 *
 *   1. {@link buildPilotEvidencePack} — a machine-readable manifest
 *      (`neurcode.pilot-evidence-pack.v1`).
 *   2. {@link renderPilotEvidencePackMarkdown} / {@link renderPilotEvidencePackHtml}
 *      — the human-readable executive packet.
 *
 * Hard rules (shared with utils/enterprise-eval-report.ts + utils/guided-eval.ts):
 *   - Source-free. Only paths, owners, symbol names, counts, verdicts, hashes,
 *     and tier labels are read or emitted. We NEVER copy source, diffs, patch
 *     bodies, raw prompts, secrets, or the admission record's natural-language
 *     `intentSummary` / `goal` prose — intent is represented by its hash and
 *     categories only. {@link assertPilotEvidencePackSourceFree} is the backstop.
 *   - Honest tiers. Deterministic path/approval/hash facts are separated from
 *     advisory inference; trust posture is reported truthfully (self-attested vs
 *     backend-signed) and never overclaims enforcement.
 *   - Deterministic. {@link computePilotEvidencePackHash} excludes wall-clock
 *     timestamps so the same input yields the same `contentHash`.
 *
 * Everything here is pure (no filesystem or network I/O).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FORBIDDEN_PROSE_KEYS = exports.PILOT_EVIDENCE_PACK_SCHEMA_VERSION = void 0;
exports.classifyRiskFamily = classifyRiskFamily;
exports.isDependencyManifest = isDependencyManifest;
exports.buildPilotEvidencePack = buildPilotEvidencePack;
exports.computePilotEvidencePackHash = computePilotEvidencePackHash;
exports.assertPilotEvidencePackSourceFree = assertPilotEvidencePackSourceFree;
exports.renderPilotEvidencePackMarkdown = renderPilotEvidencePackMarkdown;
exports.renderPilotEvidencePackHtml = renderPilotEvidencePackHtml;
const node_crypto_1 = require("node:crypto");
const telemetry_1 = require("@neurcode-ai/telemetry");
const enterprise_eval_report_1 = require("./enterprise-eval-report");
exports.PILOT_EVIDENCE_PACK_SCHEMA_VERSION = 'neurcode.pilot-evidence-pack.v1';
/**
 * Keys that would carry intent/prompt/task prose. The pilot evidence pack is
 * stricter than the admission record: even though the admission record's
 * `intentSummary` passes the project's source-free gate (it is intent, not
 * source), an executive packet for a security reviewer must not echo task text.
 * Mirror this set in scripts/source-free-leak-scan.mjs (SOURCE_LIKE_KEYS).
 */
exports.FORBIDDEN_PROSE_KEYS = new Set([
    'intentSummary',
    'intentText',
    'taskText',
    'goalText',
    'rawPrompt',
    'prompt',
    'rawChat',
    'chat',
    'planProse',
    'commandBody',
]);
const PACK_EXCLUDES = [
    'source code',
    'diff hunks',
    'patch bodies',
    'raw prompts',
    'raw chat',
    'natural-language intent / task text',
    'secrets',
    'private file contents',
];
// ── Classifiers ───────────────────────────────────────────────────────────────
const RISK_FAMILY_RULES = [
    { family: 'billing_payments', test: /billing|payment|charge|invoice|subscription|refund|stripe/i },
    { family: 'auth_identity_secrets', test: /\bauth\b|login|session|credential|secret|token|password|oauth|sso|\bkey(s)?\b|vault/i },
    { family: 'database_migrations', test: /migration|\bdb\b|database|schema|\bsql\b/i },
    { family: 'infrastructure', test: /terraform|infra|deploy|k8s|kubernetes|helm|docker|ansible|cloudformation|\.tf\b/i },
    { family: 'ci_release', test: /\.github|workflow|pipeline|\bci\b|release|publish/i },
    { family: 'security', test: /security|crypto|permission|rbac|policy/i },
];
/** Map a coarse glob / path to a stable risk-family bucket. Source-free. */
function classifyRiskFamily(surface) {
    for (const rule of RISK_FAMILY_RULES) {
        if (rule.test.test(surface))
            return rule.family;
    }
    return 'other_protected';
}
const DEPENDENCY_MANIFEST_BASENAMES = new Set([
    'package.json',
    'package-lock.json',
    'npm-shrinkwrap.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'requirements.txt',
    'pipfile',
    'pipfile.lock',
    'poetry.lock',
    'pyproject.toml',
    'go.mod',
    'go.sum',
    'cargo.toml',
    'cargo.lock',
    'gemfile',
    'gemfile.lock',
    'build.gradle',
    'build.gradle.kts',
    'pom.xml',
    'composer.json',
    'composer.lock',
]);
function basename(path) {
    const parts = path.split('/');
    return (parts[parts.length - 1] || path).toLowerCase();
}
/** True when a repo-relative path is a recognized dependency manifest / lockfile. */
function isDependencyManifest(path) {
    return DEPENDENCY_MANIFEST_BASENAMES.has(basename(path));
}
// ── Builder ───────────────────────────────────────────────────────────────────
function normalizeTrust(level) {
    if (!level)
        return 'other';
    const l = level.toLowerCase();
    if (l.includes('backend_signed') || l === 'backend_signed')
        return 'backendSigned';
    if (l.includes('self_attested') || l === 'self_attested' || l === 'self-attested')
        return 'selfAttested';
    return 'other';
}
function uniqueSorted(values) {
    return Array.from(new Set(values)).sort();
}
/**
 * Build the source-free pilot evidence pack from already-parsed inputs. The
 * returned object carries a stable {@link PilotEvidencePack.contentHash}; the
 * caller should still run {@link assertPilotEvidencePackSourceFree} before
 * writing or printing (defense in depth — the harness asserts the same).
 */
function buildPilotEvidencePack(input) {
    const sessions = [...input.sessions].sort((a, b) => a.sessionId.localeCompare(b.sessionId));
    const admissions = [...input.admissions].sort((a, b) => a.sessionId.localeCompare(b.sessionId));
    const admissionBySession = new Map(admissions.map((a) => [a.sessionId, a]));
    // Completeness.
    const missingArtifacts = [];
    if (sessions.length === 0)
        missingArtifacts.push('session change-records (.neurcode/sessions/*.change-record.json)');
    if (admissions.length === 0)
        missingArtifacts.push('admission records (.neurcode/admission/*.json)');
    if (!input.metrics)
        missingArtifacts.push('pilot metrics rollup (.neurcode/pilot-metrics.json)');
    const completenessNotes = [];
    if (!input.brainReadiness) {
        completenessNotes.push('Repository brain readiness was not included (run `neurcode brain readiness` to add structural coverage).');
    }
    completenessNotes.push('Runtime Safety Kernel plan-drift fields are surfaced from exported records, not persisted change-records; plan activity below is derived from session plan events and amendments.');
    let status;
    if (sessions.length === 0 && admissions.length === 0)
        status = 'empty';
    else if (sessions.length > 0 && admissions.length > 0 && input.metrics)
        status = 'complete';
    else
        status = 'partial';
    // Verdict + trust distribution.
    const verdictCounts = {};
    for (const s of sessions) {
        const v = s.verdict || 'unrecorded';
        verdictCounts[v] = (verdictCounts[v] ?? 0) + 1;
    }
    const trustPosture = { selfAttested: 0, backendSigned: 0, other: 0 };
    for (const s of sessions)
        trustPosture[normalizeTrust(s.trustLevel)] += 1;
    for (const a of admissions) {
        if (sessions.some((s) => s.sessionId === a.sessionId))
            continue; // avoid double counting
        trustPosture[normalizeTrust(a.trustLevel)] += 1;
    }
    // Risk families (from admission surfaces + session blocked boundaries).
    const familySurfaces = new Map();
    const addSurface = (surface) => {
        if (!surface)
            return;
        const family = classifyRiskFamily(surface);
        if (!familySurfaces.has(family))
            familySurfaces.set(family, new Set());
        familySurfaces.get(family).add(surface);
    };
    for (const a of admissions) {
        for (const p of a.paths.approvalRequiredSurfaces)
            addSurface(p);
        for (const p of a.paths.blocked)
            addSurface(p);
        for (const p of a.paths.denied)
            addSurface(p);
    }
    for (const s of sessions)
        for (const p of s.blockedBoundaries)
            addSurface(p);
    const blockedRiskFamilies = Array.from(familySurfaces.entries())
        .map(([family, set]) => ({
        family,
        surfaceCount: set.size,
        sampleSurfaces: uniqueSorted(Array.from(set)).slice(0, 5),
    }))
        .sort((a, b) => b.surfaceCount - a.surfaceCount || a.family.localeCompare(b.family));
    // Approvals.
    const approvedExactFromSessions = sessions.reduce((n, s) => n + s.approvals.approvedExactPathCount, 0);
    const approvedExactFromAdmissions = admissions.reduce((n, a) => n + a.counts.approvedExactPaths, 0);
    const approvals = {
        sessionsRequiringApproval: sessions.filter((s) => s.approvals.approvalRequired).length,
        exactPathOnlySessions: sessions.filter((s) => s.approvals.exactPathApprovalOnly).length,
        approvedExactPathTotal: approvedExactFromSessions > 0 ? approvedExactFromSessions : approvedExactFromAdmissions,
        neighborDenyObservedSessions: sessions.filter((s) => s.approvals.neighborSensitiveBlocked).length,
        blockedPathTotal: admissions.reduce((n, a) => n + a.counts.blockedPaths, 0),
        deniedPathTotal: admissions.reduce((n, a) => n + a.counts.deniedPaths, 0),
    };
    // Plan drift (derived honestly from persisted plan activity).
    const planEventTotal = sessions.reduce((n, s) => n + s.counts.planEvents, 0);
    const pendingAmendmentTotal = sessions.reduce((n, s) => n + s.plan.pendingAmendmentCount, 0);
    const planTimelineTotal = sessions.reduce((n, s) => n + s.plan.timelineCount, 0);
    const sessionsWithPlanActivity = sessions.filter((s) => s.counts.planEvents > 0 || s.plan.timelineCount > 0 || s.plan.pendingAmendmentCount > 0).length;
    const planDrift = {
        planEventTotal,
        pendingAmendmentTotal,
        planTimelineTotal,
        sessionsWithPlanActivity,
        note: sessionsWithPlanActivity === 0
            ? 'No plan revisions or pending amendments were recorded across the pilot sessions.'
            : `${sessionsWithPlanActivity} session(s) recorded plan activity (events/timeline/amendments). Definitive plan-drift verdicts require the Runtime Safety Kernel surface on exported records.`,
    };
    // Dependency changes (governed counts + object hashes, never contents).
    const depFiles = new Map();
    for (const a of admissions) {
        for (const entry of a.manifest.delta) {
            if (!isDependencyManifest(entry.path))
                continue;
            const objectHash = entry.newObjectId ?? entry.oldObjectId ?? null;
            depFiles.set(`${entry.path}::${objectHash ?? ''}`, {
                path: entry.path,
                changeType: entry.changeType,
                objectHash,
            });
        }
    }
    const dependencyFiles = Array.from(depFiles.values()).sort((a, b) => a.path.localeCompare(b.path));
    const dependencyChanges = {
        governedChangeCount: dependencyFiles.length,
        files: dependencyFiles,
        note: 'Counts and git object hashes for dependency manifests / lockfiles only — file contents are never included.',
    };
    // Evidence hashes (join session record hashes with admission manifest hashes).
    const evidenceHashes = sessions.map((s) => {
        const a = admissionBySession.get(s.sessionId);
        return {
            sessionId: s.sessionId,
            recordHash: s.hashes.recordHash,
            replayHash: s.hashes.replayHash ?? a?.integrity.replayHash ?? null,
            deltaHash: a?.manifest.deltaHash ?? null,
            coverageSetHash: a?.manifest.coverageSetHash ?? null,
        };
    });
    // Admission-only sessions (no matching change-record) still contribute hashes.
    for (const a of admissions) {
        if (sessions.some((s) => s.sessionId === a.sessionId))
            continue;
        evidenceHashes.push({
            sessionId: a.sessionId,
            recordHash: null,
            replayHash: a.integrity.replayHash,
            deltaHash: a.manifest.deltaHash,
            coverageSetHash: a.manifest.coverageSetHash,
        });
    }
    evidenceHashes.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
    const governedEditChecks = sessions.reduce((n, s) => n + s.counts.events, 0);
    // Summary headline.
    const headline = status === 'empty'
        ? 'No governed pilot sessions were recorded yet — run a governed session, then re-export.'
        : `${sessions.length} governed session(s), ${blockedRiskFamilies.length} blocked risk family(ies), ${approvals.approvedExactPathTotal} exact-path approval(s); ${trustPosture.backendSigned} backend-signed / ${trustPosture.selfAttested} self-attested; source-free.`;
    const summary = {
        sessionCount: sessions.length,
        admissionRecordCount: admissions.length,
        verdictCounts,
        governedEditChecks,
        blockedPathTotal: approvals.blockedPathTotal,
        deniedPathTotal: approvals.deniedPathTotal,
        approvedExactPathTotal: approvals.approvedExactPathTotal,
        riskFamilyCount: blockedRiskFamilies.length,
        dependencyChangeCount: dependencyChanges.governedChangeCount,
        trustPosture,
        headline,
    };
    // What stayed local.
    const allSourceFree = admissions.length === 0 || admissions.every((a) => a.integrity.sourceFree);
    const whatStayedLocal = {
        statement: 'Source code never left this machine. This pack aggregates source-free facts (paths, owners, counts, verdicts, and hashes) computed locally by the Neurcode runtime control plane.',
        facts: [
            `${admissions.length} admission record(s) report sourceFree=${allSourceFree ? 'true' : 'mixed'}.`,
            'No source code, diffs, patch bodies, raw prompts, chat, or secrets are included.',
            'Natural-language task / intent text is represented only by its hash and categories.',
            `Evidence trust posture: ${trustPosture.backendSigned} backend-signed, ${trustPosture.selfAttested} self-attested${trustPosture.other ? `, ${trustPosture.other} other` : ''}.`,
        ],
    };
    // Limitations (honest, audience-aware).
    const limitations = [
        'Neurcode is a runtime control plane for AI coding agents — it is not an AppSec/SAST scanner or a code-review bot. This pack does not prove the source code is correct, secure, or free of vulnerabilities.',
        'Deterministic facts (paths, approvals, counts, hashes) are separated from advisory inference (reuse / architecture signals), which can produce false positives.',
    ];
    if (trustPosture.selfAttested > 0) {
        limitations.push('Self-attested records are honest local claims that a governed session produced these effects — not cryptographic proof. Configure the backend signing key to upgrade to verifiable receipts.');
    }
    if (!input.metrics) {
        limitations.push('No local pilot-metrics rollup was found, so verify-run / pass-rate trends are omitted.');
    }
    if (status !== 'complete') {
        limitations.push(`This is an INCOMPLETE pilot export (completeness: ${status}). Missing: ${missingArtifacts.join('; ') || 'none'}.`);
    }
    const truthTiers = {
        deterministic: [
            'Session counts, ids, statuses, and verdicts',
            'Blocked / denied path counts and approval-required surfaces',
            'Exact-path approval and neighbor-deny facts',
            'Dependency manifest change counts and git object hashes',
            'Evidence hashes (record / replay / delta / coverage-set)',
        ],
        advisory: [
            'Risk-family bucketing of protected surfaces (keyword classification)',
            'Reuse advisory counts (structural fingerprints, not semantic proof)',
            'Plan-activity signals (events / amendments) as a drift proxy',
        ],
    };
    const packWithoutHash = {
        schemaVersion: exports.PILOT_EVIDENCE_PACK_SCHEMA_VERSION,
        generatedAt: input.generatedAt,
        contentHash: '',
        cli: { version: input.cliVersion },
        repo: { rootHash: input.repoRootHash, name: input.repoName },
        completeness: { status, missingArtifacts, notes: completenessNotes },
        summary,
        sessions: sessions.map((s) => ({
            sessionId: s.sessionId,
            status: s.status,
            verdict: s.verdict,
            scopeMode: s.scopeMode,
            trustLevel: s.trustLevel,
            intentHash: s.intentHash,
            intentCategories: s.intentCategories,
            counts: s.counts,
            approvedExactPathCount: s.approvals.approvedExactPathCount,
            neighborSensitiveBlocked: s.approvals.neighborSensitiveBlocked,
            planEvents: s.counts.planEvents,
            pendingAmendments: s.plan.pendingAmendmentCount,
            reuseAdvisoryCount: s.reuseAdvisoryCount,
        })),
        blockedRiskFamilies,
        approvals,
        planDrift,
        dependencyChanges,
        evidenceHashes,
        brainReadiness: input.brainReadiness ?? null,
        metrics: input.metrics,
        whatStayedLocal,
        limitations,
        truthTiers,
        privacy: { sourceFree: true, excludes: PACK_EXCLUDES },
    };
    return { ...packWithoutHash, contentHash: computePilotEvidencePackHash(packWithoutHash) };
}
/**
 * Compute the stable content hash of a pack: sha256 over the sorted-key
 * serialization with `generatedAt` (and the hash field itself) removed, so the
 * same input always yields the same hash regardless of generation time.
 */
function computePilotEvidencePackHash(pack) {
    const clone = JSON.parse(JSON.stringify(pack));
    delete clone.generatedAt;
    delete clone.contentHash;
    return (0, node_crypto_1.createHash)('sha256').update((0, telemetry_1.stableStringify)(clone)).digest('hex');
}
// ── Source-free backstop ──────────────────────────────────────────────────────
function scanForbiddenKeys(value, path, found) {
    if (Array.isArray(value)) {
        value.forEach((item, i) => scanForbiddenKeys(item, `${path}[${i}]`, found));
        return;
    }
    if (!value || typeof value !== 'object')
        return;
    for (const [key, child] of Object.entries(value)) {
        if (exports.FORBIDDEN_PROSE_KEYS.has(key))
            found.push(`${path}.${key}`);
        scanForbiddenKeys(child, `${path}.${key}`, found);
    }
}
/**
 * Throw if a would-be pilot evidence artifact carries source/diff/secret shapes
 * (delegated to the shared enterprise-eval scan) or any prose-intent key.
 */
function assertPilotEvidencePackSourceFree(value, label = 'pilot evidence pack') {
    (0, enterprise_eval_report_1.assertEnterpriseEvalSourceFree)(value, label);
    const found = [];
    scanForbiddenKeys(value, 'root', found);
    if (found.length > 0) {
        throw new Error(`${label} failed source-free scan: forbidden prose key(s) ${found.join(', ')}`);
    }
}
// ── Renderers ─────────────────────────────────────────────────────────────────
function pct(value) {
    return `${Math.round(value * 100)}%`;
}
function renderPilotEvidencePackMarkdown(pack) {
    const lines = [];
    lines.push('# Neurcode Pilot Evidence Pack');
    lines.push('');
    lines.push(`Generated: ${pack.generatedAt}`);
    lines.push(`Repository: ${pack.repo.name ?? 'n/a'} (root hash ${pack.repo.rootHash ?? 'n/a'} — no source)`);
    lines.push(`CLI: ${pack.cli.version ?? 'n/a'} · Schema: ${pack.schemaVersion} · Content hash: ${pack.contentHash}`);
    lines.push(`Completeness: ${pack.completeness.status.toUpperCase()}`);
    lines.push('');
    lines.push('_Audience: engineering manager, principal engineer, security reviewer, procurement/IT. Source-free by construction._');
    lines.push('');
    lines.push('## Pilot summary');
    lines.push('');
    lines.push(`- ${pack.summary.headline}`);
    lines.push(`- Governed sessions: ${pack.summary.sessionCount} · admission records: ${pack.summary.admissionRecordCount}`);
    lines.push(`- Governed edit checks: ${pack.summary.governedEditChecks}`);
    lines.push(`- Blocked paths: ${pack.summary.blockedPathTotal} · denied paths: ${pack.summary.deniedPathTotal} · exact-path approvals: ${pack.summary.approvedExactPathTotal}`);
    lines.push(`- Blocked risk families: ${pack.summary.riskFamilyCount} · governed dependency changes: ${pack.summary.dependencyChangeCount}`);
    const vc = Object.entries(pack.summary.verdictCounts);
    lines.push(`- Verdicts: ${vc.length ? vc.map(([v, n]) => `${v}: ${n}`).join(', ') : 'none recorded'}`);
    lines.push('');
    lines.push('## Sessions');
    lines.push('');
    if (pack.sessions.length === 0) {
        lines.push('_No governed sessions recorded._');
    }
    else {
        lines.push('| Session | Status | Verdict | Scope | Trust | Checks | Approvals | Plan events |');
        lines.push('|---|---|---|---|---|---|---|---|');
        for (const s of pack.sessions) {
            lines.push(`| ${s.sessionId} | ${s.status ?? '—'} | ${s.verdict ?? '—'} | ${s.scopeMode ?? '—'} | ${s.trustLevel ?? '—'} | ${s.counts.events} | ${s.approvedExactPathCount} exact${s.neighborSensitiveBlocked ? ' · neighbor-deny' : ''} | ${s.planEvents} |`);
        }
    }
    lines.push('');
    lines.push('## Blocked risk families');
    lines.push('');
    lines.push('_Protected surfaces that required approval or were blocked, bucketed by family (advisory classification of coarse, source-free globs)._');
    lines.push('');
    if (pack.blockedRiskFamilies.length === 0) {
        lines.push('_No blocked or approval-required surfaces recorded._');
    }
    else {
        lines.push('| Risk family | Surfaces | Examples |');
        lines.push('|---|---|---|');
        for (const f of pack.blockedRiskFamilies) {
            lines.push(`| ${f.family} | ${f.surfaceCount} | ${f.sampleSurfaces.join(', ') || '—'} |`);
        }
    }
    lines.push('');
    lines.push('## Approvals');
    lines.push('');
    lines.push(`- Sessions requiring approval: ${pack.approvals.sessionsRequiringApproval}`);
    lines.push(`- Exact-path-only approval sessions: ${pack.approvals.exactPathOnlySessions}`);
    lines.push(`- Exact paths approved (total): ${pack.approvals.approvedExactPathTotal}`);
    lines.push(`- Sessions where a neighbor stayed blocked after approval: ${pack.approvals.neighborDenyObservedSessions}`);
    lines.push(`- Blocked paths: ${pack.approvals.blockedPathTotal} · denied paths: ${pack.approvals.deniedPathTotal}`);
    lines.push('');
    lines.push('## Plan drift');
    lines.push('');
    lines.push(`- Plan events: ${pack.planDrift.planEventTotal} · timeline entries: ${pack.planDrift.planTimelineTotal} · pending amendments: ${pack.planDrift.pendingAmendmentTotal}`);
    lines.push(`- Sessions with plan activity: ${pack.planDrift.sessionsWithPlanActivity}`);
    lines.push(`- ${pack.planDrift.note}`);
    lines.push('');
    lines.push('## Dependency changes');
    lines.push('');
    lines.push(`_${pack.dependencyChanges.note}_`);
    lines.push('');
    if (pack.dependencyChanges.files.length === 0) {
        lines.push('_No governed dependency-manifest changes recorded._');
    }
    else {
        lines.push('| Manifest | Change | Object hash |');
        lines.push('|---|---|---|');
        for (const f of pack.dependencyChanges.files) {
            lines.push(`| ${f.path} | ${f.changeType} | ${f.objectHash ?? '—'} |`);
        }
    }
    lines.push('');
    lines.push('## Evidence hashes');
    lines.push('');
    if (pack.evidenceHashes.length === 0) {
        lines.push('_No evidence hashes recorded._');
    }
    else {
        lines.push('| Session | Record hash | Replay hash | Delta hash | Coverage-set hash |');
        lines.push('|---|---|---|---|---|');
        for (const h of pack.evidenceHashes) {
            lines.push(`| ${h.sessionId} | ${h.recordHash ?? '—'} | ${h.replayHash ?? '—'} | ${h.deltaHash ?? '—'} | ${h.coverageSetHash ?? '—'} |`);
        }
    }
    lines.push('');
    if (pack.metrics) {
        lines.push('## Local governance metrics');
        lines.push('');
        lines.push(`- Window: ${pack.metrics.periodDays} day(s) · verify runs: ${pack.metrics.totalVerifyRuns}`);
        lines.push(`- Blocking caught: ${pack.metrics.totalBlockingCaught} (AST-verified: ${pack.metrics.totalStructuralCaught})`);
        lines.push(`- Pass rate: ${pct(pack.metrics.averagePassRate)} · suppression rate: ${pct(pack.metrics.suppressionRate)} · AI debt trend: ${pack.metrics.aiDebtTrend}`);
        lines.push('');
    }
    lines.push('## What stayed local');
    lines.push('');
    lines.push(`- ${pack.whatStayedLocal.statement}`);
    for (const f of pack.whatStayedLocal.facts)
        lines.push(`- ${f}`);
    lines.push('');
    lines.push('## Limitations & completeness');
    lines.push('');
    for (const l of pack.limitations)
        lines.push(`- ${l}`);
    if (pack.completeness.missingArtifacts.length > 0) {
        lines.push(`- Missing artifacts: ${pack.completeness.missingArtifacts.join('; ')}`);
    }
    for (const n of pack.completeness.notes)
        lines.push(`- ${n}`);
    lines.push('');
    lines.push(`_Source-free: paths, owners, counts, verdicts, and hashes only. Excludes: ${pack.privacy.excludes.join(', ')}._`);
    lines.push('');
    return lines.join('\n');
}
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function renderPilotEvidencePackHtml(pack) {
    const esc = escapeHtml;
    const rows = (headers, data) => {
        const head = `<tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`;
        const body = data.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
        return `<table>${head}${body}</table>`;
    };
    const ul = (items) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    const parts = [];
    parts.push('<!doctype html>');
    parts.push('<html lang="en"><head><meta charset="utf-8">');
    parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
    parts.push('<title>Neurcode Pilot Evidence Pack</title>');
    parts.push('<style>body{font:15px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:920px;margin:2rem auto;padding:0 1rem;color:#1a1a1a}h1{margin-bottom:.25rem}h2{margin-top:2rem;border-bottom:1px solid #e2e2e2;padding-bottom:.25rem}table{border-collapse:collapse;width:100%;margin:.5rem 0;font-size:14px}th,td{border:1px solid #d9d9d9;padding:.35rem .5rem;text-align:left}th{background:#f4f4f5}code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.meta{color:#555;font-size:13px}.note{color:#555;font-style:italic}.tag{display:inline-block;background:#eef;border-radius:4px;padding:0 .4rem;font-size:12px}</style>');
    parts.push('</head><body>');
    parts.push('<h1>Neurcode Pilot Evidence Pack</h1>');
    parts.push(`<p class="meta">Generated: ${esc(pack.generatedAt)}<br>`);
    parts.push(`Repository: ${esc(pack.repo.name ?? 'n/a')} (root hash <span class="mono">${esc(pack.repo.rootHash ?? 'n/a')}</span> — no source)<br>`);
    parts.push(`CLI: ${esc(pack.cli.version ?? 'n/a')} · Schema: <span class="mono">${esc(pack.schemaVersion)}</span> · Content hash: <span class="mono">${esc(pack.contentHash)}</span><br>`);
    parts.push(`Completeness: <span class="tag">${esc(pack.completeness.status.toUpperCase())}</span></p>`);
    parts.push('<p class="note">Audience: engineering manager, principal engineer, security reviewer, procurement/IT. Source-free by construction.</p>');
    parts.push('<h2>Pilot summary</h2>');
    parts.push(ul([
        pack.summary.headline,
        `Governed sessions: ${pack.summary.sessionCount} · admission records: ${pack.summary.admissionRecordCount}`,
        `Governed edit checks: ${pack.summary.governedEditChecks}`,
        `Blocked paths: ${pack.summary.blockedPathTotal} · denied paths: ${pack.summary.deniedPathTotal} · exact-path approvals: ${pack.summary.approvedExactPathTotal}`,
        `Blocked risk families: ${pack.summary.riskFamilyCount} · governed dependency changes: ${pack.summary.dependencyChangeCount}`,
    ]));
    parts.push('<h2>Sessions</h2>');
    parts.push(pack.sessions.length === 0
        ? '<p class="note">No governed sessions recorded.</p>'
        : rows(['Session', 'Status', 'Verdict', 'Scope', 'Trust', 'Checks', 'Exact approvals', 'Plan events'], pack.sessions.map((s) => [
            s.sessionId,
            s.status ?? '—',
            s.verdict ?? '—',
            s.scopeMode ?? '—',
            s.trustLevel ?? '—',
            String(s.counts.events),
            `${s.approvedExactPathCount}${s.neighborSensitiveBlocked ? ' (neighbor-deny)' : ''}`,
            String(s.planEvents),
        ])));
    parts.push('<h2>Blocked risk families</h2>');
    parts.push(pack.blockedRiskFamilies.length === 0
        ? '<p class="note">No blocked or approval-required surfaces recorded.</p>'
        : rows(['Risk family', 'Surfaces', 'Examples'], pack.blockedRiskFamilies.map((f) => [f.family, String(f.surfaceCount), f.sampleSurfaces.join(', ') || '—'])));
    parts.push('<h2>Approvals</h2>');
    parts.push(ul([
        `Sessions requiring approval: ${pack.approvals.sessionsRequiringApproval}`,
        `Exact-path-only approval sessions: ${pack.approvals.exactPathOnlySessions}`,
        `Exact paths approved (total): ${pack.approvals.approvedExactPathTotal}`,
        `Sessions where a neighbor stayed blocked after approval: ${pack.approvals.neighborDenyObservedSessions}`,
        `Blocked paths: ${pack.approvals.blockedPathTotal} · denied paths: ${pack.approvals.deniedPathTotal}`,
    ]));
    parts.push('<h2>Plan drift</h2>');
    parts.push(ul([
        `Plan events: ${pack.planDrift.planEventTotal} · timeline entries: ${pack.planDrift.planTimelineTotal} · pending amendments: ${pack.planDrift.pendingAmendmentTotal}`,
        `Sessions with plan activity: ${pack.planDrift.sessionsWithPlanActivity}`,
        pack.planDrift.note,
    ]));
    parts.push('<h2>Dependency changes</h2>');
    parts.push(`<p class="note">${esc(pack.dependencyChanges.note)}</p>`);
    parts.push(pack.dependencyChanges.files.length === 0
        ? '<p class="note">No governed dependency-manifest changes recorded.</p>'
        : rows(['Manifest', 'Change', 'Object hash'], pack.dependencyChanges.files.map((f) => [f.path, f.changeType, f.objectHash ?? '—'])));
    parts.push('<h2>Evidence hashes</h2>');
    parts.push(pack.evidenceHashes.length === 0
        ? '<p class="note">No evidence hashes recorded.</p>'
        : rows(['Session', 'Record hash', 'Replay hash', 'Delta hash', 'Coverage-set hash'], pack.evidenceHashes.map((h) => [h.sessionId, h.recordHash ?? '—', h.replayHash ?? '—', h.deltaHash ?? '—', h.coverageSetHash ?? '—'])));
    if (pack.metrics) {
        parts.push('<h2>Local governance metrics</h2>');
        parts.push(ul([
            `Window: ${pack.metrics.periodDays} day(s) · verify runs: ${pack.metrics.totalVerifyRuns}`,
            `Blocking caught: ${pack.metrics.totalBlockingCaught} (AST-verified: ${pack.metrics.totalStructuralCaught})`,
            `Pass rate: ${pct(pack.metrics.averagePassRate)} · suppression rate: ${pct(pack.metrics.suppressionRate)} · AI debt trend: ${pack.metrics.aiDebtTrend}`,
        ]));
    }
    parts.push('<h2>What stayed local</h2>');
    parts.push(ul([pack.whatStayedLocal.statement, ...pack.whatStayedLocal.facts]));
    parts.push('<h2>Limitations &amp; completeness</h2>');
    const limitationItems = [...pack.limitations];
    if (pack.completeness.missingArtifacts.length > 0) {
        limitationItems.push(`Missing artifacts: ${pack.completeness.missingArtifacts.join('; ')}`);
    }
    limitationItems.push(...pack.completeness.notes);
    parts.push(ul(limitationItems));
    parts.push(`<p class="note">Source-free: paths, owners, counts, verdicts, and hashes only. Excludes: ${esc(pack.privacy.excludes.join(', '))}.</p>`);
    parts.push('</body></html>');
    return parts.join('\n');
}
//# sourceMappingURL=pilot-evidence-pack.js.map