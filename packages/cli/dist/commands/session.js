"use strict";
/**
 * Session Management Command
 *
 * Manages AI coding sessions - list, end, and view session status.
 *
 * Commands:
 * - neurcode session list    - List all sessions
 * - neurcode session end     - End the current or specified session
 * - neurcode session status  - Show status of current session
 */
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLocalGovernanceStatus = buildLocalGovernanceStatus;
exports.localGovernanceStatusCommand = localGovernanceStatusCommand;
exports.replanGovernanceSessionCommand = replanGovernanceSessionCommand;
exports.decideGovernanceReplanCommand = decideGovernanceReplanCommand;
exports.approveGovernanceSessionCommand = approveGovernanceSessionCommand;
exports.showGovernanceObligationsCommand = showGovernanceObligationsCommand;
exports.waiveGovernanceObligationCommand = waiveGovernanceObligationCommand;
exports.listRuntimeSessionsCommand = listRuntimeSessionsCommand;
exports.showRuntimeSessionCommand = showRuntimeSessionCommand;
exports.listSessionsCommand = listSessionsCommand;
exports.endSessionCommand = endSessionCommand;
exports.sessionStatusCommand = sessionStatusCommand;
exports.listLocalSessionsCommand = listLocalSessionsCommand;
exports.currentLocalSessionCommand = currentLocalSessionCommand;
exports.resumeLocalSessionCommand = resumeLocalSessionCommand;
exports.compareLocalSessionsCommand = compareLocalSessionsCommand;
const config_1 = require("../config");
const api_client_1 = require("../api-client");
const state_1 = require("../utils/state");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const messages_1 = require("../utils/messages");
const project_root_1 = require("../utils/project-root");
const session_continuity_1 = require("../utils/session-continuity");
const runtime_evidence_1 = require("../utils/runtime-evidence");
const v0_governance_1 = require("../utils/v0-governance");
const runtime_connection_1 = require("../utils/runtime-connection");
const runtime_live_1 = require("../utils/runtime-live");
const runtime_outbox_1 = require("../utils/runtime-outbox");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const readline = __importStar(require("readline"));
// Import chalk with fallback
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (str) => str,
        yellow: (str) => str,
        red: (str) => str,
        bold: (str) => str,
        dim: (str) => str,
        cyan: (str) => str,
        white: (str) => str,
        blue: (str) => str,
    };
}
/**
 * Prompt user for input
 */
