"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripStructuralPolicyRows = stripStructuralPolicyRows;
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
const canonical_invariants_1 = require("./canonical-invariants");
const canonical_ordering_1 = require("./canonical-ordering");
function stableFindingId(parts) {
    return (0, crypto_1.createHash)('sha256').update(parts.join('\x1e')).digest('hex').slice(0, 32);
}
/**
 * Strip structural:* prefixed violations from the policy-engine row list.
 * These are already represented in structuralViolations — keeping them in
 * policyViolations causes cross-source duplicate GovernanceFinding objects.
 * Called by attachCanonicalGovernance before building the envelope.
 */
function stripStructuralPolicyRows(violations) {
    return violations.filter(v => !String(v.rule ?? '').startsWith('structural:'));
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
    // ── Pass 1: build a ruleId-aware identity map for structural findings ─────
    // Key: filePath + line + ruleId (from structuralMetadata)
    // This ensures that when the same structural violation appears from both
    // the structural-rules source AND a policy-engine structural:* row,
    // we can identify and absorb the duplicate before bucket compression.
    const structuralById = new Map();
    for (const f of findings) {
        if (f.sourceSystem === 'structural-rules' && f.structuralMetadata?.ruleId) {
            const key = `${f.evidence.filePath ?? ''}\x00${f.evidence.line ?? 0}\x00${f.structuralMetadata.ruleId}`;
            structuralById.set(key, f);
        }
    }
    // ── Pass 2: bucket by location + behavior, absorb structural duplicates ───
    const buckets = new Map();
    let duplicateCount = 0;
    for (const f of findings) {
        // If this is a policy-engine row that mirrors a structural finding, absorb it
        if (f.sourceSystem === 'policy-engine') {
            const ruleId = String(f.structuralMetadata?.ruleId ?? f.title.match(/^Policy · structural:(.+)$/)?.[1] ?? '');
            if (ruleId) {
                const structKey = `${f.evidence.filePath ?? ''}\x00${f.evidence.line ?? 0}\x00${ruleId}`;
                const primary = structuralById.get(structKey);
                if (primary) {
                    // Absorb into structural primary's mergedFrom — do not add to buckets
                    const mergedFrom = [...(primary.mergedFrom ?? [primary.id]), f.id];
                    structuralById.set(structKey, { ...primary, mergedFrom });
                    duplicateCount++;
                    continue;
                }
            }
        }
        const fp = f.evidence.filePath ?? 'unknown';
        const ln = f.evidence.line ?? 0;
        const sev = f.severity;
        const ruleKey = f.structuralMetadata?.ruleId ?? '';
        const behavior = behavioralClusterKey(f);
        // Include ruleId in the bucket key so distinct rules at the same line
        // are never merged — only identical-rule duplicates across source systems.
        const key = `${fp}\x00${ln}\x00${sev}\x00${ruleKey}\x00${behavior}`;
        const list = buckets.get(key) ?? [];
        list.push(f);
        buckets.set(key, list);
    }
    // ── Pass 3: replace bucket entries with absorbed structural findings ───────
    // Update bucket entries to use the absorbed (mergedFrom-enriched) versions
    for (const [key, group] of buckets) {
        buckets.set(key, group.map(f => {
            if (f.sourceSystem !== 'structural-rules' || !f.structuralMetadata?.ruleId)
                return f;
            const structKey = `${f.evidence.filePath ?? ''}\x00${f.evidence.line ?? 0}\x00${f.structuralMetadata.ruleId}`;
            return structuralById.get(structKey) ?? f;
        }));
    }
    const merged = [];
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
    // Strip structural:* policy rows — they duplicate structuralViolations entries.
    // The canonical dedup in compressByLocation handles any that slip through,
    // but stripping here prevents them from appearing as independent findings.
    const filteredPolicyViolations = stripStructuralPolicyRows(input.policyViolations ?? []);
    for (const v of filteredPolicyViolations) {
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
    // NOTE: provenance is assigned after canonical sort below (post compressByLocation).
    const { merged: rawMerged, duplicateCount } = compressByLocation(raw);
    // Phase 1: Apply canonical deterministic ordering BEFORE checksum, provenance,
    // and envelope emission. This is the single authoritative sort point.
    // sortCanonicalFindingsStable is pure, never mutates input.
    const merged = (0, canonical_ordering_1.sortCanonicalFindingsStable)(rawMerged);
    // Phase 1: Validate that the sort produced a correctly ordered array.
    // If ordering drift is detected, emit warning but do NOT throw.
    (0, canonical_ordering_1.validateCanonicalOrder)(merged, 'buildGovernanceVerificationEnvelope');
    // Phase 3: Assign provenance AFTER ordering so that provenance assignment
    // order matches the canonical finding order.
    for (const f of merged) {
        if (input.provenance && !f.provenanceMetadata) {
            f.provenanceMetadata = { ...input.provenance };
        }
    }
    // legacyDebt findings: those demoted from BLOCKING to ADVISORY due to
    // diff-scope enforcement (Phase 2). Count separately for observability.
    const legacyDebtCount = merged.filter(f => f.legacyDebt === true).length;
    // Phase 3: Compute deterministic replay checksum over the canonically ordered finding set.
    // Input is already sorted by sortCanonicalFindingsStable — checksum is stable.
    const replayChecksum = (0, canonical_invariants_1.computeCanonicalFindingChecksum)(merged);
    // Phase 1 invariant guard: warn if any structural:* policy rows leaked through.
    (0, canonical_invariants_1.assertNoStructuralPolicyRows)(input.policyViolations ?? [], 'buildGovernanceVerificationEnvelope');
    return {
        schemaVersion: contracts_1.GOVERNANCE_FINDINGS_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        findings: merged,
        compressedDuplicateCount: duplicateCount,
        deduplicatedFindingCount: duplicateCount,
        legacyDebtFindingCount: legacyDebtCount,
        replayChecksum,
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
    // Strip structural:* rows before building the envelope — these are echoed
    // from mergeStructuralIntoPolicyViolations() and would cause duplicates.
    const policyViolations = stripStructuralPolicyRows(asRuleViolationsFromPayloadViolations(payload));
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
    const driftReasons = new Set();
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
            driftReasons: [],
        };
    }
    if (ev && !rec) {
        missingArtifacts.push('governanceVerification missing from reconstructed payload');
    }
    else if (ev && rec) {
        // ── 1. Schema version ──────────────────────────────────────────────────────
        if (ev.schemaVersion !== rec.schemaVersion) {
            provenanceMismatches.push(`schemaVersion drift: evidence=${ev.schemaVersion} replay=${rec.schemaVersion}`);
            driftReasons.add('provenance-drift');
        }
        // ── 2. Finding count equality ──────────────────────────────────────────────
        if (ev.findings.length !== rec.findings.length) {
            provenanceMismatches.push(`findings count drift: evidence=${ev.findings.length} replay=${rec.findings.length}`);
        }
        // ── 3. Missing / extra findings ────────────────────────────────────────────
        const evById = new Map(ev.findings.map(f => [f.id, f]));
        const recById = new Map(rec.findings.map(f => [f.id, f]));
        for (const [id] of evById) {
            if (!recById.has(id)) {
                graphMismatches.push(`missing-finding in replay: ${id}`);
                driftReasons.add('missing-finding');
            }
        }
        for (const [id] of recById) {
            if (!evById.has(id)) {
                graphMismatches.push(`extra-finding in replay: ${id}`);
                driftReasons.add('extra-finding');
            }
        }
        // ── 4. Per-finding semantic equality (severity, determinism, provenance, suppression) ──
        for (const [id, evF] of evById) {
            const recF = recById.get(id);
            if (!recF)
                continue; // already reported as missing above
            if (evF.severity !== recF.severity) {
                graphMismatches.push(`severity-drift on ${id}: evidence=${evF.severity} replay=${recF.severity}`);
                driftReasons.add('severity-drift');
            }
            if (evF.determinismClassification !== recF.determinismClassification) {
                graphMismatches.push(`determinism-drift on ${id}: ` +
                    `evidence=${evF.determinismClassification} replay=${recF.determinismClassification}`);
                driftReasons.add('determinism-drift');
            }
            // Provenance: compare planId if present
            const evProv = evF.provenanceMetadata;
            const recProv = recF.provenanceMetadata;
            if (evProv && recProv) {
                if (evProv.planId !== recProv.planId) {
                    provenanceMismatches.push(`provenance planId drift on ${id}: evidence=${evProv.planId} replay=${recProv.planId}`);
                    driftReasons.add('provenance-drift');
                }
            }
            else if (evProv && !recProv) {
                provenanceMismatches.push(`provenance-drift on ${id}: evidence has provenanceMetadata, replay does not`);
                driftReasons.add('provenance-drift');
            }
            // Structural policyRef: compare via structuralMetadata
            const evSM = evF.structuralMetadata;
            const recSM = recF.structuralMetadata;
            if (evSM && recSM && evSM.policyRef !== recSM.policyRef) {
                provenanceMismatches.push(`policyRef drift on ${id}: evidence=${evSM.policyRef} replay=${recSM.policyRef}`);
                driftReasons.add('provenance-drift');
            }
            // Suppression: compare suppressionMetadata presence
            const evSupp = evF.suppressionMetadata;
            const recSupp = recF.suppressionMetadata;
            if (Boolean(evSupp) !== Boolean(recSupp)) {
                graphMismatches.push(`suppression-drift on ${id}: ` +
                    `evidence ${evSupp ? 'suppressed' : 'not-suppressed'} vs ` +
                    `replay ${recSupp ? 'suppressed' : 'not-suppressed'}`);
                driftReasons.add('suppression-drift');
            }
        }
        // ── 5. Canonical ordering equality ────────────────────────────────────────
        // Both arrays should be in canonical order. Compare the ordered ID sequences.
        const evOrderedIds = ev.findings.map(f => f.id).join('\x00');
        const recOrderedIds = rec.findings.map(f => f.id).join('\x00');
        if (evOrderedIds !== recOrderedIds && ev.findings.length === rec.findings.length) {
            graphMismatches.push('finding-order-drift: canonical ordering differs between evidence and replay');
            driftReasons.add('finding-order-drift');
        }
        // ── 6. Checksum equality ───────────────────────────────────────────────────
        if (ev.replayChecksum && rec.replayChecksum) {
            if (ev.replayChecksum !== rec.replayChecksum) {
                const comparison = (0, canonical_invariants_1.compareForReplayEquivalence)(ev.findings, rec.findings);
                graphMismatches.push(`checksum-drift: evidence=${ev.replayChecksum.slice(0, 16)} ` +
                    `replay=${rec.replayChecksum.slice(0, 16)}` +
                    (comparison.driftDetails ? ` (${comparison.driftDetails})` : ''));
                driftReasons.add('checksum-drift');
            }
        }
        else if (ev.replayChecksum && !rec.replayChecksum) {
            notes.push('Replay envelope missing replayChecksum (older CLI version); falling back to per-field comparison.');
        }
    }
    const trunc = input.evidencePayload.semanticTruncation
        ?? input.reconstructedPayload?.semanticTruncation;
    if (trunc === true) {
        semanticTruncationMismatches.push('Semantic or index truncation flagged on payload');
    }
    const hasDrift = driftReasons.size > 0 && (driftReasons.has('checksum-drift') ||
        driftReasons.has('severity-drift') ||
        driftReasons.has('determinism-drift') ||
        driftReasons.has('finding-order-drift') ||
        driftReasons.has('missing-finding') ||
        driftReasons.has('extra-finding'));
    const status = hasDrift
        ? 'drift-detected'
        : missingArtifacts.length === 0
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
        driftReasons: [...driftReasons].sort(),
    };
}
//# sourceMappingURL=canonical-pipeline.js.map