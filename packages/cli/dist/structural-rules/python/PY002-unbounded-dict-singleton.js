"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PY002UnboundedDictSingleton = void 0;
const CACHE_LIKE_NAMES = /cache|store|pending|registry|pool|map|queue|buffer|index/i;
// Match self.<name> = {} or self.<name> = [] inside __init__ or class methods
const SELF_ASSIGN_RE = /^(\s*)self\.(\w+)\s*=\s*(\{\}|\[\])\s*$/;
// Match class-level dict/list (top-level inside class, indented once)
const CLASS_FIELD_RE = /^(\s+)(\w+)\s*:\s*(Dict|List|dict|list|Set|set)[\[<]?/;
class PY002UnboundedDictSingleton {
    id = 'PY002';
    name = 'Unbounded dict/list singleton in class';
    policyRef = 'P016';
    severity = 'ADVISORY';
    languages = ['python'];
    description = 'Class-level dicts or lists used as caches/registries with cache-like names but no maxsize or TTL grow unboundedly.';
    check(filePath, sourceText) {
        try {
            const violations = [];
            const lines = sourceText.split('\n');
            // Track if we're inside a class
            let insideClass = false;
            let classIndent = '';
            let insideInit = false;
            let initIndent = '';
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trimStart();
                // Detect class definition
                if (/^class\s+\w+/.test(trimmed)) {
                    insideClass = true;
                    classIndent = line.match(/^(\s*)/)?.[1] ?? '';
                    insideInit = false;
                    continue;
                }
                if (!insideClass)
                    continue;
                // Detect __init__ method
                if (/def\s+__init__\s*\(/.test(trimmed)) {
                    insideInit = true;
                    initIndent = line.match(/^(\s*)/)?.[1] ?? '';
                    continue;
                }
                // Track leaving __init__: next def at same indent level
                if (insideInit &&
                    /^\s+def\s+\w+/.test(line) &&
                    !line.startsWith(initIndent + '    ')) {
                    insideInit = false;
                }
                // Check self.xxx = {} or self.xxx = [] inside __init__
                const selfMatch = SELF_ASSIGN_RE.exec(line);
                if (selfMatch && insideInit) {
                    const fieldName = selfMatch[2];
                    if (CACHE_LIKE_NAMES.test(fieldName)) {
                        // Check if there's any maxsize/TTL reference in the whole class source
                        const evidence = line.slice(0, 120);
                        if (!hasBoundIndicator(sourceText, fieldName)) {
                            violations.push({
                                ruleId: this.id,
                                ruleName: this.name,
                                policyRef: this.policyRef,
                                severity: this.severity,
                                filePath,
                                line: i + 1,
                                column: line.indexOf('self.') + 1,
                                evidence,
                                operationalRisk: 'Instance-level cache/registry with no size bound grows indefinitely under load. ' +
                                    'Long-running services accumulate entries without eviction, causing OOM.',
                                remediation: 'Replace with `functools.lru_cache`, `cachetools.TTLCache(maxsize=1000, ttl=300)`, ' +
                                    'or add explicit eviction logic with a max size check before each insert.',
                                determinism: 'heuristic-advisory',
                                confidence: 0.75,
                                language: 'python',
                            });
                        }
                    }
                }
                // Also check class-level type-annotated fields (outside __init__)
                const classFieldMatch = CLASS_FIELD_RE.exec(line);
                if (classFieldMatch && !insideInit) {
                    const fieldName = classFieldMatch[2];
                    if (CACHE_LIKE_NAMES.test(fieldName)) {
                        const evidence = line.slice(0, 120);
                        if (!hasBoundIndicator(sourceText, fieldName)) {
                            violations.push({
                                ruleId: this.id,
                                ruleName: this.name,
                                policyRef: this.policyRef,
                                severity: this.severity,
                                filePath,
                                line: i + 1,
                                column: (line.match(/^(\s*)/)?.[1].length ?? 0) + 1,
                                evidence,
                                operationalRisk: 'Class-level collection with a cache-like name has no visible size bound or TTL. ' +
                                    'Unbounded growth causes OOM in long-running services.',
                                remediation: 'Add maxsize enforcement or replace with `cachetools.TTLCache` / `lru_cache`. ' +
                                    'Document the intended bound with a comment.',
                                determinism: 'heuristic-advisory',
                                confidence: 0.75,
                                language: 'python',
                            });
                        }
                    }
                }
            }
            return violations;
        }
        catch {
            return [];
        }
    }
}
exports.PY002UnboundedDictSingleton = PY002UnboundedDictSingleton;
function hasBoundIndicator(sourceText, fieldName) {
    const indicators = [
        /maxsize/i,
        /max_size/i,
        /\bttl\b/i,
        /lru_cache/i,
        /TTLCache/i,
        /LRUCache/i,
        /bounded/i,
        /evict/i,
        /capacity/i,
    ];
    // Check near the field name or anywhere in the file
    const fieldPattern = new RegExp(`${fieldName}.*(?:maxsize|max_size|ttl|lru|evict|capacity)`, 'i');
    if (fieldPattern.test(sourceText))
        return true;
    // Or if the file imports cachetools
    if (/\bcachetools\b/.test(sourceText))
        return true;
    // Check for general indicators nearby
    return indicators.some(p => p.test(sourceText));
}
//# sourceMappingURL=PY002-unbounded-dict-singleton.js.map