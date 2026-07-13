import type { AgentRuntimeAdapterId } from '@neurcode-ai/governance-runtime';
export declare const AGENT_ADAPTER_SETUP_SCHEMA_VERSION: "neurcode.agent-adapter-setup.v1";
export declare const AGENT_ADAPTER_DOCTOR_SCHEMA_VERSION: "neurcode.agent-adapter-doctor.v1";
export type AgentSetupTarget = 'claude' | 'copilot' | 'codex' | 'cursor' | 'generic-mcp' | 'vscode';
export type AgentSetupFormat = 'json' | 'toml' | 'markdown' | 'text';
export type AgentSetupWriteStatus = 'not_requested' | 'written' | 'already_configured' | 'unsupported';
export interface AgentSetupSnippet {
    target: AgentSetupTarget;
    adapter: AgentRuntimeAdapterId;
    destination: string;
    configPath: string | null;
    format: AgentSetupFormat;
    body: string;
    instruction: string;
}
export interface AgentSetupInspection {
    target: AgentSetupTarget;
    adapter: AgentRuntimeAdapterId;
    supported: boolean;
    configured: boolean | null;
    configPath: string | null;
    message: string;
}
export interface AgentSetupWriteResult {
    status: AgentSetupWriteStatus;
    configPath: string | null;
    message: string;
}
export interface AgentInstructionArtifact {
    target: AgentSetupTarget;
    adapter: AgentRuntimeAdapterId;
    destination: string;
    filePath: string | null;
    format: 'markdown';
    body: string;
    instruction: string;
}
export interface AgentInstructionInspection {
    target: AgentSetupTarget;
    adapter: AgentRuntimeAdapterId;
    supported: boolean;
    installed: boolean | null;
    filePath: string | null;
    message: string;
}
export interface AgentInstructionWriteResult {
    status: AgentSetupWriteStatus;
    filePath: string | null;
    message: string;
}
export interface HostRuntimeFacts {
    detected: boolean;
    configured: boolean;
    authenticated: boolean;
    automaticPreWriteInterception: boolean;
    failureReason: string | null;
    repairCommand: string;
}
export declare function normalizeAgentSetupTarget(value?: string): AgentSetupTarget;
export declare function adapterForSetupTarget(target: AgentSetupTarget): AgentRuntimeAdapterId;
export declare function codexHooksPath(repoRoot: string): string;
export declare function buildAgentSetupSnippet(input: {
    target: AgentSetupTarget;
    repoRoot: string;
    global?: boolean;
}): AgentSetupSnippet;
export declare function buildAgentInstructionArtifact(input: {
    target: AgentSetupTarget;
    repoRoot: string;
}): AgentInstructionArtifact;
export declare function inspectAgentSetup(input: {
    target: AgentSetupTarget;
    repoRoot: string;
    global?: boolean;
}): AgentSetupInspection;
export declare function inspectHostRuntimeFacts(input: {
    target: AgentSetupTarget;
    repoRoot: string;
}): HostRuntimeFacts;
export declare function inspectAgentInstructions(input: {
    target: AgentSetupTarget;
    repoRoot: string;
}): AgentInstructionInspection;
export declare function writeAgentSetup(input: {
    target: AgentSetupTarget;
    repoRoot: string;
    global?: boolean;
}): AgentSetupWriteResult;
export declare function writeAgentInstructions(input: {
    target: AgentSetupTarget;
    repoRoot: string;
}): AgentInstructionWriteResult;
//# sourceMappingURL=agent-adapter-setup.d.ts.map