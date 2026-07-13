"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_RUNTIME_DECISION_SCHEMA_VERSION = exports.AGENT_RUNTIME_ADAPTER_SCHEMA_VERSION = void 0;
exports.listAgentRuntimeAdapterCapabilities = listAgentRuntimeAdapterCapabilities;
exports.getAgentRuntimeAdapterCapability = getAgentRuntimeAdapterCapability;
exports.normalizeAgentRuntimeEvent = normalizeAgentRuntimeEvent;
/**
 * Agent Runtime Adapter Contract V1
 *
 * Stable, source-free local ingress shared by hooks, MCP clients, IDE
 * companions, and future agent integrations. The adapter contract describes
 * agent lifecycle events; the CLI remains the local enforcement engine.
 */
const contracts_1 = require("@neurcode-ai/contracts");
exports.AGENT_RUNTIME_ADAPTER_SCHEMA_VERSION = 'neurcode.agent-runtime-event.v1';
exports.AGENT_RUNTIME_DECISION_SCHEMA_VERSION = 'neurcode.agent-runtime-decision.v1';
const ALL_RUNTIME_EVENTS = [
    'session.handshake',
    'session.start',
    'plan.capture',
    'plan.amend',
    'edit.before',
    'edit.after',
    'session.finish',
    'approval.apply',
    'obligation.waive',
];
const CAPABILITIES = [
    {
        adapter: 'claude-code-hooks',
        enforcementLevel: 'hard_deny',
        controlLevel: 'hard_block_capable',
        compatibilityMode: 'hard_pre_write_enforcement',
        hostCapability: 'hard_prewrite',
        automatic: true,
        events: ['session.start', 'plan.capture', 'edit.before', 'session.finish'],
        enforceable: ['pre-write boundary deny', 'pre-write intent and plan checks', 'exact-path approvals'],
        advisoryOnly: ['post-session structural consequence interpretation'],
        supervisorSupported: false,
        description: 'Claude Code lifecycle hooks automatically run the local runtime before writes land.',
    },
    {
        adapter: 'copilot-hooks',
        enforcementLevel: 'hard_deny',
        controlLevel: 'hard_block_capable',
        compatibilityMode: 'hard_pre_write_enforcement',
        hostCapability: 'hard_prewrite',
        automatic: true,
        events: ['session.start', 'plan.capture', 'edit.before', 'session.finish'],
        enforceable: ['pre-tool boundary deny when Copilot hook discovery is active', 'exact-path approvals'],
        advisoryOnly: ['hosts without Copilot hook discovery fall back to supervision/evidence'],
        supervisorSupported: true,
        description: 'GitHub Copilot hooks run the local runtime around agent tool use when Copilot hook discovery is active for the repo.',
    },
    {
        adapter: 'generic-mcp',
        enforcementLevel: 'cooperative',
        controlLevel: 'supervised_advisory_capable',
        compatibilityMode: 'cooperative_check',
        hostCapability: 'cooperative_prewrite',
        automatic: false,
        events: [...ALL_RUNTIME_EVENTS],
        enforceable: ['runtime decision returned to cooperating agent', 'exact-path approvals when the agent calls the runtime'],
        advisoryOnly: ['host-level write denial', 'edits made without runtime calls'],
        supervisorSupported: true,
        description: 'Portable MCP ingress for agents that voluntarily call the runtime before edits.',
    },
    {
        adapter: 'codex-hooks',
        enforcementLevel: 'hard_deny',
        controlLevel: 'hard_block_capable',
        compatibilityMode: 'hard_pre_write_enforcement',
        hostCapability: 'hard_prewrite',
        automatic: true,
        events: ['session.start', 'plan.capture', 'edit.before', 'session.finish'],
        enforceable: ['PreToolUse deny for intercepted apply_patch, simple Bash, and MCP tool calls', 'exact-path approvals'],
        advisoryOnly: ['unified execution and equivalent write paths Codex does not expose to hooks', 'operation while project hooks are disabled or untrusted'],
        supervisorSupported: true,
        description: 'Codex repository hooks can deny supported intercepted tool calls before write; this is a guardrail with explicitly incomplete host coverage.',
    },
    {
        adapter: 'codex-mcp',
        enforcementLevel: 'cooperative',
        controlLevel: 'supervised_advisory_capable',
        compatibilityMode: 'supervisor_diff_watch',
        hostCapability: 'cooperative_prewrite',
        automatic: false,
        events: [...ALL_RUNTIME_EVENTS],
        enforceable: ['cooperative edit.before checks when Codex calls the runtime', 'pre-commit supervisor/diff-watch warnings'],
        advisoryOnly: ['host-level hard pre-write denial inside Codex', 'edits made outside the runtime adapter'],
        supervisorSupported: true,
        description: 'Codex MCP integration. Governance is enforced when the agent calls the local runtime ingress.',
    },
    {
        adapter: 'cursor-mcp',
        enforcementLevel: 'cooperative',
        controlLevel: 'supervised_advisory_capable',
        compatibilityMode: 'supervisor_diff_watch',
        hostCapability: 'supervised_write',
        automatic: false,
        events: [...ALL_RUNTIME_EVENTS],
        enforceable: ['cooperative edit.before checks when Cursor calls the runtime', 'pre-commit supervisor/diff-watch warnings'],
        advisoryOnly: ['host-level hard pre-write denial inside Cursor', 'edits made outside the runtime adapter'],
        supervisorSupported: true,
        description: 'Cursor MCP integration. Governance is enforced when the agent calls the local runtime ingress.',
    },
    {
        adapter: 'vscode-extension',
        enforcementLevel: 'observe_only',
        controlLevel: 'evidence_only_capable',
        compatibilityMode: 'evidence_only',
        hostCapability: 'post_write',
        automatic: false,
        events: [...ALL_RUNTIME_EVENTS],
        enforceable: ['live visibility', 'source-free evidence capture'],
        advisoryOnly: ['pre-write denial', 'agent tool-use enforcement'],
        supervisorSupported: true,
        description: 'IDE companion ingress for live visibility and post-write containment where pre-write interception is unavailable.',
    },
    {
        adapter: 'github-action',
        enforcementLevel: 'post_change_backstop',
        controlLevel: 'evidence_only_capable',
        compatibilityMode: 'evidence_only',
        hostCapability: 'ci_only',
        automatic: true,
        events: ['edit.after', 'session.finish'],
        enforceable: ['post-change admission/backstop checks'],
        advisoryOnly: ['in-flow write denial'],
        supervisorSupported: false,
        description: 'Optional repository backstop after changes exist; never represented as in-flow hard enforcement.',
    },
];
const SOURCE_LIKE_KEYS = new Set([
    'content',
    'filecontent',
    'source',
    'sourcetext',
    'sourcecode',
    'diff',
    'difftext',
    'patch',
    'before',
    'after',
]);
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function cleanString(value, max = 4000) {
    if (typeof value !== 'string')
        return undefined;
    const cleaned = value.trim();
    if (!cleaned)
        return undefined;
    return cleaned.slice(0, max);
}
function cleanStrings(value) {
    if (!Array.isArray(value))
        return undefined;
    const values = Array.from(new Set(value
        .map((item) => cleanString(item, 400))
        .filter((item) => Boolean(item))));
    return values.length > 0 ? values : undefined;
}
function assertSourceFree(value, path = 'payload') {
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertSourceFree(item, `${path}[${index}]`));
        return;
    }
    const record = asRecord(value);
    if (!record)
        return;
    for (const [key, child] of Object.entries(record)) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalizedKey === 'content' &&
            path.endsWith('.proposedChange') &&
            asRecord(child)) {
            const metadata = asRecord(child);
            const allowed = new Set(['present', 'availabilityReason', 'contentHash', 'rawRetained']);
            for (const metadataKey of Object.keys(metadata)) {
                if (!allowed.has(metadataKey)) {
                    throw new Error(`source-like adapter payload key is not allowed: ${path}.${key}.${metadataKey}`);
                }
            }
            if (metadata.rawRetained !== false) {
                throw new Error(`proposed change raw content must not be retained: ${path}.${key}.rawRetained`);
            }
            continue;
        }
        if (SOURCE_LIKE_KEYS.has(normalizedKey)) {
            throw new Error(`source-like adapter payload key is not allowed: ${path}.${key}`);
        }
        assertSourceFree(child, `${path}.${key}`);
    }
}
function isAdapterId(value) {
    return CAPABILITIES.some((capability) => capability.adapter === value);
}
function isEventType(value) {
    return ALL_RUNTIME_EVENTS.includes(value);
}
function cleanPlan(value) {
    const text = cleanString(value, 12000);
    if (text)
        return text;
    const record = asRecord(value);
    if (!record)
        return undefined;
    const summary = cleanString(record.summary, 1000);
    const steps = cleanStrings(record.steps);
    return summary || steps ? { summary, steps } : undefined;
}
function requireField(value, label) {
    if (value === undefined || value === null || value === '') {
        throw new Error(`${label} is required for this runtime adapter event`);
    }
}
function listAgentRuntimeAdapterCapabilities() {
    return CAPABILITIES.map((capability) => ({
        ...capability,
        events: [...capability.events],
        enforceable: [...capability.enforceable],
        advisoryOnly: [...capability.advisoryOnly],
    }));
}
function getAgentRuntimeAdapterCapability(adapter) {
    const capability = CAPABILITIES.find((item) => item.adapter === adapter);
    if (!capability)
        throw new Error(`unknown runtime adapter: ${adapter}`);
    return {
        ...capability,
        events: [...capability.events],
        enforceable: [...capability.enforceable],
        advisoryOnly: [...capability.advisoryOnly],
    };
}
function normalizeAgentRuntimeEvent(value) {
    const record = asRecord(value);
    if (!record)
        throw new Error('runtime adapter event must be an object');
    const schemaVersion = record.schemaVersion ?? exports.AGENT_RUNTIME_ADAPTER_SCHEMA_VERSION;
    if (schemaVersion !== exports.AGENT_RUNTIME_ADAPTER_SCHEMA_VERSION) {
        throw new Error(`unsupported runtime adapter schemaVersion: ${String(schemaVersion)}`);
    }
    if (!isAdapterId(record.adapter)) {
        throw new Error(`unsupported runtime adapter: ${String(record.adapter)}`);
    }
    if (!isEventType(record.eventType)) {
        throw new Error(`unsupported runtime adapter eventType: ${String(record.eventType)}`);
    }
    const rawPayload = asRecord(record.payload) ?? {};
    assertSourceFree(rawPayload);
    const filePath = cleanString(rawPayload.filePath, 1000);
    const proposedChangeRecord = asRecord(rawPayload.proposedChange);
    let proposedChange;
    if (proposedChangeRecord) {
        if (!filePath)
            throw new Error('payload.filePath is required when payload.proposedChange is present');
        const timing = record.adapter === 'github-action'
            ? 'ci'
            : record.eventType === 'edit.after'
                ? 'after_write'
                : 'before_write';
        proposedChange = (0, contracts_1.validateAndBindProposedChangeEnvelope)(proposedChangeRecord, {
            adapterId: record.adapter,
            timing,
            targetPath: filePath,
            ...(typeof rawPayload.sessionId === 'string'
                ? { session: { sessionId: rawPayload.sessionId.trim() } }
                : {}),
        });
    }
    const payload = {
        goal: cleanString(rawPayload.goal),
        filePath,
        toolName: cleanString(rawPayload.toolName, 120),
        plan: cleanPlan(rawPayload.plan),
        summary: cleanString(rawPayload.summary, 1000),
        scope: cleanStrings(rawPayload.scope),
        reason: cleanString(rawPayload.reason, 1000),
        path: cleanString(rawPayload.path, 1000),
        obligationId: cleanString(rawPayload.obligationId, 1000),
        sessionId: cleanString(rawPayload.sessionId, 200),
        expiresAt: cleanString(rawPayload.expiresAt, 200),
        ttlMinutes: typeof rawPayload.ttlMinutes === 'number' && Number.isFinite(rawPayload.ttlMinutes)
            ? Math.max(0, Math.min(24 * 60, rawPayload.ttlMinutes))
            : undefined,
        actor: cleanString(rawPayload.actor, 300),
        proposedChange,
    };
    switch (record.eventType) {
        case 'session.handshake':
            break;
        case 'session.start':
            requireField(payload.goal, 'payload.goal');
            break;
        case 'plan.capture':
            requireField(payload.plan, 'payload.plan');
            break;
        case 'plan.amend':
            if (!payload.plan && !payload.summary && !payload.scope?.length) {
                throw new Error('plan.amend requires payload.plan, payload.summary, or payload.scope');
            }
            break;
        case 'edit.before':
        case 'edit.after':
            requireField(payload.filePath, 'payload.filePath');
            break;
        case 'approval.apply':
            requireField(payload.path, 'payload.path');
            break;
        case 'obligation.waive':
            requireField(payload.obligationId, 'payload.obligationId');
            requireField(payload.reason, 'payload.reason');
            break;
        case 'session.finish':
            break;
    }
    return {
        schemaVersion: exports.AGENT_RUNTIME_ADAPTER_SCHEMA_VERSION,
        adapter: record.adapter,
        eventType: record.eventType,
        cwd: cleanString(record.cwd, 2000),
        eventId: cleanString(record.eventId, 300),
        timestamp: cleanString(record.timestamp, 200),
        payload,
    };
}
//# sourceMappingURL=agent-runtime-adapter.js.map