"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyRelationshipAuthority = classifyRelationshipAuthority;
exports.mapRelationshipAuthorityToEvidenceTier = mapRelationshipAuthorityToEvidenceTier;
const STRUCTURAL_LANGUAGES = new Set(['typescript', 'javascript', 'tsx', 'jsx']);
const DEGRADED_PYTHON = 'python-structural-regex';
const AST_PYTHON = 'python-structural-ast';
function isDegradedPython(input) {
    return input.language === 'python'
        && (input.parserId === DEGRADED_PYTHON || input.parserDepth === 'regex_degraded');
}
function isAstPython(input) {
    return input.language === 'python'
        && (input.parserId === AST_PYTHON || input.parserDepth === 'syntax_tree' || input.parserDepth === 'ast');
}
function isUnsupportedLanguage(input) {
    return input.language === 'unknown'
        || input.parserDepth === 'unsupported'
        || input.parserId === 'language-detection-only';
}
function classifyRelationshipAuthority(input) {
    const reasonCodes = [];
    const kind = input.relationshipKind || 'unknown';
    const inCoverage = input.pathInCoverage !== false;
    const coverageComplete = input.graphCoverageComplete !== false;
    if (!inCoverage || !coverageComplete) {
        return {
            class: 'not_evaluated',
            enforcementEligible: false,
            reasonCodes: ['not_evaluated_due_to_coverage'],
            recommendedManualDiscovery: kind === 'test' || kind === 'tested_by'
                ? 'Review test directories and CI configuration manually; graph coverage is incomplete.'
                : null,
        };
    }
    if (isUnsupportedLanguage(input)) {
        return {
            class: 'unsupported',
            enforcementEligible: false,
            reasonCodes: ['language_structurally_unsupported'],
        };
    }
    if (isDegradedPython(input)) {
        if (kind === 'import' || kind === 'export' || kind === 'declaration') {
            return {
                class: 'deterministic_structural',
                enforcementEligible: false,
                reasonCodes: ['python_regex_structural_only'],
            };
        }
        if (kind === 'call' || kind === 'reference' || kind === 'consumer' || kind === 'test' || kind === 'tested_by') {
            return {
                class: input.inferredFromNaming ? 'advisory_heuristic' : 'not_evaluated',
                enforcementEligible: false,
                reasonCodes: input.inferredFromNaming
                    ? ['python_call_graph_unavailable', 'naming_proximity_only']
                    : ['python_call_graph_unavailable', 'parser_limitation'],
                recommendedManualDiscovery: kind === 'test' || kind === 'tested_by'
                    ? 'Use repository test layout and CI targets; Python regex analysis cannot prove test impact.'
                    : null,
            };
        }
        return {
            class: 'advisory_heuristic',
            enforcementEligible: false,
            reasonCodes: ['python_degraded_analysis'],
        };
    }
    if (isAstPython(input)) {
        if (kind === 'import' || kind === 'export' || kind === 'declaration' || kind === 'consumer') {
            return {
                class: 'deterministic_structural',
                enforcementEligible: false,
                reasonCodes: ['python_ast_structural'],
            };
        }
        if (kind === 'call' || kind === 'reference') {
            return {
                class: 'not_evaluated',
                enforcementEligible: false,
                reasonCodes: ['python_call_graph_unavailable', 'parser_limitation'],
                recommendedManualDiscovery: 'Python AST analysis does not emit call or reference edges.',
            };
        }
        if (kind === 'test' || kind === 'tested_by') {
            return {
                class: input.directEvidence ? 'bounded_inference' : 'advisory_heuristic',
                enforcementEligible: false,
                reasonCodes: input.directEvidence
                    ? ['python_import_test_adjacency']
                    : ['python_test_path_heuristic'],
                recommendedManualDiscovery: input.directEvidence
                    ? null
                    : 'Confirm test relevance with your test runner; graph test hints are import-based only.',
            };
        }
        return {
            class: 'bounded_inference',
            enforcementEligible: false,
            reasonCodes: ['python_ast_bounded'],
        };
    }
    if (STRUCTURAL_LANGUAGES.has(String(input.language))) {
        if (kind === 'import' || kind === 'export' || kind === 'declaration') {
            return {
                class: 'deterministic_structural',
                enforcementEligible: false,
                reasonCodes: ['typescript_ast_structural'],
            };
        }
        if (kind === 'call' || kind === 'reference' || kind === 'consumer') {
            const unresolved = input.resolutionMode === 'ambiguous' || input.resolutionMode === 'unresolved';
            const exact = input.directEvidence === true
                && !unresolved
                && !input.ambiguity
                && input.resolutionMode === 'repository_symbol';
            if (exact) {
                return {
                    class: 'deterministic_exact',
                    enforcementEligible: true,
                    reasonCodes: ['typescript_resolved_cross_file'],
                };
            }
            if (input.resolutionMode === 'local_symbol' || input.resolutionMode === 'imported_symbol') {
                return {
                    class: 'bounded_inference',
                    enforcementEligible: false,
                    reasonCodes: unresolved ? ['cross_file_resolution_incomplete'] : ['bounded_syntax_resolution'],
                };
            }
            return {
                class: 'advisory_heuristic',
                enforcementEligible: false,
                reasonCodes: ['typescript_without_type_checker'],
            };
        }
        if (kind === 'test' || kind === 'tested_by') {
            return {
                class: input.directEvidence ? 'bounded_inference' : 'not_evaluated',
                enforcementEligible: false,
                reasonCodes: input.directEvidence
                    ? ['test_adjacency_structural']
                    : ['test_impact_not_proven'],
                recommendedManualDiscovery: input.directEvidence
                    ? null
                    : 'Confirm test coverage with your test runner; graph test edges are structural hints only.',
            };
        }
    }
    if (input.inferredFromNaming) {
        return {
            class: 'advisory_heuristic',
            enforcementEligible: false,
            reasonCodes: ['naming_proximity_only'],
        };
    }
    return {
        class: 'not_evaluated',
        enforcementEligible: false,
        reasonCodes: ['relationship_not_grounded'],
    };
}
function mapRelationshipAuthorityToEvidenceTier(authority) {
    if (authority === 'deterministic_exact' || authority === 'deterministic_structural')
        return 'deterministic';
    if (authority === 'not_evaluated' || authority === 'unsupported')
        return 'not_evaluated';
    return 'advisory';
}
//# sourceMappingURL=relationship-authority.js.map