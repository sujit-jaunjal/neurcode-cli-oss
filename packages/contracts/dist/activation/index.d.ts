/**
 * Activation telemetry contract.
 *
 * Source-free by design: this contract allows only coarse journey metadata.
 * It rejects unknown fields and common leak shapes before events reach storage.
 */
export declare const ACTIVATION_TELEMETRY_SCHEMA_VERSION: "neurcode.activation-telemetry.v1";
export declare const ACTIVATION_EVENT_TYPES: readonly ["cli_invoked", "cli_login_started", "cli_login_completed", "repo_connect_started", "repo_connect_completed", "brain_index_started", "brain_index_completed", "agent_setup_started", "agent_target_selected", "agent_setup_completed", "first_governed_check_completed", "first_block_observed", "first_approval_observed", "first_evidence_viewed", "first_repo_intelligence_synced", "dashboard_onboarding_viewed", "onboarding_step_completed"];
export type ActivationEventType = (typeof ACTIVATION_EVENT_TYPES)[number];
export declare const ACTIVATION_STAGES: readonly ["install_seen", "login_completed", "repo_connected", "brain_indexed", "agent_configured", "first_governed_check", "first_evidence_synced", "first_block_or_approval"];
export type ActivationStage = (typeof ACTIVATION_STAGES)[number];
export declare const ACTIVATION_AGENT_TARGETS: readonly ["claude", "cursor", "codex", "copilot", "vscode", "action", "manual", "unknown"];
export type ActivationAgentTarget = (typeof ACTIVATION_AGENT_TARGETS)[number];
export declare const ACTIVATION_INSTALL_MODES: readonly ["npm_global", "npx", "pnpm", "yarn", "bun", "local_build", "unknown"];
export type ActivationInstallMode = (typeof ACTIVATION_INSTALL_MODES)[number];
export declare const ACTIVATION_PACKAGE_MANAGERS: readonly ["npm", "pnpm", "yarn", "bun", "unknown"];
export type ActivationPackageManager = (typeof ACTIVATION_PACKAGE_MANAGERS)[number];
export interface ActivationGeo {
    country?: string | null;
    region?: string | null;
}
export interface ActivationTelemetryEvent {
    schemaVersion: typeof ACTIVATION_TELEMETRY_SCHEMA_VERSION;
    eventId: string;
    eventType: ActivationEventType;
    anonymousInstallId: string;
    authenticatedUserId?: string | null;
    workspaceId?: string | null;
    cliVersion?: string | null;
    commandFamily?: string | null;
    os?: string | null;
    arch?: string | null;
    nodeVersion?: string | null;
    packageManager?: ActivationPackageManager | null;
    installMode?: ActivationInstallMode | null;
    agentTarget?: ActivationAgentTarget | null;
    geo?: ActivationGeo | null;
    timestamp: string;
    stage?: ActivationStage | null;
    reasonCode?: string | null;
    success?: boolean | null;
}
export declare const ACTIVATION_EVENT_ALLOWED_FIELDS: readonly ["schemaVersion", "eventId", "eventType", "anonymousInstallId", "authenticatedUserId", "workspaceId", "cliVersion", "commandFamily", "os", "arch", "nodeVersion", "packageManager", "installMode", "agentTarget", "geo", "timestamp", "stage", "reasonCode", "success"];
export declare const ACTIVATION_EVENT_FORBIDDEN_FIELDS: readonly ["source", "sourceCode", "code", "prompt", "prompts", "diff", "patch", "secret", "secrets", "token", "accessToken", "authorization", "password", "absolutePath", "path", "rawPath", "filePath", "rawArgs", "args", "argv", "databaseUrl", "connectionString", "repoContents", "rawIp", "ip", "body", "content"];
export interface ActivationValidationResult {
    ok: boolean;
    event?: ActivationTelemetryEvent;
    errors: string[];
}
export declare function activationStageForEventType(eventType: ActivationEventType, success?: boolean | null | undefined): ActivationStage | null;
export declare function validateActivationTelemetryEvent(input: unknown): ActivationValidationResult;
export declare function assertActivationTelemetryEvent(input: unknown): ActivationTelemetryEvent;
//# sourceMappingURL=index.d.ts.map