"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMISSION_CONTRACT_VERSION = exports.ADMISSION_CONTRACT_ID = exports.RUNTIME_COMPATIBILITY_MANIFEST_SCHEMA_VERSION = exports.RUNTIME_COMPATIBILITY_MANIFEST_VERSION = exports.RUNTIME_COMPATIBILITY_CONTRACT_VERSION = exports.RUNTIME_COMPATIBILITY_CONTRACT_ID = exports.CLI_JSON_CONTRACT_VERSION = void 0;
exports.compareCalendarContractVersion = compareCalendarContractVersion;
exports.getRuntimeCompatibilityManifest = getRuntimeCompatibilityManifest;
exports.compareSemver = compareSemver;
exports.isSemverAtLeast = isSemverAtLeast;
exports.getMinimumCompatiblePeerVersion = getMinimumCompatiblePeerVersion;
exports.getRuntimeMinimumPeerVersionMatrix = getRuntimeMinimumPeerVersionMatrix;
exports.buildRuntimeCompatibilityDescriptor = buildRuntimeCompatibilityDescriptor;
exports.evaluateRuntimePeerCompatibility = evaluateRuntimePeerCompatibility;
exports.parseCliPlanJsonPayload = parseCliPlanJsonPayload;
exports.parseCliApplyJsonPayload = parseCliApplyJsonPayload;
exports.parseCliVerifyJsonPayload = parseCliVerifyJsonPayload;
exports.parseVerifyOutput = parseVerifyOutput;
exports.parseCliPromptJsonPayload = parseCliPromptJsonPayload;
exports.parseCliContractImportJsonPayload = parseCliContractImportJsonPayload;
exports.parseCliShipJsonPayload = parseCliShipJsonPayload;
exports.parseCliShipRunsJsonPayload = parseCliShipRunsJsonPayload;
exports.parseCliShipResumeJsonPayload = parseCliShipResumeJsonPayload;
exports.parseCliShipAttestationVerifyJsonPayload = parseCliShipAttestationVerifyJsonPayload;
exports.parseCliCompatJsonPayload = parseCliCompatJsonPayload;
exports.CLI_JSON_CONTRACT_VERSION = '2026-06-19';
/** Compare YYYY-MM-DD contract stamps; returns null when either side is unparsable. */
function compareCalendarContractVersion(left, right) {
    const parse = (value) => {
        const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
        if (!match)
            return null;
        const ms = Date.parse(`${match[1]}T00:00:00.000Z`);
        return Number.isNaN(ms) ? null : ms;
    };
    const leftMs = parse(left);
    const rightMs = parse(right);
    if (leftMs === null || rightMs === null)
        return null;
    if (leftMs === rightMs)
        return 0;
    return leftMs < rightMs ? -1 : 1;
}
__exportStar(require("./intelligence"), exports);
__exportStar(require("./repo-intelligence-v2"), exports);
__exportStar(require("./proposed-change-validation"), exports);
__exportStar(require("./status-vocabulary"), exports);
__exportStar(require("./verification"), exports);
__exportStar(require("./remediation"), exports);
__exportStar(require("./admission"), exports);
__exportStar(require("./pilot-funnel"), exports);
__exportStar(require("./activation"), exports);
__exportStar(require("./activation-journey"), exports);
__exportStar(require("./first-value-proof"), exports);
__exportStar(require("./pilot-setup"), exports);
__exportStar(require("./manager-evidence"), exports);
__exportStar(require("./governance-reality"), exports);
__exportStar(require("./typescript-governance-quality-v1"), exports);
__exportStar(require("./progressive-authority"), exports);
__exportStar(require("./integrations-compatibility-v1"), exports);
__exportStar(require("./runtime-risk-pack-v1"), exports);
__exportStar(require("./runtime-policy-config"), exports);
exports.RUNTIME_COMPATIBILITY_CONTRACT_ID = 'neurcode-runtime-compatibility';
exports.RUNTIME_COMPATIBILITY_CONTRACT_VERSION = '2026-04-04';
exports.RUNTIME_COMPATIBILITY_MANIFEST_VERSION = '2026-06-19.1';
exports.RUNTIME_COMPATIBILITY_MANIFEST_SCHEMA_VERSION = 1;
/**
 * Runtime Admission contract (Phase A — Provenance Core). Additive: surfaces a
 * version for the self-attested admission artifact + coverage manifest so the
 * future Action and backend can negotiate compatibility. No enforcement yet.
 */
