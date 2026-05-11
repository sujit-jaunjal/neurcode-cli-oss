"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findingFromStructural = findingFromStructural;
exports.findingFromPolicyEngine = findingFromPolicyEngine;
exports.findingFromIntentIssue = findingFromIntentIssue;
exports.findingFromFlowIssue = findingFromFlowIssue;
exports.findingFromRegression = findingFromRegression;
exports.findingFromScope = findingFromScope;
exports.findingFromGovernanceConstraint = findingFromGovernanceConstraint;
exports.buildGovernanceVerificationEnvelope = buildGovernanceVerificationEnvelope;
exports.attachCanonicalGovernance = attachCanonicalGovernance;
exports.evaluateGovernanceReplayIntegrity = evaluateGovernanceReplayIntegrity;
const crypto_1 = require("crypto");
const contracts_1 = require("@neurcode-ai/contracts");
function stableFindingId(parts) {
    return (0, crypto_1.createHash)('sha256').update(parts.join('\x1e')).digest('hex').slice(0, 32);
}
function rankDeterminism(d) {
    switch (d) {
        case 'deterministic-structural':
            return 4;
        case 'deterministic-semantic':
            return 3;
        case 'heuristic-advisory':
            return 2;
        case 'llm-assisted-planning':
            return 1;
        default:
            return 0;
    }
}
function pickStricterDeterminism(a, b) {
    return rankDeterminism(a) >= rankDeterminism(b) ? a : b;
}
function mapStructuralDeterminism(v) {
    if (v.determinism === 'heuristic-advisory')
        return 'heuristic-advisory';
    if (v.determinism === 'deterministic-semantic')
        return 'deterministic-semantic';
    if (v.determinism === 'llm-assisted-planning')
        return 'llm-assisted-planning';
    return 'deterministic-structural';
}
function mapStructuralSeverity(v) {
    return v.severity === 'BLOCKING' ? 'BLOCKING' : 'ADVISORY';
}
function findingFromStructural(v) {
    const determinismClassification = mapStructuralDeterminism(v);
    const id = stableFindingId([
        'structural',
        v.ruleId,
        v.filePath,
        String(v.line),
        String(v.column),
        v.evidence,
    ]);
    return {
        id,
        category: 'structural',
        sourceSystem: 'structural-rules',
        determinismClassification,
        severity: mapStructuralSeverity(v),
        confidence: v.confidence,
        title: `${v.ruleId} · ${v.ruleName}`,
        evidence: {
            excerpt: v.evidence,
            filePath: v.filePath,
            line: v.line,
            column: v.column,
            structuralHint: v.ruleId,
        },
        operationalImplication: v.operationalRisk,
        remediation: v.remediation,
        structuralMetadata: {
            ruleId: v.ruleId,
            ruleName: v.ruleName,
            policyRef: v.policyRef,
            language: v.language,
        },
    };
}
function findingFromPolicyEngine(v) {
    const file = v.file || 'unknown';
    const rule = v.rule || 'policy';
    const id = stableFindingId(['policy-engine', rule, file, String(v.line ?? 0), v.message || '']);
    const blocking = v.severity === 'block';
    return {
        id,
        category: 'policy-engine',
        sourceSystem: 'policy-engine',
        determinismClassification: 'heuristic-advisory',
        severity: blocking ? 'BLOCKING' : 'ADVISORY',
        confidence: blocking ? 0.72 : 0.55,
        title: `Policy · ${rule}`,
        evidence: {
            excerpt: v.message || rule,
            filePath: file,
            line: v.line,
            column: v.column,
        },
        operationalImplication: blocking
            ? 'Change may violate org policy gates (sensitive paths, secrets heuristics, size limits, or custom pack rules).'
            : 'Policy advisory: review before merge.',
        remediation: 'Adjust the change, update policy exception through approved workflow, or narrow diff scope.',
    };
}
function findingFromIntentIssue(i) {
    const file = i.files?.[0] ?? 'intent-analysis';
    const id = stableFindingId(['intent', i.rule, file, i.message]);
    return {
        id,
        category: 'intent-conditioned',
        sourceSystem: 'intent-engine',
        determinismClassification: 'deterministic-semantic',
        severity: i.severity === 'high' ? 'BLOCKING' : 'ADVISORY',
        confidence: i.severity === 'high' ? 0.78 : 0.62,
        title: `Intent · ${i.rule}`,
        evidence: { excerpt: i.message, filePath: file },
        operationalImplication: 'Implementation may not match stated intent; risk of shipping incomplete auth, validation, or error handling.',
        remediation: 'Align code with plan intent or update the plan / intent artifact.',
    };
}
function findingFromFlowIssue(f) {
    const file = f.files?.[0] ?? 'flow-analysis';
    const id = stableFindingId(['flow', f.rule, file, f.message]);
    return {
        id,
        category: 'flow-connectivity',
        sourceSystem: 'intent-engine',
        determinismClassification: 'deterministic-semantic',
        severity: f.severity === 'high' ? 'BLOCKING' : 'ADVISORY',
        confidence: f.severity === 'high' ? 0.74 : 0.58,
        title: `Flow · ${f.rule}`,
        evidence: { excerpt: f.message, filePath: file },
        operationalImplication: 'Cross-component wiring gap; can cause runtime failures or silent omission of critical paths.',
        remediation: 'Connect required components or document explicit bypass with governance approval.',
    };
}
function findingFromRegression(r) {
    const id = stableFindingId(['regression', r.rule, r.message]);
    return {
        id,
        category: 'regression',
        sourceSystem: 'intent-engine',
        determinismClassification: 'deterministic-semantic',
        severity: 'BLOCKING',
        confidence: 0.7,
        title: `Regression · ${r.rule}`,
        evidence: { excerpt: r.message, filePath: 'regression-analysis' },
        operationalImplication: 'Previously covered behaviour appears degraded relative to last verified state.',
        remediation: 'Restore prior safeguards or update signed intent / waiver with rationale.',
    };
}
function findingFromScope(file, message) {
    const id = stableFindingId(['scope', file, message]);
    return {
        id,
        category: 'scope',
        sourceSystem: 'policy-engine',
        determinismClassification: 'deterministic-semantic',
        severity: 'BLOCKING',
        confidence: 0.88,
        title: 'Scope guard',
        evidence: { excerpt: message, filePath: file },
        operationalImplication: 'Unplanned files changed; increases blast radius and review load.',
        remediation: 'Limit diff to planned scope or expand plan through governed workflow.',
    };
}
function findingFromGovernanceConstraint(message, fileHint) {
    const id = stableFindingId(['constraint', fileHint, message]);
    return {
        id,
        category: 'governance-constraint',
        sourceSystem: 'governance-runtime',
        determinismClassification: 'deterministic-semantic',
        severity: 'BLOCKING',
        confidence: 0.9,
        title: 'Deterministic constraint',
        evidence: { excerpt: message, filePath: fileHint },
        operationalImplication: 'Compiled intent/policy constraint violated; deterministic mismatch with approved artifacts.',
        remediation: 'Fix code to satisfy constraint or regenerate compiled policy with explicit approval.',
    };
}
function behavioralClusterKey(finding) {
    const text = `${finding.title} ${finding.operationalImplication}`.toLowerCase();
    if (text.includes('queue') || text.includes('retry') || text.includes('async')) {
        return 'async-failure-propagation-risk';
    }
    if (text.includes('scope') || text.includes('blast radius') || text.includes('plan')) {
        return 'scope-and-blast-radius-risk';
    }
    if (text.includes('auth') || text.includes('identity') || text.includes('token')) {
        return 'auth-trust-boundary-risk';
    }
    if (text.includes('flow') || text.includes('connect')) {
        return 'service-flow-connectivity-risk';
    }
    return 'operational-governance-risk';
}
function compressByLocation(findings) {
    const buckets = new Map();
    for (const f of findings) {
        const fp = f.evidence.filePath ?? 'unknown';
        const ln = f.evidence.line ?? 0;
        const sev = f.severity;
        const behavior = behavioralClusterKey(f);
        const key = `${fp}\x00${ln}\x00${sev}\x00${behavior}`;
        const list = buckets.get(key) ?? [];
        list.push(f);
        buckets.set(key, list);
    }
    const merged = [];
    let duplicateCount = 0;
    for (const [, group] of buckets) {
        if (group.length === 1) {
            merged.push(group[0]);
            continue;
        }
        const systems = new Set(group.map((g) => g.sourceSystem));
        if (systems.size < 2) {
            merged.push(...group);
            continue;
        }
        duplicateCount += group.length - 1;
        let primary = group[0];
        for (const next of group.slice(1)) {
            const det = pickStricterDeterminism(primary.determinismClassification, next.determinismClassification);
            const conf = Math.min(primary.confidence, next.confidence);
            const mergedFrom = [...(primary.mergedFrom ?? [primary.id]), ...(next.mergedFrom ?? [next.id])];
            primary = {
                ...primary,
                id: stableFindingId(mergedFrom.sort()),
                determinismClassification: det,
                confidence: conf,
                title: `${primary.title} + ${next.title}`,
                operationalImplication: `${primary.operationalImplication} | ${next.operationalImplication}`,
                remediation: `${primary.remediation} | ${next.remediation}`,
                mergedFrom,
                evidence: {
                    ...primary.evidence,
                    excerpt: `${primary.evidence.excerpt}\n---\n${next.evidence.excerpt}`,
                },
            };
        }
        merged.push(primary);
    }
    return { merged, duplicateCount };
}
function buildReviewerSummary(findings, maxLines = 12) {
    const blocking = findings.filter((f) => f.severity === 'BLOCKING');
    const lines = [];
    const clusters = new Map();
    for (const f of blocking) {
        const key = behavioralClusterKey(f);
        clusters.set(key, (clusters.get(key) ?? 0) + 1);
    }
    for (const [cluster, count] of [...clusters.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) {
        lines.push(`Operational cluster: ${cluster} (${count} finding(s))`);
    }
    for (const f of blocking.slice(0, maxLines)) {
        const det = f.determinismClassification;
        const fp = f.evidence.filePath ?? '?';
        const ln = f.evidence.line != null ? `:${f.evidence.line}` : '';
        lines.push(`[${det}] ${fp}${ln} — ${f.title}`);
    }
    if (blocking.length > maxLines) {
        lines.push(`… ${blocking.length - maxLines} more blocking finding(s) omitted from summary`);
    }
    return lines;
}
function buildGovernanceVerificationEnvelope(input) {
    const raw = [];
    for (const v of input.structuralViolations ?? []) {
        raw.push(findingFromStructural(v));
    }
    for (const v of input.policyViolations ?? []) {
        raw.push(findingFromPolicyEngine(v));
    }
    for (const i of input.intentIssues ?? []) {
        raw.push(findingFromIntentIssue(i));
    }
    for (const f of input.flowIssues ?? []) {
        raw.push(findingFromFlowIssue(f));
    }
    for (const r of input.regressions ?? []) {
        raw.push(findingFromRegression(r));
    }
    for (const s of input.scopeFiles ?? []) {
        raw.push(findingFromScope(s.file, s.message ?? 'Out of scope'));
    }
    for (const c of input.constraintMessages ?? []) {
        raw.push(findingFromGovernanceConstraint(c.message, c.file ?? '.neurcode/policy-compiled'));
    }
    for (const f of raw) {
        if (input.provenance && !f.provenanceMetadata) {
            f.provenanceMetadata = { ...input.provenance };
        }
    }
    const { merged, duplicateCount } = compressByLocation(raw);
    return {
        schemaVersion: contracts_1.GOVERNANCE_FINDINGS_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        findings: merged,
        compressedDuplicateCount: duplicateCount,
        reviewerSummary: buildReviewerSummary(merged),
    };
}
function asStructuralViolations(raw) {
    if (!Array.isArray(raw))
        return [];
    return raw;
}
function asRuleViolationsFromPayloadViolations(payload) {
    const violations = payload.violations;
    if (!Array.isArray(violations))
        return [];
    const out = [];
    for (const item of violations) {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            continue;
        const rec = item;
        const rule = typeof rec.rule === 'string' ? rec.rule : typeof rec.policy === 'string' ? rec.policy : 'unknown';
        const file = typeof rec.file === 'string' ? rec.file : 'unknown';
        const sevRaw = typeof rec.severity === 'string' ? rec.severity.toLowerCase() : 'warn';
        const severity = sevRaw === 'block' || sevRaw === 'critical' || sevRaw === 'high' ? 'block' : 'warn';
        const message = typeof rec.message === 'string' ? rec.message : undefined;
        const line = typeof rec.line === 'number'
            ? rec.line
            : typeof rec.startLine === 'number'
                ? rec.startLine
                : undefined;
        if (String(rule).startsWith('structural:')) {
            continue;
        }
        out.push({ rule, file, severity, message, line });
    }
    return out;
}
function scopeHintsFromPayload(payload) {
    const scopeIssues = payload.scopeIssues;
    const bloatFiles = payload.bloatFiles;
    const out = [];
    if (Array.isArray(scopeIssues)) {
        for (const item of scopeIssues) {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                const rec = item;
                if (typeof rec.file === 'string') {
                    out.push({ file: rec.file, message: typeof rec.message === 'string' ? rec.message : undefined });
                }
            }
        }
    }
    if (Array.isArray(bloatFiles)) {
        for (const f of bloatFiles) {
            if (typeof f === 'string')
                out.push({ file: f, message: 'File modified outside the plan' });
        }
    }
    return out;
}
/**
 * Merge canonical governance envelope onto a verify JSON payload (mutates copy).
 */
