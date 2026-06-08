import { type DeploymentConsistencyReport } from '@neurcode-ai/cli-runtime';
export declare function runStartupConsistencyChecks(input: {
    bundledCliDir: string;
    argv: string[];
}): DeploymentConsistencyReport | null;
export declare function buildRuntimeIdentityPayload(bundledCliDir: string): {
    ok: boolean;
    identity: import("@neurcode-ai/cli-runtime").CliRuntimeIdentity;
    installations: import("@neurcode-ai/cli-runtime").CliInstallationCandidate[];
    violations: import("@neurcode-ai/cli-runtime").ConsistencyViolation[];
    bundledCliDir: string;
};
//# sourceMappingURL=cli-startup.d.ts.map