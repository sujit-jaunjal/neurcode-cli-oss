/**
 * `neurcode onboard` — compatibility walkthrough recipes.
 *
 * Prints the step-by-step recipe for a first governed session, adapted to the
 * selected agent. Covers: install, repo brain index, agent activation, health
 * check, first governed session, boundary block, approval, evidence export.
 *
 * New users should run `neurcode setup`; these recipes remain for existing
 * evaluation scripts that need the full expanded walkthrough.
 * Use --json for machine-readable output.
 */
import type { Command } from 'commander';
export type OnboardAgent = 'claude' | 'codex' | 'cursor' | 'copilot' | 'vscode' | 'action';
export declare const ONBOARD_AGENTS: OnboardAgent[];
export interface OnboardStep {
    id: string;
    title: string;
    command: string;
}
export interface OnboardWalkthrough {
    agent: OnboardAgent;
    label: string;
    guarantee: string;
    steps: OnboardStep[];
    dashboardUrl: string;
}
export declare function resolveOnboardAgent(value: string | undefined): OnboardAgent;
/** The coding environment the next-step guidance is tailored toward. */
export interface OnboardEnvironment {
    /** Agent to tailor commands toward; 'terminal' means a generic shell. */
    target: OnboardAgent | 'terminal';
    /** Human-readable environment label (e.g. "Claude Code", "generic terminal"). */
    label: string;
    /** activated = local manifest; detected = host signal; explicit = CLI flag; profile = account choice; default = undecided. */
    source: 'activated' | 'detected' | 'explicit' | 'profile' | 'default';
}
/**
 * Detect which coding environment the user is in so the next step is exact.
 *
 * Order of trust: (1) an agent already activated in this repo's runtime
 * manifest, (2) host environment signals, (3) a generic-terminal default. We
 * read only coarse host markers — never command args, source, or paths.
 */
export declare function detectOnboardEnvironment(repoRoot: string, env?: NodeJS.ProcessEnv): OnboardEnvironment;
/** The exact, copy-pasteable agent setup command for an environment. */
export declare function agentSetupCommandFor(target: OnboardAgent | 'terminal'): string;
export declare function buildOnboardWalkthrough(agent: OnboardAgent): OnboardWalkthrough;
export declare function onboardCommand(program: Command): void;
//# sourceMappingURL=onboard.d.ts.map