exports.ADMISSION_CONTRACT_ID = 'neurcode-runtime-admission';
exports.ADMISSION_CONTRACT_VERSION = '2026-06-02';
const RUNTIME_COMPATIBILITY_MANIFEST = {
    schemaVersion: exports.RUNTIME_COMPATIBILITY_MANIFEST_SCHEMA_VERSION,
    manifestVersion: exports.RUNTIME_COMPATIBILITY_MANIFEST_VERSION,
    contractId: exports.RUNTIME_COMPATIBILITY_CONTRACT_ID,
    runtimeContractVersion: exports.RUNTIME_COMPATIBILITY_CONTRACT_VERSION,
    cliJsonContractVersion: exports.CLI_JSON_CONTRACT_VERSION,
    admissionContractVersion: exports.ADMISSION_CONTRACT_VERSION,
    minimumPeerVersions: {
        cli: {
            action: '0.2.1',
            api: '0.2.0',
        },
        action: {
            cli: '0.9.35',
            api: '0.2.0',
        },
        api: {
            cli: '0.9.35',
            action: '0.2.1',
        },
    },
    validatedTriplets: [
        {
            id: 'current',
            channel: 'current',
            versions: {
                cli: '0.20.0',
                action: '0.3.0-rc.10',
                api: '0.3.1',
            },
            notes: 'Current release train validated in monorepo CI.',
        },
        {
            id: 'support-floor',
            channel: 'support-floor',
            versions: {
                cli: '0.9.35',
                action: '0.2.1',
                api: '0.2.0',
            },
            notes: 'Minimum supported compatibility floor for enterprise rollout.',
        },
    ],
};
const RUNTIME_MINIMUM_PEER_VERSIONS = RUNTIME_COMPATIBILITY_MANIFEST.minimumPeerVersions;
function getRuntimeCompatibilityManifest() {
    return {
        ...RUNTIME_COMPATIBILITY_MANIFEST,
        admissionContractVersion: RUNTIME_COMPATIBILITY_MANIFEST.admissionContractVersion,
        minimumPeerVersions: {
            cli: { ...RUNTIME_COMPATIBILITY_MANIFEST.minimumPeerVersions.cli },
            action: { ...RUNTIME_COMPATIBILITY_MANIFEST.minimumPeerVersions.action },
            api: { ...RUNTIME_COMPATIBILITY_MANIFEST.minimumPeerVersions.api },
        },
        validatedTriplets: RUNTIME_COMPATIBILITY_MANIFEST.validatedTriplets.map((triplet) => ({
            ...triplet,
            versions: { ...triplet.versions },
        })),
    };
}
function asRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label}: expected object`);
    }
    return value;
}
function asBoolean(record, key, label) {
    if (typeof record[key] !== 'boolean') {
        throw new Error(`${label}: expected ${key}:boolean`);
    }
    return record[key];
}
function asNumber(record, key, label) {
    if (typeof record[key] !== 'number' || Number.isNaN(record[key])) {
        throw new Error(`${label}: expected ${key}:number`);
    }
    return record[key];
}
function asString(record, key, label) {
    if (typeof record[key] !== 'string') {
        throw new Error(`${label}: expected ${key}:string`);
    }
    return record[key];
}
function asNullableString(record, key, label) {
    const value = record[key];
    if (value === null || typeof value === 'string') {
        return value;
    }
    throw new Error(`${label}: expected ${key}:string|null`);
}
function asArray(record, key, label) {
    if (!Array.isArray(record[key])) {
        throw new Error(`${label}: expected ${key}:array`);
    }
    return record[key];
}
function asOptionalRecord(record, key, label) {
    const value = record[key];
    if (value === undefined)
        return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label}: expected ${key}:object`);
    }
    return value;
}
function asOptionalString(record, key, label) {
    const value = record[key];
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string') {
        throw new Error(`${label}: expected ${key}:string`);
    }
    return value;
}
function asIntegerNumber(record, key, label) {
    const value = asNumber(record, key, label);
    return Math.max(0, Math.floor(value));
}
function asContractVersion(record) {
    const value = record.contractVersion;
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string') {
        throw new Error('contractVersion: expected string when present');
    }
    return value;
}
function asRuntimeComponent(record, key, label) {
    const value = asString(record, key, label);
    if (value === 'cli' || value === 'action' || value === 'api') {
        return value;
    }
    throw new Error(`${label}: expected ${key}:("cli"|"action"|"api")`);
}
function parseRuntimeMinimumPeerVersions(value, label) {
    if (value === undefined || value === null)
        return {};
    const record = asRecord(value, `${label}.minimumPeerVersions`);
    const next = {};
    for (const component of ['cli', 'action', 'api']) {
        const componentValue = record[component];
        if (componentValue === undefined)
            continue;
        if (typeof componentValue !== 'string' || !componentValue.trim()) {
            throw new Error(`${label}.minimumPeerVersions: expected ${component}:string`);
        }
        next[component] = componentValue.trim();
    }
    return next;
}
function parseRuntimeCompatibilityDescriptor(value, label) {
    const record = asRecord(value, `${label}.compatibility`);
    return {
        contractId: asString(record, 'contractId', `${label}.compatibility`),
        runtimeContractVersion: asString(record, 'runtimeContractVersion', `${label}.compatibility`),
        cliJsonContractVersion: asString(record, 'cliJsonContractVersion', `${label}.compatibility`),
        manifestVersion: asOptionalString(record, 'manifestVersion', `${label}.compatibility`),
        admissionContractVersion: asOptionalString(record, 'admissionContractVersion', `${label}.compatibility`),
        component: asRuntimeComponent(record, 'component', `${label}.compatibility`),
        componentVersion: asString(record, 'componentVersion', `${label}.compatibility`),
        minimumPeerVersions: parseRuntimeMinimumPeerVersions(record.minimumPeerVersions, `${label}.compatibility`),
    };
}
function parseSemver(value) {
    const normalized = value.trim().replace(/^v/i, '').split('+')[0].split('-')[0];
    const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match)
        return null;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);
    if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
        return null;
    }
    return [major, minor, patch];
}
function compareSemver(left, right) {
    const l = parseSemver(left);
    const r = parseSemver(right);
    if (!l || !r)
        return null;
    for (let idx = 0; idx < 3; idx += 1) {
        if (l[idx] > r[idx])
            return 1;
        if (l[idx] < r[idx])
            return -1;
    }
    return 0;
}
function isSemverAtLeast(actual, minimum) {
    const compare = compareSemver(actual, minimum);
    if (compare === null)
        return null;
    return compare >= 0;
}
function getMinimumCompatiblePeerVersion(component, peer) {
    return RUNTIME_MINIMUM_PEER_VERSIONS[component][peer];
}
function getRuntimeMinimumPeerVersionMatrix() {
    return {
        cli: { ...RUNTIME_MINIMUM_PEER_VERSIONS.cli },
        action: { ...RUNTIME_MINIMUM_PEER_VERSIONS.action },
        api: { ...RUNTIME_MINIMUM_PEER_VERSIONS.api },
    };
}
function buildRuntimeCompatibilityDescriptor(component, componentVersion) {
    return {
        contractId: exports.RUNTIME_COMPATIBILITY_CONTRACT_ID,
        runtimeContractVersion: exports.RUNTIME_COMPATIBILITY_CONTRACT_VERSION,
        cliJsonContractVersion: exports.CLI_JSON_CONTRACT_VERSION,
        manifestVersion: exports.RUNTIME_COMPATIBILITY_MANIFEST_VERSION,
        admissionContractVersion: exports.ADMISSION_CONTRACT_VERSION,
        component,
        componentVersion,
        minimumPeerVersions: { ...RUNTIME_MINIMUM_PEER_VERSIONS[component] },
    };
}
function evaluateRuntimePeerCompatibility(versions) {
    const issues = [];
    for (const component of ['cli', 'action', 'api']) {
        for (const peer of ['cli', 'action', 'api']) {
            if (peer === component)
                continue;
            const required = getMinimumCompatiblePeerVersion(component, peer);
            if (!required)
                continue;
            const actual = versions[peer];
            const compatible = isSemverAtLeast(actual, required);
            if (compatible === null) {
                issues.push({
                    component,
                    peer,
                    required,
                    actual,
                    code: 'UNPARSABLE_VERSION',
                });
            }
            else if (!compatible) {
                issues.push({
                    component,
                    peer,
                    required,
                    actual,
                    code: 'VERSION_BELOW_MINIMUM',
                });
            }
        }
    }
    return issues;
}
function parseCliPlanJsonPayload(value, label = 'plan') {
    const record = asRecord(value, label);
    return {
        ...record,
        contractVersion: asContractVersion(record),
        success: asBoolean(record, 'success', label),
        cached: asBoolean(record, 'cached', label),
        mode: asString(record, 'mode', label),
        planId: asNullableString(record, 'planId', label),
        sessionId: asNullableString(record, 'sessionId', label),
        timestamp: asString(record, 'timestamp', label),
        message: asString(record, 'message', label),
    };
}
function parseCliApplyJsonPayload(value, label = 'apply') {
    const record = asRecord(value, label);
    return {
        ...record,
        contractVersion: asContractVersion(record),
        success: asBoolean(record, 'success', label),
        planId: asString(record, 'planId', label),
        filesGenerated: asNumber(record, 'filesGenerated', label),
        files: asArray(record, 'files', label),
        writtenFiles: asArray(record, 'writtenFiles', label),
        message: asString(record, 'message', label),
    };
}
function parseCliVerifyJsonPayload(value, label = 'verify') {
    return parseVerifyOutput(value, label);
}
function parseVerifyOutput(value, label = 'verify') {
    const record = asRecord(value, label);
    const verdictRaw = asString(record, 'verdict', label).trim().toUpperCase();
    if (verdictRaw !== 'PASS' && verdictRaw !== 'WARN' && verdictRaw !== 'FAIL') {
        throw new Error(`${label}: expected verdict:"PASS"|"WARN"|"FAIL"`);
    }
    const summaryRecord = asRecord(record.summary, `${label}.summary`);
    const summary = {
        totalFilesChanged: asIntegerNumber(summaryRecord, 'totalFilesChanged', `${label}.summary`),
        totalViolations: asIntegerNumber(summaryRecord, 'totalViolations', `${label}.summary`),
        totalWarnings: asIntegerNumber(summaryRecord, 'totalWarnings', `${label}.summary`),
        totalScopeIssues: asIntegerNumber(summaryRecord, 'totalScopeIssues', `${label}.summary`),
    };
    const violations = asArray(record, 'violations', label).map((entry, index) => {
        const item = asRecord(entry, `${label}.violations[${index}]`);
        const severity = asString(item, 'severity', `${label}.violations[${index}]`).trim().toLowerCase();
        if (severity !== 'critical' && severity !== 'high' && severity !== 'warning' && severity !== 'info') {
            throw new Error(`${label}.violations[${index}]: expected severity:"critical"|"high"|"warning"|"info"`);
        }
        return {
            file: asString(item, 'file', `${label}.violations[${index}]`),
            message: asString(item, 'message', `${label}.violations[${index}]`),
            policy: asString(item, 'policy', `${label}.violations[${index}]`),
            severity,
        };
    });
    const warnings = asArray(record, 'warnings', label).map((entry, index) => {
        const item = asRecord(entry, `${label}.warnings[${index}]`);
        return {
            file: asString(item, 'file', `${label}.warnings[${index}]`),
            message: asString(item, 'message', `${label}.warnings[${index}]`),
            policy: asString(item, 'policy', `${label}.warnings[${index}]`),
        };
    });
    const scopeIssues = asArray(record, 'scopeIssues', label).map((entry, index) => {
        const item = asRecord(entry, `${label}.scopeIssues[${index}]`);
        const issue = {
            file: asString(item, 'file', `${label}.scopeIssues[${index}]`),
            message: asString(item, 'message', `${label}.scopeIssues[${index}]`),
        };
        const rawPolicy = item.policy;
        if (typeof rawPolicy === 'string' && rawPolicy.length > 0) {
            const allowedPolicies = ['forbidden', 'review-required', 'out-of-scope', 'generated-code', 'unscoped'];
            if (allowedPolicies.includes(rawPolicy)) {
                issue.policy = rawPolicy;
            }
        }
        const rawBoundary = item.boundaryType;
        if (typeof rawBoundary === 'string' && rawBoundary.length > 0) {
            const allowedBoundaries = [
                'sensitive', 'infra', 'ci', 'dependency-manifest', 'service', 'module', 'generated-code', 'unspecified',
            ];
            if (allowedBoundaries.includes(rawBoundary)) {
                issue.boundaryType = rawBoundary;
            }
        }
        const rawImportEdge = item.importEdge;
        if (rawImportEdge && typeof rawImportEdge === 'object' && !Array.isArray(rawImportEdge)) {
            const edgeRecord = rawImportEdge;
            const allowedEdgeKinds = ['static', 'relative', 'dynamic', 'require', 'side-effect'];
            const allowedEdgeLanguages = ['python', 'typescript', 'javascript'];
            const sourceFile = edgeRecord.sourceFile;
            const importTarget = edgeRecord.importTarget;
            const resolvedTargetPath = edgeRecord.resolvedTargetPath;
            const resolvedBoundary = edgeRecord.resolvedBoundary;
            const sourceLine = edgeRecord.sourceLine;
            const edgeKind = edgeRecord.edgeKind;
            const language = edgeRecord.language;
            if (typeof sourceFile === 'string'
                && typeof importTarget === 'string'
                && typeof resolvedTargetPath === 'string'
                && typeof resolvedBoundary === 'string'
                && typeof sourceLine === 'number'
                && Number.isFinite(sourceLine)
                && typeof edgeKind === 'string'
                && typeof language === 'string'
                && allowedEdgeKinds.includes(edgeKind)
                && allowedEdgeLanguages.includes(language)) {
                issue.importEdge = {
                    sourceFile,
                    sourceLine,
                    importTarget,
                    resolvedTargetPath,
                    resolvedBoundary,
                    edgeKind: edgeKind,
                    language: language,
                    deterministic: true,
                    replayStable: true,
                };
            }
        }
        return issue;
    });
    const driftScoreRaw = record.driftScore;
    const driftScore = driftScoreRaw === undefined
        ? undefined
        : (typeof driftScoreRaw === 'number' && Number.isFinite(driftScoreRaw)
            ? Math.round(Math.max(0, Math.min(100, driftScoreRaw)))
            : (() => {
                throw new Error(`${label}: expected driftScore:number when present`);
            })());
    const governanceFindingsRaw = record.governanceFindings;
    if (governanceFindingsRaw !== undefined && !Array.isArray(governanceFindingsRaw)) {
        throw new Error(`${label}: expected governanceFindings:array when present`);
    }
    const governanceVerificationRaw = record.governanceVerification;
    if (governanceVerificationRaw !== undefined
        && (typeof governanceVerificationRaw !== 'object' || governanceVerificationRaw === null || Array.isArray(governanceVerificationRaw))) {
        throw new Error(`${label}: expected governanceVerification:object when present`);
    }
    return {
        verdict: verdictRaw,
        summary,
        violations,
        warnings,
        scopeIssues,
        ...(typeof driftScore === 'number' ? { driftScore } : {}),
        ...(governanceFindingsRaw !== undefined
            ? { governanceFindings: governanceFindingsRaw }
            : {}),
        ...(governanceVerificationRaw !== undefined
            ? {
                governanceVerification: governanceVerificationRaw,
            }
            : {}),
    };
}
function parseCliPromptJsonPayload(value, label = 'prompt') {
    const record = asRecord(value, label);
    return {
        ...record,
        contractVersion: asContractVersion(record),
        success: asBoolean(record, 'success', label),
        planId: asNullableString(record, 'planId', label),
        intent: asNullableString(record, 'intent', label),
        prompt: asNullableString(record, 'prompt', label),
        copied: asBoolean(record, 'copied', label),
        outputPath: asNullableString(record, 'outputPath', label),
        message: asString(record, 'message', label),
    };
}
function parseCliContractImportJsonPayload(value, label = 'contract-import') {
    const record = asRecord(value, label);
    const parseModeRaw = record.parseMode;
    let parseMode = null;
    if (parseModeRaw !== undefined && parseModeRaw !== null) {
        const parseModeValue = asString(record, 'parseMode', label);
        if (parseModeValue !== 'json' && parseModeValue !== 'text') {
            throw new Error(`${label}: expected parseMode:"json"|"text"|null`);
        }
        parseMode = parseModeValue;
    }
    const changeContractValue = record.changeContract;
    let changeContract;
    if (changeContractValue === null) {
        changeContract = null;
    }
    else if (changeContractValue !== undefined) {
        changeContract = asOptionalRecord(record, 'changeContract', label);
    }
    return {
        ...record,
        contractVersion: asContractVersion(record),
        success: asBoolean(record, 'success', label),
        provider: asNullableString(record, 'provider', label),
        planId: asNullableString(record, 'planId', label),
        sessionId: asNullableString(record, 'sessionId', label),
        projectId: asNullableString(record, 'projectId', label),
        parseMode,
        importedFiles: asNumber(record, 'importedFiles', label),
        warnings: asArray(record, 'warnings', label),
        changeContract,
        message: asString(record, 'message', label),
        timestamp: asString(record, 'timestamp', label),
    };
}
function parseCliShipJsonPayload(value, label = 'ship') {
    const record = asRecord(value, label);
    return {
        ...record,
        contractVersion: asContractVersion(record),
        success: asBoolean(record, 'success', label),
        status: asString(record, 'status', label),
        finalPlanId: asNullableString(record, 'finalPlanId', label),
        audit: asOptionalRecord(record, 'audit', label),
        error: asOptionalRecord(record, 'error', label),
    };
}
function parseCliShipRunsJsonPayload(value, label = 'ship-runs') {
    const record = asRecord(value, label);
    return {
        ...record,
        contractVersion: asContractVersion(record),
        runs: asArray(record, 'runs', label),
    };
}
function parseCliShipResumeJsonPayload(value, label = 'ship-resume') {
    const record = asRecord(value, label);
    return {
        ...record,
        contractVersion: asContractVersion(record),
        success: asBoolean(record, 'success', label),
        status: asString(record, 'status', label),
        error: asOptionalRecord(record, 'error', label),
    };
}
function parseCliShipAttestationVerifyJsonPayload(value, label = 'ship-attestation-verify') {
    const record = asRecord(value, label);
    return {
        ...record,
        contractVersion: asContractVersion(record),
        pass: asBoolean(record, 'pass', label),
        message: record.message === undefined ? undefined : asString(record, 'message', label),
        digest: asOptionalRecord(record, 'digest', label),
    };
}
function parseCliCompatJsonPayload(value, label = 'compat') {
    const record = asRecord(value, label);
    const component = asString(record, 'component', label);
    if (component !== 'cli') {
        throw new Error(`${label}: expected component:"cli"`);
    }
    return {
        ...record,
        contractVersion: asContractVersion(record),
        success: asBoolean(record, 'success', label),
        timestamp: asString(record, 'timestamp', label),
        component: 'cli',
        componentVersion: asString(record, 'componentVersion', label),
        compatibility: parseRuntimeCompatibilityDescriptor(record.compatibility, label),
    };
}
__exportStar(require("./typescript-governance-quality-v14"), exports);
//# sourceMappingURL=index.js.map