import { type FirstValueActivationProofPayload } from '@neurcode-ai/contracts';
export interface QueuedFirstValueActivationProof {
    proof: FirstValueActivationProofPayload;
    orgId?: string | null;
    apiUrl?: string | null;
    queuedAt: string;
    attempts: number;
    lastReasonCode?: string | null;
}
export interface SubmitFirstValueActivationProofResult {
    synced: boolean;
    queued: boolean;
    duplicate: boolean;
    reasonCode: string;
    status?: number;
}
export interface FlushFirstValueActivationProofResult {
    attempted: number;
    synced: number;
    duplicates: number;
    dropped: number;
    retryable: number;
    remaining: number;
    reasonCodes: string[];
}
export declare function firstValueActivationProofQueuePath(): string;
export declare function buildRepoConnectActivationProof(input: {
    projectId: string;
    commandFamily?: string;
    reasonCode?: string;
    timestamp?: string;
}): FirstValueActivationProofPayload;
export declare function queueFirstValueActivationProof(input: {
    proof: FirstValueActivationProofPayload;
    orgId?: string | null;
    apiUrl?: string | null;
    reasonCode?: string | null;
}): void;
export declare function submitFirstValueActivationProof(input: {
    proof: FirstValueActivationProofPayload;
    orgId?: string | null;
    apiUrl?: string | null;
    apiKey?: string | null;
    timeoutMs?: number;
}): Promise<SubmitFirstValueActivationProofResult>;
export declare function flushFirstValueActivationProofQueue(options?: {
    orgId?: string | null;
    apiUrl?: string | null;
    json?: boolean;
}): Promise<FlushFirstValueActivationProofResult>;
export declare function getFirstValueActivationProofQueueStatus(projectId?: string | null): {
    queueLength: number;
    matchingProjectQueued: boolean;
    path: string;
};
export declare function readLocalRepoActivationBinding(): {
    orgId: string | null;
    orgName: string | null;
    projectId: string | null;
    linkedAt: string | null;
};
//# sourceMappingURL=activation-proof.d.ts.map