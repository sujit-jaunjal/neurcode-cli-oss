"use strict";
/**
 * Neurcode Runtime Policy Manifest (Iteration 13 — Enterprise Policy Builder).
 *
 * A source-free, portable representation of a repository's runtime-safety
 * governance: boundary globs + plan mode + the runtime-safety policy enums.
 * This is the export/import format behind `neurcode governance export|import`
 * and the dashboard Runtime Policy Builder. It carries NO source, diffs, prompts,
 * secrets, or repository file contents — only governance configuration.
 *
 * This module is intentionally dependency-free (no Node globals, no governance
 * runtime import) so it can run unchanged in the CLI and in the browser dashboard.
 * The enum vocabularies mirror the canonical Runtime Safety Kernel; the harness
 * asserts round-trip equivalence so the two surfaces cannot drift.
 *
 * Non-negotiable invariant: `runtimeSafetyPolicy.credentialWrites` is ALWAYS
 * `block`. The parser fail-closes — credential weakening, unknown enum values,
 * unknown fields, or malformed shapes are reported as errors AND coerced to the
 * safe default, so a caller that ignores `errors` can never silently weaken
 * enforcement.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_RUNTIME_POLICY_MANIFEST = exports.DEFAULT_RUNTIME_POLICY_SAFETY_PROFILE = exports.RUNTIME_POLICY_TRISTATE_MODES = exports.RUNTIME_POLICY_PLAN_MODES = exports.RUNTIME_POLICY_ENFORCEMENT_ACTIONS = exports.NEURCODE_RUNTIME_POLICY_MANIFEST_ID = void 0;
exports.isRuntimePolicyEnforcementAction = isRuntimePolicyEnforcementAction;
exports.isRuntimePolicyPlanMode = isRuntimePolicyPlanMode;
exports.normalizeRuntimePolicyGlob = normalizeRuntimePolicyGlob;
exports.parseRuntimePolicyManifest = parseRuntimePolicyManifest;
exports.buildRuntimePolicyManifest = buildRuntimePolicyManifest;
exports.NEURCODE_RUNTIME_POLICY_MANIFEST_ID = 'neurcode.policy.runtime.v1';
/** Enforcement vocabulary — mirrors the kernel `RuntimeSafetyEnforcementAction`. */
exports.RUNTIME_POLICY_ENFORCEMENT_ACTIONS = ['allow', 'warn', 'approval_required', 'block'];
/** Plan-control modes — mirrors the kernel `PlanControlMode`. */
exports.RUNTIME_POLICY_PLAN_MODES = ['observe', 'advise', 'enforce_after_freeze'];
/** Tri-state posture used by plan-coherence and duplicate-symbol checks. */
exports.RUNTIME_POLICY_TRISTATE_MODES = ['off', 'warn', 'block'];
const MAX_GLOBS_PER_FIELD = 1_000;
const MAX_GLOB_LENGTH = 1_024;
const GLOB_FIELDS = ['approvalRequiredGlobs', 'sensitiveGlobs', 'safeSupportGlobs', 'ignoredGlobs'];
const TOP_LEVEL_FIELDS = new Set([
    'manifestId',
    ...GLOB_FIELDS,
    'planMode',
    'planCoherence',
    'repoSymbolDuplicateMode',
    'runtimeSafetyPolicy',
]);
const SAFETY_ACTION_FIELDS = [
    'credentialWrites',
    'authRbac',
    'migrations',
    'dependencyManifests',
    'infraDeploy',
    'sensitiveSurfaces',
    'generatedFiles',
    'ordinaryFeatureFiles',
];
const SAFETY_FIELDS = new Set([...SAFETY_ACTION_FIELDS, 'planMode']);
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
/** Enterprise-default runtime-safety policy enums (mirrors ENTERPRISE_RUNTIME_SAFETY_V1_POLICY). */
exports.DEFAULT_RUNTIME_POLICY_SAFETY_PROFILE = Object.freeze({
    credentialWrites: 'block',
    authRbac: 'approval_required',
    migrations: 'approval_required',
    dependencyManifests: 'approval_required',
    infraDeploy: 'approval_required',
    sensitiveSurfaces: 'approval_required',
    generatedFiles: 'warn',
    ordinaryFeatureFiles: 'allow',
    planMode: 'advise',
});
/** Enterprise-default manifest with no extra boundary globs configured. */
exports.DEFAULT_RUNTIME_POLICY_MANIFEST = Object.freeze({
    manifestId: exports.NEURCODE_RUNTIME_POLICY_MANIFEST_ID,
    approvalRequiredGlobs: [],
    sensitiveGlobs: [],
    safeSupportGlobs: [],
    ignoredGlobs: [],
    planMode: 'advise',
    planCoherence: 'warn',
    repoSymbolDuplicateMode: 'warn',
    runtimeSafetyPolicy: { ...exports.DEFAULT_RUNTIME_POLICY_SAFETY_PROFILE },
});
function isRuntimePolicyEnforcementAction(value) {
    return typeof value === 'string' && exports.RUNTIME_POLICY_ENFORCEMENT_ACTIONS.includes(value);
}
function isRuntimePolicyPlanMode(value) {
    return typeof value === 'string' && exports.RUNTIME_POLICY_PLAN_MODES.includes(value);
}
function isTristateMode(value) {
    return typeof value === 'string' && exports.RUNTIME_POLICY_TRISTATE_MODES.includes(value);
}
function freshSafetyProfile() {
    return { ...exports.DEFAULT_RUNTIME_POLICY_SAFETY_PROFILE };
}
function freshManifest() {
    return {
        manifestId: exports.NEURCODE_RUNTIME_POLICY_MANIFEST_ID,
        approvalRequiredGlobs: [],
        sensitiveGlobs: [],
        safeSupportGlobs: [],
        ignoredGlobs: [],
        planMode: 'advise',
        planCoherence: 'warn',
        repoSymbolDuplicateMode: 'warn',
        runtimeSafetyPolicy: freshSafetyProfile(),
    };
}
/** Normalize a single glob the same way the CLI reader does (stable round-trips). */
function normalizeRuntimePolicyGlob(value) {
    return value.trim().replace(/^\.\//, '').replace(/\/+$/, '');
}
function normalizeGlobArray(value, field, errors) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value)) {
        errors.push(`${field} must be an array of strings`);
        return [];
    }
    if (value.length > MAX_GLOBS_PER_FIELD) {
        errors.push(`${field} exceeds ${MAX_GLOBS_PER_FIELD} entries`);
    }
    const out = [];
    for (const item of value.slice(0, MAX_GLOBS_PER_FIELD)) {
        if (typeof item !== 'string') {
            errors.push(`${field} entries must be strings`);
            continue;
        }
        if (item.length > MAX_GLOB_LENGTH) {
            errors.push(`${field} entry exceeds ${MAX_GLOB_LENGTH} characters`);
            continue;
        }
        if (/[\r\n\0]/.test(item)) {
            errors.push(`${field} entry must not contain control characters`);
            continue;
        }
        const normalized = normalizeRuntimePolicyGlob(item);
        if (normalized)
            out.push(normalized);
    }
    return Array.from(new Set(out)).sort();
}
function parseSafetyProfile(value, errors) {
    const policy = freshSafetyProfile();
    if (value === undefined)
        return policy;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push('runtimeSafetyPolicy must be an object');
        return policy;
    }
    const record = value;
    for (const key of Object.keys(record)) {
        if (DANGEROUS_KEYS.has(key)) {
            errors.push(`runtimeSafetyPolicy.${key} is a forbidden key`);
            continue;
        }
        if (!SAFETY_FIELDS.has(key))
            errors.push(`runtimeSafetyPolicy.${key} is an unknown field`);
    }
    for (const field of SAFETY_ACTION_FIELDS) {
        if (field === 'credentialWrites')
            continue;
        const fieldValue = record[field];
        if (fieldValue === undefined)
            continue;
        if (!isRuntimePolicyEnforcementAction(fieldValue)) {
            errors.push(`runtimeSafetyPolicy.${field} must be one of allow|warn|approval_required|block`);
            continue;
        }
        policy[field] = fieldValue;
    }
    // Non-negotiable invariant: credential/secret writes are always blocked.
    if (record.credentialWrites !== undefined && record.credentialWrites !== 'block') {
        errors.push("runtimeSafetyPolicy.credentialWrites must be 'block' — credential/secret writes are blocked locally in every plan mode and cannot be weakened");
    }
    policy.credentialWrites = 'block';
    if (record.planMode !== undefined) {
        if (!isRuntimePolicyPlanMode(record.planMode)) {
            errors.push('runtimeSafetyPolicy.planMode must be one of observe|advise|enforce_after_freeze');
        }
        else {
            policy.planMode = record.planMode;
        }
    }
    return policy;
}
/**
 * Hand-rolled, fail-closed parser for a {@link RuntimePolicyManifest}. Always
 * returns a complete, safe manifest plus a list of validation errors. Callers on
 * the import path MUST reject when `errors` is non-empty.
 */