function promptUser(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
function truncate(value, max = 96) {
    return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}
function compactList(values, max = 6) {
    if (values.length === 0)
        return 'none';
    const shown = values.slice(0, max).join(', ');
    return values.length > max ? `${shown} +${values.length - max} more` : shown;
}
function eventLabel(event) {
    if (event.type === 'check_ok')
        return 'OK';
    if (event.type === 'check_warn')
        return 'WARN';
    if (event.type === 'check_block')
        return 'BLOCK';
    if (event.type === 'approval_decision')
        return 'APPROVE';
    if (event.type === 'session_start')
        return 'START';
    if (event.type === 'plan_captured')
        return 'PLAN';
    if (event.type === 'plan_amended')
        return 'REPLAN';
    if (event.type === 'obligation_waiver_decision')
        return 'WAIVE';
    if (event.type === 'obligation_state_changed')
        return 'OBLIG';
    if (event.type === 'session_finish')
        return 'FINISH';
    return event.type.toUpperCase();
}
function approvalContextFrom(event) {
    const detail = event?.detail;
    const raw = detail && typeof detail === 'object'
        ? detail['approvalContext']
        : null;
    if (!raw || typeof raw !== 'object')
        return null;
    const context = raw;
    const owners = Array.isArray(context['owners'])
        ? context['owners'].filter((owner) => typeof owner === 'string')
        : [];
    return {
        blockedPath: typeof context['blockedPath'] === 'string' ? context['blockedPath'] : event?.filePath,
        owners,
        suggestedApprovalPath: typeof context['suggestedApprovalPath'] === 'string'
            ? context['suggestedApprovalPath']
            : event?.filePath,
    };
}
function loadLocalGovernanceSession(repoRoot, sessionId) {
    return sessionId ? (0, governance_runtime_1.loadSession)(repoRoot, sessionId) : (0, governance_runtime_1.loadActiveSession)(repoRoot);
}
function buildLocalGovernanceStatus(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const session = loadLocalGovernanceSession(repoRoot, options.sessionId);
    const connection = (0, runtime_connection_1.loadRuntimeConnection)(repoRoot);
    if (!session) {
        return {
            ok: false,
            repoRoot,
            active: false,
            message: options.sessionId
                ? `Local governance session ${options.sessionId} was not found.`
                : 'No active in-flow governance session found.',
            connection,
        };
    }
    const recentEvents = session.events.slice(-10);
    const latestBlock = [...session.events].reverse().find((event) => event.type === 'check_block');
    const latestApprovalContext = approvalContextFrom(latestBlock);
    const suggestedApprovalPath = latestApprovalContext?.suggestedApprovalPath ||
        latestBlock?.filePath ||
        null;
    return {
        ok: true,
        repoRoot,
        active: session.status === 'active',
        sessionId: session.sessionId,
        status: session.status,
        goal: session.contract.goal,
        profileHash: session.profileHash,
        scopeMode: session.contract.scopeMode,
        planCoherenceMode: session.contract.planCoherenceMode ?? 'warn',
        agentPlan: session.contract.agentPlan ?? null,
        agentPlanRevision: typeof session.contract.agentPlanRevision === 'number'
            ? session.contract.agentPlanRevision
            : session.contract.agentPlan
                ? 1
                : null,
        pendingPlanAmendments: (session.contract.planAmendmentProposals ?? [])
            .filter((proposal) => proposal.status === 'pending'),
        architectureObligations: session.contract.architectureObligations ?? [],
        allowedGlobs: session.contract.allowedGlobs,
        sensitiveGlobs: session.contract.sensitiveGlobs,
        approvalRequiredGlobs: session.contract.approvalRequiredGlobs,
        approvedPaths: session.contract.approvedPaths,
        recentEvents,
        latestBlock: latestBlock
            ? {
                filePath: latestBlock.filePath,
                message: latestBlock.message,
                owners: latestApprovalContext?.owners ?? [],
                suggestedApprovalPath,
                approveCommand: suggestedApprovalPath
                    ? `neurcode session approve --path ${suggestedApprovalPath}`
                    : null,
            }
            : null,
        recordPath: `.neurcode/sessions/${session.sessionId}.json`,
        connection,
    };
}
function localGovernanceStatusCommand(options = {}) {
    const status = buildLocalGovernanceStatus(options);
    if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        if (!status.ok)
            process.exitCode = 1;
        return;
    }
    console.log('');
    console.log(chalk.bold('Neurcode in-flow session'));
    console.log(chalk.dim('-'.repeat(72)));
    console.log(`Repo: ${chalk.white(status.repoRoot)}`);
    if (!status.ok) {
        console.log(chalk.yellow(status.message));
        if (status.connection) {
            const sync = status.connection.autoSync;
            console.log(chalk.dim(`Cloud: connected to ${status.connection.repo.name} · auto-sync ${sync.enabled ? 'on' : 'off'} · ${sync.lastStatus || 'never'}`));
        }
        console.log(chalk.dim('Next: run `neurcode activate claude`, then prompt Claude Code in this repo.'));
        console.log('');
        process.exitCode = 1;
        return;
    }
    const activeStatus = status;
    console.log(`Session: ${chalk.white(activeStatus.sessionId)} ${activeStatus.active ? chalk.green('active') : chalk.dim(activeStatus.status)}`);
    console.log(`Goal:    ${chalk.white(truncate(activeStatus.goal))}`);
    console.log(`Scope:   ${chalk.white(activeStatus.scopeMode)}`);
    console.log(`Plan:    ${chalk.white(activeStatus.planCoherenceMode)}${activeStatus.agentPlanRevision ? chalk.dim(` · rev ${activeStatus.agentPlanRevision}`) : ''}`);
    if (activeStatus.agentPlan?.summary) {
        console.log(`Agent:   ${chalk.white(truncate(activeStatus.agentPlan.summary))}`);
    }
    if (activeStatus.pendingPlanAmendments.length > 0) {
        const proposal = activeStatus.pendingPlanAmendments[0];
        console.log(`Re-plan: ${chalk.yellow(`${proposal.proposalId} pending human decision · ${proposal.risk.level} risk`)}`);
    }
    const obligationSummary = (0, governance_runtime_1.summarizeArchitectureObligations)(activeStatus.architectureObligations);
    console.log(`Obligations: ${chalk.white(`${obligationSummary.satisfied}/${obligationSummary.total} satisfied`)}${obligationSummary.criticalPending ? chalk.yellow(` · ${obligationSummary.criticalPending} critical pending`) : ''}`);
    for (const obligation of activeStatus.architectureObligations.filter((item) => item.status === 'pending').slice(0, 3)) {
        console.log(chalk.dim(`  pending ${obligation.severity.padEnd(8)} ${obligation.title}`));
    }
    console.log(`Allowed: ${chalk.dim(compactList(activeStatus.allowedGlobs))}`);
    console.log(`Gates:   ${chalk.dim(compactList(activeStatus.approvalRequiredGlobs))}`);
    console.log(`Approved:${chalk.dim(' ' + compactList(activeStatus.approvedPaths))}`);
    console.log('');
    console.log(chalk.bold('Recent events'));
    if (activeStatus.recentEvents.length === 0) {
        console.log(chalk.dim('  none'));
    }
    else {
        for (const event of activeStatus.recentEvents) {
            const target = event.filePath || event.decision || '';
            console.log(chalk.dim(`  ${eventLabel(event).padEnd(7)} ${target}`));
        }
    }
    console.log('');
    if (activeStatus.latestBlock?.suggestedApprovalPath) {
        console.log(chalk.bold('Latest block'));
        console.log(`  Path:  ${chalk.white(activeStatus.latestBlock.filePath || activeStatus.latestBlock.suggestedApprovalPath)}`);
        if (activeStatus.latestBlock.owners.length > 0) {
            console.log(`  Owner: ${chalk.white(activeStatus.latestBlock.owners.join(', '))}`);
        }
        console.log(`  CLI:   ${chalk.cyan(activeStatus.latestBlock.approveCommand)}`);
        console.log(chalk.dim(`  MCP:   neurcode_session_approve({ path: "${activeStatus.latestBlock.suggestedApprovalPath}" })`));
        console.log('');
    }
    console.log(chalk.dim(`Record: ${activeStatus.recordPath}`));
    if (activeStatus.connection) {
        const sync = activeStatus.connection.autoSync;
        const transport = (0, runtime_outbox_1.inspectRuntimeOutbox)(activeStatus.repoRoot);
        console.log(chalk.dim(`Cloud:  connected to ${activeStatus.connection.repo.name} · auto-sync ${sync.enabled ? 'on' : 'off'} · ${sync.lastStatus || 'never'}`));
        console.log(chalk.dim(`Live:   ${transport.pendingEvents === 0 ? 'delivered' : `${transport.pendingEvents} queued`} ` +
            `${transport.lastError ? `· retrying after ${transport.lastError}` : ''}`));
    }
    console.log('');
}
async function replanGovernanceSessionCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    let planText = options.plan;
    if (!planText && options.planFile) {
        const planPath = (0, node_path_1.isAbsolute)(options.planFile)
            ? options.planFile
            : (0, node_path_1.resolve)(repoRoot, options.planFile);
        planText = (0, node_fs_1.readFileSync)(planPath, 'utf8');
    }
    // `amend-plan --scope <glob>` is sugar for adding expected globs to the plan;
    // merge it with any explicit --add-glob values.
    const addExpectedGlobs = [...(options.addGlob || []), ...(options.scope || [])];
    try {
        const result = (0, governance_runtime_1.amendAgentPlan)(repoRoot, {
            sessionId: options.sessionId,
            planText,
            summary: options.summary,
            addSteps: options.addStep,
            removeSteps: options.removeStep,
            addExpectedFiles: options.addFile,
            removeExpectedFiles: options.removeFile,
            addExpectedGlobs,
            removeExpectedGlobs: options.removeGlob,
            addConstraints: options.addConstraint,
            removeConstraints: options.removeConstraint,
            addRisks: options.addRisk,
            removeRisks: options.removeRisk,
            reason: options.reason,
            source: 'manual',
            proposedBy: options.proposedBy || 'human',
            decidedBy: options.decidedBy,
        });
        const session = (0, governance_runtime_1.loadSession)(repoRoot, result.sessionId);
        if (session)
            await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, session);
        if (options.json) {
            console.log(JSON.stringify({ ok: true, repoRoot, ...result }, null, 2));
            return;
        }
        console.log('');
        if (result.status === 'pending') {
            console.log(chalk.yellow(`Plan amendment pending human decision: ${result.proposal?.proposalId || result.eventId}`));
            console.log(chalk.dim(`Risk:     ${result.risk.level}`));
            console.log(chalk.dim(`Reasons:  ${compactList(result.risk.reasons, 6)}`));
            console.log(chalk.dim(`Accept:   neurcode session replan-decide --proposal-id ${result.proposal?.proposalId || result.eventId} --decision accept --reason "<why>"`));
            console.log('');
            return;
        }
        console.log(chalk.green(`Plan updated: revision ${result.previousRevision} -> ${result.revision}`));
        console.log(chalk.dim(`Session:  ${result.sessionId}`));
        console.log(chalk.dim(`Action:   ${result.action}`));
        console.log(chalk.dim(`Reason:   ${result.reason}`));
        const activePlan = result.activePlan;
        if (activePlan?.summary) {
            console.log(`Plan:     ${chalk.white(truncate(activePlan.summary))}`);
        }
        if (activePlan?.expectedFiles.length) {
            console.log(chalk.dim(`Files:    ${compactList(activePlan.expectedFiles, 12)}`));
        }
        console.log('');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
            console.log(JSON.stringify({ ok: false, repoRoot, error: message }, null, 2));
        }
        else {
            (0, messages_1.printError)('Re-plan Failed', message, [
                'Use --plan "<new plan>" for a full replacement, or --add-step / --add-file for a patch.',
            ]);
        }
        process.exitCode = 1;
    }
}
async function decideGovernanceReplanCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    if (!options.proposalId || !options.decision) {
        (0, messages_1.printError)('Missing Re-plan Decision', undefined, [
            'Usage: neurcode session replan-decide --proposal-id <id> --decision <accept|reject> --reason "<why>"',
        ]);
        process.exitCode = 2;
        return;
    }
    try {
        const result = (0, governance_runtime_1.decideAgentPlanAmendment)(repoRoot, {
            sessionId: options.sessionId,
            proposalId: options.proposalId,
            decision: options.decision,
            reason: options.reason,
            decidedBy: options.decidedBy,
            source: 'manual',
        });
        const session = (0, governance_runtime_1.loadSession)(repoRoot, result.sessionId);
        if (session)
            await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, session);
        if (options.json) {
            console.log(JSON.stringify({ ok: true, repoRoot, ...result }, null, 2));
            return;
        }
        console.log('');
        console.log(result.decision === 'accept'
            ? chalk.green(`Plan amendment accepted: ${result.proposalId}`)
            : chalk.yellow(`Plan amendment rejected: ${result.proposalId}`));
        console.log(chalk.dim(`Session:  ${result.sessionId}`));
        console.log(chalk.dim(`Status:   ${result.status}`));
        if (result.revision)
            console.log(chalk.dim(`Revision: ${result.previousRevision} -> ${result.revision}`));
        console.log('');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
            console.log(JSON.stringify({ ok: false, repoRoot, error: message }, null, 2));
        }
        else {
            (0, messages_1.printError)('Re-plan Decision Failed', message);
        }
        process.exitCode = 1;
    }
}
async function approveGovernanceSessionCommand(options = {}) {
    const path = options.path;
    if (!path) {
        (0, messages_1.printError)('Missing Approval Path', undefined, ['Usage: neurcode session approve --path <file-or-glob>']);
        process.exitCode = 2;
        return;
    }
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    try {
        const result = (0, governance_runtime_1.approveSession)(repoRoot, path, options.reason, options.sessionId);
        const session = (0, governance_runtime_1.loadSession)(repoRoot, result.sessionId);
        if (session)
            await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, session);
        if (options.json) {
            console.log(JSON.stringify({ ok: true, repoRoot, ...result }, null, 2));
            return;
        }
        console.log('');
        console.log(chalk.green(`Approved: ${result.approvedPath}`));
        console.log(chalk.dim(`Session:  ${result.sessionId}`));
        console.log(chalk.dim(`Approved paths: ${compactList(result.approvedPaths, 12)}`));
        console.log('');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
            console.log(JSON.stringify({ ok: false, repoRoot, error: message }, null, 2));
        }
        else {
            (0, messages_1.printError)('Approval Failed', message);
        }
        process.exitCode = 1;
    }
}
function showGovernanceObligationsCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const session = loadLocalGovernanceSession(repoRoot, options.sessionId);
    if (!session) {
        const message = options.sessionId
            ? `Local governance session ${options.sessionId} was not found.`
            : 'No active in-flow governance session found.';
        if (options.json)
            console.log(JSON.stringify({ ok: false, repoRoot, error: message }, null, 2));
        else
            (0, messages_1.printError)('Architecture Obligations Unavailable', message);
        process.exitCode = 1;
        return;
    }
    const obligations = session.contract.architectureObligations ?? [];
    const summary = (0, governance_runtime_1.summarizeArchitectureObligations)(obligations);
    if (options.json) {
        console.log(JSON.stringify({
            ok: true,
            repoRoot,
            sessionId: session.sessionId,
            summary,
            obligations,
            waivers: session.contract.architectureObligationWaivers ?? [],
            policy: session.contract.architectureObligationPolicy ?? { mode: 'warn', ruleModes: {} },
        }, null, 2));
        return;
    }
    console.log('');
    console.log(chalk.bold(`Architecture obligations · ${session.sessionId}`));
    console.log(chalk.dim('-'.repeat(72)));
    const policy = session.contract.architectureObligationPolicy ?? { mode: 'warn', ruleModes: {} };
    console.log(`Policy:  ${chalk.white(policy.mode)}${Object.keys(policy.ruleModes).length ? chalk.dim(` · ${Object.keys(policy.ruleModes).length} rule override(s)`) : ''}`);
    console.log(`Summary: ${chalk.white(`${summary.satisfied}/${summary.total} satisfied`)}${summary.waived ? chalk.yellow(` · ${summary.waived} waived`) : ''}${summary.blockingPending ? chalk.red(` · ${summary.blockingPending} blocking pending`) : summary.criticalPending ? chalk.yellow(` · ${summary.criticalPending} critical pending`) : ''}`);
    console.log('');
    if (obligations.length === 0) {
        console.log(chalk.dim('No deterministic architecture obligations derived for this session.'));
    }
    for (const obligation of obligations) {
        const status = obligation.status === 'satisfied'
            ? chalk.green('satisfied')
            : obligation.status === 'waived'
                ? chalk.yellow('waived')
                : chalk.yellow('pending');
        console.log(`${status.padEnd(18)} ${chalk.white(obligation.title)} ${chalk.dim(`[${obligation.effectiveMode ?? 'warn'}]`)}`);
        console.log(chalk.dim(`  ${obligation.requiredEvidence[0]}`));
        if (obligation.observedEvidence[0])
            console.log(chalk.dim(`  evidence: ${obligation.observedEvidence[0].summary}`));
        if (obligation.status === 'pending')
            console.log(chalk.dim(`  waive: neurcode session waive-obligation --id ${obligation.id} --reason "<why>"`));
    }
    console.log('');
}
async function waiveGovernanceObligationCommand(options = {}) {
    if (!options.obligationId) {
        (0, messages_1.printError)('Missing Obligation ID', undefined, [
            'Usage: neurcode session waive-obligation --id <obligation-id> --reason "<why>"',
        ]);
        process.exitCode = 2;
        return;
    }
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    try {
        const result = (0, governance_runtime_1.waiveArchitectureObligation)(repoRoot, options.obligationId, {
            reason: options.reason,
            sessionId: options.sessionId,
            expiresAt: options.expiresAt,
            ttlMs: typeof options.ttlMinutes === 'number' && Number.isFinite(options.ttlMinutes)
                ? Math.max(0, Math.floor(options.ttlMinutes * 60 * 1000))
                : undefined,
            waivedBy: options.waivedBy,
            source: options.waiverSource || 'local_cli',
        });
        const session = (0, governance_runtime_1.loadSession)(repoRoot, result.sessionId);
        if (session)
            await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, session);
        if (options.json) {
            console.log(JSON.stringify({ ok: true, repoRoot, ...result }, null, 2));
            return;
        }
        console.log('');
        console.log(chalk.yellow(`Waived obligation: ${result.obligationId}`));
        console.log(chalk.dim(`Session:  ${result.sessionId}`));
        console.log(chalk.dim(`Expires:  ${result.expiresAt || 'never'}`));
        console.log(chalk.dim(`Reason:   ${result.waiver.reason}`));
        console.log('');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
            console.log(JSON.stringify({ ok: false, repoRoot, error: message }, null, 2));
        }
        else {
            (0, messages_1.printError)('Obligation Waiver Failed', message);
        }
        process.exitCode = 1;
    }
}
function listRuntimeSessionsCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const records = (0, runtime_evidence_1.listRuntimeSessions)(repoRoot);
    if (options.json) {
        console.log(JSON.stringify({
            ok: true,
            repoRoot,
            count: records.length,
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
        }, null, 2));
        return;
    }
    console.log('');
    console.log(chalk.bold('Neurcode in-flow sessions'));
    console.log(chalk.dim('-'.repeat(96)));
    console.log(`Repo: ${chalk.white(repoRoot)}`);
    console.log('');
    if (records.length === 0) {
        console.log(chalk.dim('No local governance sessions found.'));
        console.log(chalk.dim('Next: run `neurcode activate claude`, then prompt Claude Code in this repo.'));
        console.log('');
        return;
    }
    const rows = [['Session', 'Status', 'Scope', 'Blocks', 'Warns', 'Approvals', 'Goal']];
    for (const record of records) {
        rows.push([
            record.session.sessionId,
            record.session.status,
            record.session.contract.scopeMode,
            String(record.blockCount),
            String(record.warnCount),
            String(record.approvalCount),
            truncate(record.session.contract.goal, 44),
        ]);
    }
    (0, messages_1.printTable)(rows);
    console.log(chalk.dim('Show details: neurcode session show <session-id>'));
    console.log('');
}
function showRuntimeSessionCommand(sessionId, options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const session = (0, governance_runtime_1.loadSession)(repoRoot, sessionId);
    if (!session) {
        if (options.json) {
            console.log(JSON.stringify({ ok: false, repoRoot, error: `Session not found: ${sessionId}` }, null, 2));
        }
        else {
            (0, messages_1.printError)('Session Not Found', `No local governance session found for ${sessionId}`);
        }
        process.exitCode = 1;
        return;
    }
    const records = (0, runtime_evidence_1.listRuntimeSessions)(repoRoot);
    const record = records.find((candidate) => candidate.session.sessionId === sessionId);
    const blockCount = record?.blockCount ?? session.events.filter((event) => event.type === 'check_block').length;
    const warnCount = record?.warnCount ?? session.events.filter((event) => event.type === 'check_warn').length;
    const okCount = record?.okCount ?? session.events.filter((event) => event.type === 'check_ok').length;
    const approvalCount = record?.approvalCount ?? session.events.filter((event) => event.type === 'approval_decision').length;
    const payload = {
        ok: true,
        repoRoot,
        sessionId: session.sessionId,
        status: session.status,
        goal: session.contract.goal,
        scopeMode: session.contract.scopeMode,
        agentPlan: session.contract.agentPlan ?? null,
        agentPlanRevision: session.contract.agentPlanRevision ?? (session.contract.agentPlan ? 1 : null),
        agentPlanRevisions: session.contract.agentPlanRevisions ?? [],
        architectureObligations: session.contract.architectureObligations ?? [],
        allowedGlobs: session.contract.allowedGlobs,
        approvalRequiredGlobs: session.contract.approvalRequiredGlobs,
        approvedPaths: session.contract.approvedPaths,
        blockCount,
        warnCount,
        okCount,
        approvalCount,
        replayHash: session.replayHash,
        recordPath: record?.path ?? `.neurcode/sessions/${session.sessionId}.json`,
        events: session.events,
    };
    if (options.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
    }
    console.log('');
    console.log(chalk.bold(`Neurcode session ${session.sessionId}`));
    console.log(chalk.dim('-'.repeat(72)));
    console.log(`Status:   ${chalk.white(session.status)}`);
    console.log(`Goal:     ${chalk.white(session.contract.goal)}`);
    console.log(`Scope:    ${chalk.white(session.contract.scopeMode)}`);
    console.log(`Plan:     ${chalk.white(session.contract.planCoherenceMode ?? 'warn')}${session.contract.agentPlanRevision ? chalk.dim(` · rev ${session.contract.agentPlanRevision}`) : ''}`);
    if (session.contract.agentPlan?.summary) {
        console.log(`Agent:    ${chalk.white(truncate(session.contract.agentPlan.summary))}`);
    }
    const obligationSummary = (0, governance_runtime_1.summarizeArchitectureObligations)(session.contract.architectureObligations ?? []);
    console.log(`Obligations: ${chalk.white(`${obligationSummary.satisfied}/${obligationSummary.total} satisfied`)}${obligationSummary.criticalPending ? chalk.yellow(` · ${obligationSummary.criticalPending} critical pending`) : ''}`);
    console.log(`Allowed:  ${chalk.dim(compactList(session.contract.allowedGlobs))}`);
    console.log(`Gates:    ${chalk.dim(compactList(session.contract.approvalRequiredGlobs))}`);
    console.log(`Approved: ${chalk.dim(compactList(session.contract.approvedPaths))}`);
    console.log(`Events:   ok=${okCount} warn=${warnCount} block=${blockCount} approvals=${approvalCount}`);
    console.log(`Replay:   ${chalk.dim(session.replayHash ?? 'n/a')}`);
    console.log('');
    console.log(chalk.bold('Timeline'));
    for (const event of session.events) {
        const target = event.filePath || event.decision || event.message || '';
        console.log(chalk.dim(`  ${event.ts}  ${eventLabel(event).padEnd(7)} ${target}`));
    }
    console.log('');
}
/**
 * List all sessions
 */
