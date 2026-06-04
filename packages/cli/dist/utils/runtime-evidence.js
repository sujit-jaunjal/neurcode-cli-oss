"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSinceDuration = parseSinceDuration;
exports.listRuntimeSessions = listRuntimeSessions;
exports.buildRuntimeEvidenceReport = buildRuntimeEvidenceReport;
exports.renderRuntimeEvidenceMarkdown = renderRuntimeEvidenceMarkdown;
const fs_1 = require("fs");
const path_1 = require("path");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const v0_governance_1 = require("./v0-governance");
function increment(map, key) {
    if (!key)
        return;
    map.set(key, (map.get(key) ?? 0) + 1);
}
function toSortedEntries(map, keyName) {
    return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([key, count]) => ({ [keyName]: key, count }));
}
function eventOwners(event) {
    const detail = event.detail;
    const context = detail && typeof detail === 'object'
        ? detail['approvalContext']
        : null;
    if (context && typeof context === 'object') {
        const owners = context['owners'];
        if (Array.isArray(owners)) {
            return owners.filter((owner) => typeof owner === 'string');
        }
    }
    const message = event.message ?? '';
    const ownerMatch = message.match(/owned by ([^)\\.]+)/);
    if (!ownerMatch)
        return [];
    return ownerMatch[1]
        .split(',')
        .map((owner) => owner.trim())
        .filter(Boolean);
}
function matchesBoundary(filePath, glob) {
    if (!filePath)
        return false;
    const prefix = glob.replace('/**', '').replace('/*', '');
    return filePath === prefix || filePath.startsWith(prefix + '/');
}
function sessionStartedAt(session) {
    return session.events.find((event) => event.type === 'session_start')?.ts ?? null;
}
function isReportActiveSession(record) {
    if (record.session.status !== 'active')
        return false;
    if (!record.startedAt)
        return false;
    const parsed = Date.parse(record.startedAt);
    return Number.isFinite(parsed);
}
function eventTime(event) {
    const parsed = Date.parse(event.ts);
    return Number.isFinite(parsed) ? parsed : 0;
}
function boundaryVerdict(event) {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object' || Array.isArray(detail))
        return null;
    const value = detail.boundaryVerdict;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function isAllowedAdvisoryEvent(event) {
    return event.type === 'check_warn' && boundaryVerdict(event) === 'ok';
}
function isSensitiveWarningEvent(event) {
    if (event.type !== 'check_warn')
        return false;
    const verdict = boundaryVerdict(event);
    return verdict !== 'ok';
}
function parseSinceDuration(input) {
    if (!input)
        return { cutoffMs: null, label: null };
    const trimmed = input.trim();
    const match = trimmed.match(/^(\d+)(m|h|d|w)$/i);
    if (!match)
        throw new Error(`Invalid --since value "${input}". Use formats like 24h, 7d, or 2w.`);
    const value = Number.parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const multiplier = unit === 'm' ? 60_000 :
        unit === 'h' ? 3_600_000 :
            unit === 'd' ? 86_400_000 :
                7 * 86_400_000;
    return {
        cutoffMs: Date.now() - value * multiplier,
        label: trimmed,
    };
}
function listRuntimeSessions(repoRoot, options = {}) {
    const parsedSince = parseSinceDuration(options.since);
    const dir = (0, governance_runtime_1.sessionsDir)(repoRoot);
    if (!(0, fs_1.existsSync)(dir))
        return [];
    const records = [];
    for (const file of (0, fs_1.readdirSync)(dir).filter((name) => name.endsWith('.json') && !name.endsWith('.change-record.json')).sort()) {
        const path = (0, path_1.join)(dir, file);
        try {
            const session = JSON.parse((0, fs_1.readFileSync)(path, 'utf8'));
            const lastEventMs = Math.max(...session.events.map(eventTime), 0);
            if (parsedSince.cutoffMs !== null && lastEventMs < parsedSince.cutoffMs)
                continue;
            records.push({
                session,
                path,
                startedAt: sessionStartedAt(session),
                blockCount: session.events.filter((event) => event.type === 'check_block').length,
                warnCount: session.events.filter(isSensitiveWarningEvent).length,
                okCount: session.events.filter((event) => event.type === 'check_ok' || isAllowedAdvisoryEvent(event)).length,
                approvalCount: session.events.filter((event) => event.type === 'approval_decision').length,
            });
        }
        catch {
            // Corrupt session files should not make the pilot report unusable.
        }
    }
    return records.sort((a, b) => {
        const aTime = a.startedAt ? Date.parse(a.startedAt) : 0;
        const bTime = b.startedAt ? Date.parse(b.startedAt) : 0;
        return bTime - aTime || a.session.sessionId.localeCompare(b.session.sessionId);
    });
}
function buildRuntimeEvidenceReport(repoRoot, options = {}) {
    const since = parseSinceDuration(options.since);
    const records = listRuntimeSessions(repoRoot, options);
    const profile = (0, v0_governance_1.getProfileStaleness)(repoRoot);
    const blockedPaths = new Map();
    const owners = new Map();
    const boundaries = new Map();
    for (const record of records) {
        for (const event of record.session.events) {
            if (event.type !== 'check_block' && event.type !== 'check_warn')
                continue;
            if (event.type === 'check_block') {
                increment(blockedPaths, event.filePath);
            }
            for (const owner of eventOwners(event))
                increment(owners, owner);
            for (const boundary of record.session.contract.approvalRequiredGlobs) {
                if (matchesBoundary(event.filePath, boundary))
                    increment(boundaries, boundary);
            }
        }
    }
    const activeSessions = records.filter(isReportActiveSession).length;
    const finishedSessions = records.filter((record) => record.session.status === 'finished').length;
    const totalChecks = records.reduce((sum, record) => sum + record.blockCount + record.warnCount + record.okCount, 0);
    const allowedWithAdvisories = records.reduce((sum, record) => sum + record.session.events.filter(isAllowedAdvisoryEvent).length, 0);
    return {
        repoRoot,
        generatedAt: new Date().toISOString(),
        since: since.label,
        profile: {
            status: profile.status,
            profilePath: profile.profilePath,
            reasons: profile.reasons,
        },
        summary: {
            sessions: records.length,
            activeSessions,
            finishedSessions,
            totalChecks,
            blockedEdits: records.reduce((sum, record) => sum + record.blockCount, 0),
            warnedSensitiveEdits: records.reduce((sum, record) => sum + record.warnCount, 0),
            allowedWithAdvisories,
            allowedEdits: records.reduce((sum, record) => sum + record.okCount, 0),
            approvalsGranted: records.reduce((sum, record) => sum + record.approvalCount, 0),
        },
        topBlockedPaths: toSortedEntries(blockedPaths, 'path').slice(0, 10),
        topOwners: toSortedEntries(owners, 'owner').slice(0, 10),
        approvalRequiredBoundariesTouched: toSortedEntries(boundaries, 'boundary').slice(0, 10),
        sessions: records.map((record) => ({
            sessionId: record.session.sessionId,
            status: record.session.status,
            goal: record.session.contract.goal,
            scopeMode: record.session.contract.scopeMode,
            blockCount: record.blockCount,
            warnCount: record.warnCount,
            okCount: record.okCount,
            approvalCount: record.approvalCount,
            approvedPaths: record.session.contract.approvedPaths,
            replayHash: record.session.replayHash,
            recordPath: record.path,
        })),
    };
}
function tableRows(items, columns) {
    if (items.length === 0)
        return ['none'];
    return items.map((item) => columns.map(([label, key]) => `${label}: ${String(item[key] ?? '')}`).join(' | '));
}
function renderRuntimeEvidenceMarkdown(report) {
    const lines = [];
    lines.push('# Neurcode Runtime Evidence Report');
    lines.push('');
    lines.push(`Generated: ${report.generatedAt}`);
    lines.push(`Repo: ${report.repoRoot}`);
    if (report.since)
        lines.push(`Window: ${report.since}`);
    lines.push(`Profile: ${report.profile.status}${report.profile.reasons.length ? ` (${report.profile.reasons.join('; ')})` : ''}`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`- Sessions: ${report.summary.sessions} (${report.summary.activeSessions} active, ${report.summary.finishedSessions} finished)`);
    lines.push(`- Total edit checks: ${report.summary.totalChecks}`);
    lines.push(`- Blocked edits: ${report.summary.blockedEdits}`);
    lines.push(`- Warned sensitive edits: ${report.summary.warnedSensitiveEdits}`);
    lines.push(`- Allowed edits with advisory obligations: ${report.summary.allowedWithAdvisories}`);
    lines.push(`- Allowed edits: ${report.summary.allowedEdits}`);
    lines.push(`- Approvals granted: ${report.summary.approvalsGranted}`);
    lines.push('');
    lines.push('## Top Blocked Paths');
    lines.push('');
    for (const row of tableRows(report.topBlockedPaths, [['path', 'path'], ['count', 'count']]))
        lines.push(`- ${row}`);
    lines.push('');
    lines.push('## Owners Involved');
    lines.push('');
    for (const row of tableRows(report.topOwners, [['owner', 'owner'], ['count', 'count']]))
        lines.push(`- ${row}`);
    lines.push('');
    lines.push('## Approval-Required Boundaries Touched');
    lines.push('');
    for (const row of tableRows(report.approvalRequiredBoundariesTouched, [['boundary', 'boundary'], ['count', 'count']]))
        lines.push(`- ${row}`);
    lines.push('');
    lines.push('## Sessions');
    lines.push('');
    if (report.sessions.length === 0) {
        lines.push('- none');
    }
    else {
        for (const session of report.sessions) {
            lines.push(`- ${session.sessionId} (${session.status}) blocks=${session.blockCount} warnings=${session.warnCount} approvals=${session.approvalCount} replay=${session.replayHash ?? 'n/a'}`);
            lines.push(`  - Goal: ${session.goal}`);
            lines.push(`  - Record: ${session.recordPath}`);
        }
    }
    lines.push('');
    return lines.join('\n');
}
//# sourceMappingURL=runtime-evidence.js.map