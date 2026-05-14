"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXECUTION_ACTION_TYPES = exports.RUNTIME_OPERATION_EXECUTION_ACTION_TYPES = exports.COMPATIBILITY_EXECUTION_ACTION_TYPES = exports.CANONICAL_EXECUTION_ACTION_TYPES = void 0;
exports.isExecutionActionType = isExecutionActionType;
exports.getExecutionActionSemantics = getExecutionActionSemantics;
exports.getExecutionActionClass = getExecutionActionClass;
exports.isCanonicalExecutionActionType = isCanonicalExecutionActionType;
exports.isCompatibilityExecutionActionType = isCompatibilityExecutionActionType;
exports.isRuntimeOperationExecutionActionType = isRuntimeOperationExecutionActionType;
const EXECUTION_ACTION_SEMANTICS = {
    verify: {
        type: 'verify',
        class: 'canonical-governance',
        primaryCommand: ['verify'],
        mutatesCode: false,
        captureBaselineVerify: false,
        defaultReverify: false,
        forceEvidenceOnPrimaryVerify: true,
    },
    reverify: {
        type: 'reverify',
        class: 'canonical-governance',
        primaryCommand: ['verify'],
        mutatesCode: false,
        captureBaselineVerify: false,
        defaultReverify: false,
        forceEvidenceOnPrimaryVerify: true,
    },
    'intent-update': {
        type: 'intent-update',
        class: 'runtime-operation',
        primaryCommand: ['start'],
        mutatesCode: false,
        captureBaselineVerify: false,
        defaultReverify: false,
        forceEvidenceOnPrimaryVerify: false,
    },
    'policy-sync': {
        type: 'policy-sync',
        class: 'runtime-operation',
        primaryCommand: ['policy', 'list'],
        mutatesCode: false,
        captureBaselineVerify: false,
        defaultReverify: false,
        forceEvidenceOnPrimaryVerify: false,
    },
    fix: {
        type: 'fix',
        class: 'compatibility-mutation',
        primaryCommand: ['fix'],
        mutatesCode: true,
        captureBaselineVerify: true,
        defaultReverify: true,
        forceEvidenceOnPrimaryVerify: false,
    },
    'apply-safe': {
        type: 'apply-safe',
        class: 'compatibility-mutation',
        primaryCommand: ['fix', '--apply-safe'],
        mutatesCode: true,
        captureBaselineVerify: true,
        defaultReverify: true,
        forceEvidenceOnPrimaryVerify: false,
    },
    patch: {
        type: 'patch',
        class: 'compatibility-mutation',
        primaryCommand: ['patch'],
        mutatesCode: true,
        captureBaselineVerify: true,
        defaultReverify: true,
        forceEvidenceOnPrimaryVerify: false,
    },
};
exports.CANONICAL_EXECUTION_ACTION_TYPES = Object.values(EXECUTION_ACTION_SEMANTICS)
    .filter((entry) => entry.class === 'canonical-governance')
    .map((entry) => entry.type);
exports.COMPATIBILITY_EXECUTION_ACTION_TYPES = Object.values(EXECUTION_ACTION_SEMANTICS)
    .filter((entry) => entry.class === 'compatibility-mutation')
    .map((entry) => entry.type);
exports.RUNTIME_OPERATION_EXECUTION_ACTION_TYPES = Object.values(EXECUTION_ACTION_SEMANTICS)
    .filter((entry) => entry.class === 'runtime-operation')
    .map((entry) => entry.type);
exports.EXECUTION_ACTION_TYPES = Object.keys(EXECUTION_ACTION_SEMANTICS);
function isExecutionActionType(value) {
    return typeof value === 'string' && value in EXECUTION_ACTION_SEMANTICS;
}
function getExecutionActionSemantics(type) {
    return EXECUTION_ACTION_SEMANTICS[type];
}
function getExecutionActionClass(type) {
    return getExecutionActionSemantics(type).class;
}
function isCanonicalExecutionActionType(value) {
    return getExecutionActionClass(value) === 'canonical-governance';
}
function isCompatibilityExecutionActionType(value) {
    return getExecutionActionClass(value) === 'compatibility-mutation';
}
function isRuntimeOperationExecutionActionType(value) {
    return getExecutionActionClass(value) === 'runtime-operation';
}
//# sourceMappingURL=execution-actions.js.map