function attachCanonicalGovernance(payload) {
    const structuralViolations = asStructuralViolations(payload.structuralViolations);
    const policyViolations = asRuleViolationsFromPayloadViolations(payload);
    const intentIssues = Array.isArray(payload.intentIssues) ? payload.intentIssues : [];
    const flowIssues = Array.isArray(payload.flowIssues) ? payload.flowIssues : [];
    const regressions = Array.isArray(payload.regressions) ? payload.regressions : [];
    const scopeFiles = scopeHintsFromPayload(payload);
    const planId = typeof payload.planId === 'string' ? payload.planId : null;
    const verificationSource = typeof payload.verificationSource === 'string' ? payload.verificationSource : undefined;
    const envelope = buildGovernanceVerificationEnvelope({
        structuralViolations,
        policyViolations,
        intentIssues,
        flowIssues,
        regressions,
        scopeFiles,
        provenance: {
            planId,
            verificationSource,
            generatedAt: new Date().toISOString(),
        },
    });
    return {
        ...payload,
        governanceVerification: envelope,
        governanceFindings: envelope.findings,
    };
}
function evaluateGovernanceReplayIntegrity(input) {
    const missingArtifacts = [];
    const provenanceMismatches = [];
    const graphMismatches = [];
    const semanticTruncationMismatches = [];
    const notes = [];
    const ev = input.evidencePayload.governanceVerification;
    const rec = input.reconstructedPayload?.governanceVerification;
    if (!ev && !rec) {
        notes.push('No canonical governance envelope present on evidence or reconstruction.');
        return {
            status: 'bounded-degradation',
            missingArtifacts,
            provenanceMismatches,
            graphMismatches,
            semanticTruncationMismatches,
            notes,
        };
    }
    if (ev && !rec) {
        missingArtifacts.push('governanceVerification missing from reconstructed payload');
    }
    else if (ev && rec) {
        if (ev.schemaVersion !== rec.schemaVersion) {
            provenanceMismatches.push(`schemaVersion drift: evidence=${ev.schemaVersion} replay=${rec.schemaVersion}`);
        }
        if (ev.findings.length !== rec.findings.length) {
            provenanceMismatches.push(`findings count drift: evidence=${ev.findings.length} replay=${rec.findings.length}`);
        }
        const evIds = new Set(ev.findings.map((f) => f.id));
        for (const f of rec.findings) {
            if (!evIds.has(f.id)) {
                provenanceMismatches.push(`unexpected finding id in replay: ${f.id}`);
            }
        }
    }
    const trunc = input.evidencePayload.semanticTruncation
        ?? input.reconstructedPayload?.semanticTruncation;
    if (trunc === true) {
        semanticTruncationMismatches.push('Semantic or index truncation flagged on payload');
    }
    const status = missingArtifacts.length === 0
        && provenanceMismatches.length === 0
        && graphMismatches.length === 0
        && semanticTruncationMismatches.length === 0
        ? 'exact'
        : 'bounded-degradation';
    return {
        status,
        missingArtifacts,
        provenanceMismatches,
        graphMismatches,
        semanticTruncationMismatches,
        notes,
    };
}
//# sourceMappingURL=canonical-pipeline.js.map