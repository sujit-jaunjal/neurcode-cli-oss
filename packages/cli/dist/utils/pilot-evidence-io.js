"use strict";
/**
 * Pilot Evidence Pack — repo-local I/O glue (Iteration 10).
 *
 * Reads the source-free runtime artifacts the Neurcode control plane already
 * persists and projects them into the narrow, source-free inputs consumed by the
 * pure builder in utils/pilot-evidence-pack.ts:
 *
 *   - .neurcode/sessions/<id>.change-record.json  (neurcode.governed-session-record.v1)
 *   - .neurcode/admission/<id>.json               (neurcode.admission-record.v1)
 *   - .neurcode/pilot-metrics.json                (rolling governance metrics)
 *
 * Hard rules:
 *   - NEVER read the raw `.neurcode/sessions/<id>.json` session log (large; may
 *     contain source-like trajectory data). Only the curated, source-free
 *     `.change-record.json` projection is read.
 *   - NEVER copy the admission record's natural-language `intentSummary` / goal
 *     prose. Intent is represented by its hash + categories only.
 *   - Every field is coerced defensively so a malformed artifact degrades to a
 *     count of zero / null rather than crashing the export.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.readPilotChangeRecords = readPilotChangeRecords;
exports.readPilotAdmissionRecords = readPilotAdmissionRecords;
exports.readPilotMetricsInput = readPilotMetricsInput;
exports.resolveCliVersion = resolveCliVersion;
exports.gatherPilotEvidenceInputs = gatherPilotEvidenceInputs;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const guided_eval_1 = require("./guided-eval");
const pilot_metrics_1 = require("./pilot-metrics");
// ── Defensive coercion helpers ────────────────────────────────────────────────
function asString(value) {
    return typeof value === 'string' && value.length > 0 ? value : null;
}
function asNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function asStringArray(value) {
    return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
}
function arrayLength(value) {
    return Array.isArray(value) ? value.length : 0;
}
function readJson(path) {
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function listJsonFiles(dir, filter) {
    try {
        if (!(0, node_fs_1.existsSync)(dir))
            return [];
        return (0, node_fs_1.readdirSync)(dir)
            .filter((name) => filter(name))
            .sort()
            .map((name) => (0, node_path_1.join)(dir, name));
    }
    catch {
        return [];
    }
}
function get(obj, key) {
    if (!obj)
        return null;
    const value = obj[key];
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
// ── Readers ───────────────────────────────────────────────────────────────────
/**
 * Project `.neurcode/sessions/*.change-record.json` into source-free session
 * inputs. The raw `<id>.json` session logs are intentionally never read.
 */
function readPilotChangeRecords(repoRoot) {
    const dir = (0, node_path_1.join)(repoRoot, '.neurcode', 'sessions');
    const files = listJsonFiles(dir, (name) => name.endsWith('.change-record.json'));
    const out = [];
    for (const file of files) {
        const j = readJson(file);
        if (!j)
            continue;
        const session = get(j, 'session');
        const counts = get(session, 'counts');
        const intentSummary = get(get(j, 'intent'), 'summary');
        const integrity = get(j, 'integrity');
        const facts = get(get(j, 'accountability'), 'facts');
        const plan = get(j, 'plan');
        const reviewBrief = get(j, 'reviewBrief');
        const sessionId = asString(session?.['sessionId']) ?? (0, node_path_1.basename)(file).replace(/\.change-record\.json$/, '');
        out.push({
            sessionId,
            status: asString(session?.['status']),
            scopeMode: asString(session?.['scopeMode']),
            trustLevel: asString(integrity?.['trustLevel']),
            verdict: asString(reviewBrief?.['verdict']),
            counts: {
                ok: asNumber(counts?.['ok']),
                warn: asNumber(counts?.['warn']),
                block: asNumber(counts?.['block']),
                approval: asNumber(counts?.['approval']),
                planEvents: asNumber(counts?.['planEvents']),
                events: asNumber(counts?.['events']),
            },
            intentHash: asString(intentSummary?.['intentHash']),
            intentCategories: asStringArray(intentSummary?.['categories']),
            approvals: {
                approvalRequired: facts?.['approvalRequired'] === true,
                exactPathApprovalOnly: facts?.['exactPathApprovalOnly'] === true,
                approvedExactPathCount: arrayLength(facts?.['approvedExactPaths']),
                neighborSensitiveBlocked: facts?.['neighboringSensitiveFilesBlocked'] === true,
                blockedBoundaryCount: arrayLength(facts?.['blockedBoundaries']),
                boundaryOwnerCount: arrayLength(facts?.['boundaryOwners']),
            },
            blockedBoundaries: asStringArray(facts?.['blockedBoundaries']),
            plan: {
                timelineCount: arrayLength(plan?.['timeline']),
                pendingAmendmentCount: arrayLength(plan?.['pendingAmendments']),
            },
            reuseAdvisoryCount: asNumber(facts?.['reuseAdvisoryCount']),
            evidenceReceipt: asString(facts?.['evidenceReceipt']),
            hashes: {
                recordHash: asString(integrity?.['recordHash']),
                replayHash: asString(integrity?.['replayHash']),
            },
        });
    }
    return out;
}
/**
 * Project `.neurcode/admission/*.json` into source-free admission inputs. The
 * record's `runtimeContext.intentSummary` prose is intentionally never read.
 */
