import type { ManagedHostInstallationAttestation } from '@neurcode-ai/contracts';
import type { AgentSetupTarget, AgentSetupInspection } from './agent-adapter-setup';
export declare const MANAGED_HOST_INSTALLATION_MANIFEST_VERSION: "1.0.0";
export interface ManagedHostInspectionInput {
    target: AgentSetupTarget;
    repoRoot: string;
    detected: boolean;
    authenticated: boolean;
    setup: AgentSetupInspection;
}
export declare function inspectManagedHostInstallation(input: ManagedHostInspectionInput): ManagedHostInstallationAttestation;
export declare function persistManagedHostInstallation(repoRoot: string, installation: ManagedHostInstallationAttestation): string;
//# sourceMappingURL=managed-host-installation.d.ts.map