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
const messages_1 = require("../utils/messages");
const project_root_1 = require("../utils/project-root");
const session_continuity_1 = require("../utils/session-continuity");
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
/**
 * List all sessions
 */
async function listSessionsCommand(options) {
    try {
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