"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAEMON_ROUTE_GROUPS = exports.DOCS_TRANSPORT_ROUTE_DESCRIPTIONS = exports.OPERATIONAL_STATUS_ROUTE_DESCRIPTIONS = exports.REPLAY_EVIDENCE_ROUTE_DESCRIPTIONS = exports.WORKSPACE_ORCHESTRATION_ROUTE_DESCRIPTIONS = exports.RUNTIME_EXECUTION_ROUTE_DESCRIPTIONS = exports.COMPATIBILITY_MUTATION_ROUTE_DESCRIPTIONS = exports.CANONICAL_GOVERNANCE_ROUTE_DESCRIPTIONS = void 0;
exports.normalizeRoutePath = normalizeRoutePath;
exports.classifyDaemonRoute = classifyDaemonRoute;
exports.logDaemonRouteGroup = logDaemonRouteGroup;
exports.CANONICAL_GOVERNANCE_ROUTE_DESCRIPTIONS = [
    { method: 'POST', path: '/verify', summary: 'execution bus: verify' },
    { method: 'POST', path: '/execute', summary: 'canonical/runtime execution endpoint' },
    { method: 'GET', path: '/governance/findings', summary: 'canonical governance findings (last verify output)' },
    { method: 'GET', path: '/governance/overview', summary: 'governance posture summary' },
    { method: 'GET', path: '/pilot-report', summary: 'governance health metrics and trend' },
];
exports.COMPATIBILITY_MUTATION_ROUTE_DESCRIPTIONS = [
    { method: 'POST', path: '/execute/compatibility', summary: 'explicit compatibility execution boundary' },
    { method: 'POST', path: '/workspaces/execute/compatibility', summary: 'explicit workspace compatibility execution boundary' },
    { method: 'POST', path: '/fix', summary: 'execution bus: fix + reverify' },
    { method: 'POST', path: '/fix/apply-safe', summary: 'execution bus: apply-safe + reverify' },
    { method: 'POST', path: '/patch', summary: 'execution bus: patch + reverify' },
    { method: 'POST', path: '/patch/preview', summary: 'deterministic patch preview (before/after diff)' },
    { method: 'POST', path: '/patch/rollback', summary: 'deterministic rollback apply by receipt' },
];
exports.RUNTIME_EXECUTION_ROUTE_DESCRIPTIONS = [
    { method: 'GET', path: '/executions', summary: 'execution history index' },
    { method: 'GET', path: '/executions/:id', summary: 'execution detail' },
    { method: 'GET', path: '/executions/:id/events', summary: 'execution runtime events' },
    { method: 'GET', path: '/executions/:id/timeline', summary: 'execution timeline' },
    { method: 'GET', path: '/executions/:id/diff', summary: 'verification + patch inspection' },
    { method: 'GET', path: '/events', summary: 'runtime event query' },
    { method: 'GET', path: '/events/stream', summary: 'SSE deterministic governance runtime' },
];
exports.WORKSPACE_ORCHESTRATION_ROUTE_DESCRIPTIONS = [
    { method: 'GET', path: '/workspaces', summary: 'workspace catalog + active pointer' },
    { method: 'GET', path: '/workspaces/runtime', summary: 'workspace governance runtime snapshot' },
    { method: 'GET', path: '/workspaces/:id', summary: 'workspace definition' },
    { method: 'GET', path: '/workspaces/:id/runtime', summary: 'workspace-specific runtime snapshot' },
    { method: 'POST', path: '/workspaces', summary: 'create workspace' },
    { method: 'PUT', path: '/workspaces/:id', summary: 'update workspace' },
    { method: 'POST', path: '/workspaces/:id/activate', summary: 'set active workspace' },
    { method: 'POST', path: '/workspaces/:id/repositories', summary: 'add repository to workspace' },
    { method: 'POST', path: '/workspaces/execute', summary: 'workspace-scoped deterministic execution' },
    { method: 'GET', path: '/workspaces/:id/cross-repo-graph', summary: 'detected cross-repo dependency edges' },
    { method: 'POST', path: '/workspaces/:id/federated-context', summary: 'multi-repo blast radius analysis' },
    { method: 'POST', path: '/workspaces/:id/semantic-search', summary: 'TF-IDF vector similarity file search' },
    { method: 'POST', path: '/workspaces/:id/semantic-index/build', summary: 'rebuild semantic index from brain context' },
    { method: 'POST', path: '/workspaces/:id/intent-expand', summary: 'signed semantic intent governance artifact' },
];
exports.REPLAY_EVIDENCE_ROUTE_DESCRIPTIONS = [
    { method: 'GET', path: '/replay/state', summary: 'deterministic governance state replay' },
    { method: 'GET', path: '/replay/execution/:id', summary: 'deterministic execution replay' },
    { method: 'GET', path: '/replay/workspace', summary: 'deterministic workspace replay' },
    { method: 'GET', path: '/replay/workspace/:id', summary: 'deterministic workspace replay by id' },
    { method: 'GET', path: '/replay/timeline', summary: 'deterministic governance timeline replay' },
];
exports.OPERATIONAL_STATUS_ROUTE_DESCRIPTIONS = [
    { method: 'GET', path: '/health', summary: 'daemon health, route map, and runtime contracts' },
    { method: 'GET', path: '/ops/summary', summary: 'daemon operational health + reliability metrics' },
    { method: 'GET', path: '/runtime-companion', summary: 'source-free local in-flow session snapshot' },
    { method: 'POST', path: '/runtime-companion/launch', summary: 'start a governed AI session and agent handshake' },
    { method: 'POST', path: '/runtime-companion/approve', summary: 'approve one exact runtime boundary path' },
    { method: 'POST', path: '/runtime-companion/profile/refresh', summary: 'refresh local repo governance profile metadata' },
    { method: 'GET', path: '/control-plane', summary: 'governance control-plane state + snapshots' },
    { method: 'POST', path: '/control-plane/preview', summary: 'preview control-plane update' },
    { method: 'PUT', path: '/control-plane', summary: 'apply control-plane update' },
    { method: 'GET', path: '/brain/cache-status', summary: 'brain cache manifest and freshness' },
    { method: 'GET', path: '/remediation/status', summary: 'remediation artifacts and receipts' },
];
exports.DOCS_TRANSPORT_ROUTE_DESCRIPTIONS = [
    { method: 'GET', path: '/docs/enterprise', summary: 'enterprise docs manifest' },
    { method: 'GET', path: '/docs/enterprise/:slug', summary: 'enterprise docs content' },
];
exports.DAEMON_ROUTE_GROUPS = {
    'canonical-governance': exports.CANONICAL_GOVERNANCE_ROUTE_DESCRIPTIONS,
    'compatibility-mutation': exports.COMPATIBILITY_MUTATION_ROUTE_DESCRIPTIONS,
    'runtime-execution': exports.RUNTIME_EXECUTION_ROUTE_DESCRIPTIONS,
    'workspace-orchestration': exports.WORKSPACE_ORCHESTRATION_ROUTE_DESCRIPTIONS,
    'replay-evidence': exports.REPLAY_EVIDENCE_ROUTE_DESCRIPTIONS,
    'operational-status': exports.OPERATIONAL_STATUS_ROUTE_DESCRIPTIONS,
    'docs-transport': exports.DOCS_TRANSPORT_ROUTE_DESCRIPTIONS,
};
function normalizeRoutePath(url) {
    const pathOnly = url.split('?')[0]?.trim() || '/';
    return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
}
function classifyDaemonRoute(method, url) {
    const normalizedMethod = method.toUpperCase();
    const path = normalizeRoutePath(url);
    if (normalizedMethod === 'POST' && (path === '/verify' || path === '/execute'))
        return 'canonical-governance';
    if (normalizedMethod === 'GET' && (path === '/governance/findings' || path === '/governance/overview' || path === '/pilot-report'))
        return 'canonical-governance';
    if (normalizedMethod === 'POST'
        && (path === '/execute/compatibility'
            || path === '/workspaces/execute/compatibility'
            || path === '/fix'
            || path === '/fix/apply-safe'
            || path === '/patch'
            || path === '/patch/preview'
            || path === '/patch/rollback')) {
        return 'compatibility-mutation';
    }
    if (normalizedMethod === 'GET' && (path === '/executions' || path.startsWith('/executions/') || path === '/events' || path === '/events/stream'))
        return 'runtime-execution';
    if ((normalizedMethod === 'GET' || normalizedMethod === 'POST' || normalizedMethod === 'PUT') && (path === '/workspaces' || path.startsWith('/workspaces/')))
        return 'workspace-orchestration';
    if (normalizedMethod === 'GET' && (path === '/replay/state' || path === '/replay/timeline' || path === '/replay/workspace' || path.startsWith('/replay/workspace/') || path.startsWith('/replay/execution/')))
        return 'replay-evidence';
    if ((normalizedMethod === 'GET' || normalizedMethod === 'POST' || normalizedMethod === 'PUT')
        && (path === '/health'
            || path === '/ops/summary'
            || path === '/runtime-companion'
            || path === '/runtime-companion/launch'
            || path === '/runtime-companion/approve'
            || path === '/runtime-companion/profile/refresh'
            || path === '/control-plane'
            || path === '/control-plane/preview'
            || path === '/brain/cache-status'
            || path === '/remediation/status')) {
        return 'operational-status';
    }
    if (normalizedMethod === 'GET' && (path === '/docs/enterprise' || path.startsWith('/docs/enterprise/')))
        return 'docs-transport';
    return 'unknown';
}
function logDaemonRouteGroup(title, routes) {
    console.log(title);
    for (const route of routes) {
        console.log(`  ${route.method.padEnd(4, ' ')} ${route.path.padEnd(32, ' ')} -> ${route.summary}`);
    }
}
//# sourceMappingURL=routes.js.map