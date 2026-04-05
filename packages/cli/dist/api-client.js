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
exports.ApiClient = void 0;
const config_1 = require("./config");
const state_1 = require("./utils/state");
class ApiClient {
    apiUrl;
    apiKey;
    scopedOrgId;
    requestTimeout;
    applyRequestTimeout;
    applyRecoveryWaitMs;
    applyRecoveryPollIntervalMs;
    isRetryingAuth = false; // Flag to prevent infinite retry loops
    constructor(config) {
        const parsePositiveIntEnv = (name, fallback) => {
            const raw = process.env[name];
            if (!raw)
                return fallback;
            const parsed = Number(raw);
            if (!Number.isFinite(parsed) || parsed <= 0)
                return fallback;
            return Math.floor(parsed);
        };
        // API URL will always be set (defaults to production)
        // This check is no longer needed, but kept for safety
        this.apiUrl = (config.apiUrl || 'https://api.neurcode.com').replace(/\/$/, ''); // Remove trailing slash
        this.apiKey = config.apiKey;
        this.scopedOrgId = typeof config.orgId === 'string' && config.orgId.trim() ? config.orgId.trim() : undefined;
        this.requestTimeout = parsePositiveIntEnv('NEURCODE_REQUEST_TIMEOUT_MS', 300000);
        // Apply often includes model retries + per-file fallback, so use a longer default.
        this.applyRequestTimeout = parsePositiveIntEnv('NEURCODE_APPLY_TIMEOUT_MS', Math.max(this.requestTimeout, 900000));
        this.applyRecoveryWaitMs = parsePositiveIntEnv('NEURCODE_APPLY_RECOVERY_WAIT_MS', 120000);
        this.applyRecoveryPollIntervalMs = parsePositiveIntEnv('NEURCODE_APPLY_RECOVERY_POLL_MS', 5000);
    }
    /**
     * Update API key after re-login
     */
    updateApiKey(newApiKey) {
        this.apiKey = newApiKey;
    }
    /**
     * Get API key, requiring it if not set
     * Shows helpful error message if missing
     */
    getApiKey() {
        if (this.apiKey) {
            return this.apiKey;
        }
        // Use requireApiKey which shows helpful error message if missing
        return (0, config_1.requireApiKey)(this.scopedOrgId);
    }
    /**
     * Resolve org context for outgoing requests.
     * Explicit constructor scope wins; fallback is project-local state.
     */
    resolveRequestOrgId() {
        return this.scopedOrgId || (0, state_1.getOrgId)();
    }
    /**
     * Create a fetch request with timeout support
     * Uses AbortController to implement timeout for long-running requests
     */
    async fetchWithTimeout(url, options = {}, timeoutMs = this.requestTimeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        // Auto-inject x-org-id into ALL outgoing requests for multi-tenancy
        if (!options.headers) {
            options.headers = {};
        }
        const headers = options.headers;
        const orgId = this.resolveRequestOrgId();
        if (orgId && !headers['x-org-id']) {
            headers['x-org-id'] = orgId;
        }
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            return response;
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Request timeout after ${Math.floor(timeoutMs / 1000)}s. The server may still be processing your request.`);
            }
            throw error;
        }
    }
    /**
     * Wrapper for fetch with debug logging on error
     * Logs the exact URL attempted when fetch fails
     */
    async fetchWithDebug(url, options = {}, timeoutMs = this.requestTimeout) {
        try {
            return await this.fetchWithTimeout(url, options, timeoutMs);
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Central request handler with 401 recovery
     * Handles authentication failures gracefully by prompting for re-login
     */
    async makeRequest(url, options, retryOnAuth = true) {
        // Get API key for authorization
        const apiKey = this.getApiKey();
        const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        // Ensure headers exist
        if (!options.headers) {
            options.headers = {};
        }
        const headers = options.headers;
        headers['Authorization'] = authHeader;
        // Auto-inject x-org-id from local project context for multi-tenancy
        const orgId = this.resolveRequestOrgId();
        if (orgId && !headers['x-org-id']) {
            headers['x-org-id'] = orgId;
        }
        try {
            const response = await this.fetchWithDebug(url, options);
            // Check for 401 Unauthorized
            if (response.status === 401) {
                const errorText = await response.text().catch(() => '');
                let errorJson = null;
                try {
                    errorJson = JSON.parse(errorText);
                }
                catch {
                    // Error body is not JSON, use default message
                }
                // If we're already retrying or this is a retry attempt, don't loop
                if (this.isRetryingAuth || !retryOnAuth) {
                    const errorMessage = errorJson?.message || errorJson?.error || 'Authentication failed';
                    throw new Error(`Error: Authentication failed. Please run 'neurcode login'.`);
                }
                // Check if terminal is interactive
                if (process.stdout.isTTY && !process.env.CI) {
                    // Import readline for interactive prompt
                    const { createInterface } = await Promise.resolve().then(() => __importStar(require('readline/promises')));
                    const { stdin, stdout } = await Promise.resolve().then(() => __importStar(require('process')));
                    const rl = createInterface({ input: stdin, output: stdout });
                    try {
                        const answer = await rl.question('❌ Session expired or invalid. Would you like to log in again? (Y/n) ');
                        rl.close();
                        const shouldRelogin = answer.trim().toLowerCase() !== 'n' && answer.trim().toLowerCase() !== 'no';
                        if (shouldRelogin) {
                            // Set flag to prevent infinite loops
                            this.isRetryingAuth = true;
                            try {
                                // Import and call login command
                                const { loginCommand } = await Promise.resolve().then(() => __importStar(require('./commands/login')));
                                await loginCommand(this.scopedOrgId ? { orgId: this.scopedOrgId } : undefined);
                                // Reload key (scoped to this client's org when provided)
                                const refreshedApiKey = this.scopedOrgId
                                    ? (0, config_1.getApiKey)(this.scopedOrgId)
                                    : (0, config_1.getApiKey)();
                                if (refreshedApiKey) {
                                    this.updateApiKey(refreshedApiKey);
                                    // Retry the request once with new auth
                                    // Create new options object with updated authorization header
                                    const newAuthHeader = refreshedApiKey.startsWith('Bearer ')
                                        ? refreshedApiKey
                                        : `Bearer ${refreshedApiKey}`;
                                    const retryOptions = {
                                        ...options,
                                        headers: {
                                            ...headers,
                                            'Authorization': newAuthHeader,
                                        },
                                    };
                                    // Retry with retry flag set to false to prevent loops
                                    const retryResponse = await this.fetchWithDebug(url, retryOptions);
                                    if (retryResponse.status === 401) {
                                        // Still 401 after login - something is wrong
                                        throw new Error(`Error: Authentication failed. Please run 'neurcode login'.`);
                                    }
                                    if (!retryResponse.ok) {
                                        const retryErrorText = await retryResponse.text();
                                        throw new Error(`API request failed with status ${retryResponse.status}: ${retryErrorText}`);
                                    }
                                    return retryResponse.json();
                                }
                                else {
                                    throw new Error(`Error: Authentication failed. Please run 'neurcode login'.`);
                                }
                            }
                            catch (loginError) {
                                // Login failed or was cancelled
                                if (loginError instanceof Error && loginError.message.includes('Authentication failed')) {
                                    throw loginError;
                                }
                                throw new Error(`Error: Authentication failed. Please run 'neurcode login'.`);
                            }
                            finally {
                                // Reset flag
                                this.isRetryingAuth = false;
                            }
                        }
                        else {
                            // User declined to login
                            throw new Error(`Error: Authentication failed. Please run 'neurcode login'.`);
                        }
                    }
                    catch (promptError) {
                        rl.close();
                        throw promptError;
                    }
                }
                else {
                    // Non-interactive terminal (CI, scripts, etc.)
                    const errorMessage = errorJson?.message || errorJson?.error || 'Authentication failed';
                    throw new Error(`Error: Authentication failed. Please run 'neurcode login'.`);
                }
            }
            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `API request failed with status ${response.status}`;
                let errorJson = null;
                try {
                    errorJson = JSON.parse(errorText);
                }
                catch {
                    // ignore
                }
                // Multi-tenant auth: keys are org-scoped. Give a CLI-native hint.
                if (response.status === 403 &&
                    (errorJson?.code === 'API_KEY_ORG_MISMATCH' || errorJson?.code === 'API_KEY_UNSCOPED')) {
                    const currentOrgId = (0, state_1.getOrgId)();
                    const orgHint = currentOrgId ? ` (org: ${currentOrgId})` : '';
                    throw new Error(`API key is not valid for the current organization. ` +
                        `Run 'neurcode login'${orgHint} to authenticate for this org.`);
                }
                if (errorJson) {
                    errorMessage = errorJson.error || errorMessage;
                    if (errorJson.message) {
                        errorMessage += `: ${errorJson.message}`;
                    }
                }
                else {
                    errorMessage += `: ${errorText}`;
                }
                throw new Error(errorMessage);
            }
            return response.json();
        }
        catch (error) {
            // Re-throw if it's already our formatted error
            if (error instanceof Error && error.message.startsWith('Error: Authentication failed')) {
                throw error;
            }
            // For other errors, wrap them appropriately
            throw error;
        }
    }
    async analyzeDiff(diff, projectId) {
        const url = `${this.apiUrl}/api/v1/analyze-diff`;
        const headers = {
            'Content-Type': 'application/json'
        };
        return this.makeRequest(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                diff,
                projectId
            })
        });
    }
    async analyzeBloat(diff, intent, projectId, sessionId, fileContents) {
        const url = `${this.apiUrl}/api/v1/analyze-bloat`;
        const headers = {
            'Content-Type': 'application/json'
        };
        return this.makeRequest(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                diff,
                intent,
                projectId,
                sessionId,
                fileContents
            })
        });
    }
    async getFileVersions(filePath, projectId, limit = 50) {
        const url = `${this.apiUrl}/api/v1/revert/versions`;
        const params = new URLSearchParams({ filePath });
        if (projectId)
            params.set('projectId', projectId);
        if (limit)
            params.set('limit', limit.toString());
        const headers = {
            'Content-Type': 'application/json'
        };
        const apiKey = this.getApiKey();
        const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        headers['Authorization'] = key;
        const fullUrl = `${url}?${params.toString()}`;
        const response = await this.fetchWithDebug(fullUrl, {
            method: 'GET',
            headers,
        });
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorMessage;
                if (errorJson.message) {
                    errorMessage += `: ${errorJson.message}`;
                }
            }
            catch {
                errorMessage += `: ${errorText}`;
            }
            throw new Error(errorMessage);
        }
        return response.json();
    }
    async getFileVersion(filePath, version, projectId) {
        const url = `${this.apiUrl}/api/v1/revert/version`;
        const params = new URLSearchParams({
            filePath,
            version: version.toString()
        });
        if (projectId)
            params.set('projectId', projectId);
        const headers = {
            'Content-Type': 'application/json'
        };
        const apiKey = this.getApiKey();
        const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        headers['Authorization'] = key;
        const fullUrl = `${url}?${params.toString()}`;
        const response = await this.fetchWithDebug(fullUrl, {
            method: 'GET',
            headers,
        });
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorMessage;
                if (errorJson.message) {
                    errorMessage += `: ${errorJson.message}`;
                }
            }
            catch {
                errorMessage += `: ${errorText}`;
            }
            throw new Error(errorMessage);
        }
        return response.json();
    }
    /**
     * Save a file version (for pre-flight snapshots)
     */
    async saveFileVersion(filePath, fileContent, projectId, reason, changeType, linesAdded, linesRemoved) {
        const url = `${this.apiUrl}/api/v1/file-versions/save`;
        const headers = {
            'Content-Type': 'application/json'
        };
        const apiKey = this.getApiKey();
        const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        headers['Authorization'] = key;
        const response = await this.fetchWithDebug(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                filePath,
                fileContent,
                projectId,
                reason,
                changeType,
                linesAdded,
                linesRemoved,
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorMessage;
                if (errorJson.message) {
                    errorMessage += `: ${errorJson.message}`;
                }
            }
            catch {
                errorMessage += `: ${errorText}`;
            }
            throw new Error(errorMessage);
        }
        return response.json();
    }
    /**
     * Save multiple file versions in one request (faster pre-flight snapshot capture).
     * Falls back to per-file uploads when the server does not support batch endpoint.
     */
    async saveFileVersionsBatch(snapshots, projectId, reason) {
        const url = `${this.apiUrl}/api/v1/file-versions/save-batch`;
        const headers = {
            'Content-Type': 'application/json'
        };
        const apiKey = this.getApiKey();
        const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        headers['Authorization'] = key;
        const response = await this.fetchWithDebug(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                snapshots,
                projectId,
                reason,
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorMessage;
                if (errorJson.message) {
                    errorMessage += `: ${errorJson.message}`;
                }
            }
            catch {
                errorMessage += `: ${errorText}`;
            }
            throw new Error(errorMessage);
        }
        return response.json();
    }
    async revertFile(filePath, toVersion, projectId, reason) {
        const url = `${this.apiUrl}/api/v1/revert/file`;
        const headers = {
            'Content-Type': 'application/json'
        };
        const apiKey = this.getApiKey();
        const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        headers['Authorization'] = key;
        const response = await this.fetchWithDebug(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                filePath,
                toVersion,
                projectId,
                reason,
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorMessage;
                if (errorJson.message) {
                    errorMessage += `: ${errorJson.message}`;
                }
            }
            catch {
                errorMessage += `: ${errorText}`;
            }
            throw new Error(errorMessage);
        }
        return response.json();
    }
    async refactor(fileContent, redundantBlocks, options) {
        const url = `${this.apiUrl}/api/v1/refactor`;
        const headers = {
            'Content-Type': 'application/json'
        };
        const apiKey = this.getApiKey();
        const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        headers['Authorization'] = key;
        const response = await this.fetchWithDebug(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                fileContent,
                redundantBlocks,
                projectType: options?.projectType,
                framework: options?.framework,
                patterns: options?.patterns,
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorMessage;
                if (errorJson.message) {
                    errorMessage += `: ${errorJson.message}`;
                }
            }
            catch {
                errorMessage += `: ${errorText}`;
            }
            throw new Error(errorMessage);
        }
        return response.json();
    }
    async analyzeSecurity(diff, projectType) {
        const url = `${this.apiUrl}/api/v1/analyze-security`;
        const headers = {
            'Content-Type': 'application/json'
        };
        const apiKey = this.getApiKey();
        const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        headers['Authorization'] = key;
        const response = await this.fetchWithDebug(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                diff,
                projectType,
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorMessage;
                if (errorJson.message) {
                    errorMessage += `: ${errorJson.message}`;
                }
            }
            catch {
                errorMessage += `: ${errorText}`;
            }
            throw new Error(errorMessage);
        }
        return response.json();
    }
    /**
     * Connect or ensure project exists
     * Automatically detects Git URL and creates/links project
     *
     * Note: organizationId is automatically extracted from the auth token by the backend,
     * so it does not need to be passed in the request body.
     *
     * Backend Issue: The /api/v1/projects/connect endpoint currently requires a non-empty gitUrl.
     * When creating name-only projects (without Git), this will fail with "gitUrl is required".
     * The backend should be updated to allow empty gitUrl when name is provided.
     */
    async ensureProject(gitUrl, name) {
        const url = `${this.apiUrl}/api/v1/projects/connect`;
        const result = await this.makeRequest(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gitUrl: gitUrl || '',
                name,
            }),
        });
        return { id: result.id, name: result.name };
    }
    /**
     * Select relevant files from a file tree (Semantic Scout - Pass 1)
     *
     * @param intent - User's intent/request description
     * @param fileTree - Array of file paths representing the project structure
     * @param projectSummary - Optional project summary (tech stack + architecture)
     * @returns Array of selected file paths (max 15)
     */
    async selectFiles(intent, fileTree, projectSummary) {
        const url = `${this.apiUrl}/api/v1/plan/select-files`;
        const headers = {
            'Content-Type': 'application/json'
        };
        const response = await this.makeRequest(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                intent,
                fileTree,
                projectSummary,
            })
        });
        return response.files;
    }
    async generatePlan(intent, files, projectId, ticketMetadata, projectSummary) {
        const url = `${this.apiUrl}/api/v1/plan`;
        const headers = {
            'Content-Type': 'application/json'
        };
        return this.makeRequest(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                intent,
                files,
                projectId,
                ticketMetadata,
                projectSummary,
            })
        });
    }
    async importExternalPlan(input) {
        const url = `${this.apiUrl}/api/v1/plan/import`;
        return this.makeRequest(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(input),
        });
    }
    async applyPlan(planId, snapshots) {
        const url = `${this.apiUrl}/api/v1/apply`;
        const headers = {
            'Content-Type': 'application/json'
        };
        // Get API key (will show helpful error if missing)
        const apiKey = this.getApiKey();
        // Support both "Bearer nk_live_..." and just "nk_live_..."
        const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        headers['Authorization'] = key;
        const requestBody = JSON.stringify({
            planId,
            snapshots: snapshots || [],
        });
        const executeApplyRequest = () => this.fetchWithDebug(url, {
            method: 'POST',
            headers,
            body: requestBody,
        }, this.applyRequestTimeout);
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const isTimeoutError = (error) => error instanceof Error && /request timeout after/i.test(error.message);
        const isTransientNetworkError = (error) => {
            if (!(error instanceof Error))
                return false;
            const text = error.message.toLowerCase();
            return (text.includes('fetch failed') ||
                text.includes('socket hang up') ||
                text.includes('econnreset') ||
                text.includes('etimedout') ||
                text.includes('gateway timeout') ||
                text.includes('gateway time-out') ||
                text.includes('request aborted'));
        };
        const recoverFromAppliedPlan = async (plan) => {
            const recoverablePaths = (plan.content?.files || [])
                .filter((file) => file.action !== 'BLOCK')
                .map((file) => file.path);
            if (recoverablePaths.length === 0) {
                return null;
            }
            const recoveredFiles = [];
            for (const path of recoverablePaths) {
                try {
                    const versions = await this.getFileVersions(path, plan.projectId || undefined, 1);
                    if (versions.length > 0 && typeof versions[0].fileContent === 'string') {
                        recoveredFiles.push({
                            path,
                            content: versions[0].fileContent,
                        });
                    }
                }
                catch {
                    // Continue best-effort recovery for remaining files.
                }
            }
            if (recoveredFiles.length === 0) {
                return null;
            }
            return {
                success: true,
                planId,
                filesGenerated: recoveredFiles.length,
                files: recoveredFiles,
                message: 'Recovered apply output from version history after delayed/timeout response.',
            };
        };
        const parseApplyPayload = (raw) => {
            try {
                return JSON.parse(raw);
            }
            catch (error) {
                const parseMessage = error instanceof Error ? error.message : 'Unknown JSON parse error';
                throw new Error(`Apply response parse failed: ${parseMessage}`);
            }
        };
        const formatApplyHttpError = (status, errorText) => {
            let errorMessage = `API request failed with status ${status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorMessage;
                if (errorJson.message) {
                    errorMessage += `: ${errorJson.message}`;
                }
            }
            catch {
                errorMessage += `: ${errorText}`;
            }
            return errorMessage;
        };
        const shouldAttemptRecovery = (status, errorText) => {
            if (status !== 400 && status !== 409)
                return false;
            const lower = errorText.toLowerCase();
            return lower.includes('already been applied') || lower.includes('cannot be applied');
        };
        const attemptRecovery = async () => {
            try {
                const plan = await this.getPlan(planId);
                if (plan.status !== 'APPLIED') {
                    return null;
                }
                return recoverFromAppliedPlan(plan);
            }
            catch {
                return null;
            }
        };
        const attemptRecoveryAfterTimeout = async () => {
            const deadline = Date.now() + this.applyRecoveryWaitMs;
            while (Date.now() < deadline) {
                try {
                    const plan = await this.getPlan(planId);
                    if (plan.status === 'APPLIED') {
                        return recoverFromAppliedPlan(plan);
                    }
                    if (plan.status === 'REJECTED' || plan.status === 'CANCELLED') {
                        return null;
                    }
                }
                catch {
                    // Continue polling best-effort during recovery window.
                }
                await sleep(this.applyRecoveryPollIntervalMs);
            }
            return null;
        };
        let response;
        try {
            response = await executeApplyRequest();
        }
        catch (error) {
            if (isTimeoutError(error) || isTransientNetworkError(error)) {
                const recovered = await attemptRecoveryAfterTimeout();
                if (recovered) {
                    return recovered;
                }
                const suffix = isTimeoutError(error)
                    ? `Recovery check waited ${Math.floor(this.applyRecoveryWaitMs / 1000)}s but no applied result was available yet.`
                    : `Request failed due transient network error; recovery polling waited ${Math.floor(this.applyRecoveryWaitMs / 1000)}s but no applied result was available yet.`;
                throw new Error(`${error.message}\n${suffix}`);
            }
            throw error;
        }
        if (!response.ok) {
            const errorText = await response.text();
            if (shouldAttemptRecovery(response.status, errorText)) {
                const recovered = await attemptRecovery();
                if (recovered) {
                    return recovered;
                }
            }
            throw new Error(formatApplyHttpError(response.status, errorText));
        }
        const responseText = await response.text();
        try {
            return parseApplyPayload(responseText);
        }
        catch (firstParseError) {
            // Retry once: this handles rare transient truncation/stream parse failures.
            const retryResponse = await executeApplyRequest();
            if (retryResponse.ok) {
                const retryText = await retryResponse.text();
                try {
                    return parseApplyPayload(retryText);
                }
                catch {
                    const recovered = await attemptRecovery();
                    if (recovered) {
                        return recovered;
                    }
                }
            }
            else {
                const retryErrorText = await retryResponse.text();
                if (shouldAttemptRecovery(retryResponse.status, retryErrorText)) {
                    const recovered = await attemptRecovery();
                    if (recovered) {
                        return recovered;
                    }
                }
            }
            const preview = responseText
                .slice(0, 240)
                .replace(/\s+/g, ' ')
                .trim();
            const detail = firstParseError instanceof Error ? firstParseError.message : 'Unknown parse error';
            throw new Error(`Plan application response was malformed/truncated. ${detail}. Response preview: ${preview}`);
        }
    }
    /**
     * Get active custom policies for the authenticated user (dashboard-defined rules).
     * Used by verify to enforce e.g. "No console.log" and other custom rules.
     */
    async getActiveCustomPolicies() {
        const url = `${this.apiUrl}/api/v1/custom-policies/active`;
        const response = await this.makeRequest(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        return response.policies ?? [];
    }
    async getOrgGovernanceSettings() {
        const url = `${this.apiUrl}/api/v1/org/governance/settings`;
        const response = await this.makeRequest(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        if (!response?.settings) {
            return null;
        }
        return response.settings;
    }
    async updateOrgGovernanceSettings(input) {
        const url = `${this.apiUrl}/api/v1/org/governance/settings`;
        const response = await this.makeRequest(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input || {}),
        });
        if (!response?.settings) {
            return null;
        }
        return response.settings;
    }
    async getOrgAuditEvidenceBundle(params) {
        const queryParams = new URLSearchParams();
        if (typeof params?.includeEvents === 'boolean') {
            queryParams.set('includeEvents', params.includeEvents ? 'true' : 'false');
        }
        if (Number.isFinite(params?.limit)) {
            queryParams.set('limit', String(params?.limit));
        }
        if (params?.action) {
            queryParams.set('action', params.action);
        }
        if (params?.actorUserId) {
            queryParams.set('actorUserId', params.actorUserId);
        }
        if (params?.targetType) {
            queryParams.set('targetType', params.targetType);
        }
        if (params?.from) {
            queryParams.set('from', params.from);
        }
        if (params?.to) {
            queryParams.set('to', params.to);
        }
        const suffix = queryParams.toString();
        const url = `${this.apiUrl}/api/v1/org/audit-events/evidence${suffix ? `?${suffix}` : ''}`;
        return this.makeRequest(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
    }
    async listOrgPolicyExceptions(params) {
        const queryParams = new URLSearchParams();
        if (params?.state) {
            queryParams.set('state', params.state);
        }
        if (Number.isFinite(params?.limit)) {
            queryParams.set('limit', String(params?.limit));
        }
        const suffix = queryParams.toString();
        const url = `${this.apiUrl}/api/v1/org/policy-exceptions${suffix ? `?${suffix}` : ''}`;
        const response = await this.makeRequest(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        return Array.isArray(response?.exceptions) ? response.exceptions : [];
    }
    async createOrgPolicyException(input) {
        const url = `${this.apiUrl}/api/v1/org/policy-exceptions`;
        const response = await this.makeRequest(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        });
        if (!response?.exception) {
            throw new Error('Failed to create organization policy exception');
        }
        return response.exception;
    }
    async approveOrgPolicyException(exceptionId, input) {
        const url = `${this.apiUrl}/api/v1/org/policy-exceptions/${encodeURIComponent(exceptionId)}/approve`;
        const response = await this.makeRequest(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input || {}),
        });
        if (!response?.exception) {
            throw new Error('Failed to approve organization policy exception');
        }
        return response.exception;
    }
    async rejectOrgPolicyException(exceptionId, input) {
        const url = `${this.apiUrl}/api/v1/org/policy-exceptions/${encodeURIComponent(exceptionId)}/reject`;
        const response = await this.makeRequest(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        });
        if (!response?.exception) {
            throw new Error('Failed to reject organization policy exception');
        }
        return response.exception;
    }
    async revokeOrgPolicyException(exceptionId, input) {
        const url = `${this.apiUrl}/api/v1/org/policy-exceptions/${encodeURIComponent(exceptionId)}/revoke`;
        const response = await this.makeRequest(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input || {}),
        });
        if (!response?.exception) {
            throw new Error('Failed to revoke organization policy exception');
        }
        return response.exception;
    }
    async listOrgPolicyExceptionEvents(exceptionId, limit) {
        const queryParams = new URLSearchParams();
        if (Number.isFinite(limit)) {
            queryParams.set('limit', String(limit));
        }
        const suffix = queryParams.toString();
        const url = `${this.apiUrl}/api/v1/org/policy-exceptions/${encodeURIComponent(exceptionId)}/events${suffix ? `?${suffix}` : ''}`;
        const response = await this.makeRequest(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        return Array.isArray(response?.events) ? response.events : [];
    }
    async enqueueVerifyPlanJob(input) {
        const url = `${this.apiUrl}/api/v1/verify/jobs`;
        const response = await this.makeRequest(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
            },
            body: JSON.stringify({
                planId: input.planId,
                diffStats: input.diffStats,
                changedFiles: input.changedFiles,
                projectId: input.projectId,
                intentConstraints: input.intentConstraints,
                policyRules: input.policyRules,
                verificationSource: input.verificationSource || 'api',
                compiledPolicy: input.compiledPolicy || null,
                idempotencyKey: input.idempotencyKey,
                maxAttempts: input.maxAttempts,
            }),
        });
        return response;
    }
    async getVerifyPlanJob(jobId) {
        const url = `${this.apiUrl}/api/v1/verify/jobs/${encodeURIComponent(jobId)}`;
        return this.makeRequest(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
    }
    async verifyPlan(planId, diffStats, changedFiles, projectId, intentConstraints, policyRules, verificationSource, compiledPolicy, executionOptions) {
        const queueBackedMode = executionOptions?.async === true;
        const effectiveIdempotencyKey = executionOptions?.idempotencyKey?.trim() || undefined;
        const effectiveMaxAttempts = Number.isFinite(executionOptions?.maxAttempts)
            ? Math.min(Math.max(Math.floor(executionOptions.maxAttempts), 1), 10)
            : undefined;
        const basePayload = {
            planId,
            diffStats,
            changedFiles,
            projectId,
            intentConstraints,
            policyRules,
            verificationSource: verificationSource || 'api',
            compiledPolicy: compiledPolicy || null,
        };
        if (queueBackedMode) {
            const queueResponse = await this.enqueueVerifyPlanJob({
                ...basePayload,
                idempotencyKey: effectiveIdempotencyKey,
                maxAttempts: effectiveMaxAttempts,
            });
            if (queueResponse.status === 'COMPLETED' && queueResponse.result) {
                return queueResponse.result;
            }
            const pollIntervalMs = Number.isFinite(executionOptions?.pollIntervalMs)
                ? Math.min(Math.max(Math.floor(executionOptions.pollIntervalMs), 250), 30_000)
                : 1500;
            const timeoutMs = Number.isFinite(executionOptions?.timeoutMs)
                ? Math.min(Math.max(Math.floor(executionOptions.timeoutMs), 5_000), 30 * 60 * 1000)
                : 5 * 60 * 1000;
            const startedAt = Date.now();
            while (Date.now() - startedAt <= timeoutMs) {
                await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
                const job = await this.getVerifyPlanJob(queueResponse.jobId);
                if (job.status === 'COMPLETED' && job.result) {
                    return job.result;
                }
                if (job.status === 'FAILED') {
                    const suffix = job.errorMessage ? `: ${job.errorMessage}` : '';
                    throw new Error(`Verify job ${job.jobId} failed${suffix}`);
                }
            }
            throw new Error(`Timed out waiting for verify job ${queueResponse.jobId}. Increase --verify-job-timeout-ms or inspect job status separately.`);
        }
        const url = `${this.apiUrl}/api/v1/verify`;
        const headers = {
            'Content-Type': 'application/json'
        };
        const apiKey = this.getApiKey();
        const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        headers['Authorization'] = key;
        const compactPayload = {
            ...basePayload,
            changedFiles: changedFiles.map((file) => ({
                path: file.path,
                oldPath: file.oldPath,
                changeType: file.changeType,
                added: file.added,
                removed: file.removed,
                hunks: [],
            })),
        };
        const sendVerifyRequest = async (payload) => this.fetchWithDebug(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });
        let response = await sendVerifyRequest(basePayload);
        if (response.status === 413) {
            response = await sendVerifyRequest(compactPayload);
        }
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorMessage;
                if (errorJson.message) {
                    errorMessage += `: ${errorJson.message}`;
                }
            }
            catch {
                errorMessage += `: ${errorText}`;
            }
            throw new Error(errorMessage);
        }
        return response.json();
    }
    async submitVerificationFeedback(verificationId, payload) {
        const url = `${this.apiUrl}/api/v1/action/verifications/${verificationId}/feedback`;
        return this.makeRequest(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
    }
    async listVerificationFeedback(verificationId, options) {
        const params = new URLSearchParams();
        if (options?.reviewStatus)
            params.set('reviewStatus', options.reviewStatus);
        if (Number.isFinite(options?.limit))
            params.set('limit', String(options?.limit));
        const queryString = params.toString();
        const url = `${this.apiUrl}/api/v1/action/verifications/${verificationId}/feedback${queryString ? `?${queryString}` : ''}`;
        return this.makeRequest(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    async listVerificationFeedbackInbox(options) {
        const params = new URLSearchParams();
        if (options?.reviewStatus)
            params.set('reviewStatus', options.reviewStatus);
        if (Number.isFinite(options?.limit))
            params.set('limit', String(options?.limit));
        if (typeof options?.mine === 'boolean')
            params.set('mine', options.mine ? 'true' : 'false');
        const queryString = params.toString();
        const url = `${this.apiUrl}/api/v1/action/verifications/feedback/inbox${queryString ? `?${queryString}` : ''}`;
        return this.makeRequest(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    async getVerificationFeedbackStats(options) {
        const params = new URLSearchParams();
        if (options?.reviewStatus)
            params.set('reviewStatus', options.reviewStatus);
        if (typeof options?.mine === 'boolean')
            params.set('mine', options.mine ? 'true' : 'false');
        if (Number.isFinite(options?.days))
            params.set('days', String(options?.days));
        if (Number.isFinite(options?.limit))
            params.set('limit', String(options?.limit));
        const queryString = params.toString();
        const url = `${this.apiUrl}/api/v1/action/verifications/feedback/stats${queryString ? `?${queryString}` : ''}`;
        return this.makeRequest(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    async reviewVerificationFeedback(verificationId, feedbackId, payload) {
        const url = `${this.apiUrl}/api/v1/action/verifications/${verificationId}/feedback/${feedbackId}/review`;
        return this.makeRequest(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
    }
    async escalateVerificationFeedback(verificationId, feedbackId, payload) {
        const url = `${this.apiUrl}/api/v1/action/verifications/${verificationId}/feedback/${feedbackId}/escalate`;
        return this.makeRequest(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload || {}),
        });
    }
    /**
     * Allow a file to be modified in a session (bypass scope guard)
     */
    async allowFile(sessionId, filePath) {
        const url = `${this.apiUrl}/api/v1/sessions/${sessionId}/allow`;
        const headers = {
            'Content-Type': 'application/json'
        };
        const apiKey = this.getApiKey();
        const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        headers['Authorization'] = key;
        const response = await this.fetchWithDebug(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ filePath }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorMessage;
                if (errorJson.message) {
                    errorMessage += `: ${errorJson.message}`;
                }
            }
            catch {
                errorMessage += `: ${errorText}`;
            }
            throw new Error(errorMessage);
        }
        return response.json();
    }
    /**
     * Get plan by ID
     */
    async getPlan(planId) {
        const url = `${this.apiUrl}/api/v1/plan/${planId}`;
        const headers = {
            'Content-Type': 'application/json'
        };
        const apiKey = this.getApiKey();
        const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        headers['Authorization'] = key;
        const response = await this.fetchWithDebug(url, {
            method: 'GET',
            headers,
        });
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorMessage;
                if (errorJson.message) {
                    errorMessage += `: ${errorJson.message}`;
                }
            }
            catch {
                errorMessage += `: ${errorText}`;
            }
            throw new Error(errorMessage);
        }
        return response.json();
    }
    /**
     * Get Cursor prompt for a plan
     */
    async getPlanPrompt(planId) {
        const url = `${this.apiUrl}/api/v1/architect/plan/${planId}/prompt`;
        const headers = {
            'Content-Type': 'application/json'
        };
        const apiKey = this.getApiKey();
        const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        headers['Authorization'] = key;
        const response = await this.fetchWithTimeout(url, {
            method: 'GET',
            headers,
        });
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorMessage;
                if (errorJson.message) {
                    errorMessage += `: ${errorJson.message}`;
                }
            }
            catch {
                errorMessage += `: ${errorText}`;
            }
            throw new Error(errorMessage);
        }
        return response.json();
    }
    /**
     * Get list of projects for the authenticated user
     */
    async getProjects() {
        const url = `${this.apiUrl}/api/v1/projects`;
        return this.makeRequest(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
    }
    /**
     * Get project by name (for CLI auto-discovery)
     */
    async getProjectByName(name) {
        const url = `${this.apiUrl}/api/v1/projects/by-name?name=${encodeURIComponent(name)}`;
        return this.makeRequest(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
    }
    /**
     * Get current user information
     * Works with both API keys and Clerk JWT tokens
     */
    async getCurrentUser() {
        const url = `${this.apiUrl}/api/v1/users/me`;
        const headers = {
            'Content-Type': 'application/json'
        };
        const raw = await this.makeRequest(url, {
            method: 'GET',
            headers,
        }, false); // Don't retry on auth for getCurrentUser (used to check login status)
        // Normalize across possible API shapes:
        // - { id, email, ... }
        // - { data: { id, email, ... } }
        // - { user: { id, email, ... } }
        const user = raw?.data ?? raw?.user ?? raw ?? {};
        const email = user.email ??
            user.primaryEmail ??
            user.primary_email ??
            user.username ??
            user.id ??
            '';
        const id = user.id ??
            raw?.id ??
            raw?.userId ??
            (email || 'unknown-user');
        return {
            id: String(id),
            email: email ? String(email) : String(id),
            firstName: user.firstName ?? user.first_name,
            lastName: user.lastName ?? user.last_name,
            imageUrl: user.imageUrl ?? user.image_url,
        };
    }
    /**
     * Get sessions for a project
     */
    async getSessions(projectId, limit = 5) {
        const params = new URLSearchParams();
        if (projectId)
            params.set('projectId', projectId);
        params.set('limit', limit.toString());
        const url = `${this.apiUrl}/api/v1/sessions?${params.toString()}`;
        return this.makeRequest(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
    }
    /**
     * End a session (mark as completed)
     */
    async endSession(sessionId) {
        const url = `${this.apiUrl}/api/v1/sessions/${sessionId}/end`;
        return this.makeRequest(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
    }
    /**
     * Get a specific session by ID
     */
    async getSession(sessionId) {
        const url = `${this.apiUrl}/api/v1/sessions/${sessionId}`;
        return this.makeRequest(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
    }
    /**
     * Get all organizations the authenticated user belongs to
     * Used by `neurcode init` for org selection
     */
    async getUserOrganizations() {
        const url = `${this.apiUrl}/api/v1/user/organizations`;
        return this.makeRequest(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
    }
    /**
     * Publish a merge confidence card to Neurcode Cloud.
     */
    async createShipCard(payload) {
        const url = `${this.apiUrl}/api/v1/ship/cards`;
        return this.makeRequest(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    }
}
exports.ApiClient = ApiClient;
//# sourceMappingURL=api-client.js.map