"use strict";
/**
 * Enterprise evaluator report + dashboard summary — pure builders.
 *
 * The `neurcode eval demo` runner (utils/eval-demo.ts) drives a complete, safe,
 * local governance loop against a throwaway fixture and gathers a single
 * source-free facts object: {@link EvalDemoFacts}. This module turns that facts
 * object into the two shareable artifacts a first-time enterprise evaluator
 * needs:
 *
 *   1. {@link buildEnterpriseEvalReport} / {@link renderEnterpriseEvalReportMarkdown}
 *      — a polished, source-free report an engineering manager can read. It is
 *      deliberately honest: deterministic path/symbol/graph/policy facts are
 *      separated from advisory inference, and the trust posture never claims
 *      public-key signing when only an HMAC backend receipt (or self-attested
 *      local record) exists.
 *
 *   2. {@link buildEvalDemoSummary} — a compact machine-readable JSON the hosted
 *      dashboard can import (paste / upload). It carries completion status,
 *      pass/fail checkpoints, the boundary/approval/neighbor facts, the trust
 *      posture, the recommended next command, and a design-partner-pilot verdict.
 *
 * Everything here is pure (no I/O) and source-free. The orchestration engine
 * runs {@link assertEnterpriseEvalSourceFree} over the rendered artifacts before
 * anything is written, and the harness/tests assert the same contract.
 *
 * Keep the truth tiers and step ids in lockstep with utils/guided-eval.ts and
 * the dashboard mirrors (web/dashboard/src/lib/guidedEval.ts + evalDemoImport.ts).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CORE_CHECKPOINT_IDS = exports.ENTERPRISE_EVAL_REPORT_SCHEMA_VERSION = exports.EVAL_DEMO_SUMMARY_SCHEMA_VERSION = void 0;
exports.deriveVerdict = deriveVerdict;
exports.buildEnterpriseEvalReport = buildEnterpriseEvalReport;
exports.renderEnterpriseEvalReportMarkdown = renderEnterpriseEvalReportMarkdown;
exports.buildEvalDemoSummary = buildEvalDemoSummary;
exports.assertEnterpriseEvalSourceFree = assertEnterpriseEvalSourceFree;
const guided_eval_1 = require("./guided-eval");
exports.EVAL_DEMO_SUMMARY_SCHEMA_VERSION = 'neurcode.eval-demo-summary.v1';
exports.ENTERPRISE_EVAL_REPORT_SCHEMA_VERSION = 'neurcode.enterprise-eval-report.v1';
/** The deterministic core loop that must hold for the demo to be meaningful. */
exports.CORE_CHECKPOINT_IDS = [
    'safe_edit_allowed',
    'boundary_block',
    'exact_approval',
    'approved_path_allowed',
    'neighbor_contained',
    'ai_change_record',
];
function deriveVerdict(checkpoints, facts) {
    const byId = new Map(checkpoints.map((c) => [c.id, c]));
    const corePassed = exports.CORE_CHECKPOINT_IDS.every((id) => byId.get(id)?.status === 'pass');
    const criticalFailures = checkpoints.filter((c) => c.critical && c.status === 'fail');
    const reasons = [];
    if (!corePassed || criticalFailures.length > 0) {
        const failed = [
            ...exports.CORE_CHECKPOINT_IDS.filter((id) => byId.get(id)?.status !== 'pass'),
            ...criticalFailures.map((c) => c.id).filter((id) => !exports.CORE_CHECKPOINT_IDS.includes(id)),
        ];
        reasons.push(`Core governance loop did not fully hold: ${Array.from(new Set(failed)).join(', ')}.`);
        return {
            founderDemo: 'not_ready',
            designPartnerPilot: 'not_ready',
            seriousEnterprisePilot: 'not_ready',
            reasons,
        };
    }
    reasons.push('Safe edit allowed, protected boundary blocked, exact-path approval contained, neighbor stayed blocked, and a source-free AI Change Record was exported.');
    // Backend receipt custody is the gate between design-partner and serious enterprise.
    let seriousEnterprisePilot;
    if (facts.backendReceipt.verified) {
        seriousEnterprisePilot = 'ready_with_caveats';
        reasons.push('A signed backend receipt verified under the configured key (integrity + issuance, not source correctness).');
    }
    else {
        seriousEnterprisePilot = 'not_ready';
        reasons.push('Evidence is self-attested / local in this run — a serious enterprise pilot needs the backend signing key configured so receipts verify in production custody.');
    }
    return {
        founderDemo: 'ready',
        designPartnerPilot: 'ready_with_caveats',
        seriousEnterprisePilot,
        reasons,
    };
}
const REPORT_EXCLUDES = [
    'source code',
    'diff hunks',
    'patch bodies',
    'raw prompts',
    'secrets',
    'private file contents',
];
function trustStatement(receipt) {
    if (receipt.verified) {
        return `Backend-signed receipt verified under the configured signing key (${receipt.provenance}). This proves the record was issued under that key and was not altered — it does NOT prove source correctness or vulnerability absence. The signature is an HMAC backend receipt, not public-key cryptographic signing.`;
    }
    if (receipt.configured) {
        return `A signing key was configured but the receipt did not verify in this run (${receipt.provenance}). Treat the evidence as self-attested until a receipt verifies.`;
    }
    return `No backend signing key was configured, so the AI Change Record is a self-attested local record (${receipt.provenance}). It is useful, honest routing metadata — not cryptographic proof that governance ran. Configure the backend signing key to upgrade to verifiable receipts.`;
}
function buildEnterpriseEvalReport(facts, checkpoints) {
    const passed = checkpoints.filter((c) => c.status === 'pass').length;
    const criticalFailures = checkpoints.filter((c) => c.critical && c.status === 'fail').length;
    const verdict = deriveVerdict(checkpoints, facts);
    const deterministicFacts = [
        `Safe in-scope edit was allowed without a block (${facts.safeEditAllowed ? 'observed' : 'NOT observed'}).`,
        `Protected boundary ${facts.boundaryBlockPath ?? 'src/billing/charge.py'} was blocked before the write landed${facts.boundaryOwners.length ? ` (owner ${facts.boundaryOwners.join(', ')})` : ''}.`,
        `Exact-path approval granted exactly one path: ${facts.exactApprovalPath ?? 'none'} (exact-only: ${facts.exactApprovalOnly ? 'yes' : 'no'}).`,
        `Approved path was allowed after approval: ${facts.approvedPathAllowedAfter ? 'yes' : 'no'}.`,
        `Neighbor ${facts.neighborPath ?? 'src/billing/refund.py'} stayed blocked after the approval: ${facts.neighborContained ? 'yes' : 'no'}.`,
        `A source-free AI Change Record / admission record was exported${facts.aiChangeRecordRelativePath ? ` (${facts.aiChangeRecordRelativePath})` : ''}.`,
    ];
    if (facts.admissionBlockedCount != null && facts.admissionApprovedCount != null) {
        deterministicFacts.push(`Admission record counts: ${facts.admissionBlockedCount} blocked path(s), ${facts.admissionApprovedCount} exact approval(s).`);
    }
    const advisoryFacts = [];
    if (facts.repoBrain.status === 'measured') {
        advisoryFacts.push(`Repo brain indexed ${facts.repoBrain.filesIndexed ?? 'n/a'} files; owner boundaries: ${facts.repoBrain.ownerBoundaries.map((b) => `${b.pattern} → ${b.owners.join('/')}`).join('; ') || 'none'}.`);
        if (facts.repoBrain.reuseAdvisories.length > 0) {
            advisoryFacts.push(`Reuse / duplication advisories (fingerprint resemblance, can be false positive): ${facts.repoBrain.reuseAdvisories
                .map((r) => `${r.symbolName ?? 'symbol'} [${r.severity}]`)
                .join('; ')}.`);
        }
        if (facts.repoBrain.highFanOutSymbols.length > 0) {
            advisoryFacts.push(`High fan-out surfaces worth reviewing first: ${facts.repoBrain.highFanOutSymbols
                .map((h) => `${h.file} (${h.importFanIn} callers)`)
                .join('; ')}.`);
        }
    }
    else {
        advisoryFacts.push(`Repo brain was not indexed in this run — run \`${facts.repoBrain.recoveryCommand}\` to populate owner mapping, sensitive surfaces, and reuse advisories.`);
    }
    const whatThisProves = [
        'The runtime allowed a safe, in-scope edit (no false positive) and denied a protected-boundary write before it landed.',
        'An exact-path approval widened scope to exactly one file and no further.',
        'A file adjacent to the approved path stayed blocked — approval did not silently widen.',
        'A source-free AI Change Record was produced that carries paths, owners, verdicts, counts, and hashes only.',
        'The governance loop runs locally and deterministically without GitHub Actions or cloud authentication.',
    ];
    const whatThisDoesNotProve = [
        'It does not prove the source code is correct, secure, or free of vulnerabilities.',
        'It does not prove the AI "semantically understands" the repository — reuse/architecture signals are advisory and can be false positives.',
        facts.backendReceipt.verified
            ? 'A verified receipt confirms issuance under the configured key (HMAC backend receipt) and integrity — not source correctness, and not public-key cryptographic signing.'
            : 'No backend receipt was verified in this run, so evidence is self-attested/local — not cryptographic proof that governance ran.',
        'It is a controlled fixture, not your real repository. Re-run on a real repo to see your owners, surfaces, and reuse signals.',
    ];
    const nextStepForRealRepo = [
        `Run \`neurcode eval start --agent ${facts.agent}\` in your real repository (read-only — it never edits your source).`,
        'Run `neurcode brain index` to map your owners, sensitive surfaces, and high fan-out symbols.',
        facts.agent === 'claude'
            ? 'Activate Claude Code hooks (`neurcode activate claude --dir .`) so the same boundary is a hard pre-write deny in a live session.'
            : `Activate supervised guard mode (\`neurcode activate ${facts.agent} --dir .\`) and drive a bounded task through \`neurcode agent guard\`.`,
        'Trigger one real boundary block + exact approval, then `neurcode eval export` to share a source-free report.',
        'Configure the backend signing key to upgrade self-attested records into verifiable receipts.',
    ];
    return {
        schemaVersion: exports.ENTERPRISE_EVAL_REPORT_SCHEMA_VERSION,
        generatedAt: facts.generatedAt,
        agent: facts.agent,
        enforcement: facts.enforcement,
        enforcementLabel: facts.enforcementLabel,
        enforcementMethod: facts.enforcementMethod,
        mode: facts.mode,
        durationMs: facts.durationMs,
        repo: { rootHash: facts.repoRootHash, fixtureRelativeDir: facts.fixtureRelativeDir },
        result: { complete: criticalFailures === 0, passed, total: checkpoints.length, criticalFailures },
        checkpoints: checkpoints.map((c) => ({
            ...c,
            truthTierLabel: guided_eval_1.GUIDED_EVAL_TRUTH_TIERS[c.truthTier].label,
        })),
        whatThisProves,
        whatThisDoesNotProve,
        deterministicFacts,
        advisoryFacts,
        boundaryTimeline: facts.boundaryTimeline,
        exactApprovalContainment: {
            approvedPath: facts.exactApprovalPath,
            exactOnly: facts.exactApprovalOnly,
            allowedAfterApproval: facts.approvedPathAllowedAfter,
            owners: facts.boundaryOwners,
        },
        neighborContainment: {
            neighborPath: facts.neighborPath,
            stayedBlocked: facts.neighborContained,
        },
        repoBrain: facts.repoBrain,
        impactIntelligence: facts.impactIntelligence,
        evidenceTrustPosture: {
            aiChangeRecord: {
                sessionId: facts.aiChangeRecordSessionId,
                relativePath: facts.aiChangeRecordRelativePath,
            },
            backendReceipt: facts.backendReceipt,
            statement: trustStatement(facts.backendReceipt),
        },
        commandsRun: facts.commandsRun,
        nextStepForRealRepo,
        verdict,
        truthTaxonomy: Object.fromEntries(Object.keys(guided_eval_1.GUIDED_EVAL_TRUTH_TIERS).map((k) => [
            k,
            guided_eval_1.GUIDED_EVAL_TRUTH_TIERS[k].label,
        ])),
        privacy: { sourceFree: true, excludes: REPORT_EXCLUDES },
    };
}
const CHECKPOINT_GLYPH = {
    pass: '✓',
    fail: '✗',
    advisory: '~',
    skipped: '–',
};
const PHASE_LABEL = {
    safe_edit: 'Safe edit',
    boundary_block: 'Protected boundary',
    post_approval_allow: 'After exact approval',
    neighbor_block: 'Neighbor file',
};
const READINESS_LABEL = {
    ready: 'Ready',
    ready_with_caveats: 'Ready with caveats',
    not_ready: 'Not ready',
};
function renderEnterpriseEvalReportMarkdown(report) {
    const lines = [];
    lines.push('# Enterprise Self-Serve Evaluation — Report');
    lines.push('');
    lines.push(`Generated: ${report.generatedAt}`);
    lines.push(`Agent: ${report.agent} · Enforcement: ${report.enforcementLabel}`);
    lines.push(`Method: ${report.enforcementMethod}`);
    lines.push(`Mode: ${report.mode} · Repo identity: ${report.repo.rootHash} (path hash — no source) · Fixture: ${report.repo.fixtureRelativeDir}`);
    lines.push(`Result: ${report.result.passed}/${report.result.total} checkpoints passed${report.result.complete
        ? ' — core governance loop held'
        : ` — ${report.result.criticalFailures} critical failure(s)`}`);
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
    lines.push('## Checkpoints');
    lines.push('');
    lines.push('| | Checkpoint | Tier | Status | Observed |');
    lines.push('|---|---|---|---|---|');
    for (const c of report.checkpoints) {
        lines.push(`| ${CHECKPOINT_GLYPH[c.status]} | ${c.title} | ${c.truthTierLabel} | ${c.status} | ${c.observed} |`);
    }
    lines.push('');
    lines.push('## Deterministic facts');
    lines.push('');
    lines.push('_Compiled path / symbol / graph / policy facts. They prove the structural statement, not source correctness._');
    lines.push('');
    for (const item of report.deterministicFacts)
        lines.push(`- ${item}`);
    lines.push('');
    lines.push('## Advisory facts');
    lines.push('');
    lines.push('_Semantic / reuse / architecture inference. Worth a human look; explicitly NOT a deterministic guarantee._');
    lines.push('');
    for (const item of report.advisoryFacts)
        lines.push(`- ${item}`);
    lines.push('');
    lines.push('## Boundary decision timeline');
    lines.push('');
    lines.push('| # | Phase | Path | Tool | Decision | Owner |');
    lines.push('|---|---|---|---|---|---|');
    for (const e of report.boundaryTimeline) {
        lines.push(`| ${e.order} | ${PHASE_LABEL[e.phase]} | ${e.path} | ${e.toolName} | ${e.decision} | ${e.owners.join(', ') || '—'} |`);
    }
    lines.push('');
    lines.push('## Exact approval containment');
    lines.push('');
    lines.push(`- Approved path: ${report.exactApprovalContainment.approvedPath ?? 'none'}`);
    lines.push(`- Exactly one path approved: ${report.exactApprovalContainment.exactOnly ? 'yes' : 'no'}`);
    lines.push(`- Allowed after approval: ${report.exactApprovalContainment.allowedAfterApproval ? 'yes' : 'no'}`);
    lines.push(`- Boundary owner: ${report.exactApprovalContainment.owners.join(', ') || 'not recorded'}`);
    lines.push('');
    lines.push('## Neighbor containment');
    lines.push('');
    lines.push(`- Neighbor path: ${report.neighborContainment.neighborPath ?? 'none'}`);
    lines.push(`- Stayed blocked after approval: ${report.neighborContainment.stayedBlocked ? 'yes — approval did not widen scope' : 'no'}`);
    lines.push('');
    lines.push('## Repo brain / reuse intelligence summary');
    lines.push('');
    if (report.repoBrain.status === 'measured') {
        lines.push(`- Files indexed: ${report.repoBrain.filesIndexed ?? 'n/a'}`);
        lines.push(`- Sensitive surfaces: ${report.repoBrain.sensitiveSurfaces.join(', ') || 'none'}`);
        lines.push(`- Owner boundaries: ${report.repoBrain.ownerBoundaries.map((b) => `${b.pattern} → ${b.owners.join('/')}`).join('; ') || 'none'}`);
        lines.push(`- High fan-out symbols (advisory): ${report.repoBrain.highFanOutSymbols.map((h) => `${h.file} (${h.importFanIn} callers)`).join('; ') || 'none'}`);
        lines.push(`- Reuse advisories (advisory): ${report.repoBrain.reuseAdvisories.map((r) => `${r.symbolName ?? 'symbol'} [${r.severity}]`).join('; ') || 'none'}`);
    }
    else {
        lines.push(`- Not indexed in this run — run \`${report.repoBrain.recoveryCommand}\` on the target repo to populate.`);
    }
    lines.push('');
    lines.push('## Impact Intelligence — what this change would affect & who should review it');
    lines.push('');
    const impact = report.impactIntelligence;
    if (!impact) {
        lines.push('- Not computed in this run. Run `neurcode brain index` then `neurcode brain impact --changed <files>` on the target repo.');
    }
    else {
        lines.push(`_Deterministic = compiled path / CODEOWNERS / import-graph facts. Advisory = heuristic reuse / proximity / reviewer guidance. Source-free (paths, owners, symbol names, counts)._`);
        lines.push('');
        lines.push(`- Changed set: ${impact.counts.changedFiles} file(s); ${impact.counts.changedSymbols} declaration(s) indexed.`);
        lines.push(`- Route review to (deterministic, CODEOWNERS): ${impact.reviewRouting.owners.join(', ') || 'no CODEOWNERS match'}`);
        lines.push(`- Review first: ${impact.reviewRouting.reviewFirst.join(', ') || 'no elevated-risk surface detected'}`);
        lines.push(`- Sensitive surfaces (deterministic): ${impact.sensitiveSurfaces.map((s) => `${s.path} [${s.kinds.join(', ')}]`).join('; ') || 'none'}`);
        lines.push(`- Import consumers / fan-in (deterministic): ${impact.counts.directConsumers} file(s)${impact.deterministic.isHighFanOut ? ' — includes a high fan-out hub' : ''}`);
        lines.push(`- Reuse / duplicate-helper advisories (advisory): ${impact.advisory.reuse.map((r) => r.symbolName ?? 'symbol').join(', ') || 'none'}`);
        if (impact.reviewQuestions.length > 0) {
            lines.push('');
            lines.push('Recommended reviewer questions:');
            impact.reviewQuestions.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
        }
    }
    lines.push('');
    lines.push('## Evidence trust posture');
    lines.push('');
    lines.push(`- AI Change Record: ${report.evidenceTrustPosture.aiChangeRecord.relativePath ?? 'none'} (session ${report.evidenceTrustPosture.aiChangeRecord.sessionId ?? 'n/a'})`);
    lines.push(`- Backend receipt: configured ${report.evidenceTrustPosture.backendReceipt.configured ? 'yes' : 'no'}, verified ${report.evidenceTrustPosture.backendReceipt.verified ? 'yes' : 'no'} (${report.evidenceTrustPosture.backendReceipt.provenance})`);
    lines.push(`- ${report.evidenceTrustPosture.statement}`);
    lines.push('');
    lines.push('## Commands that were run');
    lines.push('');
    lines.push('```');
    for (const cmd of report.commandsRun)
        lines.push(cmd);
    lines.push('```');
    lines.push('');
    lines.push('## Design-partner pilot readiness');
    lines.push('');
    lines.push(`- Founder demo: ${READINESS_LABEL[report.verdict.founderDemo]}`);
    lines.push(`- Design-partner pilot: ${READINESS_LABEL[report.verdict.designPartnerPilot]}`);
    lines.push(`- Serious enterprise pilot: ${READINESS_LABEL[report.verdict.seriousEnterprisePilot]}`);
    for (const reason of report.verdict.reasons)
        lines.push(`  - ${reason}`);
    lines.push('');
    lines.push('## Next step for a real repo');
    lines.push('');
    for (const item of report.nextStepForRealRepo)
        lines.push(`- ${item}`);
    lines.push('');
    lines.push(`_Source-free: paths, owners, symbol names, hashes, verdicts, and tiers only. Excludes: ${report.privacy.excludes.join(', ')}._`);
    lines.push('');
    return lines.join('\n');
}
function trustLabel(receipt) {
    if (receipt.verified) {
        return 'Backend-signed receipt verified (HMAC backend receipt, integrity + issuance — not source correctness)';
    }
    if (receipt.configured)
        return 'Signing key configured but receipt unverified — treat as self-attested';
    return 'Self-attested local record (no backend signing key configured)';
}
function buildEvalDemoSummary(facts, checkpoints) {
    const passed = checkpoints.filter((c) => c.status === 'pass').length;
    const criticalFailures = checkpoints.filter((c) => c.critical && c.status === 'fail').length;
    const total = checkpoints.length;
    const percent = total === 0 ? 0 : Math.round((passed / total) * 100);
    const verdict = deriveVerdict(checkpoints, facts);
    const recommendedNextCommand = criticalFailures > 0
        ? `neurcode eval doctor --agent ${facts.agent}`
        : `neurcode eval start --agent ${facts.agent}`;
    return {
        schemaVersion: exports.EVAL_DEMO_SUMMARY_SCHEMA_VERSION,
        generatedAt: facts.generatedAt,
        agent: facts.agent,
        enforcement: facts.enforcement,
        enforcementLabel: facts.enforcementLabel,
        mode: facts.mode,
        repo: { rootHash: facts.repoRootHash },
        completion: { complete: criticalFailures === 0, passed, total, percent },
        checkpoints: checkpoints.map((c) => ({
            id: c.id,
            title: c.title,
            truthTier: c.truthTier,
            status: c.status,
            observed: c.observed,
        })),
        facts: {
            boundaryBlock: {
                path: facts.boundaryBlockPath,
                owners: facts.boundaryOwners,
                blockType: facts.boundaryBlockType,
            },
            exactApproval: {
                path: facts.exactApprovalPath,
                exactOnly: facts.exactApprovalOnly,
                allowedAfter: facts.approvedPathAllowedAfter,
            },
            neighbor: { path: facts.neighborPath, contained: facts.neighborContained },
            aiChangeRecord: {
                sessionId: facts.aiChangeRecordSessionId,
                relativePath: facts.aiChangeRecordRelativePath,
            },
        },
        sourceFree: true,
        trustPosture: {
            backendReceiptConfigured: facts.backendReceipt.configured,
            backendReceiptVerified: facts.backendReceipt.verified,
            label: trustLabel(facts.backendReceipt),
            provenance: facts.backendReceipt.provenance,
        },
        recommendedNextCommand,
        verdict,
        impactIntelligence: facts.impactIntelligence,
        privacy: { sourceFree: true, excludes: REPORT_EXCLUDES },
    };
}
// ── Source-free backstop ──────────────────────────────────────────────────────
/** Throw if a would-be enterprise artifact contains source/diff/secret shapes. */
function assertEnterpriseEvalSourceFree(value, label = 'enterprise-eval artifact') {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    const leaks = (0, guided_eval_1.findSourceLeaks)(text);
    if (leaks.length > 0) {
        throw new Error(`${label} failed source-free scan: ${leaks.join(', ')}`);
    }
}
//# sourceMappingURL=enterprise-eval-report.js.map