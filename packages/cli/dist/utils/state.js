"use strict";
/**
 * State Management Utility
 *
 * Manages CLI state in .neurcode/config.json (project-local state)
 * Separates session state from user auth config
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadState = loadState;
exports.saveState = saveState;
exports.getSessionId = getSessionId;
exports.setSessionId = setSessionId;
exports.clearSessionId = clearSessionId;
exports.getProjectId = getProjectId;
exports.setProjectId = setProjectId;
exports.getOrgId = getOrgId;
exports.setOrgId = setOrgId;
exports.setWorkspaceContext = setWorkspaceContext;
exports.getOrgName = getOrgName;
exports.getWorkspaceType = getWorkspaceType;
exports.getWorkspaceRole = getWorkspaceRole;
exports.getLastPlanId = getLastPlanId;
exports.setLastPlanId = setLastPlanId;
exports.getActivePlanId = getActivePlanId;
exports.setActivePlanId = setActivePlanId;
exports.getLastPlanGeneratedAt = getLastPlanGeneratedAt;
exports.setLastPlanGeneratedAt = setLastPlanGeneratedAt;
const fs_1 = require("fs");
const path_1 = require("path");
const gitignore_1 = require("./gitignore");
const project_root_1 = require("./project-root");
const STATE_DIR = '.neurcode';
const CONFIG_FILE = 'config.json'; // Changed from state.json to config.json
/**
 * Get path to config file in current working directory
 */
function getConfigPath() {
    const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const stateDir = (0, path_1.join)(projectRoot, STATE_DIR);
    const configPath = (0, path_1.join)(stateDir, CONFIG_FILE);
    return configPath;
}
/**
 * Ensure state directory exists and .neurcode is in .gitignore
 */
function ensureStateDir() {
    const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const stateDir = (0, path_1.join)(projectRoot, STATE_DIR);
    if (!(0, fs_1.existsSync)(stateDir)) {
        (0, fs_1.mkdirSync)(stateDir, { recursive: true });
    }
    // Auto-add .neurcode to .gitignore
    (0, gitignore_1.ensureNeurcodeInGitignore)(projectRoot);
}
/**
 * Load state from .neurcode/config.json
 */
function loadState() {
    const configPath = getConfigPath();
    if (!(0, fs_1.existsSync)(configPath)) {
        return {};
    }
    try {
        const content = (0, fs_1.readFileSync)(configPath, 'utf-8');
        return JSON.parse(content);
    }
    catch (error) {
        // If file is corrupted, return empty state
        return {};
    }
}
/**
 * Save state to .neurcode/config.json
 */
function saveState(state) {
    ensureStateDir();
    const configPath = getConfigPath();
    const currentState = loadState();
    const newState = { ...currentState, ...state };
    (0, fs_1.writeFileSync)(configPath, JSON.stringify(newState, null, 2) + '\n', 'utf-8');
}
/**
 * Get session ID from state
 */
function getSessionId() {
    const state = loadState();
    return state.sessionId || null;
}
/**
 * Set session ID in state
 */
function setSessionId(sessionId) {
    saveState({ sessionId });
}
/**
 * Clear session ID from state
 */
function clearSessionId() {
    const state = loadState();
    delete state.sessionId;
    saveState(state);
}
/**
 * Get project ID from state
 */
function getProjectId() {
    const state = loadState();
    return state.projectId || null;
}
/**
 * Set project ID in state
 */
function setProjectId(projectId) {
    saveState({ projectId });
}
/**
 * Get organization ID from state
 */
function getOrgId() {
    const state = loadState();
    return state.orgId || null;
}
/**
 * Set organization ID in state
 */
function setOrgId(orgId, orgName) {
    saveState({ orgId, ...(orgName ? { orgName } : {}) });
}
/**
 * Persist the full governance ownership context for this repository.
 */
function setWorkspaceContext(input) {
    saveState({
        orgId: input.orgId,
        ...(input.orgName ? { orgName: input.orgName } : {}),
        ...(input.workspaceType ? { workspaceType: input.workspaceType } : {}),
        ...(input.workspaceRole ? { workspaceRole: input.workspaceRole } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        linkedAt: new Date().toISOString(),
    });
}
/**
 * Get organization name from state
 */
function getOrgName() {
    const state = loadState();
    return state.orgName || null;
}
/**
 * Get workspace ownership type from state.
 */
function getWorkspaceType() {
    const state = loadState();
    return state.workspaceType || null;
}
/**
 * Get workspace role captured during repo initialization.
 */
function getWorkspaceRole() {
    const state = loadState();
    return state.workspaceRole || null;
}
/**
 * Get last plan ID from state
 */
function getLastPlanId() {
    const state = loadState();
    return state.lastPlanId || null;
}
/**
 * Set last plan ID in state
 * @deprecated Use setActivePlanId instead
 */
function setLastPlanId(planId) {
    saveState({ lastPlanId: planId });
}
/**
 * Get active plan ID from state
 * Falls back to lastPlanId for backward compatibility
 */
function getActivePlanId() {
    const state = loadState();
    return state.activePlanId || state.lastPlanId || null;
}
/**
 * Set active plan ID in state
 */
function setActivePlanId(planId) {
    // Save to both activePlanId (new) and lastPlanId (for backward compatibility)
    saveState({ activePlanId: planId, lastPlanId: planId });
}
/**
 * Get last plan generated timestamp
 */
function getLastPlanGeneratedAt() {
    const state = loadState();
    return state.lastPlanGeneratedAt || null;
}
/**
 * Set last plan generated timestamp
 */
function setLastPlanGeneratedAt(timestamp) {
    saveState({ lastPlanGeneratedAt: timestamp });
}
//# sourceMappingURL=state.js.map