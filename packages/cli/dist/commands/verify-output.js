"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXPEDITE_FOLLOW_UP_CHECKLIST = void 0;
exports.containsAnyToken = containsAnyToken;
exports.isSecurityOrAuthViolation = isSecurityOrAuthViolation;
exports.isCriticalScopeBreach = isCriticalScopeBreach;
exports.toCanonicalVerifyOutput = toCanonicalVerifyOutput;
exports.emitCanonicalVerifyJson = emitCanonicalVerifyJson;
exports.buildDeterministicLayerSummary = buildDeterministicLayerSummary;
const fs_1 = require("fs");
const canonical_pipeline_1 = require("../governance/canonical-pipeline");
exports.EXPEDITE_FOLLOW_UP_CHECKLIST = [
    'Add validation back',
    'Move logic to proper layer',
    'Remove temporary code',
];
function asObjectRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value;
}
function asObjectArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => asObjectRecord(item))
        .filter((item) => item !== null);
}
function asBooleanFlag(value) {
    return typeof value === 'boolean' ? value : null;
}
function asNumberValue(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function asStringValue(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
function containsAnyToken(value, tokens) {
    const normalized = value.toLowerCase();
    return tokens.some((token) => normalized.includes(token));
}
function isSecurityOrAuthViolation(fileRaw, policyRaw, messageRaw) {
    const combined = `${fileRaw} ${policyRaw} ${messageRaw}`.toLowerCase();
    return containsAnyToken(combined, [
        'auth',
        'authentication',
        'authorization',
        'security',
        'permission',
        'access control',
        'access_control',
        'token',
        'secret',
        'credential',
        'encryption',
        'encrypt',
        'decrypt',
        'csrf',
        'xss',
        'sql injection',
        'sqli',
        'insecure',
        'vulnerability',
    ]);
}
function isCriticalScopeBreach(fileRaw, messageRaw) {
    const combined = `${fileRaw} ${messageRaw}`.toLowerCase();
    return containsAnyToken(combined, [
        'auth',
        'security',
        'secret',
        'token',
        'credential',
        'permission',
        'infra/terraform',
        'terraform',
        'k8s',
        'helm',
        'migration',
        'database/migration',
        'policy',
        'contract',
    ]);
}
function resolveExpediteModeFromPayload(payload) {
    const explicit = asBooleanFlag(payload.expediteMode);
    if (explicit !== null) {
        return explicit;
    }
    const message = asStringValue(payload.message) || '';
    return containsAnyToken(message, ['hotfix', 'urgent', 'prod down', 'incident', 'expedite']);
}
function toVerifySeverity(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'critical' || normalized === 'block')
        return 'critical';
    if (normalized === 'high')
        return 'high';
    if (normalized === 'warn'
        || normalized === 'warning'
        || normalized === 'medium'
        || normalized === 'low') {
        return 'warning';
    }
    return 'info';
}
function toVerifyVerdict(value) {
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (normalized === 'PASS' || normalized === 'WARN' || normalized === 'FAIL') {
        return normalized;
    }
    return 'FAIL';
}
function normalizeScopeIssueMessage(rawMessage) {
    const message = asStringValue(rawMessage);
    return message || 'File modified outside intended scope';
}
function pushVerifyIssue(target, seen, key, value) {
    if (seen.has(key))
        return;
    seen.add(key);
    target.push(value);
}
function dedupeTriageItems(items) {
    const seen = new Set();
    const output = [];
    for (const item of items) {
        const key = `${item.source}|${item.file.toLowerCase()}|${item.policy.toLowerCase()}|${item.message.toLowerCase()}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        output.push(item);
    }
    return output;
}
function toCanonicalVerifyOutput(payload) {
    const verdict = toVerifyVerdict(payload.verdict);
    const violations = [];
    const warnings = [];
    const scopeIssues = [];
    const seenViolations = new Set();
    const seenWarnings = new Set();
    const seenScopeIssues = new Set();
    const addScopeIssue = (fileRaw, messageRaw, extra) => {
        const file = asStringValue(fileRaw) || 'unknown';
        const message = normalizeScopeIssueMessage(messageRaw);
        // Import-edge findings live on a different keying axis than path-touch
        // findings: the same source file can host multiple distinct edges (e.g.
        // `from forbidden.a import x` and `from forbidden.b import y`). Use the
        // resolved boundary + target to keep both as separate issues.
        const importEdgeRaw = extra?.importEdge && typeof extra.importEdge === 'object' && !Array.isArray(extra.importEdge)
            ? extra.importEdge
            : null;
        const policyRaw = asStringValue(extra?.policy);
        const hasMeaningfulMetadata = importEdgeRaw || (policyRaw && policyRaw.length > 0);
        // Reviewer-ergonomics fix (final-pilot §6.7): when the same file is
        // already represented in scopeIssues by a structured entry (import-edge
        // OR policy-bearing path-touch), suppress further unstructured
        // duplicate entries. They contribute noise without adding signal.
        if (!hasMeaningfulMetadata) {
            const fileLower = file.toLowerCase();
            const dupeExists = scopeIssues.some((s) => s.file.toLowerCase() === fileLower && (s.policy || s.importEdge));
            if (dupeExists)
                return;
        }
        const key = importEdgeRaw
            ? `${file.toLowerCase()}|edge|${(asStringValue(importEdgeRaw.importTarget) ?? '').toLowerCase()}|${(asStringValue(importEdgeRaw.resolvedBoundary) ?? '').toLowerCase()}`
            : file.toLowerCase();
        const issue = { file, message };
        // Preserve intent-runtime governance classification when the local
        // scope-guard produced it. These fields are part of the canonical
        // contract and must not be silently dropped during canonicalisation.
        const rawPolicy = asStringValue(extra?.policy);
        if (rawPolicy === 'forbidden' || rawPolicy === 'review-required' || rawPolicy === 'out-of-scope' || rawPolicy === 'generated-code' || rawPolicy === 'unscoped') {
            issue.policy = rawPolicy;
        }
        const rawBoundary = asStringValue(extra?.boundaryType);
        if (rawBoundary === 'sensitive' || rawBoundary === 'infra' || rawBoundary === 'ci' ||
            rawBoundary === 'dependency-manifest' || rawBoundary === 'service' || rawBoundary === 'module' ||
            rawBoundary === 'generated-code' || rawBoundary === 'unspecified') {
            issue.boundaryType = rawBoundary;
        }
        if (importEdgeRaw) {
            const sourceFile = asStringValue(importEdgeRaw.sourceFile) ?? '';
            const importTarget = asStringValue(importEdgeRaw.importTarget) ?? '';
            const resolvedTargetPath = asStringValue(importEdgeRaw.resolvedTargetPath) ?? '';
            const resolvedBoundary = asStringValue(importEdgeRaw.resolvedBoundary) ?? '';
            const sourceLineRaw = importEdgeRaw.sourceLine;
            const sourceLine = typeof sourceLineRaw === 'number' && Number.isFinite(sourceLineRaw) ? sourceLineRaw : 0;
            const edgeKind = asStringValue(importEdgeRaw.edgeKind) ?? '';
            const language = asStringValue(importEdgeRaw.language) ?? '';
            const allowedKinds = new Set(['static', 'relative', 'dynamic', 'require', 'side-effect']);
            const allowedLanguages = new Set(['python', 'typescript', 'javascript']);
            if (sourceFile && importTarget && resolvedBoundary && allowedKinds.has(edgeKind) && allowedLanguages.has(language)) {
                issue.importEdge = {
                    sourceFile,
                    sourceLine,
                    importTarget,
                    resolvedTargetPath: resolvedTargetPath || resolvedBoundary,
                    resolvedBoundary,
                    edgeKind,
                    language,
                    deterministic: true,
                    replayStable: true,
                };
            }
        }
        pushVerifyIssue(scopeIssues, seenScopeIssues, key, issue);
    };
    const addWarning = (fileRaw, messageRaw, policyRaw) => {
        const file = asStringValue(fileRaw) || 'unknown';
        const message = asStringValue(messageRaw) || 'Warning detected';
        const policy = asStringValue(policyRaw) || 'warning';
        const key = `${file.toLowerCase()}|${message.toLowerCase()}|${policy.toLowerCase()}`;
        pushVerifyIssue(warnings, seenWarnings, key, { file, message, policy });
    };
    const addViolation = (fileRaw, messageRaw, policyRaw, severityRaw) => {
        const file = asStringValue(fileRaw) || 'unknown';
        const message = asStringValue(messageRaw) || 'Policy violation detected';
        const policy = asStringValue(policyRaw) || 'unknown_policy';
        const severity = toVerifySeverity(severityRaw);
        const key = `${file.toLowerCase()}|${message.toLowerCase()}|${policy.toLowerCase()}|${severity}`;
        pushVerifyIssue(violations, seenViolations, key, { file, message, policy, severity });
    };
    const rawScopeIssues = Array.isArray(payload.scopeIssues) ? payload.scopeIssues : [];
    for (const item of rawScopeIssues) {
        const record = asObjectRecord(item);
        if (record) {
            addScopeIssue(record.file, record.message, {
                policy: record.policy,
                boundaryType: record.boundaryType,
                importEdge: record.importEdge,
            });
        }
        else {
            addScopeIssue(item, null);
        }
    }
    // Legacy `bloatFiles` passthrough — preserves backward-compat with
    // pre-intent-runtime envelopes that did not emit structured scopeIssues.
    // When the modern intent-runtime is active, the canonical scopeIssues
    // already carry `policy` + `boundaryType` for every breach, so we skip
    // any bloat entry whose file path is already represented to avoid the
    // null-policy duplicate (closes deep-OSS §6.7 / final-pilot §6.7).
    const rawBloatFiles = Array.isArray(payload.bloatFiles) ? payload.bloatFiles : [];
    const knownScopeFiles = new Set(scopeIssues.map((s) => s.file.toLowerCase()));
    for (const item of rawBloatFiles) {
        const fileStr = asStringValue(item);
        if (fileStr && knownScopeFiles.has(fileStr.toLowerCase()))
            continue;
        addScopeIssue(item, null);
    }
    const rawWarnings = Array.isArray(payload.warnings) ? payload.warnings : [];
    for (const item of rawWarnings) {
        const record = asObjectRecord(item);
        if (record) {
            addWarning(record.file, record.message, record.policy ?? record.rule);
        }
        else if (typeof item === 'string') {
            addWarning('unknown', item, 'warning');
        }
    }
    const rawViolations = Array.isArray(payload.violations) ? payload.violations : [];
    for (const item of rawViolations) {
        const record = asObjectRecord(item);
        if (!record)
            continue;
        const file = record.file;
        const message = record.message;
        const policy = record.policy ?? record.rule;
        const severity = toVerifySeverity(record.severity);
        const combined = `${String(policy || '').toLowerCase()} ${String(message || '').toLowerCase()}`;
        const isScopeIssue = combined.includes('scope_guard')
            || combined.includes('scope')
            || combined.includes('outside the plan')
            || combined.includes('out of scope');
        if (isScopeIssue) {
            addScopeIssue(file, message);
            continue;
        }
        const policyStr = String(policy || '').toLowerCase();
        const isArtifactCheck = policyStr === 'deterministic_artifacts_required'
            || policyStr === 'signed_artifacts_required';
        if (isArtifactCheck) {
            addWarning(file, message, policy);
            continue;
        }
        if (severity === 'warning' || severity === 'info') {
            addWarning(file, message, policy);
            continue;
        }
        addViolation(file, message, policy, severity);
    }
    const payloadMessage = asStringValue(payload.message);
    if (payloadMessage
        && violations.length === 0
        && warnings.length === 0
        && scopeIssues.length === 0) {
        addWarning('unknown', payloadMessage, 'verify_result');
    }
    const summaryRecord = asObjectRecord(payload.summary);
    const fileSet = new Set();
    for (const violation of violations)
        fileSet.add(violation.file);
    for (const warning of warnings)
        fileSet.add(warning.file);
    for (const scopeIssue of scopeIssues)
        fileSet.add(scopeIssue.file);
    const totalFilesChanged = (() => {
        const fromSummary = summaryRecord ? asNumberValue(summaryRecord.totalFilesChanged) : null;
        if (fromSummary !== null)
            return Math.max(0, Math.floor(fromSummary));
        const blastRadius = asObjectRecord(payload.blastRadius);
        const fromBlastRadius = blastRadius ? asNumberValue(blastRadius.filesChanged) : null;
        if (fromBlastRadius !== null)
            return Math.max(0, Math.floor(fromBlastRadius));
        return fileSet.size;
    })();
    const driftScoreRaw = asNumberValue(payload.driftScore);
    const driftScore = driftScoreRaw === null
        ? undefined
        : Math.max(0, Math.min(100, Math.round(driftScoreRaw)));
    const expediteModeUsed = resolveExpediteModeFromPayload(payload);
    const scopeTriageItems = scopeIssues.map((item) => ({
        file: item.file,
        message: item.message,
        policy: 'scope_guard',
        severity: 'block',
        source: 'scope',
    }));
    const violationTriageItems = violations.map((item) => ({
        file: item.file,
        message: item.message,
        policy: item.policy,
        severity: item.severity,
        source: 'violation',
    }));
    const warningTriageItems = warnings.map((item) => ({
        file: item.file,
        message: item.message,
        policy: item.policy,
        severity: 'warning',
        source: 'warning',
    }));
    const defaultBlockingItems = dedupeTriageItems([
        ...scopeTriageItems,
        ...violationTriageItems.filter((item) => item.severity === 'critical' || item.severity === 'high'),
    ]);
    const defaultAdvisoryItems = dedupeTriageItems([
        ...warningTriageItems,
        ...violationTriageItems.filter((item) => item.severity === 'warning' || item.severity === 'info'),
    ]);
    const expediteBlockingItems = dedupeTriageItems([
        ...scopeTriageItems.filter((item) => isCriticalScopeBreach(item.file, item.message)),
        ...violationTriageItems.filter((item) => isSecurityOrAuthViolation(item.file, item.policy, item.message)),
        ...warningTriageItems
            .filter((item) => isSecurityOrAuthViolation(item.file, item.policy, item.message))
            .map((item) => ({
            ...item,
            source: 'violation',
        })),
    ]);
    const expediteItems = dedupeTriageItems([
        ...scopeTriageItems
            .filter((item) => !isCriticalScopeBreach(item.file, item.message))
            .map((item) => ({
            ...item,
            source: 'expedite',
        })),
        ...violationTriageItems
            .filter((item) => !isSecurityOrAuthViolation(item.file, item.policy, item.message))
            .map((item) => ({
            ...item,
            source: 'expedite',
        })),
        ...warningTriageItems
            .filter((item) => !isSecurityOrAuthViolation(item.file, item.policy, item.message))
            .map((item) => ({
            ...item,
            source: 'expedite',
        })),
    ]);
    const rawIntentIssues = Array.isArray(payload.intentIssues) ? payload.intentIssues : [];
    const intentDomains = Array.isArray(payload.intentDomains) ? payload.intentDomains : [];
    const intentSummary = (payload.intentSummary ?? null);
    const rawFlowIssues = Array.isArray(payload.flowIssues) ? payload.flowIssues : [];
    const rawRegressions = Array.isArray(payload.regressions) ? payload.regressions : [];
    const intentBlockingTriageItems = rawIntentIssues
        .filter((issue) => issue.severity === 'high')
        .map((issue) => ({
        file: (issue.files?.[0]) ?? 'intent-analysis',
        message: issue.message,
        policy: issue.rule,
        severity: 'high',
        source: 'violation',
    }));
    const intentAdvisoryTriageItems = rawIntentIssues
        .filter((issue) => issue.severity === 'medium')
        .map((issue) => ({
        file: (issue.files?.[0]) ?? 'intent-analysis',
        message: issue.message,
        policy: issue.rule,
        severity: 'warning',
        source: 'warning',
    }));
    const flowBlockingTriageItems = rawFlowIssues
        .filter((issue) => issue.severity === 'high')
        .map((issue) => ({
        file: (issue.files?.[0]) ?? 'flow-analysis',
        message: issue.message,
        policy: issue.rule,
        severity: 'high',
        source: 'violation',
    }));
    const flowAdvisoryTriageItems = rawFlowIssues
        .filter((issue) => issue.severity === 'medium')
        .map((issue) => ({
        file: (issue.files?.[0]) ?? 'flow-analysis',
        message: issue.message,
        policy: issue.rule,
        severity: 'warning',
        source: 'warning',
    }));
    let blockingItems = expediteModeUsed ? expediteBlockingItems : defaultBlockingItems;
    let advisoryItems = expediteModeUsed ? expediteItems : defaultAdvisoryItems;
    if (intentBlockingTriageItems.length > 0) {
        blockingItems = dedupeTriageItems([...blockingItems, ...intentBlockingTriageItems]);
    }
    if (intentAdvisoryTriageItems.length > 0) {
        advisoryItems = dedupeTriageItems([...advisoryItems, ...intentAdvisoryTriageItems]);
    }
    if (flowBlockingTriageItems.length > 0) {
        blockingItems = dedupeTriageItems([...blockingItems, ...flowBlockingTriageItems]);
    }
    if (flowAdvisoryTriageItems.length > 0) {
        advisoryItems = dedupeTriageItems([...advisoryItems, ...flowAdvisoryTriageItems]);
    }
    const regressionBlockingTriageItems = rawRegressions.map((regression) => ({
        file: 'regression-analysis',
        message: regression.message,
        policy: regression.rule,
        severity: 'high',
        source: 'violation',
    }));
    if (regressionBlockingTriageItems.length > 0) {
        blockingItems = dedupeTriageItems([...regressionBlockingTriageItems, ...blockingItems]);
    }
    const grade = verdict === 'PASS' ? 'A' : verdict === 'WARN' ? 'C' : 'F';
    const canonical = {
        grade,
        score: violations.length === 0 && warnings.length === 0 && scopeIssues.length === 0 ? 100 : 0,
        verdict,
        summary: {
            totalFilesChanged,
            totalViolations: violations.length,
            totalWarnings: warnings.length,
            totalScopeIssues: scopeIssues.length,
        },
        violations,
        warnings,
        scopeIssues,
        blockingCount: blockingItems.length,
        advisoryCount: advisoryItems.length,
        blockingItems,
        advisoryItems,
        intentIssues: rawIntentIssues,
        intentDomains,
        intentSummary,
        flowIssues: rawFlowIssues,
        regressions: rawRegressions,
        expediteModeUsed,
        expediteCount: expediteModeUsed ? expediteItems.length : 0,
        expediteItems: expediteModeUsed ? expediteItems : [],
        expediteFollowUpChecklist: expediteModeUsed ? [...exports.EXPEDITE_FOLLOW_UP_CHECKLIST] : [],
        ...(expediteModeUsed ? { expediteNote: 'Expedite Mode used' } : {}),
        ...(typeof driftScore === 'number' ? { driftScore } : {}),
    };
    const passthroughKeys = [
        'message',
        'mode',
        'ciMode',
        'replayChecksum',
        'replayMode',
        'replayIntegrity',
        'policyOnly',
        'policyOnlySource',
        'policySources',
        'scopeGuardPassed',
        'policyLock',
        'policyCompilation',
        'policyExceptions',
        'policyGovernance',
        'changeContract',
        'runtimeGuard',
        'governanceDecision',
        'intentGovernance',
        'engineeringContext',
        'driftIntelligence',
        'orgGovernance',
        'aiChangeLog',
        'verificationSource',
        'tier',
        'aiDebt',
        'blastRadius',
        'suspiciousChange',
        'policyDecision',
        'policyPack',
        'changeContractViolations',
        'governanceVerification',
        'governanceFindings',
        'structuralViolations',
        'structuralRulesApplied',
        'structuralSuppressedCount',
        // Intent-runtime activation envelope: surfaces which runtime mode the
        // verify ran in (full / synthesised-context / structural-only) plus the
        // identifiers needed to reconnect dashboard + replay surfaces to the
        // active intent contract. Must survive canonicalisation.
        'intentRuntime',
        // Capability envelope: machine-readable declaration of which governance
        // layers actually executed (deterministic vs degraded vs unavailable),
        // so enterprise CI never has to infer silent downgrades from absence
        // of fields.
        'runtimeCapabilities',
    ];
    const canonicalMutable = canonical;
    for (const key of passthroughKeys) {
        const value = payload[key];
        if (Object.prototype.hasOwnProperty.call(payload, key) && value !== undefined && value !== null) {
            canonicalMutable[key] = value;
        }
    }
    canonical.violations = canonical.violations.map((item) => ({
        ...item,
        rule: item.policy,
    }));
    canonical.warnings = canonical.warnings.map((item) => ({
        ...item,
        rule: item.policy,
    }));
    return canonical;
}
function emitCanonicalVerifyJson(payload, onEmit) {
    const canonical = toCanonicalVerifyOutput((0, canonical_pipeline_1.attachCanonicalGovernance)(payload));
    onEmit?.(canonical);
    const serialized = Buffer.from(`${JSON.stringify(canonical, null, 2)}\n`, 'utf-8');
    try {
        let offset = 0;
        while (offset < serialized.length) {
            try {
                const written = (0, fs_1.writeSync)(1, serialized, offset, serialized.length - offset);
                if (written <= 0)
                    break;
                offset += written;
            }
            catch (error) {
                const code = error.code;
                if (code === 'EAGAIN' || code === 'EWOULDBLOCK') {
                    continue;
                }
                throw error;
            }
        }
    }
    catch {
        process.stdout.write(serialized.toString('utf-8'));
    }
}
function buildDeterministicLayerSummary(payload) {
    const verdict = asStringValue(payload.verdict) || 'UNKNOWN';
    const mode = asStringValue(payload.mode) || 'unknown';
    const policyOnly = payload.policyOnly === true;
    const scopeGuardPassed = asBooleanFlag(payload.scopeGuardPassed);
    const violations = asObjectArray(payload.violations);
    const policyViolations = violations.filter((entry) => {
        const rule = String(entry.rule || '').toLowerCase();
        return (!rule.includes('scope_guard')
            && !rule.includes('change_contract')
            && !rule.includes('runtime_guard')
            && !rule.includes('deterministic_artifacts_required')
            && !rule.includes('signed_artifacts_required'));
    });
    const policyBlocking = policyViolations.filter((entry) => String(entry.severity || '').toLowerCase() === 'block');
    const policyWarnings = policyViolations.filter((entry) => String(entry.severity || '').toLowerCase() === 'warn');
    const changeContract = asObjectRecord(payload.changeContract);
    const changeContractValid = asBooleanFlag(changeContract?.valid);
    const changeContractEnforced = changeContract?.enforced === true;
    const changeContractViolations = Array.isArray(changeContract?.violations)
        ? (changeContract?.violations).length
        : 0;
    const explicitContractViolations = violations.filter((entry) => {
        const rule = String(entry.rule || '').toLowerCase();
        return rule.includes('scope_guard') || rule.includes('change_contract');
    }).length;
    const runtimeGuard = asObjectRecord(payload.runtimeGuard);
    const runtimeGuardRequired = runtimeGuard?.required === true;
    const runtimeGuardPass = asBooleanFlag(runtimeGuard?.pass);
    const runtimeGuardViolations = Array.isArray(runtimeGuard?.violations)
        ? (runtimeGuard?.violations).length
        : violations.filter((entry) => String(entry.rule || '').toLowerCase().includes('runtime_guard')).length;
    const policyCompilation = asObjectRecord(payload.policyCompilation);
    const deterministicRuleCount = asNumberValue(policyCompilation?.deterministicRuleCount);
    const unmatchedStatements = asNumberValue(policyCompilation?.unmatchedStatements);
    let policyGateStatus = 'pass';
    if (policyBlocking.length > 0) {
        policyGateStatus = 'fail';
    }
    else if (policyWarnings.length > 0 || verdict === 'WARN') {
        policyGateStatus = 'warn';
    }
    let contractGateStatus = 'not_applicable';
    if (!policyOnly) {
        contractGateStatus = 'pass';
        if (changeContractEnforced
            && (changeContractValid === false
                || changeContractViolations > 0
                || explicitContractViolations > 0
                || scopeGuardPassed === false)) {
            contractGateStatus = 'fail';
        }
        else if (!changeContractEnforced && (changeContractViolations > 0 || explicitContractViolations > 0)) {
            contractGateStatus = 'warn';
        }
    }
    let runtimeGuardStatus = 'not_applicable';
    if (runtimeGuardRequired) {
        runtimeGuardStatus = runtimeGuardPass === false || runtimeGuardViolations > 0 ? 'fail' : 'pass';
    }
    else if (runtimeGuardViolations > 0) {
        runtimeGuardStatus = 'fail';
    }
    return {
        policyGate: {
            status: policyGateStatus,
            blockingViolations: policyBlocking.length,
            warningViolations: policyWarnings.length,
            deterministicRuleCount: deterministicRuleCount ?? null,
            unmatchedStatements: unmatchedStatements ?? null,
        },
        contractGate: {
            status: contractGateStatus,
            enforced: changeContractEnforced,
            valid: changeContractValid,
            violationCount: changeContractViolations + explicitContractViolations,
            mode,
        },
        runtimeGuardGate: {
            status: runtimeGuardStatus,
            required: runtimeGuardRequired,
            pass: runtimeGuardPass,
            violationCount: runtimeGuardViolations,
        },
    };
}
//# sourceMappingURL=verify-output.js.map