export type GovernedIntentSource = 'prompt' | 'labeled_goal';
export interface GovernedIntentSelection {
    goal: string;
    source: GovernedIntentSource;
    operatorPrompt: boolean;
    warnings: string[];
}
export declare function selectGovernedIntent(prompt: string): GovernedIntentSelection;
export declare function shouldStartGovernedSession(selection: GovernedIntentSelection): boolean;
//# sourceMappingURL=governed-intent.d.ts.map