"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedbackCommand = feedbackCommand;
const api_client_1 = require("../api-client");
const config_1 = require("../config");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (value) => value,
        yellow: (value) => value,
        red: (value) => value,
        bold: (value) => value,
        dim: (value) => value,
        cyan: (value) => value,
    };
}
function normalizeFeedbackType(value) {
    if (!value)
        return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'false_positive'
        || normalized === 'false_negative'
        || normalized === 'true_positive'
        || normalized === 'accepted_risk') {
        return normalized;
    }
    return null;
}
function normalizeReviewDecision(value) {
    if (!value)
        return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'approved' || normalized === 'rejected') {
        return normalized;
    }
    return null;
}
function normalizeReviewStatus(value) {
    if (!value)
        return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'pending' || normalized === 'approved' || normalized === 'rejected') {
        return normalized;
    }
    return null;
}
function createClient() {
    const config = (0, config_1.loadConfig)();
    if (!config.apiKey) {
        config.apiKey = (0, config_1.requireApiKey)();
    }
    return new api_client_1.ApiClient(config);
}
function feedbackCommand(program) {
    const feedback = program
        .command('feedback')
        .description('Submit and review verification finding feedback (FP/FN governance loop)');
    feedback
        .command('submit')
        .description('Submit feedback for a verification finding')
        .argument('<verification-id>', 'Verification ID from action verifications')
        .requiredOption('--type <feedback-type>', 'false_positive | false_negative | true_positive | accepted_risk')
        .requiredOption('--reason <text>', 'Reason for feedback (what was wrong/right)')
        .option('--finding-key <key>', 'Optional deterministic finding key')
        .option('--rule <rule>', 'Rule identifier')
        .option('--file <path>', 'File path for this finding')
        .option('--severity <level>', 'Severity label')
        .option('--suggested-adjustment <text>', 'Suggested policy/rule adjustment')
        .option('--json', 'Output machine-readable JSON')
        .action(async (verificationId, options) => {
        try {
            const feedbackType = normalizeFeedbackType(options.type);
            const reason = typeof options.reason === 'string' ? options.reason.trim() : '';
            if (!feedbackType) {
                throw new Error('Invalid --type. Use: false_positive, false_negative, true_positive, accepted_risk');
            }
            if (!reason || reason.length < 8) {
                throw new Error('reason must be at least 8 characters');
            }
            const client = createClient();
            const created = await client.submitVerificationFeedback(verificationId, {
                feedbackType,
                reason,
                findingKey: typeof options.findingKey === 'string' ? options.findingKey : undefined,
                rule: typeof options.rule === 'string' ? options.rule : undefined,
                filePath: typeof options.file === 'string' ? options.file : undefined,
                severity: typeof options.severity === 'string' ? options.severity : undefined,
                suggestedAdjustment: typeof options.suggestedAdjustment === 'string' ? options.suggestedAdjustment : undefined,
            });
            if (options.json === true) {
                console.log(JSON.stringify({ success: true, feedback: created }, null, 2));
                return;
            }
            console.log(chalk.bold.cyan('\n🧾 Feedback Submitted\n'));
            console.log(chalk.green(`ID: ${created.id}`));
            console.log(chalk.dim(`Type: ${created.feedbackType}`));
            console.log(chalk.dim(`Review status: ${created.reviewStatus}`));
            console.log(chalk.dim(`Created at: ${new Date(created.createdAt).toLocaleString()}\n`));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (options.json === true) {
                console.log(JSON.stringify({ success: false, message }, null, 2));
            }
            else {
                console.error(chalk.red(`\n❌ Feedback submit failed: ${message}\n`));
            }
            process.exit(1);
        }
    });
    feedback
        .command('list')
        .description('List submitted feedback for a verification')
        .argument('<verification-id>', 'Verification ID from action verifications')
        .option('--status <status>', 'pending | approved | rejected')
        .option('--limit <n>', 'Maximum feedback rows (default: 100)', (value) => parseInt(value, 10))
        .option('--json', 'Output machine-readable JSON')
        .action(async (verificationId, options) => {
        try {
            const reviewStatus = normalizeReviewStatus(options.status);
            if (options.status && !reviewStatus) {
                throw new Error('Invalid --status. Use: pending, approved, rejected');
            }
            const client = createClient();
            const rows = await client.listVerificationFeedback(verificationId, {
                reviewStatus: reviewStatus || undefined,
                limit: Number.isFinite(options.limit) ? options.limit : undefined,
            });
            if (options.json === true) {
                console.log(JSON.stringify({ success: true, count: rows.length, feedback: rows }, null, 2));
                return;
            }
            console.log(chalk.bold.cyan('\n🧾 Verification Feedback\n'));
            if (rows.length === 0) {
                console.log(chalk.yellow('No feedback entries found for this verification.\n'));
                return;
            }
            for (const row of rows) {
                console.log(chalk.white(`• ${row.id}`));
                console.log(chalk.dim(`  Type: ${row.feedbackType} | Status: ${row.reviewStatus}`));
                if (row.rule)
                    console.log(chalk.dim(`  Rule: ${row.rule}`));
                if (row.filePath)
                    console.log(chalk.dim(`  File: ${row.filePath}`));
                console.log(chalk.dim(`  Reason: ${row.reason}`));
                console.log(chalk.dim(`  Submitted: ${new Date(row.createdAt).toLocaleString()}`));
                if (row.reviewedAt) {
                    console.log(chalk.dim(`  Reviewed: ${new Date(row.reviewedAt).toLocaleString()}`));
                }
                console.log('');
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (options.json === true) {
                console.log(JSON.stringify({ success: false, message }, null, 2));
            }
            else {
                console.error(chalk.red(`\n❌ Feedback list failed: ${message}\n`));
            }
            process.exit(1);
        }
    });
    feedback
        .command('inbox')
        .description('List organization feedback queue for admin triage (pending/approved/rejected)')
        .option('--status <status>', 'pending | approved | rejected')
        .option('--mine', 'Show only feedback submitted by current user')
        .option('--org-wide', 'For owners/admins: include feedback from entire organization')
        .option('--limit <n>', 'Maximum feedback rows (default: 100)', (value) => parseInt(value, 10))
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        try {
            const reviewStatus = normalizeReviewStatus(options.status);
            if (options.status && !reviewStatus) {
                throw new Error('Invalid --status. Use: pending, approved, rejected');
            }
            let mine;
            if (options.orgWide === true) {
                mine = false;
            }
            else if (options.mine === true) {
                mine = true;
            }
            else {
                mine = undefined;
            }
            const client = createClient();
            const rows = await client.listVerificationFeedbackInbox({
                reviewStatus: reviewStatus || undefined,
                limit: Number.isFinite(options.limit) ? options.limit : undefined,
                mine,
            });
            if (options.json === true) {
                console.log(JSON.stringify({ success: true, count: rows.length, feedback: rows }, null, 2));
                return;
            }
            console.log(chalk.bold.cyan('\n🧾 Verification Feedback Inbox\n'));
            if (rows.length === 0) {
                console.log(chalk.yellow('No feedback entries found for this scope.\n'));
                return;
            }
            for (const row of rows) {
                console.log(chalk.white(`• ${row.id}`));
                console.log(chalk.dim(`  Type: ${row.feedbackType} | Status: ${row.reviewStatus}`));
                if (row.rule)
                    console.log(chalk.dim(`  Rule: ${row.rule}`));
                if (row.filePath)
                    console.log(chalk.dim(`  File: ${row.filePath}`));
                console.log(chalk.dim(`  Verification: ${row.verificationId} | Verdict: ${row.verification.verdict || 'n/a'}`));
                if (row.verification.repoUrl || row.verification.branch) {
                    console.log(chalk.dim(`  Repo: ${row.verification.repoUrl || 'n/a'} | Branch: ${row.verification.branch || 'n/a'}`));
                }
                console.log(chalk.dim(`  Reason: ${row.reason}`));
                console.log(chalk.dim(`  Submitted: ${new Date(row.createdAt).toLocaleString()}`));
                if (row.reviewedAt) {
                    console.log(chalk.dim(`  Reviewed: ${new Date(row.reviewedAt).toLocaleString()}`));
                }
                if (row.reviewStatus === 'pending') {
                    console.log(chalk.dim(`  Review cmd: neurcode feedback review ${row.verificationId} ${row.id} --decision approved --note "<reason>"`));
                }
                console.log('');
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (options.json === true) {
                console.log(JSON.stringify({ success: false, message }, null, 2));
            }
            else {
                console.error(chalk.red(`\n❌ Feedback inbox failed: ${message}\n`));
            }
            process.exit(1);
        }
    });
    feedback
        .command('stats')
        .description('Aggregate false-positive/false-negative feedback quality stats for org policy tuning')
        .option('--status <status>', 'pending | approved | rejected')
        .option('--days <n>', 'Lookback window in days (default: 30)', (value) => parseInt(value, 10))
        .option('--limit <n>', 'Top rule/file rows to return (default: 10)', (value) => parseInt(value, 10))
        .option('--mine', 'Only include feedback submitted by current user')
        .option('--org-wide', 'For owners/admins: include feedback from entire organization')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        try {
            const reviewStatus = normalizeReviewStatus(options.status);
            if (options.status && !reviewStatus) {
                throw new Error('Invalid --status. Use: pending, approved, rejected');
            }
            let mine;
            if (options.orgWide === true) {
                mine = false;
            }
            else if (options.mine === true) {
                mine = true;
            }
            else {
                mine = undefined;
            }
            const client = createClient();
            const stats = await client.getVerificationFeedbackStats({
                reviewStatus: reviewStatus || undefined,
                mine,
                days: Number.isFinite(options.days) ? options.days : undefined,
                limit: Number.isFinite(options.limit) ? options.limit : undefined,
            });
            if (options.json === true) {
                console.log(JSON.stringify({ success: true, stats }, null, 2));
                return;
            }
            console.log(chalk.bold.cyan('\n📈 Verification Feedback Stats\n'));
            console.log(chalk.dim(`Window: last ${stats.windowDays} day(s)`));
            console.log(chalk.dim(`Scope: ${stats.filters.mine ? 'mine' : 'organization'}`));
            if (stats.filters.reviewStatus) {
                console.log(chalk.dim(`Status filter: ${stats.filters.reviewStatus}`));
            }
            console.log('');
            console.log(chalk.white(`Total feedback: ${stats.totals.total}`));
            console.log(chalk.dim(`Pending: ${stats.totals.pending} | Approved: ${stats.totals.approved} | Rejected: ${stats.totals.rejected}`));
            console.log(chalk.dim(`False+ : ${stats.totals.falsePositive} (${(stats.totals.falsePositiveRate * 100).toFixed(1)}%)`));
            console.log(chalk.dim(`False- : ${stats.totals.falseNegative} (${(stats.totals.falseNegativeRate * 100).toFixed(1)}%)`));
            console.log(chalk.dim(`Approval rate: ${(stats.totals.approvalRate * 100).toFixed(1)}%`));
            if (stats.topRules.length > 0) {
                console.log(chalk.bold('\nTop noisy rules:'));
                stats.topRules.forEach((row) => {
                    console.log(chalk.dim(`  • ${row.label} | total=${row.total} fp=${row.falsePositive} fn=${row.falseNegative} pending=${row.pending}`));
                });
            }
            if (stats.topFiles.length > 0) {
                console.log(chalk.bold('\nTop noisy files:'));
                stats.topFiles.forEach((row) => {
                    console.log(chalk.dim(`  • ${row.label} | total=${row.total} fp=${row.falsePositive} fn=${row.falseNegative} pending=${row.pending}`));
                });
            }
            console.log('');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (options.json === true) {
                console.log(JSON.stringify({ success: false, message }, null, 2));
            }
            else {
                console.error(chalk.red(`\n❌ Feedback stats failed: ${message}\n`));
            }
            process.exit(1);
        }
    });
    feedback
        .command('review')
        .description('Admin/owner review decision on submitted feedback')
        .argument('<verification-id>', 'Verification ID from action verifications')
        .argument('<feedback-id>', 'Feedback entry ID')
        .requiredOption('--decision <decision>', 'approved | rejected')
        .option('--note <text>', 'Optional review note')
        .option('--json', 'Output machine-readable JSON')
        .action(async (verificationId, feedbackId, options) => {
        try {
            const decision = normalizeReviewDecision(options.decision);
            if (!decision) {
                throw new Error('Invalid --decision. Use: approved or rejected');
            }
            const client = createClient();
            const reviewed = await client.reviewVerificationFeedback(verificationId, feedbackId, {
                decision,
                reviewNote: typeof options.note === 'string' ? options.note : undefined,
            });
            if (options.json === true) {
                console.log(JSON.stringify({ success: true, feedback: reviewed }, null, 2));
                return;
            }
            console.log(chalk.bold.cyan('\n✅ Feedback Reviewed\n'));
            console.log(chalk.green(`ID: ${reviewed.id}`));
            console.log(chalk.dim(`Decision: ${reviewed.reviewStatus}`));
            console.log(chalk.dim(`Reviewer: ${reviewed.reviewerUserId || 'n/a'}`));
            console.log(chalk.dim(`Reviewed at: ${reviewed.reviewedAt ? new Date(reviewed.reviewedAt).toLocaleString() : 'n/a'}\n`));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (options.json === true) {
                console.log(JSON.stringify({ success: false, message }, null, 2));
            }
            else {
                console.error(chalk.red(`\n❌ Feedback review failed: ${message}\n`));
            }
            process.exit(1);
        }
    });
}
//# sourceMappingURL=feedback.js.map