function parseRuntimePolicyManifest(value) {
    const errors = [];
    const manifest = freshManifest();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push('manifest must be a JSON object');
        return { manifest, errors };
    }
    const record = value;
    for (const key of Object.keys(record)) {
        if (DANGEROUS_KEYS.has(key)) {
            errors.push(`${key} is a forbidden key`);
            continue;
        }
        if (!TOP_LEVEL_FIELDS.has(key))
            errors.push(`${key} is an unknown field`);
    }
    if (record.manifestId !== undefined && record.manifestId !== exports.NEURCODE_RUNTIME_POLICY_MANIFEST_ID) {
        errors.push(`manifestId must be '${exports.NEURCODE_RUNTIME_POLICY_MANIFEST_ID}'`);
    }
    for (const field of GLOB_FIELDS) {
        manifest[field] = normalizeGlobArray(record[field], field, errors);
    }
    // runtimeSafetyPolicy carries the authoritative plan mode.
    manifest.runtimeSafetyPolicy = parseSafetyProfile(record.runtimeSafetyPolicy, errors);
    if (record.planCoherence !== undefined) {
        if (!isTristateMode(record.planCoherence)) {
            errors.push('planCoherence must be one of off|warn|block');
        }
        else {
            manifest.planCoherence = record.planCoherence;
        }
    }
    if (record.repoSymbolDuplicateMode !== undefined) {
        if (!isTristateMode(record.repoSymbolDuplicateMode)) {
            errors.push('repoSymbolDuplicateMode must be one of off|warn|block');
        }
        else {
            manifest.repoSymbolDuplicateMode = record.repoSymbolDuplicateMode;
        }
    }
    // Top-level planMode mirrors runtimeSafetyPolicy.planMode. If present it must be
    // a valid enum and must agree with the safety profile's mode.
    if (record.planMode !== undefined) {
        if (!isRuntimePolicyPlanMode(record.planMode)) {
            errors.push('planMode must be one of observe|advise|enforce_after_freeze');
        }
        else if (record.planMode !== manifest.runtimeSafetyPolicy.planMode) {
            errors.push('planMode must match runtimeSafetyPolicy.planMode');
        }
    }
    // Single source of truth: the safety profile's plan mode wins.
    manifest.planMode = manifest.runtimeSafetyPolicy.planMode;
    return { manifest, errors };
}
/** Build a manifest from already-validated parts, normalizing globs and pinning the credential invariant. */
function buildRuntimePolicyManifest(input) {
    const safety = {
        ...freshSafetyProfile(),
        ...(input.runtimeSafetyPolicy ?? {}),
        credentialWrites: 'block',
    };
    return {
        manifestId: exports.NEURCODE_RUNTIME_POLICY_MANIFEST_ID,
        approvalRequiredGlobs: normalizeGlobArray(input.approvalRequiredGlobs, 'approvalRequiredGlobs', []),
        sensitiveGlobs: normalizeGlobArray(input.sensitiveGlobs, 'sensitiveGlobs', []),
        safeSupportGlobs: normalizeGlobArray(input.safeSupportGlobs, 'safeSupportGlobs', []),
        ignoredGlobs: normalizeGlobArray(input.ignoredGlobs, 'ignoredGlobs', []),
        planMode: safety.planMode,
        planCoherence: isTristateMode(input.planCoherence) ? input.planCoherence : 'warn',
        repoSymbolDuplicateMode: isTristateMode(input.repoSymbolDuplicateMode) ? input.repoSymbolDuplicateMode : 'warn',
        runtimeSafetyPolicy: safety,
    };
}
//# sourceMappingURL=runtime-policy-config.js.map