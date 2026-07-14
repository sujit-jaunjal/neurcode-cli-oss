import { getActivationHostCapability, type ActivationJourneyAgent, type EnterpriseTrustDecision, type ManagedHostInstallationAttestation } from '@neurcode-ai/contracts';
type TrustHost = ActivationJourneyAgent;
export interface LocalEnterpriseTrustStatus {
    generatedAt: string;
    repoRoot: string;
    repository: {
        id: string;
        key: string;
        name: string;
        organizationId: string;
    };
    installationId: string;
    host: TrustHost;
    capability: ReturnType<typeof getActivationHostCapability>;
    installation: ManagedHostInstallationAttestation;
    lastReport: {
        reportedAt: string;
        trustState: string;
        receiptId: string | null;
    } | null;
    remediationCommand: string;
    privacy: {
        sourceUploaded: false;
        absolutePathsUploaded: false;
        promptsUploaded: false;
        diffsUploaded: false;
        secretsUploaded: false;
    };
}
export interface SubmitEnterprisePostureResult {
    ok: boolean;
    local: LocalEnterpriseTrustStatus;
    trust: EnterpriseTrustDecision | null;
    policy: Record<string, unknown> | null;
    receipt: Record<string, unknown> | null;
    unavailableReason: string | null;
}
export declare function inspectLocalEnterpriseTrust(input: {
    repoRoot?: string;
    host?: TrustHost;
}): LocalEnterpriseTrustStatus;
export declare function submitEnterprisePosture(input?: {
    repoRoot?: string;
    host?: TrustHost;
    localOnly?: boolean;
}): Promise<SubmitEnterprisePostureResult>;
export declare function reportEnterprisePostureBestEffort(input: {
    repoRoot: string;
    host: TrustHost;
}): Promise<void>;
export declare function assertEnterpriseSessionAdmission(input: {
    repoRoot?: string;
    host: TrustHost;
}): Promise<{
    outcome: string;
    reasonCodes: string[];
}>;
export {};
//# sourceMappingURL=enterprise-trust.d.ts.map