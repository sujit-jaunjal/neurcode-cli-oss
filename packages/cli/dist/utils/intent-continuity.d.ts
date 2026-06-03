import { type AgentPlanAmendmentInput, type GovernanceSession } from '@neurcode-ai/governance-runtime';
import type { GovernedIntentSelection } from './governed-intent';
export type IntentContinuityAction = 'start_new_session' | 'amend_active_plan' | 'record_operator_note';
export interface IntentContinuityDecision {
    action: IntentContinuityAction;
    reason: string;
    confidence: 'high' | 'medium' | 'low';
    amendment?: AgentPlanAmendmentInput;
    detail: {
        activeSessionId?: string;
        selectedIntentSource: GovernedIntentSelection['source'];
        operatorPrompt: boolean;
        targetFiles: string[];
        targetGlobs: string[];
        removalRequested: boolean;
        explicitNewSession: boolean;
        amendmentSignal: boolean;
    };
}
export declare function classifyIntentContinuity(rawPrompt: string, selected: GovernedIntentSelection, activeSession: GovernanceSession | null): IntentContinuityDecision;
//# sourceMappingURL=intent-continuity.d.ts.map