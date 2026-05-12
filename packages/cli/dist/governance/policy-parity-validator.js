"use strict";
/**
 * Policy Enforcement Parity Validator
 *
 * Closes the governance theatre gap: a policy can appear in policy.yml
 * claiming "deterministic" enforcement, but have zero structural rule
 * implementation. This validator surfaces those mismatches explicitly.
 *
 * Benchmark finding (Apache Airflow, 2026-05-12):
 *   7 of 15 policies were unenforced. Enterprise teams believed those
 *   policies were being checked. They were not.
 *
 * This module is called from `neurcode verify --policy-only` to emit
 * GOV_PARITY_MISMATCH advisory findings for every enforcement gap.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePolicyEnforcementParity = validatePolicyEnforcementParity;
exports.formatParityReport = formatParityReport;
/**
 * Validate enforcement parity between policy declarations and the structural rule engine.
 *
 * @param policyRules - Rules from the compiled/loaded policy (array of { id, name, enforcementType? })
 * @param registeredStructuralRuleIds - Set of rule IDs currently registered in StructuralRuleEngine
 * @returns PolicyParityReport + mismatch findings (one per unenforced deterministic policy)
 */
function validatePolicyEnforcementParity(policyRules, registeredStructuralRuleIds) {
    const entries = [];
    const findings = [];
    let deterministicCount = 0;
    let advisoryCount = 0;
    let semanticCount = 0;
    let noneCount = 0;
    const unenforced = [];
    for (const rule of policyRules) {
        const rawType = rule.enforcementType ?? 'none';
        const enforcementType = normalizeEnforcementType(rawType);
        const hasStructuralImpl = registeredStructuralRuleIds.has(rule.id);
        // Policy-engine rules (evaluated separately) — count as implemented if known
        const hasPolicyEngineImpl = KNOWN_POLICY_ENGINE_RULES.has(rule.id);
        entries.push({
            ruleId: rule.id,
            name: rule.name,
            enforcementType,
            hasStructuralImpl,
            hasPolicyEngineImpl,
        });
        switch (enforcementType) {
            case 'deterministic':
                deterministicCount++;
                break;
            case 'advisory':
                advisoryCount++;
                break;
            case 'semantic':
                semanticCount++;
                break;
            case 'none':
                noneCount++;
                break;
        }
        // Emit a mismatch finding if a policy claims deterministic enforcement
        // but has no matching rule implementation
        if (enforcementType === 'deterministic' && !hasStructuralImpl && !hasPolicyEngineImpl) {
            unenforced.push(rule.id);
            findings.push({
                ruleId: rule.id,
                policyName: rule.name,
                severity: 'advisory',
                governanceCode: 'GOV_PARITY_MISMATCH',
                message: `Policy "${rule.name ?? rule.id}" declares enforcementType: deterministic ` +
                    `but has no registered structural or policy-engine implementation. ` +
                    `This policy will NEVER produce a finding. ` +
                    `Either add a structural rule for ${rule.id}, change enforcementType to "none", ` +
                    `or remove the policy. ` +
                    `(Unenforced deterministic policies create false governance confidence.)`,
            });
        }
    }
    const enforced = deterministicCount - unenforced.length;
    const coveragePct = deterministicCount === 0
        ? 100 // no deterministic claims = 100% parity (vacuously true)
        : Math.round((enforced / deterministicCount) * 100);
    const report = {
        totalPolicies: policyRules.length,
        deterministicCount,
        advisoryCount,
        semanticCount,
        noneCount,
        coveragePct,
        unenforced,
        entries,
    };
    return { report, findings };
}
function normalizeEnforcementType(raw) {
    const v = raw.toLowerCase().trim();
    if (v === 'deterministic')
        return 'deterministic';
    if (v === 'advisory')
        return 'advisory';
    if (v === 'semantic')
        return 'semantic';
    return 'none';
}
/**
 * Known policy-engine rule IDs that are enforced via the policy YAML evaluator
 * (not via the structural rule engine). These are counted as implemented.
 */
const KNOWN_POLICY_ENGINE_RULES = new Set([
    'NO_HARDCODED_SECRETS',
    'REQUIRE_RESOURCE_TAGGING',
    'PY001_NO_BARE_EXCEPT',
    'PY003_ASYNC_SAFETY',
    'TS001_TYPED_BOUNDARIES',
    'GOV001_REPLAY_INTEGRITY_REQUIRED',
    'GOV002_SUPPRESSION_REQUIRES_JUSTIFICATION',
    'potential-secret-default',
    'potential-secret-high',
    'require-signed-ai-logs',
    'ai-change-log-integrity',
]);
/**
 * Generate a compact governance coverage summary string for CLI output.
 */
function formatParityReport(report) {
    const { totalPolicies, deterministicCount, advisoryCount, semanticCount, noneCount, coveragePct, unenforced } = report;
    const lines = [
        `Policy Enforcement Coverage: ${coveragePct}% (${deterministicCount - unenforced.length}/${deterministicCount} deterministic policies enforced)`,
        `  Total policies: ${totalPolicies} | Deterministic: ${deterministicCount} | Advisory: ${advisoryCount} | Semantic: ${semanticCount} | Unenforced: ${noneCount + unenforced.length}`,
    ];
    if (unenforced.length > 0) {
        lines.push(`  ⚠  Unenforced deterministic policies: ${unenforced.join(', ')}`);
        lines.push(`     These policies appear in policy.yml as deterministic but will NEVER produce findings.`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=policy-parity-validator.js.map