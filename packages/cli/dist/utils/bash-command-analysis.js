"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeBashCommand = analyzeBashCommand;
const crypto_1 = require("crypto");
const PATH_ROOTS = new Set([
    'app',
    'apps',
    'bin',
    'cmd',
    'config',
    'docs',
    'fixtures',
    'lib',
    'migrations',
    'packages',
    'scripts',
    'services',
    'src',
    'test',
    'tests',
    'web',
    '.github',
]);
const READ_ONLY_PREFIX = /^\s*(?:ls|cat|grep|rg|find|pwd|git\s+(?:status|diff|log|show|branch|rev-parse|ls-files)|sed(?!\s+-i\b)|awk|head|tail|wc|sort|uniq|jq)\b/;
const NEURCODE_DIAGNOSTIC_RE = /^\s*(?:node\s+)?(?:packages\/cli\/dist\/index\.js|neurcode)\s+(?:(?:--version|-v)|doctor\b|status\b|session\s+(?:status|obligations)\b|runtime-sync\s+status\b|admission\b)/;
function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
}
function stripQuotes(value) {
    return value
        .replace(/^[`"'(<\[]+/, '')
        .replace(/[`"')>\].,;:]+$/, '')
        .trim();
}
function normalizeCandidate(raw) {
    const value = stripQuotes(raw).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
    if (!value || value.includes('://') || /\s/.test(value))
        return null;
    const parts = value.split('/').filter(Boolean);
    if (parts.length < 2)
        return null;
    if (!PATH_ROOTS.has(parts[0]))
        return null;
    return value;
}
function pathCandidates(text) {
    const out = [];
    const tokenRe = /(?:"([^"]+)"|'([^']+)'|`([^`]+)`|([A-Za-z0-9_.@~/-]+\/[A-Za-z0-9_.@~/-]+))/g;
    let match;
    while ((match = tokenRe.exec(text)) !== null) {
        const candidate = normalizeCandidate(match[1] || match[2] || match[3] || match[4] || '');
        if (candidate)
            out.push(candidate);
    }
    return unique(out);
}
function stripQuotedContent(command) {
    let out = '';
    let quote = null;
    for (let i = 0; i < command.length; i += 1) {
        const ch = command[i];
        if (quote) {
            if (ch === '\\' && quote !== "'" && i + 1 < command.length) {
                out += ' ';
                i += 1;
                out += ' ';
                continue;
            }
            if (ch === quote) {
                quote = null;
                out += ch;
            }
            else {
                out += ' ';
            }
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            quote = ch;
            out += ch;
            continue;
        }
        out += ch;
    }
    return out;
}
function splitCommandSegments(command) {
    const segments = [];
    let current = '';
    let quote = null;
    for (let i = 0; i < command.length; i += 1) {
        const ch = command[i];
        if (quote) {
            current += ch;
            if (ch === '\\' && quote !== "'" && i + 1 < command.length) {
                i += 1;
                current += command[i];
                continue;
            }
            if (ch === quote)
                quote = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            quote = ch;
            current += ch;
            continue;
        }
        if (ch === ';' || ch === '\n' || ch === '|') {
            if (current.trim())
                segments.push(current.trim());
            current = '';
            if ((ch === '|' && command[i + 1] === '|'))
                i += 1;
            continue;
        }
        if (ch === '&') {
            if (current.trim())
                segments.push(current.trim());
            current = '';
            while (command[i + 1] === '&')
                i += 1;
            continue;
        }
        current += ch;
    }
    if (current.trim())
        segments.push(current.trim());
    return segments;
}
function shellWords(segment) {
    const words = [];
    const tokenRe = /"([^"]*)"|'([^']*)'|`([^`]*)`|([^\s]+)/g;
    let match;
    while ((match = tokenRe.exec(segment)) !== null) {
        words.push(match[1] || match[2] || match[3] || match[4] || '');
    }
    return words;
}
function commandFingerprint(command) {
    return (0, crypto_1.createHash)('sha256').update(command).digest('hex').slice(0, 16);
}
function commandPreview(command) {
    return command
        .replace(/(['"]?)(?:[A-Za-z_][A-Za-z0-9_]*=)?(?:sk|pk|nk)_(?:live|test)_[A-Za-z0-9_-]+/g, '$1[redacted-key]')
        .replace(/(password|secret|token|api[_-]?key)=\S+/gi, '$1=[redacted]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
}
function operationFor(command) {
    const trimmed = command.trim();
    if (/\b(open|writeFile|writeFileSync|appendFile|appendFileSync|unlink|rmSync|renameSync)\s*\(/.test(trimmed)) {
        return 'runtime_write';
    }
    const syntax = stripQuotedContent(trimmed);
    if (/(?:^|[\s;&|])rm\s+/.test(syntax))
        return 'rm';
    if (/(?:^|[\s;&|])mv\s+/.test(syntax))
        return 'mv';
    if (/(?:^|[\s;&|])cp\s+/.test(syntax))
        return 'cp';
    if (/(?:^|[\s;&|])touch\s+/.test(syntax))
        return 'touch';
    if (/(?:^|[\s;&|])mkdir\s+/.test(syntax))
        return 'mkdir';
    if (/(?:^|[\s;&|])tee\s+/.test(syntax))
        return 'tee';
    if (/(?:^|[\s;&|])sed\s+[^;&|]*\s-i\b|\bsed\s+-i\b/.test(syntax))
        return 'sed_in_place';
    if (/(?:^|[\s;&|])git\s+restore(?:\s+|$)/.test(syntax))
        return 'git_restore';
    if (/(?:^|[\s;&|])git\s+checkout\s+[^;&|]*--\s+/.test(syntax))
        return 'git_checkout_path';
    if (/>|>>|2>|&>/.test(syntax))
        return 'redirect';
    return 'unknown_mutation';
}
function isReadOnlyDiagnosticCommand(command) {
    const syntax = stripQuotedContent(command).trim();
    if (!syntax)
        return true;
    if (READ_ONLY_PREFIX.test(syntax))
        return true;
    if (NEURCODE_DIAGNOSTIC_RE.test(syntax))
        return true;
    if (/^\s*node\s+-e\s+/.test(syntax) && /console\.log|require\.resolve|process\.versions|process\.cwd/.test(command)) {
        return true;
    }
    return false;
}
function isOperatorDiagnosticCapture(command, operation, targets) {
    if (targets.length > 0)
        return false;
    if (operation !== 'redirect' && operation !== 'tee')
        return false;
    return splitCommandSegments(command).some(isReadOnlyDiagnosticCommand);
}
function redirectionTargets(command) {
    const out = [];
    const re = /(?:^|[^0-9])(?:>|>>|2>|&>)\s*("?[^"\s;&|]+"?|'[^'\s;&|]+')/g;
    let match;
    while ((match = re.exec(command)) !== null) {
        const candidate = normalizeCandidate(match[1]);
        if (candidate)
            out.push(candidate);
    }
    return out;
}
function runtimeWriteTargets(command) {
    const out = [];
    const writeApi = /\b(?:open|writeFile|writeFileSync|appendFile|appendFileSync|unlink|rmSync|renameSync)\s*\(\s*("([^"]+)"|'([^']+)'|`([^`]+)`)/g;
    let match;
    while ((match = writeApi.exec(command)) !== null) {
        const candidate = normalizeCandidate(match[2] || match[3] || match[4] || '');
        if (candidate)
            out.push(candidate);
    }
    return unique(out);
}
function segmentForOperation(command, operation) {
    for (const segment of splitCommandSegments(command)) {
        if (operationFor(segment) === operation)
            return segment;
    }
    return command;
}
function commandArgumentTargets(command, operation) {
    const segment = segmentForOperation(command, operation);
    const words = shellWords(segment);
    const commandIndex = words.findIndex((word) => word === operation || (operation === 'sed_in_place' && word === 'sed') || ((operation === 'git_restore' || operation === 'git_checkout_path') && word === 'git'));
    if (commandIndex < 0)
        return pathCandidates(segment);
    if (operation === 'git_restore' || operation === 'git_checkout_path') {
        const marker = words.lastIndexOf('--');
        const args = marker >= 0 ? words.slice(marker + 1) : words.slice(commandIndex + 2);
        return unique(args.map((arg) => normalizeCandidate(arg)).filter((value) => Boolean(value)));
    }
    const args = words
        .slice(commandIndex + 1)
        .filter((arg) => arg !== '--' && !arg.startsWith('-'));
    return unique(args.map((arg) => normalizeCandidate(arg)).filter((value) => Boolean(value)));
}
function targetPathsForOperation(command, operation) {
    if (operation === 'redirect')
        return redirectionTargets(command);
    if (operation === 'runtime_write')
        return runtimeWriteTargets(command);
    if (operation === 'rm' ||
        operation === 'mv' ||
        operation === 'cp' ||
        operation === 'touch' ||
        operation === 'mkdir' ||
        operation === 'tee' ||
        operation === 'sed_in_place' ||
        operation === 'git_restore' ||
        operation === 'git_checkout_path') {
        return commandArgumentTargets(command, operation);
    }
    return [];
}
function analyzeBashCommand(command) {
    const trimmed = command.trim();
    const fingerprint = commandFingerprint(command);
    const preview = commandPreview(command);
    if (!trimmed) {
        return {
            mutates: false,
            suspicious: false,
            readOnly: true,
            operatorDiagnostic: true,
            operation: 'read_only',
            targetPaths: [],
            commandFingerprint: fingerprint,
            commandPreview: preview,
        };
    }
    const operation = operationFor(trimmed);
    const mutates = operation !== 'unknown_mutation';
    const targets = mutates ? targetPathsForOperation(trimmed, operation) : [];
    const readOnly = !mutates && isReadOnlyDiagnosticCommand(trimmed);
    const operatorDiagnostic = (!mutates && (readOnly || targets.length === 0)) ||
        isOperatorDiagnosticCapture(trimmed, operation, targets);
    return {
        mutates,
        suspicious: mutates && targets.length === 0 && !operatorDiagnostic,
        readOnly: readOnly || (!mutates && targets.length === 0),
        operatorDiagnostic,
        operation: mutates ? operation : 'read_only',
        targetPaths: targets,
        commandFingerprint: fingerprint,
        commandPreview: preview,
    };
}
//# sourceMappingURL=bash-command-analysis.js.map