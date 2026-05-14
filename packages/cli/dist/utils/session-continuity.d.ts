import type { ContextPack, EngineeringInvariantMemory, IntentPack, RepositoryIntelligenceGraph, SessionContinuityIndex, SessionContinuityRuntime } from '@neurcode-ai/contracts';
import type { ContextAnalysis } from '../context-engine';
import { type LocalPlanData, type LocalPlanSnapshot } from './plan-sync';
export interface CreateLocalIntentSessionInput {
    projectRoot: string;
    orgId: string | null;
    projectId: string | null;
    intent: string;
    detectedSignals: string[];
    expectedFiles: string[];
    constraints: string[];
    contextAnalysis: ContextAnalysis;
}
export interface LocalSessionArtifacts {
    intentPack: IntentPack;
    contextPack: ContextPack;
    repositoryGraph: RepositoryIntelligenceGraph;
    invariantMemory: EngineeringInvariantMemory | null;
    sessionRuntime: SessionContinuityRuntime;
    plan: LocalPlanSnapshot;
    sessionDir: string;
    activePaths: {
        intentPack: string;
        contextPack: string;
        repositoryGraph: string;
        invariantMemory: string;
        sessionRuntime: string;
    };
}
export interface LocalSessionCompareResult {
    leftSessionId: string;
    rightSessionId: string;
    sameIntent: boolean;
    sameBranch: boolean;
    approvedFilesAdded: string[];
    approvedFilesRemoved: string[];
    modulesAdded: string[];
    modulesRemoved: string[];
    boundariesAdded: string[];
    boundariesRemoved: string[];
}
interface StoredSessionArtifacts {
    intentPack: IntentPack;
    contextPack: ContextPack;
    repositoryGraph: RepositoryIntelligenceGraph;
    invariantMemory: EngineeringInvariantMemory | null;
    sessionRuntime: SessionContinuityRuntime;
    plan: LocalPlanData | null;
}
export declare function createLocalIntentSession(input: CreateLocalIntentSessionInput): LocalSessionArtifacts;
export declare function listLocalIntentSessions(projectRoot: string): SessionContinuityIndex['sessions'];
export declare function getActiveLocalIntentSession(projectRoot: string): StoredSessionArtifacts | null;
export declare function resumeLocalIntentSession(projectRoot: string, sessionId?: string): LocalSessionArtifacts | null;
export declare function compareLocalIntentSessions(projectRoot: string, leftSessionId: string, rightSessionId: string): LocalSessionCompareResult | null;
export {};
//# sourceMappingURL=session-continuity.d.ts.map