"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMMAND_BUDGETS = void 0;
exports.maybeRunBoundedCliCommand = maybeRunBoundedCliCommand;
const node_child_process_1 = require("node:child_process");
const node_path_1 = require("node:path");
const session_start_transaction_1 = require("./session-start-transaction");
exports.COMMAND_BUDGETS = {
    run_agent: {
        budgetMs: 60_000,
        recoveryCommand: 'neurcode doctor --runtime --json',
        phases: ['initializing_runtime', 'fingerprinting_profile', 'persisting_deferred_session', 'shaping_session', 'activating_session', 'reconciling_cloud'],
        sessionStart: true,
    },
    session_hook_start: {
        budgetMs: 45_000,
        recoveryCommand: 'neurcode doctor --runtime --json',
        phases: ['initializing_runtime', 'fingerprinting_profile', 'persisting_deferred_session', 'shaping_session', 'activating_session', 'reconciling_cloud'],
        sessionStart: true,
    },
    session_hook_approve: {
        budgetMs: 12_000,
        recoveryCommand: 'neurcode session status --local --json',
        phases: ['loading_session', 'persisting_exact_approval', 'reconciling_cloud'],
        sessionStart: false,
    },
    session_status: {
        budgetMs: 8_000,
        recoveryCommand: 'neurcode doctor --runtime --json',
        phases: ['loading_session', 'checking_profile_fingerprint', 'projecting_runtime_state'],
        sessionStart: false,
    },
    runtime_report: {
        budgetMs: 12_000,
        recoveryCommand: 'neurcode report --runtime --since 24h --format json',
        phases: ['enumerating_session_records', 'building_source_free_report', 'rendering_report'],
        sessionStart: false,
    },
    runtime_doctor: {
        budgetMs: 12_000,
        recoveryCommand: 'neurcode doctor --runtime --json',
        phases: ['checking_installation', 'checking_profile_fingerprint', 'classifying_runtime_state'],
        sessionStart: false,
    },
    cloud_status: {
        budgetMs: 8_000,
        recoveryCommand: 'neurcode runtime cloud-status --json',
        phases: ['loading_local_projection', 'contacting_runtime_backend', 'rendering_cloud_status'],
        sessionStart: false,
    },
};
function commandKey(argv) {
    if (argv[0] === 'run')
        return 'run_agent';
    if (argv[0] === 'session-hook' && argv.includes('start'))
        return 'session_hook_start';
    if (argv[0] === 'session-hook' && argv.includes('approve'))
        return 'session_hook_approve';
    if (argv[0] === 'status')
        return 'session_status';
    if (argv[0] === 'session' && argv[1] === 'status')
        return 'session_status';
    if (argv[0] === 'report' && argv.includes('--runtime'))
        return 'runtime_report';
    if (argv[0] === 'doctor' && argv.includes('--runtime'))
        return 'runtime_doctor';
    if (argv[0] === 'runtime' && argv[1] === 'cloud-status')
        return 'cloud_status';
    return null;
}
function optionValue(argv, option) {
    const index = argv.indexOf(option);
    if (index < 0 || index + 1 >= argv.length)
        return null;
    return argv[index + 1] || null;
}
function budgetFor(key) {
    const envKey = `NEURCODE_COMMAND_BUDGET_MS_${key.toUpperCase()}`;
    const configured = Number(process.env[envKey]);
    if (Number.isSafeInteger(configured) && configured >= 100)
        return configured;
    return exports.COMMAND_BUDGETS[key].budgetMs;
}
function terminateOwnedProcessGroup(pid) {
    try {
        process.kill(-pid, 'SIGTERM');
    }
    catch {
        try {
            process.kill(pid, 'SIGTERM');
        }
        catch { /* already gone */ }
    }
    const timer = setTimeout(() => {
        try {
            process.kill(-pid, 'SIGKILL');
        }
        catch {
            try {
                process.kill(pid, 'SIGKILL');
            }
            catch { /* already gone */ }
        }
    }, 500);
    timer.unref();
}
async function maybeRunBoundedCliCommand(argv) {
    if (process.env.NEURCODE_BOUNDED_COMMAND_CHILD === '1') {
        const testHangMs = process.env.NODE_ENV === 'test'
            ? Number(process.env.NEURCODE_TEST_BOUNDED_COMMAND_HANG_MS)
            : Number.NaN;
        if (Number.isSafeInteger(testHangMs) && testHangMs > 0) {
            await new Promise((resolveDelay) => setTimeout(resolveDelay, testHangMs));
        }
        return false;
    }
    const key = commandKey(argv);
    if (!key)
        return false;
    const definition = exports.COMMAND_BUDGETS[key];
    const budgetMs = budgetFor(key);
    const repoRoot = (0, node_path_1.resolve)(optionValue(argv, '--dir') || process.cwd());
    const startedAt = Date.now();
    const maxOutputBytes = 8 * 1024 * 1024;
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let timedOut = false;
    let outputOverflow = false;
    const child = (0, node_child_process_1.spawn)(process.execPath, [...process.execArgv, process.argv[1], ...argv], {
        cwd: process.cwd(),
        detached: process.platform !== 'win32',
        stdio: ['inherit', 'pipe', 'pipe'],
        env: {
            ...process.env,
            NEURCODE_BOUNDED_COMMAND_CHILD: '1',
            NEURCODE_BOUNDED_COMMAND_KEY: key,
        },
    });
    child.stdout.on('data', (chunk) => {
        if (stdout.length + chunk.length > maxOutputBytes) {
            outputOverflow = true;
            terminateOwnedProcessGroup(child.pid);
            return;
        }
        stdout = Buffer.concat([stdout, chunk]);
    });
    child.stderr.on('data', (chunk) => {
        if (stderr.length + chunk.length > maxOutputBytes) {
            outputOverflow = true;
            terminateOwnedProcessGroup(child.pid);
            return;
        }
        stderr = Buffer.concat([stderr, chunk]);
    });
    const timeout = setTimeout(() => {
        timedOut = true;
        if (child.pid)
            terminateOwnedProcessGroup(child.pid);
    }, budgetMs);
    timeout.unref();
    const exit = await new Promise((done) => {
        child.once('error', () => done({ code: 1, signal: null }));
        child.once('exit', (code, signal) => done({ code, signal }));
    });
    clearTimeout(timeout);
    if (!timedOut && !outputOverflow) {
        if (stdout.length > 0)
            process.stdout.write(stdout);
        if (stderr.length > 0)
            process.stderr.write(stderr);
        process.exitCode = exit.code ?? (exit.signal ? 1 : 0);
        return true;
    }
    const transaction = (0, session_start_transaction_1.inspectSessionStartTransaction)(repoRoot);
    const recovery = definition.sessionStart && child.pid
        ? (0, session_start_transaction_1.recoverTimedOutSessionStart)(repoRoot, child.pid)
        : { recovered: false, phase: transaction?.phase ?? null };
    const payload = {
        ok: false,
        status: 'attention_required',
        reasonCode: outputOverflow ? 'command_output_budget_exceeded' : 'command_budget_exceeded',
        command: key,
        budgetMs,
        elapsedMs: Date.now() - startedAt,
        phases: definition.phases,
        lastPhase: recovery.phase,
        recoveryCommand: definition.recoveryCommand,
        cleanup: {
            ownedWorkerTerminated: true,
            partialSessionRecovered: recovery.recovered,
            unresolvedDecisionsPreserved: true,
        },
        privacy: {
            metadataOnly: true,
            sourceUploaded: false,
            sourceIncluded: false,
        },
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exitCode = 2;
    return true;
}
//# sourceMappingURL=command-budget.js.map