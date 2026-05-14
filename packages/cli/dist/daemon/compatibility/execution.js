"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCompatibilityExecutionHandlers = createCompatibilityExecutionHandlers;
const execution_bus_1 = require("../runtime/execution-bus");
const workspace_runtime_1 = require("../runtime/workspace-runtime");
const execution_actions_1 = require("../../utils/execution-actions");
const shaping_1 = require("../shaping");
function asNonEmptyString(value) {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function asStringArray(value) {
    if (!Array.isArray(value))
        return undefined;
    const entries = value
        .map((entry) => asNonEmptyString(entry))
        .filter((entry) => Boolean(entry));
    return entries.length > 0 ? entries : undefined;
}
function readCompatibilityActionType(value, failure, res) {
    if (!(0, execution_actions_1.isExecutionActionType)(value)) {
        failure(res, 'Invalid or missing compatibility execution type', 400, {
            code: 'daemon.compatibility_execution.invalid_type',
        });
        return null;
    }
    if (!(0, execution_actions_1.isCompatibilityExecutionActionType)(value)) {
        failure(res, `Execution type "${value}" is not a compatibility mutation action`, 400, {
            code: 'daemon.compatibility_execution.non_compatibility_type',
            details: {
                type: value,
                actionClass: (0, execution_actions_1.getExecutionActionClass)(value),
            },
        });
        return null;
    }
    return value;
}
function buildCompatibilityBoundary(type, dispatchMode) {
    return {
        routeScope: 'compatibility-mutation',
        actionClass: (0, execution_actions_1.getExecutionActionClass)(type),
        compatibilityAction: true,
        compatibilityQuarantined: true,
        dispatchMode,
        legacyGenericDispatch: dispatchMode === 'legacy-generic-route',
        canonicalRuntime: false,
        message: dispatchMode === 'legacy-generic-route'
            ? 'Compatibility mutation action accepted through legacy generic execution route; prefer explicit compatibility mutation routes.'
            : 'Compatibility mutation action handled through explicit compatibility execution boundary.',
    };
}
async function readJsonBody(req, res, context) {
    try {
        return JSON.parse(await context.readBody(req));
    }
    catch {
        context.failure(res, 'Invalid JSON body', 400, {
            code: 'daemon.compatibility_execution.invalid_json',
        });
        return null;
    }
}
function createCompatibilityExecutionHandlers(context) {
    async function handleExecute(req, res, options) {
        const body = await readJsonBody(req, res, context);
        if (!body)
            return;
        await handleExecuteBody(req, res, body, options);
    }
    async function handleExecuteBody(req, res, body, options) {
        const type = readCompatibilityActionType(body.type, context.failure, res);
        if (!type)
            return;
        const dispatchMode = options?.dispatchMode ?? 'explicit-compatibility-route';
        const run = await (0, execution_bus_1.runExecution)({
            type,
            source: context.toSource(req),
            actor: context.toActor(req),
            target: body.target === null ? null : asNonEmptyString(body.target) || null,
            intentText: body.intentText === null ? null : asNonEmptyString(body.intentText) || null,
            cwd: process.cwd(),
            reverify: typeof body.reverify === 'boolean' ? body.reverify : true,
            ciMode: typeof body.ciMode === 'boolean' ? body.ciMode : undefined,
            evidenceDir: asNonEmptyString(body.evidenceDir),
            dedupeWindowMs: typeof body.dedupeWindowMs === 'number' ? body.dedupeWindowMs : undefined,
        });
        const compatibilityBoundary = buildCompatibilityBoundary(type, dispatchMode);
        const governanceEnvelope = (0, shaping_1.buildGovernanceEnvelope)(run, {
            compatibilityBoundary,
            executionBoundary: compatibilityBoundary,
        });
        context.success(res, {
            execution: run.execution,
            _execution: (0, shaping_1.buildExecutionResponseMeta)(run, {
                compatibilityBoundary,
                executionBoundary: compatibilityBoundary,
            }),
            actionClass: (0, execution_actions_1.getExecutionActionClass)(type),
            compatibilityAction: true,
            compatibilityBoundary,
            governanceEnvelope,
            payload: run.primaryPayload,
            verification: run.verificationPayload,
        });
    }
    async function handleWorkspaceExecute(req, res, options) {
        const body = await readJsonBody(req, res, context);
        if (!body)
            return;
        await handleWorkspaceExecuteBody(req, res, body, options);
    }
    async function handleWorkspaceExecuteBody(req, res, body, options) {
        const type = readCompatibilityActionType(body.type, context.failure, res);
        if (!type)
            return;
        const request = {
            workspaceId: asNonEmptyString(body.workspaceId),
            repositoryIds: asStringArray(body.repositoryIds),
            type,
            source: context.toSource(req),
            actor: context.toActor(req),
            target: body.target === null ? null : asNonEmptyString(body.target) || null,
            intentText: body.intentText === null ? null : asNonEmptyString(body.intentText) || null,
            reverify: typeof body.reverify === 'boolean' ? body.reverify : true,
            ciMode: typeof body.ciMode === 'boolean' ? body.ciMode : undefined,
            evidenceDir: asNonEmptyString(body.evidenceDir),
            dedupeWindowMs: typeof body.dedupeWindowMs === 'number' ? body.dedupeWindowMs : undefined,
        };
        const result = await (0, workspace_runtime_1.executeWorkspaceAction)(request, {
            cwd: process.cwd(),
        });
        const dispatchMode = options?.dispatchMode ?? 'explicit-compatibility-route';
        const compatibilityBoundary = buildCompatibilityBoundary(type, dispatchMode);
        context.success(res, {
            ...result,
            actionClass: (0, execution_actions_1.getExecutionActionClass)(type),
            compatibilityAction: true,
            compatibilityBoundary,
            governanceEnvelope: {
                schemaVersion: 'neurcode.governance-envelope.v1',
                identity: {
                    executionId: result.executionId,
                    executionType: result.type,
                    source: result.source,
                    actor: result.actor,
                    completedAt: result.completedAt,
                },
                boundary: {
                    actionClass: (0, execution_actions_1.getExecutionActionClass)(type),
                    runtimeBoundary: 'compatibility-mutation',
                    mutatesCode: true,
                    compatibilityAction: true,
                    executionBoundary: compatibilityBoundary,
                    compatibilityBoundary,
                },
                custody: {
                    evidence: { generated: false, references: [], retentionLimit: null },
                    replay: { checksum: null, mode: null, integrity: null },
                    provenance: { runId: null, generatedAt: null },
                    policy: { policyLockFingerprint: null, compiledPolicyFingerprint: null },
                    receipts: { ids: [] },
                },
                lineage: {
                    verificationTrend: result.totals.failed > 0 ? 'regressed' : 'unchanged',
                    repositories: result.totals.repositories,
                    attempted: result.totals.attempted,
                    succeeded: result.totals.succeeded,
                    failed: result.totals.failed,
                },
            },
        });
    }
    return {
        handleExecute,
        handleExecuteBody,
        handleWorkspaceExecute,
        handleWorkspaceExecuteBody,
    };
}
//# sourceMappingURL=execution.js.map