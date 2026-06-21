/**
 * `neurcode onboard` — Self-serve enterprise onboarding walkthrough.
 *
 * Prints the step-by-step recipe for a first governed session, adapted to the
 * selected agent. Covers: install, repo brain index, agent activation, health
 * check, first governed session, boundary block, approval, evidence export.
 *
 * Use --agent to select the agent path. Defaults to claude.
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
export declare function buildOnboardWalkthrough(agent: OnboardAgent): OnboardWalkthrough;
export declare function onboardCommand(program: Command): void;
//# sourceMappingURL=onboard.d.ts.map