async function listSessionsCommand(options) {
    try {
        if (options.local) {
            listRuntimeSessionsCommand(options);
            return;
        }
        const config = (0, config_1.loadConfig)();
        if (!config.apiKey) {
            config.apiKey = (0, config_1.requireApiKey)();
        }
        const client = new api_client_1.ApiClient(config);
        const projectId = options.projectId || config.projectId;
        (0, messages_1.printSection)('Session History');
        (0, messages_1.printInfo)('Fetching sessions', projectId ? `Project: ${projectId}` : 'All projects');
        const sessions = await client.getSessions(projectId, options.all ? 100 : 20);
        if (sessions.length === 0) {
            (0, messages_1.printInfo)('No Sessions Found', 'You haven\'t created any sessions yet.\n   Start one with: neurcode plan "<your intent>"');
            return;
        }
        // Group sessions by status
        const activeSessions = sessions.filter(s => s.status === 'active');
        const completedSessions = sessions.filter(s => s.status === 'completed');
        const cancelledSessions = sessions.filter(s => s.status === 'cancelled');
        if (activeSessions.length > 0) {
            (0, messages_1.printSection)('Active Sessions');
            const tableRows = [
                ['Session ID', 'Title/Intent', 'Created', 'Files Changed']
            ];
            for (const session of activeSessions) {
                const title = session.title || session.intentDescription || 'Untitled';
                const shortId = session.sessionId.substring(0, 16) + '...';
                const created = new Date(session.createdAt).toLocaleDateString();
                tableRows.push([
                    shortId,
                    title.length > 40 ? title.substring(0, 40) + '...' : title,
                    created,
                    '—' // Files changed would need additional API call
                ]);
            }
            (0, messages_1.printTable)(tableRows);
        }
        if (completedSessions.length > 0) {
            (0, messages_1.printSection)('Completed Sessions');
            console.log(chalk.dim(`   ${completedSessions.length} completed session(s)`));
            if (!options.all && completedSessions.length > 5) {
                console.log(chalk.dim('   (Showing most recent. Use --all to see all)'));
            }
            console.log('');
        }
        if (cancelledSessions.length > 0) {
            (0, messages_1.printSection)('Cancelled Sessions');
            console.log(chalk.dim(`   ${cancelledSessions.length} cancelled session(s)`));
            console.log('');
        }
        (0, messages_1.printInfo)('Session Management', [
            `Active: ${activeSessions.length} | Completed: ${completedSessions.length} | Cancelled: ${cancelledSessions.length}`,
            'End a session: neurcode session end [session-id]',
            'View session details: neurcode session status [session-id]'
        ].join('\n   • '));
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('401') || error.message.includes('403')) {
                await (0, messages_1.printAuthError)(error);
            }
            else if (error.message.includes('project') || error.message.includes('404')) {
                (0, messages_1.printProjectError)(error, options.projectId);
            }
            else {
                (0, messages_1.printError)('Failed to List Sessions', error);
            }
        }
        else {
            (0, messages_1.printError)('Failed to List Sessions', String(error));
        }
        process.exit(1);
    }
}
/**
 * End a session
 */
