"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PY009UnsafePickleDeserialization = void 0;
// Matches pickle.loads( or pickle.load(
const PICKLE_LOAD_RE = /\bpickle\.loads?\s*\(/;
// Matches joblib.load(
const JOBLIB_LOAD_RE = /\bjoblib\.load\s*\(/;
// Matches torch.load( without weights_only=True
const TORCH_LOAD_RE = /\btorch\.load\s*\(/;
const TORCH_WEIGHTS_ONLY_RE = /weights_only\s*=\s*True/;
// Detects if this appears to be a test file
const TEST_FILE_RE = /(?:^|[\\/])(?:test_|_test|tests[\\/])/;
// Detects if the pickle input looks like a literal bytes value in a test
// e.g. pickle.loads(b'\x80\x04...')  or pickle.loads(b"...")
const LITERAL_BYTES_ARG_RE = /\bpickle\.loads?\s*\(\s*b['"]|pickle\.loads?\s*\(\s*b"""|\bpickle\.loads?\s*\(\s*b'''/;
class PY009UnsafePickleDeserialization {
    id = 'PY009';
    name = 'Unsafe pickle deserialization';
    policyRef = 'PY009';
    severity = 'BLOCKING';
    languages = ['python'];
    description = 'pickle.loads() / pickle.load() executes arbitrary Python code during deserialization. ' +
        'torch.load() without weights_only=True is equally dangerous.';
    check(filePath, sourceText) {
        try {
            const violations = [];
            // Normalize line endings
            const lines = sourceText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            const isTestFile = TEST_FILE_RE.test(filePath);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trimStart();
                // Skip comment lines
                if (trimmed.startsWith('#'))
                    continue;
                // Skip noqa lines
                if (/\bnoqa\b/.test(line))
                    continue;
                // Check pickle.loads / pickle.load
                if (PICKLE_LOAD_RE.test(line)) {
                    // Exclude: test file with literal bytes argument
                    if (isTestFile && LITERAL_BYTES_ARG_RE.test(line)) {
                        continue;
                    }
                    violations.push({
                        ruleId: this.id,
                        ruleName: this.name,
                        policyRef: this.policyRef,
                        severity: this.severity,
                        filePath,
                        line: i + 1,
                        column: 1,
                        evidence: line.slice(0, 120),
                        operationalRisk: '`pickle.loads()` executes arbitrary Python code during deserialization. ' +
                            'A single compromised or malformed pickle payload from any source achieves remote code execution ' +
                            'on the deserializing machine. This is a critical supply-chain attack vector in ML systems that share model artifacts.',
                        remediation: 'Replace `pickle` with `json`, `msgpack`, or `protobuf` for data serialization. ' +
                            'For ML models, use `safetensors` format. If pickle is truly required, validate the HMAC signature ' +
                            'before deserializing and only accept pickles from trusted, authenticated internal sources.',
                        determinism: 'heuristic-advisory',
                        confidence: 0.95,
                        language: 'python',
                    });
                    continue;
                }
                // Check joblib.load(
                if (JOBLIB_LOAD_RE.test(line)) {
                    violations.push({
                        ruleId: this.id,
                        ruleName: this.name,
                        policyRef: this.policyRef,
                        severity: this.severity,
                        filePath,
                        line: i + 1,
                        column: 1,
                        evidence: line.slice(0, 120),
                        operationalRisk: '`joblib.load()` uses pickle internally and executes arbitrary Python code during deserialization. ' +
                            'Malicious or tampered model artifacts can achieve remote code execution.',
                        remediation: 'Use `safetensors` format for model artifacts, or validate the HMAC signature of the joblib file before loading.',
                        determinism: 'heuristic-advisory',
                        confidence: 0.95,
                        language: 'python',
                    });
                    continue;
                }
                // Check torch.load( — flag if weights_only=True is NOT on the same line
                // Also check the next 2 lines for multi-line calls
                if (TORCH_LOAD_RE.test(line)) {
                    // Collect the call: check current line + next 2 for weights_only=True
                    let callText = line;
                    for (let k = 1; k <= 2 && i + k < lines.length; k++) {
                        callText += '\n' + lines[i + k];
                        // Stop if we've closed the parens
                        let depth = 0;
                        for (const ch of callText) {
                            if (ch === '(')
                                depth++;
                            else if (ch === ')')
                                depth--;
                        }
                        if (depth <= 0)
                            break;
                    }
                    if (!TORCH_WEIGHTS_ONLY_RE.test(callText)) {
                        violations.push({
                            ruleId: this.id,
                            ruleName: this.name,
                            policyRef: this.policyRef,
                            severity: this.severity,
                            filePath,
                            line: i + 1,
                            column: 1,
                            evidence: line.slice(0, 120),
                            operationalRisk: '`torch.load()` without `weights_only=True` uses pickle and executes arbitrary Python code. ' +
                                'PyTorch 2.0+ requires `weights_only=True` for safe model loading from untrusted sources.',
                            remediation: 'Add `weights_only=True`: `torch.load(path, weights_only=True)`. ' +
                                'For full model loading you trust internally, at minimum validate the source integrity before loading.',
                            determinism: 'heuristic-advisory',
                            confidence: 0.95,
                            language: 'python',
                        });
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
exports.PY009UnsafePickleDeserialization = PY009UnsafePickleDeserialization;
//# sourceMappingURL=PY009-unsafe-pickle-deserialization.js.map