function readPilotAdmissionRecords(repoRoot) {
    const dir = (0, node_path_1.join)(repoRoot, '.neurcode', 'admission');
    const files = listJsonFiles(dir, (name) => name.endsWith('.json'));
    const out = [];
    for (const file of files) {
        const j = readJson(file);
        if (!j)
            continue;
        const rc = get(j, 'runtimeContext');
        const counts = get(rc, 'counts');
        const paths = get(rc, 'paths');
        const integrity = get(rc, 'integrity');
        const receipt = get(integrity, 'receipt');
        const manifest = get(j, 'manifest');
        const deltaRaw = Array.isArray(manifest?.['delta']) ? manifest['delta'] : [];
        const delta = deltaRaw
            .map((entry) => {
            const e = entry && typeof entry === 'object' ? entry : {};
            return {
                path: asString(e['path']) ?? '',
                changeType: asString(e['changeType']) ?? 'unknown',
                oldObjectId: asString(e['oldObjectId']),
                newObjectId: asString(e['newObjectId']),
            };
        })
            .filter((e) => e.path.length > 0);
        const sessionId = asString(j['sessionId']) ?? (0, node_path_1.basename)(file).replace(/\.json$/, '');
        out.push({
            sessionId,
            attestationKind: asString(j['attestationKind']),
            trustLevel: asString(rc?.['trustLevel']),
            sessionStatus: asString(rc?.['sessionStatus']),
            counts: {
                changedPaths: asNumber(counts?.['changedPaths']),
                blockedPaths: asNumber(counts?.['blockedPaths']),
                suggestedApprovalPaths: asNumber(counts?.['suggestedApprovalPaths']),
                approvedExactPaths: asNumber(counts?.['approvedExactPaths']),
                deniedPaths: asNumber(counts?.['deniedPaths']),
                approvalRequiredSurfaces: asNumber(counts?.['approvalRequiredSurfaces']),
                owners: asNumber(counts?.['owners']),
                preWriteChecks: asNumber(counts?.['preWriteChecks']),
                allowedChecks: asNumber(counts?.['allowedChecks']),
                warningChecks: asNumber(counts?.['warningChecks']),
            },
            paths: {
                blocked: asStringArray(paths?.['blocked']),
                denied: asStringArray(paths?.['denied']),
                approvalRequiredSurfaces: asStringArray(paths?.['approvalRequiredSurfaces']),
                approvedExact: asStringArray(paths?.['approvedExact']),
                changed: asStringArray(paths?.['changed']),
            },
            manifest: {
                entryCount: asNumber(manifest?.['entryCount']),
                deltaHash: asString(manifest?.['deltaHash']),
                coverageSetHash: asString(manifest?.['coverageSetHash']),
                delta,
            },
            integrity: {
                sourceFree: integrity?.['sourceFree'] === true,
                replayHash: asString(integrity?.['replayHash']),
                evidenceIntegrityStatus: asString(integrity?.['evidenceIntegrityStatus']),
                receiptPresent: receipt?.['present'] === true,
            },
        });
    }
    return out;
}
/**
 * Project the local pilot-metrics rollup into source-free metric inputs. Returns
 * null when no `.neurcode/pilot-metrics.json` exists (an incomplete-pilot signal).
 */
function readPilotMetricsInput(repoRoot, days = 7) {
    const path = (0, node_path_1.join)(repoRoot, '.neurcode', 'pilot-metrics.json');
    if (!(0, node_fs_1.existsSync)(path))
        return null;
    const summary = (0, pilot_metrics_1.generatePilotSummary)(repoRoot, days);
    return {
        periodDays: summary.periodDays,
        totalVerifyRuns: summary.totalVerifyRuns,
        totalBlockingCaught: summary.totalBlockingCaught,
        totalStructuralCaught: summary.totalStructuralCaught,
        averagePassRate: summary.averagePassRate,
        suppressionRate: summary.suppressionRate,
        aiDebtTrend: summary.aiDebtTrend,
    };
}
/** Resolve the CLI's own package version without spawning a subprocess. */
function resolveCliVersion() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pkg = require('../../package.json');
        return typeof pkg?.version === 'string' ? pkg.version : null;
    }
    catch {
        return null;
    }
}
/**
 * Read every repo-local artifact and assemble the source-free builder input.
 * Synchronous and side-effect-free apart from reads; the optional brain
 * readiness is computed by the caller and threaded through.
 */
function gatherPilotEvidenceInputs(repoRoot, options) {
    return {
        generatedAt: options.generatedAt,
        cliVersion: options.cliVersion ?? resolveCliVersion(),
        repoRootHash: (0, guided_eval_1.hashRepoIdentity)(repoRoot),
        repoName: options.repoName ?? (0, node_path_1.basename)(repoRoot),
        sessions: readPilotChangeRecords(repoRoot),
        admissions: readPilotAdmissionRecords(repoRoot),
        metrics: readPilotMetricsInput(repoRoot, options.days ?? 7),
        brainReadiness: options.brainReadiness ?? null,
    };
}
//# sourceMappingURL=pilot-evidence-io.js.map