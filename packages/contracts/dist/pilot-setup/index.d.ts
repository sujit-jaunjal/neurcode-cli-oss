/**
 * Shared typed setup contract between CLI and dashboard.
 *
 * Both surfaces consume the same JSON shape from `neurcode agent setup --json`
 * and the dashboard setup API mirror. No duplicated command templates.
 */
import type { PilotEnforcementPosture } from '../pilot-funnel/index.js';
export declare const PILOT_SETUP_CONTRACT_SCHEMA_VERSION: "neurcode.pilot-setup.v1";
export interface PilotSetupCommandStep {
    id: string;
    label: string;
    command: string;
    /** When true, this step is the single recovery command if setup fails. */
    recovery?: boolean;
}
export interface PilotSetupRepoFacts {
    trackedFileCount: number;
    primaryLanguages: string[];
    hasCodeowners: boolean;
    sensitiveSurfaceCount: number;
    scale: 'small' | 'medium' | 'large' | 'unknown';
}
export interface PilotSetupHostCapability {
    agent: string;
    adapter: string;
    enforcementPosture: PilotEnforcementPosture;
    automatic: boolean;
    description: string;
}
export interface PilotSetupPairingStatus {
    status: 'connected' | 'pending' | 'local_only';
    repoName: string | null;
    organizationHandle: string | null;
}
export interface PilotSetupContract {
    schemaVersion: typeof PILOT_SETUP_CONTRACT_SCHEMA_VERSION;
    generatedAt: string;
    agent: string;
    adapter: string;
    privacy: {
        metadataOnly: true;
        sourceUploaded: false;
        sourceIncluded: false;
    };
    repoFacts: PilotSetupRepoFacts;
    hostCapability: PilotSetupHostCapability;
    pairing: PilotSetupPairingStatus;
    steps: PilotSetupCommandStep[];
    recoveryCommand: string;
    validation: {
        authCheck: string;
        pairingCheck: string;
    };
}
export declare function buildPilotSetupRecoveryCommand(steps: PilotSetupCommandStep[]): string;
//# sourceMappingURL=index.d.ts.map