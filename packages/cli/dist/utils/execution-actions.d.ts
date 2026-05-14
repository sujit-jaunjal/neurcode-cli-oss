export type ExecutionActionType = 'verify' | 'fix' | 'patch' | 'apply-safe' | 'reverify' | 'policy-sync' | 'intent-update';
export type ExecutionActionClass = 'canonical-governance' | 'compatibility-mutation' | 'runtime-operation';
export interface ExecutionActionSemantics {
    type: ExecutionActionType;
    class: ExecutionActionClass;
    primaryCommand: string[];
    mutatesCode: boolean;
    captureBaselineVerify: boolean;
    defaultReverify: boolean;
    forceEvidenceOnPrimaryVerify: boolean;
}
export declare const CANONICAL_EXECUTION_ACTION_TYPES: ExecutionActionType[];
export declare const COMPATIBILITY_EXECUTION_ACTION_TYPES: ExecutionActionType[];
export declare const RUNTIME_OPERATION_EXECUTION_ACTION_TYPES: ExecutionActionType[];
export declare const EXECUTION_ACTION_TYPES: ExecutionActionType[];
export declare function isExecutionActionType(value: unknown): value is ExecutionActionType;
export declare function getExecutionActionSemantics(type: ExecutionActionType): ExecutionActionSemantics;
export declare function getExecutionActionClass(type: ExecutionActionType): ExecutionActionClass;
export declare function isCanonicalExecutionActionType(value: ExecutionActionType): boolean;
export declare function isCompatibilityExecutionActionType(value: ExecutionActionType): boolean;
export declare function isRuntimeOperationExecutionActionType(value: ExecutionActionType): boolean;
//# sourceMappingURL=execution-actions.d.ts.map