"use strict";
/**
 * Login Command
 *
 * Implements device flow authentication for CLI.
 * User runs `neurcode login` -> browser approval -> CLI saves a runtime credential
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
exports.loginCommand = loginCommand;
const config_1 = require("../config");
const api_client_1 = require("../api-client");
const user_context_1 = require("../utils/user-context");
const state_1 = require("../utils/state");
const activation_telemetry_1 = require("../utils/activation-telemetry");
const messages_1 = require("../utils/messages");
const POLL_INTERVAL = 3000; // 3 seconds
const MAX_POLL_ATTEMPTS = 100; // 5 minutes total (100 * 3s)
async function loginCommand(options) {
    try {
        (0, activation_telemetry_1.trackActivationEvent)({
            eventType: 'cli_login_started',
            commandFamily: 'login',
            reasonCode: 'login.started',
        });
        const config = (0, config_1.loadConfig)();
        const apiUrl = config.apiUrl || config_1.DEFAULT_API_URL;
        // If we're in a linked directory, prefer org-scoped auth for that org.
        const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
        const orgArgRaw = options?.orgId?.trim();
        const desiredOrgIdFromArg = orgArgRaw ? orgArgRaw : undefined;
        if (desiredOrgIdFromArg && !isUuid(desiredOrgIdFromArg)) {
            (0, messages_1.printError)('Invalid organization ID', `Expected an internal UUID. Got: ${desiredOrgIdFromArg}`);
            process.exit(1);
        }
        const desiredOrgIdFromState = (0, state_1.getOrgId)() || undefined;
        const desiredOrgId = desiredOrgIdFromArg || desiredOrgIdFromState;
        const desiredOrgName = desiredOrgId && desiredOrgId === desiredOrgIdFromState ? (0, state_1.getOrgName)() : undefined;
        // Check if user is already logged in (for this org, if applicable)
        const existingApiKey = desiredOrgId ? (0, config_1.getApiKey)(desiredOrgId) : (0, config_1.getApiKey)();
        if (existingApiKey) {
            try {
                // Validate the existing runtime credential by fetching user info
                config.apiKey = existingApiKey;
                const client = new api_client_1.ApiClient(config);
                const user = await client.getCurrentUser();
                const userInfo = await (0, user_context_1.getUserInfo)();
                await (0, messages_1.printSuccessBanner)('Runtime Already Connected', `Welcome back, ${userInfo?.displayName || user.email}.`);
                const existingProjectId = (0, state_1.getProjectId)();
                (0, messages_1.printSuccess)('This machine already has an active Neurcode runtime connection', [
                    `Authenticated user: ${user.email}`,
                    desiredOrgId
                        ? `Workspace: ${desiredOrgName || desiredOrgId}`
                        : 'Workspace: default keyring workspace',
                    existingProjectId
                        ? `Repo ownership: initialized (${existingProjectId})`
                        : 'Repo ownership: not initialized in this directory',
                    'Disconnect: neurcode logout',
                ].join('\n   '));
                if (!existingProjectId) {
                    (0, messages_1.printInfo)('Next step', 'Bind this repository to a governance workspace:\n   neurcode init');
                }
                (0, activation_telemetry_1.trackActivationEvent)({
                    eventType: 'cli_login_completed',
                    commandFamily: 'login',
                    reasonCode: 'login.already_connected',
                });
                return;
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                const looksLikeAuth = /authentication failed|unauthorized|forbidden|401|403/i.test(msg);
                // Runtime credential is invalid/expired (or we couldn't validate); proceed with login
                (0, user_context_1.clearUserCache)(); // Clear stale cache
                (0, messages_1.printWarning)(looksLikeAuth ? 'Existing session expired' : 'Could not validate existing session', looksLikeAuth
                    ? 'Your previous runtime credential is no longer valid. Let\'s set up a fresh connection.'
                    : 'Proceeding with login to refresh authentication.');
            }
        }
        await (0, messages_1.printSuccessBanner)('Connect Neurcode Runtime');
        (0, messages_1.printInfo)('Browser approval', 'We will open the browser to connect this machine to a Neurcode workspace. The credential is stored in the local keyring and is not part of the normal workflow.');
        if (desiredOrgId) {
            (0, messages_1.printInfo)('Workspace scope', `This runtime connection will be scoped to: ${desiredOrgName || desiredOrgId}`);
        }
        // Step 1: Initialize device flow
        const initUrl = `${apiUrl}/cli/auth/init`;
        let initResponse;
        try {
            initResponse = await fetch(initUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    organizationId: desiredOrgId || undefined,
                }), // Fastify requires a body when Content-Type is application/json
            });
        }
        catch (error) {
            await (0, messages_1.printAuthError)(error);
            process.exit(1);
        }
        if (!initResponse.ok) {
            const errorText = await initResponse.text();
            await (0, messages_1.printAuthError)(new Error(`Failed to initialize authentication: ${errorText}`));
            process.exit(1);
        }
        const initData = await initResponse.json();
        const { deviceCode, userCode, verificationUrl } = initData;
        const openInBrowser = async () => {
            (0, messages_1.printInfo)('Opening browser for workspace approval...');
            (0, messages_1.printWaiting)('Waiting for runtime connection approval', false);
            const platform = process.platform;
            const preferred = process.env.NEURCODE_LOGIN_BROWSER;
            try {
                const open = (await Promise.resolve().then(() => __importStar(require('open')))).default;
                // Simple config: Only specify app if the user explicitly asked for it via Env Var
                const openOptions = preferred ? { app: { name: preferred } } : {};
                await open(verificationUrl, openOptions);
                return;
            }
            catch {
                // fallback to system open
            }
            const { exec } = await Promise.resolve().then(() => __importStar(require('child_process')));
            let command;
            if (platform === 'darwin') {
                command = `open "${verificationUrl}"`;
            }
            else if (platform === 'win32') {
                command = `start "" "${verificationUrl}"`;
            }
            else {
                command = `xdg-open "${verificationUrl}"`;
            }
            await new Promise((resolve, reject) => {
                exec(command, (error) => {
                    if (error)
                        reject(error);
                    else
                        resolve();
                });
            });
        };
        const fallbackMessage = `Please open this URL in your browser:\n   ${verificationUrl}\n\n   Approval code: ${userCode}${process.platform === 'darwin' ? '\n\n   Tip: Force Safari with: NEURCODE_LOGIN_BROWSER=Safari neurcode login' : ''}`;
        try {
            await openInBrowser();
        }
        catch {
            (0, messages_1.printWarning)('Could not open browser automatically', fallbackMessage);
        }
        // Step 3: Poll for approval
        let pollAttempts = 0;
        let approved = false;
        while (pollAttempts < MAX_POLL_ATTEMPTS && !approved) {
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            const pollUrl = `${apiUrl}/cli/auth/poll`;
            let pollResponse;
            try {
                pollResponse = await fetch(pollUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ deviceCode }),
                });
            }
            catch (error) {
                throw error;
            }
            if (!pollResponse.ok) {
                throw new Error(`Polling failed: ${pollResponse.statusText}`);
            }
            const pollData = await pollResponse.json();
            if (pollData.status === 'approved') {
                if (pollData.apiKey) {
                    const savedOrgId = pollData.organizationId || desiredOrgId || undefined;
                    // Save runtime credential to global config
                    (0, config_1.saveGlobalAuth)(pollData.apiKey, apiUrl, savedOrgId);
                    // Get user info for personalized message
                    const userInfo = await (0, user_context_1.getUserInfo)();
                    const userName = userInfo?.displayName || userInfo?.email || 'there';
                    await (0, messages_1.printSuccessBanner)('Runtime Connected', `Welcome to Neurcode, ${userName}.`);
                    const existingProjectId = (0, state_1.getProjectId)();
                    (0, messages_1.printSuccess)('This machine can now operate against Neurcode governance', [
                        `Credential: stored in ~/.neurcoderc keyring${savedOrgId ? ` for workspace ${savedOrgId.substring(0, 8)}...` : ''}`,
                        existingProjectId
                            ? `Repo ownership: initialized (${existingProjectId})`
                            : 'Repo ownership: not initialized in this directory',
                        'Token handling: automatic; manual API keys are only needed for CI or advanced environments.',
                    ].join('\n   '));
                    (0, messages_1.printInfo)('Next step', existingProjectId
                        ? 'Confirm state and continue:\n   neurcode whoami\n   neurcode start "what you intend to change"'
                        : 'Bind this repository to a personal or organization workspace:\n   neurcode init');
                    (0, activation_telemetry_1.trackActivationEvent)({
                        eventType: 'cli_login_completed',
                        commandFamily: 'login',
                        reasonCode: 'login.completed',
                    });
                    approved = true;
                }
                else {
                    (0, messages_1.printWarning)('Browser approved, but the terminal did not receive the connection credential', 'Run neurcode login again. If the browser says the request was already approved, start a fresh login request.');
                    (0, activation_telemetry_1.trackActivationEvent)({
                        eventType: 'cli_login_completed',
                        commandFamily: 'login',
                        reasonCode: 'login.missing_credential',
                        success: false,
                    });
                    approved = true;
                }
            }
            else if (pollData.status === 'denied') {
                (0, messages_1.printError)('Authentication Denied', undefined, [
                    'The runtime connection request was denied in your browser',
                    'If this was unintentional, please try: neurcode login',
                    'Contact support if you continue experiencing issues'
                ]);
                (0, activation_telemetry_1.trackActivationEvent)({
                    eventType: 'cli_login_completed',
                    commandFamily: 'login',
                    reasonCode: 'login.denied',
                    success: false,
                });
                process.exit(1);
            }
            else if (pollData.status === 'expired') {
                (0, messages_1.printError)('Authentication Request Expired', undefined, [
                    'The runtime connection request has timed out',
                    'Please try again: neurcode login',
                    'Complete browser approval within 5 minutes'
                ]);
                (0, activation_telemetry_1.trackActivationEvent)({
                    eventType: 'cli_login_completed',
                    commandFamily: 'login',
                    reasonCode: 'login.expired',
                    success: false,
                });
                process.exit(1);
            }
            else {
                // pending - continue polling
                process.stdout.write('.');
                pollAttempts++;
            }
        }
        if (!approved) {
            (0, messages_1.printError)('Authentication Timed Out', undefined, [
                'The runtime connection process took too long',
                'Please try again: neurcode login',
                'Complete browser approval promptly',
                'Check your internet connection if issues persist'
            ]);
            (0, activation_telemetry_1.trackActivationEvent)({
                eventType: 'cli_login_completed',
                commandFamily: 'login',
                reasonCode: 'login.timeout',
                success: false,
            });
            process.exit(1);
        }
    }
    catch (error) {
        (0, activation_telemetry_1.trackActivationEvent)({
            eventType: 'cli_login_completed',
            commandFamily: 'login',
            reasonCode: 'login.failed',
            success: false,
        });
        await (0, messages_1.printAuthError)(error);
        process.exit(1);
    }
}
//# sourceMappingURL=login.js.map