async function endSessionCommand(options) {
    try {
        const config = (0, config_1.loadConfig)();
        if (!config.apiKey) {
            config.apiKey = (0, config_1.requireApiKey)();
        }
        const client = new api_client_1.ApiClient(config);
        let sessionId = options.sessionId;
        // If no session ID provided, try to get from state
        if (!sessionId) {
            const stateSessionId = (0, state_1.getSessionId)();
            sessionId = stateSessionId || undefined;
            if (!sessionId) {
                // List active sessions and let user choose
                (0, messages_1.printInfo)('No Active Session', 'Looking for active sessions...');
                const sessions = await client.getSessions(config.projectId, 10);
                const activeSessions = sessions.filter(s => s.status === 'active');
                if (activeSessions.length === 0) {
                    (0, messages_1.printInfo)('No Active Sessions', 'There are no active sessions to end.');
                    return;
                }
                if (activeSessions.length === 1) {
                    sessionId = activeSessions[0].sessionId;
                    const title = activeSessions[0].title || activeSessions[0].intentDescription || 'Untitled';
                    (0, messages_1.printInfo)('Found Active Session', `Ending: ${title}`);
                }
                else {
                    // Multiple active sessions - let user choose
                    (0, messages_1.printSection)('Multiple Active Sessions');
                    activeSessions.forEach((session, index) => {
                        const title = session.title || session.intentDescription || 'Untitled';
                        console.log(chalk.cyan(`  ${index + 1}.`), chalk.white(title));
                        console.log(chalk.dim(`     ${session.sessionId.substring(0, 20)}...`));
                    });
                    console.log('');
                    const answer = await promptUser(chalk.bold('Select session to end (1-' + activeSessions.length + '): '));
                    const choice = parseInt(answer, 10);
                    if (choice >= 1 && choice <= activeSessions.length) {
                        sessionId = activeSessions[choice - 1].sessionId;
                    }
                    else {
                        (0, messages_1.printError)('Invalid Selection', undefined, ['Please run the command again and select a valid number']);
                        process.exit(1);
                    }
                }
            }
        }
        if (!sessionId) {
            (0, messages_1.printError)('No Session Specified', undefined, [
                'No session ID provided and no active session found',
                'Usage: neurcode session end [session-id]',
                'Or set a session: neurcode init'
            ]);
            process.exit(1);
        }
        // Get session details first
        try {
            const sessionData = await client.getSession(sessionId);
            const session = sessionData.session;
            if (session.status === 'completed') {
                (0, messages_1.printWarning)('Session Already Completed', `Session "${session.title || session.intentDescription || sessionId}" is already ended.`);
                return;
            }
            if (session.status === 'cancelled') {
                (0, messages_1.printWarning)('Session Already Cancelled', `Session "${session.title || session.intentDescription || sessionId}" was already cancelled.`);
                return;
            }
            // Show session summary
            const title = session.title || session.intentDescription || 'Untitled Session';
            const filesCount = sessionData.files?.length || 0;
            (0, messages_1.printSection)('Session Summary');
            console.log(chalk.white(`   Title: ${title}`));
            console.log(chalk.white(`   Files Changed: ${filesCount}`));
            console.log(chalk.dim(`   Session ID: ${sessionId}`));
            console.log('');
            // Confirm before ending
            const confirm = await promptUser(chalk.bold('End this session? (y/n): '));
            if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
                (0, messages_1.printInfo)('Cancelled', 'Session was not ended.');
                return;
            }
            await client.endSession(sessionId);
            // Clear session ID from local state if it matches the ended session
            try {
                const currentSessionId = (0, state_1.getSessionId)();
                if (currentSessionId === sessionId) {
                    const { clearSessionId } = await Promise.resolve().then(() => __importStar(require('../utils/state')));
                    clearSessionId();
                }
            }
            catch {
                // Non-critical - continue if state clearing fails
            }
            const firstName = await (0, messages_1.getUserFirstName)();
            await (0, messages_1.printSuccessBanner)('Session Completed', `Great work, ${firstName}! Your session has been marked as complete.`);
            (0, messages_1.printSuccess)('Session Ended Successfully', `"${title}" is now marked as completed.\n   View in dashboard: dashboard.neurcode.com`);
            // Display Session ROI Summary
            try {
                // Fetch ROI summary from API
                const apiUrl = config.apiUrl || process.env.NEURCODE_API_URL || 'https://api.neurcode.com';
                const roiUrl = `${apiUrl}/api/v1/roi/summary?timeRange=7d`;
                const roiResponse = await fetch(roiUrl, {
                    headers: {
                        'Authorization': `Bearer ${config.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                }).catch(() => null);
                if (roiResponse && roiResponse.ok) {
                    const roiData = await roiResponse.json().catch(() => null);
                    if (roiData && roiData.totalCapitalSaved) {
                        const capitalSaved = typeof roiData.totalCapitalSaved === 'string'
                            ? parseFloat(roiData.totalCapitalSaved)
                            : roiData.totalCapitalSaved;
                        const formattedAmount = capitalSaved.toFixed(2);
                        const dashboardUrl = 'https://neurcode.com/dashboard';
                        console.log('');
                        console.log(chalk.cyan('📊'), chalk.bold.white('Current Session ROI:'), chalk.green.bold(`+$${formattedAmount}`));
                        console.log(chalk.dim(`   View full report: ${dashboardUrl}`));
                        console.log('');
                    }
                }
            }
            catch {
                // Silently fail - ROI summary is a nice-to-have
            }
        }
        catch (error) {
            if (error.message?.includes('not found') || error.message?.includes('404')) {
                (0, messages_1.printError)('Session Not Found', error, [
                    `Session "${sessionId}" could not be found`,
                    'List your sessions: neurcode session list',
                    'Verify the session ID is correct'
                ]);
            }
            else {
                throw error;
            }
        }
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('401') || error.message.includes('403')) {
                await (0, messages_1.printAuthError)(error);
            }
            else {
                (0, messages_1.printError)('Failed to End Session', error);
            }
        }
        else {
            (0, messages_1.printError)('Failed to End Session', String(error));
        }
        process.exit(1);
    }
}
/**
 * Show session status
 */
async function sessionStatusCommand(options) {
    try {
        const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
        const localSession = loadLocalGovernanceSession(repoRoot, options.sessionId);
        if (localSession || options.local || (options.json && !options.projectId)) {
            localGovernanceStatusCommand(options);
            return;
        }
        const config = (0, config_1.loadConfig)();
        if (!config.apiKey) {
            config.apiKey = (0, config_1.requireApiKey)();
        }
        const client = new api_client_1.ApiClient(config);
        let sessionId = options.sessionId || (0, state_1.getSessionId)();
        if (!sessionId) {
            (0, messages_1.printError)('No Session Found', undefined, [
                'No active session in this directory',
                'Start a session: neurcode plan "<your intent>"',
                'Or specify a session: neurcode session status <session-id>'
            ]);
            process.exit(1);
        }
        const sessionData = await client.getSession(sessionId);
        const session = sessionData.session;
        await (0, messages_1.printSuccessBanner)('Session Status');
        (0, messages_1.printSection)('Session Details');
        console.log(chalk.white(`   Title: ${session.title || session.intentDescription || 'Untitled'}`));
        console.log(chalk.white(`   Status: ${session.status === 'active' ? chalk.green('Active') : session.status === 'completed' ? chalk.dim('Completed') : chalk.yellow('Cancelled')}`));
        console.log(chalk.white(`   Created: ${new Date(session.createdAt).toLocaleString()}`));
        if (session.endedAt) {
            console.log(chalk.white(`   Ended: ${new Date(session.endedAt).toLocaleString()}`));
        }
        console.log(chalk.white(`   Files Changed: ${sessionData.files?.length || 0}`));
        console.log(chalk.dim(`   Session ID: ${sessionId}`));
        console.log('');
        if (session.status === 'active') {
            (0, messages_1.printInfo)('Active Session', [
                'This session is currently active',
                'End it with: neurcode session end',
                'Or continue working and end it when done'
            ].join('\n   • '));
        }
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('401') || error.message.includes('403')) {
                await (0, messages_1.printAuthError)(error);
            }
            else if (error.message.includes('not found') || error.message.includes('404')) {
                (0, messages_1.printError)('Session Not Found', error, [
                    `Session "${options.sessionId || 'unknown'}" could not be found`,
                    'List your sessions: neurcode session list',
                    'Start a new session: neurcode plan "<your intent>"'
                ]);
            }
            else {
                (0, messages_1.printError)('Failed to Get Session Status', error);
            }
        }
        else {
            (0, messages_1.printError)('Failed to Get Session Status', String(error));
        }
        process.exit(1);
    }
}
function listLocalSessionsCommand(options = {}) {
    try {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const sessions = (0, session_continuity_1.listLocalIntentSessions)(projectRoot);
        if (options.json) {
            console.log(JSON.stringify({
                success: true,
                projectRoot,
                count: sessions.length,
                sessions,
            }, null, 2));
            return;
        }
        (0, messages_1.printSection)('Local Intent Sessions');
        if (sessions.length === 0) {
            (0, messages_1.printInfo)('No Local Sessions', 'Run `neurcode start "<intent>"` to create a persistent intent runtime session.');
            return;
        }
        const rows = [['Session ID', 'Created', 'Branch', 'Intent']];
        for (const session of sessions.slice(0, 12)) {
            rows.push([
                session.sessionId.length > 26 ? `${session.sessionId.slice(0, 26)}...` : session.sessionId,
                new Date(session.createdAt).toLocaleString(),
                session.branchName || '—',
                session.intentSummary.length > 42 ? `${session.intentSummary.slice(0, 42)}...` : session.intentSummary,
            ]);
        }
        (0, messages_1.printTable)(rows);
    }
    catch (error) {
        (0, messages_1.printError)('Failed to List Local Sessions', error instanceof Error ? error : String(error));
        process.exit(1);
    }
}
function currentLocalSessionCommand(options = {}) {
    try {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const active = (0, session_continuity_1.getActiveLocalIntentSession)(projectRoot);
        if (!active) {
            if (options.json) {
                console.log(JSON.stringify({
                    success: false,
                    message: 'No active local intent session found.',
                }, null, 2));
                process.exit(1);
                return;
            }
            (0, messages_1.printInfo)('No Active Local Session', 'Run `neurcode start "<intent>"` to create the canonical local session runtime.');
            return;
        }
        if (options.json) {
            console.log(JSON.stringify({
                success: true,
                projectRoot,
                sessionRuntime: active.sessionRuntime,
                intentPack: active.intentPack,
                contextPack: active.contextPack,
            }, null, 2));
            return;
        }
        (0, messages_1.printSection)('Active Local Intent Session');
        console.log(chalk.white(`   Session ID: ${active.sessionRuntime.sessionId}`));
        console.log(chalk.white(`   Intent: ${active.intentPack.intent.normalized}`));
        console.log(chalk.white(`   Branch: ${active.sessionRuntime.branchName || '—'}`));
        console.log(chalk.white(`   Intent Pack: ${active.intentPack.intentPackId}`));
        console.log(chalk.white(`   Context Pack: ${active.contextPack.contextPackId}`));
        console.log(chalk.white(`   Repo Graph: ${active.repositoryGraph.graphId}`));
        console.log(chalk.dim(`   Created: ${new Date(active.sessionRuntime.createdAt).toLocaleString()}`));
        console.log('');
    }
    catch (error) {
        (0, messages_1.printError)('Failed to Read Local Session', error instanceof Error ? error : String(error));
        process.exit(1);
    }
}
function resumeLocalSessionCommand(options = {}) {
    try {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const resumed = (0, session_continuity_1.resumeLocalIntentSession)(projectRoot, options.sessionId);
        if (!resumed) {
            if (options.json) {
                console.log(JSON.stringify({
                    success: false,
                    message: 'Unable to resume local session. No stored session matched the requested ID.',
                }, null, 2));
                process.exit(1);
                return;
            }
            (0, messages_1.printError)('Unable to Resume Local Session', undefined, ['No stored session matched the requested ID.', 'List available sessions with: neurcode session list-local']);
            process.exit(1);
        }
        if (options.json) {
            console.log(JSON.stringify({
                success: true,
                sessionId: resumed.sessionRuntime.sessionId,
                intentPackId: resumed.intentPack.intentPackId,
                contextPackId: resumed.contextPack.contextPackId,
                repositoryGraphId: resumed.repositoryGraph.graphId,
                activePaths: resumed.activePaths,
            }, null, 2));
            return;
        }
        (0, messages_1.printSuccess)('Local Session Restored', [
            `Session ${resumed.sessionRuntime.sessionId} is now active.`,
            `Intent: ${resumed.intentPack.intent.normalized}`,
            `Intent pack: ${resumed.intentPack.intentPackId}`,
        ].join('\n   • '));
    }
    catch (error) {
        (0, messages_1.printError)('Failed to Resume Local Session', error instanceof Error ? error : String(error));
        process.exit(1);
    }
}
function compareLocalSessionsCommand(options = {}) {
    try {
        if (!options.left || !options.right) {
            throw new Error('Both --left and --right session IDs are required.');
        }
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const comparison = (0, session_continuity_1.compareLocalIntentSessions)(projectRoot, options.left, options.right);
        if (!comparison) {
            throw new Error('Unable to load one or both local sessions.');
        }
        if (options.json) {
            console.log(JSON.stringify({
                success: true,
                comparison,
            }, null, 2));
            return;
        }
        (0, messages_1.printSection)('Local Session Comparison');
        console.log(chalk.white(`   Left: ${comparison.leftSessionId}`));
        console.log(chalk.white(`   Right: ${comparison.rightSessionId}`));
        console.log(chalk.white(`   Same intent: ${comparison.sameIntent ? 'yes' : 'no'}`));
        console.log(chalk.white(`   Same branch: ${comparison.sameBranch ? 'yes' : 'no'}`));
        console.log('');
        (0, messages_1.printInfo)('Scope Delta', [
            `Approved files added: ${comparison.approvedFilesAdded.length || 0}`,
            `Approved files removed: ${comparison.approvedFilesRemoved.length || 0}`,
            `Modules added: ${comparison.modulesAdded.length || 0}`,
            `Modules removed: ${comparison.modulesRemoved.length || 0}`,
            `Boundary expectations added: ${comparison.boundariesAdded.length || 0}`,
            `Boundary expectations removed: ${comparison.boundariesRemoved.length || 0}`,
        ].join('\n   • '));
    }
    catch (error) {
        (0, messages_1.printError)('Failed to Compare Local Sessions', error instanceof Error ? error : String(error));
        process.exit(1);
    }
}
//# sourceMappingURL=session.js.map