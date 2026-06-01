"use strict";
/**
 * Whoami Command - Show Current Runtime Identity
 *
 * Distinguishes the core lifecycle identities:
 * 1. Authenticated user
 * 2. Active workspace
 * 3. Repo ownership context
 * 4. Runtime/session state
 * 5. Governance ownership boundary
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.whoamiCommand = whoamiCommand;
const config_1 = require("../config");
const state_1 = require("../utils/state");
const user_context_1 = require("../utils/user-context");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (str) => str,
        yellow: (str) => str,
        bold: (str) => str,
        dim: (str) => str,
        cyan: (str) => str,
        white: (str) => str,
    };
}
function row(label, value, labelWidth = 24) {
    console.log(`${chalk.dim(label.padEnd(labelWidth))} ${value}`);
}
function workspaceTypeLabel(value) {
    if (value === 'personal')
        return 'Personal workspace';
    if (value === 'organization')
        return 'Organization workspace';
    return 'Workspace';
}
async function whoamiCommand() {
    const state = (0, state_1.loadState)();
    const apiKey = (0, config_1.getApiKey)(state.orgId);
    const fallbackApiKey = apiKey || (0, config_1.getApiKey)();
    console.log('');
    console.log(chalk.bold.white('Neurcode runtime identity'));
    console.log(chalk.dim('Shows user auth, active workspace, repo ownership, session state, and governance boundary.'));
    console.log('');
    if (!fallbackApiKey) {
        row('Runtime connection', chalk.yellow('not connected'));
        console.log('');
        console.log(chalk.dim('Connect this machine first:'));
        console.log(chalk.cyan('  neurcode login'));
        console.log('');
        process.exit(1);
    }
    const userInfo = await (0, user_context_1.getUserInfo)();
    row('Authenticated user', userInfo?.email ? chalk.cyan(userInfo.email) : chalk.green('connected'));
    if (userInfo?.displayName) {
        row('Display name', chalk.dim(userInfo.displayName));
    }
    row('Runtime connection', chalk.green(apiKey ? 'active for repo workspace' : 'active from default keyring'));
    console.log('');
    const hasWorkspace = Boolean(state.orgId);
    const hasRepoOwnership = Boolean(state.orgId && state.projectId);
    const workspaceName = state.orgName || state.orgId || 'not selected';
    row('Active workspace', hasWorkspace ? chalk.cyan(workspaceName) : chalk.yellow('not selected'));
    if (hasWorkspace) {
        row('Workspace type', workspaceTypeLabel(state.workspaceType));
        row('Workspace role', state.workspaceRole || 'unknown');
        row('Workspace ID', chalk.dim(state.orgId || 'unknown'));
    }
    console.log('');
    row('Repo ownership', hasRepoOwnership ? chalk.green('initialized') : chalk.yellow('not initialized'));
    if (state.projectId) {
        row('Project ID', chalk.dim(state.projectId));
    }
    if (state.linkedAt) {
        row('Linked at', chalk.dim(state.linkedAt));
    }
    console.log('');
    row('Active session', state.activeSessionId || state.sessionId || chalk.dim('none'));
    row('Active plan', state.activePlanId || state.lastPlanId || chalk.dim('none'));
    console.log('');
    if (hasRepoOwnership) {
        row('Governance boundary', chalk.green(`${workspaceName} owns this repository context`), 24);
        console.log(chalk.dim('Commands in this directory resolve policy, evidence, and runtime state through that boundary.'));
    }
    else {
        row('Governance boundary', chalk.yellow('not established'), 24);
        console.log(chalk.dim('Bind this repository before starting the governed lifecycle:'));
        console.log(chalk.cyan('  neurcode init'));
    }
    console.log('');
}
//# sourceMappingURL=whoami.js.map